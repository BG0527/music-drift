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

/** 空态：图标 + 说明 + 行动按钮（中性色；不得与错误态混淆）。 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-4 rounded-base bg-foam/60 px-6 py-8 text-center',
        className,
      )}
    >
      <span className="flex h-[56px] w-[56px] items-center justify-center rounded-full bg-tide-pool text-peacock">
        <Icon name={icon} size={24} />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-[1.0625rem] font-semibold text-abyss">{title}</p>
        {description === undefined ? null : (
          <p className="text-[0.875rem] text-slate-current">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
