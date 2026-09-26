/**
 * JS 侧 token 镜像 —— 供需要**数值**的场景使用（Canvas 绘制水波、Web Audio 时间轴、
 * 交错延迟计算、spring 物理参数、无障碍降级判断）。
 *
 * 与 `theme.css` 同源：两边都由 `DESIGN.md` front matter 决定，
 * 一致性由 `__tests__/tokens.test.ts` 守卫（出现 DESIGN.md 之外的色值即红）。
 *
 * record-v1（2026-09-23 裁决）：页面底 = `ink`（近黑），唯一强调色 = `coral`，
 * 圆角基准 = 2px。旧名保留为过渡别名并 re-point 到新值，S8 删除。
 */

/** 色板（43 个 token，与 DESIGN.md front matter 逐条一致）。 */
export const colors = {
  // 基底与文字
  ink: '#050F14',
  paper: '#F3F9FA',
  muted: '#A9C7CF',
  // 三种光：冷光 / 唯一强调色 / 暖光
  glass: '#7FD1D9',
  coral: '#D4553A',
  warm: '#F6D79A',
  // 水光冷色族（基色 + alpha 派生）
  'water-light': '#EAFCFF',
  'water-mid': '#CBEEF6',
  'water-deep': '#E4F7FC',
  'water-void': '#031117',
  'water-bed': '#0A303C',
  'water-body': '#12414F',
  'water-surface': '#1D5F70',
  line: '#D8F3F6',
  // 语义四件套（深底重算；色相取自本语言，不引入新色相）
  success: '#7FD1D9',
  warning: '#F6D79A',
  danger: '#DC7E6A',
  info: '#A9C7CF',
  'success-tint': '#14262C',
  'success-border': '#427077',
  'warning-tint': '#222724',
  'warning-border': '#716950',
  'danger-tint': '#1E1719',
  'danger-border': '#AB4732',
  'info-tint': '#19252A',
  'info-border': '#576B72',
  // 过渡别名（迁移期专用；S8 整批删除）
  'wave-white': '#050F14',
  foam: '#EAFCFF',
  'tide-pool': '#031117',
  mist: '#D8F3F6',
  driftline: '#CBEEF6',
  'deep-current': '#12414F',
  trench: '#0A303C',
  'night-ink': '#031117',
  peacock: '#D4553A',
  'peacock-deep': '#1D5F70',
  'peacock-active': '#D4553A',
  lagoon: '#CBEEF6',
  'sea-glass': '#7FD1D9',
  abyss: '#F3F9FA',
  'slate-current': '#A9C7CF',
  'on-dark-muted': '#A9C7CF',
  'coral-deep': '#D4553A',
} as const;

export type ColorToken = keyof typeof colors;

/**
 * 语义色到「文字/图标 + tint 底 + 描边」的三件套（DESIGN.md §Semantic & Status Colors）。
 * tint = 语义色 12% 覆盖在 ink 上；border = 语义色 α 覆盖在 ink 上（取到 ≥3:1）。
 */
export const semanticTones = {
  success: { text: colors.success, tint: colors['success-tint'], border: colors['success-border'] },
  warning: { text: colors.warning, tint: colors['warning-tint'], border: colors['warning-border'] },
  danger: { text: colors.danger, tint: colors['danger-tint'], border: colors['danger-border'] },
  info: { text: colors.info, tint: colors['info-tint'], border: colors['info-border'] },
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

/** 圆角档位（基准 2px · record-v1：圆角 ≤4px，pill / full / 半圆除外）。 */
export const radius = {
  none: 0,
  sm: 1,
  md: 2,
  base: 2,
  lg: 4,
  xl: 4,
  '2xl': 6,
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
