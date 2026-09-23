/**
 * 点对点私密留言（`CONTEXT.md` §5 / §4.3 / §10.1）。
 *
 * ⚠️ **规则变更（用户第十三轮第 ④ 条，2026-09-24）**：留言不再「固定回传给发起者」，
 * 而是**由发送者指定"之前某一段的作者"为目标**。四条语义：
 * 1. 目标用**段号**表达（`targetSegmentIndex`，1-based，与 `Segment.index` 同语义）——
 *    服务端解析成该段作者，**不让调用方传 userId**（不信任前端送来的身份）；
 * 2. **只有目标能看到内容**（送达之后）；发送者看得到自己写的（含未送达）；**发起者与其他人一律看不到**；
 * 3. **送达 = 目标当轮拿到瓶子**（`BOTTLE_DRAWN` / `BOTTLE_RETURNED` 的持有者恰是目标），
 *    不再要求「必须入海且 returnCompleted」——用户原话「只有回传到他手上时有通知」；
 * 4. **三种失败**都标 `UNDELIVERED`（`events.ts` 里对应 `SEGMENT_CUT`（目标段被斩）、
 *    `BOTTLE_DAMAGED`（父链断裂/损坏）、`BOTTLE_WENT_TO_SEA`（整首完成入海但未送到目标））。
 *
 * 中间传递者不知道留言存在（§5.1）；公海不展示私密留言。
 */
import { violation, type RuleViolation } from './errors';
import type { DomainEvent } from './events';
import { accepted, rejected, type CommandOutcome } from './outcome';
import type { DomainContext } from './ports';
import type { BottleState, PrivateMessage } from './types';

export interface PrivateMessageCommand {
  userId: string;
  content: string;
  /** 目标段号（1-based）：收件人 = 该段的作者。 */
  targetSegmentIndex: number;
}

export function canAttachPrivateMessage(
  state: BottleState,
  cmd: PrivateMessageCommand,
): RuleViolation[] {
  if (cmd.content.trim().length === 0) {
    return [violation('MESSAGE_CONTENT_EMPTY')];
  }
  // 发送者必须**在该瓶唱过**（留言是参与者之间的点对点；不再额外排除发起者：
  // 新规则只按"段号"说话，谁是发送者不影响目标合法性）。
  const senderHasSegment = state.segments.some((segment) => segment.ownerId === cmd.userId);
  if (!senderHasSegment) {
    return [violation('MESSAGE_SENDER_NOT_PARTICIPANT')];
  }
  if (state.status === 'SEA' || state.status === 'DAMAGED' || state.returnChainBroken) {
    // 瓶子已终结或链已断，留言必然送不到 —— 直接拒绝，不留悬空 PENDING。
    return [violation('MESSAGE_BOTTLE_NOT_DRIFTING')];
  }
  // 目标：必须是**已存在的有效段**（隐含 `index < nextRecordIndex`），且作者不是发送者自己。
  const target = state.segments.find((segment) => segment.index === cmd.targetSegmentIndex);
  if (target === undefined || target.deletedAt !== null || target.ownerId === cmd.userId) {
    return [violation('MESSAGE_TARGET_NOT_AVAILABLE')];
  }
  return [];
}

export function attachPrivateMessage(
  state: BottleState,
  cmd: PrivateMessageCommand,
  ctx: DomainContext,
): CommandOutcome {
  const violations = canAttachPrivateMessage(state, cmd);
  if (violations.length > 0) {
    return rejected(state, violations);
  }
  // 守卫已保证存在；这里重新取一次（TS 的类型收窄不会跨函数调用保留）
  const target = state.segments.find((segment) => segment.index === cmd.targetSegmentIndex);
  if (target === undefined) {
    return rejected(state, [violation('MESSAGE_TARGET_NOT_AVAILABLE')]);
  }
  const event: DomainEvent = {
    type: 'MESSAGE_ATTACHED',
    bottleId: state.id,
    at: ctx.clock.now(),
    actorId: cmd.userId,
    messageId: ctx.ids.next(),
    toUserId: target.ownerId, // ← 由段号解析出来的作者（旧实现这里硬编码 state.initiatorId）
    targetSegmentIndex: cmd.targetSegmentIndex,
    content: cmd.content,
  };
  return accepted(state, [event]);
}

/**
 * 某个人能看到哪些留言（**服务端唯一判定**，前端只渲染这里返回的）：
 * - **目标**：只看**已送达给自己**的；
 * - **发送者**：看自己写的（含未送达，用于 §5.2「你的留言未送达」）；
 * - **其他所有人**（含发起者、其他段作者）：什么都看不到（§5.1）。
 */
export function visibleMessagesFor(state: BottleState, viewerId: string): PrivateMessage[] {
  return state.messages.filter(
    (message) =>
      message.fromUserId === viewerId ||
      (message.status === 'DELIVERED' && message.toUserId === viewerId),
  );
}

/**
 * 送达：`holderId` 拿到瓶子的那一刻，把**目标是他**的 PENDING 留言标为 DELIVERED。
 *
 * 单一出口：`events.ts` 的 `BOTTLE_DRAWN` / `BOTTLE_RETURNED` 都调它，
 * 因此「什么算送达」只有一份实现（旧实现把送达绑在"入海且 returnCompleted"上，已按用户裁决改掉）。
 */
export function messagesDeliveredTo(
  messages: readonly PrivateMessage[],
  holderId: string | null,
): PrivateMessage[] {
  if (holderId === null) {
    return [...messages];
  }
  return messages.map((message) =>
    message.status === 'PENDING' && message.toUserId === holderId
      ? { ...message, status: 'DELIVERED' }
      : message,
  );
}

/** 失败终局：仍未送达的留言全部标记未送达（入海 / 损坏）。 */
export function messagesUndelivered(messages: readonly PrivateMessage[]): PrivateMessage[] {
  return messages.map((message) =>
    message.status === 'PENDING' ? { ...message, status: 'UNDELIVERED' } : message,
  );
}

/** 目标段被斩 ⇒ 送给他的留言再也送不到（失败①）。 */
export function messagesUndeliveredFor(
  messages: readonly PrivateMessage[],
  targetUserId: string,
): PrivateMessage[] {
  return messages.map((message) =>
    message.status === 'PENDING' && message.toUserId === targetUserId
      ? { ...message, status: 'UNDELIVERED' }
      : message,
  );
}
