import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './utils';
import { Icon } from './icon';
import { motion } from './tokens';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** 上传等不可中断操作进行时，锁住所有用户关闭入口。 */
  dismissible?: boolean;
  /** 退场动画完成且 portal 已进入卸载提交时通知宿主。 */
  onExited?: () => void;
}

/**
 * Modal（去向三选一）：遮罩 z-overlay / 内容 z-modal；
 * Esc 关闭、打开时把焦点移入、关闭后归还焦点。
 *
 * record-v1 的浮层语态（DESIGN.md §Elevation 深度层级）：L3 遮罩 = `rgba(water-void,.78)` + blur；
 * L2 面板 = `ink` + 1px 细线 + 阴影 —— **阴影只允许出现在浮层与浮动条上**（卡片一律不用）。
 */
export function Modal({
  open,
  title,
  onClose,
  onExited,
  children,
  footer,
  className,
  dismissible = true,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const portalRootRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  const onExitedRef = useRef(onExited);
  const [present, setPresent] = useState(open);

  useEffect(() => {
    onExitedRef.current = onExited;
  }, [onExited]);

  useEffect(() => {
    if (open) {
      setPresent(true);
      return undefined;
    }
    if (!present) return undefined;
    const timer = window.setTimeout(() => {
      setPresent(false);
      onExitedRef.current?.();
    }, motion.exitDuration);
    return () => {
      window.clearTimeout(timer);
    };
  }, [open, present]);

  useEffect(() => {
    if (!present) return undefined;
    openerRef.current = document.activeElement;
    dialogRef.current?.focus();

    const background = [...document.body.children]
      .filter((element) => element !== portalRootRef.current)
      .map((element) => ({
        element: element as HTMLElement,
        ariaHidden: element.getAttribute('aria-hidden'),
        inert: element.hasAttribute('inert'),
      }));
    for (const item of background) {
      item.element.setAttribute('inert', '');
      item.element.setAttribute('aria-hidden', 'true');
    }

    const blockBackgroundInteraction = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof Node) || portalRootRef.current?.contains(target) === true) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener('click', blockBackgroundInteraction, true);
    document.addEventListener('pointerdown', blockBackgroundInteraction, true);

    return () => {
      document.removeEventListener('click', blockBackgroundInteraction, true);
      document.removeEventListener('pointerdown', blockBackgroundInteraction, true);
      for (const item of background) {
        if (!item.inert) item.element.removeAttribute('inert');
        if (item.ariaHidden === null) item.element.removeAttribute('aria-hidden');
        else item.element.setAttribute('aria-hidden', item.ariaHidden);
      }
      const opener = openerRef.current;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [present]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (dismissible) onClose();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), audio[controls], video[controls], [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable === undefined || focusable.length === 0) {
          event.preventDefault();
          dialogRef.current?.focus();
          return;
        }
        const items = [...focusable];
        const activeIndex = items.findIndex((item) => item === document.activeElement);
        const nextIndex =
          activeIndex < 0
            ? event.shiftKey
              ? items.length - 1
              : 0
            : (activeIndex + (event.shiftKey ? -1 : 1) + items.length) % items.length;
        event.preventDefault();
        items[nextIndex]?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [dismissible, open, onClose]);

  if (!present) return null;

  return createPortal(
    <div
      ref={portalRootRef}
      data-modal-root
      aria-hidden={open ? undefined : 'true'}
      inert={open ? undefined : true}
      className={cn(
        'fixed inset-0 flex items-center justify-center p-6',
        open ? 'enter-fade' : 'exit-fade',
      )}
    >
      <div
        data-modal-backdrop
        className="z-overlay absolute inset-0 bg-water-void/78 backdrop-blur-[2px]"
        onClick={() => {
          if (open && dismissible) onClose();
        }}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'z-modal enter-rise relative max-h-[calc(100dvh-3rem)] w-full max-w-[47.5rem] overflow-y-auto rounded-2xl border border-hairline bg-ink p-8 shadow-floating',
          className,
        )}
      >
        <header className="mb-6 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-[1.375rem] font-semibold text-paper">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissible}
            aria-label="关闭"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-base text-muted hover:text-paper focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          >
            <Icon name="X" size={20} />
          </button>
        </header>
        <div className="flex flex-col gap-6">{children}</div>
        {footer === undefined ? null : (
          <footer className="mt-6 flex items-center gap-4">{footer}</footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
