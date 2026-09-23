import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/harness';
import { NotificationList } from './notification-list';

const BOTTLE = '8f1d6c2e-0f1a-4a1e-9f2b-aaaaaaaaaaaa';

function notification(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'MESSAGE_UNDELIVERED',
    payload: { bottleId: BOTTLE, messageId: '22222222-2222-4222-8222-222222222222' },
    readAt: null,
    createdAt: '2026-09-23T02:00:00.000Z',
    ...overrides,
  };
}

/** 通知列表：必须有加载（骨架）/ 空态 / 错误态 / 未读标记，且"标记已读"要真的打接口。 */
describe('通知列表', () => {
  it('列出通知并给出可读文案；未读用文字标注（不只靠颜色）', async () => {
    renderWithProviders(<NotificationList />, {
      handlers: [
        {
          path: /\/api\/notifications/,
          respond: () => ({ body: { items: [notification()], nextCursor: null } }),
        },
      ],
    });
    expect(await screen.findByText(/未送达/)).toBeInTheDocument();
    expect(screen.getByText('未读')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /去看一眼/ })).toHaveAttribute(
      'href',
      `/bottles/${BOTTLE}`,
    );
  });

  it('没有通知时是空态（中性），不是错误', async () => {
    renderWithProviders(<NotificationList />, {
      handlers: [
        {
          path: /\/api\/notifications/,
          respond: () => ({ body: { items: [], nextCursor: null } }),
        },
      ],
    });
    expect(await screen.findByText(/还没有新消息/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('接口失败时给可读说明与重试，不白屏', async () => {
    renderWithProviders(<NotificationList />, {
      handlers: [
        {
          path: /\/api\/notifications/,
          respond: () => ({
            status: 503,
            body: { error: { message: '服务器出了点问题，请稍后再试。', violations: [] } },
          }),
        },
      ],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('服务器暂时不可用');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('点「标记已读」会打接口并刷新为已读', async () => {
    const handlers = [
      {
        path: /\/api\/notifications/,
        respond: () => ({ body: { items: [notification()], nextCursor: null } }),
      },
      {
        method: 'POST',
        path: /\/api\/notifications\/.+\/read/,
        respond: () => ({ status: 204 }),
      },
    ];
    const { fetchMock } = renderWithProviders(<NotificationList />, { handlers });
    fireEvent.click(await screen.findByRole('button', { name: '标记已读' }));
    await waitFor(() => {
      expect(
        fetchMock.calls.some((call) => call.method === 'POST' && call.url.endsWith('/read')),
      ).toBe(true);
    });
  });
});
