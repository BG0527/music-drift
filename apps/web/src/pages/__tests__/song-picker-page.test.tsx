import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
    fireEvent.click(await screen.findByRole('button', { name: /选这首，录第 1 段/ }));
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
    fireEvent.click(await screen.findByRole('button', { name: /选这首，录第 1 段/ }));
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

/**
 * 【用户可见缺陷】`user-provided` 的曲子 `song_segments` 是 0 行（没有切分/预设），
 * 但仍在 `GET /api/songs` 里 —— 选它发起会建出空草稿，然后录制被 fail-closed 拒 ⇒ **卡死在草稿**。
 * 所以选歌页必须：它**仍然可见**（不静默隐藏）+ **不可发起** + **写明理由**。
 */
describe('选歌页：没有切分的曲子', () => {
  const RAW_ID = '44444444-4444-4444-8444-444444444444';

  function setup() {
    return renderWithProviders(<SongPickerPage />, {
      handlers: [
        {
          path: '/api/songs',
          respond: () => ({
            body: [
              song(),
              song({
                id: RAW_ID,
                title: '别人写的歌',
                totalSegments: 4,
                licensedSource: 'user-provided',
                segments: [],
              }),
            ],
          }),
        },
      ],
    });
  }

  it('无切分的曲子仍然在列表里（不静默隐藏）', async () => {
    setup();
    expect(await screen.findByText('别人写的歌')).toBeInTheDocument();
  });

  it('但它不可发起：按钮禁用，且就在行内写明理由', async () => {
    const { fetchMock } = setup();
    const title = await screen.findByText('别人写的歌');
    const row = title.closest('li');
    expect(row).not.toBeNull();
    const button = within(row as HTMLElement).getByRole('button');
    expect(button).toBeDisabled();
    // 不能只是变灰：按钮文案也不能再叫「选这首，录第 1 段」
    expect(button).toHaveTextContent('暂不可发起');
    expect(within(row as HTMLElement).getByText(/还没有切分/)).toBeInTheDocument();

    fireEvent.click(button);
    expect(fetchMock.calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('有切分的曲子照常可发起（别把能用的也禁了）', async () => {
    setup();
    const title = await screen.findByText('深海鲸落');
    const row = title.closest('li') as HTMLElement;
    expect(within(row).getByRole('button')).toBeEnabled();
  });
});
