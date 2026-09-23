/**
 * 「一屏装下」可脚本化判据（§46.3，captain 2026-09-23 裁决）。
 *
 * ## 两种口径
 * - **桌面（>=1024px 宽）**：`Math.max(documentElement.scrollHeight, body.scrollHeight) <= 视口高`（1440×900 → 900）；
 * - **手机（<1024px）**：不强制整页一屏（会逼出"手机端信息架构降级"，captain 已裁决否决），改判两条：
 *   ① **不得横向滚动**：`documentElement.scrollWidth <= 视口宽 + 1`；
 *   ② **每页最关键的一块内容必须在首屏内**：路由声明的锚元素（`data-anchor="…"`）`rect.bottom <= 视口高`。
 * 两种口径都要求**声明式内容进弹窗/折叠**（§46.2）。锚点缺失 = FAIL（不静默跳过）。
 *
 * ## 三条防自欺机制（这一版加的，上一版吃过亏）
 * 1. **在异步数据加载完成后才测**：`waitUntil: 'networkidle'` + 额外等一帧 rAF；
 * 2. **反向控制**：`--negative-control` 往 `body` **最前面**插一个 2000px 高的元素
 *    （整页下移 ⇒ 高度与锚点两条断言都会红），要求**断言确实变红**；
 *    **退出码口径（t44 修正，此前注释与实现矛盾）**：命令的退出码表达的是「**反向控制本身成立不成立**」，
 *    不是「路由达标不达标」——
 *    · `exit 0` = 成功证明了守卫**会红**（桌面：注入后全部路由 FAIL；手机：**有锚点**的路由全 FAIL）；
 *    · `exit 1` = 反向控制**失败**（注入后仍有路由通过 ⇒ 这条守卫是"永远点头"的，判守卫自身不成立）。
 *    实现见文件末尾 `process.exit(provedRed ? 0 : 1)`。
 * 3. **hermetic 数据**：默认自建一次性库 + 自起 API + 自起 vite（proxy 指过去），跑完删库。
 *    理由不是洁癖：共享开发库被反复灌数据会**反过来决定判据**（`/new` 曾因库里 17 首测试残留
 *    而红，而那与布局无关）；同时也避免守卫自己变成"污染共享库的人"。
 *
 * ## 用法
 * ```bash
 * node apps/web/tools/one-screen-check.mjs --viewport=1440x900 --shot=docs/ui-review/after
 * node apps/web/tools/one-screen-check.mjs --viewport=375x812  --shot=docs/ui-review/after-375
 * node apps/web/tools/one-screen-check.mjs --viewport=1440x900 --negative-control   # 期望：全路由 FAIL 且 **exit 0**
 * node apps/web/tools/one-screen-check.mjs --viewport=375x812  --negative-control   # 期望：有锚点的路由全 FAIL 且 **exit 0**
 * node apps/web/tools/one-screen-check.mjs --external   # 对着已起的 5173/8787 跑（调试用，不作证据）
 * ```
 *
 * 说明：脚本跑在 Node 里，但 `page.evaluate` 的回调在**页面上下文**执行，所以这里显式声明浏览器全局。
 */
/* eslint-disable no-console */
/* global document, requestAnimationFrame */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const WEB_DIR = fileURLToPath(new URL('../', import.meta.url));
const API_DIR = fileURLToPath(new URL('../../api/', import.meta.url));
const TSX_CLI = createRequire(
  fileURLToPath(new URL('../../api/package.json', import.meta.url)),
).resolve('tsx/cli');
const IS_WINDOWS = process.platform === 'win32';

const args = new Map(
  process.argv.slice(2).map((raw) => {
    const [key, value] = raw.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);
const [viewportWidth, viewportHeight] = (args.get('viewport') ?? '1440x900').split('x').map(Number);
/** 桌面判据只有一条：整页高度 ≤ 视口高；手机判据看锚点，阈值同样是视口高。 */
const heightThreshold = Number(args.get('threshold') ?? viewportHeight);
const mobile = viewportWidth < 1024;
const negativeControl = args.has('negative-control');
const shotDir = args.get('shot') ?? null;
const external = args.has('external');

/** playwright 只在本机 npx 缓存里（本仓未把 @playwright/test 登记为依赖，属 t14 范围）。 */
async function loadPlaywright() {
  const cacheRoot = join(homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
  if (existsSync(cacheRoot)) {
    for (const entry of readdirSync(cacheRoot)) {
      const candidate = join(cacheRoot, entry, 'node_modules', 'playwright', 'index.mjs');
      if (existsSync(candidate)) return import(`file://${candidate.replaceAll('\\', '/')}`);
    }
  }
  throw new Error('找不到 playwright：请先跑一次 `npx playwright screenshot --help` 让它落到 npx 缓存');
}

// ---------------------------------------------------------------- hermetic 环境

let API = external ? 'http://localhost:8787' : null;
let BASE = external ? 'http://localhost:5173' : null;
let hermetic = null;

function runDbTool(dbArgs) {
  const result = spawnSync(
    process.execPath,
    [TSX_CLI, '--env-file-if-exists=../../.env', 'src/db/live-check.ts', ...dbArgs],
    { cwd: API_DIR, encoding: 'utf8', env: process.env },
  );
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function lastJsonLine(text) {
  const lines = text.trim().split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // 不是 JSON 就继续往上找
    }
  }
  return null;
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.status === 200) return true;
    } catch {
      // 还没起来，继续等
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

function killTree(child) {
  if (child === null || child.exitCode !== null) return;
  if (IS_WINDOWS) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

/**
 * 自建环境 = 一次性库 + 自起 API + 自起 vite（proxy 指到自起 API）。
 *
 * 为什么要自起 vite：浏览器里的 web 用的是**相对** `/api`，只有让 vite 把 `/api` 代理到自建 API，
 * 请求才会落到一次性库上；同时 cookie 仍在 5173 这个 origin 上（SameSite=Lax 不会被挡）。
 * vite 的 proxy 目标因此支持 `MDB_API_TARGET` 覆盖（默认仍是契约里的 8787）。
 */
async function startHermetic() {
  console.log('[setup] 建一次性数据库（复用 apps/api 的派生 / 迁移 / 种子机制）…');
  const created = runDbTool(['create']);
  if (created.status !== 0) {
    console.error(created.stdout);
    console.error(created.stderr);
    process.exit(1);
  }
  const info = lastJsonLine(created.stdout);
  if (info === null || typeof info.databaseUrl !== 'string') {
    console.error('无法解析 live-check:db create 的输出：', created.stdout);
    process.exit(1);
  }

  const apiPort = await freePort();
  API = `http://127.0.0.1:${apiPort}`;
  const apiChild = spawn(
    process.execPath,
    [TSX_CLI, '--env-file-if-exists=../../.env', 'src/server.ts'],
    {
      cwd: API_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DATABASE_URL: info.databaseUrl, PORT: String(apiPort), LOG_LEVEL: 'error' },
    },
  );
  let serverLog = '';
  const collect = (chunk) => {
    serverLog += String(chunk);
  };
  apiChild.stdout.on('data', collect);
  apiChild.stderr.on('data', collect);

  if (!(await waitForHealth(API))) {
    console.error(`API 未在 60s 内就绪（${API}）：\n${serverLog}`);
    killTree(apiChild);
    process.exit(1);
  }

  const vitePort = await freePort();
  BASE = `http://127.0.0.1:${vitePort}`;
  /**
   * ⚠️ 必须在 **process.env** 上设：`vite.config.ts` 是在**本进程**里求值的，
   * 把 `MDB_API_TARGET` 传给 `createViteServer({env})` 只会进 `import.meta.env`（客户端变量），
   * config 读不到 ⇒ proxy 仍指向 8787（dev API）⇒ 浏览器拿自建库的 cookie 去问 dev API，
   * 全部页面变成"未登录"视图、高度恒等于视口高 —— 正是这一版之前那批**假绿**的真因。
   */
  process.env['MDB_API_TARGET'] = API;
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    configFile: join(WEB_DIR, 'vite.config.ts'),
    root: WEB_DIR,
    server: { port: vitePort, strictPort: true, host: '127.0.0.1' },
  });
  await vite.listen();

  hermetic = { databaseName: info.databaseName, apiChild, vite };
  console.log(
    `[setup] 库 ${info.databaseName}（种子 ${info.seededSongs} 首）· API ${API} · web ${BASE}`,
  );
}

async function stopHermetic() {
  if (hermetic === null) return;
  const { databaseName, apiChild, vite } = hermetic;
  hermetic = null; // 先置空：teardown 自身出错也不会重复删
  await vite.close();
  killTree(apiChild);
  const dropped = runDbTool(['drop', databaseName]);
  const info = lastJsonLine(dropped.stdout);
  console.log(
    `[teardown] 删库 ${databaseName} → ${info?.dropped === true ? '已删除' : '未删除（见输出）'}`,
  );
  runDbTool(['sweep']); // 顺手回收超龄残留库（上一次跑崩留下）
}

// ---------------------------------------------------------------- 真实数据

/**
 * 一次运行造三支瓶子（都在**一次性库**里，跑完连库一起删）：
 * - `sea`：录满 4 段 → 入海 ⇒ 用来量 `/sea/:id`；
 * - `river`：录 1 段 → 投河 ⇒ 量非持有者视角的 `/bottles/:id` 与 `/bottles/:id/log`；
 * - `held`：录 1 段、留在手上 ⇒ 唯一能看到「录第 N 段」入口的状态，用来量录制入口锚点。
 * 录段上传 2KB 假音频 + `x-audio-duration-ms: 20000`（服务端校验 15–30 秒）。
 */
async function register(name) {
  const handle = name.slice(0, 24);
  const registered = await fetch(`${API}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ handle, email: `${handle}@example.com`, password: 'Drift-Bottle-2026' }),
  });
  if (registered.status !== 201) {
    throw new Error(`注册 ${handle} 失败：${String(registered.status)} ${await registered.text()}`);
  }
  const cookieHeader = registered.headers.getSetCookie().find((c) => c.startsWith('mdb_session='));
  return { cookie: cookieHeader.split(';')[0] };
}

/** 反复打捞直到拿到目标瓶子（自建库里河道只有本次运行的瓶子，一般一次就中）。 */
async function drawUntil(cookie, targetId, maxAttempts = 15) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(`${API}/api/river/draw`, { method: 'POST', headers: { cookie } });
    if (response.status !== 200) return null;
    const body = await response.json();
    if (body.bottle?.id === targetId) return targetId;
    await fetch(`${API}/api/bottles/${body.bottle.id}/put-back`, {
      method: 'POST',
      headers: { cookie },
    });
  }
  return null;
}

async function seedData() {
  const stamp = Date.now().toString(36);
  const { cookie } = await register(`layout${stamp}`);

  const songs = await (await fetch(`${API}/api/songs`)).json();
  const song = songs.find((item) => item.segments.length === item.totalSegments) ?? songs[0];

  async function createBottle() {
    const created = await fetch(`${API}/api/bottles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ songId: song.id }),
    });
    return (await created.json()).id;
  }

  async function record(bottleId, note, as = cookie) {
    const magic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
    const response = await fetch(`${API}/api/bottles/${bottleId}/segments`, {
      method: 'POST',
      headers: {
        cookie: as,
        'content-type': 'audio/webm',
        'x-audio-duration-ms': '20000',
        'x-segment-note': encodeURIComponent(note),
      },
      body: Buffer.concat([magic, Buffer.alloc(2048 - magic.length, 0x42)]),
    });
    if (response.status !== 201) {
      throw new Error(`录段失败（${String(response.status)}）：${await response.text()}`);
    }
  }

  async function resolve(bottleId, resolution, as = cookie) {
    const response = await fetch(`${API}/api/bottles/${bottleId}/resolution`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: as },
      body: JSON.stringify({ resolution }),
    });
    if (response.status !== 200) {
      throw new Error(`选去向 ${resolution} 失败（${String(response.status)}）：${await response.text()}`);
    }
  }

  /**
   * ① **完整作品 → 入海**：`/sea` 默认（完整作品区）要有东西，`/sea/:id` 才量得到真实页面。
   * 内核禁止同一人在同一瓶子里接唱两次（`CANNOT_RECORD_TWICE_IN_BOTTLE`），
   * 所以必须真的走一遍接力：4 个账号 → 捞取 → 各录一段 → 投河，最后一位入海。
   */
  const seaId = await createBottle();
  await record(seaId, '布局检查用的第一棒');
  await resolve(seaId, 'RIVER');
  for (let index = 2; index <= song.totalSegments; index += 1) {
    const relay = await register(`relay${stamp}${String(index)}`);
    const drawn = await drawUntil(relay.cookie, seaId);
    if (drawn !== seaId) {
      throw new Error(`第 ${String(index)} 棒没捞到目标瓶子（拿到 ${String(drawn)}）`);
    }
    await record(seaId, `布局检查用的第 ${String(index)} 段`, relay.cookie);
    await resolve(seaId, index === song.totalSegments ? 'SEA' : 'RIVER', relay.cookie);
  }

  // ② 投河（非持有者视角）
  const riverId = await createBottle();
  await record(riverId, '布局检查用的第一棒');
  await resolve(riverId, 'RIVER');

  // ③ 留在手上（持有者视角，唯一能看到「录第 N 段」）
  const heldId = await createBottle();
  await record(heldId, '布局检查·留在手上的一段');

  // ④ **刚发起、什么都没录**（用户 2026-09-23 报的 P0：这一步曾显示"不在你手上"，录不了第 1 段）
  const freshId = await createBottle();

  return { cookie, seaId, riverId, heldId, freshId };
}

// ---------------------------------------------------------------- 判据

/**
 * 每个路由声明**它自己的关键锚点**（captain 定的清单）。
 * 锚点用 `data-anchor="…"` 标在页面上 —— 显式、可 grep、可被源守卫检查，
 * 比"按文案找按钮"稳（文案会改，锚点不会）。
 */
function routesFor(seed) {
  return [
    { path: '/', anchors: ['river-draw', 'river-drop'] },
    { path: '/river', anchors: ['river-draw', 'river-drop'] },
    { path: '/sea', anchors: ['sea-list'] },
    { path: '/new', anchors: ['new-catalog'] },
    { path: `/sea/${seed.seaId}`, anchors: ['sea-play'] },
    { path: '/me', anchors: ['me-bottles'], needsAuth: true },
    { path: '/settings', anchors: ['settings-attribution'], needsAuth: true },
    { path: `/bottles/${seed.riverId}`, anchors: ['bottle-play', 'bottle-action'], needsAuth: true },
    { path: `/bottles/${seed.heldId}`, anchors: ['bottle-play', 'bottle-action'], needsAuth: true },
    // 刚发起的草稿：必须能看到「录第 1 段」（P0 回归守卫）
    { path: `/bottles/${seed.freshId}`, anchors: ['bottle-record'], needsAuth: true },
    { path: `/bottles/${seed.riverId}/log`, anchors: [], needsAuth: true },
    { path: '/nope-does-not-exist', anchors: [] },
  ];
}

/** 页面上下文里量：整页高度、横向是否溢出、每个锚点的下沿。 */
async function measure(page, selectors) {
  return page.evaluate((wanted) => {
    const anchors = {};
    for (const selector of wanted) {
      const element = document.querySelector(`[data-anchor="${selector}"]`);
      anchors[selector] =
        element === null ? null : Math.round(element.getBoundingClientRect().bottom);
    }
    return {
      height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      scrollWidth: document.documentElement.scrollWidth,
      anchors,
    };
  }, selectors);
}

function slugOf(path) {
  if (path === '/') return 'home';
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (id) => id.slice(0, 8))
    .replace(/[/]/g, '-')
    .replace(/^-/, '');
}

// ---------------------------------------------------------------- 主流程

if (!external) await startHermetic();
const seed = await seedData();
const routes = routesFor(seed);
if (shotDir !== null) mkdirSync(shotDir, { recursive: true });

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: viewportWidth, height: viewportHeight },
});
await context.addCookies([
  {
    name: 'mdb_session',
    value: seed.cookie.slice('mdb_session='.length),
    domain: '127.0.0.1',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  },
]);

// 前置检查：**自建环境 + 真实会话**必须成立。否则浏览器看到的是"未登录视图"，
// 每个页面都短、每个断言都绿 —— 这类假绿必须在这里被挡住。
{
  const probe = await context.newPage();
  await probe.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const me = await probe.evaluate(async () => {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const body = await response.json().catch(() => null);
    return { status: response.status, handle: body?.user?.handle ?? null };
  });
  await probe.close();
  if (me.status !== 200 || typeof me.handle !== 'string') {
    console.error(
      `❌ 会话前置检查失败：浏览器侧 GET /api/auth/me = ${String(me.status)}（handle=${String(me.handle)}）。` +
        '这通常意味着 vite 的 proxy 没指到自建 API（见 startHermetic 的 process.env 注释），' +
        '此时所有页面都是"未登录视图"，判据无意义 —— 直接判失败。',
    );
    await stopHermetic();
    process.exit(1);
  }
  console.log(`[preflight] 浏览器会话有效：${me.handle}`);
}

console.log(
  `viewport=${viewportWidth}x${viewportHeight} 口径=${mobile ? 'mobile(锚点+无横向滚动)' : 'desktop(整页高度)'} threshold=${heightThreshold} negativeControl=${negativeControl} ${external ? 'external' : 'hermetic'}`,
);

let failures = 0;
for (const route of routes) {
  const page = await context.newPage();
  await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' });
  /**
   * ⚠️ 这一步是**判据成立的前提**（captain 条件①）：必须等**异步数据真的落地**再测。
   *
   * 只等 `networkidle` 是不够的 —— 会话查询、TanStack Query 的请求可能在 idle 之后才发出，
   * 那时页面还是骨架（`min-h-[100dvh]` 让骨架的高度也正好是视口高 ⇒ 会量出一个漂亮的"OK"）。
   * 实测过：同一份代码连跑两次，一次 12/12 达标、一次 3 条路由报"锚点缺失"（量的就是骨架）。
   * 所以这里三步都做：等加载态消失 → 等声明的锚点出现 → 等两帧让布局稳定。
   */
  const settled = await page
    .waitForFunction(() => document.querySelectorAll('[aria-busy="true"]').length === 0, null, {
      timeout: 15_000,
    })
    .then(() => true)
    .catch(() => false);

  const missingAnchors = [];
  for (const selector of route.anchors) {
    const appeared = await page
      .waitForSelector(`[data-anchor="${selector}"]`, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!appeared) missingAnchors.push(selector);
  }
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))),
      ),
  );

  const before = await measure(page, route.anchors);

  if (shotDir !== null) {
    await page.screenshot({
      path: join(shotDir, `${slugOf(route.path)}-${String(viewportWidth)}.png`),
      fullPage: true,
    });
  }
  if (negativeControl) {
    // 插到 body **最前面**：整页下移 ⇒ 高度与锚点两条断言都会红（不是"塞个东西在最后"）
    await page.evaluate(() => {
      const tall = document.createElement('div');
      tall.style.height = '2000px';
      tall.dataset.negativeControl = 'true';
      document.body.prepend(tall);
    });
  }
  let injected = null;
  if (negativeControl) {
    injected = await page.evaluate(() => {
      const element = document.querySelector('[data-negative-control="true"]');
      return element === null ? null : Math.round(element.getBoundingClientRect().height);
    });
  }
  const after = negativeControl ? await measure(page, route.anchors) : before;

  const problems = [];
  if (!settled) {
    problems.push('进入页面后 15s 内仍有加载态（aria-busy）—— 判据不成立，先修加载');
  }
  if (after.scrollWidth > viewportWidth + 1) {
    problems.push(`横向溢出 scrollWidth=${String(after.scrollWidth)} > ${String(viewportWidth)}`);
  }
  // 锚点**两种口径都查**：它同时是"这页真的渲染出来了"的证据 ——
  // 只看高度会被 `min-h-[100dvh]` 骗（白屏的高度也正好等于视口高）。
  for (const selector of route.anchors) {
    const bottom = after.anchors[selector];
    if (bottom === null || bottom === undefined) {
      problems.push(`锚点缺失 data-anchor="${selector}"`);
    } else if (bottom > heightThreshold) {
      problems.push(`锚点 ${selector} 下沿 ${String(bottom)} > ${String(heightThreshold)}`);
    }
  }
  if (!mobile && after.height > heightThreshold) {
    problems.push(`整页高 ${String(after.height)} > ${String(heightThreshold)}`);
  }

  const ok = problems.length === 0;
  if (!ok) failures += 1;
  if (negativeControl && injected === null) {
    console.error(`❌ 反向控制注入未生效（${route.path}）：页面上找不到注入元素`);
    process.exit(1);
  }
  const anchorText = route.anchors
    .map((selector) => `${selector}=${String(after.anchors[selector] ?? '缺失')}`)
    .join(' ');
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${route.path.padEnd(36)} height=${String(after.height).padEnd(4)} ${anchorText}${ok ? '' : ` ← ${problems.join('；')}`}`,
  );
  await page.close();
}
await browser.close();
await stopHermetic();

if (negativeControl) {
  /**
   * 反向控制：注入 2000px 高的元素后，**每一条断言都必须能红**。
   *
   * 桌面口径看整页高度 → 注入后必然全红；
   * 手机口径看锚点 → 只有**声明了锚点**的路由会红（`/log`、404 页没有关键锚点，
   * 手机口径下它们本来就不由锚点判定）。所以判据是"有锚点的路由全红"，
   * 并把没有锚点的路由**打印出来**（不静默、也不假装它们红了）。
   */
  const withAnchors = routes.filter((route) => route.anchors.length > 0);
  const withoutAnchors = routes.filter((route) => route.anchors.length === 0);
  const provedRed = mobile ? failures >= withAnchors.length : failures === routes.length;
  if (withoutAnchors.length > 0) {
    console.log(
      `· 这 ${String(withoutAnchors.length)} 条路由没有关键锚点、手机口径不按锚点判定：` +
        withoutAnchors.map((route) => route.path).join('、'),
    );
  }
  console.log(
    provedRed
      ? `✅ 反向控制成立（${mobile ? '锚点' : '整页高度'}断言）：注入 2000px 后 ${String(failures)}/${String(routes.length)} FAIL ⇒ 守卫不是永远点头`
      : `❌ 反向控制失败：注入 2000px 后仍有 ${String(routes.length - failures)} 项通过`,
  );
  process.exit(provedRed ? 0 : 1);
}
console.log(
  failures === 0
    ? `✅ 全部页面达标（${mobile ? '手机口径：无横向滚动 + 关键锚点在首屏内' : '桌面口径：一屏装下'}）`
    : `❌ ${String(failures)} 个页面不达标`,
);
process.exit(failures === 0 ? 0 : 1);
