import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 文案一致性守卫（可执行版）：**用户可见文案里不得再出现「15–30 秒」**。
 *
 * ## 为什么要有这条
 * 用户第 4 条把录制时长改成"每段固定时长（如 22.0 秒）"之后，代码改了、**文案没跟着改**：
 * 河道页、瓶子页、登录页以及错误兜底里还写着"录 15–30 秒"。这类"规则换了、文案没换"的问题
 * 自动化测试全绿也照样存在 —— 因为没人断言过文案。这条守卫把它变成会红的测试。
 *
 * ## 关键：区分「注释里的历史说明」与「用户可见文本」
 * 源码注释里保留历史口径是**允许且必要**的（我们靠它解释"为什么改过"）。
 * 因此扫描前要**真正去掉注释**，而不是简单 grep：
 * - 块注释 `/* … *\/` 整段去掉；
 * - 行注释 `// …` 从注释起点到行尾去掉 —— 但**字符串里的 `//` 不算注释**
 *   （例如 `'https:// 或 localhost'`，早期简单实现会把这一行后半段整段吃掉，造成漏报）。
 *
 * 下面先给扫描器本身两个方向的用例（注释里的命中**不报**、可见文本里的命中**报**），
 * 再对整个前端文案层做一次真实扫描 —— 反向控制因此是"可执行的"，而不是"我觉得它能红"。
 */
const WEB_SRC = join(process.cwd(), 'src');

/** 扫描范围 = 用户可见文案所在的层（设计系统与音频层有自己的守卫，不在本文件范围）。 */
const OWNED_DIRS = [
  join(WEB_SRC, 'pages'),
  join(WEB_SRC, 'features', 'bottle'),
  join(WEB_SRC, 'features', 'api'),
  join(WEB_SRC, 'features', 'session'),
];

/** 旧口径：`15–30` / `15-30` / `15 ~ 30`（中文连接号、连字符、波浪号）。 */
const STALE_COPY = /15\s*[–\-~～]\s*30/;

/**
 * 去掉注释后的代码。
 *
 * 逐字符扫描（不是正则）：只有这样才能分辨"注释里的 `//`"与"字符串里的 `//`"。
 */
export function stripComments(source: string): string {
  let out = '';
  let index = 0;
  let quote: '"' | "'" | '`' | null = null;

  while (index < source.length) {
    const char = source[index] as string;
    const next = source[index + 1];

    if (quote !== null) {
      out += char;
      if (char === '\\') {
        // 转义序列整体跳过，免得把 `\'` 当成字符串结束
        out += next ?? '';
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      out += char;
      index += 1;
      continue;
    }
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        index += 1;
      }
      index += 2;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

function collectSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules') collectSources(full, acc);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    acc.push(full);
  }
  return acc;
}

const SOURCES = OWNED_DIRS.flatMap((dir) => collectSources(dir));

describe('文案守卫的扫描器本身（反向控制的两个方向）', () => {
  it('注释里的历史口径**不算违规**（否则 20 多处历史说明全会判红）', () => {
    const source = `
      /** 以前是 15–30 秒动态区间，t29 起改为每段固定时长。 */
      // 也被 15-30 秒的旧口径困扰过
      export const label = '录下第 1 段';
    `;
    expect(STALE_COPY.test(stripComments(source))).toBe(false);
  });

  it('可见文案里的旧口径**必须被判出来**', () => {
    const source = `export const label = '录下第 1 段 15–30 秒，然后投进河道';`;
    expect(STALE_COPY.test(stripComments(source))).toBe(true);
  });

  it('字符串里的 `//` 不会被当成注释（否则整行后半段被吃掉 ⇒ 漏报）', () => {
    const source = `const hint = '需要 https:// 或 localhost'; const label = '录 15-30 秒';`;
    const stripped = stripComments(source);
    expect(stripped).toContain('https://');
    expect(STALE_COPY.test(stripped)).toBe(true);
  });
});

describe('文案守卫：用户可见文案不得出现「15–30 秒」旧口径', () => {
  it('页面与文案层全量扫描：0 处命中', () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      const stripped = stripComments(readFileSync(file, 'utf8'));
      const lines = stripped.split('\n');
      lines.forEach((line, index) => {
        if (STALE_COPY.test(line)) {
          offenders.push(`${relative(WEB_SRC, file).split(sep).join('/')}:${String(index + 1)}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
