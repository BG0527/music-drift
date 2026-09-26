/**
 * 共享层 · HTTP 层（W0 冻结；之后只有 captain 能改）
 *
 * 为什么要有这一层：定稿 HTML 里一行 JS 都没有，而会话 cookie 是 `HttpOnly + SameSite=Lax`
 * 且后端没有任何 CORS 配置 ⇒ 所有请求都必须**同源**（`credentials: 'same-origin'`），
 * 且 401 必须由**一个地方**统一处置（跳登录页），否则 11 个页面会各写一套。
 *
 * 用法（W1 只消费，不要改本文件）：
 *   import { get, post, del, ApiError } from './api.js';
 *   const sea = await get('/api/sea', { query: { limit: 20 } });
 *   const bottle = await post('/api/bottles', { songId, mood });       // 自动 JSON 序列化
 *   await post('/api/segments/' + id + '/listen');                      // 无请求体
 *   await del('/api/collections/' + bottleId);
 *
 * 约定：
 * - 成功：返回**解析后的 JSON**；`204 No Content` 返回 `null`。
 * - 失败：一律 `throw ApiError`（**不返回错误对象**，避免每个调用点都判空）。
 * - 契约错误信封：`{ error: { message: string, violations: [{ code, message }] } }`
 *   （见 `packages/shared/src/contracts/common.ts` 的 `ErrorResponseSchema`）
 *   ⇒ `ApiError.message` 是给人看的中文文案，`ApiError.code` 是给程序判断的稳定码。
 * - 401：默认跳 `/login.html?next=<当前路径>`（本页已在 login.html 时不跳）。
 *   需要「把 401 当数据而不是错误」时（例如探测会话）传 `{ redirectOn401: false }`。
 */

const JSON_CONTENT_TYPE = 'application/json';

export class ApiError extends Error {
  constructor(message, { status = 0, code = null, violations = [], body = null, kind = 'http' } = {}) {
    super(message);
    this.name = 'ApiError';
    /** HTTP 状态码；`kind === 'network'` 时为 0。 */
    this.status = status;
    /** `violations[0].code`（AUTH_ERROR_CODES / RULE_CODES / API_RULE_CODES / AUDIO_RULE_CODES）。 */
    this.code = code;
    /** 原始 `violations` 数组（可能含多条规则违反）。 */
    this.violations = violations;
    /** 原始响应体（JSON 已解析；非 JSON 时是字符串）。 */
    this.body = body;
    /** `'http'`（收到了响应但状态码非 2xx）/ `'network'`（连不上）/ `'parse'`（响应不是 JSON）。 */
    this.kind = kind;
  }

  /** true = 后端没起来或正在冷启动 ⇒ 页面应展示「正在唤醒服务」而不是「出错了」。 */
  get isServiceDown() {
    return this.kind === 'network' || this.status === 502 || this.status === 503;
  }

  toString() {
    return `ApiError(${this.kind} ${this.status} ${this.code ?? '-'}): ${this.message}`;
  }
}

/** 当前站内路径 + 查询串（用作登录跳转的 `next`）。 */
export function currentPathWithSearch() {
  return `${location.pathname}${location.search}`;
}

export function loginUrl(next = currentPathWithSearch()) {
  return `/login.html?next=${encodeURIComponent(next)}`;
}

let redirectingToLogin = false;

/** 统一 401 出口：跳登录页并把当前路径带上（已在登录页则不动，避免自跳）。 */
export function redirectToLogin(next = currentPathWithSearch()) {
  if (redirectingToLogin) return;
  if (location.pathname === '/login.html') return;
  redirectingToLogin = true;
  location.assign(loginUrl(next));
}

/** 只接受站内相对路径，避免 `?next=//evil.example` 这类开放重定向。 */
export function sanitizeNextPath(next, fallback = '/river.html') {
  if (typeof next !== 'string' || next === '') return fallback;
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  return next;
}

function buildUrl(path, query) {
  let url = path;
  if (query !== undefined && query !== null) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      params.set(key, String(value));
    }
    const queryString = params.toString();
    if (queryString !== '') url += (url.includes('?') ? '&' : '?') + queryString;
  }
  return url;
}

function readErrorEnvelope(body) {
  const error = body !== null && typeof body === 'object' ? body.error : null;
  if (error === null || typeof error !== 'object') return null;
  const violations = Array.isArray(error.violations)
    ? error.violations.filter((item) => item !== null && typeof item === 'object')
    : [];
  const first = violations[0];
  return {
    message: typeof error.message === 'string' && error.message !== '' ? error.message : null,
    violations,
    code: first !== undefined && typeof first.code === 'string' ? first.code : null,
  };
}

/**
 * 底层请求。除非你要写新的 HTTP 方法，否则用 `get` / `post` / `del`。
 *
 * @param {'GET'|'POST'|'DELETE'|'PUT'|'PATCH'} method
 * @param {string} path 站内绝对路径，如 `/api/sea`
 * @param {{ body?: unknown, query?: Record<string, unknown>, headers?: Record<string, string>,
 *           signal?: AbortSignal, redirectOn401?: boolean }} [options]
 */
export async function request(method, path, options = {}) {
  const { body, rawBody, query, headers, signal, redirectOn401 = true } = options;
  const hasRaw = rawBody !== undefined && rawBody !== null;
  const hasBody = !hasRaw && body !== undefined && body !== null;

  let response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: 'same-origin',
      headers: {
        ...(hasBody ? { 'content-type': JSON_CONTENT_TYPE } : {}),
        ...(hasRaw ? { 'content-type': rawBody.type || 'application/octet-stream' } : {}),
        ...(headers ?? {}),
      },
      ...(hasBody ? { body: JSON.stringify(body) } : {}),
      ...(hasRaw ? { body: rawBody } : {}),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (cause) {
    if (cause !== null && typeof cause === 'object' && cause.name === 'AbortError') throw cause;
    throw new ApiError('连不上服务：后端可能未启动或正在冷启动。', { kind: 'network' });
  }

  const text = await response.text();
  let parsed = null;
  if (text !== '') {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const envelope = readErrorEnvelope(parsed);
    const message =
      envelope?.message ??
      (response.status === 502 || response.status === 503
        ? '后端服务暂不可用（可能正在唤醒），请稍候重试。'
        : `请求失败（HTTP ${response.status}）。`);
    if (response.status === 401 && redirectOn401) redirectToLogin();
    throw new ApiError(message, {
      status: response.status,
      code: envelope?.code ?? null,
      violations: envelope?.violations ?? [],
      body: parsed ?? text,
      kind: 'http',
    });
  }

  if (text !== '' && parsed === null) {
    throw new ApiError('服务返回的不是 JSON。', {
      status: response.status,
      body: text,
      kind: 'parse',
    });
  }

  return parsed;
}

export function get(path, options = {}) {
  return request('GET', path, options);
}

export function post(path, body, options = {}) {
  return request('POST', path, { ...options, body });
}

export function del(path, options = {}) {
  return request('DELETE', path, options);
}

/**
 * 录音上传（**原始二进制协议**，见 `apps/api/src/routes/bottles.ts:273`）：
 * `Content-Type` = 音频 MIME、body = 字节流、时长走 `x-audio-duration-ms` 头、附言走 `?note=`。
 * 为什么单独开一个口子：JSON 通道会把 body `JSON.stringify` 掉，二进制必须原样发。
 *
 * @param {string} path 如 `/api/bottles/<id>/segments`
 * @param {Blob} blob 录音（MediaRecorder 产出的 Blob，`type` 即音频 MIME）
 * @param {{ durationMs?: number, note?: string, query?: Record<string, unknown>, signal?: AbortSignal,
 *           redirectOn401?: boolean }} [options]
 */
export function postAudio(path, blob, options = {}) {
  const { durationMs, note, query, signal, redirectOn401 } = options;
  return request('POST', path, {
    rawBody: blob,
    query: { ...(note === undefined || note === '' ? {} : { note }), ...(query ?? {}) },
    headers: {
      ...(durationMs === undefined ? {} : { 'x-audio-duration-ms': String(Math.round(durationMs)) }),
    },
    ...(signal === undefined ? {} : { signal }),
    ...(redirectOn401 === undefined ? {} : { redirectOn401 }),
  });
}
