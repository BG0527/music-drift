import { describe, expect, it } from 'vitest';
import { evaluateBadges } from './badges';
import { chooseResolution, drawBottle, recordSegment } from './bottle';
import {
  gaps,
  hasEverSung,
  isComplete,
  liveSegmentByIndex,
  liveSegments,
  missingSegmentIndexes,
  parentOf,
  replacementContext,
  seaZoneOf,
} from './queries';
import { availableResolutions } from './resolution';
import {
  castToRiverBy,
  createHarness,
  dislikeTimes,
  drawAndSing,
  expectOk,
  expectRejected,
  resolve,
  segmentByIndex,
  startBottle,
  structureViolations,
} from './test-support';

const TEN_VOTERS = [
  'u:X1',
  'u:X2',
  'u:X3',
  'u:X4',
  'u:X5',
  'u:X6',
  'u:X7',
  'u:X8',
  'u:X9',
  'u:X10',
];

/** A 投河 → B/C/D 依次接唱投河，最后一个 singer 持有（4 段完整版本）。 */
function fourSegmentsHeld(harness: ReturnType<typeof createHarness>) {
  const ctx = harness.ctx;
  let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
  state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
  state = castToRiverBy(drawAndSing(state, ctx, 'u:C'), ctx, 'u:C');
  return drawAndSing(state, ctx, 'u:D');
}

/** A1 → B2 → C3（C 持有，3 段、无缺口）。 */
function threeSegmentsHeld(harness: ReturnType<typeof createHarness>) {
  const ctx = harness.ctx;
  let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
  state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
  return drawAndSing(state, ctx, 'u:C');
}

describe('ADR-015 §16.2 — 完成判定与去向泛化', () => {
  it('16.2：isComplete 看缺口而不是段数', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const full = fourSegmentsHeld(harness);

    expect(gaps(full)).toEqual([]);
    expect(isComplete(full)).toBe(true);

    const gapped = dislikeTimes(full, ctx, TEN_VOTERS, segmentByIndex(full, 2).id).state;
    expect(gaps(gapped)).toEqual([2]);
    expect(isComplete(gapped)).toBe(false);
    expect(liveSegments(gapped)).toHaveLength(3); // 3 段但未完成：段数不再等于完成

    const refilled = drawAndSing(gapped, ctx, 'u:NEW');
    expect(isComplete(refilled)).toBe(true);
    expect(missingSegmentIndexes(refilled)).toEqual([]);
  });

  it('16.2：作品完整时不可继续投河（由「末段不可投河」泛化而来）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const full = fourSegmentsHeld(harness); // u:D 持有且完整

    expect(availableResolutions(full, { userId: 'u:D' })).toEqual(['RETURN', 'SEA']);
    expectRejected(chooseResolution(full, { userId: 'u:D', resolution: 'RIVER' }, ctx), [
      'RESOLUTION_NOT_AVAILABLE',
    ]);
  });

  it('16.2：还有缺口时持有者可以继续投河，把缺口交给下一棒', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const full = fourSegmentsHeld(harness);
    let state = dislikeTimes(full, ctx, TEN_VOTERS, segmentByIndex(full, 2).id).state; // gap 2
    state = dislikeTimes(state, ctx, TEN_VOTERS, segmentByIndex(state, 4).id).state; // gap 2、4
    const filler = drawAndSing(state, ctx, 'u:X'); // X 补齐第 2 段

    expect(gaps(filler)).toEqual([4]);
    expect(availableResolutions(filler, { userId: 'u:X' })).toEqual(['RIVER', 'RETURN', 'SEA']);
  });

  it('16.4：有缺口允许入海，但归入公海「未完成区」', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const full = fourSegmentsHeld(harness);
    let state = dislikeTimes(full, ctx, TEN_VOTERS, segmentByIndex(full, 2).id).state;
    state = dislikeTimes(state, ctx, TEN_VOTERS, segmentByIndex(state, 4).id).state;
    const filler = drawAndSing(state, ctx, 'u:X'); // 补完第 2 段，仍有缺口 4

    const atSea = resolve(filler, ctx, 'u:X', 'SEA');

    expect(atSea.status).toBe('SEA');
    expect(isComplete(atSea)).toBe(false);
    expect(seaZoneOf(atSea)).toBe('INCOMPLETE');
    expect(missingSegmentIndexes(atSea)).toEqual([4]);
  });

  it('16.4：完整作品入海归入「已完成区」', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const atSea = resolve(fourSegmentsHeld(harness), ctx, 'u:D', 'SEA');

    expect(atSea.status).toBe('SEA');
    expect(isComplete(atSea)).toBe(true);
    expect(seaZoneOf(atSea)).toBe('COMPLETED');
  });

  it('16.4：不在公海的作品没有公海分区', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    expect(seaZoneOf(startBottle(ctx))).toBe(null);
    expect(seaZoneOf(castToRiverBy(startBottle(ctx, 'u:B', 'b2'), ctx, 'u:B'))).toBe(null);
  });
});

describe('ADR-015 §16.5 — 补位上下文（听前一段 + 只告知「后面已有人」）', () => {
  it('16.5：补位上下文 = 缺口段号 + 缺口前一段（供补位者听）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const full = fourSegmentsHeld(harness);

    const gapped = dislikeTimes(full, ctx, TEN_VOTERS, segmentByIndex(full, 2).id).state;
    const context = replacementContext(gapped);

    expect(context).toEqual({
      gapIndex: 2,
      listenSegmentIndex: 1,
      listenSegmentId: liveSegmentByIndex(gapped, 1)?.id,
      hasLaterSegments: true,
    });
  });

  it('16.5：后面没有有效段时不提示「后面已有人」', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const twoSegments = drawAndSing(castToRiverBy(startBottle(ctx), ctx, 'u:A'), ctx, 'u:B');

    const gapped = dislikeTimes(
      twoSegments,
      ctx,
      TEN_VOTERS,
      segmentByIndex(twoSegments, 2).id,
    ).state;
    const context = replacementContext(gapped);

    expect(context?.gapIndex).toBe(2);
    expect(context?.listenSegmentIndex).toBe(1);
    expect(context?.hasLaterSegments).toBe(false);
  });

  it('16.5 终裁：缺口为第 1 段 = 锚被斩 → 作品判定为已损坏，不存在补位上下文', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const full = fourSegmentsHeld(harness);

    const anchorCut = dislikeTimes(full, ctx, TEN_VOTERS, segmentByIndex(full, 1).id).state;

    expect(anchorCut.status).toBe('DAMAGED');
    expect(replacementContext(anchorCut)).toBe(null);
  });

  it('16.5：补位上下文只给状态标志，不暴露后面是谁、也不暴露内容', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const full = fourSegmentsHeld(harness);

    const gapped = dislikeTimes(full, ctx, TEN_VOTERS, segmentByIndex(full, 2).id).state;
    const context = replacementContext(gapped);
    const serialized = JSON.stringify(context);

    expect(Object.keys(context ?? {}).sort()).toEqual([
      'gapIndex',
      'hasLaterSegments',
      'listenSegmentId',
      'listenSegmentIndex',
    ]);
    expect(serialized).not.toContain('u:C'); // 后面第 3 段的作者
    expect(serialized).not.toContain('u:D'); // 后面第 4 段的作者
    expect(serialized).not.toContain(segmentByIndex(gapped, 3).id);
    expect(serialized).not.toContain(segmentByIndex(gapped, 4).id);
  });

  it('16.5：没有缺口时没有补位上下文', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const full = fourSegmentsHeld(harness);
    const gapped = dislikeTimes(full, ctx, TEN_VOTERS, segmentByIndex(full, 2).id).state;

    expect(replacementContext(full)).toBe(null);
    expect(replacementContext(drawAndSing(gapped, ctx, 'u:NEW'))).toBe(null); // 补齐后无缺口
  });
});

describe('ADR-015 Q1（captain 裁决）— 父链指向前一段的作者，SYSTEM 永不进父链', () => {
  it('Q1：补位者的去向选项包含「回传」（补完仍有缺口时还可继续投河）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const full = fourSegmentsHeld(harness);
    let state = dislikeTimes(full, ctx, TEN_VOTERS, segmentByIndex(full, 2).id).state; // gap 2
    state = dislikeTimes(state, ctx, TEN_VOTERS, segmentByIndex(state, 4).id).state; // gap 2、4
    const filler = drawAndSing(state, ctx, 'u:NEW'); // 只补第 2 段

    expect(gaps(filler)).toEqual([4]);
    expect(availableResolutions(filler, { userId: 'u:NEW' })).toEqual(['RIVER', 'RETURN', 'SEA']);
    expect(parentOf(filler, 'u:NEW')).toBe('u:A'); // 缺口第 2 段的前一段（第 1 段）作者
  });

  it('Q1：补位者回传后 holder = 缺口前一段的作者', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const full = fourSegmentsHeld(harness);
    const gapped = dislikeTimes(full, ctx, TEN_VOTERS, segmentByIndex(full, 2).id).state;
    const filler = drawAndSing(gapped, ctx, 'u:NEW');

    const returned = resolve(filler, ctx, 'u:NEW', 'RETURN');

    expect(returned.holder?.holderId).toBe('u:A');
  });

  it('Q1：SYSTEM 只做守卫哨兵，绝不出现在父链里', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const full = fourSegmentsHeld(harness);
    const gapped = dislikeTimes(full, ctx, TEN_VOTERS, segmentByIndex(full, 2).id).state;
    expect(gapped.currentCasterId).toBe('SYSTEM');

    const filler = drawAndSing(gapped, ctx, 'u:NEW');

    expect(Object.keys(filler.parents)).not.toContain('SYSTEM');
    expect(Object.values(filler.parents)).not.toContain('SYSTEM');
    expect(Object.keys(filler.parents)).toEqual(['u:A', 'u:B', 'u:C', 'u:D', 'u:NEW']);
  });

  it('Q1（端到端）：斩掉第 2 段后陌生人补位，回传仍能把作品送回发起者', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    let state = threeSegmentsHeld(harness); // A1 → B2 → C3，C 持有
    const cutted = segmentByIndex(state, 2);

    state = dislikeTimes(state, ctx, TEN_VOTERS, cutted.id).state; // 斩第 2 段 → 系统重新投河
    expect(state.status).toBe('IN_RIVER');
    expect(state.currentCasterId).toBe('SYSTEM');

    state = drawAndSing(state, ctx, 'u:NEW'); // 陌生人补位第 2 段
    expect(liveSegmentByIndex(state, 2)?.ownerId).toBe('u:NEW');
    expect(gaps(state)).toEqual([4]); // 这首歌的第 4 段还空着：作品仍不完整
    expect(isComplete(state)).toBe(false);

    state = resolve(state, ctx, 'u:NEW', 'RETURN'); // 回传（父节点 = 第 1 段作者 u:A）
    expect(state.holder?.holderId).toBe('u:A');

    const finished = resolve(state, ctx, 'u:A', 'SEA');
    expect(finished.returnCompleted).toBe(true);
    expect(evaluateBadges(finished).map((award) => `${award.userId}:${award.kind}`)).toEqual([
      'u:A:RETURN_COMPLETED',
      'u:NEW:DRIFT_PARTICIPANT',
      'u:C:DRIFT_PARTICIPANT',
    ]);
  });
});

describe('ADR-015 §16.7 — 防捣乱：被斩段作者永久不得再参与', () => {
  it('16.7：被斩段作者不能再捞到该瓶子（含软删行的判定）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const full = fourSegmentsHeld(harness);

    const gapped = dislikeTimes(full, ctx, TEN_VOTERS, segmentByIndex(full, 2).id).state;

    expectRejected(drawBottle(gapped, { userId: 'u:B' }, ctx), ['ALREADY_SANG_IN_BOTTLE']);
  });

  it('16.5 终裁 + 16.7：锚被斩后作品 DAMAGED，即使发起者本人是受害者也不得重录', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const twoSegments = drawAndSing(castToRiverBy(startBottle(ctx), ctx, 'u:A'), ctx, 'u:B');

    const anchorCut = dislikeTimes(
      twoSegments,
      ctx,
      TEN_VOTERS,
      segmentByIndex(twoSegments, 1).id,
    ).state;

    expect(anchorCut.status).toBe('DAMAGED');
    expect(anchorCut.damagedAt).not.toBe(null);
    expectRejected(recordSegment(anchorCut, { userId: 'u:A', note: null }, ctx), [
      'BOTTLE_DAMAGED',
    ]); // §16.7 无例外
    expectRejected(drawBottle(anchorCut, { userId: 'u:NEW' }, ctx), ['BOTTLE_DAMAGED']); // 不进河道、不被补位
  });

  it('16.7：判定用的是「演过的所有段（含软删）」，不是有效段', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const full = fourSegmentsHeld(harness);

    const gapped = dislikeTimes(full, ctx, TEN_VOTERS, segmentByIndex(full, 2).id).state;

    expect(liveSegments(gapped).some((segment) => segment.ownerId === 'u:B')).toBe(false);
    expect(hasEverSung(gapped, 'u:B')).toBe(true);
    expect(hasEverSung(gapped, 'u:NEW')).toBe(false);
  });

  it('16.7：没有段的人可以正常捞取（防捣乱规则不误伤陌生人）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const full = fourSegmentsHeld(harness);
    const gapped = dislikeTimes(full, ctx, TEN_VOTERS, segmentByIndex(full, 2).id).state;

    expectOk(drawBottle(gapped, { userId: 'u:STRANGER' }, ctx));
  });

  it('16.7：未被斩的参与者也一样捞不回来（同一判定）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const full = fourSegmentsHeld(harness);
    const gapped = dislikeTimes(full, ctx, TEN_VOTERS, segmentByIndex(full, 2).id).state;

    expectRejected(drawBottle(gapped, { userId: 'u:C' }, ctx), ['ALREADY_SANG_IN_BOTTLE']);
  });
});

describe('ADR-015 §16.1 — 结构不变式（缺口合法，但结构不能坏）', () => {
  it('不变式：每一步之后段号都在 1..4 内不重复，父链不指 SYSTEM 且能回到发起者', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    let state = threeSegmentsHeld(harness); // A1 → B2 → C3
    expect(structureViolations(state)).toEqual([]);

    state = dislikeTimes(state, ctx, TEN_VOTERS, segmentByIndex(state, 2).id).state; // gap 2 → 系统重投河
    expect(structureViolations(state)).toEqual([]);

    state = drawAndSing(state, ctx, 'u:NEW'); // 补位第 2 段（父节点 = 第 1 段作者）
    expect(structureViolations(state)).toEqual([]);
    expect(parentOf(state, 'u:NEW')).toBe('u:A');

    state = castToRiverBy(state, ctx, 'u:NEW');
    state = drawAndSing(state, ctx, 'u:LATER'); // 补上第 4 段
    expect(structureViolations(state)).toEqual([]);
    expect(gaps(state)).toEqual([]);

    state = resolve(state, ctx, 'u:LATER', 'RETURN'); // 回传给它的父节点 u:NEW
    expect(state.holder?.holderId).toBe('u:NEW');
    state = resolve(state, ctx, 'u:NEW', 'RETURN'); // u:NEW 的父节点是 u:A
    expect(state.holder?.holderId).toBe('u:A');
    expect(structureViolations(state)).toEqual([]);
  });
});
