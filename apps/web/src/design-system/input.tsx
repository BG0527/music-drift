import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from './utils';
import { Icon } from './icon';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  /** 字段级错误：给出修正动作，不只说"输入有误"（DESIGN.md §Error States 第 1 条）。 */
  error?: string;
  hint?: string;
}

/**
 * record-v1 的输入框（DESIGN.md §Components）：label 在上；`water-void` 底（下沉一格）、
 * 1px `muted` 描边、`paper` 文字（18.20:1）、2px 圆角；focus ring 2px `coral` + offset 2px；
 * 错误态描边切 `coral`、说明用 `danger`（6.67:1）。**不用浮动 label**。
 */
export function Input({ label, error, hint, className, ...rest }: InputProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error !== undefined ? errorId : hint !== undefined ? hintId : undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[0.875rem] font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error !== undefined ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'min-h-11 rounded-md border bg-water-void px-3 text-paper',
          'placeholder:text-muted',
          'focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
          'focus-visible:outline-none',
          error === undefined ? 'border-muted' : 'border-coral',
          className,
        )}
        {...rest}
      />
      {error !== undefined ? (
        <p id={errorId} className="flex items-center gap-1 text-[0.8125rem] text-danger">
          <Icon name="AlertCircle" size={16} />
          {error}
        </p>
      ) : null}
      {error === undefined && hint !== undefined ? (
        <p id={hintId} className="text-[0.8125rem] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
