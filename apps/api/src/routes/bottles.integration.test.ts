/**
 * 业务 API 级测试（t9 验收：每条规则至少一个 API 级用例 + 错误码/冲突语义可演示）。
 *
 * 覆盖：鉴权 401、规则违反 422、状态冲突 409、404、幂等（重复提交零副作用）、
 * ADR-015 语义（段号由内核决定、缺口显式、带缺口可入海 → 未完成区）。
 */
import { createSystemClock } from '@music-drift/shared/domain';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createDb, type Db } from '../db/client.js';
import { runSeed } from '../db/seed.js';
import { insertSong } from '../db/test-helpers.js';
import { createBottleStore } from '../store/bottles.js';
import { createRequestContext } from '../store/context.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
/** 注入时钟（ADR-005 不变式 4）：路由与 store 共用同一个假时钟实例。 */
const clock = createSystemClock();

/** 录音上传改走**原始二进制**（ADR-018）：body = 字节流，时长走请求头。 */
function webmPayload(size = 2048): Buffer {
  const magic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  return Buffer.concat([magic, Buffer.alloc(size - magic.length, 0x42)]);
}

function uploadHeaders(cookie: string, durationMs = 20_000): Record<string, string> {
  return { cookie, 'content-type': 'audio/webm', 'x-audio-duration-ms': String(durationMs) };
}
/** 满足 t6 的口令策略（含大小写与数字）。 */
const PASSWORD = 'Drift-Bottle-2026';

describe('业务 API：主流程 + 错误语义 + 幂等', () => {
  let db: Db;
  let app: FastifyInstance;
  let store: ReturnType<typeof createBottleStore>;
  let cookieA = '';
  let cookieB = '';
  let bottleId = '';
  let songId = '';
  let singerId = '';

  async function register(handle: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { handle, email: handle + '@example.com', password: PASSWORD },
    });
    expect(response.statusCode).toBe(201);
    const cookie = response.cookies.find((entry) => entry.name === 'mdb_session');
    expect(cookie).toBeDefined();
    return cookie === undefined ? '' : cookie.name + '=' + cookie.value;
  }

  async function countRows(sql: string): Promise<string | undefined> {
    const rows = await db.query<{ count: string }>(sql, [bottleId]);
    return rows[0]?.count;
  }

  beforeAll(async () => {
    db = await createDb(DATABASE_URL);
    app = buildApp({ db, clock });
    await app.ready();
    await runSeed(db);
    songId = await insertSong(db, 4);
    const suffix = Date.now().toString().slice(-6);
    cookieA = await register('a' + suffix);
    cookieB = await register('b' + suffix);
    const singer = await db.query<{ id: string }>(`select id from users where handle = $1`, [
      'b' + suffix,
    ]);
    singerId = singer[0]?.id ?? '';
    store = createBottleStore(db);
  });

  afterAll(async () => {
    await app.close();
    if (db !== undefined) {
      await db.close();
    }
  });

  it('未登录：发起漂流瓶 → 401 + 中文文案、不含内部细节', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/bottles', payload: { songId } });

    expect(response.statusCode).toBe(401);
    expect((response.json() as { error: { message: string } }).error.message).toContain('登录');
    expect(response.body).not.toContain('pg_');
  });

  it('发起：201 + DRAFT，缺口显式为 1..4（段号语义来自内核）', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/bottles',
      payload: { songId },
      headers: { cookie: cookieA },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      id: string;
      status: string;
      totalSegments: number;
      missingSegmentIndexes: number[];
      isComplete: boolean;
      seaZone: null;
    };
    bottleId = body.id;
    expect(body.status).toBe('DRAFT');
    expect(body.totalSegments).toBe(4);
    expect(body.missingSegmentIndexes).toEqual([1, 2, 3, 4]);
    expect(body.isComplete).toBe(false);
    expect(body.seaZone).toBe(null);
  });

  it('接唱：段号由服务端决定（第 1 段），响应回传 index 与 nextRecordIndex', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/segments',
      payload: webmPayload(),
      headers: uploadHeaders(cookieA),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { index: number; nextRecordIndex: number; segmentId: string };
    expect(body.index).toBe(1);
    expect(body.nextRecordIndex).toBe(2);
    expect(body.segmentId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('防滥用 422：同一用户在同一瓶子不能接唱两次（稳定码 + 中文文案）', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/segments',
      payload: webmPayload(),
      headers: uploadHeaders(cookieA),
    });

    expect(response.statusCode).toBe(422);
    const body = response.json() as {
      error: { message: string; violations: Array<{ code: string }> };
    };
    expect(body.error.violations.map((violation) => violation.code)).toEqual([
      'CANNOT_RECORD_TWICE_IN_BOTTLE',
    ]);
    expect(body.error.message).toContain('不能');
  });

  it('去向 422：发起者没有「回传」；合法「投河」→ 200 且状态变 IN_RIVER', async () => {
    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/resolution',
      payload: { resolution: 'RETURN' },
      headers: { cookie: cookieA },
    });
    expect(forbidden.statusCode).toBe(422);
    expect(
      (forbidden.json() as { error: { violations: Array<{ code: string }> } }).error.violations[0]
        ?.code,
    ).toBe('RESOLUTION_NOT_AVAILABLE');

    const cast = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/resolution',
      payload: { resolution: 'RIVER' },
      headers: { cookie: cookieA },
    });
    expect(cast.statusCode).toBe(200);
    expect((cast.json() as { status: string }).status).toBe('IN_RIVER');
  });

  it('捞取路由：可用、返回契约形状、不 5xx（河道是共享随机池）', async () => {
    const draw = await app.inject({
      method: 'POST',
      url: '/api/river/draw',
      headers: { cookie: cookieA },
    });

    // 河道是**全体**共享的随机池：捞到哪一支（或捞不到）取决于别的测试文件留下的瓶子。
    // 因此这里只钉「路由可用 + 契约形状 + 绝不 5xx」；「捞取归属/父链/一次只有一个赢家」
    // 由 store 级用例完整覆盖（`store/bottles.integration.test.ts`），那才是确定性的地方。
    expect([200, 409, 422]).toContain(draw.statusCode);
    if (draw.statusCode === 200) {
      const body = draw.json() as { bottle: { id: string; status: string; isHolder: boolean } };
      expect(body.bottle.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(body.bottle.status).toBe('HELD');
      expect(body.bottle.isHolder).toBe(true);
    }
  });

  it('接唱与去向（持有者走路由）：带缺口入海 → SEA、seaZone=INCOMPLETE、缺口显式（ADR-015 §16.4）', async () => {
    // 用 store **确定性地**把「我这一支瓶子」交给第二个账号（等价于捞取），避免依赖共享河道的随机结果；
    // 余下步骤全部走路由，覆盖 route → 内核 → 投影 的完整链路。
    const claimed = await store.drawFromRiver({
      bottleId,
      userId: singerId,
      ctx: createRequestContext(clock),
    });
    expect(claimed?.ok).toBe(true);
    const record = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/segments',
      payload: webmPayload(),
      headers: uploadHeaders(cookieB),
    });
    expect(record.statusCode).toBe(201);
    expect((record.json() as { index: number }).index).toBe(2);

    const sea = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/resolution',
      payload: { resolution: 'SEA' },
      headers: { cookie: cookieB },
    });

    expect(sea.statusCode).toBe(200);
    const body = sea.json() as {
      status: string;
      seaZone: string;
      isComplete: boolean;
      missingSegmentIndexes: number[];
    };
    expect(body.status).toBe('SEA');
    expect(body.isComplete).toBe(false);
    expect(body.seaZone).toBe('INCOMPLETE');
    expect(body.missingSegmentIndexes).toEqual([3, 4]);
  });

  it('幂等：已入海后重复提交同一去向 → 4xx 且零副作用（事件数、seaAt、持有行都不变）', async () => {
    const before = await app.inject({
      method: 'GET',
      url: '/api/bottles/' + bottleId,
      headers: { cookie: cookieB },
    });
    const seaAtBefore = (before.json() as { seaAt: string }).seaAt;
    const eventsBefore = await countRows(
      `select count(*)::text as count from events where bottle_id = $1`,
    );
    const holdingsBefore = await countRows(
      `select count(*)::text as count from holdings where bottle_id = $1 and released_at is null`,
    );

    const repeat = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/resolution',
      payload: { resolution: 'SEA' },
      headers: { cookie: cookieB },
    });

    expect([409, 422]).toContain(repeat.statusCode);
    const after = await app.inject({
      method: 'GET',
      url: '/api/bottles/' + bottleId,
      headers: { cookie: cookieB },
    });
    expect((after.json() as { seaAt: string }).seaAt).toBe(seaAtBefore);
    expect(await countRows(`select count(*)::text as count from events where bottle_id = $1`)).toBe(
      eventsBefore,
    );
    expect(
      await countRows(
        `select count(*)::text as count from holdings where bottle_id = $1 and released_at is null`,
      ),
    ).toBe(holdingsBefore);
  });

  it('404：未知瓶子；漂流日志可读且 seq 连续（时间线不泄漏后续内容）', async () => {
    const missing = await app.inject({
      method: 'GET',
      url: '/api/bottles/00000000-0000-4000-8000-000000000000',
      headers: { cookie: cookieB },
    });
    expect(missing.statusCode).toBe(404);

    const events = await app.inject({
      method: 'GET',
      url: '/api/bottles/' + bottleId + '/events',
      headers: { cookie: cookieB },
    });
    expect(events.statusCode).toBe(200);
    const list = events.json() as Array<{ seq: number; type: string; occurredAtMs: number }>;
    expect(list[0]?.type).toBe('BOTTLE_CREATED');
    expect(list.map((entry) => entry.seq)).toEqual(list.map((_entry, index) => index + 1));
  });

  it('曲库：空列表是合法状态（不返回 404 掩盖“没有歌”与“接口不存在”的区别）', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/songs' });

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
  });
});
