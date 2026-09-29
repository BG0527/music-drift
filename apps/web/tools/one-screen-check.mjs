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
 * node apps/web/tools/one-screen-check.mjs --external   # 对着已起的 5173/8788 跑（调试用，不作证据）
 * ```
 *
 * 说明：脚本跑在 Node 里，但 `page.evaluate` 的回调在**页面上下文**执行，所以这里显式声明浏览器全局。
 */
/* eslint-disable no-console */
/* global document, getComputedStyle, NodeFilter, requestAnimationFrame */
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
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

let API = external ? 'http://localhost:8788' : null;
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
 * vite 的 proxy 目标因此支持 `MDB_API_TARGET` 覆盖（默认仍是契约里的 8788）。
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
   * config 读不到 ⇒ proxy 仍指向 8788（dev API）⇒ 浏览器拿自建库的 cookie 去问 dev API，
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
 * - `heldTwoSegments`：已录 2 段、第三位持有者待录第 3 段 ⇒ 同时量录制/试听/去向。
 * 录段上传 2KB 假音频 + `x-audio-duration-ms: 20000`（服务端校验 15–30 秒）。
 */
async function register(name) {
  const handle = name.slice(0, 24);
  const registered = await fetch(`${API}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account: handle, password: 'Drift-Bottle-2026' }),
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

  /**
   * W18.5 · B3：管理员会话。
   * `/admin` 此前根本不在 `routesFor()` 里，所以这一页**从来没被量过** ——
   * 门禁也就从未发现「非管理员分支没有 `<main>`/h1」这类问题。
   * 种子里有固定管理员账号（`apps/api/src/db/seed.ts` 的 `SEED_ADMIN`），
   * 这里登一次拿 cookie，只给 `/admin` 那一条路由用。
   */
  let adminCookie = null;
  {
    const response = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account: 'admin', password: 'admin123' }),
    });
    if (response.ok) {
      const setCookies = response.headers.getSetCookie?.() ?? [];
      const header = setCookies.find((c) => c.startsWith('mdb_session='));
      if (header !== undefined) adminCookie = header.split(';')[0];
    }
    if (adminCookie === null) {
      console.warn('[gate] 管理员登录失败：/admin 这一行会按未登录视图量（结果不可信）');
    }
  }

  const songs = await (await fetch(`${API}/api/songs`)).json();
  const song = songs.find((item) => item.segments.length === item.totalSegments) ?? songs[0];

  async function createBottle(as = cookie) {
    const created = await fetch(`${API}/api/bottles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: as },
      body: JSON.stringify({ songId: song.id }),
    });
    return (await created.json()).id;
  }

  async function record(bottleId, note, as = cookie) {
    // Actual decodable recording, not an EBML magic prefix with random bytes.
    const recording = readFileSync(new URL('../../../tools/fixtures/demo-segment.webm', import.meta.url));
    const response = await fetch(`${API}/api/bottles/${bottleId}/segments`, {
      method: 'POST',
      headers: {
        cookie: as,
        'content-type': 'audio/webm',
        'x-audio-duration-ms': '20000',
        'x-segment-note': encodeURIComponent(note),
      },
      body: recording,
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
  const relayCookies = [];
  await record(seaId, '布局检查用的第一棒');
  await resolve(seaId, 'RIVER');
  for (let index = 2; index <= song.totalSegments; index += 1) {
    const relay = await register(`relay${stamp}${String(index)}`);
    relayCookies.push(relay.cookie);
    const drawn = await drawUntil(relay.cookie, seaId);
    if (drawn !== seaId) {
      throw new Error(`第 ${String(index)} 棒没捞到目标瓶子（拿到 ${String(drawn)}）`);
    }
    await record(seaId, `布局检查用的第 ${String(index)} 段`, relay.cookie);
    await resolve(seaId, index === song.totalSegments ? 'SEA' : 'RIVER', relay.cookie);
  }
  // Twenty genuine completion notifications and bottle rows stress the profile's inner scrolling.
  for (let sample = 1; sample < 20; sample += 1) {
    const completedId = await createBottle();
    await record(completedId, `长列表验证 ${sample}`);
    await resolve(completedId, 'RIVER');
    for (const [index, relayCookie] of relayCookies.entries()) {
      if (await drawUntil(relayCookie, completedId) !== completedId) throw new Error('长列表接力打捞失败');
      await record(completedId, `长列表第 ${index + 2} 段`, relayCookie);
      await resolve(completedId, index === relayCookies.length - 1 ? 'SEA' : 'RIVER', relayCookie);
    }
  }
  const comment = await fetch(`${API}/api/bottles/${seaId}/comments`, {
    method: 'POST', headers: { cookie: relayCookies[0], 'content-type': 'application/json' },
    body: JSON.stringify({ content: '几何验证公开评论' }),
  });
  if (comment.status !== 201) throw new Error(`公开评论种子失败 ${comment.status}`);

  // ② 投河（非持有者视角）
  const riverId = await createBottle();
  await record(riverId, '布局检查用的第一棒');
  await resolve(riverId, 'RIVER');
  // 20+ public lifecycle events, with real draw/put-back commands and distinct handlers.
  for (let index = 0; index < 10; index += 1) {
    const passer = await register(`pass${stamp}${index}`);
    if (await drawUntil(passer.cookie, riverId) !== riverId) throw new Error('日志长列表打捞失败');
    const putBack = await fetch(`${API}/api/bottles/${riverId}/put-back`, {
      method: 'POST', headers: { cookie: passer.cookie },
    });
    if (!putBack.ok) throw new Error('日志长列表放回失败');
  }

  // ③ 已录 2 段，主测试账号作为第三位持有者（待录第 3 段）
  const heldCreator = await register(`heldcreator${stamp}`);
  const heldSecond = await register(`heldsecond${stamp}`);
  const heldTwoSegmentsId = await createBottle(heldCreator.cookie);
  await record(heldTwoSegmentsId, '布局检查·持有态第一段', heldCreator.cookie);
  await resolve(heldTwoSegmentsId, 'RIVER', heldCreator.cookie);
  await drawUntil(heldSecond.cookie, heldTwoSegmentsId);
  await record(heldTwoSegmentsId, '布局检查·持有态第二段', heldSecond.cookie);
  await resolve(heldTwoSegmentsId, 'RIVER', heldSecond.cookie);
  await drawUntil(cookie, heldTwoSegmentsId);

  // ④ **刚发起、什么都没录**（用户 2026-09-23 报的 P0：这一步曾显示"不在你手上"，录不了第 1 段）
  const freshId = await createBottle();

  return { cookie, adminCookie, seaId, riverId, heldTwoSegmentsId, freshId,
    recordHeld: () => record(heldTwoSegmentsId, '几何检查·第三段等待去向') };
}

// ---------------------------------------------------------------- 判据

/**
 * 每个路由声明**它自己的关键锚点**（captain 定的清单）。
 * 锚点用 `data-anchor="…"` 标在页面上 —— 显式、可 grep、可被源守卫检查，
 * 比"按文案找按钮"稳（文案会改，锚点不会）。
 */
function routesFor(seed) {
  return [
    // t12（captain 裁决，合同 revision 4）：`/` 改为 landing（翻页式介绍页）⇒ 锚点换成第一屏
    // intro-hero；保留 / 行让根路由继续受一屏守卫覆盖，河道锚点由 /river 行承担。
    { path: '/', anchors: ['intro-hero'] },
    { path: '/river', anchors: ['river-draw', 'river-drop'] },
    
    // W18.5 · B9：公海在窄屏是单列长列表（内容超过一屏是正确行为，页面可滚）
    // ⇒ 窄屏不查「锚点在一屏内」，只查无横滚 / 无压叠 / 锚点存在。
    { path: '/sea', anchors: ['sea-list'], scrollableOnMobile: true },
    { path: '/new', anchors: ['new-catalog'] },
    // ⚠️ 2026-09-27：`/sea/:id` 路由已按用户 §17 裁决删除（公海详情并入瓶子详情）⇒ 不再量这一页；
    // seed.seaId 仍保留（`/sea` 列表需要一支完整作品才量得到真实内容）。
    { path: '/me', anchors: ['me-bottles'], needsAuth: true },
    { path: '/settings', anchors: ['settings-attribution'], needsAuth: true },
    { path: `/bottles/${seed.riverId}`, anchors: ['bottle-play', 'bottle-action'], needsAuth: true },
    {
      path: `/bottles/${seed.heldTwoSegmentsId}`,
      anchors: ['bottle-record', 'bottle-play', 'bottle-action'],
      needsAuth: true,
    },
    // 刚发起的草稿：必须能看到「录第 1 段」（P0 回归守卫）
    { path: `/bottles/${seed.freshId}`, anchors: ['bottle-record'], needsAuth: true },
    { path: `/bottles/${seed.seaId}`, anchors: ['bottle-play', 'bottle-action'], scenario: 'playing-four' },
    { path: `/bottles/${seed.heldTwoSegmentsId}`, anchors: ['bottle-play', 'bottle-action'], scenario: 'awaiting-destination' },
    { path: `/bottles/${seed.heldTwoSegmentsId}`, anchors: ['bottle-play', 'bottle-action'], scenario: 'destination-completed' },
    { path: `/bottles/${seed.riverId}/log`, anchors: [], needsAuth: true },
    // W18.5 · B3：这两页此前**不在**门禁里，等于从来没被量过。
    // /login：匿名可达（登出态量），锚点取登录卡；/admin：需要管理员会话。
    { path: '/login', anchors: ['login-card'], guest: true },
    { path: '/admin', anchors: ['admin-queue'], needsAdmin: true },
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
    const visualOverlaps = [];
    const bottlePage = document.querySelector('.bottle-page');
    if (bottlePage !== null) {
      const fragments = [];
      const walker = document.createTreeWalker(bottlePage, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        const element = node.parentElement;
        if (text === '' || element === null) continue;
        const style = getComputedStyle(element);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          Number(style.opacity) === 0 ||
          element.closest('[aria-hidden="true"]') !== null ||
          element.closest('.sr-only') !== null
        ) {
          continue;
        }
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width < 2 || rect.height < 2) continue;
          fragments.push({ node, rect, label: `${element.tagName.toLowerCase()}:${text.slice(0, 32)}` });
        }
      }
      for (let leftIndex = 0; leftIndex < fragments.length; leftIndex += 1) {
        const left = fragments[leftIndex];
        for (let rightIndex = leftIndex + 1; rightIndex < fragments.length; rightIndex += 1) {
          const right = fragments[rightIndex];
          if (left.node === right.node) continue;
          const overlapWidth = Math.min(left.rect.right, right.rect.right) - Math.max(left.rect.left, right.rect.left);
          const overlapHeight = Math.min(left.rect.bottom, right.rect.bottom) - Math.max(left.rect.top, right.rect.top);
          if (overlapWidth <= 2 || overlapHeight <= 2) continue;
          visualOverlaps.push(`${left.label} ↔ ${right.label}`);
        }
      }
      const controls = [...bottlePage.querySelectorAll('button, a, audio[controls]')]
        .filter((element) => element.checkVisibility())
        .map((element) => ({ element, rect: element.getBoundingClientRect() }));
      for (let leftIndex = 0; leftIndex < controls.length; leftIndex += 1) {
        const left = controls[leftIndex];
        for (const right of controls.slice(leftIndex + 1)) {
          if (left.element.contains(right.element) || right.element.contains(left.element)) continue;
          const overlapWidth = Math.min(left.rect.right, right.rect.right) - Math.max(left.rect.left, right.rect.left);
          const overlapHeight = Math.min(left.rect.bottom, right.rect.bottom) - Math.max(left.rect.top, right.rect.top);
          if (overlapWidth > 2 && overlapHeight > 2) visualOverlaps.push(`controls:${left.element.textContent?.trim()} ↔ ${right.element.textContent?.trim() || right.element.tagName}`);
        }
      }
      if (bottlePage.scrollLeft !== 0) visualOverlaps.push(`页面内部横向滚动 ${bottlePage.scrollLeft}px`);
    }

    /**
     * W18.5 · B3：顶栏（fixed）压首屏内容的检测。
     *
     * 为什么必须单列一条：此前 mobile 分支只查「锚点下沿 ≤ 812」+「无横向溢出」，
     * 而 fixed 顶栏压住页面首行时锚点下沿完全可能只有 200px（"在视口内"）——
     * 于是「/sea 375 六列压叠」「选歌/设置/瓶子/公海/日志首行被顶栏压住」这些
     * 真实缺陷全部能全绿通过。判据必须量**几何相交**，不能只量位置。
     *
     * 做法：取顶栏矩形，再取首屏里"最靠上的一批可见文字/控件"矩形，
     * 任何与顶栏相交面积 > 2px² 的都算缺陷。
     */
    const navRect = (() => {
      const nav = document.querySelector('[data-testid="top-nav"]');
      if (nav === null) return null;
      const rect = nav.getBoundingClientRect();
      // 顶栏自身可能带透明区域；只取它实际占据的高度
      if (rect.width < 4 || rect.height < 4) return null;
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    })();

    const navOverlaps = [];
    if (navRect !== null) {
      const navBottom = navRect.bottom;
      /**
       * 只看**叶子节点**（有文字或本身就是可点/表单件）。
       * 排除 `section/ul/nav` 这类容器：整屏容器（例如 landing 的 `.landing-screen`，
       * top=0 / height=100dvh）必然与顶栏相交，但它的**文字**在内部 padding 里并没有被压 ——
       * 拿容器判重叠会把"整屏"恒判成失败（第一版就踩了这个坑，见 .tmp-w185/probe-nav-overlap.mjs）。
       */
      const nodes = [
        ...document.querySelectorAll(
          'h1, h2, h3, p, a, button, label, li > span, li > div, input, textarea, select, [data-anchor]',
        ),
      ];
      for (const node of nodes) {
        // 顶栏自己内部的元素不算（顶栏是 fixed 容器，里面还有一个 <nav aria-label="站内导航">）
        if (node.closest('[data-testid="top-nav"]') !== null) continue;
        // 另一个 fixed 浮层（Landing 的圆点导航等）不算"被压住的内容" ——
        // 自己**或任一祖先**是 fixed 都算（Landing 圆点按钮自己是 static，祖先 nav 才是 fixed，
        // 只判自己会漏掉它与顶栏边缘的 5px 擦碰）。
        let insideOtherFixed = false;
        for (let el = node; el !== null && el !== document.body; el = el.parentElement) {
          if (getComputedStyle(el).position === 'fixed') {
            insideOtherFixed = true;
            break;
          }
        }
        if (insideOtherFixed) continue;
        const style = getComputedStyle(node);
        if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) {
          continue;
        }
        const rect = node.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) continue;
        // 整屏级容器不算（Landing 的 `.landing-screen` / `intro-hero` 锚点都挂在 section 上，
        // 它们 top=0、height=100dvh，必然与顶栏相交，但里面的文字并没有被压）
        if (rect.height > window.innerHeight * 0.6) continue;
        // 只看落在视口上缘一带的内容（顶栏压的正是"首屏最上面"那一批）
        if (rect.top > navBottom + 2) continue;
        const overlapHeight = Math.min(rect.bottom, navBottom) - Math.max(rect.top, navRect.top);
        const overlapWidth = Math.min(rect.right, navRect.right) - Math.max(rect.left, navRect.left);
        if (overlapWidth > 2 && overlapHeight > 2) {
          const label = (node.textContent ?? '').trim().slice(0, 18) || node.tagName;
          navOverlaps.push(`顶栏压住首屏内容「${label}」（交叠 ${String(Math.round(overlapHeight))}px）`);
          if (navOverlaps.length >= 4) break;
        }
      }
    }

    return {
      height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      scrollWidth: document.documentElement.scrollWidth,
      anchors,
      visualOverlaps,
      navOverlaps,
      navRect,
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
/** 会话 cookie（`mdb_session=…` → Playwright cookie 对象）。W18.5 · B3 抽出，供逐路由切换身份复用。 */
function sessionCookie(cookieHeader) {
  return {
    name: 'mdb_session',
    value: cookieHeader.slice('mdb_session='.length),
    domain: '127.0.0.1',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  };
}

await context.addCookies([sessionCookie(seed.cookie)]);

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
  if (route.scenario === 'awaiting-destination') await seed.recordHeld();
  // W18.5 · B3：每条路由可以指定会话身份 ——
  //   needsAdmin：换成管理员 cookie（/admin 否则只会量到"非管理员"那一支）；
  //   guest：清掉 cookie（/login 必须按登出态量，登录态下它会直接给"你已登录"的出口）。
  // 换 cookie 走 context 层，因为 cookie 是 context 级的。
  if (route.needsAdmin === true) {
    if (seed.adminCookie === null) throw new Error('/admin 需要管理员会话，但管理员登录失败');
    await context.clearCookies();
    await context.addCookies([sessionCookie(seed.adminCookie)]);
  } else if (route.guest === true) {
    await context.clearCookies();
  } else {
    await context.clearCookies();
    await context.addCookies([sessionCookie(seed.cookie)]);
  }
  const page = await context.newPage();
  await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' });
  if (route.scenario === 'playing-four' || route.scenario === 'awaiting-destination') {
    if (route.scenario === 'awaiting-destination' && await page.locator('.destRow').count() !== 3) {
      throw new Error('待去向场景没有三条真实去向');
    }
    await page.getByRole('button', { name: '听全部', exact: true }).click();
    await page.waitForFunction(() => {
      const audio = document.querySelector('[aria-label="全部接唱连续播放"]');
      return audio !== null && !audio.paused && audio.currentTime > 0;
    });
    if (route.scenario === 'playing-four') {
      await page.evaluate(() => {
        const audio = document.querySelector('[aria-label="全部接唱连续播放"]');
        audio.currentTime = audio.duration - 0.1;
      });
      await page.getByLabel('连续播放段落进度').filter({ hasText: '2/4' }).waitFor();
      await page.getByRole('button', { name: '公开评论', exact: true }).click();
      await page.getByText('几何验证公开评论', { exact: true }).waitFor();
      const overlayAboveNav = await page.evaluate(() =>
        document.elementFromPoint(innerWidth / 2, 30)?.closest('[data-modal-root]') !== null);
      if (!overlayAboveNav) throw new Error('评论弹窗遮罩在顶栏下面');
      await page.getByRole('button', { name: '举报这条评论' }).click();
      await page.getByRole('dialog', { name: '举报这条评论' }).waitFor();
      if (await page.locator('[data-modal-root]').count() !== 1) throw new Error('评论和举报弹窗重叠');
      await page.getByRole('dialog').getByRole('textbox').fill('几何验证：焦点可以进入举报理由');
      await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
      await page.locator('[data-modal-root]').waitFor({ state: 'detached' });
    }
    await page.waitForTimeout(350);
  }
  if (route.scenario === 'destination-completed') {
    await page.locator('.destRow').first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /继续投河/ }).click();
    await dialog.getByRole('button', { name: '确认投递' }).click();
    await page.getByText('已投河：等下一位陌生人捞到它。').waitFor();
    await page.getByRole('heading', { name: '沿着歌声听下去' }).waitFor();
    await page.getByText('已投河：等下一位陌生人捞到它。').waitFor({ state: 'hidden', timeout: 5000 });
    if (await page.getByRole('heading', { name: '选择去向', exact: true }).count() > 0) {
      throw new Error('投递完成后仍有选择去向');
    }
  }
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
  if (route.path === '/me' || route.path.endsWith('/log')) {
    const selector = route.path === '/me' ? '.msgs ul' : '[data-testid="drift-log"]';
    const listCheck = await page.locator(selector).evaluate((element) => {
      const children = [...element.querySelectorAll(':scope > li')];
      const previous = element.scrollTop;
      element.scrollTop = element.scrollHeight;
      const last = children.at(-1)?.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      const result = { count: children.length, scrollable: element.scrollTop > 0,
        bottom: box.bottom, lastVisible: last !== undefined && last.bottom <= box.bottom + 2 };
      element.scrollTop = previous;
      return result;
    });
    console.log(`[long-list] ${route.path} ${JSON.stringify(listCheck)}`);
    if (listCheck.count < 20) throw new Error('压力样本少于20条');
    if (!mobile && (!listCheck.scrollable || !listCheck.lastVisible || listCheck.bottom > viewportHeight)) {
      throw new Error(`长列表末项不可达 ${JSON.stringify(listCheck)}`);
    }
    if (!mobile && route.path === '/me') {
      const collectBox = await page.getByRole('button', { name: '我的收藏', exact: true }).boundingBox();
      if (collectBox === null || collectBox.y + collectBox.height > viewportHeight) throw new Error('我的收藏按钮不在首屏');
    }
  }

  if (shotDir !== null) {
    await page.screenshot({
      path: join(shotDir, `${slugOf(route.path)}${route.scenario ? `-${route.scenario}` : ''}-${String(viewportWidth)}.png`),
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
  //
  // W18.5 · B9：`scrollableOnMobile` 例外 —— 公海在 375 下是**真正的单列长列表**
  // （B9 之前它根本没有窄屏分支，六列各 50px 互相压叠）。单列堆叠后内容必然
  // 超过一屏，而这是正确行为（页面可滚）。对这类页面，窄屏只查
  // 「无横向溢出 + 无压叠 + 锚点存在」，不查「锚点在一屏内」——
  // 与 §56「375 不强制一屏，只要求无横滚 + 锚点存在」的口径一致。
  const anchorMustFit = !(mobile && route.scrollableOnMobile === true);
  for (const selector of route.anchors) {
    const bottom = after.anchors[selector];
    if (bottom === null || bottom === undefined) {
      problems.push(`锚点缺失 data-anchor="${selector}"`);
    } else if (anchorMustFit && bottom > heightThreshold) {
      problems.push(`锚点 ${selector} 下沿 ${String(bottom)} > ${String(heightThreshold)}`);
    }
  }
  if (!mobile && after.height > heightThreshold) {
    problems.push(`整页高 ${String(after.height)} > ${String(heightThreshold)}`);
  }
  // W18.5 · B3：顶栏压首屏内容 —— 桌面与窄屏**都**查。
  // 桌面此前靠"整页高度"间接兜住，但那是巧合（压住时高度不变），不是判据；
  // 窄屏则是彻底盲区（锚点下沿可以是 200px，照样"在视口内"）。
  if (mobile && after.navOverlaps.length > 0) {
    problems.push(after.navOverlaps.slice(0, 3).join('；'));
  }
  if (after.visualOverlaps.length === 0) {
    // 明确保留这个分支：静态守卫据此确认真浏览器门禁不是只测高度。
  } else {
    problems.push(`可见文字/控件相交：${after.visualOverlaps.slice(0, 4).join('；')}`);
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
