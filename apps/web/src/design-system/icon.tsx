import type { ComponentProps } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  AudioWaveform,
  CheckCircle2,
  Circle,
  Clock,
  Flag,
  Info,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Ship,
  Square,
  ThumbsDown,
  UploadCloud,
  UserRound,
  Waves,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './utils';

/**
 * 图标统一走 Lucide（DESIGN.md Do&Don't：唯一图标来源，禁 emoji）。
 *
 * 这里用**显式注册表**而不是 `import * as lucide`：后者会把 Lucide 的全部 6000+ 图标
 * 打进产物（实测 JS 从 220KB 涨到 978KB）。显式导入保住 tree-shaking。
 * 新增图标 = 在这里加一行（保持"图标是设计系统资产"的约束，页面不得自行 import lucide）。
 */
const ICONS = {
  AlertCircle,
  AlertTriangle,
  AudioWaveform,
  CheckCircle2,
  Circle,
  Clock,
  Flag,
  Info,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Ship,
  Square,
  ThumbsDown,
  UploadCloud,
  UserRound,
  Waves,
  X,
} as const satisfies Record<string, LucideIcon>;

/** 可用图标名（PascalCase；运行时也接受首字母小写写法）。 */
export type IconName = keyof typeof ICONS;

/** 模块级静态表：登记 PascalCase 原名与首字母小写别名（`Waves` 与 `waves` 都可用）。 */
const REGISTRY: Record<string, LucideIcon> = {};
for (const [name, glyph] of Object.entries(ICONS) as Array<[string, LucideIcon]>) {
  REGISTRY[name] = glyph;
  const alias = `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
  if (REGISTRY[alias] === undefined) REGISTRY[alias] = glyph;
}

export interface IconProps extends Omit<ComponentProps<'svg'>, 'ref' | 'name'> {
  name: IconName;
  /** 边长（px）。UI 图标 16/18/20/24 四档。 */
  size?: 16 | 18 | 20 | 24 | 32 | 42;
  /** 提供后可访问名称；不提供则该图标视为装饰并对读屏隐藏。 */
  label?: string;
}

export function Icon({ name, size = 20, label, className, ...rest }: IconProps) {
  const Glyph = REGISTRY[name];
  if (Glyph === undefined) {
    throw new Error(
      `Lucide 图标不存在或未登记：${String(name)}（先加入 icon.tsx 的 ICONS 注册表；禁止 emoji 或自绘图标替代）`,
    );
  }
  return (
    <Glyph
      aria-hidden={label === undefined ? true : undefined}
      aria-label={label}
      role={label === undefined ? undefined : 'img'}
      size={size}
      strokeWidth={1.75}
      className={cn('shrink-0', className)}
      {...rest}
    />
  );
}
