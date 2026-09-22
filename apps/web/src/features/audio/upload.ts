/**
 * 上传客户端：`POST /api/bottles/:id/segments`（multipart，带进度与失败重试）。
 *
 * 为什么用 XHR 而不是 `fetch`：上传进度只能从 `XMLHttpRequest.upload.onprogress` 拿到，
 * `fetch` 至今没有可靠的上传进度（`ReadableStream` 上传在各浏览器不一致）。
 * 传输层做成**端口**（`UploadTransport`），所以这一层可以被单测完全覆盖，也不需要 jsdom 支持 XHR。
 *
 * 三条纪律：
 * 1. **不发 `index`**：段号由服务端 `nextRecordIndex` 决定（ADR-015 §16.8）；
 * 2. **客户端先拦一遍**：时长/格式复用 `@music-drift/shared/audio` 的同一套规则（不合格就不发请求）；
 * 3. **只重试值得重试的失败**：网络错误 / 408 / 429 / 5xx；422（规则）与 409（并发）立即返回，
 *    让 UI 去解释"这一段已经被接走了"。
 */
import {
  checkAudioFormat,
  checkRecordingDuration,
  normalizeMimeType,
  type AudioViolation,
} from '@music-drift/shared/audio';
import { ErrorResponseSchema, RecordSegmentResponseSchema } from '@music-drift/shared/contracts';
import type { RecordSegmentResponse } from '@music-drift/shared/contracts';

export interface UploadTransportRequest {
  url: string;
  form: FormData;
  /** 上传进度回调（`loaded` 字节 / `total` 可能为 null）。 */
  onProgress: (loaded: number, total: number | null) => void;
  signal?: AbortSignal | undefined;
}

export interface UploadTransportResponse {
  status: number;
  /** 已解析的响应体（非 JSON 时为 null）。 */
  body: unknown;
}

/** 传输层端口。生产实现见 `xhrTransport`；测试注入假实现。 */
export type UploadTransport = (request: UploadTransportRequest) => Promise<UploadTransportResponse>;

export interface SegmentUploadInput {
  bottleId: string;
  /** 录好的音频。 */
  audio: Blob;
  /** 客户端测得的时长（ms）。 */
  durationMs: number;
  /** 附言（CONTEXT §12.2），可为空。 */
  note?: string | null;
  /** 覆盖接口路径（默认走契约路径，vite 代理到 api）。 */
  url?: string;
}

export type UploadPhase = 'validating' | 'uploading' | 'retrying' | 'done' | 'failed';

export interface UploadProgress {
  phase: UploadPhase;
  /** 第几次尝试（从 1 开始）。 */
  attempt: number;
  loadedBytes: number;
  totalBytes: number | null;
  /** 本次尝试的进度 0..1；总量未知时为 null。 */
  ratio: number | null;
}

export type UploadFailureCode =
  | AudioViolation['code']
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'UPLOAD_ABORTED'
  | 'CONTRACT_VIOLATION';

export interface UploadSuccess {
  ok: true;
  /** 服务端解析出的段信息（**段号以它为准**）。 */
  segment: RecordSegmentResponse;
  status: number;
}

export interface UploadFailure {
  ok: false;
  code: UploadFailureCode;
  message: string;
  /** 是否值得让用户点"重试上传"。 */
  retryable: boolean;
  violations: AudioViolation[];
}

export type UploadResult = UploadSuccess | UploadFailure;

export interface UploadClientOptions {
  transport?: UploadTransport;
  /** 总尝试次数（默认 3）。 */
  maxAttempts?: number;
  /** 退避等待（测试注入 no-op）。 */
  sleep?: (ms: number) => Promise<void>;
  /** 抖动（避免同时重试撞在一起），默认返回 0..1 随机数。 */
  jitter?: () => number;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal | undefined;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 400;
const MAX_RETRY_DELAY_MS = 4_000;

/** 指数退避：400 / 800 / 1600 … 封顶 4 秒。 */
export function retryDelayMs(attempt: number): number {
  const factor = Math.max(1, Math.trunc(attempt));
  return Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** (factor - 1));
}

/** 0 代表传输层网络错误（约定值）。 */
export function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

export function fileNameForMime(mime: string | null | undefined): string {
  switch (normalizeMimeType(mime)) {
    case 'audio/mp4':
      return 'segment.m4a';
    case 'audio/ogg':
      return 'segment.ogg';
    case 'audio/wav':
      return 'segment.wav';
    default:
      return 'segment.webm';
  }
}

/** 组装 multipart 表单：**没有 `index` 字段**（段号由服务端决定）。 */
export function buildSegmentUploadForm(input: {
  audio: Blob;
  durationMs: number;
  note?: string | null;
}): FormData {
  const form = new FormData();
  form.append('audio', input.audio, fileNameForMime(input.audio.type));
  form.append('durationMs', String(Math.round(input.durationMs)));
  const note = input.note?.trim() ?? '';
  if (note !== '') form.append('note', note);
  return form;
}

/**
 * 读取取消状态。
 * 抽成函数是因为 `AbortSignal` 会被**外部**改变（`controller.abort()`），
 * TS 对 `options.signal?.aborted` 这类属性链做控制流收窄在这里不成立（会误判"不可能为 true"）。
 */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function sleepDefault(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseViolations(body: unknown): AudioViolation[] {
  const parsed = ErrorResponseSchema.safeParse(body);
  if (!parsed.success) return [];
  return parsed.data.error.violations.map((violation) => ({
    code: violation.code as AudioViolation['code'],
    message: violation.message,
  }));
}

function failureFromHttp(status: number, body: unknown): UploadFailure {
  const violations = parseViolations(body);
  const first = violations[0];
  const messageFromBody =
    typeof body === 'object' && body !== null && 'error' in body
      ? ((body as { error?: { message?: unknown } }).error?.message ?? '')
      : '';
  const message =
    first?.message ??
    (typeof messageFromBody === 'string' && messageFromBody !== ''
      ? messageFromBody
      : status >= 500
        ? '服务器暂时不可用，录音已保留在本机，可以重试上传。'
        : '上传失败，录音已保留在本机，可以重试上传。');
  return {
    ok: false,
    code: first?.code ?? (isRetryableStatus(status) ? 'SERVER_ERROR' : 'CONTRACT_VIOLATION'),
    message,
    retryable: isRetryableStatus(status),
    violations,
  };
}

export async function uploadSegmentAudio(
  input: SegmentUploadInput,
  options: UploadClientOptions = {},
): Promise<UploadResult> {
  const transport = options.transport ?? xhrTransport;
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const sleep = options.sleep ?? sleepDefault;
  const jitter = options.jitter ?? Math.random;
  const emit = (progress: UploadProgress): void => options.onProgress?.(progress);

  // ① 客户端先拦一遍（与共享规则同源）
  const violations: AudioViolation[] = [
    ...checkRecordingDuration(input.durationMs),
    ...checkAudioFormat({ mime: input.audio.type, byteSize: input.audio.size }),
  ];
  if (violations.length > 0) {
    emit({
      phase: 'failed',
      attempt: 0,
      loadedBytes: 0,
      totalBytes: input.audio.size,
      ratio: null,
    });
    const first = violations[0]!;
    return { ok: false, code: first.code, message: first.message, retryable: false, violations };
  }

  const url = input.url ?? `/api/bottles/${input.bottleId}/segments`;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (isAborted(options.signal)) {
      return aborted();
    }
    const form = buildSegmentUploadForm({
      audio: input.audio,
      durationMs: input.durationMs,
      note: input.note ?? null,
    });
    emit({
      phase: attempt === 1 ? 'uploading' : 'retrying',
      attempt,
      loadedBytes: 0,
      totalBytes: input.audio.size,
      ratio: 0,
    });

    let response: UploadTransportResponse;
    try {
      response = await transport({
        url,
        form,
        signal: options.signal,
        onProgress: (loaded, total) => {
          emit({
            phase: attempt === 1 ? 'uploading' : 'retrying',
            attempt,
            loadedBytes: loaded,
            totalBytes: total,
            ratio: total === null || total <= 0 ? null : Math.min(1, loaded / total),
          });
        },
      });
    } catch (error) {
      if (isAborted(options.signal) || (error as { name?: string })?.name === 'AbortError') {
        return aborted();
      }
      if (attempt >= maxAttempts) {
        emit({
          phase: 'failed',
          attempt,
          loadedBytes: 0,
          totalBytes: input.audio.size,
          ratio: null,
        });
        return {
          ok: false,
          code: 'NETWORK_ERROR',
          message: '网络中断，录音已保留在本机，可以重试上传。',
          retryable: true,
          violations: [],
        };
      }
      await sleep(retryDelayMs(attempt) + jitter() * 120);
      continue;
    }

    if (response.status >= 200 && response.status < 300) {
      const parsed = RecordSegmentResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        emit({ phase: 'failed', attempt, loadedBytes: 0, totalBytes: null, ratio: null });
        return {
          ok: false,
          code: 'CONTRACT_VIOLATION',
          message: '服务端返回的数据不符合契约，请联系管理员。',
          retryable: false,
          violations: [],
        };
      }
      emit({
        phase: 'done',
        attempt,
        loadedBytes: input.audio.size,
        totalBytes: input.audio.size,
        ratio: 1,
      });
      return { ok: true, segment: parsed.data, status: response.status };
    }

    const failure = failureFromHttp(response.status, response.body);
    if (!failure.retryable || attempt >= maxAttempts) {
      emit({ phase: 'failed', attempt, loadedBytes: 0, totalBytes: null, ratio: null });
      return failure;
    }
    await sleep(retryDelayMs(attempt) + jitter() * 120);
  }

  // 循环内所有分支都会 return；保留兜底语句让类型收窄完整
  return {
    ok: false,
    code: 'SERVER_ERROR',
    message: '上传失败，录音已保留在本机，可以重试上传。',
    retryable: true,
    violations: [],
  };
}

function aborted(): UploadFailure {
  return {
    ok: false,
    code: 'UPLOAD_ABORTED',
    message: '上传已取消，录音仍保留在本机。',
    retryable: false,
    violations: [],
  };
}

/** 生产传输层：`XMLHttpRequest`（唯一能拿到上传进度的浏览器 API）。 */
export const xhrTransport: UploadTransport = ({ url, form, onProgress, signal }) =>
  new Promise<UploadTransportResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.withCredentials = true; // httpOnly 会话 cookie（ADR-008）
    xhr.responseType = 'text';

    xhr.upload.addEventListener('progress', (event) => {
      onProgress(event.loaded, event.lengthComputable ? event.total : null);
    });
    xhr.addEventListener('load', () => {
      resolve({ status: xhr.status, body: safeJson(xhr.responseText) });
    });
    xhr.addEventListener('error', () => {
      reject(new Error('network error'));
    });
    xhr.addEventListener('timeout', () => {
      reject(new Error('timeout'));
    });
    xhr.addEventListener('abort', () => {
      reject(new DOMException('aborted', 'AbortError'));
    });
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });

    xhr.send(form);
  });

function safeJson(text: string): unknown {
  if (typeof text !== 'string' || text.trim() === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
