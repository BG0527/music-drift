/**
 * 把 10 张设计定稿同步成发布副本 `site/*.html`。
 *
 * 为什么需要它：用户指正「design-explore 里已经有 html 网页」——
 * 那些 `.html` **就是源**（冻结、字节不改、设计期守卫继续有效），
 * `site/` 只是**发布副本**：只注入两行（viewport + 页面脚本），结构一字不改。
 * 重跑本脚本 = 从源重新生成发布副本，源永远是设计稿。
 *
 * W7：`p-sea-detail-record.html → sea-detail.html` 已从名单移除（用户第 3 轮需求删掉公海详情页）。
 *
 * 用法：node tools/sync-site.mjs [--check]
 *   --check：只比对，不写盘；有差异则 exit 1（可用于"发布副本是否与源一致"的守卫）。
 *
 * ⚠️ 汇总口径（W7 修）：**缺源必须单独计数并说出口**。改前踩到的坑是"源文件不在 `design-explore/`
 * 里时，那一页根本没被比对，汇总却照样打印「N 页，0 页不一致」" —— 读起来像通过。
 * 现在缺源页数与不一致页数**分开报**，且缺源时不打印"0 页不一致"这种会被读成通过的字样。
 */
/* eslint-disable no-console */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'docs', 'ui-review', 'design-explore');
const OUT_DIR = join(ROOT, 'site');

/** 设计稿 → 发布路径（与 docs/deploy-plan-html.md §7.3 的表一致）。 */
const PAGES = [
  ['f4-groove.html', 'river.html', 'river'],
  ['p-songpicker-record.html', 'new.html', 'new'],
  ['p-bottle-record.html', 'bottle.html', 'bottle'],
  ['p-driftlog-record.html', 'drift-log.html', 'drift-log'],
  ['p-sea-hall.html', 'sea.html', 'sea'],
  ['p-profile-record.html', 'me.html', 'me'],
  ['p-settings-record.html', 'settings.html', 'settings'],
  ['p-login-record.html', 'login.html', 'login'],
  ['s2-admin-record.html', 'admin.html', 'admin'],
  ['p-404-record.html', '404.html', '404'],
];

// 不要写 `width=1440`：那会让浏览器把画布**放大到窗口宽**，高度必然溢出、底部被切
//（用户实测截图正是这个问题）。改成 device-width + 1:1，再由 site/app/fit.js 等比缩放到一屏。
const VIEWPORT = '    <meta name="viewport" content="width=device-width, initial-scale=1">';

/** 只注入两行：charset 之后插 viewport，</body> 之前插本页脚本。其余字节原样。 */
function inject(html, slug) {
  if (html.includes('name="viewport"')) throw new Error(`源里已有 viewport（${slug}），不重复注入`);
  // 注意：源里写的是 `<meta charset="utf-8" />`（斜杠前有空格），别把 `">` 写死。
  const charset = /(<meta charset="[^"]*"\s*\/?>)/;
  if (!charset.test(html)) throw new Error(`源里没有 charset 行（${slug}）`);
  const withViewport = html.replace(charset, `$1\n${VIEWPORT}`);

  if (withViewport.includes('/app/page-')) throw new Error(`源里已有页面脚本（${slug}）`);
  if (!withViewport.includes('</body>')) throw new Error(`源里没有 </body>（${slug}）`);
  // 源里 `</body>` 自带 2 空格缩进，它前面的空白会保留 ⇒ 这里脚本行不再加缩进，
  // 替换文本里的 `</body>` 补回 2 空格，才能得到「脚本 2 空格 / </body> 2 空格」的同级缩进。
  return withViewport.replace(
    '</body>',
    `<script type="module" src="/app/page-${slug}.js"></script>\n  </body>`,
  );
}

const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const checkOnly = process.argv.includes('--check');
if (!checkOnly) mkdirSync(OUT_DIR, { recursive: true });

let changed = 0;
let missing = 0;
for (const [source, target, slug] of PAGES) {
  const from = join(SRC_DIR, source);
  if (!existsSync(from)) {
    /** **缺源 = 这一页根本没被比对**（不是"一致"）：单独计数，且在汇总里说出口。 */
    missing += 1;
    console.error(`✗ 缺源文件：${source}（${target} 没有被比对；设计稿目录：${SRC_DIR}）`);
    process.exitCode = 1;
    continue;
  }
  const out = inject(readFileSync(from, 'utf8'), slug);
  const to = join(OUT_DIR, target);
  const current = existsSync(to) ? readFileSync(to, 'utf8') : null;
  if (current === out) {
    console.log(`= ${target.padEnd(16)} 已是最新  ${sha(out).slice(0, 12)}`);
    continue;
  }
  changed += 1;
  if (checkOnly) {
    console.error(`✗ ${target} 与源不一致（重跑 node tools/sync-site.mjs 修复）`);
    process.exitCode = 1;
  } else {
    writeFileSync(to, out);
    console.log(`+ ${target.padEnd(16)} 已同步    ${sha(out).slice(0, 12)}`);
  }
}

/**
 * 汇总：**缺源与不一致分开报**。缺源时绝不打印"N 页不一致"那种会被读成通过的句子
 * （"0 页不一致"在缺源场景里是最危险的假话：那一页压根没被看过）。
 */
if (missing > 0) {
  console.error(
    checkOnly
      ? `\n比对失败：${String(PAGES.length)} 页里 ${String(missing)} 页缺源（这 ${String(missing)} 页没有被比对）；` +
          `其余 ${String(PAGES.length - missing)} 页里 ${String(changed)} 页与源不一致`
      : `\n同步不完整：${String(PAGES.length)} 页里 ${String(missing)} 页缺源（源不在 ${SRC_DIR}），已写入 ${String(changed)} 页`,
  );
} else {
  console.log(
    checkOnly
      ? `\n比对完成：${String(PAGES.length)} 页，${String(changed)} 页不一致，缺源 0 页`
      : `\n同步完成：${String(PAGES.length)} 页，写入 ${String(changed)} 页，缺源 0 页`,
  );
}

// 反向检查：site/ 里不该有不在名单内的 .html（防"手写的第 12 页"）
const strays = readdirSync(OUT_DIR)
  .filter((n) => n.endsWith('.html'))
  .filter((n) => !PAGES.some(([, target]) => target === n));
if (strays.length > 0) {
  console.error(`✗ site/ 里有名单外的页面：${strays.join(', ')}（发布副本必须全部来自设计稿）`);
  process.exitCode = 1;
}
