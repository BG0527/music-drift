/**
 * 河道与随机打捞（`CONTEXT.md` §3.2 / §15）。
 *
 * 河道是**单支路随机池**：只能随机打捞，不提供搜索或指定。
 * 冷却计数属于「用户 × 河道」而非瓶子，所以放在 `RiverState` 里，
 * 不污染 `BottleState`（瓶子状态机只关心自己）。
 */
import { canDrawBottle } from './bottle';
import { violation, type RuleViolation } from './errors';
import type { RandomSource } from './ports';
import type { BottleState } from './types';

export interface DrawExclusion {
  userId: string;
  bottleId: string;
  /** 该用户的第 N 次打捞尝试（含）之前都排除；N 由放回时的次数 + cooldown 得出。 */
  untilDrawOrdinal: number;
}

export interface RiverState {
  /** 每个用户已经发起过的打捞尝试次数（冷却计数的基准）。 */
  drawCounts: Record<string, number>;
  exclusions: DrawExclusion[];
}

export interface RiverDrawOutcome {
  ok: boolean;
  bottleId: string | null;
  river: RiverState;
  violations: RuleViolation[];
}

export function createRiverState(): RiverState {
  return { drawCounts: {}, exclusions: [] };
}

/** 记一次打捞尝试（无论是否捞到），并顺手清掉过期冷却。 */
export function recordDrawAttempt(river: RiverState, userId: string): RiverState {
  const ordinal = (river.drawCounts[userId] ?? 0) + 1;
  return {
    drawCounts: { ...river.drawCounts, [userId]: ordinal },
    exclusions: river.exclusions.filter((exclusion) => exclusion.untilDrawOrdinal >= ordinal),
  };
}

/** 未演唱直接放回：接下来 N 次打捞不再给同一用户（CONTEXT §15，N = 10）。 */
export function recordPutBack(
  river: RiverState,
  cmd: { userId: string; bottleId: string; cooldownDraws: number },
): RiverState {
  const ordinal = river.drawCounts[cmd.userId] ?? 0;
  const kept = river.exclusions.filter(
    (exclusion) => !(exclusion.userId === cmd.userId && exclusion.bottleId === cmd.bottleId),
  );
  return {
    drawCounts: { ...river.drawCounts },
    exclusions: [
      ...kept,
      { userId: cmd.userId, bottleId: cmd.bottleId, untilDrawOrdinal: ordinal + cmd.cooldownDraws },
    ],
  };
}

export function isDrawExcluded(
  river: RiverState,
  cmd: { userId: string; bottleId: string },
): boolean {
  const ordinal = river.drawCounts[cmd.userId] ?? 0;
  return river.exclusions.some(
    (exclusion) =>
      exclusion.userId === cmd.userId &&
      exclusion.bottleId === cmd.bottleId &&
      exclusion.untilDrawOrdinal >= ordinal,
  );
}

/** 该用户此刻能捞到的候选瓶子（规则判定全部复用领域守卫，避免规则两份）。 */
export function eligibleBottlesFor(
  bottles: readonly BottleState[],
  river: RiverState,
  cmd: { userId: string },
): BottleState[] {
  return bottles.filter(
    (bottle) =>
      canDrawBottle(bottle, cmd).length === 0 &&
      !isDrawExcluded(river, { userId: cmd.userId, bottleId: bottle.id }),
  );
}

/** 随机打捞：从合格候选里按注入的随机源选一个。 */
export function drawFromRiver(input: {
  bottles: readonly BottleState[];
  river: RiverState;
  userId: string;
  random: RandomSource;
}): RiverDrawOutcome {
  const river = recordDrawAttempt(input.river, input.userId);
  const eligible = eligibleBottlesFor(input.bottles, river, { userId: input.userId });
  const picked = pick(eligible, input.random);
  if (picked === null) {
    return { ok: false, bottleId: null, river, violations: [violation('NO_BOTTLE_AVAILABLE')] };
  }
  return { ok: true, bottleId: picked.id, river, violations: [] };
}

function pick(candidates: readonly BottleState[], random: RandomSource): BottleState | null {
  if (candidates.length === 0) {
    return null;
  }
  const raw = Math.floor(random() * candidates.length);
  const index = Math.min(Math.max(raw, 0), candidates.length - 1);
  return candidates[index] ?? null;
}
