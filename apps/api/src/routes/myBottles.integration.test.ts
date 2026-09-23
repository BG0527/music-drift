/**
 * 漂流日志（CONTEXT §11.1）：`GET /api/me/bottles` —— 个人中心「我参与过的漂流瓶」。
 *
 * 为什么这是 P0 而不是"顺手加的"：§11.1 是等待期的**唯一**"事做"，t11 只能用本机 localStorage
 * 书签顶上（换浏览器就没了）；t12 要用这个端点把它换成服务端数据。
 *
 * 两条纪律在这里被钉住：
 * 1. **真响应过契约**：用 `MyBottleListSchema.parse` 校验真实响应，而不是"我看了一眼字段差不多"；
 * 2. **参与过 ≠ 现在还有效**：判定基于事件（`SEGMENT_RECORDED` 的 actor），因此段被斩浪之后
 *    （ADR-015 §16.7 软删）**仍然算参与过**，只是 `mySegmentIndexes` 里不再有它。
 */
import { createSystemClock } from '@music-drift/shared/domain';
import { MyBottleListSchema } from '@music-drift/shared/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createDb, type Db } from '../db/client.js';
import { runSeed } from '../db/seed.js';
import { insertSong, listenUntilThresholdBatch } from '../db/test-helpers.js';

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

async function createAndSing(cookie: string): Promise<{ bottleId: string; segmentId: string }> {
  const songId = await insertSong(db, 4);
  const created = await app.inject({
    method: 'POST',
    url: '/api/bottles',
    payload: { songId },
    headers: { cookie },
  });
  expect(created.statusCode).toBe(201);
  const bottleId = (created.json() as { id: string }).id;
  const recorded = await app.inject({
    method: 'POST',
    url: '/api/bottles/' + bottleId + '/segments',
    payload: webmPayload(),
    headers: { cookie, 'content-type': 'audio/webm', 'x-audio-duration-ms': '20000' },
  });
  expect(recorded.statusCode).toBe(201);
  return { bottleId, segmentId: (recorded.json() as { segmentId: string }).segmentId };
}

async function castToRiver(cookie: string, bottleId: string): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/bottles/' + bottleId + '/resolution',
    payload: { resolution: 'RIVER' },
    headers: { cookie },
  });
  expect(response.statusCode).toBe(200);
}

type MyBottle = { id: string; role: string; mySegmentIndexes: number[]; updatedAt: string };

async function myBottles(cookie: string): Promise<MyBottle[]> {
  const response = await app.inject({ method: 'GET', url: '/api/me/bottles', headers: { cookie } });
  expect(response.statusCode).toBe(200);
  // 契约校验真实响应（§36.3）：字段缺失/多出都会在这里炸，而不是等到页面白屏
  return MyBottleListSchema.parse(response.json()).items as MyBottle[];
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

describe('GET /api/me/bottles（CONTEXT §11.1 漂流日志）', () => {
  let me = { cookie: '', userId: '' };
  let other = { cookie: '', userId: '' };
  let foreign = { cookie: '', userId: '' };
  let mine = ''; // 我发起 + 唱第 1 段
  let joined = ''; // 别人发起、我接唱第 2 段
  let untouched = ''; // 与我无关

  beforeAll(async () => {
    me = await register('mb');
    other = await register('ob');
    foreign = await register('fb');

    mine = (await createAndSing(me.cookie)).bottleId;
    await castToRiver(me.cookie, mine);

    // 我"接唱过"的瓶子：别人发起 → 入海（未完成区）→ 我**指定接唱**第 2 段。
    // 刻意不用 `POST /api/river/draw`：河道是随机的，而集成库是多个文件共用的 ——
    // 那种夹具会引入"看运气"的不稳定（t19 的病根之一），这里按 id 精确指定。
    joined = (await createAndSing(other.cookie)).bottleId;
    const toSea = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + joined + '/resolution',
      payload: { resolution: 'SEA' },
      headers: { cookie: other.cookie },
    });
    expect(toSea.statusCode).toBe(200);
    const taken = await app.inject({
      method: 'POST',
      url: '/api/sea/' + joined + '/targeted-segment',
      headers: { cookie: me.cookie },
    });
    expect(taken.statusCode).toBe(200);
    const second = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + joined + '/segments',
      payload: webmPayload(),
      headers: { cookie: me.cookie, 'content-type': 'audio/webm', 'x-audio-duration-ms': '20000' },
    });
    expect(second.statusCode).toBe(201);
    expect((second.json() as { index: number }).index).toBe(2);
    const backToSea = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + joined + '/resolution',
      payload: { resolution: 'SEA' },
      headers: { cookie: me.cookie },
    });
    expect(backToSea.statusCode).toBe(200);

    untouched = (await createAndSing(foreign.cookie)).bottleId;
    await castToRiver(foreign.cookie, untouched);
  });

  it('未登录 → 401（漂流日志是个人数据）', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/me/bottles' });
    expect(response.statusCode).toBe(401);
  });

  it('只返回自己参与过的：发起的 + 接唱的都算，与我无关的一律不出现', async () => {
    const items = await myBottles(me.cookie);
    const ids = items.map((item) => item.id);

    expect(ids).toContain(mine);
    expect(ids).toContain(joined);
    expect(ids).not.toContain(untouched);

    const byId = new Map(items.map((item) => [item.id, item]));
    expect(byId.get(mine)?.role).toBe('INITIATOR');
    expect(byId.get(joined)?.role).toBe('SINGER');
    // 角色只有两种：发起者不可能再接唱自己的瓶子（内核 hasEverSung 拦着），因此没有第三种状态
    for (const item of items) {
      expect(['INITIATOR', 'SINGER']).toContain(item.role);
    }
  });

  it('别人的列表看不见我的瓶子（同一端点各看各的）', async () => {
    const theirs = (await myBottles(other.cookie)).map((item) => item.id);
    expect(theirs).toContain(joined); // 他自己发起的
    expect(theirs).not.toContain(mine);
    expect(theirs).not.toContain(untouched);

    const foreignList = (await myBottles(foreign.cookie)).map((item) => item.id);
    expect(foreignList).toContain(untouched);
    expect(foreignList).not.toContain(mine);
    expect(foreignList).not.toContain(joined);
  });

  it('状态/段数/缺口/最近活跃时间都来自内核，并带上"我唱了第几段"', async () => {
    const items = await myBottles(me.cookie);
    const summary = items.find((item) => item.id === mine) as MyBottle & {
      status: string;
      totalSegments: number;
      recordedCount: number;
      missingSegmentIndexes: number[];
      songTitle: string;
    };
    const joinedItem = items.find((item) => item.id === joined) as typeof summary;

    // 我发起的那支：唱了第 1 段、已投河 → 缺口 [2,3,4]
    expect(summary.status).toBe('IN_RIVER');
    expect(summary.totalSegments).toBe(4);
    expect(summary.recordedCount).toBe(1);
    expect(summary.missingSegmentIndexes).toEqual([2, 3, 4]);
    expect(summary.mySegmentIndexes).toEqual([1]);
    expect(summary.songTitle.length).toBeGreaterThan(0); // 契约 min(1)：列表必须有曲名

    // 我接唱的那支：第 2 段是我的（在公海未完成区，等下一棒）
    expect(joinedItem.status).toBe('SEA');
    expect(joinedItem.recordedCount).toBe(2);
    expect(joinedItem.missingSegmentIndexes).toEqual([3, 4]);
    expect(joinedItem.mySegmentIndexes).toEqual([2]);

    // 最近活跃时间可解析，且按它倒序（列表是"最近发生了什么"的视图）
    const times = items.map((item) => Date.parse(item.updatedAt));
    expect(times.every((value) => Number.isFinite(value))).toBe(true);
    for (let index = 1; index < times.length; index += 1) {
      expect(times[index - 1]).toBeGreaterThanOrEqual(times[index] as number);
    }
  });

  it('段被斩浪后**仍然算参与过**（§16.7）：角色还在，只是"我唱的那一段"变成空', async () => {
    // 让 10 个路人点踩我的第 1 段（阈值 10）→ 锚被斩 → 整瓶 DAMAGED
    const segmentId = (
      await db.query<{ id: string }>(
        `select id from bottle_segments where bottle_id = $1 and index = 1 and deleted_at is null`,
        [mine],
      )
    )[0]?.id as string;
    // t20：踩门槛由服务端读持久化覆盖率判定 ⇒ 先批量让 10 位路人"听满"这一段
    const voters: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      voters.push((await register('vt')).cookie);
    }
    await listenUntilThresholdBatch(app, voters, segmentId, 20_000);
    for (const cookie of voters) {
      const vote = await app.inject({
        method: 'POST',
        url: '/api/segments/' + segmentId + '/votes',
        payload: { value: 'DISLIKE' },
        headers: { cookie },
      });
      expect(vote.statusCode).toBe(200);
    }

    const items = await myBottles(me.cookie);
    const cut = items.find((item) => item.id === mine) as MyBottle & {
      status: string;
      recordedCount: number;
    };
    expect(cut).toBeDefined(); // 被斩不等于"没参与过"
    expect(cut.status).toBe('DAMAGED');
    expect(cut.role).toBe('INITIATOR');
    expect(cut.recordedCount).toBe(0); // 有效段为 0（段已软删）
    expect(cut.mySegmentIndexes).toEqual([]); // 我唱的那一段不再有效
    // 刚被斩 → 最近活跃在最前（列表按 updatedAt 倒序）
    expect(items[0]?.id).toBe(mine);
    expect(Date.parse(cut.updatedAt)).toBe(Date.parse(String(items[0]?.updatedAt)));
  });
});
