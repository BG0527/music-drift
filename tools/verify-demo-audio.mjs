/**
 * 演示音频体检（W8）—— 证明"点试听真的出声"，并给全库一个可复跑的判据。
 *
 * 判据（真解码，不是看文件头猜）：
 *   ① **演示账号自己瓶子**里的一段：打开 `/bottle.html?id=…`，点瓶身上的「听」+ 播放键，
 *      `<audio>.currentTime` 必须真的前进、`error` 必须为空、控制台不得出现 `DEMUXER_ERROR`；
 *   ② **公海完整作品**：打开 `/bottle.html?id=…`，点「试听全部」连播，
 *      同样断言 `currentTime` 前进，并且**跨段**（`currentSrc` 换成第 2 段）后继续前进；
 *   ③ **全库抽样**：按公海页序取前 N 支作品（= 评委最先看到的那些）＋演示账号参与过的全部作品，
 *      逐段拉 `GET /api/segments/:id/audio`，既判字节形态（有 `webm` DocType + `A_OPUS`），
 *      又让 **Chromium 自己**逐段 `loadedmetadata`（解不开会 `error`，正是 W8 要消灭的哑音频）。
 *
 * 归属口径（为什么有的行只是 WARN）：
 *   本轮的修复范围是 **seed 产的数据**（演示账号 + 陪练账号的瓶子）。别人的探针账号
 *   （如 `aamud*` / `ccmud*` / `smoke*` / `layoutmud*`）造的合成段**不在**修复范围（任务书禁止动），
 *   它们只会被报成 WARN 并列出 id —— 那不是"本次没修好"，是"不在本次范围"。
 *
 * 前置：API 在 8788。站点服务器本脚本**自己起**（已在跑则复用）并**跑完杀掉**（deploy-plan §15）。
 * 用法：node tools/verify-demo-audio.mjs [--port=5188] [--api-port=8788] [--sample=8]
 * 退出码：0 = 判据 ①②③ 全过；1 = 有 FAIL。
 */
/* eslint-disable no-console */
/* global Audio, document, window */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEMO, createApiClient } from './seed-demo.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(
  process.argv.slice(2).map((raw) => {
    const [key, value] = raw.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);
const PORT = Number(args.get('port') ?? 5188);
const API_PORT = Number(args.get('api-port') ?? 8788);
const SAMPLE = Number(args.get('sample') ?? 8);
const SITE = `http://127.0.0.1:${String(PORT)}`;
const API = `http://127.0.0.1:${String(API_PORT)}`;

const failures = [];
const warnings = [];
let pageErrors = [];

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

/** playwright 只从 npx 缓存里取（与 tools/walkthrough.mjs 同路径；本仓不登记该依赖）。 */
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

/** 站点服务器：已在跑就复用，否则本进程起来（跑完杀掉）——同一前台命令里起→测→收（§15）。 */
async function ensureSiteServer() {
  try {
    const response = await fetch(`${SITE}/healthz`);
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
      const response = await fetch(`${SITE}/healthz`);
      if (response.ok) return { server, reused: false };
    } catch {
      /* 还没起来 */
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`站点服务器没起来（${SITE}/healthz 一直不通）`);
}

/**
 * 字节形态判据：真 WebM/Opus 的 EBML 头里必有 DocType `webm`、
 * Tracks 里有 CodecID `A_OPUS`；W3 的合成体是"魔数 + 伪随机/零填充"，两者都搜不到。
 */
function classifyAudio(bytes) {
  const buffer = Buffer.from(bytes);
  const ebml =
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3;
  if (!ebml) return { kind: 'NOT_EBML', bytes: buffer.length, hasWebm: false, hasOpus: false };
  const text = buffer.toString('latin1');
  const hasWebm = text.includes('webm');
  const hasOpus = text.includes('A_OPUS');
  return {
    kind: hasWebm && hasOpus ? 'REAL_WEBM_OPUS' : 'SYNTHETIC_CONTAINER',
    bytes: buffer.length,
    hasWebm,
    hasOpus,
  };
}

/** 拉段音频字节。API 可能是 `tsx watch`（别的 agent 一改后端文件就重启）⇒ 连接错误要重试几次。 */
async function getBytes(url, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { status: response.status, contentType: response.headers.get('content-type'), bytes };
    } catch (error) {
      lastError = error;
      await new Promise((done) => {
        setTimeout(done, 400 * attempt);
      });
    }
  }
  throw new Error(`取音频失败（重试 ${String(attempts)} 次）：${url} —— ${String(lastError)}`);
}

/** 页面里逐段试解：`loadedmetadata` = 解码器认了；`error` = 就是 W8 要消灭的那种哑段。 */
async function probeSegmentsInBrowser(page, urls) {
  return await page.evaluate(async (list) => {
    const out = [];
    for (const url of list) {
      out.push(
        await new Promise((done) => {
          const audio = new Audio();
          audio.preload = 'auto';
          let settled = false;
          const finish = (stage) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            done({
              url,
              stage,
              errorCode: audio.error?.code ?? null,
              errorMessage: audio.error?.message ?? null,
              duration: Number.isFinite(audio.duration) ? audio.duration : null,
            });
          };
          const timer = setTimeout(() => {
            finish('timeout');
          }, 10_000);
          audio.addEventListener('error', () => {
            finish('error');
          });
          audio.addEventListener('loadedmetadata', () => {
            finish('loadedmetadata');
          });
          audio.src = url;
          audio.load();
        }),
      );
    }
    return out;
  }, urls);
}

/** 页面上可能有多个 `<audio>`（试听列 / 连播各自一个）：取"正在放的那个"，没有就取 currentTime 最大的。 */
async function readActiveAudio(page) {
  const all = await page.evaluate(() =>
    Array.from(document.querySelectorAll('audio')).map((audio) => ({
      currentTime: audio.currentTime,
      currentSrc: audio.currentSrc,
      paused: audio.paused,
      duration: Number.isFinite(audio.duration) ? audio.duration : null,
      errorCode: audio.error?.code ?? null,
      errorMessage: audio.error?.message ?? null,
      readyState: audio.readyState,
    })),
  );
  if (all.length === 0) return null;
  const playing = all.filter((item) => item.currentSrc !== '' && item.paused === false);
  const pool = playing.length > 0 ? playing : all;
  return pool.reduce((best, item) => (item.currentTime > best.currentTime ? item : best), pool[0]);
}

const { chromium } = await loadPlaywright();
const siteServer = await ensureSiteServer();
console.log(`站点：${SITE}（${siteServer.reused ? '复用已在跑的' : '本次起，跑完杀掉'}）  API：${API}`);

const api = createApiClient(API);
const logged = await api.request('POST', '/api/auth/login', {
  json: { account: DEMO.handle, password: DEMO.password },
});
if (logged.status !== 200) {
  console.error(`演示账号登录失败：HTTP ${String(logged.status)} ${logged.text.slice(0, 200)}`);
  process.exit(1);
}
console.log(`已用演示账号登录：${DEMO.handle}`);

const mine = await api.request('GET', '/api/me/bottles', {});
const myItems = Array.isArray(mine.body?.items) ? mine.body.items : [];
const seMine = myItems.filter((item) => item.status === 'SEA' && item.seaZone === 'COMPLETED');
const myOwn = myItems.filter((item) => item.role === 'INITIATOR');
console.log(
  `演示账号：参与过 ${String(myItems.length)} 支（完整入海 ${String(seMine.length)}）；` +
    `自己发起 ${String(myOwn.length)} 支`,
);

const sea = await fetch(`${API}/api/sea?seaZone=COMPLETED&limit=${String(SAMPLE)}`).then((r) => r.json());
const seaItems = Array.isArray(sea.items) ? sea.items : [];
console.log(`公海已完成区页序前 ${String(seaItems.length)} 支（评委最先看到的那些）`);

async function detailOf(bottleId) {
  const response = await api.request('GET', `/api/bottles/${encodeURIComponent(bottleId)}`, {});
  return response.body;
}

// ── ③ 全库抽样：字节形态 + 浏览器逐段试解 ────────────────────────────────
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
let code = 0;
try {
  const context = await browser.newContext();
  /**
   * 浏览器上下文必须**登录成演示账号**：`/bottle.html` 要靠会话才知道"我是谁、能看到哪些段"，
   * 未登录时页面只会渲染成游客态（`.cap` 一个都不出现）——那测的就不是评委看到的路径了。
   * `context.request` 与页面共用 cookie 罐。
   */
  const login = await context.request.post(`${SITE}/api/auth/login`, {
    data: { account: DEMO.handle, password: DEMO.password },
  });
  if (login.status() !== 200) {
    console.error(`浏览器上下文登录失败：HTTP ${String(login.status())}`);
    process.exit(1);
  }
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error.message ?? error)));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  await page.addInitScript(() => {
    window.__mediaErrors = [];
    document.addEventListener(
      'error',
      (event) => {
        const target = event.target;
        if (target !== null && typeof target === 'object' && target.tagName === 'AUDIO') {
          window.__mediaErrors.push({
            src: target.currentSrc || target.src,
            code: target.error?.code ?? null,
            message: target.error?.message ?? null,
          });
        }
      },
      true,
    );
  });

  step(`③ 全库抽样：页序前 ${String(seaItems.length)} 支 + 演示账号参与的全部作品，逐段试探`);
  const seaIds = new Set(seaItems.map((item) => item.id));
  const scannedIds = [...new Set([...seaItems.map((item) => item.id), ...seMine.map((item) => item.id)])];
  const rows = [];
  for (const bottleId of scannedIds) {
    const detail = await detailOf(bottleId);
    const segments = Array.isArray(detail?.segments) ? detail.segments : [];
    const urls = segments.map((segment) => `/api/segments/${encodeURIComponent(segment.id)}/audio`);
    const browserResults = await probeSegmentsInBrowser(page, urls.map((url) => `${SITE}${url}`));
    const parts = [];
    for (const [position, segment] of segments.entries()) {
      const fetched = await getBytes(`${API}${urls[position]}`);
      const shape = classifyAudio(fetched.bytes);
      const browserResult = browserResults[position];
      parts.push({ segment, shape, browserResult, status: fetched.status });
    }
    rows.push({
      bottleId,
      songTitle: detail?.songTitle ?? '?',
      inPageSample: seaIds.has(bottleId),
      seedScope: seMine.some((item) => item.id === bottleId),
      parts,
    });
  }

  let seedScopeSegments = 0;
  const outsideScope = [];
  for (const row of rows) {
    const real = row.parts.filter(
      (part) => part.shape.kind === 'REAL_WEBM_OPUS' && part.browserResult.stage === 'loadedmetadata',
    ).length;
    const bad = row.parts.length - real;
    const badge = row.seedScope ? 'SEED ' : 'OTHER';
    console.log(
      `  ${badge} ${row.bottleId.slice(0, 8)}…《${row.songTitle}》 段 ${String(row.parts.length)}` +
        ` · 可解码 ${String(real)} · 可疑 ${String(bad)}` +
        (row.parts.length > 0
          ? ` · 首段 ${String(row.parts[0].shape.bytes)}B/${row.parts[0].shape.kind}`
          : ''),
    );
    for (const part of row.parts) {
      const detailText =
        `${part.shape.kind} bytes=${String(part.shape.bytes)} ` +
        `browser=${part.browserResult.stage} errorCode=${String(part.browserResult.errorCode)}`;
      if (row.seedScope) {
        seedScopeSegments += 1;
        check(
          `seed 范围可解码：${row.bottleId.slice(0, 8)}… 第 ${String(part.segment.index)} 段`,
          part.shape.kind === 'REAL_WEBM_OPUS' && part.browserResult.stage === 'loadedmetadata',
          detailText,
        );
      } else if (part.shape.kind !== 'REAL_WEBM_OPUS' || part.browserResult.stage !== 'loadedmetadata') {
        outsideScope.push(`${row.bottleId.slice(0, 8)}…#${String(part.segment.index)}(${detailText})`);
      }
    }
  }
  if (outsideScope.length > 0) {
    warn(
      `不在本次修复范围（他人探针数据，任务书禁止改动）的合成/解不开的段 ${String(outsideScope.length)} 个：` +
        outsideScope.slice(0, 12).join('、') +
        (outsideScope.length > 12 ? ' …' : ''),
    );
  }
  console.log(
    `  抽样小结：seed 范围段 ${String(seedScopeSegments)} 个全部要求可解码；` +
      `页序体检 ${String(seaItems.length)} 支，其中 seed 范围 ${String(rows.filter((row) => row.seedScope).length)} 支`,
  );

  // ── ① 演示账号自己瓶子里的一段：点「听」+ 播放键，看 currentTime 是否真的前进 ──
  step('① 演示账号自己瓶子的一段（/bottle.html → 瓶身上的「听」→ 播放）');
  const ownBottle = myOwn[0] ?? null;
  if (ownBottle === null) {
    check('演示账号有自己发起的瓶子', false, '没有：先跑 node tools/seed-demo.mjs');
  } else {
    const ownDetail = await detailOf(ownBottle.id);
    const ownSegments = Array.isArray(ownDetail?.segments) ? ownDetail.segments : [];
    console.log(
      `  瓶子 ${ownBottle.id}（《${String(ownDetail?.songTitle ?? '?')}》，status=${String(ownDetail?.status)}，` +
        `可见段 ${String(ownSegments.length)}）`,
    );
    await page.goto(`${SITE}/bottle.html?id=${encodeURIComponent(ownBottle.id)}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__pageReady === 'bottle', null, { timeout: 20_000 }).catch(() => {});
    const listenLinks = page.locator('.cap .listen');
    await listenLinks
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => {
        /* 下面按 0 报 FAIL，并打页面文案 */
      });
    const listenCount = await listenLinks.count();
    console.log(`  瓶身上可点的「听」：${String(listenCount)} 个`);
    if (listenCount === 0) {
      const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300));
      check('演示账号自己瓶子有可试听的段', false, `瓶身上没有 .cap .listen；页面文案：${text}`);
    } else {
      /** 点瓶身上的「听」**本身就自动开播**（`selectSegment(index, {autoPlay:true})`）——
       * 再点一次 `.play` 反而是"暂停"，第一版就这么把自己测挂了。 */
      await listenLinks.first().click();
      const started = await page
        .waitForFunction(
          () => {
            const audio = document.querySelector('audio');
            return audio !== null && audio.paused === false && audio.currentTime > 0.4;
          },
          null,
          { timeout: 20_000 },
        )
        .then(() => true)
        .catch(() => false);
      const first = await readActiveAudio(page);
      await page.waitForTimeout(2_500);
      const second = await readActiveAudio(page);
      const advanced = second !== null && first !== null && second.currentTime > first.currentTime + 1.0;
      check(
        '自己瓶子的一段：currentTime 真的在前进',
        advanced,
        `currentTime ${String(first?.currentTime)} → ${String(second?.currentTime)} ` +
          `（src=…${String(second?.currentSrc).slice(-12)}，duration=${String(second?.duration)}，` +
          `paused=${String(second?.paused)}，开播信号=${started ? '是' : '否'}）`,
      );
      check(
        '自己瓶子的一段：没有 DEMUXER_ERROR / 解码错误',
        second?.errorCode === null && pageErrors.filter((text) => /DEMUXER|MEDIA_ERR/.test(text)).length === 0,
        `audio.error=${String(second?.errorCode)} ${String(second?.errorMessage)} ` +
          `consoleError=${JSON.stringify(pageErrors.slice(0, 3))}`,
      );
      await page.evaluate(() => {
        document.querySelectorAll('audio').forEach((audio) => {
          audio.pause();
        });
      });
    }
  }

  // ── ② 公海完整作品：试听全部（连播），断言 currentTime 前进 + 跨段后继续前进 ──
  step('② 公海完整作品：作品详情页（/bottle.html?id=…）→「试听全部」连播全部段');
  const seaTarget = seMine[0] ?? null;
  if (seaTarget === null) {
    check('演示账号参与过完整入海的作品', false, '没有：先跑 node tools/seed-demo.mjs');
  } else {
    const seaDetail = await detailOf(seaTarget.id);
    const seaSegments = Array.isArray(seaDetail?.segments) ? seaDetail.segments : [];
    console.log(
      `  作品 ${seaTarget.id}（《${String(seaDetail?.songTitle ?? '?')}》，段 ${String(seaSegments.length)}：` +
        `${seaSegments.map((segment) => segment.index).join('+')}）`,
    );
    pageErrors = [];
    /**
     * 作品详情页 = `/bottle.html?id=…`（公海列表现在直接把每支作品链到这里；
     * 站点在 W8 期间重构过，`sea-detail.html` 已被移除 ⇒ 这里跟着站点走）。
     * API 是 `tsx watch`（别的 agent 改后端会让它重启）⇒ 加载失败时重来一次，别把环境抖动记成页面缺陷。
     */
    let ready = false;
    for (let attempt = 1; attempt <= 3 && !ready; attempt += 1) {
      await page.goto(`${SITE}/bottle.html?id=${encodeURIComponent(seaTarget.id)}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__pageReady === 'bottle', null, { timeout: 20_000 }).catch(() => {});
      ready = await page
        .locator('.w4a-listenAll')
        .first()
        .waitFor({ timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      if (!ready) {
        const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200));
        console.log(`  第 ${String(attempt)} 次没等到「试听全部」按钮，重试（${text}）`);
      }
    }
    const playAll = page.locator('.w4a-listenAll').first();
    if (!ready) {
      check('作品详情页渲染出「试听全部」', false, JSON.stringify(pageErrors.slice(0, 3)));
    } else {
      await playAll.click();
      await page.waitForTimeout(1_500);
      const firstSample = await readActiveAudio(page);
      await page.waitForTimeout(2_500);
      const secondSample = await readActiveAudio(page);
      check(
        '公海作品：currentTime 真的在前进',
        secondSample !== null && secondSample.currentTime > firstSample.currentTime + 1.0,
        `currentTime ${String(firstSample?.currentTime)} → ${String(secondSample?.currentTime)} ` +
          `（src=…${String(firstSample?.currentSrc).slice(-12)}，duration=${String(secondSample?.duration)}）`,
      );
      check(
        '公海作品：没有 DEMUXER_ERROR / 解码错误',
        secondSample?.errorCode === null && pageErrors.filter((text) => /DEMUXER|MEDIA_ERR/.test(text)).length === 0,
        `audio.error=${String(secondSample?.errorCode)} consoleError=${JSON.stringify(pageErrors.slice(0, 3))}`,
      );

      // 跨段：连播会把 src 换到第 2 段，换段后必须继续前进（= 每一段都真能解）
      const firstSrc = firstSample?.currentSrc ?? '';
      const crossed = await page
        .waitForFunction(
          (previous) => {
            return Array.from(document.querySelectorAll('audio')).some(
              (audio) => audio.currentSrc !== '' && audio.currentSrc !== previous,
            );
          },
          firstSrc,
          { timeout: 30_000 },
        )
        .then(() => true)
        .catch(() => false);
      if (!crossed) {
        check('公海作品：连播跨到第 2 段', false, '30 秒内没有换段（可能第一段就解不开）');
      } else {
        const crossSample = await readActiveAudio(page);
        await page.waitForTimeout(2_500);
        const afterCross = await readActiveAudio(page);
        check(
          '公海作品：连播跨段后第 2 段仍在前进',
          afterCross !== null && afterCross.currentTime > crossSample.currentTime + 1.0,
          `换段后 currentTime ${String(crossSample?.currentTime)} → ${String(afterCross?.currentTime)} ` +
            `（src=…${String(crossSample?.currentSrc).slice(-12)}）`,
        );
      }
      console.log(`  「试听全部」按钮文案：${JSON.stringify(await playAll.textContent())}`);
      await playAll.click();
      const mediaErrorsInPage = await page.evaluate(() => window.__mediaErrors ?? []);
      check(
        '公海作品：页面捕获到的音频元素 error 事件为空',
        mediaErrorsInPage.length === 0,
        JSON.stringify(mediaErrorsInPage.slice(0, 3)),
      );
    }
  }
} catch (error) {
  code = 1;
  failures.push(`脚本异常：${error instanceof Error ? error.message : String(error)}`);
  console.error(`verify-demo-audio 异常：${error instanceof Error ? error.stack : String(error)}`);
} finally {
  await browser.close();
  if (siteServer.server !== null) siteServer.server.kill();
}

console.log('');
console.log(`结论：${failures.length === 0 ? '0 项不达标' : `${String(failures.length)} 项不达标`}`);
for (const label of failures) console.log(`  FAIL  ${label}`);
for (const text of warnings) console.log(`  WARN  ${text}`);
if (failures.length > 0) code = 1;
process.exit(code);
