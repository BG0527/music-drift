/**
 * W6 第二部分：**「收到回传」要有通知 + 「待你操作」状态**。
 *
 * 缺口来源（`docs/deploy-plan-html.md` §11.3 注 / §16.3）：
 * `notifications` 从来没有 `BOTTLE_RETURNED` 类型，`GET /api/me/bottles` 也表达不出"这支瓶子待你操作"
 * ⇒ 用户要求的「收到回传 → 提示 + 等你操作」**造都造不出来**。
 *
 * 语义唯一来源是 `CONTEXT.md` §4.2：「A 收到完整版本，且 A 只能选择入海」。
 * 因此两条断言都从**内核**取判据（`isAwaitingMyAction` = `availableResolutions` 恰好只剩 `['SEA']`），
 * 本文件不重写规则。
 *
 * 场景造法（不随机捞取，避免"看运气"的假红，与 `returnHandoff.integration.test.ts` 同一手法）：
 * 2 段歌 → A 录第 1 段并入海（未完成 → 公海「等待接力」区）→ B 用**指定接唱**取瓶 → B 录末段（此刻作品完整）
 * → B 选 `RETURN` 回传给父节点 A（= 发起者）⇒ 「回传落到发起者手里」。
 */
import { randomUUID } from 'node:crypto';
import { createSystemClock } from '@music-drift/shared/domain';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MyBottleListSchema, NotificationSchema } from '@music-drift/shared';
import { buildApp } from '../app.js';
import { createDb, type Db } from '../db/client.js';
import { insertSong } from '../db/test-helpers.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
const PASSWORD = 'Drift-Bottle-2026';
const CLOCK = createSystemClock();

let db: Db;
let app: FastifyInstance;

function webmPayload(size = 1024): Buffer {
  const magic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  return Buffer.concat([magic, Buffer.alloc(size - magic.length, 0x42)]);
}

/** 用**新契约**（账号 + 密码，没有邮箱）建号并拿到 cookie。 */
async function registerAccount(): Promise<string> {
  const account = `ret${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { account, password: PASSWORD },
  });
  expect(response.statusCode, response.body).toBe(201);
  const cookie = response.cookies.find((entry) => entry.name === 'mdb_session');
  return cookie === undefined ? '' : `${cookie.name}=${cookie.value}`;
}

async function recordSegment(cookie: string, bottleId: string): Promise<number> {
  return (
    await app.inject({
      method: 'POST',
      url: `/api/bottles/${bottleId}/segments`,
      payload: webmPayload(),
      headers: { cookie, 'content-type': 'audio/webm', 'x-audio-duration-ms': '20000' },
    })
  ).statusCode;
}

async function chooseResolution(cookie: string, bottleId: string, resolution: string) {
  return app.inject({
    method: 'POST',
    url: `/api/bottles/${bottleId}/resolution`,
    payload: { resolution },
    headers: { cookie },
  });
}

async function notificationsOf(cookie: string): Promise<{ type: string; payload: Record<string, unknown> }[]> {
  const response = await app.inject({ method: 'GET', url: '/api/notifications', headers: { cookie } });
  expect(response.statusCode).toBe(200);
  const items = (response.json() as { items: unknown[] }).items;
  for (const item of items) {
    expect(NotificationSchema.safeParse(item).success).toBe(true);
  }
  return items as { type: string; payload: Record<string, unknown> }[];
}

async function myBottlesOf(cookie: string): Promise<{ id: string; awaitingMyAction: boolean }[]> {
  const response = await app.inject({ method: 'GET', url: '/api/me/bottles', headers: { cookie } });
  expect(response.statusCode).toBe(200);
  const parsed = MyBottleListSchema.safeParse(response.json());
  expect(parsed.success, JSON.stringify(parsed.error?.issues?.[0])).toBe(true);
  return (parsed.success ? parsed.data.items : []) as { id: string; awaitingMyAction: boolean }[];
}

beforeAll(async () => {
  db = await createDb(DATABASE_URL);
  app = buildApp({ db, clock: CLOCK });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  if (db !== undefined) {
    await db.close();
  }
});

/** 一支「回传已落到发起者手里」的瓶子。 */
async function bottleReturnedToInitiator(): Promise<{
  bottleId: string;
  initiator: string;
  singer: string;
}> {
  const initiator = await registerAccount();
  const singer = await registerAccount();
  const songId = await insertSong(db, 2);

  const created = await app.inject({
    method: 'POST',
    url: '/api/bottles',
    payload: { songId },
    headers: { cookie: initiator },
  });
  expect(created.statusCode, created.body).toBe(201);
  const bottleId = (created.json() as { id: string }).id;

  expect(await recordSegment(initiator, bottleId)).toBe(201);
  // A 把它交出去（未完成 ⇒ 公海「等待接力」区），保证不是"一直攥在自己手里"
  expect((await chooseResolution(initiator, bottleId, 'SEA')).statusCode).toBe(200);

  const taken = await app.inject({
    method: 'POST',
    url: `/api/sea/${bottleId}/targeted-segment`,
    headers: { cookie: singer },
  });
  expect(taken.statusCode, taken.body).toBe(200);

  expect(await recordSegment(singer, bottleId)).toBe(201);
  const returned = await chooseResolution(singer, bottleId, 'RETURN');
  expect(returned.statusCode, returned.body).toBe(200);
  expect((returned.json() as { holderId: string }).holderId).not.toBeNull();

  return { bottleId, initiator, singer };
}

describe('收到回传 → 通知 + 「待你操作」（CONTEXT §4.2）', () => {
  it('回传落到发起者手里 ⇒ 发起者收到一条 BOTTLE_RETURNED 通知，带 bottleId 与曲名', async () => {
    const { bottleId, initiator } = await bottleReturnedToInitiator();

    const mine = (await notificationsOf(initiator)).filter(
      (row) => row.payload['bottleId'] === bottleId,
    );

    expect(mine.map((row) => row.type)).toContain('BOTTLE_RETURNED');
    expect(mine.find((row) => row.type === 'BOTTLE_RETURNED')?.payload['songTitle']).toBeTruthy();
  });

  it('发起者的 /api/me/bottles 把这一行标成「待你操作」（awaitingMyAction），且它确实只能入海', async () => {
    const { bottleId, initiator } = await bottleReturnedToInitiator();

    const row = (await myBottlesOf(initiator)).find((item) => item.id === bottleId);
    expect(row?.awaitingMyAction).toBe(true);

    // 「待你操作」= 只能入海：继续投河 / 回传都必须被内核拒绝
    const detail = await app.inject({ method: 'GET', url: `/api/bottles/${bottleId}`, headers: { cookie: initiator } });
    expect((detail.json() as { availableResolutions: string[] }).availableResolutions).toEqual(['SEA']);
    expect((await chooseResolution(initiator, bottleId, 'RIVER')).statusCode).toBe(422);
    expect((await chooseResolution(initiator, bottleId, 'RETURN')).statusCode).toBe(422);
  });

  it('回传只通知收件人：回传者（不是发起者）不收到 BOTTLE_RETURNED，其列表也不标「待你操作」', async () => {
    const { bottleId, singer } = await bottleReturnedToInitiator();

    const theirs = (await notificationsOf(singer)).filter(
      (row) => row.payload['bottleId'] === bottleId,
    );
    expect(theirs.map((row) => row.type)).not.toContain('BOTTLE_RETURNED');

    const row = (await myBottlesOf(singer)).find((item) => item.id === bottleId);
    expect(row).toBeDefined();
    expect(row?.awaitingMyAction).toBe(false);
  });

  it('发起者拿到瓶子但没回传时不算「待你操作」（初投/持有中都不标）', async () => {
    const initiator = await registerAccount();
    const songId = await insertSong(db, 2);
    const created = await app.inject({
      method: 'POST',
      url: '/api/bottles',
      payload: { songId },
      headers: { cookie: initiator },
    });
    const bottleId = (created.json() as { id: string }).id;
    expect(await recordSegment(initiator, bottleId)).toBe(201);

    const row = (await myBottlesOf(initiator)).find((item) => item.id === bottleId);
    expect(row?.awaitingMyAction).toBe(false);
  });

  it('入海之后不再是「待你操作」（状态会自己退场，不留常亮提示）', async () => {
    const { bottleId, initiator } = await bottleReturnedToInitiator();

    expect((await chooseResolution(initiator, bottleId, 'SEA')).statusCode).toBe(200);

    const row = (await myBottlesOf(initiator)).find((item) => item.id === bottleId);
    expect(row?.awaitingMyAction).toBe(false);
  });
});
