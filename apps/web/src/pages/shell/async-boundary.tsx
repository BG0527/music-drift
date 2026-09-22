/**
 * 取数三态的统一出口：**加载（骨架）/ 失败（可读文案 + 重试）/ 空（中性空态）**。
 *
 * 为什么必须统一：Figma 12 帧里**没有任何状态帧**，所以状态只能由我们按 DESIGN.md 自建；
 * 如果每个页面各写一套，就会出现"这页有骨架、那页转圈、第三页白屏"的漂移。
 *
 * 设计纪律：
 * - 加载用**骨架屏**（`aria-busy`），禁用 spinner；
 * - 失败用 `ConflictNotice`（中文文案 + 出口动作），并保留重试；
 * - 空态与错误态**不能混**（空 ≠ 错，DESIGN.md §Error States 第 6 条）。
 */
import type { ReactNode } from 'react';
import { Skeleton } from '../../design-system';
import { ConflictNotice } from '../../features/bottle/conflict-notice';

export interface QueryLike<T> {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data?: T | undefined;
  refetch: () => unknown;
}

export interface AsyncBoundaryProps<T> {
  query: QueryLike<T>;
  /** 自定义骨架（默认三行）；骨架尺寸应与目标内容一致，避免加载完成时跳动。 */
  skeleton?: ReactNode;
  emptyWhen?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}

function DefaultSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton height="2.25rem" width="14rem" />
      <Skeleton height="5rem" width="100%" />
      <Skeleton height="5rem" width="100%" />
    </div>
  );
}

export function AsyncBoundary<T>({
  query,
  skeleton,
  emptyWhen,
  empty,
  children,
}: AsyncBoundaryProps<T>) {
  if (query.isPending) {
    return <div aria-busy="true">{skeleton ?? <DefaultSkeleton />}</div>;
  }
  if (query.isError) {
    return (
      <ConflictNotice
        error={query.error}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }
  const data = query.data;
  if (data === undefined) return <DefaultSkeleton />;
  if (emptyWhen !== undefined && emptyWhen(data)) return <>{empty}</>;
  return <>{children(data)}</>;
}
