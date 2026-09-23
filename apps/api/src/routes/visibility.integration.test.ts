/**
 * §9.1 / §9.2 的**可见性契约**（t12）。
 *
 * `CONTEXT.md` §9.1 原话是产品的核心承诺：漂流中「**看不到后面是谁、唱成什么样**」；
 * §9.2 则要求「入海后解锁完整接力链」。两者是一对，必须同时被测试钉住 ——
 * 只做一半（该藏的不藏 / 该给的没给）都是缺陷。
 *
 * 这个文件存在的直接原因：`GET /api/bottles/:id` 此前返回**全部有效段**，
 * 于是一个正在漂流中的人点开就能看见"后面是谁唱的、唱成什么样" ——
 * 产品违背自己的设计，而且评审点一下就能看见。
 *
 * 判据（三条路径都要覆盖，漏一条等于没裁）：
 * 1. `/api/bottles/:id` 的 `segments`；
 * 2. `/api/bottles/:id/events` 的漂流日志（事件里带 `actorId`，**更容易泄露"后面是谁"**）；
 * 3. `hiddenLaterSegmentCount` 让界面能解释"不是丢了，是看不到"。
 */
import { BottleDetailSchema } from '@music-drift/shared';
import { createSystemClock } from '@music-drift/shared/domain';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createDb, type Db } from '../db/client.js';
import { runSeed } from '../db/seed.js';
import { insertSong } from '../db/test-helpers.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
const PASSWORD = 'Drift-Bottle-2026';
const CLOCK = createSystemClock();

let db: Db;
let app: FastifyInstance;

function webmPayload(size = 2048): Buffer {
  const magic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  return Buffer.concat([magic, Buffer.alloc(size - magic.length, 0x42)]);
}

let seq = 0;
function uniqueHandle(prefix: string): string {
  seq += 1;
  return prefix + Date.now().toString().slice(-5) + seq + Math.random().toString(36).slice(2, 6);
}

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

async function record(cookie: string, bottleId: string, note?: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/bottles/' + bottleId + '/segments',
    payload: webmPayload(),
    headers: {
      cookie,
      'content-type': 'audio/webm',
      'x-audio-duration-ms': '20000',
      ...(note === undefined ? {} : { 'x-segment-note': encodeURIComponent(note) }),
    },
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { segmentId: string }).segmentId;
}

async function drawUntil(cookie: string, bottleId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/river/draw',
      headers: { cookie },
    });
    if (response.statusCode !== 200) return null;
    const bottle = (response.json() as { bottle: { id: string } }).bottle;
    if (bottle.id === bottleId) return bottleId;
    await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottle.id + '/put-back',
      headers: { cookie },
    });
  }
  return null;
}

async function detailOf(cookie: string | null, bottleId: string) {
  const response = await app.inject({
    method: 'GET',
    url: '/api/bottles/' + bottleId,
    ...(cookie === null ? {} : { headers: { cookie } }),
  });
  expect(response.statusCode).toBe(200);
  return BottleDetailSchema.parse(response.json());
}

async function eventsOf(cookie: string | null, bottleId: string) {
  const response = await app.inject({
    method: 'GET',
    url: '/api/bottles/' + bottleId + '/events',
    ...(cookie === null ? {} : { headers: { cookie } }),
  });
  expect(response.statusCode).toBe(200);
  return response.json() as { seq: number; type: string; actorId: string }[];
}

beforeAll(async () => {
  db = await createDb(DATABASE_URL);
  app = buildApp({ db, clock: CLOCK });
  await app.ready();
  await runSeed(db);
});

afterAll(async () => {
  await app.close();
  if (db !== undefined) await db.close();
});

describe('§9.1 漂流中：看不到后面是谁、唱成什么样', () => {
  let initiator: { cookie: string; userId: string };
  let singerOne: { cookie: string; userId: string };
  let holder: { cookie: string; userId: string };
  let stranger: { cookie: string; userId: string };
  let bottleId = '';

  beforeAll(async () => {
    initiator = await register('vi');
    singerOne = await register('v1');
    holder = await register('vh');
    stranger = await register('vx');

    const songId = await insertSong(db, 4);
    const created = await app.inject({
      method: 'POST',
      url: '/api/bottles',
      payload: { songId },
      headers: { cookie: initiator.cookie },
    });
    bottleId = (created.json() as { id: string }).id;
    await record(initiator.cookie, bottleId, '我发起的第一棒');
    const cast = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/resolution',
      payload: { resolution: 'RIVER' },
      headers: { cookie: initiator.cookie },
    });
    expect(cast.statusCode).toBe(200);

    // 第二个人捞到并接唱第 2 段后**继续投河**（瓶子仍在漂流中）
    expect(await drawUntil(singerOne.cookie, bottleId)).toBe(bottleId);
    await record(singerOne.cookie, bottleId, '第二棒的附言');
    await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/resolution',
      payload: { resolution: 'RIVER' },
      headers: { cookie: singerOne.cookie },
    });

    // 第三个人捞到它、成为持有者（此时瓶子 HELD，仍在漂流）
    expect(await drawUntil(holder.cookie, bottleId)).toBe(bottleId);
  });

  it('发起者：只看到自己那一棒（第 1 段），看不到第 2 段是谁唱的', async () => {
    const detail = await detailOf(initiator.cookie, bottleId);
    expect(detail.status).toBe('HELD');
    expect(detail.segments.map((segment) => segment.index)).toEqual([1]);
    expect(detail.segments.map((segment) => segment.ownerCode)).not.toContain(undefined);
    // 缺口字段照旧反映真实结构（进度信息不算泄露"后面是谁"）
    expect(detail.hiddenLaterSegmentCount).toBe(1);
  });

  it('持有者（还没唱）：看得到已有的段（他要接着唱），但**没有后续**可藏', async () => {
    const detail = await detailOf(holder.cookie, bottleId);
    expect(detail.isHolder).toBe(true);
    expect(detail.segments.map((segment) => segment.index)).toEqual([1, 2]);
    expect(detail.hiddenLaterSegmentCount).toBe(0);
  });

  it('陌生人：一段都看不到，但能看到"还有 N 段是你看不到的"（不是内容）', async () => {
    const detail = await detailOf(stranger.cookie, bottleId);
    expect(detail.segments).toEqual([]);
    expect(detail.hiddenLaterSegmentCount).toBe(2);
    // 计数类字段仍然可用（进度/缺口），它们不泄露"是谁/唱的什么"
    expect(detail.recordedCount).toBe(2);
  });

  it('未登录同样看不到内容（可见性在服务端，不靠前端隐藏）', async () => {
    const detail = await detailOf(null, bottleId);
    expect(detail.segments).toEqual([]);
    expect(detail.hiddenLaterSegmentCount).toBe(2);
  });

  it('漂流日志同样按同一判据裁剪：发起者只看到自己那一棒的日志', async () => {
    const events = await eventsOf(initiator.cookie, bottleId);
    expect(events.length).toBeGreaterThan(0);
    // 日志里每条事件的 actor 都只能是发起者自己（否则就泄露了"后面是谁"）
    expect(events.every((event) => event.actorId === initiator.userId)).toBe(true);

    const holderEvents = await eventsOf(holder.cookie, bottleId);
    expect(holderEvents.length).toBeGreaterThan(events.length);

    const strangerEvents = await eventsOf(stranger.cookie, bottleId);
    expect(strangerEvents).toEqual([]);
  });

  it('入海后（§9.2）解锁完整接力链：所有参与者与陌生人都能看到全部段与完整日志', async () => {
    // 持有者录第 3 段后投河（同一人不能在同一瓶里唱两次）→ 第四个人录最后一段并送进公海
    await record(holder.cookie, bottleId);
    const afterThird = await detailOf(holder.cookie, bottleId);
    expect(afterThird.missingSegmentIndexes).toEqual([4]);
    const cast = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/resolution',
      payload: { resolution: 'RIVER' },
      headers: { cookie: holder.cookie },
    });
    expect(cast.statusCode).toBe(200);

    const last = await register('vl');
    expect(await drawUntil(last.cookie, bottleId)).toBe(bottleId);
    await record(last.cookie, bottleId);
    const beforeSea = await detailOf(last.cookie, bottleId);
    expect(beforeSea.isComplete).toBe(true);
    const toSea = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/resolution',
      payload: { resolution: 'SEA' },
      headers: { cookie: last.cookie },
    });
    expect(toSea.statusCode).toBe(200);

    const afterSea = await detailOf(initiator.cookie, bottleId);
    expect(afterSea.status).toBe('SEA');
    expect(afterSea.isComplete).toBe(true);
    expect(afterSea.segments.map((segment) => segment.index)).toEqual([1, 2, 3, 4]);
    expect(afterSea.hiddenLaterSegmentCount).toBe(0);

    const strangerView = await detailOf(stranger.cookie, bottleId);
    expect(strangerView.segments.map((segment) => segment.index)).toEqual([1, 2, 3, 4]);

    const log = await eventsOf(stranger.cookie, bottleId);
    expect(log.length).toBeGreaterThan(5);
    expect(new Set(log.map((event) => event.actorId)).size).toBeGreaterThan(1);
  });
});
