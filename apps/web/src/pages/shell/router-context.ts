/**
 * 路由上下文与读取入口（**只有 hook 与类型**；Provider 与 Link 在 `router.tsx`）。
 * 拆开的原因：Fast Refresh 只在"文件只导出组件"时可靠。
 */
import { createContext, useCallback, useContext, type MouseEvent as ReactMouseEvent } from 'react';
import { interceptTarget, matchRoute, type RouteMatch } from './routes';

export interface RouterValue {
  match: RouteMatch;
  search: URLSearchParams;
  href: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

export const RouterContext = createContext<RouterValue | null>(null);

export const APP_NAME = '音乐漂流瓶';

export function readHref(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}`;
}

/** href → 路由匹配结果（不含 navigate，由 Provider 补上）。 */
export function matchHref(href: string): Omit<RouterValue, 'navigate'> {
  const queryStart = href.indexOf('?');
  const pathname = queryStart === -1 ? href : href.slice(0, queryStart);
  const search = queryStart === -1 ? '' : href.slice(queryStart + 1);
  return { match: matchRoute(pathname), search: new URLSearchParams(search), href };
}

export function useRouter(): RouterValue {
  const context = useContext(RouterContext);
  if (context === null) {
    throw new Error('useRouter 必须在 RouterProvider 内使用');
  }
  return context;
}

export function useRoute(): RouteMatch {
  return useRouter().match;
}

export function useNavigate(): RouterValue['navigate'] {
  return useRouter().navigate;
}

export function useSearch(): URLSearchParams {
  return useRouter().search;
}

/**
 * 外壳级拦截：捕获冒泡上来的站内锚点点击（设计系统的导航渲染的是自己的 `<a>`，不改它）。
 * 返回的事件处理器挂在布局根节点上即可。
 */
export function useInternalLinkHandler(): (event: ReactMouseEvent<HTMLElement>) => void {
  const navigate = useNavigate();
  return useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const target = event.target;
      const anchor = target instanceof Element ? target.closest('a') : null;
      const path = interceptTarget(event, {
        href: anchor?.getAttribute('href') ?? null,
        target: anchor?.getAttribute('target') ?? null,
        download: anchor?.hasAttribute('download') ?? false,
      });
      if (path === null) return;
      event.preventDefault();
      navigate(path);
    },
    [navigate],
  );
}
