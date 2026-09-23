/**
 * 通知的**写入路径**（t12 第 1️⃣ 项 / `CONTEXT.md` §5.2、§9.2）。
 *
 * 背景：t9 只交付了通知的**读**与**标记已读**（`GET /api/notifications`），
 * 全仓没有任何 `insert into notifications`（grep 只命中测试夹具）。
 * 本文件钉住三条**写**路径，且每条都断言"真库里真的写了一行、收件人正确"：
 *
 * 1. **私密留言送达**（全链回传后入海，`returnCompleted`）→ 通知**接收者（发起者）**；
 * 2. **私密留言未送达**（中途入海 / 回传链断）→ 通知**发送者**：「你的留言未送达」（§5.2）；
 * 3. **作品入海** → 通知**所有参与者**（发起者 + 每一位唱过的人，含被斩浪的人）。
 *
 * 边界纪律：
 * - 通知是**事件的投影**（与事件同一事务），不是路由里的顺手 insert —— 这样系统触发的入海
 *   （超时等）也自动覆盖；
 * - 通知只能读到自己（越权读不到别人的），非参与者拿不到任何通知；
 * - 真响应必须过契约（`NotificationSchema.parse`），不只断言字段存在（t9 的 `songTitle` HIGH 缺陷同源）。
 */
import { NotificationSchema } from '@music-drift/shared';
import { createSystemClock } from '@music-drift/shared/domain';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createDb, type Db } from '../db/client.js';
import { runSeed } from '../db/seed.js';
import { insertSong, listenUntilThresholdBatch } from '../db/test-helpers.js';

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

async function createBottle(cookie: string): Promise<{ bottleId: string; songId: string }> {
  const songId = await insertSong(db, 4);
  const created = await app.inject({
    method: 'POST',
    url: '/api/bottles',
    payload: { songId },
    headers: { cookie },
  });
  expect(created.statusCode).toBe(201);
  return { bottleId: (created.json() as { id: string }).id, songId };
}

async function record(cookie: string, bottleId: string): Promise<string> {
  const recorded = await app.inject({
    method: 'POST',
    url: '/api/bottles/' + bottleId + '/segments',
    payload: webmPayload(),
    headers: { cookie, 'content-type': 'audio/webm', 'x-audio-duration-ms': '20000' },
  });
  expect(recorded.statusCode).toBe(201);
  return (recorded.json() as { segmentId: string }).segmentId;
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

/** 指定接唱（补一个缺口）→ 唱一段 →（可选）选去向；返回段 id。 */
async function takeAndSing(
  cookie: string,
  bottleId: string,
  resolution: 'RIVER' | 'RETURN' | 'SEA' | null,
): Promise<string> {
  const taken = await app.inject({
    method: 'POST',
    url: '/api/sea/' + bottleId + '/targeted-segment',
    headers: { cookie },
  });
  expect(taken.statusCode).toBe(200);
  const segmentId = await record(cookie, bottleId);
  if (resolution !== null) await resolve(cookie, bottleId, resolution);
  return segmentId;
}

interface NotificationRow {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
}

/** 读自己的通知（真响应过契约）。 */
async function notificationsOf(cookie: string): Promise<NotificationRow[]> {
  const response = await app.inject({
    method: 'GET',
    url: '/api/notifications',
    headers: { cookie },
  });
  expect(response.statusCode).toBe(200);
  const page = response.json() as { items: unknown[] };
  return page.items.map((item) => NotificationSchema.parse(item));
}

function typesFor(rows: readonly NotificationRow[], bottleId: string): string[] {
  return rows
    .filter((row) => row.payload['bottleId'] === bottleId)
    .map((row) => row.type)
    .sort();
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

describe('通知写入 ①：私密留言**送达** → 通知发起者（§5.2 送达分支）', () => {
  let initiator: { cookie: string; userId: string };
  let singerOne: { cookie: string; userId: string };
  let singerTwo: { cookie: string; userId: string };
  let lastSinger: { cookie: string; userId: string };
  let stranger: { cookie: string; userId: string };
  let bottleId = '';
  let songId = '';
  let messageId = '';

  beforeAll(async () => {
    initiator = await register('nd');
    stranger = await register('nx');
    singerOne = await register('n1');
    singerTwo = await register('n2');
    lastSinger = await register('n3');

    const created = await createBottle(initiator.cookie);
    bottleId = created.bottleId;
    songId = created.songId;
    await record(initiator.cookie, bottleId);
    await resolve(initiator.cookie, bottleId, 'SEA'); // 进公海未完成区，等补位

    await takeAndSing(singerOne.cookie, bottleId, 'SEA');
    await takeAndSing(singerTwo.cookie, bottleId, 'SEA');
    await takeAndSing(lastSinger.cookie, bottleId, null); // 末段：持有中，可写留言

    const created2 = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/messages',
      payload: { content: '给你留一句：副歌我改高了', targetSegmentIndex: 1 },
      headers: { cookie: lastSinger.cookie },
    });
    expect(created2.statusCode).toBe(201);
    messageId = (created2.json() as { id: string }).id;
  });

  it('留言刚写下时是 PENDING：此刻**不发**留言通知（还没送达，通知会泄露未公开的内容）', async () => {
    for (const who of [initiator, lastSinger]) {
      const types = typesFor(await notificationsOf(who.cookie), bottleId);
      expect(types).not.toContain('MESSAGE_DELIVERED');
      expect(types).not.toContain('MESSAGE_UNDELIVERED');
    }
  });

  it('未完成作品进「等待接力」区**不发**"已完成"通知（那时说已完成是撒谎）', async () => {
    const types = typesFor(await notificationsOf(initiator.cookie), bottleId);
    expect(types).not.toContain('BOTTLE_COMPLETED');
  });

  it('全链回传 → 发起者入海后：留言 DELIVERED，且发起者收到「收到一条私密留言」', async () => {
    await resolve(lastSinger.cookie, bottleId, 'RETURN');
    await resolve(singerTwo.cookie, bottleId, 'RETURN');
    await resolve(singerOne.cookie, bottleId, 'RETURN');
    await resolve(initiator.cookie, bottleId, 'SEA');

    const rows = await db.query<{ status: string; to_user_id: string }>(
      `select status, to_user_id from messages where id = $1`,
      [messageId],
    );
    expect(rows[0]?.status).toBe('DELIVERED');
    expect(rows[0]?.to_user_id).toBe(initiator.userId);

    const initiatorNotifications = await notificationsOf(initiator.cookie);
    expect(typesFor(initiatorNotifications, bottleId)).toContain('MESSAGE_DELIVERED');
    const delivered = initiatorNotifications.find(
      (row) => row.type === 'MESSAGE_DELIVERED' && row.payload['bottleId'] === bottleId,
    );
    expect(delivered?.payload['messageId']).toBe(messageId);

    // 送达分支下，发送者**不该**收到「未送达」
    const senderNotifications = await notificationsOf(lastSinger.cookie);
    expect(typesFor(senderNotifications, bottleId)).not.toContain('MESSAGE_UNDELIVERED');
  });

  it('收件人只可能是发起者：非参与者与中间传递者都收不到这条留言通知', async () => {
    const strangerNotifications = await notificationsOf(stranger.cookie);
    expect(typesFor(strangerNotifications, bottleId)).not.toContain('MESSAGE_DELIVERED');

    const middleNotifications = await notificationsOf(singerTwo.cookie);
    expect(typesFor(middleNotifications, bottleId)).not.toContain('MESSAGE_DELIVERED');
  });

  it('作品入海 → 通知**所有参与者**（发起者 + 每位唱过的人），且带曲名', async () => {
    const songRows = await db.query<{ title: string }>(`select title from songs where id = $1`, [
      songId,
    ]);
    const songTitle = songRows[0]?.title ?? '';
    expect(songTitle).not.toBe('');

    for (const participant of [initiator, singerOne, singerTwo, lastSinger]) {
      const rows = await notificationsOf(participant.cookie);
      const reached = rows.find(
        (row) => row.type === 'BOTTLE_COMPLETED' && row.payload['bottleId'] === bottleId,
      );
      expect(reached, participant.userId + ' 应收到入海通知').toBeDefined();
      expect(reached?.payload['songTitle']).toBe(songTitle);
      expect(reached?.payload['isComplete']).toBe(true);
      expect(reached?.payload['missingSegmentIndexes']).toEqual([]);
    }

    // 非参与者拿不到任何东西（不泄露"这瓶子存在"这件事）
    expect(typesFor(await notificationsOf(stranger.cookie), bottleId)).toEqual([]);
  });
});

describe('通知写入 ②：私密留言**未送达** → 通知发送者（§5.2）', () => {
  it('唱完留言后直接入海（回传链断）→ 发送者收到「你的留言未送达」，发起者收到的是入海通知而不是留言', async () => {
    const initiator = await register('ud');
    const singer = await register('us');
    const { bottleId } = await createBottle(initiator.cookie);
    await record(initiator.cookie, bottleId);
    await resolve(initiator.cookie, bottleId, 'SEA');

    await takeAndSing(singer.cookie, bottleId, null);
    const created = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/messages',
      payload: { content: '不知道还能不能送到', targetSegmentIndex: 1 },
      headers: { cookie: singer.cookie },
    });
    expect(created.statusCode).toBe(201);
    const messageId = (created.json() as { id: string }).id;

    await resolve(singer.cookie, bottleId, 'SEA'); // 中途入海 → 未送达

    const rows = await db.query<{ status: string }>(`select status from messages where id = $1`, [
      messageId,
    ]);
    expect(rows[0]?.status).toBe('UNDELIVERED');

    const senderNotifications = await notificationsOf(singer.cookie);
    expect(typesFor(senderNotifications, bottleId)).toContain('MESSAGE_UNDELIVERED');
    const undelivered = senderNotifications.find(
      (row) => row.type === 'MESSAGE_UNDELIVERED' && row.payload['bottleId'] === bottleId,
    );
    expect(undelivered?.payload['messageId']).toBe(messageId);

    // 发起者这边：留言没送达（他根本不该看到），作品也没完成（公海等待接力区）→ 无通知
    const initiatorTypes = typesFor(await notificationsOf(initiator.cookie), bottleId);
    expect(initiatorTypes).not.toContain('MESSAGE_DELIVERED');
    expect(initiatorTypes).not.toContain('BOTTLE_COMPLETED');
  });
});

describe('通知写入 ③：被斩浪的参与者**不再算参与过**（用户裁决 §46.1；与 §16.7 防捣乱是两个维度）', () => {
  it('某段被斩（作品随后被补齐并完整入海）：被斩者**不再**收到「作品已完成」通知，其余有效段作者照常收到', async () => {
    const initiator = await register('zd');
    const crowd: string[] = [];
    for (let index = 0; index < 10; index += 1) crowd.push((await register('zc')).cookie);

    const { bottleId } = await createBottle(initiator.cookie);
    await record(initiator.cookie, bottleId);
    await resolve(initiator.cookie, bottleId, 'SEA'); // 公海「等待接力」区，等补位

    const victimCookie = (await register('zv')).cookie;
    const victimSegment = await takeAndSing(victimCookie, bottleId, 'SEA');

    // 10 个不同的人点踩 → 达到斩杀阈值（内核默认 10）→ 该段被软删 + **系统把作品置回河道**
    // t20：踩门槛改由服务端读持久化覆盖率判定 ⇒ 先批量"听满"（payload 里的 listenedRatio 已不再被采信）
    await listenUntilThresholdBatch(app, crowd, victimSegment, 20_000);
    for (const cookie of crowd) {
      const voted = await app.inject({
        method: 'POST',
        url: '/api/segments/' + victimSegment + '/votes',
        payload: { value: 'DISLIKE' },
        headers: { cookie },
      });
      expect(voted.statusCode).toBe(200);
    }
    const cutRows = await db.query<{ deleted_at: string | null }>(
      `select deleted_at from bottle_segments where id = $1`,
      [victimSegment],
    );
    expect(cutRows[0]?.deleted_at).not.toBeNull();

    // ① 补位：从河道重新捞到它（容忍河道里还有别的瓶子），补上缺口段
    const saver1 = await register('zs');
    let drawn: string | null = null;
    for (let attempt = 0; attempt < 40 && drawn === null; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/river/draw',
        headers: { cookie: saver1.cookie },
      });
      if (response.statusCode !== 200) break;
      const bottle = (response.json() as { bottle: { id: string } }).bottle;
      if (bottle.id === bottleId) {
        drawn = bottle.id;
        break;
      }
      await app.inject({
        method: 'POST',
        url: '/api/bottles/' + bottle.id + '/put-back',
        headers: { cookie: saver1.cookie },
      });
    }
    expect(drawn, '斩浪后系统把作品置回河道 → 应当能重新捞到它').toBe(bottleId);
    await record(saver1.cookie, bottleId); // 补位缺口（内核决定段号）
    await resolve(saver1.cookie, bottleId, 'SEA');

    // ② 其余段位由新的接唱者补齐，最后一位把完整作品送进公海
    const saver2 = await register('zs2');
    const saver3 = await register('zs3');
    await takeAndSing(saver2.cookie, bottleId, 'SEA');
    await takeAndSing(saver3.cookie, bottleId, null);
    const before = await app.inject({
      method: 'GET',
      url: '/api/bottles/' + bottleId,
      headers: { cookie: saver3.cookie },
    });
    expect((before.json() as { isComplete: boolean }).isComplete).toBe(true);
    await resolve(saver3.cookie, bottleId, 'SEA');

    // ③ 被斩的那位**不再算参与过**（§46.1：连发起者也一并剔除）→ 不收「作品已完成」；
    //    反假绿：上面已断言 `victimSegment` 确实被软删，所以"没收到"不是因为没斩成
    const victimNotifications = await notificationsOf(victimCookie);
    expect(typesFor(victimNotifications, bottleId)).not.toContain('BOTTLE_COMPLETED');
    for (const who of [initiator, saver1, saver2, saver3]) {
      expect(typesFor(await notificationsOf(who.cookie), bottleId)).toContain('BOTTLE_COMPLETED');
    }
  });
});
