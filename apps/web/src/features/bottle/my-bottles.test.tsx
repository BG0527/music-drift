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
 * 装置断言（返工令：逐块照抄 p-profile-record.html 的 `.crate` / `.window` / `.lay`）：
 * **每格一根沉积柱，4 层位＝4 段位**；柱子 `aria-hidden`，文字行给盲读等价物。
 * 层位状态由服务端字段推：`missingSegmentIndexes` → `.wt` 空腔、其余 → `.sd` 实心、
 * `mySegmentIndexes` → `.mine` 珊瑚刻记；行结构（.veil/.r1/.slot/.role/.t/.d/.lk）按稿。
 */
describe('装置：稿 .window 行 + .lay 沉积柱（4 层位＝4 段位）', () => {
  it('稿块在位：.crate/.chead(共 N 支=真数据)/.csub/.window/.veil/.txt(r1·slot·role·t·d·lk)', async () => {
    const { container } = renderWithProviders(<MyBottles />, {
      handlers: [
        {
          path: /\/api\/me\/bottles/,
          respond: () => ({ body: { items: [myBottle()], nextCursor: null } }),
        },
      ],
    });

    expect(await screen.findByText('共 1 支')).toBeInTheDocument();
    const crate = container.querySelector('.crate');
    expect(crate?.querySelector('.chead h2')?.textContent).toBe('我参与过的漂流瓶');
    expect(crate?.querySelector('.csub')?.textContent).toBe(
      '我发起的、以及我唱过一段的瓶子都会在这里（按最近活跃排序，时间线来自服务端）。',
    );
    const win = crate?.querySelector('.window');
    expect(win, '稿 .window 列表窗').not.toBeNull();
    const row = win?.querySelector('ul > li');
    expect(row?.querySelector('.lay'), '行左沉积柱').not.toBeNull();
    expect(row?.querySelector('.veil'), '稿 .veil 幕').not.toBeNull();
    expect(row?.querySelector('.txt .r1 .slot')?.textContent).toBe('01');
    expect(row?.querySelector('.txt .r1 .role')?.textContent).toBe('我接唱的');
    expect(row?.querySelector('.txt .t')?.textContent).toBe('深海鲸落');
    // 夹具：已录 2/4 + 我唱的第 2 段 + 缺第 3、4 段
    expect((row?.querySelectorAll('.txt .d') ?? []).length).toBe(3);
    expect((row?.querySelectorAll('.lk a') ?? []).length).toBe(2);
  });

  it('每格一根柱：层位数 = totalSegments；已录段 .sd 实心、缺口段 .wt 空腔、我唱的那层带刻记', async () => {
    const { container } = renderWithProviders(<MyBottles />, {
      handlers: [
        {
          path: /\/api\/me\/bottles/,
          respond: () => ({ body: { items: [myBottle()], nextCursor: null } }),
        },
      ],
    });

    await screen.findByText('深海鲸落');
    const layers = container.querySelectorAll('.lay i[data-segment]');
    expect(layers, '每格必须有一根沉积柱，层位数 = totalSegments（4）').toHaveLength(4);
    // 夹具：缺口 [3,4]、我唱第 2 段
    const b3 = container.querySelector('.lay i[data-segment="3"]');
    expect(b3?.getAttribute('data-state')).toBe('cavity');
    expect(b3?.classList.contains('wt'), '稿：缺口层 = .wt 水腔').toBe(true);
    const b2 = container.querySelector('.lay i[data-segment="2"]');
    expect(b2?.getAttribute('data-state')).toBe('sediment');
    expect(b2?.classList.contains('sd'), '稿：已录层 = .sd 沉积').toBe(true);
    expect(b2?.getAttribute('data-mine')).toBe('true');
    expect(b2?.classList.contains('mine'), '稿：我唱的层加 .mine 刻记').toBe(true);
    expect(container.querySelector('.lay i[data-segment="1"]')?.classList.contains('b1')).toBe(true);
    expect(container.querySelector('.lay i[data-segment="4"]')?.classList.contains('b4')).toBe(true);
  });

  it('被斩：mySegmentIndexes 被清空后层位**仍留在柱上**（4 层不少一层），被挖走的那层是稿的 .cut', async () => {
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
    expect(container.querySelectorAll('.lay i[data-segment]')).toHaveLength(4);
    const cutLayer = container.querySelector('.lay i[data-segment="2"]');
    // 稿 row5：我的那段被斩 = 层位还在、内容挖走（虚线珊瑚 .cut），且可从唯一缺口 + 我段清空推出
    expect(cutLayer?.getAttribute('data-state')).toBe('cut');
    expect(cutLayer?.classList.contains('cut')).toBe(true);
    expect(cutLayer?.classList.contains('wt'), '被斩层不是水腔（它是被挖走，不是没录）').toBe(false);
    expect(screen.getByText(/我唱的那一段被斩浪删除了/)).toBeInTheDocument();
    expect(screen.getByText(/缺第 2 段/)).toBeInTheDocument();
  });
});

/**
 * 行内回传待办（稿 .window 行的 `.st` 实心暖牌 + `.due`，柱口 `.lay.ret`/`.shaft`/`.hoop` 回航泊位）：
 * 只在 `awaitingMyAction=true` 时出现；false / 字段缺失都不出现（安全降级 —— 宁可不弹，也不误报）。
 * 整块回传提示已按返工令移到 profile 页的 `.msgs li.hero`（profile-and-settings-page.test.tsx 守三态）。
 */
describe('回传待办：awaitingMyAction 行内 .st 牌的出现与不出现三态', () => {
  it('有一条 true → 该行挂 .st「等你操作」+.due，柱子是 .lay.ret（shaft+hoop 回航泊位）', async () => {
    const { container } = renderWithProviders(<MyBottles />, {
      handlers: [
        {
          path: /\/api\/me\/bottles/,
          respond: () => ({
            body: { items: [myBottle({ awaitingMyAction: true })], nextCursor: null },
          }),
        },
      ],
    });

    expect(await screen.findByText('等你操作')).toBeInTheDocument();
    expect(container.querySelector('.window li .st')).not.toBeNull();
    expect(container.querySelector('.window li .due')?.textContent).toBe('回传决策时限 48 小时');
    expect(container.querySelector('.lay.ret .shaft'), '回航泊位：柱身暖光 shaft').not.toBeNull();
    expect(container.querySelector('.lay .hoop'), '回航泊位：柱口系缆环 hoop').not.toBeNull();
  });

  it('没有任何一条为 true（字段缺失 = 契约 default false）→ .st 牌与 ret/hoop 都不出现', async () => {
    const { container } = renderWithProviders(<MyBottles />, {
      handlers: [
        { path: /\/api\/me\/bottles/, respond: () => ({ body: { items: [myBottle()], nextCursor: null } }) },
      ],
    });

    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();
    expect(container.querySelector('.window li .st')).toBeNull();
    expect(container.querySelector('.lay.ret')).toBeNull();
    expect(container.querySelector('.lay .hoop')).toBeNull();
    expect(screen.queryByText('等你操作')).not.toBeInTheDocument();
  });

  it('awaitingMyAction 显式为 false 同样不出现（不靠"字段在不在"判断）', async () => {
    const { container } = renderWithProviders(<MyBottles />, {
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
    expect(container.querySelector('.window li .st')).toBeNull();
    expect(container.querySelector('.lay.ret')).toBeNull();
    expect(screen.queryByText('等你操作')).not.toBeInTheDocument();
  });
});
