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
  it('全站无侧边栏/底栏 DOM：只有页面上方常显的 top-nav（fixed 零布局），外壳不自带 <main>', () => {
    const mock = installFetchMock([]);
    try {
      const { container } = renderWithProviders(
        <AppShell current="river">
          <h1>暖流河道</h1>
        </AppShell>,
      );
      // SidebarNav / BottomNav 的 DOM（各自带专属 landmark 名）必须消失
      expect(screen.queryByRole('navigation', { name: '主导航' })).toBeNull();
      expect(screen.queryByRole('navigation', { name: '底部导航' })).toBeNull();
      // 顶栏存在且 fixed（不进文档流 ⇒ 零布局），入口常显、无需点开
      const topNav = screen.getByTestId('top-nav');
      expect(topNav.className).toMatch(/\bfixed\b/);
      expect(screen.getByRole('navigation', { name: '站内导航' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '河道' })).toBeInTheDocument();
      // 常显 ⇒ 旧浮动收起式触发器（展开/收起按钮）不得存在
      expect(screen.queryByRole('button', { name: /站内导航/ })).toBeNull();
      // 结构约定 1：shell 不渲染 <main>（每个页面自带）
      expect(container.querySelector('main')).toBeNull();
    } finally {
      mock.restore();
    }
  });

  it('顶栏四入口常显，当前页高亮，站内导航 landmark 只此一个', () => {
    const mock = installFetchMock([]);
    try {
      renderWithProviders(
        <AppShell current="river">
          <h1>暖流河道</h1>
        </AppShell>,
      );
      expect(screen.getAllByRole('navigation')).toHaveLength(1);
      for (const label of ['河道', '公海', '我的', '设置']) {
        expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
      }
      expect(screen.getByRole('link', { name: '河道' })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('link', { name: '公海' })).not.toHaveAttribute('aria-current');
      // 普通（未登录）会话不露出审核台死入口
      expect(screen.queryByRole('link', { name: '审核台' })).toBeNull();
    } finally {
      mock.restore();
    }
  });

  it('管理员会话在四入口之外多出「审核台」', async () => {
    const mock = installFetchMock([]);
    try {
      renderWithProviders(
        <AppShell current="admin">
          <h1>审核台</h1>
        </AppShell>,
        {
          handlers: [
            {
              path: '/api/auth/me',
              respond: () => ({
                body: {
                  user: {
                    id: '11111111-1111-4111-8111-111111111111',
                    handle: 'boss',
                    email: null,
                    role: 'ADMIN',
                  },
                  expiresAt: '2030-01-01T00:00:00.000Z',
                },
              }),
            },
          ],
        },
      );
      expect(await screen.findByRole('link', { name: '审核台' })).toHaveAttribute(
        'href',
        '/admin',
      );
      expect(screen.getByRole('link', { name: '审核台' })).toHaveAttribute('aria-current', 'page');
      for (const label of ['河道', '公海', '我的', '设置']) {
        expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
      }
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
      // 链接常显在顶栏里：直接点
      fireEvent.click(screen.getByRole('link', { name: /公海/ }));
      await waitFor(() => {
        expect(screen.getByTestId('path')).toHaveTextContent('/sea');
      });
      expect(window.location.pathname).toBe('/sea');
    } finally {
      mock.restore();
    }
  });

  it('未登录时包裹受保护内容会提示并给登录出口（不静默跳走），闸门自带 <main>` 地标', async () => {
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
      const { container } = renderWithProviders(
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
      // 结构约定 2：闸门替代 children 时自己包一层 <main> 保证地标
      expect(container.querySelector('main')).not.toBeNull();
      expect(screen.getByRole('main')).toBeInTheDocument();
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
