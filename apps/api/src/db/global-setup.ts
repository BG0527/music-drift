/**
 * 集成测试的 globalSetup / globalTeardown：
 * 1. 建**本次运行专属**的测试库（唯一名，见 test-database.ts）—— 跨进程不再互相清表；
 * 2. 顺手清掉零连接的陈旧派生库（不碰有连接的，那可能是别人正在跑）；
 * 3. 跑迁移（每次运行都跑 ⇒「迁移可重复执行」被顺带验证）+ 清一次业务表；
 * 4. teardown 把本次的库删掉（失败也不影响下一次：陈旧库会被第 2 步回收）。
 */
import { Client } from 'pg';
import { runMigrations } from './migrate.js';
import {
  adminUrlFor,
  databaseNameOf,
  isDerivedTestDatabaseName,
  resolveTestDatabaseUrl,
  sweepStaleTestDatabases,
} from './test-database.js';

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
/**
 * 建库（唯一名）+ 回收陈旧库 + 迁移 + 清表，返回本次运行应该用的连接串。
 *
 * 抽出来是因为**不止集成测试需要"一次性的干净库"**：`src/db/live-check.ts`（黄金路径 live-check 的
 * 数据库预备/回收）必须复用同一套派生与回收机制 —— 否则两份实现会各自漂移，而"验证路径不可靠"
 * 正是 t19 要修的病根。`setup()` 只是在它之上再写回 `process.env`。
 */
export async function provisionTestDatabase(): Promise<string> {
  const testUrl = resolveTestDatabaseUrl();
  const databaseName = databaseNameOf(testUrl);

  const admin = new Client({ connectionString: adminUrlFor(testUrl) });
  await admin.connect();
  try {
    const existing = await admin.query('select 1 from pg_database where datname = $1', [
      databaseName,
    ]);
    if (existing.rowCount === 0) {
      await admin.query(`create database "${databaseName}"`);
    }
  } finally {
    await admin.end();
  }

  await sweepStaleTestDatabases(testUrl);
  await runMigrations(testUrl);
  await truncateAll(testUrl);
  return testUrl;
}

export async function setup(): Promise<void> {
  process.env['DATABASE_URL'] = await provisionTestDatabase();
}

/** 运行结束删掉本次的库（`WITH (FORCE)` 断掉残留连接）。供 global-teardown.ts 调用。 */
/**
 * 删掉一个**派生测试库**。名字不符合 `music_drift_test_` 前缀的一律**拒删**（返回 false）——
 * 这是"绝不误删开发库/别人的库"的结构性保证，而不是操作纪律。
 */
export async function dropTestDatabase(testUrl: string): Promise<boolean> {
  if (testUrl.length === 0) {
    return false;
  }
  const databaseName = databaseNameOf(testUrl);
  if (!isDerivedTestDatabaseName(databaseName)) {
    return false; // 显式 DATABASE_URL_TEST（共享库）或开发库：不删别人的东西
  }
  const admin = new Client({ connectionString: adminUrlFor(testUrl) });
  await admin.connect();
  try {
    await admin.query(`drop database if exists "${databaseName}" with (force)`);
    return true;
  } finally {
    await admin.end();
  }
}

export async function dropCurrentTestDatabase(): Promise<void> {
  const testUrl = process.env['DATABASE_URL'];
  if (testUrl === undefined) {
    return;
  }
  await dropTestDatabase(testUrl);
}

/** 运行结束删掉本次的库。 */
export async function teardown(): Promise<void> {
  await dropCurrentTestDatabase();
}
