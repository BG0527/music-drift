/**
 * 赞 / 踩读数（用户裁决的最新交互）。
 *
 * 用户原话拆成可执行规格：
 * - **按钮改小**（原来只有一个巨大的点踩）→ 小按钮（显式 px，尺度不依赖 `--spacing`）；
 * - **补上点赞**（此前只有踩）；
 * - **动效与 DESIGN.md 一致**：hover scale(1.03)、200ms、**只动 `transform`/`opacity`**；
 * - **四态**：未投票 / 已赞 / 已踩 / 点踩被拒（服务端说没听满 → 弹窗提醒，不是灰按钮）；
 * - **80% 门槛不作为常驻禁用态**（`listenShort` 只做即时提示），最终判定看服务端 422；
 * - **不传 `listenedRatio`**：听了多少由 `useSegmentListen` 上报、服务端判定（t20/t21）。
 *
 * 可访问性：`aria-pressed` 表达选中态、`aria-label` 带段号（纯图标按钮必须可命名）、
 * 计数变化由 `aria-live="polite"` 播报（动效不是唯一反馈）；
 * **禁用必有可见文字原因**（DESIGN.md），原因不写在 `title` 里。
 */
import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { TapRippleLayer, hapticTap, useTapRipple } from '../../design-system';
import { Icon, cn, motion, prefersReducedMotion } from '../../design-system';

export type MyVote = 'LIKE' | 'DISLIKE' | null;

export interface VoteControlsProps {
  segmentIndex: number;
  likeCount: number;
  dislikeCount: number;
  /** 我投过的票（没有就是 null）。 */
  myVote: MyVote;
  /** `true` = 本段还没听满门槛（只影响"踩"的即时反馈，不禁用按钮）。 */
  listenShort?: boolean;
  busy?: boolean;
  onLike: () => void;
  /**
   * 点踩动作（`listen.castDislike`）：它内部先 flush 覆盖率再投 `/votes {value:'DISLIKE'}`，
   * 门槛由服务端按持久化覆盖率判定（前端不传 `listenedRatio`）。
   * 页面用 `<SegmentPlayer showDislike={false}>` 收起播放器自带的踩 —— 一段只有一个踩控件。
   */
  onDislike: () => void;
  className?: string;
}

export function VoteControls({
  segmentIndex,
  likeCount,
  dislikeCount,
  myVote,
  listenShort = false,
  busy = false,
  onLike,
  onDislike,
  className,
}: VoteControlsProps) {
  const liked = myVote === 'LIKE';
  const disliked = myVote === 'DISLIKE';
  // W18.5 路 C1：落点涟漪（就地操作反馈）。容器 relative + 截断，涟漪从触点扩散。
  const { taps, rippleAt, setContainer } = useTapRipple();

  return (
    <div
      ref={setContainer}
      className={cn('relative flex flex-wrap items-center gap-[8px] overflow-hidden', className)}
    >
      <TapRippleLayer taps={taps} />
      <VoteButton
        label="赞"
        ariaLabel={`给第 ${String(segmentIndex)} 段点赞`}
        count={likeCount}
        pressed={liked}
        // 已赞：内核会 LIKE_ALREADY_CAST（同一段不能重复投同一票）→ 不再发不可能成功的请求
        disabled={liked}
        disabledReason="你已经赞过这一段"
        busy={busy}
        onClick={onLike}
        onRippleAt={rippleAt}
        icon="ThumbsUp"
      />
      <VoteButton
        label="踩"
        ariaLabel={`给第 ${String(segmentIndex)} 段点踩`}
        count={dislikeCount}
        pressed={disliked}
        disabled={disliked}
        disabledReason="你已经踩过这一段"
        busy={busy}
        onClick={onDislike}
        onRippleAt={rippleAt}
        icon="ThumbsDown"
        // 还没听满：按钮**不禁用**（用户要的是"点踩后再判定"），只标注悬停提示
        title={disliked || !listenShort ? undefined : '还没听满 80%，点了会提示'}
      />
      <span className="sr-only" aria-live="polite">
        第 {segmentIndex} 段：赞 {likeCount}，踩 {dislikeCount}
      </span>
    </div>
  );
}

function VoteButton({
  label,
  ariaLabel,
  count,
  pressed,
  disabled = false,
  disabledReason,
  title,
  busy,
  icon,
  onClick,
  onRippleAt,
}: {
  label: string;
  ariaLabel: string;
  count: number;
  pressed: boolean;
  disabled?: boolean;
  disabledReason?: string | undefined;
  title?: string | undefined;
  busy: boolean;
  icon: 'ThumbsUp' | 'ThumbsDown';
  /** C1：带上点击坐标，用来在落点处播一次涟漪（不传也能用，保持旧调用点兼容）。 */
  onClick: (event?: ReactMouseEvent<HTMLButtonElement>) => void;
  /** C1：落点涟漪的触发器（由父级容器提供，见 VoteControls）。 */
  onRippleAt?: (clientX: number, clientY: number) => void;
}) {
  // 计数变化的一次性反馈（motion-web §1 把「投票后的确认」列为 feedback 的典型例）。
  // 用 Web Animations API 而不是改 key 重播动画：§5 明令禁止靠改 key 造成子树重建，
  // 而 CSS 动画只会在挂载时跑一次、内容变化不会重播。只动 opacity（§3），
  // 时长取契约 token（§2），并且在 reduced-motion 下**根本不发**这个动画（§7）。
  const countRef = useRef<HTMLSpanElement>(null);
  const previousCount = useRef(count);
  useEffect(() => {
    const element = countRef.current;
    const changed = previousCount.current !== count;
    previousCount.current = count;
    if (!changed || element === null || prefersReducedMotion()) return;
    element.animate?.([{ opacity: 0.4 }, { opacity: 1 }], {
      duration: motion.pageDuration,
      easing: motion.entryEasing,
    });
  }, [count]);

  return (
    <span className="flex flex-col gap-[2px]">
      {/*
        record-v1：赞/踩是**一行里的小动作**，用 1px 细线 + 2px 圆角（不用药丸大圆角），
        hover 只动 transform（scale 契约值），按下 translateY(-1px)，44px 触控底线。
        选中态不止靠颜色：`aria-pressed` + 边框/字重同时变化。
      */}
      <button
        type="button"
        aria-label={ariaLabel}
        aria-pressed={pressed}
        disabled={disabled}
        aria-busy={busy ? true : undefined}
        {...(title === undefined ? {} : { title })}
        className={cn(
          'inline-flex min-h-11 items-center gap-[6px] rounded-base border px-[12px] text-[0.8125rem]',
          'transition-transform duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)] hover:scale-[var(--motion-hover-scale)] active:translate-y-[-1px]',
          'disabled:cursor-not-allowed',
          pressed
            ? 'border-coral bg-coral/10 font-medium text-danger'
            : 'border-line/25 text-muted hover:text-paper',
        )}
        onClick={(event) => {
          // W18.5 · C1：落点涟漪。播一次即停（`both` 停在末帧 = 完全透明），
          // 所以「下一次点击能不能再看见」取决于这枚是否已被卸载 ——
          // 投票按钮一次交互内是幂等的（已投过就 disabled），不需要连播。
          // W18.5 · C2：触感与涟漪同拍触发（用户裁决：全量无开关）。
          // 桌面浏览器没有 navigator.vibrate，hapticTap 内部静默跳过。
          hapticTap();
          if (event !== undefined && onRippleAt !== undefined) {
            onRippleAt(event.clientX, event.clientY);
          }
          onClick(event);
        }}
      >
        <Icon name={icon} size={16} />
        <span className="whitespace-nowrap">{label}</span>
        <span
          ref={countRef}
          className="whitespace-nowrap"
          style={{ fontFamily: 'var(--font-latin)' }}
        >
          {count}
        </span>
        {busy ? (
          <span
            data-testid="shimmer"
            aria-hidden="true"
            className="skeleton-shimmer h-2 w-[20px] rounded-base bg-line/20"
          />
        ) : null}
      </button>
      {disabled && disabledReason !== undefined ? (
        // 禁用必须有**可见**的文字原因（DESIGN.md：禁用不能是唯一的不可用提示）
        <span role="status" className="text-[0.75rem] text-muted">
          {disabledReason}
        </span>
      ) : null}
    </span>
  );
}
