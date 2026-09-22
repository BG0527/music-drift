/**
 * `useSegmentPlayer`：HTMLAudioElement + `ListenTracker` 的组合层（Range 流式播放的客户端半边）。
 *
 * 分工：
 * - **播放与缓冲交给浏览器**（`<audio src>` 指向 `GET /api/segments/:id/audio`，206 由后端负责）；
 * - **"听了多少"由 `ListenTracker` 判定**（覆盖率，见 `@music-drift/shared/audio`），
 *   本 hook 只把 `timeupdate` / `seeking` / `ended` 翻译成"观察"与"跳转"信号；
 * - **时长以服务端为准**（`durationMs`）。流式 mp4 上元素自身的 `duration` 常是 `Infinity`，
 *   用它算覆盖率会得到"永远听不满"或"一听就满"的错误结论 —— 所以没有可信时长就判 0%。
 *
 * React 纪律（这里是**真实正确性**问题，不是风格）：
 * 1. **render 期不读也不写 ref**：render 必须纯。能显示出来的值一律走 state；
 * 2. **effect 里不同步 setState**（避免级联渲染）：进度 state 带一个"会话键"（src + 时长），
 *    键不匹配时在 render 期派生为"零进度"。换段（换 src）因此**不需要任何重置副作用**，
 *    也就不会出现"上一段的收听被算进新段"的窗口；
 * 3. ref 只放**不参与渲染**的东西：`<audio>` 实例、追踪器、最新的 `onProgress` 回调。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createListenTracker,
  describeDislikeAvailability,
  type DislikeAvailability,
  type ListenTracker,
} from '@music-drift/shared/audio';

export interface AudioElementLike {
  src: string;
  currentTime: number;
  paused: boolean;
  play: () => Promise<void> | void;
  pause: () => void;
  load?: () => void;
  addEventListener: (type: string, handler: (event?: unknown) => void) => void;
  removeEventListener: (type: string, handler: (event?: unknown) => void) => void;
}

export interface PlayerProgressSnapshot {
  ratio: number;
  coveredMs: number;
  playedMs: number;
  dislikeUnlocked: boolean;
}

export interface UseSegmentPlayerOptions {
  src: string;
  /** 服务端给的时长（ms）；缺失传 null（此时覆盖率一律 0，点踩不可用）。 */
  durationMs: number | null;
  /** 是否是自己录的那一段（自己不能踩自己的段，内核规则）。 */
  isOwnSegment?: boolean;
  /** 创建音频元素的工厂（默认 `new Audio()`；测试注入假元素）。 */
  createElement?: (src: string) => AudioElementLike;
  /** 进度回调（每次观察到进度推进时调用）。 */
  onProgress?: (snapshot: PlayerProgressSnapshot) => void;
}

export interface UseSegmentPlayerResult {
  isPlaying: boolean;
  positionMs: number;
  ratio: number;
  coveredMs: number;
  playedMs: number;
  dislike: DislikeAvailability;
  toggle: () => void;
  seekTo: (positionMs: number) => void;
  replay: () => void;
}

interface ProgressView {
  isPlaying: boolean;
  positionMs: number;
  coveredMs: number;
  playedMs: number;
  ratio: number;
  dislikeUnlocked: boolean;
}

const EMPTY_PROGRESS: ProgressView = {
  isPlaying: false,
  positionMs: 0,
  coveredMs: 0,
  playedMs: 0,
  ratio: 0,
  dislikeUnlocked: false,
};

interface ProgressState extends ProgressView {
  /** 这份进度属于哪一段（src + 服务端时长）；不匹配即视为"还没开始听"。 */
  key: string;
}

function createAudioElement(src: string): AudioElementLike {
  const element = new Audio();
  element.preload = 'metadata';
  element.src = src;
  return element;
}

export function useSegmentPlayer(options: UseSegmentPlayerOptions): UseSegmentPlayerResult {
  const { src, isOwnSegment } = options;
  const duration = useMemo(
    () =>
      typeof options.durationMs === 'number' && options.durationMs > 0 ? options.durationMs : 0,
    [options.durationMs],
  );

  // 工厂与回调只在**首次渲染**取值：它们的身份变化不应该导致音频元素被重建
  const [createElement] = useState(() => options.createElement ?? createAudioElement);
  const onProgressRef = useRef(options.onProgress);
  useEffect(() => {
    onProgressRef.current = options.onProgress;
  }, [options.onProgress]);

  const key = `${src}|${duration}`;
  const [state, setState] = useState<ProgressState>({ key, ...EMPTY_PROGRESS });
  const elementRef = useRef<AudioElementLike | null>(null);
  const trackerRef = useRef<ListenTracker | null>(null);

  const snapshot: ProgressView = state.key === key ? state : EMPTY_PROGRESS;

  const publish = useCallback((): void => {
    const tracker = trackerRef.current;
    if (tracker === null) return;
    const progress = tracker.progress();
    const element = elementRef.current;
    setState({
      key,
      isPlaying: element !== null && !element.paused,
      positionMs: progress.positionMs,
      coveredMs: progress.coveredMs,
      playedMs: progress.playedMs,
      ratio: progress.ratio,
      dislikeUnlocked: progress.dislikeUnlocked,
      // 注意：不在这里展示 ratio=NaN 之类的中间态，ListenTracker 已保证 0..1
    });
    onProgressRef.current?.({
      ratio: progress.ratio,
      coveredMs: progress.coveredMs,
      playedMs: progress.playedMs,
      dislikeUnlocked: progress.dislikeUnlocked,
    });
  }, [key]);

  useEffect(() => {
    const element = createElement(src);
    elementRef.current = element;
    trackerRef.current = createListenTracker({ durationMs: duration });

    const onTimeUpdate = (): void => {
      trackerRef.current?.observe(element.currentTime * 1000);
      publish();
    };
    // 跳转（拖动进度条）不认这段位移：拖动本身不是"听"
    const onSeeking = (): void => {
      trackerRef.current?.markSeek();
    };
    const onEnded = (): void => {
      trackerRef.current?.markEnded();
      publish();
    };
    // play / pause 也走同一条发布路径（isPlaying 从元素真实状态读取，不用本地推断）
    const onPlayStateChange = (): void => {
      publish();
    };

    element.addEventListener('timeupdate', onTimeUpdate);
    element.addEventListener('seeking', onSeeking);
    element.addEventListener('ended', onEnded);
    element.addEventListener('play', onPlayStateChange);
    element.addEventListener('pause', onPlayStateChange);

    return () => {
      element.removeEventListener('timeupdate', onTimeUpdate);
      element.removeEventListener('seeking', onSeeking);
      element.removeEventListener('ended', onEnded);
      element.removeEventListener('play', onPlayStateChange);
      element.removeEventListener('pause', onPlayStateChange);
      element.pause();
      elementRef.current = null;
      trackerRef.current = null;
    };
  }, [createElement, duration, publish, src]);

  const toggle = useCallback((): void => {
    const element = elementRef.current;
    if (element === null) return;
    if (element.paused) {
      // 自动播放策略可能拒绝 play()：吞掉异常并保持"未播放"，不冒未捕获错误
      void Promise.resolve(element.play()).catch(() => {
        publish();
      });
      return;
    }
    element.pause();
  }, [publish]);

  const seekTo = useCallback(
    (positionMs: number): void => {
      const element = elementRef.current;
      if (element === null) return;
      element.currentTime = Math.max(0, positionMs) / 1000;
      trackerRef.current?.markSeek();
      publish();
    },
    [publish],
  );

  const replay = useCallback((): void => {
    seekTo(0);
    toggle();
  }, [seekTo, toggle]);

  const dislike = useMemo(
    () =>
      describeDislikeAvailability({
        ratio: snapshot.ratio,
        durationMs: duration,
        ...(isOwnSegment === undefined ? {} : { isOwnSegment }),
      }),
    [duration, isOwnSegment, snapshot.ratio],
  );

  return {
    isPlaying: snapshot.isPlaying,
    positionMs: snapshot.positionMs,
    ratio: snapshot.ratio,
    coveredMs: snapshot.coveredMs,
    playedMs: snapshot.playedMs,
    dislike,
    toggle,
    seekTo,
    replay,
  };
}
