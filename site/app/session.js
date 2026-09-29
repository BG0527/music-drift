/**
 * 共享层 · 会话（W0 冻结；之后只有 captain 能改）
 *
 * 会话真相只有一处：cookie（`HttpOnly + SameSite=Lax`，前端看不见）。
 * 前端能做的只是**问** `GET /api/auth/me` 并缓存结果 —— 所以本模块刻意只缓存**内存**，
 * 不做 localStorage（改 cookie 也改不了 HttpOnly，缓存只会骗自己）。
 *
 * 用法（W1 只消费，不要改本文件）：
 *   import { currentUser, requireUser, login, register, logout, nextTarget } from './session.js';
 *
 *   const user = await requireUser();              // 未登录 → 跳 /login.html?next=当前页，返回 null
 *   if (user === null) return;                     // 跳转后不要再往下跑
 *   q('#handle').textContent = user.handle;
 *
 *   // 登录页（W1-d）：
 *   try { await login(account, password); location.assign(nextTarget()); }
 *   catch (error) { showError(error); }            // 401 INVALID_CREDENTIALS 的文案已在 error.message 里
 *
 * 失败语义：`currentUser()` **只有两种**结局 —— 拿到 user 或得到 `null`（未登录/会话过期，都是 401）。
 * 网络错误 / 5xx **会抛出** `ApiError`（`error.isServiceDown` 时用 `showWaking`，别显示"未登录"）。
 */

import { get, post, redirectToLogin, sanitizeNextPath } from './api.js';

/** @typedef {{ id: string, handle: string, account: string, role: 'USER'|'ADMIN' }} AuthUser */

/** @type {AuthUser|null} */
let cached = null;
let loaded = false;
/** @type {Promise<AuthUser|null>|null} */
let inflight = null;

/** 同步读缓存（未加载过则返回 null）——只用于"已经有了就先渲染"，不要用它判断登录态。 */
export function cachedUser() {
  return cached;
}

/** 丢掉缓存（登出、或需要强制重问服务端时）。 */
export function invalidateSession() {
  cached = null;
  loaded = false;
  inflight = null;
}

async function fetchCurrentUser() {
  try {
    const session = await get('/api/auth/me', { redirectOn401: false });
    return session !== null && typeof session === 'object' ? (session.user ?? null) : null;
  } catch (error) {
    // 401 = 未登录 / 会话过期（UNAUTHENTICATED / SESSION_EXPIRED）⇒ 这是"没登录"，不是错误。
    if (error !== null && typeof error === 'object' && error.status === 401) return null;
    throw error;
  }
}

/**
 * 当前登录用户；未登录返回 `null`。同一页内只问服务端一次（可用 `{ refresh: true }` 强制重问）。
 * @param {{ refresh?: boolean }} [options]
 * @returns {Promise<AuthUser|null>}
 */
export async function currentUser(options = {}) {
  const { refresh = false } = options;
  if (refresh) invalidateSession();
  if (loaded) return cached;
  if (inflight !== null) return inflight;
  inflight = fetchCurrentUser();
  try {
    const user = await inflight;
    cached = user;
    loaded = true;
    return user;
  } finally {
    inflight = null;
  }
}

/**
 * 需要登录的页面守卫。
 * @param {{ redirect?: boolean }} [options]
 * @returns {Promise<AuthUser|null>} null = 未登录（默认已发起跳转，调用方直接 return）
 */
export async function requireUser(options = {}) {
  const { redirect = true } = options;
  const user = await currentUser();
  if (user === null && redirect) redirectToLogin();
  return user;
}

/** `POST /api/auth/login`（**不**在 401 时跳转：那是"口令错了"，要留在表单上显示文案）。 */
export async function login(account, password) {
  const session = await post('/api/auth/login', { account, password }, { redirectOn401: false });
  cached = session?.user ?? null;
  loaded = true;
  return cached;
}

/** `POST /api/auth/register`（成功 201，响应体与登录同形 ⇒ 注册即登录）。 */
export async function register(account, password) {
  const session = await post('/api/auth/register', { account, password }, { redirectOn401: false });
  cached = session?.user ?? null;
  loaded = true;
  return cached;
}

/** `POST /api/auth/logout`（204）。无论成功与否都清本地缓存。 */
export async function logout() {
  try {
    await post('/api/auth/logout', undefined, { redirectOn401: false });
  } finally {
    cached = null;
    loaded = true;
  }
}

/** 读 `?next=`（已被 `sanitizeNextPath` 收紧，只接受站内 `/...`），默认回河道。 */
export function nextTarget(fallback = '/river.html') {
  const next = new URLSearchParams(location.search).get('next');
  return sanitizeNextPath(next, fallback);
}
