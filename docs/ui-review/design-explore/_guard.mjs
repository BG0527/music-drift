/**
 * design-explore 稿件的**可复跑守卫**（把各 agent 临时写的自检固化成一条命令）。
 *
 * 为什么需要它：这批稿子落在所有 pnpm 包之外，`pnpm -r test` **覆盖不到**；
 * 此前每个 agent 都临时写一段扫描，跑完即弃 —— 同一套规则被反复重新发明，且没有基线。
 *
 *   node docs/ui-review/design-explore/_guard.mjs
 *
 * 检查项（逐文件）：禁 emoji/符号/箭头 · 禁纯黑 · 禁外链 · @import 四行保序 ·
 * 圆角仅 50%/≤4px · 画布 1440x900+overflow · 出血装饰有 .clip · png 2880x1800 且不旧于 html。
 * 退出码：任一**在当前名单内**的文件任一项失败即 1（可直接进 CI）。
 *
 * 两处已修的误报（不修就没人信这个门禁）：
 *   - `<svg xmlns="http://www.w3.org/2000/svg">` 是 XML 命名空间，**不是外链**
 *   - 纯黑检查的口径写明：`rgba(0,0,0,α)` 出现在 **掩膜里**必须改白（掩膜只读 alpha）；
 *     出现在**阴影里**也算违规（契约本就禁止用阴影造层次，阴影应从 --ink 派生）
 */
/* eslint-disable no-console */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FINAL = process.argv.includes('--final');
const DIR = 'docs/ui-review/design-explore';
const IMPORTS = [
  'lxgwwenkai-regular.css',
  'lxgwwenkai-bold.css',
  'quattrocento/400.css',
  'quattrocento/700.css',
];

/** 历史稿：已被淘汰或已被取代，不再作为候选，但仍留在仓库里可追溯 —— 只标注，不算失败。 */
const ARCHIVE = new Set([
  'f0-sequence.html',
  'f4-d-dense.html',
  'f4-d-mid.html',
  'f4-d-soft.html',
  'f4-d-sparse.html',
  'g3-underwater.html',
  's1-sea-record.html',
  's1-sea-water.html',
  's2-admin-water.html',
]);

/** 冻结页的**已记录欠账**：仍然打印，但不计失败、不影响退出码（用户要求"不要修改"那页）。 */
const KNOWN_DEBTS = new Map([
  ['f4-groove.html', ['出血装饰有 .clip 容器', '七色变量原样']],
]);

const EMOJI = (cp) =>
  (cp >= 0x1f000 && cp <= 0x1faff) ||
  (cp >= 0x2600 && cp <= 0x27bf) ||
  (cp >= 0x2190 && cp <= 0x21ff) ||
  cp === 0x266a ||
  cp === 0x266b ||
  cp === 0xfe0f;

function pngSize(path) {
  const buf = readFileSync(path).subarray(0, 24);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const files = readdirSync(DIR).filter((n) => n.endsWith('.html')).sort();
let failed = 0;
let gated = 0;

for (const name of files) {
  const html = join(DIR, name);
  const src = readFileSync(html, 'utf8');
  const checks = [];

  const bad = [...src].filter((ch) => EMOJI(ch.codePointAt(0))).length;
  checks.push(['禁 emoji/符号/箭头', bad === 0, `${String(bad)} 个`]);

  const black = (src.match(/#000000|#000\b|rgba\(0,\s*0,\s*0|rgb\(0,\s*0,\s*0|:\s*black/g) ?? []).length;
  checks.push(['禁纯黑（掩膜改白 / 阴影从 --ink 派生）', black === 0, `${String(black)} 处`]);

  // 命名空间 URI 不算外链
  const ext = (src.match(/https?:\/\/(?!www\.w3\.org)/g) ?? []).length;
  checks.push(['禁外链（命名空间除外）', ext === 0, `${String(ext)} 处`]);

  const found = [...src.matchAll(/@import\s+url\('([^']+)'\)/g)].map((m) => m[1]);
  const orderOk =
    found.length === IMPORTS.length && IMPORTS.every((want, i) => (found[i] ?? '').endsWith(want));
  checks.push(['@import 四行保序', orderOk, `${String(found.length)} 行`]);

  // 逐规则块判：>4px 只允许「50%」或**半圆**（radius = 该块 height/2 ±1）—— 否则会把合法的半圆误判成违规
  const badRadius = [];
  for (const block of src.split('}')) {
    const radius = /border-radius:\s*([^;]+)/.exec(block);
    if (!radius) continue;
    const height = /height:\s*(\d+(?:\.\d+)?)px/.exec(block);
    for (const part of radius[1].trim().split(/\s+/)) {
      if (!part.endsWith('px')) continue;
      const value = Number.parseFloat(part);
      if (value <= 4) continue;
      const halfCircle = height !== undefined && Math.abs(value - Number.parseFloat(height[1]) / 2) <= 1;
      if (!halfCircle) badRadius.push(`${part}${height ? ` (height ${height[1]}px)` : ''}`);
    }
  }
  checks.push(['圆角仅 50% / ≤4px / 半圆', badRadius.length === 0, badRadius.join(' , ') || 'ok']);

  const canvasOk =
    /html\s*,\s*body\s*\{[^}]*width\s*:\s*1440px/.test(src) &&
    /html\s*,\s*body\s*\{[^}]*height\s*:\s*900px/.test(src) &&
    /overflow\s*:\s*hidden/.test(src);
  checks.push(['画布 1440x900 + overflow', canvasOk, canvasOk ? 'ok' : '缺定宽高或 overflow']);

  const clipOk = /\.clip\s*\{[^}]*overflow\s*:\s*hidden/.test(src);
  checks.push(['出血装饰有 .clip 容器', clipOk, clipOk ? 'ok' : '缺 .clip']);

  // ↓ 三项来自某 agent 的临时校验器 _check-sea-hall.mjs，现并入统一守卫，避免每人各写一份
  const CONTRACT_COLORS = ['#050f14', '#f3f9fa', '#a9c7cf', '#7fd1d9', '#f6d79a'];
  const missingColors = CONTRACT_COLORS.filter((c) => !src.includes(c));
  // 珊瑚：新稿用 #d4553a（约 4.9:1）；**冻结的标杆页仍是旧值 #c7452c（3.98:1，已知欠账）**，显式报出用的是哪个
  const coral = src.includes('#d4553a') ? '#d4553a' : src.includes('#c7452c') ? '#c7452c' : '缺失';
  if (coral === '缺失') missingColors.push('--coral');
  checks.push([
    '七色变量原样',
    missingColors.length === 0,
    missingColors.length > 0 ? missingColors.join(' ') : `ok · coral=${coral}${coral === '#c7452c' ? '（冻结稿旧值）' : ''}`,
  ]);

  const tags = (src.match(/<(img|script|link)\b/gi) ?? []).length;
  checks.push(['无 img/script/link', tags === 0, `${String(tags)} 个`]);

  const open = (src.match(/<(div|ul|ol|li|span|p|section|nav|header|footer|button|a)\b/g) ?? []).length;
  const close = (src.match(/<\/(div|ul|ol|li|span|p|section|nav|header|footer|button|a)>/g) ?? []).length;
  checks.push(['标签配平', open === close, `开 ${String(open)} / 闭 ${String(close)}`]);

  const png = html.replace(/\.html$/, '.png');
  let pngNote = '无 png';
  let pngOk;
  let sizeOk = false; // 只看像素尺寸
  try {
    const size = pngSize(png);
    const fresh = statSync(png).mtimeMs >= statSync(html).mtimeMs;
    sizeOk = size?.width === 2880 && size?.height === 1800;
    pngOk = sizeOk && fresh;
    pngNote = `${String(size?.width)}x${String(size?.height)}${fresh ? '' : '（比 html 旧）'}`;
  } catch {
    pngOk = false;
  }
  // 并发期间"png 比 html 旧"是竞态而非缺陷（渲染 11 个文件约 90s，队友随时会保存 html），
  // 所以默认只警告；收工后跑 --final 才把它当失败。
  const freshOk = !pngNote.includes('比 html 旧');
  checks.push(['png 尺寸 2880x1800', sizeOk, pngNote]);
  if (FINAL || freshOk) checks.push(['png 不旧于 html（--final 强制）', pngOk, pngNote]);
  else console.log(`   ⚠ ${name} 的 png 比 html 旧（并发期间视为待重画，不计失败；--final 会强制）`);

  const debts = KNOWN_DEBTS.get(name) ?? [];
  const bads = checks.filter(([label, ok]) => !ok && !debts.includes(label));
  const debtHits = checks.filter(([label, ok]) => !ok && debts.includes(label));

  if (ARCHIVE.has(name) || name.startsWith('_hist-')) {
    console.log(
      `· ${name.padEnd(30)} 历史稿（已淘汰/被取代，仅存档）${
        bads.length > 0 ? ` · 遗留 ${bads.map(([label]) => label).join(' / ')}` : ''
      }`,
    );
    continue;
  }
  gated += 1;
  if (bads.length > 0) failed += 1;
  const debtNote =
    debtHits.length > 0
      ? `  · 已知欠账（冻结页，用户要求不修改）: ${debtHits.map(([label]) => label).join(' / ')}`
      : '';
  console.log(
    `${bads.length === 0 ? '✓' : '✗'} ${name.padEnd(30)} ${
      bads.length === 0 ? '全部通过' : bads.map(([label, , note]) => `${label}(${note})`).join(' / ')
    }${debtNote}`,
  );
}

console.log(
  `\n当前名单 ${String(gated)} 个文件 · ${failed === 0 ? '全部通过' : `${String(failed)} 个失败`}` +
    `（另有 ${String(files.length - gated)} 个历史稿只标注、不算失败）`,
);
process.exitCode = failed === 0 ? 0 : 1;
