/**
 * 通知**写入**（t12 第 1️⃣ 项 / `CONTEXT.md` §5.2、§9.2）。
 *
 * 为什么放在投影层而不是路由层：
 * - 通知是**领域事件的派生结果**，不是"某条路由的副作用" —— 放在这里，
 *   **系统触发**的终局（超时自动入海等）也自动覆盖，不会漏；
 * - 与事件写入**同一事务**：事件落了、通知没落，或反之，都不应该发生；
 * - `applyOutcome` 的顺序是「媒体 → **通知** → 瓶子行 → 持有者 → 事件」：
 *   通知必须在 `projectBottleRow` **之前**读 `messages`，因为后者会把 PENDING 一次性改掉。
 *
 * 三类写入（每类都有真库集成测试，断言"真的写了一行 + 收件人正确"）：
 *
 * | 触发 | 收件人 | 类型 |
 * | --- | --- | --- |
 * | 留言由 PENDING 转 **DELIVERED**（= **目标**当轮拿到瓶子） | **留言的目标**（`toUserId`；不再固定是发起者） | `MESSAGE_DELIVERED` |
 * | 留言由 PENDING 转 **UNDELIVERED**（目标段被斩 / 瓶子 DAMAGED / 完整入海仍未送到） | **留言的发送者**（§5.2「你的留言未送达」） | `MESSAGE_UNDELIVERED` |
 * | 作品入海 | **所有参与者**（发起者 + 每位唱过的人，**含被斩浪的人** §16.7） | `BOTTLE_REACHED_SEA` |
 *
 * 两条边界：
 * 1. **PENDING 不发通知**：留言在漂流窗口里是私密的（§5.1），此刻通知发起者相当于泄露未公开内容；
 * 2. **写幂等**：用 `insert … where not exists`，重复投影同一事件不会产生第二行
 *    （不新建唯一索引，避免为去重改 schema）。
 */
import {
  isComplete,
  missingSegmentIndexes,
  participants,
  replayBottle,
  type DomainEvent,
} from '@music-drift/shared/domain';
import type { Queryable } from '../db/client.js';
import { readDomainEvents } from '../db/events.js';

/** 通知类型（写入方与展示方共用同一批稳定字符串；文案在展示层）。 */
export const NOTIFICATION_TYPES = {
  /** 私密留言送达（收件人 = **该留言的目标**，由 `targetSegmentIndex` 解析而来）。 */
  MESSAGE_DELIVERED: 'MESSAGE_DELIVERED',
  /** 私密留言未送达（收件人 = 发送者）。 */
  MESSAGE_UNDELIVERED: 'MESSAGE_UNDELIVERED',
  /**
   * 你参与的作品**完整并入海**（收件人 = 全部参与者，含被斩浪的人）。
   *
   * 只在**内核判定完整**时发：公海有「等待接力」分区（ADR-015 §16.4），
   * 未完成的作品进公海是常态（等指定接唱补位），那时说"已完成"会对用户撒谎。
   */
  BOTTLE_COMPLETED: 'BOTTLE_COMPLETED',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

/**
 * 会改变留言状态的事件集合（内核里就这么几个）：
 * - `MESSAGE_ATTACHED`：只新增 PENDING（**不产生通知** —— §5.1 私密性）；
 * - `BOTTLE_DRAWN` / `BOTTLE_RETURNED`：目标拿到瓶子 → PENDING → DELIVERED；
 * - `SEGMENT_CUT`（目标段被斩）/ `BOTTLE_DAMAGED` / `BOTTLE_WENT_TO_SEA`：仍未送达 → UNDELIVERED。
 */
export const MESSAGE_STATE_EVENTS = new Set([
  'MESSAGE_ATTACHED',
  'BOTTLE_DRAWN',
  'BOTTLE_RETURNED',
  'SEGMENT_CUT',
  'BOTTLE_DAMAGED',
  'BOTTLE_WENT_TO_SEA',
]);

/** 写一行通知（幂等：同收件人 + 同类型 + 同 bottleId + 同 messageId 只留一行）。 */
async function insertNotification(
  tx: Queryable,
  input: {
    userId: string;
    type: NotificationType;
    bottleId: string;
    messageId?: string | null;
    songTitle?: string | null;
    /** 额外事实（原样进 payload，展示层自己决定文案）。 */
    extra?: Record<string, unknown> | undefined;
    at: Date;
  },
): Promise<void> {
  await tx.query(
    `insert into notifications (id, user_id, type, payload, created_at)
     select gen_random_uuid(), $1, $2, $3::jsonb, $4::timestamptz
     where not exists (
       select 1 from notifications
       where user_id = $1 and type = $2
         and payload->>'bottleId' = $5
         and (payload->>'messageId') is not distinct from $6
     )`,
    [
      input.userId,
      input.type,
      JSON.stringify({
        bottleId: input.bottleId,
        ...(input.messageId === undefined || input.messageId === null
          ? {}
          : { messageId: input.messageId }),
        ...(input.songTitle === undefined || input.songTitle === null
          ? {}
          : { songTitle: input.songTitle }),
        ...(input.extra ?? {}),
      }),
      input.at,
      input.bottleId,
      input.messageId ?? null,
    ],
  );
}


/**
 * 通知的收件人 = **有效段的作者**（发起者只要第 1 段还在，也在其中）。
 *
 * 判定**收敛到内核 `participants(state)`**（`liveSegments`）——与 `/api/me/bottles` 用的是**同一条规则**
 *（用户裁决 §46.1：被斩浪的段作者 —— 含发起者 —— 不算参与过）。此前这里自己写了一份"从事件流取参与者"的
 * SQL，于是同一条规则有了两份实现，裁决一改就会出现两个口径。系统（`SYSTEM` 哨兵）不算人，内核的
 * `participants` 只产出真实用户，因此也不需要再过滤。
 *
 * ⚠️ 与 §16.7「防捣乱」无关（那个维度是"今后不许再参与"，故意查含软删行的 `state.segments`）。
 */
async function participantsOf(tx: Queryable, bottleId: string): Promise<string[]> {
  const events = await readDomainEvents(tx, bottleId);
  if (events.length === 0) {
    return [];
  }
  return participants(replayBottle(events)).map((record) => record.userId);
}

/**
 * 作品此刻是否完整、缺哪几段 —— **用内核导出算，不在这里重写规则**。
 *
 * 做法：把已落库的事件流 + **当前这个还没落库的事件**一起交给 `replayBottle`，
 * 再用内核的 `isComplete` / `missingSegmentIndexes` 取结论。
 * 为什么不写 SQL 数段数：那就是把"完成度"这条规则复制出第二份，
 * 任何一次内核改动都会让通知开始撒谎（ADR-015 的段号/缺口语义是本产品最容易错的地方）。
 */
async function completenessOf(
  tx: Queryable,
  bottleId: string,
  currentEvent: DomainEvent,
): Promise<{ isComplete: boolean; missing: number[] }> {
  const events = await readDomainEvents(tx, bottleId);
  const state = replayBottle([...events, currentEvent]);
  return { isComplete: isComplete(state), missing: missingSegmentIndexes(state) };
}

async function songTitleOf(tx: Queryable, bottleId: string): Promise<string | null> {
  const rows = await tx.query<{ title: string }>(
    `select s.title from songs s join bottles b on b.song_id = s.id where b.id = $1`,
    [bottleId],
  );
  return rows[0]?.title ?? null;
}

/**
 * 事件的**通知投影**（在 `applyOutcome` 的事务里、`projectBottleRow` 之前调用）。
 * 只处理两个终局事件；其它事件不产生通知。
 */
export async function projectNotifications(
  tx: Queryable,
  event: Record<string, unknown>,
  bottleId: string,
  at: Date,
): Promise<void> {
  const type = String(event['type']);

  // ① 留言状态转移：**唯一来源 = 内核**。把「本事件之前」重放一次、再带上本事件重放一次，
  //    一比就知道哪条留言从 PENDING 变成了什么：
  //      PENDING → DELIVERED   ⇒ 通知**目标**（`toUserId`）
  //      PENDING → UNDELIVERED ⇒ 通知**发送者**（`fromUserId`，§5.2「你的留言未送达」）
  //    这样"什么算送达、什么算失败"不需要在 API 层重写一份 —— 三个失败路径分别由内核的
  //    `SEGMENT_CUT`（目标段被斩）/ `BOTTLE_DAMAGED`（父链断裂/损坏）/ `BOTTLE_WENT_TO_SEA`
  //    （整首完成入海但未送到目标）落成状态变化，这里只做搬运。
  if (MESSAGE_STATE_EVENTS.has(type)) {
    const events = await readDomainEvents(tx, bottleId);
    const before = replayBottle(events);
    const after = replayBottle([...events, event as unknown as DomainEvent]);
    for (const message of before.messages) {
      if (message.status !== 'PENDING') {
        continue;
      }
      const statusAfter = after.messages.find((candidate) => candidate.id === message.id)?.status;
      if (statusAfter === 'DELIVERED') {
        await insertNotification(tx, {
          userId: message.toUserId,
          type: NOTIFICATION_TYPES.MESSAGE_DELIVERED,
          bottleId,
          messageId: message.id,
          at,
        });
      } else if (statusAfter === 'UNDELIVERED') {
        await insertNotification(tx, {
          userId: message.fromUserId,
          type: NOTIFICATION_TYPES.MESSAGE_UNDELIVERED,
          bottleId,
          messageId: message.id,
          at,
        });
      }
    }
  }

  if (type === 'BOTTLE_WENT_TO_SEA') {
    const songTitle = await songTitleOf(tx, bottleId);

    // ② 作品**完整**入海 → 通知**有效段的作者**（被斩浪者不算参与过，§46.1）
    //
    // 完整性由**内核**判定（`replayBottle` + `isComplete`），不在这里数段数重写规则。
    // 未完成的作品进公海（「等待接力」区）**不发**这条通知：那时说"已完成"是撒谎，
    // 而且它会污染"完成"这个一次性的时间点（用户真正关心的就是这一下）。
    const { isComplete: complete, missing } = await completenessOf(
      tx,
      bottleId,
      event as unknown as DomainEvent,
    );
    if (!complete) return;

    for (const userId of await participantsOf(tx, bottleId)) {
      await insertNotification(tx, {
        userId,
        type: NOTIFICATION_TYPES.BOTTLE_COMPLETED,
        bottleId,
        songTitle,
        at,
        extra: { isComplete: true, missingSegmentIndexes: missing },
      });
    }
    return;
  }

}
