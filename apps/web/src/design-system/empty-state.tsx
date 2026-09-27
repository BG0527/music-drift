import type { ReactNode } from 'react';
import { Icon, type IconName } from './icon';
import { cn } from './utils';

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * 空态：图标 + 说明 + 行动按钮。**空态 ≠ 错误态**（DESIGN.md §Error States 第 6 条）：
 * 中性色、无填充底、不用 danger/warning；图标放在一枚深水圆盘（`water-void` + 冷光）里。
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-4 px-6 py-8 text-center', className)}>
      <span className="flex h-[56px] w-[56px] items-center justify-center rounded-full bg-water-void text-glass">
        <Icon name={icon} size={24} />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-[1.0625rem] font-semibold text-paper">{title}</p>
        {description === undefined ? null : (
          <p className="text-[0.875rem] text-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
