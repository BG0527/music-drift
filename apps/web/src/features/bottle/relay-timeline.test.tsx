import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RelayTimeline } from './relay-timeline';

const SEGMENTS = [
  {
    id: '11111111-0000-4000-8000-000000000001',
    index: 1,
    note: '在深夜哼一段没有词的曲子，期待接唱',
    ownerCode: '午夜歌手#042',
    likeCount: 0,
    dislikeCount: 0,
    deletedAt: null,
    audioMime: 'audio/webm',
    durationMs: 20_000,
  },
];

/**
 * t17 深度复刻返工（用户打回：「漂流瓶详情页……还是很丑很丑」）。
 * 唯一标准 = `site/bottle.html` + `site/patches/bottle.css`：
 * 装置不再是"每格一张卡片"，而是**挂在瓶身剖面上的一列列标注** ——
 * 段号 `.segNum`、段名 `.segLab`、段位卡 `.cap`（代号 / 时长·赞踩 / 听），
 * 缺口列只有段号+段名（暖色），缺口簇 `.gapBox` 长在服务端给的那一格里。
 * 行为契约（选段 / 举报 / 计数 / 水位 / 瓶塞）一条不减。
 */
describe('瓶身剖面（site/bottle.html 参考结构）', () => {
  it('每段一列：段号 segNum + 段名 segLab + 段位卡 cap（代号 / 时长·赞踩 / 听）', () => {
    render(
      <RelayTimeline
        segments={SEGMENTS}
        totalSegments={4}
        missingSegmentIndexes={[2, 3, 4]}
        onSelectSegment={vi.fn()}
      />,
    );
    const cells = screen.getAllByRole('listitem');
    expect(cells).toHaveLength(4);

    const first = cells[0]!;
    expect(first).toHaveAttribute('data-state', 'filled');
    expect(first.querySelector('.segNum')?.textContent).toBe('1');
    expect(first.querySelector('.segLab')?.textContent).toContain('第 1 段');
    expect(first.querySelector('.cap .code')?.textContent).toBe('午夜歌手#042');
    expect(first.querySelector('.cap')?.textContent).toContain('00:20');
    expect(within(first).getByRole('button', { name: '听第 1 段' })).toBeInTheDocument();
  });

  it('缺口列只有段号+段名（暖色 gap 样式），没有段位卡；缺口语义对读屏显式', () => {
    render(
      <RelayTimeline segments={SEGMENTS} totalSegments={4} missingSegmentIndexes={[2, 3, 4]} />,
    );
    const cells = screen.getAllByRole('listitem');
    const gapCell = cells[1]!;
    expect(gapCell).toHaveAttribute('data-state', 'gap');
    expect(gapCell.querySelector('.segNum')?.classList.contains('gap')).toBe(true);
    expect(gapCell.querySelector('.segLab')?.classList.contains('gap')).toBe(true);
    expect(gapCell.querySelector('.cap')).toBeNull();
    // 参考的段名只写「第 2 段」；缺口语义靠 sr 文本 + data-state，不靠颜色
    expect(gapCell.querySelector('.segLab')?.textContent).toContain('第 2 段');
    expect(gapCell.textContent).toContain('缺口');
  });

  it('缺口簇 gapBox 只长在服务端给的那一格（missingSegmentIndexes[0]），带缺口槽/标题/说明', () => {
    render(
      <RelayTimeline
        segments={SEGMENTS}
        totalSegments={4}
        missingSegmentIndexes={[2, 3, 4]}
        gapNote="接唱只能唱这一段：第 2 段是服务端给你的下一段。"
      />,
    );
    const boxes = document.querySelectorAll('.gapBox');
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.textContent).toContain('缺口');
    expect(boxes[0]!.textContent).toContain('第 2 段');
    // 长在第 2 列里（列序由 --gap-col 给，落位由 bottle-page.css 的参考坐标算）
    expect(boxes[0]!.getAttribute('style')).toContain('--gap-col: 2');
  });

  it('水位：连续录满的段数决定水面（data-water-front）与浮卷数（data-rolls）', () => {
    const FILLED_1_3 = [
      SEGMENTS[0]!,
      { ...SEGMENTS[0]!, id: '11111111-0000-4000-8000-000000000003', index: 3, ownerCode: '雾中松', durationMs: 22_000 },
    ];
    render(
      <RelayTimeline segments={FILLED_1_3} totalSegments={4} missingSegmentIndexes={[2, 4]} />,
    );
    const body = screen.getByTestId('bottle-body');
    // 水只到第 1 段（缺口在中间 ⇒ 后面的水不凭空盖过去）
    expect(body).toHaveAttribute('data-water-front', '1');
    expect(within(body).getByTestId('bottle-water-level')).toHaveTextContent('水只到第 1 段');
    // 每一格仍显式标出有没有段（第 3 段有人唱过，但它在缺口之后 ⇒ 不算进水位）
    const cells = within(body).getAllByRole('listitem');
    expect(cells.map((cell) => cell.getAttribute('data-filled'))).toEqual([
      'true',
      'false',
      'true',
      'false',
    ]);
  });

  it('瓶子里还没有人唱过时：heroLab 读「水还没进来」，一格水都不画', () => {
    render(<RelayTimeline segments={[]} totalSegments={4} missingSegmentIndexes={[1, 2, 3, 4]} />);
    const body = screen.getByTestId('bottle-body');
    expect(body).toHaveAttribute('data-water-front', '0');
    expect(body.querySelectorAll('[data-filled="true"]')).toHaveLength(0);
    expect(within(body).getByTestId('bottle-water-level')).toHaveTextContent('水还没进来');
  });

  it('选中的那一段：段名变珊瑚（sel）+ 珊瑚刻度 selMark 挂在该列', () => {
    render(
      <RelayTimeline
        segments={SEGMENTS}
        totalSegments={4}
        missingSegmentIndexes={[2, 3, 4]}
        selectedSegmentId={SEGMENTS[0]!.id}
        onSelectSegment={vi.fn()}
      />,
    );
    const mark = document.querySelector('.selMark');
    expect(mark, '选中列缺珊瑚刻度 selMark').not.toBeNull();
    expect(mark!.getAttribute('style')).toContain('--sel-col: 1');
  });
});

/**
 * 行为契约（原「接力时间轴」测试保留）：段号升序、被斩不留遗迹、附言原样、
 * 选段试听、举报入口、赞/踩计数来自服务端。
 */
describe('接力时间轴：行为契约（不因复刻返工回退）', () => {
  it('按段号升序展示，并显式标出缺口位置（不把后面的段前移）', () => {
    render(<RelayTimeline segments={SEGMENTS} totalSegments={4} missingSegmentIndexes={[2, 3]} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('第 1 段'),
      expect.stringContaining('第 2 段'),
      expect.stringContaining('第 3 段'),
      expect.stringContaining('第 4 段'),
    ]);
    expect(items[1]).toHaveAttribute('data-state', 'gap');
    expect(items[3]).toHaveAttribute('data-state', 'gap');
  });

  it('每段显示匿名代号与时长（中文页面里不出现英文枚举）', () => {
    render(<RelayTimeline segments={SEGMENTS} totalSegments={4} missingSegmentIndexes={[]} />);
    expect(screen.getByText('午夜歌手#042')).toBeInTheDocument();
    expect(screen.getByText('00:20')).toBeInTheDocument();
  });

  it('被斩的段不出现在剖面上（对外不留遗迹）', () => {
    render(
      <RelayTimeline
        segments={[{ ...SEGMENTS[0]!, deletedAt: '2026-09-23T00:00:00.000Z' }]}
        totalSegments={4}
        missingSegmentIndexes={[1]}
      />,
    );
    const list = screen.getByTestId('relay-timeline');
    expect(within(list).getAllByRole('listitem')[0]).toHaveAttribute('data-state', 'gap');
    expect(screen.queryByText('午夜歌手#042')).not.toBeInTheDocument();
  });

  it('附言不进剖面卡（参考 .cap 只有 代号 / 时长·赞踩 / 听 三行；附言挂在 votesNote，见页面测试）', () => {
    render(<RelayTimeline segments={SEGMENTS} totalSegments={4} missingSegmentIndexes={[]} />);
    expect(document.querySelector('.cap .capNote')).toBeNull();
    expect(document.querySelector('.cap')).toHaveTextContent('午夜歌手#042');
  });

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

  it('有段的列显示服务端给的赞/踩数', () => {
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

  it('缺口列没有计数（不是段，就没有票数）', () => {
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

  it('瓶塞＝有人持有：持有状态由页面传入，不在手上时没有瓶塞', () => {
    const FILLED_1_3 = [
      SEGMENTS[0]!,
      { ...SEGMENTS[0]!, id: '11111111-0000-4000-8000-000000000003', index: 3, ownerCode: '雾中松', durationMs: 22_000 },
    ];
    const { rerender } = render(
      <RelayTimeline segments={FILLED_1_3} totalSegments={4} missingSegmentIndexes={[2, 4]} status="HELD" />,
    );
    expect(screen.getByTestId('bottle-cork')).toHaveTextContent('有人持有');
    rerender(
      <RelayTimeline segments={FILLED_1_3} totalSegments={4} missingSegmentIndexes={[2, 4]} status="IN_RIVER" />,
    );
    expect(screen.queryByTestId('bottle-cork')).not.toBeInTheDocument();
  });
});
