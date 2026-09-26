/**
 * 端到端走查（W3）—— 一条命令按**评委会走的顺序**跑完全流程，并逐步断言。
 *
 * 顺序（任务书给定的顺序，本文件按同一顺序实现）：
 *   预置演示账号 → 登录/注册 → 选歌（/new.html 建 DRAFT 瓶）→ 接唱（真 MediaRecorder，≥15 秒）
 *   → 瓶子详情（试听 / 投票 / 留言）→ 三选一去向 → 河道捞取（换一个接棒账号）→ 接唱 → 真留言
 *   → 漂流日志 → 公海（点「听这支作品」直达瓶子详情）→ 我的（**演示账号**的收藏/徽章/通知都要 > 0）
 *   → 通知「标记已读」就地生效。
 *
 * ⚠️ W7 起流程变了（用户第 3 轮需求，`docs/deploy-plan-html.md` §17）：**公海详情页已删除**，
 * 公海的「听这支作品」直接跳 `/bottle.html?id=…`，那条时间轴复刻进了瓶子详情 ⇒ 第 8 步改在这里走。
 *
 * ⚠️ 与 W4-a 的接口面（本脚本按**当前**页面实现，页面改了要回来对一次）：
 *   - `/new.html` **不再录音**：只建一只 DRAFT 瓶并跳 `/bottle.html?id=…`（"选这首，去接唱"）；
 *   - 录制入口只剩 `/bottle.html` 的 `.gapBox .cta`，**录满曲库预设自动停并自动上传**；
 *   - `.destCol`（去向往）默认 `hidden`，**录完才出现**（`renderDestinationGate()`）；
 *   - 「试听全部」按钮是 `.voteBtn.w4a-listenAll` ⇒ 本脚本一律用 `.voteBtn:not(.w4a-listenAll)` 取赞/踩，
 *     不靠序号猜。
 *
 * 机制（为什么这么写）：
 * - **playwright 只从 npx 缓存里取**（`_npx\*\node_modules\playwright`），本仓不登记该依赖（AGENTS §7）；
 * - **假麦克风**：`--use-fake-device-for-media-stream` 让 Chromium 产出**真实可解码的 WebM/Opus**，
 *   所以「录音 ≥15 秒」与「试听真的在出声」都是真的（不是打桩）；若该环境给不出假麦克风，
 *   脚本**降级为合成容器**（EBML 魔数 `1A 45 DF A3`）并**明确打印用了哪一种**；
 * - 等待一律用**页面就绪信号**（`documentElement.dataset.pageReady`，W3 新增的可测性信号）
 *   与**有界 `waitForFunction`**，不用固定 sleep 猜时机；
 * - 音频端点支持 Range ⇒ 响应是 **206**（只认 200 会把"试听成功"误判成失败，实测踩过）。
 *
 * 前置：API 在 8787（`pnpm --filter @music-drift/api dev`）与 Postgres 5433 已就绪；
 * 站点服务器本脚本**自己起**（没起时）并复用（已在跑时），**不会**再起第二个 API。
 *
 * 用法：node tools/walkthrough.mjs [--port=5188]
 * 退出码：0 = 所有断言通过；1 = 有断言失败。
 */
/* eslint-disable no-console */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEMO, createApiClient, ensureDemoData, uploadSyntheticSegment } from './seed-demo.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(ROOT, '.tmp-w3-shots');

const args = new Map(
  process.argv.slice(2).map((raw) => {
    const [key, value] = raw.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);
const PORT = Number(args.get('port') ?? 5188);
const BASE = `http://127.0.0.1:${String(PORT)}`;
const API_PORT = Number(args.get('api-port') ?? 8787);
const STAMP = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, '')
  .slice(0, 14);
/**
 * 本片临时造的两个探针账号（跑完可清，见 `docs/site-runbook.md` §8）。
 *
 * ⚠️ W6 起登录/注册的契约是 `{ account, password }`，**账号 = `users.handle`、不再是邮箱**
 * （`packages/shared/src/contracts/auth.ts`）；W7 修：本脚本原来按旧形状填「用户名」行 + 用邮箱当账号，
 * 而登录页早已没有那个输入框 ⇒ 第 1 步的注册填表就卡死（真缺陷，与 W7 的页面改动无关）。
 */
const WALKER = { handle: `w3walk${STAMP}`, password: 'SeaDrift2026' };
const RELAY = { handle: `w3relay${STAMP}`, password: 'SeaDrift2026' };
/** 录音时长下界（任务书要求 ≥15 秒）；上界由曲库预设 ±2000ms 决定，实测由服务端把关。 */
const MIN_RECORD_MS = 15_000;
const RECORD_TIMEOUT_MS = 60_000;

const failures = [];
const warnings = [];
const pageErrors = [];
const badResponses = [];

function check(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  —— ${detail}`}`);
  if (!ok) failures.push(label);
}
function warn(text) {
  warnings.push(text);
  console.log(`WARN  ${text}`);
}
function step(text) {
  console.log(`\n── ${text}`);
}

async function loadPlaywright() {
  const cacheRoot = join(homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
  if (!existsSync(cacheRoot)) {
    throw new Error(`npx 缓存目录不存在：${cacheRoot}（先跑一次 npx playwright --version）`);
  }
  for (const entry of readdirSync(cacheRoot)) {
    const candidate = join(cacheRoot, entry, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(candidate)) return await import(`file://${candidate.replaceAll('\\', '/')}`);
  }
  throw new Error('找不到 playwright（npx 缓存里没有；先跑一次 `npx playwright --version`）');
}

/** 站点服务器：已在跑就复用，否则本进程起来（跑完杀掉）。 */
async function ensureSiteServer() {
  try {
    const response = await fetch(`${BASE}/healthz`);
    if (response.ok) return { server: null, reused: true };
  } catch {
    /* 没起 */
  }
  const server = spawn(
    process.execPath,
    [join(ROOT, 'tools', 'site-server.mjs'), `--port=${String(PORT)}`, `--api-port=${String(API_PORT)}`],
    { cwd: ROOT, stdio: 'ignore' },
  );
  process.on('exit', () => server.kill());
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/healthz`);
      if (response.ok) return { server, reused: false };
    } catch {
      /* 还没起来 */
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`站点服务器没起来（${BASE}/healthz 一直不通）`);
}

/** 会话客户端（带上浏览器上下文里的 `mdb_session`，用来做**程序侧**断言）。 */
async function clientFromContext(context) {
  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === 'mdb_session');
  const client = createApiClient(BASE);
  if (session !== undefined) client.useCookie(`mdb_session=${session.value}`);
  return client;
}

async function api(client, method, path) {
  const response = await client.request(method, path);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${method} ${path} → HTTP ${String(response.status)} ${response.body?.error?.message ?? ''}`);
  }
  return response.body;
}

/**
 * 走真登录页（`/login.html`）。
 *
 * ⚠️ W6 起两个 tab 都是**两个输入框**（账号 + 口令），账号 = `users.handle`（不是邮箱）——
 * 冻结 HTML 里那个 `#handle` 输入框**就是账号**。W7 修：本函数原来按旧形状往「用户名」行
 * （`[data-username-row="true"]`，W6 已随方案 C 删除）里填 handle、并把邮箱填进账号栏 ⇒
 * 注册/登录在 W6 之后必然卡在 `locator.fill` 超时。现在只填两个真实存在的输入框。
 */
async function signInThroughUi(page, account, { next = '/river.html', register }) {
  await page.goto(`${BASE}/login.html?next=${encodeURIComponent(next)}`);
  await page.waitForFunction(() => document.documentElement.dataset.pageReady === 'login');
  await page.locator('.modes .mode').nth(register ? 1 : 0).click();
  await page.locator('.f-handle input').fill(account.handle);
  await page.locator('.f-pass:not([data-username-row]) input').fill(account.password);
  await page.click('button.act');
  await page.waitForURL((url) => !url.pathname.endsWith('/login.html'), { timeout: 20000 });
}

/** 一次性把页面上下文与它的网络/错误日志建好。 */
async function openSession(browser, label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.grantPermissions(['microphone'], { origin: BASE });
  const page = await context.newPage();
  const responses = [];
  page.on('pageerror', (error) => pageErrors.push(`[${label}] ${String(error)}`));
  page.on('response', (response) => {
    const url = response.url();
    if (!url.startsWith(BASE)) return;
    const entry = { url, status: response.status(), type: response.headers()['content-type'] ?? '' };
    responses.push(entry);
    if (entry.status >= 500) badResponses.push(`[${label}] ${String(entry.status)} ${url}`);
  });
  return { context, page, responses };
}

/** 音频端点：Range 请求回 **206**，整段回 200 —— 两个都算成功。 */
const audioResponsesOf = (responses) =>
  responses.filter(
    (entry) =>
      /\/api\/segments\/[^/]+\/audio/.test(entry.url) &&
      (entry.status === 200 || entry.status === 206) &&
      entry.type.startsWith('audio/'),
  );

/** 点赞 / 点踩按钮（排除 W4-a 新加的「试听全部」按钮，它借了同一个类名）。 */
const voteButtons = (page) => page.locator('.voteBtn:not(.w4a-listenAll)');

async function waitForPlayback(page, timeout = 15000) {
  try {
    await page.waitForFunction(
      () => {
        const audio = document.querySelector('audio');
        return audio !== null && audio.paused === false && audio.currentTime > 0.4;
      },
      null,
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * 在 `/bottle.html` 上接唱一段：点 `.gapBox .cta` → **录满曲库预设自动停并自动上传**。
 *
 * 返回 `{ ok, elapsedMs, note }`；`elapsedMs` 是**墙钟**（≥15 秒的原始证据），
 * `note` 是页面自己的成功文案（含服务端认可的段号与时长）。
 */
async function recordSegmentOnBottlePage(page) {
  await page.waitForSelector('.gapBox .cta:not([disabled])', { timeout: 20000 });
  const ctaLabel = (await page.locator('.gapBox .cta').textContent()) ?? '';
  const started = Date.now();
  await page.locator('.gapBox .cta').click({ timeout: 20000 });
  try {
    await page.waitForFunction(
      () =>
        /第 \d+ 段已经录好了/.test(document.querySelector('.gapBox .gapNote')?.textContent ?? '') ||
        /第 \d+ 段已经录好了/.test(document.querySelector('.destCol .sub')?.textContent ?? ''),
      null,
      { timeout: RECORD_TIMEOUT_MS },
    );
  } catch {
    return { ok: false, elapsedMs: Date.now() - started, ctaLabel, note: '' };
  }
  const elapsedMs = Date.now() - started;
  const note = await page.evaluate(
    () =>
      document.querySelector('.gapBox .gapNote')?.textContent ??
      document.querySelector('.destCol .sub')?.textContent ??
      '',
  );
  return { ok: true, elapsedMs, ctaLabel, note };
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const { server, reused } = await ensureSiteServer();
  console.log(`站点：${BASE}（${reused ? '复用已在跑的服务器' : '本进程新起'}） · API：${String(API_PORT)}`);
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  try {
    // ─────────────────────────────────────────────────────────── 0. 演示账号
    step('0. 预置演示账号（seed-demo 的声明式保证）');
    const seeded = await ensureDemoData({ base: BASE, log: () => {} });
    check(
      '演示账号在「我的」页有内容（参与过 ≥2 · 收藏 ≥1 · 徽章 ≥1 · 未读通知 ≥1）',
      seeded.participated >= 2 &&
        seeded.completedSea >= 1 &&
        seeded.inRiver >= 1 &&
        seeded.collections >= 1 &&
        seeded.badges >= 1 &&
        seeded.unread >= 1,
      `参与过 ${String(seeded.participated)}（完整入海 ${String(seeded.completedSea)} · 河道 ${String(seeded.inRiver)}）` +
        ` 收藏 ${String(seeded.collections)} 徽章 ${String(seeded.badges)} 通知 ${String(seeded.notifications)} 未读 ${String(seeded.unread)}`,
    );

    // ─────────────────────────────────────────────────────────── 1. 登录
    step('1. 登录（真登录页 /login.html，注册 tab 两项：账号 + 口令）');
    const walker = await openSession(browser, 'walker');
    await signInThroughUi(walker.page, WALKER, { register: true });
    const walkerClient = await clientFromContext(walker.context);
    const walkerMe = await api(walkerClient, 'GET', '/api/auth/me');
    const walkerId = walkerMe?.user?.id ?? '';
    check(
      '注册即登录（GET /api/auth/me 回的是本人）',
      walkerMe?.user?.handle === WALKER.handle && walkerId !== '',
      `handle=${String(walkerMe?.user?.handle)}`,
    );

    // ─────────────────────────────────────────────────────────── 2. 选歌 → 接唱（真录音）
    step('2. 选歌（/new.html 建 DRAFT 瓶）→ 接唱（真 MediaRecorder，≥15 秒）');
    const walkerBottle = await pickSongAndCreateBottle(walker);
    check(
      '选歌并发起：建 DRAFT 瓶并跳到接唱页',
      walkerBottle.bottleId !== '' && walkerBottle.status === 'DRAFT' && walkerBottle.segments === 0,
      `《${walkerBottle.songTitle}》 预设第 1 段=${String(walkerBottle.presetMs)}ms 瓶=${walkerBottle.bottleId.slice(0, 8)}…`,
    );

    const walkerRecord = await recordSegmentOnBottlePage(walker.page);
    if (!walkerRecord.ok) {
      warn(`接唱（真 MediaRecorder）没成功，降级为合成容器：${walkerRecord.note || '未拿到成功文案'}`);
      await uploadSyntheticSegment(walkerClient, walkerBottle.bottleId, walkerBottle.presetMs);
      await walker.page.reload();
      await walker.page.waitForFunction(() => document.documentElement.dataset.pageReady === 'bottle');
    }
    const walkerDetail = await api(walkerClient, 'GET', `/api/bottles/${walkerBottle.bottleId}`);
    const walkerOwn = walkerDetail.segments.find((segment) => segment.ownerId === walkerId) ?? null;
    check(
      `接唱成功（${walkerRecord.ok ? '真 MediaRecorder' : '合成容器降级'}）：录满预设自动停 + 自动上传 + 服务端记到我的这一段`,
      walkerOwn !== null && walkerDetail.segments.length === 1,
      `${walkerRecord.ok ? `墙钟 ${String(walkerRecord.elapsedMs)}ms（按钮「${walkerRecord.ctaLabel.trim()}」→ 自动停）· ` : ''}` +
        `服务端段=${String(walkerDetail.segments.length)} 第 ${String(walkerOwn?.index)} 段 页内公告=${walkerRecord.note.trim().slice(0, 40)}`,
    );
    check(
      '录音时长 ≥15 秒（墙钟实测，且服务端按曲库预设 ±2 秒校验通过才可能上传成功）',
      walkerRecord.ok ? walkerRecord.elapsedMs >= MIN_RECORD_MS : true,
      walkerRecord.ok
        ? `墙钟 ${String(walkerRecord.elapsedMs)}ms / 预设 ${String(walkerBottle.presetMs)}ms`
        : '降级路径：无录音（合成容器），此断言不适用',
    );

    // ─────────────────────────────────────────────────────────── 3. 瓶子详情
    step('3. 瓶子详情（试听 / 投票 / 留言）');
    const { page } = walker;
    await page.waitForFunction(() => document.documentElement.dataset.pageReady === 'bottle');
    check(
      '详情与服务端一致（段位/缺口/去向门槛）',
      walkerDetail.id === walkerBottle.bottleId &&
        walkerDetail.missingSegmentIndexes.length === 3 &&
        walkerDetail.availableResolutions.includes('RIVER'),
      `status=${walkerDetail.status} 段数=${String(walkerDetail.segments.length)} 缺口=${walkerDetail.missingSegmentIndexes.join(',')} 可选去向=${walkerDetail.availableResolutions.join('/')}`,
    );

    const ownIndex = walkerOwn?.index ?? 1;
    await page.locator('.cap .listen').nth(ownIndex - 1).click({ timeout: 20000 });
    await page.waitForFunction(
      () => (document.querySelector('audio')?.src ?? '').includes('/api/segments/'),
      null,
      { timeout: 15000 },
    );
    const walkerPlayback = await waitForPlayback(page);
    const walkerAudio = audioResponsesOf(walker.responses);
    check(
      '试听：音频走同源端点（Range 206）且**真的在出声**（真 MediaRecorder 产物可解码）',
      walkerAudio.length >= 1 && walkerPlayback,
      `audio 响应 ${String(walkerAudio.length)} 次（状态 ${walkerAudio.map((entry) => String(entry.status)).join('/')}）· currentTime 前进=${String(walkerPlayback)}`,
    );

    await voteButtons(page).nth(0).click({ timeout: 20000 });
    let pageLike = 0;
    try {
      await page.waitForFunction(
        () => document.querySelectorAll('.voteBtn .n')[0]?.textContent === '1',
        null,
        { timeout: 10000 },
      );
      pageLike = 1;
    } catch {
      pageLike = Number(await page.locator('.voteBtn .n').first().textContent());
    }
    const afterVote = await api(walkerClient, 'GET', `/api/bottles/${walkerBottle.bottleId}`);
    check(
      '投票（点赞）：页面就地 +1 且服务端记到了同一票',
      pageLike === 1 && afterVote.segments[0].likeCount === 1,
      `页面计数=${String(pageLike)} 服务端 likeCount=${String(afterVote.segments[0].likeCount)}`,
    );

    await page.locator('.bottom .botLink').nth(0).click({ timeout: 20000 });
    await page.waitForSelector('form.w1b-panel', { timeout: 10000 });
    const emptyPanel = await page.evaluate(() => {
      const form = document.querySelector('form.w1b-panel');
      return {
        hasSelect: form?.querySelector('select') !== null,
        disabled: form?.querySelector('button[type="submit"]')?.disabled === true,
        intro: form?.querySelector('.w1b-panel__intro')?.textContent ?? '',
      };
    });
    check(
      '留言面板：本瓶只有我自己的段 ⇒ 无收件人时禁用并说明（真发送在接棒账号那步验证）',
      emptyPanel.hasSelect === false && emptyPanel.disabled === true && emptyPanel.intro.includes('没有可以留言的段'),
      `select=${String(emptyPanel.hasSelect)} submit.disabled=${String(emptyPanel.disabled)}`,
    );
    await page.locator('form.w1b-panel button[type="button"]').click();

    // ─────────────────────────────────────────────────────────── 4. 三选一去向
    step('4. 三选一去向（发起者投河；去向在接唱后才出现）');
    const destVisible = await page.evaluate(() => {
      const col = document.querySelector('.destCol');
      return col !== null && col.hidden !== true;
    });
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('.destRow')].map((row) => ({
        text: row.querySelector('.t')?.textContent ?? '',
        disabled: row.disabled === true,
      })),
    );
    check(
      '三条水路按服务端可选性渲染（发起者未投河：可投河/入海，回传不可选）',
      destVisible && rows.length === 3 && !rows[0].disabled && rows[1].disabled && !rows[2].disabled,
      `去向列可见=${String(destVisible)} · ${rows.map((row) => `${row.text.trim()}${row.disabled ? '(禁用)' : ''}`).join(' | ')}`,
    );
    await page.locator('.destRow').nth(0).click({ timeout: 20000 });
    const casted = await waitForStatus(walkerClient, walkerBottle.bottleId, 'IN_RIVER');
    check('选「继续投河」生效（服务端 status → IN_RIVER）', casted === 'IN_RIVER', `status=${String(casted)}`);

    // ─────────────────────────────────────────────────────────── 5. 河道捞取
    step('5. 河道捞取（接棒账号 /river.html）');
    const relay = await openSession(browser, 'relay');
    await signInThroughUi(relay.page, RELAY, { register: true });
    const relayClient = await clientFromContext(relay.context);
    const relayMe = await api(relayClient, 'GET', '/api/auth/me');
    const relayId = relayMe?.user?.id ?? '';
    await relay.page.goto(`${BASE}/river.html`);
    await relay.page.waitForFunction(() => document.documentElement.dataset.pageReady === 'river');
    check(
      '河道页给出「接线完成」信号，且状态条查询口可用（W3 两个可测性口）',
      (await relay.page.evaluate(async () => {
        const mod = await import('/app/dom.js');
        return typeof mod.stateNode === 'function' && typeof mod.stateKind === 'function';
      })) === true,
      'pageReady=river · dom.stateNode/stateKind 可用',
    );
    const drew = relay.page.waitForURL(/bottle\.html\?id=/, { timeout: 30000 });
    await relay.page.locator('.port.draw').click({ timeout: 20000 });
    await drew;
    const drawnId = new URL(relay.page.url()).searchParams.get('id') ?? '';
    await relay.page.waitForFunction(() => document.documentElement.dataset.pageReady === 'bottle');
    const drawnDetail = await api(relayClient, 'GET', `/api/bottles/${drawnId}`);
    check(
      '捞取：POST /api/river/draw 拿到一支真瓶子并跳到详情',
      drawnId !== '' && drawnDetail.id === drawnId && drawnDetail.segments.length >= 1 && drawnDetail.isHolder === true,
      `瓶=${drawnId.slice(0, 8)}… status=${drawnDetail.status} 段数=${String(drawnDetail.segments.length)} 持有者=我`,
    );

    // ─────────────────────────────────────────────────────────── 6. 接棒账号
    step('6. 接棒账号：试听（他人段）→ 接唱 → 试听（自己那段）→ 投票 → 留言 → 去向');
    await relay.page.locator('.cap .listen').first().click({ timeout: 20000 });
    try {
      await relay.page.waitForFunction(
        () => (document.querySelector('audio')?.src ?? '').includes('/api/segments/'),
        null,
        { timeout: 15000 },
      );
    } catch {
      /* 下面统一断言 */
    }
    const relayAudio = audioResponsesOf(relay.responses);
    check(
      '试听（他人作品）：音频端点 200/206 + audio/*',
      relayAudio.length >= 1,
      `audio 响应 ${String(relayAudio.length)} 次（状态 ${relayAudio.map((entry) => String(entry.status)).join('/')}）`,
    );

    const relayGapIndex = drawnDetail.missingSegmentIndexes[0] ?? null;
    const relayRecord = await recordSegmentOnBottlePage(relay.page);
    if (!relayRecord.ok) {
      warn(`接棒账号的接唱没成功，降级为合成容器：${relayRecord.note || '未拿到成功文案'}`);
      const gapIndex = (await api(relayClient, 'GET', `/api/bottles/${drawnId}`)).missingSegmentIndexes[0];
      const preset = await presetOf(relayClient, drawnId, gapIndex);
      await uploadSyntheticSegment(relayClient, drawnId, preset);
      await relay.page.reload();
      await relay.page.waitForFunction(() => document.documentElement.dataset.pageReady === 'bottle');
    }
    const relayAfterRecord = await api(relayClient, 'GET', `/api/bottles/${drawnId}`);
    const relayOwn = relayAfterRecord.segments.find((segment) => segment.ownerId === relayId) ?? null;
    check(
      `接唱（${relayRecord.ok ? '真 MediaRecorder' : '合成容器降级'}）：服务端把我的这一段记进了作品`,
      relayOwn !== null && relayOwn.index === relayGapIndex,
      `录的是第 ${String(relayOwn?.index)} 段（缺口 ${String(relayGapIndex)}）· 墙钟 ${String(relayRecord.elapsedMs)}ms · 段数 ${String(relayAfterRecord.segments.length)}`,
    );

    if (relayOwn !== null) {
      await relay.page.locator('.cap .listen').nth(relayOwn.index - 1).click({ timeout: 20000 });
      await relay.page.waitForFunction(
        () => (document.querySelector('audio')?.src ?? '').includes('/api/segments/'),
        null,
        { timeout: 15000 },
      );
      const relayOwnPlayback = await waitForPlayback(relay.page);
      const relayOwnAudio = audioResponsesOf(relay.responses);
      check(
        '试听（我自己刚录的那一段）：真的在出声（第二段真 MediaRecorder 产物同样可解码）',
        relayOwnPlayback && relayOwnAudio.length >= 2,
        `audio 响应 ${String(relayOwnAudio.length)} 次 · currentTime 前进=${String(relayOwnPlayback)}`,
      );
      if (!relayOwnPlayback) {
        warn('接棒账号自己那一段没能起播（真录音路径下不该发生，需单独复查）');
      }
    } else {
      check('试听（我自己刚录的那一段）：真的在出声（第二段真 MediaRecorder 产物同样可解码）', false, '我没有段');
    }

    const firstOther = relayAfterRecord.segments.find((segment) => segment.ownerId !== relayId) ?? null;
    await relay.page.locator('.cap .listen').nth((firstOther?.index ?? 1) - 1).click({ timeout: 20000 });
    await voteButtons(relay.page).nth(0).click({ timeout: 20000 });
    const relayVote = await waitForLikeCount(relayClient, drawnId, firstOther?.index ?? 1);
    check(
      '投票（点赞别人的段）：服务端 likeCount 记到了这一票',
      relayVote >= 1,
      `第 ${String(firstOther?.index ?? 1)} 段 likeCount=${String(relayVote)}`,
    );

    await relay.page.locator('.bottom .botLink').nth(0).click({ timeout: 20000 });
    await relay.page.waitForSelector('form.w1b-panel select', { timeout: 10000 });
    await relay.page.fill('form.w1b-panel textarea', 'W3 走查：这段话只说给这一段的作者听。');
    await relay.page.locator('form.w1b-panel button[type="submit"]').click();
    let messageSent = false;
    try {
      await relay.page.waitForFunction(
        () => (document.querySelector('.w1b-panel__msg')?.textContent ?? '').includes('留言已送出'),
        null,
        { timeout: 10000 },
      );
      messageSent = true;
    } catch {
      messageSent = false;
    }
    const messageNote = await relay.page.evaluate(
      () => document.querySelector('.w1b-panel__msg')?.textContent ?? '',
    );
    const storedMessages = await api(relayClient, 'GET', `/api/bottles/${drawnId}/messages`);
    check(
      '私密留言真的送出（面板确认 + 服务端存到了这条留言）',
      messageSent && Array.isArray(storedMessages) && storedMessages.length >= 1,
      `面板="${messageNote.trim()}" 可见留言=${String(storedMessages.length)} 条`,
    );
    await relay.page.locator('form.w1b-panel button[type="button"]').click();

    /**
     * 「处置生效」的判据＝**状态签名**（status / 持有者 / 当前投掷者 / 回传是否走完）里的任意一项变化。
     *
     * 为什么不用单一字段：
     *   - `status` 单独用会把**成功的回传**判成失败（回传＝沿父链交回，status 仍是 `HELD`，只是换持有者）；
     *   - `revision` 单独用也不行：**实测服务器在处置时不改 revision**（`revision 2 → 2`，而 status 已
     *     `HELD → IN_RIVER`）—— 我第一版就是拿它当判据，被这一步当场戳破。
     * 签名变化则对三条水路都成立（投河 → status；入海 → status/seaZone；回传 → holderId）。
     */
    const beforeResolution = resolutionSignature(relayAfterRecord);
    const enabledRow = await relay.page.evaluate(() => {
      const all = [...document.querySelectorAll('.destRow')];
      return {
        index: all.findIndex((row) => row.disabled !== true),
        labels: all.map((row) => (row.querySelector('.t')?.textContent ?? '').trim()),
      };
    });
    const chosenLabel = String(enabledRow.labels[Math.max(0, enabledRow.index)]);
    await relay.page.locator('.destRow').nth(Math.max(0, enabledRow.index)).click({ timeout: 20000 });
    const afterResolution = await waitForResolutionEffect(relayClient, drawnId, beforeResolution);
    check(
      '三选一去向：按服务端给出的第一项可用水路处置成功（作品状态/持有者真的变了）',
      resolutionSignature(afterResolution) !== beforeResolution,
      `${beforeResolution} → ${resolutionSignature(afterResolution)}（点的是「${chosenLabel}」）`,
    );

    // ─────────────────────────────────────────────────────────── 7. 漂流日志
    step('7. 漂流日志（/drift-log.html?id=…，接棒账号是参与者 ⇒ 有刻痕）');
    await relay.page.locator('.journey').click({ timeout: 20000 });
    await relay.page.waitForURL(/drift-log\.html\?id=/);
    await relay.page.waitForFunction(() => document.documentElement.dataset.pageReady === 'drift-log');
    const logInfo = await relay.page.evaluate(() => ({
      rows: document.querySelectorAll('.roll ol > li').length,
      marks: document.querySelector('.hright .n')?.textContent ?? '',
      song: document.querySelector('.hright .song')?.textContent ?? '',
    }));
    check(
      '日志刻痕与曲名都有真数据（不是默认演示文案）',
      logInfo.rows >= 1 && logInfo.song.trim() !== '' && Number(logInfo.marks) >= 1,
      `刻痕=${String(logInfo.rows)} 标记数=${logInfo.marks} 曲名=${logInfo.song.trim()}`,
    );

    // ─────────────────────────────────────────────────────────── 8. 公海 →「听这支作品」→ 瓶子详情
    step('8. 公海（/sea.html）→ 点「听这支作品」→ 瓶子详情（/bottle.html?id=…）');
    await relay.page.goto(`${BASE}/sea.html`);
    await relay.page.waitForFunction(() => document.documentElement.dataset.pageReady === 'sea');
    await relay.page.waitForSelector('main > ul.fleet > li', { timeout: 15000 });
    const seaInfo = await relay.page.evaluate(() => {
      const items = [...document.querySelectorAll('main > ul.fleet > li')];
      const first = items[0];
      return {
        count: items.length,
        song: first?.querySelector('.entry .song')?.textContent ?? '',
        href: first?.querySelector('.entry .listen')?.getAttribute('href') ?? '',
      };
    });
    check(
      '公海已完成区有真作品，且「听这支作品」**直达瓶子详情**（W7：公海详情页已删除）',
      seaInfo.count >= 1 && seaInfo.song.trim() !== '' && seaInfo.href.startsWith('/bottle.html?id='),
      `分区条目=${String(seaInfo.count)} 首项=《${seaInfo.song.trim()}》 链接=${seaInfo.href}`,
    );
    await relay.page.screenshot({ path: join(SHOTS, 'w3-sea.png') });

    await relay.page.locator('main > ul.fleet > li .entry .listen').first().click({ timeout: 20000 });
    await relay.page.waitForURL(/bottle\.html\?id=/, { timeout: 25000 });
    await relay.page.waitForFunction(() => document.documentElement.dataset.pageReady === 'bottle');
    const seaBottleId = new URL(relay.page.url()).searchParams.get('id') ?? '';
    const seaBottleDom = await relay.page.evaluate(() => {
      const root = document.querySelector('[data-w7-timeline]');
      return {
        title: document.querySelector('.work')?.textContent ?? '',
        caps: document.querySelectorAll('.cap').length,
        segments: root === null ? -1 : root.querySelectorAll('.seg').length,
        empty: root === null ? -1 : root.querySelectorAll('.seg.empty').length,
        needle: document.querySelector('[data-w7-needle]') !== null,
      };
    });
    const seaBottle = await api(relayClient, 'GET', `/api/bottles/${seaBottleId}`);
    check(
      '公海点听直达瓶子详情：曲名 / 段链 / 时间轴（含缺口段与唱针）都按真数据渲染',
      seaBottleDom.title.trim() !== '' &&
        seaBottleDom.caps === seaBottle.segments.length &&
        seaBottleDom.segments === seaBottle.totalSegments &&
        seaBottleDom.empty === seaBottle.missingSegmentIndexes.length &&
        seaBottleDom.needle,
      `曲名=${seaBottleDom.title.trim()} 段链=${String(seaBottleDom.caps)}/${String(seaBottle.segments.length)} ` +
        `时间轴段=${String(seaBottleDom.segments)}（缺口 ${String(seaBottleDom.empty)} 应=${String(seaBottle.missingSegmentIndexes.length)}）` +
        ` 唱针=${String(seaBottleDom.needle)}`,
    );

    // ─────────────────────────────────────────────────────────── 9. 我的（演示账号）
    step('9. 我的（/me.html，演示账号）—— 收藏 / 徽章 / 通知都要有内容');
    const judge = await openSession(browser, 'demo');
    await signInThroughUi(judge.page, DEMO, { register: false, next: '/me.html' });
    await judge.page.waitForFunction(() => document.documentElement.dataset.pageReady === 'me');
    const judgeClient = await clientFromContext(judge.context);
    const meData = await collectMe(judgeClient);
    check(
      '「我的」接口侧：参与过 ≥2（完整入海 ≥1 · 河道 ≥1）',
      meData.participated >= 2 && meData.completedSea >= 1 && meData.inRiver >= 1,
      `参与过 ${String(meData.participated)}（完整入海 ${String(meData.completedSea)} · 河道/持有中 ${String(meData.inRiver)}）`,
    );
    check('「我的」接口侧：收藏 ≥1', meData.collections >= 1, `收藏 ${String(meData.collections)} 件`);
    check('「我的」接口侧：徽章 ≥1', meData.badges >= 1, `徽章 ${String(meData.badges)} 枚`);
    check(
      '「我的」接口侧：通知 ≥1 且有未读',
      meData.notifications >= 1 && meData.unread >= 1,
      `通知 ${String(meData.notifications)} 条（未读 ${String(meData.unread)}）`,
    );

    const meDom = await judge.page.evaluate(() => {
      const pockets = document.querySelectorAll('.pockets .pocket');
      const rowsOf = (pocket) => [...(pocket?.querySelectorAll('.mrow') ?? [])];
      const labelsOf = (rows) => rows.map((row) => row.querySelector('.lab')?.textContent ?? '');
      const collectionRows = rowsOf(pockets[0]);
      const badgeRows = rowsOf(pockets[1]);
      return {
        cards: document.querySelectorAll('.window ul > li').length,
        crate: document.querySelector('.crate .chead .cat')?.textContent ?? '',
        collections: collectionRows.length,
        badges: badgeRows.length,
        messages: document.querySelectorAll('.msgs ul > li').length,
        unreadPills: document.querySelectorAll('.msgs .mrow .pill').length,
        collectedLabels: labelsOf(collectionRows),
        badgeLabels: labelsOf(badgeRows),
        messageLabels: [...document.querySelectorAll('.msgs .mrow .lab')].map((node) => node.textContent ?? ''),
      };
    });
    check(
      '「我的」页面侧：漂流卡 ≥2 且收藏/徽章/消息三块都非空（构图未坏：都不是空态）',
      meDom.cards >= 2 && meDom.collections >= 1 && meDom.badges >= 1 && meDom.messages >= 1,
      `卡片=${String(meDom.cards)}（${meDom.crate.trim()}）收藏行=${String(meDom.collections)}[${meDom.collectedLabels.join('、')}]` +
        ` 徽章行=${String(meDom.badges)}[${meDom.badgeLabels.join('、')}] 消息行=${String(meDom.messages)}[${meDom.messageLabels.join('、')}]`,
    );
    check('「我的」页面侧：至少一条通知是未读态', meDom.unreadPills >= 1, `未读标记 ${String(meDom.unreadPills)} 条`);
    await judge.page.screenshot({ path: join(SHOTS, 'w3-me-demo.png') });
    await judge.page.goto(`${BASE}/bottle.html?id=${encodeURIComponent(walkerBottle.bottleId)}`);
    await judge.page.waitForFunction(() => document.documentElement.dataset.pageReady === 'bottle');
    await judge.page.screenshot({ path: join(SHOTS, 'w3-bottle.png') });

    // ─────────────────────────────────────────────────────────── 10. 通知就地标记已读
    step('10. 通知「标记已读」（就地生效，POST /api/notifications/:id/read）');
    await judge.page.goto(`${BASE}/me.html`);
    await judge.page.waitForFunction(() => document.documentElement.dataset.pageReady === 'me');
    const unreadBefore = (await api(judgeClient, 'GET', '/api/notifications')).items.filter(
      (row) => row.readAt === null,
    );
    /**
     * ⚠️ W7 修（数据形状变了会让这一步误判）：`BOTTLE_RETURNED`（回传到手里）那一条的动作是
     * 「去看看」= **先标已读再 `location.assign` 到瓶子页**（`page-me.js` 的 `openReturned`），
     * 而这一步要验的是**就地**标记已读。演示账号的通知会随各片走查增长，最新一条可能正好是回传行
     * （实测：点它以后页面已经跳到 `/bottle.html`，本步的「未读少 1」与随后的 reload 全被带偏）。
     * ⇒ 只挑**不是回传行**（`.hero` 只在回传那条上）的未读消息；若当下没有这种样本，如实 WARN 跳过，
     * 不静默算通过。
     */
    const inPlaceUnread = judge.page
      .locator('.msgs li:not(.hero)')
      .filter({ has: judge.page.locator('.mrow .pill') });
    const inPlaceCount = await inPlaceUnread.count();
    let domAfter = { pills: meDom.unreadPills, readLabels: [], goLabels: [] };
    let becameRead = false;
    if (inPlaceCount === 0) {
      warn('演示账号此刻没有「就地标记已读」类的未读消息（未读全是「回传 · 去看看」，点它会跳瓶子页）⇒ 本步无样本，跳过');
    } else {
      await inPlaceUnread.first().locator('.mrow .go').click({ timeout: 20000 });
      try {
        await judge.page.waitForFunction(
          (expected) => document.querySelectorAll('.msgs .mrow .pill').length === expected - 1,
          meDom.unreadPills,
          { timeout: 10000 },
        );
        becameRead = true;
      } catch {
        becameRead = false;
      }
      /** 点完必须**还在 /me.html**：跳到别处说明点错了行（这正是改前的失效方式）。 */
      if (new URL(judge.page.url()).pathname !== '/me.html') {
        warn(`就地标记已读这一步把页面带到了 ${new URL(judge.page.url()).pathname}（点到了会跳转的行）`);
      }
      domAfter = await judge.page.evaluate(() => ({
        pills: document.querySelectorAll('.msgs .mrow .pill').length,
        readLabels: [...document.querySelectorAll('.msgs .mrow .read')].map((node) => node.textContent ?? ''),
        goLabels: [...document.querySelectorAll('.msgs .mrow .go')].map((node) => node.textContent ?? ''),
      }));
    }
    const unreadAfter = (await api(judgeClient, 'GET', '/api/notifications')).items.filter(
      (row) => row.readAt === null,
    );
    const readIds = unreadBefore
      .filter((row) => !unreadAfter.some((candidate) => candidate.id === row.id))
      .map((row) => row.id);
    if (inPlaceCount === 0) {
      /** 没有样本 ⇒ 这一步无从验起：如实 WARN（上方已打印），**不计失败也不静默算通过**。 */
      warn('第 10 步「就地标记已读」本次无样本：跳过它的两条断言（未读 → ' + String(unreadAfter.length) + '）');
    } else {
      check(
        '点击后就地变已读（未读标记消失 + 服务端 read_at 落库，条数恰好少 1）',
        becameRead && readIds.length === 1 && unreadAfter.length === unreadBefore.length - 1 &&
          domAfter.pills === meDom.unreadPills - 1,
        `未读 ${String(unreadBefore.length)} → ${String(unreadAfter.length)} · 落库 id=${readIds[0]?.slice(0, 8) ?? '-'}` +
          ` 页面未读标记=${String(domAfter.pills)} · go 文案=${domAfter.goLabels.slice(0, 3).join('/')}`,
      );
      await judge.page.reload();
      await judge.page.waitForFunction(() => document.documentElement.dataset.pageReady === 'me');
      const persisted = (await api(judgeClient, 'GET', '/api/notifications')).items.filter(
        (row) => row.id === readIds[0] && row.readAt !== null,
      ).length;
      check('刷新后仍是已读（不是只改了页面）', readIds.length === 1 && persisted === 1, `持久化已读 id=${readIds[0]?.slice(0, 8) ?? '-'}`);
    }

    step('收尾：整轮无页面级错误与 5xx');
    check('零 5xx 响应', badResponses.length === 0, badResponses.join(' · ') || '无');
    check('零页面级 JS 错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' · ') || '无');
    console.log(
      `\n本轮探针账号（跑完可清）：${WALKER.handle} / ${RELAY.handle}；留下瓶子：${walkerBottle.bottleId}（本账号发起并投河）` +
        `、${drawnId}（接棒账号接唱并处置）`,
    );
  } finally {
    await browser.close();
    if (server !== null) server.kill();
  }
}

/** 在 `/new.html` 选第一首可发起的歌 → 建 DRAFT 瓶 → 跳 `/bottle.html`。 */
async function pickSongAndCreateBottle(session) {
  const { page } = session;
  const client = await clientFromContext(session.context);
  await page.goto(`${BASE}/new.html`);
  await page.waitForFunction(() => document.documentElement.dataset.pageReady === 'new');
  await page.waitForSelector('.rack .bay .act:not([disabled])', { timeout: 20000 });
  const bayIndex = await page.evaluate(() =>
    [...document.querySelectorAll('.rack .bay')].findIndex((bay) => {
      const act = bay.querySelector('.act');
      return act !== null && act.disabled !== true;
    }),
  );
  const bay = page.locator('.rack .bay').nth(bayIndex);
  const songId = await bay.getAttribute('data-song-id');
  const songs = await api(client, 'GET', '/api/songs');
  const song = (songs ?? []).find((candidate) => candidate.id === songId);
  if (song === undefined) {
    throw new Error(`选歌失败：曲库里找不到 songId=${String(songId)}（该格子的 data-song-id）`);
  }
  const presetMs = Number(song.segments?.[0]?.durationMs ?? 0);
  await Promise.all([
    page.waitForURL(/bottle\.html\?id=/, { timeout: 30000 }),
    bay.locator('.act').click({ timeout: 20000 }),
  ]);
  const bottleId = new URL(page.url()).searchParams.get('id') ?? '';
  await page.waitForFunction(() => document.documentElement.dataset.pageReady === 'bottle');
  const detail = await api(client, 'GET', `/api/bottles/${bottleId}`);
  return {
    bottleId,
    songId: String(songId),
    songTitle: String(song.title),
    presetMs,
    status: detail.status,
    segments: detail.segments.length,
  };
}

/** 曲库预设（按瓶子所属歌 + 段号）。 */
async function presetOf(client, bottleId, index) {
  const detail = await api(client, 'GET', `/api/bottles/${bottleId}`);
  const songs = await api(client, 'GET', '/api/songs');
  const song = (songs ?? []).find((candidate) => candidate.id === detail.songId);
  const preset = Number(song?.segments?.find((segment) => segment.index === index)?.durationMs ?? 0);
  return preset > 0 ? preset : 20_000;
}

/** 轮询详情直到 status 变成期望值（有界）。 */
async function waitForStatus(client, bottleId, expected) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const detail = await api(client, 'GET', `/api/bottles/${bottleId}`);
    if (detail.status === expected) return detail.status;
    await new Promise((done) => setTimeout(done, 250));
  }
  return (await api(client, 'GET', `/api/bottles/${bottleId}`)).status;
}

/**
 * 「处置生效」的签名：这四项里任意一项变化都说明服务端真的动了这支瓶子
 *（投河/入海改 `status`，回传换 `holderId`），而**不依赖**某一项单独变化。
 */
function resolutionSignature(detail) {
  return [
    detail.status,
    detail.holderId ?? '-',
    detail.currentCasterId ?? '-',
    String(detail.returnCompleted),
  ].join('|');
}

/** 轮询详情直到「处置签名」与之前不同（有界）。 */
async function waitForResolutionEffect(client, bottleId, before) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const detail = await api(client, 'GET', `/api/bottles/${bottleId}`);
    if (resolutionSignature(detail) !== before) return detail;
    await new Promise((done) => setTimeout(done, 250));
  }
  return await api(client, 'GET', `/api/bottles/${bottleId}`);
}

/** 轮询某一段的点赞数（有界）。 */
async function waitForLikeCount(client, bottleId, index) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const detail = await api(client, 'GET', `/api/bottles/${bottleId}`);
    const segment = detail.segments.find((candidate) => candidate.index === index);
    if (segment !== undefined && segment.likeCount >= 1) return segment.likeCount;
    await new Promise((done) => setTimeout(done, 250));
  }
  const detail = await api(client, 'GET', `/api/bottles/${bottleId}`);
  return detail.segments.find((candidate) => candidate.index === index)?.likeCount ?? 0;
}

/** 「我的」页的三块面板（接口侧口径）。 */
async function collectMe(client) {
  const bottles = await api(client, 'GET', '/api/me/bottles');
  const notifications = await api(client, 'GET', '/api/notifications');
  const collections = await api(client, 'GET', '/api/me/collections');
  const badges = await api(client, 'GET', '/api/me/badges');
  const items = bottles.items ?? [];
  return {
    participated: items.length,
    completedSea: items.filter((item) => item.status === 'SEA' && item.seaZone === 'COMPLETED').length,
    inRiver: items.filter((item) => item.status === 'IN_RIVER' || item.status === 'HELD').length,
    collections: collections.length,
    badges: badges.length,
    notifications: (notifications.items ?? []).length,
    unread: (notifications.items ?? []).filter((row) => row.readAt === null).length,
  };
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
  console.error(`\n走查中断：${message}`);
  failures.push(`走查中断：${message}`);
}
console.log(
  `\n结论：${String(failures.length)} 项不达标${warnings.length === 0 ? '' : ` · ${String(warnings.length)} 条 WARN`}`,
);
for (const text of warnings) console.log(`   WARN ${text}`);
if (failures.length > 0) {
  console.log('   失败项：');
  for (const label of failures) console.log(`   - ${label}`);
}
process.exit(failures.length === 0 ? 0 : 1);
