import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
