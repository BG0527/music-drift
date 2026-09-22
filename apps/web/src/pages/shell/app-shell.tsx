/**
 * 应用外壳：桌面侧栏（四入口）+ 移动底栏 + 主内容区。
 *
 * 两条来自 `DESIGN.md` 的硬约束：
 * - 外壳用 `min-h-[100dvh]`，**禁用**被禁的 `h-screen`；移动底栏预留 `env(safe-area-inset-bottom)`；
 * - 未登录访问"我的 / 设置"这类需要身份的页面时，**不静默跳走**：就地说明并给登录出口（带 `next`）。
 */
import type { ReactNode } from 'react';
import { BottomNav, EmptyState, SidebarNav, Skeleton } from '../../design-system';
import { useSession } from '../../features/session/session-context';
import { Link } from './router';
import { useInternalLinkHandler, useRouter } from './router-context';
import { NAV_ITEMS, type AppNavItem } from './routes';
import { TEXT_LINK_STRONG } from './link-styles';

export interface AppShellProps {
  current: AppNavItem['key'];
  requireLogin?: boolean;
  children: ReactNode;
}

export function AppShell({ current, requireLogin = false, children }: AppShellProps) {
  const session = useSession();
  const { href } = useRouter();
  const blocked = requireLogin && session.status !== 'authed';

  return (
    // 外壳层拦截站内锚点点击 → 设计系统的导航无需感知路由
    <AppShellFrame current={current}>
      <main className="flex min-w-0 flex-1 flex-col gap-6 px-6 pb-28 pt-6 md:pb-12">
        {blocked ? (
          <LoginGate
            pending={session.status === 'loading'}
            unavailable={session.unavailable}
            next={href}
          />
        ) : (
          children
        )}
      </main>
    </AppShellFrame>
  );
}

/** 布局本体（与"是否登录"解耦，便于在测试里直接断言容器类名）。 */
function AppShellFrame({ current, children }: { current: AppNavItem['key']; children: ReactNode }) {
  // 设计系统的导航渲染的是自己的 <a>（属主是 frontend-ds，不改它）：
  // 在外壳这一层把站内锚点点击拦成客户端导航，外链/新窗口/修饰键点击照旧交给浏览器。
  const onClick = useInternalLinkHandler();
  return (
    <div className="min-h-[100dvh] bg-wave-white text-abyss" onClick={onClick}>
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[var(--container-max-width)]">
        <SidebarNav items={[...NAV_ITEMS]} current={current} />
        {children}
      </div>
      <BottomNav items={[...NAV_ITEMS]} current={current} />
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
