/**
 * 会话令牌与 cookie（D-03 裁决）。
 *
 * 不变量：
 * - **明文 token 只出现在 `Set-Cookie`**；库里只存 `sha256(token)`（`sessions.token_hash` 唯一索引）；
 * - 过期判定 `expires_at > now`：**`now === expires_at` 即已失效**（边界归属"已过期"）；
 * - 时间一律由调用方传入（API 层用注入的 `createSystemClock()`，见 `eslint.config.mjs` 的禁用规则）；
 * - cookie 属性手写，**不引 `@fastify/cookie`**（AGENTS.md §7：能 stdlib 就不引依赖）。
 */
import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'mdb_session';

const SECOND_MS = 1000;
const DAY_MS = 24 * 60 * 60 * SECOND_MS;

/** 会话策略：TTL 是**可注入的策略常量**，不散落魔数（captain 要求）。 */
export interface SessionPolicy {
  ttlMs: number;
}

/** 默认 30 天：demo 期内不必反复登录，同时保留"过期 → 重新登录"的完整路径。 */
export const DEFAULT_SESSION_POLICY: SessionPolicy = { ttlMs: 30 * DAY_MS };
export const DEFAULT_SESSION_TTL_MS = DEFAULT_SESSION_POLICY.ttlMs;

/** 256-bit opaque token → base64url（43 字符，无 padding）。 */
export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** 库内只存这个：SHA-256 hex（64 字符）。 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionExpiresAt(nowMs: number, ttlMs: number = DEFAULT_SESSION_TTL_MS): Date {
  return new Date(nowMs + ttlMs);
}

/** `now === expires_at` 视为已过期。 */
export function isSessionActive(expiresAt: Date, nowMs: number): boolean {
  return expiresAt.getTime() > nowMs;
}

export interface SerializeCookieOptions {
  token: string;
  ttlMs: number;
  nowMs: number;
  /** 仅生产环境为 true（本地 http 下带 Secure 会导致浏览器不保存 cookie）。 */
  secure: boolean;
}

export function serializeSessionCookie(options: SerializeCookieOptions): string {
  const expires = new Date(options.nowMs + options.ttlMs).toUTCString();
  const maxAge = Math.max(0, Math.floor(options.ttlMs / SECOND_MS));
  return [
    `${SESSION_COOKIE_NAME}=${options.token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    `Expires=${expires}`,
    ...(options.secure ? ['Secure'] : []),
  ].join('; ');
}

/** 登出：同属性、`Max-Age=0`、不带 token（幂等清除）。 */
export function clearSessionCookie(options: { secure: boolean }): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ...(options.secure ? ['Secure'] : []),
  ].join('; ');
}

/**
 * 解析 `Cookie` 头取指定 cookie。
 * 畸形段（无 `=`、空值）忽略；同名重复取**第一个**；任何情况都不抛异常 —— 解析不出来就是「未登录」。
 */
export function readCookie(header: string | undefined, name: string): string | null {
  if (header === undefined || header.length === 0) {
    return null;
  }
  for (const segment of header.split(';')) {
    const separatorAt = segment.indexOf('=');
    if (separatorAt < 0) {
      continue;
    }
    const key = segment.slice(0, separatorAt).trim();
    if (key !== name) {
      continue;
    }
    const value = stripQuotes(segment.slice(separatorAt + 1).trim());
    return value.length === 0 ? null : value;
  }
  return null;
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}
