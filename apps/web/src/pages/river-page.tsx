/**
 * 河道（`/river`；`/` 是它的旧入口，已规范化，见 `routes.ts` 的 `canonicalHref`）= 全站门面。
 *
 * ## 本轮：把设计定稿 `docs/ui-review/design-explore/f4-groove.png` 落成响应式真实页面
 * 三件**必须存活**的装置（实施计划 §5.1）：
 *
 * ① **一条被点亮的沟槽 = 一条河道**。整页是一张**躺在水里的唱片**：盘面（同心沟槽）+ 掠光，
 *    水面以下横贯一条**被点亮的沟槽**（两条岸夹一道水）。装置一律**从设计系统取**
 *    （`<Platter>` / `<Glint>` / `<Groove>`）—— 页面不重画母题，这是 `water-motif.test.tsx`
 *    那一组的明确口径（"页面从设计系统取，不许各自重画"）。
 * ② **两枚错落的圆盘泊位**：捞取（下游 · 左 · 冷边）与投下（上游 · 右 · 暖边）**共用同一份尺寸**
 *    （用户 2026-09-23 裁决的"等权"），只把其中一枚沿竖直方向错开一档。盘身是 `disc-core`
 *    （**不填彩色**），彩色只出现在 3 圈外环与 `disc-edge-cool/warm` 的边缘微光上。
 *    它们读起来是"同一条河上的两个位置"，不是两张同宽同高同圆角的卡片。
 * ③ **默认态没有漂流瓶**（用户第 ④ 条硬约束：「默认态只有水在流」）。常驻层**不出现**任何瓶子母题：
 *    "空河道在等"由**被点亮却空着的水槽**读出来；瓶子只在捞/投的一次操作动效里现身
 *    （见下一轮）。常驻层把瓶子加回来，本页测试会红。
 *
 * ## 本轮（任务 E）：把 `docs/ui-review/design-explore/f0-sequence.html` 的三段分镜落进本页
 * ① 常驻态只有水在流：`data-river-decor` 一层装饰（漂移虚线 46s 一个来回 + 两圈错拍的
 *    场景涟漪），`aria-hidden`、零信息、零布局高度；
 * ② 捞取 / 投下：瓶子**只在一次操作里出现**（入场 → 收拢涟漪 → 退场三段状态机），
 *    样式在 `river-motion.css`，参数只取 `--motion-*` token；
 * ③ **动画播完再跳转**（architecture §103.3 用户裁决）：导航挂在 `finishFlow` 上，
 *    同位 `aria-live` 文字状态全程可读；`prefers-reduced-motion` 下不起动画、立即跳
 *    （同一裁决的回归守卫在 `__tests__/river-page.test.tsx`）。
 *
 * ## 响应式（设计稿是 1440×900 固定画布，这里是同一套语言的**重排**）
 * 装饰的几何由设计系统的装置负责（`platter` 的圆心取百分比、`groove` 取 `inset-x-0`），
 * 页面只给位置：多列在 768px 以下折单列（`md:`）、可点目标 ≥44px（`min-h-11`）、
 * 两枚泊位（`data-anchor`）都在 375×812 的首屏内。出血装饰一律包在 `overflow-hidden` 宿主里。
 *
 * 契约：`DESIGN.md` 的 `## Composition` / `## Elevation & Depth`（母题装置库）；
 * 机器守卫：本页测试的「三件装置」一组 + `design-system/__tests__/water-motif.test.tsx`（水域母题层）。
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  CurrentLines,
  Glint,
  Groove,
  LightShafts,
  Platter,
  Ripple,
  RippleRing,
  SurfaceLine,
  WaterSheen,
  WaterTexture,
  cn,
  motion,
  prefersReducedMotion,
} from '../design-system';
import { useDrawBottle, useInvalidateBottle } from '../features/api/mutations';
import { ConflictNotice } from '../features/bottle/conflict-notice';
import { MoodChips } from '../features/bottle/mood-chips';
import { useSession } from '../features/session/session-context';
import { Link } from './shell/router';
import { useNavigate } from './shell/router-context';
import { interceptTarget } from './shell/routes';
import { TEXT_LINK } from './shell/link-styles';
import './river-motion.css';

/**
 * 两个泊位**共用这一份尺寸定义** —— 「投下与捞起等权」的机器可检形式（守卫断言它至少被引用两次）：
 * 只改其中一个会让等权静默失衡，所以这里不允许各写一份。
 * 焦点/边界装置**故意留在各自元素上**（不抽公共常量）：`deep-surface-cta.test.ts` 要读到真实的 class。
 */
const PORT_SIZE = 'h-[76px] w-[76px] rounded-full md:h-[110px] md:w-[110px]';

/** 泊位盘身 + 3 圈外环（外环位移 13 / 29 / 45px 由 `--motif-ring-*` 定，页面不写死）。 */
function PortRings() {
  return (
    <>
      <span aria-hidden="true" data-ring="" className="disc-ring absolute" />
      <span aria-hidden="true" data-ring="" className="disc-ring-2 absolute" />
      <span aria-hidden="true" data-ring="" className="disc-ring-3 absolute" />
    </>
  );
}

/** f0 三段的舞台：瓶子只在**一次操作**里出现（enter → ripple → exit），默认态没有它。 */
type FlowKind = 'draw' | 'cast';
type FlowStage = 'enter' | 'ripple' | 'exit';
interface FlowState {
  kind: FlowKind;
  stage: FlowStage;
}

/** 各段时长 = tokens.ts 的动效契约（`--motion-*` 的 JS 镜像）：入场 480 / 涟漪 2400 / 退场 240。 */
const STAGE_DURATION: Record<FlowStage, number> = {
  enter: motion.entryDuration,
  ripple: motion.rippleDuration,
  exit: motion.exitDuration,
};

/**
 * 分镜里的那只瓶子（f0-sequence ①-02 / ②-02 的形态值：玻璃瓶身 rx7 + 珊瑚木塞 + 一道纸条）。
 * 纯装饰（外层 `aria-hidden`）：色值一律走 `var(--color-*)`，不写 hex。
 * 它**只在一次操作的动效里**出现 —— 常驻态没有它（用户第 ④ 条硬约束，守卫③盯着）。
 */
function FlowVessel() {
  return (
    <svg width={40} height={120} viewBox="0 0 18 54" aria-hidden="true" focusable="false">
      <rect
        x="0"
        y="8"
        width="18"
        height="46"
        rx="7"
        fill="var(--color-glass)"
        fillOpacity={0.28}
        stroke="var(--color-water-light)"
        strokeOpacity={0.9}
        strokeWidth={2}
      />
      {/* 木塞：coral = 被记下的那一下（record-v1 唯一强调色；不用分镜里的旧字面色） */}
      <rect x="4" y="1" width="10" height="8" rx="3" fill="var(--color-coral)" />
      <path
        d="M0 30 h18"
        fill="none"
        stroke="var(--color-paper)"
        strokeOpacity={0.7}
        strokeWidth={1.6}
      />
    </svg>
  );
}

export function RiverPage() {
  const draw = useDrawBottle();
  const invalidate = useInvalidateBottle();
  const navigate = useNavigate();
  const session = useSession();
  const newHref =
    session.status === 'authed' ? '/new' : `/login?next=${encodeURIComponent('/new')}`;
  const mineHref = session.status === 'authed' ? '/me' : `/login?next=${encodeURIComponent('/me')}`;

  /** f0 三段状态机：瓶子只在一次操作里出现（null = 常驻态，只有水在流）。 */
  const [flow, setFlow] = useState<FlowState | null>(null);
  /** 同位 `aria-live` 文字状态（f0①-03：动效不是唯一反馈；§103.3：动画期间必须有可读状态）。 */
  const [drawStatus, setDrawStatus] = useState<string | null>(null);
  const [castStatus, setCastStatus] = useState<string | null>(null);
  const flowRef = useRef<FlowState | null>(null);
  /** 动画还没播完时先记下要去的地址；`finishFlow` 播完才真正跳（§103.3 用户裁决）。 */
  const pendingNavRef = useRef<string | null>(null);
  /** 同一拍内的重复点击（mutation 状态还没回到 React）挡在 ref 层。 */
  const busyRef = useRef(false);

  const startFlow = (kind: FlowKind): void => {
    const next: FlowState = { kind, stage: 'enter' };
    flowRef.current = next;
    setFlow(next);
  };

  /** 三段播完：清舞台 + 补上被推迟的导航（reduced-motion 下这里通常没有待跳地址）。 */
  const finishFlow = useCallback(() => {
    flowRef.current = null;
    setFlow(null);
    const to = pendingNavRef.current;
    if (to !== null) {
      pendingNavRef.current = null;
      navigate(to);
    }
  }, [navigate]);

  const requestNav = (to: string): void => {
    // reduced-motion / 动画已播完：立即走（§103.3 兜底）；否则挂起等 finishFlow。
    if (flowRef.current === null) navigate(to);
    else pendingNavRef.current = to;
  };

  /**
   * 每段结束推进下一段；卸载/换段时清理计时器 —— 组件卸载后不再 setState。
   * 时长来自 STAGE_DURATION（= `--motion-*` 契约），不是这里拍脑袋的数字。
   */
  useEffect(() => {
    if (flow === null) return undefined;
    const timer = window.setTimeout(() => {
      if (flow.stage === 'exit') finishFlow();
      else setFlow({ kind: flow.kind, stage: flow.stage === 'enter' ? 'ripple' : 'exit' });
    }, STAGE_DURATION[flow.stage]);
    return () => window.clearTimeout(timer);
  }, [flow, finishFlow]);

  function onDraw(): void {
    if (busyRef.current) return;
    busyRef.current = true;
    pendingNavRef.current = null;
    setDrawStatus('正在打捞…');
    if (prefersReducedMotion()) {
      // reduce：不起动画、只留文字状态，成功后 requestNav 立即跳（§103.3 回归守卫）。
      flowRef.current = null;
      setFlow(null);
    } else {
      startFlow('draw');
    }
    // mutation 时序沿用原样：点击才发请求，点击前不预生成任何东西。
    void draw
      .mutateAsync()
      .then(async (response) => {
        await invalidate(response.bottle.id);
        setDrawStatus('捞到了，正在打开…');
        requestNav(`/bottles/${response.bottle.id}`);
      })
      .catch(() => {
        setDrawStatus('打捞失败，请看下面的说明。');
        // 失败没有「捞起」可确认 ⇒ 跳过收拢涟漪段，瓶子直接退场（feedback 不得说谎）。
        const current = flowRef.current;
        if (current?.kind === 'draw' && current.stage !== 'exit') {
          const exit: FlowState = { kind: 'draw', stage: 'exit' };
          flowRef.current = exit;
          setFlow(exit);
        }
      })
      .finally(() => {
        busyRef.current = false;
      });
  }

  function onCast(event: ReactMouseEvent<HTMLAnchorElement>): void {
    // `Link` 的 `{...rest}` 会覆盖它内部的 onClick —— 这里接管整条投下路径：
    // 先用与 `Link` 同一个 interceptTarget 判定「普通站内左键点击」，
    // 是 → preventDefault + f0③ 动画，播完（reduce 则立即）再 navigate（去向与原来完全一致）。
    const path = interceptTarget(event, { href: newHref, target: null, download: false });
    if (path === null) return;
    event.preventDefault();
    if (flowRef.current !== null) return;
    setCastStatus('瓶子落水了，正顺河而下…');
    if (prefersReducedMotion()) {
      navigate(path);
      return;
    }
    pendingNavRef.current = path;
    startFlow('cast');
  }

  return (
    // 出血到外壳的内边距之外：唱片因此是一整面，而不是被内容宽度切出来的一块
    // （负外边距正好抵消 `app-shell` 的 `px-[24px] md:px-[48px]`，不会产生横向滚动）。
    <div className="relative isolate -mx-6 flex flex-col gap-6 md:-mx-12 md:gap-8">
      {/* ── 唱片表面：盘面（同心沟槽）+ 掠光 ────────────────────────────────────
          放在 `z-0`：它要压在下面的**水体之上**（"沟槽里流的是水"，语言契约 §7.3），
          但在全部正文之下（正文一律 `relative z-10`）—— 所以正文永远不会被装饰压住。 */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        <Platter />
        <Glint />
      </div>

      {/* ── 岸（水线以上）：标题立在被压暗的盘面上 ───────────────────────────── */}
      <header className="relative z-10 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 px-6 md:px-12">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-latin text-[0.6875rem] tracking-[0.24em] text-muted">
            音乐共创 · 匿名接力
          </p>
          <h1 className="text-[clamp(2.5rem,6vw,5.25rem)] font-bold leading-none text-paper">
            暖流河道
          </h1>
          <p className="max-w-[820px] text-[0.9375rem] leading-[1.85] text-muted">
            拾起那些搁浅在黑夜里的声线
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <p className="text-right font-latin text-[0.6875rem] tracking-[0.24em] text-muted">
            {/* 26px = 字号阶梯的 h1 档（设计稿这里也是 26px） */}
            <span className="block text-[1.625rem] leading-none tracking-normal text-paper">
              33⅓
            </span>
            RPM
          </p>
          <Link to={mineHref} className={TEXT_LINK}>
            我参与过的漂流瓶
          </Link>
        </div>
      </header>

      {/* ── 水线以下：一整片水（水面光 / 水纹 / 水下光柱 / 被点亮的沟槽 / 主流）────
          两个泊位骑在这条河上 —— 它们**没有各自的背景、边框与阴影**，浮在同一片水上，
          这是"同一条河上的两个位置"的关键（`DESIGN.md` §Composition）。
          顶部那段留白是**水面**：既让水线立住，也让正文落在足够深的底色上（对比度）。
          正文用 `paper` 而不是 `muted`：水体顶段是这道渐变最亮的地方，`muted` 在那里只有 4.0:1。 */}
      <section className="river-body relative isolate overflow-hidden px-6 pb-6 pt-16 md:px-12 md:pb-8 md:pt-24">
        <SurfaceLine className="top-0" />
        <WaterSheen />
        <WaterTexture drift />
        <LightShafts />

        {/* ── f0① 常驻态「只有水在流」：漂移虚线（46s 一个来回，契约 .passage-drift 只动
            transform）+ 两圈错拍的场景涟漪（偶尔扩散）。装饰零信息 —— aria-hidden、
            pointer-events-none、绝对定位零布局高度；reduced-motion 下全静止。 */}
        <div aria-hidden="true" data-river-decor="" className="pointer-events-none absolute inset-0">
          <span className="river-flowline passage-drift absolute top-[62px] md:top-[87px]" />
          <span className="absolute bottom-[20px] left-[30%] h-[56px] w-[160px]">
            <RippleRing />
          </span>
          <span className="absolute bottom-[12px] right-[24%] h-[34px] w-[96px]">
            <RippleRing className="river-scene-delay" />
          </span>
        </div>

        {/* 河道 = 那条**被点亮的沟槽**。`progress` 这一页不编码段位（这里没有作品）：
            整条点亮 = 河道通着、水在流（用户第 ④ 条：默认态只有水在流）。
            极轻微地逆时针旋转（1.2°）让"上游在右、水往左下走"与「投下在右、捞取在左」同向。 */}
        <div
          data-device="river"
          className="pointer-events-none absolute inset-x-0 top-[52px] z-0 -rotate-[1.2deg] md:top-[76px]"
        >
          <Groove progress={1} tone="cool" />
        </div>

        <h2 className="sr-only">河道</h2>

        {/* ── f0②③ 操作动效：瓶子**只在一次操作里出现**（常驻态没有它，守卫③盯着）。
            两层结构（同设计系统「外层定位、内层动画」的口径）：外层给位置 —— 河中央 =
            水平居中、与两枚泊位同高；内层才是被动画的位移载体（类名与参数在
            river-motion.css，只动 transform/opacity）。 */}
        {flow !== null ? (
          <div
            aria-hidden="true"
            data-vessel-anchor=""
            className="pointer-events-none absolute left-1/2 top-[102px] md:top-[151px]"
          >
            <span className="absolute -translate-x-1/2 -translate-y-1/2">
              <span
                data-vessel=""
                className={cn(
                  'block',
                  flow.kind === 'draw' && flow.stage === 'enter' && 'river-vessel-enter-draw',
                  flow.kind === 'draw' && flow.stage === 'exit' && 'river-vessel-exit-draw',
                  flow.kind === 'cast' && flow.stage === 'enter' && 'river-vessel-enter-cast',
                  flow.kind === 'cast' && flow.stage === 'exit' && 'river-vessel-exit-cast',
                )}
              >
                <FlowVessel />
              </span>
            </span>
            {flow.stage === 'ripple' ? (
              /* 收拢涟漪 = feedback / confirmation，与瓶子同位、只播一次（iteration 在 CSS 里 = 1） */
              <span
                data-gather=""
                className="absolute left-1/2 top-0 h-[100px] w-[300px] -translate-x-1/2 -translate-y-1/2"
              >
                <span className="river-gather absolute inset-0 block">
                  <Ripple className="inset-0" />
                </span>
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="relative z-10 grid gap-4 md:grid-cols-2 md:items-start md:gap-12">
          {/* 下游 · 捞取（左）：新用户的第一动作，按阅读顺序放先。 */}
          <section
            data-anchor="river-draw"
            aria-labelledby="draw-heading"
            className="flex items-start gap-4 md:gap-6"
          >
            <h2 id="draw-heading" className="sr-only">
              从河道捞一个漂流瓶
            </h2>
            <div data-port="draw" className={cn(PORT_SIZE, 'relative shrink-0')}>
              <PortRings />
              {/* 盘身用本地元素而不是设计系统的 `Button`：`Button` 的基类会填一层彩色底
                  （`bg-*`），而 `cn()` 不做冲突合并 —— 泊位的盘身必须是 `disc-core`（不填彩色）。 */}
              <button
                type="button"
                aria-label="捞一个漂流瓶"
                className={cn(
                  'focus-visible:ring-offset-deep-current absolute inset-0 z-10 flex items-center justify-center rounded-full ring-2 ring-foam',
                  'focus-visible:ring-[3px] focus-visible:ring-sea-glass focus-visible:ring-offset-2',
                  'transition-transform duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)]',
                  'motion-safe:hover:scale-[var(--motion-hover-scale)] motion-safe:active:translate-y-[-1px]',
                  // 打捞中：按钮不可点，且必须与可用态有**形态差异**（DESIGN.md §Interaction States）——
                  // 只动 opacity（不触发重排）；同时用 `role="status"` 文案给出文字反馈。
                  'disabled:cursor-not-allowed disabled:opacity-60',
                )}
                aria-busy={draw.isPending ? true : undefined}
                disabled={draw.isPending || flow?.kind === 'draw'}
                onClick={onDraw}
              >
                <span aria-hidden="true" className="disc-core absolute inset-0 rounded-full" />
                <span aria-hidden="true" className="disc-edge-cool absolute inset-0 rounded-full" />
                <span className="relative flex flex-col items-center gap-[1px]">
                  <span className="text-[0.8125rem] font-bold tracking-[0.12em] md:text-[1rem]">
                    捞取
                  </span>
                  <span lang="en" className="font-latin text-[0.625rem] tracking-[0.28em] opacity-70">
                    DRAW
                  </span>
                </span>
              </button>
            </div>

            <div className="flex min-w-0 flex-col gap-[6px]">
              <p className="text-[0.9375rem] font-semibold text-paper md:text-[1.0625rem]">
                捞一个漂流瓶
              </p>
              <p className="max-w-[32rem] text-[0.8125rem] leading-[1.7] text-paper/85">
                捞取深海深处传来的匿名哼唱，接续她的下一句旋律。
                <span className="whitespace-nowrap">捞到即持有</span>
                ：同一时刻，同一条河道上只有你拿着它。
              </p>
              <p className="max-w-[32rem] text-[0.8125rem] leading-[1.7] text-paper/85">
                河道只能随机打捞，没有搜索，也不能指定某个人来接。
              </p>
              {/* 同位 aria-live 状态（f0①-03）：待 → 成功 / 失败都在这一格里换字，
                  动效永远不是唯一反馈。 */}
              {drawStatus !== null ? (
                <p role="status" aria-live="polite" className="text-[0.9375rem] font-semibold text-paper">
                  {drawStatus}
                </p>
              ) : null}
            </div>
          </section>

          {/* 上游 · 投下（右）：与捞取**等权**（同一份 `PORT_SIZE`、同一套盘身与外环），
              只有两处不同 —— 暖边（"投下"一侧的暖光）与竖直方向错开一档（错落）。 */}
          <section
            data-anchor="river-drop"
            aria-labelledby="cast-heading"
            className="mt-4 flex items-start gap-4 md:mt-16 md:gap-6"
          >
            <h2 id="cast-heading" className="sr-only">
              投下一支漂流瓶
            </h2>
            <div data-port="cast" className={cn(PORT_SIZE, 'relative shrink-0')}>
              <PortRings />
              <Link
                to={newHref}
                aria-label="投下一支漂流瓶"
                className={cn(
                  'focus-visible:ring-offset-deep-current absolute inset-0 z-10 flex min-h-11 items-center justify-center rounded-full ring-2 ring-foam',
                  'focus-visible:ring-[3px] focus-visible:ring-sea-glass focus-visible:ring-offset-2',
                  'transition-transform duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)]',
                  'motion-safe:hover:scale-[var(--motion-hover-scale)] motion-safe:active:translate-y-[-1px]',
                )}
                onClick={onCast}
              >
                <span aria-hidden="true" className="disc-core absolute inset-0 rounded-full" />
                <span aria-hidden="true" className="disc-edge-warm absolute inset-0 rounded-full" />
                <span className="relative flex flex-col items-center gap-[1px]">
                  <span className="text-[0.8125rem] font-bold tracking-[0.12em] md:text-[1rem]">
                    投下
                  </span>
                  <span lang="en" className="font-latin text-[0.625rem] tracking-[0.28em] opacity-70">
                    CAST
                  </span>
                </span>
              </Link>
            </div>

            <div className="flex min-w-0 flex-col gap-[6px]">
              <p className="text-[0.9375rem] font-semibold text-paper md:text-[1.0625rem]">
                投下一支漂流瓶
              </p>
              <p className="max-w-[32rem] text-[0.8125rem] leading-[1.7] text-paper/85">
                选一首歌，录下第 1 段（时长以该段为准），然后投进河道等一个陌生人接下一棒。
              </p>
              <p className="max-w-[32rem] text-[0.8125rem] leading-[1.7] text-paper/85">
                投河之后就交出去了；想找回来看，去「我参与过的漂流瓶」。
              </p>
              {castStatus !== null ? (
                <p role="status" aria-live="polite" className="text-[0.9375rem] font-semibold text-paper">
                  {castStatus}
                </p>
              ) : null}
            </div>
          </section>
        </div>

        {/* 河底：主流 = 声波包络（音乐母题）—— 河道剖面的最后一条线，浮标（心情标签）落在它下面的岸上。 */}
        <div className="relative z-10 mt-4 h-[48px] overflow-hidden md:h-16">
          <CurrentLines className="inset-x-0 bottom-0 h-full" />
        </div>
      </section>

      {draw.isError ? (
        <ConflictNotice
          error={draw.error}
          onRetry={onDraw}
          retryLabel="再捞一次"
          className="relative z-10 mx-6 max-w-[46rem] md:mx-12"
        />
      ) : null}

      {/* 浮标与出口**停在岸上**（不是水里）：心情标签的文字色是珊瑚，压在深水面上只有 3.4:1。 */}
      <div className="relative z-10 flex flex-wrap items-start justify-between gap-x-8 gap-y-4 px-6 md:px-12">
        <MoodChips />
        <Link to="/sea" className={TEXT_LINK}>
          先去公海听听已经完成的作品
        </Link>
      </div>
    </div>
  );
}
