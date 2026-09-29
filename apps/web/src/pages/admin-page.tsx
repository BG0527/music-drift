/**
 * 审核台（`/admin`，`CONTEXT.md` §8.3）—— **逐块照抄
 * `docs/ui-review/design-explore/s2-admin-record.html`**（约 340 行分 2 段读完即写）。
 *
 * 块序照稿、文案逐字、数值取稿：`main`（padding 46/76/0）→ `header`（.cat / h1 / .sub）→
 * `.views`（两个视图 + 真实计数 .n）→ 水线切「浮上来的待处理 / 沉下去的历史裁决」→
 * `footer`（main 的兄弟块：导语 + 真实计数）。**唯一翻译 = 固定 px → 流体**
 * （稿 1440 画布的绝对定位页脚 → 同宽边距的流内页脚）。
 *
 * 稿把两 Tab 画进同一帧（`.float` 与 `ul.sunk` 并排）→ 实现保持**互斥 Tab**，
 * 块按稿：待处理块在水线之上、历史块在水线之下，切视图时水线不动（它是分界，不是装饰）。
 *
 * 权限口径：**服务端判定**（非管理员访问接口得 403）。页面这一层只做两件事：
 * 不是管理员时不渲染队列（也不打接口），给一段说明 + 回首页；是管理员时给两个视图。
 * 「会话接口挂了」不在这里处理 —— 路由上的登录闸门（`app-shell.tsx` 的 `LoginGate`）已接住。
 *
 * 侧边栏已删，本页不依赖任何侧栏：页面自带 `<main>`，页脚计数全部来自 `useAdminReports`。
 */
import { useRef, useState, type KeyboardEvent } from 'react';
import { Glint, Icon, Platter, WaterSheen, Waterline, cn } from '../design-system';
import { ReportQueue } from '../features/admin/report-queue';
import { useAdminReports } from '../features/api';
import { useSession } from '../features/session/session-context';
import { TEXT_LINK_STRONG } from './shell/link-styles';
import { Link } from './shell/router';

/** 元信息行（稿 `.cat`：Quattrocento 11px + .24em + paper/.5）。 */
const META = 'font-latin text-[0.6875rem] tracking-[0.24em] text-paper/50';
/** 稿 `.view`：15px、baseline 起行、gap 9、下沿 2px（选中换 coral）。 */
const VIEW =
  'flex items-baseline gap-[9px] border-b-2 pb-[10px] text-[0.9375rem] transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink';
/** 稿 `.view .n`：Quattrocento 12.5px、透明度 .75。 */
const VIEW_N = 'font-latin text-[0.78125rem] opacity-75';

type ViewKey = 'PENDING' | 'REVIEWED';

export function AdminPage() {
  const session = useSession();
  const [view, setView] = useState<ViewKey>('PENDING');
  /** 计数（稿 `.view .n` 与 `footer .cat`「待处理 3 · 历史 41」）：两队列都来自真接口。
      只在管理员态启用（非管理员/加载中 enabled=false ⇒ 一个请求都不发）；
      与队列组件用同一 queryKey ⇒ 已拉过的那份不会重复请求。 */
  const pendingTotal = useAdminReports('PENDING', session.isAdmin);
  const reviewedTotal = useAdminReports('REVIEWED', session.isAdmin);
  const tabRefs = useRef<Record<ViewKey, HTMLButtonElement | null>>({
    PENDING: null,
    REVIEWED: null,
  });

  /** tablist 键盘语（ARIA 模式）：左右键切视图并把焦点带过去。 */
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next: ViewKey = view === 'PENDING' ? 'REVIEWED' : 'PENDING';
    setView(next);
    tabRefs.current[next]?.focus();
  };

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
    <div className="relative isolate flex flex-col md:h-[100dvh] md:overflow-hidden">
      {/* 稿 `.platter` / `.glint` / 光带：世界的"上方"。宿主必须 isolate */}
      <Platter />
      <WaterSheen />
      <Glint />

      {/* 稿 `main { padding:46px 76px 0; z-index:2 }` → 流体：顶 46 固定、左右断点 */}
      <main className="relative z-[2] px-6 pt-[46px] md:px-[76px]">
        {/* t3：页头 enter-fade 淡入（次角色 —— 队列面板的 enter-rise 才是本页主角） */}
        <header className="enter-fade">
          {/* G4/P1 语义出口：管理员视图此前页内零站内出口。样式照 bottle-page crumb 模板 */}
          <Link
            to="/river"
            className="inline-flex min-h-11 items-center gap-[7px] whitespace-nowrap text-[0.875rem] text-coral underline underline-offset-[4px]"
          >
            <Icon name="ArrowLeft" size={16} />
            回河道
          </Link>
          <p className={META}>QC · 母版检验</p>
          <h1 className="mt-3 text-[1.625rem] font-bold leading-none text-paper md:text-[3.5rem]">
            审核台
          </h1>
          <p className="mt-[14px] max-w-[820px] text-[0.90625rem] leading-[1.85] text-muted">
            {
              '人工审核是最终决定权：可以驳回、删段、删瓶下架、封禁作者。自动斩杀只负责「把可疑的段先拿下来」，误斩可以在历史里用「恢复这一段」还回去。'
            }
          </p>
        </header>

        {/* 稿 `.views`：两个视图就是水面的两侧 —— 待处理在水上、历史裁决在水下 */}
        <div role="tablist" aria-label="审核台视图" className="mt-5 flex gap-[34px]">
          <button
            ref={(node) => {
              tabRefs.current.PENDING = node;
            }}
            type="button"
            role="tab"
            id="admin-tab-PENDING"
            aria-selected={view === 'PENDING'}
            aria-controls="admin-queue-panel"
            tabIndex={view === 'PENDING' ? 0 : -1}
            onClick={() => {
              setView('PENDING');
            }}
            onKeyDown={onTabKeyDown}
            className={cn(
              VIEW,
              view === 'PENDING' ? 'border-coral text-paper' : 'border-transparent text-muted hover:text-paper',
            )}
          >
            <b className="font-bold">待处理</b>
            {pendingTotal.data !== undefined ? (
              <span className={VIEW_N}>{pendingTotal.data.length}</span>
            ) : null}
          </button>
          <button
            ref={(node) => {
              tabRefs.current.REVIEWED = node;
            }}
            type="button"
            role="tab"
            id="admin-tab-REVIEWED"
            aria-selected={view === 'REVIEWED'}
            aria-controls="admin-queue-panel"
            tabIndex={view === 'REVIEWED' ? 0 : -1}
            onClick={() => {
              setView('REVIEWED');
            }}
            onKeyDown={onTabKeyDown}
            className={cn(
              VIEW,
              view === 'REVIEWED' ? 'border-coral text-paper' : 'border-transparent text-muted hover:text-paper',
            )}
          >
            <b className="font-bold">历史裁决</b>
            {reviewedTotal.data !== undefined ? (
              <span className={VIEW_N}>{reviewedTotal.data.length}</span>
            ) : null}
          </button>
        </div>

        {/* 水线切：浮上来的在上、沉下去的在下。视图切换时它不动 —— 它是分界，不是装饰 */}
        <div
          data-anchor="admin-queue"
          className="enter-rise"
          role="tabpanel"
          id="admin-queue-panel"
          aria-labelledby={`admin-tab-${view}`}
        >
          {view === 'PENDING' ? <ReportQueue status="PENDING" /> : null}

          <span data-device="waterline" className="relative block h-px">
            {/* 稿 `.surface-haze`：水面那一层被光揉开的薄雾（装饰层，零布局高度） */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 -top-[23px] h-[46px] bg-water-light/10 blur-[10px]"
            />
            <Waterline className="top-0" />
          </span>

          {view === 'REVIEWED' ? <ReportQueue status="REVIEWED" /> : null}
        </div>
      </main>

      {/* 稿 `footer`（main 的兄弟块，左右 76 / 下 28）：左导语逐字、右真实计数。
          计数没到就先不写（不占位、不写 0 —— 拿不准的数字不显示）。 */}
      <footer className="relative z-[3] mt-auto flex flex-wrap items-center gap-4 px-6 pb-[28px] pt-8 md:px-[76px]">
        <p className="text-[0.8125rem] text-muted">
          自动斩杀把可疑的段先拿下来；这里是可以推翻它的地方。
        </p>
        {pendingTotal.data !== undefined && reviewedTotal.data !== undefined ? (
          <p className={cn(META, 'ml-auto')}>
            {`待处理 ${pendingTotal.data.length} · 历史 ${reviewedTotal.data.length}`}
          </p>
        ) : null}
      </footer>
    </div>
  );
}
