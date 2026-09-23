/**
 * Postgres 连接与 drizzle 实例（D-01 方案 A / D-04 drizzle）。
 *
 * - `query()` 直接走 node-postgres：**并发抢占等对原子性敏感的地方一律用原生 SQL**（D-04 明确允许）；
 * - `drizzle` 实例供类型安全的常规查询使用；
 * - 时间戳一律由注入时钟（`createSystemClock()`）产生，本模块不取时间。
 */
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema.js';

/**
 * 只依赖 `query` 的最小接口：`Db` 与事务句柄都能满足它，
 * 于是 t5 的 `holdings/segments/events` 模块可以在事务里复用（同一个连接）。
 */
export interface Queryable {
  query: <T = Record<string, unknown>>(text: string, params?: readonly unknown[]) => Promise<T[]>;
}

export interface Db extends Queryable {
  /** 原生 SQL（并发原语走这里）；T 为行类型，调用方自行负责与查询列对齐。 */
  query: <T = Record<string, unknown>>(text: string, params?: readonly unknown[]) => Promise<T[]>;
  /** drizzle 类型安全查询。 */
  orm: NodePgDatabase<typeof schema>;
  /**
   * 单条命令的持久化必须原子：事件流 + 段投影 + 持有者锁要么全成、要么全不成。
   * 事务句柄只暴露 `query`，避免在事务里误用池（那会拿到另一条连接、脱离事务）。
   */
  withTransaction: <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
}

export function createPool(databaseUrl: string, overrides: PoolConfig = {}): Pool {
  return new Pool({ connectionString: databaseUrl, ...overrides });
}

export async function createDb(databaseUrl: string, overrides: PoolConfig = {}): Promise<Db> {
  if (databaseUrl.length === 0) {
    throw new Error('DATABASE_URL 未设置：本地开发请先 `docker compose up -d --wait`');
  }
  const pool = createPool(databaseUrl, overrides);
  // 连接失败要立刻可见，而不是在第一次查询时才炸。
  await pool.query('select 1');
  return {
    query: async <T = Record<string, unknown>>(
      text: string,
      params: readonly unknown[] = [],
    ): Promise<T[]> => {
      const result = await pool.query(text, params as unknown[]);
      return result.rows as T[];
    },
    orm: drizzle(pool, { schema }),
    withTransaction: async <T>(fn: (tx: Queryable) => Promise<T>): Promise<T> => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const tx: Queryable = {
          query: async <R = Record<string, unknown>>(
            text: string,
            params: readonly unknown[] = [],
          ): Promise<R[]> => {
            const result = await client.query(text, params as unknown[]);
            return result.rows as R[];
          },
        };
        const value = await fn(tx);
        await client.query('commit');
        return value;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
    close: async () => {
      await pool.end();
    },
  };
}
