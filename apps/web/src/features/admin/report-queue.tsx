/**
 * 审核队列（`/admin` 的主体）—— 装置：**真印章**（+ 待处理的「浮上来」错落）。
 *
 * 纪律：
 * - **权限态自建**（Figma 无状态帧）：403 → 权限说明（且**不渲染任何队列内容**）、401 → 登录出口；
 * - **动作与对象类型匹配**：客户端先按 `targetType` 只给可用的动作（服务端仍会 422 兜底，
 *   前端隐藏不算权限——这只是"别让用户点了才知道"）；
 * - 历史页对「已删段」给出 **「恢复这一段」**，这是审核台**覆盖自动斩杀**的入口；
 * - 每条裁决都用 `ReportSchema` 校验过的数据渲染（列表整体走 AsyncBoundary，三态齐全）。
 *
 * record-v1 的两处形态（不是装饰）：
 * 1. **待处理的卡片错落浮起** —— 未裁决的东西是"浮在水线上"的（水线在页面层）；
 * 2. **历史裁决的结论是一枚印章**（旋转 + coral 双描边），不是一行绿色小字：
 *    审核结论是"盖上去"的裁决，这是这一页唯一的记忆点。
 *    印章是**描边 + coral 文字**（对 ink 4.76:1），不是 coral 实心填充 —— 因此不适用
 *    「coral 实心填充上必须用 ink」那一条。
 */
import type { ReactNode } from 'react';
import type { Report, ReportAction } from '@music-drift/shared';
import { Button, cn } from '../../design-system';
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

/**
 * 浮上来的错落：三档高度 + 三种宽度（**故意不等宽**：等宽三列会把"浮起来"读成一张表格）
 * + 手工放置的微旋转（设计稿 `div.card`：-.4° / .35° / -.3°；契约 §6 #8：|角| ≤ 3.5° 且只给手工放置物）。
 * 只有待处理用得上 —— 已裁决的历史是沉的，排在一条水平线上。
 */
const FLOAT = [
  { basis: 'md:basis-[31%]', offset: 'md:mt-10', tilt: 'md:rotate-[-0.4deg]' },
  { basis: 'md:basis-[34%]', offset: 'md:mt-0', tilt: 'md:rotate-[0.35deg]' },
  { basis: 'md:basis-[30%]', offset: 'md:mt-5', tilt: 'md:rotate-[-0.3deg]' },
] as const;

/**
 * 沉下去的层次：设计稿 `li.rec:nth-child` —— 越老越暗一档（1 → .92 → .84），循环使用。
 */
const SUNK_DIM = ['opacity-100', 'opacity-[0.92]', 'opacity-[0.84]'] as const;

export function ReportQueue({ status, className }: ReportQueueProps) {
  const reports = useAdminReports(status);

  return (
    <AsyncBoundary
      query={reports}
      emptyWhen={(items) => items.length === 0}
      empty={
        <p role="status" className="text-[0.9375rem] text-muted">
          {status === 'PENDING' ? '队列是空的，没有待处理举报。' : '还没有历史裁决。'}
        </p>
      }
    >
      {(items) => (
        <ul
          className={cn(
            'flex flex-col gap-4',
            status === 'PENDING' && 'md:flex-row md:flex-wrap md:items-start',
            className,
          )}
        >
          {items.map((item, index) => (
            <ReportRow key={item.id} report={item} index={index} />
          ))}
        </ul>
      )}
    </AsyncBoundary>
  );
}

/** 印章的落款角度：真印章不会正着盖（逐行换一个角度）。 */
const TILT = ['rotate-[-3.2deg]', 'rotate-[2.4deg]', 'rotate-[-2.1deg]'] as const;

/**
 * 一枚**真印章**：转着盖、描边是墨、底是 coral 的 12% 淡底、墨色不匀（第二道框被掩膜切碎）。
 *
 * 两道硬口径：
 * - 文字用**coral 的提亮档 `danger`**（DESIGN.md §Semantic：12–16% 的 coral 淡底不算填充，
 *   那种底上的文字照旧用提亮档）—— 对 ink 6.67:1，比 coral 原文的 4.76:1 更宽；
 * - 印章**不是实心 coral 填充**，所以「实心填充上必须用 ink」那一条不适用于它。
 */
function Stamp({ children, tilt }: { children: ReactNode; tilt: string }) {
  return (
    <span
      data-device="stamp"
      className={cn(
        'relative inline-block shrink-0 rounded-base border-2 border-coral/[0.72] bg-coral/[0.15] px-[13px] py-[9px] text-[0.78125rem] tracking-[0.17em] text-danger md:translate-y-2',
        tilt,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-[2px] border-2 border-coral/50 [mask-image:repeating-linear-gradient(74deg,white_0_5px,rgba(255,255,255,0.04)_5px_7px,white_7px_17px)]"
      />
      {children}
    </span>
  );
}

/** 还没盖的印位：空着、虚线、落在工单右下角（暖光 = 等待态；设计稿 `.seal.due`）。 */
function SealSlot() {
  return (
    <span className="ml-auto rotate-[-2.4deg] rounded-base border-[1.5px] border-dashed border-warm/[0.66] px-[13px] py-[8px] text-[0.78125rem] tracking-[0.17em] text-warm">
      待处理
    </span>
  );
}

function ReportRow({ report, index }: { report: Report; index: number }) {
  const decide = useDecideReport();
  const pending = report.status === 'PENDING';
  // 「恢复这一段」= 人工覆盖自动斩杀：只对被人工/自动删过的段有意义
  const restorable =
    !pending && report.action === 'REMOVE_SEGMENT' && report.targetType === 'SEGMENT';
  const float = FLOAT[index % FLOAT.length] ?? FLOAT[0];
  const tilt = TILT[index % TILT.length] ?? TILT[0];
  const dim = SUNK_DIM[index % SUNK_DIM.length] ?? SUNK_DIM[0];

  return (
    <li
      className={cn(
        'flex flex-col gap-3 border border-line/13 px-4 py-3',
        pending
          ? cn('bg-water-void/60', float.basis, float.offset, float.tilt)
          : cn('border-x-0 border-t-0 py-4', dim),
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.75rem] text-muted">
        <span className="font-mono">{report.targetId.slice(0, 8)}</span>
        <span className="border border-line/25 px-2 py-0.5 tracking-[0.12em] text-paper">
          {TARGET_LABEL[report.targetType]}
        </span>
        <span>举报于 {formatOccurredAt(report.createdAt)}</span>
      </div>

      <p className="text-[0.9375rem] leading-[1.85] text-paper">{report.reason}</p>

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

        {pending ? (
          <SealSlot />
        ) : (
          <span className="ml-auto flex items-center gap-3">
            {report.action === null ? (
              <span className="text-[0.8125rem] text-muted">已处理</span>
            ) : (
              <Stamp tilt={tilt}>{ACTION_LABEL[report.action]}</Stamp>
            )}
          </span>
        )}
      </div>

      {decide.isError && decide.variables?.reportId === report.id ? (
        <p role="alert" className="text-[0.875rem] text-danger">
          {decide.error instanceof Error
            ? decide.error.message
            : '这次裁决没有生效，请刷新后重试。'}
        </p>
      ) : null}
    </li>
  );
}
