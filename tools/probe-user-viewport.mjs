/**
 * 按"用户真实环境"复现：CSS 视口 1707×1019（= 2560×1528 物理 ÷ 1.5 显示缩放）+ DPR 1.5。
 * 打印缩放系数、stage 矩形、以及几个设计稿已知尺寸的元素（用于和设计稿比例对照），并截图。
 */
/* eslint-disable no-console */
/* global document, window */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'ui-review', 'fit');
const PORT = process.argv[2] ?? '5199';

async function loadPlaywright() {
  const cacheRoot = join(homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
  for (const entry of readdirSync(cacheRoot)) {
    const candidate = join(cacheRoot, entry, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(candidate)) return await import(`file://${candidate.replaceAll('\\', '/')}`);
  }
  throw new Error('找不到 playwright');
}

const { chromium } = await loadPlaywright();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

for (const [w, h, dpr] of [
  [1707, 1019, 1.5],
  [1707, 1019, 1],
  [1280, 764, 2],
]) {
  const context = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: dpr,
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/river.html`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const stage = document.getElementById('fit-stage');
    const r = stage === null ? null : stage.getBoundingClientRect();
    const disc = document.querySelector('.port, [class*="disc"], [class*="bay"]');
    const dr = disc === null ? null : disc.getBoundingClientRect();
    const t = stage === null ? null : getComputedStyle(stage).transform;
    return {
      rect: r === null ? null : { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      transform: t,
      disc: dr === null ? null : Math.round(dr.width),
      vw: window.innerWidth,
      vh: window.innerHeight,
      dpr: window.devicePixelRatio,
      sw: document.documentElement.scrollWidth,
      sh: document.documentElement.scrollHeight,
    };
  });
  // 设计稿里 1440×900 画布上的 110px 圆盘，缩放到本视口后应当是 110×(stage.w/1440)
  const expected = m.rect === null ? null : Math.round((110 * m.rect.w) / 1440);
  console.log(
    `视口 ${String(w)}x${String(h)} DPR ${String(dpr)} → inner ${String(m.vw)}x${String(m.vh)} DPR ${String(m.dpr)}\n` +
      `  stage=${m.rect === null ? '无' : `${String(m.rect.w)}x${String(m.rect.h)}@${String(m.rect.x)},${String(m.rect.y)}`} ` +
      `transform=${String(m.transform)} 文档滚动=${String(m.sw)}x${String(m.sh)}\n` +
      `  圆盘实测=${String(m.disc)}px（若 110px 基准，应为 ${String(expected)}px）⇒ 放大倍数≈${m.disc === null ? '?' : (m.disc / 110).toFixed(2)}`,
  );
  await page.screenshot({ path: join(OUT, `user-${String(w)}x${String(h)}-dpr${String(dpr)}-river.png`) });
  await context.close();
}
await browser.close();
