/**
 * 一屏适配探针（v4）。两种页面、两套判据，**同一张表**里逐条报：
 *
 * A. **等比缩放页**（没补丁，`fit.js` 装的 `#fit-stage`）——判据同 v3：
 *    ① 铺满：`#fit-stage` 覆盖视口；② 不裁内容：有文字/可交互的元素的矩形都在视口内。
 * B. **流体页**（有 `site/patches/<slug>.css`，见 `docs/deploy-plan-html.md` §20）——判据四条：
 *    ① 不横向滚动（文档 scrollWidth/Height 不超视口，且 scrollX/Y 为 0）；
 *    ② 不裁内容（同 A 的口径，但对 `document.body`，且排除共享层浮层）；
 *    ③ 背景铺满：存在一个铺满视口的背景层（或 body 底色不透明）；
 *    ④ 主要构图元素不重叠：`MAIN[slug]` 里两两（非父子）相交面积不得超过小者的 25%。
 *
 * 覆盖不了时 `fit.js` 会退回 contain（宁可有留白也不裁内容）—— 那种情况下 ① 不成立，探针会报出来。
 *
 * W5-A 新增：`FLUID_REQUIRED` 的 5 页**必须**走流体版式（没补丁 = 报红），
 * 因为那 5 页是本次交付的验收对象；其余页面两种模式都合法（W5-B 逐页迁移）。
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
/* global document, getComputedStyle, window */
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
/** `--only=river,sea`：只探这几页（改一页补丁时不用等 10 页 × 8 档）。 */
const ONLY = (args.get('only') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s !== '');
const SIZES = (args.get('sizes') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s !== '')
  .map((s) => s.split('x').map(Number));
/** W7：`sea-detail` 已随公海详情页删除（11 页 → 10 页）。 */
const PAGES = ['river', 'new', 'bottle', 'drift-log', 'sea', 'me', 'settings', 'login', 'admin', '404'];
/** W5-A：这 5 页走"发布版补丁"的流体版式（有 `site/patches/<slug>.css` 才能通过）。 */
const FLUID_REQUIRED = ['river', 'new', 'bottle', 'drift-log', 'sea'];
/**
 * 主要构图元素（流体页的"不重叠"判据只查这些）——**每页一份显式清单**，不猜。
 * 父子对（一个包住另一个）自动跳过：容器与内容天然相交，那不是重叠。
 */
const MAIN = {
  river: ['.ov', '.port', '.port .cap', 'footer'],
  new: ['header', '.tally', '.plate', '.states', '.bay', 'footer'],
  bottle: [
    'h1',
    '.work',
    '.metaRow',
    '.note',
    '.maker',
    '.segNum',
    '.segLab',
    '.cap',
    '.gapBox',
    '.listenCol',
    '.destCol',
    '.bottom',
  ],
  // 注意：这里的每一项都是"**内容**盒"，不能用 `header` 这种整行块级容器 ——
  // 它的矩形横跨整个版心，会把右上角的内容判成"重叠"（假阳性）。同理见 fit.js 的 contentBox。
  // 页面里这类块级容器已在补丁里加了 `width:fit-content`（量出来就是它自己的内容宽），
  // 所以 `header` 仍可入列。
  'drift-log': ['header', '.hright', '.key', '.lathe', '.roll'],
  sea: ['.hero', '.zones', '.bottle', '.entry', '.foot'],
};
const CASES = [
  [1707, 1019, 1.5],
  [2560, 1400, 1],
  [1920, 1200, 1],
  [1680, 1003, 1],
  [1440, 900, 1],
  [1366, 768, 1],
  [1280, 800, 1],
  [1280, 720, 1],
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

  for (const [w, h, dpr] of (SIZES.length > 0 ? SIZES.map(([a, b]) => [a, b, 1]) : CASES)) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    await context.addCookies(cookies);
    const page = await context.newPage();
    for (const slug of (ONLY.length > 0 ? PAGES.filter((p) => ONLY.includes(p)) : PAGES)) {
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
      const m = await page.evaluate((mainSelectors) => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        /**
         * 内容元素 = 不在 `aria-hidden` 下、且**自己有直接文字节点或可交互**的 HTML 元素。
         * 与 `site/app/fit.js` 的 contentBox 同口径（容器 rect 常是整页，会把判据撑爆）。
         * 排除共享层两个固定浮层：它们贴视口边缘落位，与页面构图无关。
         */
        const contents = (root) => {
          const out = [];
          for (const el of root.querySelectorAll('*')) {
            if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue;
            if (el.closest('[aria-hidden="true"]') !== null) continue;
            if (el.closest('.top-nav, .app-state') !== null) continue;
            let own = '';
            for (const node of el.childNodes) {
              if (node.nodeType === 3) own += node.textContent ?? '';
            }
            const interactive = el.matches('a[href],button,input,select,textarea,label,[role="button"]');
            if (own.trim() === '' && !interactive) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            out.push({ el, r });
          }
          return out;
        };
        const describe = (el, r) =>
          `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ` +
          `[${String(Math.round(r.left))},${String(Math.round(r.top))},${String(Math.round(r.right))},${String(Math.round(r.bottom))}]`;

        const stage = document.getElementById('fit-stage');
        if (stage !== null) {
          // ── A. 等比缩放页（今天的口径，一字不改）
          let cut = 0;
          let worst = null;
          for (const { el, r } of contents(stage)) {
            if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) {
              cut += 1;
              worst ??= describe(el, r);
            }
          }
          const sr = stage.getBoundingClientRect();
          return {
            mode: 'fit',
            vw,
            vh,
            fitMode: stage.dataset.fitMode ?? '?',
            covers: sr.width >= vw - 1 && sr.height >= vh - 1,
            cut,
            worst,
          };
        }

        // ── B. 流体页（有 site/patches/<slug>.css）
        const fluid = document.documentElement.dataset.fluid ?? null;
        if (fluid === null) return { mode: 'none', vw, vh };

        // ① 不横向滚动：文档不得比视口大，且当前不在滚动位置上
        const scroll = {
          w: document.documentElement.scrollWidth,
          h: document.documentElement.scrollHeight,
          x: window.scrollX,
          y: window.scrollY,
          ok:
            document.documentElement.scrollWidth <= vw + 1 &&
            document.documentElement.scrollHeight <= vh + 1 &&
            window.scrollX === 0 &&
            window.scrollY === 0,
        };

        // ② 不裁内容：视口外的内容元素。**例外**：落在"自己会滚的容器"（overflow-y auto/scroll）里的
        //    行不是被裁掉的内容 —— 滚一下就能看到。这类**单独计数并打出来**（标记，不静默吞掉）。
        let cut = 0;
        let worst = null;
        let scrollableRows = 0;
        for (const { el, r } of contents(document.body)) {
          if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) {
            let scroller = null;
            for (let p = el.parentElement; p !== null && p !== document.body; p = p.parentElement) {
              const oy = getComputedStyle(p).overflowY;
              if (oy === 'auto' || oy === 'scroll') {
                scroller = p;
                break;
              }
            }
            if (scroller !== null) {
              scrollableRows += 1;
              continue;
            }
            cut += 1;
            worst ??= describe(el, r);
          }
        }

        // ③ 背景铺满：存在一个铺满视口的层（或有背景的 html/body）
        const bodyBg = getComputedStyle(document.body).backgroundColor;
        const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
        const opaque = (c) => c !== '' && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
        let coverLayer = opaque(bodyBg) || opaque(htmlBg) ? 'body/html 底色' : null;
        for (const el of document.querySelectorAll('body > *, body > * > *')) {
          if (el.closest('.top-nav, .app-state') !== null) continue;
          const cs = getComputedStyle(el);
          if (cs.position !== 'absolute' && cs.position !== 'fixed') continue;
          const r = el.getBoundingClientRect();
          if (r.left > 1 || r.top > 1 || r.right < vw - 1 || r.bottom < vh - 1) continue;
          if (cs.backgroundImage === 'none' && !opaque(cs.backgroundColor)) continue;
          coverLayer = `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`;
          break;
        }

        // ④ 主要构图元素不重叠（父子对跳过：容器包住内容是构图，不是重叠）
        const overlaps = [];
        if (mainSelectors.length > 0) {
          const picked = [];
          for (const sel of mainSelectors) {
            for (const el of document.querySelectorAll(sel)) {
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              picked.push({ sel, el, r });
            }
          }
          for (let i = 0; i < picked.length; i += 1) {
            for (let j = i + 1; j < picked.length; j += 1) {
              const a = picked[i];
              const b = picked[j];
              if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
              const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
              const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
              if (ox <= 0 || oy <= 0) continue;
              const ratio = (ox * oy) / Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
              if (ratio > 0.25) {
                overlaps.push(`${a.sel} x ${b.sel} 重叠${String(Math.round(ratio * 100))}%`);
              }
            }
          }
        }

        return {
          mode: 'fluid',
          fluid,
          vw,
          vh,
          scroll,
          cut,
          worst,
          scrollableRows,
          coverLayer,
          overlaps,
          hasMain: mainSelectors.length > 0,
        };
      }, MAIN[slug] ?? []);

      if (m.mode === 'fit') {
        // 判定：**内容被裁**才是违规（硬）；"没能铺满"（contain）只在宽高比与画布差太远时发生，
        // 是"宁可有留白也不裁内容"的正确退回 —— 记为提示，不计失败。
        const ok = m.cut === 0;
        if (!ok) failed += 1;
        if (!m.covers) contained.push(`${String(w)}x${String(h)}/${slug}`);
        console.log(
          `${ok ? '✓' : '✗'} ${String(w).padStart(4)}x${String(h).padEnd(4)} dpr${String(dpr)} ${slug.padEnd(10)} ` +
            `mode=${m.fitMode.padEnd(7)} 铺满=${m.covers ? '是' : '否'} 被裁内容=${String(m.cut)}` +
            `${m.worst === null ? '' : ` 首个=${m.worst}`}`,
        );
        if (FLUID_REQUIRED.includes(slug)) {
          failed += 1;
          console.log(
            `   ✗ ${slug} 应在流体版式（site/patches/${slug}.css 存在即生效），但它仍在等比缩放 —— 补丁没被加载`,
          );
        }
        continue;
      }
      if (m.mode === 'none') {
        failed += 1;
        console.log(
          `✗ ${String(w)}x${String(h)} ${slug.padEnd(10)} 既没有 #fit-stage 也没有流体补丁信号（脚本没跑或并发半成品）`,
        );
        continue;
      }

      const problems = [];
      if (!m.scroll.ok) {
        problems.push(
          `文档超出视口 ${String(m.scroll.w)}x${String(m.scroll.h)} > ${String(m.vw)}x${String(m.vh)}` +
            `（scroll=${String(m.scroll.x)},${String(m.scroll.y)}）`,
        );
      }
      if (m.cut !== 0) problems.push(`被裁内容=${String(m.cut)} 首个=${m.worst ?? ''}`);
      if (m.coverLayer === null) problems.push('找不到铺满视口的背景层');
      if (m.overlaps.length > 0) problems.push(`重叠：${m.overlaps.slice(0, 3).join('；')}`);
      const ok = problems.length === 0;
      if (!ok) failed += 1;
      console.log(
        `${ok ? '✓' : '✗'} ${String(w).padStart(4)}x${String(h).padEnd(4)} dpr${String(dpr)} ${slug.padEnd(10)} ` +
          `mode=流体    不滚动=${m.scroll.ok ? '是' : '否'} 被裁内容=${String(m.cut)} ` +
          `铺满=${m.coverLayer === null ? '否' : m.coverLayer} 重叠=${String(m.overlaps.length)}` +
          `${m.scrollableRows === 0 ? '' : ` 内部可滚动行=${String(m.scrollableRows)}`}` +
          `${m.hasMain ? '' : '（无构图清单：重叠判定跳过）'}` +
          `${ok ? '' : `\n   ✗ ${problems.join('；')}`}`,
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
console.log(
  `\n结论：${String(failed)} 项不达标（0 = 每一页都真的被探到，且：等比缩放页不裁内容、流体页不滚动/不裁内容/铺满/构图不重叠）`,
);
process.exit(failed === 0 ? 0 : 1);
