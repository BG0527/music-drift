/**
 * 审核台（`/admin`，`CONTEXT.md` §8.3）—— 装置：**水线切开待处理 / 历史裁决 + 真印章**。
 *
 * 权限口径：**服务端判定**（非管理员访问接口得 403）。页面这一层做两件事：
 * - 不是管理员时**不渲染队列**（也不去打接口），给一段说明 + 回首页；
 * - 是管理员时给两个视图：待处理队列 / 历史裁决（历史里的「恢复这一段」是覆盖自动斩杀的入口）。
 *
 * 「会话接口挂了」不在这里处理：路由上的这一页由外壳的登录闸门先接住
 * （`pages/shell/app-shell.tsx` 的 `LoginGate` 已把 `unavailable` 与「确实未登录」分开说），
 * 在这里再判一次就是第二份真相。
 *
 * 装置怎么承担信息：一条**水线**横在队列区中间，**待处理浮在水线之上**、**已裁决的历史沉在
 * 水线之下**，两侧各写清自己是什么；历史的每一条结论都是一枚**印章**（真裁决的形态）。
 * 切换视图时水线不动（它是分界，不是列表的装饰）—— 浮上来的与沉下去的换的只是内容。
 *
 * 一屏一件事：先看队列再裁决；表格形态用卡片列表而不是密集表格（375 不横向溢出）。
 */
import { useState } from 'react';
import { Glint, Icon, Tabs, WaterSheen, Waterline } from '../design-system';
import { ReportQueue } from '../features/admin/report-queue';
import { useAdminReports } from '../features/api';
import { useSession } from '../features/session/session-context';
import { TEXT_LINK_STRONG } from './shell/link-styles';
import { Link } from './shell/router';

/** 元信息行（11px + .24em；设计稿 `.cat` = paper/.5）。 */
const META = 'text-[0.6875rem] tracking-[0.24em] text-paper/50';

export function AdminPage() {
  const session = useSession();
  const [view, setView] = useState<'PENDING' | 'REVIEWED'>('PENDING');
  /** 页脚计数（设计稿 `footer .cat`「待处理 3 · 历史 41」）：两队列都来自真接口。
      只在管理员态启用（非管理员/加载中 enabled=false ⇒ 一个请求都不发）；
      与队列组件用同一 queryKey ⇒ 已拉过的那份不会重复请求。 */
  const pendingTotal = useAdminReports('PENDING', session.isAdmin);
  const reviewedTotal = useAdminReports('REVIEWED', session.isAdmin);

  if (session.status === 'loading') {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="h-[36px] w-[160px] rounded-base bg-water-void" />
        <span className="h-[96px] w-full rounded-base bg-water-void" />
      </div>
    );
  }

  if (!session.isAdmin) {
    return (
      <section className="relative isolate flex flex-col gap-3 border border-line/13 bg-water-void/60 px-6 py-8">
        <p className="flex items-center gap-3 text-[1.1875rem] font-semibold text-paper">
          <Icon name="AlertTriangle" size={20} className="text-warning" />
          审核台只对管理员开放
        </p>
        <p className="max-w-[46rem] text-[0.9375rem] leading-[1.85] text-muted">
          这一个入口需要管理员角色。权限由服务端判定 ——
          藏在界面里不算权限，所以即使直接打开这个地址，接口也会拒绝。
        </p>
        <Link to="/" className={TEXT_LINK_STRONG}>
          回首页
        </Link>
      </section>
    );
  }

  return (
    <div className="relative isolate flex flex-col gap-6">
      {/* 掠光与水面光带：世界的"上方"。宿主必须 isolate（否则 z-underlay 会落到背景之下而看不见） */}
      <WaterSheen />
      <Glint />

      <header className="relative flex flex-col gap-2">
        <p className={META}>QC · 母版检验</p>
        <h1 className="text-[1.625rem] font-bold leading-none text-paper md:text-[3.5rem]">
          审核台
        </h1>
        <p className="max-w-[820px] text-[0.90625rem] leading-[1.85] text-muted">
          {
            '人工审核是最终决定权：可以驳回、删段、删瓶下架、封禁作者。自动斩杀只负责「把可疑的段先拿下来」，误斩可以在历史里用「恢复这一段」还回去。'
          }
        </p>
      </header>

      <Tabs
        items={[
          { key: 'PENDING', label: '待处理' },
          { key: 'REVIEWED', label: '历史裁决' },
        ]}
        value={view}
        onChange={(key) => {
          setView(key === 'REVIEWED' ? 'REVIEWED' : 'PENDING');
        }}
      />

      {/* 水线：浮上来的在上面、沉下去的下面。视图切换时它不动 —— 它是分界，不是装饰 */}
      <div className="flex flex-col gap-4" data-anchor="admin-queue">
        {view === 'PENDING' ? (
          <div data-device="pending-above">
            <ReportQueue status="PENDING" />
          </div>
        ) : null}

        <span data-device="waterline" className="relative block h-px">
          {/* 贴水的薄雾：水面那一层被光揉开的亮（装饰层，零布局高度） */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-[23px] h-[46px] bg-water-light/10 blur-[10px]"
          />
          <Waterline className="top-0" />
        </span>

        {view === 'REVIEWED' ? (
          <div data-device="history-below">
            <ReportQueue status="REVIEWED" />
          </div>
        ) : null}

        {/* 页脚两条（设计稿 footer）：左边导语、右边真实计数。
            计数没到就先不写（不占位、不写 0 —— 拿不准的数字不显示）。 */}
        <footer className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.8125rem] leading-[1.85] text-muted">
            自动斩杀把可疑的段先拿下来；这里是可以推翻它的地方。
          </p>
          {pendingTotal.data !== undefined && reviewedTotal.data !== undefined ? (
            <p className={META}>
              {`待处理 ${pendingTotal.data.length} · 历史 ${reviewedTotal.data.length}`}
            </p>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
