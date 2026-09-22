/**
 * 漂流日志文案（纯函数）。
 *
 * 两条纪律：
 * 1. 事件类型是**机器码**，不许直接给用户看 —— 每一种都要有中文说明；
 * 2. **系统行为不是人**：斩浪 / 超时 / 断链的 `actorId` 是哨兵 `'SYSTEM'`（不是用户 id），
 *    必须显示「系统」，不能显示成一串 UUID。
 *
 * 客户端**不本地推算时间线**（`docs/api.md` §2.4）：只按服务端给的 `seq` 排序与展示。
 */
import type { BottleDetail, BottleEvent } from '@music-drift/shared';

export const SYSTEM_ACTOR = 'SYSTEM';

/** 未知操作者的兜底（例如中途参与、但已不在当前段列表里的接唱者）。 */
export const UNKNOWN_ACTOR_LABEL = '匿名歌手';

export const EVENT_LABELS: Record<string, string> = {
  BOTTLE_CREATED: '发起：选定了这首歌',
  SEGMENT_RECORDED: '有人录下了一段',
  BOTTLE_CAST_TO_RIVER: '投河：交给河道，等待下一位',
  BOTTLE_DRAWN: '有人从河道里捞起了它',
  BOTTLE_PUT_BACK: '被放回河道（没有接唱）',
  BOTTLE_RETURNED: '回传：交回上游的传递者',
  BOTTLE_WENT_TO_SEA: '入海：成为公海里的公共作品',
  SEGMENT_CUT: '斩浪：有一段被删除了',
  BOTTLE_DAMAGED: '作品损坏，停止漂流',
  BOTTLE_GAP_OPENED: '出现空缺段位，等待补位',
  BOTTLE_REWOUND: '退回：重新开放接唱',
  VOTE_CAST: '有人投了一票',
  MESSAGE_ATTACHED: '留下了一条私密留言',
};

export function describeEvent(event: Pick<BottleEvent, 'type'>): string {
  return EVENT_LABELS[event.type] ?? '有一条新的动态';
}

export interface ActorSource {
  initiatorCode: string;
  segments: ReadonlyArray<{ ownerId: string; ownerCode: string }>;
}

/**
 * 操作者 → 展示名。
 * 匿名代号是**按瓶子**生成的（CONTEXT §12.1），所以这里只能从这支瓶子的信息里取。
 */
export function actorLabel(actorId: string, bottle: ActorSource): string {
  if (actorId === SYSTEM_ACTOR) return '系统';
  const segment = bottle.segments.find((candidate) => candidate.ownerId === actorId);
  if (segment !== undefined) return segment.ownerCode;
  return UNKNOWN_ACTOR_LABEL;
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
  return [...events]
    .sort((left, right) => left.seq - right.seq)
    .map((event) => ({
      seq: event.seq,
      label: describeEvent(event),
      actor: actorLabel(event.actorId, bottle),
      at: formatOccurredAt(event.occurredAt),
      isSystem: event.actorId === SYSTEM_ACTOR,
    }));
}

/** 详情 → 操作者来源（发起者代号 + 各段代号）。 */
export function actorSourceOf(bottle: BottleDetail): ActorSource {
  return {
    initiatorCode: bottle.initiatorCode,
    segments: bottle.segments.map((segment) => ({
      ownerId: segment.ownerId,
      ownerCode: segment.ownerCode,
    })),
  };
}
