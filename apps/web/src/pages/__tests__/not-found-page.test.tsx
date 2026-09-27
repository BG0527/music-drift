import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/harness';
import { NotFoundPage } from '../not-found-page';

/**
 * 404 的装置是「**划伤跳针**」（record-v1，`docs/impl-plan-record-v1.md` §5.1）：
 * 一条划痕**横断标题**，划痕的**豁口**上写着「这条水路不存在」，右侧立着唱针（跳针）。
 *
 * 这一页在 `one-screen-check.mjs` 里没有声明锚点（`anchors: []`），所以机器只能证明
 * 「不横向溢出 / 桌面一屏」，**证明不了装置还在** —— 装置由这里钉住。
 * 与 `deep-surface-cta.test.ts` 同一手法：断言**结构**，不假装断言像素。
 */
const device = (container: HTMLElement, name: string): Element | null =>
  container.querySelector(`[data-device="${name}"]`);

describe('404（划伤跳针）', () => {
  it('划痕横断标题：划痕与标题共用同一个行盒，左右两段各自贴边', () => {
    const { container } = renderWithProviders(<NotFoundPage />);
    const row = device(container, 'scratch-row');
    const scratch = device(container, 'scratch');
    const before = device(container, 'scratch-before');
    const after = device(container, 'scratch-after');
    expect(row, '划痕行盒缺失').not.toBeNull();
    expect(before, '划痕左段缺失').not.toBeNull();
    expect(after, '划痕右段缺失').not.toBeNull();

    // 「横断标题」= 标题与划痕在同一个行盒里（不是标题下面另起一根装饰线）
    const title = screen.getByRole('heading', { name: '找不到这一页' });
    expect(row?.contains(title)).toBe(true);
    expect(row?.contains(device(container, 'scratch-notch'))).toBe(true);
    // 划痕从左边缘出发、到右边缘收尾
    expect(before?.className).toContain('left-0');
    expect(after?.className).toContain('right-0');
    // 划痕是装饰层：绝对定位（零布局高度）⇒ 不会把标题挤走
    expect(scratch?.className).toContain('absolute');
    expect(scratch?.getAttribute('aria-hidden')).toBe('true');
  });

  it('豁口写着「这条水路不存在」（划痕断在这里，不是断在一根装饰线上）', () => {
    const { container } = renderWithProviders(<NotFoundPage />);
    const notch = device(container, 'scratch-notch');
    expect(notch).toHaveTextContent('这条水路不存在');
    // 豁口是**真内容**（可被读屏读到），不是 aria-hidden 的装饰
    expect(notch?.getAttribute('aria-hidden')).toBeNull();
  });

  it('跳针（唱针）立在划痕右侧', () => {
    const { container } = renderWithProviders(<NotFoundPage />);
    const stylus = device(container, 'stylus');
    expect(stylus, '跳针缺失').not.toBeNull();
    expect(stylus?.getAttribute('aria-hidden')).toBe('true');
    expect(stylus?.className).toContain('right-0');
  });

  it('说明与三个出口都在（回首页 / 去河道 / 去公海）', () => {
    renderWithProviders(<NotFoundPage />);
    expect(screen.getByText(/这个地址可能是旧的/)).toBeInTheDocument();
    expect(screen.getByText('也可以换个入口继续：')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '回首页' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '去河道捞一个漂流瓶' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '去公海听完成的作品' })).toBeInTheDocument();
  });

  it('装饰一律不进无障碍树、不吃指针事件（读屏不念、点击不挡）', () => {
    const { container } = renderWithProviders(<NotFoundPage />);
    for (const name of ['scratch', 'stylus', 'drifted-bottle']) {
      const node = device(container, name);
      expect(node, `${name} 缺失`).not.toBeNull();
      expect(node?.getAttribute('aria-hidden'), `${name} 必须 aria-hidden`).toBe('true');
      expect(node?.className, `${name} 必须 pointer-events-none`).toContain('pointer-events-none');
    }
  });
});

/**
 * 404 · **逐值复核**（`docs/impl-plan-record-v1.md` §5.5：精确值一律以同名 `.html` 为准）。
 * 设计稿 = `docs/ui-review/design-explore/p-404-record.html`。
 * 样式值用源码级断言（jsdom 无渲染），装置/文案用 DOM 断言；整改前这些断言会红。
 */
describe('404 · 逐值对齐 p-404-record.html', () => {
  const source = (): string =>
    readFileSync(join(process.cwd(), 'src', 'pages', 'not-found-page.tsx'), 'utf8').replace(
      /\s+/g,
      ' ',
    );

  it('标题 62px（设计稿 h1.torn），不是 56px', () => {
    const src = source();
    expect(src, 'h1 桌面档 62px').toContain('md:text-[3.875rem]');
    expect(src).not.toContain('md:text-[3.5rem]');
  });

  it('豁口 15.5px/.12em；说明 15.5px/1.9、宽 540px（设计稿 .hurt/.sub）', () => {
    const src = source();
    expect(src, '.hurt 15.5px/.12em').toContain('text-[0.96875rem] tracking-[0.12em]');
    expect(src, '.sub 15.5px/1.9').toContain('text-[0.96875rem] leading-[1.9]');
    expect(src, '.sub 宽 540px').toContain('max-w-[540px]');
  });

  it('元信息 paper/.5；404 状态 muted/.85；下沉半句 paper/.84（设计稿三处透明度）', () => {
    const src = source();
    expect(src, '.cat 是 rgba(243,249,250,.5) = paper/50').toContain(
      "const META = 'text-[0.6875rem] tracking-[0.24em] text-paper/50'",
    );
    expect(src, '.status = muted/.85').toContain('text-[2.125rem] leading-none text-muted/85');
    expect(src, '.dn 半句 = paper/.84').toContain('text-paper/[0.84]');
    expect(src, '跳针小注也从 muted/70 改到 paper/.5').not.toContain('text-muted/70');
  });

  it('回首页下划线 5px、余线 684px、入口间距 44px、链接下划线偏移 5px', () => {
    const src = source();
    expect(src, '.back padding-bottom 5px').toContain('pb-[5px]');
    expect(src, '.rule 宽 684px').toContain('max-w-[42.75rem]');
    expect(src, '.links gap 44px').toContain('gap-x-11');
    expect(src, 'a 的 underline-offset 5px').toContain('underline-offset-5');
  });

  it('划痕两段的亮度对齐设计稿的水面线（左 ≈.3、右 ≈.55，不是实心 .9）', () => {
    const src = source();
    expect(src, '左段 ≈ .3').toContain('opacity-[0.3]');
    expect(src, '右段 ≈ .55').toContain('opacity-[0.55]');
    expect(src).not.toContain('opacity-90');
    expect(src).not.toContain('opacity-60');
  });

  it('关键块有 data-anchor（划痕行盒）', () => {
    const { container } = renderWithProviders(<NotFoundPage />);
    expect(container.querySelector('[data-anchor="notfound-scratch"]')).not.toBeNull();
  });
});

/**
 * 照稿水路纹理组（用户返工令 2026-09-27；清单 = docs/review-404-blocks.md §1-4）。
 * 「水从断口漏干」的具象层：水面短波 flows、断口漏滴 drips、干裂纹 cracks、
 * 伤口压暗 edge、断口前攒光 lip、干河床沟槽残影 ghost。
 */
describe('404：照稿水路纹理组', () => {
  const readSource = (): string =>
    readFileSync(join(process.cwd(), 'src', 'pages', 'not-found-page.tsx'), 'utf8');

  it('六个纹理块的 data-device 都在（稿 §1-4 映射）', () => {
    const src = readSource();
    for (const name of ['water-flows', 'water-drips', 'water-cracks', 'water-edge', 'water-lip', 'water-ghost']) {
      expect(src, `缺 ${name}`).toContain(`data-device="${name}"`);
    }
  });

  it('计数照稿：水面短波 4 条、断口漏滴 7 道、干裂纹 8 条', () => {
    const { container } = renderWithProviders(<NotFoundPage />);
    expect(container.querySelectorAll('[data-device="water-flows"] > i').length, 'flows ×4').toBe(4);
    expect(container.querySelectorAll('[data-device="water-drips"] > span').length, 'drips ×7').toBe(7);
    expect(container.querySelectorAll('[data-device="water-cracks"] > i').length, 'cracks ×8').toBe(8);
  });

  it('漏滴的水珠只挂 6 道（稿第 5 道 832,362 无珠）', () => {
    const { container } = renderWithProviders(<NotFoundPage />);
    expect(container.querySelectorAll('[data-device="water-drips"] > i').length, 'droplet ×6').toBe(6);
  });

  it('纹理全部是装饰层：aria-hidden + 绝对定位（零布局）', () => {
    const { container } = renderWithProviders(<NotFoundPage />);
    for (const name of ['water-flows', 'water-drips', 'water-cracks', 'water-edge', 'water-lip', 'water-ghost']) {
      const node = device(container, name);
      expect(node, `${name} 缺失`).not.toBeNull();
      expect(node?.getAttribute('aria-hidden'), `${name} 必须 aria-hidden`).toBe('true');
      expect(node?.className, `${name} 必须绝对定位`).toContain('absolute');
    }
  });
});
