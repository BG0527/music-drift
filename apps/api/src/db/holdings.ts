/**
 * 持有者锁的 DB 实现（D-04 明确允许并发处写原生 SQL）。
 *
 * 原语 = **部分唯一索引 + 带谓词的冲突目标**：
 *
 * ```sql
 * INSERT INTO holdings (bottle_id, holder_id, parent_id, origin, acquired_at)
 * VALUES ($1,$2,$3,$4,$5)
 * ON CONFLICT (bottle_id) WHERE released_at IS NULL DO NOTHING
 * RETURNING id
 * ```
 *
 * 为什么必须写**带谓词**的冲突目标（captain 裁决，2026-09-23）：
 * 裸 `ON CONFLICT DO NOTHING` 会吞掉**任何**唯一性冲突——包括主键碰撞、将来新增的约束、
 * 写错的另一条唯一索引。那时返回同样是「没插入」，但原因不是「有人抢到了」，而是数据写错了，
 * 变成一个没有任何信号的静默失败。带谓词形式只吞你意图吞的那一个冲突。
 * 对应测试：`holdings.integration.test.ts`「非抢占类唯一冲突必须抛错而不是静默返回」。
 *
 * 无显式行锁 → 无锁序问题、无死锁；失败语义天然是「没有 RETURNING 行」。
 */
import { randomUUID } from 'node:crypto';
import type { Queryable } from './client.js';

export type HoldingOrigin = 'DRAW' | 'RETURN' | 'REWIND';

export interface ClaimHoldingCommand {
  bottleId: string;
  holderId: string;
  parentId: string | null;
  origin: HoldingOrigin;
  acquiredAt: Date;
  /** 可选：调用方自带 id（幂等/重放/测试用）；缺省由 DB 生成。 */
  holdingId?: string;
}

export interface HoldingRow {
  id: string;
  bottleId: string;
  holderId: string;
  parentId: string | null;
  origin: string;
  acquiredAt: Date;
  releasedAt: Date | null;
}

export type ClaimHoldingResult =
  { ok: true; holdingId: string } | { ok: false; code: 'HOLDING_ALREADY_TAKEN' };

interface HoldingDbRow {
  id: string;
  bottle_id: string;
  holder_id: string;
  parent_id: string | null;
  origin: string;
  acquired_at: Date;
  released_at: Date | null;
}

function toHoldingRow(row: HoldingDbRow): HoldingRow {
  return {
    id: row.id,
    bottleId: row.bottle_id,
    holderId: row.holder_id,
    parentId: row.parent_id,
    origin: row.origin,
    acquiredAt: row.acquired_at,
    releasedAt: row.released_at,
  };
}

/** 原子抢占：正常路径返回 holdingId；唯一（且仅此一种）冲突返回 HOLDING_ALREADY_TAKEN。 */
export async function claimHolding(db: Queryable, cmd: ClaimHoldingCommand): Promise<ClaimHoldingResult> {
  const rows = await db.query<{ id: string }>(
    `insert into holdings (id, bottle_id, holder_id, parent_id, origin, acquired_at)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (bottle_id) where released_at is null do nothing
     returning id`,
    [
      cmd.holdingId ?? randomUUID(),
      cmd.bottleId,
      cmd.holderId,
      cmd.parentId,
      cmd.origin,
      cmd.acquiredAt,
    ],
  );
  const row = rows[0];
  return row === undefined
    ? { ok: false, code: 'HOLDING_ALREADY_TAKEN' }
    : { ok: true, holdingId: row.id };
}

/**
 * 释放持有权。传 holderId 为「比较后释放」（防误放别人的锁）；不传则强制释放。
 * `releasedAt` **必须由调用方给**（来自注入时钟）：本模块禁止自取墙上时间（ADR-005 不变式 4，eslint 已在守）。
 */
export async function releaseHolding(
  db: Queryable,
  cmd: { bottleId: string; holderId?: string; releasedAt: Date },
): Promise<number> {
  const rows = await db.query<{ id: string }>(
    `update holdings set released_at = $3
     where bottle_id = $1 and released_at is null and ($2::uuid is null or holder_id = $2)
     returning id`,
    [cmd.bottleId, cmd.holderId ?? null, cmd.releasedAt],
  );
  return rows.length;
}

export async function activeHoldingOf(db: Queryable, bottleId: string): Promise<HoldingRow | null> {
  const rows = await db.query<HoldingDbRow>(
    `select id, bottle_id, holder_id, parent_id, origin, acquired_at, released_at
     from holdings where bottle_id = $1 and released_at is null`,
    [bottleId],
  );
  const row = rows[0];
  return row === undefined ? null : toHoldingRow(row);
}

/** 与领域事件对齐的锁副作用（内核的 `syncHoldingRegistry` 在 DB 侧的对应物）。 */
export interface HoldingRelevantEvent {
  type: string;
  bottleId: string;
  at: Date;
  actorId: string;
  toUserId?: string;
  /** 其余事件字段（如 `BOTTLE_GAP_OPENED.gapIndex`）不影响锁的副作用，原样接收。 */
  [key: string]: unknown;
}

export async function applyDomainEventToHoldings(
  db: Queryable,
  event: HoldingRelevantEvent,
): Promise<void> {
  switch (event.type) {
    case 'BOTTLE_RETURNED':
    case 'BOTTLE_REWOUND':
      await releaseHolding(db, { bottleId: event.bottleId, releasedAt: event.at });
      if (event.toUserId !== undefined) {
        await claimHolding(db, {
          bottleId: event.bottleId,
          holderId: event.toUserId,
          parentId: event.actorId === 'SYSTEM' ? null : event.actorId,
          origin: event.type === 'BOTTLE_RETURNED' ? 'RETURN' : 'REWIND',
          acquiredAt: event.at,
        });
      }
      return;
    case 'BOTTLE_CAST_TO_RIVER':
    case 'BOTTLE_PUT_BACK':
      if (event.actorId !== 'SYSTEM') {
        await releaseHolding(db, {
          bottleId: event.bottleId,
          holderId: event.actorId,
          releasedAt: event.at,
        });
      }
      return;
    // 作品终局 / 系统收回瓶子（斩浪开缺口）：锁必须释放，否则补位者抢不到（t17 同源缺口）。
    case 'BOTTLE_GAP_OPENED':
    case 'BOTTLE_WENT_TO_SEA':
    case 'BOTTLE_DAMAGED':
      await releaseHolding(db, { bottleId: event.bottleId, releasedAt: event.at });
      return;
    default:
      return;
  }
}
