/**
 * 河道状态持久化（t9）：内核 `RiverState` 的存储适配。
 *
 * 规则**不在**这里：`recordDrawAttempt` / `recordPutBack` / `isDrawExcluded` 都是内核纯函数；
 * 本模块只负责读写「每个用户一行」的状态，使放回冷却能跨请求生效（CONTEXT §15，N=10）。
 */
import { createRiverState, type RiverState } from '@music-drift/shared/domain';
import type { Db, Queryable } from '../db/client.js';

export interface RiverStateStore {
  load(userId: string): Promise<RiverState>;
  save(userId: string, state: RiverState, tx?: Queryable): Promise<void>;
}

export function createRiverStateStore(db: Db): RiverStateStore {
  return {
    async load(userId: string): Promise<RiverState> {
      const rows = await db.query<{ ordinal: number; exclusions: RiverState['exclusions'] }>(
        `select ordinal, exclusions from river_state where user_id = $1`,
        [userId],
      );
      const row = rows[0];
      if (row === undefined) {
        return createRiverState();
      }
      return { drawCounts: { [userId]: Number(row.ordinal) }, exclusions: row.exclusions };
    },

    async save(userId: string, state: RiverState, tx?: Queryable): Promise<void> {
      const target = tx ?? db;
      const ordinal = state.drawCounts[userId] ?? 0;
      await target.query(
        `insert into river_state (user_id, ordinal, exclusions, updated_at)
         values ($1, $2, $3::jsonb, now())
         on conflict (user_id) do update set ordinal = excluded.ordinal, exclusions = excluded.exclusions, updated_at = excluded.updated_at`,
        [userId, ordinal, JSON.stringify(state.exclusions)],
      );
    },
  };
}
