import io


def patch(path, edits):
    s = io.open(path, encoding='utf-8').read()
    for old, new, label in edits:
        assert old in s, path + ' :: ' + label
        s = s.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8').write(s)
    print('patched', path)


# ── 1) 规则码：新增 MESSAGE_TARGET_NOT_AVAILABLE ────────────────────────────
patch(
    'packages/shared/src/domain/errors.ts',
    [
        ("  'MESSAGE_BOTTLE_NOT_DRIFTING',\n] as const;", "  'MESSAGE_BOTTLE_NOT_DRIFTING',\n  'MESSAGE_TARGET_NOT_AVAILABLE',\n] as const;", 'codes'),
        ("  MESSAGE_BOTTLE_NOT_DRIFTING: 422,\n};", "  MESSAGE_BOTTLE_NOT_DRIFTING: 422,\n  MESSAGE_TARGET_NOT_AVAILABLE: 422,\n};", 'status'),
    ],
)

# ── 2) PrivateMessage 增加 targetSegmentIndex ───────────────────────────────
patch(
    'packages/shared/src/domain/types.ts',
    [
        (
            """export interface PrivateMessage {
  id: string;
  fromUserId: string;
  toUserId: string;""",
            """export interface PrivateMessage {
  id: string;
  fromUserId: string;
  /** 收件人：由 `targetSegmentIndex` 解析出来的**那一段的作者**（不再固定是发起者）。 */
  toUserId: string;
  /** 发送者选定的目标段号（1-based，与 `Segment.index` 同语义）；服务端据此解析收件人。 */
  targetSegmentIndex: number;""",
            'type',
        )
    ],
)

# ── 3) messages.ts：命令/守卫/送达与失败转移/可见性 ─────────────────────────
patch(
    'packages/shared/src/domain/messages.ts',
    [
        (
            """/**
 * 点对点私密留言（`CONTEXT.md` §5 / §4.3 / §10.1）。
 *
 * 规则要点：只有接唱者能写、只有发起者最终能看到、中间传递者不知道留言存在、
 * 回传链断裂时留言标记为「未送达」；公海不展示私密留言。
 */""",
            """/**
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
 */""",
            'header',
        ),
        (
            """export interface PrivateMessageCommand {
  userId: string;
  content: string;
}""",
            """export interface PrivateMessageCommand {
  userId: string;
  content: string;
  /** 目标段号（1-based）：收件人 = 该段的作者。 */
  targetSegmentIndex: number;
}""",
            'command',
        ),
        (
            """  const isSinger =
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
}""",
            """  // 发送者必须**在该瓶唱过**（留言是参与者之间的点对点；不再额外排除发起者：
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
}""",
            'guard',
        ),
        (
            """  const event: DomainEvent = {
    type: 'MESSAGE_ATTACHED',
    bottleId: state.id,
    at: ctx.clock.now(),
    actorId: cmd.userId,
    messageId: ctx.ids.next(),
    toUserId: state.initiatorId,
    content: cmd.content,
  };
  return accepted(state, [event]);""",
            """  // 守卫已保证存在；这里重新取一次（TS 的类型收窄不会跨函数调用保留）
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
  return accepted(state, [event]);""",
            'attach',
        ),
        (
            """/**
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
}""",
            """/**
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
}""",
            'visibility',
        ),
    ],
)

# ── 4) events.ts：事件负载 + 五处 reduce 的留言转移 ────────────────────────
patch(
    'packages/shared/src/domain/events.ts',
    [
        (
            """      type: 'MESSAGE_ATTACHED';""",
            """      type: 'MESSAGE_ATTACHED';
      /** 目标段号：收件人 `toUserId` 就是这一段作者（服务端按段号解析，见 `messages.ts`）。 */
      targetSegmentIndex: number;""",
            'event payload type',
        ),
        (
            """      return {
        ...state,
        status: 'HELD',
        holder: { holderId: event.actorId, acquiredAt: event.at, origin: 'DRAW' },
        parents: { ...state.parents, [event.actorId]: event.parentId },
        updatedAt: event.at,
      };""",
            """      return {
        ...state,
        status: 'HELD',
        holder: { holderId: event.actorId, acquiredAt: event.at, origin: 'DRAW' },
        parents: { ...state.parents, [event.actorId]: event.parentId },
        // 目标拿到瓶子即送达（用户口径：回传到目标手上就有通知，不必等到入海）
        messages: messagesDeliveredTo(state.messages, event.actorId),
        updatedAt: event.at,
      };""",
            'drawn',
        ),
        (
            """      return {
        ...state,
        status: 'HELD',
        holder: { holderId: event.toUserId, acquiredAt: event.at, origin: 'RETURN' },
        updatedAt: event.at,
      };""",
            """      return {
        ...state,
        status: 'HELD',
        holder: { holderId: event.toUserId, acquiredAt: event.at, origin: 'RETURN' },
        messages: messagesDeliveredTo(state.messages, event.toUserId),
        updatedAt: event.at,
      };""",
            'returned',
        ),
        (
            """    case 'SEGMENT_CUT':
      return {
        ...state,
        // 段号是歌的固定位置：只软删，位置留空（ADR-015 §16.1）。
        segments: state.segments.map((segment) =>
          segment.id === event.segmentId ? { ...segment, deletedAt: event.at } : segment,
        ),
        updatedAt: event.at,
      };""",
            """    case 'SEGMENT_CUT': {
      const cutSegment = findSegment(state, event.segmentId);
      return {
        ...state,
        // 段号是歌的固定位置：只软删，位置留空（ADR-015 §16.1）。
        segments: state.segments.map((segment) =>
          segment.id === event.segmentId ? { ...segment, deletedAt: event.at } : segment,
        ),
        // 失败①：被斩段如果正是某条留言的**目标**，那条留言再也送不到
        messages:
          cutSegment === null
            ? [...state.messages]
            : messagesUndeliveredFor(state.messages, cutSegment.ownerId),
        updatedAt: event.at,
      };
    }""",
            'segment cut',
        ),
        (
            """    case 'BOTTLE_DAMAGED':
      return {
        ...state,
        status: 'DAMAGED',
        holder: null,
        damagedAt: event.at,
        returnChainBroken: true,
        updatedAt: event.at,
      };""",
            """    case 'BOTTLE_DAMAGED':
      return {
        ...state,
        status: 'DAMAGED',
        holder: null,
        damagedAt: event.at,
        returnChainBroken: true,
        // 失败②：父链断裂 / 瓶子损坏 —— 仍未送达的留言全部未送达
        messages: messagesUndelivered(state.messages),
        updatedAt: event.at,
      };""",
            'damaged',
        ),
        (
            """        messages: state.messages.map((message) =>
          message.status === 'PENDING'
            ? { ...message, status: event.returnCompleted ? 'DELIVERED' : 'UNDELIVERED' }
            : message,
        ),""",
            """        // 失败③：入海即终结 —— 此刻仍是 PENDING 的留言**就是没送到目标**（用户明确补充的那条）。
        // 已送达的（目标先前已拿到过瓶子）不受影响。
        messages: messagesUndelivered(state.messages),""",
            'sea',
        ),
        (
            """        content: event.content,
        status: 'PENDING',""",
            """        content: event.content,
        targetSegmentIndex: event.targetSegmentIndex,
        status: 'PENDING',""",
            'attached reduce',
        ),
    ],
)

# events.ts 需要 messages 的三个辅助（**仅类型**从 messages.ts 引，避免运行期环）
patch(
    'packages/shared/src/domain/events.ts',
    [
        (
            """import { findSegment, relinkParents } from './queries';""",
            """import { messagesDeliveredTo, messagesUndelivered, messagesUndeliveredFor } from './messages';
import { findSegment, relinkParents } from './queries';""",
            'messages import',
        )
    ],
)
print('kernel patched')
