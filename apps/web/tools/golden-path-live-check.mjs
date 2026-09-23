/**
 * 黄金路径 **真实链路** 检查（真 HTTP + 真 Postgres + 真音频字节，不需要浏览器）。
 *
 * 为什么要有这个脚本：前端页面在浏览器里跑，但"页面发的每个请求能不能成功、字段是不是这些字段、
 * 并发冲突是不是 409"这些事实不需要浏览器就能钉住 —— 用真库 + 真 HTTP + 真音频字节走一遍，
 * 比"读代码推测"可靠得多。
 *
 * ## 默认 = hermetic：自己的可抛弃库 + 自己起的 API
 *   node apps/web/tools/golden-path-live-check.mjs
 * 脚本会（复用 `apps/api/src/db/test-database.ts` 的派生机制）建 `music_drift_test_<epoch>_<pid>_<rand>`、
 * 迁移 + 灌种子、在**空闲端口**上起自己的 API、跑完 27 步后删库并回收超龄残留库。
 *
 * ⚠️ **验收证据只认 hermetic 模式**（captain 裁决 ②，2026-09-23）。外部模式（显式 `API_BASE`）
 * 跑在别人的库上，河道里有别人的瓶子 ⟹ 结论受环境运气影响 ⟹ **不能写进验收口径**，
 * 它只会被当作调试工具，并且会把非确定性步骤单列成「未复现（数据不受控）」、不计入 pass。
 *
 * **为什么要这样**：旧版本直接用 8787 上的 dev 服务 → 库里漂着别人的瓶子 → 随机捞取会捞到别人的
 * 瓶子 → 第 15 步断链、其后 11 项失败同源；通过与否取决于环境运气（同一份代码，captain 复现失败、
 * 本地复现成功）。**端到端检查必须自己掌控输入**，否则它的"通过"不构成证据。
 *
 * ## 外部模式（显式开启，非 hermetic）
 *   API_BASE=http://localhost:8787 node apps/web/tools/golden-path-live-check.mjs
 * 对着一个已经起好的服务跑（调试用）。此时结果**取决于那个库里的数据**，不能当验收证据。
 *
 * 覆盖（27 步）：注册/登录 → 选歌 → 发起 → 录第 1 段 → 投河 → 第二人捞取 → 接唱 → 投河 → … → 末段 →
 * 回传 → 入海 → 公海（完整区）→ 事件流 → 匿名代号 → 放回冷却 → 没有可捞的瓶子(409) →
 * **我的漂流日志 `GET /api/me/bottles`（P0 §11.1，含"斩浪后仍算参与过"）** → 401/409 语义。
 * 每一步都打印「步骤 / HTTP 状态 / 关键字段」，失败即 `process.exit(1)`。
 *
 * 说明：这是一个**命令行核查脚本**，输出就是它的产物，因此允许直接 console.log。
 */
/* eslint-disable no-console */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const API_DIR = fileURLToPath(new URL('../../api/', import.meta.url));
/**
 * 用 `node <tsx cli>` 而不是 `pnpm --filter … start`：Windows 上 spawn 一个 `.cmd`
 * 必须 `shell: true`，而那只会在输出里塞 DEP0190 弃用警告、并把参数拼接交给 cmd.exe。
 * 这里直接定位 apps/api 自己的 tsx（同一份依赖），命令与 `package.json` 里的脚本**等价**：
 *   node tsx --env-file-if-exists=../../.env src/server.ts
 * （`pnpm --filter @music-drift/api start` 这份文档命令本身由 scripts.test.ts + 手工冒烟单独守着。）
 */
const TSX_CLI = createRequire(fileURLToPath(new URL('../../api/package.json', import.meta.url))).resolve(
  'tsx/cli',
);
const IS_WINDOWS = process.platform === 'win32';

/**
 * 外部模式：只有**显式**给非空 `API_BASE` 才用别人的服务（默认自建，见文件头）。
 *
 * 空字符串必须当"没给"：`API_BASE= node …`（shell/CI 里 `API_BASE=$UNSET_VAR` 很常见）
 * 若被当成"给了"，脚本会静默进入外部模式、把所有请求打向空 URL —— 配置错误会被伪装成检查失败。
 */
const externalBase = process.env.API_BASE;
let API = externalBase !== undefined && externalBase.length > 0 ? externalBase : null;
/** hermetic 环境的句柄（外部模式下为 null）。 */
let hermetic = null;
const stamp = Date.now().toString(36);

let failures = 0;
/** 注册计数器：同一 `label` 可注册多次（第 27 步需要 10 个不同的点踩者）。 */
let registerSeq = 0;
/** 非确定性步骤单列一类：**与 pass/fail 并列，不计入 pass**（captain 裁决 ②）。 */
let inconclusive = 0;
let stepNo = 0;

function log(step, detail) {
  stepNo += 1;
  console.log(
    `[${String(stepNo).padStart(2, '0')}] ${step}${detail === undefined ? '' : ` — ${detail}`}`,
  );
}

function must(condition, message) {
  if (condition) return;
  failures += 1;
  console.error(`  ✗ ${message}`);
}

/**
 * 「这一步在本次环境里复现不出来」——**不算 pass**，但也不在外部模式里硬判失败。
 *
 * 为什么不硬失败：外部模式的数据不受控，硬失败会让它按环境随机变红，而**会随机变红的检查会被训练成
 * 被忽略的检查**（captain 裁决 ②）。但 hermetic 模式下数据完全由本次运行掌控，「复现不出来」
 * 只能是检查自身的问题 ⟹ 那里必须红。
 */
function unreproducible(message) {
  if (hermetic === null) {
    inconclusive += 1;
    console.log(`  ⚠ 未复现（数据不受控，不计入 pass）：${message}`);
    return;
  }
  must(false, `${message}（hermetic 模式下数据受控，这一步必须能复现）`);
}

/** 外部模式的横幅：**跑检查之前**就打在输出最前面，防止任何人把这份输出当验收证据。 */
function printExternalBanner() {
  const rule = '════════════════════════════════════════════════════════════';
  console.log(rule);
  console.log('⚠ 外部模式 · 非验收证据（跑在别人的库上：河道里有别人的瓶子，结论受环境运气影响）');
  console.log('   验收证据只认 hermetic 模式：node apps/web/tools/golden-path-live-check.mjs');
  console.log('   非确定性步骤会单列「未复现（数据不受控）」，不计入 pass。');
  console.log(rule);
  console.log('');
}

/**
 * 最近若干次请求的痕迹（**诊断用**）：检查一旦变红，必须能自己说出"哪一步、什么响应"。
 * 没有这个，红只会告诉你"某处应为 200"，你还得手工重放整条链路去猜。
 */
const recentCalls = [];

async function call(session, method, path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (session.cookie !== null) headers['cookie'] = session.cookie;
  if (options.json !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    ...(options.json === undefined ? {} : { body: JSON.stringify(options.json) }),
    ...(options.body === undefined ? {} : { body: options.body }),
    redirect: 'manual',
  });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookie) {
    const value = cookie.split(';')[0];
    if (value.startsWith('mdb_session=')) session.cookie = value;
  }
  const text = await response.text();
  let body;
  try {
    body = text === '' ? null : JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  recentCalls.push({
    who: session.label,
    what: `${method} ${path}`,
    status: response.status,
    body: text.slice(0, 300),
  });
  if (recentCalls.length > 8) recentCalls.shift();
  return { status: response.status, body };
}

function newSession(label) {
  return { label, cookie: null };
}

/** 构造一段"看起来是 webm"的字节（EBML 魔数），足够通过服务端魔数嗅探与体积校验。 */
function webmBytes(size = 4_096) {
  const bytes = new Uint8Array(size);
  bytes.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  return bytes;
}

async function register(label) {
  const session = newSession(label);
  // 每个账号必须有**唯一** handle/email：`stamp` 只在进程启动时算一次，所以同一 label 注册两次
  // （第 27 步要造 10 个点踩者）会撞唯一索引 → 409，而 409 的注册会让后面所有断言连锁失败。
  registerSeq += 1;
  const unique = `${stamp}${registerSeq}`;
  const handle = `${label}${unique}`.slice(0, 30);
  const email = `${label}.${unique}@example.com`;
  const password = 'drift2026';
  const created = await call(session, 'POST', '/api/auth/register', {
    json: { handle, email, password },
  });
  must(created.status === 201, `${label} 注册应为 201，实际 ${created.status}`);
  must(created.body?.user?.id !== undefined, `${label} 注册应返回 user.id`);
  must(created.cookie !== null, `${label} 注册应下发会话 cookie`);
  return { session, handle, email, password, userId: created.body?.user?.id };
}

async function recordSegment(session, bottleId, durationMs, note) {
  return call(session, 'POST', `/api/bottles/${bottleId}/segments`, {
    headers: {
      'content-type': 'audio/webm',
      'x-audio-duration-ms': String(durationMs),
      ...(note === undefined ? {} : { 'x-segment-note': encodeURIComponent(note) }),
    },
    body: webmBytes(),
  });
}

/**
 * 按**真实播放节奏**周期性上报收听覆盖，直到服务端确认达到点踩门槛。
 *
 * 这条序列与浏览器端完全一致：`SegmentPlayer.onProgress`（内核 `ListenTracker` 的覆盖率）
 * → `useSegmentListen` 每 `periodMs` 一次 `POST /api/segments/:id/listen {coveredMs}`。
 *
 * 为什么不能"投票前一次性塞满"（本检查的负向对照会实测这一点）：
 * 服务端 `nextCoveredMs` 的规则是「首报最多给段长一半；之后每次最多增长
 * `距上次真实耗时 × 1.25 + 3s`」，所以单次塞满最多拿到 50%（< 80% 门槛）。
 * 想跨过门槛，客户端的覆盖率必须**随真实时间增长** —— 也就是真的在播。
 *
 * 实现纪律：
 * - 上报值 = 已过去的真实时间（1× 速率，不虚报）；
 * - **不重试**：任何一次上报不是 200 就立即失败并把原始响应体抛出来（重试会掩盖真 5xx）；
 * - 超时（`maxMs`）仍未达门槛 → 直接失败并打印最后一次响应体，不做"再等一会"的模糊处理。
 */
async function listenUntilThreshold(session, segmentId, options = {}) {
  const durationMs = options.durationMs ?? 20_000;
  const threshold = options.threshold ?? 0.8;
  const periodMs = options.periodMs ?? 1_000;
  const maxMs = options.maxMs ?? 30_000;
  const startedAt = Date.now();

  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, periodMs));
    const elapsedMs = Date.now() - startedAt;
    const coveredMs = Math.min(elapsedMs, durationMs);
    const response = await call(session, 'POST', `/api/segments/${segmentId}/listen`, {
      json: { coveredMs },
    });
    must(
      response.status === 200,
      `上报收听覆盖应为 200，实际 ${response.status}（响应 ${JSON.stringify(response.body)}）`,
    );
    const ratio = typeof response.body?.ratio === 'number' ? response.body.ratio : 0;
    if (ratio >= threshold) {
      return { ratio, coveredMs: response.body?.coveredMs ?? coveredMs, elapsedMs };
    }
    if (elapsedMs > maxMs) {
      throw new Error(
        `上报 ${String(maxMs)}ms 后仍未达门槛（最后一次响应 = ${JSON.stringify(response.body)}）`,
      );
    }
  }
}

/**
 * 反复打捞直到拿到目标瓶子。
 *
 * hermetic 模式下河道里只有本次运行造的瓶子，一次就能捞到；
 * 外部模式下别人的瓶子也在河道里（随机打捞），因此保留"捞到不是目标就放回再捞"的容错路径。
 */
async function drawUntil(session, targetId, maxAttempts = 15) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const drawn = await call(session, 'POST', '/api/river/draw');
    if (drawn.status !== 200) return { drawn, attempts: attempt };
    if (drawn.body?.bottle?.id === targetId) return { drawn, attempts: attempt };
    await call(session, 'POST', `/api/bottles/${drawn.body.bottle.id}/put-back`);
  }
  return { drawn: { status: 0, body: null }, attempts: maxAttempts };
}

/** 跑 `live-check:db` 子命令（等价于 `pnpm --filter @music-drift/api live-check:db <args>`）。 */
function runDbTool(args) {
  const result = spawnSync(
    process.execPath,
    [TSX_CLI, '--env-file-if-exists=../../.env', 'src/db/live-check.ts', ...args],
    { cwd: API_DIR, encoding: 'utf8', env: process.env },
  );
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** 取输出里**最后一行**合法 JSON（pnpm/tsx 可能在其前面打别的行）。 */
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

/** 杀掉整棵进程树：`pnpm start` 会派生 tsx/node 子进程，只杀 pnpm 会留下占端口的孤儿。 */
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

  const port = await freePort();
  API = `http://127.0.0.1:${port}`;
  console.log(
    `[setup] 库 ${info.databaseName}（种子 ${info.seededSongs} 首 / ${info.seededSegments} 段）· API ${API}`,
  );

  const child = spawn(process.execPath, [TSX_CLI, '--env-file-if-exists=../../.env', 'src/server.ts'], {
    cwd: API_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    // DATABASE_URL / PORT 由这里显式给：node 的 --env-file-if-exists **不覆盖**已存在的环境变量，
    // 所以即便 start 脚本加载了根 .env（dev 库），本次运行仍然只碰自建库。
    env: { ...process.env, DATABASE_URL: info.databaseUrl, PORT: String(port), LOG_LEVEL: 'error' },
  });
  let serverLog = '';
  const collect = (chunk) => {
    serverLog += String(chunk);
    if (hermetic !== null) hermetic.serverLog = serverLog;
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  hermetic = { databaseUrl: info.databaseUrl, databaseName: info.databaseName, child, serverLog: '' };

  if (!(await waitForHealth(API))) {
    console.error(`API 未在 60s 内就绪（${API}）：\n${serverLog}`);
    await stopHermetic();
    process.exit(1);
  }
  must(
    !serverLog.includes('未配置 DATABASE_URL'),
    '自起的 API 必须拿到自建库的连接串（不得走"无 DATABASE_URL"降级）',
  );
}

async function stopHermetic() {
  if (hermetic === null) return;
  const { child, databaseName } = hermetic;
  hermetic = null; // 先置空：teardown 自身出错也不会重复删
  killTree(child);
  const dropped = runDbTool(['drop', databaseName]);
  const info = lastJsonLine(dropped.stdout);
  console.log(
    `[teardown] 删库 ${databaseName} → ${info?.dropped === true ? '已删除' : '未删除（见输出）'}`,
  );
  runDbTool(['sweep']); // 顺手回收超龄残留库（上一次跑崩掉留下的）
}

const runChecks = async () => {
  const health = await call(newSession('anon'), 'GET', '/healthz');
  must(health.status === 200, `healthz 应为 200，实际 ${health.status}`);

  /**
   * 自建库 → 公海必须是空的。这不只是"顺手看一眼"：它同时证明**这次跑的不是别人污染的库**
   *（旧版本正是栽在这里 —— 第 15 步捞到别人的瓶子，其后 11 项失败同源）。
   * 外部模式下库里有别人的数据是正常的，因此只在 hermetic 模式下断言。
   */
  const preflightSea = await call(newSession('anon'), 'GET', '/api/sea?zone=COMPLETED&limit=100');
  if (hermetic !== null) {
    must(
      preflightSea.status === 200 && preflightSea.body?.items?.length === 0,
      `全新库的公海应为空，实际 ${preflightSea.status} / ${preflightSea.body?.items?.length} 件`,
    );
  }

  // ── 401：未登录发起的语义（前端据此显示「需要先登录」）──────────────
  const anon = newSession('anon');
  const songs = await call(anon, 'GET', '/api/songs');
  must(songs.status === 200 && Array.isArray(songs.body), '未登录也应能读曲库（首屏选歌）');
  // 让"这份通过是在哪个环境上取得的"留在输出里，而不是靠回忆。
  log(
    '健康检查',
    `${API}｜${hermetic === null ? '外部模式（数据不受控，非验收证据）' : `自建库 ${hermetic.databaseName} · 公海 ${preflightSea.body?.items?.length ?? '?'} 件（全新）`}`,
  );
  log('曲库（未登录可读）', `${songs.body.length} 首`);
  must(
    songs.body.some((song) => song.segments.length === song.totalSegments),
    '曲库应带分段元数据',
  );

  /**
   * 选歌口径：只挑**带分段元数据**的歌（页面要显示"每段约 N 秒"）。
   * hermetic 模式下库里只有 `runSeed` 灌的 3 首占位歌（每首 4 段元数据齐全）；
   * 外部模式下 dev 库里还混着集成测试残留的 `song-xxxxxxxx`（无分段元数据），因此这里**显式过滤**，
   * 不假设库是干净的。
   */
  const playable = songs.body.filter((song) => song.segments.length === song.totalSegments);
  must(playable.length > 0, '曲库里应有带分段元数据的歌（否则页面无法显示段位信息）');
  const song = playable[0];

  const unauthorized = await call(anon, 'POST', '/api/bottles', { json: { songId: song.id } });
  must(unauthorized.status === 401, `未登录发起应为 401，实际 ${unauthorized.status}`);
  must(
    Array.isArray(unauthorized.body?.error?.violations),
    '401 envelope 应为 {error:{message,violations}}',
  );
  log('未登录发起', `401 · ${unauthorized.body?.error?.message}`);

  // ── 四个账号（同一支完整作品需要 4 位参与者）─────────────────────
  const A = await register('aa');
  const B = await register('bb');
  const C = await register('cc');
  const D = await register('dd');
  log('注册四个账号', [A.handle, B.handle, C.handle, D.handle].join(' / '));

  for (const user of [A, B, C, D]) {
    const me = await call(user.session, 'GET', '/api/auth/me');
    must(
      me.status === 200 && me.body?.user?.id === user.userId,
      `${user.label} /me 应返回自己的身份`,
    );
  }
  log('四个会话互不干扰', '各自 /me 返回自己的 user.id');

  // ── A 发起 + 录第 1 段 + 投河 ────────────────────────────────
  const created = await call(A.session, 'POST', '/api/bottles', { json: { songId: song.id } });
  must(created.status === 201, `发起应为 201，实际 ${created.status}`);
  const bottleId = created.body?.id;
  must(created.body?.status === 'DRAFT', '新建瓶子应为 DRAFT');
  must(
    JSON.stringify(created.body?.missingSegmentIndexes) === JSON.stringify([1, 2, 3, 4]),
    '新建瓶子缺口应为 [1,2,3,4]',
  );
  log('发起漂流瓶', `${bottleId} · 缺口 ${JSON.stringify(created.body.missingSegmentIndexes)}`);

  const first = await recordSegment(
    A.session,
    bottleId,
    20_000,
    '在深夜哼一段没有词的曲子，期待接唱',
  );
  must(first.status === 201, `录第 1 段应为 201，实际 ${first.status}`);
  must(first.body?.index === 1, `第 1 段 index 应为 1，实际 ${first.body?.index}`);
  must(first.body?.nextRecordIndex === 2, '录完第 1 段后 nextRecordIndex 应为 2');
  log(
    'A 录第 1 段（原始二进制 4KB webm）',
    `index=${first.body.index} · next=${first.body.nextRecordIndex}`,
  );

  // 音频回放端点（Range）
  const segmentId = first.body.segmentId;
  const audio = await call(anon, 'GET', `/api/segments/${segmentId}/audio`, {
    headers: { range: 'bytes=0-99' },
  });
  must(audio.status === 206, `Range 请求应为 206，实际 ${audio.status}`);
  log(
    '分段音频 Range 播放',
    `206 · Content-Range ${'content-range' in audio ? '' : ''}（切片由服务端完成）`,
  );

  const castByA = await call(A.session, 'POST', `/api/bottles/${bottleId}/resolution`, {
    json: { resolution: 'RIVER' },
  });
  must(castByA.status === 200 && castByA.body?.status === 'IN_RIVER', 'A 投河后应为 IN_RIVER');
  log('A 投河', `status=${castByA.body?.status}`);

  // ── B 捞取（河道随机）+ 接唱 + 投河 ───────────────────────────
  const { drawn: drawB, attempts: attemptsB } = await drawUntil(B.session, bottleId);
  must(drawB.status === 200 && drawB.body?.bottle?.id === bottleId, 'B 应捞到 A 投出的瓶子');
  log('B 打捞次数（河道可能有别人的瓶子）', String(attemptsB));
  must(drawB.body?.bottle?.isHolder === true, '捞到即持有（isHolder=true）');
  log('B 从河道捞取', `bottle=${drawB.body.bottle.id} · isHolder=${drawB.body.bottle.isHolder}`);

  const detailB = await call(B.session, 'GET', `/api/bottles/${bottleId}`);
  must(
    JSON.stringify(detailB.body?.missingSegmentIndexes) === JSON.stringify([2, 3, 4]),
    'B 看到的缺口应为 [2,3,4]',
  );
  must(
    Array.isArray(detailB.body?.availableResolutions) &&
      detailB.body.availableResolutions.length > 0,
    '持有且已有唱段时应给出可选去向（页面据此渲染三选一）',
  );
  log(
    'B 看详情',
    `缺口 ${JSON.stringify(detailB.body.missingSegmentIndexes)} · 可选去向 ${JSON.stringify(detailB.body.availableResolutions)}`,
  );

  const second = await recordSegment(B.session, bottleId, 21_000, '顺着你的情绪加了段人声');
  must(second.status === 201 && second.body?.index === 2, 'B 应录到第 2 段（缺口里最小的段号）');
  log('B 接唱第 2 段', `index=${second.body.index} · next=${second.body.nextRecordIndex}`);
  const castByB = await call(B.session, 'POST', `/api/bottles/${bottleId}/resolution`, {
    json: { resolution: 'RIVER' },
  });
  must(castByB.status === 200, 'B 投河应成功');
  log('B 投河', `status=${castByB.body?.status}`);

  // ── 防捣乱：A 捞不到自己参与过的瓶子（页面要能解释这种拒绝）────────
  const reDrawOwn = await call(A.session, 'POST', '/api/river/draw');
  if (reDrawOwn.status === 200) {
    // 河道里还有别人的瓶子 → 捞到别的瓶子是合法的，但绝不能是 A 自己的那支
    must(reDrawOwn.body?.bottle?.id !== bottleId, 'A 不应再捞到自己投出的瓶子');
    await call(A.session, 'POST', `/api/bottles/${reDrawOwn.body.bottle.id}/put-back`);
    log('A 再捞', `200 · 捞到的是别人的瓶子（不是自己的 ${bottleId.slice(0, 8)}…）`);
  } else {
    must(
      [409, 422].includes(reDrawOwn.status),
      `被拒绝时状态应为 409/422，实际 ${reDrawOwn.status}`,
    );
    must(
      typeof reDrawOwn.body?.error?.violations?.[0]?.code === 'string',
      '被拒绝时应带稳定错误码（页面据此给可读文案）',
    );
    log(
      'A 再捞（防捣乱 / 冷却）',
      `${reDrawOwn.status} · ${reDrawOwn.body.error.violations[0].code}`,
    );
  }

  // ── C、D 依次接力，末段由 D 选择回传 → 回到 B → B 入海 ─────────
  const { drawn: drawC } = await drawUntil(C.session, bottleId);
  must(drawC.status === 200 && drawC.body?.bottle?.id === bottleId, 'C 应捞到同一支瓶子');
  const third = await recordSegment(C.session, bottleId, 19_500);
  must(third.body?.index === 3, `C 应录到第 3 段，实际 ${third.body?.index}`);
  await call(C.session, 'POST', `/api/bottles/${bottleId}/resolution`, {
    json: { resolution: 'RIVER' },
  });
  log('C 接唱第 3 段并投河', `index=${third.body.index}`);

  const { drawn: drawD } = await drawUntil(D.session, bottleId);
  must(drawD.status === 200 && drawD.body?.bottle?.id === bottleId, 'D 应捞到同一支瓶子');
  const fourth = await recordSegment(D.session, bottleId, 22_000, '接唱完成了，声音有点沙哑');
  must(fourth.body?.index === 4, `D 应录到第 4 段，实际 ${fourth.body?.index}`);
  must(
    fourth.body?.nextRecordIndex === null,
    '录满最后一拍后 nextRecordIndex 应为 null（只能选去向）',
  );
  const afterComplete = await call(D.session, 'GET', `/api/bottles/${bottleId}`);
  must(afterComplete.body?.isComplete === true, '四段齐全后 isComplete 应为 true');
  must(
    afterComplete.body?.availableResolutions?.includes('RETURN') === true,
    '末段录完后应可选回传',
  );
  log(
    'D 录第 4 段（作品完整）',
    `isComplete=${afterComplete.body.isComplete} · 可选去向 ${JSON.stringify(afterComplete.body.availableResolutions)}`,
  );

  const returned = await call(D.session, 'POST', `/api/bottles/${bottleId}/resolution`, {
    json: { resolution: 'RETURN' },
  });
  must(returned.status === 200, `回传应成功，实际 ${returned.status}`);
  must(
    returned.body?.holderId === C.userId,
    `回传后持有者应为父链上游（投给 D 的 C），实际 ${returned.body?.holderId}`,
  );
  log(
    'D 回传',
    `holder=${returned.body.holderId === C.userId ? 'C（父链上游：投给 D 的人）' : returned.body.holderId}`,
  );

  const toSea = await call(C.session, 'POST', `/api/bottles/${bottleId}/resolution`, {
    json: { resolution: 'SEA' },
  });
  must(toSea.status === 200 && toSea.body?.seaZone === 'COMPLETED', 'C 入海后应进入公海完整区');
  log('C 入海', `status=${toSea.body?.status} · seaZone=${toSea.body?.seaZone}`);

  // ── 公海（前端「公海大厅」用的两个请求）────────────────────────
  const seaCompleted = await call(anon, 'GET', '/api/sea?zone=COMPLETED&limit=30');
  must(seaCompleted.status === 200, '公海完整区应可读（未登录也可听）');
  const inSea = seaCompleted.body?.items?.some((item) => item.id === bottleId);
  must(inSea === true, '刚入海的作品应出现在完整区');
  const summary = seaCompleted.body.items.find((item) => item.id === bottleId);
  must(
    typeof summary?.songTitle === 'string' && summary.songTitle.length > 0,
    '公海列表必须带曲名',
  );
  must(Array.isArray(summary?.missingSegmentIndexes), '公海列表必须带缺口字段');
  log(
    '公海完整区',
    `共 ${seaCompleted.body.items.length} 件 · 本品 ${summary?.songTitle ?? '（未找到）'} · 缺口 ${JSON.stringify(summary?.missingSegmentIndexes ?? null)}`,
  );

  const seaIncomplete = await call(anon, 'GET', '/api/sea?zone=INCOMPLETE&limit=30');
  must(seaIncomplete.status === 200, '公海未完成区应可读');
  log('公海等待接力区', `${seaIncomplete.body.items.length} 件`);

  const seaDetail = await call(anon, 'GET', `/api/sea/${bottleId}`);
  must(seaDetail.status === 200 && seaDetail.body?.id === bottleId, '公海详情应可读');
  log(
    '公海详情',
    `${seaDetail.body.songTitle} · ${seaDetail.body.recordedCount}/${seaDetail.body.totalSegments} 段`,
  );

  // ── 漂流日志（前端「漂流日志」页）──────────────────────────────
  const events = await call(anon, 'GET', `/api/bottles/${bottleId}/events`);
  must(events.status === 200 && Array.isArray(events.body), '漂流日志应可读');
  must(events.body.length >= 8, `日志应记录整条接力，实际 ${events.body.length} 条`);
  must(
    events.body.every((event, index) => event.seq === index + 1),
    'seq 应从 1 连续升序',
  );
  must(
    events.body.every(
      (event) => typeof event.type === 'string' && typeof event.occurredAt === 'string',
    ),
    '每条事件都要有 type 与 occurredAt',
  );
  const systemEvents = events.body.filter((event) => event.actorId === 'SYSTEM');
  log(
    '漂流日志',
    `${events.body.length} 条 · 事件类型 ${[...new Set(events.body.map((e) => e.type))].join(',')} · 系统行为 ${systemEvents.length} 条`,
  );

  // ── 匿名代号（前端「我的」页）─────────────────────────────────
  const codes = await call(B.session, 'GET', '/api/me/anonymous-codes');
  must(codes.status === 200 && Array.isArray(codes.body), '匿名代号应可读');
  log('B 的匿名代号', codes.body.map((entry) => entry.code).join(', ') || '（空）');

  // ── 放回海中（未接唱直接放回 + 冷却）──────────────────────────
  const second2 = await call(C.session, 'POST', '/api/bottles', { json: { songId: song.id } });
  const bottle2 = second2.body.id;
  await recordSegment(C.session, bottle2, 20_000);
  await call(C.session, 'POST', `/api/bottles/${bottle2}/resolution`, {
    json: { resolution: 'RIVER' },
  });
  const { drawn: drawE } = await drawUntil(D.session, bottle2);
  must(drawE.status === 200 && drawE.body?.bottle?.id === bottle2, 'D 应捞到第二支瓶子');
  const putBack = await call(D.session, 'POST', `/api/bottles/${bottle2}/put-back`);
  must(putBack.status === 200, `放回应成功，实际 ${putBack.status}`);
  must(
    putBack.body?.cooldownDraws === 10,
    `放回后冷却次数应为 10，实际 ${putBack.body?.cooldownDraws}`,
  );
  log('D 放回海中', `冷却 ${putBack.body.cooldownDraws} 次`);

  // ── 「没有可捞的瓶子」：409 + 稳定码（前端据此渲染空态，而不是红色报错）──
  //
  // 造法：**捞到就持有、不放回** —— 河道只会越来越空，下一次打捞必然空手而归。
  //（旧写法是"捞到就放回"再重复：放回会刷新自己的冷却计数，于是 80 次全是 200，从来复现不出来。
  // 这就是"检查自己不可靠"的另一种形态：分支永远走不到，却一直显示为通过。）
  const E = await register('ee');
  let emptyDraw = null;
  let drained = 0;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const drawn = await call(E.session, 'POST', '/api/river/draw');
    if (drawn.status !== 200) {
      emptyDraw = drawn;
      break;
    }
    drained += 1; // 捞到即持有（不选去向）→ 这支瓶子离开河道
  }
  if (emptyDraw === null) {
    unreproducible(
      `河道里始终有瓶子可捞（本次已持有 ${String(drained)} 支），造不出"没有可捞的瓶子"这个空态`,
    );
    log('没有可捞的瓶子', '未复现（界面空态由前端测试与 API 集成测试分别覆盖）');
  } else {
    must(emptyDraw.status === 409, `没有可捞时应为 409，实际 ${emptyDraw.status}`);
    must(
      emptyDraw.body?.error?.violations?.[0]?.code === 'NO_BOTTLE_AVAILABLE',
      '没有可捞时应带 NO_BOTTLE_AVAILABLE 码',
    );
    log(
      '没有可捞的瓶子',
      `409 · ${emptyDraw.body?.error?.violations?.[0]?.code ?? '（无码）'} · ${emptyDraw.body?.error?.message ?? ''}`,
    );
  }

  // ── 第 27 步：我的漂流日志 `GET /api/me/bottles`（CONTEXT §11.1，P0）──────
  //
  // 这条端点最容易写错的三处，这里都钉住：
  // ① 判据是"我参与过"（我发起 或 我唱过），而不是"我现在还持有/还唱得动"；
  // ② **§46.1（用户裁决）**：被斩段作者 —— **含发起者** —— 不再算参与过（旧规则有"发起者豁免"，已整条删除）；
  // ③ 剔除必须是**定向**的：同一用户的其它参与作品不受影响（否则"整个列表变空"也会假装通过）。
  // 所以本步真的造一次斩浪，并同时断言"该瓶消失 + 主瓶还在"。
  const ownList = await call(A.session, 'GET', '/api/me/bottles');
  must(ownList.status === 200, `我的漂流日志应为 200，实际 ${ownList.status}`);
  const ownItem = ownList.body?.items?.find((item) => item.id === bottleId);
  must(ownItem !== undefined, 'A 发起并唱过的瓶子应出现在自己的漂流日志里');
  must(ownItem?.role === 'INITIATOR', `A 的角色应为 INITIATOR，实际 ${ownItem?.role}`);
  must(
    JSON.stringify(ownItem?.mySegmentIndexes) === JSON.stringify([1]),
    `A 的段号应为 [1]，实际 ${JSON.stringify(ownItem?.mySegmentIndexes)}`,
  );

  const peerList = await call(B.session, 'GET', '/api/me/bottles');
  const peerItem = peerList.body?.items?.find((item) => item.id === bottleId);
  must(peerItem?.role === 'SINGER', `B 的角色应为 SINGER，实际 ${peerItem?.role}`);
  must(
    JSON.stringify(peerItem?.mySegmentIndexes) === JSON.stringify([2]),
    `B 的段号应为 [2]，实际 ${JSON.stringify(peerItem?.mySegmentIndexes)}`,
  );

  const outsider = await register('zz');
  const outsiderList = await call(outsider.session, 'GET', '/api/me/bottles');
  must(
    (outsiderList.body?.items ?? []).every((item) => item.id !== bottleId),
    '与我无关的人不该在我的作品里看到它（端点只返回自己的）',
  );

  // 造一次真实的斩浪：10 个不同用户点踩第 1 段（阈值 10）→ 锚被斩 → 整瓶 DAMAGED
  const doomed = await call(A.session, 'POST', '/api/bottles', { json: { songId: song.id } });
  const doomedId = doomed.body?.id;
  const doomedSegment = await recordSegment(A.session, doomedId, 20_000, '等着被斩的一段');
  const doomedSegmentId = doomedSegment.body?.segmentId;
  await call(A.session, 'POST', `/api/bottles/${doomedId}/resolution`, { json: { resolution: 'RIVER' } });
  // 负向对照（先做）：单次"塞满"拿不到门槛 —— 证明限速真的在起作用，而不是我们的客户端在放水
  const cheater = await register('cz');
  const oneShot = await call(cheater.session, 'POST', `/api/segments/${doomedSegmentId}/listen`, {
    json: { coveredMs: 20_000 },
  });
  must(oneShot.status === 200, `上报本身应为 200，实际 ${oneShot.status}`);
  must(
    (oneShot.body?.ratio ?? 1) < 0.8,
    `单次塞满不应达到门槛（首报只给一半），实际 ratio=${String(oneShot.body?.ratio)}`,
  );
  const cheated = await call(cheater.session, 'POST', `/api/segments/${doomedSegmentId}/votes`, {
    json: { value: 'DISLIKE' },
  });
  must(cheated.status === 422, `没听满就点踩应为 422，实际 ${cheated.status}`);
  must(
    cheated.body?.error?.violations?.[0]?.code === 'LISTEN_THRESHOLD_NOT_REACHED',
    `应按"未达门槛"拒绝，实际错误码 ${String(cheated.body?.error?.violations?.[0]?.code)}`,
  );

  // 10 个点踩者：各自**真的听满**（1× 实时速率周期上报）之后才投票 —— 并发进行，本步总耗时 ≈ 一个段长
  const voters = [];
  for (let index = 0; index < 10; index += 1) {
    voters.push(await register('kv'));
  }
  const listened = await Promise.all(
    voters.map((voter) =>
      listenUntilThreshold(voter.session, doomedSegmentId, { durationMs: 20_000, threshold: 0.8 }),
    ),
  );
  must(
    listened.every((entry) => entry.ratio >= 0.8),
    `每个点踩者都应在服务端确认达门槛（实际最小 ratio=${String(Math.min(...listened.map((e) => e.ratio)))}）`,
  );

  let cutTriggered = false;
  for (const voter of voters) {
    const vote = await call(voter.session, 'POST', `/api/segments/${doomedSegmentId}/votes`, {
      json: { value: 'DISLIKE' },
    });
    must(vote.status === 200, `点踩应为 200，实际 ${vote.status}（响应 ${JSON.stringify(vote.body)}）`);
    cutTriggered = vote.body?.segmentCut === true;
  }
  must(cutTriggered, '第 10 个点踩应触发斩浪（阈值 10）');

  const afterCut = await call(A.session, 'GET', '/api/me/bottles');
  const cutItem = afterCut.body?.items?.find((item) => item.id === doomedId);
  must(
    cutItem === undefined,
    `被斩段作者（含发起者）不应再算参与过（§46.1），实际仍列出：${JSON.stringify(cutItem)}`,
  );
  // 反向对照：同一用户的**其它**参与作品必须还在 —— 没有这条，"列表整个变空"也会假装通过
  const mainStillListed = afterCut.body?.items?.find((item) => item.id === bottleId);
  must(
    mainStillListed !== undefined,
    '同一用户的其它参与作品不应受影响（否则剔除就不是"定向"的）',
  );
  must(
    mainStillListed?.role === 'INITIATOR',
    `主瓶子角色应仍是 INITIATOR，实际 ${mainStillListed?.role}`,
  );
  // 斩浪本身的效果换个端点观测（发起者仍可读详情）：状态与有效段
  const doomedDetail = await call(A.session, 'GET', `/api/bottles/${doomedId}`);
  must(doomedDetail.status === 200, `瓶子详情应为 200（发起者仍可读），实际 ${doomedDetail.status}`);
  must(
    doomedDetail.body?.status === 'DAMAGED',
    `锚被斩后瓶子应为 DAMAGED，实际 ${doomedDetail.body?.status}`,
  );
  must(
    (doomedDetail.body?.segments ?? []).length === 0,
    `锚段被斩后应无有效段，实际 ${JSON.stringify((doomedDetail.body?.segments ?? []).map((s) => s.index))}`,
  );
  log(
    '我的漂流日志（/api/me/bottles）',
    `A=INITIATOR 段[1] · B=SINGER 段[2] · 无关者看不到 · 被斩段作者（含发起者）已从列表剔除（§46.1）· 主瓶不受影响 · 被斩瓶 status=${doomedDetail.body?.status}`,
  );
  log(
    '点踩门槛（服务端持久化覆盖率）',
    `单次塞满→ratio ${String(oneShot.body?.ratio)} 被拒 422(${String(cheated.body?.error?.violations?.[0]?.code)}) · ` +
      `10 个点踩者按 1× 实时周期上报并各自听满（≈${String(Math.round(Math.max(...listened.map((e) => e.elapsedMs)) / 1000))}s）→ 全部 200，第 10 票斩浪`,
  );

  // ── 会话隔离：登出后 /me 为 401 ───────────────────────────────
  const loggedOut = await call(C.session, 'POST', '/api/auth/logout');
  must(loggedOut.status === 204, `登出应为 204，实际 ${loggedOut.status}`);
  const meAfterLogout = await call(C.session, 'GET', '/api/auth/me');
  must(meAfterLogout.status === 401, '登出后 /me 应为 401');

  console.log('');
  if (failures === 0 && inconclusive === 0) {
    console.log(
      `✅ 黄金路径真实链路检查通过（${String(stepNo)} 步，4 个账号，真库 + 真 HTTP + 真音频字节）`,
    );
    if (hermetic !== null) {
      console.log('   结论来源：hermetic 模式（自己的库 + 自己的种子 + 自己的进程）⟹ 可作验收证据。');
    }
    return 0;
  }

  if (failures === 0) {
    // 外部模式专属：非确定性步骤单列，不计 pass，也不硬判失败（硬判会随环境随机红）
    console.log(
      `⚠ 通过 ${String(stepNo - inconclusive)}/${String(stepNo)} 步；另有 ${String(inconclusive)} 步**未复现（数据不受控）**，不计入 pass。`,
    );
    console.error('   外部模式 · 非验收证据：本结论受环境数据影响，不能写进验收口径。');
    return 0;
  }

  console.error(
    `❌ 有 ${String(failures)} 项不符合预期${inconclusive === 0 ? '' : `，另有 ${String(inconclusive)} 步未复现（数据不受控）`}`,
  );
  console.error('   —— 最近 8 次请求（诊断用，从早到晚）——');
  for (const entry of recentCalls) {
    console.error(`   ${entry.who} ${entry.what} → ${String(entry.status)} ${entry.body}`);
  }
  if (hermetic !== null && hermetic.serverLog.trim().length > 0) {
    // 5xx 只有服务端日志里才有堆栈；没有这段，红就只是一句"应为 200"
    console.error('   —— API 服务端日志（末 20 行）——');
    for (const line of hermetic.serverLog.trim().split('\n').slice(-20)) {
      console.error(`   ${line}`);
    }
  }
  if (hermetic === null) {
    console.error('   外部模式 · 非验收证据：本结论受环境数据影响，不能写进验收口径。');
  }
  return 1;
};

const main = async () => {
  if (API === null) {
    await startHermetic();
  } else {
    // 横幅在最前面（跑任何检查之前），因为这份输出**不能**被当验收证据
    printExternalBanner();
    console.log(`[setup] 外部模式：使用 API_BASE=${API}`);
  }

  // 抛异常时本来就不会走到下面（node 自己给非零退出码），因此不需要"初始值"占位
  let code;
  try {
    code = await runChecks();
  } finally {
    // 失败路径也要删库：残留库会污染下一次"干净环境"的假设（这正是本次要修的病根）。
    await stopHermetic();
  }
  process.exit(code ?? 1);
};

await main();
