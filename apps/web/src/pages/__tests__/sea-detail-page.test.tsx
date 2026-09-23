import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BOTTLE_ID, bottleDetail, bottleSummary } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { SeaDetailPage } from '../sea-detail-page';

/** 公海作品页：**只能听**（完成品不可再接唱），并提供成品试听与漂流日志入口。 */
describe('公海作品页', () => {
  it('展示作品信息、段位链与成品试听区（阶段一：纯人声）', async () => {
    renderWithProviders(<SeaDetailPage id={BOTTLE_ID} />, {
      route: `/sea/${BOTTLE_ID}`,
      handlers: [
        { path: `/api/sea/${BOTTLE_ID}`, respond: () => ({ body: bottleSummary() }) },
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({
              status: 'SEA',
              seaZone: 'COMPLETED',
              isComplete: true,
              missingSegmentIndexes: [],
              availableResolutions: [],
              recordedCount: 4,
            }),
          }),
        },
      ],
    });
    expect(await screen.findByRole('heading', { name: '深海鲸落' })).toBeInTheDocument();
    expect(screen.getByText('接力唱段链')).toBeInTheDocument();
    // 混音导出计划是**声明式内容**（§46.2）：先证明它不在首屏，再点开入口看到它
    expect(screen.queryByText(/成品（阶段一 · 纯人声）/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /混音导出计划/ }));
    expect(await screen.findByText(/成品（阶段一 · 纯人声）/)).toBeInTheDocument();
  });

  it('不在公海的瓶子（404）用空态说明并给回大厅的出口', async () => {
    renderWithProviders(<SeaDetailPage id={BOTTLE_ID} />, {
      route: `/sea/${BOTTLE_ID}`,
      handlers: [
        {
          path: `/api/sea/${BOTTLE_ID}`,
          respond: () => ({
            status: 404,
            body: { error: { message: '找不到这个资源。', violations: [] } },
          }),
        },
      ],
    });
    expect(await screen.findByText(/不在公海/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '回公海大厅' })).toHaveAttribute('href', '/sea');
  });

  it('未完成作品在公海分区里仍标注缺口（不伪装成完整作品）', async () => {
    renderWithProviders(<SeaDetailPage id={BOTTLE_ID} />, {
      route: `/sea/${BOTTLE_ID}`,
      handlers: [
        {
          path: `/api/sea/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleSummary({
              seaZone: 'INCOMPLETE',
              isComplete: false,
              recordedCount: 2,
              missingSegmentIndexes: [3, 4],
            }),
          }),
        },
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({
              status: 'SEA',
              seaZone: 'INCOMPLETE',
              isComplete: false,
              missingSegmentIndexes: [3, 4],
              availableResolutions: [],
            }),
          }),
        },
      ],
    });
    expect((await screen.findAllByText(/缺第 3、4 段/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/等待接力/)).toBeInTheDocument();
  });
});

/** 指定接唱（CONTEXT §6.2）：只在**未完成**的公海作品上出现；完成品只能听 ⇒ 改为收藏入口。 */
describe('公海作品页：收藏与指定接唱入口', () => {
  it('完成品：出现「收藏这支作品」，不出现指定接唱', async () => {
    renderWithProviders(<SeaDetailPage id={BOTTLE_ID} />, {
      handlers: [
        { path: `/api/sea/${BOTTLE_ID}`, respond: () => ({ body: bottleSummary() }) },
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({
              status: 'SEA',
              seaZone: 'COMPLETED',
              isComplete: true,
              missingSegmentIndexes: [],
              availableResolutions: [],
              recordedCount: 4,
            }),
          }),
        },
        { path: '/api/me/collections', respond: () => ({ body: [] }) },
      ],
    });

    expect(
      await screen.findByRole('button', { name: '收藏这支作品' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /我来接这一段/ })).not.toBeInTheDocument();
  });

  it('未完成作品：出现「我来接这一段」，不出现收藏', async () => {
    renderWithProviders(<SeaDetailPage id={BOTTLE_ID} />, {
      handlers: [
        {
          path: `/api/sea/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleSummary({
              seaZone: 'INCOMPLETE',
              isComplete: false,
              recordedCount: 2,
              missingSegmentIndexes: [3, 4],
            }),
          }),
        },
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({
              status: 'SEA',
              seaZone: 'INCOMPLETE',
              isComplete: false,
              missingSegmentIndexes: [3, 4],
              availableResolutions: [],
              recordedCount: 2,
            }),
          }),
        },
        { path: '/api/me/collections', respond: () => ({ body: [] }) },
      ],
    });

    expect(
      await screen.findByRole('button', { name: /我来接这一段/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '收藏这支作品' })).not.toBeInTheDocument();
  });
});
