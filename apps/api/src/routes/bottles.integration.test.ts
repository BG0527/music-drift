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

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
/** 满足 t6 的口令策略（含大小写与数字）。 */
const PASSWORD = 'Drift-Bottle-2026';

describe('业务 API：主流程 + 错误语义 + 幂等', () => {
  let db: Db;
  let app: FastifyInstance;
  let cookieA = '';
  let cookieB = '';
  let bottleId = '';
  let songId = '';

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
    app = buildApp({ db, clock: createSystemClock() });
    await app.ready();
    await runSeed(db);
    songId = await insertSong(db, 4);
    const suffix = Date.now().toString().slice(-6);
    cookieA = await register('a' + suffix);
    cookieB = await register('b' + suffix);
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
      payload: { note: '第一段', durationMs: 20_000 },
      headers: { cookie: cookieA },
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
      payload: { note: null },
      headers: { cookie: cookieA },
    });

    expect(response.statusCode).toBe(422);
    const body = response.json() as { error: { message: string; violations: Array<{ code: string }> } };
    expect(body.error.violations.map((violation) => violation.code)).toEqual(['CANNOT_RECORD_TWICE_IN_BOTTLE']);
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
      (forbidden.json() as { error: { violations: Array<{ code: string }> } }).error.violations[0]?.code,
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

  it('捞取：唱过的账号捞不到（409/422）；新账号捞到 → HELD 且 isHolder=true', async () => {
    const ownBottle = await app.inject({ method: 'POST', url: '/api/river/draw', headers: { cookie: cookieA } });
    expect([409, 422]).toContain(ownBottle.statusCode);

    const draw = await app.inject({ method: 'POST', url: '/api/river/draw', headers: { cookie: cookieB } });
    expect(draw.statusCode).toBe(200);
    const body = draw.json() as {
      bottle: { id: string; status: string; isHolder: boolean; availableResolutions: string[] };
    };
    expect(body.bottle.id).toBe(bottleId);
    expect(body.bottle.status).toBe('HELD');
    expect(body.bottle.isHolder).toBe(true);
    expect(body.bottle.availableResolutions).toEqual(['RIVER', 'RETURN', 'SEA']);
  });

  it('带缺口入海：SEA 且 seaZone=INCOMPLETE、缺口显式（ADR-015 §16.4）', async () => {
    const record = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/segments',
      payload: { note: null, durationMs: 20_000 },
      headers: { cookie: cookieB },
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
    const eventsBefore = await countRows(`select count(*)::text as count from events where bottle_id = $1`);
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
    expect(await countRows(`select count(*)::text as count from events where bottle_id = $1`)).toBe(eventsBefore);
    expect(
      await countRows(`select count(*)::text as count from holdings where bottle_id = $1 and released_at is null`),
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
