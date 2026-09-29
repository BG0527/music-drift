import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './icon';
import { cn } from './utils';
import type { SemanticTone } from './tokens';

export interface ToastProps {
  tone?: SemanticTone;
  message: string;
  className?: string;
  onDismiss?: () => void;
}

/**
 * 语义色的三件套：tint 底 + border 描边 + **语义文字色**（DESIGN.md §Semantic & Status Colors）。
 * 四档文字色各自达标：success 8.95:1 / warning 10.92:1 / danger 6.07:1 / info 8.78:1（压在各自 tint 上）。
 */
const toneStyle: Record<SemanticTone, string> = {
  success: 'bg-success-tint border-success-border text-success',
  warning: 'bg-warning-tint border-warning-border text-warning',
  danger: 'bg-danger-tint border-danger-border text-danger',
  info: 'bg-info-tint border-info-border text-info',
};

const toneIcon: Record<SemanticTone, IconName> = {
  success: 'CheckCircle2',
  warning: 'AlertTriangle',
  danger: 'AlertCircle',
  info: 'Info',
};

/**
 * Toast：`role=status` + `aria-live=polite`（接力状态变化可被播报，动效不是唯一反馈）。
 * 它是浮层 ⇒ 允许阴影（L2）；颜色只是**第二**信号，图标 + 文案是第一信号
 * （success 与 info 同属冷色相，只靠颜色分不出来）。
 */
export function Toast({ tone = 'info', message, className, onDismiss }: ToastProps) {
  const [dismissed, setDismissed] = useState(false);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);
  useEffect(() => {
    setDismissed(false);
    if (tone !== 'success') return;
    const timer = window.setTimeout(() => {
      setDismissed(true);
      onDismissRef.current?.();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [message, tone]);
  if (dismissed) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'z-toast enter-rise flex items-center gap-3 rounded-lg border px-4 py-3 text-[0.9375rem] shadow-floating',
        toneStyle[tone],
        className,
      )}
    >
      <Icon name={toneIcon[tone]} size={18} />
      <span>{message}</span>
    </div>
  );
}
