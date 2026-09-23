import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './utils';

export type ButtonVariant = 'primary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** 加载中：保持文字与宽度，右侧显示 shimmer 条（DESIGN.md 禁 spinner）。 */
  loading?: boolean;
  /** 可选前置图标（Lucide 组件实例，由调用方从 design-system 的 Icon 传入）。 */
  icon?: ReactNode;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-base px-6 text-[0.9375rem] font-semibold ' +
  'min-h-11 transition-[transform,box-shadow,background-color] duration-200 ease-out ' +
  'focus-visible:ring-2 focus-visible:ring-peacock focus-visible:ring-offset-2 focus-visible:ring-offset-wave-white ' +
  'disabled:cursor-not-allowed';

const variants: Record<ButtonVariant, string> = {
  // 主按钮：peacock 底 + wave-white 字；hover 8% darken 等效色 + 微升；active -1px
  primary:
    'bg-peacock text-wave-white hover:bg-peacock-deep active:bg-peacock-active ' +
    'hover:scale-[1.03] hover:shadow-lift active:translate-y-[-1px]',
  // 幽灵按钮：1.5px 描边 + primary 文字色，hover 浅填充
  ghost:
    'border-[1.5px] border-driftline bg-transparent text-peacock ' +
    'hover:bg-info-tint hover:scale-[1.03] active:translate-y-[-1px]',
};

const disabledStyle = 'bg-tide-pool text-slate-current border-transparent shadow-none';

export function Button({
  variant = 'primary',
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled === true || loading;
  return (
    <button
      type={rest.type ?? 'button'}
      className={cn(base, isDisabled ? disabledStyle : variants[variant], className)}
      disabled={isDisabled}
      aria-busy={loading ? true : undefined}
      {...rest}
    >
      {icon}
      <span>{children}</span>
      {loading ? (
        // 加载指示必须是 shimmer 条，不是 spinner；同时保持宽度不跳变
        <span
          data-testid="shimmer"
          aria-hidden="true"
          className="skeleton-shimmer h-2 w-[56px] rounded-pill bg-tide-pool"
        />
      ) : null}
    </button>
  );
}
