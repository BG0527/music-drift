/**
 * 河道页合并（用户第十三轮 ①）：`/` 与 `/river` **是同一个页面**。
 *
 * 用户原话：「完成登录之后的 `/` 和 `/river` 这是两个页面，但他们本质都是河道页面。
 * 我希望主体采用 `/river` 的样式，然后添加另一个页面的心情标签，并且附有前端点击切换的动画，
 * 只是没有实质功能。」
 *
 * 钉住三件事：
 * 1. **canonical = `/river`**：`/` 会被规范化成 `/river`（`replaceState`，**不加历史条目**，
 *    所以从登录页进来按「返回」不会在两页之间来回弹）；
 * 2. **一页两种入口**：`/` 与 `/river` 渲染的都是河道页（捞取 / 投下两个等权面板 + 心情标签）；
 * 3. **侧栏「河道」入口仍指 `/river`**（合并后不留过期链接）。
 */
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/harness';
import { RouteView } from '../route-view';
import { NAV_ITEMS } from '../shell/routes';

const river = () => screen.findByRole('heading', { name: '暖流河道' });

describe('河道页合并', () => {
  it('/river 是河道页主体：捞取 / 投下两个等权面板 + 心情标签', async () => {
    renderWithProviders(<RouteView />, { route: '/river' });

    expect(await river()).toBeInTheDocument();
    // 捞取是**动作**（button），投下是**去选歌页**（link）—— 两者语义不同，别写成同一个 role
    expect(await screen.findByRole('button', { name: '捞一个漂流瓶' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '投下一支漂流瓶' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全部' })).toBeInTheDocument();
  });

  it('/ 渲染的是同一个河道页（不是另一个首页，也没有第二份作品列表）', async () => {
    renderWithProviders(<RouteView />, { route: '/' });

    expect(await river()).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '投下一支漂流瓶' })).toBeInTheDocument();
    // 合并后主页不再有自己的「今日海面」列表（列表归公海）
    expect(screen.queryByText(/今日海面/)).not.toBeInTheDocument();
  });

  it('/ 会被规范化成 /river（replaceState：不加历史条目，返回键不会在两页间弹）', async () => {
    renderWithProviders(<RouteView />, { route: '/' });

    await waitFor(() => {
      expect(window.location.pathname).toBe('/river');
    });
  });

  it('侧栏「河道」入口指向 /river（canonical）', () => {
    expect(NAV_ITEMS.find((item) => item.key === 'river')?.href).toBe('/river');
  });
});
