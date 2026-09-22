import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './utils';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** 抬升层级：L1 卡片（默认）/ L2 浮动条 / L4 深水沉浸区（仅沉浸式区块用）。 */
  elevation?: 'raised' | 'floating' | 'deep';
  title?: ReactNode;
  footer?: ReactNode;
}

const elevations = {
  raised: 'bg-foam border border-mist shadow-card',
  floating: 'bg-foam border border-driftline shadow-floating rounded-xl',
  // 深水暗底**仅用于沉浸式区块**（Hero / 成品试听页），不是深色模式
  deep: 'bg-deep-current border border-trench text-wave-white shadow-floating',
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
        <header className="mb-3 text-[1.0625rem] font-semibold">{title}</header>
      )}
      {children}
      {footer === undefined ? null : (
        <footer className="mt-4 flex items-center gap-3">{footer}</footer>
      )}
    </section>
  );
}
