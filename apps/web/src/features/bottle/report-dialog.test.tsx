import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/harness';
import { ReportDialog } from './report-dialog';

const TARGET = '11111111-1111-4111-8111-111111111111';

/** 举报入口（CONTEXT §8）：全链路都要有，理由必填；提交后明确告知"进入人工审核"。 */
describe('举报对话框', () => {
  it('理由是必填项，未填时提交按钮禁用（不给用户点了才知道）', async () => {
    renderWithProviders(
      <ReportDialog open targetType="SEGMENT" targetId={TARGET} onClose={() => undefined} />,
    );
    expect(await screen.findByRole('button', { name: '提交举报' })).toBeDisabled();
  });

  it('提交后打接口并告知已进入人工审核队列', async () => {
    const { fetchMock } = renderWithProviders(
      <ReportDialog open targetType="BOTTLE" targetId={TARGET} onClose={() => undefined} />,
      {
        handlers: [{ method: 'POST', path: '/api/reports', respond: () => ({ status: 204 }) }],
      },
    );
    fireEvent.change(await screen.findByLabelText('举报理由'), {
      target: { value: '这段内容和曲子无关' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提交举报' }));

    await waitFor(() => {
      expect(fetchMock.calls.some((call) => call.url === '/api/reports')).toBe(true);
    });
    expect(await screen.findByRole('status')).toHaveTextContent(/进入人工审核队列/);
  });

  it('未登录（401）时提示登录，不静默失败', async () => {
    renderWithProviders(
      <ReportDialog open targetType="BOTTLE" targetId={TARGET} onClose={() => undefined} />,
      {
        handlers: [
          {
            method: 'POST',
            path: '/api/reports',
            respond: () => ({
              status: 401,
              body: { error: { message: '请先登录再继续。', violations: [] } },
            }),
          },
        ],
      },
    );
    fireEvent.change(await screen.findByLabelText('举报理由'), { target: { value: '理由' } });
    fireEvent.click(screen.getByRole('button', { name: '提交举报' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('需要先登录');
  });
});
