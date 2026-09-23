/**
 * 互动族 API（t9，`docs/api.md` §2.6）：投票、私密留言可见性、通知、徽章。
 *
 * 为什么内核已测过的规则还要在 API 层再测一遍：**内核绿 ≠ 接缝绿**。路由可能漏传
 * `listenedRatio`（于是 80% 门槛形同虚设）、用错状态码、或把「谁能看见留言」写成前端过滤。
 * 这里断言的是 **HTTP 语义 + 落库事实**，不是把内核规则抄第二遍。
 *
 * 错误体口径（`docs/api.md` §1）：只有**领域/音频规则码**进 `violations[].code`；
 * 传输层问题（400/401/403/404/501）的 `violations` 为空、靠 **HTTP 状态** 区分
 * —— 所以下面对传输层只断言状态，对规则层才断言稳定码。
 *
 * 已接受的行为（勿当 bug 修）：同一用户可对同一段**分别投一赞一踩**；点赞不抵消点踩、
 * 不提高斩杀阈值（`interactions.ts` 文件头 / `docs/api.md` §2.6 已记录）。
 */
import { ReportSchema } from '@music-drift/shared';
import { createSystemClock } from '@music-drift/shared/domain';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createDb, type Db } from '../db/client.js';
import { runSeed } from '../db/seed.js';
import { insertSong, listenUntilThreshold, listenUntilThresholdBatch } from '../db/test-helpers.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
const PASSWORD = 'Drift-Bottle-2026';
const CLOCK = createSystemClock();

function webmPayload(size = 2048): Buffer {
  const magic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  return Buffer.concat([magic, Buffer.alloc(size - magic.length, 0x42)]);
}

let seq = 0;
function uniqueHandle(prefix: string): string {
  seq += 1;
  return prefix + Date.now().toString().slice(-5) + seq + Math.random().toString(36).slice(2, 6);
}

/** 共享的 app/注册工具：四个 describe 各自独立夹具，避免互相污染（斩浪会毁掉瓶子）。 */
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

/** 建瓶 → 唱第 1 段 → 入海（未完成区），返回瓶子与首段 id。 */
async function seedSeaBottle(cookie: string): Promise<{ bottleId: string; segmentId: string }> {
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
  const segmentId = (recorded.json() as { segmentId: string }).segmentId;
  await resolve(cookie, bottleId, 'SEA');
  return { bottleId, segmentId };
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

/**
 * 指定接唱（补一个缺口）→ 唱一段 →（可选）选去向。
 *
 * `resolution = null` 表示**先留着不选**：瓶子停在「持有中」这唯一的漂流窗口内，
 * 留言按 §5.1 只能在此窗口写（入海后 `MESSAGE_BOTTLE_NOT_DRIFTING`）。
 */
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
  const recorded = await app.inject({
    method: 'POST',
    url: '/api/bottles/' + bottleId + '/segments',
    payload: webmPayload(),
    headers: { cookie, 'content-type': 'audio/webm', 'x-audio-duration-ms': '20000' },
  });
  expect(recorded.statusCode).toBe(201);
  if (resolution !== null) {
    await resolve(cookie, bottleId, resolution);
  }
  return (recorded.json() as { segmentId: string }).segmentId;
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

describe('投票（CONTEXT §7.2–§7.4）：门槛、自踩、一人一票、赞踩并存', () => {
  let authorCookie = '';
  let authorId = '';
  let voterCookie = '';
  let bottleId = '';
  let segmentId = '';
  const crowd: string[] = [];

  beforeAll(async () => {
    const author = await register('va');
    authorCookie = author.cookie;
    authorId = author.userId;
    const voter = await register('vv');
    voterCookie = voter.cookie;
    for (let index = 0; index < 10; index += 1) {
      crowd.push((await register('vc')).cookie);
    }
    const seeded = await seedSeaBottle(authorCookie);
    bottleId = seeded.bottleId;
    segmentId = seeded.segmentId;
  });

  it('未登录 → 401；不存在的段 → 404（不泄露瓶子是否存在）', async () => {
    const anonymous = await app.inject({
      method: 'POST',
      url: '/api/segments/' + segmentId + '/votes',
      payload: { value: 'DISLIKE', listenedRatio: 0.9 },
    });
    expect(anonymous.statusCode).toBe(401);

    const missing = await app.inject({
      method: 'POST',
      url: '/api/segments/00000000-0000-4000-8000-000000000000/votes',
      payload: { value: 'DISLIKE', listenedRatio: 0.9 },
      headers: { cookie: voterCookie },
    });
    expect(missing.statusCode).toBe(404);
  });

  it('作者不能点踩自己的段 → 422 CANNOT_DISLIKE_OWN_SEGMENT，且不落票', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/segments/' + segmentId + '/votes',
      payload: { value: 'DISLIKE' },
      headers: { cookie: authorCookie },
    });

    expect(response.statusCode).toBe(422);
    expect(response.body).toContain('CANNOT_DISLIKE_OWN_SEGMENT');
    for (const table of ['events', 'votes']) {
      const rows = await db.query<{ count: string }>(
        table === 'events'
          ? `select count(*)::text as count from events where bottle_id = $1 and type = 'VOTE_CAST'`
          : `select count(*)::text as count from votes where segment_id = $1 and user_id = $2`,
        table === 'events' ? [bottleId] : [segmentId, authorId],
      );
      expect(rows[0]?.count).toBe('0');
    }
  });

  it('没听满 80% → 422 LISTEN_THRESHOLD_NOT_REACHED（判定看服务端持久化覆盖率，请求体字段不算数）', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/segments/' + segmentId + '/votes',
      // t20：listenedRatio 已不再被采信 —— 这里**故意**填 1，判定仍按库里的 0 走
      payload: { value: 'DISLIKE' },
      headers: { cookie: voterCookie },
    });

    expect(response.statusCode).toBe(422);
    expect(response.body).toContain('LISTEN_THRESHOLD_NOT_REACHED');
    expect(response.body).toContain('80%');
    const rows = await db.query<{ count: string }>(
      `select count(*)::text as count from events where bottle_id = $1 and type = 'VOTE_CAST'`,
      [bottleId],
    );
    expect(rows[0]?.count).toBe('0');
  });

  it('听满 80% → 200 且阈值来自策略；重复投票是 422 而不是静默覆盖', async () => {
    // t20：门槛由服务端读**持久化**覆盖率判定 ⇒ 先走真实上报端点真的"听满"
    await listenUntilThreshold(app, voterCookie, segmentId, 20_000);

    const first = await app.inject({
      method: 'POST',
      url: '/api/segments/' + segmentId + '/votes',
      payload: { value: 'DISLIKE' },
      headers: { cookie: voterCookie },
    });
    expect(first.statusCode).toBe(200);
    const body = first.json() as {
      dislikeCount: number;
      dislikeThreshold: number;
      segmentCut: boolean;
    };
    expect(body.dislikeCount).toBe(1);
    expect(body.dislikeThreshold).toBe(10); // DomainPolicy.dislikeThreshold
    expect(body.segmentCut).toBe(false);

    const again = await app.inject({
      method: 'POST',
      url: '/api/segments/' + segmentId + '/votes',
      payload: { value: 'DISLIKE' },
      headers: { cookie: voterCookie },
    });
    expect(again.statusCode).toBe(422);
    expect(again.body).toContain('DISLIKE_ALREADY_CAST');

    const like = await app.inject({
      method: 'POST',
      url: '/api/segments/' + segmentId + '/votes',
      payload: { value: 'LIKE' },
      headers: { cookie: voterCookie },
    });
    // 同一个用户：一赞一踩**并存**（已接受行为），点赞不要求听满 —— 这是内核的既定语义。
    expect(like.statusCode).toBe(200);
    expect((like.json() as { likeCount: number; dislikeCount: number }).likeCount).toBe(1);
    expect((like.json() as { dislikeCount: number }).dislikeCount).toBe(1);

    const likeAgain = await app.inject({
      method: 'POST',
      url: '/api/segments/' + segmentId + '/votes',
      payload: { value: 'LIKE' },
      headers: { cookie: voterCookie },
    });
    expect(likeAgain.statusCode).toBe(422);
    expect(likeAgain.body).toContain('LIKE_ALREADY_CAST');
  });

  it('点赞不抵消点踩、不提高阈值：旁边挂着 10 个赞也照斩，锚被斩 → DAMAGED', async () => {
    // t20：踩要过服务端门槛 —— 批量让 10 位观众"听满"（共用同一次等待）
    await listenUntilThresholdBatch(app, crowd, segmentId, 20_000);

    let cut = false;
    let likesCast = 1; // voter 刚才那一个赞
    for (const cookie of crowd) {
      const like = await app.inject({
        method: 'POST',
        url: '/api/segments/' + segmentId + '/votes',
        payload: { value: 'LIKE' },
        headers: { cookie },
      });
      expect(like.statusCode).toBe(200);
      likesCast += 1;
      const dislike = await app.inject({
        method: 'POST',
        url: '/api/segments/' + segmentId + '/votes',
        payload: { value: 'DISLIKE' },
        headers: { cookie },
      });
      expect(dislike.statusCode).toBe(200);
      if ((dislike.json() as { segmentCut: boolean }).segmentCut) {
        cut = true;
        break; // 斩浪后段已软删：继续投票只会得到 SEGMENT_ALREADY_CUT
      }
    }

    // 阈值 = 10，voter 已投 1 踩 → 第 9 位观众投完即斩；此时段上已挂 10 个赞，**没有一个救得了它**。
    expect(cut).toBe(true);
    expect(likesCast).toBe(10);
    const state = await db.query<{ status: string; live: string; likes: string; dislikes: string }>(
      `select b.status,
              (select count(*)::text from bottle_segments s where s.bottle_id = b.id and s.deleted_at is null) as live,
              (select count(*)::text from votes v where v.segment_id = $2 and v.value = 'LIKE') as likes,
              (select count(*)::text from votes v where v.segment_id = $2 and v.value = 'DISLIKE') as dislikes
       from bottles b where b.id = $1`,
      [bottleId, segmentId],
    );
    expect(state[0]?.likes).toBe(String(likesCast));
    expect(state[0]?.dislikes).toBe('10'); // 恰好命中阈值
    expect(state[0]?.live).toBe('0'); // 段被斩 → 投影里不再有有效段
    // 第 1 段是锚：锚被斩 → 整瓶 DAMAGED（ADR-015 §16.3 分支 2）
    expect(state[0]?.status).toBe('DAMAGED');

    const afterCut = await app.inject({
      method: 'POST',
      url: '/api/segments/' + segmentId + '/votes',
      payload: { value: 'DISLIKE' },
      headers: { cookie: voterCookie },
    });
    expect(afterCut.statusCode).toBe(422);
    expect(afterCut.body).toContain('SEGMENT_ALREADY_CUT');
  });
});

describe('私密留言（CONTEXT §5）：目标由发送者按**段号**指定，只有目标能看到', () => {
  let initiatorCookie = '';
  let initiatorId = '';
  let lastSingerCookie = '';
  let singerOneCookie = '';
  let singerTwoCookie = '';
  let strangerCookie = '';
  let bottleId = '';
  let messageId = '';

  beforeAll(async () => {
    const initiator = await register('mi');
    initiatorCookie = initiator.cookie;
    initiatorId = initiator.userId;
    strangerCookie = (await register('mx')).cookie;
    bottleId = (await seedSeaBottle(initiatorCookie)).bottleId;
  });

  it('未登录 → 401（读写两条路径都是）', async () => {
    const write = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/messages',
      payload: { content: '匿名的话', targetSegmentIndex: 1 },
    });
    expect(write.statusCode).toBe(401);
    const read = await app.inject({ method: 'GET', url: '/api/bottles/' + bottleId + '/messages' });
    expect(read.statusCode).toBe(401);
  });

  it('目标不能是自己 → 422 MESSAGE_TARGET_NOT_AVAILABLE（旧规则"发起者不能写"已按用户裁决反转）', async () => {
    // 用一支**独立且正在漂流**的瓶子做这条断言：公海里的瓶子（本 describe 的 bottleId 此刻在公海）
    // 会先撞 MESSAGE_BOTTLE_NOT_DRIFTING（更根本的拒绝），测不到目标规则。
    const author = await register('mt');
    const songId = await insertSong(db, 4);
    const created = await app.inject({
      method: 'POST',
      url: '/api/bottles',
      payload: { songId },
      headers: { cookie: author.cookie },
    });
    expect(created.statusCode).toBe(201);
    const drifting = (created.json() as { id: string }).id;
    const recorded = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + drifting + '/segments',
      payload: webmPayload(),
      headers: { cookie: author.cookie, 'content-type': 'audio/webm', 'x-audio-duration-ms': '20000' },
    });
    expect(recorded.statusCode).toBe(201);
    const cast = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + drifting + '/resolution',
      payload: { resolution: 'RIVER' }, // 投河 → IN_RIVER（可写留言）
      headers: { cookie: author.cookie },
    });
    expect(cast.statusCode).toBe(200);
    // 瓶里只有第 1 段（作者自己的）⇒ 他选第 1 段 = 选自己
    const response = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + drifting + '/messages',
      payload: { content: '我说给我自己听', targetSegmentIndex: 1 },
      headers: { cookie: author.cookie },
    });
    expect(response.statusCode).toBe(422);
    expect(response.body).toContain('MESSAGE_TARGET_NOT_AVAILABLE');
  });

  it('接唱者写留言 → 201 PENDING；空内容 → 422（写留言只能在「持有中」这个漂流窗口内）', async () => {
    singerOneCookie = (await register('ms')).cookie;
    singerTwoCookie = (await register('m2')).cookie;
    lastSingerCookie = (await register('m3')).cookie;
    await takeAndSing(singerOneCookie, bottleId, 'SEA');
    await takeAndSing(singerTwoCookie, bottleId, 'SEA');
    // 末段接唱者：录完最后一段后仍在持有中 → 这是唯一能写留言的窗口（§5.1）
    await takeAndSing(lastSingerCookie, bottleId, null);

    const empty = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/messages',
      payload: { content: '   ', targetSegmentIndex: 1 },
      headers: { cookie: lastSingerCookie },
    });
    expect(empty.statusCode).toBe(422);
    expect(empty.body).toContain('MESSAGE_CONTENT_EMPTY');

    const created = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/messages',
      // 目标 = 第 1 段（发起者）：服务端据此解析收件人，客户端全程没传过 userId
      payload: { content: '给你留一句：副歌我改高了', targetSegmentIndex: 1 },
      headers: { cookie: lastSingerCookie },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as { id: string; status: string; targetSegmentIndex: number };
    messageId = body.id;
    expect(body.status).toBe('PENDING');
    expect(body.targetSegmentIndex).toBe(1);
    expect(messageId).not.toBe('');
  });

  it('可见性由服务端决定：发送者看得到自己写的，中间传递者与无关者看不到，发起者此刻也看不到', async () => {
    const own = await app.inject({
      method: 'GET',
      url: '/api/bottles/' + bottleId + '/messages',
      headers: { cookie: lastSingerCookie },
    });
    expect(own.statusCode).toBe(200);
    expect((own.json() as { id: string }[]).map((item) => item.id)).toContain(messageId);

    for (const cookie of [initiatorCookie, strangerCookie]) {
      const response = await app.inject({
        method: 'GET',
        url: '/api/bottles/' + bottleId + '/messages',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      // 还没回传到发起者手里（PENDING）：发起者与无关者都看不到任何内容（§5.1）
      expect(response.json()).toEqual([]);
    }
  });

  it('回传到**目标**手上即 DELIVERED（本例目标是发起者 ⇒ 他此时可见）；无需等到入海', async () => {
    // 回传是**逐跳**的（CONTEXT §4.3）：末段作者 → 上一段作者 → … → 发起者；
    // 谁持有谁选去向，所以这条链要一跳一跳走完（不能在别人手上替它入海）。
    await resolve(lastSingerCookie, bottleId, 'RETURN');
    await resolve(singerTwoCookie, bottleId, 'RETURN');
    await resolve(singerOneCookie, bottleId, 'RETURN');
    // 发起者收到回传后只能入海 → returnCompleted → PENDING 转 DELIVERED
    await resolve(initiatorCookie, bottleId, 'SEA');

    const response = await app.inject({
      method: 'GET',
      url: '/api/bottles/' + bottleId + '/messages',
      headers: { cookie: initiatorCookie },
    });
    expect(response.statusCode).toBe(200);
    const items = response.json() as { id: string; status: string }[];
    expect(items.map((item) => item.id)).toContain(messageId);
    expect(items.find((item) => item.id === messageId)?.status).toBe('DELIVERED');

    // 落库事实：留言是点对点写给**发起者**的，且投影状态已跟随事件转为 DELIVERED
    const rows = await db.query<{ status: string; to_user_id: string; count: string }>(
      `select status, to_user_id, (select count(*)::text from messages where bottle_id = $1) as count
       from messages where id = $2`,
      [bottleId, messageId],
    );
    expect(rows[0]?.count).toBe('1');
    expect(rows[0]?.status).toBe('DELIVERED');
    expect(rows[0]?.to_user_id).toBe(initiatorId);
  });

  it('入海后的瓶子不可再留言 → 422 MESSAGE_BOTTLE_NOT_DRIFTING（不留悬空 PENDING）', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/messages',
      payload: { content: '太晚了', targetSegmentIndex: 1 },
      headers: { cookie: lastSingerCookie },
    });
    expect(response.statusCode).toBe(422);
    expect(response.body).toContain('MESSAGE_BOTTLE_NOT_DRIFTING');
  });
});

describe('私密留言：中途入海 → 未送达（CONTEXT §5.2）', () => {
  it('留言后把瓶子投进公海 → 发送者看到 UNDELIVERED，发起者始终看不到', async () => {
    const initiator = await register('ui');
    const bottleId = (await seedSeaBottle(initiator.cookie)).bottleId;
    const singerCookie = (await register('us')).cookie;

    await takeAndSing(singerCookie, bottleId, null);
    const created = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/messages',
      payload: { content: '不知道还能不能送到', targetSegmentIndex: 1 },
      headers: { cookie: singerCookie },
    });
    expect(created.statusCode).toBe(201);

    // §5.2：瓶子中途被投入公海 → 留言不公开，C 收到「未送达」
    await resolve(singerCookie, bottleId, 'SEA');

    const sender = await app.inject({
      method: 'GET',
      url: '/api/bottles/' + bottleId + '/messages',
      headers: { cookie: singerCookie },
    });
    const delivered = sender.json() as { status: string }[];
    expect(delivered.map((item) => item.status)).toEqual(['UNDELIVERED']);

    const owner = await app.inject({
      method: 'GET',
      url: '/api/bottles/' + bottleId + '/messages',
      headers: { cookie: initiator.cookie },
    });
    expect(owner.json()).toEqual([]); // 未送达的留言对发起者不可见（§5.1/§5.2）

    const rows = await db.query<{ status: string }>(
      `select status from messages where bottle_id = $1`,
      [bottleId],
    );
    expect(rows[0]?.status).toBe('UNDELIVERED');
    // ✅ §5.2 的「留言者会收到通知：你的留言未送达」**已实现**（t42）：
    // 写入点在 `store/notifications.ts` 的"内核前后状态比对"里 —— 留言 PENDING → UNDELIVERED 就
    // 给**发送者**写一条 `MESSAGE_UNDELIVERED`；三条失败路径（目标段被斩 / DAMAGED / 完整入海未送达）
    // 各有集成用例，见 `routes/messageTargeting.integration.test.ts` 的「§5.2 三种失败都通知留言者」。
    //（此处原先的 ⚠️ 过期警示写于 t9：当时全仓确实没有写入口；t12 补齐写入后它就成了误导，t42 更新。）
  });
});

describe('举报与人工审核队列（CONTEXT §8）：非管理员拿不到队列', () => {
  let reporterCookie = '';
  let reporterId = '';
  let otherCookie = '';
  let targetBottleId = '';

  beforeAll(async () => {
    const reporter = await register('rp');
    reporterCookie = reporter.cookie;
    reporterId = reporter.userId;
    otherCookie = (await register('ro')).cookie;
    const seeded = await seedSeaBottle(reporterCookie);
    targetBottleId = seeded.bottleId;
  });

  it('举报 → 204 且落 PENDING 队列；重复举报各自留痕（不做去重，人工看）', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/reports',
      payload: { targetType: 'BOTTLE', targetId: targetBottleId, reason: '内容与曲目无关' },
      headers: { cookie: otherCookie },
    });
    expect(response.statusCode).toBe(204);

    const rows = await db.query<{ status: string; target_type: string; reporter_id: string }>(
      `select status, target_type, reporter_id from reports where target_id = $1`,
      [targetBottleId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0]?.status).toBe('PENDING');
    expect(rows[0]?.target_type).toBe('BOTTLE');
    expect(rows[0]?.reporter_id).not.toBe(reporterId);
  });

  it('非法 targetType → 400（body 契约层拒绝）；未登录 → 401', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/api/reports',
      payload: { targetType: 'USER', targetId: targetBottleId, reason: '乱填' },
      headers: { cookie: otherCookie },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ error: { violations: [] } }); // 传输层无码，靠状态区分

    const anonymous = await app.inject({
      method: 'POST',
      url: '/api/reports',
      payload: { targetType: 'BOTTLE', targetId: targetBottleId, reason: '乱填' },
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it('非管理员读队列 → 403 FORBIDDEN（权限在服务端校验，前端藏按钮不算）', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/reports',
      headers: { cookie: otherCookie },
    });
    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain('内容与曲目无关');
  });

  it('管理员：列表可见 → 决策端点**真实裁决**（t12 把 501 换成流转；逐条语义见 admin.integration.test.ts）', async () => {
    const admin = await register('ar');
    await db.query(`update users set role = 'ADMIN' where id = $1`, [admin.userId]);

    const created = await app.inject({
      method: 'POST',
      url: '/api/reports',
      payload: { targetType: 'BOTTLE', targetId: targetBottleId, reason: '听不懂' },
      headers: { cookie: reporterCookie },
    });
    expect(created.statusCode).toBe(204);

    const queue = await app.inject({
      method: 'GET',
      url: '/api/admin/reports',
      headers: { cookie: admin.cookie },
    });
    expect(queue.statusCode).toBe(200);
    const items = (queue.json() as unknown[]).map((item) => ReportSchema.parse(item));
    expect(items.length).toBeGreaterThan(0);

    // t12：驳回 = `NONE`；这里只钉住"不再是 501、状态真的流转"，四种动作的细节由 admin 套件覆盖
    const decided = await app.inject({
      method: 'POST',
      url: '/api/admin/reports/' + items[0]!.id + '/decision',
      payload: { decision: 'NONE' },
      headers: { cookie: admin.cookie },
    });
    expect(decided.statusCode).toBe(200);
    expect(ReportSchema.parse(decided.json()).status).toBe('REVIEWED');
  });

  it('无 cookie 读队列 → 401（未认证优先于未授权）', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/admin/reports' });
    expect(response.statusCode).toBe(401);
  });
});

describe('通知与徽章（CONTEXT §10.1 / ADR-014）：只读自己的，徽章现算不落库', () => {
  let cookie = '';
  let userId = '';
  let otherCookie = '';
  let notificationId = '';

  beforeAll(async () => {
    const user = await register('nt');
    cookie = user.cookie;
    userId = user.userId;
    otherCookie = (await register('no')).cookie;
  });

  it('未登录 → 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/notifications' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/me/badges' })).statusCode).toBe(401);
  });

  it('通知列表只含自己的；标记已读幂等 → 204；别人的通知 → 404（不泄露存在性）', async () => {
    const rows = await db.query<{ id: string }>(
      `insert into notifications (user_id, type, payload) values ($1, 'MESSAGE_DELIVERED', '{"bottleId":"b1"}'::jsonb) returning id`,
      [userId],
    );
    notificationId = rows[0]?.id ?? '';

    const list = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    const items = (
      list.json() as { items: { id: string; readAt: string | null; payload: unknown }[] }
    ).items;
    expect(items.map((item) => item.id)).toEqual([notificationId]);
    expect(items[0]?.readAt).toBeNull();

    const foreign = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { cookie: otherCookie },
    });
    expect((foreign.json() as { items: unknown[] }).items).toEqual([]);

    const read = await app.inject({
      method: 'POST',
      url: '/api/notifications/' + notificationId + '/read',
      headers: { cookie },
    });
    expect(read.statusCode).toBe(204);
    const marked = await db.query<{ read_at: Date | null }>(
      `select read_at from notifications where id = $1`,
      [notificationId],
    );
    expect(marked[0]?.read_at).not.toBeNull();

    const readAgain = await app.inject({
      method: 'POST',
      url: '/api/notifications/' + notificationId + '/read',
      headers: { cookie },
    });
    expect(readAgain.statusCode).toBe(204); // 幂等

    const stolen = await app.inject({
      method: 'POST',
      url: '/api/notifications/' + notificationId + '/read',
      headers: { cookie: otherCookie },
    });
    expect(stolen.statusCode).toBe(404); // 别人的通知：既不能读也不能标记
  });

  it('徽章是派生结果：只返回本人的、重复请求完全一致（没有徽章表）', async () => {
    const first = await app.inject({ method: 'GET', url: '/api/me/badges', headers: { cookie } });
    expect(first.statusCode).toBe(200);
    const awards = first.json() as { userId: string; kind: string; bottleId: string }[];
    expect(Array.isArray(awards)).toBe(true);
    for (const award of awards) {
      expect(award.userId).toBe(userId);
    }

    const second = await app.inject({ method: 'GET', url: '/api/me/badges', headers: { cookie } });
    expect(second.json()).toEqual(awards);

    const tables = await db.query<{ count: string }>(
      `select count(*)::text as count from information_schema.tables
       where table_schema = 'public' and table_name = 'badges'`,
    );
    expect(tables[0]?.count).toBe('0'); // ADR-014 #1：徽章不落库
  });
});
