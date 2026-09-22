/**
 * 冲突 / 错误提示（DESIGN.md §Error States 第 3 条）。
 *
 * 409 接力冲突是**产品最关键的失败路径**：必须说清"这一段已被别人接走"，
 * 并给出两个出口动作，绝不静默失败、也不只弹一个 toast。
 * 出口动作的语义键 → 具体链接的翻译只发生在这里。
 */
import { toApiErrorView, type ApiErrorView, type ApiExitKey } from '../api/errors';
import { Button, Icon, cn } from '../../design-system';
import { Link } from '../../pages/shell/router';

export interface ConflictNoticeProps {
  error: unknown;
  /** 冲突发生在哪个瓶子（用来生成"看一眼漂流日志"的链接）。 */
  bottleId?: string | null | undefined;
  /** 「再试一次」的具体动作（例如重新捞取）。 */
  onRetry?: (() => void) | undefined;
  /**
   * 需要给出重试出口时的按钮文案（例如河道页的「再捞一次」）。
   * 规则违反类（422）本身不带重试出口 —— 但"换一个瓶子再捞"往往是合理的下一步，
   * 这个开关让调用方显式声明，而不是让组件猜。
   */
  retryLabel?: string | undefined;
  className?: string;
}

function exitHref(
  key: ApiExitKey,
  bottleId: string | null | undefined,
  next: string,
): string | null {
  switch (key) {
    case 'login':
      return `/login?next=${encodeURIComponent(next)}`;
    case 'switchBottle':
      return '/river';
    case 'viewLog':
      return bottleId === null || bottleId === undefined ? '/river' : `/bottles/${bottleId}/log`;
    case 'sea':
      return '/sea';
    case 'backHome':
      return '/';
    case 'pickSong':
      return '/new';
    default:
      return null;
  }
}

const TONE_CLASS: Record<ApiErrorView['kind'], string> = {
  CONFLICT: 'border-danger-border bg-danger-tint text-coral-deep',
  EMPTY_RIVER: 'border-warning-border bg-warning-tint text-warning',
  AUTH_REQUIRED: 'border-info-border bg-info-tint text-peacock',
  FORBIDDEN: 'border-danger-border bg-danger-tint text-coral-deep',
  NOT_FOUND: 'border-warning-border bg-warning-tint text-warning',
  INVALID_REQUEST: 'border-warning-border bg-warning-tint text-warning',
  RULE_VIOLATION: 'border-warning-border bg-warning-tint text-warning',
  SERVER: 'border-warning-border bg-warning-tint text-warning',
  NETWORK: 'border-warning-border bg-warning-tint text-warning',
  CONTRACT: 'border-danger-border bg-danger-tint text-coral-deep',
  UNKNOWN: 'border-warning-border bg-warning-tint text-warning',
};

const TONE_ICON: Record<ApiErrorView['kind'], 'AlertCircle' | 'AlertTriangle' | 'Info'> = {
  CONFLICT: 'AlertCircle',
  EMPTY_RIVER: 'Info',
  AUTH_REQUIRED: 'Info',
  FORBIDDEN: 'AlertCircle',
  NOT_FOUND: 'AlertTriangle',
  INVALID_REQUEST: 'AlertTriangle',
  RULE_VIOLATION: 'AlertTriangle',
  SERVER: 'AlertTriangle',
  NETWORK: 'AlertTriangle',
  CONTRACT: 'AlertCircle',
  UNKNOWN: 'AlertTriangle',
};

/** 数据没丢的场合必须说明"录音还在本机"（DESIGN.md §Error States 第 4 条）。 */
function keepsRecordingSafe(view: ApiErrorView): boolean {
  return (
    view.kind === 'NETWORK' ||
    view.kind === 'SERVER' ||
    view.kind === 'CONTRACT' ||
    (view.code?.startsWith('AUDIO_') ?? false)
  );
}

export function ConflictNotice({
  error,
  bottleId,
  onRetry,
  retryLabel,
  className,
}: ConflictNoticeProps) {
  const view = toApiErrorView(error);
  const exits: Array<{ key: ApiExitKey; label: string }> = [...view.exits];
  if (
    !exits.some((exit) => exit.key === 'retry') &&
    retryLabel !== undefined &&
    onRetry !== undefined
  ) {
    exits.push({ key: 'retry', label: retryLabel });
  }
  const next =
    typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}`;

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col gap-3 rounded-base border px-4 py-4',
        TONE_CLASS[view.kind],
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon name={TONE_ICON[view.kind]} size={18} />
        <div className="flex flex-col gap-1">
          <p className="text-[0.9375rem] font-semibold">{view.title}</p>
          <p className="text-[0.875rem] leading-[1.6]">{view.detail}</p>
          {keepsRecordingSafe(view) ? (
            <p className="text-[0.875rem] leading-[1.6]">你录好的内容还在本机，可以直接重试。</p>
          ) : null}
        </div>
      </div>

      {exits.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-3">
          {exits.map((exit) => {
            if (exit.key === 'retry') {
              return onRetry === undefined ? null : (
                <Button
                  key={exit.key}
                  variant="ghost"
                  onClick={onRetry}
                  icon={<Icon name="RefreshCw" size={16} />}
                >
                  {exit.label}
                </Button>
              );
            }
            const href = exitHref(exit.key, bottleId, next);
            if (href === null) return null;
            return (
              <Link
                key={exit.key}
                to={href}
                className="inline-flex min-h-11 items-center rounded-base px-4 text-[0.9375rem] font-semibold underline"
              >
                {exit.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
