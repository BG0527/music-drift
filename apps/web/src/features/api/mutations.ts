/**
 * 写侧变更（TanStack Query）。
 *
 * 纪律：
 * - **不吞 409/422**：mutations 不重试（见 `query-client.ts`），错误原样交给页面 →
 *   `describeApiError` 变成可读文案 + 出口动作；
 * - 每次写成功都**失效相关查询**（瓶子详情、公海、我的），避免用乐观数据冒充服务端真相；
 * - **不做乐观更新**：界面上的段号 / 缺口 / 去向都由服务端返回，写成功后失效重取即可
 *   （`GET /api/me/bottles` 交付后，连"我参与过的瓶子"也是服务端事实，没有本机书签要维护）。
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import {
  BottleDetailSchema,
  CastVoteResponseSchema,
  DrawResponseSchema,
  PutBackResponseSchema,
  SessionResponseSchema,
  type BottleDetail,
  type DrawResponse,
  type CastVoteResponse,
  type ReportAction,
  type Resolution,
  type SessionResponse,
} from '@music-drift/shared';
import { apiFetch, apiPost, apiPostVoid } from './client';
import { QUERY_KEYS } from './query-client';

/**
 * 响应类型**从契约 schema 派生**（ADR-004：zod 是唯一真相，不手写第二份 interface）。
 * `PutBackResponseSchema` 的推导类型没有在 contracts 里导出别名，所以这里用 `parse` 的返回类型取它。
 */
type PutBackResponse = ReturnType<typeof PutBackResponseSchema.parse>;

export interface RegisterInput {
  handle: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

/** 注册即登录（服务端 201 + Set-Cookie）。 */
export function useRegister(): UseMutationResult<SessionResponse, unknown, RegisterInput> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      apiPost('/api/auth/register', input, SessionResponseSchema),
    onSuccess: (session) => {
      client.setQueryData(QUERY_KEYS.me, session);
    },
  });
}

export function useLogin(): UseMutationResult<SessionResponse, unknown, LoginInput> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => apiPost('/api/auth/login', input, SessionResponseSchema),
    onSuccess: (session) => {
      client.setQueryData(QUERY_KEYS.me, session);
    },
  });
}

export function useLogout(): UseMutationResult<undefined, unknown, void> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiPostVoid('/api/auth/logout'),
    onSuccess: () => {
      // 会话没了 → 清掉所有带用户上下文的缓存（否则换账号会看到上一个人的数据）
      client.setQueryData(QUERY_KEYS.me, null);
      void client.invalidateQueries();
    },
  });
}

/** 发起：选歌 → 建瓶（返回 DRAFT 详情，`missingSegmentIndexes` 给出第 1 段段号）。 */
export function useCreateBottle(): UseMutationResult<BottleDetail, unknown, { songId: string }> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { songId: string }) => apiPost('/api/bottles', input, BottleDetailSchema),
    onSuccess: (bottle) => {
      client.setQueryData(QUERY_KEYS.bottle(bottle.id), bottle);
    },
  });
}

/** 河道随机捞取：409 `NO_BOTTLE_AVAILABLE` 是**正常业务结果**，由页面渲染空态。 */
export function useDrawBottle(): UseMutationResult<DrawResponse, unknown, void> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch({ path: '/api/river/draw', method: 'POST', schema: DrawResponseSchema }),
    onSuccess: (draw) => {
      client.setQueryData(QUERY_KEYS.bottle(draw.bottle.id), draw.bottle);
    },
  });
}

/** 去向三选一（`RIVER` / `RETURN` / `SEA`）。可选值一律来自服务端 `availableResolutions`。 */
export function useChooseResolution(
  bottleId: string,
): UseMutationResult<BottleDetail, unknown, Resolution> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (resolution: Resolution) =>
      apiPost(`/api/bottles/${bottleId}/resolution`, { resolution }, BottleDetailSchema),
    onSuccess: (bottle) => {
      client.setQueryData(QUERY_KEYS.bottle(bottleId), bottle);
      void client.invalidateQueries({ queryKey: QUERY_KEYS.seaList('COMPLETED') });
      void client.invalidateQueries({ queryKey: QUERY_KEYS.seaList('INCOMPLETE') });
    },
  });
}

/** 未接唱直接放回河道（返回打捞冷却次数）。 */
export function usePutBack(bottleId: string): UseMutationResult<PutBackResponse, unknown, void> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch({
        path: `/api/bottles/${bottleId}/put-back`,
        method: 'POST',
        schema: PutBackResponseSchema,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: QUERY_KEYS.bottle(bottleId) });
    },
  });
}

/** 标记一条通知已读（幂等；别人的通知服务端回 404，不泄露存在性）。 */
export function useMarkNotificationRead(): UseMutationResult<undefined, unknown, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) =>
      apiPostVoid(`/api/notifications/${notificationId}/read`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
    },
  });
}

/**
 * 点踩（`CONTEXT.md` §7.3）：**必须听满 80%** 才能踩。
 *
 * 两道关都保留：按钮由音频层的 `dislikeUnlocked`（内核阈值）门禁，服务端**仍会二次校验**
 * （`listenedRatio` 由页面原样上送；服务端不信前端）。所以失败分支（422/409）照旧要处理。
 */
export function useCastVote(): UseMutationResult<
  CastVoteResponse,
  unknown,
  { segmentId: string; value: 'LIKE' | 'DISLIKE'; listenedRatio: number }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiPost(`/api/segments/${input.segmentId}/votes`, input, CastVoteResponseSchema),
    onSuccess: (result) => {
      // 票数与被斩状态都在响应里：直接刷瓶子/公海相关查询（不自己算计数）
      void client.invalidateQueries({ queryKey: ['bottle'] });
      void client.invalidateQueries({ queryKey: ['sea'] });
      void result;
    },
  });
}

/** 举报（全链路入口：瓶子 / 唱段 / 留言）→ 204，进人工队列。 */
export function useCreateReport(): UseMutationResult<
  void,
  unknown,
  { targetType: 'BOTTLE' | 'SEGMENT' | 'MESSAGE'; targetId: string; reason: string }
> {
  return useMutation({
    mutationFn: (input) => apiPostVoid('/api/reports', input),
  });
}

/** 审核裁决（仅管理员）；成功后刷新待处理与历史两个队列。 */
export function useDecideReport(): UseMutationResult<
  unknown,
  unknown,
  { reportId: string; decision: ReportAction }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiPostVoid(`/api/admin/reports/${input.reportId}/decision`, { decision: input.decision }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin', 'reports'] });
    },
  });
}

/** 录音上传成功后统一失效：瓶子详情（新段号/缺口）+ 日志 + 公海。 */
export function useInvalidateBottle(): (bottleId: string) => Promise<void> {
  const client = useQueryClient();
  return async (bottleId: string) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: QUERY_KEYS.bottle(bottleId) }),
      client.invalidateQueries({ queryKey: QUERY_KEYS.bottleEvents(bottleId) }),
      client.invalidateQueries({ queryKey: QUERY_KEYS.seaList('COMPLETED') }),
      client.invalidateQueries({ queryKey: QUERY_KEYS.seaList('INCOMPLETE') }),
    ]);
  };
}
