/**
 * 私密留言**规则变更**的 API 级验收（用户第十三轮第 ④ 条）：
 * 留言目标由发送者按**段号**指定（服务端解析成作者）、**只有目标能看到**、
 * **送达目标才通知目标**、**三种失败都通知留言者**。
 *
 * 为什么单开一个文件：这是**规则迁移**（旧规则"固定回传给发起者"已被改掉），
 * 需要把"目标解析 / 可见性 / 送达通知 / 三种失败通知"四件事端到端钉住，
 * 而这些断言与 `interactions.integration.test.ts` 里那批用例的意图不同（那里测的是写入与基本可见性）。
 */
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
const SEGMENT_DURATION_MS = '20000';

let seq = 0;
function uniqueHandle(prefix: string): string {
  seq += 1;
  return prefix + Date.now().toString().slice(-5) + String(seq).padStart(3, '0');
}

function webmPayload(size = 2048): Buffer {
  const magic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  return Buffer.concat([magic, Buffer.alloc(size - magic.length, 0x42)]);
}

let db: Db;
let app: FastifyInstance;

async function register(prefix: string): Promise<{ cookie: string; userId: string; handle: string }> {
  const handle = uniqueHandle(prefix);
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { account: handle, password: PASSWORD },
  });
  expect(response.statusCode).toBe(201);
  const cookie = response.cookies.find((entry) => entry.name === 'mdb_session');
  const user = (response.json() as { user: { id: string } }).user;
  return { cookie: cookie === undefined ? '' : cookie.name + '=' + cookie.value, userId: user.id, handle };
}

async function sing(cookie: string, bottleId: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/bottles/' + bottleId + '/segments',
    payload: webmPayload(),
    headers: { cookie, 'content-type': 'audio/webm', 'x-audio-duration-ms': SEGMENT_DURATION_MS },
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { segmentId: string }).segmentId;
}

async function resolve(cookie: string, bottleId: string, resolution: 'RIVER' | 'RETURN' | 'SEA'): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/bottles/' + bottleId + '/resolution',
    payload: { resolution },
    headers: { cookie },
  });
  expect(response.statusCode).toBe(200);
}

async function take(cookie: string, bottleId: string): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/sea/' + bottleId + '/targeted-segment',
    headers: { cookie },
  });
  expect(response.statusCode).toBe(200);
}

async function sendMessage(
  cookie: string,
  bottleId: string,
  content: string,
  targetSegmentIndex: number,
) {
  return await app.inject({
    method: 'POST',
    url: '/api/bottles/' + bottleId + '/messages',
    payload: { content, targetSegmentIndex },
    headers: { cookie },
  });
}

async function messagesOf(cookie: string, bottleId: string) {
  const response = await app.inject({
    method: 'GET',
    url: '/api/bottles/' + bottleId + '/messages',
    headers: { cookie },
  });
  expect(response.statusCode).toBe(200);
  return response.json() as {
    id: string;
    content: string;
    status: string;
    targetSegmentIndex: number;
    sender: { segmentIndex: number; displayName: string; revealed: boolean };
    recipient: { segmentIndex: number; displayName: string; revealed: boolean };
  }[];
}

async function notificationsOf(cookie: string): Promise<{ type: string; payload: Record<string, unknown> }[]> {
  const response = await app.inject({
    method: 'GET',
    url: '/api/notifications',
    headers: { cookie },
  });
  expect(response.statusCode).toBe(200);
  return (response.json() as { items: { type: string; payload: Record<string, unknown> }[] }).items;
}

/**
 * 造一条 4 段链并停在**末段作者手上**（尚未选去向）：
 * A 发起 + 第 1 段 → 入海（未完成区）→ B/C/D 依次「指定接唱」拿到瓶子并各录一段。
 * 返回四位的 cookie（按 A/B/C/D 顺序）。
 */
async function fourHopChain(): Promise<{ bottleId: string; cookies: string[]; handles: string[] }> {
  const initiator = await register('mt');
  const songId = await insertSong(db, 4);
  const created = await app.inject({
    method: 'POST',
    url: '/api/bottles',
    payload: { songId },
    headers: { cookie: initiator.cookie },
  });
  expect(created.statusCode).toBe(201);
  const bottleId = (created.json() as { id: string }).id;
  await sing(initiator.cookie, bottleId);
  await resolve(initiator.cookie, bottleId, 'SEA');

  const cookies = [initiator.cookie];
  const handles = [initiator.handle];
  for (let hop = 0; hop < 3; hop += 1) {
    const singer = await register('mt');
    await take(singer.cookie, bottleId);
    await sing(singer.cookie, bottleId);
    if (hop < 2) {
      await resolve(singer.cookie, bottleId, 'SEA');
    }
    cookies.push(singer.cookie);
    handles.push(singer.handle);
  }
  return { bottleId, cookies, handles };
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

describe('契约：目标必须是**段号**（服务端解析成作者），不信任前端送来的身份', () => {
  it('缺少 targetSegmentIndex / 非法值（0、负数、小数、字符串）→ 400', async () => {
    const { bottleId, cookies } = await fourHopChain();
    const sender = cookies[3] as string;

    for (const payload of [
      { content: '缺目标' },
      { content: '零', targetSegmentIndex: 0 },
      { content: '负', targetSegmentIndex: -1 },
      { content: '小数', targetSegmentIndex: 1.5 },
      { content: '字符串', targetSegmentIndex: '1' },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/bottles/' + bottleId + '/messages',
        payload,
        headers: { cookie: sender },
      });
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
    }
  });

  it('不存在的段号 / 自己的段 / 后序段 → 422 MESSAGE_TARGET_NOT_AVAILABLE', async () => {
    const { bottleId, cookies } = await fourHopChain();
    const sender = cookies[3] as string;

    for (const target of [99, 4]) {
      const response = await sendMessage(sender, bottleId, '乱指一个', target);
      expect(response.statusCode, `target=${String(target)}`).toBe(422);
      expect(response.body).toContain('MESSAGE_TARGET_NOT_AVAILABLE');
    }

    const forward = await sendMessage(cookies[0] as string, bottleId, '不能写给后面的人', 2);
    expect(forward.statusCode).toBe(422);
    expect(forward.body).toContain('MESSAGE_TARGET_NOT_AVAILABLE');
  });
});

describe('可见性：只有**目标**能看到；发起者与其他段作者一律看不到', () => {
  it('创建与送达前：发送者看到双方瓶内匿名代号，响应不泄露账号字段', async () => {
    const { bottleId, cookies } = await fourHopChain();
    const sender = cookies[3] as string;
    const codes = await db.query<{ segment_index: number; code: string }>(
      `select bs."index" as segment_index, ac.code
       from bottle_segments bs
       join anon_codes ac on ac.bottle_id = bs.bottle_id and ac.user_id = bs.owner_id
       where bs.bottle_id = $1 and bs."index" in (2, 4)`,
      [bottleId],
    );
    const codeByIndex = new Map(codes.map((row) => [row.segment_index, row.code]));

    const created = await sendMessage(sender, bottleId, '先保持匿名', 2);
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      sender: { segmentIndex: 4, displayName: codeByIndex.get(4), revealed: false },
      recipient: { segmentIndex: 2, displayName: codeByIndex.get(2), revealed: false },
    });

    const pending = await messagesOf(sender, bottleId);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      sender: { segmentIndex: 4, displayName: codeByIndex.get(4), revealed: false },
      recipient: { segmentIndex: 2, displayName: codeByIndex.get(2), revealed: false },
    });
    expect(JSON.stringify({ created: created.json(), pending })).not.toMatch(/userId|email/i);
  });

  it('送达前：目标看不到（内容还没送到）；发送者看得到自己写的；发起者此时也看不到', async () => {
    const { bottleId, cookies } = await fourHopChain();
    const [initiator, middle, other, sender] = cookies as [string, string, string, string];
    const created = await sendMessage(sender, bottleId, '只给第 2 段那位', 2);
    expect(created.statusCode).toBe(201);
    const messageId = (created.json() as { id: string }).id;

    expect((await messagesOf(sender, bottleId)).map((item) => item.id)).toEqual([messageId]);
    expect(await messagesOf(middle, bottleId)).toEqual([]);
    expect(await messagesOf(initiator, bottleId)).toEqual([]);
    expect(await messagesOf(other, bottleId)).toEqual([]);
  });

  it('送达目标后：**只有目标**看到内容；发起者永远看不到（旧规则"发起者看全部"已反转）', async () => {
    const { bottleId, cookies } = await fourHopChain();
    const [initiator, middle, other, sender] = cookies as [string, string, string, string];
    const created = await sendMessage(sender, bottleId, '只给第 2 段那位', 2);
    expect(created.statusCode).toBe(201);

    // 逐跳回传：末段作者 → 第 3 段作者 → **第 2 段作者（目标）**
    await resolve(sender, bottleId, 'RETURN');
    await resolve(other, bottleId, 'RETURN');

    const targetView = await messagesOf(middle, bottleId);
    expect(targetView.map((item) => item.content)).toEqual(['只给第 2 段那位']);
    expect(targetView[0]?.status).toBe('DELIVERED');
    expect(targetView[0]?.targetSegmentIndex).toBe(2);

    expect(await messagesOf(initiator, bottleId)).toEqual([]);
    // 发起者/第 3 段作者即使后来拿到瓶子也看不到（内容只属于目标）
    await resolve(middle, bottleId, 'RETURN'); // 回到发起者
    expect(await messagesOf(initiator, bottleId)).toEqual([]);
  });

  it('送达后：发送者与收件人都看到双方账号名，响应仍不泄露内部身份字段', async () => {
    const { bottleId, cookies, handles } = await fourHopChain();
    const [, recipient, relay, sender] = cookies as [string, string, string, string];
    const [, recipientHandle, , senderHandle] = handles as [string, string, string, string];
    await sendMessage(sender, bottleId, '送达才认识', 2);

    await resolve(sender, bottleId, 'RETURN');
    await resolve(relay, bottleId, 'RETURN');

    const expectedParties = {
      sender: { segmentIndex: 4, displayName: senderHandle, revealed: true },
      recipient: { segmentIndex: 2, displayName: recipientHandle, revealed: true },
    };
    const senderView = await messagesOf(sender, bottleId);
    const recipientView = await messagesOf(recipient, bottleId);
    expect(senderView[0]).toMatchObject(expectedParties);
    expect(recipientView[0]).toMatchObject(expectedParties);
    expect(JSON.stringify({ senderView, recipientView })).not.toMatch(/userId|email/i);
  });
});

describe('公海中的私密留言暂时隐藏，但数据保留', () => {
  it('未完成瓶入海时返回空数组，离海后恢复原留言', async () => {
    const initiator = await register('ms');
    const songId = await insertSong(db, 4);
    const createdBottle = await app.inject({
      method: 'POST',
      url: '/api/bottles',
      payload: { songId },
      headers: { cookie: initiator.cookie },
    });
    expect(createdBottle.statusCode).toBe(201);
    const bottleId = (createdBottle.json() as { id: string }).id;

    await sing(initiator.cookie, bottleId);
    await resolve(initiator.cookie, bottleId, 'SEA');

    const second = await register('ms');
    await take(second.cookie, bottleId);
    await sing(second.cookie, bottleId);
    await resolve(second.cookie, bottleId, 'SEA');

    const sender = await register('ms');
    await take(sender.cookie, bottleId);
    await sing(sender.cookie, bottleId);
    const createdMessage = await sendMessage(sender.cookie, bottleId, '离海后还在', 2);
    expect(createdMessage.statusCode).toBe(201);
    const messageId = (createdMessage.json() as { id: string }).id;

    await resolve(sender.cookie, bottleId, 'SEA');
    expect(await messagesOf(sender.cookie, bottleId)).toEqual([]);

    const stored = await db.query<{ status: string }>(
      `select status from messages where id = $1`,
      [messageId],
    );
    expect(stored).toEqual([{ status: 'PENDING' }]);

    const nextSinger = await register('ms');
    await take(nextSinger.cookie, bottleId);
    expect(await messagesOf(sender.cookie, bottleId)).toMatchObject([
      { id: messageId, content: '离海后还在', status: 'PENDING' },
    ]);
  });
});

describe('通知：送达通知**目标**（不再默认通知发起者）', () => {
  it('留言送到目标手上 → 目标收到 MESSAGE_DELIVERED，发起者没有收到', async () => {
    const { bottleId, cookies } = await fourHopChain();
    const [initiator, middle, other, sender] = cookies as [string, string, string, string];
    const created = await sendMessage(sender, bottleId, '给你的私密话', 2);
    const messageId = (created.json() as { id: string }).id;

    await resolve(sender, bottleId, 'RETURN');
    await resolve(other, bottleId, 'RETURN'); // 瓶子到目标（第 2 段作者）手上

    const targetNotifications = await notificationsOf(middle);
    const delivered = targetNotifications.find(
      (item) => item.type === 'MESSAGE_DELIVERED' && item.payload['messageId'] === messageId,
    );
    expect(delivered, '目标应收到送达通知').toBeDefined();

    const initiatorNotifications = await notificationsOf(initiator);
    expect(
      initiatorNotifications.some(
        (item) => item.type === 'MESSAGE_DELIVERED' && item.payload['messageId'] === messageId,
      ),
      '发起者不是目标 ⇒ 不该收到这条留言的送达通知',
    ).toBe(false);
  });
});

describe('§5.2 三种失败都通知**留言者**', () => {
  it('失败①：目标段被斩 → 留言者收到 MESSAGE_UNDELIVERED，目标什么也看不到', async () => {
    const { bottleId, cookies } = await fourHopChain();
    const [initiator, middle, , sender] = cookies as [string, string, string, string];
    const created = await sendMessage(sender, bottleId, '给第 2 段那位', 2);
    expect(created.statusCode).toBe(201);
    const messageId = (created.json() as { id: string }).id;

    // 目标段（第 2 段）被 10 个路人点踩斩掉（踩门槛需要先"听满"）
    const segmentRows = await db.query<{ id: string }>(
      `select id from bottle_segments where bottle_id = $1 and "index" = 2 and deleted_at is null`,
      [bottleId],
    );
    const targetSegmentId = segmentRows[0]?.id as string;
    const voters: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      voters.push((await register('mv')).cookie);
    }
    await listenUntilThresholdBatch(app, voters, targetSegmentId, 20_000);
    for (const cookie of voters) {
      const vote = await app.inject({
        method: 'POST',
        url: '/api/segments/' + targetSegmentId + '/votes',
        payload: { value: 'DISLIKE' },
        headers: { cookie },
      });
      expect(vote.statusCode).toBe(200);
    }

    const senderNotifications = await notificationsOf(sender);
    expect(
      senderNotifications.some(
        (item) => item.type === 'MESSAGE_UNDELIVERED' && item.payload['messageId'] === messageId,
      ),
      '留言者应收到「未送达」',
    ).toBe(true);
    expect(await messagesOf(middle, bottleId)).toEqual([]); // 内容从未送到目标
    expect(await messagesOf(initiator, bottleId)).toEqual([]);

    const rows = await db.query<{ status: string }>(`select status from messages where id = $1`, [messageId]);
    expect(rows[0]?.status).toBe('UNDELIVERED');
  });

  it('失败②：父链断裂 / 瓶子 DAMAGED（锚段被斩）→ 留言者收到 MESSAGE_UNDELIVERED', async () => {
    const { bottleId, cookies } = await fourHopChain();
    const [, middle, , sender] = cookies as [string, string, string, string];
    const created = await sendMessage(sender, bottleId, '给第 2 段那位', 2);
    const messageId = (created.json() as { id: string }).id;

    const anchorRows = await db.query<{ id: string }>(
      `select id from bottle_segments where bottle_id = $1 and "index" = 1 and deleted_at is null`,
      [bottleId],
    );
    const voters: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      voters.push((await register('mz')).cookie);
    }
    await listenUntilThresholdBatch(app, voters, anchorRows[0]?.id as string, 20_000);
    for (const cookie of voters) {
      const vote = await app.inject({
        method: 'POST',
        url: '/api/segments/' + String(anchorRows[0]?.id) + '/votes',
        payload: { value: 'DISLIKE' },
        headers: { cookie },
      });
      expect(vote.statusCode).toBe(200);
    }

    const bottleRows = await db.query<{ status: string }>(`select status from bottles where id = $1`, [bottleId]);
    expect(bottleRows[0]?.status).toBe('DAMAGED');
    expect(
      (await notificationsOf(sender)).some(
        (item) => item.type === 'MESSAGE_UNDELIVERED' && item.payload['messageId'] === messageId,
      ),
    ).toBe(true);
    expect(await messagesOf(middle, bottleId)).toEqual([]);
  });

  it('失败③：整首完成入海、但留言没回传到目标 → 留言者收到 MESSAGE_UNDELIVERED（用户明确补充的那条）', async () => {
    const { bottleId, cookies } = await fourHopChain();
    const [, middle, , sender] = cookies as [string, string, string, string];
    const created = await sendMessage(sender, bottleId, '给第 2 段那位', 2);
    const messageId = (created.json() as { id: string }).id;

    // 末段作者直接入海：作品完整（4 段齐）但没有逐跳回传 ⇒ 留言永远到不了目标
    await resolve(sender, bottleId, 'SEA');

    const bottleRows = await db.query<{ status: string }>(`select status from bottles where id = $1`, [bottleId]);
    expect(bottleRows[0]?.status).toBe('SEA');
    const messageRows = await db.query<{ status: string }>(`select status from messages where id = $1`, [messageId]);
    expect(messageRows[0]?.status).toBe('UNDELIVERED');
    expect(
      (await notificationsOf(sender)).some(
        (item) => item.type === 'MESSAGE_UNDELIVERED' && item.payload['messageId'] === messageId,
      ),
    ).toBe(true);
    expect(await messagesOf(middle, bottleId)).toEqual([]);
  });
});
