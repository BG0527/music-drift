import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { bottleSummary } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { HomePage } from '../home-page';

/**
 * 首页（「今日海面」）：Figma 无首页 H5 帧，IA 参考 `home-river` 的三段结构
 * （标题区 / 主交互区 / 我的瓶子）。
 * 关键：**未登录时两个 CTA 都要带 next 去登录**，不能点出一个 401。
 */
describe('首页', () => {
  it('未登录：两个主行动都指向带 next 的登录页', async () => {
    renderWithProviders(<HomePage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=30',
          respond: () => ({ body: { items: [], nextCursor: null } }),
        },
      ],
    });
    expect(await screen.findByRole('link', { name: /捞一个漂流瓶/ })).toHaveAttribute(
      'href',
      '/login?next=%2Friver',
    );
    expect(screen.getByRole('link', { name: /选一首歌/ })).toHaveAttribute(
      'href',
      '/login?next=%2Fnew',
    );
  });

  it('已登录：CTA 直达河道与选歌页', async () => {
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
        {
          path: '/api/sea?zone=COMPLETED&limit=30',
          respond: () => ({ body: { items: [bottleSummary()], nextCursor: null } }),
        },
      ],
    });
    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();
    // 会话与会话之外的查询是两条独立请求：等身份到位之后再断言 CTA 目标
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /捞一个漂流瓶/ })).toHaveAttribute('href', '/river');
    });
    expect(screen.getByRole('link', { name: /选一首歌/ })).toHaveAttribute('href', '/new');
  });

  it('今日海面为空时给空态，而不是空白区', async () => {
    renderWithProviders(<HomePage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=30',
          respond: () => ({ body: { items: [], nextCursor: null } }),
        },
      ],
    });
    expect(await screen.findByText(/公海还空着/)).toBeInTheDocument();
  });
});
