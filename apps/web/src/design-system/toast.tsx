import { Icon, type IconName } from './icon';
import { cn } from './utils';
import type { SemanticTone } from './tokens';

export interface ToastProps {
  tone?: SemanticTone;
  message: string;
  className?: string;
}

const toneStyle: Record<SemanticTone, string> = {
  success: 'bg-success-tint border-success-border text-success',
  warning: 'bg-warning-tint border-warning-border text-warning',
  danger: 'bg-danger-tint border-danger-border text-coral-deep',
  info: 'bg-info-tint border-info-border text-peacock',
};

const toneIcon: Record<SemanticTone, IconName> = {
  success: 'CheckCircle2',
  warning: 'AlertTriangle',
  danger: 'AlertCircle',
  info: 'Info',
};

/** Toast：`role=status` + `aria-live=polite`（接力状态变化可被播报，动效不是唯一反馈）。 */
export function Toast({ tone = 'info', message, className }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'z-toast enter-rise flex items-center gap-3 rounded-base border px-4 py-3 text-[0.9375rem]',
        toneStyle[tone],
        className,
      )}
    >
      <Icon name={toneIcon[tone]} size={18} />
      <span>{message}</span>
    </div>
  );
}
