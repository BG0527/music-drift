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
  BottleSummarySchema,
  CastVoteResponseSchema,
  DrawResponseSchema,
  PutBackResponseSchema,
  SessionResponseSchema,
  type BottleDetail,
  type BottleSummary,
  type DrawResponse,
  type CastVoteResponse,
  type ReportAction,
  type Resolution,
  CollectionSchema,
  PrivateMessageSchema,
  PublicCommentSchema,
  type PrivateMessage,
  type PublicComment,
  type SessionResponse,
} from '@music-drift/shared';
import { apiFetch, apiPost, apiPostVoid } from './client';
import { QUERY_KEYS } from './query-client';

/**
 * 响应类型**从契约 schema 派生**（ADR-004：zod 是唯一真相，不手写第二份 interface）。
 * `PutBackResponseSchema` 的推导类型没有在 contracts 里导出别名，所以这里用 `parse` 的返回类型取它。
 */
type PutBackResponse = ReturnType<typeof PutBackResponseSchema.parse>;
/** 收藏契约里没导出同名 type，按同一规矩从 schema 推导（ADR-004：zod 是唯一真相）。 */
type Collection = ReturnType<typeof CollectionSchema.parse>;

/**
 * 注册请求体与 `RegisterRequestSchema` 正名对齐：`{ account, password }` ——
 * 不发 `handle` 别名、不发 `email`（后端 refine 见 `account` 即通过；邮箱已 deprecated）。
 */
export interface RegisterInput {
  account: string;
  password: string;
}

/** 登录请求体与 `LoginRequestSchema` 对齐：`{ account, password }`（按账号 = handle 查用户）。 */
export interface LoginInput {
  account: string;
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
 * 点赞（`CONTEXT.md` §7.1：点赞落库可统计，但不参与斩杀阈值）。
 *
 * ⚠️ **请求体不再带 `listenedRatio`**（契约里已改为可选，服务端 t20/t21 起忽略它）：
 * "听了多少"由 `useSegmentListen` 周期上报给 `/api/segments/:id/listen`，**由服务端判定**。
 * 前端自己算比例 = 第二份真相（上一版正是这么错的）。
 * **点踩**不在这里：它走 `useSegmentListen().castDislike`（先 flush 覆盖再投票）。
 */
export function useCastVote(): UseMutationResult<
  CastVoteResponse,
  unknown,
  { segmentId: string; value: 'LIKE' }
> {
  const client = useQueryClient();
  return useMutation({
    // 段号走 URL，body 只发契约里的 `value`（服务端不采信 listenedRatio，t20 起也不再发它）
    mutationFn: (input) =>
      apiPost(`/api/segments/${input.segmentId}/votes`, { value: input.value }, CastVoteResponseSchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['bottle'] });
      void client.invalidateQueries({ queryKey: ['sea'] });
    },
  });
}

/**
 * 收藏 / 取消收藏（CONTEXT §8）。服务端规则：**只有已完成并在公海的作品可收藏**
 * （未完成 → `422 COLLECTION_REQUIRES_FINISHED_WORK`），所以调用方要先按 `seaZone` 决定摆不摆这个按钮。
 * 两个动作都幂等（重复收藏不产生第二行、重复取消返回 204）。
 */
export function useCollect(bottleId: string): UseMutationResult<Collection, unknown, void> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(`/api/collections/${bottleId}`, {}, CollectionSchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: QUERY_KEYS.myCollections });
    },
  });
}

export function useUncollect(bottleId: string): UseMutationResult<void, unknown, void> {
  const client = useQueryClient();
  return useMutation({
    // DELETE 没有响应体：`apiPostVoid` 只发 POST，这里直接用 `apiFetch`（同一个 client，同样的错误收敛）
    mutationFn: () => apiFetch<undefined>({ path: `/api/collections/${bottleId}`, method: 'DELETE' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: QUERY_KEYS.myCollections });
    },
  });
}

/**
 * 指定接唱公海未完成作品（CONTEXT §6.2）：抢占持有权，成功后就该去瓶详情录下一段。
 * 服务端拒绝的两种情形都来自内核（已完成 → `BOTTLE_ALREADY_COMPLETE`、本瓶唱过 → `ALREADY_SANG_IN_BOTTLE`）。
 */
export function useTakeTargetedSegment(): UseMutationResult<BottleSummary, unknown, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (bottleId: string) =>
      apiPost(`/api/sea/${bottleId}/targeted-segment`, {}, BottleSummarySchema),
    onSuccess: (summary) => {
      void client.invalidateQueries({ queryKey: QUERY_KEYS.bottle(summary.id) });
      void client.invalidateQueries({ queryKey: QUERY_KEYS.seaList('COMPLETED') });
      void client.invalidateQueries({ queryKey: QUERY_KEYS.seaList('INCOMPLETE') });
      void client.invalidateQueries({ queryKey: QUERY_KEYS.seaBottle(summary.id) });
    },
  });
}

/** 写一条私密留言（接唱者 → 发起者）；成功后刷新留言列表（可见性仍由服务端决定）。 */
export function useAttachMessage(
  bottleId: string,
): UseMutationResult<PrivateMessage, unknown, { content: string; targetSegmentIndex: number }> {
  const client = useQueryClient();
  return useMutation({
    /**
     * 契约（t42）：收件人**由发送者按段号指定** —— `{ content, targetSegmentIndex }`，
     * 服务端按 1-based 段号解析出作者。前端**不传**收件人 id（那会变成第二份"谁是谁"的真相）。
     */
    mutationFn: (input: { content: string; targetSegmentIndex: number }) =>
      apiPost(`/api/bottles/${bottleId}/messages`, input, PrivateMessageSchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['bottle', bottleId, 'messages'] });
    },
  });
}

export function useCreatePublicComment(
  bottleId: string,
): UseMutationResult<PublicComment, unknown, { content: string }> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiPost(`/api/bottles/${bottleId}/comments`, input, PublicCommentSchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: QUERY_KEYS.comments(bottleId) });
    },
  });
}

export function useDeletePublicComment(
  bottleId: string,
): UseMutationResult<void, unknown, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (commentId) =>
      apiFetch<undefined>({ path: `/api/comments/${commentId}`, method: 'DELETE' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: QUERY_KEYS.comments(bottleId) });
    },
  });
}

/** 举报（全链路入口：瓶子 / 唱段 / 留言）→ 204，进人工队列。 */
export function useCreateReport(): UseMutationResult<
  void,
  unknown,
  { targetType: 'BOTTLE' | 'SEGMENT' | 'MESSAGE' | 'COMMENT'; targetId: string; reason: string }
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
