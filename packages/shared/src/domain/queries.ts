/**
 * 只读派生查询（纯函数，无 IO）。所有派生值都由 `BottleState` 或事件流重建，不另存一份。
 */
import { HOUR_MS, SYSTEM_ACTOR_ID } from './constants';
import type { BottleState, ParticipantRecord, Segment, SegmentVersion } from './types';

/** 有效段，**按段号升序**（插入顺序无语义：补位段的插入顺序 ≠ 段号顺序）。 */
export function liveSegments(state: BottleState): Segment[] {
  return state.segments
    .filter((segment) => segment.deletedAt === null)
    .sort((left, right) => left.index - right.index);
}

/**
 * 缺口 = 1..totalSegments 中还没有有效段的位置（ADR-015 §16.1）。
 * 有效段不连续是合法状态，不是异常。
 */
export function gaps(state: BottleState): number[] {
  const taken = new Set(liveSegments(state).map((segment) => segment.index));
  const missing: number[] = [];
  for (let index = 1; index <= state.totalSegments; index += 1) {
    if (!taken.has(index)) {
      missing.push(index);
    }
  }
  return missing;
}

/**
 * 下一段要录的段号 = **最小缺口段号**（ADR-015 §16.1）。
 * 无缺口时 `gaps` 为空、`?? ` 支路恰好等于 `live.length + 1` —— 不需要额外分支。
 */
export function nextRecordIndex(state: BottleState): number {
  return gaps(state)[0] ?? liveSegments(state).length + 1;
}

/**
 * 混音/展示用的缺口清单（ADR-015 §16.6）：按段号升序。
 * 成品必须显式暴露缺口，**禁止**静默拼出一个看似完整但缺段/错位的成品。
 */
export function missingSegmentIndexes(state: BottleState): number[] {
  return gaps(state);
}

/** 这个人是否在该瓶子里唱过（**含被斩的软删行**，ADR-015 §16.7 防捣乱的唯一判定来源）。 */
export function hasEverSung(state: BottleState, userId: string): boolean {
  return state.segments.some((segment) => segment.ownerId === userId);
}

/**
 * 补位上下文（ADR-015 §16.5）：补位者听**缺口的前一段**；
 * 仅当存在 `index > 缺口` 的有效段时给出「后面已经有人接好了」的**状态标志** ——
 * 只暴露状态，不暴露是谁、也不暴露内容（CONTEXT §9.1）。
 */
export interface ReplacementContext {
  gapIndex: number;
  /** 缺口前一段的段号（缺口为第 1 段时为 null）。 */
  listenSegmentIndex: number | null;
  /** 缺口前一段的段 ID（缺口为第 1 段时为 null）：供播放前一段音频。 */
  listenSegmentId: string | null;
  /** 后面是否已经有人接好了（只给状态，不给身份与内容）。 */
  hasLaterSegments: boolean;
}

export function replacementContext(state: BottleState): ReplacementContext | null {
  if (state.status === 'DAMAGED') {
    // 已损坏的作品不再漂流，也就没有补位入口；公海未完成区（SEA + 缺口）仍可指定接唱补位。
    return null;
  }
  const gapIndex = gaps(state)[0];
  if (gapIndex === undefined) {
    return null;
  }
  const previous = gapIndex === 1 ? null : liveSegmentByIndex(state, gapIndex - 1);
  return {
    gapIndex,
    listenSegmentIndex: previous === null ? null : previous.index,
    listenSegmentId: previous === null ? null : previous.id,
    hasLaterSegments: liveSegments(state).some((segment) => segment.index > gapIndex),
  };
}

/** 公海分区：已完成区 / 未完成区（ADR-015 §16.4）；不在公海时为 null。 */
export type SeaZone = 'COMPLETED' | 'INCOMPLETE';

export function seaZoneOf(state: BottleState): SeaZone | null {
  if (state.status !== 'SEA') {
    return null;
  }
  return isComplete(state) ? 'COMPLETED' : 'INCOMPLETE';
}

export function findSegment(state: BottleState, segmentId: string): Segment | null {
  return state.segments.find((segment) => segment.id === segmentId) ?? null;
}

/** 父链查询：把瓶子投给该用户的人；发起者为 null。 */
/** 按段号取有效段（被斩的历史行会保留原段号，所以不能用普通 find）。 */
export function liveSegmentByIndex(state: BottleState, index: number): Segment | null {
  return liveSegments(state).find((segment) => segment.index === index) ?? null;
}

/**
 * 捞取者的父节点（CONTEXT §4.1 + Q1 裁决）：
 * - 正常投河：投出者；
 * - 系统合浪重开河道（`currentCasterId === 'SYSTEM'`）：**缺口前一段的作者**（父链语义是「段落上游」，
 *   不是「传递史」）；缺口为第 1 段时没有上游 → null。
 * `'SYSTEM'` 只用于「不能接自己投出的瓶子」守卫，永不成为父链节点。
 */
export function resolveDrawParent(state: BottleState): string | null {
  if (state.currentCasterId !== SYSTEM_ACTOR_ID) {
    return state.currentCasterId;
  }
  const upstream = liveSegmentByIndex(state, nextRecordIndex(state) - 1);
  return upstream === null ? null : upstream.ownerId;
}

export function parentOf(state: BottleState, userId: string): string | null {
  return state.parents[userId] ?? null;
}

export function currentHolderId(state: BottleState): string | null {
  return state.holder === null ? null : state.holder.holderId;
}

/**
 * 作品是否完整：1..totalSegments 全部有有效段（ADR-015 §16.2，不再看段数）。
 *
 * 为什么不用「段数 >= totalSegments」：只要段号都落在 1..N 内（内核不变式），两种写法等价
 * —— `gaps=∅ ⟺ 有效段号集合 = {1..N} ⟺ 有效段数 = N`。但事件流（t5 的持久化日志 / 导入的数据）
 * 一旦带入越界段号，旧写法会把「第 2 段缺席、却多了个不存在的第 5 段」的作品判成已完成，
 * 公海就会把缺段作品当完整作品展示（§15.1 问题 1）。本定义对这种脏数据是安全的（判未完成）。
 * 对应测试：gaps.test.ts「16.2（防御）：事件流带入越界段号时，1..N 未齐全就不算完成」。
 * t5 应在写入/导入时校验段号 ∈ 1..totalSegments；内核此处兜底为「不完整」。
 */
export function isComplete(state: BottleState): boolean {
  return gaps(state).length === 0;
}

/** 回传递交的完整版本（含全部有效段，不是单段）。 */
export function versionOf(state: BottleState): SegmentVersion {
  const live = liveSegments(state);
  return {
    bottleId: state.id,
    revision: state.revision,
    segmentIds: live.map((segment) => segment.id),
    ownerIds: live.map((segment) => segment.ownerId),
  };
}

/** 漂流参与记录：所有「段落仍在最终版本里」的参与者（CONTEXT §4.3 / §10.1）。 */
export function participants(state: BottleState): ParticipantRecord[] {
  return liveSegments(state).map((segment) => ({
    userId: segment.ownerId,
    role: segment.ownerId === state.initiatorId ? 'INITIATOR' : 'SINGER',
    segmentId: segment.id,
    segmentIndex: segment.index,
  }));
}

export function hoursToMs(hours: number): number {
  return hours * HOUR_MS;
}
