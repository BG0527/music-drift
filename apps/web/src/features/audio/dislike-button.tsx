/**
 * 点踩按钮（CONTEXT §7.3：必须听满该段 80% 才能踩）。
 *
 * 这是一个**受控组件**：可用性判定不在这里做，而是由
 * `@music-drift/shared/audio` 的 `describeDislikeAvailability` 算好后传进来
 * （阈值取自内核 `DEFAULT_POLICY.dislikeListenRatioThreshold`，全仓只有一份）。
 * 好处：UI 与 API 用同一套码/文案，"前端说能踩、服务端说不能"这种错不可能发生。
 *
 * 设计契约（DESIGN.md）：
 * - 禁用**不能是唯一的不可用提示** → 必须同时给出文字原因；
 * - 语义色必须"图标 + 文案"成对出现，不能只靠颜色；
 * - 禁用态用 `tide-pool` 底（不复用低透明度），触控目标 ≥44px（由 `Button` 保证）。
 */
import { useId } from 'react';
import type { DislikeAvailability } from '@music-drift/shared/audio';
import { Button, Icon, cn } from '../../design-system';

export interface DislikeButtonProps {
  /** 由 `describeDislikeAvailability` 产出的可用性判定。 */
  availability: DislikeAvailability;
  onCast: () => void;
  /** 提交中（服务端往返未完成）。 */
  casting?: boolean;
  className?: string;
}

export function DislikeButton({
  availability,
  onCast,
  casting = false,
  className,
}: DislikeButtonProps) {
  const reasonId = useId();
  const blocked = !availability.allowed;
  const reason = blocked ? availability.message : null;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Button
        variant="ghost"
        disabled={blocked || casting}
        aria-busy={casting ? true : undefined}
        {...(reason === null ? {} : { 'aria-describedby': reasonId })}
        onClick={onCast}
        icon={<Icon name="ThumbsDown" size={18} />}
      >
        点踩
      </Button>
      {reason === null ? null : (
        <p
          id={reasonId}
          role="status"
          className="flex items-start gap-2 text-[0.875rem] leading-[1.6] text-warning"
        >
          <Icon name="AlertTriangle" size={16} />
          <span>{reason}</span>
        </p>
      )}
    </div>
  );
}
