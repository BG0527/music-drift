/**
 * `useSegmentPlayer` 单测：Range 播放器的进度统计 + 「听满 80% 才能点踩」的 UI 判定。
 *
 * 用假的 `<audio>` 元素（注入 `createElement`）：jsdom 不实现真正的媒体播放，
 * 但**播放器事件的时序**（timeupdate / seeking / ended）恰恰是这一层最容易写错的地方，
 * 必须能在测试里精确复现。真实 Range 播放的网络语义在后端 `audio.integration.test.ts` 里验。
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSegmentPlayer } from './use-segment-player';

type Listener = (event?: unknown) => void;

class FakeAudio {
  src: string;
  currentTime = 0;
  duration = 20;
  paused = true;
  play = vi.fn(async () => {
    this.paused = false;
    this.emit('play');
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.emit('pause');
  });
  load = vi.fn();
  private listeners = new Map<string, Set<Listener>>();

  constructor(src = '') {
    this.src = src;
  }

  addEventListener(type: string, handler: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(handler);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, handler: Listener): void {
    this.listeners.get(type)?.delete(handler);
  }

  emit(type: string): void {
    this.listeners.get(type)?.forEach((handler) => handler());
  }

  /** 模拟浏览器按 250ms 推进播放位置并触发 timeupdate。 */
  playThrough(fromSec: number, toSec: number, stepSec = 0.25): void {
    for (let at = fromSec; at <= toSec + 1e-9; at += stepSec) {
      this.currentTime = Number(at.toFixed(3));
      this.emit('timeupdate');
    }
  }
}

function setup(options: Partial<Parameters<typeof useSegmentPlayer>[0]> = {}) {
  const element = new FakeAudio(options.src ?? '/api/segments/x/audio');
  const view = renderHook(() =>
    useSegmentPlayer({
      src: '/api/segments/x/audio',
      durationMs: 20_000,
      createElement: () => element,
      ...options,
    }),
  );
  return { element, view };
}

describe('useSegmentPlayer：播放控制', () => {
  it('toggle：调 play / pause，并按事件更新 isPlaying', async () => {
    const { element, view } = setup();

    await act(async () => {
      view.result.current.toggle();
      await Promise.resolve();
    });
    expect(element.play).toHaveBeenCalledTimes(1);
    expect(view.result.current.isPlaying).toBe(true);

    act(() => {
      view.result.current.toggle();
    });
    expect(element.pause).toHaveBeenCalledTimes(1);
    expect(view.result.current.isPlaying).toBe(false);
  });

  it('元素 src 被设为服务端音频地址（Range 端点）', () => {
    const { element } = setup({ src: '/api/segments/abc/audio' });

    expect(element.src).toBe('/api/segments/abc/audio');
  });

  it('seekTo：写 currentTime 并让这次跳转不被计入已听（反作弊）', () => {
    const { element, view } = setup();

    act(() => {
      view.result.current.seekTo(9_000);
    });

    expect(element.currentTime).toBe(9);
    expect(view.result.current.coveredMs).toBe(0);
  });

  it('replay：回到 0 并重新播放，之前听过的覆盖不会翻倍', async () => {
    const { element, view } = setup();
    act(() => {
      element.playThrough(0, 10);
    });
    expect(view.result.current.ratio).toBeCloseTo(0.5, 5);

    await act(async () => {
      view.result.current.replay();
      await Promise.resolve();
    });

    expect(element.currentTime).toBe(0);
    expect(element.play).toHaveBeenCalled();
    expect(view.result.current.ratio).toBeCloseTo(0.5, 5);
  });

  it('play() 被浏览器拒绝（自动播放策略）不会抛出未捕获异常', async () => {
    const element = new FakeAudio();
    element.play = vi.fn(async () => {
      throw new DOMException('blocked', 'NotAllowedError');
    });
    const view = renderHook(() =>
      useSegmentPlayer({
        src: '/api/segments/x/audio',
        durationMs: 20_000,
        createElement: () => element,
      }),
    );

    await act(async () => {
      view.result.current.toggle();
      await Promise.resolve();
    });

    expect(view.result.current.isPlaying).toBe(false);
  });
});

describe('useSegmentPlayer：已播放时长与覆盖率', () => {
  it('timeupdate 推进 → positionMs / coveredMs / playedMs 同步增长', () => {
    const { element, view } = setup();

    act(() => {
      element.playThrough(0, 2);
    });

    expect(view.result.current.positionMs).toBe(2_000);
    expect(view.result.current.coveredMs).toBe(2_000);
    expect(view.result.current.playedMs).toBe(2_000);
    expect(view.result.current.ratio).toBeCloseTo(0.1, 5);
  });

  it('拖动（seeking + 大跳跃）不产生覆盖率', () => {
    const { element, view } = setup();
    act(() => {
      element.playThrough(0, 1);
    });

    act(() => {
      element.currentTime = 18;
      element.emit('seeking');
      element.emit('timeupdate');
      element.currentTime = 18.25;
      element.emit('timeupdate');
    });

    // 只认跳过去之后真的播的那 0.25 秒
    expect(view.result.current.coveredMs).toBe(1_250);
  });

  it('播到结尾（ended）补齐尾差 → 100%', () => {
    const { element, view } = setup();

    act(() => {
      element.playThrough(0, 19.5);
      element.currentTime = 20;
      element.emit('ended');
    });

    expect(view.result.current.ratio).toBe(1);
  });

  it('时长不可信（服务端没给 durationMs）→ 覆盖率恒为 0，点踩不可用', () => {
    const { element, view } = setup({ durationMs: null });

    act(() => {
      element.playThrough(0, 20);
    });

    expect(view.result.current.ratio).toBe(0);
    expect(view.result.current.dislike.allowed).toBe(false);
  });

  it('onProgress 回调把快照交给上层（页面据此显示"已听"与进度条）', () => {
    const onProgress = vi.fn();
    const { element } = setup({ onProgress });

    act(() => {
      element.playThrough(0, 8);
    });

    expect(onProgress).toHaveBeenCalled();
    const last = onProgress.mock.calls.at(-1)?.[0] as { ratio: number; dislikeUnlocked: boolean };
    expect(last.ratio).toBeCloseTo(0.4, 5);
    expect(last.dislikeUnlocked).toBe(false);
  });

  it('src 变化（换到另一段）→ 进度归零，不把上一段的收听算到新段上', () => {
    const element = new FakeAudio();
    const view = renderHook(
      ({ src, durationMs }: { src: string; durationMs: number }) =>
        useSegmentPlayer({ src, durationMs, createElement: () => element }),
      { initialProps: { src: '/api/segments/a/audio', durationMs: 20_000 } },
    );

    act(() => {
      element.playThrough(0, 16);
    });
    expect(view.result.current.ratio).toBeCloseTo(0.8, 5);

    view.rerender({ src: '/api/segments/b/audio', durationMs: 20_000 });

    expect(view.result.current.ratio).toBe(0);
    expect(view.result.current.coveredMs).toBe(0);
    expect(view.result.current.dislike.allowed).toBe(false);
  });
});

describe('useSegmentPlayer：点踩门槛（79.9% / 80%）', () => {
  it('听到 79.9% 不可点踩，并给"还差多少"的文案', () => {
    const { element, view } = setup({ durationMs: 10_000 });

    act(() => {
      element.playThrough(0, 7.99, 0.01);
    });

    expect(view.result.current.ratio).toBeCloseTo(0.799, 3);
    expect(view.result.current.dislike.allowed).toBe(false);
    expect(view.result.current.dislike.code).toBe('LISTEN_RATIO_TOO_LOW');
    expect(view.result.current.dislike.message).toContain('还需');
  });

  it('听到 80% 即可点踩（边界），且不再有阻塞文案', () => {
    const { element, view } = setup({ durationMs: 10_000 });

    act(() => {
      element.playThrough(0, 8, 0.25);
    });

    expect(view.result.current.ratio).toBeCloseTo(0.8, 5);
    expect(view.result.current.dislike.allowed).toBe(true);
    expect(view.result.current.dislike.message).toBeNull();
  });

  it('自己的段听满也不能踩（内核规则），且文案与内核一致', () => {
    const { element, view } = setup({ durationMs: 10_000, isOwnSegment: true });

    act(() => {
      element.playThrough(0, 10, 0.25);
    });

    expect(view.result.current.ratio).toBe(1);
    expect(view.result.current.dislike.allowed).toBe(false);
    expect(view.result.current.dislike.code).toBe('CANNOT_DISLIKE_OWN_SEGMENT');
    expect(view.result.current.dislike.message).toBe('不能踩自己的段。');
  });
});
