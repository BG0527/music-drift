/**
 * Ocean Drift 设计系统 —— 唯一实现源是 `DESIGN.md`（**不是 Figma**）。
 *
 * Figma 侧实测 0 组件 / 0 组件集 / 0 已发布样式（`docs/figma/components.json`、`styles.json`），
 * 且用户已裁决「Figma 仅作 IA / 文案参考，视觉一律以 DESIGN.md 为准」。
 * 因此这里不存在"对齐 Figma 组件"的说法：所有形态来自 DESIGN.md §Components。
 */
export { Button, type ButtonProps, type ButtonVariant } from './button';
export { Card, type CardProps } from './card';
export { Input, type InputProps } from './input';
export { Skeleton, type SkeletonProps } from './skeleton';
export { TapRippleLayer, useTapRipple } from './tap-ripple';
export { hapticConfirm, hapticTap, type HapticPattern } from './haptics';
export { EmptyState, type EmptyStateProps } from './empty-state';
export { Toast, type ToastProps } from './toast';
export { Modal, type ModalProps } from './modal';
export { Tabs, type TabItem, type TabsProps } from './tabs';
export { SidebarNav, BottomNav, type NavItem, type NavProps } from './nav';
export {
  WaveDivider,
  RiverLine,
  BottleMark,
  RippleRing,
  WaterSheen,
  WaterTexture,
  WakeLine,
  TideLine,
  SurfaceLine,
  LightShafts,
  CurrentLines,
  DriftingBottle,
  // record-v1 装置（S2）：盘面 / 掠光 / 沟槽=河道 / 水线 / 涟漪
  Platter,
  Glint,
  Groove,
  Waterline,
  Ripple,
  type DecorProps,
} from './wave';
// t6：捞起/抛下分镜的漂流瓶本体（重绘件；纯静态物件，动效由宿主 CSS 承担）
export { BottleVessel, type BottleVesselProps } from './bottle-vessel';
export { Icon, type IconName, type IconProps } from './icon';
export { cn } from './utils';
export * from './tokens';
