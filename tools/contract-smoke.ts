/**
 * 契约冒烟：用 **`packages/shared/src/contracts` 那批 zod schema** 校验**真实 HTTP 响应**。
 *
 * 为什么需要它：站点前端是手写 JS（`site/app/**`），**不引用 TS 契约** ⇒
 * 后端字段/枚举一改，前端不会编译报错、只会运行时静默坏掉。这个脚本是那条链路的机器守卫。
 *
 * 三条如实原则（都是被自己的错误逼出来的）：
 *  1. **信封要拆**：`/api/sea`、`/api/notifications` 返回 `{ items: [...] }`，不是裸数组 ——
 *     把信封当单项校验会误报（我第一版就这么错了）。
 *  2. **非 2xx 用错误 schema 校验**：409/404 的响应体是错误信封，拿成功 schema 去校验也会误报。
 *  3. **校验 0 个元素不算通过**：空列表会"通过"任何单项 schema ⇒ 必须显式标成"未真正校验"。
 *
 * 用法（仓库根，需 API 已起在 8788）：
 *   pnpm --filter @music-drift/api exec tsx ../../tools/contract-smoke.ts
 */
/* eslint-disable no-console */
// 本文件在 tools/（workspace 包之外），包名解析不到 ⇒ 用相对路径直接进 TS 契约入口（就是唯一真相那份）
import * as contracts from '../packages/shared/src/contracts/index.ts';

const BASE = process.env['API_BASE'] ?? 'http://127.0.0.1:8788';
const stamp = String(Date.now()).slice(-7);

type ZodLike = {
  safeParse: (v: unknown) => { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } };
};
type Check = {
  label: string;
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  raw?: boolean;
  expect: number[];
  schemas: string[];
};

let cookie = '';
let failures = 0;
let unverified = 0;

function pick(...names: string[]): { name: string; schema: ZodLike } | null {
  for (const name of names) {
    const candidate = (contracts as unknown as Record<string, unknown>)[name];
    if (candidate !== undefined && typeof (candidate as ZodLike).safeParse === 'function') {
      return { name, schema: candidate as ZodLike };
    }
  }
  return null;
}

async function call(method: string, path: string, body?: unknown, raw?: Uint8Array) {
  const headers: Record<string, string> = {};
  if (cookie !== '') headers['cookie'] = cookie;
  let payload: BodyInit | undefined;
  if (raw !== undefined) {
    headers['content-type'] = 'audio/webm';
    headers['x-audio-duration-ms'] = '20000';
    payload = raw;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(payload === undefined ? {} : { body: payload }),
  });
  const setCookie = response.headers.getSetCookie();
  if (setCookie.length > 0) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  const text = await response.text();
  let json: unknown;
  try {
    json = text === '' ? null : JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: response.status, json };
}

function describe(first: { path: (string | number)[]; message: string } | undefined): string {
  return first === undefined ? '?' : `${first.path.join('.')} ${first.message}`;
}

async function run(checks: readonly Check[]): Promise<void> {
  for (const c of checks) {
    const raw = c.raw === true ? new Uint8Array(8192) : undefined;
    if (raw !== undefined) raw.set([0x1a, 0x45, 0xdf, 0xa3]); // EBML 魔数：足以过容器校验
    const { status, json } = await call(c.method, c.path, c.body, raw);

    if (!c.expect.includes(status)) {
      failures += 1;
      console.log(`✗ ${c.label.padEnd(44)} HTTP ${String(status)}（期望 ${c.expect.join('/')}）`);
      continue;
    }

    // 非 2xx ⇒ 用错误信封 schema 校验（拿成功 schema 校验会误报）
    if (status >= 400) {
      const err = pick('ApiErrorSchema', 'ErrorResponseSchema');
      if (err === null) {
        unverified += 1;
        console.log(`? ${c.label.padEnd(44)} HTTP ${String(status)} · 契约无错误 schema`);
        continue;
      }
      const ok = err.schema.safeParse(json);
      if (ok.success) console.log(`✓ ${c.label.padEnd(44)} HTTP ${String(status)} · ${err.name}（预期内）`);
      else {
        failures += 1;
        console.log(`✗ ${c.label.padEnd(44)} HTTP ${String(status)} · 错误信封不符 ${err.name}：${describe(ok.error?.issues[0])}`);
      }
      continue;
    }
    if (status === 204) {
      console.log(`✓ ${c.label.padEnd(44)} HTTP 204（无响应体）`);
      continue;
    }

    const found = pick(...c.schemas);
    if (found === null) {
      unverified += 1;
      console.log(`? ${c.label.padEnd(44)} HTTP ${String(status)} · **契约里找不到 schema**（候选 ${c.schemas.join(', ')}）⇒ 未验证`);
      continue;
    }
    // 拆信封：`{ items: [...] }` 时校验 items 里的每一项
    const envelope = json !== null && typeof json === 'object' && !Array.isArray(json) ? (json as { items?: unknown }) : null;
    const items = envelope?.items !== undefined && Array.isArray(envelope.items) ? envelope.items : Array.isArray(json) ? json : [json];
    if (items.length === 0) {
      unverified += 1;
      console.log(`? ${c.label.padEnd(44)} HTTP ${String(status)} · 列表为空 ⇒ **没有真正校验到任何一项**（不算通过）`);
      continue;
    }
    for (const item of items) {
      const result = found.schema.safeParse(item);
      if (!result.success) {
        failures += 1;
        console.log(`✗ ${c.label.padEnd(44)} HTTP ${String(status)} · ${found.name} 校验失败：${describe(result.error?.issues[0])}`);
        break;
      }
    }
    if (items.every((item) => found.schema.safeParse(item).success)) {
      console.log(`✓ ${c.label.padEnd(44)} HTTP ${String(status)} · ${found.name} ×${String(items.length)}`);
    }
  }
}

// ── 1. 公开端点 ───────────────────────────────────────────────────
await run([
  { label: 'GET /healthz', method: 'GET', path: '/healthz', expect: [200], schemas: ['HealthResponseSchema', 'HealthSchema'] },
  { label: 'GET /api/songs', method: 'GET', path: '/api/songs', expect: [200], schemas: ['SongSchema'] },
]);

// ── 2. 注册（顺带拿到会话 cookie）──────────────────────────────────
// W6：注册只要「账号 + 密码」（账号不是邮箱，也没有用户名）—— 冒烟走**新契约**，
// 旧邮箱形状由 `/api/auth/*` 集成测试钉住为 422（邮箱能力已退役）。
const account = `smoke${stamp}`;
await run([
  {
    label: 'POST /api/auth/register',
    method: 'POST',
    path: '/api/auth/register',
    body: { account, password: 'Bottle2026' },
    expect: [201],
    schemas: ['SessionResponseSchema'],
  },
  {
    label: 'POST /api/auth/login（账号 + 密码）',
    method: 'POST',
    path: '/api/auth/login',
    body: { account, password: 'Bottle2026' },
    expect: [200],
    schemas: ['SessionResponseSchema'],
  },
]);

// ── 3. 需要登录的读取 ─────────────────────────────────────────────
await run([
  { label: 'GET /api/auth/me', method: 'GET', path: '/api/auth/me', expect: [200], schemas: ['SessionResponseSchema'] },
  // `/api/me/bottles` 故意不在这里查：它是空的（新用户还没参与过任何瓶子）⇒ 会被如实标成"未真正校验"。
  // 放到下面"投河之后"再查，那时至少有一项真数据可校验。
  { label: 'GET /api/me/collections', method: 'GET', path: '/api/me/collections', expect: [200], schemas: ['CollectionSchema'] },
  { label: 'GET /api/me/anonymous-codes', method: 'GET', path: '/api/me/anonymous-codes', expect: [200], schemas: ['AnonymousCodeSchema'] },
  { label: 'GET /api/notifications', method: 'GET', path: '/api/notifications', expect: [200], schemas: ['NotificationSchema'] },
  { label: 'GET /api/sea', method: 'GET', path: '/api/sea', expect: [200], schemas: ['BottleSummarySchema'] },
]);

// ── 4. 瓶子全链路（投河 → 详情 → 传段 → 事件 → 三选一 → 放回）──────
const songs = (await call('GET', '/api/songs')).json as { id: string; segments?: unknown[] }[];
const song = songs.find((s) => Array.isArray(s.segments) && s.segments.length > 0) ?? songs[0];
const created = await call('POST', '/api/bottles', { songId: song?.id });
const createdBody = created.json as { id?: string; bottle?: { id?: string } } | null;
const bottleId = createdBody?.id ?? createdBody?.bottle?.id ?? '';
await run([
  { label: 'POST /api/bottles', method: 'POST', path: '/api/bottles', body: { songId: song?.id }, expect: [201], schemas: ['BottleDetailSchema'] },
  // 投河之后才有真数据 ⇒ 此时校验才有意义（否则会被如实标成"空列表 ⇒ 未真正校验"）
  { label: 'GET /api/me/bottles（投河后）', method: 'GET', path: '/api/me/bottles', expect: [200], schemas: ['MyBottleSchema'] },
]);
if (bottleId !== '') {
  await run([
    { label: 'GET /api/bottles/:id', method: 'GET', path: `/api/bottles/${bottleId}`, expect: [200], schemas: ['BottleDetailSchema'] },
    { label: 'POST /api/bottles/:id/segments', method: 'POST', path: `/api/bottles/${bottleId}/segments`, raw: true, expect: [201], schemas: ['RecordSegmentResponseSchema'] },
    { label: 'GET /api/bottles/:id/events', method: 'GET', path: `/api/bottles/${bottleId}/events`, expect: [200], schemas: ['BottleEventSchema'] },
    { label: 'POST /api/bottles/:id/resolution', method: 'POST', path: `/api/bottles/${bottleId}/resolution`, body: { resolution: 'SEA' }, expect: [200], schemas: ['BottleDetailSchema'] },
    { label: 'POST /api/bottles/:id/put-back（预期 409 错误信封）', method: 'POST', path: `/api/bottles/${bottleId}/put-back`, expect: [200, 409], schemas: ['PutBackResponseSchema'] },
  ]);
}
await run([
  { label: 'POST /api/river/draw（可能 409 空河道）', method: 'POST', path: '/api/river/draw', expect: [200, 409], schemas: ['DrawResponseSchema'] },
  { label: 'GET 不存在的瓶子（错误信封）', method: 'GET', path: '/api/bottles/00000000-0000-4000-8000-0000000000ff', expect: [404], schemas: ['ApiErrorSchema'] },
]);

console.log(`\n契约校验失败 ${String(failures)} 项；未真正校验（无 schema / 空列表）${String(unverified)} 项`);
process.exit(failures === 0 ? 0 : 1);
