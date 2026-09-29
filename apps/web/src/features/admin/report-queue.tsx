/**
 * 审核队列（`/admin` 的主体）—— **逐块照抄 `docs/ui-review/design-explore/s2-admin-record.html`**：
 * 浮上来的压片工单（`.float > .card`）+ 沉下去的历史裁决（`ul.sunk > li.rec`）+ 真印章（`.seal`）。
 *
 * 稿是 1440 固定画布、两 Tab 画进同一帧；这里**唯一翻译 = 固定 px → 流体**（宽 900 → max-w、
 * 四列网格加断点前缀、卡片错落进 md 档），块的顺序、文案、数值逐字逐值照稿，不省块不发明。
 *
 * 纪律：
 * - **权限态自建**：403 → 权限说明（不渲染任何队列内容）、401 → 登录出口（AsyncBoundary 统一出口）；
 * - **动作与对象类型匹配**：客户端先按 `targetType` 只给可用动作（服务端仍 422 兜底）；
 * - 历史「已删段」带 **「恢复这一段」**（覆盖自动斩杀的入口）；
 * - 待处理卡右下角是**还没盖的印位**（`.seal.due` 虚线），历史行的结论是**盖穿行分界线的真印章**
 *   （双框：主框 + 掩膜切碎的失焦第二框 + `data-s` 同字重影；转角取稿值、|角| ≤ 3.5°）。
 */
import type { Report, ReportAction } from '@music-drift/shared';
import { cn } from '../../design-system';
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
  COMMENT: '评论',
};

const ACTION_LABEL: Record<ReportAction, string> = {
  NONE: '已驳回',
  REMOVE_SEGMENT: '已删段',
  RESTORE_SEGMENT: '已恢复唱段',
  REMOVE_BOTTLE: '已删瓶下架',
  REMOVE_COMMENT: '已删评论',
  BAN_USER: '已封禁作者',
};

/** 每条举报允许的动作（与服务端 `ACTION_TARGETS` 同口径；服务端仍是最终判定）。 */
function actionsFor(targetType: Report['targetType']): { label: string; decision: ReportAction }[] {
  if (targetType === 'COMMENT') {
    return [
      { label: '驳回', decision: 'NONE' },
      { label: '删评论', decision: 'REMOVE_COMMENT' },
    ];
  }
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
 * 浮上来的错落（稿 `div.card` inline 样式）：三档宽（400/428/416 ≈ 31/33/32%）、
 * 三档底距（-8/22/38 → 底对齐后的 `mb`）、手工微旋转（-.4°/.35°/-.3°；契约 §6 #8 |角| ≤ 3.5°）
 * + 逐卡待印位转角（-2.4°/-1.5°/-3°）。只有待处理用得上 —— 历史是沉的，排在一条水平线上。
 */
const FLOAT = [
  { basis: 'md:basis-[31%]', lift: 'md:mb-[-8px]', tilt: 'md:rotate-[-0.4deg]', due: 'rotate-[-2.4deg]' },
  { basis: 'md:basis-[33%]', lift: 'md:mb-[22px]', tilt: 'md:rotate-[0.35deg]', due: 'rotate-[-1.5deg]' },
  { basis: 'md:basis-[32%]', lift: 'md:mb-[38px]', tilt: 'md:rotate-[-0.3deg]', due: 'rotate-[-3deg]' },
] as const;

/**
 * 沉下去的层次（稿 `li.rec:nth-child`）：越老越暗一档（1 → .92 → .84）、rno 越老缩进越深
 * （0/10/20）、印章越老落点不同、行分界线越老越短 —— 四组都按 3 循环（稿只画了 3 行）。
 */
const SUNK_DIM = ['opacity-100', 'opacity-[0.92]', 'opacity-[0.84]'] as const;
const RNO_INDENT = ['', 'pl-[10px]', 'pl-[20px]'] as const;
const SEAL_AT = [
  'right-[-4px] bottom-[-17px]',
  'right-[136px] bottom-[-20px]',
  'right-[56px] bottom-[-15px]',
] as const;
const RULE_AT = ['left-0 w-full', 'left-[8px] w-[87%]', 'left-[26px] w-[96%]'] as const;
/** 印章的落款角度（稿 `.seal.sunk` inline：-3.2° / 2.4° / -2.1°）。 */
const TILT = ['rotate-[-3.2deg]', 'rotate-[2.4deg]', 'rotate-[-2.1deg]'] as const;

export function ReportQueue({ status, className }: ReportQueueProps) {
  const reports = useAdminReports(status);
  const pending = status === 'PENDING';

  return (
    <div
      data-device={pending ? 'pending-above' : 'history-below'}
      className={cn(pending && 'mt-2', className)}
    >
      <AsyncBoundary
        query={reports}
        emptyWhen={(items) => items.length === 0}
        empty={
          <p role="status" className="text-[0.9375rem] text-muted">
            {pending ? '队列是空的，没有待处理举报。' : '还没有历史裁决。'}
          </p>
        }
      >
        {(items) =>
          pending ? (
            // 稿 `.float`：底对齐 + 百分比横向间距（宽 400+428+416 + 两段缝正好占满）
            <ul className="flex flex-col gap-6 md:flex-row md:flex-wrap md:items-end md:gap-x-[3.4%]">
              {items.map((item, index) => (
                <PendingCard key={item.id} report={item} index={index} />
              ))}
            </ul>
          ) : (
            // 稿 `ul.sunk`：宽 900 → 流体 max-w
            <ul className="relative mt-[34px] w-full max-w-[900px]">
              {items.map((item, index) => (
                <ReviewRow key={item.id} report={item} index={index} />
              ))}
            </ul>
          )
        }
      </AsyncBoundary>
    </div>
  );
}

/** 稿 `.acts button`：12.5px、内距 7×13、透明底；删档 coral .62、封禁 coral .74 + 淡底 .12。 */
const ACT_BASE =
  'whitespace-nowrap rounded-base border px-[13px] py-[7px] text-[0.78125rem] disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink';
const ACT_TONE: Record<'reject' | 'cut' | 'ban', string> = {
  reject: 'border-paper/[0.26] bg-transparent text-paper',
  cut: 'border-coral/[0.62] bg-transparent text-danger',
  ban: 'border-coral/[0.74] bg-coral/[0.12] text-danger',
};
function toneFor(decision: ReportAction): keyof typeof ACT_TONE {
  return decision === 'NONE' ? 'reject' : decision === 'BAN_USER' ? 'ban' : 'cut';
}

/** 浮上来的压片工单（稿 `.card`：卡内块序 no → kind → hair → rep → when → 动作+印位）。 */
function PendingCard({ report, index }: { report: Report; index: number }) {
  const decide = useDecideReport();
  const float = FLOAT[index % FLOAT.length] ?? FLOAT[0];
  const busy = decide.isPending && decide.variables?.reportId === report.id;

  return (
    <li
      className={cn(
        'relative flex min-h-[160px] flex-col rounded-base border border-paper/[0.17] px-4 py-[14px]',
        'bg-[radial-gradient(76%_76%_at_30%_22%,rgba(10,48,60,0.54),rgba(3,17,23,0.82))]',
        float.basis,
        float.lift,
        float.tilt,
      )}
    >
      {/* 稿 `.card::before`：左缘断续导轨（母版刻痕） */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[11px] left-0 top-[11px] w-[3px] bg-[repeating-linear-gradient(180deg,rgba(243,249,250,0.26)_0_2px,transparent_2px_7px)]"
      />
      <p className="font-latin text-[0.8125rem] tracking-[0.06em] text-muted/95">
        {report.targetId.slice(0, 8)}
      </p>
      <p className="mt-[5px] text-[0.65625rem] tracking-[0.14em] text-muted/[0.78]">
        {TARGET_LABEL[report.targetType]}
      </p>
      <span aria-hidden="true" className="mt-[9px] block h-px bg-paper/[0.11]" />
      <p className="mt-[9px] text-[0.9375rem] font-bold text-paper">
        举报：{TARGET_LABEL[report.targetType]}
        <em className="ml-[7px] text-[0.84375rem] font-normal text-glass">{report.reason}</em>
      </p>
      <p className="mt-[8px] font-latin text-[0.71875rem] text-muted/[0.86]">
        举报于 {formatOccurredAt(report.createdAt)}
      </p>

      {/* 稿 `.acts`（左）+ `.seal.due`（右）：同一底缘的一排 */}
      <div className="mt-auto flex items-end justify-between gap-2 pt-[10px]">
        <div className="flex gap-2">
          {actionsFor(report.targetType).map((action) => (
            <button
              key={action.decision}
              type="button"
              disabled={busy}
              className={cn(ACT_BASE, ACT_TONE[toneFor(action.decision)])}
              onClick={() => {
                decide.mutate({ reportId: report.id, decision: action.decision });
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
        <span
          className={cn(
            'min-w-[114px] rounded-base border-[1.5px] border-dashed border-warm/[0.66] px-[13px] py-[8px] text-center text-[0.78125rem] tracking-[0.17em] text-warm',
            float.due,
          )}
        >
          待处理
        </span>
      </div>

      {/* 稿 `.card .flood`：贴水的那张半身泡在水里（只给底距 -8 的第一档） */}
      {index % FLOAT.length === 0 ? (
        <span
          data-device="flood"
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-px -left-px -right-px h-[9px] bg-[linear-gradient(180deg,rgba(6,26,34,0.5),rgba(3,17,23,0.72))] rounded-b-[2px]"
        />
      ) : null}

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

/** 沉下去的历史裁决（稿 `li.rec`：rno → robj → rtime → 恢复按钮，印章压穿行分界线）。 */
function ReviewRow({ report, index }: { report: Report; index: number }) {
  const decide = useDecideReport();
  const slot = index % SUNK_DIM.length;
  const restorable = report.action === 'REMOVE_SEGMENT' && report.targetType === 'SEGMENT';
  const busy = decide.isPending && decide.variables?.reportId === report.id;

  return (
    <li
      className={cn(
        'relative grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 pt-[18px] pb-[24px] lg:grid-cols-[140px_300px_180px_auto]',
        SUNK_DIM[slot] ?? SUNK_DIM[0],
      )}
    >
      <span
        className={cn(
          'font-latin text-[0.78125rem] tracking-[0.06em] text-muted/90',
          RNO_INDENT[slot],
        )}
      >
        {report.targetId.slice(0, 8)}
      </span>
      <span className="text-[0.90625rem] font-bold text-paper">
        举报：{TARGET_LABEL[report.targetType]}
        <em className="ml-[7px] text-[0.8125rem] font-normal text-muted/90">{report.reason}</em>
      </span>
      <span className="font-latin text-[0.71875rem] text-muted/[0.78]">
        举报于 {formatOccurredAt(report.createdAt)}
      </span>

      {restorable ? (
        <button
          type="button"
          disabled={busy}
          className="justify-self-start whitespace-nowrap rounded-base border border-glass/50 bg-transparent text-glass px-[13px] py-[7px] text-[0.78125rem] disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          onClick={() => {
            decide.mutate({ reportId: report.id, decision: 'RESTORE_SEGMENT' });
          }}
        >
          恢复这一段
        </button>
      ) : null}

      {report.action !== null ? (
        <Stamp
          label={ACTION_LABEL[report.action]}
          tilt={TILT[slot] ?? TILT[0]}
          at={SEAL_AT[slot] ?? SEAL_AT[0]}
        />
      ) : (
        <span className="text-[0.8125rem] text-muted">已处理</span>
      )}

      {/* 稿 `li.rec .rule`：paper .32→.05 渐变，越老越短（章压在它上面） */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute bottom-0 h-px bg-[linear-gradient(90deg,rgba(243,249,250,0.32),rgba(243,249,250,0.05))]',
          RULE_AT[slot],
        )}
      />

      {decide.isError && decide.variables?.reportId === report.id ? (
        <p role="alert" className="col-span-full text-[0.875rem] text-danger">
          {decide.error instanceof Error
            ? decide.error.message
            : '这次裁决没有生效，请刷新后重试。'}
        </p>
      ) : null}
    </li>
  );
}

/**
 * 一枚**真印章**（稿 `.seal.sunk`）：转着盖、双框（主框 .72 + 掩膜切碎的失焦第二框 .5）
 * + `data-s` 同字重影（错开 1px 的 coral .33 —— 由 CSS `attr()` 画，读屏只读一遍正文）。
 * 文字用 coral 提亮档 `danger`（DESIGN.md §Semantic：淡底上的文字用提亮档）；
 * 印章不是实心 coral 填充，「实心填充上必须用 ink」不适用。
 */
function Stamp({ label, tilt, at }: { label: string; tilt: string; at: string }) {
  return (
    <span
      data-device="stamp"
      data-s={label}
      className={cn(
        'absolute z-[3] grid min-w-[114px] place-items-center rounded-base border-2 border-coral/[0.72] px-[13px] py-[9px] text-center text-[0.78125rem] tracking-[0.17em] text-danger',
        'bg-[radial-gradient(62%_72%_at_31%_34%,rgba(212,85,58,0.15),rgba(212,85,58,0)_74%)]',
        '[&::after]:pointer-events-none [&::after]:absolute [&::after]:inset-0 [&::after]:grid [&::after]:place-items-center [&::after]:[content:attr(data-s)] [&::after]:translate-x-[1px] [&::after]:-translate-y-[1px] [&::after]:text-coral/[0.33]',
        tilt,
        at,
      )}
    >
      {/* 稿 `.seal::before`：第二道框被掩膜切碎 + 轻微失焦（断墨） */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-[2px] blur-[0.32px] border-2 border-coral/[0.5] [mask-image:repeating-linear-gradient(74deg,white_0_5px,rgba(255,255,255,0.04)_5px_7px,white_7px_17px)]"
      />
      {label}
    </span>
  );
}
