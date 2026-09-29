/**
 * t17 取证环境（深度复刻返工 · 同数据状态并排比对）
 *
 * 起三件（全部一次性库，跑完删库）：
 *   ① API        = apps/api（tsx src/server.ts，DATABASE_URL=一次性库，端口自选空闲）
 *   ② 参考站     = tools/site-server.mjs（site/*.html，--api-port 指向 ① ⇒ 参考页吃同一份数据）
 *   ③ 复刻站     = vite dev（MDB_API_TARGET 指向 ① ⇒ 复刻页吃同一份数据）
 *
 * 造四个账号 / 两支瓶子（数据状态由验收定义）：
 *   t17maker (a)  发起 bottle3 并录第 1 段 → 投河；再发起 draft0（0/4 草稿）
 *   t17relayb (b) 捞到 bottle3 录第 2 段 → 投河
 *   t17relayc (c) 捞到 bottle3 录第 3 段 → 留在手上（HELD，3/4，缺第 4 段）
 *   t17empty  (d) 全新账号，零参与（/me 空态）
 *
 * 取证视角：
 *   瓶子 3/4  → 观看者 c（持有者，能录第 4 段）
 *   瓶子 0/4  → 观看者 a（发起者草稿）
 *   /me 有参与 → 观看者 a（两支：3/4 + 0/4）
 *   /me 空态   → 观看者 d
 *
 * 产出 docs/ui-review/t17-env.json：{ api, ref, web, bottles:{bottle3,draft0}, accounts:{...} }
 * 停止：SIGTERM/SIGINT ⇒ 关 vite/site/api + 删库。
 */
/* eslint-disable no-console */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createServer } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url)); // docs/ui-review/ → repo root
const WEB_DIR = join(REPO, 'apps', 'web');
const API_DIR = join(REPO, 'apps', 'api');
const OUT = join(REPO, 'docs', 'ui-review', 't17-env.json');
const TSX_CLI = createRequire(join(API_DIR, 'package.json')).resolve('tsx/cli');
import { createRequire } from 'node:module';

function runDbTool(args) {
  const result = spawnSync(
    process.execPath,
    [TSX_CLI, '--env-file-if-exists=../../.env', 'src/db/live-check.ts', ...args],
    { cwd: API_DIR, encoding: 'utf8', env: process.env },
  );
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function lastJsonLine(text) {
  for (const line of text.trim().split(/\r?\n/).reverse()) {
    try {
      return JSON.parse(line);
    } catch {
      /* keep looking */
    }
  }
  return null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHealth(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/healthz`);
      if (response.status === 200) return true;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function killTree(child) {
  if (child === null || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  child.kill('SIGTERM');
}

// ------------------------------------------------------------------ 一次性库
console.log('[t17] 建一次性数据库…');
const created = runDbTool(['create']);
if (created.status !== 0) {
  console.error(created.stdout, created.stderr);
  process.exit(1);
}
const info = lastJsonLine(created.stdout);
if (info === null || typeof info.databaseUrl !== 'string') {
  console.error('无法解析 live-check create：', created.stdout);
  process.exit(1);
}

// ------------------------------------------------------------------ API
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
let apiLog = '';
apiChild.stdout.on('data', (chunk) => (apiLog += String(chunk)));
apiChild.stderr.on('data', (chunk) => (apiLog += String(chunk)));
if (!(await waitForHealth(API))) {
  console.error(`API 未就绪：\n${apiLog}`);
  killTree(apiChild);
  process.exit(1);
}
console.log(`[t17] API ${API}`);

// ------------------------------------------------------------------ 参考站 site-server
const refPort = await freePort();
const refChild = spawn(
  process.execPath,
  [join(REPO, 'tools', 'site-server.mjs'), `--port=${String(refPort)}`, `--api-port=${String(apiPort)}`],
  { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] },
);
let refLog = '';
refChild.stdout.on('data', (chunk) => (refLog += String(chunk)));
refChild.stderr.on('data', (chunk) => (refLog += String(chunk)));
await new Promise((r) => setTimeout(r, 600));
const REF = `http://127.0.0.1:${refPort}`;
console.log(`[t17] 参考站 ${REF}（${refLog.trim().split('\n')[0] ?? ''}）`);

// ------------------------------------------------------------------ 复刻站 vite
const webPort = await freePort();
process.env['MDB_API_TARGET'] = API;
/** vite 是 apps/web 的依赖（pnpm 不提升到仓库根）⇒ 从 apps/web/package.json 解析再 import。 */
const viteEntry = createRequire(join(WEB_DIR, 'package.json')).resolve('vite');
const { createServer: createViteServer } = await import(pathToFileURL(viteEntry).href);
/**
 * `host: true`（绑所有地址）+ 团队取证一律走 **`http://t17.localhost:<port>`**：
 * 团队级共享 QA 浏览器里，cookie 按 host 分键 —— `127.0.0.1` 的会话 cookie 会被
 * 其它成员在同一浏览器里的登录顶掉（本轮实际发生过）。`*.localhost` 由 RFC 6761
 * 回环解析（Chrome 支持）且 vite 的 host 校验放行 `.localhost`（见 vite isHostAllowed），
 * 于是 t17 的会话与 `127.0.0.1:*` / `localhost:*` 的其它成员完全隔离。
 */
const vite = await createViteServer({
  configFile: join(WEB_DIR, 'vite.config.ts'),
  root: WEB_DIR,
  server: { port: webPort, strictPort: true, host: true },
});
await vite.listen();
const WEB = `http://127.0.0.1:${webPort}`;
console.log(`[t17] 复刻站 ${WEB}`);

// ------------------------------------------------------------------ 造数据
const PASSWORD = 'Drift-Bottle-2026';
async function register(handle) {
  const response = await fetch(`${API}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ handle, email: `${handle}@example.com`, password: PASSWORD }),
  });
  if (response.status !== 201) throw new Error(`注册 ${handle} 失败 ${String(response.status)}：${await response.text()}`);
  const cookie = response.headers.getSetCookie().find((c) => c.startsWith('mdb_session='));
  return { handle, email: `${handle}@example.com`, cookie: cookie.split(';')[0] };
}

async function drawUntil(cookie, targetId, max = 15) {
  for (let i = 1; i <= max; i += 1) {
    const response = await fetch(`${API}/api/river/draw`, { method: 'POST', headers: { cookie } });
    if (response.status !== 200) return null;
    const body = await response.json();
    if (body.bottle?.id === targetId) return targetId;
    await fetch(`${API}/api/bottles/${body.bottle.id}/put-back`, { method: 'POST', headers: { cookie } });
  }
  return null;
}

async function record(bottleId, note, cookie) {
  const magic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  const response = await fetch(`${API}/api/bottles/${bottleId}/segments`, {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'audio/webm',
      'x-audio-duration-ms': '20000',
      'x-segment-note': encodeURIComponent(note),
    },
    body: Buffer.concat([magic, Buffer.alloc(2048 - magic.length, 0x42)]),
  });
  if (response.status !== 201) throw new Error(`录段失败 ${String(response.status)}：${await response.text()}`);
}

async function resolveTo(bottleId, resolution, cookie) {
  const response = await fetch(`${API}/api/bottles/${bottleId}/resolution`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ resolution }),
  });
  if (response.status !== 200) throw new Error(`去向失败 ${String(response.status)}：${await response.text()}`);
}

const a = await register('t17maker');
const b = await register('t17relayb');
const c = await register('t17relayc');
const d = await register('t17empty');

const songs = await (await fetch(`${API}/api/songs`)).json();
const song =
  songs.find((item) => item.totalSegments === 4 && item.segments.length === item.totalSegments) ??
  songs.find((item) => item.segments.length === item.totalSegments) ??
  songs[0];
console.log(`[t17] 歌：${song.title ?? song.id} · ${String(song.totalSegments)} 段`);

async function createBottle(cookie) {
  const response = await fetch(`${API}/api/bottles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ songId: song.id }),
  });
  if (response.status !== 201) throw new Error(`建瓶失败 ${String(response.status)}：${await response.text()}`);
  return (await response.json()).id;
}

// 3/4：a 录 1 → b 录 2 → c 录 3（留在手上 = HELD）
const bottle3 = await createBottle(a.cookie);
await record(bottle3, 't17 第一棒', a.cookie);
await resolveTo(bottle3, 'RIVER', a.cookie);
if ((await drawUntil(b.cookie, bottle3)) !== bottle3) throw new Error('b 没捞到 bottle3');
await record(bottle3, 't17 第二棒', b.cookie);
await resolveTo(bottle3, 'RIVER', b.cookie);
if ((await drawUntil(c.cookie, bottle3)) !== bottle3) throw new Error('c 没捞到 bottle3');
await record(bottle3, 't17 第三棒', c.cookie);

// 0/4：a 发起草稿
const draft0 = await createBottle(a.cookie);

const detail3 = await (await fetch(`${API}/api/bottles/${bottle3}`, { headers: { cookie: c.cookie } })).json();
const detail0 = await (await fetch(`${API}/api/bottles/${draft0}`, { headers: { cookie: a.cookie } })).json();
console.log(
  `[t17] bottle3 status=${detail3.status} 段数=${String(detail3.segments.length)} 缺口=${JSON.stringify(detail3.missingSegmentIndexes)}`,
);
console.log(
  `[t17] draft0 status=${detail0.status} 段数=${String(detail0.segments.length)} 缺口=${JSON.stringify(detail0.missingSegmentIndexes)}`,
);

mkdirSync(join(REPO, 'docs', 'ui-review'), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify(
    {
      api: API,
      ref: REF,
      web: WEB,
      refPort,
      webPort,
      apiPort,
      databaseName: info.databaseName,
      song: { id: song.id, totalSegments: song.totalSegments },
      bottles: { bottle3, draft0 },
      accounts: { a, b, c, d: d },
      password: PASSWORD,
      startedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
  'utf8',
);
console.log(`[t17] env → ${OUT}`);

let stopping = false;
async function stop(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[t17] 停（${signal}）…`);
  try {
    await vite.close();
  } catch {
    /* ignore */
  }
  killTree(refChild);
  killTree(apiChild);
  const dropped = runDbTool(['drop', info.databaseName]);
  console.log(`[t17] 删库 → ${(lastJsonLine(dropped.stdout)?.dropped ?? false) ? '已删' : '未删'}`);
  runDbTool(['sweep']);
  process.exit(0);
}
process.on('SIGTERM', () => void stop('SIGTERM'));
process.on('SIGINT', () => void stop('SIGINT'));
console.log('[t17] 环境就绪，等待停止信号…');
