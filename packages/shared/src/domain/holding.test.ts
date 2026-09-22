import { describe, expect, it } from 'vitest';
import { chooseResolution, claimBottle, drawBottle, recordSegment } from './bottle';
import { createInMemoryHoldingRegistry, syncHoldingRegistry } from './holding';
import {
  castToRiverBy,
  codesOf,
  createHarness,
  dislikeTimes,
  drawBy,
  expectRejected,
  segmentByIndex,
  startBottle,
} from './test-support';

describe('CONTEXT §15 / §16 — 并发持有者锁', () => {
  it('规则6：并发抢占同一个瓶子，只有第一个生效', () => {
    const registry = createInMemoryHoldingRegistry();

    const first = registry.tryAcquire({ bottleId: 'b1', holderId: 'u:B', acquiredAt: 0 });
    const second = registry.tryAcquire({ bottleId: 'b1', holderId: 'u:C', acquiredAt: 0 });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.ok ? [] : second.violations.map((violation) => violation.code)).toEqual([
      'HOLDING_ALREADY_TAKEN',
    ]);
    expect(registry.holderOf('b1')).toBe('u:B');
  });

  it('规则6：同一用户重复抢占也被拒绝（内核只保证唯一持有者，幂等由 API 层负责）', () => {
    const registry = createInMemoryHoldingRegistry();

    registry.tryAcquire({ bottleId: 'b1', holderId: 'u:B', acquiredAt: 0 });
    const again = registry.tryAcquire({ bottleId: 'b1', holderId: 'u:B', acquiredAt: 1 });

    expect(again.ok).toBe(false);
  });

  it('规则6：两个并发接唱只有一个生效，落败者零副作用', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const registry = createInMemoryHoldingRegistry();
    const inRiver = castToRiverBy(startBottle(ctx), ctx, 'u:A');

    const winner = claimBottle(inRiver, { userId: 'u:B' }, ctx, registry);
    const loser = claimBottle(inRiver, { userId: 'u:C' }, ctx, registry); // 同一个快照 = 同时到达

    expect(winner.ok).toBe(true);
    expect(winner.state.holder?.holderId).toBe('u:B');
    expect(loser.ok).toBe(false);
    expect(codesOf(loser)).toEqual(['HOLDING_ALREADY_TAKEN']);
    expect(loser.state).toBe(inRiver);
    expect(loser.events).toEqual([]);
    expect(inRiver.holder).toBe(null);
    expect(registry.holderOf(inRiver.id)).toBe('u:B');
  });

  it('规则6：抢占顺序反过来时结论一致（与谁先到无关）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const registry = createInMemoryHoldingRegistry();
    const inRiver = castToRiverBy(startBottle(ctx), ctx, 'u:A');

    const winner = claimBottle(inRiver, { userId: 'u:C' }, ctx, registry);
    const loser = claimBottle(inRiver, { userId: 'u:B' }, ctx, registry);

    expect(winner.ok).toBe(true);
    expect(codesOf(loser)).toEqual(['HOLDING_ALREADY_TAKEN']);
    expect(registry.holderOf(inRiver.id)).toBe('u:C');
  });

  it('规则6：落败者不能替赢家接唱（持有者校验拦下）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const registry = createInMemoryHoldingRegistry();
    const inRiver = castToRiverBy(startBottle(ctx), ctx, 'u:A');

    const winner = claimBottle(inRiver, { userId: 'u:B' }, ctx, registry);
    claimBottle(inRiver, { userId: 'u:C' }, ctx, registry);

    const stolen = recordSegment(winner.state, { userId: 'u:C', note: null }, ctx);

    expectRejected(stolen, ['NOT_HOLDER']);
    expect(stolen.state).toBe(winner.state);
    expect(stolen.events).toEqual([]);
  });

  it('规则6：已被持有的瓶子在状态机层面也拒绝再次捞取', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    const held = drawBy(castToRiverBy(startBottle(ctx), ctx, 'u:A'), ctx, 'u:B');

    expectRejected(drawBottle(held, { userId: 'u:C' }, ctx), ['HOLDING_ALREADY_TAKEN']);
    expect(held.holder?.holderId).toBe('u:B');
  });

  it('规则6：持有权释放后其他人可以接手', () => {
    const registry = createInMemoryHoldingRegistry();
    registry.tryAcquire({ bottleId: 'b1', holderId: 'u:B', acquiredAt: 0 });

    expect(registry.release('b1', 'u:B')).toBe(true);
    expect(registry.holderOf('b1')).toBe(null);

    const next = registry.tryAcquire({ bottleId: 'b1', holderId: 'u:C', acquiredAt: 2 });
    expect(next.ok).toBe(true);
  });

  it('规则6：不是持有者本人不能释放别人的锁', () => {
    const registry = createInMemoryHoldingRegistry();
    registry.tryAcquire({ bottleId: 'b1', holderId: 'u:B', acquiredAt: 0 });

    expect(registry.release('b1', 'u:C')).toBe(false);
    expect(registry.holderOf('b1')).toBe('u:B');
  });

  it('规则6：瓶子投河后锁被释放，下一个人才能捞', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const registry = createInMemoryHoldingRegistry();
    const claimed = claimBottle(
      castToRiverBy(startBottle(ctx), ctx, 'u:A'),
      { userId: 'u:B' },
      ctx,
      registry,
    );

    const sung = recordSegment(claimed.state, { userId: 'u:B', note: null }, ctx);
    syncHoldingRegistry(registry, sung.events);
    const cast = chooseResolution(sung.state, { userId: 'u:B', resolution: 'RIVER' }, ctx);
    syncHoldingRegistry(registry, cast.events);

    expect(registry.holderOf(cast.state.id)).toBe(null);
    expect(claimBottle(cast.state, { userId: 'u:C' }, ctx, registry).ok).toBe(true);
  });

  it('规则6：入海后锁被释放（系统行为也能清锁）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const registry = createInMemoryHoldingRegistry();
    const claimed = claimBottle(
      castToRiverBy(startBottle(ctx), ctx, 'u:A'),
      { userId: 'u:B' },
      ctx,
      registry,
    );
    const sung = recordSegment(claimed.state, { userId: 'u:B', note: null }, ctx);

    const atSea = chooseResolution(sung.state, { userId: 'u:B', resolution: 'SEA' }, ctx);
    syncHoldingRegistry(registry, atSea.events);

    expect(registry.holderOf(atSea.state.id)).toBe(null);
  });
});

describe('ADR-015 §16.3 — 斩浪后持有者锁同步', () => {
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

  it('16.3：斩浪把瓶子收回系统后，锁必须被释放，陌生人才能接手补位', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const registry = createInMemoryHoldingRegistry();
    const inRiver = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    const claimed = claimBottle(inRiver, { userId: 'u:B' }, ctx, registry);
    syncHoldingRegistry(registry, claimed.events);
    expect(registry.holderOf(inRiver.id)).toBe('u:B');

    const sung = recordSegment(claimed.state, { userId: 'u:B', note: null }, ctx);
    const cut = dislikeTimes(sung.state, ctx, TEN_VOTERS, segmentByIndex(sung.state, 2).id);
    syncHoldingRegistry(registry, cut.events);

    expect(cut.state.holder).toBe(null);
    expect(registry.holderOf(inRiver.id)).toBe(null);
    expect(claimBottle(cut.state, { userId: 'u:NEW' }, ctx, registry).ok).toBe(true);
  });
});
