/**
 * 录制链路的纯逻辑（无 IO / 无 DOM）：时长与格式校验、容器协商、能力判定、降级引导文案。
 *
 * 前后端共用同一份规则与同一份文案：客户端提前拦（给出即时反馈），服务端再拦一次（不信任客户端）。
 * 浏览器 Web API 只通过**端口**（`navigator.mediaDevices` / `MediaRecorder.isTypeSupported` 等）
 * 以参数形式进入本模块，因此这里可以直接单测，不需要 jsdom 提供这些 API。
 */
import { DEFAULT_POLICY } from '../domain/constants';
import type { RuleCode } from '../domain/errors';
import { RULE_MESSAGES } from '../domain/errors';
import {
  ACCEPTED_AUDIO_MIME_TYPES,
  DEFAULT_RECORDING_LIMITS,
  RECORDER_MIME_PREFERENCES,
} from './constants';
import { audioViolation, type AudioViolation } from './errors';

/** 归一化 MIME：小写、去掉 `;codecs=...` 之类的参数、空串按缺失处理。 */
export function normalizeMimeType(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const base = raw.split(';')[0]?.trim().toLowerCase() ?? '';
  return base === '' ? null : base;
}

/**
 * 时长校验（CONTEXT §3.1）。
 * 不可信输入（NaN / Infinity / 0 / 负数）按"超限"处理：**不给"无法判断"留后门**。
 */
export function checkRecordingDuration(
  durationMs: number,
  limits: Partial<Pick<{ minMs: number; maxMs: number }, 'minMs' | 'maxMs'>> = {},
): AudioViolation[] {
  const minMs = limits.minMs ?? DEFAULT_RECORDING_LIMITS.minMs;
  const maxMs = limits.maxMs ?? DEFAULT_RECORDING_LIMITS.maxMs;
  if (!Number.isFinite(durationMs) || durationMs < minMs || durationMs > maxMs) {
    return [
      audioViolation(
        'AUDIO_DURATION_OUT_OF_RANGE',
        `每段录音需在 ${minMs / 1000}–${maxMs / 1000} 秒之间（当前 ${describeDuration(durationMs)}），请重新录制。`,
      ),
    ];
  }
  return [];
}

/**
 * 格式与体积校验；**一次报全**（不玩"修一个再报下一个"）。
 * 返回顺序固定：缺失 → 格式 → 体积，便于测试与前端逐条展示。
 */
export function checkAudioFormat(
  input: { mime: string | null | undefined; byteSize: number },
  limits: Partial<Pick<{ maxBytes: number }, 'maxBytes'>> = {},
): AudioViolation[] {
  const maxBytes = limits.maxBytes ?? DEFAULT_RECORDING_LIMITS.maxBytes;
  const violations: AudioViolation[] = [];
  const size = Number.isFinite(input.byteSize) ? input.byteSize : 0;

  if (size <= 0) violations.push(audioViolation('AUDIO_MISSING'));

  const base = normalizeMimeType(input.mime);
  if (base === null || !(ACCEPTED_AUDIO_MIME_TYPES as readonly string[]).includes(base)) {
    violations.push(
      audioViolation(
        'AUDIO_FORMAT_UNSUPPORTED',
        `这个音频格式不被支持（收到 ${base ?? '未声明'}；支持 ${ACCEPTED_AUDIO_MIME_TYPES.join(' / ')}），请用浏览器直接录制。`,
      ),
    );
  }

  if (size > maxBytes) {
    violations.push(
      audioViolation(
        'AUDIO_TOO_LARGE',
        `录音文件超过体积上限（${formatBytes(size)} > ${formatBytes(maxBytes)}），请重新录制。`,
      ),
    );
  }

  return violations;
}

/**
 * 容器协商：按 `RECORDER_MIME_PREFERENCES` 顺序取第一个被浏览器支持的容器。
 * 返回 `null` = 该浏览器不支持任何可用容器 → 调用方必须显示"此浏览器不支持录音"，不得静默失败。
 * `isTypeSupported` 抛异常按"不支持"处理（探测本身不能把页面炸掉）。
 */
export function pickRecorderMime(isTypeSupported: (mime: string) => boolean): string | null {
  for (const candidate of RECORDER_MIME_PREFERENCES) {
    try {
      if (isTypeSupported(candidate)) return candidate;
    } catch {
      // 探测失败按不支持处理，继续试下一个候选
    }
  }
  return null;
}

export interface RecordingCapabilities {
  /** `window.isSecureContext`。 */
  isSecureContext: boolean;
  /** `window.location.hostname`。 */
  hostname: string;
  /** `navigator.mediaDevices?.getUserMedia` 是否存在。 */
  hasGetUserMedia: boolean;
  /** `window.MediaRecorder` 是否存在。 */
  hasMediaRecorder: boolean;
}

export type RecordingSupportReason =
  'OK' | 'INSECURE_CONTEXT' | 'NO_GET_USER_MEDIA' | 'NO_MEDIA_RECORDER';

export interface RecordingSupport {
  ok: boolean;
  reason: RecordingSupportReason;
  /** 不可用时的中文引导（含可照做的修复动作）；可用时为 null。 */
  guidance: string | null;
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function isLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return LOCAL_HOSTNAMES.has(host) || host.endsWith('.localhost');
}

/**
 * 录音可用性判定。**顺序很重要**：环境问题（http 非 localhost）优先于能力问题 ——
 * 在 http 页面上 `navigator.mediaDevices` 会因为"不安全上下文"被浏览器藏起来，
 * 若先报"浏览器不支持"，用户会去换浏览器而问题其实在访问地址上（AGENTS.md §9）。
 */
export function checkRecordingSupport(capabilities: RecordingCapabilities): RecordingSupport {
  const secure = capabilities.isSecureContext || isLocalHostname(capabilities.hostname);
  if (!secure) {
    return {
      ok: false,
      reason: 'INSECURE_CONTEXT',
      guidance:
        '录音只在 https:// 或 localhost 下可用，浏览器不会在 http 页面里开放麦克风。' +
        '请改用 https:// 地址，或在本机用 http://localhost:5173 打开（局域网 IP、http 域名都不行）。',
    };
  }
  if (!capabilities.hasGetUserMedia) {
    return {
      ok: false,
      reason: 'NO_GET_USER_MEDIA',
      guidance:
        '这个浏览器没有提供麦克风接口（navigator.mediaDevices.getUserMedia）。' +
        '请改用较新版本的 Chrome、Edge 或 Safari 再试。',
    };
  }
  if (!capabilities.hasMediaRecorder) {
    return {
      ok: false,
      reason: 'NO_MEDIA_RECORDER',
      guidance:
        '这个浏览器不支持 MediaRecorder，无法录制音频。' +
        '请改用较新版本的 Chrome、Edge 或 Safari 再试。',
    };
  }
  return { ok: true, reason: 'OK', guidance: null };
}

export type MicrophoneErrorKind = 'DENIED' | 'NO_DEVICE' | 'DEVICE_BUSY' | 'UNKNOWN';

export interface MicrophoneErrorDescription {
  kind: MicrophoneErrorKind;
  /** 一句话说明发生了什么（danger 态标题）。 */
  title: string;
  /** 分平台修复指引 + 用户还能做什么（DESIGN.md Error States #5）。 */
  guidance: string;
}

/** `getUserMedia` 失败的 DOMException.name → 可照做的引导（不用系统 alert，不静默失败）。 */
export function describeMicrophoneError(
  error: { name?: string | undefined } | null | undefined,
): MicrophoneErrorDescription {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return {
        kind: 'DENIED',
        title: '麦克风权限被拒绝，录不了音。',
        guidance:
          '请在浏览器里放开麦克风权限后重试：Chrome / Edge 点地址栏左侧的锁形图标 → 网站设置 → 麦克风改为“允许”；' +
          'Safari 打开「设置 → 网站 → 麦克风」或菜单「Safari → 网站设置 → 麦克风」改为“允许”。' +
          '改完刷新本页即可继续，已经录好的内容不会丢。',
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return {
        kind: 'NO_DEVICE',
        title: '没有检测到可用的麦克风。',
        guidance:
          '请接上或启用麦克风（外置麦克风请检查连线与系统输入设备设置），然后刷新本页重试。' +
          '也可以先在系统「声音设置」里确认默认输入设备。',
      };
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        kind: 'DEVICE_BUSY',
        title: '麦克风被其他程序占用了。',
        guidance: '请先关闭正在使用麦克风的程序（会议软件、语音通话、录音工具），再回到本页重试。',
      };
    default:
      return {
        kind: 'UNKNOWN',
        title: '麦克风启动失败。',
        guidance:
          '请检查麦克风与系统权限设置后重试；若反复失败，可换用较新版本的 Chrome 或 Safari。',
      };
  }
}

export interface DislikeAvailability {
  allowed: boolean;
  /** 不允许时的稳定错误码（与内核一致，可直接发给服务端做二次校验）。 */
  code: RuleCode | null;
  /** 不允许时的中文文案（含"还差多少"，便于用户照做）。 */
  message: string | null;
  /** 还差多少覆盖率才能解锁（0 = 已解锁或与本条件无关）。 */
  remainingRatio: number;
}

/**
 * 点踩按钮可用性（CONTEXT §7.3）。
 *
 * - 门槛值默认取内核 `DEFAULT_POLICY.dislikeListenRatioThreshold`（0.8）；
 * - 时长不可信（0 / NaN）时覆盖率按 **0** 处理（与 `ListenTracker` 同一 fail-closed 口径）；
 * - "自己的段不能踩"用内核文案，避免 UI 与 API 两套说法。
 */
export function describeDislikeAvailability(input: {
  ratio: number;
  durationMs: number;
  threshold?: number;
  isOwnSegment?: boolean;
}): DislikeAvailability {
  const threshold = input.threshold ?? DEFAULT_POLICY.dislikeListenRatioThreshold;
  const trustworthy =
    Number.isFinite(input.durationMs) && input.durationMs > 0 && Number.isFinite(input.ratio);
  const ratio = trustworthy ? Math.min(1, Math.max(0, input.ratio)) : 0;

  if (input.isOwnSegment === true) {
    return {
      allowed: false,
      code: 'CANNOT_DISLIKE_OWN_SEGMENT',
      message: RULE_MESSAGES.CANNOT_DISLIKE_OWN_SEGMENT,
      remainingRatio: 0,
    };
  }

  if (ratio >= threshold) {
    return { allowed: true, code: null, message: null, remainingRatio: 0 };
  }

  const remainingRatio = threshold - ratio;
  const remainingPercent = Math.max(1, Math.ceil(remainingRatio * 100));
  return {
    allowed: false,
    code: 'LISTEN_RATIO_TOO_LOW',
    message: `${RULE_MESSAGES.LISTEN_RATIO_TOO_LOW}（已听 ${Math.floor(ratio * 100)}%，还需 ${remainingPercent}%）`,
    remainingRatio,
  };
}

/** 秒级可读时长（用于文案；不引第三方格式化库）。 */
function describeDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs)) return '无法识别';
  return `${(durationMs / 1000).toFixed(1)} 秒`;
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
