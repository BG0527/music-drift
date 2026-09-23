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
import { SegmentPlayer, type SegmentListenSnapshot } from './segment-player';

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

describe('SegmentPlayer：showDislike（页面自建赞/踩控件时关掉内置踩按钮）', () => {
  /*
   * 背景（用户裁决 + t12）：页面上是「赞 / 踩」一对小按钮，由 `features/bottle/VoteControls` 渲染。
   * 如果播放条再自带一个踩，同一段会出现两个踩（一个还点不动）。
   * 契约上踩只有一条路径：`onProgress` 上报覆盖 + `onCastDislike`/`listen.castDislike()` 投票，
   * 因此这里只需要一个**可选**总开关：默认 true（保持既有行为与既有测试全绿）。
   */
  it('默认（不传）保留内置踩按钮：既有行为不变', () => {
    setup();

    expect(screen.getByRole('button', { name: /点踩/ })).toBeInTheDocument();
  });

  it('showDislike={false}：播放条里不再出现踩按钮，但播放与进度照常', () => {
    const { element } = setup({ showDislike: false });

    expect(screen.queryByRole('button', { name: /点踩/ })).toBeNull();
    // 播放控件与已听文字不受影响（页面把踩换成自己的 VoteControls，不是把功能砍掉）
    expect(screen.getByRole('button', { name: '播放' })).toBeInTheDocument();
    act(() => {
      element.playThroughTo(8);
    });
    expect(screen.getByText(/已听 8\.0 秒/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40');
  });

  it('showDislike={false} 时仍会发进度回调（页面的 VoteControls 靠它决定能不能踩）', () => {
    const onProgress = vi.fn();
    const { element } = setup({ showDislike: false, onProgress });

    act(() => {
      element.playThroughTo(16);
    });

    const last = onProgress.mock.calls.at(-1)?.[0] as { ratio: number; dislikeUnlocked: boolean };
    expect(last.ratio).toBeCloseTo(0.8, 5);
    expect(last.dislikeUnlocked).toBe(true);
  });

  it('showDislike={true}（显式传）与默认一致：踩按钮在且可点', () => {
    const onCastDislike = vi.fn();
    const { element } = setup({ showDislike: true, onCastDislike });

    act(() => {
      element.playThroughTo(16);
    });
    const button = screen.getByRole('button', { name: /点踩/ });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onCastDislike).toHaveBeenCalledWith(2);
  });
});

describe('SegmentPlayer：把真实已听比例透给消费者（t12 点踩门槛依赖它）', () => {
  const lastSnapshot = (onProgress: ReturnType<typeof vi.fn>): SegmentListenSnapshot => {
    const call = onProgress.mock.calls.at(-1);
    expect(call, 'onProgress 一次都没被调用').toBeDefined();
    return call?.[0] as SegmentListenSnapshot;
  };

  it('透出的 ratio 等于 ListenTracker 的覆盖率（组件不自己算第二份）', () => {
    const onProgress = vi.fn();
    const { element } = setup({ durationMs: 20_000, onProgress });

    act(() => {
      element.playThroughTo(10);
    });

    const snapshot = lastSnapshot(onProgress);
    expect(snapshot.segmentIndex).toBe(2);
    expect(snapshot.ratio).toBeCloseTo(0.5, 2);
    expect(snapshot.coveredMs).toBeGreaterThanOrEqual(9_750);
    expect(snapshot.dislikeUnlocked).toBe(false);
  });

  it('拖动进度条（seeking + 大跳跃）不会让比例虚高', () => {
    const onProgress = vi.fn();
    const { element } = setup({ durationMs: 20_000, onProgress });

    act(() => {
      element.playThroughTo(10);
    });
    act(() => {
      element.currentTime = 19; // 跳到接近片尾：这段位移不是"听"
      element.emit('seeking');
      element.emit('timeupdate');
    });
    act(() => {
      element.currentTime = 19.5;
      element.emit('timeupdate');
    });

    const snapshot = lastSnapshot(onProgress);
    // 覆盖率 = [0,10]s + [19,19.5]s = 10.5s / 20s = 0.525；
    // 若把拖动段算进去会得到 ~0.975 —— 这正是"拖动虚高"的失败形态
    expect(snapshot.ratio).toBeLessThan(0.6);
    expect(snapshot.ratio).toBeGreaterThanOrEqual(0.52);
  });

  it('循环重播不叠加：覆盖率封顶 1，但累计播放时长确实增加', () => {
    const onProgress = vi.fn();
    const { element } = setup({ durationMs: 20_000, onProgress });

    act(() => {
      element.playThroughTo(20);
    });
    const first = lastSnapshot(onProgress);
    expect(first.ratio).toBeGreaterThan(0.95);

    act(() => {
      element.currentTime = 0;
      element.emit('seeking');
      element.playThroughTo(20);
    });
    const second = lastSnapshot(onProgress);

    expect(second.ratio).toBeLessThanOrEqual(1);
    expect(second.ratio).toBeGreaterThanOrEqual(first.ratio);
    expect(second.playedMs).toBeGreaterThan(first.playedMs);
  });

  it('门槛解锁由内核判定透出：听满阈值即 unlocked（UI 不写死 0.8）', () => {
    const onProgress = vi.fn();
    const { element } = setup({ durationMs: 20_000, onProgress });

    act(() => {
      element.playThroughTo(17);
    });

    // 17/20 = 0.85 ≥ 内核 DEFAULT_POLICY.dislikeListenRatioThreshold(0.8)
    expect(lastSnapshot(onProgress).dislikeUnlocked).toBe(true);
  });

  it('时长不可信时 fail-closed：ratio 恒为 0、门槛永不解锁', () => {
    const onProgress = vi.fn();
    const { element } = setup({ durationMs: null, onProgress });

    act(() => {
      element.playThroughTo(10);
    });

    const snapshot = lastSnapshot(onProgress);
    expect(snapshot.ratio).toBe(0);
    expect(snapshot.dislikeUnlocked).toBe(false);
  });
});
