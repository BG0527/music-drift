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
import { useEffect, useRef } from 'react';
import { Button, Icon, cn, motion, prefersReducedMotion } from '../../design-system';

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
  return (
    <div className={cn('flex flex-wrap items-center gap-[8px]', className)}>
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
  onClick: () => void;
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
      <Button
        variant="ghost"
        aria-label={ariaLabel}
        aria-pressed={pressed}
        disabled={disabled}
        loading={busy}
        {...(title === undefined ? {} : { title })}
        // 小尺寸：显式 px（不写 w-* / h-* 数字档，避免尺度耦合到 --spacing）
        className={cn(
          'h-[32px] min-h-[32px] gap-[6px] rounded-pill px-[12px] text-[0.8125rem]',
          'transition-transform duration-200 ease-out hover:scale-[1.03] active:translate-y-[-1px]',
          pressed ? 'border-peacock bg-info-tint text-peacock' : '',
        )}
        icon={<Icon name={icon} size={16} />}
        onClick={onClick}
      >
        <span className="whitespace-nowrap">{label}</span>
        <span
          ref={countRef}
          className="whitespace-nowrap"
          style={{ fontFamily: 'var(--font-latin)' }}
        >
          {count}
        </span>
      </Button>
      {disabled && disabledReason !== undefined ? (
        // 禁用必须有**可见**的文字原因（DESIGN.md：禁用不能是唯一的不可用提示）
        <span role="status" className="text-[0.75rem] text-slate-current">
          {disabledReason}
        </span>
      ) : null}
    </span>
  );
}
