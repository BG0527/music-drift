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

  /**
   * 页码式分页（用户第十三轮 ②：“公海的作品我希望的是 1.2.3 页这种分页展示”）。
   *
   * 硬约束：**不新增第二套分页语义**。后端是 cursor/keyset，所以“页码”只是
   * **游标链上的索引**：第 N 页 = 依次推进游标到第 N 页，回看前面的页 = 直接用缓存。
   * 页码数 = 已取页数 + (hasNextPage ? 1 : 0)，**不请求 total**、不自造 offset。
   */
  it('只有一页（nextCursor = null）：页码里只有 1，不会凭空多出第 2 页（禁止假分页）', async () => {
    const { fetchMock } = renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [bottleSummary()], nextCursor: null } }),
        },
      ],
    });

    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '第 1 页' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryByRole('button', { name: '第 2 页' })).not.toBeInTheDocument();
    // 不请求第二页
    expect(fetchMock.calls.filter((call) => call.url.includes('/api/sea')).length).toBe(1);
  });

  it('nextCursor 非 null：出现页码 1 / 2（不是「加载更多」）', async () => {
    renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [bottleSummary()], nextCursor: '游标一' } }),
        },
      ],
    });

    expect(await screen.findByRole('button', { name: '第 2 页' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /加载更多/ })).not.toBeInTheDocument();
  });

  it('点第 2 页：带上 cursor 取第二页，并**只显示第二页**（不是追加）', async () => {
    const { fetchMock } = renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [bottleSummary()], nextCursor: '游标一' } }),
        },
        {
          path: /cursor=%E6%B8%B8%E6%A0%87%E4%B8%80/,
          respond: () => ({
            body: {
              items: [
                bottleSummary({
                  id: '22222222-2222-4222-8222-222222222222',
                  songTitle: '第二页的歌',
                }),
              ],
              nextCursor: null,
            },
          }),
        },
      ],
    });

    fireEvent.click(await screen.findByRole('button', { name: '第 2 页' }));

    expect(await screen.findByText('第二页的歌')).toBeInTheDocument();
    // 分页而不是“加载更多”：第一页的内容不在当前页里
    expect(screen.queryByText('深海鲸落')).not.toBeInTheDocument();
    expect(fetchMock.calls.some((call) => call.url.includes('cursor=%E6%B8%B8%E6%A0%87%E4%B8%80'))).toBe(
      true,
    );
  });

  it('回到第 1 页：用缓存，不再发请求', async () => {
    const { fetchMock } = renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [bottleSummary()], nextCursor: '游标一' } }),
        },
        {
          path: /cursor=%E6%B8%B8%E6%A0%87%E4%B8%80/,
          respond: () => ({
            body: {
              items: [
                bottleSummary({
                  id: '22222222-2222-4222-8222-222222222222',
                  songTitle: '第二页的歌',
                }),
              ],
              nextCursor: null,
            },
          }),
        },
      ],
    });

    fireEvent.click(await screen.findByRole('button', { name: '第 2 页' }));
    expect(await screen.findByText('第二页的歌')).toBeInTheDocument();
    const afterSecond = fetchMock.calls.filter((call) => call.url.includes('/api/sea')).length;

    fireEvent.click(screen.getByRole('button', { name: '第 1 页' }));

    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();
    expect(fetchMock.calls.filter((call) => call.url.includes('/api/sea')).length).toBe(afterSecond);
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
