/**
 * 「我的收藏」弹窗单测（CONTEXT §8 / `docs/api.md` §2.6）。
 *
 * 规则：
 * 1. **收藏列表来自服务端**（`GET /api/me/collections` 只给 `bottleId` + `createdAt`），
 *    曲名由 `/api/sea/:id` **逐条取回**，前端不自己编标题、也不自己推算"这作品还在不在公海"；
 * 2. 空态要说清"在哪收藏"（出口指向公海大厅），不是一句"暂无数据"；
 * 3. 收藏是**次要/声明式内容**（§46.2）⇒ 只在这个弹窗里出现，不摊在首屏。
 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CollectionsPanel } from './collections-panel';
import { renderWithProviders } from '../../test/harness';
import { bottleSummary } from '../../test/fixtures';

const COLLECTED_ID = '11111111-1111-4111-8111-111111111111';

function setup(items: Array<{ bottleId: string; createdAt: string }>) {
  return renderWithProviders(<CollectionsPanel open onClose={() => undefined} />, {
    handlers: [
      { path: '/api/me/collections', respond: () => ({ body: items }) },
      {
        path: `/api/sea/${COLLECTED_ID}`,
        respond: () => ({
          body: bottleSummary({
            id: COLLECTED_ID,
            songTitle: '长夜回声',
            seaZone: 'COMPLETED',
            isComplete: true,
          }),
        }),
      },
    ],
  });
}

describe('我的收藏', () => {
  it('收藏的曲名来自服务端（逐条取 `/api/sea/:id`，不自己编）', async () => {
    const { fetchMock } = setup([
      { bottleId: COLLECTED_ID, createdAt: '2026-09-23T03:00:00.000Z' },
    ]);

    expect(await screen.findByText('长夜回声')).toBeInTheDocument();
    expect(fetchMock.calls.some((call) => call.url === `/api/sea/${COLLECTED_ID}`)).toBe(true);
  });

  it('每条都给出"去听这支作品"的出口（收藏是为了回去听）', async () => {
    setup([{ bottleId: COLLECTED_ID, createdAt: '2026-09-23T03:00:00.000Z' }]);

    const link = await screen.findByRole('link', { name: /听这支作品/ });
    expect(link).toHaveAttribute('href', `/bottles/${COLLECTED_ID}`);
  });

  it('空态说明"在哪里收藏"，并给公海大厅的出口', async () => {
    setup([]);

    expect(await screen.findByText(/还没有收藏/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /去公海/ })).toHaveAttribute('href', '/sea');
  });
});
