/**
 * 应用外壳：页面上方常显 top-nav + 主内容区（用户返工令：全站不要侧边栏；
 * 本轮返工：浮动收起式 demo-nav 换成「在页面上方同主题制作导航栏」）。
 *
 * 三条硬约束：
 * - 外壳用 `min-h-[100dvh]`，**禁用**被禁的 `h-screen`；
 * - 外壳**不渲染 `<main>`、不给 padding** —— 每个页面自带 `<main>`（各自设计稿的边距）；
 *   唯一例外是未登录闸门（闸门期自己包一层 `<main>` 保证地标）；
 * - requireLogin 页（河道 / 公海 / 我的 / 设置 / 审核台 —— 河道与公海按 **t12 验收④**
 *   接入同一守卫；其余页单列在 route-view）在会话**落定**后未登录（guest，含读不到登录态
 *   unavailable）时**自动跳** `/login?next=当前路径`（登录后回跳）——
 *   用户本轮裁决，**覆盖** 2026-09-27「不静默跳走」旧口径（旧的就地空态出口按 YAGNI 清理）；
 *   loading 期间保持骨架、不提前跳。
 */
import { useEffect, type ReactNode } from 'react';
import { OfflineBanner, Skeleton, useOnline } from '../../design-system';
import { useSession } from '../../features/session/session-context';
import { useInternalLinkHandler, useRouter } from './router-context';
import { ADMIN_NAV_ITEM, NAV_ITEMS, type AppNavItem } from './routes';
import { TopNav } from './top-nav';

export interface AppShellProps {
  current: AppNavItem['key'];
  requireLogin?: boolean;
  children: ReactNode;
}

export function AppShell({ current, requireLogin = false, children }: AppShellProps) {
  const session = useSession();
  const { href, navigate } = useRouter();
  const blocked = requireLogin && session.status !== 'authed';

  // 用户本轮裁决（覆盖旧「不静默跳走」）：会话落定且非 authed（guest 分支同时覆盖
  // 读不到登录态 unavailable —— 两者 status 同为 guest，区别只在 unavailable 标志）
  // ⇒ 自动跳登录页并带 next= 原路径（replace 不留历史条目，返回键不会在两页间打转）。
  // loading 不跳（保持骨架）；href 已在 /login 上不再跳（防直渲染时自嵌套）。
  useEffect(() => {
    if (blocked && session.status === 'guest' && !href.startsWith('/login')) {
      navigate(`/login?next=${encodeURIComponent(href)}`, { replace: true });
    }
  }, [blocked, session.status, href, navigate]);

  // 审核台入口只对管理员显示（**服务端**才是权限判定；这里避免普通用户看到死入口）。
  // 产品四入口的顺序由 NAV_ITEMS 自己钉住；t28 用户裁决：landing 独立出导航栏 ——
  // 顶栏不再追加「介绍」（`/` 依旧渲染 landing，只是它不进导航）。
  const items = session.isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  return (
    // 外壳层拦截站内锚点点击 → 设计系统的导航无需感知路由
    <AppShellFrame current={current} items={items}>
      {blocked ? (
        // t3：闸门顶替内容时的 continuity 引拍（enter-rise 契约类）；
        // 跳转前的每一帧都是骨架（禁 spinner），旧死端空态已按 YAGNI 清理。
        <main className="enter-rise flex min-w-0 flex-col gap-[32px] px-[24px] py-[40px] md:px-[48px]">
          <LoginGate />
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
  // W18.5 · C4：断网横幅挂在**外壳**层 ⇒ 全站每一页都自动覆盖（此前全站零 onLine 处理）。
  // 位置在顶栏下方 sticky —— 断网是全局状态，不该要用户滚到底部去找。
  const online = useOnline();
  return (
    // 容器 + 拦截点击 + 顶部常显导航：不套 flex、不出 <main>、不加 padding（页面自己带）
    <div className="min-h-[100dvh] bg-wave-white text-abyss" onClick={onClick}>
      {children}
      <TopNav items={items} current={current} />
      <OfflineBanner online={online} />
    </div>
  );
}

/**
 * 未登录闸门：跳转前的每一帧都给骨架（禁 spinner）。
 * 用户本轮裁决下这里**没有**「需要先登录 / 读不到登录状态」死端空态 ——
 * 会话落定后由 AppShell 的 effect 自动跳 /login?next=（原空态分支按 YAGNI 清理）。
 */
function LoginGate() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton height="2.25rem" width="12rem" />
      <Skeleton height="8rem" width="100%" />
    </div>
  );
}
