/**
 * 收藏按钮 / 指定接唱按钮单测（CONTEXT §8 收藏 · §6.2 指定接唱）。
 *
 * 两条规则必须从**服务端事实**出发：
 * - 收藏只对「已完成并在公海」的作品开放（服务端 `COLLECTION_REQUIRES_FINISHED_WORK`）⇒
 *   未完成作品**不渲染收藏按钮**（不摆会 422 的假控件）；
 * - 指定接唱只对**未完成**的公海作品开放（已完成 → `422 BOTTLE_ALREADY_COMPLETE`）⇒ 完成品不渲染它。
 * 两者互斥地出现在同一个位置上，判据都来自页面已经拿到的 `seaZone`（服务端给的）。
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CollectButton } from './collect-button';
import { TargetedSegmentButton } from './targeted-segment-button';
import { renderWithProviders } from '../../test/harness';

const BOTTLE_ID = '11111111-1111-4111-8111-111111111111';

describe('收藏按钮', () => {
  it('未收藏时点一下收藏：POST 到 /api/collections/:id', async () => {
    const { fetchMock } = renderWithProviders(<CollectButton bottleId={BOTTLE_ID} />, {
      handlers: [
        { path: '/api/me/collections', respond: () => ({ body: [] }) },
        {
          method: 'POST',
          path: `/api/collections/${BOTTLE_ID}`,
          respond: () => ({ status: 201, body: { bottleId: BOTTLE_ID, createdAt: '2026-09-23T05:00:00.000Z' } }),
        },
      ],
    });

    fireEvent.click(await screen.findByRole('button', { name: '收藏这支作品' }));

    await waitFor(() => {
      expect(fetchMock.calls.some((call) => call.method === 'POST')).toBe(true);
    });
  });

  it('已收藏时按钮变成"取消收藏"：DELETE 同一个端点（幂等）', async () => {
    const { fetchMock } = renderWithProviders(<CollectButton bottleId={BOTTLE_ID} />, {
      handlers: [
        {
          path: '/api/me/collections',
          respond: () => ({ body: [{ bottleId: BOTTLE_ID, createdAt: '2026-09-23T05:00:00.000Z' }] }),
        },
        { method: 'DELETE', path: `/api/collections/${BOTTLE_ID}`, respond: () => ({ status: 204 }) },
      ],
    });

    fireEvent.click(await screen.findByRole('button', { name: '取消收藏' }));

    await waitFor(() => {
      expect(fetchMock.calls.some((call) => call.method === 'DELETE')).toBe(true);
    });
  });

  it('未登录（收藏列表 401）时不摆收藏按钮：收藏本来就属于某个账号', async () => {
    renderWithProviders(<CollectButton bottleId={BOTTLE_ID} />, {
      handlers: [
        {
          path: '/api/me/collections',
          respond: () => ({
            status: 401,
            body: { error: { message: '请先登录再继续。', violations: [] } },
          }),
        },
      ],
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /收藏/ })).not.toBeInTheDocument();
    });
  });
});

describe('指定接唱按钮', () => {
  it('点一下抢占持有权：POST /api/sea/:id/targeted-segment，成功后进瓶详情录制', async () => {
    const { fetchMock } = renderWithProviders(<TargetedSegmentButton bottleId={BOTTLE_ID} />, {
      handlers: [
        {
          method: 'POST',
          path: `/api/sea/${BOTTLE_ID}/targeted-segment`,
          respond: () => ({
            body: {
              id: BOTTLE_ID,
              songId: '33333333-3333-4333-8333-333333333333',
              songTitle: '长夜回声',
              status: 'HELD',
              totalSegments: 4,
              recordedCount: 2,
              missingSegmentIndexes: [3, 4],
              isComplete: false,
              seaZone: 'INCOMPLETE',
              revision: 5,
              createdAt: '2026-09-23T02:00:00.000Z',
              updatedAt: '2026-09-23T05:00:00.000Z',
            },
          }),
        },
        { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ status: 500, body: {} }) },
      ],
    });

    fireEvent.click(await screen.findByRole('button', { name: /我来接这一段/ }));

    await waitFor(() => {
      expect(fetchMock.calls.some((call) => call.url.includes('targeted-segment'))).toBe(true);
    });
    await waitFor(() => {
      expect(window.location.pathname).toBe(`/bottles/${BOTTLE_ID}`);
    });
  });
});
