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

/**
 * 装置断言（docs/impl-plan-record-v1.md §5.1 `/me` 行）：**每格一根沉积柱，4 层位＝4 段位**。
 * 柱子是承载信息的装置（不是贴纸）：层位数来自服务端 `totalSegments`，已录＝实心沉积、
 * 缺口＝层位还在但内容挖空；文字行已给盲读等价物，所以柱子本体 `aria-hidden`。
 */
describe('装置：沉积柱（4 层位＝4 段位，被斩/缺口＝层位还在、内容挖空）', () => {
  it('每格一根柱：层位数 = totalSegments；已录段实心、缺口段空腔、我唱的那层带刻记', async () => {
    const { container } = renderWithProviders(<MyBottles />, {
      handlers: [
        {
          path: /\/api\/me\/bottles/,
          respond: () => ({ body: { items: [myBottle()], nextCursor: null } }),
        },
      ],
    });

    await screen.findByText('深海鲸落');
    const layers = container.querySelectorAll('[data-sediment-layer]');
    expect(layers, '每格必须有一根沉积柱，层位数 = totalSegments（4）').toHaveLength(4);
    // 夹具：缺口 [3,4]、我唱第 2 段
    expect(
      container.querySelector('[data-sediment-layer][data-segment="3"]')?.getAttribute('data-state'),
    ).toBe('cavity');
    expect(
      container.querySelector('[data-sediment-layer][data-segment="2"]')?.getAttribute('data-state'),
    ).toBe('sediment');
    expect(
      container.querySelector('[data-sediment-layer][data-segment="2"]')?.getAttribute('data-mine'),
    ).toBe('true');
  });

  it('被斩：mySegmentIndexes 被清空后层位**仍留在柱上**（4 层不少一层），被挖走的那层是空腔', async () => {
    const { container } = renderWithProviders(<MyBottles />, {
      handlers: [
        {
          path: /\/api\/me\/bottles/,
          respond: () => ({
            body: {
              items: [myBottle({ recordedCount: 3, missingSegmentIndexes: [2], mySegmentIndexes: [] })],
              nextCursor: null,
            },
          }),
        },
      ],
    });

    await screen.findByText('深海鲸落');
    expect(container.querySelectorAll('[data-sediment-layer]')).toHaveLength(4);
    expect(
      container.querySelector('[data-sediment-layer][data-segment="2"]')?.getAttribute('data-state'),
    ).toBe('cavity');
  });
});

/**
 * 「收到回传 · 等你操作」（W6，`MyBottle.awaitingMyAction`）：任一条为 true 才出提示；
 * 一条都不是 true 时**整块提示不出现**（安全降级 —— 宁可不弹，也不误报）。
 */
describe('回传提示：awaitingMyAction 的出现与不出现两态', () => {
  it('有一条 awaitingMyAction=true → 出现「收到回传 · 等你操作」整块提示，该行挂「等你操作」牌', async () => {
    renderWithProviders(<MyBottles />, {
      handlers: [
        {
          path: /\/api\/me\/bottles/,
          respond: () => ({
            body: { items: [myBottle({ awaitingMyAction: true })], nextCursor: null },
          }),
        },
      ],
    });

    expect(await screen.findByText('收到回传 · 等你操作')).toBeInTheDocument();
    expect(screen.getByText('等你操作')).toBeInTheDocument();
  });

  it('没有任何一条为 true（字段缺失 = 契约 default false）→ 整块提示不出现', async () => {
    renderWithProviders(<MyBottles />, {
      handlers: [
        { path: /\/api\/me\/bottles/, respond: () => ({ body: { items: [myBottle()], nextCursor: null } }) },
      ],
    });

    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();
    expect(screen.queryByText('收到回传 · 等你操作')).not.toBeInTheDocument();
    expect(screen.queryByText('等你操作')).not.toBeInTheDocument();
  });

  it('awaitingMyAction 显式为 false 同样不出现（不靠"字段在不在"判断）', async () => {
    renderWithProviders(<MyBottles />, {
      handlers: [
        {
          path: /\/api\/me\/bottles/,
          respond: () => ({
            body: { items: [myBottle({ awaitingMyAction: false })], nextCursor: null },
          }),
        },
      ],
    });

    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();
    expect(screen.queryByText('收到回传 · 等你操作')).not.toBeInTheDocument();
    expect(screen.queryByText('等你操作')).not.toBeInTheDocument();
  });
});
