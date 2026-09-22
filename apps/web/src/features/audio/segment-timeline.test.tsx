/**
 * `SegmentTimeline` 单测：段落时间轴（有序列表 + 河道线）。
 *
 * ADR-015 的语义必须体现在界面上：段号是**歌里的固定位置**（1..total），
 * 斩浪留下的位置是**缺口**（不是"少一段"），所以缺口要有独立状态文案，不能被压掉。
 * 另外：只显示结构性信息（第几段 / 时长 / 状态），不显示歌词正文。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SegmentTimeline } from './segment-timeline';

describe('SegmentTimeline', () => {
  it('按段号渲染有序列表，每段给"第 N 段"与时长', () => {
    render(
      <SegmentTimeline
        segments={[
          { index: 1, durationMs: 22_500, state: 'done' },
          { index: 2, durationMs: null, state: 'pending' },
          { index: 3, durationMs: null, state: 'pending' },
          { index: 4, durationMs: null, state: 'pending' },
        ]}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]?.textContent).toContain('第 1 段');
    expect(items[0]?.textContent).toContain('00:22');
    expect(items[1]?.textContent).toContain('等待接唱');
  });

  it('缺口段（斩浪留下的位置）有独立文案，不伪装成"已完成"', () => {
    render(
      <SegmentTimeline
        segments={[
          { index: 1, durationMs: 20_000, state: 'done' },
          { index: 2, durationMs: null, state: 'gap' },
          { index: 3, durationMs: 19_000, state: 'done' },
        ]}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items[1]?.textContent).toContain('第 2 段');
    expect(items[1]?.textContent).toContain('缺口');
    expect(items[1]?.textContent).not.toContain('已录');
  });

  it('当前段用 aria-current 标出（键盘/读屏可定位）', () => {
    render(
      <SegmentTimeline
        currentIndex={2}
        segments={[
          { index: 1, durationMs: 20_000, state: 'done' },
          { index: 2, durationMs: null, state: 'recording' },
        ]}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items[1]?.getAttribute('aria-current')).toBe('step');
    expect(items[1]?.textContent).toContain('录制中');
    expect(items[0]?.getAttribute('aria-current')).toBeNull();
  });

  it('已听比例（可选）以文字给出，不靠颜色深浅表达', () => {
    render(
      <SegmentTimeline
        segments={[{ index: 1, durationMs: 20_000, state: 'done', listenedRatio: 0.4 }]}
      />,
    );

    expect(screen.getByText(/已听 40%/)).toBeInTheDocument();
  });

  it('不渲染任何歌词正文（只给结构性提示）', () => {
    render(<SegmentTimeline segments={[{ index: 1, durationMs: 20_000, state: 'done' }]} />);

    expect(document.body.textContent).not.toMatch(/歌词/);
  });
});
