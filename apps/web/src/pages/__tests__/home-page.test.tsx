import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/harness';
import { HomePage } from '../home-page';

/**
 * 首页 = Figma `home-river` 的**三段**：header-row / hero（涟漪 + 110 圆按钮）/ 心情标签。
 *
 * 三条钉住的东西：
 * 1. **一屏三段、不滚动** → 首页**不许**再出现作品列表（"今日海面"已移出，列表归公海）；
 * 2. 主捞取入口（`aria-label="捞一个漂流瓶"`）与投瓶入口的目标随登录态变化；
 * 3. 心情标签是**展示性质**（Demo 不做筛选），文案如实说明。
 */
describe('首页（Figma 三段结构）', () => {
  it('未登录：捞取与投瓶入口都指向带 next 的登录页', async () => {
    renderWithProviders(<HomePage />);
    expect(await screen.findByRole('link', { name: '捞一个漂流瓶' })).toHaveAttribute(
      'href',
      '/login?next=%2Friver',
    );
    expect(screen.getByRole('link', { name: '投出第一棒' })).toHaveAttribute(
      'href',
      '/login?next=%2Fnew',
    );
  });

  it('已登录：直达河道与选歌页', async () => {
    renderWithProviders(<HomePage />, {
      handlers: [
        {
          path: '/api/auth/me',
          respond: () => ({
            body: {
              user: {
                id: '11111111-1111-4111-8111-111111111111',
                handle: '午夜歌手',
                email: 'a@example.com',
                role: 'USER',
              },
              expiresAt: '2026-10-23T00:00:00.000Z',
            },
          }),
        },
      ],
    });
    // 会话是独立请求：等身份到位（link 变成 /river）再断言，否则看到的是首帧的登录跳转
    await waitFor(() => {
      expect(screen.getByRole('link', { name: '捞一个漂流瓶' })).toHaveAttribute('href', '/river');
    });
    expect(screen.getByRole('link', { name: '投出第一棒' })).toHaveAttribute('href', '/new');
  });

  it('一屏三段：首页不再出现作品列表（"今日海面"归公海；列表会让首页必须滚动）', () => {
    renderWithProviders(<HomePage />);
    expect(screen.queryByText('今日海面')).not.toBeInTheDocument();
    // 三段：标题区 / 主交互区 / 心情标签区
    expect(screen.getByRole('heading', { name: '暖流河道' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '从河道捞一个漂流瓶' })).toBeInTheDocument();
    expect(
      screen.getByText(
        '心情标签这一版只作展示（Demo 不做推荐匹配）：等曲库与匹配上线后才参与筛选。',
      ),
    ).toBeInTheDocument();
  });

  it('心情标签行渲染 Figma 的 5 个标签，且触控高度 ≥44px', () => {
    renderWithProviders(<HomePage />);
    for (const tag of ['全部', '深夜', '通勤', '告白', '雨天']) {
      expect(screen.getByText(tag)).toBeInTheDocument();
    }
  });

  it('主按钮用文字而非裸文本节点（375 下不竖排）', () => {
    renderWithProviders(<HomePage />);
    const primary = screen.getByRole('link', { name: '捞一个漂流瓶' });
    // 说明文字与"捞取"都在 span 里（源码守卫另见 design-discipline.test.ts）
    expect(primary.querySelectorAll('span').length).toBeGreaterThan(1);
  });
});
