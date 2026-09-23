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
      />,
    );

    const gap = screen.getAllByRole('listitem')[1]!;
    expect(within(gap).queryByText(/赞/)).not.toBeInTheDocument();
    expect(within(gap).queryByText(/踩/)).not.toBeInTheDocument();
  });
});
