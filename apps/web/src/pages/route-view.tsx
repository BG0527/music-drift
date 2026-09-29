/**
 * 路由 → 页面装配（唯一一处把 URL 参数交给页面的地方）。
 *
 * `requireLogin` 的页面（河道 / 公海 / 我的 / 设置 / 审核台；河道与公海为 **t12 验收④** 接入）在会话落定后未登录（含读不到登录态）时，
 * 由外壳**自动跳** `/login?next=当前路径`（用户本轮裁决，覆盖 2026-09-27「不静默跳走」旧口径），
 * 登录成功后回跳原路径；loading 保持骨架不提前跳；
 * 登录页**也套外壳**（2026-09-27 用户返工令：全站页面上方常显导航栏——顶栏由外壳渲染，
 * 覆盖登录页 ⇒ 顺带解决「登录页无站内出口」的动线缺口 G5；原「一屏一个任务无导航」为旧 Figma 注记，已被该裁决覆盖）。
 */
import { AppShell } from './shell/app-shell';
import { useRoute } from './shell/router-context';
import { activeNavKey } from './shell/routes';
import { AdminPage } from './admin-page';
import { BottlePage } from './bottle-page';
import { DriftLogPage } from './drift-log-page';
import { LandingPage } from './landing-page';
import { LoginPage } from './login-page';
import { NotFoundPage } from './not-found-page';
import { ProfilePage } from './profile-page';
import { RiverPage } from './river-page';
import { SeaPage } from './sea-page';
import { SettingsPage } from './settings-page';
import { SongPickerPage } from './song-picker-page';

export function RouteView() {
  const match = useRoute();

  const current = activeNavKey(match.name) ?? 'river';

  function content() {
    switch (match.name) {
      case 'home':
        // **t12 用户新裁决**：`/` 直接渲染 landing（翻页式介绍页）。
        // 原「`/` 是河道旧入口」的第十三轮裁决已覆盖（canonicalHref 已删除）。
        return <LandingPage />;
      case 'login':
        return <LoginPage />;
      case 'new':
        return <SongPickerPage />;
      case 'river':
        return <RiverPage />;
      case 'bottle':
        return <BottlePage id={match.params['id'] ?? ''} />;
      case 'bottleLog':
        return <DriftLogPage id={match.params['id'] ?? ''} />;
      case 'sea':
        return <SeaPage />;
      case 'profile':
        return <ProfilePage />;
      case 'settings':
        return <SettingsPage />;
      case 'admin':
        return <AdminPage />;
      default:
        return <NotFoundPage />;
    }
  }

  // 河道 / 公海按 **t12 验收④** 接入守卫（与 我的/设置/审核台 同一机制，
  // 行为 = guest 落定后自动跳 `/login?next=原路径`）；landing（home）与登录页、
  // 瓶子详情、选歌、日志维持既有开放/软登录口径不变。
  const requireLogin =
    match.name === 'profile' ||
    match.name === 'settings' ||
    match.name === 'admin' ||
    match.name === 'river' ||
    match.name === 'sea';

  return (
    <AppShell current={current} requireLogin={requireLogin}>
      {/* 页面切换的淡入只用 opacity（参数来自 --motion-page-duration 契约 token，非阻塞）；key 让每次换页重新触发一次 */}
      <div key={match.path} className="enter-fade flex min-w-0 flex-col gap-6">
        {content()}
      </div>
    </AppShell>
  );
}
