import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from './utils';
import { Icon } from './icon';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Modal（去向三选一）：遮罩 z-overlay / 内容 z-modal；
 * Esc 关闭、打开时把焦点移入、关闭后归还焦点。
 */
export function Modal({ open, title, onClose, children, footer, className }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement;
    dialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const opener = openerRef.current;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="enter-fade fixed inset-0 flex items-center justify-center p-6">
      <div
        className="z-overlay absolute inset-0 bg-night-ink/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'z-modal enter-rise relative w-full max-w-[47.5rem] rounded-2xl border border-mist bg-foam p-8 shadow-floating',
          className,
        )}
      >
        <header className="mb-6 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-[1.375rem] font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-base text-slate-current hover:text-abyss focus-visible:ring-2 focus-visible:ring-peacock focus-visible:ring-offset-2"
          >
            <Icon name="X" size={20} />
          </button>
        </header>
        <div className="flex flex-col gap-6">{children}</div>
        {footer === undefined ? null : (
          <footer className="mt-6 flex items-center gap-4">{footer}</footer>
        )}
      </div>
    </div>
  );
}
