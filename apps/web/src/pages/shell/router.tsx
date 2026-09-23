/**
 * 路由 Provider 与站内链接（**只导出组件**；hook 在 `router-context.ts`）。
 *
 * 自建原因：依赖基线里没有路由库（见 `routes.ts`），11 条路径一张表足够。
 * 三条纪律：
 * 1. **真锚点**：`Link` 与设计系统的导航都渲染 `<a href>`（键盘 / 中键 / 移动端长按都能用），
 *    只在左键普通点击时拦截成客户端导航；
 * 2. 跳转一律过 `safeNextPath`（只允许站内相对路径，防开放重定向）；
 * 3. 每次路径变化设置 `document.title`，并把页面滚动回顶部。
 */
import { useEffect, useMemo, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { interceptTarget, safeNextPath, type RouteName } from './routes';
import {
  APP_NAME,
  RouterContext,
  matchHref,
  readHref,
  useNavigate,
  type RouterValue,
} from './router-context';

const TITLES: Record<RouteName, string> = {
  login: '登录',
  home: '首页',
  new: '选歌发起',
  river: '暖流河道',
  bottle: '漂流瓶',
  bottleLog: '漂流日志',
  sea: '公海大厅',
  seaDetail: '公海作品',
  profile: '我的',
  settings: '设置',
  admin: '审核台',
  notFound: '找不到这一页',
};

export function RouterProvider({
  children,
  initialPath,
}: {
  children: ReactNode;
  initialPath?: string | undefined;
}) {
  const [href, setHref] = useState(() => initialPath ?? readHref());

  useEffect(() => {
    const onPopState = (): void => {
      setHref(readHref());
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  const navigate = useMemo<RouterValue['navigate']>(
    () => (to, options) => {
      const next = safeNextPath(to);
      if (next === href) return;
      if (options?.replace === true) window.history.replaceState({}, '', next);
      else window.history.pushState({}, '', next);
      setHref(next);
    },
    [href],
  );

  const value = useMemo<RouterValue>(() => ({ ...matchHref(href), navigate }), [href, navigate]);

  useEffect(() => {
    document.title = `${TITLES[value.match.name]} · ${APP_NAME}`;
    window.scrollTo({ top: 0 });
  }, [value.match.name, value.match.path]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
}

/** 站内链接：渲染真锚点，左键普通点击走客户端路由。 */
export function Link({ to, children, ...rest }: LinkProps) {
  const navigate = useNavigate();
  return (
    <a
      href={to}
      onClick={(event) => {
        const path = interceptTarget(event, { href: to, target: null, download: false });
        if (path === null) return;
        event.preventDefault();
        navigate(path);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
