import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RelayTimeline } from './relay-timeline';

const SEGMENTS = [
  {
    id: '11111111-0000-4000-8000-000000000001',
    index: 1,
    ownerId: 'user-a',
    note: '在深夜哼一段没有词的曲子，期待接唱',
    ownerCode: '午夜歌手#042',
    likeCount: 0,
    dislikeCount: 0,
    deletedAt: null,
    audioMime: 'audio/webm',
    durationMs: 20_000,
  },
];

describe('接力时间轴', () => {
  it('按段号升序展示，并显式标出缺口位置（不把后面的段前移）', () => {
    render(<RelayTimeline segments={SEGMENTS} totalSegments={4} missingSegmentIndexes={[2, 3]} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('第 1 段'),
      expect.stringContaining('缺第 2 段'),
      expect.stringContaining('缺第 3 段'),
      expect.stringContaining('第 4 段'),
    ]);
    // 缺口项必须说明该位置为什么是空的
    expect(items[1]).toHaveAttribute('data-state', 'gap');
  });

  it('每段显示匿名代号与时长（中文页面里不出现英文枚举）', () => {
    render(<RelayTimeline segments={SEGMENTS} totalSegments={4} missingSegmentIndexes={[]} />);
    expect(screen.getByText('午夜歌手#042')).toBeInTheDocument();
    expect(screen.getByText('00:20')).toBeInTheDocument();
  });

  it('被斩的段不出现在时间轴上（对外不留遗迹）', () => {
    render(
      <RelayTimeline
        segments={[{ ...SEGMENTS[0]!, deletedAt: '2026-09-23T00:00:00.000Z' }]}
        totalSegments={4}
        missingSegmentIndexes={[1]}
      />,
    );
    const list = screen.getByTestId('relay-timeline');
    expect(within(list).getByText(/缺第 1 段/)).toBeInTheDocument();
    expect(screen.queryByText('午夜歌手#042')).not.toBeInTheDocument();
  });

  it('附言原样展示（CONTEXT §12.2）；没有附言时不留空行', () => {
    const { rerender } = render(
      <RelayTimeline segments={SEGMENTS} totalSegments={4} missingSegmentIndexes={[]} />,
    );
    expect(screen.getByText(/期待接唱/)).toBeInTheDocument();
    rerender(
      <RelayTimeline
        segments={[{ ...SEGMENTS[0]!, note: null }]}
        totalSegments={4}
        missingSegmentIndexes={[]}
      />,
    );
    expect(screen.queryByText(/期待接唱/)).not.toBeInTheDocument();
  });
});

/**
 * §46.3「一屏装下」逼出来的两个结构决定：
 * 1. 时间轴**一行一条**（原来每段占三行，举报还单起一行）；
 * 2. 页面上**同时只放一个播放器**，放哪一段由时间轴决定 —— 时间轴因此多了"选段"职责。
 */
describe('接力时间轴：选段试听', () => {
  it('给了 onSelectSegment 时每段有「听这一段」，点它把该段选出来', () => {
    const onSelect = vi.fn();
    render(
      <RelayTimeline
        segments={SEGMENTS}
        totalSegments={4}
        missingSegmentIndexes={[2, 3]}
        selectedSegmentId={null}
        onSelectSegment={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '听第 1 段' }));
    expect(onSelect).toHaveBeenCalledWith(SEGMENTS[0]!.id);
  });

  it('选中的那一段有 aria-current（不是只靠颜色表达选中）', () => {
    render(
      <RelayTimeline
        segments={SEGMENTS}
        totalSegments={4}
        missingSegmentIndexes={[2, 3]}
        selectedSegmentId={SEGMENTS[0]!.id}
        onSelectSegment={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '听第 1 段' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('没给 onSelectSegment 时不渲染「听这一段」（不制造假控件）', () => {
    render(<RelayTimeline segments={SEGMENTS} totalSegments={4} missingSegmentIndexes={[]} />);

    expect(screen.queryByRole('button', { name: '听第 1 段' })).not.toBeInTheDocument();
  });

  it('举报是图标按钮但可命名（在同一行内解决，不再单起一行）', () => {
    render(
      <RelayTimeline
        segments={SEGMENTS}
        totalSegments={4}
        missingSegmentIndexes={[]}
        onReportSegment={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '举报第 1 段' })).toBeInTheDocument();
  });
});

/**
 * §46.3 之后行内还要放赞/踩计数（t32）：数字必须**来自服务端**（`SegmentSchema.likeCount/dislikeCount`），
 * 行内只做展示 —— 缺口的行没有段，自然也没有计数，不许补 0 假装统计过。
 */
describe('接力时间轴：每行显示该段的赞/踩计数', () => {
  it('有段的行显示服务端给的赞/踩数', () => {
    render(
      <RelayTimeline
        segments={[{ ...SEGMENTS[0]!, likeCount: 3, dislikeCount: 2 }]}
        totalSegments={4}
        missingSegmentIndexes={[2, 3]}
      />,
    );

    expect(screen.getByText('赞 3')).toBeInTheDocument();
    expect(screen.getByText('踩 2')).toBeInTheDocument();
  });

  it('缺口行没有计数（不是段，就没有票数）', () => {
    render(
      <RelayTimeline
        segments={[{ ...SEGMENTS[0]!, likeCount: 3, dislikeCount: 2 }]}
        totalSegments={4}
        missingSegmentIndexes={[2, 3]}
      />
    );

    const gap = screen.getAllByRole('listitem')[1]!;
    expect(within(gap).queryByText(/赞/)).not.toBeInTheDocument();
    expect(within(gap).queryByText(/踩/)).not.toBeInTheDocument();
  });
});

/**
 * record-v1 的 `/bottles/:id` 装置：**横躺的玻璃瓶剖面**。
 *
 * 四个位置各自承担信息，缺一条这一片就不算通过（实施计划 §5.1）：
 * - 瓶内的**水**只到"最高已录段位"（水位＝已录段数）；
 * - **干格**＝缺口（歌里固定的段位，成品里留成静音，不会被顶替）；
 * - 漂着的**瓶塞**＝有人持有（状态由页面给，组件不自己猜）。
 *
 * 水与干格是**每个段位格自己的**（有水＝这一段有人唱过），所以"水位只到第 N 段"
 * 是这些格子的整体读数，而不是另算一个数 —— 缺口在中间时也不会被水淹没。
 */
describe('接力时间轴：瓶身剖面（横躺的瓶）', () => {
  /** 第 1 段与第 3 段有人唱过，缺第 2、4 段。 */
  const FILLED_1_3 = [
    SEGMENTS[0]!,
    {
      ...SEGMENTS[0]!,
      id: '11111111-0000-4000-8000-000000000003',
      index: 3,
      ownerCode: '雾中松',
      durationMs: 22_000,
    },
  ];

  it('瓶内水位＝已录段数：有水的是已录段位，干格是缺口', () => {
    render(
      <RelayTimeline segments={FILLED_1_3} totalSegments={4} missingSegmentIndexes={[2, 4]} />,
    );

    const body = screen.getByTestId('bottle-body');
    const cells = within(body).getAllByRole('listitem');
    // 逐格：干＝缺口，水＝已录（缺口在中间时不会被水淹没）
    expect(cells.map((cell) => cell.getAttribute('data-filled'))).toEqual([
      'true',
      'false',
      'true',
      'false',
    ]);
    // 整体读数：水只到最高已录段位（第 3 段）
    expect(within(body).getByTestId('bottle-water-level')).toHaveTextContent('水只到第 3 段');
  });

  it('瓶子里还没有人唱过时，一格水都没有（不假装有水）', () => {
    render(<RelayTimeline segments={[]} totalSegments={4} missingSegmentIndexes={[1, 2, 3, 4]} />);

    const body = screen.getByTestId('bottle-body');
    expect(body.querySelectorAll('[data-filled="true"]')).toHaveLength(0);
    expect(within(body).getByTestId('bottle-water-level')).toHaveTextContent('还没有人唱过');
  });

  it('瓶塞＝有人持有：持有状态由页面传入，不在手上时没有瓶塞', () => {
    const { rerender } = render(
      <RelayTimeline
        segments={FILLED_1_3}
        totalSegments={4}
        missingSegmentIndexes={[2, 4]}
        status="HELD"
      />,
    );
    expect(screen.getByTestId('bottle-cork')).toHaveTextContent('有人持有');

    rerender(
      <RelayTimeline
        segments={FILLED_1_3}
        totalSegments={4}
        missingSegmentIndexes={[2, 4]}
        status="IN_RIVER"
      />,
    );
    expect(screen.queryByTestId('bottle-cork')).not.toBeInTheDocument();
  });
});
