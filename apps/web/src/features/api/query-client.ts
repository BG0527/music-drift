/**
 * TanStack Query 装配（T3.2 依赖基线登记的**唯一**数据层）。
 *
 * 关键取舍：**重试策略只覆盖"确实可能自愈"的失败**。
 * 409（接力冲突）与 422（规则违反）**绝不重试** —— 它们必须立刻变成可读界面
 * （DESIGN.md §Error States 第 3 条：不许静默失败），重试只会把真实冲突拖成"一直转圈"。
 */
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

/** 查询键集中在一处，避免字符串散落导致失效失效。 */
export const QUERY_KEYS = {
  me: ['me'] as const,
  songs: ['songs'] as const,
  anonymousCodes: ['me', 'anonymous-codes'] as const,
  bottle: (id: string) => ['bottle', id] as const,
  bottleEvents: (id: string) => ['bottle', id, 'events'] as const,
  seaList: (zone: string) => ['sea', zone] as const,
  seaBottle: (id: string) => ['sea', 'detail', id] as const,
  notifications: ['me', 'notifications'] as const,
  myBottles: ['me', 'bottles'] as const,
  adminReports: (status: string) => ['admin', 'reports', status] as const,
  /** 曲库元数据是**构建资产**（static 文件），不是用户数据：单独一条键，长缓存。 */
  libraryMetadata: ['library', 'metadata'] as const,
};

/**
 * 只重试一次，且只在「网络没通」或「服务端 5xx」时重试。
 * 4xx 是**确定的结论**（未登录、无权限、冲突、规则违反），重试改变不了它。
 */
export function queryRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (error instanceof ApiError) {
    if (error.status === null) return true;
    return error.status >= 500;
  }
  return false;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: queryRetry,
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        // 演示场景：切窗口/重新聚焦不自动重取，避免两个浏览器窗口互相"抢刷新"
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
