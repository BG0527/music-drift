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
import { readdirSync, readFileSync, existsSync, statSync, openSync, writeSync, closeSync, unlinkSync } from 'node:fs';
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
/**
 * 跨进程锁：多个 agent 会同时跑这个脚本，而 Chromium 截图是**直接写目标文件**，
 * 两个进程写同一个 PNG 会报 `UNKNOWN: unknown error, open ...`（实测反复出现，重试救不了）。
 * 所以在这里串行化：拿不到锁就等；持有者超过 5 分钟没心跳，视为死锁抢过来。
 */
/** 读 PNG 的 IHDR 取真实像素：`scrollHeight` 会漏判（实测某页 scrollHeight=900 而实际截出 907）。 */
function pngSize(path) {
  const buf = readFileSync(path).subarray(0, 24);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const LOCK = join(DIR, '.shoot.lock');
async function acquireLock() {
  for (let i = 0; i < 180; i += 1) {
    try {
      const fd = openSync(LOCK, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return true;
    } catch {
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > 5 * 60 * 1000) unlinkSync(LOCK);
      } catch {
        /* 锁刚好被释放，下一轮重试即可 */
      }
      if (i === 0) console.log('… 另一个进程正在渲染，排队等待锁');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return false;
}
function releaseLock() {
  try {
    unlinkSync(LOCK);
  } catch {
    /* 已经没了就算了 */
  }
}
process.on('exit', releaseLock);
process.on('SIGINT', () => {
  releaseLock();
  process.exit(130);
});

if (!(await acquireLock())) {
  console.error('✗ 等锁超时（3 分钟）——另一个进程可能卡住了，请检查 .shoot.lock');
  process.exit(1);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
const page = await context.newPage();

const failures = [];
const shots = readdirSync(DIR)
  .filter((name) => name.endsWith('.html'))
  .sort();

for (const name of shots) {
  const out = join(DIR, name.replace(/\.html$/, '.png'));
  const src = join(DIR, name);
  // 并发跑本脚本会抢写同名 PNG（实测 UNKNOWN open 崩溃）。图已比源码新就跳过，--force 可强制重画。
  if (!process.argv.includes('--force') && existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) {
    console.log(
      `skip ${name}  （png 比 html 新，**本次未重画 = 没有校验证据**；要证据请加 --force）`,
    );
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
  let lastError = null;
  for (let attempt = 1; attempt <= 3 && !shot; attempt += 1) {
    try {
      await page.screenshot({ path: out, fullPage: true });
      shot = true;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(800);
    }
  }
  if (!shot) {
    // 一个文件写失败不该让后面所有页都不渲染（实测同一页会偶发 UNKNOWN open）。
    failures.push(`${name}: ${lastError?.message ?? 'unknown'}`);
    console.log(`FAIL ${name}  ✗ 三次都写不进去（本批继续，见末尾汇总）`);
    continue;
  }
  const over = [];
  if (measured.width > VIEWPORT.width) over.push(`横向 +${String(measured.width - VIEWPORT.width)}px`);
  if (measured.height > VIEWPORT.height) over.push(`纵向 +${String(measured.height - VIEWPORT.height)}px`);
  // 真判据：PNG 的实际像素必须是 2880x1800（1440x900 @2x）。scrollHeight 会说谎。
  const shot2x = pngSize(out);
  if (shot2x && (shot2x.width !== VIEWPORT.width * 2 || shot2x.height !== VIEWPORT.height * 2)) {
    over.push(
      `实际像素 ${String(shot2x.width)}x${String(shot2x.height)}（应为 ${String(VIEWPORT.width * 2)}x${String(VIEWPORT.height * 2)}）`,
    );
  }
  const verdict = over.length ? `  ⚠ 超出一屏：${over.join(' / ')}` : '  ✓ 一屏内';
  console.log(
    `shot ${name}  →  ${out}  (${String(measured.width)}x${String(measured.height)} @1x, h1 font: ${measured.font})${verdict}`,
  );
}

await browser.close();
releaseLock();

if (failures.length > 0) {
  console.error(`✗ ${String(failures.length)} 个文件渲染失败：\n  ${failures.join('\n  ')}`);
  process.exitCode = 1;
}
server.close();
