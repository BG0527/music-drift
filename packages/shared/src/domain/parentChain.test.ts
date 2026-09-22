import { describe, expect, it } from 'vitest';
import { parentOf, versionOf } from './queries';
import {
  castToRiverBy,
  createHarness,
  drawAndSing,
  drawBy,
  resolve,
  singBy,
  startBottle,
} from './test-support';

describe('CONTEXT §4.1 / §4.3 — 父链与回传递交', () => {
  it('规则2：捞取者持有瓶子的父节点 = 投出者', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A'); // A 投河
    state = drawAndSing(state, ctx, 'u:B'); // B 捞取并接唱
    expect(parentOf(state, 'u:B')).toBe('u:A');

    state = castToRiverBy(state, ctx, 'u:B'); // B 投河
    state = drawAndSing(state, ctx, 'u:C'); // C 捞取并接唱
    expect(parentOf(state, 'u:C')).toBe('u:B');
  });

  it('规则2：回传沿父链上移一级', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
    state = drawAndSing(state, ctx, 'u:C');

    const backToB = resolve(state, ctx, 'u:C', 'RETURN');
    expect(backToB.holder?.holderId).toBe('u:B');

    const backToA = resolve(backToB, ctx, 'u:B', 'RETURN');
    expect(backToA.holder?.holderId).toBe('u:A');
    expect(parentOf(backToA, 'u:A')).toBe(null);
  });

  it('规则2：回传的是完整版本，不是单段', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
    state = drawAndSing(state, ctx, 'u:C');
    const returned = resolve(state, ctx, 'u:C', 'RETURN');

    const version = versionOf(returned);
    expect(version.segmentIds).toHaveLength(3);
    expect(version.ownerIds).toEqual(['u:A', 'u:B', 'u:C']);
    expect(version.revision).toBe(3);
    expect(returned.segments.map((segment) => segment.index)).toEqual([1, 2, 3]);
  });

  it('规则2：回传不会改写持有者自己的父节点', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
    state = drawAndSing(state, ctx, 'u:C');
    const returned = resolve(state, ctx, 'u:C', 'RETURN');

    expect(parentOf(returned, 'u:B')).toBe('u:A');
    expect(parentOf(returned, 'u:C')).toBe('u:B');
  });

  it('规则2：多次投河与回传交错后父链仍可自上而下回溯', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
    state = drawAndSing(state, ctx, 'u:C');
    state = resolve(state, ctx, 'u:C', 'RETURN'); // C → B
    state = castToRiverBy(state, ctx, 'u:B'); // B 重新投河
    state = drawAndSing(state, ctx, 'u:D'); // D 捞取并接唱
    expect(parentOf(state, 'u:D')).toBe('u:B');

    state = resolve(state, ctx, 'u:D', 'RETURN'); // D → B
    expect(state.holder?.holderId).toBe('u:B');
    state = resolve(state, ctx, 'u:B', 'RETURN'); // B → A

    expect(state.holder?.holderId).toBe('u:A');
    expect([parentOf(state, 'u:B'), parentOf(state, 'u:C'), parentOf(state, 'u:D')]).toEqual([
      'u:A',
      'u:B',
      'u:B',
    ]);
  });

  it('规则2：命令不修改传入的状态对象（纯函数）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    state = drawBy(state, ctx, 'u:B');
    const snapshot = structuredClone(state);

    singBy(state, ctx, 'u:B');

    expect(state).toEqual(snapshot);
  });
});
