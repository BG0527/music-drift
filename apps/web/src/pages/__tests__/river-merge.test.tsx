/**
 * 根路由与河道入口 —— **t12 用户新裁决覆盖原「河道页合并」裁决**。
 *
 * ⚠️ 断言原文 → 新文（用户 t12 裁决）：
 * 原文（第十三轮 ①）：`/` 与 `/river` 是同一个页面，canonical = `/river`（replaceState）。
 * 新文（t12）：**`/` 直接渲染 landing（翻页式介绍页）**，不再规范化到 /river；
 *   河道页只在 `/river`；功能页守卫按验收④ —— 未登录访问 /river 进 `/login?next=%2Friver`。
 *
 * 钉住四件事：
 * 1. guest 访问 `/river` → `/login?next=%2Friver`（守卫）；
 * 2. 登录态访问 `/river` → 仍是河道页（捞取 / 投下 + 心情标签，功能不变）；
 * 3. `/` 渲染 landing，且**不再被 rewrite 成 `/river`**（pathname 保持 `/`）；
 * 4. 顶栏「河道」入口仍指 `/river`。
 */
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, type FetchHandler } from '../../test/harness';
import { RouteView } from '../route-view';
import { NAV_ITEMS } from '../shell/routes';

const AUTHED_ME: FetchHandler = {
  path: '/api/auth/me',
  respond: () => ({
    body: {
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        handle: '午夜歌手',
        email: 'a@example.com',
        role: 'USER',
      },
      expiresAt: '2030-01-01T00:00:00.000Z',
    },
  }),
};

describe('根路由与河道入口（t12 用户新裁决）', () => {
  it('/river 是河道页主体：捞取 / 投下两个等权面板 + 心情标签（登录态）', async () => {
    renderWithProviders(<RouteView />, { route: '/river', handlers: [AUTHED_ME] });

    expect(await screen.findByRole('heading', { name: '暖流河道' })).toBeInTheDocument();
    // 捞取是**动作**（button），投下是**去选歌页**（link）—— 两者语义不同，别写成同一个 role
    expect(await screen.findByRole('button', { name: '捞一个漂流瓶' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '投下一支漂流瓶' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全部' })).toBeInTheDocument();
  });

  it('guest 访问 /river 进 /login（t12 验收④：功能页守卫）', async () => {
    renderWithProviders(<RouteView />, { route: '/river' });

    await waitFor(() => {
      expect(window.location.pathname).toBe('/login');
    });
    expect(window.location.search).toBe('?next=%2Friver');
  });

  it('/ 渲染 landing 而不是河道页，且不再被 rewrite 成 /river（replaceState 已废除）', async () => {
    renderWithProviders(<RouteView />, { route: '/' });

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '暖流河道' })).toBeNull();
    // 旧裁决断言（原文）：await waitFor(() => expect(window.location.pathname).toBe('/river'));
    // 新裁决：pathname 保持原样，不发生任何规范化跳转
    expect(window.location.pathname).toBe('/');
    await waitFor(() => {
      expect(window.location.pathname).toBe('/');
    });
  });

  it('顶栏「河道」入口指向 /river（canonical 语义保留）', () => {
    expect(NAV_ITEMS.find((item) => item.key === 'river')?.href).toBe('/river');
  });
});
