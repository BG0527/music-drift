import type { HTMLAttributes } from 'react';
import { cn } from './utils';

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  /** 目标组件尺寸：骨架必须与目标同尺寸，避免加载完成时跳动。 */
  width?: string;
  height?: string;
}

/**
 * 骨架屏：**shimmer 动画，禁用 spinner**（DESIGN.md §Components）。
 * 对读屏隐藏；加载语义由父容器的 `aria-busy` 表达。
 */
export function Skeleton({
  width = '100%',
  height = '1rem',
  className,
  style,
  ...rest
}: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('block overflow-hidden rounded-md bg-tide-pool', className)}
      style={{ width, height, ...style }}
      {...rest}
    >
      <span data-testid="shimmer" className="skeleton-shimmer block h-full w-full" />
    </span>
  );
}
