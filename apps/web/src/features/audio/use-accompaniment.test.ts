/**
 * `useAccompaniment` 单测：**只播当前段**的伴奏播放器。
 *
 * 为什么必须"只播当前段"：`docs/architecture.md` §19.3 —— 录音页听到的必须与最终时间槽一致；
 * 若让伴奏一直播下去，用户会按"整首曲子"的听感录，成品接回伴奏时就会错位。
 *
 * 另外两条：
 * - 到达段尾**自动停并回到段首**（不是继续放下去，也不是停在半路）；
 * - 播放增益取曲库的**响度归一结果**（t13 的三首等响目标 -24.73 LUFS），
 *   通过注入的 `applyGain` 端口落到 Web Audio（正增益无法用 `HTMLMediaElement.volume` 表达）。
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LibraryMetadataSchema, type LibraryTrack } from '@music-drift/shared/audio';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useAccompaniment, type AudioElementLike } from './use-accompaniment';

const metadata = LibraryMetadataSchema.parse(
  JSON.parse(
    // vitest 的 cwd = apps/web；直接用绝对路径读构建资产（import.meta.url 在 jsdom 下不是 file:// 方案）
    readFileSync(resolve(process.cwd(), 'public/library/library.json'), 'utf8'),
  ) as unknown,
);

function track(title: string): LibraryTrack {
  const found = metadata.tracks.find((item) => item.title === title);
  if (found === undefined) throw new Error(`缺少曲目 ${title}`);
  return found;
}

class FakeAudio implements AudioElementLike {
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

  seekTo(ms: number): void {
    this.currentTime = ms / 1000;
    this.emit('timeupdate');
  }
}

function setup(options: Partial<Parameters<typeof useAccompaniment>[0]> = {}) {
  const element = new FakeAudio();
  const applyGain = vi.fn();
  const view = renderHook(() => {
    return useAccompaniment({
      track: track('Immersed'),
      segmentIndex: 2,
      environment: { createElement: () => element, applyGain },
      ...options,
    });
  });
  return { element, applyGain, view };
}

describe('useAccompaniment：只播当前段', () => {
  it('第 2 段的时间窗与曲目元数据一致（段号由调用方从服务端取，不由组件推算）', () => {
    const { view } = setup();
    const second = track('Immersed').segments[1]!;

    expect(view.result.current.segment).toEqual({
      index: 2,
      startMs: second.startMs,
      endMs: second.endMs,
      durationMs: second.durationMs,
    });
  });

  it('play：先把播放位置对齐到段首，再播放（不在段外乱放）', async () => {
    const { element, view } = setup();
    const second = track('Immersed').segments[1]!;
    element.currentTime = 100; // 故意停在曲目很后面

    await act(async () => {
      view.result.current.play();
    });

    expect(element.currentTime).toBeCloseTo(second.startMs / 1000, 6);
    expect(element.play).toHaveBeenCalledTimes(1);
  });

  it('到达段尾：自动暂停、回到段首、并回调 onSegmentEnded（不越界播到下一段）', async () => {
    const onSegmentEnded = vi.fn();
    const { element, view } = setup({ onSegmentEnded });
    const second = track('Immersed').segments[1]!;

    await act(async () => {
      view.result.current.play();
    });
    await act(async () => {
      element.seekTo(second.endMs - 200);
      element.seekTo(second.endMs + 40);
    });

    expect(element.pause).toHaveBeenCalled();
    expect(element.currentTime).toBeCloseTo(second.startMs / 1000, 6);
    expect(onSegmentEnded).toHaveBeenCalledTimes(1);
    expect(view.result.current.isPlaying).toBe(false);
  });

  it('段内播放位置可以从 0 连续读到段长（UI 用它显示"本段 00:03 / 00:23"）', async () => {
    const { element, view } = setup();
    const second = track('Immersed').segments[1]!;

    await act(async () => {
      view.result.current.play();
      element.seekTo(second.startMs + 3_000);
    });

    expect(view.result.current.segmentPositionMs).toBeCloseTo(3_000, 0);
    expect(view.result.current.positionMs).toBeCloseTo(second.startMs + 3_000, 0);
  });

  it('切换到另一段：播放位置立刻对齐到新段首（录完一段接着录下一段）', () => {
    const element = new FakeAudio();
    const view = renderHook(
      ({ segmentIndex }: { segmentIndex: number }) =>
        useAccompaniment({
          track: track('Immersed'),
          segmentIndex,
          environment: { createElement: () => element, applyGain: vi.fn() },
        }),
      { initialProps: { segmentIndex: 1 } },
    );

    view.rerender({ segmentIndex: 3 });

    const third = track('Immersed').segments[2]!;
    expect(element.currentTime).toBeCloseTo(third.startMs / 1000, 6);
    expect(view.result.current.segment?.index).toBe(3);
  });

  it('replaySegment：回到段首重播（用户想再听一遍本段）', async () => {
    const { element, view } = setup();
    const second = track('Immersed').segments[1]!;
    await act(async () => {
      view.result.current.play();
      element.seekTo(second.startMs + 5_000);
    });

    await act(async () => {
      view.result.current.replaySegment();
    });

    expect(element.currentTime).toBeCloseTo(second.startMs / 1000, 6);
    expect(view.result.current.segmentPositionMs).toBe(0);
  });

  it('段号不存在（例如作品总段数与曲目不一致）→ 不播放，也不抛异常', async () => {
    const { element, view } = setup({ segmentIndex: 9 });

    expect(view.result.current.segment).toBeNull();
    await act(async () => {
      view.result.current.play();
    });
    expect(element.play).not.toHaveBeenCalled();
  });

  it('pause / stop 都停住；stop 还回到段首', async () => {
    const { element, view } = setup();
    const second = track('Immersed').segments[1]!;
    await act(async () => {
      view.result.current.play();
      element.seekTo(second.startMs + 1_000);
    });

    act(() => {
      view.result.current.pause();
    });
    expect(view.result.current.isPlaying).toBe(false);

    act(() => {
      view.result.current.stop();
    });
    expect(element.currentTime).toBeCloseTo(second.startMs / 1000, 6);
  });
});

describe('useAccompaniment：响度归一增益', () => {
  it('把曲目的归一增益交给 applyGain（正增益只能走 Web Audio，不能靠 volume）', () => {
    const { applyGain } = setup();

    expect(applyGain).toHaveBeenCalledWith(
      expect.anything(),
      track('Immersed').normalization.gainDb,
    );
  });

  it('换段不重复挂增益（增益是曲目级参数，只在曲目变化时应用）', async () => {
    const element = new FakeAudio();
    const applyGain = vi.fn();
    const view = renderHook(
      ({ segmentIndex }: { segmentIndex: number }) =>
        useAccompaniment({
          track: track('Immersed'),
          segmentIndex,
          environment: { createElement: () => element, applyGain },
        }),
      { initialProps: { segmentIndex: 1 } },
    );
    expect(applyGain).toHaveBeenCalledTimes(1);

    view.rerender({ segmentIndex: 2 });

    expect(applyGain).toHaveBeenCalledTimes(1);
  });
});
