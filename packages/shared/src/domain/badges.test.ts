import { describe, expect, it } from 'vitest';
import { evaluateBadges } from './badges';
import { enterTheSea } from './test-support';
import {
  castToRiverBy,
  createHarness,
  driftWithSingers,
  drawAndSing,
  expectOk,
  resolve,
  startBottle,
} from './test-support';
import { applyTimeouts } from './timeouts';

describe('CONTEXT §10.1 — 徽章判定', () => {
  it('规则9：大徽章 = 发起者 + 最终回传完成并入海', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
    state = drawAndSing(state, ctx, 'u:C');
    state = resolve(state, ctx, 'u:C', 'RETURN');
    state = resolve(state, ctx, 'u:B', 'RETURN');
    state = resolve(state, ctx, 'u:A', 'SEA');

    const awards = evaluateBadges(state);

    expect(awards.filter((award) => award.kind === 'RETURN_COMPLETED')).toEqual([
      { userId: 'u:A', kind: 'RETURN_COMPLETED', bottleId: state.id, grantedAt: state.seaAt },
    ]);
  });

  it('规则9：小徽章 = 最终版本的所有接唱者（不含发起者）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const state = enterTheSea(
      drawAndSing(castToRiverBy(startBottle(ctx), ctx, 'u:A'), ctx, 'u:B'),
      ctx,
    );

    const awards = evaluateBadges(state).filter((award) => award.kind === 'DRIFT_PARTICIPANT');

    expect(awards.map((award) => award.userId)).toEqual(['u:B']);
  });

  it('规则9：四人版本回传完成后，三位接唱者都得小徽章', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    let state = driftWithSingers(castToRiverBy(startBottle(ctx), ctx, 'u:A'), ctx, [
      'u:B',
      'u:C',
      'u:D',
    ]);
    state = resolve(state, ctx, 'u:D', 'RETURN');
    state = resolve(state, ctx, 'u:C', 'RETURN');
    state = resolve(state, ctx, 'u:B', 'RETURN');
    state = resolve(state, ctx, 'u:A', 'SEA');

    const awards = evaluateBadges(state);

    expect(
      awards.filter((award) => award.kind === 'RETURN_COMPLETED').map((award) => award.userId),
    ).toEqual(['u:A']);
    expect(
      awards.filter((award) => award.kind === 'DRIFT_PARTICIPANT').map((award) => award.userId),
    ).toEqual(['u:B', 'u:C', 'u:D']);
  });

  it('规则9：回传中断 → 没有「回传完成」徽章，但参与者仍有漂流参与记录', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
    state = drawAndSing(state, ctx, 'u:C');
    const broken = resolve(resolve(state, ctx, 'u:C', 'RETURN'), ctx, 'u:B', 'SEA');

    const awards = evaluateBadges(broken);

    expect(awards.filter((award) => award.kind === 'RETURN_COMPLETED')).toEqual([]);
    expect(
      awards.filter((award) => award.kind === 'DRIFT_PARTICIPANT').map((award) => award.userId),
    ).toEqual(['u:B', 'u:C']);
  });

  it('规则9：投河超时自动入海不发大徽章', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
    harness.advanceHours(72);
    const expired = expectOk(applyTimeouts(state, ctx));

    const awards = evaluateBadges(expired);
    expect(awards.filter((award) => award.kind === 'RETURN_COMPLETED')).toEqual([]);
    expect(
      awards.filter((award) => award.kind === 'DRIFT_PARTICIPANT').map((award) => award.userId),
    ).toEqual(['u:B']);
  });

  it('规则9：漂流中的瓶子不发徽章', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const drifting = drawAndSing(castToRiverBy(startBottle(ctx), ctx, 'u:A'), ctx, 'u:B');

    expect(evaluateBadges(drifting)).toEqual([]);
  });

  it('规则9：同一 (用户, 瓶子, 徽章类型) 只判一次，重复判定结果稳定', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const atSea = enterTheSea(
      drawAndSing(castToRiverBy(startBottle(ctx), ctx, 'u:A'), ctx, 'u:B'),
      ctx,
    );

    const once = evaluateBadges(atSea);
    const twice = evaluateBadges(atSea);

    expect(twice).toEqual(once);
    expect(new Set(once.map((award) => `${award.userId}:${award.kind}`)).size).toBe(once.length);
  });
});
