/**
 * 集成测试的 globalSetup：
 * 1. 建一个**可抛弃的测试库**（`music_drift_test`，由 DATABASE_URL 派生）——不让测试污染开发库；
 * 2. 清空全部业务表（每次运行都从干净状态开始，测试之间不再互相累积）；
 * 3. 跑迁移 —— 「迁移可重复执行（幂等）」因此每次集成跑动都被顺带验证。
 */
import { Client } from 'pg';
import { runMigrations } from './migrate.js';

const TABLES = [
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

export function testDatabaseUrl(): string {
  return (
    process.env['DATABASE_URL_TEST'] ??
    'postgres://music_drift:music_drift_dev@localhost:5433/music_drift_test'
  );
}

function adminUrlFor(testUrl: string): string {
  const url = new URL(testUrl);
  url.pathname = '/postgres';
  return url.toString();
}

/** 清空全部业务表：每次集成运行前 + **每个测试文件**前各一次（文件之间互不干扰）。 */
export async function truncateAll(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`truncate table ${TABLES.join(', ')} cascade`);
  } finally {
    await client.end();
  }
}

export default async function globalSetup(): Promise<void> {
  const testUrl = testDatabaseUrl();
  const databaseName = new URL(testUrl).pathname.replace(/^\//, '');

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

  await runMigrations(testUrl);
  process.env['DATABASE_URL'] = testUrl;
  await truncateAll(testUrl);
}
