/**
 * 匿名代号分配服务（集成测试）：生成层与 DB 层合起来才算完整 ——
 * 「同瓶不同码」「全局唯一」这两条只有把随机源、用户已持有代号、DB 唯一索引三者串起来才能证明。
 *
 * ⚠️ 测试写法纪律（踩过）：`anon_codes.code` 是**全局唯一**且多个测试文件**并行共享同一个测试库**，
 * 因此断言里**不允许出现硬编码的固定代号**（会与别的文件抢同一个 code，产生假红）。
 * 这里一律：先真实分配拿到实际代号，再把随机源"打进"该代号来构造冲突，断言相对关系（≠ / 格式 / 计数）。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RandomSource } from '@music-drift/shared/domain';
import { createDb, type Db } from '../db/client.js';
import { insertBottle, insertUser } from '../db/test-helpers.js';
import { ANON_CODE_TITLES, AnonCodeExhaustedError } from './anonCode.js';
import { createAnonCodeService, type AnonCodeService } from './anonCodeService.js';
import { createAuthRepository, type AuthRepository } from './repository.js';

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgres://music_drift:music_drift_dev@localhost:5433/music_drift_test';

const CODE_PATTERN = /^(?<title>[^#\s]+)#(?<serial>\d{3})$/;

/** 把「期望生成的代号」翻译回随机源取值（+0.5 落在桶中央，避免浮点边界）。 */
function valueForTitle(title: string): number {
  const index = ANON_CODE_TITLES.indexOf(title as (typeof ANON_CODE_TITLES)[number]);
  if (index < 0) {
    throw new Error(`代号词表里没有「${title}」`);
  }
  return (index + 0.5) / ANON_CODE_TITLES.length;
}

function valueForSerial(serial: number): number {
  return (serial - 0.5) / 999;
}

/** 前 N 个候选按给定取值生成，之后回落到真实随机源（用于"先撞一次再成功"的路径）。 */
function riggedThenRandom(forced: number[], fallback: RandomSource): RandomSource {
  let call = 0;
  return () => {
    if (call < forced.length) {
      const value = forced[call] ?? 0;
      call += 1;
      return value;
    }
    return fallback();
  };
}

function realRandom(): RandomSource {
  return () => Math.random();
}

let db: Db;
let repo: AuthRepository;

beforeAll(async () => {
  db = await createDb(DATABASE_URL);
  repo = createAuthRepository(db);
});

afterAll(async () => {
  await db.close();
});

describe('createAnonCodeService', () => {
  it('首次分配生成「词#三位数字」格式的代号并落库', async () => {
    const service = createAnonCodeService({ repo });
    const userId = await insertUser(db);
    const { bottleId } = await insertBottle(db);

    const assigned = await service.assign({ userId, bottleId });

    expect(assigned.created).toBe(true);
    expect(assigned.code).toMatch(/^[^#\s]+#\d{3}$/);
    expect(await repo.listCodesForUser(userId)).toEqual([assigned.code]);
  });

  it('同 (用户, 瓶子) 重复分配复用同一代号（幂等，不产生第二行）', async () => {
    const service = createAnonCodeService({ repo });
    const userId = await insertUser(db);
    const { bottleId } = await insertBottle(db);

    const first = await service.assign({ userId, bottleId });
    const second = await service.assign({ userId, bottleId });

    expect(second).toEqual({ code: first.code, created: false });
    expect((await repo.listAnonCodes(userId)).length).toBe(1);
  });

  it('同一用户的不同瓶子拿到不同代号（不可跨瓶关联的判定）', async () => {
    const service = createAnonCodeService({ repo });
    const userId = await insertUser(db);
    const first = await insertBottle(db);
    const second = await insertBottle(db);

    const a = await service.assign({ userId, bottleId: first.bottleId });
    const b = await service.assign({ userId, bottleId: second.bottleId });

    expect(a.code).not.toBe(b.code);
  });

  it('候选落在「本用户已持有」的代号上时换一个（同瓶不同码的关键路径）', async () => {
    const userId = await insertUser(db);
    const first = await insertBottle(db);
    const second = await insertBottle(db);

    const service = createAnonCodeService({ repo });
    const held = await service.assign({ userId, bottleId: first.bottleId });
    const parsed = CODE_PATTERN.exec(held.code);
    if (parsed?.groups === undefined) {
      throw new Error(`代号格式异常：${held.code}`);
    }

    // 第一个候选强行等于已持有代号（必须被跳过），之后回落到真随机。
    const forced: AnonCodeService = createAnonCodeService({
      repo,
      random: riggedThenRandom(
        [
          valueForTitle(parsed.groups['title'] ?? ''),
          valueForSerial(Number(parsed.groups['serial'])),
        ],
        realRandom(),
      ),
    });

    const assigned = await forced.assign({ userId, bottleId: second.bottleId });

    expect(assigned.code).not.toBe(held.code);
    expect(assigned.code).toMatch(/^[^#\s]+#\d{3}$/);
    const codes = await repo.listCodesForUser(userId);
    expect(new Set(codes).size).toBe(2);
  });

  it('候选被别的用户全局占用（DB 唯一索引兜底）时换一个并成功', async () => {
    const otherUser = await insertUser(db);
    const otherBottle = await insertBottle(db);
    const other = await createAnonCodeService({ repo }).assign({
      userId: otherUser,
      bottleId: otherBottle.bottleId,
    });
    const parsed = CODE_PATTERN.exec(other.code);
    if (parsed?.groups === undefined) {
      throw new Error(`代号格式异常：${other.code}`);
    }

    const userId = await insertUser(db);
    const { bottleId } = await insertBottle(db);
    const service = createAnonCodeService({
      repo,
      random: riggedThenRandom(
        [
          valueForTitle(parsed.groups['title'] ?? ''),
          valueForSerial(Number(parsed.groups['serial'])),
        ],
        realRandom(),
      ),
    });

    const assigned = await service.assign({ userId, bottleId });

    expect(assigned.code).not.toBe(other.code);
    expect(assigned.code).toMatch(/^[^#\s]+#\d{3}$/);
  });

  it('候选全部撞车则抛 AnonCodeExhaustedError（不静默复用别人的代号）', async () => {
    // 随机源恒为 0 → 候选恒为「午夜歌手#001」；先确保该代号被占用（谁占用都算），再验证重试耗尽。
    const otherUser = await insertUser(db);
    const otherBottle = await insertBottle(db);
    const seed = await repo.assignAnonCode({
      userId: otherUser,
      bottleId: otherBottle.bottleId,
      code: `${ANON_CODE_TITLES[0]}#001`,
    });
    // 已被占用（本测试写入）或早已被别人占用 —— 两种都满足前提。
    expect(seed.ok || seed.code === 'ANON_CODE_TAKEN').toBe(true);

    const service = createAnonCodeService({ repo, random: () => 0, maxAttempts: 3 });
    const userId = await insertUser(db);
    const { bottleId } = await insertBottle(db);

    await expect(service.assign({ userId, bottleId })).rejects.toThrow(AnonCodeExhaustedError);
  });
});
