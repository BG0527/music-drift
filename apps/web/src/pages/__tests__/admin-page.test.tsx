import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { USER_A } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { AdminPage } from '../admin-page';

function sessionWith(role: 'USER' | 'ADMIN') {
  return {
    user: { id: USER_A, handle: '管理员', email: 'a@example.com', role },
    expiresAt: '2026-10-23T00:00:00.000Z',
  };
}

/**
 * 审核台的权限口径：**服务端判定**，页面只做"别把队列渲染给非管理员"。
 * 这两条都要有：前端不渲染 + 服务端 403（后者在 api 集成测试里）。
 */
describe('审核台页面', () => {
  it('普通用户：不渲染队列、**也不打队列接口**，只给权限说明', async () => {
    const { fetchMock } = renderWithProviders(<AdminPage />, {
      route: '/admin',
      handlers: [{ path: '/api/auth/me', respond: () => ({ body: sessionWith('USER') }) }],
    });

    expect(await screen.findByText(/只对管理员开放/)).toBeInTheDocument();
    expect(fetchMock.calls.some((call) => call.url.includes('/api/admin/reports'))).toBe(false);
  });

  it('管理员：渲染待处理队列，并可通过历史视图拿到恢复入口', async () => {
    renderWithProviders(<AdminPage />, {
      route: '/admin',
      handlers: [
        { path: '/api/auth/me', respond: () => ({ body: sessionWith('ADMIN') }) },
        {
          path: /\/api\/admin\/reports/,
          respond: () => ({
            body: [
              {
                id: '22222222-2222-4222-8222-222222222222',
                targetType: 'SEGMENT',
                targetId: '11111111-1111-4111-8111-111111111111',
                reason: '这一段像是噪音',
                status: 'PENDING',
                action: null,
                createdAt: '2026-09-23T02:00:00.000Z',
                reviewedAt: null,
              },
            ],
          }),
        },
      ],
    });

    expect(await screen.findByRole('heading', { name: '审核台' })).toBeInTheDocument();
    expect(await screen.findByText('这一段像是噪音')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删段' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '历史裁决' })).toBeInTheDocument();
  });
});
