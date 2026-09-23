/**
 * 公海族 API（t9，`docs/api.md` §2.5）：分区列表、详情、指定接唱。
 *
 * 两条纪律在这里被钉住：
 * 1. **响应必须过契约**（用 `BottleSummarySchema.parse` 直接校验）—— 早先 `toBottleSummary` 把
 *    `songTitle` 写死成空串，公海列表于是返回 `songTitle: ''`，而契约是 `min(1)`：类型层看不出来、
 *    内核测试也照不到，只有「拿契约校验真响应」才会红。
 * 2. **分区口径来自内核**（`isComplete` / `seaZoneOf`），路由不重算；默认只看已完成区（CONTEXT §6.1）。
 */
import { createSystemClock } from '@music-drift/shared/domain';
import { BottleSummarySchema } from '@music-drift/shared/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createDb, type Db } from '../db/client.js';
import { runSeed } from '../db/seed.js';
import { insertSong } from '../db/test-helpers.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
const PASSWORD = 'Drift-Bottle-2026';
const CLOCK = createSystemClock();

let seq = 0;
function uniqueHandle(prefix: string): string {
  seq += 1;
  return prefix + Date.now().toString().slice(-5) + seq + Math.random().toString(36).slice(2, 6);
}

function webmPayload(size = 2048): Buffer {
  const magic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  return Buffer.concat([magic, Buffer.alloc(size - magic.length, 0x42)]);
}

let db: Db;
let app: FastifyInstance;

async function register(prefix: string): Promise<{ cookie: string; userId: string }> {
  const handle = uniqueHandle(prefix);
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { handle, email: handle + '@example.com', password: PASSWORD },
  });
  expect(response.statusCode).toBe(201);
  const cookie = response.cookies.find((entry) => entry.name === 'mdb_session');
  const user = (response.json() as { user: { id: string } }).user;
  return { cookie: cookie === undefined ? '' : cookie.name + '=' + cookie.value, userId: user.id };
}

async function createBottle(cookie: string, totalSegments = 4): Promise<string> {
  const songId = await insertSong(db, totalSegments);
  const created = await app.inject({
    method: 'POST',
    url: '/api/bottles',
    payload: { songId },
    headers: { cookie },
  });
  expect(created.statusCode).toBe(201);
  return (created.json() as { id: string }).id;
}

async function sing(cookie: string, bottleId: string): Promise<void> {
  const recorded = await app.inject({
    method: 'POST',
    url: '/api/bottles/' + bottleId + '/segments',
    payload: webmPayload(),
    headers: { cookie, 'content-type': 'audio/webm', 'x-audio-duration-ms': '20000' },
  });
  expect(recorded.statusCode).toBe(201);
}

async function resolve(
  cookie: string,
  bottleId: string,
  resolution: 'RIVER' | 'RETURN' | 'SEA',
): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/bottles/' + bottleId + '/resolution',
    payload: { resolution },
    headers: { cookie },
  });
  expect(response.statusCode).toBe(200);
}

async function take(cookie: string, bottleId: string): Promise<number> {
  return (
    await app.inject({
      method: 'POST',
      url: '/api/sea/' + bottleId + '/targeted-segment',
      headers: { cookie },
    })
  ).statusCode;
}

/** 未完成品：1 段 → 入海（未完成区，缺口 2,3,4）。 */
async function seedIncompleteSeaBottle(cookie: string): Promise<string> {
  const bottleId = await createBottle(cookie);
  await sing(cookie, bottleId);
  await resolve(cookie, bottleId, 'SEA');
  return bottleId;
}

beforeAll(async () => {
  db = await createDb(DATABASE_URL);
  app = buildApp({ db, clock: CLOCK });
  await app.ready();
  await runSeed(db);
});

afterAll(async () => {
  await app.close();
  if (db !== undefined) {
    await db.close();
  }
});

describe('公海列表（CONTEXT §6.1）：默认只看已完成区，未完成须显式查', () => {
  let initiatorCookie = '';
  let completeId = '';
  let incompleteId = '';

  beforeAll(async () => {
    initiatorCookie = (await register('si')).cookie;
    incompleteId = await seedIncompleteSeaBottle(initiatorCookie);

    // 完成品：4 段全部录满，末段作者直接入海（不进回传链也算「已完整」→ 已完成区）
    completeId = await createBottle(initiatorCookie);
    await sing(initiatorCookie, completeId); // 第 1 段
    await resolve(initiatorCookie, completeId, 'SEA');
    for (let index = 0; index < 3; index += 1) {
      const singer = (await register('ss')).cookie;
      expect(await take(singer, completeId)).toBe(200);
      await sing(singer, completeId);
      await resolve(singer, completeId, 'SEA');
    }
  });

  it('默认列表：只含已完成作品，且每一项都能过契约（曲名非空、分区 COMPLETED）', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/sea' });
    expect(response.statusCode).toBe(200);
    const items = (response.json() as { items: unknown[] }).items.map((item) =>
      BottleSummarySchema.parse(item),
    );

    expect(items.map((item) => item.id)).toContain(completeId);
    expect(items.map((item) => item.id)).not.toContain(incompleteId); // 未完成品默认不出现
    for (const item of items) {
      expect(item.isComplete).toBe(true);
      expect(item.missingSegmentIndexes).toEqual([]);
      expect(item.songTitle.length).toBeGreaterThan(0); // 契约 min(1)：空串会是违规响应
    }
  });

  it('zone=INCOMPLETE：未完成品在列；缺口与内核一致（第 1 段已录 → 缺 2,3,4）', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/sea?zone=INCOMPLETE' });
    expect(response.statusCode).toBe(200);
    const items = (response.json() as { items: unknown[] }).items.map((item) =>
      BottleSummarySchema.parse(item),
    );
    const mine = items.find((item) => item.id === incompleteId);

    expect(mine).toBeDefined();
    expect(mine?.isComplete).toBe(false);
    expect(mine?.seaZone).toBe('INCOMPLETE');
    expect(mine?.missingSegmentIndexes).toEqual([2, 3, 4]);
    expect(mine?.recordedCount).toBe(1);
    expect(mine?.songTitle.length).toBeGreaterThan(0);
  });

  it('非法 zone / limit → 400（传输层结构错误）；limit 生效且被夹在 1..100', async () => {
    const badZone = await app.inject({ method: 'GET', url: '/api/sea?zone=SOMEWHERE' });
    expect(badZone.statusCode).toBe(400);

    const badLimit = await app.inject({ method: 'GET', url: '/api/sea?limit=0' });
    expect(badLimit.statusCode).toBe(400);

    const limited = await app.inject({ method: 'GET', url: '/api/sea?limit=1' });
    expect(limited.statusCode).toBe(200);
    expect((limited.json() as { items: unknown[] }).items.length).toBeLessThanOrEqual(1);
  });
});

describe('公海详情与指定接唱（CONTEXT §6.2）', () => {
  let initiatorCookie = '';
  let initiatorId = '';
  let takerCookie = '';
  let takerId = '';
  let incompleteId = '';
  let completeId = '';
  let driftingId = '';

  beforeAll(async () => {
    const initiator = await register('di');
    initiatorCookie = initiator.cookie;
    initiatorId = initiator.userId;
    const taker = await register('dt');
    takerCookie = taker.cookie;
    takerId = taker.userId;

    incompleteId = await seedIncompleteSeaBottle(initiatorCookie);

    completeId = await createBottle(initiatorCookie);
    await sing(initiatorCookie, completeId);
    await resolve(initiatorCookie, completeId, 'SEA');
    for (let index = 0; index < 3; index += 1) {
      const singer = (await register('ds')).cookie;
      await take(singer, completeId);
      await sing(singer, completeId);
      await resolve(singer, completeId, 'SEA');
    }

    // 还在漂流的瓶子（投河后没入海）→ 不属于公海
    driftingId = await createBottle(initiatorCookie);
    await sing(initiatorCookie, driftingId);
    await resolve(initiatorCookie, driftingId, 'RIVER');
  });

  it('详情：公海里的瓶子 → 200 且过契约；不在公海的瓶子 → 404（不是 403，避免探测）', async () => {
    const sea = await app.inject({ method: 'GET', url: '/api/sea/' + incompleteId });
    expect(sea.statusCode).toBe(200);
    const summary = BottleSummarySchema.parse(sea.json());
    expect(summary.id).toBe(incompleteId);
    expect(summary.seaZone).toBe('INCOMPLETE');
    expect(summary.songTitle.length).toBeGreaterThan(0);

    const drifting = await app.inject({ method: 'GET', url: '/api/sea/' + driftingId });
    expect(drifting.statusCode).toBe(404);

    const missing = await app.inject({
      method: 'GET',
      url: '/api/sea/00000000-0000-4000-8000-000000000000',
    });
    expect(missing.statusCode).toBe(404);
  });

  it('指定接唱：未登录 401；不存在的作品 404', async () => {
    expect(
      (await app.inject({ method: 'POST', url: '/api/sea/' + incompleteId + '/targeted-segment' }))
        .statusCode,
    ).toBe(401);
    expect(await take(takerCookie, '00000000-0000-4000-8000-000000000000')).toBe(404);
  });

  it('指定接唱：已完成作品 → 422 BOTTLE_ALREADY_COMPLETE（完成品只能听）', async () => {
    const status = await take(takerCookie, completeId);
    expect(status).toBe(422);
    const response = await app.inject({
      method: 'POST',
      url: '/api/sea/' + completeId + '/targeted-segment',
      headers: { cookie: takerCookie },
    });
    expect(response.body).toContain('BOTTLE_ALREADY_COMPLETE');
  });

  it('指定接唱：在该瓶唱过的人 → 422 ALREADY_SANG_IN_BOTTLE（含发起者：他必定有第 1 段）', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sea/' + incompleteId + '/targeted-segment',
      headers: { cookie: initiatorCookie },
    });
    expect(response.statusCode).toBe(422);
    expect(response.body).toContain('ALREADY_SANG_IN_BOTTLE');
  });

  it('指定接唱成功 → 200，持有者变成接唱者、父链接在最后一段作者上（§6.2）', async () => {
    expect(await take(takerCookie, incompleteId)).toBe(200);

    const detail = await app.inject({
      method: 'GET',
      url: '/api/bottles/' + incompleteId,
      headers: { cookie: takerCookie },
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json() as {
      holderId: string | null;
      isHolder: boolean;
      availableResolutions: string[];
      missingSegmentIndexes: number[];
    };
    expect(body.holderId).toBe(takerId);
    expect(body.isHolder).toBe(true);
    // 未完成的瓶子：可投河/回传/入海（缺口在，说明还能继续接）
    expect(body.availableResolutions).toEqual(['RIVER', 'RETURN', 'SEA']);
    expect(body.missingSegmentIndexes).toEqual([2, 3, 4]);

    // 接完这一段后缺口收缩：父链正确（最后一段作者 = 发起者）
    await sing(takerCookie, incompleteId);
    const after = await app.inject({
      method: 'GET',
      url: '/api/bottles/' + incompleteId,
      headers: { cookie: takerCookie },
    });
    expect((after.json() as { missingSegmentIndexes: number[] }).missingSegmentIndexes).toEqual([
      3, 4,
    ]);
    // 父链存在事件的 payload 里（events 表是单一事实来源）：
    // 指定接唱的父节点 = 该作品**最后一段**的接唱者（CONTEXT §6.2）
    const parent = await db.query<{ parent_id: string | null }>(
      `select payload->>'parentId' as parent_id from events
       where bottle_id = $1 and type = 'BOTTLE_DRAWN' order by seq desc limit 1`,
      [incompleteId],
    );
    expect(parent[0]?.parent_id).toBe(initiatorId);
  });
});
