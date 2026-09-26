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
import { readdirSync, readFileSync, existsSync } from 'node:fs';
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
  await page.goto(`http://127.0.0.1:${PORT}/docs/ui-review/design-explore/${name}`, {
    waitUntil: 'load',
  });
  // 字体不落地就截图 = 拿系统衬线评排版（对比会失真），所以显式等字体
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  const measured = await page.evaluate(() => ({
    font: getComputedStyle(document.querySelector('h1') ?? document.body).fontFamily,
    height: document.documentElement.scrollHeight,
  }));
  const out = join(DIR, name.replace(/\.html$/, '.png'));
  await page.screenshot({ path: out, fullPage: true });
  console.log(`shot ${name}  →  ${out}  (h1 font: ${measured.font})`);
}

await browser.close();
server.close();
