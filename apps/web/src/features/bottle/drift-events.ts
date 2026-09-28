/**
 * 漂流日志文案（纯函数）。
 *
 * 两条纪律：
 * 1. 事件类型是**机器码**，不许直接给用户看 —— 每一种都要有中文说明；
 * 2. 操作者只使用服务端返回的瓶级匿名代号 `actorCode`，客户端不接触真实用户 id。
 *
 * 客户端**不本地推算时间线**（`docs/api.md` §2.4）：只按服务端给的 `seq` 排序与展示。
 */
import type { BottleDetail, BottleEvent } from '@music-drift/shared';

export const EVENT_LABELS: Record<string, string> = {
  BOTTLE_CREATED: '发起：选定了这首歌',
  SEGMENT_RECORDED: '接唱：有人录下了一段',
  BOTTLE_CAST_TO_RIVER: '投河：交给河道，等待下一位',
  BOTTLE_DRAWN: '捞取：有人从河道里把它拿走了',
  BOTTLE_PUT_BACK: '放回：没有接唱，直接放回河道',
  BOTTLE_RETURNED: '回传：交回上游的传递者',
  BOTTLE_WENT_TO_SEA: '入海：成为公海里的公共作品',
  SEGMENT_CUT: '斩浪：有一段被删除了',
  BOTTLE_DAMAGED: '作品损坏，停止漂流',
  BOTTLE_GAP_OPENED: '出现空缺段位，等待补位',
  BOTTLE_REWOUND: '退回：重新开放接唱',
  VOTE_CAST: '有人投了一票',
  MESSAGE_ATTACHED: '留下了一条私密留言',
};

/**
 * **核心操作白名单**（用户第十三轮 ③：「漂流日志太详细冗余了，保留核心操作就好」）。
 *
 * 两类东西**故意不进日志**：
 * - **互动流水**（`VOTE_CAST`）：用户明说"不需要显示点赞/点踩的操作记录"；
 * - **系统行为细节**（斩浪 / 损坏 / 缺口 / 退回）：那些是**状态**，瓶子页的段位链与状态标已经讲清楚了，
 *   放进日志只会把"谁做了什么"淹掉。
 *
 * 另外 `MESSAGE_ATTACHED` 也**不进日志**：CONTEXT §5.1 规定中间传递者**不知道留言存在**，
 * 日志里出现「有人留下了一条私密留言」本身就是泄露（留言有自己的可见性出口，见私密留言弹窗）。
 *
 * 服务端已排除私密留言事件；前端白名单继续压缩为适合展示的核心操作。
 */
export const CORE_EVENT_TYPES: readonly string[] = [
  'BOTTLE_CREATED',
  'SEGMENT_RECORDED',
  'BOTTLE_CAST_TO_RIVER',
  'BOTTLE_DRAWN',
  'BOTTLE_PUT_BACK',
  'BOTTLE_RETURNED',
  'BOTTLE_WENT_TO_SEA',
];

export function describeEvent(event: Pick<BottleEvent, 'type'>): string {
  return EVENT_LABELS[event.type] ?? '有一条新的动态';
}

export interface ActorSource {
  initiatorCode: string;
  /** 作品是否已完整（服务端事实）：用来说明"完成"这一步。 */
  isComplete?: boolean;
}

export interface DriftLogEntry {
  seq: number;
  label: string;
  actor: string;
  at: string;
  isSystem: boolean;
}

export function formatOccurredAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

/** 按 `seq` 升序整理（服务端已排序，这里再钉一次，避免渲染时依赖隐式顺序）。 */
export function eventTimeline(
  events: readonly BottleEvent[],
  bottle: ActorSource,
): DriftLogEntry[] {
  const core = [...events]
    .filter((event) => CORE_EVENT_TYPES.includes(event.type))
    .sort((left, right) => left.seq - right.seq);
  /** 最后一次接唱（= 让作品变完整的那一步）的 seq；作品不完整时不存在"完成"。 */
  const lastRecordSeq =
    bottle.isComplete === true
      ? (core.filter((event) => event.type === 'SEGMENT_RECORDED').at(-1)?.seq ?? null)
      : null;

  return core.map((event) => ({
    seq: event.seq,
    label:
      event.seq === lastRecordSeq && lastRecordSeq !== null
        ? '完成：最后一段录好了，作品完整'
        : describeEvent(event),
    actor: event.actorCode,
    at: formatOccurredAt(event.occurredAt),
    isSystem: event.actorCode === '系统',
  }));
}

/** 详情 → 操作者来源（发起者代号 + 各段代号）。 */
export function actorSourceOf(bottle: BottleDetail): ActorSource {
  return {
    initiatorCode: bottle.initiatorCode,
    isComplete: bottle.isComplete,
  };
}
