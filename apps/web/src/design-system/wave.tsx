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
      className={cn('block h-6 w-full text-mist', className)}
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

/** 河道导引线：纵向接力路径的骨架（已完成段用 peacock，未完成段用 mist）。 */
export function RiverLine({ progress = 0, className }: DecorProps & { progress?: number }) {
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <svg aria-hidden="true" viewBox="0 0 8 120" className={cn('block h-full w-2', className)}>
      <line x1="4" y1="0" x2="4" y2="120" stroke="var(--color-mist)" strokeWidth="2" />
      <line
        x1="4"
        y1="0"
        x2="4"
        y2={120 * clamped}
        stroke="var(--color-peacock)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * 漂流瓶标记：唯一可被"追踪"的具象元素（瓶身 + 瓶塞 + 涟漪）。
 *
 * `tone` 是**真实需要**而不是预留：瓶子同时出现在浅底（`peacock`，5.13:1 on foam）
 * 与深水（`sea-glass`，7.00:1 on deep-current）两种底上。
 * 深底上用 `peacock` 只有 2.05:1 —— 那会让用户点名的母题变成一块看不出的污渍（实测发生过）。
 */
export function BottleMark({
  className,
  size = 48,
  tone = 'peacock',
}: DecorProps & { size?: number; tone?: 'peacock' | 'sea-glass' }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={cn(
        'pointer-events-none',
        tone === 'sea-glass' ? 'text-sea-glass' : 'text-peacock',
        className,
      )}
    >
      <ellipse cx="24" cy="41" rx="13" ry="3.2" fill="var(--color-lagoon)" opacity="0.28" />
      <path
        d="M18 8h12v6c0 2 5 5 5 11v14c0 3-2.4 5-5 5h-12c-2.6 0-5-2-5-5V25c0-6 5-9 5-11V8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <rect x="21" y="3" width="6" height="5" rx="1.5" fill="var(--color-coral)" />
      <path d="M17 30h14" stroke="var(--color-wave-white)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** 涟漪环：标记状态变化与落点；reduced-motion 下由 motion.css 关闭动画。 */
export function RippleRing({ className }: DecorProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'ripple-ring pointer-events-none absolute inset-0 rounded-full border border-lagoon/40',
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
