/**
 * 应用外壳：页面上方常显 top-nav + 主内容区（用户返工令：全站不要侧边栏；
 * 本轮返工：浮动收起式 demo-nav 换成「在页面上方同主题制作导航栏」）。
 *
 * 三条硬约束：
 * - 外壳用 `min-h-[100dvh]`，**禁用**被禁的 `h-screen`；
 * - 外壳**不渲染 `<main>`、不给 padding** —— 每个页面自带 `<main>`（各自设计稿的边距）；
 *   唯一例外是未登录闸门（见 LoginGate，自己包一层 `<main>` 保证地标）；
 * - 未登录访问"我的 / 设置"这类需要身份的页面时，**不静默跳走**：就地说明并给登录出口（带 `next`）。
 */
import type { ReactNode } from 'react';
import { EmptyState, Skeleton } from '../../design-system';
import { useSession } from '../../features/session/session-context';
import { Link } from './router';
import { useInternalLinkHandler, useRouter } from './router-context';
import { ADMIN_NAV_ITEM, NAV_ITEMS, type AppNavItem } from './routes';
import { TEXT_LINK_STRONG } from './link-styles';
import { TopNav } from './top-nav';

export interface AppShellProps {
  current: AppNavItem['key'];
  requireLogin?: boolean;
  children: ReactNode;
}

export function AppShell({ current, requireLogin = false, children }: AppShellProps) {
  const session = useSession();
  const { href } = useRouter();
  const blocked = requireLogin && session.status !== 'authed';

  // 审核台入口只对管理员显示（**服务端**才是权限判定；这里避免普通用户看到死入口）
  const items = session.isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  return (
    // 外壳层拦截站内锚点点击 → 设计系统的导航无需感知路由
    <AppShellFrame current={current} items={items}>
      {blocked ? (
        <main className="flex min-w-0 flex-col gap-[32px] px-[24px] py-[40px] md:px-[48px]">
          <LoginGate
            pending={session.status === 'loading'}
            unavailable={session.unavailable}
            next={href}
          />
        </main>
      ) : (
        children
      )}
    </AppShellFrame>
  );
}

/** 布局本体（与"是否登录"解耦，便于在测试里直接断言容器类名）。 */
function AppShellFrame({
  current,
  items,
  children,
}: {
  current: AppNavItem['key'];
  items: readonly AppNavItem[];
  children: ReactNode;
}) {
  // 页面渲染的是自己的 <a>（属主是各页面，不改它）：
  // 在外壳这一层把站内锚点点击拦成客户端导航，外链/新窗口/修饰键点击照旧交给浏览器。
  const onClick = useInternalLinkHandler();
  return (
    // 容器 + 拦截点击 + 顶部常显导航：不套 flex、不出 <main>、不加 padding（页面自己带）
    <div className="min-h-[100dvh] bg-wave-white text-abyss" onClick={onClick}>
      {children}
      <TopNav items={items} current={current} />
    </div>
  );
}

/** 未登录闸门：加载态用骨架（禁 spinner）；**读不到登录状态**与"确实没登录"分开说。 */
function LoginGate({
  pending,
  unavailable,
  next,
}: {
  pending: boolean;
  unavailable: boolean;
  next: string;
}) {
  if (pending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton height="2.25rem" width="12rem" />
        <Skeleton height="8rem" width="100%" />
      </div>
    );
  }
  if (unavailable) {
    return (
      <EmptyState
        icon="AlertTriangle"
        title="读不到你的登录状态"
        description="服务器暂时没有回应。等一下再刷新这一页，你之前录的内容不受影响。"
      />
    );
  }
  return (
    <EmptyState
      icon="UserRound"
      title="需要先登录"
      description="这一页放的是你自己的漂流瓶与代号。登录之后就能看到它们，回到刚才那一步也不会丢。"
      action={
        <Link to={`/login?next=${encodeURIComponent(next)}`} className={TEXT_LINK_STRONG}>
          去登录
        </Link>
      }
    />
  );
}
