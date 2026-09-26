/**
 * 静态发布站守卫（W2）。退出码可 CI：0 = 全部通过，1 = 有失败项。
 *
 * 管的是"那 10 张设计定稿 + 接线层"有没有在学校里学坏：
 *  1. **发布副本必须等于源**（`sync-site.mjs --check`）—— 这是"HTML 是源"的机器保证；
 *  2. `site/` 只许有名单内的 10 页，页与 `page-*.js` 一一对应（无孤儿、无自作主张的第 11 页）；
 *  3. 每页必须有 viewport 与本页脚本，且**不得**出现静态 HTML 注入面；
 *  4. **禁 emoji / 禁纯黑 / 禁外链**（沿用设计期的三条硬约束）；
 *  5. **禁 HTML 注入通道**（`innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`/`eval(`）——
 *     匿名代号、曲名、留言都是用户输入，vanilla JS 里一次 `innerHTML` 就能被偷会话；
 *  6. **署名**：列曲目的页面必须渲染 `licensedSource`（CC-BY 署名不能丢）；
 *  7. **发布版补丁**（`site/patches/<slug>.css`，W5-A）：**可重放 + 结果确定** ——
 *     命名与页面一一对应（无孤儿补丁、无补丁指向不存在的页）、可解析（括号/注释配平、LF、非空）、
 *     只用 `DESIGN.md` 既有色板（hex 必须来自 front matter，与 `tokens.test.ts` 同口径）、
 *     自包含（禁 `@import`、禁外部资源、禁引用 `#fit-stage`、禁改共享层两个前缀）。
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
const PATCHES = join(SITE, 'patches');

/** 与 tools/sync-site.mjs 的 PAGES 一一对应（发布名单）。 */
const PAGES = [
  'river.html',
  'new.html',
  'bottle.html',
  'drift-log.html',
  'sea.html',
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
  if (!PAGES.includes(name)) fail(`site/${name} 不在发布名单内（发布副本只许来自 10 张定稿）`);
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

// ── 7. 发布版补丁：可重放 + 结果确定（W5-A）─────────────────────────
/**
 * 色板唯一真相 = `DESIGN.md` front matter 的 `colors:` 块（与 `tokens.test.ts` 同口径截取）。
 * 解析失败（拿不到色板）时**不能静默通过**：那会让"禁新色值"这条守卫整体失效。
 *
 * 注意两个计数不是一回事：色 token 有 30+ **个名字**，但其中若干别名指向同一个 hex
 * （`wave-white` == `ink`、`foam` == `water-light` …）⇒ 去重后的**色值**个数更少。
 * 判"解析成功"要用**名字数**（`tokens.test.ts` 的口径），判色值要用去重后的集合。
 */
function designPalette() {
  const md = readFileSync(join(ROOT, 'DESIGN.md'), 'utf8');
  const front = md.split('---\n')[1] ?? '';
  const hexes = new Set();
  const names = new Set();
  let inColors = false;
  for (const line of front.split('\n')) {
    if (/^colors:\s*$/.test(line)) {
      inColors = true;
      continue;
    }
    if (!inColors) continue;
    if (/^\S/.test(line)) break;
    const m = /^\s{2}([a-z0-9-]+):\s*"(#[0-9A-Fa-f]{6})"\s*$/.exec(line);
    if (m?.[1] === undefined || m[2] === undefined) continue;
    names.add(m[1]);
    hexes.add(m[2].toUpperCase());
  }
  return { hexes, names };
}
const PALETTE = designPalette();
if (PALETTE.names.size < 30) {
  fail(
    `没能从 DESIGN.md front matter 解析出色板（解析到 ${String(PALETTE.names.size)} 个名字 / ` +
      `${String(PALETTE.hexes.size)} 个色值，预期 >= 30 个名字）`,
  );
}

/** 补丁名 = 页 slug（`site/<slug>.html`）。 */
const SLUGS = PAGES.map((name) => name.replace(/\.html$/, ''));
const patchFiles = existsSync(PATCHES)
  ? readdirSync(PATCHES)
      .filter((n) => n.endsWith('.css'))
      .sort()
  : [];
for (const name of existsSync(PATCHES) ? readdirSync(PATCHES) : []) {
  if (!name.endsWith('.css')) fail(`site/patches/${name} 不是 .css（补丁目录只许放 <页面名>.css）`);
}
for (const name of patchFiles) {
  const slug = name.replace(/\.css$/, '');
  const path = join(PATCHES, name);
  const rel = `site/patches/${name}`;
  if (!SLUGS.includes(slug)) {
    fail(`${rel} 是孤儿补丁（没有对应页面 site/${slug}.html）`);
    continue;
  }
  if (!existsSync(join(SITE, `${slug}.html`))) fail(`${rel} 指向不存在的页面`);
  const raw = readFileSync(path, 'utf8');
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  const text = code.replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  // ① 可重放：字节级自洽（LF、非空、补丁文件必须真的声明了东西）
  if (raw.trim() === '') fail(`${rel} 是空文件（存在即生效 ⇒ 空补丁会关掉缩放却不给版式）`);
  if (raw.includes('\r')) fail(`${rel} 含 CR（本仓库统一 LF）`);
  if (!raw.endsWith('\n')) fail(`${rel} 结尾不是换行（LF 纪律）`);

  // ② 可解析：注释与括号配平
  const comments = raw.match(/\/\*[\s\S]*?\*\//g) ?? [];
  if (raw.split('/*').length !== raw.split('*/').length) fail(`${rel} 注释块没有配平`);
  let depth = 0;
  let paren = 0;
  for (const ch of code.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '(') paren += 1;
    else if (ch === ')') paren -= 1;
    if (depth < 0 || paren < 0) break;
  }
  if (depth !== 0) fail(`${rel} 花括号不配平（${String(depth)}）`);
  if (paren !== 0) fail(`${rel} 圆括号不配平（${String(paren)}）`);
  if (comments.length === 0) fail(`${rel} 没有说明性注释（补丁必须写清它为什么这么改）`);

  // ③ 自包含 + 结果确定
  if (/@import/.test(text)) fail(`${rel} 用了 @import（补丁必须自包含，加载次序不得影响结果）`);
  if (EXTERNAL_LOAD.test(raw)) fail(`${rel} 引用了外部资源（禁 CDN）`);
  if (/fit-stage/.test(text)) {
    fail(`${rel} 引用了 #fit-stage（补丁页根本不装缩放 ⇒ 这里的规则永远不会命中，是死代码）`);
  }
  if (/\.demo-nav|\.app-state/.test(text)) {
    fail(`${rel} 改了共享层浮层（.demo-nav/.app-state 归 base.css，补丁不许碰）`);
  }

  // ④ 只用既有 token：hex 必须来自 DESIGN.md 色板
  for (const hex of text.match(/#[0-9A-Fa-f]{6}(?![0-9A-Fa-f])/g) ?? []) {
    if (!PALETTE.hexes.has(hex.toUpperCase())) {
      fail(`${rel} 出现 DESIGN.md 色板外的色值 ${hex}（禁止发明新颜色）`);
    }
  }
  if (hasEmoji(text)) fail(`${rel} 含 emoji`);
  if (PURE_BLACK.test(visibleInk(text))) fail(`${rel} 用了纯黑`);

  // ⑤ 缩放逃生开关必须真的由共享层打开（这条由 page.js 保证，这里只确认页面脚本在场）
  const script = join(APP, `page-${slug}.js`);
  if (!existsSync(script)) fail(`${rel} 的页面没有 site/app/page-${slug}.js（补丁永远不会被加载）`);
}
notes.push(
  `发布版补丁：${String(patchFiles.length)} 个（流体页 ${patchFiles.map((n) => n.replace(/\.css$/, '')).join('、') || '无'}）`,
);

// ── 8. site/ 里不该有临时产物 ──────────────────────────────────────
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
