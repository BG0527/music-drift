import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { bottleDetail } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { RiverPage } from '../river-page';

/** 河道（Figma `home-river`）：一屏一个动作 —— 随机捞一个瓶子。 */
describe('河道页', () => {
  it('捞起 / 投下 是**两个等权主区**（用户裁决：投下要与捞起同样重）', () => {
    renderWithProviders(<RiverPage />, { handlers: [] });
    // 捞起：圆形主按钮（110×110）+ 涟漪
    expect(screen.getByRole('button', { name: '捞一个漂流瓶' })).toBeInTheDocument();
    // 投下：同规格的第二个主区（未登录时指向带 next 的登录页）
    expect(screen.getByRole('link', { name: '投下一支漂流瓶' })).toHaveAttribute(
      'href',
      '/login?next=%2Fnew',
    );
    expect(screen.getByText(/随机打捞/)).toBeInTheDocument();
  });

  it('已登录时「投下」直达选歌页', async () => {
    renderWithProviders(<RiverPage />, {
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
    await waitFor(() => {
      expect(screen.getByRole('link', { name: '投下一支漂流瓶' })).toHaveAttribute('href', '/new');
    });
  });

  it('捞到即进入这支瓶子（持有权由服务端给）', async () => {
    const { fetchMock } = renderWithProviders(<RiverPage />, {
      handlers: [
        {
          method: 'POST',
          path: '/api/river/draw',
          respond: () => ({ body: { bottle: bottleDetail() } }),
        },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /捞一个漂流瓶/ }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/bottles/8f1d6c2e-0f1a-4a1e-9f2b-aaaaaaaaaaaa');
    });
    expect(fetchMock.calls.some((call) => call.url === '/api/river/draw')).toBe(true);
  });

  it('河道空（409 NO_BOTTLE_AVAILABLE）给空态与两个出口', async () => {
    renderWithProviders(<RiverPage />, {
      handlers: [
        {
          method: 'POST',
          path: '/api/river/draw',
          respond: () => ({
            status: 409,
            body: {
              error: {
                message: '河道里暂时没有可以捞的瓶子。',
                violations: [
                  { code: 'NO_BOTTLE_AVAILABLE', message: '河道里暂时没有可以捞的瓶子。' },
                ],
              },
            },
          }),
        },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: '捞一个漂流瓶' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('河道里暂时没有可以捞的瓶子');
    expect(screen.getByRole('button', { name: '再捞一次' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '去公海大厅' })).toHaveAttribute('href', '/sea');
  });

  it('自己投出的瓶子不会再漂回来（422 CANNOT_DRAW_OWN_BOTTLE 有可读说明）', async () => {
    renderWithProviders(<RiverPage />, {
      handlers: [
        {
          method: 'POST',
          path: '/api/river/draw',
          respond: () => ({
            status: 422,
            body: {
              error: {
                message: '不能接自己投出的瓶子。',
                violations: [{ code: 'CANNOT_DRAW_OWN_BOTTLE', message: '不能接自己投出的瓶子。' }],
              },
            },
          }),
        },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: '捞一个漂流瓶' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('不能接自己投出的瓶子。');
    expect(screen.getByRole('button', { name: '再捞一次' })).toBeInTheDocument();
  });
});
