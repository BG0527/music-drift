import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/harness';
import { NAV_ITEMS } from './routes';
import { TopNav } from './top-nav';

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('顶部 top-nav（页面上方常显导航，替换浮动收起式 demo-nav）', () => {
  it('常显：不点任何按钮就列出四个入口，收起触发器不存在', () => {
    renderWithProviders(<TopNav items={NAV_ITEMS} current="river" />);
    expect(screen.getByRole('navigation', { name: '站内导航' })).toBeInTheDocument();
    for (const item of NAV_ITEMS) {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute('href', item.href);
    }
    // 常显 ⇒ 没有展开/收起按钮（旧 demo-nav 的触发器必须消失）
    expect(screen.queryByRole('button', { name: /站内导航/ })).toBeNull();
  });

  it('当前页 aria-current="page"，非当前页没有', () => {
    renderWithProviders(<TopNav items={NAV_ITEMS} current="sea" />);
    expect(screen.getByRole('link', { name: '公海' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '河道' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: '我的' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: '设置' })).not.toHaveAttribute('aria-current');
  });

  it('零布局：根节点 fixed 贴顶、水平居中窄条（不增加文档流高度）', () => {
    renderWithProviders(<TopNav items={NAV_ITEMS} current="river" />);
    const root = screen.getByTestId('top-nav');
    expect(root.className).toMatch(/\bfixed\b/);
    expect(root.className).toMatch(/\binset-x-0\b/);
    expect(root.className).toMatch(/\btop-\[/);
    expect(root.className).toMatch(/\bjustify-center\b/);
    // nav 与链接全部挂在 fixed 根内 ⇒ 不进文档流
    expect(root).toContainElement(screen.getByRole('navigation', { name: '站内导航' }));
    expect(root).toContainElement(screen.getByRole('link', { name: '河道' }));
  });

  it('热区 ≥44px：每个入口带 min-h-11 与 whitespace-nowrap（375 下不竖排）', () => {
    renderWithProviders(<TopNav items={NAV_ITEMS} current="river" />);
    for (const item of NAV_ITEMS) {
      const className = screen.getByRole('link', { name: item.label }).className;
      expect(className).toMatch(/\bmin-h-11\b/);
      expect(className).toMatch(/\bwhitespace-nowrap\b/);
    }
  });

  it('微动效：链接 hover 抬升类存在 + 激活指示线 scaleX，时长/缓动只引用 motion token', () => {
    renderWithProviders(<TopNav items={NAV_ITEMS} current="sea" />);
    const active = screen.getByRole('link', { name: '公海' });
    // 类存在：hover 轻微上移（只动 transform）
    expect(active.className).toMatch(/\bhover:-translate-y-px\b/);
    // token 引用：禁写死 ms / cubic-bezier / ease-out 档
    expect(active.className).toMatch(/var\(--motion-hover-duration\)/);
    expect(active.className).toMatch(/var\(--motion-entry-easing\)/);
    // 激活项指示线 scale-x-100、非激活 scale-x-0（scaleX 过渡）
    expect(active.querySelector('span')?.className).toMatch(/\bscale-x-100\b/);
    const idle = screen.getByRole('link', { name: '河道' });
    expect(idle.querySelector('span')?.className).toMatch(/\bscale-x-0\b/);
  });

  it('美化 v2（用户看图打回「太丑」）：无框无底纯文字链，15px 正常字距，激活 coral + 指示线', () => {
    /**
     * ⚠️ 断言原文 → 新文（2026-09-27 看图打回）：
     * 原文：nav 必须 `bg-water-void + border-hairline + rounded-base`（居中药丸框），
     *       链接 11px/.24em meta 字 + border-coral。
     * 新文：参考稿/站外同款顶栏 —— **去掉方框与底**，纯文字链 15px 正常字距；
     *       激活项 text-coral + font-medium + scaleX 指示线（2px，贴文字下方），无 border 类。
     */
    renderWithProviders(<TopNav items={NAV_ITEMS} current="sea" />);
    const bar = screen.getByRole('navigation', { name: '站内导航' });
    expect(bar.className, '不再要方框底色').not.toMatch(/\bbg-water-void\b/);
    expect(bar.className, '不再要描边').not.toMatch(/\bborder-hairline\b/);
    expect(bar.className, '不再要药丸圆角容器').not.toMatch(/\brounded-base\b/);
    const active = screen.getByRole('link', { name: '公海' });
    expect(active.className).toMatch(/\btext-coral\b/);
    expect(active.className).toMatch(/\bfont-medium\b/);
    expect(active.className, '15px 正常字距（参考图语态）').toMatch(/text-\[0\.9375rem\]/);
    expect(active.className, '不再是 11px/.24em meta 药丸字').not.toMatch(/tracking-\[0\.24em\]/);
    expect(active.className, '指示线由 span 承担，链接本体不再带 border 类').not.toMatch(/\bborder-coral\b/);
    const indicator = active.querySelector('span');
    expect(indicator?.className, '指示线 2px 贴文字下').toMatch(/\bh-\[2px\]/);
    expect(indicator?.className).toMatch(/\bscale-x-100\b/);
    const idle = screen.getByRole('link', { name: '河道' });
    expect(idle.className).not.toMatch(/\btext-coral\b/);
    expect(idle.querySelector('span')?.className).toMatch(/\bscale-x-0\b/);
  });
});
