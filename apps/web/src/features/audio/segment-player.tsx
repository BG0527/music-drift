/**
 * 分段播放条（试听 + 已听进度 + 点踩）。
 *
 * - 音频来自 `GET /api/segments/:id/audio`（带 HTTP Range，拖动进度条只取需要的字节）；
 * - `segmentIndex` **必须由服务端给**（`RecordSegmentResponse.index` / `SegmentSchema.index`），
 *   组件不推算段号，只负责显示（ADR-015 §16.8）；
 * - 进度同时给 `role="progressbar"` 与文字（"已听 8.0 秒 / 共 20.0 秒"），
 *   不依赖颜色表达进度（DESIGN.md §Accessibility 媒体条款）；
 * - 只给**结构性提示**（第几段 / 时长），不显示歌词正文（版权约束，CONTEXT §3.2 的 Demo 口径）。
 */
import type { AudioElementLike } from './use-segment-player';
import { useSegmentPlayer } from './use-segment-player';
import { DislikeButton } from './dislike-button';
import { formatClock, formatSeconds } from './format';
import { Button, Card, Icon, cn } from '../../design-system';

export interface SegmentPlayerProps {
  /** 音频地址（服务端 Range 端点）。 */
  src: string;
  /** 歌里的固定段落位置（1-based）。**来自服务端**，不由前端推算。 */
  segmentIndex: number;
  /** 服务端给的时长（ms）；缺失传 null（此时点踩不可用）。 */
  durationMs: number | null;
  /** 该段在本瓶子里的匿名代号（CONTEXT §12.1）。 */
  ownerCode?: string | null;
  /** 是否是自己录的那一段（自己不能踩自己的段）。 */
  isOwnSegment?: boolean;
  onCastDislike?: (segmentIndex: number) => void;
  castingDislike?: boolean;
  /** 测试/特殊环境注入音频元素工厂。 */
  createElement?: (src: string) => AudioElementLike;
  className?: string;
}

export function SegmentPlayer({
  src,
  segmentIndex,
  durationMs,
  ownerCode = null,
  isOwnSegment = false,
  onCastDislike,
  castingDislike = false,
  createElement,
  className,
}: SegmentPlayerProps) {
  const player = useSegmentPlayer({
    src,
    durationMs,
    isOwnSegment,
    ...(createElement === undefined ? {} : { createElement }),
  });
  const percent = Math.round(player.ratio * 100);
  const listenedSeconds = formatSeconds(player.coveredMs);
  const totalSeconds = formatSeconds(typeof durationMs === 'number' ? durationMs : 0);

  return (
    <Card className={cn('flex flex-col gap-4 rounded-xl', className)}>
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-[1.125rem] font-semibold text-abyss">
          第 {segmentIndex} 段{ownerCode === null ? '' : ` · ${ownerCode}`}
        </h3>
        {/* DESIGN.md：段位时长用 Quattrocento 数字（引用既有字体 token，不新增值） */}
        <span
          className="shrink-0 text-[0.875rem] text-slate-current"
          style={{ fontFamily: 'var(--font-latin)' }}
        >
          {typeof durationMs === 'number' && durationMs > 0 ? formatClock(durationMs) : '--:--'}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Button
          aria-label={player.isPlaying ? '暂停' : '播放'}
          onClick={player.toggle}
          icon={<Icon name={player.isPlaying ? 'Pause' : 'Play'} size={18} />}
        >
          {player.isPlaying ? '暂停' : '播放'}
        </Button>
        <p aria-live="polite" className="text-[0.875rem] text-slate-current">
          已听 {listenedSeconds} 秒 / 共 {totalSeconds} 秒（{percent}%）
        </p>
      </div>

      <div
        role="progressbar"
        aria-label="已听进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 w-full overflow-hidden rounded-pill bg-tide-pool"
      >
        {/* 只动 transform：DESIGN.md 禁止动画 width/height */}
        <div
          className="h-2 origin-left rounded-pill bg-peacock transition-transform duration-200 ease-out"
          style={{ transform: `scaleX(${player.ratio})` }}
        />
      </div>

      <DislikeButton
        availability={player.dislike}
        casting={castingDislike}
        onCast={() => onCastDislike?.(segmentIndex)}
      />
    </Card>
  );
}
