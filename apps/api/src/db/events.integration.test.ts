/**
 * events 表的三条硬约束（captain 裁决 2026-09-23）：
 * 1. seq=1 必须是 BOTTLE_CREATED（DB CHECK 静态强制 + 应用层早失败）；
 * 2. 并发追加时 seq 的生成方式必须显式且有测试；
 * 3. 段号越界必须被写入侧拒绝（§17.5），不靠内核兜底掩盖脏数据。
 * 另有一条「事件流可被内核 replayBottle 忠实重放」的端到端证明。
 */
import { randomUUID } from 'node:crypto';
import {
  chooseResolution,
  createBottle,
  createDomainContext,
  createManualClock,
  createSequentialIds,
  drawBottle,
  recordSegment,
  replayBottle,
  type CommandOutcome,
  type DomainEvent,
} from '@music-drift/shared/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from './client.js';
import { appendDomainEvent, appendEvent, readDomainEvents } from './events.js';
import { insertBottle, insertUser } from './test-helpers.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';

describe('events：写入约束与并发 seq', () => {
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

  it('并发追加同一瓶子的多条事件：seq 连续、无空洞、无重复', async () => {
    const { bottleId, initiatorId } = await insertBottle(db);
    await appendEvent(db, {
      bottleId,
      type: 'BOTTLE_CREATED',
      actorId: initiatorId,
      payload: { songId: 'ignored', initiatorId, totalSegments: 4 },
      occurredAt: new Date(),
    });

    const concurrent = await Promise.all(
      Array.from({ length: 8 }, (_unused, index) =>
        appendEvent(db, {
          bottleId,
          type: 'BOTTLE_CAST_TO_RIVER',
          actorId: initiatorId,
          payload: { n: index },
          occurredAt: new Date(),
        }),
      ),
    );

    const seqs = concurrent.map((row) => row.seq).sort((left, right) => left - right);
    expect(seqs).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(new Set(seqs).size).toBe(seqs.length);

    const rows = await db.query<{ seq: number }>(
      `select seq from events where bottle_id = $1 order by seq`,
      [bottleId],
    );
    expect(rows.map((row) => row.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('seq=1 必须是 BOTTLE_CREATED：应用层早失败，DB CHECK 兜底', async () => {
    const { bottleId, initiatorId } = await insertBottle(db);

    await expect(
      appendEvent(db, {
        bottleId,
        type: 'BOTTLE_CAST_TO_RIVER',
        actorId: initiatorId,
        payload: {},
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(/首条事件必须是 BOTTLE_CREATED/);

    // 绕过应用层直接塞：DB 的 CHECK 必须拦住（不能只靠仓储层自觉）
    await expect(
      db.query(
        `insert into events (id, bottle_id, seq, type, actor_id, payload, occurred_at)
         values ($1, $2, 1, 'BOTTLE_CAST_TO_RIVER', $3, '{}'::jsonb, now())`,
        [randomUUID(), bottleId, 'SYSTEM'],
      ),
    ).rejects.toThrow(/events_first_event_check|violates check constraint/i);
  });

  it('同一瓶子重复 seq 被唯一约束拒绝', async () => {
    const { bottleId, initiatorId } = await insertBottle(db);
    await appendEvent(db, {
      bottleId,
      type: 'BOTTLE_CREATED',
      actorId: initiatorId,
      payload: { songId: 's', initiatorId, totalSegments: 4 },
      occurredAt: new Date(),
    });

    await expect(
      db.query(
        `insert into events (id, bottle_id, seq, type, actor_id, payload, occurred_at)
         values ($1, $2, 1, 'BOTTLE_CREATED', $3, '{}'::jsonb, now())`,
        [randomUUID(), bottleId, initiatorId],
      ),
    ).rejects.toThrow(/events_bottle_seq_uniq|duplicate key/);
  });

  it('§17.5：段号越界的事件必须被拒绝，且不写入任何行', async () => {
    const { bottleId, initiatorId } = await insertBottle(db, { totalSegments: 4 });
    await appendEvent(db, {
      bottleId,
      type: 'BOTTLE_CREATED',
      actorId: initiatorId,
      payload: { songId: 's', initiatorId, totalSegments: 4 },
      occurredAt: new Date(),
    });

    await expect(
      appendEvent(db, {
        bottleId,
        type: 'SEGMENT_RECORDED',
        actorId: initiatorId,
        payload: { segmentId: 'seg-x', index: 5, note: null },
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(/段号越界/);

    const rows = await db.query<{ count: string }>(
      `select count(*)::text as count from events where bottle_id = $1`,
      [bottleId],
    );
    expect(rows[0]?.count).toBe('1'); // 只有 BOTTLE_CREATED

    // 合法段号照常写入
    const ok = await appendEvent(db, {
      bottleId,
      type: 'SEGMENT_RECORDED',
      actorId: initiatorId,
      payload: { segmentId: 'seg-4', index: 4, note: null },
      occurredAt: new Date(),
    });
    expect(ok.seq).toBe(2);
  });

  it('端到端：内核产出的事件写入 DB 后，读回来能被 replayBottle 忠实重放', async () => {
    const ctx = createDomainContext({
      clock: createManualClock(1_700_000_000_000),
      ids: createSequentialIds('seg'),
    });
    const { bottleId, songId, initiatorId } = await insertBottle(db, { totalSegments: 4 });
    const singer = await insertUser(db);

    const collected: DomainEvent[] = [];
    const step = (outcome: CommandOutcome): void => {
      collected.push(...outcome.events);
    };
    const created = createBottle({ bottleId, songId, initiatorId, totalSegments: 4 }, ctx);
    step(created);
    const recorded = recordSegment(created.state, { userId: initiatorId, note: '第一段' }, ctx);
    step(recorded);
    const cast = chooseResolution(
      recorded.state,
      { userId: initiatorId, resolution: 'RIVER' },
      ctx,
    );
    step(cast);
    const drawn = drawBottle(cast.state, { userId: singer }, ctx);
    step(drawn);
    const second = recordSegment(drawn.state, { userId: singer, note: null }, ctx);
    step(second);

    for (const event of collected) {
      await appendDomainEvent(db, event);
    }

    const rows = await readDomainEvents(db, bottleId);
    expect(rows).toHaveLength(collected.length);
    expect(replayBottle(rows)).toEqual(second.state);
  });
});
