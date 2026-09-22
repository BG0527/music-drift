/**
 * 事件写入与读回（ADR-005 不变式 3：状态转移可由事件序列重放）。
 *
 * 三条硬约束：
 * 1. **seq=1 必须是 BOTTLE_CREATED** —— 应用层早失败 + DB `CHECK (seq > 1 or type = 'BOTTLE_CREATED')` 兜底；
 * 2. **seq 通过唯一约束 + 冲突重试生成**：`coalesce(max(seq),0)+1` 与唯一索引 `(bottle_id, seq)`
 *    组合在并发下会撞车，撞车即重试（只对 `events_bottle_seq_uniq` 重试，其它冲突照旧抛出）；
 * 3. **段号越界拒绝写入**（§17.5）：`SEGMENT_RECORDED` 的 `index` 必须在 `1..bottles.total_segments`，
 *    否则报错且不留任何行。内核只在 `replayBottle` 边界兜底，写入侧必须主动校验。
 */
import type { DomainEvent } from '@music-drift/shared/domain';
import type { Queryable } from './client.js';

export interface AppendEventCommand {
  bottleId: string;
  type: string;
  /** 主动方；系统行为用哨兵 `'SYSTEM'`。 */
  actorId: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

export interface EventRow {
  seq: number;
  type: string;
  bottleId: string;
  actorId: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

interface EventDbRow {
  seq: number;
  type: string;
  bottle_id: string;
  actor_id: string;
  payload: Record<string, unknown>;
  occurred_at: Date;
}

/** 并发撞 seq 时的重试上限：撞车即说明有并发写，重算即可，不需要退避。 */
const MAX_SEQ_ATTEMPTS = 16;
const SEQ_UNIQUE_CONSTRAINT = 'events_bottle_seq_uniq';

function isConstraintViolation(error: unknown, constraint: string): boolean {
  const code = (error as { code?: string }).code;
  const failed = (error as { constraint?: string }).constraint;
  return code === '23505' && (failed === undefined || failed === constraint);
}

function payloadIndexOf(payload: Record<string, unknown>): number | null {
  const value = payload['index'];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/** §17.5：段号必须落在 `1..bottles.total_segments`（`total_segments` 是列，不是硬编码 4）。 */
async function assertSegmentIndexInRange(db: Queryable, cmd: AppendEventCommand): Promise<void> {
  if (cmd.type !== 'SEGMENT_RECORDED') {
    return;
  }
  const index = payloadIndexOf(cmd.payload);
  if (index === null) {
    throw new Error(`SEGMENT_RECORDED 事件缺少整数段号 index：${JSON.stringify(cmd.payload)}`);
  }
  const rows = await db.query<{ total_segments: number }>(
    `select total_segments from bottles where id = $1`,
    [cmd.bottleId],
  );
  const totalSegments = rows[0]?.total_segments;
  if (totalSegments === undefined) {
    throw new Error(`瓶子不存在，无法写入事件：${cmd.bottleId}`);
  }
  if (index < 1 || index > totalSegments) {
    throw new Error(`段号越界：index=${index} 不在 1..${totalSegments}（瓶子 ${cmd.bottleId}）`);
  }
}

export async function appendEvent(db: Queryable, cmd: AppendEventCommand): Promise<EventRow> {
  const existing = await db.query<{ count: string }>(
    `select count(*)::text as count from events where bottle_id = $1`,
    [cmd.bottleId],
  );
  if (existing[0]?.count === '0' && cmd.type !== 'BOTTLE_CREATED') {
    throw new Error(`首条事件必须是 BOTTLE_CREATED（seq=1），收到 ${cmd.type}`);
  }
  await assertSegmentIndexInRange(db, cmd);

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_SEQ_ATTEMPTS; attempt += 1) {
    try {
      const rows = await db.query<EventDbRow>(
        `insert into events (bottle_id, seq, type, actor_id, payload, occurred_at)
         values ($1, (select coalesce(max(seq), 0) + 1 from events where bottle_id = $1), $2, $3, $4, $5)
         returning seq, type, bottle_id, actor_id, payload, occurred_at`,
        [cmd.bottleId, cmd.type, cmd.actorId, JSON.stringify(cmd.payload), cmd.occurredAt],
      );
      const row = rows[0];
      if (row === undefined) {
        throw new Error('事件写入没有返回行');
      }
      return {
        seq: row.seq,
        type: row.type,
        bottleId: row.bottle_id,
        actorId: row.actor_id,
        payload: row.payload,
        occurredAt: row.occurred_at,
      };
    } catch (error) {
      if (!isConstraintViolation(error, SEQ_UNIQUE_CONSTRAINT)) {
        throw error;
      }
      lastError = error; // 并发撞了同一个 seq：重算再试（唯一约束保证不会重复落库）
    }
  }
  throw new Error(`事件 seq 竞争 ${MAX_SEQ_ATTEMPTS} 次仍失败：${String(lastError)}`);
}

/** 落一条内核事件（type/actorId/at 之外的字段进 payload）。 */
export async function appendDomainEvent(db: Queryable, event: DomainEvent): Promise<EventRow> {
  const { type, bottleId, at, actorId, ...payload } = event as DomainEvent &
    Record<string, unknown>;
  return appendEvent(db, {
    bottleId,
    type,
    actorId: typeof actorId === 'string' ? actorId : 'SYSTEM',
    payload: payload as Record<string, unknown>,
    occurredAt: new Date(at),
  });
}

/** 读回某个瓶子的完整事件流（按 seq 升序），可直接喂给内核 `replayBottle`。 */
export async function readDomainEvents(db: Queryable, bottleId: string): Promise<DomainEvent[]> {
  const rows = await db.query<EventDbRow>(
    `select seq, type, bottle_id, actor_id, payload, occurred_at
     from events where bottle_id = $1 order by seq asc`,
    [bottleId],
  );
  return rows.map(
    (row) =>
      ({
        ...row.payload,
        type: row.type,
        bottleId: row.bottle_id,
        actorId: row.actor_id,
        at: row.occurred_at.getTime(),
      }) as unknown as DomainEvent,
  );
}
