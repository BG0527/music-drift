/**
 * §9.1 / §9.2 的**可见性规则**（t12）。
 *
 * 产品承诺（`CONTEXT.md` §9.1）：漂流中「你只看得到自己那一棒之前的部分与当前状态，
 * **看不到后面是谁、唱成什么样**」；§9.2：作品入海后解锁完整接力链。
 *
 * 规则（单一出口，详情与日志共用，避免两条路径漂移）：
 *
 * | 观看者 \ 状态 | 漂流中（DRAFT/IN_RIVER/HELD） | 已入海（SEA） |
 * | --- | --- | --- |
 * | 持有者 | 全部已有效段（他就是尾巴，后面本来没人） | 全部 |
 * | 唱过的人 | 到**自己的最高段号**为止（含自己那段；被斩过也算） | 全部 |
 * | 陌生人 / 未登录 | 空 | 全部 |
 *
 * 注意这不是"权限"，而是**产品语义**：漂流中后面还没发生"公开"；
 * 一旦入海（§9.2），所有人都能回听完整接力链 —— 两者必须成对存在。
 * 未参与者的读取是**登录与匿名都可以**的（`docs/api.md` §2.4），所以这里按"是否参与"裁。
 */
import type { BottleState } from '@music-drift/shared/domain';

export interface VisibilityInput {
  state: BottleState;
  viewerId: string | null;
}

/**
 * 段可见性的三种形态。
 *
 * ⚠️ 第一版把"不设上限"（持有者）和"什么都看不到"（陌生人）**都用 `null` 表示**，
 * 于是持有者被判成"看不到任何段" —— 测试当场抓住（`expected [] to deeply equal [1,2]`）。
 * 这属于**用一个值表达两件事**的经典错误，所以改成显式三态。
 */
export type SegmentVisibility =
  | { mode: 'ALL'; drifting: boolean }
  | { mode: 'NONE'; drifting: true }
  | { mode: 'UP_TO'; maxVisibleIndex: number; drifting: true };

export function segmentVisibility({ state, viewerId }: VisibilityInput): SegmentVisibility {
  const drifting = state.status !== 'SEA';
  if (!drifting) {
    // §9.2：入海后解锁完整接力链
    return { mode: 'ALL', drifting: false };
  }
  if (viewerId === null) {
    return { mode: 'NONE', drifting: true };
  }
  if (state.holder?.holderId === viewerId) {
    // 持有者 = 这条单支路的尾巴：他看得到"之前的部分"，而后面本来没有内容
    return { mode: 'ALL', drifting: true };
  }
  const mine = state.segments
    .filter((segment) => segment.ownerId === viewerId)
    .map((segment) => segment.index);
  if (mine.length === 0) {
    return { mode: 'NONE', drifting: true };
  }
  return { mode: 'UP_TO', maxVisibleIndex: Math.max(...mine), drifting: true };
}

/** 段是否对观看者可见。 */
export function isSegmentVisible(visibility: SegmentVisibility, index: number): boolean {
  if (visibility.mode === 'ALL') return true;
  if (visibility.mode === 'NONE') return false;
  return index <= visibility.maxVisibleIndex;
}

/**
 * 日志可见性：漂流中裁到"我的最后一次动作"为止。
 *
 * 为什么日志也要裁：事件里带 `actorId`，后面那一棒的 `SEGMENT_RECORDED` 会直接暴露
 * "后面有人唱了、是谁"（即使内容还看不到）。入海后不裁（§9.2）。
 */
export function isEventVisible(input: {
  visibility: SegmentVisibility;
  position: number;
  lastOwnEventIndex: number;
}): boolean {
  if (input.visibility.mode === 'ALL') return true;
  if (input.visibility.mode === 'NONE') return false;
  return input.position <= input.lastOwnEventIndex;
}

/** 「我的最后一次动作」在事件流里的位置（没有就返回 -1 → 一条都看不到）。 */
export function lastOwnEventIndex(
  events: readonly { actorId: string }[],
  viewerId: string | null,
): number {
  if (viewerId === null) return -1;
  let found = -1;
  events.forEach((event, index) => {
    if (event.actorId === viewerId) found = index;
  });
  return found;
}
