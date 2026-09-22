/**
 * 点对点私密留言（`CONTEXT.md` §5 / §4.3 / §10.1）。
 *
 * 规则要点：只有接唱者能写、只有发起者最终能看到、中间传递者不知道留言存在、
 * 回传链断裂时留言标记为「未送达」；公海不展示私密留言。
 */
import { violation, type RuleViolation } from './errors';
import type { DomainEvent } from './events';
import { accepted, rejected, type CommandOutcome } from './outcome';
import type { DomainContext } from './ports';
import type { BottleState, PrivateMessage } from './types';

export interface PrivateMessageCommand {
  userId: string;
  content: string;
}

export function canAttachPrivateMessage(
  state: BottleState,
  cmd: PrivateMessageCommand,
): RuleViolation[] {
  if (cmd.content.trim().length === 0) {
    return [violation('MESSAGE_CONTENT_EMPTY')];
  }
  const isSinger =
    cmd.userId !== state.initiatorId &&
    state.segments.some((segment) => segment.ownerId === cmd.userId);
  if (!isSinger) {
    // 留言是「接唱者 → 发起者」的点对点，发起者不能给自己留言。
    return [violation('MESSAGE_SENDER_NOT_PARTICIPANT')];
  }
  if (state.status === 'SEA' || state.status === 'DAMAGED' || state.returnChainBroken) {
    // 已经到不了发起者手里，留言必然未送达 —— 直接拒绝，不留悬空 PENDING。
    return [violation('MESSAGE_BOTTLE_NOT_DRIFTING')];
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
  const event: DomainEvent = {
    type: 'MESSAGE_ATTACHED',
    bottleId: state.id,
    at: ctx.clock.now(),
    actorId: cmd.userId,
    messageId: ctx.ids.next(),
    toUserId: state.initiatorId,
    content: cmd.content,
  };
  return accepted(state, [event]);
}

/**
 * 某个人能看到哪些留言：
 * - 发起者：只看已送达的（回传完成并入海之后）；
 * - 发送者：看自己写的（含「未送达」状态，用于 §5.2 的通知）；
 * - 其他中间传递者：什么都看不到（§5.1）。
 */
export function visibleMessagesFor(state: BottleState, viewerId: string): PrivateMessage[] {
  if (viewerId === state.initiatorId) {
    return state.messages.filter((message) => message.status === 'DELIVERED');
  }
  return state.messages.filter((message) => message.fromUserId === viewerId);
}
