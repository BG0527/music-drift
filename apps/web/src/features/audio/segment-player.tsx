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
import { useSegmentPlayer, type PlaybackState } from './use-segment-player';
import { DislikeButton } from './dislike-button';
import { formatClock, formatSeconds } from './format';
import { Button, Card, Icon, cn } from '../../design-system';

/**
 * 透给消费者的"当前段已听状态"。语义唯一来源是 `ListenTracker`（覆盖率并集），
 * 组件**不重算**覆盖率，只转发；`dislikeUnlocked` 的门槛同样来自内核，UI 不写死 0.8。
 */
export interface SegmentListenSnapshot {
  /** 这份进度属于哪一段（与服务端给的 `segmentIndex` 一致）。 */
  segmentIndex: number;
  /** 当前段已听比例 = 已覆盖区间并集 / 段时长，0..1；时长不可信时为 0（fail-closed）。 */
  ratio: number;
  /** 已覆盖毫秒数（判定"听满"的唯一依据）。 */
  coveredMs: number;
  /** 累计播放毫秒数（含重播；仅用于展示，不参与判定）。 */
  playedMs: number;
  /** 是否已达点踩门槛（门槛取内核 `DEFAULT_POLICY.dislikeListenRatioThreshold`）。 */
  dislikeUnlocked: boolean;
}

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
  /**
   * 已听进度回调（每次观察到进度推进/播放状态变化时调用）。
   * 消费者（点踩按钮/投票）应据此判定与展示，**不要**自己重算覆盖率或写死阈值。
   */
  onProgress?: (snapshot: SegmentListenSnapshot) => void;
  castingDislike?: boolean;
  /**
   * 是否渲染**内置的踩按钮**，默认 `true`。
   *
   * 页面若要自己渲染「赞 / 踩」一对控件（t12 的 `VoteControls`，用户裁决：按钮改小、补上点赞），
   * 就传 `false` 关掉内置踩，避免同一段出现两个踩（其中一个还点不动）。
   * 关掉之后契约不变：仍是 `onProgress` 上报覆盖 + `onCastDislike`（或 `listen.castDislike()`）投票 ——
   * 踩只有这一条路径，内置按钮只是它的一个默认外观。
   */
  showDislike?: boolean;
  /** 测试/特殊环境注入音频元素工厂。 */
  createElement?: (src: string) => AudioElementLike;
  className?: string;
}

/**
 * 四种播放状态的**按钮文案 / 图标 / 状态文字**（用户实测需求 ①）。
 *
 * 为什么做成表：状态变化必须同时有**文字**与**图标**（DESIGN.md §Accessibility：不能只靠颜色/图标表达状态），
 * 且按钮的 `aria-label` 与可见文案要保持一致，避免"看得见说暂停、读屏说播放"。
 */
const PLAYBACK_UI: Record<
  PlaybackState,
  { label: string; icon: 'Play' | 'Pause' | 'RotateCcw'; state: string }
> = {
  idle: { label: '播放', icon: 'Play', state: '还没播放' },
  playing: { label: '暂停', icon: 'Pause', state: '正在播放' },
  paused: { label: '继续播放', icon: 'Play', state: '已暂停（再点继续播放）' },
  ended: {
    label: '重新播放',
    icon: 'RotateCcw',
    state: '本段已播完，点击「重新播放」从头再听一遍',
  },
};

export function SegmentPlayer({
  src,
  segmentIndex,
  durationMs,
  ownerCode = null,
  isOwnSegment = false,
  onCastDislike,
  castingDislike = false,
  showDislike = true,
  onProgress,
  createElement,
  className,
}: SegmentPlayerProps) {
  const player = useSegmentPlayer({
    src,
    durationMs,
    isOwnSegment,
    // 只做转发：覆盖率与门槛判定都在内核完成（hook 内部用 ref 保存最新回调，不会重复订阅）
    onProgress: (progress) => {
      onProgress?.({
        segmentIndex,
        ratio: progress.ratio,
        coveredMs: progress.coveredMs,
        playedMs: progress.playedMs,
        dislikeUnlocked: progress.dislikeUnlocked,
      });
    },
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
          aria-label={PLAYBACK_UI[player.playbackState].label}
          onClick={player.toggle}
          icon={<Icon name={PLAYBACK_UI[player.playbackState].icon} size={18} />}
        >
          {PLAYBACK_UI[player.playbackState].label}
        </Button>
        <p aria-live="polite" className="text-[0.875rem] text-slate-current">
          已听 {listenedSeconds} 秒 / 共 {totalSeconds} 秒（{percent}%）
        </p>
      </div>

      {/*
        状态文字：`key` 让状态一变就重新挂载 → DS 的 `.enter-fade`（只动 opacity，300ms ease-out）**重播一次**，
        于是"状态变了"既看得见（文字变了 + 淡入）又听得见（aria-live 播报）。
        不自造 keyframes、不动画 width/height（DESIGN.md §动效只允许 transform/opacity；
        `prefers-reduced-motion` 由 motion.css 全局关闭，组件不必自己判断）。
      */}
      <p
        key={player.playbackState}
        data-testid="playback-state"
        aria-live="polite"
        className="enter-fade text-[0.875rem] leading-[1.6] text-slate-current"
      >
        {PLAYBACK_UI[player.playbackState].state}
      </p>

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

      {showDislike ? (
        <DislikeButton
          availability={player.dislike}
          casting={castingDislike}
          onCast={() => onCastDislike?.(segmentIndex)}
        />
      ) : null}
    </Card>
  );
}
