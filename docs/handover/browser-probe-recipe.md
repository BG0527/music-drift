# 真实浏览器探针 · 可重建配方（audio-engineer，2026-09-24）

> **这一层是干什么的**：在**真 Chromium**里对着**真页面 / 真 API / 一次性真库**跑完整链路（录 → 传 → 投递 → 播放 / 试听），
> 用**真实音频字节**验证"用户到底能不能听见"。它**不是** E2E 测试框架，而是**一次性证据生成器**：
> 按 captain 裁决（2026-09-24）**不入库为依赖**（AGENTS.md §7：E2E 工具属待裁决项），
> 但**配方必须能在仓库里重建** —— 本文就是那份配方，含完整脚本（已实测"从本文抽回脚本直接跑通"）。

## 0. 为什么需要它（哪一层能证明什么）

| 层                        | 能证明                                                                       | **证明不了**                                                      |
| ------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| jsdom 单测（vitest）      | 状态机与分支（播完→重播 / 未播完→暂停）、组件文案、`aria-live`、请求体形状   | 真实音频能否解码播放、`MediaRecorder` 产物能否播、真实网络与契约  |
| 静态扫描                  | 只引用契约 token / 不动画布局属性 / 无 key 重建                              | 任何运行时行为                                                    |
| **本探针（真 Chromium）** | **真实 MediaRecorder 产物 → objectURL → 真的出声**；真实 Range/上传/契约链路 | 视觉平滑度（动效观感，需真机录屏）；多浏览器差异（只跑 Chromium） |

**它抓到的真实缺陷（示范这一层的价值）**：`POST /api/segments/:id/listen` 的 `coveredMs` 前端发的是**浮点**、
契约要求 `z.number().int()` ⇒ 真浏览器里 **21 次全部 400**（响应体 `violations: []`，光看响应体查不出原因）⇒
**覆盖率永远推不上去 ⇒ 点踩门槛永远不满足**。当时**所有自动化测试都是绿的**（假传输层把小数抹平了）。

## 1. 前置

- Node ≥ 22.12、pnpm ≥ 10、本机 PostgreSQL（`apps/api` 的 `.env`；探针复用 `apps/api/src/db/live-check.ts` 的建库/迁移/种子机制）；
- **Playwright**：不要装进项目依赖，用 `npx` 缓存里的那份（`apps/web/tools/one-screen-check.mjs` 也是这个用法）：

  ```bash
  npx playwright screenshot --help   # 只为把 playwright 落到 npx 缓存（_npx/*/node_modules/playwright）
  ```

- 脚本放在**仓库外**（例：`D:/music-rec-probe/probe.mjs`）。它只**读**仓库、不改仓库。

## 2. 怎么跑

```bash
node D:/music-rec-probe/probe.mjs
```

跑之前先确认**环境安静**（否则结论无效，见 §4）：

```bash
# 近 70 秒内若有人改前端源码，就先等一会儿再跑（HMR 会让页面重载、元素脱离）
find apps/web/src apps/web/tools -newermt '-70 seconds' -type f | wc -l   # 期望 0
```

**报告形态**：逐条 `PASS/FAIL` + 关键数值，最后一行 `[result] ALL PASS`；退出码 0 = 全通过，1 = 有 FAIL。
（脚本里 `check()` 收集失败项并在末尾汇总 —— 不要拿"最后一条 PASS"当通过依据。）

## 3. 成功配方（五个要点，缺一条就得不到可信结论）

1. **假麦克风**（无真人参与也能录到真音频字节）：

   ```js
   const browser = await chromium.launch({
     args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
   });
   await context.grantPermissions(['microphone'], { origin: BASE });
   ```

   假设备产出**真实可解码的 WebM/Opus**（本会话实测：录 20 秒 → `duration ≈ 19.7–20.2`），这是"真的在出声"的前提。

2. **一次性库 + 自起 API**（复用 `apps/api/src/db/live-check.ts`）：`live-check.ts create` 解析出 `databaseUrl`，
   用 `DATABASE_URL`/`PORT` 起 `src/server.ts`，`/healthz` 探活；跑完 `drop` + `sweep`。
   **不要对着 8787 的 dev 服务跑**：库里有别人的数据，"通过"取决于运气。

3. **自起 vite 并把 `/api` 代理指到自起 API** —— **必须在 `process.env` 上设**：

   ```js
   process.env['MDB_API_TARGET'] = API; // ⚠️ 必须设在本进程：vite.config.ts 在本进程求值，
   const vite = await createViteServer({}); //    传给 createViteServer({env}) 只进 import.meta.env，代理仍指 8787
   ```

   这个坑的历史后果：浏览器拿自建库的 cookie 去问 dev API ⇒ 全站"未登录" ⇒ **每个页面都短、每个断言都绿**（假绿）。

4. **登录态**：`POST /api/auth/register` 拿 `mdb_session` cookie，再 `context.addCookies({ domain: '127.0.0.1', sameSite: 'Lax', httpOnly: true })`。

5. **抓住游离的 `<audio>`**：试听元素与播放器元素都是 `new Audio()` 造出来的**游离节点**（不在 DOM 里），
   `page.locator('audio')` **看不到它们**。必须在页面脚本执行前挂钩构造器（`context.addInitScript`）。
   取值时**从后往前**找（`findLast` 语义）：HMR 重挂载会新建元素而把旧的留在数组里，
   用 `findIndex` 会读到那个已被 `pause()` 的旧元素 ⇒ 得到**假的"点了没反应"**。

## 4. 已知干扰：怎么区分"环境不安静"与"产品缺陷"

| 现象                                                | 真因                                                                                                     | 正确处置                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 点击报 `element was detached from the DOM`          | 别人的改动触发 vite HMR / 页面重载（元素被换掉）                                                         | 判"本轮不算数"，等安静窗口重跑；**不要改产品**                                                |
| 播放后 `paused=true` 且 `currentTime=0`             | 用 `findIndex` 读到 HMR 前那个被 cleanup `pause()` 的旧元素                                              | 改 `findLast` 语义（见 §3.5）                                                                 |
| 断言随 HMR 时好时坏                                 | 在途改动窗口内取基线                                                                                     | 记 mtime + 测量时刻，重跑到"安静"为止                                                         |
| "点击播放后真的在响"偶发 FAIL，紧随其后的断言又正常 | 真实 WebM 走 Range 流式加载，**起播延迟取决于冷/热缓存**（同一脚本一次 1.0s 内起播、一次 1.2s 还没起播） | **等条件**（有界 `waitForFunction`），不要固定 `sleep`；等不到仍判 FAIL —— 不是"重试掩盖问题" |

脚本里已内置这条纪律：把 `[vite] … hmr/reload` 与测量期间的 `framenavigated` 记为 `disturbed`，
末尾以"测量期间环境安静"这条断言把不合格的跑次**判红**（而不是当成产品缺陷）。

## 5. 断言清单（#1 / #3 / #4 的可验收口径）

| #    | 断言                                                          | 期望形态（本会话实测值）                                                                    |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| #3   | 录完出现「试听本段」，状态文字可读                            | 按钮存在；文案含"刚录"                                                                      |
| #3   | 试听元素指向 `blob:`（本地产物，不经服务端）                  | `src === 'blob:http://127.0.0.1:…/'`                                                        |
| #3   | 试听**真的在出声**（点之前是暂停态）                          | 点击前 `paused=true, currentTime=0`；点击后 `paused=false, currentTime>0.4`、`duration≈3.8` |
| #3   | 播完 → 「重听本段」→ 从头                                     | `ended=true` 后文案含"听完"；再点 `currentTime` 回到 <1 且 `paused=false`                   |
| #1   | 非持有者能操作播放器 + 拿到**真实音频元素**（src 含 `/api/`） | `index>=0`；`duration≈19.7–20.2`（真 WebM 可解码）                                          |
| #1   | 播放中：按钮变「暂停」+ 文案「正在播放」                      | 点击后 `paused=false`；文案「正在播放」                                                     |
| #1   | **未播完再点 = 暂停**                                         | `paused=true`；文案「已暂停（再点继续播放）」                                               |
| #1   | **播完停在结尾**（不假装还在播）                              | `currentTime ≈ duration`（实测 19.68/19.68）                                                |
| #1   | **播完再点 = 从头重播**                                       | `paused=false` 且 `currentTime < 3`（实测 0.98–1.01）                                       |
| #4   | 录制面板显示「本段 N 秒（±2.0 秒）」，**不含**"15–30 秒"      | 实测「本段 20.0 秒（与这段伴奏等长，允许 ±2.0 秒）」                                        |
| #4   | **录满自动停**（不点「停止录制」，等「用这一段」自行出现）    | `autoStopped=true`                                                                          |
| 契约 | `/listen` 全部 2xx（覆盖率真的报上去了）                      | 实测 21–22 次全 200                                                                         |
| 清理 | 已作废的 `/duration` **0 次调用**                             | 实测 0 次                                                                                   |
| 健康 | 整轮无 4xx/5xx、无页面级 JS 错误、测量期间环境安静            | 全 0 / 空                                                                                   |

## 6. 完整脚本（可直接重建）

> 下面的代码块**故意标成 `text`**：`prettier` 会重排 `js` / `javascript` 代码块（实测 21096 → 26032 字节），
> 重排后就不再与运行副本逐字节一致 ⇒ 破坏"可重建"。复制出来按 JS 用即可
> （已实测：从本文抽回脚本 → `node --check` 通过 → 直接跑出 `ALL PASS`）。
> 改脚本时请改**运行副本**再整块同步过来，不要在文档里手改。

<!-- prettier-ignore-start -->

```text
/**
 * 一次性真实浏览器探针（用户需求 ③）：录一段 → 点「试听本段」→ 真的出声。
 *
 * 为什么需要它：jsdom 单测能证明"按钮出现 / 调用了 play()"，但**证明不了**真实浏览器里
 * ① MediaRecorder 产出的 Blob 能被 objectURL 播放；② 点击是用户手势、自动播放策略不会拦；
 * ③ 播完再点的语义与文案和真实时长对得上。这三条只有真 Chromium 能回答。
 *
 * 刻意**不写进仓库**：它需要一个一次性库 + 自起 API + 自起 vite，还要 Playwright
 * （仓库未登记该依赖，属 AGENTS.md §7 待裁决项）。这里只作为一次性证据，跑完即弃。
 *
 * 用法：node D:/music-rec-probe/probe.mjs
 */
/* eslint-disable no-console */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';

const REPO = 'D:/Develop/projects/music';
const API_DIR = join(REPO, 'apps/api');
const WEB_DIR = join(REPO, 'apps/web');
const TSX_CLI = createRequire(join(API_DIR, 'package.json')).resolve('tsx/cli');
const IS_WINDOWS = process.platform === 'win32';

const failures = [];
function check(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  —— ${detail}`}`);
  if (!ok) failures.push(label);
}

function runDbTool(args) {
  const result = spawnSync(
    process.execPath,
    [TSX_CLI, '--env-file-if-exists=../../.env', 'src/db/live-check.ts', ...args],
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
      /* 继续往上找 */
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
      /* 还没起来 */
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

async function loadPlaywright() {
  const cacheRoot = join(homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
  if (existsSync(cacheRoot)) {
    for (const entry of readdirSync(cacheRoot)) {
      const candidate = join(cacheRoot, entry, 'node_modules', 'playwright', 'index.mjs');
      if (existsSync(candidate)) return await import(`file://${candidate.replaceAll('\\', '/')}`);
    }
  }
  throw new Error('找不到 playwright（npx 缓存里没有）');
}

let hermetic = null;
async function stopHermetic() {
  if (hermetic === null) return;
  const { databaseName, apiChild, vite } = hermetic;
  hermetic = null;
  try {
    await vite.close();
  } catch {
    /* 忽略 */
  }
  killTree(apiChild);
  const dropped = runDbTool(['drop', databaseName]);
  const info = lastJsonLine(dropped.stdout);
  console.log(`[teardown] 删库 ${databaseName} → ${info?.dropped === true ? '已删除' : '未删除'}`);
  runDbTool(['sweep']);
}

async function main() {
  console.log('[setup] 建一次性库 …');
  const created = runDbTool(['create']);
  if (created.status !== 0) {
    console.error(created.stdout, created.stderr);
    process.exit(1);
  }
  const info = lastJsonLine(created.stdout);
  if (info === null || typeof info.databaseUrl !== 'string') {
    console.error('无法解析 live-check:db create 的输出：', created.stdout);
    process.exit(1);
  }

  const apiPort = await freePort();
  const API = `http://127.0.0.1:${apiPort}`;
  const apiChild = spawn(
    process.execPath,
    [TSX_CLI, '--env-file-if-exists=../../.env', 'src/server.ts'],
    {
      cwd: API_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        DATABASE_URL: info.databaseUrl,
        PORT: String(apiPort),
        LOG_LEVEL: 'error',
      },
    },
  );
  let serverLog = '';
  const collect = (chunk) => {
    serverLog += String(chunk);
  };
  apiChild.stdout.on('data', collect);
  apiChild.stderr.on('data', collect);
  if (!(await waitForHealth(API))) {
    console.error(`API 未就绪：\n${serverLog}`);
    killTree(apiChild);
    process.exit(1);
  }

  const vitePort = await freePort();
  const BASE = `http://127.0.0.1:${vitePort}`;
  process.env['MDB_API_TARGET'] = API;
  const { createServer: createViteServer } = await import(
    `file://${join(WEB_DIR, 'node_modules', 'vite', 'dist', 'node', 'index.js').replaceAll('\\', '/')}`
  );
  const vite = await createViteServer({
    configFile: join(WEB_DIR, 'vite.config.ts'),
    root: WEB_DIR,
    server: { port: vitePort, strictPort: true, host: '127.0.0.1' },
  });
  await vite.listen();
  hermetic = { databaseName: info.databaseName, apiChild, vite };
  console.log(`[setup] 库 ${info.databaseName} · API ${API} · web ${BASE}`);

  // 注册 + 建一瓶（留在手上 ⇒ /bottles/:id 上有「录第 1 段」）
  const handle = `probe${Date.now().toString(36)}`;
  const registered = await fetch(`${API}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ handle, email: `${handle}@example.com`, password: 'Drift-Bottle-2026' }),
  });
  if (registered.status !== 201) throw new Error(`注册失败：${await registered.text()}`);
  const cookieHeader = registered.headers.getSetCookie().find((c) => c.startsWith('mdb_session='));
  const cookie = cookieHeader.split(';')[0];
  const songs = await (await fetch(`${API}/api/songs`)).json();
  const song = songs.find((item) => item.segments.length === item.totalSegments) ?? songs[0];
  const bottleResponse = await fetch(`${API}/api/bottles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ songId: song.id }),
  });
  const bottleId = (await bottleResponse.json()).id;
  console.log(`[seed] 瓶子 ${bottleId}（${handle}）`);

  /** 再建一瓶（同样是"留在手上"）。 */
  async function createBottle() {
    const response = await fetch(`${API}/api/bottles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ songId: song.id }),
    });
    return (await response.json()).id;
  }

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.grantPermissions(['microphone'], { origin: BASE });
  await context.addCookies([
    {
      name: 'mdb_session',
      value: cookie.slice('mdb_session='.length),
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  // 抓住页面里 `new Audio()` 造出来的试听元素（试听元素是**游离**的，不在 DOM 里，只能从构造处抓）
  await context.addInitScript(() => {
    const Original = window.Audio;
    window.__probeAudios = [];
    window.Audio = function (...args) {
      const element = new Original(...args);
      window.__probeAudios.push(element);
      return element;
    };
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));

  await page.goto(`${BASE}/bottles/${bottleId}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /录第 ?1 ?段/ }).click();
  await page.getByRole('button', { name: /开始录制/ }).click();
  console.log('[step] 录制中（假麦克风，4 秒）…');
  await page.waitForTimeout(4_000);
  await page.getByRole('button', { name: /停止录制/ }).click();
  await page.waitForTimeout(300);

  const previewButton = page.getByRole('button', { name: /试听本段/ });
  check('录完出现「试听本段」', (await previewButton.count()) === 1);
  const stateText = await page.getByTestId('preview-state').textContent();
  check('试听状态有文字提示（不只靠颜色）', /刚录/.test(stateText ?? ''), stateText ?? '');

  const elementIndex = await page.evaluate(() => {
    const list = window.__probeAudios ?? [];
    return list.findIndex((item) => String(item.src).startsWith('blob:'));
  });
  check('存在指向 blob: 的试听元素（不泄漏到 DOM）', elementIndex >= 0, `index=${String(elementIndex)}`);

  const before = await page.evaluate(
    (index) => {
      const element = (window.__probeAudios ?? [])[index];
      return element === undefined
        ? null
        : { paused: element.paused, currentTime: element.currentTime, src: element.src };
    },
    elementIndex,
  );
  check('试听前是暂停状态（不自动外放）', before?.paused === true, JSON.stringify(before));

  await previewButton.click();
  // 同样"等条件"：本地产物（blob:）通常瞬间起播，但不给固定 sleep 留把慢的判成"没反应"的口子
  await page
    .waitForFunction(
      (index) => {
        const element = (window.__probeAudios ?? [])[index];
        return element !== undefined && element.paused === false && element.currentTime > 0.4;
      },
      elementIndex,
      { timeout: 10_000 },
    )
    .catch(() => undefined);
  const playing = await page.evaluate(
    (index) => {
      const element = (window.__probeAudios ?? [])[index];
      return { paused: element.paused, currentTime: element.currentTime, duration: element.duration };
    },
    elementIndex,
  );
  check(
    '点击后浏览器真的在播放（paused=false 且 currentTime 前进）',
    playing.paused === false && playing.currentTime > 0.4,
    JSON.stringify(playing),
  );
  const playingText = await page.getByTestId('preview-state').textContent();
  check('播放中状态文字可读', /正在试听/.test(playingText ?? ''), playingText ?? '');

  await page.getByRole('button', { name: /暂停试听/ }).click();
  await page.waitForTimeout(150);
  const paused = await page.evaluate((index) => {
    const element = (window.__probeAudios ?? [])[index];
    return { paused: element.paused, currentTime: element.currentTime };
  }, elementIndex);
  check('再点变暂停（未播完 → 暂停）', paused.paused === true, JSON.stringify(paused));

  await page.getByRole('button', { name: /继续试听/ }).click();
  console.log('[step] 等它自然播完（约 4 秒）…');
  await page.waitForFunction(
    (index) => {
      const element = (window.__probeAudios ?? [])[index];
      return element !== undefined && element.ended === true;
    },
    elementIndex,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(200);
  const endedText = await page.getByTestId('preview-state').textContent();
  check('播完状态文字提示"听完"', /听完/.test(endedText ?? ''), endedText ?? '');
  const replayButton = page.getByRole('button', { name: /重听本段/ });
  check('播完后按钮变「重听本段」', (await replayButton.count()) === 1);

  await replayButton.click();
  await page.waitForTimeout(800);
  const replayed = await page.evaluate((index) => {
    const element = (window.__probeAudios ?? [])[index];
    return { paused: element.paused, currentTime: element.currentTime };
  }, elementIndex);
  check(
    '播完再点 = 从头再听一遍（不是没反应）',
    replayed.paused === false && replayed.currentTime > 0.2,
    JSON.stringify(replayed),
  );

  check('没有页面级 JS 错误', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  // ============================================================ 阶段 ②：需求 ①
  /**
   * 需求 ① 的真实浏览器验证需要**真实可解码的音频**：
   * 黄金路径/布局脚本上传的是 2KB 假字节（`1a45dfa3` + 填充），那种东西 `<audio>` 解不了、
   * `ended` 永远不会触发 —— 用它验证"播完再点"等于没验证。
   * 所以这里用假麦克风**真录 20 秒**（用户裁决的第 4 条：每段有**固定时长**，库里这首是 20 秒 ±2 秒），
   * 走真实上传 → 真实投递 → 再播放。
   */
  console.log('\n[phase-2] 真录 20 秒 → 真上传 → 真投递，然后验证播放状态机');
  const bottle2 = await createBottle();
  const page2 = await context.newPage();
  const errors2 = [];
  let disturbed = null;
  page2.on('console', (message) => {
    if (message.type() === 'error') errors2.push(message.text());
    // vite 客户端把 HMR/重载打在 console 上：测量期间出现它 => 这次跑不算数（别人正在改文件）
    if (/\[vite\].*(hmr|reload)/i.test(message.text())) disturbed ??= message.text();
  });
  /**
   * 只需盯**测量期间**的重载：脚本自己那两次 `goto` 是故意的，不能算"环境不安静"。
   * 上一版就是漏了这一点，把自己导航判成了别人改文件（假失败）。
   */
  let tracking = false;
  page2.on('framenavigated', (frame) => {
    if (tracking && frame === page2.mainFrame()) disturbed ??= `页面重载（${frame.url()}）`;
  });
  page2.on('pageerror', (error) => errors2.push(String(error)));
  const httpSeen = [];
  page2.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/')) httpSeen.push({ status: response.status(), url: url.replace(BASE, '') });
    if (!url.includes('/api/')) {
      if (response.status() >= 400) console.log(`    [http] ${String(response.status())} ${url}`);
      return;
    }
    const line = `${String(response.status())} ${response.request().method()} ${url.replace(BASE, '')}`;
    if (response.status() >= 400) {
      let body = '';
      try {
        body = (await response.text()).slice(0, 300);
      } catch {
        /* 读不到就算了 */
      }
      console.log(`    [http] ${line}  ← 报错体: ${body}`);
      return;
    }
    console.log(`    [http] ${line}`);
  });

  await page2.goto(`${BASE}/bottles/${bottle2}`, { waitUntil: 'networkidle' });
  await page2.getByRole('button', { name: /录第 ?1 ?段/ }).click();
  // 页面已接线 presetDurationMs（frontend-flow record-step.tsx）⇒ 面板显示"本段 N 秒"并**录满自动停**。
  // 所以这里不硬编码秒数：等"用这一段"出现（= status 变 recorded = 自动停了），这正是 #4 的验收点。
  await page2.getByRole('button', { name: /开始录制/ }).click();
  const presetLine = await page2.getByTestId('preset-duration').textContent();
  console.log(`    [info] 录制面板显示的固定时长：${presetLine ?? '(缺失)'}`);
  const useThis = page2.getByRole('button', { name: /用这一段/ });
  let autoStopped = true;
  try {
    await useThis.waitFor({ timeout: 40_000 });
  } catch {
    autoStopped = false; // 没自动停 → 兜底手动停（并把它记为失败，别把红说成绿）
  }
  await page2.waitForTimeout(300);
  await page2.getByRole('button', { name: /用这一段/ }).click();

  const confirmCast = page2.getByRole('button', { name: /确认投递/ });
  try {
    await confirmCast.waitFor({ timeout: 20_000 });
  } catch (error) {
    const text = await page2.evaluate(() => document.body.innerText.slice(0, 1200));
    console.log('[diag] 页面文字:');
    console.log(text);
    throw error;
  }
  // 未选去向时"确认投递"是禁用的（不给"点一下才知道"），所以先选一张卡
  const riverCard = page2.getByRole('button', { name: /继续投河/ });
  if ((await riverCard.count()) > 0) await riverCard.click();
  await page2.waitForTimeout(200);
  await confirmCast.click();
  await page2.waitForTimeout(2_000);
  console.log('[phase-2] 已投河；重新进页面（现在是非持有者视角）…');

  await page2.goto(`${BASE}/bottles/${bottle2}`, { waitUntil: 'networkidle' });
  tracking = true;
  // 试听区默认可能没选中段：若没有播放按钮，先点时间轴上的"听"
  if ((await page2.getByRole('button', { name: /^播放$/ }).count()) === 0) {
    const listen = page2.getByRole('button', { name: /听/ }).first();
    if ((await listen.count()) > 0) await listen.click();
    await page2.waitForTimeout(500);
  }

  const playButton = page2.getByRole('button', { name: /^播放$/ });
  check('非持有者能看到并操作第 1 段的播放器', (await playButton.count()) >= 1);

  /**
   * 取**最新**那个指向 `/api/` 的音频元素。
   * 必须从后往前找：HMR 重挂载会新建元素而把旧的留在数组里，
   * 用 `findIndex` 会一直读到那个已经被 cleanup `pause()` 掉的旧元素（会得到假的"点了没反应"）。
   */
  const findSegmentElement = () => {
    const list = window.__probeAudios ?? [];
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (String(list[index].src).includes('/api/')) return index;
    }
    return -1;
  };
  let index2 = await page2.evaluate(findSegmentElement);
  check('拿到真实音频元素（src 指向 /api/ 的段音频）', index2 >= 0, `index=${String(index2)}`);
  const meta = await page2.evaluate((index) => {
    const element = (window.__probeAudios ?? [])[index];
    return { duration: element.duration, readyState: element.readyState, src: element.src };
  }, index2);
  check(
    '真实 WebM 可解码（duration 有限且 ≈20 秒）',
    Number.isFinite(meta.duration) && meta.duration > 15,
    JSON.stringify(meta),
  );

  await playButton.click();
  /**
   * **等条件，不要固定 sleep**：真实 WebM 走 Range 流式加载，起播延迟取决于冷/热缓存
   * （实测同一个探针一次在 1.0s 内起播、一次 1.2s 还没起播）。固定 sleep 会把"慢起播"误判成"点了没反应"。
   * 这里用**有界**等待：等不到仍然 FAIL（不是自动重试掩盖问题）。
   */
  let started = true;
  try {
    await page2.waitForFunction(
      (index) => {
        const element = (window.__probeAudios ?? [])[index];
        return element !== undefined && element.paused === false && element.currentTime > 0.5;
      },
      index2,
      { timeout: 10_000 },
    );
  } catch {
    started = false;
  }
  index2 = await page2.evaluate(findSegmentElement);
  const mid = await page2.evaluate((index) => {
    const element = (window.__probeAudios ?? [])[index];
    return { paused: element.paused, currentTime: element.currentTime };
  }, index2);
  check(
    '点击播放后真的在响（10s 内起播并推进 >0.5s）',
    started && mid.paused === false && mid.currentTime > 0.5,
    JSON.stringify(mid),
  );
  const midText = await page2.getByTestId('playback-state').textContent();
  check('播放中状态文字可读', /正在播放/.test(midText ?? ''), midText ?? '');
  // 覆盖率上报是否真的被服务端接受（真实链路里曾经因为浮点 coveredMs 一律 400）
  const listenReports = httpSeen.filter((item) => item.url.includes('/listen'));
  console.log(
    `    [info] 此刻已发出的 /listen 上报：${listenReports.length === 0 ? '还没有（周期 1 秒，稍后才有）' : listenReports.map((item) => String(item.status)).join(',')}`,
  );

  // 未播完 → 暂停（需求 ① 的后半句）：按钮自己也必须变成「暂停」（可见反馈，不是只改内部状态）
  const pauseButton = page2.getByRole('button', { name: /^暂停$/ });
  check('播放中按钮文案变「暂停」', (await pauseButton.count()) === 1);
  await pauseButton.click();
  await page2.waitForTimeout(200);
  index2 = await page2.evaluate(findSegmentElement);
  const pausedState = await page2.evaluate((index) => {
    const element = (window.__probeAudios ?? [])[index];
    return { paused: element.paused, currentTime: element.currentTime };
  }, index2);
  check('未播完点播放 → 暂停', pausedState.paused === true, JSON.stringify(pausedState));
  const pausedText = await page2.getByTestId('playback-state').textContent();
  check('暂停有可见文字反馈', /已暂停/.test(pausedText ?? ''), pausedText ?? '');

  // 播完 → 再点 = 从头重播（需求 ① 的前半句）
  console.log('[phase-2] 继续播放并等它自然播完（约 19 秒）…');
  await page2.getByRole('button', { name: /继续播放/ }).click();
  await page2.waitForFunction(
    (index) => {
      const element = (window.__probeAudios ?? [])[index];
      return element !== undefined && element.ended === true;
    },
    index2,
    { timeout: 30_000 },
  );
  await page2.waitForTimeout(200);
  index2 = await page2.evaluate(findSegmentElement);
  const segmentEndedText = await page2.getByTestId('playback-state').textContent();
  check('播完状态文字提示"已播完"', /本段已播完/.test(segmentEndedText ?? ''), segmentEndedText ?? '');
  const replay = page2.getByRole('button', { name: /重新播放/ });
  check('播完后按钮变「重新播放」', (await replay.count()) === 1);
  const beforeReplay = await page2.evaluate((index) => {
    const element = (window.__probeAudios ?? [])[index];
    return { currentTime: element.currentTime, duration: element.duration };
  }, index2);
  check(
    '播完停在结尾（不假装还在播）',
    beforeReplay.currentTime > beforeReplay.duration - 1,
    JSON.stringify(beforeReplay),
  );

  await replay.click();
  await page2.waitForTimeout(1_000);
  index2 = await page2.evaluate(findSegmentElement);
  const replayedSegment = await page2.evaluate((index) => {
    const element = (window.__probeAudios ?? [])[index];
    return { paused: element.paused, currentTime: element.currentTime };
  }, index2);
  check(
    '播完再点 = 从头重新播一遍（currentTime 回到开头且真在播）',
    replayedSegment.paused === false &&
      replayedSegment.currentTime < 3 &&
      replayedSegment.currentTime > 0.2,
    JSON.stringify(replayedSegment),
  );
  const replayText2 = await page2.getByTestId('playback-state').textContent();
  check('重播有可见文字反馈', /正在播放/.test(replayText2 ?? ''), replayText2 ?? '');
  // 覆盖率上报：整轮跑完后看全量记录（早判会误伤——上报周期是 1 秒）
  const allListen = httpSeen.filter((item) => item.url.includes('/listen'));
  check(
    '整轮播放期间的覆盖率上报全部成功（没有 400 —— 契约要求 coveredMs 为整数）',
    allListen.length > 0 && allListen.every((item) => item.status < 400),
    allListen.length === 0
      ? '一次都没报（更糟：覆盖率根本没上报）'
      : `共 ${String(allListen.length)} 次，状态 ${allListen.map((item) => String(item.status)).join(',')}`,
  );
  const durationCalls = httpSeen.filter((item) => item.url.includes('/duration'));
  check(
    '已作废的 /duration 端点**一次都没再被调用**（t30 清理 F2 的可见证据）',
    durationCalls.length === 0,
    `调用 ${String(durationCalls.length)} 次`,
  );
  const other4xx = httpSeen.filter((item) => item.status >= 400);
  check(
    '整轮没有任何 4xx/5xx（含 /listen 与音频 Range 请求）',
    other4xx.length === 0,
    other4xx.map((item) => `${String(item.status)} ${item.url}`).join(' | '),
  );
  // 页面级 console error：只剩"请求失败"这类网络噪音时单列，不算 JS 崩溃
  const jsErrors = errors2.filter((text) => !/Failed to load resource/.test(text));
  check('阶段 ② 没有页面级 JS 错误（异常/未捕获错误）', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));
  check(
    '#4 录制面板显示了"本段 N 秒"（曲库权威时长，不再是 15–30 秒区间）',
    /本段 \d+\.\d+ 秒/.test(presetLine ?? '') && !/15–30 秒/.test(presetLine ?? ''),
    presetLine ?? '',
  );
  check('录满**自动停**（等到「用这一段」出现，未手动点停止）', autoStopped, String(autoStopped));
  check('测量期间环境安静（没有别人改文件触发的 HMR / 页面重载）', disturbed === null, disturbed ?? '');

  await page2.close();
  await page.close();
  await browser.close();
  return failures;
}

let code = 1;
try {
  const failed = await main();
  code = failed.length === 0 ? 0 : 1;
  console.log(`\n[result] ${failed.length === 0 ? 'ALL PASS' : `FAILED: ${failed.join('; ')}`}`);
} catch (error) {
  console.error('[error]', error);
} finally {
  await stopHermetic();
}
process.exit(code);
```

<!-- prettier-ignore-end -->

## 7. 交接给 qa-e2e（t14）的接口建议

- 想复用：直接抄 §3 的五个要点 + §4 的安静窗口纪律；t14 若跑**多浏览器**，本配方只覆盖 Chromium（WebKit 需另配假麦克风参数）。
- 想纳入 CI/正式入库：需要 captain 裁决 + `docs/architecture.md` 依赖基线登记（Playwright 属 E2E 工具，AGENTS.md §7）。
  现在这份**不入库**，因此"运行它"不是任何任务的验收前提，只是**证据来源**。
- 结论回报口径：按 AGENTS.md §8，把"跑了什么命令 / 原始输出 / 哪条断言红 / 是否环境不安静"写清，不要只报"探针通过"。
