import { screen } from '@testing-library/react';
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
    expect(screen.getByText(/成品（阶段一 · 纯人声）/)).toBeInTheDocument();
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
