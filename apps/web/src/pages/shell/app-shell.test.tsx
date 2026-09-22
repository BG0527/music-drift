import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { installFetchMock, renderWithProviders } from '../../test/harness';
import { AppShell } from './app-shell';
import { RouterProvider } from './router';
import { useRoute } from './router-context';

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('外壳与导航', () => {
  it('桌面侧栏与移动底栏都渲染四入口，并按当前页高亮', () => {
    const mock = installFetchMock([]);
    try {
      renderWithProviders(
        <AppShell current="river">
          <h1>暖流河道</h1>
        </AppShell>,
      );
      expect(screen.getAllByRole('navigation')).toHaveLength(2);
      const riverLinks = screen.getAllByRole('link', { name: /河道/ });
      expect(riverLinks).toHaveLength(2);
      expect(riverLinks[0]).toHaveAttribute('aria-current', 'page');
      expect(screen.getAllByRole('link', { name: /公海/ })[0]).not.toHaveAttribute('aria-current');
    } finally {
      mock.restore();
    }
  });

  it("外壳容器用 min-h-[100dvh]，不用被禁的 h-screen（DESIGN.md Do&Don't）", () => {
    const mock = installFetchMock([]);
    try {
      const { container } = renderWithProviders(
        <AppShell current="sea">
          <p>公海大厅</p>
        </AppShell>,
      );
      expect(container.innerHTML).toContain('min-h-[100dvh]');
      expect(container.innerHTML).not.toContain('h-screen');
    } finally {
      mock.restore();
    }
  });

  it('点站内链接走客户端路由（不整页刷新）', async () => {
    const mock = installFetchMock([]);
    try {
      function Probe() {
        return <span data-testid="path">{useRoute().path}</span>;
      }
      renderWithProviders(
        <AppShell current="river">
          <Probe />
        </AppShell>,
      );
      fireEvent.click(screen.getAllByRole('link', { name: /公海/ })[0]!);
      await waitFor(() => {
        expect(screen.getByTestId('path')).toHaveTextContent('/sea');
      });
      expect(window.location.pathname).toBe('/sea');
    } finally {
      mock.restore();
    }
  });

  it('未登录时包裹受保护内容会提示并给登录出口（不静默跳走）', async () => {
    const mock = installFetchMock([
      {
        path: '/api/auth/me',
        respond: () => ({
          status: 401,
          body: { error: { message: '请先登录再继续。', violations: [] } },
        }),
      },
    ]);
    try {
      renderWithProviders(
        <AppShell current="mine" requireLogin>
          <h1>我的</h1>
        </AppShell>,
      );
      expect(await screen.findByText(/需要先登录/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '去登录' })).toHaveAttribute(
        'href',
        expect.stringContaining('/login'),
      );
      expect(screen.queryByRole('heading', { name: '我的' })).not.toBeInTheDocument();
    } finally {
      mock.restore();
    }
  });
});

describe('路由 Provider', () => {
  it('浏览器导航（popstate）后重新匹配；未知路径落到 notFound', async () => {
    window.history.replaceState({}, '', '/nope/deep');
    function Probe() {
      return <span data-testid="name">{useRoute().name}</span>;
    }
    render(
      <RouterProvider initialPath="/river">
        <Probe />
      </RouterProvider>,
    );
    expect(screen.getByTestId('name')).toHaveTextContent('river');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(() => {
      expect(screen.getByTestId('name')).toHaveTextContent('notFound');
    });
  });
});
