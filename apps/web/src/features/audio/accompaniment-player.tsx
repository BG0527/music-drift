/**
 * 伴奏播放条（t13）：**只播当前段**的伴奏，并显示依据（BPM / 拍号 / 归一增益）。
 *
 * 为什么界面要显示 BPM / 拍号 / 增益：这三项是 t13 的"交付证据"——
 * 评审在页面上就能看到"为什么这样分段、为什么这个音量"，不必去翻文档。
 * 卡片的底色用 `deep-current`（DESIGN.md：录制/波形区走深水暗底），与录制面板同一语义。
 */
import { Button, Icon, cn } from '../../design-system';
import { describeLibraryTrackMeta, type LibraryTrack } from '@music-drift/shared/audio';
import { formatClock } from './format';
import { useAccompaniment, type AccompanimentEnvironment } from './use-accompaniment';

export interface AccompanimentPlayerProps {
  track: LibraryTrack;
  /** 当前段号（**来自服务端** `nextRecordIndex`）。 */
  segmentIndex: number;
  environment?: Partial<AccompanimentEnvironment>;
  onSegmentEnded?: () => void;
  className?: string;
}

export function AccompanimentPlayer({
  track,
  segmentIndex,
  environment,
  onSegmentEnded,
  className,
}: AccompanimentPlayerProps) {
  const view = useAccompaniment({
    track,
    segmentIndex,
    ...(environment === undefined ? {} : { environment }),
    ...(onSegmentEnded === undefined ? {} : { onSegmentEnded }),
  });

  const gainLabel = `${view.gainDb >= 0 ? '+' : ''}${view.gainDb.toFixed(2)} dB`;

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
        只播当前段的伴奏，不会连着往下放 —— 这样你听到的和成品里的时间槽一致。
      </p>

      {view.segment === null ? (
        <p role="status" className="text-[0.875rem] text-muted">
          这首歌没有第 {segmentIndex} 段（段号来自服务端，若持续如此请刷新重试）。
        </p>
      ) : (
        <>
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

          <p aria-live="polite" className="text-[0.9375rem] text-paper">
            第 {segmentIndex} 段 · 本段 {formatClock(view.segmentPositionMs)} /{' '}
            {formatClock(view.segment.durationMs)}
            <span className="text-muted">
              （曲目内 {formatClock(view.segment.startMs)}–{formatClock(view.segment.endMs)}）
            </span>
          </p>

          <div
            role="progressbar"
            aria-label="本段播放进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((view.segmentPositionMs / view.segment.durationMs) * 100)}
            className="h-2 w-full overflow-hidden rounded-sm bg-line/10"
          >
            <div
              className="h-2 origin-left rounded-sm bg-glass transition-transform duration-200 ease-out"
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
