/** 从 11 页定稿里统计"真实用到的值"—— 契约必须来自实测，不能是 captain 编的。 */
import { readdirSync, readFileSync } from 'node:fs';
const DIR = 'docs/ui-review/design-explore/';
const files = readdirSync(DIR).filter(
  (n) => n.endsWith('.html') && !n.startsWith('_') && !/^s1-|^s2-|^g3-|^f0-|^f4-d-/.test(n),
);

const tally = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const hex = new Map();
const rgba = new Map();
const fontSize = new Map();
const radius = new Map();
const letterSpacing = new Map();

for (const name of files) {
  const src = readFileSync(DIR + name, 'utf8');
  for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b/g)) tally(hex, m[0].toLowerCase());
  for (const m of src.matchAll(/rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)/g)) {
    const v = m[0].replace(/\s+/g, '');
    // 只统计"结构色"（alpha 为整档的），噪声太多
    if (/,\.[0-9]|,\d\.\d/.test(v)) continue;
    tally(rgba, v);
  }
  for (const m of src.matchAll(/font-size:\s*([\d.]+)px/g)) tally(fontSize, m[1]);
  for (const m of src.matchAll(/border-radius:\s*([^;]+)/g)) tally(radius, m[1].trim());
  for (const m of src.matchAll(/letter-spacing:\s*([^;]+)/g)) tally(letterSpacing, m[1].trim());
}

const top = (map, n, label) => {
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  console.log(`\n=== ${label}（出现次数 / 值）===`);
  for (const [v, c] of rows) console.log(`  ${String(c).padStart(4)}  ${v}`);
};

console.log(`统计范围：${String(files.length)} 页 —— ${files.join(' ')}`);
top(hex, 24, 'hex 颜色');
top(rgba, 14, '不透明 rgb(a) 结构色');
top(fontSize, 18, '字号 px');
top(radius, 10, '圆角');
top(letterSpacing, 8, '字距');
