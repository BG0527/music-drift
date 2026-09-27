import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './utils';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** 抬升层级：L1 卡片（默认）/ L2 浮动条 / L4 深水沉浸区（仅沉浸式区块用）。 */
  elevation?: 'raised' | 'floating' | 'deep';
  title?: ReactNode;
  footer?: ReactNode;
}

/**
 * record-v1：**层级由亮度差 + 1px 细线表达，不再用阴影造层次**（DESIGN.md §Elevation）。
 * 阴影只剩两个去处：浮层（floating / Modal / Toast）与浮动播放条。
 * 三种面的值全部来自色板：L1 `ink`、L2 `water-void`、L4 `water-body`。
 */
const elevations = {
  raised: 'bg-ink border border-hairline',
  floating: 'bg-water-void border border-hairline shadow-floating rounded-xl',
  // 深水暗底**仅用于沉浸式区块**（Hero / 成品试听页），不是深色模式
  deep: 'bg-water-body border border-water-surface text-paper',
} as const;

export function Card({
  elevation = 'raised',
  title,
  footer,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <section className={cn(elevations[elevation], 'rounded-base p-4', className)} {...rest}>
      {title === undefined ? null : (
        <header className="mb-3 text-[1.0625rem] font-semibold text-paper">{title}</header>
      )}
      {children}
      {footer === undefined ? null : (
        <footer className="mt-4 flex items-center gap-3">{footer}</footer>
      )}
    </section>
  );
}
