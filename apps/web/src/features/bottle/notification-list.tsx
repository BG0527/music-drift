/**
 * 通知列表（挂在「我的」页）。
 *
 * 它存在的意义：通知的**写入路径**（§5.2 未送达 / §9.2 作品完成）必须有一条**可演示路径** ——
 * 否则"写了通知"这件事在界面上看不到，那不算交付。
 *
 * 三态统一走 `AsyncBoundary`（加载=骨架 / 失败=可读文案+重试 / 空=中性空态），
 * 与全站同一套口径，避免"这一页转圈、那一页白屏"的漂移。
 * 未读**不只靠颜色**：既有色点也有「未读」文字（DESIGN.md §Accessibility）。
 */
import { Button, Icon, cn } from '../../design-system';
import { useMarkNotificationRead } from '../api/mutations';
import { useNotifications } from '../api/queries';
import { AsyncBoundary } from '../../pages/shell/async-boundary';
import { Link } from '../../pages/shell/router';
import { TEXT_LINK } from '../../pages/shell/link-styles';
import { describeNotification, type NotificationLike } from './notification-labels';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const TONE_ICON: Record<Tone, 'Info' | 'CheckCircle2' | 'AlertTriangle' | 'AlertCircle'> = {
  info: 'Info',
  success: 'CheckCircle2',
  warning: 'AlertTriangle',
  danger: 'AlertCircle',
};

const TONE_CLASS: Record<Tone, string> = {
  info: 'border-info-border bg-info-tint',
  success: 'border-success-border bg-success-tint',
  warning: 'border-warning-border bg-warning-tint',
  danger: 'border-danger-border bg-danger-tint',
};

export interface NotificationListProps {
  className?: string;
}

export function NotificationList({ className }: NotificationListProps) {
  const notifications = useNotifications();

  return (
    <AsyncBoundary
      query={notifications}
      emptyWhen={(page) => page.items.length === 0}
      empty={
        <p className="flex flex-wrap items-center gap-x-[12px] rounded-base border border-mist bg-foam px-4 py-[10px] text-[0.9375rem] text-slate-current">
          <Icon name="Info" size={18} />
          <span>还没有新消息：有人接唱、留言送达或作品入海时才会出现。</span>
        </p>
      }
    >
      {(page) => (
        <ul className={cn('flex flex-col gap-3', className)}>
          {page.items.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} />
          ))}
        </ul>
      )}
    </AsyncBoundary>
  );
}

function NotificationItem({ notification }: { notification: NotificationLike }) {
  const markRead = useMarkNotificationRead();
  const view = describeNotification(notification);
  const unread = notification.readAt === null;

  return (
    <li className={cn('flex flex-col gap-2 rounded-base border px-4 py-3', TONE_CLASS[view.tone])}>
      <div className="flex flex-wrap items-center gap-3">
        <Icon name={TONE_ICON[view.tone]} size={18} />
        <p className="text-[1rem] font-semibold text-abyss">{view.label}</p>
        {unread ? (
          <span className="rounded-pill bg-peacock px-3 py-1 text-[0.75rem] font-medium text-wave-white">
            未读
          </span>
        ) : (
          <span className="text-[0.75rem] text-slate-current">已读</span>
        )}
      </div>

      <p className="text-[0.875rem] leading-[1.6] text-slate-current">{view.detail}</p>

      <div className="flex flex-wrap items-center gap-4">
        {view.href === null ? null : (
          <Link to={view.href} className={TEXT_LINK}>
            <span className="whitespace-nowrap">去看一眼</span>
          </Link>
        )}
        {unread ? (
          <Button
            variant="ghost"
            loading={markRead.isPending && markRead.variables === notification.id}
            onClick={() => {
              markRead.mutate(notification.id);
            }}
          >
            标记已读
          </Button>
        ) : null}
      </div>
    </li>
  );
}
