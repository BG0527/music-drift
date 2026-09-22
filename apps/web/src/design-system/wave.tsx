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

/** 漂流瓶标记：唯一可被"追踪"的具象元素（瓶身 + 瓶塞 + 涟漪）。 */
export function BottleMark({ className, size = 48 }: DecorProps & { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={cn('text-peacock', className)}
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
      <path d="M17 30h14" stroke="var(--color-sea-glass)" strokeWidth="2" strokeLinecap="round" />
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
