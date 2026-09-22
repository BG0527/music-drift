/**
 * 命令结果契约（ADR-005：守卫不抛异常）。
 *
 * 被拒绝时 `state` 是**原对象的同一引用**、`events` 为空 —— 用来在测试里断言「被拒绝 = 零副作用」。
 */
import type { DomainEvent } from './events';
import { reduceBottle } from './events';
import type { RuleViolation } from './errors';
import type { BottleState } from './types';

export interface CommandOutcome {
  ok: boolean;
  state: BottleState;
  events: DomainEvent[];
  violations: RuleViolation[];
}

/** 接受：把事件折叠进状态（状态转移的唯一实现路径）。 */
export function accepted(state: BottleState, events: DomainEvent[]): CommandOutcome {
  return { ok: true, state: events.reduce(reduceBottle, state), events, violations: [] };
}

/** 拒绝：不改状态、不产事件。 */
export function rejected(state: BottleState, violations: RuleViolation[]): CommandOutcome {
  return { ok: false, state, events: [], violations };
}
