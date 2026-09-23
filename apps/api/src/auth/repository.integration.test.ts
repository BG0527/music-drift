/**
 * 账号持久化（集成测试，需真实 Postgres；`pnpm --filter @music-drift/api test:integration`）。
 *
 * 覆盖三类必须在 DB 层钉住的语义：
 * 1. 唯一冲突的**精确映射**（邮箱/用户名/代号各有各的码；**意外冲突必须抛错而不是被静默吞掉** ——
 *    与 `holdings` 的「带谓词冲突目标」同一教训）；
 * 2. 会话的存储与查找（**同一用户可并存多个会话**：多浏览器、多账号并行是 t6 的验收前提）；
 * 3. 匿名代号的幂等与唯一（同 (用户,瓶子) 复用同一代号；不同瓶子/不同用户必须不同）。
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { insertBottle, insertUser } from '../db/test-helpers.js';
import { createAuthRepository, type AuthRepository } from './repository.js';

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgres://music_drift:music_drift_dev@localhost:5433/music_drift_test';

let db: Db;
let repo: AuthRepository;

async function countRows(sql: string, params: readonly unknown[]): Promise<number> {
  const rows = await db.query<{ n: string }>(sql, params);
  return Number(rows[0]?.n ?? 0);
}

beforeAll(async () => {
  db = await createDb(DATABASE_URL);
  repo = createAuthRepository(db);
});

/**
 * 分配一个**真正写库成功**的代号。
 *
 * ⚠️ 为什么不能直接 `assignAnonCode({code: 随机})`：`anon_codes.code` 是**全局唯一**，
 * 而集成测试文件**并行共享同一个测试库**（21 个 worker）—— 别的文件恰好用同一个 code 时，
 * 这里的 assign 会返回 `ANON_CODE_TAKEN`、**行没写进去**，于是断言随机失败（假红）。
 * 实测踩过：`listCodesForUser 给出该用户已持有的全部代号` 曾因此全量跑红一次。
 */
async function assignCodeWithRetry(
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

afterAll(async () => {
  await db.close();
});

describe('createUser', () => {
  it('写入用户行并返回（role 默认 USER）', async () => {
    const handle = `singer-${randomUUID().slice(0, 8)}`;
    const email = `${randomUUID().slice(0, 8)}@test.local`;

    const result = await repo.createUser({ handle, email, passwordHash: 'scrypt$hash' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.handle).toBe(handle);
    expect(result.user.email).toBe(email);
    expect(result.user.role).toBe('USER');
    expect(result.user.createdAt).toBeInstanceOf(Date);
  });

  it('邮箱重复 → EMAIL_TAKEN（不是静默失败）', async () => {
    const email = `${randomUUID().slice(0, 8)}@test.local`;
    await repo.createUser({ handle: `a-${randomUUID().slice(0, 8)}`, email, passwordHash: 'h' });

    const second = await repo.createUser({
      handle: `b-${randomUUID().slice(0, 8)}`,
      email,
      passwordHash: 'h',
    });

    expect(second).toEqual({ ok: false, code: 'EMAIL_TAKEN' });
  });

  it('用户名重复 → HANDLE_TAKEN', async () => {
    const handle = `dup-${randomUUID().slice(0, 8)}`;
    await repo.createUser({
      handle,
      email: `${randomUUID().slice(0, 8)}@test.local`,
      passwordHash: 'h',
    });

    const second = await repo.createUser({
      handle,
      email: `${randomUUID().slice(0, 8)}@test.local`,
      passwordHash: 'h',
    });

    expect(second).toEqual({ ok: false, code: 'HANDLE_TAKEN' });
  });

  it('意外冲突（主键重复）必须抛错，而不是被当成 EMAIL_TAKEN/HANDLE_TAKEN 吞掉', async () => {
    const id = randomUUID();
    await repo.createUser({
      id,
      handle: `k-${id.slice(0, 8)}`,
      email: `${id.slice(0, 8)}@test.local`,
      passwordHash: 'h',
    });

    await expect(
      repo.createUser({
        id,
        handle: `k2-${id.slice(0, 8)}`,
        email: `k2-${id.slice(0, 8)}@test.local`,
        passwordHash: 'h',
      }),
    ).rejects.toThrow();
  });
});

describe('用户查询', () => {
  it('按邮箱查到刚注册的用户；未注册邮箱返回 null', async () => {
    const email = `${randomUUID().slice(0, 8)}@test.local`;
    await repo.createUser({ handle: `f-${randomUUID().slice(0, 8)}`, email, passwordHash: 'h' });

    const found = await repo.findUserByEmail(email);
    expect(found?.email).toBe(email);
    expect(await repo.findUserByEmail(`nobody-${randomUUID().slice(0, 8)}@test.local`)).toBeNull();
  });
});

describe('sessions', () => {
  it('写入会话后可按 token_hash 查回用户与过期时间', async () => {
    const userId = await insertUser(db);
    const expiresAt = new Date(Date.now() + 60_000);

    await repo.createSession({ userId, tokenHash: `h-${randomUUID()}`, expiresAt });
    const found = await repo.findSessionByTokenHash(`h-${randomUUID()}`);

    expect(found).toBeNull(); // 未写入的 hash 必须查不到（防"任意 token 都能登录"）
    void found;
  });

  it('查询走 token_hash，返回用户与 expiresAt', async () => {
    const userId = await insertUser(db);
    const tokenHash = `h-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 60_000);
    await repo.createSession({ userId, tokenHash, expiresAt });

    const session = await repo.findSessionByTokenHash(tokenHash);

    expect(session?.user.id).toBe(userId);
    expect(session?.expiresAt.getTime()).toBe(expiresAt.getTime());
  });

  it('同一用户可并存多个会话（多浏览器 / 多账号并行的前提）', async () => {
    const userId = await insertUser(db);
    const a = `h-${randomUUID()}`;
    const b = `h-${randomUUID()}`;

    await repo.createSession({ userId, tokenHash: a, expiresAt: new Date(Date.now() + 60_000) });
    await repo.createSession({ userId, tokenHash: b, expiresAt: new Date(Date.now() + 60_000) });

    expect((await repo.findSessionByTokenHash(a))?.user.id).toBe(userId);
    expect((await repo.findSessionByTokenHash(b))?.user.id).toBe(userId);
  });

  it('删除会话幂等：第一次成功、第二次 false（登出可重复调用）', async () => {
    const userId = await insertUser(db);
    const tokenHash = `h-${randomUUID()}`;
    await repo.createSession({ userId, tokenHash, expiresAt: new Date(Date.now() + 60_000) });

    expect(await repo.deleteSessionByTokenHash(tokenHash)).toBe(true);
    expect(await repo.deleteSessionByTokenHash(tokenHash)).toBe(false);
  });

  it('只清理已过期会话，不动仍然有效的会话', async () => {
    const userId = await insertUser(db);
    const expired = `h-${randomUUID()}`;
    const alive = `h-${randomUUID()}`;
    const nowMs = Date.now();
    await repo.createSession({ userId, tokenHash: expired, expiresAt: new Date(nowMs - 1000) });
    await repo.createSession({ userId, tokenHash: alive, expiresAt: new Date(nowMs + 60_000) });

    const removed = await repo.deleteExpiredSessions(nowMs);

    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await repo.findSessionByTokenHash(expired)).toBeNull();
    expect(await repo.findSessionByTokenHash(alive)).not.toBeNull();
  });
});

describe('anon_codes', () => {
  it('首次分配写入新代号；同 (用户,瓶子) 再分配复用同一代号且不新增行', async () => {
    const userId = await insertUser(db);
    const { bottleId } = await insertBottle(db);
    const code = await assignCodeWithRetry(userId, bottleId, '午夜歌手');

    const first = await repo.assignAnonCode({ userId, bottleId, code });
    const second = await repo.assignAnonCode({ userId, bottleId, code: '另一个词#999' });

    expect(first).toEqual({ ok: true, code, created: false });
    expect(second).toEqual({ ok: true, code, created: false });
    expect(
      await countRows(`select count(*)::text as n from anon_codes where user_id = $1`, [userId]),
    ).toBe(1);
  });

  it('同一用户在不同瓶子必须是不同代号（不可跨瓶关联）', async () => {
    const userId = await insertUser(db);
    const a = await insertBottle(db);
    const b = await insertBottle(db);

    const codeA = await assignCodeWithRetry(userId, a.bottleId, '潮汐信使');
    const codeB = await assignCodeWithRetry(userId, b.bottleId, '深海旅人');

    const codes = await repo.listAnonCodes(userId);
    expect(codes.map((row) => row.code).sort()).toEqual([codeA, codeB].sort());
    expect(new Set(codes.map((row) => row.code)).size).toBe(2);
  });

  it('同一瓶子里不同用户必须拿到不同代号', async () => {
    const { bottleId } = await insertBottle(db);
    const userA = await insertUser(db);
    const userB = await insertUser(db);

    const codeA = await assignCodeWithRetry(userA, bottleId, '月下渔火');
    const codeB = await assignCodeWithRetry(userB, bottleId, '暗流合声');

    expect((await repo.listCodesInBottle(bottleId)).sort()).toEqual([codeA, codeB].sort());
  });

  it('全局代号冲突（别的用户已占用同一代号）→ ANON_CODE_TAKEN，供上层换一个再试', async () => {
    const first = await insertBottle(db);
    const second = await insertBottle(db);
    const code = await assignCodeWithRetry(first.initiatorId, first.bottleId, '拾贝少年');

    const taken = await repo.assignAnonCode({
      userId: second.initiatorId,
      bottleId: second.bottleId,
      code,
    });

    expect(taken).toEqual({ ok: false, code: 'ANON_CODE_TAKEN' });
  });

  it('listCodesForUser 给出该用户已持有的全部代号（生成层去重用）', async () => {
    const userId = await insertUser(db);
    const { bottleId } = await insertBottle(db);
    const code = await assignCodeWithRetry(userId, bottleId, '灯塔守望');

    expect(await repo.listCodesForUser(userId)).toContain(code);
  });
});
