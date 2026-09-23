/**
 * JS 侧 token 镜像 —— 供需要**数值**的场景使用（Canvas 绘制水波、Web Audio 时间轴、
 * 交错延迟计算、spring 物理参数、无障碍降级判断）。
 *
 * 与 `theme.css` 同源：两边都由 `DESIGN.md` front matter 决定，
 * 一致性由 `__tests__/tokens.test.ts` 守卫（出现 DESIGN.md 之外的色值即红）。
 */

/** 色板（30 个 token，与 DESIGN.md front matter 逐条一致）。 */
export const colors = {
  // 水面（浅色基线）
  'wave-white': '#F3F9FA',
  foam: '#E4F0F2',
  'tide-pool': '#D7E8EC',
  mist: '#C2D9DF',
  driftline: '#648C99',
  // 深水（仅沉浸式区块，不是深色模式）
  'deep-current': '#0B3A4A',
  trench: '#123E52',
  'night-ink': '#061A22',
  // 品牌主色
  peacock: '#0F6D80',
  'peacock-deep': '#0B4E5B',
  'peacock-active': '#093E49',
  lagoon: '#2A9DB1',
  'sea-glass': '#7FD1D9',
  // 文字
  abyss: '#07202B',
  'slate-current': '#44646F',
  'on-dark-muted': '#A9C7CF',
  // 点缀与语义
  coral: '#C7452C',
  'coral-deep': '#9D4125',
  success: '#1F6B51',
  warning: '#875C12',
  info: '#0F6D80',
  danger: '#9D4125',
  // 语义 tint / border
  'success-tint': '#E7F2EE',
  'success-border': '#BFDCCF',
  'warning-tint': '#FAF1E0',
  'warning-border': '#E8D3A6',
  'danger-tint': '#FAEDE9',
  'danger-border': '#EBC3B6',
  'info-tint': '#E6F1F4',
  'info-border': '#BFDCE3',
} as const;

export type ColorToken = keyof typeof colors;

/** 语义色到「文字/图标 + tint 底 + 描边」的三件套（DESIGN.md §Semantic & Status Colors）。 */
export const semanticTones = {
  success: { text: colors.success, tint: colors['success-tint'], border: colors['success-border'] },
  warning: { text: colors.warning, tint: colors['warning-tint'], border: colors['warning-border'] },
  danger: {
    text: colors['coral-deep'],
    tint: colors['danger-tint'],
    border: colors['danger-border'],
  },
  info: { text: colors.peacock, tint: colors['info-tint'], border: colors['info-border'] },
} as const;

export type SemanticTone = keyof typeof semanticTones;

/** 链路 spring 物理参数（DESIGN.md §Elevation & Depth）。 */
export const spring = {
  stiffness: 120,
  damping: 20,
} as const;

/** 动效契约（与 theme.css 的 `--motion-*` 同值；drift guard 在 tokens.test.ts）。 */
export const motion = {
  entryShift: '16px',
  entryDuration: 480,
  entryEasing: 'ease-out',
  stagger: 100,
  hoverScale: 1.03,
  hoverDuration: 200,
  pageDuration: 300,
  shimmerDuration: 1400,
  rippleDuration: 2400,
  exitDuration: 240,
  reducedDuration: 150,
  animatedProperties: ['transform', 'opacity'],
} as const;

/**
 * 水域母题层契约（与 theme.css 的 `--motif-*` 同值）。
 * 装饰强度与纹理周期只在这里定义；样式层只能引用 `var(--motif-*)`。
 */
export const motif = {
  sheenAlphaDark: 0.1,
  sheenAlphaLight: 0.09,
  textureAlpha: 0.05,
  textureLineGap: '12px',
  tideLineAlpha: 0.55,
  // t44 增强
  textureLineGapAlt: '27px',
  textureFade: '22%',
  textureAlphaLight: 0.09,
  wakeDash: '7px',
  wakeGap: '11px',
  wakeAlpha: 0.45,
} as const;

/** 水流漂移契约（与 theme.css 的 --motion-drift-* 同值）。 */
export const drift = {
  duration: 24000,
  shift: '10px',
} as const;

/** z-index 契约。 */
export const zIndex = {
  base: 0,
  sticky: 100,
  overlay: 200,
  modal: 300,
  toast: 500,
} as const;

/** 圆角档位（基准 12px）。 */
export const radius = {
  none: 0,
  sm: 6,
  md: 8,
  base: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  pill: 999,
  full: '50%',
} as const;

/** 间距档位：8px 基准的全部派生值（只允许这些）。 */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
} as const;

/** 布局契约。 */
export const layout = {
  containerMaxWidth: 1280,
  containerPaddingInline: '1.5rem',
  sectionGap: 'clamp(4rem, 8vw, 8rem)',
  touchTargetMin: 44,
  collapseBreakpoint: 768,
  desktopPrimary: 1440,
  mobileFloor: 375,
} as const;

/** 交错延迟计算：第 index 项（从 0 起）的动画延迟，单位 ms。 */
export function staggerDelay(index: number): number {
  return index * motion.stagger;
}

/** 用户是否要求减少动效；SSR / 无 matchMedia 时按「不减少」处理。 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
