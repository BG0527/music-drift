import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { installFetchMock } from './test/harness';

/**
 * 入口装配冒烟：真实 App（真 Provider 链）在未登录 + 空公海的情况下也要渲染出首页，
 * 不允许出现"Provider 顺序写错就白屏"这类只在浏览器里才暴露的问题。
 */
describe('App 入口', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  /**
   * ⚠️ 断言原文 → 新文（用户 t12 裁决，覆盖旧「默认落在河道」口径）：
   * 原文：默认落在首页（`/` 规范化为 /river），未登录也能浏览河道。
   * 新文：`/` 直接渲染 landing（翻页式介绍页）；未登录浏览的是 landing，
   *      功能页（/river、/sea、/settings）访客进 /login（守卫见 landing-page.test）。
   */
  it('默认落在 landing（根路由直达介绍页，不整页重定向）', async () => {
    const mock = installFetchMock([
      {
        path: '/api/sea?zone=COMPLETED&limit=30',
        respond: () => ({ body: { items: [], nextCursor: null } }),
      },
    ]);
    try {
      render(<App />);
      expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
      expect(window.location.pathname).toBe('/');
      expect(screen.getByTestId('top-nav')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '河道' })).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: '主导航' })).not.toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: '底部导航' })).not.toBeInTheDocument();
    } finally {
      mock.restore();
    }
  });

  it('未知路径落到「找不到这一页」，而不是白屏', async () => {
    window.history.replaceState({}, '', '/nope/deep');
    const mock = installFetchMock([]);
    try {
      render(<App />);
      expect(await screen.findByRole('heading', { name: '找不到这一页' })).toBeInTheDocument();
    } finally {
      mock.restore();
    }
  });
});
