/**
 * 播放进度总线（沟槽时间轴的「唱针」数据源）。
 *
 * 单独成文件的原因（lint：`react-refresh/only-export-components`）：这里只有
 * context / store / hooks，没有组件导出 —— 组件（Provider 与时间轴本体）在 `groove-timeline.tsx`。
 *
 * 为什么是 store 而不是 Provider 里的 useState：进度约每 250ms 推进一次，
 * 用 state 会让整页跟着重渲染；store 订阅只重渲染时间轴自己。
 *
 * 语义（deploy-plan §17）：唱针 = 播放头，跟随**真实播放进度**（段内 currentTime 位置），
 * 不是覆盖率 —— 覆盖率是"听进去多少"（点踩门槛），播放位置是"现在放到哪儿"（唱针）。
 */
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import type { PlaybackState } from './use-segment-player';

export interface GroovePlaybackSnapshot {
  /** 正在播放/暂停的那一段（服务端段号）；`null` = 页面上还没有播放器。 */
  segmentIndex: number | null;
  /** 段内播放位置 0..1（唱针在该槽内的位置；来自真实 currentTime，不是覆盖率）。 */
  positionRatio: number;
  playbackState: PlaybackState;
}

const IDLE_PLAYBACK: GroovePlaybackSnapshot = {
  segmentIndex: null,
  positionRatio: 0,
  playbackState: 'idle',
};

export class GroovePlaybackStore {
  private activeAudio: { pause: () => void } | null = null;

  claimAudio(audio: { pause: () => void }): void {
    if (this.activeAudio !== audio) this.activeAudio?.pause();
    this.activeAudio = audio;
  }

  releaseAudio(audio: { pause: () => void }): void {
    if (this.activeAudio === audio) this.activeAudio = null;
  }
  private snapshot: GroovePlaybackSnapshot = IDLE_PLAYBACK;
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): GroovePlaybackSnapshot => this.snapshot;

  report(next: GroovePlaybackSnapshot): void {
    const previous = this.snapshot;
    if (
      previous.segmentIndex === next.segmentIndex &&
      previous.playbackState === next.playbackState &&
      Math.abs(previous.positionRatio - next.positionRatio) < 0.0001
    ) {
      return;
    }
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}

export const GrooveStoreContext = createContext<GroovePlaybackStore | null>(null);

const getIdlePlayback = (): GroovePlaybackSnapshot => IDLE_PLAYBACK;
const noopSubscribe = (): (() => void) => () => undefined;

/** 播放器侧：把真实播放进度报给时间轴。页面没包 Provider 时是 no-op（其它页不受影响）。 */
export function useGrooveReporter(): (snapshot: GroovePlaybackSnapshot) => void {
  const store = useContext(GrooveStoreContext);
  return useCallback(
    (next: GroovePlaybackSnapshot) => {
      store?.report(next);
    },
    [store],
  );
}

/** 时间轴侧：订阅播放进度（无 Provider 时恒为 idle）。 */
export function useGroovePlayback(): GroovePlaybackSnapshot {
  const store = useContext(GrooveStoreContext);
  return useSyncExternalStore(
    store === null ? noopSubscribe : store.subscribe,
    store === null ? getIdlePlayback : store.getSnapshot,
    getIdlePlayback,
  );
}
