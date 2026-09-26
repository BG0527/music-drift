/**
 * 静态发布站守卫（W2）。退出码可 CI：0 = 全部通过，1 = 有失败项。
 *
 * 管的是"那 11 张设计定稿 + 接线层"有没有在学校里学坏：
 *  1. **发布副本必须等于源**（`sync-site.mjs --check`）—— 这是"HTML 是源"的机器保证；
 *  2. `site/` 只许有名单内的 11 页，页与 `page-*.js` 一一对应（无孤儿、无自作主张的第 12 页）；
 *  3. 每页必须有 viewport 与本页脚本，且**不得**出现静态 HTML 注入面；
 *  4. **禁 emoji / 禁纯黑 / 禁外链**（沿用设计期的三条硬约束）；
 *  5. **禁 HTML 注入通道**（`innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`/`eval(`）——
 *     匿名代号、曲名、留言都是用户输入，vanilla JS 里一次 `innerHTML` 就能被偷会话；
 *  6. **署名**：列曲目的页面必须渲染 `licensedSource`（CC-BY 署名不能丢）。
 *
 * 用法：node tools/site-guard.mjs
 */
/* eslint-disable no-console */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const APP = join(SITE, 'app');

/** 与 tools/sync-site.mjs 的 PAGES 一一对应（发布名单）。 */
const PAGES = [
  'river.html',
  'new.html',
  'bottle.html',
  'drift-log.html',
  'sea.html',
  'sea-detail.html',
  'me.html',
  'settings.html',
  'login.html',
  'admin.html',
  '404.html',
];

const failures = [];
const notes = [];
const fail = (msg) => failures.push(msg);

/** emoji：按码点扫（与设计期守卫同口径）。 */
function hasEmoji(text) {
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    if ((code >= 0x1f300 && code <= 0x1faff) || (code >= 0x2600 && code <= 0x27bf)) return true;
  }
  return false;
}

const INJECTION = /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function\(/;
/**
 * 纯黑：**先把"全透明"形式剥掉再查**。
 * 注意别用「否定前瞻 + 可选空白」，正则会回溯去让前瞻成功 —— 我第一版就这么误报了 `fit.js`。
 */
const TRANSPARENT = /rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0(?:\.0+)?\s*\)/gi;
const PURE_BLACK = /#000\b|#000000\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,/i;
const visibleInk = (text) => text.replace(TRANSPARENT, '');
// 外链：只看**会去加载资源**的写法（`src=`/`href=`/import/fetch/url()），字符串里提到 https 不算
const EXTERNAL_LOAD =
  /(?:\b(?:src|href)\s*=\s*["']?https?:\/\/|@import\s+url\(\s*["']?https?:\/\/|\bimport\s*\(\s*["']https?:\/\/|from\s+["']https?:\/\/|\bfetch\(\s*["']https?:\/\/|url\(\s*["']?https?:\/\/)/i;
// 部署隐患：接线层不许写死开发主机（部署后这些字符串会对评委说错话）；注释里的说明不算
const HARDCODED_HOST = /(?:localhost|127\.0\.0\.1)\s*:\s*\d{2,5}/;

// ── 1. 发布副本 ≡ 源 ───────────────────────────────────────────────
try {
  const out = execFileSync('node', [join(ROOT, 'tools', 'sync-site.mjs'), '--check'], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  notes.push(`发布副本与源一致：${out.trim().split('\n').pop() ?? ''}`);
} catch (error) {
  const text = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  fail(`发布副本 ≠ 设计源（重跑 node tools/sync-site.mjs 修复）：\n${text.trim().split('\n').slice(-12).join('\n')}`);
}

// ── 2. 名单与页/脚本一一对应 ────────────────────────────────────────
const actualPages = readdirSync(SITE).filter((n) => n.endsWith('.html'));
for (const name of actualPages) {
  if (!PAGES.includes(name)) fail(`site/${name} 不在发布名单内（发布副本只许来自 11 张定稿）`);
}
for (const name of PAGES) {
  if (!existsSync(join(SITE, name))) fail(`缺页：site/${name}`);
}
const pageScripts = readdirSync(APP).filter((n) => /^page-.*\.js$/.test(n));
for (const name of PAGES) {
  const slug = name.replace(/\.html$/, '');
  if (!pageScripts.includes(`page-${slug}.js`)) fail(`site/${name} 没有对应的 site/app/page-${slug}.js`);
}
for (const script of pageScripts) {
  const slug = script.replace(/^page-/, '').replace(/\.js$/, '');
  if (!PAGES.includes(`${slug}.html`)) fail(`site/app/${script} 是孤儿（没有对应页面）`);
}

// ── 3~4. 逐页检查 ──────────────────────────────────────────────────
for (const name of PAGES) {
  const path = join(SITE, name);
  if (!existsSync(path)) continue;
  const html = readFileSync(path, 'utf8');
  const slug = name.replace(/\.html$/, '');
  if (!html.includes('name="viewport"')) fail(`site/${name} 缺 viewport（手机端会被缩成豆腐块）`);
  if (!html.includes(`/app/page-${slug}.js`)) fail(`site/${name} 没挂本页脚本`);
  if (html.includes('<script') && !html.includes('type="module"')) {
    fail(`site/${name} 有非 module 脚本`);
  }
  if (hasEmoji(html)) fail(`site/${name} 含 emoji`);
  if (PURE_BLACK.test(visibleInk(html))) fail(`site/${name} 用了纯黑`);
  if (EXTERNAL_LOAD.test(html)) fail(`site/${name} 引用了外部资源（禁 CDN）`);
  if (INJECTION.test(html)) fail(`site/${name} 出现 HTML 注入通道`);
}

// ── 5. 接线层（site/app/**/*.js）检查 ──────────────────────────────
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
const jsFiles = walk(APP).filter((p) => extname(p) === '.js');
/** 去掉注释后再查"部署隐患"，避免 JSDoc 里的说明性地址被当成写死主机。 */
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
for (const file of jsFiles) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  const text = readFileSync(file, 'utf8');
  if (INJECTION.test(text)) fail(`${rel} 出现 HTML 注入通道（渲染必须只用 textContent）`);
  if (hasEmoji(text)) fail(`${rel} 含 emoji`);
  if (PURE_BLACK.test(visibleInk(text))) fail(`${rel} 用了纯黑`);
  if (EXTERNAL_LOAD.test(text)) fail(`${rel} 引用了外部资源（禁 CDN）`);
  if (HARDCODED_HOST.test(stripComments(text))) {
    fail(`${rel} 写死了开发主机（部署后会对评委说错话；改用 location.host 之类）`);
  }
}

// ── 6. 署名：列曲目的页面必须渲染 licensedSource ───────────────────
for (const [slug, why] of [
  ['new', '选歌页列曲目'],
  ['settings', '设置页列伴奏来源'],
]) {
  const file = join(APP, `page-${slug}.js`);
  if (!existsSync(file)) continue;
  if (!readFileSync(file, 'utf8').includes('licensedSource')) {
    fail(`site/app/page-${slug}.js 没有渲染 licensedSource（${why} ⇒ CC-BY 署名会丢）`);
  }
}

// ── 7. site/ 里不该有临时产物 ──────────────────────────────────────
for (const name of readdirSync(SITE)) {
  if (/^\.tmp|^_tmp|\.tmp-/.test(name)) fail(`site/${name} 是临时产物（不该进发布目录）`);
}

// ── 输出 ───────────────────────────────────────────────────────────
console.log('=== 静态发布站守卫 ===');
for (const n of notes) console.log(`· ${n}`);
console.log(`· 检查范围：${String(PAGES.length)} 页 + ${String(jsFiles.length)} 个 JS`);
if (failures.length === 0) {
  console.log('\n✓ 全部通过');
} else {
  console.log(`\n✗ ${String(failures.length)} 项失败：`);
  for (const f of failures) console.log(`   ✗ ${f}`);
}
process.exit(failures.length === 0 ? 0 : 1);
