/**
 * 设计探索用的一次性截图器（**不是产品代码、不入依赖**）。
 *
 * 为什么需要一个本地 HTTP 服务：四个方案稿是自包含 HTML，靠相对/绝对路径引用仓库里
 * **真实的 woff2 字体**（`lxgw-wenkai-webfont` / `@fontsource/quattrocento`）。
 * `file://` 下 Chromium 对跨文件 CSS @import 的限制会让字体静默回退成系统衬线 —— 那样看到的
 * 就不是真实排版，方案对比会失真。
 *
 * 用法：node docs/ui-review/design-explore/_shoot.mjs
 *
 * 说明：脚本跑在 Node 里，但 `page.evaluate` 的回调在**页面上下文**执行，所以这里显式声明浏览器全局
 * （与 `apps/web/tools/one-screen-check.mjs` 同一套写法；`console` 是 CLI 的正当输出，故关掉该规则）。
 */
/* eslint-disable no-console */
/* global document, getComputedStyle */
import { createServer } from 'node:http';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join, normalize } from 'node:path';

const ROOT = normalize('D:/Develop/projects/music');
const DIR = join(ROOT, 'docs', 'ui-review', 'design-explore');
const VIEWPORT = { width: 1440, height: 900 };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
};

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  // ⚠️ ROOT 必须也走 normalize：Windows 上 `join` 产出的是反斜杠，
  // 拿正斜杠的 ROOT 去 startsWith 会**永远为假** ⇒ 每个请求都 404（第一版就是这样：截图全是 "not found"）。
  const file = join(ROOT, path);
  if (!file.startsWith(ROOT) || !existsSync(file)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const PORT = server.address().port;

/** playwright 只在 npx 缓存里（仓库按 AGENTS §7 未登记它）；与 `one-screen-check.mjs` 同一套找法。 */
async function loadPlaywright() {
  const cacheRoot = join(homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
  for (const entry of readdirSync(cacheRoot)) {
    const candidate = join(cacheRoot, entry, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(candidate)) return await import(`file://${candidate.replaceAll('\\', '/')}`);
  }
  throw new Error('找不到 playwright（npx 缓存里没有；先跑一次 npx playwright --version）');
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
const page = await context.newPage();

const shots = readdirSync(DIR)
  .filter((name) => name.endsWith('.html'))
  .sort();

for (const name of shots) {
  const out = join(DIR, name.replace(/\.html$/, '.png'));
  const src = join(DIR, name);
  // 并发跑本脚本会抢写同名 PNG（实测 UNKNOWN open 崩溃）。图已比源码新就跳过，--force 可强制重画。
  if (!process.argv.includes('--force') && existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) {
    console.log(`skip ${name}  （png 比 html 新；--force 强制重画）`);
    continue;
  }
  await page.goto(`http://127.0.0.1:${PORT}/docs/ui-review/design-explore/${name}`, {
    waitUntil: 'load',
  });
  // 字体不落地就截图 = 拿系统衬线评排版（对比会失真），所以显式等字体
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  // 尺寸与字体一样要报出来：`fullPage: true` 的 PNG 宽高**就是** scrollWidth/scrollHeight，
  // 所以"一屏装不下 / 横向溢出"在这里是机器可判的，不该量了却丢掉（此前只打印字体，等于没查）。
  const measured = await page.evaluate(() => ({
    font: getComputedStyle(document.querySelector('h1') ?? document.body).fontFamily,
    height: document.documentElement.scrollHeight,
    width: document.documentElement.scrollWidth,
  }));
  let shot = false;
  for (let attempt = 1; attempt <= 3 && !shot; attempt += 1) {
    try {
      await page.screenshot({ path: out, fullPage: true });
      shot = true;
    } catch (error) {
      if (attempt === 3) throw error;
      await page.waitForTimeout(500);
    }
  }
  const over = [];
  if (measured.width > VIEWPORT.width) over.push(`横向 +${String(measured.width - VIEWPORT.width)}px`);
  if (measured.height > VIEWPORT.height) over.push(`纵向 +${String(measured.height - VIEWPORT.height)}px`);
  const verdict = over.length ? `  ⚠ 超出一屏：${over.join(' / ')}` : '  ✓ 一屏内';
  console.log(
    `shot ${name}  →  ${out}  (${String(measured.width)}x${String(measured.height)} @1x, h1 font: ${measured.font})${verdict}`,
  );
}

await browser.close();
server.close();
