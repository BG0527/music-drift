/**
 * 一屏适配探针：在多个窗口尺寸下打开站点页面，断言
 *   ① 画布 `#fit-stage` 的**可见范围完整落在视口内**（没有哪一边被切）；
 *   ② 页面无横向/纵向滚动（`scrollWidth/Height` 不超视口）；
 *   ③ 截图存盘供人眼看。
 *
 * 用法：node tools/probe-fit.mjs [--port=5199] [--pages=bottle,river,sea...]
 * 前置：站点服务器已起（tools/site-server.mjs）。
 */
/* eslint-disable no-console */
/* global document, window */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'docs', 'ui-review', 'fit');
const args = new Map(
  process.argv.slice(2).map((raw) => {
    const [k, v] = raw.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const PORT = args.get('port') ?? '5199';
const PAGES = (args.get('pages') ?? 'river,bottle,sea,login,me').split(',');
const VIEWPORTS = [
  [2560, 1400],
  [1920, 1200],
  [1680, 1003],
  [1440, 900],
  [1366, 768],
  [1280, 800],
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
mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
let failed = 0;

for (const [w, h] of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (const slug of PAGES) {
    const url = `http://127.0.0.1:${PORT}/${slug === 'river' ? 'river' : slug}.html`;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const stage = document.getElementById('fit-stage');
      const r = stage === null ? null : stage.getBoundingClientRect();
      const de = document.documentElement;
      return {
        hasStage: stage !== null,
        rect: r === null ? null : { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        vw: window.innerWidth,
        vh: window.innerHeight,
        sw: de.scrollWidth,
        sh: de.scrollHeight,
        nav: document.querySelector('[class*="demo-nav"]') !== null,
      };
    });
    const fits =
      m.rect !== null &&
      m.rect.x >= -1 &&
      m.rect.y >= -1 &&
      m.rect.x + m.rect.w <= m.vw + 1 &&
      m.rect.y + m.rect.h <= m.vh + 1;
    const noScroll = m.sw <= m.vw + 1 && m.sh <= m.vh + 1;
    const ok = m.hasStage && fits && noScroll;
    if (!ok) failed += 1;
    console.log(
      `${ok ? '✓' : '✗'} ${String(w).padStart(4)}x${String(h).padEnd(4)} ${slug.padEnd(7)} ` +
        `stage=${m.rect === null ? '无' : `${String(m.rect.w)}x${String(m.rect.h)}@${String(m.rect.x)},${String(m.rect.y)}`} ` +
        `视口=${String(m.vw)}x${String(m.vh)} 滚动=${String(m.sw)}x${String(m.sh)} 导航=${m.nav ? '有' : '无'}`,
    );
    if (w === 1680 && h === 1003) {
      await page.screenshot({ path: join(OUT_DIR, `fit-1680x1003-${slug}.png`) });
    }
    if (w === 2560 && h === 1400) {
      await page.screenshot({ path: join(OUT_DIR, `fit-2560x1400-${slug}.png`) });
    }
  }
  await context.close();
}

await browser.close();
console.log(`\n结论：${String(failed)} 项不达标（0 = 每个尺寸下都完整落在一屏内）`);
process.exit(failed === 0 ? 0 : 1);
