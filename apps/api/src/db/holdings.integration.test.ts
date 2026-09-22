/**
 * holdings 并发抢占的 DB 级证明（t5 验收：两个并发接唱只有一个成功）。
 *
 * 纪律：本文件在 schema/迁移/holdings 实现之前先写（红），再落实现（绿）。
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from './client';
import {
  activeHoldingOf,
  applyDomainEventToHoldings,
  claimHolding,
  releaseHolding,
} from './holdings';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';

/** 直接建一个瓶子行（本测试只关心 holdings 的并发行为，不跑完整领域流程）。 */
async function insertBottle(db: Db, totalSegments = 4): Promise<string> {
  const bottleId = randomUUID();
  const songId = randomUUID();
  const userId = randomUUID();
  await db.query(
    `insert into songs (id, title, total_segments, licensed_source) values ($1, $2, $3, $4)`,
    [songId, `song-${songId.slice(0, 8)}`, totalSegments, 'test'],
  );
  await db.query(`insert into users (id, handle, email, password_hash) values ($1, $2, $3, $4)`, [
    userId,
    `owner-${userId.slice(0, 8)}`,
    `${userId.slice(0, 8)}@test.local`,
    'x',
  ]);
  await db.query(
    `insert into bottles (id, song_id, initiator_id, status, total_segments, revision, current_caster_id)
     values ($1, $2, $3, 'IN_RIVER', $4, 1, $5)`,
    [bottleId, songId, userId, totalSegments, userId],
  );
  return bottleId;
}

async function insertUser(db: Db): Promise<string> {
  const userId = randomUUID();
  await db.query(`insert into users (id, handle, email, password_hash) values ($1, $2, $3, $4)`, [
    userId,
    `u-${userId.slice(0, 8)}`,
    `${userId.slice(0, 8)}@test.local`,
    'x',
  ]);
  return userId;
}

describe('holdings：并发抢占只有第一个生效', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createDb(DATABASE_URL);
  });

  afterAll(async () => {
    // 客户端可能压根没建起来（例如缺 DATABASE_URL）：teardown 不应再抛次生错误，
    // 否则真正的首因（连接配置问题）会被 TypeError 掩盖。
    if (db !== undefined) {
      await db.close();
    }
  });

  it('两个并发 claim 同一瓶子：恰好一个成功，另一个被拒且不留第二行', async () => {
    const bottleId = await insertBottle(db);
    const [first, second] = await Promise.all([
      claimHolding(db, {
        bottleId,
        holderId: await insertUser(db),
        parentId: null,
        origin: 'DRAW',
        acquiredAt: new Date(),
      }),
      claimHolding(db, {
        bottleId,
        holderId: await insertUser(db),
        parentId: null,
        origin: 'DRAW',
        acquiredAt: new Date(),
      }),
    ]);

    const results = [first, second];
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);

    const loser = results.find((result) => !result.ok);
    expect(loser?.ok === false ? loser.code : null).toBe('HOLDING_ALREADY_TAKEN');

    const active = await activeHoldingOf(db, bottleId);
    expect(active).not.toBe(null);
    expect(active?.releasedAt).toBe(null);

    const rows = await db.query<{ count: string }>(
      `select count(*)::text as count from holdings where bottle_id = $1 and released_at is null`,
      [bottleId],
    );
    expect(rows[0]?.count).toBe('1');
  });

  it('并发抢占 N 次（含同一用户重复点击）：仍然只有一行有效持有', async () => {
    const bottleId = await insertBottle(db);
    const sameUser = await insertUser(db);
    const claims = await Promise.all(
      Array.from({ length: 6 }, () =>
        claimHolding(db, {
          bottleId,
          holderId: sameUser,
          parentId: null,
          origin: 'DRAW',
          acquiredAt: new Date(),
        }),
      ),
    );

    expect(claims.filter((claim) => claim.ok)).toHaveLength(1);
    const rows = await db.query<{ count: string }>(
      `select count(*)::text as count from holdings where bottle_id = $1 and released_at is null`,
      [bottleId],
    );
    expect(rows[0]?.count).toBe('1');
  });

  it('释放后下一个抢占者才能成功（比较后释放：非持有者释放无效）', async () => {
    const bottleId = await insertBottle(db);
    const holder = await insertUser(db);
    const stranger = await insertUser(db);
    expect(
      (
        await claimHolding(db, {
          bottleId,
          holderId: holder,
          parentId: null,
          origin: 'DRAW',
          acquiredAt: new Date(),
        })
      ).ok,
    ).toBe(true);

    expect(await releaseHolding(db, { bottleId, holderId: stranger, releasedAt: new Date() })).toBe(
      0,
    );
    expect(await activeHoldingOf(db, bottleId)).not.toBe(null);

    expect(await releaseHolding(db, { bottleId, holderId: holder, releasedAt: new Date() })).toBe(
      1,
    );
    expect(await activeHoldingOf(db, bottleId)).toBe(null);

    const next = await claimHolding(db, {
      bottleId,
      holderId: stranger,
      parentId: holder,
      origin: 'RETURN',
      acquiredAt: new Date(),
    });
    expect(next.ok).toBe(true);
  });

  it('斩浪事件（BOTTLE_GAP_OPENED）必须释放 holding，否则补位者会被 409 挡住', async () => {
    const bottleId = await insertBottle(db);
    const cutAuthor = await insertUser(db);
    const filler = await insertUser(db);
    expect(
      (
        await claimHolding(db, {
          bottleId,
          holderId: cutAuthor,
          parentId: null,
          origin: 'DRAW',
          acquiredAt: new Date(),
        })
      ).ok,
    ).toBe(true);

    await applyDomainEventToHoldings(db, {
      type: 'BOTTLE_GAP_OPENED',
      bottleId,
      at: new Date(),
      actorId: 'SYSTEM',
      gapIndex: 2,
    });

    expect(await activeHoldingOf(db, bottleId)).toBe(null);
    const claim = await claimHolding(db, {
      bottleId,
      holderId: filler,
      parentId: null,
      origin: 'DRAW',
      acquiredAt: new Date(),
    });
    expect(claim.ok).toBe(true);
  });

  it('部分唯一索引本身拒绝第二条有效 holding（不依赖应用层自觉）', async () => {
    const bottleId = await insertBottle(db);
    const first = await insertUser(db);
    const second = await insertUser(db);
    await claimHolding(db, {
      bottleId,
      holderId: first,
      parentId: null,
      origin: 'DRAW',
      acquiredAt: new Date(),
    });

    await expect(
      db.query(
        `insert into holdings (id, bottle_id, holder_id, origin, acquired_at) values ($1, $2, $3, 'DRAW', now())`,
        [randomUUID(), bottleId, second],
      ),
    ).rejects.toThrow(/holdings_active_bottle_uniq|duplicate key/);
  });
});

describe('holdings：带谓词的冲突目标（不吞意外冲突）', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createDb(process.env['DATABASE_URL'] ?? '');
  });

  afterAll(async () => {
    // 客户端可能压根没建起来（例如缺 DATABASE_URL）：teardown 不应再抛次生错误，
    // 否则真正的首因（连接配置问题）会被 TypeError 掩盖。
    if (db !== undefined) {
      await db.close();
    }
  });

  it('非抢占类唯一冲突（主键重复）必须抛错，而不是静默返回 HOLDING_ALREADY_TAKEN', async () => {
    const firstBottle = await insertBottle(db);
    const secondBottle = await insertBottle(db);
    const holder = await insertUser(db);
    const fixedHoldingId = randomUUID();

    const first = await claimHolding(db, {
      bottleId: firstBottle,
      holderId: holder,
      parentId: null,
      origin: 'DRAW',
      acquiredAt: new Date(),
      holdingId: fixedHoldingId,
    });
    expect(first.ok).toBe(true);

    // 同一个 holdingId 插到**另一个**瓶子：主键冲突，与「被抢走」无关 → 必须抛错暴露数据写错。
    await expect(
      claimHolding(db, {
        bottleId: secondBottle,
        holderId: holder,
        parentId: null,
        origin: 'DRAW',
        acquiredAt: new Date(),
        holdingId: fixedHoldingId,
      }),
    ).rejects.toThrow(/holdings_pkey|duplicate key/);
  });

  it('外键违规同样必须抛错（不被冲突处理吞掉）', async () => {
    const bottleId = await insertBottle(db);

    await expect(
      claimHolding(db, {
        bottleId,
        holderId: randomUUID(), // 不存在的用户
        parentId: null,
        origin: 'DRAW',
        acquiredAt: new Date(),
      }),
    ).rejects.toThrow(/foreign key|violates/i);
  });
});
