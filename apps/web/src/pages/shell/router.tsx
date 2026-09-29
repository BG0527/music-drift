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
import { prefersReducedMotion } from '../../design-system/tokens';
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
  home: '项目介绍',
  new: '选歌发起',
  river: '暖流河道',
  bottle: '漂流瓶',
  bottleLog: '漂流日志',
  sea: '公海大厅',
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
  /**
   * **t12 用户新裁决**：`/` 直接是 landing，不再规范化到 `/river`
   * （原「河道页合并 canonical = /river」裁决已覆盖，`canonicalHref` 已删除）。
   * 初始 href 只读原值；后续路径变化走 popstate / navigate。
   */
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
    // W18.5 · B1：滚动复位改为**可平滚动**。
    // 此前是 `window.scrollTo({ top: 0 })`（无 behavior）＝ 瞬跳：换页的同一帧里
    // 视口从底部"弹"到顶，与旧页淡出撞在一起，观感是"弹一下"而不是"翻过去"。
    // 现在让滚动与退场阶段（约 240ms）并行，滚完正好新页上浮。
    // reduced-motion 下必须瞬时（平滑滚动本身就是被这条规则禁止的运动），
    // 所以这里读 `prefersReducedMotion()`，而不是无条件平滑。
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
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
