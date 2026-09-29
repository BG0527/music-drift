/**
 * 公海大厅 —— **逐块照抄** record-v1 设计稿 `docs/ui-review/design-explore/p-sea-hall.html`。
 *
 * 稿块顺序（与本文件 DOM 一一对应）：
 * 页级 `.clip`（底图十块 + `.surface` 水线 + `.rings` 涟漪，稿放哪就放哪：main 之前）→
 * `main`：`.topbar` 两行 meta → `.rule`（左端 coral 段）→ `header.hero`（h1 + lede）→
 * `.zones`（分区 · SECTIONS + tablist 两 tab + 计数位）→ `.fleet` 六支瓶（sounding +
 * bottle(glass(note×5, sub) + cork) + entry）→ 空态稿块 → `footer.foot`（.tail + .pages）。
 *
 * 允许的唯一翻译 = 固定 px → 流体（% / clamp 等价）：稿按 1440 画布给的 `left:88px` 等
 * 横向定值全部换成 %（页边距 6.1111%、列宽 13.2410%、列位 6.11→80.65%），纵向 px 原样；
 * 页面自带 `<main>`（位置/内边距照稿），不依赖外壳侧边栏。
 *
 * React 只做语义等价的事：`useSeaPages` 真数据 + 游标分页、两 Tab、空/骨架/错三态、
 * 「听这支作品」→ `buildPath('bottle', {id})`；颜色只用 token/var()，稿里的 `#fff` 以
 * 等值 `rgba(255,255,255,1)` 落地（页面层禁 hex）。
 *
 * ⚠️ 守卫冲突（页优先，守卫不改，详见交付汇报）：water-motif 对本页的源码断言
 * 「整页水位线组件（浅底 · light）」「水面光带组件（浅底 · light）」「页头漂流瓶标」
 * 「潮线组件」「本页至少一处母题组件」「空态含漂流瓶标」「含漂移水层的页面 ≥3」——
 * 稿里没有这四件设计系统组件（稿只有页级 .surface/.rings 与 .fleet 的瓶），
 * 以稿为准落地后这些断言会红；断言行待整合者按稿修订，本文件不引用其字面量以免误绿。
 */
import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { BottleSummary } from '@music-drift/shared';
import { useSeaPages } from '../features/api/queries';
import { gapNotice } from '../features/bottle/relay-status';
import { Skeleton, cn } from '../design-system';
import { AsyncBoundary } from './shell/async-boundary';
import { Link } from './shell/router';
import { buildPath } from './shell/routes';
import { TEXT_LINK, TEXT_LINK_STRONG } from './shell/link-styles';
import { formatOccurredAt } from '../features/bottle/drift-events';

type Zone = 'COMPLETED' | 'INCOMPLETE';

/** 首屏一页多少支（稿注释：6 支 = SEA_PAGE_SIZE）。 */
const SEA_PAGE_SIZE = 6;

/** 分区名（页脚 tail 与 tab 文案共用；稿值）。 */
const ZONE_LABEL: Record<Zone, string> = {
  COMPLETED: '完整作品',
  INCOMPLETE: '等待接力',
};

/**
 * 六支列的几何（稿内联 style 的值；left 88→1161.33px 是 1440 画布上的定值 ⇒ 换成等比 %，
 * --wy / --tilt 是水线波形的 y 与瓶倾角 ⇒ 纵向 px 原样照抄）。
 */
const COL_LEFTS = ['6.1111%', '21.0188%', '35.9257%', '50.8333%', '65.7410%', '80.6479%'];
const COL_WYS = ['370.4px', '375px', '369.1px', '359.6px', '357.6px', '365.5px'];
const COL_TILTS = ['2.4deg', '-0.22deg', '-2.58deg', '-1.92deg', '0.99deg', '2.74deg'];

function colStyle(index: number): CSSProperties {
  return {
    left: COL_LEFTS[index] ?? '6.1111%',
    '--wy': COL_WYS[index] ?? '370.4px',
    '--tilt': COL_TILTS[index] ?? '2.4deg',
  } as CSSProperties;
}

/**
 * 次级文字链接（`.listen` / 空态「去河道捞一个」）：
 * 以 `TEXT_LINK`（自带 nowrap + min-h-11，design-discipline 守卫的两种机制之一）为底，
 * 颜色字号由稿级 `.sea-hall .listen / .empty a` 覆盖（作用域更高）。
 */
const SEA_TEXT_LINK = cn(
  TEXT_LINK,
  'listen text-[0.8125rem] font-normal text-glass underline-offset-4',
);

/**
 * 稿 p-sea-hall 的 <style> 逐块搬入（组件作用域 `.sea-hall`，值照稿；
 * 仅：横向定值 px→%、`#fff`→等值 rgba、色值取 var(--color-*) token）。
 */
const SEA_HALL_CSS = `
/* t5 一屏收敛（docs/replica-gap.md §2.2 / P0-4）：旧值是一条写死 900px 的硬地板，
   1280×800 下正是那多出来的 100px —— 已按守卫口径删除，只留视口高；md+ 钉死视口高
   （本页全部块都绝对锚视口，高度变了只是"水位随窗"，构图不散）。<md 维持流式。 */
.sea-hall{min-height:100dvh}
@media (min-width:768px){
  .sea-hall{height:100dvh;min-height:0;overflow:hidden}
}

/* ── 稿 .clip：水线之上是空气（天光），之下是沉在水里的盘面 ── */
.sea-hall .clip{position:absolute;inset:0;overflow:hidden;z-index:0}
.sea-hall .sky{position:absolute;left:0;right:0;top:0;height:366px;background:radial-gradient(118% 84% at 52% 106%,rgba(127,209,217,.078),rgba(127,209,217,0) 70%)}
.sea-hall .beam{position:absolute;left:0;right:0;top:0;height:366px;mix-blend-mode:screen;background:linear-gradient(101deg,rgba(203,238,246,0) 26%,rgba(203,238,246,.05) 46%,rgba(228,247,252,.075) 53%,rgba(203,238,246,.03) 66%,rgba(203,238,246,0) 80%)}
.sea-hall .platter{position:absolute;inset:0;background:repeating-radial-gradient(circle at 1420px 960px,rgba(216,243,246,.055) 0 1.2px,transparent 1.2px 6.5px),radial-gradient(circle at 1420px 960px,rgba(127,209,217,.05) 0 30%,transparent 68%);-webkit-mask-image:linear-gradient(180deg,rgba(255,255,255,.38) 0 310px,rgba(255,255,255,1) 406px);mask-image:linear-gradient(180deg,rgba(255,255,255,.38) 0 310px,rgba(255,255,255,1) 406px)}
.sea-hall .glint{position:absolute;inset:0;mix-blend-mode:screen;background:linear-gradient(101deg,transparent 28%,rgba(228,247,252,.045) 45%,rgba(228,247,252,.065) 50%,rgba(228,247,252,.028) 55%,transparent 72%);-webkit-mask-image:linear-gradient(180deg,rgba(255,255,255,.38) 0 310px,rgba(255,255,255,1) 406px);mask-image:linear-gradient(180deg,rgba(255,255,255,.38) 0 310px,rgba(255,255,255,1) 406px)}
.sea-hall .shafts{position:absolute;left:0;right:0;top:0;bottom:0;background:repeating-linear-gradient(99deg,rgba(203,238,246,.062) 0 5px,transparent 5px 104px),repeating-linear-gradient(103deg,rgba(203,238,246,.028) 0 18px,transparent 18px 268px);-webkit-mask-image:linear-gradient(180deg,rgba(255,255,255,0) 0 358px,rgba(255,255,255,.9) 386px,rgba(255,255,255,.22) 100%);mask-image:linear-gradient(180deg,rgba(255,255,255,0) 0 358px,rgba(255,255,255,.9) 386px,rgba(255,255,255,.22) 100%)}
.sea-hall .lit{position:absolute;left:0;right:0;top:366px;height:186px;background:linear-gradient(180deg,rgba(127,209,217,.085) 0%,rgba(127,209,217,0) 100%)}
.sea-hall .abyss{position:absolute;left:0;right:0;top:366px;bottom:0;background:linear-gradient(180deg,rgba(5,15,20,0) 0%,rgba(3,11,16,.36) 52%,rgba(2,8,12,.64) 100%)}
.sea-hall .seabed{position:absolute;left:-1880px;top:806px;width:5200px;height:900px;border-radius:50%;border-top:1px solid rgba(243,249,250,.13);background:radial-gradient(46% 130px at 50% 0%,rgba(127,209,217,.06),rgba(127,209,217,0) 74%),linear-gradient(180deg,rgba(243,249,250,.018),rgba(243,249,250,0) 240px)}
.sea-hall .sed i{position:absolute;height:1px;background:rgba(243,249,250,.12)}
.sea-hall .bub i{position:absolute;border-radius:50%;background:rgba(203,238,246,.3)}
.sea-hall .surface{position:absolute;left:0;top:0;width:100%;height:900px}
.sea-hall .rings{position:absolute;left:0;top:0;width:100%;height:900px}

/* ── 稿三、前台 ── */
.sea-hall main{position:absolute;inset:0;z-index:3}
.sea-hall .topbar{position:absolute;left:6.1111%;right:6.1111%;top:38px;display:flex;justify-content:space-between}
.sea-hall .meta{font-family:var(--font-latin);font-size:11px;letter-spacing:.24em;color:rgba(243,249,250,.5)}
.sea-hall .mono{font-family:var(--font-latin);font-variant-numeric:tabular-nums}
.sea-hall .rule{position:absolute;left:6.1111%;right:6.1111%;top:68px;height:1px;background:rgba(243,249,250,.09)}
.sea-hall .rule i{position:absolute;left:0;top:0;width:88px;height:1px;background:var(--color-coral)}
.sea-hall .hero{position:absolute;left:6.1111%;top:98px}
.sea-hall .hero h1{font-size:60px;font-weight:700;line-height:1;letter-spacing:.01em}
.sea-hall .lede{margin-top:18px;max-width:524px;font-size:15px;line-height:1.9;color:var(--color-muted)}
/* z-index：.fleet 是全屏层（inset:0）且 tree order 在 .zones 之后，同 z-auto 时整层压住
   tablist ⇒ 真实浏览器里分区 tab 点不到（fireEvent 不命中测试所以老测试全绿）。
   提层只改层叠不改视觉：.zones 盒（top:98 高约 60px）与 .col 的瓶/测深线（top ≥ 260px）无重叠。 */
.sea-hall .zones{position:absolute;right:6.1111%;top:98px;text-align:right;z-index:1}
.sea-hall .zones ul{list-style:none;display:flex;gap:30px;margin-top:15px}
.sea-hall .zones li{padding-bottom:7px;border-bottom:2px solid transparent;font-size:15px;letter-spacing:.04em;color:rgba(243,249,250,.5);cursor:pointer;transition:color var(--motion-hover-duration) var(--motion-entry-easing),border-color var(--motion-hover-duration) var(--motion-entry-easing)}
.sea-hall .zones li .n{margin-left:6px;font-size:12px;color:rgba(243,249,250,.42)}
.sea-hall .zones li[aria-selected='true']{color:var(--color-paper);border-bottom-color:var(--color-coral);animation:sea-tab-pick var(--motion-entry-duration) var(--motion-entry-easing) both}
.sea-hall .zones li[aria-selected='true'] .n{color:var(--color-glass)}
/* t6 分区切换的确认动效（guidance：现在看的是哪个分区）。一次性「起-落」，
   幅度取契约 hoverScale、时长/缓动取 --motion-* token；只动 transform，静止态 = 基态。 */
@keyframes sea-tab-pick{0%{transform:scale(1)}50%{transform:scale(var(--motion-hover-scale))}100%{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.sea-hall .zones li[aria-selected='true']{animation:none}}

/* ── 稿：船队 —— 六支瓶子跨骑同一条水线；涟漪环的四段弧 = 四个段位 ── */
.sea-hall .fleet{position:absolute;inset:0;list-style:none}
.sea-hall .col{position:absolute;top:0;height:100%;width:13.2410%}
.sea-hall .bottle{position:absolute;left:50%;top:calc(var(--wy) - 96px);width:60px;height:124px;margin-left:-30px;transform:rotate(var(--tilt));transform-origin:50% 77.4%}
.sea-hall .glass{position:absolute;left:0;top:6px;width:60px;height:118px;clip-path:polygon(14% 100%,14% 47%,34% 27%,34% 7%,66% 7%,66% 27%,86% 47%,86% 100%);background:linear-gradient(100deg,rgba(203,238,246,.46) 0 2.6%,rgba(10,48,60,.5) 17%,rgba(3,17,23,.82) 62%,rgba(127,209,217,.3) 96%,rgba(203,238,246,.34) 100%)}
.sea-hall .note{position:absolute;left:27%;right:27%;bottom:42px;height:18px;display:flex;align-items:flex-end;gap:3px}
.sea-hall .note i{flex:1;background:rgba(203,238,246,.38)}
.sea-hall .note i:nth-child(1){height:5px}
.sea-hall .note i:nth-child(2){height:12px}
.sea-hall .note i:nth-child(3){height:17px}
.sea-hall .note i:nth-child(4){height:10px}
.sea-hall .note i:nth-child(5){height:6px}
.sea-hall .sub{position:absolute;left:0;right:0;top:90px;bottom:0;background:linear-gradient(180deg,rgba(4,20,26,.3),rgba(2,10,15,.62))}
.sea-hall .sub::before{content:'';position:absolute;left:0;right:0;top:0;height:1px;background:rgba(203,238,246,.32)}
.sea-hall .cork{position:absolute;left:50%;top:0;width:28px;height:18px;margin-left:-14px;border-radius:2px;background:linear-gradient(180deg,rgba(246,215,154,.44),rgba(246,215,154,.24))}
.sea-hall .sounding{position:absolute;left:50%;top:calc(var(--wy) + 36px);width:1px;height:calc(416px - var(--wy));background:linear-gradient(180deg,rgba(243,249,250,.17),rgba(243,249,250,.05))}
.sea-hall .sounding::after{content:'';position:absolute;left:-2px;bottom:0;width:5px;height:1px;background:rgba(243,249,250,.22)}
.sea-hall .col.wait .bottle{top:calc(var(--wy) + 26px)}
.sea-hall .col.wait .sounding{top:calc(var(--wy) + 100px)}
.sea-hall .entry{position:absolute;left:0;right:0;top:452px}
.sea-hall .song{font-size:17px;line-height:1.35;color:var(--color-paper)}
.sea-hall .rec{margin-top:8px;font-size:12.5px;line-height:1.6;color:var(--color-muted)}
.sea-hall .rec b{font-weight:400;color:rgba(243,249,250,.76)}
.sea-hall .st{margin-top:4px;font-size:12.5px;line-height:1.6}
.sea-hall .st.ok{color:var(--color-glass)}
.sea-hall .st.gap{color:var(--color-warm)}
.sea-hall .tm{margin-top:8px;font-size:11.5px;line-height:1.6;color:rgba(169,199,207,.72)}
.sea-hall .listen{display:inline-block;margin-top:10px;font-size:12.5px;color:var(--color-glass);text-decoration:underline;text-underline-offset:4px}

/* ── 稿：页脚 海床上 ── */
.sea-hall .foot{position:absolute;left:6.1111%;right:6.1111%;bottom:34px;display:flex;justify-content:space-between;align-items:center}
.sea-hall .tail{display:flex;align-items:center}
.sea-hall .tail .dot{display:inline-block;width:4px;height:4px;background:var(--color-coral);margin-right:9px}
.sea-hall .pages{display:flex;align-items:center;gap:20px}
.sea-hall .pages ol{list-style:none;display:flex;gap:8px}
.sea-hall .pages button{display:flex;align-items:center;justify-content:center;width:26px;height:22px;padding:0;border:1px solid rgba(243,249,250,.16);border-radius:2px;font-family:var(--font-latin);font-size:12px;color:rgba(243,249,250,.66);background:transparent;cursor:pointer;transition:transform var(--motion-hover-duration) var(--motion-entry-easing)}
/* t3 微交互：分页按钮 hover 缩放（feedback —— 可点目标有回应；参数只引 --motion-* token，
   只动 transform；reduced-motion 下由 motion.css 全局重置为瞬时状态变化） */
.sea-hall .pages button:hover{transform:scale(var(--motion-hover-scale))}
.sea-hall .pages button[aria-current='page']{position:relative;border-color:rgba(212,85,58,.62);background:rgba(212,85,58,.16);color:var(--color-paper)}

/* ── 稿：空态 潮位退到最低，水线上空着 ── */
.sea-hall .empty{position:absolute;left:6.1111%;top:452px}
.sea-hall .lowtide{position:relative;display:block;width:256px;height:14px}
.sea-hall .lowtide::before{content:'';position:absolute;left:0;top:6px;width:256px;height:1px;background:rgba(127,209,217,.34)}
.sea-hall .lowtide::after{content:'';position:absolute;left:0;top:0;width:1px;height:14px;background:rgba(127,209,217,.5)}
.sea-hall .lowtide i{position:absolute;top:3px;width:1px;height:8px;background:rgba(243,249,250,.18)}
.sea-hall .empty h2{margin-top:30px;font-size:19px;font-weight:700;color:var(--color-paper)}
.sea-hall .empty p{margin-top:10px;max-width:430px;font-size:14px;line-height:1.95;color:var(--color-muted)}
.sea-hall .empty a{display:inline-block;margin-top:16px;font-size:13.5px;color:var(--color-glass);text-decoration:underline;text-underline-offset:5px}

/* 稿没有骨架/错误帧（静态稿）：沿用设计系统三态，落位取内容位 top:452px
   （三态块由 zonegroup 包装渲染 ⇒ 选择器跟着走；含块仍是 main，坐标一像素不变） */
.sea-hall .zonegroup>[aria-busy='true']{position:absolute;left:6.1111%;right:6.1111%;top:452px}
.sea-hall .zonegroup>[role='alert']{position:absolute;left:6.1111%;right:6.1111%;top:452px;max-width:430px}
`;

export function SeaPage() {
  const [zone, setZone] = useState<Zone>('COMPLETED');

  return (
    <div className="sea-hall relative isolate md:h-[100dvh] md:overflow-hidden">
      <style>{SEA_HALL_CSS}</style>

      {/* 页级底图 + 水线 + 涟漪：稿的 .clip，位置照稿（main 之前、z-0、装饰 ⇒ 整块隐藏） */}
      <div className="clip" aria-hidden="true">
        <div className="sky" />
        <div className="beam" />
        <div className="platter" />
        <div className="glint" />
        <div className="shafts" />
        <div className="lit" />
        <div className="abyss" />
        <div className="seabed" />
        <div className="sed">
          <i style={{ left: '150px', top: '817px', width: '34px' }} />
          <i style={{ left: '330px', top: '811px', width: '22px' }} />
          <i style={{ left: '468px', top: '808px', width: '44px' }} />
          <i style={{ left: '742px', top: '806px', width: '26px' }} />
          <i style={{ left: '946px', top: '808px', width: '38px' }} />
          <i style={{ left: '1168px', top: '812px', width: '20px' }} />
          <i style={{ left: '1284px', top: '817px', width: '30px' }} />
        </div>
        <div className="bub">
          <i style={{ left: '250px', top: '712px', width: '3px', height: '3px' }} />
          <i style={{ left: '263px', top: '682px', width: '2px', height: '2px' }} />
          <i style={{ left: '433px', top: '626px', width: '2.5px', height: '2.5px' }} />
          <i style={{ left: '560px', top: '754px', width: '2px', height: '2px' }} />
          <i style={{ left: '700px', top: '766px', width: '3.5px', height: '3.5px' }} />
          <i style={{ left: '712px', top: '730px', width: '2px', height: '2px' }} />
          <i style={{ left: '894px', top: '640px', width: '2.5px', height: '2.5px' }} />
          <i style={{ left: '1090px', top: '698px', width: '2px', height: '2px' }} />
          <i style={{ left: '1104px', top: '664px', width: '3px', height: '3px' }} />
          <i style={{ left: '1218px', top: '734px', width: '2.5px', height: '2.5px' }} />
          <i style={{ left: '1058px', top: '610px', width: '2px', height: '2px' }} />
          <i style={{ left: '352px', top: '640px', width: '2px', height: '2px' }} />
          <i style={{ left: '1044px', top: '660px', width: '3px', height: '3px' }} />
          <i style={{ left: '1038px', top: '622px', width: '2px', height: '2px' }} />
          <i style={{ left: '1046px', top: '588px', width: '2.5px', height: '2.5px' }} />
          <i style={{ left: '404px', top: '566px', width: '2px', height: '2px' }} />
        </div>

        {/* 水面：一条从 -40 到 1480 的缓波（起伏 18px，瓶子的倾角由它推出）。
            流体翻译：width 1440px → 100% + preserveAspectRatio=none（x 随页面、y 不变） */}
        <svg
          className="surface"
          width="1440"
          height="900"
          viewBox="0 0 1440 900"
          fill="none"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient
              id="wl"
              x1="0"
              y1="0"
              x2="1440"
              y2="0"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor="rgb(228,247,252)" stopOpacity=".16" />
              <stop offset=".2" stopColor="rgb(203,238,246)" stopOpacity=".58" />
              <stop offset=".44" stopColor="rgb(228,247,252)" stopOpacity=".74" />
              <stop offset=".7" stopColor="rgb(203,238,246)" stopOpacity=".34" />
              <stop offset="1" stopColor="rgb(228,247,252)" stopOpacity=".11" />
            </linearGradient>
          </defs>
          <path
            d="M-40 360.33 L0 361.94 L40 363.72 L80 365.62 L120 367.53 L160 369.37 L200 371.05 L240 372.51 L280 373.68 L320 374.5 L360 374.93 L400 374.96 L440 374.59 L480 373.83 L520 372.71 L560 371.29 L600 369.63 L640 367.81 L680 365.9 L720 364 L760 362.19 L800 360.56 L840 359.16 L880 358.08 L920 357.36 L960 357.02 L1000 357.09 L1040 357.57 L1080 358.42 L1120 359.62 L1160 361.1 L1200 362.81 L1240 364.66 L1280 366.57 L1320 368.46 L1360 370.23 L1400 371.82 L1440 373.14 L1480 374.14"
            stroke="url(#wl)"
            strokeWidth="26"
            opacity=".09"
          />
          <path
            d="M300 374.66 L360 374.93 L400 374.96 L440 374.59 L480 373.83 L520 372.71 L560 371.29 L600 369.63 L640 367.81 L680 365.9 L720 364 L760 362.19 L800 360.56 L840 359.16 L880 358.08 L920 357.36 L960 357.02"
            stroke="url(#wl)"
            strokeWidth="30"
            opacity=".08"
          />
          {/* 水面碎光 */}
          <g stroke="rgb(228,247,252)" strokeWidth="1.4">
            <path d="M226 369.53 L268 370.86" opacity=".42" />
            <path d="M300 376.64 L338 377.24" opacity=".24" />
            <path d="M446 377 L486 376.18" opacity=".32" />
            <path d="M500 370.81 L540 369.53" opacity=".2" />
            <path d="M664 364.17 L706 362.16" opacity=".4" />
            <path d="M712 366.88 L748 365.22" opacity=".22" />
            <path d="M884 355.49 L918 354.88" opacity=".34" />
            <path d="M1086 361.08 L1128 362.4" opacity=".24" />
            <path d="M1150 358.21 L1192 359.96" opacity=".3" />
            <path d="M1310 370.5 L1344 372.04" opacity=".22" />
          </g>
          <path
            d="M-40 360.33 L0 361.94 L40 363.72 L80 365.62 L120 367.53 L160 369.37 L200 371.05 L240 372.51 L280 373.68 L320 374.5 L360 374.93 L400 374.96 L440 374.59 L480 373.83 L520 372.71 L560 371.29 L600 369.63 L640 367.81 L680 365.9 L720 364 L760 362.19 L800 360.56 L840 359.16 L880 358.08 L920 357.36 L960 357.02 L1000 357.09 L1040 357.57 L1080 358.42 L1120 359.62 L1160 361.1 L1200 362.81 L1240 364.66 L1280 366.57 L1320 368.46 L1360 370.23 L1400 371.82 L1440 373.14 L1480 374.14"
            stroke="url(#wl)"
            strokeWidth="1.1"
          />
        </svg>

        {/* 涟漪环：4 段弧（含 4 个缺口）= 4 个段位；远侧淡、近侧亮（水面的远近） */}
        <svg
          className="rings"
          width="1440"
          height="900"
          viewBox="0 0 1440 900"
          fill="none"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="rip" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgb(127,209,217)" stopOpacity=".3" />
              <stop offset=".52" stopColor="rgb(127,209,217)" stopOpacity=".62" />
              <stop offset="1" stopColor="rgb(127,209,217)" stopOpacity=".9" />
            </linearGradient>
            <linearGradient id="rip2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgb(127,209,217)" stopOpacity=".09" />
              <stop offset="1" stopColor="rgb(127,209,217)" stopOpacity=".3" />
            </linearGradient>
          </defs>
          {/* 外圈：水面被扰动后散开的那一圈（连续，不是刻度） */}
          <g
            stroke="url(#rip2)"
            strokeWidth="1"
            strokeDasharray="26 24 26 24"
            strokeDashoffset="-12"
          >
            <ellipse cx="183.3" cy="378.4" rx="106" ry="42" pathLength="100" />
            <ellipse cx="398" cy="383" rx="106" ry="42" pathLength="100" />
            <ellipse cx="612.7" cy="377.1" rx="106" ry="42" pathLength="100" />
            <ellipse cx="827.3" cy="367.6" rx="106" ry="42" pathLength="100" />
            <ellipse cx="1042" cy="365.6" rx="106" ry="42" pathLength="100" />
            <ellipse cx="1256.7" cy="373.5" rx="106" ry="42" pathLength="100" />
          </g>
          {/* 内圈：四段断弧（断 = 缺口 = 段位） */}
          <ellipse cx="183.3" cy="374.4" rx="76" ry="30" pathLength="100" stroke="url(#rip)" strokeWidth="1.5" strokeDasharray="18 7" />
          <ellipse cx="398" cy="379" rx="76" ry="30" pathLength="100" stroke="url(#rip)" strokeWidth="1.5" strokeDasharray="18 7" />
          <ellipse cx="612.7" cy="373.1" rx="76" ry="30" pathLength="100" stroke="url(#rip)" strokeWidth="1.5" strokeDasharray="18 7" />
          <ellipse cx="827.3" cy="363.6" rx="76" ry="30" pathLength="100" stroke="url(#rip)" strokeWidth="1.5" strokeDasharray="18 7" />
          <ellipse cx="1042" cy="361.6" rx="76" ry="30" pathLength="100" stroke="url(#rip)" strokeWidth="1.5" strokeDasharray="18 7" />
          <ellipse cx="1256.7" cy="369.5" rx="76" ry="30" pathLength="100" stroke="url(#rip)" strokeWidth="1.5" strokeDasharray="18 7" />
        </svg>
      </div>

      <main>
        {/* 稿块 1：两行 meta（t3：enter-fade 只淡入 —— 页级第一拍，guidance 起手） */}
        <div className="topbar enter-fade">
          <p className="meta">音乐漂流瓶 · MUSIC DRIFT</p>
          <p className="meta">CATALOGUE OF THE OPEN SEA</p>
        </div>

        {/* 稿块 2：海图分隔线 + 左端 coral 段（装饰 ⇒ aria-hidden） */}
        <div className="rule" aria-hidden="true">
          <i />
        </div>

        {/* 稿块 3：页头（t3：enter-rise 主角唯一 —— 页头是本页第一眼，先于分区落位） */}
        <header className="hero enter-rise">
          <h1>公海大厅</h1>
          <p className="lede">
            聆听那些经历漂流与合唱、完全绽放的终极乐章。作品一旦入海就不再漂流 —— 这里只能听，不能接。
          </p>
          {/* flow-audit G3/P1：常显横向出口 —— 挂在页头尾（数据区之外），两分区/空态/骨架/错都渲染 */}
          <nav aria-label="站内去路" className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link to="/river" className={TEXT_LINK_STRONG}>
              ← 回河道
            </Link>
          </nav>
        </header>

        {/* one-screen 锚点 sea-list（1440/375 两档判据都查它）：zones + 数据区的**共同祖先**，
            骨架/空/列表/错任何数据态都渲染；.zonegroup 是静态透传 div —— 不建立包含块，
            zones / fleet / 空态 / 三态块的绝对定位仍以 main 为含块，稿几何一像素不动 */}
        <div className="zonegroup" data-anchor="sea-list">
          {/* 稿块 4：分区（两个分区 = 两个水位；计数位算不出真数 ⇒ 留空）
              t3：stagger-1 错拍跟在页头之后（阅读序：meta → 页头 → 分区） */}
          <div className="zones enter-rise stagger-1">
            <p className="meta">分区 · SECTIONS</p>
            <ul role="tablist" aria-label="分区">
              <li
                role="tab"
                aria-selected={zone === 'COMPLETED'}
                tabIndex={0}
                onClick={() => {
                  setZone('COMPLETED');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setZone('COMPLETED');
                  }
                }}
              >
                完整作品<span className="mono n" />
              </li>
              <li
                role="tab"
                aria-selected={zone === 'INCOMPLETE'}
                tabIndex={0}
                onClick={() => {
                  setZone('INCOMPLETE');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setZone('INCOMPLETE');
                  }
                }}
              >
                等待接力<span className="mono n" />
              </li>
            </ul>
          </div>

          {/* 稿块 5/6：舰队 + 页脚（含三态；key=zone ⇒ 切分区回到第 1 页） */}
          <SeaZoneList key={zone} zone={zone} />
        </div>
      </main>
    </div>
  );
}

/**
 * 页码序列：≤7 页一次全显 1..N；>7 页折叠成紧凑形态 —— 两端 + 当前页 ±1，缺口用 `…` 占位
 * （当前页 1 ⇒ `1 2 … N-1 N`；当前页 9/10 ⇒ `1 2 … 8 9 10`）。省略号只是**占位符**，不是按钮。
 */
function foldPages(pageCount: number, current: number): (number | '…')[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_unused, offset) => offset + 1);
  }
  const wanted = new Set([1, 2, pageCount - 1, pageCount, current - 1, current, current + 1]);
  const numbers = [...wanted]
    .filter((number) => number >= 1 && number <= pageCount)
    .sort((left, right) => left - right);
  const slots: (number | '…')[] = [];
  let previous = 0;
  for (const number of numbers) {
    if (number - previous > 1) slots.push('…');
    slots.push(number);
    previous = number;
  }
  return slots;
}

/**
 * 稿的 `.fleet`（或 `.empty`）+ `footer.foot`：数据三态由 AsyncBoundary 统一。
 *
 * 页码一次全显：响应带 `total` 时 `pageCount = ceil(total / SEA_PAGE_SIZE)`，
 * 不再"先 1、2，点 2 才出 3"；缺 total（老响应）回退旧口径 = 已取页数 + hasNextPage。
 * 点第 N 页仍走**既有游标链**（`goToPage` 逐页 `fetchNextPage`），不自造 offset。
 */
function SeaZoneList({ zone }: { zone: Zone }) {
  const sea = useSeaPages(zone, SEA_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const fetchedPages = sea.data?.pages.length ?? 0;
  /** 服务端给的该 zone 总条数（每页同值）；缺省 = 没给，回退旧口径。 */
  const total = sea.data?.pages[0]?.total;
  const pageCount =
    total !== undefined
      ? Math.max(1, Math.ceil(total / SEA_PAGE_SIZE))
      : fetchedPages + (sea.hasNextPage ? 1 : 0);

  /** 去第 N 页：已取到的页用缓存；没取到的在点击里逐页推进游标（页数不涨就停）。 */
  const goToPage = (target: number): void => {
    if (target === page) return;
    if (target <= fetchedPages) {
      setPage(target);
      return;
    }
    void (async () => {
      let have = fetchedPages;
      while (have < target) {
        const result = await sea.fetchNextPage();
        const nextCount = result.data?.pages.length ?? have;
        if (nextCount <= have) break;
        have = nextCount;
      }
      setPage(Math.min(target, Math.max(have, 1)));
    })();
  };

  const current = sea.data?.pages[page - 1];
  const items = current?.items ?? [];
  const pageNumbers = foldPages(pageCount, page);

  /** 稿 `footer.foot`：tail（本页实数）+ .pages（PAGE / 页码 / 状态位）。 */
  const foot = (count: number) => (
    <footer className="foot enter-fade">
      <p className="meta tail">
        <span className="dot" aria-hidden="true" />
        {ZONE_LABEL[zone]} · 本页 <span className="mono">{String(count)}</span> 支
      </p>
      <nav className="pages" aria-label="分页">
        <span className="meta">PAGE</span>
        <ol>
          {pageNumbers.map((number, index) =>
            typeof number === 'number' ? (
              <li key={number}>
                <button
                  type="button"
                  aria-label={`第 ${String(number)} 页`}
                  aria-current={number === page ? 'page' : undefined}
                  onClick={() => {
                    goToPage(number);
                  }}
                >
                  {String(number)}
                </button>
              </li>
            ) : (
              <li key={`gap-${String(index)}`}>
                <span className="meta" aria-hidden="true">
                  …
                </span>
              </li>
            ),
          )}
        </ol>
        <span className="meta">
          {total !== undefined
            ? `第 ${String(page)} 页 · 共 ${String(pageCount)} 页`
            : sea.hasNextPage
              ? `第 ${String(page)} 页 · 后面还有更多`
              : `共 ${String(fetchedPages)} 页`}
        </span>
      </nav>
    </footer>
  );

  return (
    <AsyncBoundary
      query={{
        isPending: sea.isPending,
        isError: sea.isError,
        error: sea.error,
        data: sea.isPending ? undefined : items,
        refetch: sea.refetch,
      }}
      skeleton={
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          <Skeleton height="14rem" width="100%" />
          <Skeleton height="14rem" width="100%" />
          <Skeleton height="14rem" width="100%" />
        </div>
      }
      emptyWhen={(list) => list.length === 0}
      empty={
        <>
          <div className="empty">
            <span className="lowtide" aria-hidden="true">
              <i style={{ left: '64px' }} />
              <i style={{ left: '128px' }} />
              <i style={{ left: '192px' }} />
            </span>
            {zone === 'COMPLETED' ? (
              <>
                <h2>还没有完整的作品</h2>
                <p>完整作品要等每个段位都有人唱过之后，由持有者送进公海。</p>
              </>
            ) : (
              <>
                <h2>没有等待接力的作品</h2>
                <p>这里的作品都还差几个段位，等着有人补上——补完才会进完整作品区。</p>
              </>
            )}
            <Link to="/river" className={SEA_TEXT_LINK}>
              去河道捞一个
            </Link>
          </div>
          {foot(items.length)}
        </>
      }
    >
      {(list) => (
        <>
          <ul className="fleet">
            {list.map((bottle, index) => (
              <li
                key={bottle.id}
                className={`col${zone === 'INCOMPLETE' ? ' wait' : ''} enter-rise stagger-${String((index % 4) + 1)}`}
                style={colStyle(index)}
              >
                <span className="sounding" aria-hidden="true" />
                <span className="bottle" aria-hidden="true">
                  <span className="glass">
                    <span className="note">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="sub" />
                  </span>
                  <span className="cork" />
                </span>
                <SeaEntry bottle={bottle} />
              </li>
            ))}
          </ul>
          {foot(list.length)}
        </>
      )}
    </AsyncBoundary>
  );
}

/** 稿 `.entry`：曲名 → 进度 → 状态 → 时间 → 听（字段全部来自服务端 BottleSummary）。 */
function SeaEntry({ bottle }: { bottle: BottleSummary }) {
  const gap = gapNotice(bottle.missingSegmentIndexes);

  return (
    <div className="entry">
      <p className="song">{bottle.songTitle}</p>
      <p className="rec">
        已录 <b className="mono">{String(bottle.recordedCount)}</b> /{' '}
        <b className="mono">{String(bottle.totalSegments)}</b> 段
      </p>
      {gap === null ? (
        <p className="st ok">全部段位都有人唱过</p>
      ) : (
        <p className="st gap">{gap}（成品里这段时间是静音）</p>
      )}
      <p className="tm">
        最近更新 <span className="mono">{formatOccurredAt(bottle.updatedAt)}</span>
      </p>
      <Link to={buildPath('bottle', { id: bottle.id })} className={cn(SEA_TEXT_LINK, 'hover-lift')}>
        听这支作品
      </Link>
    </div>
  );
}
