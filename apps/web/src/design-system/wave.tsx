import { useId } from 'react';
import { cn } from './utils';

/**
 * 水波 / 河道母题的克制装饰层（DESIGN.md §Elevation & Depth / Do&Don't）。
 * 全部为内联 SVG、`aria-hidden`、不参与布局高度计算；颜色取自 CSS 变量（不写死 hex）。
 */
export interface DecorProps {
  className?: string;
}

/** 区块边界的水波：宽度撑满、高度固定 24px，只做视觉分隔。 */
export function WaveDivider({ className }: DecorProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1200 24"
      preserveAspectRatio="none"
      className={cn('block h-6 w-full text-line', className)}
    >
      <path
        d="M0 14 C 100 2, 200 26, 300 14 S 500 2, 600 14 S 800 26, 900 14 S 1100 2, 1200 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M0 20 C 120 10, 240 30, 360 20 S 600 10, 720 20 S 960 30, 1080 20 S 1200 14, 1200 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.6"
      />
    </svg>
  );
}

/** 河道导引线：纵向接力路径的骨架（已完成段用 coral，未完成段用 line）。 */
export function RiverLine({ progress = 0, className }: DecorProps & { progress?: number }) {
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <svg aria-hidden="true" viewBox="0 0 8 120" className={cn('block h-full w-2', className)}>
      <line x1="4" y1="0" x2="4" y2="120" stroke="var(--color-line)" strokeWidth="2" />
      <line
        x1="4"
        y1="0"
        x2="4"
        y2={120 * clamped}
        stroke="var(--color-coral)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * 漂流瓶记号（record-v1 的 `bottleMark`）——唯一可被"追踪"的具象元素。
 *
 * **它承担信息**（DESIGN.md §Elevation & Depth：装置必须编码某件事实）：
 * `filled` = **已录段数**（0–4）。水位按 `filled / 4` 映射 ⇒ 干瓶一眼就是"还没有人唱"，
 * 半瓶是"缺第 3 段"，满瓶是"四段齐了"。段位不进文字、也不靠颜色区分，只靠水位。
 *
 * `tone` 沿用两个旧名（过渡期 API 稳定，值已 re-point）：`peacock` → coral、`sea-glass` → glass。
 * 深底上用 coral 是 4.76:1、用 glass 是 11.08:1 —— 都 ≥3:1（非文本图形下限），
 * 所以瓶身轮廓在两个 tone 下都不会糊成一块污渍（旧契约曾在这里踩过 2.05:1）。
 */
export function BottleMark({
  className,
  size = 48,
  tone = 'peacock',
  filled = 4,
}: DecorProps & { size?: number; tone?: 'peacock' | 'sea-glass'; filled?: number }) {
  const level = Math.min(4, Math.max(0, Math.round(filled)));
  const clipId = `bottle-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const waterHeight = (level / 4) * 18;
  return (
    <svg
      aria-hidden="true"
      data-filled={level}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={cn('pointer-events-none', tone === 'sea-glass' ? 'text-glass' : 'text-coral', className)}
    >
      <defs>
        <clipPath id={clipId}>
          <path d="M18 14h12c0 2 5 5 5 11v14c0 3-2.4 5-5 5H18c-2.6 0-5-2-5-5V25c0-6 5-9 5-11Z" />
        </clipPath>
      </defs>
      {/* 落点的涟漪（事件涟漪的最小形态：标记"曾经落在水面上"） */}
      <ellipse cx="24" cy="42" rx="13" ry="3" fill="var(--color-water-mid)" opacity="0.28" />
      <g clipPath={`url(#${clipId})`}>
        {/* 水位 = 已录段数（0 段 = 干瓶） */}
        <rect
          data-water=""
          x="12"
          y={44 - waterHeight}
          width="24"
          height={waterHeight}
          fill="var(--color-glass)"
          opacity="0.5"
        />
        {/* 瓶里卷着的那道声波（纸条） */}
        <path
          d="M13 33 C 17 30, 19 36, 23 33 S 29 30, 33 33 S 39 36, 43 33"
          fill="none"
          stroke="var(--color-water-light)"
          strokeWidth="1.2"
          opacity="0.7"
        />
      </g>
      <path
        d="M18 8h12v6c0 2 5 5 5 11v14c0 3-2.4 5-5 5H18c-2.6 0-5-2-5-5V25c0-6 5-9 5-11V8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* 木塞：coral = 被记下的那一下（与印章/当前项同色族） */}
      <rect x="21" y="3" width="6" height="5" rx="1" fill="var(--color-coral)" />
    </svg>
  );
}

/** 涟漪环：标记状态变化与落点；reduced-motion 下由 motion.css 关闭动画。 */
export function RippleRing({ className }: DecorProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'ripple-ring pointer-events-none absolute inset-0 rounded-full border border-water-mid/40',
        className,
      )}
    />
  );
}

/* ── 水域母题层（t43）：三个**零布局高度**的装饰层。契约在 DESIGN.md 的 `motif:` 块，
      样式在 water.css。三者一律 `aria-hidden` + `pointer-events-none` + 绝对定位：
      既不会被读屏念出来、也不挡点击，更不会推高页面（"一屏装下"是硬门）。
      宿主元素需要 `relative`（定位基准）+ `isolate`（否则负 z-index 会落到宿主背景之下而看不见）。 */

/**
 * 水面光带：深水暗底顶部的一层极淡渐变，暗示"从水面往下看"。
 * 用在**深底**（强度 `sheenAlphaDark`）；浅底必须显式传 `tone="light"`（更淡，避免压住正文）。
 */
export function WaterSheen({ className, tone = 'dark' }: DecorProps & { tone?: 'dark' | 'light' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'water-sheen pointer-events-none absolute inset-0 z-underlay',
        tone === 'light' && 'water-sheen-light',
        className,
      )}
    />
  );
}

/**
 * 水位线肌理：双线距干涉纹（12/27px，108px 才重复）+ 左右渐隐 mask，让大块底色不再像空白模板、
 * 也不像账本格线。**深底用默认值；浅底必须传 `tone="light"`**（强度更低，正文对比度优先）。
 */
export function WaterTexture({
  className,
  tone = 'dark',
  drift = false,
}: DecorProps & { tone?: 'dark' | 'light'; drift?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 z-underlay',
        tone === 'light' ? 'water-texture-light' : 'water-texture',
        // 缓缓流动（t46）：只动 transform、参数取 motion 契约、reduced-motion 下由全局重置冻住
        drift && 'water-drift',
        className,
      )}
    />
  );
}

/** 航迹虚线：漂流瓶划过水面留下的断续水痕（与潮线的实线渐隐区分），1px 高、零布局高度。 */
export function WakeLine({ className }: DecorProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('wake-line pointer-events-none absolute inset-x-0 z-underlay', className)}
    />
  );
}

/** 潮线：贴宿主下沿的一根渐隐细线（sea-glass → 透明），替代硬分隔且**不占高度**。 */
export function TideLine({ className }: DecorProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'tide-line pointer-events-none absolute inset-x-0 bottom-0 z-underlay',
        className,
      )}
    />
  );
}

/* ── 河道剖面（本轮）：水线 / 光柱 / 主流 / 漂过的瓶 ─────────────────────────────
   为什么新增这四个：用户本轮指令是「必须高级符合人类审美地好看，因为这是参赛作品」。
   河道页原来的组织方式是**两张同规格的深色卡片**，读起来是两个并列功能；
   剖面把它改成**同一条河上的两个位置**（下游接住 / 上游放下），
   并把「音乐」与「水」画成同一条曲线（主流 = 声波包络）。
   构图与逐条反默认自检：`docs/ui-review/design-plan-river.md`；契约：`DESIGN.md` 的 `## Composition`。
   四个构件与上面几件同一纪律：`aria-hidden` + `pointer-events-none` + 绝对定位（零布局高度）。 */

/** 水线：岸与水体的分界，全页**唯一**一条横向实线。宿主负责给位置（`inset-x-0` + 一个 top/bottom）。 */
export function SurfaceLine({ className }: DecorProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('surface-line pointer-events-none absolute inset-x-0 z-underlay', className)}
    />
  );
}

/** 水下光柱：只在水体里出现；「越深越淡」由 CSS 的 mask 负责（强度取 `lightShaftAlpha`）。 */
export function LightShafts({ className }: DecorProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('water-lights pointer-events-none absolute inset-0 z-underlay', className)}
    />
  );
}

/**
 * 河道主流：**声波包络形状**的曲线（音乐母题），位置在水里（河道母题），并编码**流向**。
 * 形状写死在内联 SVG 里、颜色取 `var(--color-*)`、强度取 `.river-current`（`currentLineAlpha`）。
 */
export function CurrentLines({ className }: DecorProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('river-current pointer-events-none absolute inset-x-0 z-underlay', className)}
    >
      <svg viewBox="0 0 1200 96" preserveAspectRatio="none" className="block h-full w-full">
        {/* 主声波：两端收窄、中段最大 —— 读起来是"一段正在播放的声音"，不是一条装饰波浪 */}
        <path
          d="M0 48 C 40 48, 60 44, 100 43 C 140 42, 160 52, 200 56 C 240 60, 260 34, 300 30 C 340 26, 360 66, 400 70 C 440 74, 460 22, 500 18 C 540 14, 560 78, 600 80 C 640 82, 660 18, 700 20 C 740 22, 760 72, 800 68 C 840 64, 860 30, 900 32 C 940 34, 960 60, 1000 58 C 1040 56, 1060 44, 1100 45 C 1140 46, 1170 48, 1200 48"
          fill="none"
          stroke="var(--color-sea-glass)"
          strokeWidth="2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* 两条更淡、波长更长的水流线：让"声波"底下仍然是"水" */}
        <path
          d="M0 62 C 150 54, 300 70, 450 62 S 750 54, 900 62 S 1150 70, 1200 62"
          fill="none"
          stroke="var(--color-lagoon)"
          strokeWidth="1.5"
          strokeOpacity="0.55"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M0 34 C 150 42, 300 26, 450 34 S 750 42, 900 34 S 1150 26, 1200 34"
          fill="none"
          stroke="var(--color-lagoon)"
          strokeWidth="1.5"
          strokeOpacity="0.35"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}

/**
 * 沿主流漂过河道的漂流瓶 —— 全站**唯一**一个会"走完一段路"的装饰，因为这一页就是河道。
 *
 * 结构是**两层**：外层只负责定位（`className` 由页面给），内层才是被动画的位移载体。
 * 上一版把两者合成一层，结果 `passage-drift` 的 ±`passageShift` 直接叠加在 `left` 上 ⇒
 * 瓶子有一半行程漂到容器外面，**静帧里根本看不见**（等于用户点名的母题没落地）。
 * 动效参数取契约 token，只动 `transform`，由 CSS 动画实现 ⇒ 被 `motion.css` 的全局
 * reduced-motion 重置冻结。
 */
export function DriftingBottle({ className, size = 34 }: DecorProps & { size?: number }) {
  return (
    <span aria-hidden="true" className={cn('pointer-events-none absolute z-underlay', className)}>
      <span className="passage-drift block">
        <BottleMark size={size} tone="sea-glass" />
      </span>
    </span>
  );
}

/* ── record-v1 装置层（S2）───────────────────────────────────────────────────────
   语言契约：`DESIGN.md §Elevation & Depth · 母题装置库`（platter / glint / groove /
   waterline / ripple / bottleMark —— bottleMark 见上面的 `BottleMark`）。
   五个新构件与上面九件**同一纪律**：`aria-hidden` + `pointer-events-none` + 绝对定位
   （零布局高度 ⇒ 不可能破坏"一屏装下"），颜色取 `var(--color-*)`、强度取 `var(--motif-*)`。
   宿主仍需 `relative` + `isolate`（否则 z-underlay 会落到宿主背景之下而看不见）。 */

/**
 * 盘面（platter）：**世界的底** —— 同心沟槽 + 径向内层（`repeating-radial-gradient`）。
 * 「唱片落在水里」的那张唱片是背景层，不是主角：它只提供"这是一张盘"的质感与深度。
 */
export function Platter({ className }: DecorProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('platter pointer-events-none absolute inset-0 z-underlay', className)}
    />
  );
}

/**
 * 掠光（glint）：世界的"上方"、瓶子来的方向（101° 斜向、混合模式 screen）。
 * 它同时是**光从哪来**的说明 —— 盘面的高光、水面的反光都与它同向。
 */
export function Glint({ className }: DecorProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('glint pointer-events-none absolute inset-0 z-underlay', className)}
    />
  );
}

/**
 * 沟槽 = 河道（groove）：**被点亮的沟槽就是已录段位**。
 * `progress ∈ [0,1]` 直接映射到点亮长度（越界输入被夹住，不许撑破容器）；
 * `tone` 区分两岸：`cool`（捞取一侧，glass）/ `warm`（投下一侧，warm）。
 * 宿主给它高度与位置（例如 `inset-x-0 top-[220px] h-[9px]`）。
 */
export function Groove({
  progress = 0,
  tone = 'cool',
  className,
}: DecorProps & { progress?: number; tone?: 'cool' | 'warm' }) {
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-x-0 z-underlay h-[9px]',
        className,
      )}
    >
      <span className="groove-bed absolute inset-0" />
      <span
        className={cn(
          'groove-lit absolute inset-y-px left-0',
          tone === 'warm' && 'groove-lit-warm',
        )}
        style={{ width: `${clamped * 100}%` }}
      />
    </span>
  );
}

/**
 * 水线（waterline）：**分界**。岸/水、线上（别人看得到）/线下（只有你知道）、
 * 浮上来（待处理）/沉下去（历史裁决）—— 全站所有"切开"都用它，因此全页只允许一条。
 */
export function Waterline({ className }: DecorProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('waterline pointer-events-none absolute inset-x-0 z-underlay', className)}
    />
  );
}

/**
 * 涟漪（ripple）：**刚刚发生过的事**（落下 / 捞起 / 入海）。同心扁椭圆，断弧编码缺口
 * （`gaps` = 断口数，0 = 闭合环）。它是常驻的场景涟漪时**不承载信息**（`aria-hidden`）；
 * 作为事件涟漪时由使用方只播一次、并同时给出文案（动效不得是唯一反馈）。
 */
export function Ripple({ className, gaps = 1 }: DecorProps & { gaps?: number }) {
  const breaks = Math.max(0, Math.round(gaps));
  return (
    <span
      aria-hidden="true"
      className={cn('ripple pointer-events-none absolute z-underlay', className)}
    >
      <svg viewBox="0 0 120 40" preserveAspectRatio="none" className="block h-full w-full">
        <ellipse
          cx="60"
          cy="20"
          rx="56"
          ry="17"
          fill="none"
          stroke="var(--color-water-mid)"
          strokeWidth="1"
        />
        <ellipse
          cx="60"
          cy="20"
          rx="38"
          ry="11"
          fill="none"
          stroke="var(--color-water-mid)"
          strokeWidth="1"
          opacity="0.7"
        />
        {/* 内圈：断弧 = 缺口（0 = 闭合，说明四段都有人唱过） */}
        <ellipse
          cx="60"
          cy="20"
          rx="20"
          ry="6"
          fill="none"
          stroke="var(--color-glass)"
          strokeWidth="1.4"
          strokeDasharray={breaks === 0 ? undefined : `${String(26 - breaks * 2)} ${String(4 + breaks * 2)}`}
        />
      </svg>
    </span>
  );
}
