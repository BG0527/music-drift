/**
 * 个人中心（「我的」）—— record-v1：**逐块照抄**
 * `docs/ui-review/design-explore/p-profile-record.html`（返工令 2026-09-28）。
 *
 * 稿 DOM 顺序（块结构照稿，不重组、不省块、不加稿外块）：
 *   `.waterlight` 背景层 → `header`（eyebrow/h1/lede 逐字）→ `.bleed > .sleeve` 内袋卡
 *   → `.crate`（我参与过的瓶列表，交给我参与过的漂流瓶组件）→ `.bottom`（`.msgs` 消息列 + `.pockets` 口袋列）。
 * 样式全在 `profile-page.css`（稿 <style> 逐值照抄 + 唯一允许的 px→fluid 翻译）。
 *
 * React 只做四件（返工令授权）：
 * 1. 真数据：会话（内袋 handle/mail/stamp）、`useMyBottles`（共 N 支 + 回传提示）、`useNotifications`（消息列）；
 * 2. `awaitingMyAction` 回传提示接稿的 `.msgs li.hero`：有 true 才出现，false/缺失不出现（三态测试在案）；
 * 3. 收藏 / 徽章弹窗入口按钮放在稿的 `.pocket` 位置（§46.2：入口 + 弹窗，不摊首屏）；
 * 4. 语义等价替换：稿的静态 svg/文本行 → 等价 React（Link/aria-hidden），文案逐字照稿。
 *
 * 两处用户裁决（稿里有、产品里禁）：
 * - **不显示匿名代号**：稿的 `.codeslot` 行不移植（系统里不存在「你的代号」）；
 * - 稿静态计数「共 5 支」→ 位留着，只填服务端真条数（加载中不填假数）。
 */
import { useState, type ReactNode } from 'react';
import { BadgesPanel } from '../features/bottle/badges-panel';
import { CollectionsPanel } from '../features/bottle/collections-panel';
import { MyBottles } from '../features/bottle/my-bottles';
import { describeNotification } from '../features/bottle/notification-labels';
import { useMyBottles, useNotifications } from '../features/api/queries';
import { useSession } from '../features/session/session-context';
import { Button } from '../design-system';
import { AsyncBoundary } from './shell/async-boundary';
import { TEXT_LINK_STRONG } from './shell/link-styles';
import { Link } from './shell/router';
import './profile-page.css';

type Tone = 'info' | 'success' | 'warning' | 'danger';

/**
 * one-screen 门禁修复（页级收紧；基线 `profile-page.css` 照抄稿不动，本页压一份更紧的流体表达）：
 * ① 横向溢出：稿装饰层 `.waterlight` `left:-8% + width:118%` ⇒ 右沿 110% 视口
 *    （实测 scrollWidth 1440 档=1584、375 档=413，唯一 offenders 就是它）→ 主体水平裁剪；
 * ② 整页高：1440 实测 1031>900，按分段实测只收紧**流体表达**（页顶距 / 页头段距 / 柜上距 /
 *    窗口高 / 下区距 / 口袋内距）—— 四块构图、沉积柱、中心孔、回传 hero 一个不删。
 */
const ME_FIX_CSS = `
.p-record{overflow-x:clip}
.p-record{padding:clamp(32px,2.8vw,40px) clamp(24px,5.28vw,76px) 0}
.p-record h1{margin-top:8px}
.p-record .sub{margin-top:10px}
.p-record .crate{margin-top:clamp(24px,2.8vw,40px)}
.p-record .window{height:clamp(176px,15.3vw,220px)}
.p-record .bottom{margin-top:clamp(8px,0.6vw,9px)}
.p-record .msgs ul{margin-top:8px}
.p-record .pocket{padding:clamp(16px,1.5vw,22px) clamp(14px,1.4vw,20px) clamp(14px,1.3vw,18px)}
.p-record .pocket p{margin-top:8px}
.p-record .pocket button{margin-top:10px}
`;

/** 稿 .mrow 里的三枚 16px 图标（逐值照抄；danger 现无通知类型可达，复用警示三角）。 */
const TONE_SVG: Record<Tone, ReactNode> = {
  info: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" stroke="rgba(127,209,217,.75)" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="1.5" fill="rgba(127,209,217,.75)" />
    </svg>
  ),
  success: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" stroke="rgba(127,209,217,.75)" strokeWidth="1.3" />
      <path
        d="M5 8.2 7.1 10.3 11.2 5.8"
        stroke="rgba(127,209,217,.95)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  warning: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.8 14.6 13.2H1.4Z"
        stroke="rgba(246,215,154,.8)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M8 6.4v3.1" stroke="rgba(246,215,154,.9)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  danger: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.8 14.6 13.2H1.4Z"
        stroke="rgba(246,215,154,.8)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M8 6.4v3.1" stroke="rgba(246,215,154,.9)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
};

export function ProfilePage() {
  const session = useSession();
  const myBottles = useMyBottles();
  const notifications = useNotifications();
  /** 收藏 / 徽章都是**声明式内容**（§46.2）⇒ 只做入口，内容进弹窗。 */
  const [panel, setPanel] = useState<'collections' | 'badges' | null>(null);

  /** 回传提示（W6）：任一条 awaitingMyAction=true 才出现；查询未到/失败时宁可不弹（安全降级）。 */
  const awaiting = myBottles.data?.items.find((bottle) => bottle.awaitingMyAction) ?? null;

  return (
    <main className="p-record">
      <style>{ME_FIX_CSS}</style>

      {/* 水面光带：世界的「上方」，瓶子来的方向（稿 .waterlight） */}
      <div className="waterlight" aria-hidden="true" />

      {/* 页头：eyebrow / h1 / lede 逐字照稿（§1.6-1 档案头入场 enter-rise） */}
      <header className="enter-rise">
        <div className="cat">ACCOUNT · 认领</div>
        <h1>我的</h1>
        <p className="sub">
          账号只用来认领你自己的漂流瓶。别人在瓶子里看到的是匿名代号，看不到你的账号。
        </p>
        {/* flow-audit G7：常显横向出口 —— 任何数据状态下都渲染（空态出口在列表窗内，不同位不重复）
            （mt-2：one-screen 1440 整页高收紧的一环，热区仍由 TEXT_LINK_STRONG 的 min-h-11 保证） */}
        <nav aria-label="站内去路" className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link to="/river" className={TEXT_LINK_STRONG}>
            ← 去河道捞一个
          </Link>
          <Link to="/sea" className={TEXT_LINK_STRONG}>
            公海听完成的作品
          </Link>
        </nav>
      </header>

      {/* 内袋：从柜里抽出来的内套，中心孔里那张标签盘还没印字 ——
          这张唱片上不存在「你的代号」（稿的 .codeslot 按用户裁决不移植） */}
      <div className="bleed">
        <aside className="sleeve" data-anchor="me-identity" aria-label="内袋身份卡">
          <span className="cat stop">内袋</span>
          <div className="hole">
            <div className="label">
              <i className="r1" />
              <i className="r2" />
              <i className="hub" />
            </div>
          </div>
          <div className="who">
            <p className="handle">{session.user?.handle}</p>
            <p className="mail">{session.user?.email}</p>
            <span className="stamp">{session.isAdmin ? '管理员账号' : '普通用户'}</span>
          </div>
        </aside>
      </div>

      {/* 沉积柜：我参与过的漂流瓶（.crate/.chead/.csub/.window 归这个组件） */}
      <MyBottles />

      {/* 剖面下：左消息条（.msgs，含回传 li.hero）、右两个内袋口（.pockets） */}
      <div className="bottom">
        <section className="msgs" aria-labelledby="notifications-heading">
          <h2 id="notifications-heading">消息</h2>
          <p className="msub">
            只显示你自己的消息（留言送达 / 未送达 · 作品进公海）；别人的消息读不到，权限在服务端判定。
          </p>
          <ul>
            {/* 稿 .msgs li.hero：回传到你手里了（有 true 才出现） */}
            {awaiting === null ? null : (
              <li className="hero enter-rise stagger-1" data-anchor="me-awaiting">
                <div className="mrow">
                  <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
                    <ellipse
                      cx="8.5"
                      cy="10.7"
                      rx="7"
                      ry="3.9"
                      stroke="rgba(246,215,154,.88)"
                      strokeWidth="1.4"
                    />
                    <rect
                      x="7.3"
                      y="2.2"
                      width="2.4"
                      height="8.2"
                      rx="1.2"
                      fill="rgba(246,215,154,.9)"
                    />
                  </svg>
                  <span className="lab">《{awaiting.songTitle}》回传到你手里了</span>
                  <span className="pill">未读</span>
                  <Link
                    to={`/bottles/${awaiting.id}`}
                    className="go min-h-11 whitespace-nowrap"
                  >
                    去看看
                  </Link>
                </div>
                <p className="mdet">完整版本已经沿父链回到发起者手里 —— 你只能把它送进公海。</p>
              </li>
            )}

            {/* 消息列真数据（useNotifications）：行结构 .mrow(.lab/.pill|.read/.go) + .mdet 按稿 */}
            <AsyncBoundary
              query={notifications}
              emptyWhen={(page) => page.items.length === 0}
              empty={
                awaiting === null ? (
                  <li>还没有新消息：有人接唱、留言送达或作品入海时才会出现。</li>
                ) : null
              }
            >
              {(page) =>
                page.items.map((notification, index) => {
                  const view = describeNotification(notification);
                  const unread = notification.readAt === null;
                  return (
                    <li
                      key={notification.id}
                      className={`enter-rise stagger-${Math.min(index + 1, 4)}`}
                    >
                      <div className="mrow">
                        {TONE_SVG[view.tone]}
                        <span className="lab">{view.label}</span>
                        {unread ? (
                          <span className="pill">未读</span>
                        ) : (
                          <span className="read">已读</span>
                        )}
                        {view.href === null ? null : (
                          <Link
                            to={view.href}
                            className="go min-h-11 whitespace-nowrap"
                          >
                            去看一眼
                          </Link>
                        )}
                      </div>
                      <p className="mdet">{view.detail}</p>
                    </li>
                  );
                })
              }
            </AsyncBoundary>
          </ul>
        </section>

        {/* 两个内袋口：文案逐字照稿；入口按钮放稿的 pocket 位置（返工令授权） */}
        <div className="pockets">
          <section className="pocket">
            <h3>我的收藏</h3>
            <p>收藏只对已完成并进入公海的作品开放：听到想再听的，把它收起来。</p>
            <Button
              variant="ghost"
              className="whitespace-nowrap"
              onClick={() => {
                setPanel('collections');
              }}
            >
              我的收藏
            </Button>
          </section>
          <section className="pocket">
            <h3>我的徽章</h3>
            <p>徽章是派生的（不落库）：服务端按你参与过的事件当场算出来，作品被撤下就跟着消失。</p>
            <Button
              variant="ghost"
              className="whitespace-nowrap"
              onClick={() => {
                setPanel('badges');
              }}
            >
              我的徽章
            </Button>
          </section>
        </div>
      </div>

      <CollectionsPanel
        open={panel === 'collections'}
        onClose={() => {
          setPanel(null);
        }}
      />
      <BadgesPanel
        open={panel === 'badges'}
        onClose={() => {
          setPanel(null);
        }}
      />
    </main>
  );
}
