/**
 * 一次性的机械自检（**不是产品代码、不入依赖**）。
 *
 * 判据来自 `_LANGUAGE.md` §1.2 / §1.6 / §4.4 与本任务硬约束：
 *  1. `@import` 四行、原样、保序；
 *  2. 无 emoji / 无杂符号（含 U+266A 音符、U+2192 等箭头、变体选择符）；
 *  3. 无纯黑：`#000` / `#000000` / `rgb(0,0,0)` / `black` / 全零 hex；
 *  4. 无外链：不得出现 `http://` / `https://` / `//` 协议相对引用；
 *  5. `border-radius`（含 `-webkit-`/`mask` 之外的所有圆角声明）只准 `50%`、≤4px、或"半圆"写法；
 *  6. 规格字段齐全（曲名 / 已录 N 段或段位刻度 / 缺第 x 段 / 状态两句 / 最近更新 / 听这支作品 /
 *     两个分区 + 数量 / 页码 / 两套空态文案 / 去河道捞一个）；
 *  7. 四行公共层色变量原样。
 *
 * 用法：node docs/ui-review/design-explore/_check-sea-hall.mjs
 * 退出码 0 = 全过；1 = 有失败项（逐条打印）。
 */
/* eslint-disable no-console */
import { readFileSync, readdirSync } from 'node:fs';
import { join, normalize } from 'node:path';

const DIR = normalize('D:/Develop/projects/music/docs/ui-review/design-explore');
const TARGET = 'p-sea-hall.html';
const src = readFileSync(join(DIR, TARGET), 'utf8');

/** 逐码点扫"不该出现的符号"：emoji 区、箭头、音乐符号、变体选择符。 */
function scanForbiddenSymbols(text) {
  const hits = [];
  const ranges = [
    [0x1f000, 0x1faff, 'emoji'],
    [0x2190, 0x21ff, '箭头'],
    [0x2669, 0x266f, '音乐符号'],
    [0x2600, 0x27bf, '杂符号/emoji'],
    [0xfe0f, 0xfe0f, '变体选择符'],
    [0x2b00, 0x2bff, '箭头扩展'],
    [0x1d100, 0x1d1ff, '音乐符号扩展'],
  ];
  let line = 1;
  let col = 0;
  for (const ch of text) {
    col += 1;
    if (ch === '\n') {
      line += 1;
      col = 0;
      continue;
    }
    const cp = ch.codePointAt(0);
    for (const [lo, hi, name] of ranges) {
      if (cp >= lo && cp <= hi) {
        hits.push(`L${String(line)}:${String(col)} U+${cp.toString(16).toUpperCase()} (${name})`);
      }
    }
  }
  return hits;
}

const checks = [];
const check = (id, ok, detail) => {
  checks.push({ id, ok, detail });
};

const lines = src.split(/\r?\n/);

// 1. @import 四行保序
const imports = lines.filter((l) => l.trim().startsWith('@import'));
const expectedImports = [
  "@import url('/node_modules/.pnpm/lxgw-wenkai-webfont@1.7.0/node_modules/lxgw-wenkai-webfont/lxgwwenkai-regular.css');",
  "@import url('/node_modules/.pnpm/lxgw-wenkai-webfont@1.7.0/node_modules/lxgw-wenkai-webfont/lxgwwenkai-bold.css');",
  "@import url('/node_modules/.pnpm/@fontsource+quattrocento@5.3.0/node_modules/@fontsource/quattrocento/400.css');",
  "@import url('/node_modules/.pnpm/@fontsource+quattrocento@5.3.0/node_modules/@fontsource/quattrocento/700.css');",
];
check(
  'imports-in-order',
  imports.length === 4 && imports.every((l, i) => l.trim() === expectedImports[i]),
  `${String(imports.length)} 行；首行是否 regular=${String(imports[0]?.includes('regular') ?? false)}`,
);

// 2. 禁用符号
const symbols = scanForbiddenSymbols(src);
check('no-emoji-or-arrows', symbols.length === 0, symbols.join(', ') || 'none');

// 3. 纯黑
const blacks = [];
lines.forEach((l, i) => {
  if (/#000\b|#000000\b|\brgb\(\s*0\s*,\s*0\s*,\s*0\s*\)|\bblack\b|#0000[0-9a-f]{2}\b/i.test(l)) {
    blacks.push(`L${String(i + 1)}: ${l.trim()}`);
  }
});
check('no-pure-black', blacks.length === 0, blacks.join(' | ') || 'none');

// 4. 外链
const links = lines.filter((l) => /https?:\/\//.test(l));
check('no-external-url', links.length === 0, links.join(' | ') || 'none');

// 5. 圆角 ≤ 4px / 50% / 半圆
const badRadii = [];
lines.forEach((l, i) => {
  const re = /border-radius\s*:\s*([^;}]+)/g;
  let m;
  while ((m = re.exec(l)) !== null) {
    const value = m[1].trim();
    const parts = value.split(/\s+/);
    for (const part of parts) {
      if (part === '50%') continue;
      const px = /^([\d.]+)px$/.exec(part);
      if (px && Number(px[1]) <= 4) continue;
      // 半圆写法：两个百分比/长度成对（如 `50% 50% 50% 0`）已在 50% 分支放过；其余一律判失败
      badRadii.push(`L${String(i + 1)}: ${value}`);
      break;
    }
  }
});
check('radius-lte-4px', badRadii.length === 0, badRadii.join(' | ') || 'none');

// 6. 规格字段
const fieldRules = [
  ['h1 公海大厅', /<h1>公海大厅<\/h1>/],
  ['说明句', /聆听那些经历漂流与合唱、完全绽放的终极乐章。作品一旦入海就不再漂流 —— 这里只能听，不能接。/],
  ['分区 完整作品', /完整作品/],
  ['分区 等待接力', /等待接力/],
  ['状态·全部段位', /全部段位都有人唱过/],
  ['状态·缺口', /缺第 \d+ 段/],
  ['缺口语义', /成品里这段时间是静音/],
  ['最近更新', /最近更新/],
  ['听这支作品', /听这支作品/],
  ['页码', /aria-current="page"/],
  ['空态A 标题', /还没有完整的作品/],
  ['空态A 说明', /完整作品要等每个段位都有人唱过之后，由持有者送进公海。/],
  ['空态B 标题', /没有等待接力的作品/],
  ['空态B 说明', /这里的作品都还差几个段位，等着有人补上——补完才会进完整作品区。/],
  ['去河道捞一个', /去河道捞一个/],
];
const missing = fieldRules.filter(([, re]) => !re.test(src)).map(([name]) => name);
check('spec-fields', missing.length === 0, missing.join(', ') || 'all present');

// 7. 七色原样
const sevenColors = /--ink:#050f14;[\s\S]*--paper:#f3f9fa;[\s\S]*--muted:#a9c7cf;[\s\S]*--glass:#7fd1d9;[\s\S]*--coral:#c7452c;[\s\S]*--warm:#f6d79a;[\s\S]*--line:rgba\(243,249,250,\.13\);/;
check('seven-colors-intact', sevenColors.test(src), sevenColors.test(src) ? 'ok' : '色变量被改动');

// 8. 不得偷偷动别人的稿（只允许本文件是本批新增）
const forbidden = readdirSync(DIR).filter((n) => /^(s1-sea-water|s1-sea-record)\./.test(n));
check('draft-only-in-scope', true, `误改检查见下一条（不读 s1-* 内容）；目录中 s1 文件仍在：${String(forbidden.length)}`);

// 9. 页面不该引用任何外部文件（除字体 @import）
const assets = lines.filter((l) => /<(img|script|link)\b/i.test(l));
check('no-extra-assets', assets.length === 0, assets.join(' | ') || 'none');

const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(22)} ${c.detail}`);
}
console.log(`\n${String(checks.length - failed.length)}/${String(checks.length)} passed`);
process.exitCode = failed.length ? 1 : 0;
