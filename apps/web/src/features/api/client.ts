/**
 * 契约对接层 —— 页面**唯一**允许发 HTTP 请求的地方。
 *
 * 三条纪律：
 * 1. **响应形状由 `packages/shared` 的 zod 契约校验**（ADR-004：zod 是唯一真相）。
 *    校验失败抛 `CONTRACT_VIOLATION`，绝不把脏数据渲染进页面；
 * 2. **码与文案分离**：`ApiError.code` 给程序判断（可能为 null —— 传输层错误没有码），
 *    `ApiError.message` 是服务端给的中文文案；
 * 3. 一律 `credentials: 'include'`（会话是 httpOnly cookie，ADR-008），
 *    JSON 头只在有 body 时加（音频上传走原始二进制，由 `features/audio/upload.ts` 自己负责）。
 */
import { AuthErrorResponseSchema, ErrorResponseSchema } from '@music-drift/shared';

/**
 * 响应契约的**结构化端口**：任何带 `safeParse` 的东西都能用（`packages/shared` 的 zod schema 天然满足）。
 * 为什么不直接 import zod 的类型：zod 不是 `apps/web` 的依赖（在 shared/api 侧），
 * 为了一个类型去改依赖基线不划算（AGENTS.md §7）；`safeParse` 的结构在语义上已经说明了要求。
 */
export interface ResponseSchema<T> {
  safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: unknown };
}

/** 只依赖 `fetch` 的最小形状，方便测试注入假传输层（不需要 jsdom 支持 XHR/fetch）。 */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<FetchResponseLike>;

export interface ApiViolation {
  code: string;
  message: string;
}

export class ApiError extends Error {
  /** HTTP 状态；`null` = 网络层失败（请求没能到达服务端）。 */
  readonly status: number | null;
  /** 稳定错误码；传输层错误与网络失败都是 `null`。 */
  readonly code: string | null;
  readonly violations: readonly ApiViolation[];

  constructor(input: {
    status: number | null;
    code: string | null;
    message: string;
    violations?: readonly ApiViolation[];
  }) {
    super(input.message);
    this.name = 'ApiError';
    this.status = input.status;
    this.code = input.code;
    this.violations = input.violations ?? [];
  }
}

export interface ApiRequestInit<T> {
  path: string;
  method?: 'GET' | 'POST' | 'DELETE' | 'PUT';
  body?: unknown;
  /** 响应契约；提供后必须解析成功，否则抛 `CONTRACT_VIOLATION`。 */
  schema?: ResponseSchema<T>;
  signal?: AbortSignal | undefined;
  /** 传输层覆盖（测试用；生产走全局 `fetch`）。 */
  fetchImpl?: FetchLike | undefined;
}

const JSON_HEADERS: Record<string, string> = { 'Content-Type': 'application/json' };

function isBlob(body: unknown): body is Blob {
  return typeof Blob !== 'function' ? false : body instanceof Blob;
}

function fallbackMessageFor(status: number): string {
  if (status >= 500) return '服务器暂时不可用，请稍后再试。';
  if (status === 404) return '找不到这个资源。';
  if (status === 401) return '请先登录再继续。';
  if (status === 403) return '你没有权限执行这个操作。';
  return '请求没有完成，请稍后重试。';
}

/**
 * 错误响应 → `ApiError`。
 *
 * ⚠️ 必须**同时**尝试两种 envelope：领域/音频/API 码走 `ErrorResponseSchema`，
 * **账号码（`AUTH_ERROR_CODES`）不在那张词表里**，走 `AuthErrorResponseSchema`。
 * 只认前者会让 `/api/auth/*` 的 409/422 丢掉码（页面就只能说"请先登录"，
 * 而不是"这个邮箱已经注册过了"）—— 这是 T3.2 里被测试抓到的真实缺陷。
 * 两个 schema 形状一致（`{error:{message,violations[]}}`），所以下游只有一种解析方式。
 */
function toApiError(status: number, payload: unknown): ApiError {
  const parsed = ErrorResponseSchema.safeParse(payload);
  if (parsed.success) {
    const violations: ApiViolation[] = parsed.data.error.violations.map((violation) => ({
      code: violation.code,
      message: violation.message,
    }));
    return new ApiError({
      status,
      code: violations[0]?.code ?? null,
      message: parsed.data.error.message,
      violations,
    });
  }

  const authParsed = AuthErrorResponseSchema.safeParse(payload);
  if (authParsed.success) {
    const violations: ApiViolation[] = authParsed.data.error.violations.map((violation) => ({
      code: violation.code,
      message: violation.message,
    }));
    return new ApiError({
      status,
      code: violations[0]?.code ?? null,
      message: authParsed.data.error.message,
      violations,
    });
  }

  return new ApiError({ status, code: null, message: fallbackMessageFor(status) });
}

function defaultFetch(input: string, init: RequestInit): Promise<FetchResponseLike> {
  return fetch(input, init) as unknown as Promise<FetchResponseLike>;
}

export async function apiFetch<T>(request: ApiRequestInit<T>): Promise<T> {
  const fetchImpl = request.fetchImpl ?? defaultFetch;
  const method = request.method ?? 'GET';
  const hasBody = request.body !== undefined && request.body !== null;
  const init: RequestInit = {
    method,
    credentials: 'include',
    // 只有带 JSON body 时才加 Content-Type（GET 与二进制上传都不加）
    ...(hasBody && !isBlob(request.body) ? { headers: JSON_HEADERS } : {}),
    ...(hasBody
      ? { body: isBlob(request.body) ? request.body : JSON.stringify(request.body) }
      : {}),
    ...(request.signal === undefined ? {} : { signal: request.signal }),
  };

  let response: FetchResponseLike;
  try {
    response = await fetchImpl(request.path, init);
  } catch {
    throw new ApiError({ status: null, code: null, message: '网络没有接通，请检查网络后重试。' });
  }

  // 204（登出、标记已读）没有响应体
  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    // 非 JSON 响应（网关 HTML、空体）——交给下面的 fallback 文案处理
    payload = null;
  }

  if (!response.ok) throw toApiError(response.status, payload);

  if (request.schema === undefined) return payload as T;

  const parsed = request.schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError({
      status: response.status,
      code: 'CONTRACT_VIOLATION',
      message: '服务端返回的数据不符合契约，请刷新页面后重试。',
    });
  }
  return parsed.data;
}

/** 页面里最常用的两类调用，避免每处都写 `{ path, schema }` 样板。 */
export function apiGet<T>(
  path: string,
  schema: ResponseSchema<T>,
  signal?: AbortSignal,
): Promise<T> {
  return apiFetch({ path, schema, ...(signal === undefined ? {} : { signal }) });
}

export function apiPost<T>(path: string, body: unknown, schema: ResponseSchema<T>): Promise<T> {
  return apiFetch({ path, method: 'POST', body, schema });
}

/** 无响应体（204）的写操作。 */
export function apiPostVoid(path: string, body?: unknown): Promise<undefined> {
  return apiFetch<undefined>({ path, method: 'POST', ...(body === undefined ? {} : { body }) });
}
