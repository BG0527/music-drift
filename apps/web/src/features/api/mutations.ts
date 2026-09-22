/**
 * 写侧变更（TanStack Query）。
 *
 * 纪律：
 * - **不吞 409/422**：mutations 不重试（见 `query-client.ts`），错误原样交给页面 →
 *   `describeApiError` 变成可读文案 + 出口动作；
 * - 每次写成功都**失效相关查询**（瓶子详情、公海、我的），避免用乐观数据冒充服务端真相；
 * - 唯一的乐观更新用在本机瓶子索引（`features/profile/bottle-index`），且它只是导航书签。
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import {
  BottleDetailSchema,
  DrawResponseSchema,
  PutBackResponseSchema,
  SessionResponseSchema,
  type BottleDetail,
  type DrawResponse,
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
