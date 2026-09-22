/**
 * 迁移执行入口（drizzle-orm 运行时 migrator；global-setup 与 `pnpm db:migrate` 共用）。
 * 幂等：drizzle 用 __drizzle_migrations 表记账，重复执行不会重复施加。
 */
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createPool } from './client.js';

export function migrationsFolder(): string {
  return new URL('../../drizzle/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
}

export async function runMigrations(databaseUrl: string): Promise<void> {
  if (databaseUrl.length === 0) {
    throw new Error('DATABASE_URL 未设置：本地开发请先 `docker compose up -d --wait`');
  }
  const pool = createPool(databaseUrl);
  try {
    await migrate(drizzle(pool), { migrationsFolder: migrationsFolder() });
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.includes('migrate')) {
  const databaseUrl = process.env['DATABASE_URL'] ?? '';
  await runMigrations(databaseUrl);
  process.stdout.write('migrations applied\n');
}
