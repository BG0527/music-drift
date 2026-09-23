import { describe, expect, it } from 'vitest';
import { chooseResolution } from './bottle';
import { attachPrivateMessage } from './messages';
import { HOUR, castToRiverBy, createHarness, drawAndSing, startBottle } from './test-support';
import { applyTimeouts } from './timeouts';

describe('CONTEXT §11.3 — 超时（时钟必须可注入）', () => {
  it('规则8：投河 72h 无人接唱 → 自动入海', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const inRiver = castToRiverBy(startBottle(ctx), ctx, 'u:A');

    harness.advanceHours(71.5);
    expect(applyTimeouts(inRiver, ctx).state.status).toBe('IN_RIVER');

    harness.advanceHours(0.5); // 正好 72h
    const expired = applyTimeouts(inRiver, ctx);

    expect(expired.ok).toBe(true);
    expect(expired.state.status).toBe('SEA');
    expect(expired.state.seaAt).toBe(HOUR * 72);
    expect(expired.state.returnCompleted).toBe(false);
    expect(expired.events.map((event) => event.type)).toEqual(['BOTTLE_WENT_TO_SEA']);
  });

  it('规则8：回传决策 48h 超时 → 自动入海', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
    state = drawAndSing(state, ctx, 'u:C');
    const backToB = chooseResolution(state, { userId: 'u:C', resolution: 'RETURN' }, ctx).state;

    harness.advanceHours(47.5);
    expect(applyTimeouts(backToB, ctx).state.status).toBe('HELD');

    harness.advanceHours(0.5);
    const expired = applyTimeouts(backToB, ctx);

    expect(expired.state.status).toBe('SEA');
    expect(expired.state.returnCompleted).toBe(false);
    expect(expired.events.map((event) => event.type)).toEqual(['BOTTLE_WENT_TO_SEA']);
  });

  it('规则8：刚捞到还没选去向的持有者不受 48h 约束（明确边界）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const held = drawAndSing(castToRiverBy(startBottle(ctx), ctx, 'u:A'), ctx, 'u:B');

    harness.advanceHours(72);

    const outcome = applyTimeouts(held, ctx);
    expect(outcome.state.status).toBe('HELD');
    expect(outcome.events).toEqual([]);
  });

  it('规则8：超时入海会让未送达的私密留言标记为未送达', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
    state = drawAndSing(state, ctx, 'u:C');
    const withNote = attachPrivateMessage(
      state,
      { userId: 'u:C', content: '路上小心。', targetSegmentIndex: 1 },
      ctx,
    ).state;

    const backToB = chooseResolution(withNote, { userId: 'u:C', resolution: 'RETURN' }, ctx).state;
    harness.advanceHours(48);
    const expired = applyTimeouts(backToB, ctx);

    expect(expired.state.messages.map((message) => message.status)).toEqual(['UNDELIVERED']);
  });

  it('规则8：D-13 策略可注入 —— 退回发起者而不是入海', () => {
    const harness = createHarness({ policy: { riverTimeoutOutcome: 'RETURN_TO_OWNER' } });
    const ctx = harness.ctx;
    const inRiver = castToRiverBy(startBottle(ctx), ctx, 'u:A');

    harness.advanceHours(72);
    const returned = applyTimeouts(inRiver, ctx);

    expect(returned.state.status).toBe('HELD');
    expect(returned.state.holder?.holderId).toBe('u:A');
    expect(returned.state.holder?.origin).toBe('REWIND');
    expect(returned.state.returnCompleted).toBe(false);

    // 不会卡死：退回后同样受 48h 决策时限约束。
    harness.advanceHours(48);
    expect(applyTimeouts(returned.state, ctx).state.status).toBe('SEA');
  });

  it('规则8：所有时间戳都来自注入时钟，而不是墙上时钟', () => {
    const harness = createHarness({ start: 1_700_000_000_000 });
    const ctx = harness.ctx;
    const created = startBottle(ctx);

    expect(created.createdAt).toBe(1_700_000_000_000);
    expect(created.segments[0]?.createdAt).toBe(1_700_000_000_000);

    harness.advanceHours(3);
    const cast = castToRiverBy(created, ctx, 'u:A');
    expect(cast.riverCastAt).toBe(1_700_000_000_000 + 3 * HOUR);
  });
});
