/**
 * 审核队列（`/admin` 的主体）。
 *
 * 纪律：
 * - **权限态自建**（Figma 无状态帧）：403 → 权限说明（且**不渲染任何队列内容**）、401 → 登录出口；
 * - **动作与对象类型匹配**：客户端先按 `targetType` 只给可用的动作（服务端仍会 422 兜底，
 *   前端隐藏不算权限——这只是"别让用户点了才知道"）；
 * - 历史页对「已删段」给出 **「恢复这一段」**，这是审核台**覆盖自动斩杀**的入口；
 * - 每条裁决都用 `ReportSchema` 校验过的数据渲染（列表整体走 AsyncBoundary，三态齐全）。
 */
import type { Report, ReportAction } from '@music-drift/shared';
import { Button, Icon, cn } from '../../design-system';
import { useAdminReports, useDecideReport } from '../api';
import { AsyncBoundary } from '../../pages/shell/async-boundary';
import { formatOccurredAt } from '../bottle/drift-events';

export interface ReportQueueProps {
  status: 'PENDING' | 'REVIEWED';
  className?: string;
}

const TARGET_LABEL: Record<Report['targetType'], string> = {
  BOTTLE: '瓶子',
  SEGMENT: '唱段',
  MESSAGE: '留言',
};

const ACTION_LABEL: Record<ReportAction, string> = {
  NONE: '已驳回',
  REMOVE_SEGMENT: '已删段',
  RESTORE_SEGMENT: '已恢复唱段',
  REMOVE_BOTTLE: '已删瓶下架',
  BAN_USER: '已封禁作者',
};

/** 每条举报允许的动作（与服务端 `ACTION_TARGETS` 同口径；服务端仍是最终判定）。 */
function actionsFor(targetType: Report['targetType']): { label: string; decision: ReportAction }[] {
  if (targetType === 'SEGMENT') {
    return [
      { label: '驳回', decision: 'NONE' },
      { label: '删段', decision: 'REMOVE_SEGMENT' },
      { label: '封禁作者', decision: 'BAN_USER' },
    ];
  }
  if (targetType === 'BOTTLE') {
    return [
      { label: '驳回', decision: 'NONE' },
      { label: '删瓶下架', decision: 'REMOVE_BOTTLE' },
      { label: '封禁作者', decision: 'BAN_USER' },
    ];
  }
  return [
    { label: '驳回', decision: 'NONE' },
    { label: '封禁作者', decision: 'BAN_USER' },
  ];
}

export function ReportQueue({ status, className }: ReportQueueProps) {
  const reports = useAdminReports(status);

  return (
    <AsyncBoundary
      query={reports}
      emptyWhen={(items) => items.length === 0}
      empty={
        <p role="status" className="text-[0.9375rem] text-slate-current">
          {status === 'PENDING' ? '队列是空的，没有待处理举报。' : '还没有历史裁决。'}
        </p>
      }
    >
      {(items) => (
        <ul className={cn('flex flex-col gap-3', className)}>
          {items.map((item) => (
            <ReportRow key={item.id} report={item} />
          ))}
        </ul>
      )}
    </AsyncBoundary>
  );
}

function ReportRow({ report }: { report: Report }) {
  const decide = useDecideReport();
  const pending = report.status === 'PENDING';
  // 「恢复这一段」= 人工覆盖自动斩杀：只对被人工/自动删过的段有意义
  const restorable =
    !pending && report.action === 'REMOVE_SEGMENT' && report.targetType === 'SEGMENT';

  return (
    <li className="flex flex-col gap-3 rounded-base border border-mist bg-foam px-4 py-3 shadow-card">
      <div className="flex flex-wrap items-center gap-3 text-[0.875rem] text-slate-current">
        <span className="rounded-pill bg-tide-pool px-3 py-1 text-abyss">
          {TARGET_LABEL[report.targetType]}
        </span>
        <span className="text-[0.75rem]" style={{ fontFamily: 'var(--font-mono)' }}>
          {report.targetId.slice(0, 8)}
        </span>
        <span>举报于 {formatOccurredAt(report.createdAt)}</span>
        {pending ? (
          <span className="rounded-pill bg-warning-tint px-3 py-1 text-warning">待处理</span>
        ) : (
          <span className="flex items-center gap-2 text-success">
            <Icon name="CheckCircle2" size={16} />
            {report.action === null ? '已处理' : ACTION_LABEL[report.action]}
          </span>
        )}
      </div>

      <p className="text-[1rem] leading-[1.6] text-abyss">{report.reason}</p>

      <div className="flex flex-wrap items-center gap-3">
        {pending
          ? actionsFor(report.targetType).map((action) => (
              <Button
                key={action.decision}
                variant={action.decision === 'NONE' ? 'ghost' : 'primary'}
                loading={decide.isPending && decide.variables?.reportId === report.id}
                onClick={() => {
                  decide.mutate({ reportId: report.id, decision: action.decision });
                }}
              >
                {action.label}
              </Button>
            ))
          : null}

        {restorable ? (
          <Button
            variant="ghost"
            loading={decide.isPending && decide.variables?.reportId === report.id}
            onClick={() => {
              decide.mutate({ reportId: report.id, decision: 'RESTORE_SEGMENT' });
            }}
          >
            恢复这一段
          </Button>
        ) : null}
      </div>

      {decide.isError && decide.variables?.reportId === report.id ? (
        <p role="alert" className="text-[0.875rem] text-coral-deep">
          {decide.error instanceof Error
            ? decide.error.message
            : '这次裁决没有生效，请刷新后重试。'}
        </p>
      ) : null}
    </li>
  );
}
