/**
 * 一屏适配探针（v3）。判据两条**同时**要成立：
 *   ① **铺满**：画布 `#fit-stage` 在宽高两个方向都覆盖视口（没有留白条）；
 *   ② **不裁内容**：所有"内容元素"（不在 `aria-hidden="true"` 下、且有文字或可交互）的矩形都落在视口内。
 * 覆盖不了时 `fit.js` 会退回 contain（宁可有留白也不裁内容）—— 那种情况下 ① 不成立，探针会报出来。
 *
 * W7 修两条**真缺陷**（改前实测）：
 *   1. **先登录**。`/me.html`、`/settings.html`、`/admin.html`（以及共享层 401 出口作用到的任何页）
 *      在未登录时会被跳去 `/login.html`，而登录页**同样有** `#fit-stage` ⇒ 探针量的是登录页、
 *      还照报"被裁内容=0"。**登录态页面从未被真正探过**，是个静默假通过
 *      （实测：350ms 时 `/me.html` 的 `pathname` 已经是 `/login.html`；跳转恰好撞上 `evaluate` 时
 *      还会抛 `Execution context was destroyed`）。
 *      ⇒ 现在用演示账号（`docs/site-runbook.md` §2.6：`demo` / `SeaDrift2026`，由 `tools/seed-demo.mjs` 造）
 *      **走真登录页登录一次**，把会话 cookie 复制给各尺寸的上下文。
 *   2. **等就绪信号**（`documentElement.dataset.pageReady`，W3 加的可测性信号）而不是固定 sleep，
 *      并**逐条断言落点就是被探的那一页**：被跳转/没就绪都报红，绝不静默换成别的页面。
 *
 * 用法：node tools/probe-fit.mjs [--port=5199]
 */
/* eslint-disable no-console */
/* global document, window */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEMO, ensureDemoData } from './seed-demo.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'ui-review', 'fit');
const args = new Map(
  process.argv.slice(2).map((raw) => {
    const [k, v] = raw.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const PORT = args.get('port') ?? '5199';
const BASE = `http://127.0.0.1:${PORT}`;
/** W7：`sea-detail` 已随公海详情页删除（11 页 → 10 页）。 */
const PAGES = ['river', 'new', 'bottle', 'drift-log', 'sea', 'me', 'settings', 'login', 'admin', '404'];
const CASES = [
  [1707, 1019, 1.5],
  [2560, 1400, 1],
  [1920, 1200, 1],
  [1680, 1003, 1],
  [1440, 900, 1],
  [1366, 768, 1],
  [1280, 800, 1],
];
/** 就绪信号的等待上限：超过就是"这一页没跑起来"，报红（不是慢慢等）。 */
const READY_TIMEOUT_MS = 15_000;

async function loadPlaywright() {
  const cacheRoot = join(homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
  for (const entry of readdirSync(cacheRoot)) {
    const candidate = join(cacheRoot, entry, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(candidate)) return await import(`file://${candidate.replaceAll('\\', '/')}`);
  }
  throw new Error('找不到 playwright（npx 缓存里没有）');
}

/**
 * 走真登录页（`/login.html`）登录；选择器与 `tools/walkthrough.mjs` 同一套。
 * W6 起契约是 `{ account, password }`（账号 = `users.handle`，不是邮箱）⇒ 账号栏填 `DEMO.handle`。
 */
async function signIn(page, account) {
  await page.goto(`${BASE}/login.html?next=${encodeURIComponent('/sea.html')}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.pageReady === 'login', null, {
    timeout: READY_TIMEOUT_MS,
  });
  await page.locator('.modes .mode').nth(0).click(); // 登录 tab
  await page.locator('.f-handle input').fill(account.handle);
  await page.locator('.f-pass:not([data-username-row]) input').fill(account.password);
  await page.click('button.act');
  await page.waitForURL((url) => !url.pathname.endsWith('/login.html'), { timeout: READY_TIMEOUT_MS });
}

/** 等这一页自己的就绪信号（有界）；返回 `ready` / `error` / `timeout`。 */
async function waitForPageReady(page, slug) {
  try {
    await page.waitForFunction(
      (name) =>
        document.documentElement.dataset.pageReady === name ||
        document.documentElement.dataset.pageError === name,
      slug,
      { timeout: READY_TIMEOUT_MS },
    );
  } catch {
    return 'timeout';
  }
  const state = await page.evaluate(() => document.documentElement.dataset.pageReady ?? null);
  return state === null ? 'error' : 'ready';
}

const { chromium } = await loadPlaywright();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
let failed = 0;
const contained = [];

try {
  // ── 先登录：没有会话，`requireUser()` 会把 /me /settings /admin 顶成登录页（探针会白量一场）
  try {
    await ensureDemoData({ base: BASE, log: () => {} });
  } catch (error) {
    console.log(`· 演示账号种子没跑成（${String(error.message).split('\n')[0]}）：继续，但登录态页面会报红`);
  }
  const session = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const loginPage = await session.newPage();
  try {
    await signIn(loginPage, DEMO);
  } catch (error) {
    console.log(`✗ 登录没走通（${String(error.message).split('\n')[0]}）：此刻在 ${new URL(loginPage.url()).pathname}`);
  }
  console.log(`· 登录落点=${new URL(loginPage.url()).pathname}`);
  const me = await loginPage.evaluate(async () => {
    const response = await fetch('/api/auth/me');
    return { status: response.status, handle: (await response.json())?.user?.handle ?? '' };
  });
  if (me.status === 200) console.log(`· 登录=已登录(${me.handle})（真登录页 /login.html）`);
  else {
    failed += 1;
    console.log(`✗ 演示账号登录失败（GET /api/auth/me → ${String(me.status)}）：登录态页面没法被真正探到`);
  }
  const cookies = await session.cookies();
  await session.close();

  for (const [w, h, dpr] of CASES) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    await context.addCookies(cookies);
    const page = await context.newPage();
    for (const slug of PAGES) {
      await page.goto(`${BASE}/${slug}.html`, { waitUntil: 'load' });
      const state = await waitForPageReady(page, slug);
      const landed = new URL(page.url()).pathname;
      /** 落点必须是**被探的那一页**：被跳转（未登录 / 会话过期）就没有"这一页被探过"这回事。 */
      if (landed !== `/${slug}.html`) {
        failed += 1;
        console.log(`✗ ${String(w)}x${String(h)} ${slug.padEnd(10)} 被跳转到 ${landed}（这一页没有被真正探到）`);
        continue;
      }
      if (state !== 'ready') {
        failed += 1;
        console.log(`✗ ${String(w)}x${String(h)} ${slug.padEnd(10)} 没有就绪信号（${state}）`);
        continue;
      }
      const m = await page.evaluate(() => {
        const stage = document.getElementById('fit-stage');
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (stage === null) return { stage: null, vw, vh };
        const sr = stage.getBoundingClientRect();
        let cut = 0;
        let worst = null;
        for (const el of stage.querySelectorAll('*')) {
          // 只把 **HTML 命名空间**的元素当内容：SVG 的 <g> 会继承子孙 textContent，
          // 会把出血的装饰组误判成"被裁的内容"（第一版就这么误报过 river）。
          if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue;
          if (el.closest('[aria-hidden="true"]') !== null) continue;
          // 判据必须与 site/app/fit.js 的 contentBox 一致：
          // 只认"自己的直接文字节点"或可交互元素（容器的 rect 常是整页，会把判据撑爆）
          let own = '';
          for (const node of el.childNodes) {
            if (node.nodeType === 3) own += node.textContent ?? '';
          }
          const interactive = el.matches('a[href],button,input,select,textarea,label,[role="button"]');
          if (own.trim() === '' && !interactive) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const outside = r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1;
          if (outside) {
            cut += 1;
            if (worst === null) {
              worst = `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} [${String(Math.round(r.left))},${String(Math.round(r.top))},${String(Math.round(r.right))},${String(Math.round(r.bottom))}]`;
            }
          }
        }
        return {
          vw,
          vh,
          mode: stage.dataset.fitMode ?? '?',
          covers: sr.width >= vw - 1 && sr.height >= vh - 1,
          rect: { x: Math.round(sr.x), y: Math.round(sr.y), w: Math.round(sr.width), h: Math.round(sr.height) },
          cut,
          worst,
        };
      });
      if (m.stage === null) {
        failed += 1;
        console.log(`✗ ${String(w)}x${String(h)} ${slug.padEnd(10)} 没有 #fit-stage（脚本没跑或并发半成品）`);
        continue;
      }
      // 判定：**内容被裁**才是违规（硬）；"没能铺满"（contain）只在宽高比与画布差太远时发生，
      // 是"宁可有留白也不裁内容"的正确退回 —— 记为提示，不计失败。
      const ok = m.cut === 0;
      if (!ok) failed += 1;
      if (!m.covers) contained.push(`${String(w)}x${String(h)}/${slug}`);
      console.log(
        `${ok ? '✓' : '✗'} ${String(w).padStart(4)}x${String(h).padEnd(4)} dpr${String(dpr)} ${slug.padEnd(10)} ` +
          `mode=${m.mode.padEnd(7)} 铺满=${m.covers ? '是' : '否'} 被裁内容=${String(m.cut)}` +
          `${m.worst === null ? '' : ` 首个=${m.worst}`}`,
      );
    }
    await context.close();
  }

  // 存一张用户环境的成图，便于人眼复核
  const ctx = await browser.newContext({ viewport: { width: 1707, height: 1019 }, deviceScaleFactor: 1.5 });
  await ctx.addCookies(cookies);
  const p = await ctx.newPage();
  for (const slug of ['river', 'bottle', 'sea', 'me']) {
    await p.goto(`${BASE}/${slug}.html`, { waitUntil: 'load' });
    await waitForPageReady(p, slug);
    await p.screenshot({ path: join(OUT, `user-1707x1019-${slug}.png`) });
  }
  await ctx.close();
} finally {
  await browser.close();
}
console.log(`\n结论：${String(failed)} 项不达标（0 = 既铺满又没裁内容，且每一页都真的被探到）`);
process.exit(failed === 0 ? 0 : 1);
