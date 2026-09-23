import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { colors } from '../../design-system/tokens';

/**
 * V1 守卫（t35）——「深水暗底上的 CTA 必须有 ≥3:1 的可感知边界」。
 *
 * 分两层，**必须说清各自能证明什么**：
 * - **token 关系层**：证明色值关系正确（`DESIGN.md` L197/L403 的 ≥3:1）。
 *   其中「负向断言」把**设计理由**固化为机器可读：深底上直接用填充色作边界**必须**不足 3:1，
 *   这解释了为什么必须有承板/环 —— 将来谁改了 peacock/foam 数值，这里会告诉他破坏了前提。
 *   注意：本层**永远不依赖实现**（纯 token 数学），所以它不是 RED→GREEN 的那一层。
 * - **源码模式层**：证明三处 CTA 的 class 串里确实带上了边界装置与三重焦点区分。
 *   它守的是**实现模式**，**不是渲染像素**（jsdom 无渲染）——渲染由
 *   `docs/ui-review/visual-audit.md` §7 的像素采样脚本证明（t35 报告里的第 ② 层）。
 */

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const deep = colors['deep-current'];
const foam = colors.foam;

describe('深底 CTA 的面-控件对比度（token 关系）', () => {
  it('正向：实际使用的面对都 ≥3:1', () => {
    // 承板可辨 · CTA 与承板可辨 · 焦点环与面板可辨
    expect(contrast(foam, deep), 'foam 承板 vs 深底').toBeGreaterThanOrEqual(3);
    expect(contrast(colors.peacock, foam), 'peacock CTA vs foam 承板').toBeGreaterThanOrEqual(3);
    expect(contrast(colors.coral, foam), 'coral CTA vs foam 承板').toBeGreaterThanOrEqual(3);
    expect(contrast(colors['sea-glass'], deep), '焦点环 sea-glass vs 深底').toBeGreaterThanOrEqual(
      3,
    );
  });

  it('负向：深底上「直接用填充色当边界」必须 <3:1 —— 这正是承板/环存在的理由', () => {
    expect(contrast(colors.peacock, deep), 'peacock 直接压深底').toBeLessThan(3);
    expect(contrast(colors.coral, deep), 'coral 直接压深底').toBeLessThan(3);
  });
});

describe('深底 CTA 的边界装置（源码模式守卫：落地前应红、落地后转绿）', () => {
  const readPage = (file: string): string =>
    readFileSync(resolve(process.cwd(), 'src', 'pages', file), 'utf8').replace(/\s+/g, ' ');

  /** 标记之后 500 字符窗口（覆盖该元素自身的 className / cn(...) 串）。 */
  const windowAfter = (text: string, marker: string): string => {
    const at = text.indexOf(marker);
    expect(at, `未在页面源码里找到标记：${marker}`).toBeGreaterThanOrEqual(0);
    return text.slice(at, at + 500);
  };

  const CASES = [
    { file: 'home-page.tsx', marker: 'aria-label="捞一个漂流瓶"', where: '首页 hero' },
    { file: 'river-page.tsx', marker: 'aria-label="捞一个漂流瓶"', where: '河道·捞取' },
    { file: 'river-page.tsx', marker: 'aria-label="投下一支漂流瓶"', where: '河道·投下' },
  ] as const;

  for (const item of CASES) {
    it(`${item.where}：CTA 带紧贴边界的 foam 环（ring-2 ring-foam）`, () => {
      const window = windowAfter(readPage(item.file), item.marker);
      expect(window, '缺少紧贴控件的 foam 环（C2）').toMatch(/ring-2 ring-foam/);
    });

    it(`${item.where}：焦点态与静止态结构上不同（3px + sea-glass + offset）`, () => {
      const window = windowAfter(readPage(item.file), item.marker);
      expect(window, '焦点环未加粗到 3px').toMatch(/focus-visible:ring-\[3px\]/);
      expect(window, '焦点环不是 sea-glass').toMatch(/focus-visible:ring-sea-glass/);
      expect(window, '焦点环的 offset 不是深底').toMatch(/focus-visible:ring-offset-deep-current/);
    });
  }
});
