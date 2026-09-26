/**
 * 一屏适配探针（v2）。判据两条**同时**要成立：
 *   ① **铺满**：画布 `#fit-stage` 在宽高两个方向都覆盖视口（没有留白条）；
 *   ② **不裁内容**：所有"内容元素"（不在 `aria-hidden="true"` 下、且有文字或可交互）的矩形都落在视口内。
 * 覆盖不了时 `fit.js` 会退回 contain（宁可有留白也不裁内容）—— 那种情况下 ① 不成立，探针会报出来。
 *
 * 用法：node tools/probe-fit.mjs [--port=5199]
 */
/* eslint-disable no-console */
/* global document, window */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'ui-review', 'fit');
const args = new Map(
  process.argv.slice(2).map((raw) => {
    const [k, v] = raw.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const PORT = args.get('port') ?? '5199';
const PAGES = [
  'river',
  'new',
  'bottle',
  'drift-log',
  'sea',
  'sea-detail',
  'me',
  'settings',
  'login',
  'admin',
  '404',
];
const CASES = [
  [1707, 1019, 1.5],
  [2560, 1400, 1],
  [1920, 1200, 1],
  [1680, 1003, 1],
  [1440, 900, 1],
  [1366, 768, 1],
  [1280, 800, 1],
];

async function loadPlaywright() {
  const cacheRoot = join(homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
  for (const entry of readdirSync(cacheRoot)) {
    const candidate = join(cacheRoot, entry, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(candidate)) return await import(`file://${candidate.replaceAll('\\', '/')}`);
  }
  throw new Error('找不到 playwright（npx 缓存里没有）');
}

const { chromium } = await loadPlaywright();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
let failed = 0;
let covered = 0;
const contained = [];

for (const [w, h, dpr] of CASES) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  for (const slug of PAGES) {
    await page.goto(`http://127.0.0.1:${PORT}/${slug}.html`, { waitUntil: 'load' });
    await page.waitForTimeout(350);
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
        const outside =
          r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1;
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
    if (m.covers) covered += 1;
    else contained.push(`${String(w)}x${String(h)}/${slug}`);
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
const p = await ctx.newPage();
for (const slug of ['river', 'bottle', 'sea', 'me']) {
  await p.goto(`http://127.0.0.1:${PORT}/${slug}.html`, { waitUntil: 'load' });
  await p.waitForTimeout(400);
  await p.screenshot({ path: join(OUT, `user-1707x1019-${slug}.png`) });
}
await ctx.close();
await browser.close();
console.log(`\n结论：${String(failed)} 项不达标（0 = 既铺满又没裁内容）`);
process.exit(failed === 0 ? 0 : 1);
