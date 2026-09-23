/**
 * 人工审核的**内容处置**（t12 第 4️⃣ 项）。
 *
 * ## 为什么不能"只改投影表"
 *
 * 这个仓库的规则状态来自 **事件流重放**（ADR-005 不变式 3）：`missingSegmentIndexes` /
 * `isComplete` 都是 `replayBottle(events)` 的产物（`domain/queries.ts` 的 `gaps()`），
 * **不是** `bottle_segments.deleted_at` 的产物。
 * 我第一版把「删段」写成 `update bottle_segments set deleted_at = …`，测试立刻抓到它：
 * 接口回 `missingSegmentIndexes: [2,3,4]`（内核仍以为第 1 段好好的），
 * 也就是**审核动作对规则完全不可见** —— 表面成功、规则没变，正是最坏的一类缺陷。
 *
 * 因此人工处置必须落到**事件流**上，且只使用**内核已有的**事件词汇：
 *
 * | 人工动作 | 落到事件流 | 投影 |
 * | --- | --- | --- |
 * | `REMOVE_SEGMENT` | `SEGMENT_CUT`（actorId = 执行的管理员） | 该段软删（行保留可审计） |
 * | `RESTORE_SEGMENT` | `SEGMENT_RECORDED`（**同一个段号**、new segment id） | 复制原行内容为新行（旧行保持软删） |
 *
 * ## 两处必须说清的边界（不是"顺手"决定的）
 *
 * 1. **人工删段不自动"置回河道"**：内核在**自动斩杀**路径上会跟着发 `BOTTLE_GAP_OPENED`
 *    （把作品置回河道等补位）或 `BOTTLE_DAMAGED`（斩空 / 锚段被斩），但那个决策函数
 *    （`moderation.ts` 的 `gapOpenEvent`）**没有导出**。要它就得在仓储层重写一份
 *    "缺口该不该置回河道、锚段要不要判损坏"的规则 —— 那正是**第二份规则**，
 *    迟早与内核漂移。所以这里只让段失效，**作品后续由既有流转（持有者/管理员删瓶）决定**；
 *    这条取舍已上报 captain 复核。
 * 2. **恢复 = 按同一个段号重新登记同一份音频**：内核没有 "un-cut" 事件（`SEGMENT_CUT` 不可逆），
 *    而 `SEGMENT_RECORDED` 是**追加**语义（同 id 重复会得到两条段记录）。
 *    所以恢复用 **new segment id + 同一 index**：规则上该段号重新有有效段（缺口消失、完成度重算），
 *    音频是同一份字节（用户听到的还是那一段），旧行继续软删留着做审计。
 *    代价：恢复后的段 id 变了（旧 id 的播放链接与票数不继承）—— 这点也在回报里写明了。
 */
import type { DomainEvent } from '@music-drift/shared/domain';
import type { Queryable } from '../db/client.js';
import { appendDomainEvent } from '../db/events.js';

interface SegmentRow {
  id: string;
  bottle_id: string;
  index: number;
  owner_id: string;
  note: string | null;
  audio: Buffer | null;
  audio_mime: string | null;
  duration_ms: number | null;
  deleted_at: Date | null;
}

async function readSegment(tx: Queryable, segmentId: string): Promise<SegmentRow | null> {
  const rows = await tx.query<SegmentRow>(
    `select id, bottle_id, index, owner_id, note, audio, audio_mime, duration_ms, deleted_at
     from bottle_segments where id = $1`,
    [segmentId],
  );
  return rows[0] ?? null;
}

/** 人工删段：事件流记 `SEGMENT_CUT`，投影软删（行保留）。 */
export async function removeSegment(input: {
  tx: Queryable;
  segmentId: string;
  actorId: string;
  at: Date;
}): Promise<boolean> {
  const { tx, segmentId, actorId, at } = input;
  const segment = await readSegment(tx, segmentId);
  if (segment === null) return false;
  // 幂等：已经失效就不再追加事件（否则事件流里会堆同一段的多次裁决）
  if (segment.deleted_at !== null) return true;

  await tx.query(
    `update bottle_segments set deleted_at = $2 where id = $1 and deleted_at is null`,
    [segmentId, at],
  );
  await appendDomainEvent(tx, {
    type: 'SEGMENT_CUT',
    bottleId: segment.bottle_id,
    at: at.getTime(),
    actorId,
    segmentId,
  } as unknown as DomainEvent);
  return true;
}

/**
 * 人工恢复：把被斩（自动或人工）的一段**按同一个段号**重新登记为有效段。
 * 返回恢复后的新段 id；找不到源段返回 null。
 */
export async function restoreSegment(input: {
  tx: Queryable;
  segmentId: string;
  /** 执行恢复的管理员（写进 reports 审计；事件里的 actorId 必须是原作者，见下）。 */
  actorId: string;
  at: Date;
}): Promise<{ segmentId: string; bottleId: string; index: number } | null> {
  const { tx, segmentId, at } = input;
  const segment = await readSegment(tx, segmentId);
  if (segment === null) return null;

  const newId = crypto.randomUUID();
  await tx.query(
    `insert into bottle_segments
       (id, bottle_id, "index", owner_id, note, audio, audio_mime, duration_ms, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      newId,
      segment.bottle_id,
      segment.index,
      segment.owner_id,
      segment.note,
      segment.audio,
      segment.audio_mime,
      segment.duration_ms,
      at,
    ],
  );
  await appendDomainEvent(tx, {
    type: 'SEGMENT_RECORDED',
    bottleId: segment.bottle_id,
    at: at.getTime(),
    // actorId = 原作者：状态里的 ownerId 由它派生，匿名代号与"参与过"的判定才不会错位
    actorId: segment.owner_id,
    segmentId: newId,
    index: segment.index,
    note: segment.note,
  } as unknown as DomainEvent);
  return { segmentId: newId, bottleId: segment.bottle_id, index: segment.index };
}

/** 人工删瓶（下架）：置损坏 + 释放持有。物理删除会毁掉审计与申诉依据。 */
export async function removeBottle(input: {
  tx: Queryable;
  bottleId: string;
  at: Date;
}): Promise<void> {
  const { tx, bottleId, at } = input;
  await tx.query(
    `update bottles set status = 'DAMAGED', current_holder_id = null, damaged_at = $2,
       return_chain_broken = true, updated_at = $2 where id = $1`,
    [bottleId, at],
  );
  await tx.query(
    `update holdings set released_at = $2 where bottle_id = $1 and released_at is null`,
    [bottleId, at],
  );
}

/** 封禁：标记 + 清会话（否则"封了但还能用"）。 */
export async function banUser(input: { tx: Queryable; userId: string; at: Date }): Promise<void> {
  const { tx, userId, at } = input;
  await tx.query(`update users set banned_at = $2 where id = $1`, [userId, at]);
  await tx.query(`delete from sessions where user_id = $1`, [userId]);
}
