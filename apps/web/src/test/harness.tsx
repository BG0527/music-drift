/**
 * 页面级测试工装（**仅测试用**，不进生产包）。
 *
 * 三件事：
 * 1. `renderWithProviders`：把页面放进真实的 QueryClient + 路由 + 会话环境里渲染
 *    （页面用 `useNavigate` / `useQuery`，不能裸渲染）；
 * 2. `installFetchMock`：拦截 `fetch`，按 (method, path) 返回契约形状的响应 ——
 *    页面走的仍然是真实的 `apiFetch`（含 zod 校验与错误收敛），不是被 mock 掉的假实现；
 * 3. `routeStub`：把若干处理器组装成 `installFetchMock` 的输入。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { afterEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { RouterProvider } from '../pages/shell/router';
import { SessionProvider } from '../features/session/session';
import type { MediaRecorderLike, RecorderEnvironment, RecorderStream } from '../features/audio';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export interface FetchHandler {
  /** 默认 GET。 */
  method?: string;
  /** 完整路径（含查询串）或正则。 */
  path: string | RegExp;
  respond: (context: { url: string; init: RequestInit; body: unknown }) => {
    status?: number;
    body?: unknown;
  };
}

export interface FetchMock {
  calls: Array<{ url: string; method: string; body: unknown }>;
  restore: () => void;
}

function matches(handler: FetchHandler, method: string, url: string): boolean {
  if ((handler.method ?? 'GET') !== method) return false;
  return typeof handler.path === 'string' ? handler.path === url : handler.path.test(url);
}

export function installFetchMock(handlers: readonly FetchHandler[]): FetchMock {
  const original = globalThis.fetch;
  const calls: FetchMock['calls'] = [];

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const rawBody = init?.body;
    const body = typeof rawBody === 'string' ? safeParse(rawBody) : rawBody;
    calls.push({ url, method, body });

    const handler = handlers.find((candidate) => matches(candidate, method, url));
    if (handler === undefined) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: { message: `测试未登记这个请求：${method} ${url}`, violations: [] },
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    }
    const result = handler.respond({ url, init: init ?? {}, body });
    return Promise.resolve(
      new Response(result.body === undefined ? null : JSON.stringify(result.body), {
        status: result.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface HarnessOptions {
  /** 初始路径（决定路由匹配与页面挂载）。 */
  route?: string;
  client?: QueryClient;
  /** 接口桩；未登记的路径返回 404。默认：会话接口按"未登录"返回 401。 */
  handlers?: readonly FetchHandler[];
}

export interface HarnessResult extends RenderResult {
  fetchMock: FetchMock;
}

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

export function renderWithProviders(ui: ReactElement, options: HarnessOptions = {}): HarnessResult {
  const client = options.client ?? createTestQueryClient();
  const route = options.route ?? '/';
  window.history.replaceState({}, '', route);
  const fetchMock = installFetchMock([
    // 用户登记的桩优先，默认"未登录"只做兜底（顺序即优先级）
    ...(options.handlers ?? []),
    {
      path: '/api/auth/me',
      respond: () => ({
        status: 401,
        body: { error: { message: '请先登录再继续。', violations: [] } },
      }),
    },
  ]);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <RouterProvider initialPath={route}>
          <SessionProvider>{children}</SessionProvider>
        </RouterProvider>
      </QueryClientProvider>
    );
  }

  return Object.assign(render(ui, { wrapper: Wrapper }), { fetchMock });
}

/**
 * 可控的录音环境桩：能在 node/jsdom 里把"录制 → 停止 → 得到一段 20 秒录音"整条路径跑完。
 *
 * `now()` 由调用方推进（`clock.value += 20_000`），因此时长校验（15–30 秒）可复现，
 * 不依赖真实计时器。
 */
export interface FakeRecorder {
  environment: RecorderEnvironment;
  clock: { value: number };
}

export function fakeRecorderEnvironment(
  overrides: Partial<RecorderEnvironment> = {},
): FakeRecorder {
  const clock = { value: 1_000 };
  const stream: RecorderStream = { getTracks: () => [{ stop: () => undefined }] };
  let recorder: MediaRecorderLike = {
    ondataavailable: null,
    onstop: null,
    onerror: null,
    start: () => undefined,
    stop: () => undefined,
  };

  const environment: RecorderEnvironment = {
    isSecureContext: true,
    hostname: 'localhost',
    hasGetUserMedia: true,
    hasMediaRecorder: true,
    getUserMedia: () => Promise.resolve(stream),
    isTypeSupported: () => true,
    createMediaRecorder: () => {
      recorder = {
        ondataavailable: null,
        onstop: null,
        onerror: null,
        start: () => undefined,
        stop: () => {
          recorder.ondataavailable?.({
            data: new Blob([new Uint8Array(2_048)], { type: 'audio/webm' }),
          });
          recorder.onstop?.();
        },
      };
      return recorder;
    },
    createLevelMeter: () => null,
    now: () => clock.value,
    ...overrides,
  };

  return { environment, clock };
}
