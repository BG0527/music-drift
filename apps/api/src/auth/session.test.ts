/**
 * 会话令牌与 cookie（D-03：opaque 256-bit token + 库内 SHA-256 + httpOnly/SameSite=Lax）。
 *
 * 不变量：
 * - **明文 token 只出现在 Set-Cookie**，库里只存 `sha256(token)`；
 * - 过期判定是 `expires_at > now`（边界那一毫秒即失效）；
 * - 时间一律外部传入（内核/API 层都不自取墙上时间）。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SESSION_TTL_MS,
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  createSessionToken,
  hashSessionToken,
  isSessionActive,
  readCookie,
  serializeSessionCookie,
  sessionExpiresAt,
} from './session';

const NOW = 1_700_000_000_000;

describe('token 生成与存储形态', () => {
  it('cookie 名是常量，TTL 非零', () => {
    expect(SESSION_COOKIE_NAME).toBe('mdb_session');
    expect(DEFAULT_SESSION_TTL_MS).toBeGreaterThan(0);
  });

  it('256-bit token → 43 字符 base64url，无 padding，且两次不同', () => {
    const a = createSessionToken();
    const b = createSessionToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(b).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('库里存的是 SHA-256 hex（64 字符），与明文不同且稳定', () => {
    const token = createSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
    expect(hashSessionToken(token)).toBe(hash);
    expect(hashSessionToken(createSessionToken())).not.toBe(hash);
  });
});

describe('过期判定', () => {
  it('expiresAt = now + TTL', () => {
    expect(sessionExpiresAt(NOW, 60_000).getTime()).toBe(NOW + 60_000);
  });

  it('边界：恰好到期即失效（expires_at > now 才有效）', () => {
    const at = new Date(NOW);
    expect(isSessionActive(at, NOW - 1)).toBe(true);
    expect(isSessionActive(at, NOW)).toBe(false);
    expect(isSessionActive(at, NOW + 1)).toBe(false);
  });
});

describe('Set-Cookie 序列化', () => {
  it('含 HttpOnly / SameSite=Lax / Path=/ / Max-Age，且带 token 明文', () => {
    const cookie = serializeSessionCookie({
      token: 'tok_value_43_chars_______________________',
      ttlMs: 3600_000,
      nowMs: NOW,
      secure: false,
    });
    expect(
      cookie.startsWith(`${SESSION_COOKIE_NAME}=tok_value_43_chars_______________________;`),
    ).toBe(true);
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=3600');
  });

  it('本地（secure=false）不带 Secure，线上（secure=true）必须带', () => {
    const base = { token: 'x'.repeat(43), ttlMs: 1000, nowMs: NOW };
    expect(serializeSessionCookie({ ...base, secure: false })).not.toContain('Secure');
    expect(serializeSessionCookie({ ...base, secure: true })).toContain('Secure');
  });

  it('登出 cookie：Max-Age=0 且不带 token（幂等清除）', () => {
    const cookie = clearSessionCookie({ secure: false });
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('HttpOnly');
  });
});

describe('Cookie 解析', () => {
  it('从多 cookie 头里取出目标值', () => {
    expect(readCookie('a=1; mdb_session=abc; b=2', 'mdb_session')).toBe('abc');
  });

  it('缺失/空头/畸形段 → null（不抛异常）', () => {
    expect(readCookie(undefined, 'mdb_session')).toBeNull();
    expect(readCookie('', 'mdb_session')).toBeNull();
    expect(readCookie('other=1', 'mdb_session')).toBeNull();
    expect(readCookie('mdb_session', 'mdb_session')).toBeNull();
    expect(readCookie('mdb_session=; a=1', 'mdb_session')).toBeNull();
  });

  it('兼容带引号与多余空格的值', () => {
    expect(readCookie('  mdb_session = "v1" ; x=2', 'mdb_session')).toBe('v1');
  });

  it('同名 cookie 重复出现：取第一个、不抛（重复即视为异常输入，按普通值处理）', () => {
    expect(readCookie('mdb_session=first; mdb_session=second', 'mdb_session')).toBe('first');
  });
});
