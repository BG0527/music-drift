import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { bottleSummary } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { MyBottles } from './my-bottles';

const BOTTLE = '8f1d6c2e-0f1a-4a1e-9f2b-aaaaaaaaaaaa';

function myBottle(overrides: Record<string, unknown> = {}) {
  return {
    ...bottleSummary({
      id: BOTTLE,
      status: 'IN_RIVER',
      seaZone: null,
      isComplete: false,
      recordedCount: 2,
      missingSegmentIndexes: [3, 4],
    }),
    role: 'SINGER',
    mySegmentIndexes: [2],
    ...overrides,
  };
}

/**
 * 「我参与过的漂流瓶」现在**由服务端给**（`GET /api/me/bottles`，t19 交付），
 * 不再是"这台设备"的 localStorage 书签 —— 换浏览器也能看到，且**被斩的段仍算参与过**（§16.7）。
 */
describe('我参与过的漂流瓶（服务端）', () => {
  it('列出曲名 / 我的角色 / 我唱的段号 / 缺口，并给瓶子页与日志两个入口', async () => {
    renderWithProviders(<MyBottles />, {
      handlers: [
        {
          path: /\/api\/me\/bottles/,
          respond: () => ({ body: { items: [myBottle()], nextCursor: null } }),
        },
      ],
    });

    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();
    expect(screen.getByText('我接唱的')).toBeInTheDocument();
    expect(screen.getByText(/我唱的：第 2 段/)).toBeInTheDocument();
    expect(screen.getByText(/缺第 3、4 段/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /去看这个瓶子/ })).toHaveAttribute(
      'href',
      `/bottles/${BOTTLE}`,
    );
    expect(screen.getByRole('link', { name: '漂流日志' })).toHaveAttribute(
      'href',
      `/bottles/${BOTTLE}/log`,
    );
  });

  it('发起者显示「我发起的」；被斩后 mySegmentIndexes 为空时如实说明（不是隐藏这条）', async () => {
    renderWithProviders(<MyBottles />, {
      handlers: [
        {
          path: /\/api\/me\/bottles/,
          respond: () => ({
            body: {
              items: [
                myBottle({ role: 'INITIATOR', mySegmentIndexes: [1] }),
                myBottle({
                  id: '9f1d6c2e-0f1a-4a1e-9f2b-bbbbbbbbbbbb',
                  role: 'SINGER',
                  mySegmentIndexes: [],
                }),
              ],
              nextCursor: null,
            },
          }),
        },
      ],
    });
    expect(await screen.findByText('我发起的')).toBeInTheDocument();
    expect(screen.getByText(/我唱的那一段被斩浪删除了/)).toBeInTheDocument();
  });

  it('没有参与过时是空态（引导去河道），不是错误', async () => {
    renderWithProviders(<MyBottles />, {
      handlers: [
        { path: /\/api\/me\/bottles/, respond: () => ({ body: { items: [], nextCursor: null } }) },
      ],
    });
    expect(await screen.findByText(/还没有参与过/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('未登录（401）时说明要登录并给出口（组件自身不许崩）', async () => {
    renderWithProviders(<MyBottles />, {
      handlers: [
        {
          path: /\/api\/me\/bottles/,
          respond: () => ({
            status: 401,
            body: { error: { message: '请先登录再继续。', violations: [] } },
          }),
        },
      ],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('需要先登录');
  });
});
