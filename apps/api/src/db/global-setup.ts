/**
 * 集成测试的 globalSetup / globalTeardown：
 * 1. 建**本次运行专属**的测试库（唯一名，见 test-database.ts）—— 跨进程不再互相清表；
 * 2. 顺手清掉零连接的陈旧派生库（不碰有连接的，那可能是别人正在跑）；
 * 3. 跑迁移（每次运行都跑 ⇒「迁移可重复执行」被顺带验证）+ 清一次业务表；
 * 4. teardown 把本次的库删掉（失败也不影响下一次：陈旧库会被第 2 步回收）。
 */
import { Client } from 'pg';
import { runMigrations } from './migrate.js';
import { adminUrlFor, databaseNameOf, resolveTestDatabaseUrl, sweepStaleTestDatabases } from './test-database.js';

export const TABLES = [
  'events',
  'notifications',
  'collections',
  'messages',
  'reports',
  'votes',
  'holdings',
  'bottle_segments',
  'bottles',
  'song_segments',
  'songs',
  'anon_codes',
  'sessions',
  'users',
];

/** 清空全部业务表（每次运行一次；**不要**改成"每个文件前清"——会清掉别人的 beforeAll 夹具）。 */
export async function truncateAll(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`truncate table ${TABLES.join(', ')} cascade`);
  } finally {
    await client.end();
  }
}

/**
 * Vitest 的 globalSetup 契约：**具名导出 `setup` / `teardown`** 才会两个都被采纳；
 * 用默认导出时 `teardown` 会被静默忽略（实测踩过：并发两次运行的库都留在 PG 里没回收）。
 */
export async function setup(): Promise<void> {
  const testUrl = resolveTestDatabaseUrl();
  const databaseName = databaseNameOf(testUrl);

  const admin = new Client({ connectionString: adminUrlFor(testUrl) });
  await admin.connect();
  try {
    const existing = await admin.query('select 1 from pg_database where datname = $1', [databaseName]);
    if (existing.rowCount === 0) {
      await admin.query(`create database "${databaseName}"`);
    }
  } finally {
    await admin.end();
  }

  await sweepStaleTestDatabases(testUrl);
  await runMigrations(testUrl);
  await truncateAll(testUrl);
  process.env['DATABASE_URL'] = testUrl;
}

/** 运行结束删掉本次的库（`WITH (FORCE)` 断掉残留连接）。供 global-teardown.ts 调用。 */
export async function dropCurrentTestDatabase(): Promise<void> {
  const testUrl = process.env['DATABASE_URL'];
  if (testUrl === undefined || testUrl.length === 0) {
    return;
  }
  const databaseName = databaseNameOf(testUrl);
  if (!databaseName.startsWith('music_drift_test_')) {
    return; // 显式 DATABASE_URL_TEST（共享库）：不删别人的东西
  }
  const admin = new Client({ connectionString: adminUrlFor(testUrl) });
  await admin.connect();
  try {
    await admin.query(`drop database if exists "${databaseName}" with (force)`);
  } finally {
    await admin.end();
  }
}

/** 运行结束删掉本次的库。 */
export async function teardown(): Promise<void> {
  await dropCurrentTestDatabase();
}
