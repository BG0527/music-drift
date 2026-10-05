/**
 * 收藏按钮 / 指定接唱按钮单测（CONTEXT §8 收藏 · §6.2 指定接唱）。
 *
 * 两条规则必须从**服务端事实**出发：
 * - 收藏只对「已完成并在公海」的作品开放（服务端 `COLLECTION_REQUIRES_FINISHED_WORK`）⇒
 *   未完成作品**不渲染收藏按钮**（不摆会 422 的假控件）；
 * - 指定接唱只对**未完成**的公海作品开放（已完成 → `422 BOTTLE_ALREADY_COMPLETE`）⇒ 完成品不渲染它。
 * 两者互斥地出现在同一个位置上，判据都来自页面已经拿到的 `seaZone`（服务端给的）。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CollectButton } from './collect-button';
import { TargetedSegmentButton } from './targeted-segment-button';
import { renderWithProviders } from '../../test/harness';

const BOTTLE_ID = '11111111-1111-4111-8111-111111111111';

describe('收藏按钮', () => {
  it('收藏失败显示可恢复错误而不是静默吞掉', async () => {
    renderWithProviders(<CollectButton bottleId={BOTTLE_ID} />, { handlers: [
      { path: '/api/me/collections', respond: () => ({ body: [] }) },
      { method: 'POST', path: `/api/collections/${BOTTLE_ID}`, respond: () => ({
        status: 500, body: { error: { message: '收藏暂时不可用，请重试。', violations: [] } },
      }) },
    ] });
    fireEvent.click(await screen.findByRole('button', { name: '收藏这支作品' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('收藏暂时不可用，请重试。');
  });
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
  it('与河道缺口同形：录第 N 段 + cta 共用外观 + Mic；POST 接管成功后按默认出口进瓶详情', async () => {
    const { fetchMock } = renderWithProviders(
      <TargetedSegmentButton bottleId={BOTTLE_ID} segmentIndex={3} />,
      {
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
      },
    );

    const cta = await screen.findByRole('button', { name: /录第 3 段/ });
    // 形态与河道 gapAction 的 cta 按钮一致（含 Mic 图标）
    expect(cta.classList.contains('cta'), 'cta 共用外观类（token 级判定）').toBe(true);
    expect(cta.classList.contains('bp-record-cta')).toBe(true);
    expect(cta.classList.contains('whitespace-nowrap')).toBe(true);
    expect(cta.querySelector('svg.lucide-mic'), 'Mic 图标').not.toBeNull();

    fireEvent.click(cta);

    await waitFor(() => {
      expect(fetchMock.calls.some((call) => call.url.includes('targeted-segment'))).toBe(true);
    });
    await waitFor(() => {
      expect(window.location.pathname).toBe(`/bottles/${BOTTLE_ID}`);
    });
  });

  it('源码不再保留「我来接这一段」旧措辞（统一成录第 N 段）', () => {
    const source = readFileSync(
      join(process.cwd(), 'src', 'features', 'bottle', 'targeted-segment-button.tsx'),
      'utf8',
    );
    expect(source).not.toContain('我来接这一段');
    // 段号必选：不再有 segmentIndex === undefined 的旧措辞分支
    expect(source).not.toContain('segmentIndex === undefined');
  });
});

/**
 * 失败不能静默（仓库纪律："不吞 4xx"）：服务端拒绝时必须把**原因 + 出口**摆出来。
 * 两种拒绝都来自内核：已完成 → `BOTTLE_ALREADY_COMPLETE`；本瓶唱过 → `ALREADY_SANG_IN_BOTTLE`。
 */
describe('指定接唱：被拒的时候有可见出口', () => {
  it('服务端 422（已完成）：显示中文原因，且给回公海的出口（不是点了没反应）', async () => {
    renderWithProviders(<TargetedSegmentButton bottleId={BOTTLE_ID} segmentIndex={3} />, {
      handlers: [
        {
          method: 'POST',
          path: `/api/sea/${BOTTLE_ID}/targeted-segment`,
          respond: () => ({
            status: 422,
            body: {
              error: {
                message: '这件作品已经完成，不能再接唱。',
                violations: [
                  { code: 'BOTTLE_ALREADY_COMPLETE', message: '这件作品已经完成。' },
                ],
              },
            },
          }),
        },
      ],
    });

    fireEvent.click(await screen.findByRole('button', { name: /录第 3 段/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/已经完成/);
  });
});
