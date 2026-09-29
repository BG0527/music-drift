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
import { useEffect, useRef } from 'react';
import type { AudioElementLike } from './use-segment-player';
import { useSegmentPlayer, type PlaybackState } from './use-segment-player';
import { useGrooveReporter } from './groove-playback';
import { DislikeButton } from './dislike-button';
import { formatClock, formatSeconds } from './format';
import { Button, Icon, cn } from '../../design-system';

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
  /**
   * 外观：
   * - `card`（默认）= 浮动层播放条（标题 + 播放键 + 已听读数 + 进度）；
   * - `transport` = **瓶身详情页的参考构图**（`site/bottle.html` `.transport`：
   *   唱片播放键 `.play` + 400px 水道 `.bar` + 时长 `.timecode`），信息不减（进度条 + sr 文本照旧）。
   */
  layout?: 'card' | 'transport';
  className?: string;
  /**
   * 本段播完（`playbackState === 'ended'`）时回调一次。
   *
   * 「听全部」用它串段：一段播完 → 换下一段继续播（用户裁决：点瓶身上每段的
   * 「听」= 听这一段；点「听全部」= 从头按段号顺序连着听）。**只报状态，不改播放**。
   */
  onEnded?: (() => void) | undefined;
  /**
   * 交出播放器的命令柄（`toggle` / `replay` / `isPlaying`）。
   *
   * 页面要把「播放键」搬去与赞/踩同一行、并让它变成「听全部」时，需要**从外面**
   * 命令同一个播放器（起播 / 暂停 / 重播），否则就得渲染两个播放器、声音打架。
   * 用 ref 传递而不是 props 回调，是为了不让"命令柄"进入渲染数据流。
   */
  playerHandleRef?: React.MutableRefObject<SegmentPlayerHandle | null> | undefined;
  /**
   * 自动起播令牌：每次外部请求"起播"就 +1（页面在点「听全部」/ 点某段「听」时递增）。
   *
   * 为什么用令牌而不是布尔：换段会**卸载并重挂**这个播放器（`key = 段 id`），
   * 新挂载的实例必须是 idle，起播意图靠 prop 传不进来 —— 令牌让"新实例"在
   * 挂载后看到"有一个新的起播请求"从而自动播。令牌为 0 = 没人请求，静默等待用户点。
   */
  autoPlayToken?: number | undefined;
  /**
   * `transport` 外观下是否渲染内置的圆盘播放键，默认 `true`。
   *
   * 用户裁决把播放键搬去与赞/踩同一行、并让它变成「听全部」——那时由**页面**
   * 渲染那颗键（用 `playerHandleRef` 驱动同一个播放器），这里就只留水道与时长。
   */
  showPlayButton?: boolean | undefined;
}

/** `playerHandleRef` 收到的命令柄（页面用它驱动「听全部」）。 */
export interface SegmentPlayerHandle {
  /** 起播 / 暂停 / 播完重播（与 UI 播放键同一语义）。 */
  toggle: () => void;
  /** 从头重播这一段。 */
  replay: () => void;
  /** 当前是否在播（读 ref，不触发渲染；仅供命令方判断）。 */
  isPlaying: () => boolean;
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
  layout = 'card',
  className,
  onEnded,
  playerHandleRef,
  autoPlayToken,
  showPlayButton = true,
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
    ...(onEnded === undefined ? {} : { onEnded }),
    ...(createElement === undefined ? {} : { createElement }),
  });

  // 把命令柄交给页面（「听全部」要驱动的是**这个**播放器，而不是另起一个）
  useEffect(() => {
    if (playerHandleRef === undefined) return;
    playerHandleRef.current = {
      toggle: player.toggle,
      replay: player.replay,
      isPlaying: () => player.isPlaying,
    };
  }, [playerHandleRef, player.isPlaying, player.replay, player.toggle]);

  /**
   * 自动起播：令牌每 +1 就播一次（且只播一次 —— `handledTokenRef` 记住本实例已响应的值）。
   * 换段重挂载后新实例从 0 开始，令牌必然更大 ⇒ 新段自动接着播（连播不断声）。
   * 令牌为 0 = 没人请求过，绝不擅自出声（尊重浏览器自动播放策略与用户意图）。
   */
  const handledTokenRef = useRef(0);
  useEffect(() => {
    if (autoPlayToken === undefined || autoPlayToken === 0) return;
    if (autoPlayToken === handledTokenRef.current) return;
    handledTokenRef.current = autoPlayToken;
    player.replay();
  }, [autoPlayToken, player.replay]);
  const percent = Math.round(player.ratio * 100);
  const listenedSeconds = formatSeconds(player.coveredMs);
  const totalSeconds = formatSeconds(typeof durationMs === 'number' ? durationMs : 0);

  /**
   * 沟槽时间轴的唱针（deploy-plan §17：唱针 = 播放头，跟随**真实播放进度**）。
   * 这里上报的是**段内播放位置**（currentTime / 服务端段长），不是覆盖率 ——
   * 覆盖率是"听进去多少"（点踩门槛），播放位置是"现在放到哪儿"（唱针），两者语义不同。
   * 页面没包 `GroovePlaybackProvider` 时 reporter 是 no-op，其它播放器用法不受影响。
   */
  const grooveReport = useGrooveReporter();
  const groovePositionRatio =
    typeof durationMs === 'number' && durationMs > 0
      ? Math.min(1, Math.max(0, player.positionMs / durationMs))
      : 0;
  useEffect(() => {
    grooveReport({
      segmentIndex,
      positionRatio: groovePositionRatio,
      playbackState: player.playbackState,
    });
    return () => {
      // 播放器卸载（换段 / 页面离开）⇒ 唱针退回"没有播放器"，不留在旧段上
      grooveReport({ segmentIndex: null, positionRatio: 0, playbackState: 'idle' });
    };
  }, [groovePositionRatio, grooveReport, player.playbackState, segmentIndex]);

  /**
   * `transport` 外观（t17 深度复刻：`site/bottle.html` `.transport` 逐块）——
   * 唱片播放键 `.play`（52px 圆）+ 400px 水道 `.bar`（波形 + 已播水 + 珊瑚游标）+ `.timecode`。
   * 信息一条不减：进度条仍是 `role="progressbar"`，状态与已听读数进 sr 文本（aria-live）。
   * 进度条固定 400px 是参考的硬约定（唱针比例按"整条 400px"算，改宽度会让比例说谎）。
   *
   * W18.5 · A5（真平滑）：已播段与游标头此前直接写 `width` / `left`，而进度数据每 ~250ms
   * 才推一次（媒体 `timeupdate`），于是每 250ms 跳一格并触发重排。现在：
   * 已播段 = `scaleX(比例)`（CSS 里 `width:100%` + `transform-origin:left`）、
   * 游标头 = `translateX(px)`，两者都挂 `--motion-progress-duration/easing` 的过渡 ——
   * 时长等于采样周期，相邻两次采样被插值，观感从跳格变成滑行（守卫：playhead-smoothness.test.tsx）。
   */
  if (layout === 'transport') {
    const fillPx = Math.round(groovePositionRatio * 400);
    const playing = player.playbackState === 'playing';
    return (
      <div className={cn('transport', className)}>
        {showPlayButton ? (
          <button
            type="button"
            className="play"
            aria-label={`${PLAYBACK_UI[player.playbackState].label}第 ${String(segmentIndex)} 段`}
            onClick={player.toggle}
          >
            <svg viewBox="0 0 34 34" fill="none" aria-hidden="true">
              <circle cx="17" cy="17" r="16" stroke="var(--color-water-mid)" strokeOpacity=".45" />
              <circle cx="17" cy="17" r="11.5" stroke="var(--color-water-mid)" strokeOpacity=".2" />
              {playing ? (
                <>
                  <rect x="13.4" y="11.6" width="3.2" height="10.8" rx="1" fill="var(--color-coral)" />
                  <rect x="17.8" y="11.6" width="3.2" height="10.8" rx="1" fill="var(--color-coral)" />
                </>
              ) : (
                <path d="M14 11.8l9.4 5.2-9.4 5.2z" fill="var(--color-coral)" />
              )}
            </svg>
          </button>
        ) : null}

        <div
          className="bar"
          role="progressbar"
          aria-label={`第 ${String(segmentIndex)} 段播放进度 ${formatClock(player.positionMs)} / ${formatClock(typeof durationMs === 'number' ? durationMs : 0)}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <svg viewBox="0 0 400 20" fill="none" aria-hidden="true">
            <path
              d="M0 11 q14 -7 28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0"
              stroke="var(--color-water-mid)"
              strokeOpacity=".18"
            />
          </svg>
          <div className="fill" style={{ transform: `scaleX(${String(groovePositionRatio)})` }} />
          <div className="head" style={{ transform: `translateX(${String(fillPx)}px)` }} />
        </div>

        <span className="timecode">
          {formatClock(player.positionMs)} / {formatClock(typeof durationMs === 'number' ? durationMs : 0)}
        </span>

        <span className="sr-only" aria-live="polite">
          {PLAYBACK_UI[player.playbackState].state}；已听 {listenedSeconds} 秒 / 共 {totalSeconds} 秒（{percent}%）
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        // record-v1（DESIGN.md §Components）：播放条 = 浮动层 L2 —— `water-void` 底 + 1px `rgba(line,.2)`
        // + 阴影（阴影只允许给浮层与浮动条，这是全站少数允许阴影的地方之一）
        // 间距 p-[6px]/gap-[6px]：一屏门禁（§46.3）下播放条再压一档，行距让位于整页高度
        'flex flex-col gap-[6px] rounded-xl border border-line/20 bg-water-void p-[6px] shadow-floating',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-[1.125rem] font-semibold leading-none text-paper">
          第 {segmentIndex} 段{ownerCode === null ? '' : ` · ${ownerCode}`}
        </h3>
        {/* DESIGN.md：段位时长用 Quattrocento 数字（引用字体 token，不新增值） */}
        <span className="font-latin shrink-0 text-[0.875rem] text-muted">
          {typeof durationMs === 'number' && durationMs > 0 ? formatClock(durationMs) : '--:--'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          aria-label={PLAYBACK_UI[player.playbackState].label}
          onClick={player.toggle}
          icon={<Icon name={PLAYBACK_UI[player.playbackState].icon} size={18} />}
        >
          {PLAYBACK_UI[player.playbackState].label}
        </Button>
        <p aria-live="polite" className="text-[0.875rem] text-muted">
          已听 {listenedSeconds} 秒 / 共 {totalSeconds} 秒（{percent}%）
        </p>

        {/*
          状态文字（**节点保持稳定**，不靠改 `key` 逼动画重播 —— `motion-web` §5 明令禁止
          "靠改 key 造成子树重建"：会丢焦点、丢输入、丢滚动位置，而且这里也根本不需要重建）。
          与播放按钮**同一个行容器**（flex-wrap，窄屏自然换行）：一屏门禁下不给它单独占一行。

          状态变化的可见性由**三条彼此独立的通道**保证（`motion-web` §7「动效不得是唯一反馈」）：
          ① 结构/文字：这行文案本身随状态改变；② 按钮：文案与图标同时换（播放→暂停→继续播放→重新播放）；
          ③ 无障碍：`aria-live="polite"` 播报。
          这里的 `enter-fade` 只负责"这个区块初次出现时的入场"（DESIGN.md 的入场动效契约），
          它**只动 opacity**，时长/缓动来自 DS token（不内联新值），reduced-motion 由 motion.css 全局降级。
        */}
        <p
          data-testid="playback-state"
          aria-live="polite"
          className="enter-fade text-[0.875rem] leading-[1.6] text-muted"
        >
          {PLAYBACK_UI[player.playbackState].state}
        </p>
      </div>

      <div
        role="progressbar"
        aria-label="已听进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 w-full overflow-hidden rounded-sm bg-line/10"
      >
        {/* 只动 transform：DESIGN.md 禁止动画 width/height；已播进度用唯一的强调色 coral */}
        <div
          className="h-2 origin-left rounded-sm bg-coral transition-transform duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)]"
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
    </div>
  );
}
