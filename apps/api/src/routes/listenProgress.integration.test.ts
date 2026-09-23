/**
 * t20：已听覆盖率的服务端持久化 + 点踩门槛由服务端判定（真库集成）。
 *
 * 这一组测试要证明的**不是"接口能通"**，而是四条不能被绕过的事实：
 * 1. 覆盖率**落库**、跨请求/跨 app 实例保留（"退出再回来不清零"）；
 * 2. 覆盖率语义与内核 `ListenTracker` **同一条规则**（拖动不计、循环不叠加、时长不可信→0）；
 * 3. 上报只是**增量输入**：只增不减，且单次伪造跨不过门槛；
 * 4. 点赞/点踩都真实落库、可分别统计，但**只有踩数**驱动斩浪（§7.1）。
 *
 * 时间用**可控假时钟**推进（`buildApp({clock})`）：门槛按"真实墙上时间增长率"限速，
 * 真等待会让测试又慢又飘 —— 假时钟能精确验证"等多久才够"。
 */
import { DEFAULT_POLICY } from '@music-drift/shared/domain';
import { createListenTracker } from '@music-drift/shared/audio';
import {
  CastVoteResponseSchema,
  ErrorResponseSchema,
  ListenProgressResponseSchema,
} from '@music-drift/shared/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createDb, type Db } from '../db/client.js';
import { runSeed } from '../db/seed.js';
import { insertSong } from '../db/test-helpers.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
const PASSWORD = 'Drift-Bottle-2026';
const SEGMENT_DURATION_MS = 30_000;

/** 可控时钟：门槛按墙上时间限速，测试用假时钟精确推进（API 层禁 `Date.now()`，只能注入）。 */
class FakeClock {
  private current = 1_760_000_000_000;

  now(): number {
    return this.current;
  }

  advance(ms: number): void {
    this.current += ms;
  }
}

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
let clock: FakeClock;
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

/** 发起 + 录第 1 段（30s）→ 返回瓶子与段 id。 */
async function createSegment(cookie: string): Promise<{ bottleId: string; segmentId: string }> {
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
    headers: {
      cookie,
      'content-type': 'audio/webm',
      'x-audio-duration-ms': String(SEGMENT_DURATION_MS),
    },
  });
  expect(recorded.statusCode).toBe(201);
  return { bottleId, segmentId: (recorded.json() as { segmentId: string }).segmentId };
}

async function report(cookie: string, segmentId: string, coveredMs: number) {
  return await app.inject({
    method: 'POST',
    url: '/api/segments/' + segmentId + '/listen',
    payload: { coveredMs },
    headers: { cookie },
  });
}

/** 正常听满：两次上报 + 让假时钟走过 10 秒（首次只能拿一半，之后按真实时间增长）。 */
async function listenToCompletion(cookie: string, segmentId: string): Promise<void> {
  const first = await report(cookie, segmentId, SEGMENT_DURATION_MS);
  expect(first.statusCode).toBe(200);
  clock.advance(10_000);
  const second = await report(cookie, segmentId, SEGMENT_DURATION_MS);
  expect(second.statusCode).toBe(200);
  expect(ListenProgressResponseSchema.parse(second.json()).reachedThreshold).toBe(true);
}

async function vote(cookie: string, segmentId: string, value: 'LIKE' | 'DISLIKE') {
  return await app.inject({
    method: 'POST',
    url: '/api/segments/' + segmentId + '/votes',
    payload: { value },
    headers: { cookie },
  });
}

beforeAll(async () => {
  db = await createDb(DATABASE_URL);
  clock = new FakeClock();
  app = buildApp({ db, clock });
  await app.ready();
  await runSeed(db);
});

afterAll(async () => {
  await app.close();
  if (db !== undefined) {
    await db.close();
  }
});

describe('POST /api/segments/:id/listen（上报已听覆盖率）', () => {
  it('未登录 401；段不存在 404；body 非法 400', async () => {
    const owner = await register('lp');
    const { segmentId } = await createSegment(owner.cookie);

    const anonymous = await app.inject({
      method: 'POST',
      url: '/api/segments/' + segmentId + '/listen',
      payload: { coveredMs: 1 },
    });
    expect(anonymous.statusCode).toBe(401);

    const missing = await report(owner.cookie, '00000000-0000-4000-8000-000000000000', 1);
    expect(missing.statusCode).toBe(404);

    const malformed = await app.inject({
      method: 'POST',
      url: '/api/segments/' + segmentId + '/listen',
      payload: { coveredMs: -1 },
      headers: { cookie: owner.cookie },
    });
    expect(malformed.statusCode).toBe(400);
  });

  it('上报 → 200 + 真响应过 Schema.parse；门槛来自内核策略（不写死 0.8）', async () => {
    const owner = await register('lp');
    const listener = await register('lp');
    const { segmentId } = await createSegment(owner.cookie);

    const response = await report(listener.cookie, segmentId, 3_000);
    expect(response.statusCode).toBe(200);
    const body = ListenProgressResponseSchema.parse(response.json());

    expect(body.segmentId).toBe(segmentId);
    expect(body.coveredMs).toBe(3_000);
    expect(body.durationMs).toBe(SEGMENT_DURATION_MS); // 时长来自段行（上传时校验写入），不是请求体
    expect(body.threshold).toBe(DEFAULT_POLICY.dislikeListenRatioThreshold);
    expect(body.ratio).toBeCloseTo(3_000 / SEGMENT_DURATION_MS, 5);
    expect(body.reachedThreshold).toBe(false);
  });

  it('时长不可信（段没有 durationMs）→ fail-closed：覆盖率恒 0、门槛永不解锁', async () => {
    const owner = await register('lp');
    const listener = await register('lp');
    const { segmentId } = await createSegment(owner.cookie);
    await db.query(`update bottle_segments set duration_ms = null where id = $1`, [segmentId]);

    const response = await report(listener.cookie, segmentId, SEGMENT_DURATION_MS);
    expect(response.statusCode).toBe(200);
    const body = ListenProgressResponseSchema.parse(response.json());

    expect(body.durationMs).toBe(0);
    expect(body.ratio).toBe(0);
    expect(body.reachedThreshold).toBe(false);
    expect((await vote(listener.cookie, segmentId, 'DISLIKE')).statusCode).toBe(422);
  });
});

describe('覆盖率持久化：跨请求、跨 app 实例保留（退出再回来不清零）', () => {
  it('上报值落库；换一个 app 实例（模拟重启）后判定仍用库里的进度', async () => {
    const owner = await register('ps');
    const listener = await register('ps');
    const { segmentId } = await createSegment(owner.cookie);

    await listenToCompletion(listener.cookie, segmentId);

    // 1) 库里有这行 —— "持久化"的直接证据，而不是某个进程的内存态
    const rows = await db.query<{ covered_ms: number; duration_ms: number }>(
      `select covered_ms, duration_ms from listen_progress where user_id = $1 and segment_id = $2`,
      [listener.userId, segmentId],
    );
    expect(rows[0]?.covered_ms).toBe(SEGMENT_DURATION_MS);
    expect(rows[0]?.duration_ms).toBe(SEGMENT_DURATION_MS);

    // 2) 全新 app 实例（同库、同会话 cookie）→ 点踩直接通过：判定不依赖任何进程内状态
    const restarted = buildApp({ db, clock });
    await restarted.ready();
    try {
      const response = await restarted.inject({
        method: 'POST',
        url: '/api/segments/' + segmentId + '/votes',
        payload: { value: 'DISLIKE' },
        headers: { cookie: listener.cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(CastVoteResponseSchema.parse(response.json()).listenedRatio).toBeGreaterThanOrEqual(
        DEFAULT_POLICY.dislikeListenRatioThreshold,
      );
    } finally {
      await restarted.close();
    }
  });

  it('只增不减：先报大值再报小值，判定仍以最大值为准', async () => {
    const owner = await register('mx');
    const listener = await register('mx');
    const { segmentId } = await createSegment(owner.cookie);

    await listenToCompletion(listener.cookie, segmentId);
    const lowered = await report(listener.cookie, segmentId, 1_000);
    expect(lowered.statusCode).toBe(200);
    expect(ListenProgressResponseSchema.parse(lowered.json()).ratio).toBeGreaterThanOrEqual(
      DEFAULT_POLICY.dislikeListenRatioThreshold,
    );
    expect((await vote(listener.cookie, segmentId, 'DISLIKE')).statusCode).toBe(200);
  });

  it('契约字段 listenedRatio 不再被采信：伪造成 1 也点不了踩（判定看库）', async () => {
    const owner = await register('fg');
    const listener = await register('fg');
    const { segmentId } = await createSegment(owner.cookie);

    const response = await app.inject({
      method: 'POST',
      url: '/api/segments/' + segmentId + '/votes',
      payload: { value: 'DISLIKE', listenedRatio: 1 }, // 旧客户端仍会发这个字段
      headers: { cookie: listener.cookie },
    });

    expect(response.statusCode).toBe(422);
    const envelope = ErrorResponseSchema.parse(response.json());
    expect(envelope.error.violations[0]?.code).toBe('LISTEN_THRESHOLD_NOT_REACHED');
    expect(envelope.error.message).toContain('80%');
    const votes = await db.query<{ count: string }>(
      `select count(*)::text as count from votes where segment_id = $1`,
      [segmentId],
    );
    expect(votes[0]?.count).toBe('0'); // 被拒的票零副作用
  });

  it('单次伪造上报跨不过门槛：一次报满 → 最多拿到段长一半（< 门槛）', async () => {
    const owner = await register('one');
    const listener = await register('one');
    const { segmentId } = await createSegment(owner.cookie);

    const forged = await report(listener.cookie, segmentId, 999_999);
    const progress = ListenProgressResponseSchema.parse(forged.json());
    expect(progress.coveredMs).toBe(SEGMENT_DURATION_MS / 2);
    expect(progress.ratio).toBeLessThan(DEFAULT_POLICY.dislikeListenRatioThreshold);

    const response = await vote(listener.cookie, segmentId, 'DISLIKE');
    expect(response.statusCode).toBe(422);
    expect(response.body).toContain('LISTEN_THRESHOLD_NOT_REACHED');

    // 紧接着再伪造一次也拿不到多少（按真实时间限速）
    const again = ListenProgressResponseSchema.parse((await report(listener.cookie, segmentId, 999_999)).json());
    expect(again.ratio).toBeLessThan(DEFAULT_POLICY.dislikeListenRatioThreshold);
  });

  it('覆盖率语义与内核 ListenTracker 一致：拖动不计、循环不叠加（端到端同一条规则）', async () => {
    const owner = await register('tr');
    const listener = await register('tr');
    const { segmentId } = await createSegment(owner.cookie);

    // 用**内核同一个** tracker 造一段带拖动与循环的播放历史：
    //   0→10s 正常播放 → seeking 跳到 20s（拖动不计）→ 20→22s → 再跳回 5s 重播（已覆盖，不叠加）
    const tracker = createListenTracker({ durationMs: SEGMENT_DURATION_MS });
    tracker.observe(0);
    for (let positionMs = 500; positionMs <= 10_000; positionMs += 500) {
      tracker.observe(positionMs);
    }
    tracker.markSeek();
    tracker.observe(20_000);
    for (let positionMs = 20_500; positionMs <= 22_000; positionMs += 500) {
      tracker.observe(positionMs);
    }
    tracker.markSeek();
    tracker.observe(5_000);
    for (let positionMs = 5_500; positionMs <= 8_000; positionMs += 500) {
      tracker.observe(positionMs);
    }
    const local = tracker.progress();

    const response = await report(listener.cookie, segmentId, local.coveredMs);
    expect(response.statusCode).toBe(200);
    const server = ListenProgressResponseSchema.parse(response.json());

    // 拖动跳过的 10–20s **不在**覆盖率里；重复听的 5–8s **不叠加**
    expect(local.coveredMs).toBeGreaterThan(11_000);
    expect(local.coveredMs).toBeLessThan(13_000);
    // 服务端与客户端用同一个模块判比率 ⇒ 两端必然同值、同结论
    expect(server.coveredMs).toBe(Math.min(local.coveredMs, SEGMENT_DURATION_MS));
    expect(server.ratio).toBeCloseTo(local.ratio, 10);
    expect(server.threshold).toBe(tracker.threshold);
    expect(server.reachedThreshold).toBe(local.dislikeUnlocked);
  });
});

describe('点赞/点踩：都落库、可分别统计；只有踩数驱动斩浪（§7.1）', () => {
  it('点赞不需要听满；10 个赞不斩浪，同一批用户补上踩数到阈值才斩', async () => {
    const owner = await register('cd');
    const { segmentId } = await createSegment(owner.cookie);

    const voters: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      const voter = await register('cv');
      await listenToCompletion(voter.cookie, segmentId); // 只有踩需要听满；先让条件都成立
      voters.push(voter.cookie);
    }

    // 先投 10 个赞 → 段仍在（赞不参与斩杀）
    for (const cookie of voters) {
      const response = await vote(cookie, segmentId, 'LIKE');
      expect(response.statusCode).toBe(200);
      expect(CastVoteResponseSchema.parse(response.json()).segmentCut).toBe(false);
    }
    const afterLikes = await db.query<{ likes: string; dislikes: string; live: string }>(
      `select (select count(*)::text from votes where segment_id = $1 and value = 'LIKE') as likes,
              (select count(*)::text from votes where segment_id = $1 and value = 'DISLIKE') as dislikes,
              (select count(*)::text from bottle_segments where id = $1 and deleted_at is null) as live`,
      [segmentId],
    );
    expect(afterLikes[0]?.likes).toBe('10');
    expect(afterLikes[0]?.dislikes).toBe('0');
    expect(afterLikes[0]?.live).toBe('1'); // 10 个赞没有斩掉它

    // 再投 10 个踩（同一批用户 → 一赞一踩并存，仍是"已接受的行为"）→ 第 10 个踩触发斩浪
    let cut = false;
    for (const cookie of voters) {
      const response = await vote(cookie, segmentId, 'DISLIKE');
      expect(response.statusCode).toBe(200);
      cut = CastVoteResponseSchema.parse(response.json()).segmentCut || cut;
    }
    expect(cut).toBe(true);

    const final = await db.query<{ likes: string; dislikes: string; live: string }>(
      `select (select count(*)::text from votes where segment_id = $1 and value = 'LIKE') as likes,
              (select count(*)::text from votes where segment_id = $1 and value = 'DISLIKE') as dislikes,
              (select count(*)::text from bottle_segments where id = $1 and deleted_at is null) as live`,
      [segmentId],
    );
    expect(final[0]?.likes).toBe('10');
    expect(final[0]?.dislikes).toBe('10');
    expect(final[0]?.live).toBe('0'); // 斩浪的只有踩数
  });
});
