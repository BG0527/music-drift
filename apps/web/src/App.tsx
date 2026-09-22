import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Showcase } from './design-system/showcase';
import { createQueryClient } from './features/api/query-client';
import { SessionProvider } from './features/session/session';
import { RouteView } from './pages/route-view';
import { RouterProvider } from './pages/shell/router';

/**
 * 应用入口：Provider 装配 + 路由分派。
 *
 * 三层装配顺序是有原因的：
 * 1. `QueryClientProvider` —— 所有取数都走 TanStack Query（依赖基线里 T3.2 的唯一数据层）；
 * 2. `RouterProvider` —— 会话里的"登录后跳回哪一页"要用当前路径，所以路由要在会话之上；
 * 3. `SessionProvider` —— `GET /api/auth/me` 决定身份，页面与外层的"未登录闸门"都读它。
 *
 * 设计系统展示页只在开发模式下通过 `/?design-system` 进入（生产构建不含该分支）。
 */
export function App() {
  const [queryClient] = useState(createQueryClient);

  if (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    window.location.search.includes('design-system')
  ) {
    return <Showcase />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider>
        <SessionProvider>
          <RouteView />
        </SessionProvider>
      </RouterProvider>
    </QueryClientProvider>
  );
}
