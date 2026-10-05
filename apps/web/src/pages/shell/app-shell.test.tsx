import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { installFetchMock, renderWithProviders } from '../../test/harness';
import { USER_A } from '../../test/fixtures';
import { LoginPage } from '../login-page';
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
                  // W21 账号契约：AuthUserSchema strict —— 正名 account 必填、无 email 字段
                  user: {
                    id: '11111111-1111-4111-8111-111111111111',
                    handle: 'boss',
                    account: 'boss',
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

  /**
   * t28（用户裁决）：landing 独立于导航栏 —— 顶栏零「介绍」入口，
   * 普通会话导航恰为 河道/公海/我的/设置（admin 会话 +审核台，见上一个用例）。
   * 源码与渲染双证：源码不得再出现 INTRO_NAV_ITEM / label '介绍'。
   */
  it('t28：顶栏零「介绍」入口（渲染产物恰四链接 + 源码零 INTRO_NAV_ITEM）', () => {
    const mock = installFetchMock([]);
    try {
      renderWithProviders(
        <AppShell current="river">
          <h1>暖流河道</h1>
        </AppShell>,
      );
      expect(screen.queryByRole('link', { name: '介绍' }), '顶栏不得有「介绍」入口').toBeNull();
      const nav = screen.getByRole('navigation', { name: '站内导航' });
      expect(
        within(nav).getAllByRole('link').map((link) => (link.textContent ?? '').trim()),
        '普通会话导航恰为四入口、顺序不乱',
      ).toEqual(['河道', '公海', '我的', '设置']);

      const source =
        readFileSync(resolve(process.cwd(), 'src', 'pages', 'shell', 'app-shell.tsx'), 'utf8') +
        readFileSync(resolve(process.cwd(), 'src', 'pages', 'shell', 'routes.ts'), 'utf8');
      expect(source, '源码零 INTRO_NAV_ITEM').not.toMatch(/INTRO_NAV_ITEM/);
      expect(source, "源码零 label '介绍'").not.toMatch(/label:\s*'介绍'/);
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

  /**
   * ⚠️ 断言原文 → 新文（用户本轮裁决，覆盖 2026-09-27 旧口径）：
   * 原文：就地显示「需要先登录」+「去登录」出口（不静默跳走）。
   * 新文：会话落定后**自动跳** /login?next=原路径（死端空态与手动出口按 YAGNI 清理）；
   *      闸门帧给骨架，<main> 地标结构约定保留。
   */
  it('未登录包裹受保护内容：落定后自动跳登录（覆盖旧「不静默跳走」），闸门帧给骨架且自带 <main>` 地标', async () => {
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
        { route: '/mine' },
      );
      // 闸门帧（loading 与跳转前）：骨架 + 自包 <main> 地标（结构约定 2 保留）
      expect(container.querySelector('main')).not.toBeNull();
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
      // 落定后：自动跳登录页并带 next= 原路径，不再就地给出口
      await waitFor(() => {
        expect(window.location.pathname).toBe('/login');
      });
      expect(window.location.search).toBe(`?next=${encodeURIComponent('/mine')}`);
      expect(screen.queryByRole('heading', { name: '我的' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: '去登录' })).toBeNull();
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

/**
 * requireLogin 未登录自动跳转 —— 用户本轮裁决，**覆盖** 2026-09-27「不静默跳走」旧口径。
 * 四条分支各自可断言：guest 跳 /unavailable 跳 /loading 不跳 /authed 不动；
 * next 链路端到端 = 本文件断言跳转携带 next=原路径 + login-page.test 断言登录后带回。
 */
describe('requireLogin 自动跳转（用户本轮裁决，覆盖旧「不静默跳走」）', () => {
  it('guest（401）访问 /settings：loading 保持骨架不提前跳，落定后自动跳 /login?next=原路径', async () => {
    renderWithProviders(
      <AppShell current="settings" requireLogin>
        <h1>设置</h1>
      </AppShell>,
      { route: '/settings' },
    );
    // 会话 loading 首帧：闸门骨架在、children 未渲染、未提前跳
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]'), 'loading 保持骨架').not.toBeNull();
    expect(screen.queryByRole('heading', { name: '设置' })).toBeNull();
    expect(window.location.pathname, 'loading 不提前跳').toBe('/settings');
    // 落定（401 → guest）：自动跳登录页并带 next= 原路径
    await waitFor(() => {
      expect(window.location.pathname).toBe('/login');
    });
    expect(window.location.search).toBe(`?next=${encodeURIComponent('/settings')}`);
    expect(screen.queryByText(/需要先登录/), '旧死端文案已清').toBeNull();
    expect(screen.queryByRole('link', { name: '去登录' }), '旧手动出口已清').toBeNull();
  });

  it('guest 访问 /admin 同样自动跳（requireLogin 三页一视同仁）', async () => {
    renderWithProviders(
      <AppShell current="admin" requireLogin>
        <h1>审核台</h1>
      </AppShell>,
      { route: '/admin' },
    );
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(window.location.search).toBe(`?next=${encodeURIComponent('/admin')}`);
    expect(screen.queryByRole('heading', { name: '审核台' })).toBeNull();
  });

  it('读不到登录态（5xx unavailable）→ 同样自动跳，不再死端空态', async () => {
    renderWithProviders(
      <AppShell current="mine" requireLogin>
        <h1>我的</h1>
      </AppShell>,
      {
        route: '/me',
        handlers: [
          {
            path: '/api/auth/me',
            respond: () => ({
              status: 503,
              body: { error: { message: '服务器暂时没有回应。', violations: [] } },
            }),
          },
        ],
      },
    );
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(window.location.search).toBe(`?next=${encodeURIComponent('/me')}`);
    expect(screen.queryByText(/读不到你的登录状态/), '死端空态已清').toBeNull();
    expect(document.querySelector('[aria-busy="true"]'), '跳转帧给骨架不闪空态').not.toBeNull();
  });

  it('authed 用户访问不受影响：不跳转，children 正常渲染', async () => {
    renderWithProviders(
      <AppShell current="settings" requireLogin>
        <h1>设置</h1>
      </AppShell>,
      {
        route: '/settings',
        handlers: [
          {
            path: '/api/auth/me',
            respond: () => ({
              body: {
                // W21 账号契约：strict schema 无 email、account 必填
                user: { id: USER_A, handle: '午夜歌手', account: '午夜歌手', role: 'USER' },
                expiresAt: '2030-01-01T00:00:00.000Z',
              },
            }),
          },
        ],
      },
    );
    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/settings');
    expect(window.location.search).toBe('');
    expect(screen.getByRole('navigation', { name: '站内导航' })).toBeInTheDocument();
  });

  it('next 链路端到端：guest 跳 /login?next=原路径 → 登录成功回跳该路径', async () => {
    // ① 外壳：未登录自动跳并携带 next
    renderWithProviders(
      <AppShell current="settings" requireLogin>
        <h1>设置</h1>
      </AppShell>,
      { route: '/settings' },
    );
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(window.location.search).toBe(`?next=${encodeURIComponent('/settings')}`);
    // ② 登录页读 next，成功后把用户带回原路径（既有 login-page 行为，本用例把两半接成一条链）
    renderWithProviders(<LoginPage />, {
      route: '/login?next=%2Fsettings',
      handlers: [
        {
          method: 'POST',
          path: '/api/auth/login',
          respond: () => ({
            status: 200,
            // W21 账号契约：strict schema 无 email、account 必填
            body: {
              user: { id: USER_A, handle: '午夜歌手', account: '午夜歌手', role: 'USER' },
              expiresAt: '2030-01-01T00:00:00.000Z',
            },
          }),
        },
      ],
    });
    fireEvent.change(screen.getByLabelText('账号'), { target: { value: '午夜歌手' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'abcd1234' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/settings');
    });
  });
});
