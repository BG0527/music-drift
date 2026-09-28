/**
 * 领域内核测试脚手架（只供测试使用，**不**从 `domain/index.ts` 导出）。
 *
 * 纪律来源：`CONTEXT.md` §3/§4/§7/§15/§16 与 `docs/architecture.md` ADR-005。
 * 本文件不含产品逻辑，只负责把「假时钟 + 顺序 ID」串成可读的测试步骤。
 */
import { expect } from 'vitest';
import type { DomainPolicy } from './constants';
import { chooseResolution, createBottle, drawBottle, putBack, recordSegment } from './bottle';
import type { CommandOutcome } from './outcome';
import { castVote } from './moderation';
import type { RuleCode } from './errors';
import {
  createDomainContext,
  createManualClock,
  createSequentialIds,
  type DomainContext,
  type ManualClock,
} from './ports';
import { currentHolderId, liveSegmentByIndex, liveSegments, parentOf } from './queries';
import type { BottleState, Segment, VoteValue } from './types';

export const HOUR = 60 * 60 * 1000;

export interface Harness {
  ctx: DomainContext;
  clock: ManualClock;
  advanceHours: (hours: number) => void;
}

export function createHarness(
  options: { start?: number; policy?: Partial<DomainPolicy> | undefined } = {},
): Harness {
  const clock = createManualClock(options.start ?? 0);
  const ctx = createDomainContext({
    clock,
    ids: createSequentialIds('seg'),
    policy: options.policy,
  });
  return {
    ctx,
    clock,
    advanceHours: (hours: number) => {
      clock.advance(hours * HOUR);
    },
  };
}

/** 按段序号取**有效**段（1-based）；找不到即抛错，让测试快速定位。 */
export function segmentByIndex(state: BottleState, index: number): Segment {
  const found = liveSegmentByIndex(state, index);
  if (found === null) {
    throw new Error(`找不到第 ${index} 有效段`);
  }
  return found;
}

/** 点踩 / 点赞（默认「听满」）。 */
export function voteBy(
  state: BottleState,
  ctx: DomainContext,
  cmd: { userId: string; segmentId: string; value: VoteValue; listenedRatio?: number },
): CommandOutcome {
  return castVote(
    state,
    {
      userId: cmd.userId,
      segmentId: cmd.segmentId,
      value: cmd.value,
      listenedRatio: cmd.listenedRatio ?? 1,
    },
    ctx,
  );
}

/** 连续点踩：返回最后一次结果。 */
export function dislikeTimes(
  state: BottleState,
  ctx: DomainContext,
  userIds: readonly string[],
  segmentId: string,
  listenedRatio = 1,
): CommandOutcome {
  let outcome: CommandOutcome = { ok: false, state, events: [], violations: [] };
  let current = state;
  for (const userId of userIds) {
    outcome = voteBy(current, ctx, { userId, segmentId, value: 'DISLIKE', listenedRatio });
    current = outcome.state;
  }
  return outcome;
}

/**
 * 结构不变式检查（ADR-015 §16.1：缺口合法，不再要求段号连续）：
 * - 有效段号必须落在 1..totalSegments 且不重复；
 * - 父链不得有环、不得指向系统哨兵 `'SYSTEM'`，且必须终止于发起者或 null（锚/父链起点）。
 * 返回违规描述数组（空数组 = 通过）。
 */
export function structureViolations(state: BottleState): string[] {
  const violations: string[] = [];
  const live = liveSegments(state);
  const seenIndexes = new Set<number>();
  for (const segment of live) {
    if (segment.index < 1 || segment.index > state.totalSegments) {
      violations.push(`段号越界：${segment.index}`);
    }
    if (seenIndexes.has(segment.index)) {
      violations.push(`段号重复：${segment.index}`);
    }
    seenIndexes.add(segment.index);
  }

  for (const segment of live) {
    const seen = new Set<string>();
    let cursor: string | null = segment.ownerId;
    while (cursor !== null) {
      if (cursor === 'SYSTEM') {
        violations.push('父链指向了系统哨兵 SYSTEM');
        break;
      }
      if (seen.has(cursor)) {
        violations.push(`父链出现环：${cursor}`);
        break;
      }
      seen.add(cursor);
      cursor = parentOf(state, cursor);
    }
    if (!seen.has(state.initiatorId) && parentOf(state, segment.ownerId) !== null) {
      violations.push(`第 ${segment.index} 段作者的父链没有回到发起者`);
    }
  }
  return violations;
}

export function codesOf(outcome: CommandOutcome): RuleCode[] {
  return outcome.violations.map((violation) => violation.code);
}

/** 断言命令被接受，返回新状态；否则抛出带违规码的错误方便定位。 */
export function expectOk(outcome: CommandOutcome): BottleState {
  if (!outcome.ok) {
    throw new Error(`预期命令被接受，实际违规：${codesOf(outcome).join(', ') || '(none)'}`);
  }
  return outcome.state;
}

/** 断言命令被拒绝，且违规码完全一致（顺序敏感，便于发现「第一个失败原因」优先级漂移）。 */
export function expectRejected(outcome: CommandOutcome, expected: RuleCode[]): void {
  expect(outcome.ok).toBe(false);
  expect(codesOf(outcome)).toEqual(expected);
}

/** 发起者录完第 1 段（状态 DRAFT）。 */
export function startBottle(ctx: DomainContext, initiatorId = 'u:A', bottleId = 'b1'): BottleState {
  const created = createBottle({ bottleId, songId: 'song-1', initiatorId }, ctx);
  return expectOk(recordSegment(created.state, { userId: initiatorId, note: null }, ctx));
}

/** 只建瓶、还没录第 1 段（状态 DRAFT）。 */
export function createDraft(ctx: DomainContext, initiatorId = 'u:A', bottleId = 'b1'): BottleState {
  return expectOk(createBottle({ bottleId, songId: 'song-1', initiatorId }, ctx));
}

/** 记录一次接唱（持有者必须是 userId）。 */
export function singBy(
  state: BottleState,
  ctx: DomainContext,
  userId: string,
  note: string | null = null,
): BottleState {
  return expectOk(recordSegment(state, { userId, note }, ctx));
}

/** 选择去向。 */
export function resolve(
  state: BottleState,
  ctx: DomainContext,
  userId: string,
  resolution: 'RIVER' | 'RETURN' | 'SEA',
): BottleState {
  return expectOk(chooseResolution(state, { userId, resolution }, ctx));
}

/** 回河道：不接唱，释放持有并让瓶子继续在河道漂流。 */
export function putBackBy(state: BottleState, ctx: DomainContext, userId: string): BottleState {
  return expectOk(putBack(state, { userId }, ctx));
}

/** 当前持有者把作品投入公海。 */
export function enterTheSea(state: BottleState, ctx: DomainContext): BottleState {
  const holderId = currentHolderId(state);
  if (holderId === null) {
    throw new Error('没有持有者，无法入海');
  }
  return resolve(state, ctx, holderId, 'SEA');
}

/** 捞取（拿到持有权）。 */
export function drawBy(state: BottleState, ctx: DomainContext, userId: string): BottleState {
  return expectOk(drawBottle(state, { userId }, ctx));
}

/** 捞取并接唱一段，返回新状态。 */
export function drawAndSing(state: BottleState, ctx: DomainContext, userId: string): BottleState {
  return singBy(drawBy(state, ctx, userId), ctx, userId);
}

/** 发起者投河。 */
export function castToRiverBy(state: BottleState, ctx: DomainContext, userId: string): BottleState {
  return resolve(state, ctx, userId, 'RIVER');
}

/**
 * 黄金路径片段：A 发起投河之后，依次让每个 singer 捞取接唱；
 * 除最后一位外都继续投河，因此返回时最后一位 singer 持有瓶子（尚未选去向）。
 */
export function driftWithSingers(
  state: BottleState,
  ctx: DomainContext,
  singers: string[],
): BottleState {
  let current = state;
  singers.forEach((singer, index) => {
    current = drawAndSing(current, ctx, singer);
    if (index < singers.length - 1) {
      current = castToRiverBy(current, ctx, singer);
    }
  });
  return current;
}
