/**
 * 伴奏播放条（t13）：**只播当前段**的伴奏，并显示依据（BPM / 拍号 / 归一增益）。
 *
 * 为什么界面要显示 BPM / 拍号 / 增益：这三项是 t13 的"交付证据"——
 * 评审在页面上就能看到"为什么这样分段、为什么这个音量"，不必去翻文档。
 * 卡片的底色用 `deep-current`（DESIGN.md：录制/波形区走深水暗底），与录制面板同一语义。
 */
import { Button, Icon, cn } from '../../design-system';
import { useEffect, useMemo, useRef } from 'react';
import {
  describeLibraryTrackMeta,
  karaokeLyricsForTrack,
  type LibraryTrack,
} from '@music-drift/shared/audio';
import { formatClock } from './format';
import { KaraokeLyrics } from './karaoke-lyrics';
import { useAccompaniment, type AccompanimentEnvironment } from './use-accompaniment';

export interface AccompanimentPlayerProps {
  track: LibraryTrack;
  /** 当前段号（**来自服务端** `nextRecordIndex`）。 */
  segmentIndex: number;
  environment?: Partial<AccompanimentEnvironment>;
  onSegmentEnded?: () => void;
  /**
   * 自动起播信号（用户裁决：伴奏与录音同时进行）。
   * 每次变化且为"起播"时，组件自动播放本段伴奏（停录时上层用 `stopWithRecording`
   * 或再传 `paused` 停下）。默认 undefined = 不自动播（保留手动按钮的独立用法）。
   */
  autoPlaySignal?: { play: boolean; token: number } | undefined;
  /**
   * 只做"跟着录音自动播"的**伴随显示**（用户裁决：录制界面只留一个「开始录制」）。
   * true 时隐藏"播放本段伴奏 / 重听本段"两颗独立按钮（它们是"分开的功能"），
   * 只保留曲目信息 + 进度 + 歌词，让你看到伴奏在放、但不另给一套控制。
   * 伴奏本身照旧随开录自动起播（见 autoPlaySignal）。
   */
  autoOnly?: boolean | undefined;
  /**
   * 交出"立刻起播"命令柄（同步调用）。
   *
   * 浏览器自动播放策略要求 `play()` 在**用户手势的那个任务里**同步调用；
   * 等 `getUserMedia` 权限回来（effect 里）再播会被判"无手势"静默拒绝。
   * 上层（RecorderPanel 的「开始录制」点击）据此在点击处理函数里同步起播，
   * 伴奏与录音就真正**同时**进行。
   */
  playHandleRef?: React.MutableRefObject<AccompanimentPlayHandle | null> | undefined;
  className?: string;
}

/** `playHandleRef` 收到的命令柄。 */
export interface AccompanimentPlayHandle {
  /** 从本段开头起播。 */
  play: () => void;
  /** 停下并回到段首。 */
  stop: () => void;
}

export function AccompanimentPlayer({
  track,
  segmentIndex,
  environment,
  onSegmentEnded,
  autoPlaySignal,
  autoOnly = false,
  playHandleRef,
  className,
}: AccompanimentPlayerProps) {
  const view = useAccompaniment({
    track,
    segmentIndex,
    ...(environment === undefined ? {} : { environment }),
    ...(onSegmentEnded === undefined ? {} : { onSegmentEnded }),
  });

  /**
   * 与录音同步的自动起播（用户裁决）。
   * `autoPlaySignal.play` 变 true ⇒ 从本段开头起播（从头来，不接着上次的尾）；
   * 变 false ⇒ 停下并回到段首（停录即停伴奏，两者同一个生命周期）。
   * 用 token 区分"同一状态下重复触发"（重录一次 = 一次新的 play 边沿）。
   */
  const { play, stop } = view;
  // 同步起播命令柄（用户手势任务里由「开始录制」调用，见 props 注释）
  useEffect(() => {
    if (playHandleRef === undefined) return;
    playHandleRef.current = { play, stop };
  }, [playHandleRef, play, stop]);
  const handledTokenRef = useRef(0);
  const lastPlayRef = useRef(false);
  useEffect(() => {
    if (autoPlaySignal === undefined) return;
    if (autoPlaySignal.token === 0) return; // 0 = 还没触发过
    if (autoPlaySignal.play) {
      if (lastPlayRef.current && autoPlaySignal.token === handledTokenRef.current) return;
      handledTokenRef.current = autoPlaySignal.token;
      lastPlayRef.current = true;
      play();
      return;
    }
    // 停录即停伴奏
    if (!lastPlayRef.current) return;
    lastPlayRef.current = false;
    stop();
  }, [autoPlaySignal, play, stop]);

  const gainLabel = `${view.gainDb >= 0 ? '+' : ''}${view.gainDb.toFixed(2)} dB`;
  const lyricSegment = useMemo(
    () => karaokeLyricsForTrack(track).find((item) => item.index === segmentIndex),
    [segmentIndex, track],
  );

  return (
    <div
      className={cn(
        // record-v1：伴奏面板坐在**盘面内层**（`water-bed`，L4 deep）—— 与录制区（water-void）同属"沉浸式区块"，
        // 但比分段播放条更"深"一层：它是曲库给的底，不是你录的声音
        'flex flex-col gap-4 rounded-xl border border-line/20 bg-water-bed p-4 text-paper',
        className,
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[1.125rem] font-semibold text-paper">{track.title}</h3>
        <p className="text-[0.875rem] text-muted">{describeLibraryTrackMeta(track)}</p>
      </header>

      <p className="text-[0.875rem] leading-[1.6] text-muted">
        {autoOnly
          ? '点「开始录制」会同时放这一段的伴奏，你对着它唱；停录就停。只放当前段，不连着往下放 —— 这样你听到的和成品里的时间槽一致。'
          : '只播当前段的伴奏，不会连着往下放 —— 这样你听到的和成品里的时间槽一致。'}
      </p>

      {view.segment === null ? (
        <p role="status" className="text-[0.875rem] text-muted">
          这首歌没有第 {segmentIndex} 段（段号来自服务端，若持续如此请刷新重试）。
        </p>
      ) : (
        <>
          {/*
            `autoOnly` = 录制流程里**不摆**这两颗"分开的功能"按钮（用户裁决：
            录制界面只留一个「开始录制」，伴奏跟着录音走）。进度/歌词仍留着，
            让你看得到伴奏正在放。
          */}
          {autoOnly ? null : (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                aria-label={view.isPlaying ? '暂停' : '播放本段伴奏'}
                onClick={view.isPlaying ? view.pause : view.play}
                icon={<Icon name={view.isPlaying ? 'Pause' : 'Play'} size={18} />}
              >
                {view.isPlaying ? '暂停' : '播放本段伴奏'}
              </Button>
              <Button
                variant="ghost"
                onClick={view.replaySegment}
                icon={<Icon name="RotateCcw" size={18} />}
              >
                重听本段
              </Button>
            </div>
          )}

          <p aria-live="polite" className="text-[0.9375rem] text-paper">
            第 {segmentIndex} 段 · 本段 {formatClock(view.segmentPositionMs)} /{' '}
            {formatClock(view.segment.durationMs)}
            <span className="text-muted">
              （曲目内 {formatClock(view.segment.startMs)}–{formatClock(view.segment.endMs)}）
            </span>
          </p>

          {lyricSegment === undefined ? null : (
            <KaraokeLyrics currentTime={view.positionMs / 1000} lines={lyricSegment.lines} />
          )}

          <div
            role="progressbar"
            aria-label="本段播放进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((view.segmentPositionMs / view.segment.durationMs) * 100)}
            className="h-2 w-full overflow-hidden rounded-sm bg-line/10"
          >
            <div
              className="h-2 origin-left rounded-sm bg-glass transition-transform duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)]"
              style={{ transform: `scaleX(${view.segmentPositionMs / view.segment.durationMs})` }}
            />
          </div>
        </>
      )}

      <p className="flex flex-wrap items-center gap-2 text-[0.875rem] text-muted">
        <Icon name="Info" size={16} />
        <span>
          响度归一：{gainLabel}（三首曲目等响目标 {track.normalization.targetLufs.toFixed(2)}{' '}
          LUFS，只用增益、不做限幅）
        </span>
      </p>
    </div>
  );
}
