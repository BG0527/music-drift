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
 * | 全链回传后入海（`returnCompleted`）→ 留言由 PENDING 转 DELIVERED | **发起者**（留言接收者） | `MESSAGE_DELIVERED` |
 * | 中途入海 / 回传链断（留言永远送不到） | **发送者**（§5.2「你的留言未送达」） | `MESSAGE_UNDELIVERED` |
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
  replayBottle,
  type DomainEvent,
} from '@music-drift/shared/domain';
import type { Queryable } from '../db/client.js';
import { readDomainEvents } from '../db/events.js';

/** 通知类型（写入方与展示方共用同一批稳定字符串；文案在展示层）。 */
export const NOTIFICATION_TYPES = {
  /** 私密留言送达（收件人 = 发起者）。 */
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

interface PendingMessageRow {
  id: string;
  from_user_id: string;
  to_user_id: string;
}

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

async function pendingMessages(tx: Queryable, bottleId: string): Promise<PendingMessageRow[]> {
  return tx.query<PendingMessageRow>(
    `select id, from_user_id, to_user_id from messages where bottle_id = $1 and status = 'PENDING'`,
    [bottleId],
  );
}

/**
 * 参与者 = 发起者 + 每位录过段的人。
 *
 * **从事件流取**而不是从有效段取：被斩浪的段虽然软删了，但"参与过"这件事在事件里，
 * 与 ADR-015 §16.7（斩浪不抹掉参与关系）一致。系统（`SYSTEM` 哨兵）不算人。
 */
async function participantsOf(tx: Queryable, bottleId: string): Promise<string[]> {
  const rows = await tx.query<{ actor_id: string }>(
    `select distinct actor_id from events
     where bottle_id = $1 and type in ('BOTTLE_CREATED', 'SEGMENT_RECORDED')
       and actor_id <> 'SYSTEM'`,
    [bottleId],
  );
  return rows.map((row) => row.actor_id);
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

  if (type === 'BOTTLE_WENT_TO_SEA') {
    const returnCompleted = event['returnCompleted'] === true;
    const songTitle = await songTitleOf(tx, bottleId);

    // ① 留言的终局：送达 → 通知发起者；未送达 → 通知发送者（§5.2）
    for (const message of await pendingMessages(tx, bottleId)) {
      if (returnCompleted) {
        await insertNotification(tx, {
          userId: message.to_user_id,
          type: NOTIFICATION_TYPES.MESSAGE_DELIVERED,
          bottleId,
          messageId: message.id,
          at,
        });
      } else {
        await insertNotification(tx, {
          userId: message.from_user_id,
          type: NOTIFICATION_TYPES.MESSAGE_UNDELIVERED,
          bottleId,
          messageId: message.id,
          at,
        });
      }
    }

    // ② 作品**完整**入海 → 所有参与者（含被斩浪的人）
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

  if (type === 'BOTTLE_DAMAGED') {
    /**
     * 回传链断（作品损坏）也是"留言永远送不到"的终局之一。
     *
     * ⚠️ t9 的投影只在 `BOTTLE_WENT_TO_SEA` 上把 PENDING 改掉，`BOTTLE_DAMAGED` 没处理 ——
     * 那会让留言**永远停在 PENDING**，同时我们又要告诉发送者"未送达"（两处真相矛盾）。
     * 因此这里**由本模块**把 PENDING 终结为 UNDELIVERED（`projectBottleRow` 不碰 DAMAGED 的留言，
     * 不存在两个写入者），再通知发送者。
     */
    const terminated = await tx.query<PendingMessageRow>(
      `update messages set status = 'UNDELIVERED'
       where bottle_id = $1 and status = 'PENDING'
       returning id, from_user_id, to_user_id`,
      [bottleId],
    );
    for (const message of terminated) {
      await insertNotification(tx, {
        userId: message.from_user_id,
        type: NOTIFICATION_TYPES.MESSAGE_UNDELIVERED,
        bottleId,
        messageId: message.id,
        at,
      });
    }
  }
}
