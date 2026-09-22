/**
 * 限时漂流（`CONTEXT.md` §11.3）：投河 72h 无人接唱、回传决策 48h 超时。
 *
 * 时间一律来自注入时钟；事件时间取**到期时刻**（= 起点 + 时限）而不是「被发现超时的时刻」，
 * 这样批量扫描的调用时机不会影响事件流，重放结果保持稳定。
 */
import type { DomainEvent } from './events';
import { accepted, type CommandOutcome } from './outcome';
import type { DomainContext } from './ports';
import type { BottleState } from './types';

export function applyTimeouts(state: BottleState, ctx: DomainContext): CommandOutcome {
  const now = ctx.clock.now();

  if (state.status === 'IN_RIVER' && state.riverCastAt !== null) {
    const deadline = state.riverCastAt + ctx.policy.riverIdleTimeoutMs;
    if (now >= deadline) {
      return accepted(state, [riverTimeoutEvent(state, deadline, ctx)]);
    }
    return accepted(state, []);
  }

  if (state.status === 'HELD' && state.holder !== null && state.holder.origin !== 'DRAW') {
    // 「收到回传 / 被系统退回」的持有者必须做决定；自己捞上来的不在此列（明确边界）。
    const deadline = state.holder.acquiredAt + ctx.policy.returnDecisionTimeoutMs;
    if (now >= deadline) {
      return accepted(state, [
        {
          type: 'BOTTLE_WENT_TO_SEA',
          bottleId: state.id,
          at: deadline,
          actorId: 'SYSTEM',
          reason: 'RETURN_DECISION_TIMEOUT',
          returnCompleted: false,
          chainBroken: state.holder.origin === 'RETURN',
        },
      ]);
    }
    return accepted(state, []);
  }

  return accepted(state, []);
}

/** D-13 可注入：默认入海；另一候选是把瓶子退回发起者（系统行为，不算「回传完成」）。 */
function riverTimeoutEvent(state: BottleState, at: number, ctx: DomainContext): DomainEvent {
  if (ctx.policy.riverTimeoutOutcome === 'RETURN_TO_OWNER') {
    // 系统把瓶子退回发起者重做决定；这不是「回传完成」，所以不发大徽章（timeout.test.ts 覆盖）。
    return {
      type: 'BOTTLE_REWOUND',
      bottleId: state.id,
      at,
      actorId: 'SYSTEM',
      toUserId: state.initiatorId,
      cutOwnerId: state.initiatorId,
      targetStatus: 'HELD',
    };
  }
  return {
    type: 'BOTTLE_WENT_TO_SEA',
    bottleId: state.id,
    at,
    actorId: 'SYSTEM',
    reason: 'RIVER_IDLE_TIMEOUT',
    returnCompleted: false,
    chainBroken: false,
  };
}
