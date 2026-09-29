import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './utils';

export type ButtonVariant = 'primary' | 'ghost';
/** 盘形：`plate` = 文本动作按钮（DESIGN.md §Components 的 token 绑定）/ `disc` = 圆盘（§Shapes 的圆的语法）。 */
export type ButtonShape = 'plate' | 'disc';
/** 边缘微光的冷暖：**只出现在盘缘那一圈 1px 上**（捞取 = cool / 投下 = warm）。 */
export type ButtonTone = 'cool' | 'warm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** 加载中：保持文字与宽度，右侧显示 shimmer 条（DESIGN.md 禁 spinner）。 */
  loading?: boolean;
  /** 可选前置图标（Lucide 组件实例，由调用方从 design-system 的 Icon 传入）。 */
  icon?: ReactNode;
  /**
   * 圆盘形态（record-v1 的"圆"）：深色盘身（不填彩色）+ 2~3 圈外环 + 冷/暖边缘微光。
   * 适合 1–2 字的动作（捞 / 投 / 听）与纯图标按钮；长文案用默认的 `plate`。
   */
  shape?: ButtonShape;
  tone?: ButtonTone;
  /** 外环圈数上限 3（圆的语法：13 / 29 / 45），默认 2。 */
  rings?: 2 | 3;
}

const base =
  'relative inline-flex items-center justify-center gap-2 rounded-base px-6 text-[0.9375rem] font-semibold ' +
  'min-h-11 transition-[transform,background-color] duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)] ' +
  'focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink ' +
  'disabled:cursor-not-allowed';

/**
 * 两档变体（token 绑定不变，值全部来自 record-v1 色板）。每种变体给**两种盘形**各一份，
 * 因为盘形决定文字压在什么底上：
 * - `primary`：**coral 实心填充 + ink 文字** —— `ink ↔ coral` 双向 4.76:1；
 *   纸白字压 coral 只有 3.83:1，所以这里**不许**改回 `text-paper`。
 * - `ghost`：plate 是"1px muted 细线 + coral 文字"（coral 压页面底 ink = 4.76:1）；
 *   圆盘的盘身是深水（≈ water-bed），coral 压上去只有 3.44:1 ⇒ 圆盘上一律用 `paper`（18.2:1）。
 */
const variants: Record<ButtonVariant, Record<ButtonShape, string>> = {
  primary: {
    plate: 'bg-coral text-ink hover:brightness-[1.06] hover-lift active:translate-y-[-1px]',
    // 主 CTA 的圆盘 = 一枚 coral 标签盘（盘身就是填充，其上 ink 字）
    disc: 'bg-coral text-ink hover:scale-[var(--motion-hover-scale)] active:translate-y-[-1px]',
  },
  ghost: {
    plate:
      'border border-muted bg-transparent text-coral ' +
      'hover:border-water-mid hover:scale-[var(--motion-hover-scale)] active:translate-y-[-1px]',
    disc: 'bg-transparent text-paper hover:scale-[var(--motion-hover-scale)] active:translate-y-[-1px]',
  },
};

/** 圆盘：比 plate 大一号（56px 起）—— 外环要 13 / 29px 的偏移才读得出"圈"。 */
const discBase = 'rounded-full px-7 min-h-14';

const disabledStyle = 'bg-water-void text-muted border-transparent shadow-none';

export function Button({
  variant = 'primary',
  loading = false,
  icon,
  shape = 'plate',
  tone = 'cool',
  rings = 2,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled === true || loading;
  const isDisc = shape === 'disc';
  const ringCount = rings === 3 ? 3 : 2;
  return (
    <button
      type={rest.type ?? 'button'}
      className={cn(
        base,
        isDisc && discBase,
        isDisabled ? disabledStyle : variants[variant][isDisc ? 'disc' : 'plate'],
        className,
      )}
      disabled={isDisabled}
      aria-busy={loading ? true : undefined}
      {...rest}
    >
      {isDisc ? (
        <>
          {/* 盘身：主 CTA 用自己的 coral 填充（其上 ink 字），其余用深水盘身（不填彩色） */}
          {variant === 'primary' && !isDisabled ? null : (
            <span aria-hidden="true" className="disc-core absolute inset-0 rounded-full" />
          )}
          {/* 盘缘微光：冷（捞取）/ 暖（投下）—— 盘身上唯一的一抹彩色 */}
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-0 rounded-full',
              tone === 'warm' ? 'disc-edge-warm' : 'disc-edge-cool',
            )}
          />
          {/* 外环：最多 3 圈，强度逐圈 × ringFalloff */}
          <span aria-hidden="true" className="disc-ring absolute" />
          <span aria-hidden="true" className="disc-ring disc-ring-2 absolute" />
          {ringCount === 3 ? (
            <span aria-hidden="true" className="disc-ring disc-ring-3 absolute" />
          ) : null}
        </>
      ) : null}
      {icon === undefined ? null : <span className="relative">{icon}</span>}
      <span className="relative">{children}</span>
      {loading ? (
        // 加载指示必须是 shimmer 条，不是 spinner；同时保持宽度不跳变
        <span
          data-testid="shimmer"
          aria-hidden="true"
          className="skeleton-shimmer relative h-2 w-[56px] rounded-pill bg-water-void"
        />
      ) : null}
    </button>
  );
}
