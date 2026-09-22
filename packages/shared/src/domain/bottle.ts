/**
 * 漂流瓶状态机（父链 + 持有权 + 去向三选一）。
 *
 * 零 IO：所有时间/ID 来自 `DomainContext`（ADR-005 不变式 4）；
 * 守卫命名 `can<Action>` 返回 `RuleViolation[]`（不抛异常、不返回裸布尔）。
 */
import { violation, type RuleViolation } from './errors';
import type { HoldingRegistry } from './holding';
import { emptyBottleState, type DomainEvent } from './events';
import { accepted, rejected, type CommandOutcome } from './outcome';
import type { DomainContext } from './ports';
import { hasEverSung, isComplete, nextRecordIndex, parentOf, resolveDrawParent } from './queries';
import { canChooseResolution } from './resolution';
import type { BottleState, Resolution } from './types';

export interface CreateBottleCommand {
  bottleId: string;
  songId: string;
  initiatorId: string;
  totalSegments?: number | undefined;
}

/** 建瓶（`CONTEXT.md` §3.1）：发起者随后录第 1 段。 */
export function createBottle(cmd: CreateBottleCommand, ctx: DomainContext): CommandOutcome {
  const at = ctx.clock.now();
  const event: DomainEvent = {
    type: 'BOTTLE_CREATED',
    bottleId: cmd.bottleId,
    at,
    actorId: cmd.initiatorId,
    songId: cmd.songId,
    initiatorId: cmd.initiatorId,
    totalSegments: cmd.totalSegments ?? ctx.policy.totalSegments,
  };
  return accepted(emptyBottleState(), [event]);
}

export function canRecordSegment(state: BottleState, cmd: { userId: string }): RuleViolation[] {
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
  if (isComplete(state)) {
    // 末段已录满：先提示「选去向」，再说重复接唱。
    return [violation('BOTTLE_ALREADY_COMPLETE')];
  }
  if (hasEverSung(state, cmd.userId)) {
    // 同一用户不能在同一瓶子中接唱两次（CONTEXT §4.3 / §10.1）；
    // 判定含**被斩的软删行** → 被斩段作者永久不能再接唱（ADR-015 §16.7，有专门测试钉住）。
    return [violation('CANNOT_RECORD_TWICE_IN_BOTTLE')];
  }
  return [];
}

/** 录一段接唱（发起者录第 1 段，或持有者录下一段）。 */
export function recordSegment(
  state: BottleState,
  cmd: { userId: string; note: string | null },
  ctx: DomainContext,
): CommandOutcome {
  const violations = canRecordSegment(state, cmd);
  if (violations.length > 0) {
    return rejected(state, violations);
  }
  const event: DomainEvent = {
    type: 'SEGMENT_RECORDED',
    bottleId: state.id,
    at: ctx.clock.now(),
    actorId: cmd.userId,
    segmentId: ctx.ids.next(),
    index: nextRecordIndex(state),
    note: cmd.note,
  };
  return accepted(state, [event]);
}

export function canDrawBottle(state: BottleState, cmd: { userId: string }): RuleViolation[] {
  if (state.status === 'DAMAGED') {
    return [violation('BOTTLE_DAMAGED')];
  }
  if (state.holder !== null) {
    // 同一瓶子同一时间只有一个持有者（CONTEXT §15 / §16）。
    return [violation('HOLDING_ALREADY_TAKEN')];
  }
  if (state.status !== 'IN_RIVER') {
    return [violation('BOTTLE_NOT_IN_RIVER')];
  }
  if (state.currentCasterId === cmd.userId) {
    // 不能接自己投出的瓶子（CONTEXT §4.3 / §16）。
    // 排在最前：发起者必定有段落，若先判「演唱过」会永远掩盖这条更具体的规则。
    return [violation('CANNOT_DRAW_OWN_BOTTLE')];
  }
  if (hasEverSung(state, cmd.userId)) {
    // 演唱过的瓶子永不再捞给同一用户（CONTEXT §15）；含被斩的软删行（ADR-015 §16.7）。
    return [violation('ALREADY_SANG_IN_BOTTLE')];
  }
  return [];
}

/** 捞取：拿到持有权（父节点 = 投出者）。 */
export function drawBottle(
  state: BottleState,
  cmd: { userId: string },
  ctx: DomainContext,
): CommandOutcome {
  const violations = canDrawBottle(state, cmd);
  if (violations.length > 0) {
    return rejected(state, violations);
  }
  const event: DomainEvent = {
    type: 'BOTTLE_DRAWN',
    bottleId: state.id,
    at: ctx.clock.now(),
    actorId: cmd.userId,
    parentId: resolveDrawParent(state),
  };
  return accepted(state, [event]);
}

export function canPutBack(state: BottleState, cmd: { userId: string }): RuleViolation[] {
  if (state.status === 'DAMAGED') {
    return [violation('BOTTLE_DAMAGED')];
  }
  if (state.status !== 'HELD' || state.holder === null || state.holder.holderId !== cmd.userId) {
    return [violation('NOT_HOLDER')];
  }
  if (state.holder.origin === 'RETURN') {
    // 收到回传的人必须在 投河/回传/入海 中选一个，不能默默放回（CONTEXT §4.3）。
    return [violation('RESOLUTION_NOT_AVAILABLE')];
  }
  return [];
}

/** 放回海中：不接唱，把瓶子放回河道（CONTEXT §3.2 / §15）。 */
export function putBack(
  state: BottleState,
  cmd: { userId: string },
  ctx: DomainContext,
): CommandOutcome {
  const violations = canPutBack(state, cmd);
  if (violations.length > 0) {
    return rejected(state, violations);
  }
  const event: DomainEvent = {
    type: 'BOTTLE_PUT_BACK',
    bottleId: state.id,
    at: ctx.clock.now(),
    actorId: cmd.userId,
    cooldownDraws: ctx.policy.putBackCooldownDraws,
  };
  return accepted(state, [event]);
}

/**
 * 抢占式捞取：先原子申请持有者锁，再执行捞取；锁申请失败即拒绝，绝不留孤儿锁。
 * 这是「并发接唱只有第一个生效」的落点（CONTEXT §15 / §16）。
 */
export function claimBottle(
  state: BottleState,
  cmd: { userId: string },
  ctx: DomainContext,
  registry: HoldingRegistry,
): CommandOutcome {
  const violations = canDrawBottle(state, cmd);
  if (violations.length > 0) {
    return rejected(state, violations);
  }
  const claim = registry.tryAcquire({
    bottleId: state.id,
    holderId: cmd.userId,
    acquiredAt: ctx.clock.now(),
  });
  if (!claim.ok) {
    return rejected(state, claim.violations);
  }
  const outcome = drawBottle(state, cmd, ctx);
  if (!outcome.ok) {
    // 防御：状态机拒绝时把刚拿到的锁还回去。
    registry.release(state.id, cmd.userId);
  }
  return outcome;
}

/** 选去向：投河 / 回传 / 入海（三选一）。 */
export function chooseResolution(
  state: BottleState,
  cmd: { userId: string; resolution: Resolution },
  ctx: DomainContext,
): CommandOutcome {
  const violations = canChooseResolution(state, cmd);
  if (violations.length > 0) {
    return rejected(state, violations);
  }
  const at = ctx.clock.now();
  const bottleId = state.id;

  if (cmd.resolution === 'RIVER') {
    return accepted(state, [{ type: 'BOTTLE_CAST_TO_RIVER', bottleId, at, actorId: cmd.userId }]);
  }

  if (cmd.resolution === 'RETURN') {
    const toUserId = parentOf(state, cmd.userId);
    if (toUserId === null) {
      // 父链顶端（发起者）没有可回传的对象；不可选状态本该拦下这里。
      return rejected(state, [violation('RESOLUTION_NOT_AVAILABLE')]);
    }
    return accepted(state, [
      { type: 'BOTTLE_RETURNED', bottleId, at, actorId: cmd.userId, toUserId },
    ]);
  }

  const holder = state.holder;
  const returnCompleted =
    holder !== null && holder.origin === 'RETURN' && cmd.userId === state.initiatorId;
  const chainBroken = holder !== null && holder.origin === 'RETURN' && !returnCompleted;
  return accepted(state, [
    {
      type: 'BOTTLE_WENT_TO_SEA',
      bottleId,
      at,
      actorId: cmd.userId,
      reason: 'RESOLUTION',
      returnCompleted,
      chainBroken,
    },
  ]);
}
