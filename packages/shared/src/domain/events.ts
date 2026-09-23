/**
 * 领域事件与 reducer（ADR-005 不变式 3：状态转移可由事件序列重放）。
 *
 * 命令的实现统一是「守卫 → 产出事件 → 交给 `reduceBottle` 折叠」，
 * 因此「命令后的状态」与「重放同一批事件」必然一致（replay.test.ts 覆盖）。
 * reducer 只做机械搬运，不读时钟、不读策略。
 */
import { SYSTEM_ACTOR_ID } from './constants';
// ⚠️ 只引入三个**纯函数**（无 IO、无状态）：它们就是"留言何时送达/何时失败"的唯一实现。
// messages.ts 只从 events.ts 引 `type`（编译期擦除），因此运行期不存在循环依赖。
import { messagesDeliveredTo, messagesUndelivered, messagesUndeliveredFor } from './messages';
import { findSegment } from './queries';
import type { BottleState, Segment, VoteValue } from './types';

export type SeaReason = 'RESOLUTION' | 'RIVER_IDLE_TIMEOUT' | 'RETURN_DECISION_TIMEOUT';
export type DamageReason =
  /** 作品被斩空：一段有效段都不剩。 */
  | 'CHAIN_BROKEN_BY_CUT'
  /** 锚（第 1 段）被斩：位置 1 是发起者/父链起点/回传终点，锚没了整套结构失去基底（用户终裁）。 */
  | 'ANCHOR_SEGMENT_CUT';

interface EventBase {
  bottleId: string;
  /** 事件发生时间：一律来自注入时钟。 */
  at: number;
  /** 主动方；系统自动行为为 'SYSTEM'。 */
  actorId: string | 'SYSTEM';
}

export type DomainEvent =
  | (EventBase & {
      type: 'BOTTLE_CREATED';
      songId: string;
      initiatorId: string;
      totalSegments: number;
    })
  | (EventBase & {
      type: 'SEGMENT_RECORDED';
      segmentId: string;
      /** 本次录的是歌里的第几段：由内核的 `nextRecordIndex` 决定，调用方不得自选（ADR-015 §16.8）。 */
      index: number;
      note: string | null;
    })
  | (EventBase & { type: 'BOTTLE_CAST_TO_RIVER' })
  | (EventBase & {
      type: 'BOTTLE_DRAWN';
      /**
       * 捞取者的父节点（CONTEXT §4.1）。正常是投出者；
       * 合浪重开河道（`currentCasterId === 'SYSTEM'`）时是**缺口前一段的作者**（ADR-015 / captain 裁决 Q1）——
       * `'SYSTEM'` 只是守卫哨兵，永不进父链。
       */
      parentId: string | null;
    })
  | (EventBase & { type: 'BOTTLE_PUT_BACK'; cooldownDraws: number })
  | (EventBase & { type: 'BOTTLE_RETURNED'; toUserId: string })
  | (EventBase & {
      type: 'BOTTLE_WENT_TO_SEA';
      reason: SeaReason;
      returnCompleted: boolean;
      chainBroken: boolean;
    })
  | (EventBase & { type: 'SEGMENT_CUT'; segmentId: string })
  | (EventBase & { type: 'BOTTLE_DAMAGED'; reason: DamageReason })
  | (EventBase & {
      /** 斩浪打开缺口：系统把作品置回河道，等待陌生人补位（ADR-015 §16.3）。 */
      type: 'BOTTLE_GAP_OPENED';
      gapIndex: number;
    })
  | (EventBase & {
      type: 'BOTTLE_REWOUND';
      /** 回退目标：被斩段前驱段的接唱者；被斩段是第 1 段时为发起者。 */
      toUserId: string;
      /** 被斩段的作者：父链重接时要把它指向回退目标。 */
      cutOwnerId: string;
      /** 退回后该持有者重新进入去向选择；只剩发起者自己的段时回到 DRAFT 重新决定投河。 */
      targetStatus: 'HELD' | 'DRAFT';
    })
  | (EventBase & { type: 'VOTE_CAST'; segmentId: string; value: VoteValue })
  | (EventBase & {
      type: 'MESSAGE_ATTACHED';
      /** 目标段号：收件人 `toUserId` 就是这一段作者（服务端按段号解析，见 `messages.ts`）。 */
      targetSegmentIndex: number;
      messageId: string;
      toUserId: string;
      content: string;
    });

/** 仅用于重放的起点；`BOTTLE_CREATED` 之后它会被完全覆盖。 */
export function emptyBottleState(): BottleState {
  return {
    id: '',
    songId: '',
    initiatorId: '',
    totalSegments: 0,
    status: 'DRAFT',
    revision: 0,
    segments: [],
    parents: {},
    holder: null,
    currentCasterId: null,
    riverCastAt: null,
    seaAt: null,
    damagedAt: null,
    returnChainBroken: false,
    returnCompleted: false,
    messages: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

export function reduceBottle(state: BottleState, event: DomainEvent): BottleState {
  switch (event.type) {
    case 'BOTTLE_CREATED':
      return {
        ...emptyBottleState(),
        id: event.bottleId,
        songId: event.songId,
        initiatorId: event.initiatorId,
        totalSegments: event.totalSegments,
        status: 'DRAFT',
        parents: { [event.initiatorId]: null },
        createdAt: event.at,
        updatedAt: event.at,
      };

    case 'SEGMENT_RECORDED': {
      const segment: Segment = {
        id: event.segmentId,
        index: event.index,
        ownerId: event.actorId,
        createdAt: event.at,
        note: event.note,
        deletedAt: null,
        likes: [],
        dislikes: [],
      };
      return {
        ...state,
        segments: [...state.segments, segment],
        revision: state.revision + 1,
        updatedAt: event.at,
      };
    }

    case 'BOTTLE_CAST_TO_RIVER':
      return {
        ...state,
        status: 'IN_RIVER',
        holder: null,
        currentCasterId: event.actorId,
        riverCastAt: event.at,
        updatedAt: event.at,
      };

    case 'BOTTLE_PUT_BACK':
      return {
        ...state,
        status: 'IN_RIVER',
        holder: null,
        riverCastAt: event.at,
        updatedAt: event.at,
      };

    case 'BOTTLE_DRAWN':
      return {
        ...state,
        status: 'HELD',
        holder: { holderId: event.actorId, acquiredAt: event.at, origin: 'DRAW' },
        parents: { ...state.parents, [event.actorId]: event.parentId },
        // 目标拿到瓶子即送达（用户口径：回传到目标手上就有通知，不必等到入海）
        messages: messagesDeliveredTo(state.messages, event.actorId),
        updatedAt: event.at,
      };

    case 'BOTTLE_RETURNED':
      return {
        ...state,
        status: 'HELD',
        holder: { holderId: event.toUserId, acquiredAt: event.at, origin: 'RETURN' },
        messages: messagesDeliveredTo(state.messages, event.toUserId),
        updatedAt: event.at,
      };

    case 'BOTTLE_REWOUND':
      return {
        ...state,
        status: event.targetStatus,
        holder:
          event.targetStatus === 'HELD'
            ? { holderId: event.toUserId, acquiredAt: event.at, origin: 'REWIND' }
            : null,
        // 父链重接：被斩段的子段改指向回退目标，保证回传不会走到死节点（ADR-013 规则 4）。
        parents: relinkParents(state.parents, event.cutOwnerId, event.toUserId),
        currentCasterId:
          state.currentCasterId === event.cutOwnerId ? event.toUserId : state.currentCasterId,
        seaAt: null, // 若原本在公海，此处即「从公海撤下」（ADR-013 规则 5）
        updatedAt: event.at,
      };

    case 'BOTTLE_WENT_TO_SEA':
      return {
        ...state,
        status: 'SEA',
        seaAt: event.at,
        holder: null,
        returnCompleted: state.returnCompleted || event.returnCompleted,
        returnChainBroken: state.returnChainBroken || event.chainBroken,
        // 失败③：入海即终结 —— 此刻仍是 PENDING 的留言**就是没送到目标**（用户明确补充的那条）。
        // 已送达的（目标先前已拿到过瓶子）不受影响。
        messages: messagesUndelivered(state.messages),
        updatedAt: event.at,
      };

    case 'VOTE_CAST': {
      const target = findSegment(state, event.segmentId);
      if (target === null) {
        return state;
      }
      return {
        ...state,
        segments: state.segments.map((segment) =>
          segment.id === event.segmentId
            ? event.value === 'LIKE'
              ? { ...segment, likes: [...segment.likes, event.actorId] }
              : { ...segment, dislikes: [...segment.dislikes, event.actorId] }
            : segment,
        ),
        updatedAt: event.at,
      };
    }

    case 'SEGMENT_CUT': {
      const cutSegment = findSegment(state, event.segmentId);
      return {
        ...state,
        // 段号是歌的固定位置：只软删，位置留空（ADR-015 §16.1）。
        segments: state.segments.map((segment) =>
          segment.id === event.segmentId ? { ...segment, deletedAt: event.at } : segment,
        ),
        // 失败①：被斩段如果正是某条留言的**目标**，那条留言再也送不到
        messages:
          cutSegment === null
            ? [...state.messages]
            : messagesUndeliveredFor(state.messages, cutSegment.ownerId),
        updatedAt: event.at,
      };
    }

    case 'BOTTLE_GAP_OPENED':
      return {
        ...state,
        status: 'IN_RIVER',
        holder: null,
        currentCasterId: SYSTEM_ACTOR_ID,
        riverCastAt: event.at,
        seaAt: null, // 若原本在公海，此处即「从公海撤下」
        updatedAt: event.at,
      };

    case 'BOTTLE_DAMAGED':
      return {
        ...state,
        status: 'DAMAGED',
        holder: null,
        damagedAt: event.at,
        returnChainBroken: true,
        // 失败②：父链断裂 / 瓶子损坏 —— 仍未送达的留言全部未送达
        messages: messagesUndelivered(state.messages),
        updatedAt: event.at,
      };

    case 'MESSAGE_ATTACHED':
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: event.messageId,
            fromUserId: event.actorId,
            toUserId: event.toUserId,
            targetSegmentIndex: event.targetSegmentIndex,
            content: event.content,
            createdAt: event.at,
            status: 'PENDING',
          },
        ],
        updatedAt: event.at,
      };

    default:
      return state;
  }
}

/** 由事件流重建状态（`BOTTLE_CREATED` 必须是第一条；空流视为显式错误）。 */
export function replayBottle(events: readonly DomainEvent[]): BottleState {
  const [first, ...rest] = events;
  if (first === undefined) {
    throw new Error('replayBottle 需要至少一条事件');
  }
  return rest.reduce(reduceBottle, reduceBottle(emptyBottleState(), first));
}

/** 把「父节点是被斩段作者」的参与者改接到回退目标。 */
function relinkParents(
  parents: Record<string, string | null>,
  cutOwnerId: string,
  toUserId: string,
): Record<string, string | null> {
  const next: Record<string, string | null> = {};
  for (const [userId, parentId] of Object.entries(parents)) {
    next[userId] = parentId === cutOwnerId ? toUserId : parentId;
  }
  return next;
}
