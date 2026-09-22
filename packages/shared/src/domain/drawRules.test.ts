import { describe, expect, it } from 'vitest';
import { drawBottle, putBack } from './bottle';
import { parentOf } from './queries';
import {
  createRiverState,
  drawFromRiver,
  eligibleBottlesFor,
  isDrawExcluded,
  recordPutBack,
} from './river';
import {
  castToRiverBy,
  createHarness,
  drawAndSing,
  drawBy,
  expectOk,
  expectRejected,
  resolve,
  startBottle,
} from './test-support';

describe('CONTEXT §15 — 捞取规则', () => {
  it('规则5：演唱过的瓶子永不再捞给同一用户', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B'); // B 接唱并投河
    state = castToRiverBy(drawAndSing(state, ctx, 'u:C'), ctx, 'u:C'); // C 接唱并投河 → 当前投出者是 C

    expectRejected(drawBottle(state, { userId: 'u:B' }, ctx), ['ALREADY_SANG_IN_BOTTLE']);
    expect(eligibleBottlesFor([state], createRiverState(), { userId: 'u:B' })).toEqual([]);
  });

  it('规则5：未演唱直接放回后，接下来 10 次打捞不再给同一用户，第 11 次恢复', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    const drawn = drawBy(castToRiverBy(startBottle(ctx), ctx, 'u:A'), ctx, 'u:B');
    const returned = expectOk(putBack(drawn, { userId: 'u:B' }, ctx));
    let river = recordPutBack(createRiverState(), {
      userId: 'u:B',
      bottleId: returned.id,
      cooldownDraws: ctx.policy.putBackCooldownDraws,
    });

    expect(isDrawExcluded(river, { userId: 'u:B', bottleId: returned.id })).toBe(true);

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const draw = drawFromRiver({ bottles: [returned], river, userId: 'u:B', random: () => 0 });
      expect(draw.ok, `第 ${attempt} 次打捞不该捞到冷却中的瓶子`).toBe(false);
      expect(draw.bottleId).toBe(null);
      river = draw.river;
    }

    const eleventh = drawFromRiver({ bottles: [returned], river, userId: 'u:B', random: () => 0 });
    expect(eleventh.ok).toBe(true);
    expect(eleventh.bottleId).toBe(returned.id);
  });

  it('规则5：放回冷却只针对放回者，其他人可以立刻捞到', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    const drawn = drawBy(castToRiverBy(startBottle(ctx), ctx, 'u:A'), ctx, 'u:B');
    const returned = expectOk(putBack(drawn, { userId: 'u:B' }, ctx));
    const river = recordPutBack(createRiverState(), {
      userId: 'u:B',
      bottleId: returned.id,
      cooldownDraws: 10,
    });

    const forB = drawFromRiver({ bottles: [returned], river, userId: 'u:B', random: () => 0 });
    const forC = drawFromRiver({ bottles: [returned], river, userId: 'u:C', random: () => 0 });

    expect(forB.ok).toBe(false);
    expect(forC.ok).toBe(true);
    expect(forC.bottleId).toBe(returned.id);
  });

  it('规则5：放回不改写父链，下一个捞取者的父节点仍是上一个投出者（不是放回者）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    const drawn = drawBy(castToRiverBy(startBottle(ctx), ctx, 'u:A'), ctx, 'u:B');
    const returned = expectOk(putBack(drawn, { userId: 'u:B' }, ctx));
    const next = drawBy(returned, ctx, 'u:C');

    expect(returned.parents).toEqual(drawn.parents);
    expect(parentOf(next, 'u:C')).toBe('u:A');
    expect(next.currentCasterId).toBe('u:A');
  });

  it('规则5：放回会重开投河计时', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    const drawn = drawBy(castToRiverBy(startBottle(ctx), ctx, 'u:A'), ctx, 'u:B');
    harness.advanceHours(5);
    const returned = expectOk(putBack(drawn, { userId: 'u:B' }, ctx));

    expect(returned.riverCastAt).toBe(5 * 60 * 60 * 1000);
    expect(returned.status).toBe('IN_RIVER');
    expect(returned.holder).toBe(null);
  });

  it('规则5：收到回传的瓶子不能直接放回河道，必须选一个去向', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
    state = drawAndSing(state, ctx, 'u:C');
    const backToB = resolve(state, ctx, 'u:C', 'RETURN');

    expectRejected(putBack(backToB, { userId: 'u:B' }, ctx), ['RESOLUTION_NOT_AVAILABLE']);
  });

  it('规则5：河道只从「在河道中 + 非自己投出 + 未演唱过 + 不在冷却中」的瓶子里随机捞', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    const sangByB = castToRiverBy(startBottle(ctx, 'u:A', 'b1'), ctx, 'u:A');
    const afterB = castToRiverBy(drawAndSing(sangByB, ctx, 'u:B'), ctx, 'u:B'); // B 唱过
    const ownByB = castToRiverBy(startBottle(ctx, 'u:B', 'b2'), ctx, 'u:B'); // B 自己投的
    const openForB = castToRiverBy(startBottle(ctx, 'u:A', 'b3'), ctx, 'u:A');
    const stillDraft = startBottle(ctx, 'u:E', 'b4'); // 还没投河

    const candidates = [afterB, ownByB, openForB, stillDraft];
    const river = createRiverState();

    expect(
      eligibleBottlesFor(candidates, river, { userId: 'u:B' }).map((bottle) => bottle.id),
    ).toEqual(['b3']);

    const draw = drawFromRiver({ bottles: candidates, river, userId: 'u:B', random: () => 0.99 });
    expect(draw.ok).toBe(true);
    expect(draw.bottleId).toBe('b3');
  });

  it('规则5：河道里没有可捞的瓶子时返回 NO_BOTTLE_AVAILABLE', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    const draw = drawFromRiver({
      bottles: [startBottle(ctx)],
      river: createRiverState(),
      userId: 'u:B',
      random: () => 0,
    });

    expect(draw.ok).toBe(false);
    expect(draw.bottleId).toBe(null);
    expect(draw.violations.map((violation) => violation.code)).toEqual(['NO_BOTTLE_AVAILABLE']);
  });
});
