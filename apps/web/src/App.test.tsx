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

  it('默认落在首页，未登录也能浏览（不整页重定向）', async () => {
    const mock = installFetchMock([
      {
        path: '/api/sea?zone=COMPLETED&limit=30',
        respond: () => ({ body: { items: [], nextCursor: null } }),
      },
    ]);
    try {
      render(<App />);
      expect(await screen.findByRole('heading', { name: '暖流河道' })).toBeInTheDocument();
      // 返工令（2026-09-27 二轮）：侧边栏/底栏已删，导航 = 页面上方常显 top-nav（四入口）
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
