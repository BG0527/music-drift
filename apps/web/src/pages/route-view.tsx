/**
 * 路由 → 页面装配（唯一一处把 URL 参数交给页面的地方）。
 *
 * `requireLogin` 的页面（河道 / 公海 / 我的 / 设置 / 审核台；河道与公海为 **t12 验收④** 接入）在会话落定后未登录（含读不到登录态）时，
 * 由外壳**自动跳** `/login?next=当前路径`（用户本轮裁决，覆盖 2026-09-27「不静默跳走」旧口径），
 * 登录成功后回跳原路径；loading 保持骨架不提前跳；
 * 登录页**也套外壳**（2026-09-27 用户返工令：全站页面上方常显导航栏——顶栏由外壳渲染，
 * 覆盖登录页 ⇒ 顺带解决「登录页无站内出口」的动线缺口 G5；原「一屏一个任务无导航」为旧 Figma 注记，已被该裁决覆盖）。
 *
 * ── W18.5 · B1：换页过渡改成两阶段（契约要求「Fade + slide + 退场」）──────────
 * 此前只有淡入、没有退场、且靠给容器挂 `key`（绑定当前路径）强制重播 —— 后者是 t37 登记的
 * **整树 remount** 缺陷（守卫里给它开过后门 `KEY_REMOUNT_ALLOWLIST`，本轮关闭）。
 * 现在的做法与 Modal 同一套机制（显式两阶段 + 退场时长计时，不靠改 key）：
 *   阶段 1 退场（`exit-fade`，只 opacity，时长 = `--motion-exit-duration`）
 *          —— 同时把滚动位置平滑复位到顶；
 *   阶段 2 入场（`enter-rise`，opacity + `--motion-entry-shift` 上浮，
 *          时长 = `--motion-entry-duration`）。
 * 退场比入场快（240 < 480 两个契约值），符合「人已经知道结果了」；reduced-motion 下全局
 * `animation: none` 让两阶段都退化为瞬时，且此时不做平滑滚动（见 router.tsx）。
 */
import { useEffect, useRef, useState } from 'react';
import { AppShell } from './shell/app-shell';
import { useRoute } from './shell/router-context';
import { activeNavKey } from './shell/routes';
import { motion } from '../design-system/tokens';
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

  /**
   * 换页两阶段的状态机（不靠改 key）：
   *   `phase='out'` 时**仍然渲染旧路径的页面**（`shownPath` 冻结在旧值）并盖 `exit-fade`；
   *   退场计时结束（`motion.exitDuration`）后切到 `phase='in'`，此时才渲染新路径。
   * 于是：旧页淡出 → 新页从下方上浮，两段之间没有硬切。
   */
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const [shownPath, setShownPath] = useState(match.path);
  const outTimerRef = useRef<number | null>(null);

  const atTarget = shownPath === match.path;

  useEffect(() => {
    if (atTarget) {
      if (phase !== 'in') setPhase('in');
      return undefined;
    }
    // 进入退场：冻结旧页面 + 计时。时长来自契约 token（motion.exitDuration ≡ --motion-exit-duration）。
    setPhase('out');
    outTimerRef.current = window.setTimeout(() => {
      setShownPath(match.path);
      setPhase('in');
    }, motion.exitDuration);
    return () => {
      if (outTimerRef.current !== null) {
        window.clearTimeout(outTimerRef.current);
        outTimerRef.current = null;
      }
    };
  }, [atTarget, match.path, phase]);

  /** 退场期间渲染的内容仍按**旧路径**取，避免退场时页面内容先换掉。 */
  const shown = atTarget ? match : { ...match, path: shownPath };

  function content() {
    switch (shown.name) {
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
      {/* 换页两阶段：退场 `exit-fade`（`--motion-exit-duration`，只 opacity）
          → 入场 `enter-rise`（`--motion-entry-duration` + `--motion-entry-shift` 上浮）。
          两段的时长/缓动都来自 --motion-* 契约 token（由 motion.css 的类消费），
          页面不内联任何数值；reduced-motion 下全局 animation:none ⇒ 两段都瞬时。 */}
      <div className={`${phase === 'out' ? 'exit-fade' : 'enter-rise'} flex min-w-0 flex-col gap-6`}>
        {content()}
      </div>
    </AppShell>
  );
}
