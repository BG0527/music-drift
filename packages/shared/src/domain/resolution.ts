/**
 * 去向三选一规则（`CONTEXT.md` §3.3 / §4.1 / §4.3）。
 *
 * 规则原文要点：
 * - 发起者投河时没有「回传」选项；
 * - 非末段持有者可选 继续投河 / 回传 / 入海；
 * - 末段接唱完成后只能 回传 / 入海，不可继续投河；
 * - 发起者收到回传后只能入海。
 */
import { violation, type RuleViolation } from './errors';
import { isComplete, parentOf } from './queries';
import type { BottleState, Resolution } from './types';

/**
 * 当前用户此刻可选的去向（顺序即 UI 展示顺序）。
 * 不带 `ctx`：是否可选只取决于状态与身份，与时间/策略无关。
 */
export function availableResolutions(state: BottleState, cmd: { userId: string }): Resolution[] {
  const { userId } = cmd;

  if (state.status === 'DRAFT') {
    // 发起者录完第一段、尚未投河：没有「回传」（没有父节点可回传）。
    if (state.initiatorId !== userId) {
      return [];
    }
    return isComplete(state) ? [] : ['RIVER', 'SEA'];
  }

  if (state.status !== 'HELD' || state.holder === null || state.holder.holderId !== userId) {
    return [];
  }

  // 发起者收到回传后只能入海。
  if (userId === state.initiatorId && state.holder.origin === 'RETURN') {
    return ['SEA'];
  }

  const options: Resolution[] = [];
  if (!isComplete(state)) {
    // ADR-015 §16.2：规则从「末段不可投河」泛化为「作品完整时不可投河」。
    options.push('RIVER');
  }
  if (userId !== state.initiatorId && parentOf(state, userId) !== null) {
    // 回传需要有真实的上游（缺口为第 1 段时没有上游，无对象可回传）。
    options.push('RETURN');
  }
  options.push('SEA');
  return options;
}

/**
 * 「**待我操作**」（`CONTEXT.md` §4.2）：这支瓶子回到了我手里，且我**只能选入海**。
 *
 * 判据即 `availableResolutions(state, { userId })` 恰好只剩 `['SEA']` ——
 * 用它而不是再写一遍「发起者 + origin === 'RETURN'」，是为了让 §4.2 只有一份实现：
 * 将来去向集合一改（例如加"再投一次"），这个状态会自动跟着变，不会留下一句撒谎的提示。
 */
export function isAwaitingMyAction(state: BottleState, cmd: { userId: string }): boolean {
  const options = availableResolutions(state, cmd);
  return options.length === 1 && options[0] === 'SEA';
}

export function canChooseResolution(
  state: BottleState,
  cmd: { userId: string; resolution: Resolution },
): RuleViolation[] {
  if (state.status === 'DAMAGED') {
    return [violation('BOTTLE_DAMAGED')];
  }
  if (state.status === 'DRAFT') {
    if (state.initiatorId !== cmd.userId) {
      return [violation('NOT_INITIATOR')];
    }
  } else if (
    state.status !== 'HELD' ||
    state.holder === null ||
    state.holder.holderId !== cmd.userId
  ) {
    return [violation('NOT_HOLDER')];
  }
  if (!availableResolutions(state, cmd).includes(cmd.resolution)) {
    return [violation('RESOLUTION_NOT_AVAILABLE')];
  }
  return [];
}
