import { describe, expect, it } from 'vitest';
import { chooseResolution } from './bottle';
import { availableResolutions, canChooseResolution, isAwaitingMyAction } from './resolution';
import {
  castToRiverBy,
  createHarness,
  driftWithSingers,
  drawAndSing,
  expectRejected,
  resolve,
  startBottle,
} from './test-support';

describe('CONTEXT §3.3 / §4.3 — 接唱完成后的去向三选一', () => {
  it('规则1：发起者录完第 1 段时没有「回传」选项', () => {
    const harness = createHarness();
    const state = startBottle(harness.ctx);

    expect(availableResolutions(state, { userId: 'u:A' })).toEqual(['RIVER', 'SEA']);
  });

  it('规则1：发起者强行选择回传会被拒绝，且不产生副作用', () => {
    const harness = createHarness();
    const state = startBottle(harness.ctx);

    const outcome = chooseResolution(state, { userId: 'u:A', resolution: 'RETURN' }, harness.ctx);

    expectRejected(outcome, ['RESOLUTION_NOT_AVAILABLE']);
    expect(outcome.state).toBe(state);
    expect(outcome.events).toEqual([]);
  });

  it('规则1：非末段持有者可选 继续投河 / 回传 / 入海', () => {
    const harness = createHarness();
    const state = drawAndSing(
      castToRiverBy(startBottle(harness.ctx), harness.ctx, 'u:A'),
      harness.ctx,
      'u:B',
    );

    expect(availableResolutions(state, { userId: 'u:B' })).toEqual(['RIVER', 'RETURN', 'SEA']);
    expect(canChooseResolution(state, { userId: 'u:B', resolution: 'RIVER' })).toEqual([]);
  });

  it('规则1：末段持有者只能 回传 / 入海，不可继续投河', () => {
    const harness = createHarness();
    const holdingLast = driftWithSingers(
      castToRiverBy(startBottle(harness.ctx), harness.ctx, 'u:A'),
      harness.ctx,
      ['u:B', 'u:C', 'u:D'],
    );

    expect(availableResolutions(holdingLast, { userId: 'u:D' })).toEqual(['RETURN', 'SEA']);
    expectRejected(
      chooseResolution(holdingLast, { userId: 'u:D', resolution: 'RIVER' }, harness.ctx),
      ['RESOLUTION_NOT_AVAILABLE'],
    );
  });

  it('规则1：发起者收到回传后只能入海', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
    state = drawAndSing(state, ctx, 'u:C');
    state = resolve(state, ctx, 'u:C', 'RETURN'); // C 回传给投出者 B
    state = resolve(state, ctx, 'u:B', 'RETURN'); // B 回传给父节点 A

    expect(availableResolutions(state, { userId: 'u:A' })).toEqual(['SEA']);
    expectRejected(chooseResolution(state, { userId: 'u:A', resolution: 'RIVER' }, ctx), [
      'RESOLUTION_NOT_AVAILABLE',
    ]);
    expectRejected(chooseResolution(state, { userId: 'u:A', resolution: 'RETURN' }, ctx), [
      'RESOLUTION_NOT_AVAILABLE',
    ]);
  });

  /**
   * CONTEXT §4.2：「A 收到完整版本，且 A 只能选择入海」—— 这就是用户要的**「等你操作」**状态。
   * 判据不复写规则：`availableResolutions` 恰好只剩 `['SEA']` 即成立。
   */
  it('规则1（§4.2）：回传落到发起者手里 ⇒ isAwaitingMyAction 为真（前端据此显示「等你操作」）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    state = drawAndSing(state, ctx, 'u:B');
    state = resolve(state, ctx, 'u:B', 'RETURN'); // B 回传给父节点 A

    expect(isAwaitingMyAction(state, { userId: 'u:A' })).toBe(true);
    // 同一状态换个人看都不算「等**我**操作」
    expect(isAwaitingMyAction(state, { userId: 'u:B' })).toBe(false);
  });

  it('规则1（§4.2）：「持有」本身不等于「等你操作」 —— 还能继续投河/回传时一律为假', () => {
    const harness = createHarness();
    const holdingLast = driftWithSingers(
      castToRiverBy(startBottle(harness.ctx), harness.ctx, 'u:A'),
      harness.ctx,
      ['u:B', 'u:C', 'u:D'],
    );
    const drafted = startBottle(harness.ctx);

    expect(isAwaitingMyAction(holdingLast, { userId: 'u:D' })).toBe(false);
    expect(isAwaitingMyAction(drafted, { userId: 'u:A' })).toBe(false);
  });

  it('规则1：非当前持有者无法选择去向', () => {
    const harness = createHarness();
    const state = drawAndSing(
      castToRiverBy(startBottle(harness.ctx), harness.ctx, 'u:A'),
      harness.ctx,
      'u:B',
    );

    expect(availableResolutions(state, { userId: 'u:A' })).toEqual([]);
    expectRejected(chooseResolution(state, { userId: 'u:A', resolution: 'SEA' }, harness.ctx), [
      'NOT_HOLDER',
    ]);
  });

  it('规则1：入海是不可逆终点，入海后不再接受去向选择', () => {
    const harness = createHarness();
    const state = resolve(
      drawAndSing(castToRiverBy(startBottle(harness.ctx), harness.ctx, 'u:A'), harness.ctx, 'u:B'),
      harness.ctx,
      'u:B',
      'SEA',
    );

    expect(state.status).toBe('SEA');
    expect(availableResolutions(state, { userId: 'u:B' })).toEqual([]);
    expectRejected(chooseResolution(state, { userId: 'u:B', resolution: 'RIVER' }, harness.ctx), [
      'NOT_HOLDER',
    ]);
  });
});
