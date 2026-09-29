/**
 * 公海族 API（t9，`docs/api.md` §2.5）：分区列表、详情、指定接唱。
 *
 * 两条纪律在这里被钉住：
 * 1. **响应必须过契约**（用 `BottleSummarySchema.parse` 直接校验）—— 早先 `toBottleSummary` 把
 *    `songTitle` 写死成空串，公海列表于是返回 `songTitle: ''`，而契约是 `min(1)`：类型层看不出来、
 *    内核测试也照不到，只有「拿契约校验真响应」才会红。
 * 2. **分区口径来自内核**（`isComplete` / `seaZoneOf`），路由不重算；默认只看已完成区（CONTEXT §6.1）。
 */
import { createSystemClock } from '@music-drift/shared/domain';
import { BottleSummarySchema, ErrorResponseSchema, SeaBottleListSchema } from '@music-drift/shared/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createDb, type Db } from '../db/client.js';
import { runSeed } from '../db/seed.js';
import { insertSong } from '../db/test-helpers.js';

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
    payload: { account: handle, password: PASSWORD },
  });
  expect(response.statusCode).toBe(201);
  const cookie = response.cookies.find((entry) => entry.name === 'mdb_session');
  const user = (response.json() as { user: { id: string } }).user;
  return { cookie: cookie === undefined ? '' : cookie.name + '=' + cookie.value, userId: user.id };
}

async function createBottle(cookie: string, totalSegments = 4): Promise<string> {
  const songId = await insertSong(db, totalSegments);
  const created = await app.inject({
    method: 'POST',
    url: '/api/bottles',
    payload: { songId },
    headers: { cookie },
  });
  expect(created.statusCode).toBe(201);
  return (created.json() as { id: string }).id;
}

async function sing(cookie: string, bottleId: string): Promise<void> {
  const recorded = await app.inject({
    method: 'POST',
    url: '/api/bottles/' + bottleId + '/segments',
    payload: webmPayload(),
    headers: { cookie, 'content-type': 'audio/webm', 'x-audio-duration-ms': '20000' },
  });
  expect(recorded.statusCode).toBe(201);
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

async function take(cookie: string, bottleId: string): Promise<number> {
  return (
    await app.inject({
      method: 'POST',
      url: '/api/sea/' + bottleId + '/targeted-segment',
      headers: { cookie },
    })
  ).statusCode;
}

/** 未完成品：1 段 → 入海（未完成区，缺口 2,3,4）。 */
async function seedIncompleteSeaBottle(cookie: string): Promise<string> {
  const bottleId = await createBottle(cookie);
  await sing(cookie, bottleId);
  await resolve(cookie, bottleId, 'SEA');
  return bottleId;
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

describe('公海列表（CONTEXT §6.1）：默认只看已完成区，未完成须显式查', () => {
  let initiatorCookie = '';
  let completeId = '';
  let incompleteId = '';

  beforeAll(async () => {
    initiatorCookie = (await register('si')).cookie;
    incompleteId = await seedIncompleteSeaBottle(initiatorCookie);

    // 完成品：4 段全部录满，末段作者直接入海（不进回传链也算「已完整」→ 已完成区）
    completeId = await createBottle(initiatorCookie);
    await sing(initiatorCookie, completeId); // 第 1 段
    await resolve(initiatorCookie, completeId, 'SEA');
    for (let index = 0; index < 3; index += 1) {
      const singer = (await register('ss')).cookie;
      expect(await take(singer, completeId)).toBe(200);
      await sing(singer, completeId);
      await resolve(singer, completeId, 'SEA');
    }
  });

  it('默认列表：只含已完成作品，且每一项都能过契约（曲名非空、分区 COMPLETED）', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/sea' });
    expect(response.statusCode).toBe(200);
    const items = (response.json() as { items: unknown[] }).items.map((item) =>
      BottleSummarySchema.parse(item),
    );

    expect(items.map((item) => item.id)).toContain(completeId);
    expect(items.map((item) => item.id)).not.toContain(incompleteId); // 未完成品默认不出现
    for (const item of items) {
      expect(item.isComplete).toBe(true);
      expect(item.missingSegmentIndexes).toEqual([]);
      expect(item.songTitle.length).toBeGreaterThan(0); // 契约 min(1)：空串会是违规响应
    }
  });

  it('zone=INCOMPLETE：未完成品在列；缺口与内核一致（第 1 段已录 → 缺 2,3,4）', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/sea?zone=INCOMPLETE' });
    expect(response.statusCode).toBe(200);
    const items = (response.json() as { items: unknown[] }).items.map((item) =>
      BottleSummarySchema.parse(item),
    );
    const mine = items.find((item) => item.id === incompleteId);

    expect(mine).toBeDefined();
    expect(mine?.isComplete).toBe(false);
    expect(mine?.seaZone).toBe('INCOMPLETE');
    expect(mine?.missingSegmentIndexes).toEqual([2, 3, 4]);
    expect(mine?.recordedCount).toBe(1);
    expect(mine?.songTitle.length).toBeGreaterThan(0);
  });

  it('非法 zone / limit → 400（传输层结构错误）；limit 生效且被夹在 1..100', async () => {
    const badZone = await app.inject({ method: 'GET', url: '/api/sea?zone=SOMEWHERE' });
    expect(badZone.statusCode).toBe(400);

    const badLimit = await app.inject({ method: 'GET', url: '/api/sea?limit=0' });
    expect(badLimit.statusCode).toBe(400);

    const limited = await app.inject({ method: 'GET', url: '/api/sea?limit=1' });
    expect(limited.statusCode).toBe(200);
    expect((limited.json() as { items: unknown[] }).items.length).toBeLessThanOrEqual(1);
  });
});

describe('公海列表真分页（§46.2）：cursor 真消费 + 真 nextCursor + 稳定排序', () => {
  /**
   * 造一支**已完成**的公海作品：第 1 段由发起者录，第 2–4 段必须换人
   *（内核 `hasEverSung` 禁止同瓶二次接唱 —— 用同一个账号跑 4 段会得到 422/409 的假红）。
   */
  async function seedCompleteSeaBottle(authorCookie: string): Promise<string> {
    const bottleId = await createBottle(authorCookie);
    await sing(authorCookie, bottleId);
    await resolve(authorCookie, bottleId, 'SEA');
    for (let hop = 0; hop < 3; hop += 1) {
      const singer = (await register('pgs')).cookie;
      expect(await take(singer, bottleId)).toBe(200);
      await sing(singer, bottleId);
      await resolve(singer, bottleId, 'SEA');
    }
    return bottleId;
  }

  /** 逐页取完，返回每一页（用于断言"不重叠 + 并集等于全量"）。 */
  async function walkPages(
    query: string,
    limit: number,
    maxPages = 20,
  ): Promise<{ items: { id: string }[]; nextCursor: string | null }[]> {
    const pages: { items: { id: string }[]; nextCursor: string | null }[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < maxPages; page += 1) {
      const url =
        '/api/sea?' + query + '&limit=' + String(limit) + (cursor === null ? '' : '&cursor=' + encodeURIComponent(cursor));
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: { id: string }[]; nextCursor: string | null };
      pages.push(body);
      if (body.nextCursor === null) {
        return pages;
      }
      cursor = body.nextCursor;
    }
    throw new Error('分页没有终止：nextCursor 一直非 null（游标没有真正推进）');
  }

  it('第 2 页与第 1 页**不重叠**，逐页并集 = 全量（计数证据）', async () => {
    const author = await register('pg');
    // 造 5 支已完成公海作品 + 3 支未完成（未完成的默认不该出现在列表里）
    for (let index = 0; index < 5; index += 1) {
      await seedCompleteSeaBottle(author.cookie);
    }
    const incomplete: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      incomplete.push(await seedIncompleteSeaBottle(author.cookie));
    }

    // 全量（不分页）作为基准
    const full = await app.inject({ method: 'GET', url: '/api/sea?limit=100' });
    expect(full.statusCode).toBe(200);
    const fullIds = (full.json() as { items: { id: string }[] }).items.map((item) => item.id);
    expect(fullIds.length).toBeGreaterThanOrEqual(5);
    for (const id of incomplete) {
      expect(fullIds).not.toContain(id); // 默认只看已完成区
    }

    const pages = await walkPages('', 2);
    const walked = pages.flatMap((page) => page.items.map((item) => item.id));

    // 计数证据：不重叠（无重复）+ 并集 = 全量
    expect(new Set(walked).size).toBe(walked.length);
    expect(new Set(walked)).toEqual(new Set(fullIds));
    expect(walked.length).toBe(fullIds.length);

    // 除最后一页外每页都必须**满**（不得"某页不足 limit 却仍有下一页"）
    for (const [index, page] of pages.entries()) {
      if (index < pages.length - 1) {
        expect(page.items.length, `第 ${String(index + 1)} 页应满 ${String(2)} 条`).toBe(2);
        expect(page.nextCursor).not.toBeNull();
      }
    }
    expect(pages[pages.length - 1]?.nextCursor).toBeNull();
    expect(pages.length).toBeGreaterThan(1); // 真的分页了，不是一页装作到底
  });

  it('同一游标重复请求 → 返回同一页（稳定排序键）', async () => {
    const first = await app.inject({ method: 'GET', url: '/api/sea?limit=2' });
    const firstBody = first.json() as { items: { id: string }[]; nextCursor: string | null };
    expect(firstBody.nextCursor).not.toBeNull();

    const again = await app.inject({
      method: 'GET',
      url: '/api/sea?limit=2&cursor=' + encodeURIComponent(String(firstBody.nextCursor)),
    });
    const againBody = again.json() as { items: { id: string }[]; nextCursor: string | null };
    const repeat = await app.inject({
      method: 'GET',
      url: '/api/sea?limit=2&cursor=' + encodeURIComponent(String(firstBody.nextCursor)),
    });
    expect((repeat.json() as { items: { id: string }[] }).items.map((item) => item.id)).toEqual(
      againBody.items.map((item) => item.id),
    );
    // 且与第 1 页不重叠
    const firstIds = firstBody.items.map((item) => item.id);
    for (const id of againBody.items.map((item) => item.id)) {
      expect(firstIds).not.toContain(id);
    }
  });

  it('遍历期间新插入的作品不会造成漏项或重复（新数据排在游标之前）', async () => {
    const author = await register('pn');
    for (let index = 0; index < 4; index += 1) {
      await seedCompleteSeaBottle(author.cookie);
    }

    const page1 = await app.inject({ method: 'GET', url: '/api/sea?limit=2' });
    const page1Body = page1.json() as { items: { id: string }[]; nextCursor: string | null };
    expect(page1Body.nextCursor).not.toBeNull();

    // 遍历中途插一支**新的已完成**作品：它的 updated_at 最新 ⇒ 排在游标之前，不该出现在后续页
    const fresh = await seedCompleteSeaBottle(author.cookie);

    const seen = page1Body.items.map((item) => item.id);
    let cursor: string | null = page1Body.nextCursor;
    while (cursor !== null) {
      const response = await app.inject({
        method: 'GET',
        url: '/api/sea?limit=2&cursor=' + encodeURIComponent(cursor),
      });
      const body = response.json() as { items: { id: string }[]; nextCursor: string | null };
      for (const id of body.items.map((item) => item.id)) {
        expect(seen, '同一支瓶子不得在后续页重复出现').not.toContain(id);
        seen.push(id);
      }
      cursor = body.nextCursor;
    }
    expect(seen).not.toContain(fresh); // 新插入的排在游标之前：后续页不该再给
  });

  it('zone=INCOMPLETE 也能分页；非法 cursor → 400（不静默忽略）', async () => {
    const author = await register('pz');
    for (let index = 0; index < 3; index += 1) {
      await seedIncompleteSeaBottle(author.cookie);
    }
    const pages = await walkPages('seaZone=INCOMPLETE', 2);
    const walked = pages.flatMap((page) => page.items.map((item) => item.id));
    expect(walked.length).toBeGreaterThanOrEqual(3);
    expect(new Set(walked).size).toBe(walked.length);
    for (const [index, page] of pages.entries()) {
      if (index < pages.length - 1) {
        expect(page.items.length).toBe(2);
      }
    }

    // `zone=` 旧名仍然可用（向后兼容），且与 canonical `seaZone` 等价
    const alias = await app.inject({ method: 'GET', url: '/api/sea?zone=INCOMPLETE&limit=100' });
    const canonical = await app.inject({ method: 'GET', url: '/api/sea?seaZone=INCOMPLETE&limit=100' });
    expect(alias.statusCode).toBe(200);
    expect((alias.json() as { items: { id: string }[] }).items.map((item) => item.id)).toEqual(
      (canonical.json() as { items: { id: string }[] }).items.map((item) => item.id),
    );

    // 非法 cursor 必须报错而不是被忽略（忽略 = 又静默回到第一页）
    for (const bad of ['not-a-cursor', 'Zm9v', 'MTIzNDU2Nzg5MDAwOnh4']) {
      const response = await app.inject({ method: 'GET', url: '/api/sea?limit=2&cursor=' + encodeURIComponent(bad) });
      expect(response.statusCode, `cursor=${bad} 应被拒绝`).toBe(400);
    }
  });
});

describe('公海列表 total：一次性回该 zone 总条数（页码一次全显，不再渐进出现）', () => {
  /** 造已完成作品（与 §46.2 那组同一套路：4 段必须换人录，同瓶二次接唱会被内核拒）。 */
  async function seedComplete(authorCookie: string): Promise<string> {
    const bottleId = await createBottle(authorCookie);
    await sing(authorCookie, bottleId);
    await resolve(authorCookie, bottleId, 'SEA');
    for (let hop = 0; hop < 3; hop += 1) {
      const singer = (await register('tc')).cookie;
      expect(await take(singer, bottleId)).toBe(200);
      await sing(singer, bottleId);
      await resolve(singer, bottleId, 'SEA');
    }
    return bottleId;
  }

  /** 全量取回一个 zone（limit=100 一页装得下）并**过契约**解析。
   *  返回类型从 `SeaBottleListSchema` 解析结果**推导**（显式窄注解会撞
   *  exactOptionalPropertyTypes 的 `total?: number`，且把 items 压成 `{id}` 丢掉 isComplete）。 */
  async function fetchZone(zone: string) {
    const response = await app.inject({ method: 'GET', url: `/api/sea?zone=${zone}&limit=100` });
    expect(response.statusCode).toBe(200);
    const body = SeaBottleListSchema.parse(response.json());
    return { total: body.total, items: body.items };
  }

  it('两个 zone 各自 total 正确（随该 zone 数据增减），且与 items 轮廓一致', async () => {
    const author = await register('tf');
    const beforeCompleted = await fetchZone('COMPLETED');
    const beforeIncomplete = await fetchZone('INCOMPLETE');
    // total 与**同一过滤条件**下的 items 轮廓一致（一页装得下 ⇒ total = items.length）
    expect(beforeCompleted.total).toBe(beforeCompleted.items.length);
    expect(beforeIncomplete.total).toBe(beforeIncomplete.items.length);
    expect(beforeCompleted.items.every((item) => item.isComplete)).toBe(true);
    expect(beforeIncomplete.items.every((item) => !item.isComplete)).toBe(true);

    // 新增 2 支已完成 + 1 支未完成：只有对应 zone 的 total 涨，且涨幅 = 新增条数
    await seedComplete(author.cookie);
    await seedComplete(author.cookie);
    await seedIncompleteSeaBottle(author.cookie);

    const afterCompleted = await fetchZone('COMPLETED');
    const afterIncomplete = await fetchZone('INCOMPLETE');
    expect(afterCompleted.total).toBe((beforeCompleted.total ?? -1) + 2);
    expect(afterIncomplete.total).toBe((beforeIncomplete.total ?? -1) + 1);
    expect(afterCompleted.items.length).toBe(afterCompleted.total);
    expect(afterIncomplete.items.length).toBe(afterIncomplete.total);
  });

  it('翻页（cursor）时 total 恒为 zone 总数，不是本页数、也不是已取页数', async () => {
    const author = await register('tp');
    await seedIncompleteSeaBottle(author.cookie);
    await seedIncompleteSeaBottle(author.cookie);

    const full = await fetchZone('INCOMPLETE');
    expect((full.total ?? 0)).toBeGreaterThanOrEqual(2);

    const first = await app.inject({ method: 'GET', url: '/api/sea?zone=INCOMPLETE&limit=1' });
    const body1 = SeaBottleListSchema.parse(first.json());
    expect(body1.total).toBe(full.total); // 第 1 页就带总数，而不是翻出来才补
    expect(body1.items).toHaveLength(1);
    expect(body1.nextCursor).not.toBeNull();

    const second = await app.inject({
      method: 'GET',
      url: '/api/sea?zone=INCOMPLETE&limit=1&cursor=' + encodeURIComponent(String(body1.nextCursor)),
    });
    const body2 = SeaBottleListSchema.parse(second.json());
    expect(body2.total).toBe(full.total);
    expect(body2.items[0]?.id).not.toBe(body1.items[0]?.id); // 换页不重复，total 仍是同一个
  });
});

describe('指定接唱：抢占必须先被看见（t39 / qa-e2e F1，409 而不是 200+摘要）', () => {
  /**
   * 为什么要单列这一组：**串行语义的集成测试天然测不到并发抢占** —— 之前所有用例都是
   * "一个请求做完再发下一个"，而缺陷恰恰发生在两个请求的交错窗口里（读状态与抢持有权之间）。
   * 所以这里两路夹击：
   * ① 一个**确定性**用例（预先存在一条未释放的 holding，不依赖交错时序）；
   * ② 一个**真并发**用例（两个请求同时发，抢同一支瓶子）。
   */

  it('瓶子已被别人持有（未释放）→ 409 HOLDING_ALREADY_TAKEN，而不是 200 + 摘要', async () => {
    const author = await register('tl');
    const bottleId = await seedIncompleteSeaBottle(author.cookie);
    const rival = await register('tl');
    // ⚠️ 抢的人必须是**没在该瓶唱过**的新用户：用作者自己会先撞 ALREADY_SANG_IN_BOTTLE（422），
    // 根本走不到抢占那一步（第一版就这么踩了，红的现象是 422 而不是 200，白读一轮）
    const claimant = await register('tl');

    // 直接造出"公海里的瓶子却有一条未释放 holding"这一状态 —— 正是并发交错窗口里的中间态。
    // 这样用例**不依赖线程/请求交错时序**也能稳定覆盖路由是否检查 outcome.ok。
    await db.query(
      `insert into holdings (bottle_id, holder_id, parent_id, origin, acquired_at)
       values ($1, $2, null, 'DRAW', now())`,
      [bottleId, rival.userId],
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/sea/' + bottleId + '/targeted-segment',
      headers: { cookie: claimant.cookie },
    });

    expect(response.statusCode).toBe(409); // ← 修前是 200（摘要里 isHolder=false，调用方无从分辨）
    const envelope = ErrorResponseSchema.parse(response.json());
    expect(envelope.error.violations[0]?.code).toBe('HOLDING_ALREADY_TAKEN');
  });

  it('并发抢同一支瓶子 ⇒ 恰好一个 200；撞进窗口的落败者是 409 HOLDING_ALREADY_TAKEN', async () => {
    const author = await register('tr');
    const bottleId = await seedIncompleteSeaBottle(author.cookie);
    // 6 路并发（不是 2 路）：请求交错窗口很窄，两路常常"一个做完另一个才读状态"，
    // 落败者就走 404（瓶子已离开公海）而不是 409。多路并发才能稳定命中那个窗口 ——
    // 这正是"串行语义的集成测试测不到并发缺陷"的具体形态。
    const rivals: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      rivals.push((await register('tr')).cookie);
    }

    const responses = await Promise.all(
      rivals.map((cookie) =>
        app.inject({
          method: 'POST',
          url: '/api/sea/' + bottleId + '/targeted-segment',
          headers: { cookie },
        }),
      ),
    );
    const statuses = responses.map((response) => response.statusCode);
    const winners = responses.filter((response) => response.statusCode === 200);
    const conflicts = responses.filter((response) => response.statusCode === 409);

    // 修前：窗口内的落败者也拿 200（两个窗口都被 navigate，输的一方只看到"不在你手上"）
    expect(winners.length).toBe(1);
    for (const status of statuses) {
      // 409 = 撞进抢占窗口（有人先抢了）；404 = 读状态时瓶子已离开公海（既有防探测口径，不改）
      expect([200, 404, 409]).toContain(status);
    }
    // 命中窗口的那次一定得 409 + 稳定码；**没命中也不假绿** —— 兜底由下面这条"确定性命中"的用例保证
    //（预置一条未释放 holding，不依赖请求交错时序），以及 store 层的并发用例。

    const winner = winners[0];
    // ⚠️ 这个端点的响应是 **BottleSummary**（没有 `isHolder`/`availableResolutions` 那些 Detail 字段）；
    // 谁持有要另外查详情 —— 第一版在这里把 Summary 当 Detail 断言，红的是用例自己。
    expect(BottleSummarySchema.parse(winner?.json()).id).toBe(bottleId);
    for (const conflict of conflicts) {
      expect(ErrorResponseSchema.parse(conflict.json()).error.violations[0]?.code).toBe(
        'HOLDING_ALREADY_TAKEN',
      );
    }

    // 数据不变量：活跃持有者恰好 1 个（输的一方零副作用）
    const holdings = await db.query<{ count: string }>(
      `select count(*)::text as count from holdings where bottle_id = $1 and released_at is null`,
      [bottleId],
    );
    expect(holdings[0]?.count).toBe('1');
    // 且**只有**赢家持有：逐个复查每个会话的瓶子详情 isHolder
    const winnerCookie = rivals[statuses.indexOf(200)]!;
    const detail = await app.inject({
      method: 'GET',
      url: '/api/bottles/' + bottleId,
      headers: { cookie: winnerCookie },
    });
    expect((detail.json() as { isHolder: boolean }).isHolder).toBe(true);
  });

  it('「有人先抢了」(409) 与「不在公海」(404) 必须可分辨（404 的防探测口径不改）', async () => {
    const author = await register('td');
    const bottleId = await seedIncompleteSeaBottle(author.cookie);
    const winner = await register('td');

    const won = await app.inject({
      method: 'POST',
      url: '/api/sea/' + bottleId + '/targeted-segment',
      headers: { cookie: winner.cookie },
    });
    expect(won.statusCode).toBe(200);

    // 顺序上的第二位：瓶子已经离开公海（HELD）→ 仍是 404（防探测，不改）
    const late = await register('td');
    const after = await app.inject({
      method: 'POST',
      url: '/api/sea/' + bottleId + '/targeted-segment',
      headers: { cookie: late.cookie },
    });
    expect(after.statusCode).toBe(404);

    // 两者可分辨：409 带**稳定领域码**，404 是传输层（violations 为空）
    expect(after.body).not.toContain('HOLDING_ALREADY_TAKEN');
  });
});

describe('公海详情与指定接唱（CONTEXT §6.2）', () => {
  let initiatorCookie = '';
  let initiatorId = '';
  let takerCookie = '';
  let incompleteId = '';
  let completeId = '';
  let driftingId = '';

  beforeAll(async () => {
    const initiator = await register('di');
    initiatorCookie = initiator.cookie;
    initiatorId = initiator.userId;
    const taker = await register('dt');
    takerCookie = taker.cookie;

    incompleteId = await seedIncompleteSeaBottle(initiatorCookie);

    completeId = await createBottle(initiatorCookie);
    await sing(initiatorCookie, completeId);
    await resolve(initiatorCookie, completeId, 'SEA');
    for (let index = 0; index < 3; index += 1) {
      const singer = (await register('ds')).cookie;
      await take(singer, completeId);
      await sing(singer, completeId);
      await resolve(singer, completeId, 'SEA');
    }

    // 还在漂流的瓶子（投河后没入海）→ 不属于公海
    driftingId = await createBottle(initiatorCookie);
    await sing(initiatorCookie, driftingId);
    await resolve(initiatorCookie, driftingId, 'RIVER');
  });

  it('详情：公海里的瓶子 → 200 且过契约；不在公海的瓶子 → 404（不是 403，避免探测）', async () => {
    const sea = await app.inject({ method: 'GET', url: '/api/sea/' + incompleteId });
    expect(sea.statusCode).toBe(200);
    const summary = BottleSummarySchema.parse(sea.json());
    expect(summary.id).toBe(incompleteId);
    expect(summary.seaZone).toBe('INCOMPLETE');
    expect(summary.songTitle.length).toBeGreaterThan(0);

    const drifting = await app.inject({ method: 'GET', url: '/api/sea/' + driftingId });
    expect(drifting.statusCode).toBe(404);

    const missing = await app.inject({
      method: 'GET',
      url: '/api/sea/00000000-0000-4000-8000-000000000000',
    });
    expect(missing.statusCode).toBe(404);
  });

  it('指定接唱：未登录 401；不存在的作品 404', async () => {
    expect(
      (await app.inject({ method: 'POST', url: '/api/sea/' + incompleteId + '/targeted-segment' }))
        .statusCode,
    ).toBe(401);
    expect(await take(takerCookie, '00000000-0000-4000-8000-000000000000')).toBe(404);
  });

  it('指定接唱：已完成作品 → 422 BOTTLE_ALREADY_COMPLETE（完成品只能听）', async () => {
    const status = await take(takerCookie, completeId);
    expect(status).toBe(422);
    const response = await app.inject({
      method: 'POST',
      url: '/api/sea/' + completeId + '/targeted-segment',
      headers: { cookie: takerCookie },
    });
    expect(response.body).toContain('BOTTLE_ALREADY_COMPLETE');
  });

  it('指定接唱：在该瓶唱过的人 → 422 ALREADY_SANG_IN_BOTTLE（含发起者：他必定有第 1 段）', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sea/' + incompleteId + '/targeted-segment',
      headers: { cookie: initiatorCookie },
    });
    expect(response.statusCode).toBe(422);
    expect(response.body).toContain('ALREADY_SANG_IN_BOTTLE');
  });

  it('指定接唱成功 → 200，持有者变成接唱者、父链接在最后一段作者上（§6.2）', async () => {
    expect(await take(takerCookie, incompleteId)).toBe(200);

    const detail = await app.inject({
      method: 'GET',
      url: '/api/bottles/' + incompleteId,
      headers: { cookie: takerCookie },
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json() as {
      isHolder: boolean;
      availableResolutions: string[];
      missingSegmentIndexes: number[];
    };
    expect(body.isHolder).toBe(true);
    // 未完成的瓶子：可投河/回传/入海（缺口在，说明还能继续接）
    expect(body.availableResolutions).toEqual(['RIVER', 'RETURN', 'SEA']);
    expect(body.missingSegmentIndexes).toEqual([2, 3, 4]);

    // 接完这一段后缺口收缩：父链正确（最后一段作者 = 发起者）
    await sing(takerCookie, incompleteId);
    const after = await app.inject({
      method: 'GET',
      url: '/api/bottles/' + incompleteId,
      headers: { cookie: takerCookie },
    });
    expect((after.json() as { missingSegmentIndexes: number[] }).missingSegmentIndexes).toEqual([
      3, 4,
    ]);
    // 父链存在事件的 payload 里（events 表是单一事实来源）：
    // 指定接唱的父节点 = 该作品**最后一段**的接唱者（CONTEXT §6.2）
    const parent = await db.query<{ parent_id: string | null }>(
      `select payload->>'parentId' as parent_id from events
       where bottle_id = $1 and type = 'BOTTLE_DRAWN' order by seq desc limit 1`,
      [incompleteId],
    );
    expect(parent[0]?.parent_id).toBe(initiatorId);
  });
});
