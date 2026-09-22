/**
 * 仓储集成测试（t9）：内核命令 → 事件流 → 投影 → 重放，四条链路必须一致。
 * 同时把「并发捞取只有一个赢家」在**仓储层**再钉一遍（DB 锁 + 内核状态机）。
 */
import {
  castVote,
  chooseResolution,
  createManualClock,
  gaps,
  isComplete,
  recordSegment,
  seaZoneOf,
} from '@music-drift/shared/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { insertSong, insertUser } from '../db/test-helpers.js';
import { createBottleStore, type BottleStore } from './bottles.js';
import { createRequestContext } from './context.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
const HOUR = 3_600_000;

describe('bottleStore：内核命令 ↔ 事件流 ↔ 投影 ↔ 重放', () => {
  let db: Db;
  let store: BottleStore;

  // 用生产同款入口：注入时钟 + UUID id 生成器（id 会直接进 uuid 列）。
  function ctxAt(startMs: number) {
    return createRequestContext(createManualClock(startMs));
  }

  beforeAll(async () => {
    db = await createDb(DATABASE_URL);
    store = createBottleStore(db);
  });

  afterAll(async () => {
    if (db !== undefined) {
      await db.close();
    }
  });

  it('createBottle：写出 bottles 行 + 首条 BOTTLE_CREATED（seq=1），重放得到 DRAFT', async () => {
    const songId = await insertSong(db, 4);
    const initiatorId = await insertUser(db);
    const bottleId = crypto.randomUUID();

    const row = await store.createBottle({ bottleId, songId, initiatorId, ctx: ctxAt(0) });

    expect(row?.status).toBe('DRAFT');
    expect(row?.totalSegments).toBe(4);
    const events = await db.query<{ seq: number; type: string }>(
      `select seq, type from events where bottle_id = $1 order by seq`,
      [bottleId],
    );
    expect(events).toEqual([{ seq: 1, type: 'BOTTLE_CREATED' }]);
    const state = await store.loadState(bottleId);
    expect(state?.status).toBe('DRAFT');
    expect(state?.totalSegments).toBe(4);
  });

  it('recordSegment：按最小缺口段号投影，revision 与重放一致', async () => {
    const songId = await insertSong(db, 4);
    const initiatorId = await insertUser(db);
    const bottleId = crypto.randomUUID();
    const ctx = ctxAt(HOUR);
    await store.createBottle({ bottleId, songId, initiatorId, ctx });
    const state = await store.loadState(bottleId);

    const outcome = recordSegment(state!, { userId: initiatorId, note: '第一段' }, ctx);
    await store.applyOutcome(bottleId, outcome, { segment: { durationMs: 20_000, audioMime: 'audio/webm' } });

    const segments = await store.listBottleSegments(bottleId);
    expect(segments.map((segment) => segment.index + ':' + segment.ownerId)).toEqual(['1:' + initiatorId]);
    expect(segments[0]?.note).toBe('第一段');
    expect(segments[0]?.audioMime).toBe('audio/webm');

    expect((await store.findBottle(bottleId))?.revision).toBe(1);
    expect((await store.loadState(bottleId))?.segments.map((segment) => segment.index)).toEqual([1]);
  });

  it('投河 → 捞取 → 接唱：状态、持有者锁、父链三者一致', async () => {
    const songId = await insertSong(db, 4);
    const initiatorId = await insertUser(db);
    const singerId = await insertUser(db);
    const bottleId = crypto.randomUUID();
    const ctx = ctxAt(2 * HOUR);
    await store.createBottle({ bottleId, songId, initiatorId, ctx });

    let state = (await store.loadState(bottleId))!;
    await store.applyOutcome(bottleId, recordSegment(state, { userId: initiatorId, note: null }, ctx));
    state = (await store.loadState(bottleId))!;
    await store.applyOutcome(bottleId, chooseResolution(state, { userId: initiatorId, resolution: 'RIVER' }, ctx));

    expect((await store.findBottle(bottleId))?.status).toBe('IN_RIVER');
    expect((await store.findBottle(bottleId))?.currentCasterId).toBe(initiatorId);

    const drawn = await store.drawFromRiver({ bottleId, userId: singerId, ctx });

    expect(drawn?.ok).toBe(true);
    expect((await store.findBottle(bottleId))?.status).toBe('HELD');
    expect((await store.findBottle(bottleId))?.currentHolderId).toBe(singerId);
    expect(await store.activeHolding(bottleId)).toEqual({
      holderId: singerId,
      parentId: initiatorId,
      origin: 'DRAW',
    });
    expect((await store.loadState(bottleId))!.parents[singerId]).toBe(initiatorId);
  });

  it('并发捞取同一瓶子：恰好一个成功，落败者零副作用', async () => {
    const songId = await insertSong(db, 4);
    const initiatorId = await insertUser(db);
    const first = await insertUser(db);
    const second = await insertUser(db);
    const bottleId = crypto.randomUUID();
    const ctx = ctxAt(3 * HOUR);
    await store.createBottle({ bottleId, songId, initiatorId, ctx });
    let state = (await store.loadState(bottleId))!;
    await store.applyOutcome(bottleId, recordSegment(state, { userId: initiatorId, note: null }, ctx));
    state = (await store.loadState(bottleId))!;
    await store.applyOutcome(bottleId, chooseResolution(state, { userId: initiatorId, resolution: 'RIVER' }, ctx));

    const results = await Promise.all([
      store.drawFromRiver({ bottleId, userId: first, ctx }),
      store.drawFromRiver({ bottleId, userId: second, ctx }),
    ]);

    expect(results.filter((result) => result?.ok === true)).toHaveLength(1);
    const loser = results.find((result) => result?.ok === false);
    expect(loser?.violations.map((violation) => violation.code)).toEqual(['HOLDING_ALREADY_TAKEN']);

    const events = await db.query<{ type: string }>(`select type from events where bottle_id = $1`, [bottleId]);
    expect(events.filter((event) => event.type === 'BOTTLE_DRAWN')).toHaveLength(1);
    expect((await store.activeHolding(bottleId))?.holderId).toBe((await store.findBottle(bottleId))?.currentHolderId);
  });

  it('入海：bottles 行与重放状态一致，完整作品进公海已完成区', async () => {
    const songId = await insertSong(db, 2);
    const initiatorId = await insertUser(db);
    const singerId = await insertUser(db);
    const bottleId = crypto.randomUUID();
    const ctx = ctxAt(4 * HOUR);
    await store.createBottle({ bottleId, songId, initiatorId, ctx });

    let state = (await store.loadState(bottleId))!;
    await store.applyOutcome(bottleId, recordSegment(state, { userId: initiatorId, note: null }, ctx));
    state = (await store.loadState(bottleId))!;
    await store.applyOutcome(bottleId, chooseResolution(state, { userId: initiatorId, resolution: 'RIVER' }, ctx));
    await store.drawFromRiver({ bottleId, userId: singerId, ctx });
    state = (await store.loadState(bottleId))!;
    await store.applyOutcome(bottleId, recordSegment(state, { userId: singerId, note: null }, ctx));
    state = (await store.loadState(bottleId))!;
    expect(isComplete(state)).toBe(true);
    await store.applyOutcome(bottleId, chooseResolution(state, { userId: singerId, resolution: 'SEA' }, ctx));

    const row = await store.findBottle(bottleId);
    const replayed = (await store.loadState(bottleId))!;
    expect(row?.status).toBe('SEA');
    expect(row?.status).toBe(replayed.status);
    expect(seaZoneOf(replayed)).toBe('COMPLETED');
    const completed = await store.listSeaBottles({ zone: 'COMPLETED', limit: 50 });
    expect(completed.some((candidate) => candidate.id === bottleId)).toBe(true);
    const incomplete = await store.listSeaBottles({ zone: 'INCOMPLETE', limit: 50 });
    expect(incomplete.some((candidate) => candidate.id === bottleId)).toBe(false);
  });

  it('斩浪：留下缺口 + 释放持有者锁 + 锚被斩时作品判定已损坏（用户终裁）', async () => {
    const songId = await insertSong(db, 2);
    const initiatorId = await insertUser(db);
    const singerId = await insertUser(db);
    const bottleId = crypto.randomUUID();
    const ctx = ctxAt(5 * HOUR);
    await store.createBottle({ bottleId, songId, initiatorId, ctx });

    let state = (await store.loadState(bottleId))!;
    await store.applyOutcome(bottleId, recordSegment(state, { userId: initiatorId, note: null }, ctx));
    state = (await store.loadState(bottleId))!;
    await store.applyOutcome(bottleId, chooseResolution(state, { userId: initiatorId, resolution: 'RIVER' }, ctx));
    await store.drawFromRiver({ bottleId, userId: singerId, ctx });
    state = (await store.loadState(bottleId))!;
    await store.applyOutcome(bottleId, recordSegment(state, { userId: singerId, note: null }, ctx));
    state = (await store.loadState(bottleId))!;
    await store.applyOutcome(bottleId, chooseResolution(state, { userId: singerId, resolution: 'RIVER' }, ctx));

    state = (await store.loadState(bottleId))!;
    // 不变式：内核事件里的段 id 必须就是投影行的 id（否则投票外键/音频地址/重放会全部对不上）
    const projected = await store.listBottleSegments(bottleId);
    expect(projected.map((segment) => segment.index)).toEqual([1, 2]);
    expect(projected.map((segment) => segment.id)).toEqual(state.segments.map((segment) => segment.id));
    const firstSegmentId = state.segments[0]!.id;
    for (let round = 0; round < 10; round += 1) {
      const voterId = await insertUser(db);
      const outcome = castVote(
        (await store.loadState(bottleId))!,
        { userId: voterId, segmentId: firstSegmentId, value: 'DISLIKE', listenedRatio: 1 },
        ctx,
      );
      expect(outcome.ok).toBe(true);
      await store.applyOutcome(bottleId, outcome, { vote: { listenedRatio: 1 } });
    }

    const row = await store.findBottle(bottleId);
    expect(row?.status).toBe('DAMAGED');
    expect(await store.activeHolding(bottleId)).toBe(null);
    const replayed = (await store.loadState(bottleId))!;
    expect(gaps(replayed)).toEqual([1]);
    expect(replayed.status).toBe('DAMAGED');
  });

  it('loadState 对不存在的瓶子返回 null（路由据此给 404）', async () => {
    expect(await store.loadState(crypto.randomUUID())).toBe(null);
  });
});
