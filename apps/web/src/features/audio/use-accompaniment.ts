/**
 * `useAccompaniment`：**只播当前段**的伴奏播放器（t13）。
 *
 * ## 为什么必须"只播当前段"
 *
 * `docs/architecture.md` §19.3：录音页播放的伴奏必须只播当前段（或从该段起拍开始），
 * 这样用户听到的与最终时间槽一致。让伴奏一路播下去会让人按"整首曲子"的听感去唱，
 * 成品接回伴奏时就会错位 —— 这正是阶段二要避免的坑。
 *
 * ## 两个技术约束
 *
 * 1. **段内播放 + 段尾自动停**：`timeupdate` 上做判定，到 `endMs` 立刻 `pause()` 并回到段首
 *    （不是停在半路，也不是越界播到下一段）；
 * 2. **响度归一要走 Web Audio**：三首曲目的归一增益有正有负（+2.96 / −1.91 / +1.93 dB），
 *    而 `HTMLMediaElement.volume` 只能衰减到 0..1，**表达不了正增益**；
 *    因此通过注入的 `applyGain` 端口落到 `GainNode`（默认实现见文件末尾）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dbToLinear, segmentWindow, type LibraryTrack } from '@music-drift/shared/audio';

export interface AudioElementLike {
  src: string;
  currentTime: number;
  paused: boolean;
  play: () => Promise<void> | void;
  pause: () => void;
  addEventListener: (type: string, handler: () => void) => void;
  removeEventListener: (type: string, handler: () => void) => void;
}

export interface AccompanimentEnvironment {
  createElement: (src: string) => AudioElementLike;
  /** 把归一增益落到 Web Audio（默认实现：`createMediaElementSource` + `GainNode`）。 */
  applyGain: (element: AudioElementLike, gainDb: number) => void;
}

export interface UseAccompanimentOptions {
  track: LibraryTrack;
  /** 当前要录/试听的段号（**来自服务端** `nextRecordIndex`，不由前端推算）。 */
  segmentIndex: number;
  environment?: Partial<AccompanimentEnvironment>;
  /** 本段播完（用户可能需要"再听一遍"或开始录）。 */
  onSegmentEnded?: () => void;
}

export interface UseAccompanimentResult {
  isPlaying: boolean;
  /** 曲目内的绝对位置（ms）。 */
  positionMs: number;
  /** 段内位置（ms），0..段长。 */
  segmentPositionMs: number;
  segment: { index: number; startMs: number; endMs: number; durationMs: number } | null;
  gainDb: number;
  play: () => void;
  pause: () => void;
  stop: () => void;
  replaySegment: () => void;
}

/** 段尾判定的容差：浏览器 `timeupdate` 约 250ms 一次，留一点余量避免"刚好卡在边界"。 */
const SEGMENT_END_TOLERANCE_MS = 40;

function createAudioElement(src: string): AudioElementLike {
  const element = new Audio();
  element.preload = 'metadata';
  element.src = src;
  return element;
}

/** 默认增益实现：Web Audio 图（`element → GainNode → destination`），支持正增益。 */
function createWebAudioGain(): (element: AudioElementLike, gainDb: number) => void {
  let context: AudioContext | null = null;
  const nodes = new WeakMap<object, GainNode>();
  return (element, gainDb) => {
    const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (Ctor === undefined) return; // 没有 Web Audio 就不加增益（不静默改音量语义）
    context ??= new Ctor();
    let gain = nodes.get(element);
    if (gain === undefined) {
      const source = context.createMediaElementSource(element as unknown as HTMLMediaElement);
      gain = context.createGain();
      source.connect(gain);
      gain.connect(context.destination);
      nodes.set(element, gain);
    }
    gain.gain.value = dbToLinear(gainDb);
  };
}

export function useAccompaniment(options: UseAccompanimentOptions): UseAccompanimentResult {
  const { track, segmentIndex } = options;
  const [createElement] = useState(() => options.environment?.createElement ?? createAudioElement);
  const [applyGain] = useState(() => options.environment?.applyGain ?? createWebAudioGain());
  const onSegmentEndedRef = useRef(options.onSegmentEnded);
  useEffect(() => {
    onSegmentEndedRef.current = options.onSegmentEnded;
  }, [options.onSegmentEnded]);

  const segment = useMemo(() => segmentWindow(track, segmentIndex), [track, segmentIndex]);
  const gainDb = track.normalization.gainDb;

  const elementRef = useRef<AudioElementLike | null>(null);
  const segmentRef = useRef(segment);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(segment?.startMs ?? 0);

  // 段号/曲目变化时更新 ref（事件回调里读到最新的段时间窗）
  useEffect(() => {
    segmentRef.current = segment;
  }, [segment]);

  // ── 效果 A：元素生命周期 + 曲目级增益 ──
  // 增益是**曲目级**参数（响度归一的结果），换段不该重复施加；元素也要跟着曲目走。
  useEffect(() => {
    const element = createElement(track.accompanimentRef);
    elementRef.current = element;
    applyGain(element, gainDb);
    return () => {
      element.pause();
      elementRef.current = null;
    };
  }, [applyGain, createElement, gainDb, track.accompanimentRef]);

  // ── 效果 B：段时间窗（监听 + 把播放头摆到段首）──
  // 与增益分离，换段只做"重定位 + 重挂监听"，不重复建元素/施加增益。
  useEffect(() => {
    const element = elementRef.current;
    if (element === null) return;

    const active = segmentRef.current;
    if (active === null) {
      element.pause();
      setIsPlaying(false);
      return;
    }

    const onTimeUpdate = (): void => {
      const current = segmentRef.current;
      if (current === null) return;
      const position = element.currentTime * 1000;
      if (position >= current.endMs - SEGMENT_END_TOLERANCE_MS) {
        // 段尾：暂停 + 回到段首（不越界播到下一段，也不停在半路）
        element.pause();
        element.currentTime = current.startMs / 1000;
        setPositionMs(current.startMs);
        setIsPlaying(false);
        onSegmentEndedRef.current?.();
        return;
      }
      setPositionMs(position);
    };
    const onPlay = (): void => {
      setIsPlaying(true);
    };
    const onPause = (): void => {
      setIsPlaying(false);
    };

    element.addEventListener('timeupdate', onTimeUpdate);
    element.addEventListener('play', onPlay);
    element.addEventListener('pause', onPause);

    // 进入新段：把播放头摆到段首（避免带着上一段的播放位置继续播）
    element.pause();
    element.currentTime = active.startMs / 1000;
    setPositionMs(active.startMs);
    setIsPlaying(false);

    return () => {
      element.removeEventListener('timeupdate', onTimeUpdate);
      element.removeEventListener('play', onPlay);
      element.removeEventListener('pause', onPause);
      element.pause();
    };
  }, [segment]);

  const play = useCallback((): void => {
    const element = elementRef.current;
    const active = segmentRef.current;
    if (element === null || active === null) return;
    const position = element.currentTime * 1000;
    if (position < active.startMs || position >= active.endMs) {
      element.currentTime = active.startMs / 1000;
      setPositionMs(active.startMs);
    }
    void Promise.resolve(element.play()).catch(() => {
      setIsPlaying(false);
    });
  }, []);

  const pause = useCallback((): void => {
    elementRef.current?.pause();
  }, []);

  const stop = useCallback((): void => {
    const element = elementRef.current;
    const active = segmentRef.current;
    if (element === null) return;
    element.pause();
    if (active !== null) {
      element.currentTime = active.startMs / 1000;
      setPositionMs(active.startMs);
    }
  }, []);

  const replaySegment = useCallback((): void => {
    stop();
    play();
  }, [play, stop]);

  return {
    isPlaying,
    positionMs,
    segmentPositionMs: segment === null ? 0 : Math.max(0, positionMs - segment.startMs),
    segment,
    gainDb,
    play,
    pause,
    stop,
    replaySegment,
  };
}
