/**
 * 账号路由（集成测试，需真实 Postgres）：`/api/auth/*` + `/api/me/anonymous-codes`。
 *
 * 验收口径（t6）：
 * - **两个账号并行登录互不干扰**（各自 cookie 各自身份）；
 * - 代号唯一性与「同瓶不同码」有测试覆盖；
 * - 重复注册 409 / 弱密码 422 / 错误凭证 401（不区分账号不存在与口令错误）/ 会话过期 401；
 * - **响应体与 Set-Cookie 之外不得出现口令或会话令牌**。
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AuthErrorResponseSchema,
  AnonymousCodeSchema,
  SessionResponseSchema,
} from '@music-drift/shared';
import { createManualClock, type ManualClock } from '@music-drift/shared/domain';
import { buildApp } from '../app.js';
import { createDb, type Db } from '../db/client.js';
import { insertBottle } from '../db/test-helpers.js';
import { createAuthRepository } from '../auth/repository.js';
import { DEFAULT_SESSION_TTL_MS, SESSION_COOKIE_NAME } from '../auth/session.js';

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgres://music_drift:music_drift_dev@localhost:5433/music_drift_test';

const START_MS = 1_700_000_000_000;
const PASSWORD = '潮汐-9Run-away';

let db: Db;
let clock: ManualClock;
let app: ReturnType<typeof buildApp>;

function uniqueEmail(): string {
  return `${randomUUID().slice(0, 8)}@test.local`;
}

function uniqueHandle(): string {
  return `singer-${randomUUID().slice(0, 8)}`;
}

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') {
    throw new Error('响应里没有 Set-Cookie');
  }
  return value;
}

function tokenFrom(response: { headers: Record<string, unknown> }): string {
  const match = /mdb_session=([^;]+)/.exec(cookieFrom(response));
  if (match?.[1] === undefined) {
    throw new Error('Set-Cookie 里没有会话令牌');
  }
  return match[1];
}

async function register(overrides: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { handle: uniqueHandle(), email: uniqueEmail(), password: PASSWORD, ...overrides },
  });
}

async function me(cookie?: string) {
  return app.inject({
    method: 'GET',
    url: '/api/auth/me',
    ...(cookie === undefined ? {} : { headers: { cookie } }),
  });
}

/**
 * 分配一个真正写库成功的代号（`anon_codes.code` 全局唯一 + 测试文件并行共享同一测试库，
 * 因此**不能**用硬编码代号直接 assign：撞车时它会返回 ANON_CODE_TAKEN，测试就会拿到空清单）。
 */
async function assignCodeWithRetry(
  repo: ReturnType<typeof createAuthRepository>,
  userId: string,
  bottleId: string,
  title: string,
): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `${title}#${String(Math.floor(Math.random() * 900) + 100)}`;
    const result = await repo.assignAnonCode({ userId, bottleId, code: candidate });
    if (result.ok) {
      return result.code;
    }
  }
  throw new Error(`无法为 ${title} 分配到唯一代号`);
}

beforeAll(async () => {
  db = await createDb(DATABASE_URL);
  clock = createManualClock(START_MS);
  app = buildApp({ db, clock });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('POST /api/auth/register', () => {
  it('注册成功：201 + SessionResponseSchema + httpOnly/SameSite=Lax cookie（本地不加 Secure）', async () => {
    const handle = uniqueHandle();
    const email = uniqueEmail();

    const response = await register({ handle, email });

    expect(response.statusCode).toBe(201);
    const parsed = SessionResponseSchema.safeParse(response.json());
    expect(parsed.success).toBe(true);
    expect(response.json().user.handle).toBe(handle);
    expect(response.json().user.email).toBe(email);

    const cookie = cookieFrom(response);
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
  });

  it('响应体不含口令与令牌（只在 Set-Cookie 里）', async () => {
    const response = await register();
    const raw = response.body;

    expect(raw).not.toContain(PASSWORD);
    expect(raw).not.toContain('password');
    expect(raw).not.toContain(tokenFrom(response));
  });

  it('库内存哈希不存明文口令', async () => {
    const email = uniqueEmail();
    await register({ email });

    const rows = await db.query<{ password_hash: string }>(
      `select password_hash from users where email = $1`,
      [email],
    );

    expect(rows[0]?.password_hash).not.toBe(PASSWORD);
    expect(rows[0]?.password_hash.startsWith('scrypt$')).toBe(true);
  });

  it('邮箱重复（大小写不同也算同一邮箱）→ 409 + EMAIL_TAKEN', async () => {
    const email = uniqueEmail();
    await register({ email });

    const response = await register({ email: email.toUpperCase() });

    expect(response.statusCode).toBe(409);
    const parsed = AuthErrorResponseSchema.parse(response.json());
    expect(parsed.error.violations[0]?.code).toBe('EMAIL_TAKEN');
  });

  it('用户名重复 → 409 + HANDLE_TAKEN', async () => {
    const handle = uniqueHandle();
    await register({ handle });

    const response = await register({ handle });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.violations[0].code).toBe('HANDLE_TAKEN');
  });

  it('弱密码 → 422 + WEAK_PASSWORD（口令本身不出现在响应里）', async () => {
    const response = await register({ password: 'password1' });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.violations[0].code).toBe('WEAK_PASSWORD');
    expect(response.body).not.toContain('password1');
  });

  it('请求体结构非法（邮箱不合法）→ 422，且 violations 可为空（结构错误无 auth 码）', async () => {
    const response = await register({ email: 'not-an-email' });

    expect(response.statusCode).toBe(422);
    expect(AuthErrorResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json().error.violations).toEqual([]);
  });
});

describe('POST /api/auth/login', () => {
  it('凭证正确：200 + 新会话 cookie，且可访问 /me', async () => {
    const email = uniqueEmail();
    await register({ email });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    expect(SessionResponseSchema.safeParse(response.json()).success).toBe(true);
    const meResponse = await me(cookieFrom(response));
    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.json().user.email).toBe(email);
  });

  it('邮箱大小写不敏感（注册后可用大写邮箱登录）', async () => {
    const email = uniqueEmail();
    await register({ email });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: email.toUpperCase(), password: PASSWORD },
    });

    expect(response.statusCode).toBe(200);
  });

  it('口令错误与账号不存在返回**完全相同**的 401（防账号枚举）', async () => {
    const email = uniqueEmail();
    await register({ email });

    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'wrong-passw0rd' },
    });
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: uniqueEmail(), password: PASSWORD },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
    expect(wrongPassword.json().error.violations[0].code).toBe('INVALID_CREDENTIALS');
  });

  it('响应体不含口令', async () => {
    const email = uniqueEmail();
    await register({ email });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: PASSWORD },
    });

    expect(response.body).not.toContain(PASSWORD);
  });
});

describe('GET /api/auth/me 与多账号并行', () => {
  it('两个账号各自 cookie 各自身份，互不干扰（并行登录的验收口径）', async () => {
    const first = await register();
    const second = await register();

    const firstMe = await me(cookieFrom(first));
    const secondMe = await me(cookieFrom(second));

    expect(firstMe.json().user.id).toBe(first.json().user.id);
    expect(secondMe.json().user.id).toBe(second.json().user.id);
    expect(firstMe.json().user.id).not.toBe(secondMe.json().user.id);
  });

  it('A 再次登录不会踢掉 B 的会话（同一用户可并存多会话）', async () => {
    const a = await register();
    const b = await register();
    const email = a.json().user.email;

    const relogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: PASSWORD },
    });

    expect(relogin.statusCode).toBe(200);
    expect((await me(cookieFrom(a))).statusCode).toBe(200);
    expect((await me(cookieFrom(b))).statusCode).toBe(200);
  });

  it('无 cookie → 401 UNAUTHENTICATED；畸形 cookie 同样按未登录处理（不抛 500）', async () => {
    const none = await me();
    const malformed = await me('mdb_session=; other=1');
    const garbage = await me('mdb_session=not-a-real-token');

    expect(none.statusCode).toBe(401);
    expect(none.json().error.violations[0].code).toBe('UNAUTHENTICATED');
    expect(malformed.statusCode).toBe(401);
    expect(garbage.statusCode).toBe(401);
  });

  it('会话过期：边界（now === expires_at）即视为过期 → 401 SESSION_EXPIRED', async () => {
    const registered = await register();
    const cookie = cookieFrom(registered);

    clock.set(START_MS + DEFAULT_SESSION_TTL_MS);

    const expired = await me(cookie);

    expect(expired.statusCode).toBe(401);
    expect(expired.json().error.violations[0].code).toBe('SESSION_EXPIRED');
    clock.set(START_MS);
  });

  it('过期会话在再次访问时被清理（不留垃圾行）', async () => {
    const registered = await register();
    const cookie = cookieFrom(registered);
    const token = tokenFrom(registered);

    clock.set(START_MS + DEFAULT_SESSION_TTL_MS + 1);
    await me(cookie);

    const rows = await db.query<{ n: string }>(
      `select count(*)::text as n from sessions where token_hash = encode(sha256($1::bytea), 'hex')`,
      [token],
    );
    expect(Number(rows[0]?.n ?? -1)).toBe(0);
    clock.set(START_MS);
  });
});

describe('POST /api/auth/logout', () => {
  it('登出 204 + 清除 cookie；旧 cookie 立即失效；重复登出仍 204（幂等）', async () => {
    const registered = await register();
    const cookie = cookieFrom(registered);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(204);
    expect(cookieFrom(response)).toContain('Max-Age=0');
    expect((await me(cookie)).statusCode).toBe(401);

    const again = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(again.statusCode).toBe(204);
  });

  it('登出只影响自己：另一个账号的会话仍然有效', async () => {
    const a = await register();
    const b = await register();

    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: cookieFrom(a) },
    });

    expect((await me(cookieFrom(a))).statusCode).toBe(401);
    expect((await me(cookieFrom(b))).statusCode).toBe(200);
  });
});

describe('GET /api/me/anonymous-codes', () => {
  it('未登录 → 401（与 /me 同一套会话语义）', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/me/anonymous-codes' });
    expect(response.statusCode).toBe(401);
  });

  it('登录后返回自己的代号清单；同瓶不同用户、不同瓶同用户都是不同代号', async () => {
    const registered = await register();
    const cookie = cookieFrom(registered);
    const userId = registered.json().user.id;

    const repo = createAuthRepository(db);
    const bottleA = await insertBottle(db);
    const bottleB = await insertBottle(db);
    // `anon_codes.code` 全局唯一且测试文件并行共享同一测试库 → 用重试拿到真正写入的代号，
    // 断言基于返回值而不是硬编码代号（否则会与别的测试文件抢同一个 code）。
    const codeA = await assignCodeWithRetry(repo, userId, bottleA.bottleId, '午夜歌手');
    const codeB = await assignCodeWithRetry(repo, userId, bottleB.bottleId, '深海旅人');
    expect(codeA).not.toBe(codeB);

    const response = await app.inject({
      method: 'GET',
      url: '/api/me/anonymous-codes',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as unknown[];
    expect(AnonymousCodeSchema.array().safeParse(body).success).toBe(true);
    const codes = body.map((item) => (item as { code: string }).code).sort();
    expect(codes).toEqual([codeA, codeB].sort());
  });
});
