import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { bottleDetail, song, USER_A } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { SongPickerPage } from '../song-picker-page';

/** 选歌并发起（CONTEXT §3.1）：只给结构性信息，**不使用官方专辑封面、不复制歌词正文**。 */
describe('选歌页', () => {
  it('列出曲库（曲名 / 段数 / 每段时长），且没有任何 img 封面', async () => {
    const { container } = renderWithProviders(<SongPickerPage />, {
      handlers: [{ path: '/api/songs', respond: () => ({ body: [song()] }) }],
    });
    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();
    expect(screen.getByText(/共 4 段/)).toBeInTheDocument();
    expect(screen.getByText(/每段约 20 秒/)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('加载中显示骨架（aria-busy），不是 spinner', () => {
    const { container } = renderWithProviders(<SongPickerPage />, {
      handlers: [{ path: '/api/songs', respond: () => ({ body: [] }) }],
    });
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('选一首歌 → 建瓶 → 直接进入录制第一段', async () => {
    const { fetchMock } = renderWithProviders(<SongPickerPage />, {
      handlers: [
        { path: '/api/songs', respond: () => ({ body: [song()] }) },
        {
          method: 'POST',
          path: '/api/bottles',
          respond: () => ({
            status: 201,
            body: bottleDetail({
              status: 'DRAFT',
              isHolder: true,
              holderId: USER_A,
              segments: [],
              recordedCount: 0,
              missingSegmentIndexes: [1, 2, 3, 4],
              availableResolutions: [],
            }),
          }),
        },
      ],
    });
    fireEvent.click(await screen.findByRole('button', { name: /选这首，去录第一段/ }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/bottles/8f1d6c2e-0f1a-4a1e-9f2b-aaaaaaaaaaaa');
    });
    const createCall = fetchMock.calls.find((call) => call.url === '/api/bottles');
    expect(createCall?.body).toEqual({ songId: '33333333-3333-4333-8333-333333333333' });
  });

  it('未登录（401）时不静默失败：说明要先登录并给出带 next 的登录入口', async () => {
    renderWithProviders(<SongPickerPage />, {
      handlers: [
        { path: '/api/songs', respond: () => ({ body: [song()] }) },
        {
          method: 'POST',
          path: '/api/bottles',
          respond: () => ({
            status: 401,
            body: { error: { message: '请先登录再继续。', violations: [] } },
          }),
        },
      ],
    });
    fireEvent.click(await screen.findByRole('button', { name: /选这首，去录第一段/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('需要先登录');
    expect(screen.getByRole('link', { name: '去登录' })).toHaveAttribute(
      'href',
      expect.stringContaining('/login?next='),
    );
  });

  it('曲库为空是合法状态：空态说明（中性色），不是错误', async () => {
    renderWithProviders(<SongPickerPage />, {
      handlers: [{ path: '/api/songs', respond: () => ({ body: [] }) }],
    });
    expect(await screen.findByText(/曲库还没准备好/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
