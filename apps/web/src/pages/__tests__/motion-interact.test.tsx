/**
 * t3 · 全站美化动效编排守卫（静态扫描 + DOM 结构两层）。
 *
 * 验证层声明（motion-web §8）：
 * - 能证明：编排类存在且在契约白名单内、stagger 单调封顶、参数只引 --motion-* token、
 *   新增 CSS 动画只动 transform/opacity、reduced-motion 逐项/全局兜底可达；
 * - 不能证明：屏幕观感与流畅度（jsdom 无布局/合成器）—— 由截图自查与真机确认。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/harness';
import { RiverPage } from '../river-page';
import { SeaPage } from '../sea-page';
import { NAV_ITEMS } from '../shell/routes';
import { TopNav } from '../shell/top-nav';

const PAGES_DIR = join(process.cwd(), 'src', 'pages');
const read = (name: string): string => readFileSync(join(PAGES_DIR, name), 'utf8');

/** 契约动效类白名单（与 motion-apply 同源：参数只允许经这些类落地）。 */
const WHITELIST = /\b(?:enter-rise|enter-fade|stagger-[1-4]|motion-fade-in|hover-lift|skeleton-shimmer|ripple-ring)\b/;
const MOTIONISH = /(?<![-\w])(?:enter|stagger|motion)-[a-z0-9-]+/g;

/** 断言文件里出现的每个动效类都在白名单（motion-safe/motion-reduce 是 Tailwind 内建变体）。 */
function expectWhitelisted(name: string, src: string): void {
  for (const cls of src.match(MOTIONISH) ?? []) {
    if (cls === 'motion-safe' || cls === 'motion-reduce') continue;
    expect(WHITELIST.test(cls), `${name}: 类 ${cls} 不在契约白名单`).toBe(true);
  }
}

describe('t3 · 河道页入场编排（目的 continuity/guidance：一屏四块按阅读序落位）', () => {
  const riverSrc = (): string => read('river-page.tsx');

  it('DOM：标题块先入 → RPM 块 → 捞取泊位 → 投下泊位，stagger 单调封顶 4 档', () => {
    const { container } = renderWithProviders(<RiverPage />, { handlers: [] });
    const header = container.querySelector('main > header');
    expect(header, '缺 header').not.toBeNull();
    const [titleBlock, rpmBlock] = Array.from(header?.children ?? []);
    expect(titleBlock?.className, '标题块入场').toContain('enter-rise');
    expect(rpmBlock?.className, 'RPM 块入场（stagger 第 1 档）').toContain('enter-rise');
    expect(rpmBlock?.className).toContain('stagger-1');
    const draw = container.querySelector('[data-anchor="river-draw"]');
    const cast = container.querySelector('[data-anchor="river-drop"]');
    expect(draw?.className, '捞取泊位入场（stagger 第 2 档）').toContain('enter-rise stagger-2');
    expect(cast?.className, '投下泊位入场（stagger 第 3 档）').toContain('enter-rise stagger-3');
    // 单调：title(0) < rpm(1) < draw(2) < cast(3)，封顶 ≤4（总入场感知 <600ms）
    expect(riverSrc(), 'stagger 不得超过 4 档').not.toMatch(/stagger-[5-9]/);
  });

  it('DOM：页脚用 enter-fade（锚在视口底，只淡入不位移 ⇒ 零溢出风险）', () => {
    const { container } = renderWithProviders(<RiverPage />, { handlers: [] });
    const footer = container.querySelector('main > footer');
    expect(footer?.className, '页脚淡入').toContain('enter-fade');
  });

  it('源码：河道页动效类全部在契约白名单，且无时长/缓动字面量', () => {
    const src = riverSrc();
    expectWhitelisted('river-page', src);
    expect(src, '时间字面量').not.toMatch(/\d+(?:\.\d+)?ms\b/);
    expect(src, '手写缓动').not.toMatch(/cubic-bezier/);
  });

  it('t2 锚法类原样在位（入场编排不得动定位合同）', () => {
    const src = riverSrc();
    for (const anchor of [
      'md:contents',
      'md:top-[60%]',
      'md:left-[121%]',
      'md:top-[110%]',
      'md:bottom-[3.33%]',
      'md:top-[max(10.67%,54px)]',
    ]) {
      expect(src, `锚法类 ${anchor} 被改动`).toContain(anchor);
    }
  });
});

describe('t3 · 公海大厅入场编排（guidance：meta → 页头 → 分区 → 列表 的阅读序落位）', () => {
  const seaSrc = (): string => read('sea-page.tsx');

  it('DOM：页头 meta 淡入、hero 主角 rise、分区错拍 1 档跟上', () => {
    const { container } = renderWithProviders(<SeaPage />, { handlers: [] });
    expect(container.querySelector('.topbar')?.className ?? '', 'meta 行淡入').toContain(
      'enter-fade',
    );
    expect(container.querySelector('header.hero')?.className ?? '', 'hero 主角 rise').toContain(
      'enter-rise',
    );
    expect(container.querySelector('.zones')?.className ?? '', '分区 stagger-1').toContain(
      'enter-rise stagger-1',
    );
  });

  it('源码：页脚 .foot 淡入；分页按钮 hover 微交互只引 --motion-* token、只动 transform', () => {
    const src = seaSrc();
    expect(src, '页脚淡入（guidance：数据区收尾落位）').toContain('<footer className="foot enter-fade">');
    const rule = /\.sea-hall \.pages button\{[^}]*\}/.exec(src)?.[0] ?? '';
    expect(rule, '分页按钮缺 token 过渡').toContain(
      'transition:transform var(--motion-hover-duration) var(--motion-entry-easing)',
    );
    expect(src, '分页 hover 缩放缺 token').toMatch(
      /\.sea-hall \.pages button:hover\{[^}]*scale\(var\(--motion-hover-scale\)\)/,
    );
  });

  it('源码：sea 动效类全在白名单，无时长/缓动字面量', () => {
    const src = seaSrc();
    expectWhitelisted('sea-page', src);
    expect(src, '时间字面量').not.toMatch(/\d+(?:\.\d+)?ms\b/);
    expect(src, '手写缓动').not.toMatch(/cubic-bezier/);
  });
});

describe('f1 · 短视口收起页脚说明行（t4 评审并入；cap/t2 锚法几何不动）', () => {
  it('mood-chips 说明段带 mood-note 类（DOM 与「只作展示」文案必须保留）', () => {
    const src = readFileSync(
      join(process.cwd(), 'src', 'features', 'bottle', 'mood-chips.tsx'),
      'utf8',
    );
    expect(src, '说明段缺 mood-note 钩子').toMatch(
      /className="[^"]*mood-note[^"]*"[\s\S]{0,80}心情标签这一版只作展示/,
    );
    expect(src, '诚实文案不许删').toContain('心情标签这一版只作展示');
  });

  it('river-motion.css：md+ 且视口高 <844px 收起 .mood-note；reduce 块仍在文件尾', () => {
    const css = read('river-motion.css');
    expect(css, '缺短视口收起规则').toMatch(
      /@media \(min-width: 768px\) and \(max-height: 844px\)\s*\{\s*\.mood-note\s*\{\s*display:\s*none\s*;/,
    );
    expect(css, 'reduced-motion 块必须保持在文件尾（river-page.test ④ 正则）').toMatch(
      /prefers-reduced-motion:\s*reduce\)[\s\S]*\}\s*$/,
    );
  });
});

describe('t3 · 批4-5 页头入场引拍（guidance：每页第一眼先落位，再交给内容 stagger）', () => {
  it('drift-log / song-picker 页头 enter-rise（时间轴/歌曲列表的 stagger 随后）', () => {
    expect(read('drift-log-page.tsx'), '漂流日志页头缺入场').toMatch(/<header className="enter-rise/);
    expect(read('song-picker-page.tsx'), '选歌页头缺入场').toMatch(
      /<header className="enter-rise/,
    );
  });

  it('admin / login 页头 enter-fade（主角让位：队列表单才是 rise 主角）', () => {
    expect(read('admin-page.tsx'), '审核台页头缺淡入').toMatch(/<header className="enter-fade">/);
    expect(read('login-page.tsx'), '登录页头缺淡入').toMatch(
      /<header className="enter-fade flex flex-col gap-4">/,
    );
  });
});

describe('t3 · 批6 shell（continuity：外壳只在应用落位时入场一次，路由切换不重播）', () => {
  it('top-nav 入口逐个淡入 + stagger 封顶 4；hover/激活指示线类原样在位', () => {
    renderWithProviders(<TopNav items={NAV_ITEMS} current="sea" />);
    const links = screen.getAllByRole('link');
    expect(links.length, '四入口常显').toBeGreaterThanOrEqual(4);
    expect(links[0]?.className ?? '', '首个入口淡入').toContain('enter-fade');
    expect(links[links.length - 1]?.className ?? '', '末个入口错拍（≤4 档）').toMatch(
      /stagger-[1-4]/,
    );
    const active = screen.getByRole('link', { name: '公海' });
    expect(active.className, 'hover 微动效不回退').toContain('hover:-translate-y-px');
    expect(active.querySelector('span')?.className ?? '', '激活指示线不回退').toContain('scale-x-100');
  });

  it('app-shell 登录闸门 enter-rise（闸门顶替内容时的 continuity 引拍）', () => {
    expect(read('shell/app-shell.tsx'), '闸门缺入场').toMatch(/<main className="enter-rise /);
  });
});
