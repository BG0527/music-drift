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

export function Input({ label, error, hint, className, ...rest }: InputProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error !== undefined ? errorId : hint !== undefined ? hintId : undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[0.875rem] font-medium text-slate-current">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error !== undefined ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'min-h-11 rounded-md border bg-wave-white px-3 text-abyss',
          'placeholder:text-slate-current/70',
          'focus-visible:ring-2 focus-visible:ring-peacock focus-visible:ring-offset-2 focus-visible:ring-offset-wave-white',
          'focus-visible:outline-none',
          error === undefined ? 'border-driftline' : 'border-coral',
          className,
        )}
        {...rest}
      />
      {error !== undefined ? (
        <p id={errorId} className="flex items-center gap-1 text-[0.8125rem] text-coral-deep">
          <Icon name="AlertCircle" size={16} />
          {error}
        </p>
      ) : null}
      {error === undefined && hint !== undefined ? (
        <p id={hintId} className="text-[0.8125rem] text-slate-current">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
