/**
 * 读侧查询（TanStack Query）。
 *
 * 契约纪律：所有响应都用 `packages/shared` 的 zod schema 过一遍（ADR-004），
 * 页面拿到的是**契约类型**，不是 `any`。段号 / 缺口 / 完成度一律来自服务端字段
 * （ADR-015：前端不得自己推算段号或完成度）。
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  AnonymousCodeSchema,
  MyBottleListSchema,
  NotificationSchema,
  ReportSchema,
  BottleDetailSchema,
  BottleEventSchema,
  BottleSummarySchema,
  SessionResponseSchema,
  SongSchema,
  type BottleDetail,
  type MyBottle,
  type Notification,
  type Report,
  type BottleEvent,
  type BottleSummary,
  type SessionResponse,
  type Song,
} from '@music-drift/shared';
import {
  LIBRARY_METADATA_URL,
  LibraryMetadataSchema,
  type LibraryMetadata,
} from '@music-drift/shared/audio';
import { ApiError, apiGet } from './client';
import { QUERY_KEYS } from './query-client';
import { arrayOf, pageOf, type Page } from './schema';

export { arrayOf, pageOf, type Page } from './schema';

/** 分段音频播放地址（Range 端点；`<audio src>` 直接吃它）。 */
/** 匿名代号类型同样从 schema 派生（`AnonymousCode` 未在契约里导出别名）。 */
type AnonymousCode = ReturnType<typeof AnonymousCodeSchema.parse>;

export function segmentAudioUrl(segmentId: string): string {
  return `/api/segments/${segmentId}/audio`;
}

export function useSongs(): UseQueryResult<Song[]> {
  return useQuery({
    queryKey: QUERY_KEYS.songs,
    queryFn: () => apiGet('/api/songs', arrayOf(SongSchema)),
  });
}

/**
 * 当前会话。**未登录不是错误**：401 收敛成 `null`（匿名也能浏览公海、选歌）。
 * 只有真正的故障（5xx / 网络）才会把状态变成 error。
 */
export function useMeQuery(): UseQueryResult<SessionResponse | null> {
  return useQuery({
    queryKey: QUERY_KEYS.me,
    queryFn: async () => {
      try {
        return await apiGet('/api/auth/me', SessionResponseSchema);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
  });
}

export function useAnonymousCodes(enabled = true): UseQueryResult<AnonymousCode[]> {
  return useQuery({
    queryKey: QUERY_KEYS.anonymousCodes,
    queryFn: () => apiGet('/api/me/anonymous-codes', arrayOf(AnonymousCodeSchema)),
    enabled,
  });
}

export function useBottle(id: string | undefined): UseQueryResult<BottleDetail> {
  return useQuery({
    queryKey: QUERY_KEYS.bottle(id ?? ''),
    queryFn: () => apiGet(`/api/bottles/${String(id)}`, BottleDetailSchema),
    enabled: typeof id === 'string' && id.length > 0,
  });
}

export function useBottleEvents(id: string | undefined): UseQueryResult<BottleEvent[]> {
  return useQuery({
    queryKey: QUERY_KEYS.bottleEvents(id ?? ''),
    queryFn: () => apiGet(`/api/bottles/${String(id)}/events`, arrayOf(BottleEventSchema)),
    enabled: typeof id === 'string' && id.length > 0,
  });
}

/** 公海分区：`COMPLETED` = 完整作品，`INCOMPLETE` = 等待接力（`docs/api.md` §2.5）。 */
export function useSeaList(zone: 'COMPLETED' | 'INCOMPLETE'): UseQueryResult<Page<BottleSummary>> {
  return useQuery({
    queryKey: QUERY_KEYS.seaList(zone),
    queryFn: () => apiGet(`/api/sea?zone=${zone}&limit=30`, pageOf(BottleSummarySchema)),
  });
}

/**
 * 我参与过的漂流瓶（`CONTEXT.md` §11.1 的漂流日志入口）。
 *
 * 语义来自服务端：**参与过 = 我发起 或 我在该瓶唱过**；被斩浪的段仍算参与过（§16.7）；
 * 按最近活跃倒序；未登录 401。这里不做任何本地推算（前端算不出"跨设备"这件事）。
 */
export function useMyBottles(enabled = true): UseQueryResult<Page<MyBottle>> {
  return useQuery({
    queryKey: QUERY_KEYS.myBottles,
    queryFn: () => apiGet('/api/me/bottles?limit=50', MyBottleListSchema),
    enabled,
  });
}

/** 审核队列（**仅管理员**；非管理员 403，未登录 401）。 */
export function useAdminReports(
  status: 'PENDING' | 'REVIEWED',
  enabled = true,
): UseQueryResult<Report[]> {
  return useQuery({
    queryKey: QUERY_KEYS.adminReports(status),
    queryFn: () => apiGet(`/api/admin/reports?status=${status}`, arrayOf(ReportSchema)),
    enabled,
  });
}

/** 通知（只含自己的；未登录 401）。 */
export function useNotifications(): UseQueryResult<Page<Notification>> {
  return useQuery({
    queryKey: QUERY_KEYS.notifications,
    queryFn: () => apiGet('/api/notifications?limit=50', pageOf(NotificationSchema)),
  });
}

/**
 * 曲库元数据（伴奏署名用）。
 *
 * 它是 `/library/library.json` 这个**静态资产**，不是 API：所以① 不走 `/api` 代理；
 * ② 用 `LibraryMetadataSchema` 校验（文件损坏时立刻报错，而不是让署名静默变空）；
 * ③ 缓存久一点（构建产物不会在运行中变化）。
 */
export function useLibraryMetadata(): UseQueryResult<LibraryMetadata> {
  return useQuery({
    queryKey: QUERY_KEYS.libraryMetadata,
    queryFn: () => apiGet(LIBRARY_METADATA_URL, LibraryMetadataSchema),
    staleTime: 5 * 60_000,
  });
}

/** 公海详情：不在公海的瓶子 → 404（服务端口径，避免探测）。 */
export function useSeaBottle(id: string | undefined): UseQueryResult<BottleSummary> {
  return useQuery({
    queryKey: QUERY_KEYS.seaBottle(id ?? ''),
    queryFn: () => apiGet(`/api/sea/${String(id)}`, BottleSummarySchema),
    enabled: typeof id === 'string' && id.length > 0,
  });
}
