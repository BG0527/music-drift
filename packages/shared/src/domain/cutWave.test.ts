import { describe, expect, it } from 'vitest';
import { evaluateBadges } from './badges';
import { drawBottle } from './bottle';
import { publicSegments } from './moderation';
import { isComplete, liveSegmentByIndex, liveSegments, participants } from './queries';
import {
  castToRiverBy,
  createHarness,
  dislikeTimes,
  driftWithSingers,
  drawAndSing,
  enterTheSea,
  expectRejected,
  resolve,
  segmentByIndex,
  startBottle,
  voteBy,
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

/** A 投河 → B/C/D 依次接唱投河，最后一个 singer 持有（4 段版本）。 */
function fourSegmentsHeld(harness: ReturnType<typeof createHarness>) {
  const ctx = harness.ctx;
  return driftWithSingers(castToRiverBy(startBottle(ctx), ctx, 'u:A'), ctx, ['u:B', 'u:C', 'u:D']);
}

describe('CONTEXT §7 / §16 — 斩浪与投票', () => {
  it('规则7：某段被踩数达到阈值（默认 10）自动斩浪', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);
    const target = segmentByIndex(holding, 2);

    const outcome = dislikeTimes(holding, ctx, TEN_VOTERS, target.id);

    expect(outcome.ok).toBe(true);
    expect(outcome.state.segments.find((segment) => segment.id === target.id)?.deletedAt).not.toBe(
      null,
    );
  });

  it('规则7：点赞与斩杀完全解耦：点赞不抵消点踩，也不提高阈值', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);
    const target = segmentByIndex(holding, 2);

    let state = holding;
    for (let i = 0; i < 50; i += 1) {
      state = voteBy(state, ctx, { userId: `u:L${i}`, segmentId: target.id, value: 'LIKE' }).state;
    }
    const afterNine = dislikeTimes(state, ctx, TEN_VOTERS.slice(0, 9), target.id);

    const stillThere = afterNine.state.segments.find((segment) => segment.id === target.id);
    expect(stillThere?.deletedAt).toBe(null);
    expect(stillThere?.dislikes).toHaveLength(9);
    expect(stillThere?.likes).toHaveLength(50);

    const tenth = dislikeTimes(afterNine.state, ctx, ['u:X10'], target.id);
    expect(tenth.state.segments.find((segment) => segment.id === target.id)?.deletedAt).not.toBe(
      null,
    );
  });

  it('规则7：斩杀阈值可注入（Demo 默认 10）', () => {
    const harness = createHarness({ policy: { dislikeThreshold: 2 } });
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);
    const target = segmentByIndex(holding, 2);

    const oneVote = dislikeTimes(holding, ctx, ['u:X1'], target.id);
    expect(oneVote.state.segments.find((segment) => segment.id === target.id)?.deletedAt).toBe(
      null,
    );

    const twoVotes = dislikeTimes(holding, ctx, ['u:X1', 'u:X2'], target.id);
    expect(twoVotes.state.segments.find((segment) => segment.id === target.id)?.deletedAt).not.toBe(
      null,
    );
  });

  it('规则7：同一用户对同一段只能踩一次', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);
    const target = segmentByIndex(holding, 2);
    const once = voteBy(holding, ctx, { userId: 'u:X1', segmentId: target.id, value: 'DISLIKE' });

    const twice = voteBy(once.state, ctx, {
      userId: 'u:X1',
      segmentId: target.id,
      value: 'DISLIKE',
    });

    expectRejected(twice, ['DISLIKE_ALREADY_CAST']);
    expect(once.state.segments.find((segment) => segment.id === target.id)?.dislikes).toEqual([
      'u:X1',
    ]);
  });

  it('规则7：同一用户对同一段只能点一次赞', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);
    const target = segmentByIndex(holding, 2);
    const once = voteBy(holding, ctx, { userId: 'u:X1', segmentId: target.id, value: 'LIKE' });

    expectRejected(
      voteBy(once.state, ctx, { userId: 'u:X1', segmentId: target.id, value: 'LIKE' }),
      ['LIKE_ALREADY_CAST'],
    );
  });

  it('规则7：作者不能踩自己的段', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);
    const ownSegment = segmentByIndex(holding, 2); // u:B 的段

    expectRejected(
      voteBy(holding, ctx, { userId: 'u:B', segmentId: ownSegment.id, value: 'DISLIKE' }),
      ['CANNOT_DISLIKE_OWN_SEGMENT'],
    );
  });

  it('规则7：必须听满 80% 才能点踩（79.9% 拒绝、80% 通过）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);
    const target = segmentByIndex(holding, 2);

    const tooLow = voteBy(holding, ctx, {
      userId: 'u:X1',
      segmentId: target.id,
      value: 'DISLIKE',
      listenedRatio: 0.799,
    });
    expectRejected(tooLow, ['LISTEN_RATIO_TOO_LOW']);

    const atBoundary = voteBy(holding, ctx, {
      userId: 'u:X1',
      segmentId: target.id,
      value: 'DISLIKE',
      listenedRatio: 0.8,
    });
    expect(atBoundary.ok).toBe(true);
  });

  it('规则7：被斩的段不留公海遗迹（段号保留在歌的原位置）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);
    const cutted = segmentByIndex(holding, 2);

    const afterCut = dislikeTimes(holding, ctx, TEN_VOTERS, cutted.id).state;

    expect(publicSegments(afterCut).map((segment) => segment.ownerId)).toEqual([
      'u:A',
      'u:C',
      'u:D',
    ]);
    expect(publicSegments(afterCut).map((segment) => segment.index)).toEqual([1, 3, 4]); // 不压缩
    expect(afterCut.segments).toHaveLength(4); // 软删除保住审计痕迹，但不对外展示
    expect(afterCut.segments.find((segment) => segment.id === cutted.id)?.deletedAt).not.toBe(null);
  });

  it('规则7：被斩的段不能再被点赞或点踩', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);
    const cutted = segmentByIndex(holding, 2);
    const afterCut = dislikeTimes(holding, ctx, TEN_VOTERS, cutted.id).state;

    expectRejected(voteBy(afterCut, ctx, { userId: 'u:Y1', segmentId: cutted.id, value: 'LIKE' }), [
      'SEGMENT_ALREADY_CUT',
    ]);
  });

  it('规则7：被斩段的作者不再计入最终版本参与者（历史段仍软删除保留）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);
    const cutted = segmentByIndex(holding, 2);

    const afterCut = dislikeTimes(holding, ctx, TEN_VOTERS, cutted.id).state;

    expect(participants(afterCut).map((record) => record.userId)).toEqual(['u:A', 'u:C', 'u:D']);
  });
});

describe('ADR-015 §16.3 — 斩浪后的流转（GAP_TRIGGER：系统自动重新投河）', () => {
  it('16.3：斩浪后系统把作品置回河道：IN_RIVER / holder=null / currentCasterId=SYSTEM', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);

    const afterCut = dislikeTimes(holding, ctx, TEN_VOTERS, segmentByIndex(holding, 2).id).state;

    expect(afterCut.status).toBe('IN_RIVER');
    expect(afterCut.holder).toBe(null);
    expect(afterCut.currentCasterId).toBe('SYSTEM');
    expect(afterCut.riverCastAt).not.toBe(null);
  });

  it('16.3：不再把责任转嫁给前驱段作者（旧 BOTTLE_REWOUND 路径废弃）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);

    const outcome = dislikeTimes(holding, ctx, TEN_VOTERS, segmentByIndex(holding, 3).id); // 前驱段作者是 u:B

    expect(outcome.events.map((event) => event.type).slice(-2)).toEqual([
      'SEGMENT_CUT',
      'BOTTLE_GAP_OPENED',
    ]);
    expect(outcome.events.some((event) => event.type === 'BOTTLE_REWOUND')).toBe(false);
    expect(outcome.state.holder).toBe(null);
    expect(outcome.state.holder?.holderId).not.toBe('u:B');
  });

  it('16.3：已入海的作品被斩 → 从公海撤下并置回 IN_RIVER', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    let state = fourSegmentsHeld(harness);
    state = resolve(state, ctx, 'u:D', 'RETURN');
    state = resolve(state, ctx, 'u:C', 'RETURN');
    state = resolve(state, ctx, 'u:B', 'RETURN');
    const atSea = enterTheSea(state, ctx);
    expect(atSea.status).toBe('SEA');
    expect(atSea.returnCompleted).toBe(true);

    const pulled = dislikeTimes(atSea, ctx, TEN_VOTERS, segmentByIndex(atSea, 2).id).state;

    expect(pulled.status).toBe('IN_RIVER');
    expect(pulled.seaAt).toBe(null);
    expect(pulled.holder).toBe(null);
    expect(pulled.currentCasterId).toBe('SYSTEM');
    expect(evaluateBadges(pulled).filter((award) => award.kind === 'RETURN_COMPLETED')).toEqual([]);
  });

  it('16.3：作品被斩空（一段不剩）→ 降级为 DAMAGED', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const single = startBottle(ctx); // 只有发起者第 1 段

    const afterCut = dislikeTimes(single, ctx, TEN_VOTERS, segmentByIndex(single, 1).id).state;

    expect(liveSegments(afterCut)).toHaveLength(0);
    expect(afterCut.status).toBe('DAMAGED');
    expect(afterCut.damagedAt).not.toBe(null);
    expectRejected(drawBottle(afterCut, { userId: 'u:E' }, ctx), ['BOTTLE_DAMAGED']);
  });

  it('16.5 终裁：缺口为第 1 段（锚被斩）→ DAMAGED，不进河道、不再有缺口可补', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);

    const outcome = dislikeTimes(holding, ctx, TEN_VOTERS, segmentByIndex(holding, 1).id);
    const anchorCut = outcome.state;

    expect(anchorCut.status).toBe('DAMAGED');
    expect(anchorCut.holder).toBe(null);
    expect(anchorCut.seaAt).toBe(null);
    expect(outcome.events.map((event) => event.type).slice(-2)).toEqual([
      'SEGMENT_CUT',
      'BOTTLE_DAMAGED',
    ]);
    expect(outcome.events.some((event) => event.type === 'BOTTLE_GAP_OPENED')).toBe(false);
    expect(outcome.events.at(-1)).toMatchObject({
      type: 'BOTTLE_DAMAGED',
      reason: 'ANCHOR_SEGMENT_CUT',
    });
    expectRejected(drawBottle(anchorCut, { userId: 'u:NEW' }, ctx), ['BOTTLE_DAMAGED']);
  });

  it('16.5 终裁（回归）：缺口 >= 2 的路径不受锚规则影响', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);

    const afterCut = dislikeTimes(holding, ctx, TEN_VOTERS, segmentByIndex(holding, 2).id).state;

    expect(afterCut.status).toBe('IN_RIVER');
    expect(afterCut.damagedAt).toBe(null);
  });

  it('16.3：斩浪后由陌生人在河道补位；原作者与参与者都捞不回来', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);
    const afterCut = dislikeTimes(holding, ctx, TEN_VOTERS, segmentByIndex(holding, 2).id).state;

    expectRejected(drawBottle(afterCut, { userId: 'u:B' }, ctx), ['ALREADY_SANG_IN_BOTTLE']); // 被斩段作者
    expectRejected(drawBottle(afterCut, { userId: 'u:C' }, ctx), ['ALREADY_SANG_IN_BOTTLE']); // 其他参与者

    const refilled = drawAndSing(afterCut, ctx, 'u:NEW');
    expect(liveSegmentByIndex(refilled, 2)?.ownerId).toBe('u:NEW');
    expect(isComplete(refilled)).toBe(true);
  });
});
