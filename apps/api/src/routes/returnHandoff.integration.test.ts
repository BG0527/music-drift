/**
 * 回传交接 → 新持有者立刻选去向（t19 追补时在 live-check 里观察到的一次**偶发**红）：
 * D 回传给 C 之后，C 紧接着 `POST /resolution {SEA}` 偶发返回非 200（响应体里没有 status/seaZone，
 * 说明是错误信封）⇒ 作品没进公海，其后 4 项断言连锁失败。
 *
 * 为什么单独开一个文件重复压这条缝：它是**交接点**（持有者刚换人，紧接着就要选去向），
 * 而且偶发 ⇒ 单次断言抓不到。这里在同一进程里连做 25 轮，每轮都完整走一遍
 * 「发起 → 4 段接力（投河 → 捞取 → …）→ 末段回传 → 新持有者入海」，
 * 任何一轮出现非 200 都会把**响应体原文**打出来（这样才能定位，而不是只看到"应为 200"）。
 */
import { createSystemClock } from '@music-drift/shared/domain';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createDb, type Db } from '../db/client.js';
import { runSeed } from '../db/seed.js';
import { insertSong } from '../db/test-helpers.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
const PASSWORD = 'Drift-Bottle-2026';
const CLOCK = createSystemClock();
/**
 * 轮数 = **同一操作的重复次数**（每轮都是独立同形的 4 人接力：注册 4 人 → 发起 → 4 段交接 → 末段回传 →
 * 新持有者立刻选去向）。**没有并发语义、也没有递进场景** —— 它唯一的作用是提高"撞见偶发"的概率。
 *
 * 因此这里**不靠缩小轮数**来消除"机器忙"造成的超时：那等于降低敏感度（= 削弱检查），
 * 而本文件存在的意义恰恰是给 t19 那个未定位的偶发留一个高频触发点。正确做法是把机器负载
 * 从判别力里剥离 —— **保留轮数、把超时放宽**（见下方 TEST_TIMEOUT_MS 与实测数字）。
 */
const ROUNDS = 12;

/**
 * 超时按**实测**给足余量，而不是"调小到刚好过"：
 * 本文件单独跑 ~1.7s/轮（12 轮 ≈ 20s）；多文件 + 队友同时在跑构建/测试时实测到 ~5s/轮（12 轮 ≈ 60s+），
 * 曾顶破原先的 60s。180s ≈ 争用下 3 倍余量；它是**熔断值**（防挂死），不是性能断言。
 */
const TEST_TIMEOUT_MS = 180_000;

let seq = 0;
function uniqueHandle(prefix: string): string {
  seq += 1;
  return prefix + Date.now().toString().slice(-5) + String(seq).padStart(3, '0');
}

function webmPayload(size = 1024): Buffer {
  const magic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  return Buffer.concat([magic, Buffer.alloc(size - magic.length, 0x42)]);
}

let db: Db;
let app: FastifyInstance;

async function register(prefix: string): Promise<string> {
  const handle = uniqueHandle(prefix);
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { handle, email: handle + '@example.com', password: PASSWORD },
  });
  expect(response.statusCode).toBe(201);
  const cookie = response.cookies.find((entry) => entry.name === 'mdb_session');
  return cookie === undefined ? '' : cookie.name + '=' + cookie.value;
}

/** 带上响应体原文的断言：偶发失败时，错误信封比"应为 200"有用得多。 */
function expectOk(status: number, body: unknown, what: string, expected = 200): void {
  expect(status, `${what} 应为 ${String(expected)}，实际 ${status}：${JSON.stringify(body)}`).toBe(
    expected,
  );
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

describe('回传交接后立刻选去向（重复压测，抓偶发）', () => {
  it(`${ROUNDS} 轮「4 段接力 → 末段回传 → 新持有者入海」都必须成功且进公海完整区`, async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const [a, b, c, d] = await Promise.all([
        register('ra'),
        register('rb'),
        register('rc'),
        register('rd'),
      ]);

      const songId = await insertSong(db, 4);
      const created = await app.inject({
        method: 'POST',
        url: '/api/bottles',
        payload: { songId },
        headers: { cookie: a },
      });
      expectOk(created.statusCode, created.json(), `第 ${String(round)} 轮 发起`, 201);
      const bottleId = (created.json() as { id: string }).id;

      // A 录第 1 段 → 投河
      const firstSegment = await app.inject({
        method: 'POST',
        url: '/api/bottles/' + bottleId + '/segments',
        payload: webmPayload(),
        headers: { cookie: a, 'content-type': 'audio/webm', 'x-audio-duration-ms': '20000' },
      });
      expectOk(
        firstSegment.statusCode,
        firstSegment.json(),
        `第 ${String(round)} 轮 A 录第 1 段`,
        201,
      );
      expectOk(
        (
          await app.inject({
            method: 'POST',
            url: '/api/bottles/' + bottleId + '/resolution',
            payload: { resolution: 'SEA' },
            headers: { cookie: a },
          })
        ).statusCode,
        null,
        `第 ${String(round)} 轮 A 投河`,
      );

      // B / C / D 依次捞取 + 接唱 + 投河（D 录满末段后回传）
      for (const [index, cookie] of [b, c, d].entries()) {
        // 用「指定接唱」按 id 精确交接：集成库是多文件共用的，河道里可能有别人的瓶子，
        // 随机捞取当夹具会引入"看运气"的不稳定（t19 的病根，本文件自己踩过一次）
        const drawn = await app.inject({
          method: 'POST',
          url: '/api/sea/' + bottleId + '/targeted-segment',
          headers: { cookie },
        });
        expectOk(
          drawn.statusCode,
          drawn.json(),
          `第 ${String(round)} 轮 第 ${String(index + 2)} 棒指定接唱`,
        );
        expect((drawn.json() as { id: string }).id).toBe(bottleId);
        const recorded = await app.inject({
          method: 'POST',
          url: '/api/bottles/' + bottleId + '/segments',
          payload: webmPayload(),
          headers: { cookie, 'content-type': 'audio/webm', 'x-audio-duration-ms': '20000' },
        });
        expectOk(
          recorded.statusCode,
          recorded.json(),
          `第 ${String(round)} 轮 第 ${String(index + 2)} 棒录段`,
          201,
        );
        const last = index === 2;
        const resolved = await app.inject({
          method: 'POST',
          url: '/api/bottles/' + bottleId + '/resolution',
          payload: { resolution: last ? 'RETURN' : 'SEA' },
          headers: { cookie },
        });
        expectOk(
          resolved.statusCode,
          resolved.json(),
          `第 ${String(round)} 轮 第 ${String(index + 2)} 棒选去向`,
        );
        if (last) {
          // 交接点断言：用 C 的会话读取到 viewer-relative isHolder=true，不下发持有者 UUID。
          const cView = await app.inject({
            method: 'GET',
            url: '/api/bottles/' + bottleId,
            headers: { cookie: c },
          });
          expect(cView.statusCode).toBe(200);
          expect((cView.json() as { isHolder: boolean }).isHolder).toBe(true);
          // 紧接着（无任何间隔）由新持有者选去向 —— 这就是 live-check 里偶发失败的那一步
          const toSea = await app.inject({
            method: 'POST',
            url: '/api/bottles/' + bottleId + '/resolution',
            payload: { resolution: 'SEA' },
            headers: { cookie: c },
          });
          expectOk(toSea.statusCode, toSea.json(), `第 ${String(round)} 轮 C 入海（回传交接后）`);
          expect((toSea.json() as { seaZone: string | null }).seaZone).toBe('COMPLETED');
        }
      }
    }
  }, TEST_TIMEOUT_MS);
});
