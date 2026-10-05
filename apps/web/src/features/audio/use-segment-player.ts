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
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { GrooveStoreContext } from './groove-playback';
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
  /** 解码后的真实时长（秒）；流式容器在 metadata 就绪前可能是 NaN/Infinity。 */
  duration?: number;
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
  /** 本段播完（`ended` 事件）时回调一次：「听全部」用它换下一段接着播。 */
  onEnded?: (() => void) | undefined;
  /**
   * 播放状态变化时回调（`isPlaying`）。
   *
   * 「听全部」用它把按钮的播放/暂停图标绑到**播放器真实状态**，而不是乐观置位 ——
   * 乐观置位会出现"点了没声却显示暂停"，逼用户反复多点。
   */
  onPlayingChange?: ((isPlaying: boolean) => void) | undefined;
  /**
   * 自动起播令牌（用户裁决「听全部」用）。每次外部请求"起播"就 +1。
   *
   * 为什么在**元素创建 effect 内部**消费（而不是在外层 effect 调 `replay()`）：
   * 换段时 `key` 变 ⇒ `publish`/`key` 变 ⇒ 元素 effect 会**重跑**（cleanup 里
   * `element.pause()` + 重建）。若起播放在外层 effect，它会与这次 cleanup **竞态**：
   * 先 play()、紧接着被 cleanup 的 pause() 打断（`AbortError: play() interrupted by
   * pause()`）—— 表现正是"要点好几次才响"。放进同一个 effect、挂在监听就绪之后，
   * 起播就是这个元素的最后一次动作，不会再被 cleanup 打断。
   */
  autoPlayToken?: number | undefined;
}

export interface UseSegmentPlayerResult {
  isPlaying: boolean;
  /** 显式状态机：UI 据此显示「播放 / 暂停 / 继续播放 / 重新播放」与状态文案。 */
  playbackState: PlaybackState;
  positionMs: number;
  ratio: number;
  coveredMs: number;
  playedMs: number;
  dislike: DislikeAvailability;
  toggle: () => void;
  seekTo: (positionMs: number) => void;
  replay: () => void;
  /**
   * 起播失败原因（`null` = 无失败）。
   *
   * 存在的理由：用户实测「听全部」要点好几次才响 —— 根因之一是 `play()` 被 autoplay 策略
   * 拒绝后**异常被吞掉**，页面既不报错也不给出口，用户只能盲目重复点击。这里把原因暴露出来，
   * 由调用方渲染可见提示。`AbortError`（元素重建竞态的内部中断）不算失败，恒为 null。
   */
  playFailure: string | null;
}

/**
 * 显式播放状态（用户实测报的问题：播完后再点行为不明确、未播完点击缺反馈）。
 * `idle` 没播过 / `playing` 播放中 / `paused` 中途暂停 / `ended` 已播到结尾。
 */
export type PlaybackState = 'idle' | 'playing' | 'paused' | 'ended';

interface ProgressView {
  isPlaying: boolean;
  playbackState: PlaybackState;
  positionMs: number;
  coveredMs: number;
  playedMs: number;
  ratio: number;
  dislikeUnlocked: boolean;
}

const EMPTY_PROGRESS: ProgressView = {
  isPlaying: false,
  playbackState: 'idle',
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
  const playbackStore = useContext(GrooveStoreContext);
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
  // onEnded 走 ref：它的身份变化不应重建音频元素
  const onEndedRef = useRef(options.onEnded);
  useEffect(() => {
    onEndedRef.current = options.onEnded;
  }, [options.onEnded]);
  const onPlayingChangeRef = useRef(options.onPlayingChange);
  useEffect(() => {
    onPlayingChangeRef.current = options.onPlayingChange;
  }, [options.onPlayingChange]);
  // 自动起播令牌用 ref 读取：它的变化**不**要重建元素（重建 = cleanup pause = 打断起播）
  const autoPlayTokenRef = useRef(options.autoPlayToken ?? 0);
  useEffect(() => {
    autoPlayTokenRef.current = options.autoPlayToken ?? 0;
  }, [options.autoPlayToken]);

  const key = `${src}|${duration}`;
  const [state, setState] = useState<ProgressState>({ key, ...EMPTY_PROGRESS });
  const elementRef = useRef<AudioElementLike | null>(null);
  const trackerRef = useRef<ListenTracker | null>(null);
  /**
   * 起播失败的原因（`null` = 没失败/已恢复）。
   *
   * 为什么用 ref 而不是直接进 `ProgressState`：它**不参与进度语义**（不该被覆盖率/唱针看见），
   * 但必须能被 UI 读到 —— 走 `publish()` 触发一次重渲染，由 `playFailureRef` 派生。
   * 竞态用 `playRequestRef` 判废：元素重建后旧 promise 的 reject 不该再改新元素的状态。
   */
  const playFailureRef = useRef<string | null>(null);
  const playRequestRef = useRef(0);
  /** 已消费的 autoPlayToken（换段起播与同段重按共享去重，避免双播）。 */
  const rememberedTokenRef = useRef(0);
  /**
   * 是否**曾经播放过**（用于区分"显式暂停在 0"与"从未播放"）。
   * 只在本段元素的事件处理器里写、在元素创建 effect 里重置 —— 不在 render 期读写。
   */
  const hasPlayedRef = useRef(false);
  /**
   * 是否已播到结尾。
   *
   * **用 `ended` 事件本身作为信号**，而不是比较 `currentTime >= duration`：
   * ① 流式 mp4 的 `duration` 可能是 `Infinity`（比较永远不成立）；
   * ② `ended` 是浏览器给出的权威语义（"这一遍播完了"），不需要我们自己推断。
   * 起点/跳转/重新播放时清除（见 play / seeking 处理器）。
   */
  const atEndRef = useRef(false);

  const snapshot: ProgressView = state.key === key ? state : EMPTY_PROGRESS;

  /** 由元素状态派生播放状态：暂停 + 位置在结尾（且确有位置）⇒ `ended`。 */
  const derivePlaybackState = (element: AudioElementLike | null): PlaybackState => {
    if (element === null) return 'idle';
    if (!element.paused) return 'playing';
    if (atEndRef.current) return 'ended';
    // 播过之后再停 ⇒ 暂停（哪怕停在 0 也如实显示"已暂停"）；从没播过才是 idle
    return hasPlayedRef.current ? 'paused' : 'idle';
  };

  const publish = useCallback((): void => {
    const tracker = trackerRef.current;
    if (tracker === null) return;
    const progress = tracker.progress();
    const element = elementRef.current;
    const isPlaying = element !== null && !element.paused;
    setState({
      key,
      isPlaying,
      playbackState: derivePlaybackState(element),
      positionMs: progress.positionMs,
      coveredMs: progress.coveredMs,
      playedMs: progress.playedMs,
      ratio: progress.ratio,
      dislikeUnlocked: progress.dislikeUnlocked,
      // 注意：不在这里展示 ratio=NaN 之类的中间态，ListenTracker 已保证 0..1
    });
    // 真实播放状态回报（「听全部」按钮图标据此显示播放/暂停，不做乐观置位）
    onPlayingChangeRef.current?.(isPlaying);
    onProgressRef.current?.({
      ratio: progress.ratio,
      coveredMs: progress.coveredMs,
      playedMs: progress.playedMs,
      dislikeUnlocked: progress.dislikeUnlocked,
    });
  }, [key]);

  /**
   * 请求起播的**唯一**落点：手动 toggle、换段自动起播、同段重按都走它。
   *
   * 三件事在此收口：① 竞态判废（元素重建后旧 promise 的结果不再改状态）；
   * ② 失败暴露（`playFailure`，不再静默吞掉 —— 用户报的「要点好几次才响」就是被吞掉的
   *    autoplay 拒绝造成的：页面既不报错也不给出口，只能盲目重复点击）；
   * ③ 失败时把元素从「假在播」的僵尸态复位。
   */
  const requestPlay = useCallback((): void => {
    const element = elementRef.current;
    if (element === null) return;
    playbackStore?.claimAudio(element);
    playRequestRef.current += 1;
    const request = playRequestRef.current;
    playFailureRef.current = null; // 新一次尝试：清掉上一轮的失败，别让旧错留在屏幕上
    void Promise.resolve(element.play()).then(
      () => {
        if (playRequestRef.current === request) publish();
      },
      (thrown: unknown) => {
        if (playRequestRef.current !== request) return;
        // `name` 取自 DOMException / Error 两者共有的一等公民属性 ——
        // **不能用 `instanceof Error`**：浏览器抛的 DOMException 不是 Error 子类
        // （jsdom 与真机皆然），那样会把 NotSupportedError/AbortError 误判成未知故障。
        const name =
          typeof thrown === 'object' && thrown !== null && 'name' in thrown
            ? String((thrown as { name: unknown }).name)
            : 'PlaybackError';
        if (name === 'AbortError') {
          // 元素重建竞态的内部中断，不是用户可见故障；但状态必须复位，别停在假 playing
          playFailureRef.current = null;
          publish();
          return;
        }
        playFailureRef.current = name;
        // 浏览器真实形态：play() 先把 paused 置 false 并触发 play 事件（UI 瞬间变「暂停」），
        // 随后拒绝 —— 元素就此停在「假在播」的僵尸态。必须复位，否则用户看到「暂停」
        // 却毫无声音，只能反复多点（这正是他们报的缺陷）。
        element.pause();
        // `hasPlayedRef` 保持 true：用户**确实按过播放**（浏览器也已触发 play 事件），
        // 复位后如实显示「已暂停」而不是「还没播放」—— 重试入口就在播放键上。
        atEndRef.current = false;
        publish();
      },
    );
  }, [publish, playbackStore]);

  useEffect(() => {
    const element = createElement(src);
    elementRef.current = element;
    hasPlayedRef.current = false; // 换段 = 新的会话：从没播过
    atEndRef.current = false;
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
      atEndRef.current = true; // 播到结尾：位置留在结尾，状态由 derivePlaybackState 判为 `ended`
      publish();
      // 「听全部」串段：一段播完 → 通知上层换下一段（换 src 会重建元素并自动起播）
      onEndedRef.current?.();
    };
    // play / pause 也走同一条发布路径（isPlaying 从元素真实状态读取，不用本地推断）
    const onPlay = (): void => {
      playbackStore?.claimAudio(element);
      hasPlayedRef.current = true;
      atEndRef.current = false; // 开播即不再是"播完"状态（含"重新播放"）
      publish();
    };
    const onPlayStateChange = (): void => {
      publish();
    };

    element.addEventListener('timeupdate', onTimeUpdate);
    element.addEventListener('seeking', onSeeking);
    element.addEventListener('ended', onEnded);
    element.addEventListener('play', onPlay);
    element.addEventListener('pause', onPlayStateChange);

    // **换段**时的自动起播：放在监听挂好之后、return 之前 —— 这是本元素生命周期的最后一个动作，
    // 不会再被外层 cleanup 的 pause 打断（src 变 ⇒ key 变 ⇒ 本 effect 重跑）。
    // 令牌在这里**标记为已消费**（rememberedTokenRef），免得下面那个「同段重按」的 effect
    // 在同一次重跑里再起播一次（双播）。
    if ((autoPlayTokenRef.current ?? 0) > 0) {
      rememberedTokenRef.current = autoPlayTokenRef.current;
      requestPlay();
    }

    return () => {
      element.removeEventListener('timeupdate', onTimeUpdate);
      element.removeEventListener('seeking', onSeeking);
      element.removeEventListener('ended', onEnded);
      element.removeEventListener('play', onPlay);
      element.removeEventListener('pause', onPlayStateChange);
      element.pause();
      playbackStore?.releaseAudio(element);
      elementRef.current = null;
      trackerRef.current = null;
    };
  }, [createElement, duration, publish, src, playbackStore, requestPlay]);

  /**
   * **同段重按**的自动起播：用户点段「听」/「听全部」时令牌 +1，但 src 不变 ⇒ 上面的元素 effect
   * 不会重跑，令牌会被吞掉 —— 表现正是「要点好几次才响」。这里补上这个落点。
   *
   * 用「已消费令牌」比对去重：只有真正变化的令牌才起播，元素重建那次的起播不会被这里重复触发。
   */
  useEffect(() => {
    const token = options.autoPlayToken ?? 0;
    if (token === 0 || token === rememberedTokenRef.current) return;
    rememberedTokenRef.current = token;
    requestPlay();
  }, [options.autoPlayToken, requestPlay]);

  /**
   * 智能切换（用户在"播放按钮"上的直觉）：
   * - `playing` → 暂停；
   * - `ended` → **从头重新播放**（把位置归零；这也是用户实测报的缺陷）；
   * - `idle` / `paused` → 播放/继续。
   */
  const toggle = useCallback((): void => {
    const element = elementRef.current;
    if (element === null) return;
    if (!element.paused) {
      element.pause();
      return;
    }
    if (derivePlaybackState(element) === 'ended') {
      // 从头：位置归零 + 让覆盖率追踪器知道这是一次跳转（不把"回到 0"当成播放）
      element.currentTime = 0;
      trackerRef.current?.markSeek();
    }
    requestPlay();
  }, [requestPlay]);

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

  /** 无论当前在哪个状态，都从头重新播放（UI 的「重新播放」直接用它）。 */
  const replay = useCallback((): void => {
    seekTo(0);
    const element = elementRef.current;
    if (element === null) return;
    playbackStore?.claimAudio(element);
    void Promise.resolve(element.play()).catch(() => {
      publish();
    });
  }, [publish, seekTo, playbackStore]);

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
    playbackState: snapshot.playbackState,
    positionMs: snapshot.positionMs,
    ratio: snapshot.ratio,
    coveredMs: snapshot.coveredMs,
    playedMs: snapshot.playedMs,
    dislike,
    toggle,
    seekTo,
    replay,
    // 「点了没声」必须看得见：play() 被拒时这里是原因（AbortError 内部竞态已滤成 null）
    playFailure: playFailureRef.current,
  };
}
