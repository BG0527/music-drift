import { describe, expect, it } from 'vitest';
import { attachPrivateMessage, visibleMessagesFor } from './messages';
import { participants } from './queries';
import {
  castToRiverBy,
  createHarness,
  drawAndSing,
  expectRejected,
  resolve,
  startBottle,
} from './test-support';

/** A 投河 → B 接唱投河 → C 接唱并留一条私密留言给 A。 */
function chainWithNote(): ReturnType<typeof createHarness> & {
  state: ReturnType<typeof startBottle>;
} {
  const harness = createHarness();
  const ctx = harness.ctx;
  let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
  state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
  state = drawAndSing(state, ctx, 'u:C');
  state = attachPrivateMessage(state, { userId: 'u:C', content: '这句是给你的。' }, ctx).state;
  return { ...harness, state };
}

describe('CONTEXT §4.3 / §5.2 / §10.1 — 回传中断', () => {
  it('规则3：回传在途时有人选入海 → 回传链断裂', () => {
    const { ctx, state } = chainWithNote();

    const backToB = resolve(state, ctx, 'u:C', 'RETURN');
    expect(backToB.returnChainBroken).toBe(false);

    const broken = resolve(backToB, ctx, 'u:B', 'SEA');

    expect(broken.status).toBe('SEA');
    expect(broken.returnChainBroken).toBe(true);
    expect(broken.returnCompleted).toBe(false);
  });

  it('规则3：回传中断时参与者仍保留漂流参与记录', () => {
    const { ctx, state } = chainWithNote();

    const broken = resolve(resolve(state, ctx, 'u:C', 'RETURN'), ctx, 'u:B', 'SEA');

    expect(participants(broken).map((record) => record.userId)).toEqual(['u:A', 'u:B', 'u:C']);
    expect(participants(broken).every((record) => record.segmentIndex >= 1)).toBe(true);
  });

  it('规则3：回传中断 → 未送达的私密留言被标记为未送达', () => {
    const { ctx, state } = chainWithNote();

    const broken = resolve(resolve(state, ctx, 'u:C', 'RETURN'), ctx, 'u:B', 'SEA');

    expect(broken.messages.map((message) => message.status)).toEqual(['UNDELIVERED']);
    expect(visibleMessagesFor(broken, 'u:A')).toEqual([]);
    expect(visibleMessagesFor(broken, 'u:C').map((message) => message.status)).toEqual([
      'UNDELIVERED',
    ]);
  });

  it('规则3：私密留言只在最终回传到发起者并入海时送达', () => {
    const { ctx, state } = chainWithNote();

    const backToB = resolve(state, ctx, 'u:C', 'RETURN');
    expect(visibleMessagesFor(backToB, 'u:A')).toEqual([]);

    const backToA = resolve(backToB, ctx, 'u:B', 'RETURN');
    expect(backToA.holder?.holderId).toBe('u:A');
    expect(visibleMessagesFor(backToA, 'u:A')).toEqual([]); // 还没入海，尚未送达

    const settled = resolve(backToA, ctx, 'u:A', 'SEA');

    expect(settled.returnCompleted).toBe(true);
    expect(settled.returnChainBroken).toBe(false);
    expect(visibleMessagesFor(settled, 'u:A').map((message) => message.content)).toEqual([
      '这句是给你的。',
    ]);
  });

  it('规则3：中间传递者看不到私密留言的存在', () => {
    const { ctx, state } = chainWithNote();

    const backToB = resolve(state, ctx, 'u:C', 'RETURN');

    expect(visibleMessagesFor(backToB, 'u:B')).toEqual([]);
    expect(backToB.messages).toHaveLength(1); // 内核里存着，但只对当事人可见
  });

  it('规则3：断链的瓶子不能再留私密留言', () => {
    const { ctx, state } = chainWithNote();

    const broken = resolve(resolve(state, ctx, 'u:C', 'RETURN'), ctx, 'u:B', 'SEA');

    expectRejected(attachPrivateMessage(broken, { userId: 'u:C', content: '再补一句。' }, ctx), [
      'MESSAGE_BOTTLE_NOT_DRIFTING',
    ]);
  });

  it('规则3：私密留言只能由接唱者发给发起者', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
    state = drawAndSing(state, ctx, 'u:C');

    expectRejected(attachPrivateMessage(state, { userId: 'u:A', content: '自说自话' }, ctx), [
      'MESSAGE_SENDER_NOT_PARTICIPANT',
    ]);
    expectRejected(attachPrivateMessage(state, { userId: 'u:Z', content: '路人' }, ctx), [
      'MESSAGE_SENDER_NOT_PARTICIPANT',
    ]);
  });

  it('规则3：留言内容不能为空', () => {
    const { ctx, state } = chainWithNote();

    expectRejected(attachPrivateMessage(state, { userId: 'u:C', content: '   ' }, ctx), [
      'MESSAGE_CONTENT_EMPTY',
    ]);
  });
});
