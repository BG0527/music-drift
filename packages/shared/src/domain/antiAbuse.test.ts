import { describe, expect, it } from 'vitest';
import { chooseResolution, drawBottle, recordSegment } from './bottle';
import {
  castToRiverBy,
  createDraft,
  createHarness,
  drawAndSing,
  drawBy,
  expectRejected,
  resolve,
  singBy,
  startBottle,
} from './test-support';

describe('CONTEXT §4.3 / §16 — 防滥用：同瓶不接两次、不接自己的瓶', () => {
  it('规则4：同一用户不能在同一瓶子接唱两次', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
    state = drawAndSing(state, ctx, 'u:C');
    const backToB = resolve(state, ctx, 'u:C', 'RETURN'); // B 重新持有

    const outcome = recordSegment(backToB, { userId: 'u:B', note: null }, ctx);

    expectRejected(outcome, ['CANNOT_RECORD_TWICE_IN_BOTTLE']);
    expect(outcome.state).toBe(backToB);
    expect(outcome.events).toEqual([]);
  });

  it('规则4：不能接自己投出的瓶子', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const cast = castToRiverBy(startBottle(ctx), ctx, 'u:A');

    expectRejected(drawBottle(cast, { userId: 'u:A' }, ctx), ['CANNOT_DRAW_OWN_BOTTLE']);
  });

  it('规则4：自己投出且接唱过的瓶子，报「不能接自己投出的瓶子」（更具体的那条）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    state = drawAndSing(state, ctx, 'u:B');
    const recast = resolve(state, ctx, 'u:B', 'RIVER');

    expectRejected(drawBottle(recast, { userId: 'u:B' }, ctx), ['CANNOT_DRAW_OWN_BOTTLE']);
  });

  it('规则4：只有持有者能接唱，他人接唱被拒绝且零副作用', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    const held = drawBy(castToRiverBy(startBottle(ctx), ctx, 'u:A'), ctx, 'u:B');
    const outcome = recordSegment(held, { userId: 'u:C', note: null }, ctx);

    expectRejected(outcome, ['NOT_HOLDER']);
    expect(outcome.state).toBe(held);
    expect(outcome.events).toEqual([]);
  });

  it('规则4：非发起者不能录制第 1 段', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const draft = createDraft(ctx);

    expectRejected(recordSegment(draft, { userId: 'u:B', note: null }, ctx), ['NOT_INITIATOR']);
  });

  it('规则4：末段录满后再接唱被拒绝（必须先选去向）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
    state = castToRiverBy(drawAndSing(state, ctx, 'u:C'), ctx, 'u:C');
    state = drawAndSing(state, ctx, 'u:D'); // 第 4 段

    expectRejected(recordSegment(state, { userId: 'u:D', note: null }, ctx), [
      'BOTTLE_ALREADY_COMPLETE',
    ]);
  });

  it('规则4：入海后的瓶子不能再被捞取', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    const atSea = resolve(
      drawAndSing(castToRiverBy(startBottle(ctx), ctx, 'u:A'), ctx, 'u:B'),
      ctx,
      'u:B',
      'SEA',
    );

    expectRejected(drawBottle(atSea, { userId: 'u:C' }, ctx), ['BOTTLE_NOT_IN_RIVER']);
  });

  it('规则4：接唱后不能无损重录（每段一个独立 ID，不会覆盖上一段）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    const before = drawBy(castToRiverBy(startBottle(ctx), ctx, 'u:A'), ctx, 'u:B');
    const after = singBy(before, ctx, 'u:B');

    expect(after.segments).toHaveLength(2);
    expect(after.segments[1]?.id).not.toBe(after.segments[0]?.id);
  });

  it('规则4：命令结果对同一次选择是确定性的（不依赖外部状态）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    const state = drawAndSing(castToRiverBy(startBottle(ctx), ctx, 'u:A'), ctx, 'u:B');
    const first = chooseResolution(state, { userId: 'u:B', resolution: 'SEA' }, ctx);
    const second = chooseResolution(state, { userId: 'u:B', resolution: 'SEA' }, ctx);

    expect(second.state).toEqual(first.state);
  });
});
