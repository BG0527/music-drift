/**
 * `SegmentPlayer` 单测（播放条）：试听一段、显示已听进度、并按 80% 门槛决定点踩是否可用。
 *
 * 关键约束：
 * - **不给歌词**（CONTEXT §3.2 的"剩余歌词提示"在本 Demo 只给结构性提示：第几段 / 时长）；
 * - 进度**同时**有可访问的 `role="progressbar"` 与文字（"已听 8.0 秒 / 共 20.0 秒"），
 *   不依赖进度条颜色表达进度（DESIGN.md §Accessibility 媒体条款）；
 * - 播放/暂停是**纯图标按钮**，必须带 `aria-label`；
 * - 时长以服务端为准（`durationMs`）。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentPlayer } from './segment-player';

class FakeAudio {
  src: string;
  currentTime = 0;
  paused = true;
  play = vi.fn(async () => {
    this.paused = false;
    this.emit('play');
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.emit('pause');
  });
  private listeners = new Map<string, Set<() => void>>();

  constructor(src = '') {
    this.src = src;
  }

  addEventListener(type: string, handler: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(handler);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, handler: () => void): void {
    this.listeners.get(type)?.delete(handler);
  }

  emit(type: string): void {
    this.listeners.get(type)?.forEach((handler) => handler());
  }

  playThroughTo(seconds: number): void {
    for (let at = 0; at <= seconds + 1e-9; at += 0.25) {
      this.currentTime = Number(at.toFixed(3));
      this.emit('timeupdate');
    }
  }
}

function setup(props: Partial<Parameters<typeof SegmentPlayer>[0]> = {}) {
  const element = new FakeAudio();
  const view = render(
    <SegmentPlayer
      src="/api/segments/abc/audio"
      segmentIndex={2}
      durationMs={20_000}
      createElement={() => element}
      onCastDislike={vi.fn()}
      {...props}
    />,
  );
  return { element, view };
}

describe('SegmentPlayer：结构与可访问性', () => {
  it('显示"第 N 段"与服务端时长（结构性提示，不显示歌词）', () => {
    setup();

    expect(screen.getByText(/第 2 段/)).toBeInTheDocument();
    expect(screen.getByText('00:20')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/歌词/);
  });

  it('播放/暂停是纯图标按钮但带 aria-label', () => {
    const { element } = setup();

    const toggle = screen.getByRole('button', { name: '播放' });
    fireEvent.click(toggle);
    expect(element.play).toHaveBeenCalledTimes(1);

    const pause = screen.getByRole('button', { name: '暂停' });
    fireEvent.click(pause);
    expect(element.pause).toHaveBeenCalledTimes(1);
  });

  it('初始进度条为 0%，并有文字说明"共多少秒"', () => {
    setup();

    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(screen.getByText(/已听 0\.0 秒/)).toBeInTheDocument();
  });

  it('播放推进 → 进度条与文字同步（8 秒 / 20 秒 = 40%）', () => {
    const { element } = setup();

    act(() => {
      element.playThroughTo(8);
    });

    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40');
    expect(screen.getByText(/已听 8\.0 秒/)).toBeInTheDocument();
  });

  it('拖动进度条（跳转）不增加已听时长（反作弊对用户可见）', () => {
    const { element } = setup();

    act(() => {
      element.playThroughTo(2);
    });
    act(() => {
      element.currentTime = 18;
      element.emit('seeking');
      element.emit('timeupdate');
    });

    expect(screen.getByText(/已听 2\.0 秒/)).toBeInTheDocument();
  });
});

describe('SegmentPlayer：点踩门槛', () => {
  it('40% 时点踩不可用，并说明还差多少', () => {
    const { element } = setup();

    act(() => {
      element.playThroughTo(8);
    });

    expect(screen.getByRole('button', { name: /点踩/ })).toBeDisabled();
    expect(screen.getByRole('status').textContent).toContain('还需');
  });

  it('听满 80% 后可点踩，回调带上服务端段号（段号来自 props，不由组件推算）', () => {
    const onCastDislike = vi.fn();
    const { element } = setup({ onCastDislike, segmentIndex: 3 });

    act(() => {
      element.playThroughTo(16);
    });

    const button = screen.getByRole('button', { name: /点踩/ });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onCastDislike).toHaveBeenCalledWith(3);
  });

  it('自己的段始终不能踩（听满也不行）', () => {
    const { element } = setup({ isOwnSegment: true });

    act(() => {
      element.playThroughTo(20);
    });

    expect(screen.getByRole('button', { name: /点踩/ })).toBeDisabled();
    expect(screen.getByRole('status').textContent).toBe('不能踩自己的段。');
  });

  it('时长未知（服务端没给）→ 进度与门槛都按 0 处理，避免"没听就能踩"', () => {
    const { element } = setup({ durationMs: null });

    act(() => {
      element.playThroughTo(20);
    });

    expect(screen.getByRole('button', { name: /点踩/ })).toBeDisabled();
  });
});
