/**
 * 私密留言**规则变更**（用户第十三轮第 ④ 条）：
 * 留言不再「固定回传给发起者」，而是**由发送者指定之前段的某位作者为目标**。
 *
 * 四条新语义（本文件逐条钉住）：
 * 1. **目标用段号表达**（`targetSegmentIndex`，1-based）：服务端按 `(bottleId, index)` 解析成作者，
 *    **不让调用方传 userId**（不信任前端送来的身份）；
 * 2. **只有目标能看到内容**（delivered 之后）+ 发送者能看到自己写的；发起者/其他作者一律看不到；
 * 3. **送达 = 目标当轮拿到瓶子**（不再要求"必须入海"）—— 用户原话「只有回传到他手上时有通知」；
 * 4. **三种失败**都标 UNDELIVERED（并通知留言者）：① 目标段被斩 ② 父链断裂 / 瓶子 DAMAGED
 *    ③ 整首完成入海但仍未送达。
 */
import { describe, expect, it } from 'vitest';
import { attachPrivateMessage, visibleMessagesFor } from './messages';
import type { DomainContext } from './ports';
import {
  castToRiverBy,
  createHarness,
  dislikeTimes,
  drawAndSing,
  drawBy,
  expectRejected,
  resolve,
  segmentByIndex,
  singBy,
  startBottle,
} from './test-support';
import type { BottleState } from './types';

/** 用 10 个假投票者把指定段斩掉（内核阈值默认 10）。 */
function cutSegment(state: BottleState, ctx: DomainContext, index: number): BottleState {
  const voters = Array.from({ length: 10 }, (_, position) => `u:cut${String(position)}`);
  const outcome = dislikeTimes(state, ctx, voters, segmentByIndex(state, index).id);
  if (!outcome.ok) {
    throw new Error('斩浪失败：' + outcome.violations.map((violation) => violation.code).join(','));
  }
  return outcome.state;
}

function chain(): { ctx: DomainContext; state: BottleState } {
  const harness = createHarness();
  const ctx = harness.ctx;
  let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
  state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
  state = drawAndSing(state, ctx, 'u:C');
  return { ctx, state };
}

function attach(state: BottleState, ctx: DomainContext, userId: string, index: number, content = '只给你看。') {
  return attachPrivateMessage(state, { userId, content, targetSegmentIndex: index }, ctx);
}

describe('§5 规则变更：留言目标由发送者按**段号**指定，服务端解析成作者', () => {
  it('目标段号 → 解析成该段作者：写第 1 段（A）与第 2 段（B）分别落到不同人', () => {
    const { ctx, state } = chain();

    const toA = attach(state, ctx, 'u:C', 1).state;
    const toB = attach(state, ctx, 'u:C', 2).state;

    expect(toA.messages[0]?.toUserId).toBe('u:A');
    expect(toA.messages[0]?.targetSegmentIndex).toBe(1);
    expect(toB.messages[0]?.toUserId).toBe('u:B');
    expect(toB.messages[0]?.targetSegmentIndex).toBe(2);
    // 收件人是"解析出来的"，调用方从未传过 userId
    expect(segmentByIndex(state, 1).ownerId).toBe(toA.messages[0]?.toUserId);
    expect(segmentByIndex(state, 2).ownerId).toBe(toB.messages[0]?.toUserId);
  });

  it('只能给自己的有效段之前的作者留言：第 1 段不能写给第 2 段', () => {
    const { ctx, state } = chain();

    expectRejected(attach(state, ctx, 'u:A', 2), ['MESSAGE_TARGET_NOT_AVAILABLE']);
  });

  it('发送者自己的段已被斩后不能再留言', () => {
    const { ctx, state } = chain();
    const cut = cutSegment(state, ctx, 3);

    expectRejected(attach(cut, ctx, 'u:C', 1), ['MESSAGE_TARGET_NOT_AVAILABLE']);
  });

  it('目标必须是**有效段**且不能是自己：不存在的段号 / 自己的段 / 已斩段 → MESSAGE_TARGET_NOT_AVAILABLE', () => {
    const { ctx, state } = chain();

    // 不存在的段号（也覆盖「≥ nextRecordIndex」：此刻只录到第 3 段）
    expectRejected(attach(state, ctx, 'u:C', 4), ['MESSAGE_TARGET_NOT_AVAILABLE']);
    expectRejected(attach(state, ctx, 'u:C', 99), ['MESSAGE_TARGET_NOT_AVAILABLE']);
    // 目标 = 发送者自己（第 3 段是 C 的）
    expectRejected(attach(state, ctx, 'u:C', 3), ['MESSAGE_TARGET_NOT_AVAILABLE']);

    // 目标段被斩（软删）后不能再作为目标
    const cut = cutSegment(state, ctx, 2);
    expect(cut.segments.find((segment) => segment.index === 2)?.deletedAt).not.toBeNull();
    expectRejected(attach(cut, ctx, 'u:C', 2), ['MESSAGE_TARGET_NOT_AVAILABLE']);
  });

  it('非参与者不能写（留言只能由**在该瓶唱过的人**发出）；空内容仍是 MESSAGE_CONTENT_EMPTY', () => {
    const { ctx, state } = chain();

    expectRejected(attach(state, ctx, 'u:Z', 1), ['MESSAGE_SENDER_NOT_PARTICIPANT']);
    expectRejected(attach(state, ctx, 'u:C', 1, '   '), ['MESSAGE_CONTENT_EMPTY']);
  });
});

describe('§5.1 可见性：只有目标能看到内容（发起者也不例外）', () => {
  it('PENDING：只有发送者看得到自己写的；目标、发起者、其他作者都看不到', () => {
    const { ctx, state } = chain();
    const withNote = attach(state, ctx, 'u:C', 2).state; // 目标 = B

    expect(visibleMessagesFor(withNote, 'u:C').map((message) => message.status)).toEqual(['PENDING']);
    expect(visibleMessagesFor(withNote, 'u:A')).toEqual([]); // 发起者（旧规则里唯一能看到的人）
    expect(visibleMessagesFor(withNote, 'u:B')).toEqual([]); // 目标：还没到他手上
  });

  it('送达后：目标能看到内容；发起者**永远**看不到（旧规则的"发起者看全部"已反转）', () => {
    const { ctx, state } = chain();
    const withNote = attach(state, ctx, 'u:C', 2).state; // 目标 = B

    const backToB = resolve(withNote, ctx, 'u:C', 'RETURN');
    expect(backToB.holder?.holderId).toBe('u:B');

    expect(visibleMessagesFor(backToB, 'u:B').map((message) => message.content)).toEqual(['只给你看。']);
    expect(visibleMessagesFor(backToB, 'u:C').map((message) => message.status)).toEqual(['DELIVERED']);
    expect(visibleMessagesFor(backToB, 'u:A')).toEqual([]);

    // 继续整条链回到发起者并入海，发起者仍然看不到（他不是目标）
    const settled = resolve(resolve(backToB, ctx, 'u:B', 'RETURN'), ctx, 'u:A', 'SEA');
    expect(settled.returnCompleted).toBe(true);
    expect(visibleMessagesFor(settled, 'u:A')).toEqual([]);
    expect(visibleMessagesFor(settled, 'u:B').map((message) => message.content)).toEqual(['只给你看。']);
  });

  it('未完成作品入海时留言保持 PENDING，目标仍看不到', () => {
    const { ctx, state } = chain();
    const withNote = attach(state, ctx, 'u:C', 2).state; // 目标 = B

    // C 直接把未完成瓶送进公海（**没有**交给 B）；它之后仍可被指定接唱捞走，不能提前判失败。
    const atSea = resolve(withNote, ctx, 'u:C', 'SEA');

    expect(atSea.messages.map((message) => message.status)).toEqual(['PENDING']);
    expect(visibleMessagesFor(atSea, 'u:B')).toEqual([]);
  });
});

describe('§5 送达判定：目标当轮拿到瓶子即送达（不再要求先入海）', () => {
  it('目标是发起者（第 1 段）：逐跳回传到 A 手上那一刻即 DELIVERED，无需入海', () => {
    const { ctx, state } = chain();
    const withNote = attach(state, ctx, 'u:C', 1).state; // 目标 = A（发起者）

    const backToB = resolve(withNote, ctx, 'u:C', 'RETURN');
    expect(withNote.messages[0]?.status).toBe('PENDING');
    expect(visibleMessagesFor(backToB, 'u:A')).toEqual([]); // 还没到 A 手上（现在在 B 手上）

    const backToA = resolve(backToB, ctx, 'u:B', 'RETURN');
    expect(backToA.holder?.holderId).toBe('u:A');
    // ⚠️ 反转点：旧规则要"入海且 returnCompleted"才算送达，新规则"回传到目标手上"即送达
    expect(backToA.messages.map((message) => message.status)).toEqual(['DELIVERED']);
    expect(visibleMessagesFor(backToA, 'u:A').map((message) => message.content)).toEqual(['只给你看。']);
  });

  it('目标是第 2 段作者：C 回传给 B 那一刻即送达；随后 B 入海不会把已送达改回未送达', () => {
    const { ctx, state } = chain();
    const withNote = attach(state, ctx, 'u:C', 2).state; // 目标 = B
    const backToB = resolve(withNote, ctx, 'u:C', 'RETURN');
    expect(backToB.messages[0]?.status).toBe('DELIVERED');
    // B 入海（瓶子终结）后状态保持 DELIVERED，不会被"入海即未送达"覆盖
    const settled = resolve(backToB, ctx, 'u:B', 'SEA');
    expect(settled.messages.map((message) => message.status)).toEqual(['DELIVERED']);
    expect(visibleMessagesFor(settled, 'u:B').map((message) => message.content)).toEqual(['只给你看。']);
  });
});

describe('§5.2 三种失败都标记未送达（并通知留言者）', () => {
  it('失败①：目标段被斩 → UNDELIVERED', () => {
    const { ctx, state } = chain();
    const withNote = attach(state, ctx, 'u:C', 2).state; // 目标 = B（第 2 段）

    const cut = cutSegment(withNote, ctx, 2);
    expect(cut.segments.find((segment) => segment.index === 2)?.deletedAt).not.toBeNull();

    expect(cut.messages.map((message) => message.status)).toEqual(['UNDELIVERED']);
    expect(visibleMessagesFor(cut, 'u:B')).toEqual([]);
    expect(visibleMessagesFor(cut, 'u:C').map((message) => message.status)).toEqual(['UNDELIVERED']);
  });

  it('失败②：父链断裂 / 瓶子 DAMAGED（锚段被斩）→ UNDELIVERED', () => {
    const { ctx, state } = chain();
    const withNote = attach(state, ctx, 'u:C', 2).state;

    // 锚段（第 1 段，A 的）被斩 → 整瓶 DAMAGED
    const damaged = cutSegment(withNote, ctx, 1);
    expect(damaged.status).toBe('DAMAGED');

    expect(damaged.messages.map((message) => message.status)).toEqual(['UNDELIVERED']);
    expect(visibleMessagesFor(damaged, 'u:B')).toEqual([]);
  });

  it('失败③：整首接唱完成入海、但留言仍未回传到目标 → UNDELIVERED（用户明确补充的那条）', () => {
    const { ctx, state } = chain();
    const withNote = attach(state, ctx, 'u:C', 2).state; // 目标 = B

    // C 先把瓶子投回河道（留言仍 PENDING），再由 D 捞到、补齐第 4 段后直接入海
    // ⇒ 整首完成入海，但瓶子从未回到目标 B 手上（用户明确补充的失败③）
    const cast = resolve(withNote, ctx, 'u:C', 'RIVER');
    const fourth = drawBy(cast, ctx, 'u:D');
    const complete = singBy(fourth, ctx, 'u:D');
    const settled = resolve(complete, ctx, 'u:D', 'SEA');

    expect(settled.status).toBe('SEA');
    expect(settled.returnCompleted).toBe(false);
    expect(settled.messages.map((message) => message.status)).toEqual(['UNDELIVERED']);
    expect(visibleMessagesFor(settled, 'u:B')).toEqual([]); // 内容没送达
    expect(visibleMessagesFor(settled, 'u:C').map((message) => message.status)).toEqual(['UNDELIVERED']);
  });
});
