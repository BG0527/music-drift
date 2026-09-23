/**
 * 路由 → 页面装配（唯一一处把 URL 参数交给页面的地方）。
 *
 * `requireLogin` 的页面（我的 / 设置）在未登录时由外壳就地给出登录出口，**不静默跳走**；
 * 登录页是**全屏入口**（Figma `login-anonymous`：无导航、一屏一个任务），因此不套外壳。
 */
import { AppShell } from './shell/app-shell';
import { useRoute } from './shell/router-context';
import { activeNavKey } from './shell/routes';
import { AdminPage } from './admin-page';
import { BottlePage } from './bottle-page';
import { DriftLogPage } from './drift-log-page';
import { LoginPage } from './login-page';
import { NotFoundPage } from './not-found-page';
import { ProfilePage } from './profile-page';
import { RiverPage } from './river-page';
import { SeaDetailPage } from './sea-detail-page';
import { SeaPage } from './sea-page';
import { SettingsPage } from './settings-page';
import { SongPickerPage } from './song-picker-page';

export function RouteView() {
  const match = useRoute();

  if (match.name === 'login') return <LoginPage />;

  const current = activeNavKey(match.name) ?? 'river';

  function content() {
    switch (match.name) {
      case 'home':
        // 合并后 `/` 不再是独立首页：它只是河道的旧入口（router 会把它规范化成 /river）
        return <RiverPage />;
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
      case 'seaDetail':
        return <SeaDetailPage id={match.params['id'] ?? ''} />;
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

  const requireLogin =
    match.name === 'profile' || match.name === 'settings' || match.name === 'admin';

  return (
    <AppShell current={current} requireLogin={requireLogin}>
      {/* 页面切换的淡入只用 opacity（300ms，非阻塞）；key 让每次换页重新触发一次 */}
      <div key={match.path} className="enter-fade flex min-w-0 flex-col gap-6">
        {content()}
      </div>
    </AppShell>
  );
}
