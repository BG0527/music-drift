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

/**
 * A 投河 → B 接唱投河 → C 接唱并留一条私密留言给 **A（第 1 段的作者）**。
 *
 * 规则变更后（用户第十三轮第 ④ 条）：目标是**发送者按段号指定的那一段作者**，
 * 这里显式选第 1 段 ⇒ 收件人仍是 A，但那是"选出来的"，不再是"规则固定的"。
 */
function chainWithNote(): ReturnType<typeof createHarness> & {
  state: ReturnType<typeof startBottle>;
} {
  const harness = createHarness();
  const ctx = harness.ctx;
  let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
  state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
  state = drawAndSing(state, ctx, 'u:C');
  state = attachPrivateMessage(
    state,
    { userId: 'u:C', content: '这句是给你的。', targetSegmentIndex: 1 },
    ctx,
  ).state;
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

  it('规则3（已按用户裁决反转）：留言在**回传到目标手上**那一刻即送达，不再要求先入海', () => {
    const { ctx, state } = chainWithNote();

    const backToB = resolve(state, ctx, 'u:C', 'RETURN');
    expect(visibleMessagesFor(backToB, 'u:A')).toEqual([]); // 还在 B 手上 → 目标看不到

    const backToA = resolve(backToB, ctx, 'u:B', 'RETURN');
    expect(backToA.holder?.holderId).toBe('u:A');
    // ⚠️ 反转点：旧断言是 `[]`（"还没入海，尚未送达"）；新规则下 A 是**目标**，
    //    持有者变成他的那一刻就送达了（用户原话「只有回传到他手上时有通知」）。
    expect(backToA.messages.map((message) => message.status)).toEqual(['DELIVERED']);
    expect(visibleMessagesFor(backToA, 'u:A').map((message) => message.content)).toEqual([
      '这句是给你的。',
    ]);

    const settled = resolve(backToA, ctx, 'u:A', 'SEA');

    expect(settled.returnCompleted).toBe(true);
    expect(settled.returnChainBroken).toBe(false);
    expect(settled.messages.map((message) => message.status)).toEqual(['DELIVERED']); // 入海不再改写已送达
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

    expectRejected(
      attachPrivateMessage(
        broken,
        { userId: 'u:C', content: '再补一句。', targetSegmentIndex: 2 },
        ctx,
      ),
      [
        'MESSAGE_BOTTLE_NOT_DRIFTING',
      ],
    );
  });

  it('规则3：参与者只能写给自己的前序段；第 1 段不能写给第 2 段', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
    state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
    state = drawAndSing(state, ctx, 'u:C');

    expectRejected(
      attachPrivateMessage(
        state,
        { userId: 'u:A', content: '给后面这位。', targetSegmentIndex: 2 },
        ctx,
      ),
      ['MESSAGE_TARGET_NOT_AVAILABLE'],
    );

    // 真正的"不在场者"依旧不能写（他在该瓶没有任何段）
    expectRejected(
      attachPrivateMessage(state, { userId: 'u:Z', content: '路人', targetSegmentIndex: 1 }, ctx),
      ['MESSAGE_SENDER_NOT_PARTICIPANT'],
    );
  });

  it('规则3：留言内容不能为空', () => {
    const { ctx, state } = chainWithNote();

    expectRejected(
      attachPrivateMessage(state, { userId: 'u:C', content: '   ', targetSegmentIndex: 1 }, ctx),
      ['MESSAGE_CONTENT_EMPTY'],
    );
  });
});
