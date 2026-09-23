/**
 * 应用外壳：桌面侧栏（四入口）+ 移动底栏 + 主内容区。
 *
 * 两条来自 `DESIGN.md` 的硬约束：
 * - 外壳用 `min-h-[100dvh]`，**禁用**被禁的 `h-screen`；移动底栏预留 `env(safe-area-inset-bottom)`；
 * - 未登录访问"我的 / 设置"这类需要身份的页面时，**不静默跳走**：就地说明并给登录出口（带 `next`）。
 */
import type { ReactNode } from 'react';
import { BottomNav, EmptyState, Icon, SidebarNav, Skeleton } from '../../design-system';
import { useSession } from '../../features/session/session-context';
import { Link } from './router';
import { useInternalLinkHandler, useRouter } from './router-context';
import { ADMIN_NAV_ITEM, NAV_ITEMS, type AppNavItem } from './routes';
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

  // 审核台入口只对管理员显示（**服务端**才是权限判定；这里避免普通用户看到死入口）
  const items = session.isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  return (
    // 外壳层拦截站内锚点点击 → 设计系统的导航无需感知路由
    <AppShellFrame current={current} items={items}>
      <main className="flex min-w-0 flex-1 flex-col gap-[32px] px-[24px] pb-[96px] pt-[40px] md:px-[48px] md:pb-[40px]">
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

/**
 * 侧栏用户卡（Figma: user-block 212×72）。
 *
 * ⚠️ **刻意不显示匿名代号**：`CONTEXT.md` §12.1 是"同一用户在不同瓶子里代号不同"，
 * 所以系统里**不存在**"你的代号"这一行；填任何值都是编的。身份位（普通用户/管理员）保留。
 * 这是**偏离 Figma** 的一处，已列进回报清单等 captain 带去审批。
 */
function SidebarUserCard() {
  const session = useSession();
  const label = session.status === 'authed' ? (session.user?.handle ?? '已登录') : '未登录';
  const identity = session.isAdmin
    ? '管理员'
    : session.status === 'authed'
      ? '普通用户'
      : '登录后可投瓶';

  return (
    <div className="flex h-[72px] items-center gap-[12px] rounded-base border border-mist bg-wave-white px-[12px]">
      <span className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full bg-tide-pool text-peacock">
        <Icon name="UserRound" size={20} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[0.875rem] font-medium text-abyss">{label}</span>
        <span className="text-[0.75rem] text-slate-current">{identity}</span>
      </span>
    </div>
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
  // 设计系统的导航渲染的是自己的 <a>（属主是 frontend-ds，不改它）：
  // 在外壳这一层把站内锚点点击拦成客户端导航，外链/新窗口/修饰键点击照旧交给浏览器。
  const onClick = useInternalLinkHandler();
  return (
    <div className="min-h-[100dvh] bg-wave-white text-abyss" onClick={onClick}>
      {/*
        布局纪律：**不做整组居中**。
        之前是 `mx-auto + max-w-[1280px]`，在 1440 屏上把"侧栏 + 内容"整体推到中间，
        左右各留 80px 死白、主内容还被二次居中（captain 在截图上看到的"比例不对"主因之一）。
        现在：侧栏贴左（260），主内容紧贴侧栏按 Figma 的 40/48 内边距展开。
      */}
      <div className="flex min-h-[100dvh] w-full">
        <SidebarNav items={[...items]} current={current} footer={<SidebarUserCard />} />
        {children}
      </div>
      <BottomNav items={[...items]} current={current} />
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
