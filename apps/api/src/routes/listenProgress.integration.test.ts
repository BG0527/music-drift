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
  type ListenProgressResponse,
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

  /**
   * t25 / F1（review 阻断项）的**回归钉**：原实现的宽限 `RATE_SLACK_MS` 是**按请求**发放的
   * （`cap = previous + floor(elapsed×1.25) + 3000`），于是零播放、零延时、连打 3–4 次即跨过 80%。
   * 这里用真 HTTP + 真库 + 不推进假时钟复现同一攻击，要求**恒不达标**且点踩拿 422。
   */
  it('t25/F1：N=10 次即时上报（零播放、零延时）仍跨不过门槛，点踩必须 422', async () => {
    const owner = await register('at');
    const listener = await register('at');
    const { segmentId } = await createSegment(owner.cookie);

    let last: ListenProgressResponse | undefined;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await report(listener.cookie, segmentId, SEGMENT_DURATION_MS);
      expect(response.statusCode).toBe(200);
      const progress = ListenProgressResponseSchema.parse(response.json());
      last = progress;
      // 每一次都必须不达标（不是"最后不达标"，是**全程**不达标）
      expect(progress.reachedThreshold).toBe(false);
      expect(progress.ratio).toBeLessThan(DEFAULT_POLICY.dislikeListenRatioThreshold);
    }
    expect(last?.reachedThreshold).toBe(false);
    expect(last?.ratio).toBeLessThan(DEFAULT_POLICY.dislikeListenRatioThreshold);
    // 硬上限：零延时连打最多到「首次预算 + 一次宽限」= 0.5×30s + 3s
    expect(last?.coveredMs).toBe(18_000);

    const rejected = await vote(listener.cookie, segmentId, 'DISLIKE');
    expect(rejected.statusCode).toBe(422);
    expect(rejected.body).toContain('LISTEN_THRESHOLD_NOT_REACHED');
    const votes = await db.query<{ count: string }>(
      `select count(*)::text as count from votes where segment_id = $1`,
      [segmentId],
    );
    expect(votes[0]?.count).toBe('0'); // 被拒的票零副作用
  });

  it('t25 回归：正常 1×/秒实时上报持续增长并最终达到门槛（修漏洞不废掉正常路径）', async () => {
    const owner = await register('rt');
    const listener = await register('rt');
    const { segmentId } = await createSegment(owner.cookie);

    const ratios: number[] = [];
    for (let second = 0; second < 15; second += 1) {
      clock.advance(1_000); // 真实播放 1 秒
      const response = await report(listener.cookie, segmentId, SEGMENT_DURATION_MS);
      expect(response.statusCode).toBe(200);
      ratios.push(ListenProgressResponseSchema.parse(response.json()).ratio);
    }

    // 单调不减
    for (let index = 1; index < ratios.length; index += 1) {
      expect(ratios[index]!).toBeGreaterThanOrEqual(ratios[index - 1]!);
    }
    // 有限次内达到门槛，且此时点踩被接受
    expect(ratios[ratios.length - 1]!).toBeGreaterThanOrEqual(
      DEFAULT_POLICY.dislikeListenRatioThreshold,
    );
    expect((await vote(listener.cookie, segmentId, 'DISLIKE')).statusCode).toBe(200);
  });

  /**
   * ⚠️ 标题按它**真正证明的东西**写（t25/F3 收敛）：这条**不是**「服务端与内核同一条覆盖率规则」——
   * 服务端不重算 span，它只把客户端上报的数字（在段长上限内）记账 + 用共享函数算比率。
   * 它证明的是：内核 tracker 的**区间并集语义**（拖动不计、循环不叠加）在端到端上报后
   * 由服务端原样记账，且两端用**同一个** `listenedRatio`/`canDislike` 得出同一结论。
   * 「服务端不照抄客户端数字」由下面两条判别用例单独证明。
   */
  it('内核 tracker 的区间并集语义（拖动不计、循环不叠加）经上报被服务端原样+上限记账', async () => {
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
    // 这条断言**只**证明「服务端把客户端数字（在段长上限内）原样记账、比率用同一个共享函数算」，
    // 不能证明「服务端自己按 span 重算过覆盖率」—— 服务端不重算（见下面两条判别用例）。
    expect(server.coveredMs).toBe(Math.min(local.coveredMs, SEGMENT_DURATION_MS));
    expect(server.ratio).toBeCloseTo(local.ratio, 10);
    expect(server.threshold).toBe(tracker.threshold);
    expect(server.reachedThreshold).toBe(local.dislikeUnlocked);
  });

  it('F3 判别：服务端**不照抄**客户端数字（自身限速在起作用）', async () => {
    const owner = await register('cp');
    const listener = await register('cp');
    const { segmentId } = await createSegment(owner.cookie);

    // 客户端声称 25s（低于段长、够得着门槛），但首次上报的服务端上限 = 段长一半
    const response = await report(listener.cookie, segmentId, 25_000);
    const server = ListenProgressResponseSchema.parse(response.json());

    expect(server.coveredMs).toBe(SEGMENT_DURATION_MS / 2);
    expect(server.coveredMs).not.toBe(25_000); // 若相等，说明服务端只是"照抄+判比率"
    expect(server.reachedThreshold).toBe(false);
  });

  it('F3 判别：客户端报 0 不会回退服务端已记的进度（记账权威在服务端）', async () => {
    const owner = await register('zb');
    const listener = await register('zb');
    const { segmentId } = await createSegment(owner.cookie);

    await report(listener.cookie, segmentId, 12_000);
    clock.advance(4_000);
    const grown = ListenProgressResponseSchema.parse((await report(listener.cookie, segmentId, 20_000)).json());

    const regressed = ListenProgressResponseSchema.parse((await report(listener.cookie, segmentId, 0)).json());

    expect(regressed.coveredMs).toBe(grown.coveredMs); // 只增不减，不采信 0
    expect(regressed.coveredMs).toBeGreaterThan(0);
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
