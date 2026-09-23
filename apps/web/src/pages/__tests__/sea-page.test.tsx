import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { bottleSummary } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { SeaPage } from '../sea-page';

/** 公海（Figma `public-sea` 采纳 IA）：默认只看**完整作品**，未完成作品要显式切分区。 */
describe('公海大厅', () => {
  it('默认请求完整作品分区，并列出作品（曲名 + 段数）', async () => {
    const { fetchMock } = renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [bottleSummary()], nextCursor: null } }),
        },
      ],
    });
    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();
    expect(fetchMock.calls.some((call) => call.url.includes('zone=COMPLETED'))).toBe(true);
  });

  it('切到「等待接力」时请求未完成分区，并显示缺口标注', async () => {
    const { fetchMock } = renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [], nextCursor: null } }),
        },
        {
          path: '/api/sea?zone=INCOMPLETE&limit=6',
          respond: () => ({
            body: {
              items: [
                bottleSummary({
                  status: 'SEA',
                  seaZone: 'INCOMPLETE',
                  isComplete: false,
                  recordedCount: 2,
                  missingSegmentIndexes: [2, 4],
                }),
              ],
              nextCursor: null,
            },
          }),
        },
      ],
    });
    fireEvent.click(screen.getByRole('tab', { name: '等待接力' }));
    expect(await screen.findByText(/缺第 2、4 段/)).toBeInTheDocument();
    expect(fetchMock.calls.some((call) => call.url.includes('zone=INCOMPLETE'))).toBe(true);
  });

  it('空分区用空态（说明为什么空 + 去河道），不是错误', async () => {
    renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [], nextCursor: null } }),
        },
      ],
    });
    expect(await screen.findByText(/还没有完整的作品/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('只有服务端给了 nextCursor 才出现「加载更多」（禁止假分页）', async () => {
    const { fetchMock } = renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [bottleSummary()], nextCursor: null } }),
        },
      ],
    });

    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();
    // nextCursor = null ⇒ 没有下一页：不准放一个点了没反应的「加载更多」
    expect(screen.queryByRole('button', { name: /加载更多/ })).not.toBeInTheDocument();
    expect(fetchMock.calls.filter((call) => call.url.includes('/api/sea')).length).toBe(1);
  });

  it('有 nextCursor 时「加载更多」带上 cursor 取下一页，并把两页合并展示', async () => {
    const { fetchMock } = renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({
            body: { items: [bottleSummary()], nextCursor: '游标一' },
          }),
        },
        {
          path: /cursor=%E6%B8%B8%E6%A0%87%E4%B8%80/,
          respond: () => ({
            body: {
              items: [bottleSummary({ id: '22222222-2222-4222-8222-222222222222', songTitle: '下一页的歌' })],
              nextCursor: null,
            },
          }),
        },
      ],
    });

    fireEvent.click(await screen.findByRole('button', { name: /加载更多/ }));

    expect(await screen.findByText('下一页的歌')).toBeInTheDocument();
    // 第一页还在（不是替换，是追加）
    expect(screen.getByText('深海鲸落')).toBeInTheDocument();
    const cursorCalls = fetchMock.calls.filter((call) => call.url.includes('cursor='));
    expect(cursorCalls.length).toBeGreaterThanOrEqual(1);
    // 第二页回来 nextCursor=null ⇒ 按钮消失（不做空转）
    expect(screen.queryByRole('button', { name: /加载更多/ })).not.toBeInTheDocument();
  });

  it('服务端故障时给中文说明与重试，不白屏', async () => {
    renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
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
});
