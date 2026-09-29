/**
 * t6 · 重绘的漂流瓶本体（`BottleVessel`）—— 可断言契约（motion-web §8）。
 *
 * 为什么单独立测试：这只瓶是**捞起/抛下分镜的主角**，它必须
 * ① 是**画出来的物件**（瓶体曲线 / 软木塞 / 卷纸 / 高光 / 描边 / 阴影层次），
 *    不是「一个圆角矩形 + 一块木塞」的占位图形；
 * ② 颜色纪律：**源码无 hex**（页面层纪律对 design-system 不扫描 ⇒ 这里自己守），
 *    材质色一律 rgba 或 `var(--color-*)`（record-v1 token 同源）；
 * ③ 装饰零风险：`aria-hidden` + 不吃指针事件（不得挡住泊位按钮）。
 */
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BottleVessel } from '../bottle-vessel';

const SOURCE = join(process.cwd(), 'src', 'design-system', 'bottle-vessel.tsx');
const INDEX = join(process.cwd(), 'src', 'design-system', 'index.ts');
const source = (): string => readFileSync(SOURCE, 'utf8');

describe('BottleVessel · 造型（不再是占位图形）', () => {
  it('瓶体是曲线剪影（肩部收放）而不是一个圆角矩形', () => {
    const src = source();
    // 软木塞 / 唇口 / 瓶身 三件都在，且瓶身是 <path> —— 剪影常量里必须有曲线段（C 肩线 / Q 圆底）
    expect(src, '缺 data-part="vessel-body"').toContain('data-part="vessel-body"');
    expect(src, '瓶身必须是 path 元素').toMatch(/<path\s+data-part="vessel-body"\s+d=\{/);
    expect(src, '剪影缺肩线曲线（C）').toContain('C32 84 8 92');
    expect(src, '剪影缺圆底曲线（Q）').toContain('Q8 211 23 211');
    expect(src, '缺软木塞').toContain('data-part="vessel-cork"');
    expect(src, '缺唇口（瓶颈环）').toContain('data-part="vessel-lip"');
  });

  it('内部有卷纸/内容物细节（纸 + 纸上字迹 + 系绳）', () => {
    const src = source();
    expect(src, '缺卷纸').toContain('data-part="vessel-scroll"');
    expect(src, '卷纸上要有字迹线').toContain('data-part="vessel-scroll-ink"');
    expect(src, '卷纸要有系绳（coral 单强调色）').toContain('data-part="vessel-scroll-thread"');
  });

  it('材质有层次：玻璃渐变 + 高光 + 内阴影/接触辉光 + 发丝描边', () => {
    const src = source();
    expect(src, '缺玻璃渐变').toContain('vesselGlass');
    expect(src, '缺高光').toContain('data-part="vessel-highlight"');
    expect(src, '缺发丝描边').toContain('data-part="vessel-rim"');
    expect(src, '缺接触辉光/阴影层').toContain('data-part="vessel-glow"');
  });
});

describe('BottleVessel · 纪律（record-v1）', () => {
  it('源码无 hex（材质色只用 rgba / var(--color-*)）', () => {
    expect(source(), '瓶体源码出现 hex 色值').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('渲染结果无 hex、且是纯装饰（aria-hidden + 不吃指针）', () => {
    const { container } = render(<BottleVessel />);
    const svg = container.querySelector('svg');
    expect(svg, '没有渲染 svg').not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.outerHTML ?? '', '渲染结果出现 hex').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg?.getAttribute('pointer-events'), '装饰不得吃指针事件').toBe('none');
  });

  it('从设计系统出口导出（页面只从 barrel 取件）', () => {
    expect(readFileSync(INDEX, 'utf8'), 'index.ts 未导出 BottleVessel').toContain('BottleVessel');
  });
});
