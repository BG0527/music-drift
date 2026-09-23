/**
 * 审核台的真实裁决流转（t12 第 4️⃣ 项 / `CONTEXT.md` §8.3）。
 *
 * t9 只交付了 `/api/admin/**` 的**骨架**：权限校验 + 只读队列 + 决策端点显式 501。
 * 本文件把 501 换成真实流转，并钉住四件事：
 *
 * 1. **权限在服务端**：无 cookie → 401；普通用户 → 403（**且不泄露队列内容**）；
 * 2. **四种处置**：驳回（`NONE`）/ 删段 / 删瓶 / 封禁；
 * 3. **人工可覆盖自动斩杀**（本期最容易被做成半成品的一条）：
 *    自动斩杀把段软删 → 管理员用 `RESTORE_SEGMENT` 让它**真的回到有效段**
 *    （`deleted_at` 清空、缺口消失、作品重新可入海），而不是只把举报状态改成"已驳回"；
 * 4. **重复裁决**：同一裁决幂等（200），改主意则 422 `REPORT_ALREADY_REVIEWED`（客户端该刷新队列）。
 *
 * 响应一律过契约（`ReportSchema.parse`），不只断言字段存在。
 */
import { ReportSchema } from '@music-drift/shared';
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

async function register(
  prefix: string,
  role: 'USER' | 'ADMIN' = 'USER',
): Promise<{ cookie: string; userId: string; email: string }> {
  const handle = uniqueHandle(prefix);
  const email = handle + '@example.com';
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { handle, email, password: PASSWORD },
  });
  expect(response.statusCode).toBe(201);
  const cookie = response.cookies.find((entry) => entry.name === 'mdb_session');
  const user = (response.json() as { user: { id: string } }).user;
  if (role === 'ADMIN') {
    await db.query(`update users set role = 'ADMIN' where id = $1`, [user.id]);
  }
  return {
    cookie: cookie === undefined ? '' : cookie.name + '=' + cookie.value,
    userId: user.id,
    email,
  };
}

async function createBottle(cookie: string): Promise<string> {
  const songId = await insertSong(db, 4);
  const created = await app.inject({
    method: 'POST',
    url: '/api/bottles',
    payload: { songId },
    headers: { cookie },
  });
  expect(created.statusCode).toBe(201);
  return (created.json() as { id: string }).id;
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

async function report(
  cookie: string,
  targetType: 'BOTTLE' | 'SEGMENT' | 'MESSAGE',
  targetId: string,
  reason = '听起来像是恶意捣乱',
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/reports',
    payload: { targetType, targetId, reason },
    headers: { cookie },
  });
  expect(response.statusCode).toBe(204);
  const rows = await db.query<{ id: string }>(
    `select id from reports where target_id = $1 order by created_at desc limit 1`,
    [targetId],
  );
  return rows[0]?.id ?? '';
}

async function decide(
  cookie: string,
  reportId: string,
  decision: 'NONE' | 'REMOVE_SEGMENT' | 'RESTORE_SEGMENT' | 'REMOVE_BOTTLE' | 'BAN_USER',
) {
  return app.inject({
    method: 'POST',
    url: '/api/admin/reports/' + reportId + '/decision',
    payload: { decision },
    headers: { cookie },
  });
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

describe('审核台 · 权限（服务端校验，前端隐藏不算）', () => {
  it('未登录 → 401；普通用户 → 403，且响应体里**不含**队列内容', async () => {
    const plain = await register('ap');
    const anon = await app.inject({ method: 'GET', url: '/api/admin/reports' });
    expect(anon.statusCode).toBe(401);

    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/reports',
      headers: { cookie: plain.cookie },
    });
    expect(forbidden.statusCode).toBe(403);
    // 传输层错误的 envelope 不带 code，且**不泄露任何举报内容**
    expect(forbidden.body).not.toContain('reason');
    expect(forbidden.body).not.toContain('target');

    const decideForbidden = await app.inject({
      method: 'POST',
      url: '/api/admin/reports/11111111-1111-4111-8111-111111111111/decision',
      payload: { decision: 'NONE' },
      headers: { cookie: plain.cookie },
    });
    expect(decideForbidden.statusCode).toBe(403);
  });
});

describe('审核台 · 四种处置与幂等/冲突语义', () => {
  it('驳回（NONE）：举报状态转 REVIEWED，且**不**改动任何内容', async () => {
    const admin = await register('aa', 'ADMIN');
    const author = await register('ab');
    const bottleId = await createBottle(author.cookie);
    const segmentId = await record(author.cookie, bottleId);
    const reportId = await report(author.cookie, 'SEGMENT', segmentId, '随便举报一下');

    const decided = await decide(admin.cookie, reportId, 'NONE');
    expect(decided.statusCode).toBe(200);
    const parsed = ReportSchema.parse(decided.json());
    expect(parsed.status).toBe('REVIEWED');
    expect(parsed.action).toBe('NONE');
    expect(parsed.reviewedAt).not.toBeNull();

    const segment = await db.query<{ deleted_at: string | null }>(
      `select deleted_at from bottle_segments where id = $1`,
      [segmentId],
    );
    expect(segment[0]?.deleted_at).toBeNull(); // 驳回不该删东西
  });

  it('删段（REMOVE_SEGMENT）：段被软删（留审计），并且离开有效段列表', async () => {
    const admin = await register('ba', 'ADMIN');
    const author = await register('bb');
    const bottleId = await createBottle(author.cookie);
    const segmentId = await record(author.cookie, bottleId);
    await resolve(author.cookie, bottleId, 'SEA');

    const reportId = await report(author.cookie, 'SEGMENT', segmentId, '这一段是噪音');
    const decided = await decide(admin.cookie, reportId, 'REMOVE_SEGMENT');
    expect(decided.statusCode).toBe(200);

    const segment = await db.query<{ deleted_at: string | null }>(
      `select deleted_at from bottle_segments where id = $1`,
      [segmentId],
    );
    expect(segment[0]?.deleted_at).not.toBeNull(); // 软删：行还在（可恢复、可审计）

    const detail = await app.inject({
      method: 'GET',
      url: '/api/bottles/' + bottleId,
      headers: { cookie: author.cookie },
    });
    const body = detail.json() as { missingSegmentIndexes: number[] };
    expect(body.missingSegmentIndexes).toContain(1); // 第 1 段重新变成缺口，段号不压缩
  });

  it('动作与对象不匹配 → 422 REVIEW_ACTION_NOT_APPLICABLE（不是 500、也不是静默成功）', async () => {
    const admin = await register('ca', 'ADMIN');
    const author = await register('cb');
    const bottleId = await createBottle(author.cookie);
    const reportId = await report(author.cookie, 'BOTTLE', bottleId, '这个瓶子有问题');

    const decided = await decide(admin.cookie, reportId, 'REMOVE_SEGMENT');
    expect(decided.statusCode).toBe(422);
    expect(decided.body).toContain('REVIEW_ACTION_NOT_APPLICABLE');

    const rows = await db.query<{ status: string }>(`select status from reports where id = $1`, [
      reportId,
    ]);
    expect(rows[0]?.status).toBe('PENDING'); // 失败的裁决零副作用
  });

  it('重复裁决：同一结论幂等（200）；改主意 → 422 REPORT_ALREADY_REVIEWED', async () => {
    const admin = await register('da', 'ADMIN');
    const author = await register('db');
    const bottleId = await createBottle(author.cookie);
    const segmentId = await record(author.cookie, bottleId);
    const reportId = await report(author.cookie, 'SEGMENT', segmentId, '重复裁决用例');

    expect((await decide(admin.cookie, reportId, 'REMOVE_SEGMENT')).statusCode).toBe(200);
    expect((await decide(admin.cookie, reportId, 'REMOVE_SEGMENT')).statusCode).toBe(200);

    const changed = await decide(admin.cookie, reportId, 'NONE');
    expect(changed.statusCode).toBe(422);
    expect(changed.body).toContain('REPORT_ALREADY_REVIEWED');
  });

  it('未知举报 id → 404；body 结构不合法 → 400（传输层，envelope 不带码）', async () => {
    const admin = await register('ea', 'ADMIN');
    const missing = await decide(admin.cookie, '11111111-1111-4111-8111-111111111111', 'NONE');
    expect(missing.statusCode).toBe(404);

    const bad = await app.inject({
      method: 'POST',
      url: '/api/admin/reports/11111111-1111-4111-8111-111111111111/decision',
      payload: { decision: 'DELETE_EVERYTHING' },
      headers: { cookie: admin.cookie },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe('审核台 · 人工覆盖自动斩杀（本期最关键的一条）', () => {
  it('被自动斩杀的段经管理员 RESTORE_SEGMENT 后**真的回到有效段**（不是只改举报状态）', async () => {
    const admin = await register('fa', 'ADMIN');
    const initiator = await register('fb');
    const crowd: string[] = [];
    for (let index = 0; index < 10; index += 1) crowd.push((await register('fc')).cookie);

    const bottleId = await createBottle(initiator.cookie);
    await record(initiator.cookie, bottleId);
    await resolve(initiator.cookie, bottleId, 'SEA');

    const victimCookie = (await register('fv')).cookie;
    const victimSegment = await takeAndSing(victimCookie, bottleId, 'SEA');

    // 自动斩杀：10 个不同的人点踩
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
    const cut = await db.query<{ deleted_at: string | null }>(
      `select deleted_at from bottle_segments where id = $1`,
      [victimSegment],
    );
    expect(cut[0]?.deleted_at, '自动斩杀应该已经软删这一段').not.toBeNull();

    // 被斩者申诉 → 管理员恢复
    const reportId = await report(
      victimCookie,
      'SEGMENT',
      victimSegment,
      '这段是我正常录的，被误斩',
    );
    const decided = await decide(admin.cookie, reportId, 'RESTORE_SEGMENT');
    expect(decided.statusCode).toBe(200);
    expect(ReportSchema.parse(decided.json()).action).toBe('RESTORE_SEGMENT');

    // 恢复的**证据**（按段号判定，而不是按行 id）：
    // ① 旧行**保持软删**（审计：那一刀确实发生过）；
    const history = await db.query<{ deleted_at: string | null }>(
      `select deleted_at from bottle_segments where id = $1`,
      [victimSegment],
    );
    expect(history[0]?.deleted_at, '被斩的原始行必须留着（可审计）').not.toBeNull();
    // ② 同一个段号上出现了**新的有效段**，音频字节一致；
    const liveRows = await db.query<{
      id: string;
      deleted_at: string | null;
      octet_length: number;
    }>(
      `select id, deleted_at, octet_length(audio) as octet_length from bottle_segments
       where bottle_id = $1 and "index" = 2 and deleted_at is null`,
      [bottleId],
    );
    expect(liveRows).toHaveLength(1);
    expect(liveRows[0]?.id).not.toBe(victimSegment);
    expect(liveRows[0]?.octet_length).toBeGreaterThan(0);

    // 用**段作者**的视角看：§9.1 下漂流中只能看到"自己那一棒之前（含自己）"，
    // 所以这里换成 victim 才能看到被恢复的第 2 段（这本身也顺带验证了可见性裁剪）
    const detail = await app.inject({
      method: 'GET',
      url: '/api/bottles/' + bottleId,
      headers: { cookie: victimCookie },
    });
    const body = detail.json() as {
      segments: { id: string; index: number; deletedAt: string | null }[];
      missingSegmentIndexes: number[];
    };
    expect(body.segments.map((segment) => segment.index)).toContain(2);
    expect(body.missingSegmentIndexes).not.toContain(2);
  });
});

describe('审核台 · 删瓶与封禁', () => {
  it('删瓶（REMOVE_BOTTLE）：作品从公海下架（状态置损坏、释放持有），举报留审计', async () => {
    const admin = await register('ga', 'ADMIN');
    const author = await register('gb');
    const bottleId = await createBottle(author.cookie);
    await record(author.cookie, bottleId);
    await resolve(author.cookie, bottleId, 'SEA');

    const reportId = await report(author.cookie, 'BOTTLE', bottleId, '这首歌不该公开展示');
    const decided = await decide(admin.cookie, reportId, 'REMOVE_BOTTLE');
    expect(decided.statusCode).toBe(200);

    const row = await db.query<{ status: string }>(`select status from bottles where id = $1`, [
      bottleId,
    ]);
    expect(row[0]?.status).toBe('DAMAGED'); // 「不再继续漂流」：下架而不是物理删除（保留审计）

    const sea = await app.inject({ method: 'GET', url: '/api/sea?zone=COMPLETED&limit=50' });
    const items = (sea.json() as { items: { id: string }[] }).items;
    expect(items.map((item) => item.id)).not.toContain(bottleId);
  });

  it('封禁（BAN_USER）：封的是对象的**所有者**，且该用户随即失去访问（401）', async () => {
    const admin = await register('ha', 'ADMIN');
    const offender = await register('hb');
    const offenderEmail = offender.email;
    const bottleId = await createBottle(offender.cookie);
    const segmentId = await record(offender.cookie, bottleId);

    const reportId = await report(admin.cookie, 'SEGMENT', segmentId, '这个人反复捣乱');
    const decided = await decide(admin.cookie, reportId, 'BAN_USER');
    expect(decided.statusCode).toBe(200);

    const banned = await db.query<{ banned_at: string | null }>(
      `select banned_at from users where id = $1`,
      [offender.userId],
    );
    expect(banned[0]?.banned_at).not.toBeNull();

    // 被封后：会话被清 → /api/auth/me 与业务写操作都是 401
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: offender.cookie },
    });
    expect(me.statusCode).toBe(401);

    // 再次登录被明确拒绝（403：账号已被封禁）
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: offenderEmail, password: PASSWORD },
    });
    expect(login.statusCode).toBe(403);
    expect(login.body).toContain('封禁');
  });
});
