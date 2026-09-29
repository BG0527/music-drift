/**
 * W18 的读取契约：所有观看者都能读取当前全部有效段及其音频；公共日志对所有观看者一致，
 * 只返回瓶级匿名 `actorCode`，并完全排除私密留言事件。
 */
import { BottleDetailSchema } from '@music-drift/shared';
import { createSystemClock } from '@music-drift/shared/domain';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createDb, type Db } from '../db/client.js';
import { runSeed } from '../db/seed.js';
import { insertSong } from '../db/test-helpers.js';
import { appendEvent } from '../db/events.js';

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
    payload: { account: handle, password: PASSWORD },
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
  return (await drawDetailUntil(cookie, bottleId))?.id ?? null;
}

async function drawDetailUntil(cookie: string, bottleId: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/river/draw',
      headers: { cookie },
    });
    if (response.statusCode !== 200) return null;
    const bottle = BottleDetailSchema.parse((response.json() as { bottle: unknown }).bottle);
    if (bottle.id === bottleId) return bottle;
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
  return response.json() as Array<{
    seq: number;
    type: string;
    actorCode: string;
    actorId?: string;
  }>;
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

describe('W18：所有观看者可读取全部有效段与公共日志', () => {
  let initiator: { cookie: string; userId: string };
  let singerOne: { cookie: string; userId: string };
  let holder: { cookie: string; userId: string };
  let stranger: { cookie: string; userId: string };
  let bottleId = '';
  let holderDrawDetail: ReturnType<typeof BottleDetailSchema.parse>;
  const segmentIds: string[] = [];

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
    segmentIds.push(await record(initiator.cookie, bottleId, '我发起的第一棒'));
    const cast = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/resolution',
      payload: { resolution: 'RIVER' },
      headers: { cookie: initiator.cookie },
    });
    expect(cast.statusCode).toBe(200);

    // 第二个人捞到并接唱第 2 段后**继续投河**（瓶子仍在漂流中）
    expect(await drawUntil(singerOne.cookie, bottleId)).toBe(bottleId);
    segmentIds.push(await record(singerOne.cookie, bottleId, '第二棒的附言'));
    const privateMessage = await app.inject({
      method: 'POST',
      url: `/api/bottles/${bottleId}/messages`,
      headers: { cookie: singerOne.cookie },
      payload: { targetSegmentIndex: 1, content: '只给第一棒看的私密留言' },
    });
    expect(privateMessage.statusCode).toBe(201);
    await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/resolution',
      payload: { resolution: 'RIVER' },
      headers: { cookie: singerOne.cookie },
    });

    // 第三个人捞到它、成为持有者（此时瓶子 HELD，仍在漂流）
    const drawn = await drawDetailUntil(holder.cookie, bottleId);
    expect(drawn?.id).toBe(bottleId);
    holderDrawDetail = drawn!;
  });

  it('发起者可以看到当前全部已录段', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/bottles/${bottleId}`,
      headers: { cookie: initiator.cookie },
    });
    expect(response.statusCode).toBe(200);
    const raw = response.json() as Record<string, unknown>;
    expect(raw).not.toHaveProperty('holderId');
    expect(raw).not.toHaveProperty('currentCasterId');
    expect(raw['segments']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ index: 1, isMine: true }),
        expect.objectContaining({ index: 2, isMine: false }),
      ]),
    );
    for (const segment of raw['segments'] as Array<Record<string, unknown>>) {
      expect(segment).not.toHaveProperty('ownerId');
    }
    const detail = BottleDetailSchema.parse(raw);
    expect(detail.status).toBe('HELD');
    expect(detail.segments.map((segment) => segment.index)).toEqual([1, 2]);
    expect(detail.segments.map((segment) => segment.ownerCode)).not.toContain(undefined);
  });

  it('持有者（还没唱）：看得到已有的段（他要接着唱），但**没有后续**可藏', async () => {
    const detail = await detailOf(holder.cookie, bottleId);
    expect(detail.isHolder).toBe(true);
    expect(detail.segments.map((segment) => segment.index)).toEqual([1, 2]);
  });

  it('河道捞取响应给已有参与者稳定且可区分的瓶级匿名码，并且不泄露 UUID', async () => {
    const regularDetail = await detailOf(holder.cookie, bottleId);
    const drawCodes = holderDrawDetail.segments.map((segment) => segment.ownerCode);

    expect(drawCodes).toEqual(regularDetail.segments.map((segment) => segment.ownerCode));
    expect(new Set(drawCodes).size).toBe(2);
    const raw = JSON.stringify(holderDrawDetail);
    expect(raw).not.toMatch(/ownerId|holderId|currentCasterId/);
    expect(raw).not.toMatch(new RegExp([initiator.userId, singerOne.userId].join('|')));
  });

  it('已登录陌生人也可以看到当前全部已录段', async () => {
    const detail = await detailOf(stranger.cookie, bottleId);
    expect(detail.segments.map((segment) => segment.index)).toEqual([1, 2]);
    expect(detail.recordedCount).toBe(2);
  });

  it('未登录观看者也能看到并逐段读取当前全部已录音频', async () => {
    const detail = await detailOf(null, bottleId);
    expect(detail.segments.map((segment) => segment.index)).toEqual([1, 2]);

    const statuses = await Promise.all(
      segmentIds.map(async (segmentId) =>
        (
          await app.inject({
            method: 'GET',
            url: `/api/segments/${segmentId}/audio`,
          })
        ).statusCode,
      ),
    );
    expect(statuses).toEqual([200, 200]);
  });

  it('发起者可直接读取瓶中当前其他人的已录音频', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/segments/${segmentIds[1] ?? ''}/audio`,
      headers: { cookie: initiator.cookie },
    });

    expect(response.statusCode).toBe(200);
  });

  it('公共日志向所有观看者展示相同核心事件，只给瓶级匿名代号且完全排除私密留言事件', async () => {
    const hiddenActor = await register('vz');
    await appendEvent(db, {
      bottleId,
      type: 'MESSAGE_FUTURE_INTERNAL',
      actorId: hiddenActor.userId,
      payload: { secret: '不得进入公共日志' },
      occurredAt: new Date(CLOCK.now()),
    });
    const initiatorEvents = await eventsOf(initiator.cookie, bottleId);
    const holderEvents = await eventsOf(holder.cookie, bottleId);
    const anonymousEvents = await eventsOf(null, bottleId);

    expect(initiatorEvents.length).toBeGreaterThan(0);
    expect(holderEvents).toEqual(initiatorEvents);
    expect(anonymousEvents).toEqual(initiatorEvents);
    expect(anonymousEvents.every((event) => event.actorId === undefined)).toBe(true);
    expect(anonymousEvents.every((event) => event.actorCode.length > 0)).toBe(true);
    expect(anonymousEvents.every((event) => !event.type.startsWith('MESSAGE_'))).toBe(true);
    const hiddenCodes = await db.query<{ code: string }>(
      `select code from anon_codes where bottle_id = $1 and user_id = $2`,
      [bottleId, hiddenActor.userId],
    );
    expect(hiddenCodes).toEqual([]);
  });

  it('未接唱就放回的操作者也有稳定且互不相同的瓶级匿名码', async () => {
    const owner = await register('vc');
    const firstPasser = await register('vp');
    const secondPasser = await register('vq');
    const songId = await insertSong(db, 4);
    const created = await app.inject({
      method: 'POST',
      url: '/api/bottles',
      payload: { songId },
      headers: { cookie: owner.cookie },
    });
    const targetBottleId = (created.json() as { id: string }).id;
    await record(owner.cookie, targetBottleId);
    await app.inject({
      method: 'POST',
      url: `/api/bottles/${targetBottleId}/resolution`,
      payload: { resolution: 'RIVER' },
      headers: { cookie: owner.cookie },
    });

    for (const passer of [firstPasser, secondPasser]) {
      expect(await drawUntil(passer.cookie, targetBottleId)).toBe(targetBottleId);
      const putBack = await app.inject({
        method: 'POST',
        url: `/api/bottles/${targetBottleId}/put-back`,
        headers: { cookie: passer.cookie },
      });
      expect(putBack.statusCode).toBe(200);
    }

    const events = await eventsOf(null, targetBottleId);
    const transitCodes = events
      .filter((event) => event.type === 'BOTTLE_DRAWN' || event.type === 'BOTTLE_PUT_BACK')
      .map((event) => event.actorCode);
    expect(transitCodes).toHaveLength(4);
    expect(transitCodes[0]).toBe(transitCodes[1]);
    expect(transitCodes[2]).toBe(transitCodes[3]);
    expect(transitCodes[0]).not.toBe(transitCodes[2]);
  });

  it('入海后（§9.2）解锁完整接力链：所有参与者与陌生人都能看到全部段与完整日志', async () => {
    // 持有者录第 3 段后投河（同一人不能在同一瓶里唱两次）→ 第四个人录最后一段并送进公海
    segmentIds.push(await record(holder.cookie, bottleId));
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
    segmentIds.push(await record(last.cookie, bottleId));
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

    const strangerView = await detailOf(stranger.cookie, bottleId);
    expect(strangerView.segments.map((segment) => segment.index)).toEqual([1, 2, 3, 4]);

    const publicAudioStatuses = await Promise.all(
      segmentIds.map(async (segmentId) =>
        (
          await app.inject({
            method: 'GET',
            url: `/api/segments/${segmentId}/audio`,
          })
        ).statusCode,
      ),
    );
    expect(publicAudioStatuses).toEqual([200, 200, 200, 200]);

    const log = await eventsOf(stranger.cookie, bottleId);
    expect(log.length).toBeGreaterThan(5);
    expect(new Set(log.map((event) => event.actorCode)).size).toBeGreaterThan(1);
  });
});
