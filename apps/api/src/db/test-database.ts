/**
 * 集成测试库的**唯一化**（captain 裁决 ②）：每次运行用自己的库，跨进程不再互相清表。
 *
 * 背景：全队共用 `music_drift_test` + 每次运行清表 ⇒ 两名成员同时跑集成会互相清数据，
 * 症状是「同一命令时而 exit 0 时而 exit 1」，而汇总数字看不出原因。
 * 这里把它变成**结构上不可能发生**，而不是靠"记得别一起跑"。
 *
 * 规则：
 * - 显式设置 `DATABASE_URL_TEST` → **原样使用**（CI / 共享基础设施需要这个覆盖口）；
 * - 否则由基础库名派生 `music_drift_test_<pid>_<短随机>` —— 进程内唯一、跨进程不撞；
 * - 旧运行残留的库：下一次运行时**顺手清掉零连接的那些**（有连接说明有人在用，绝不碰）。
 */
import { Client } from 'pg';


const BASE_DATABASE = 'music_drift_test';
const SWEEP_PATTERN = BASE_DATABASE + '_%'; // LIKE 模式：前缀匹配（下划线是通配符，够用）
/** 只有"嵌入时间戳早于该阈值"的旧库才会被回收；并发的活库不可能被误清。 */
const STALE_AFTER_SECONDS = 30 * 60;

function withDatabaseName(url: string, databaseName: string): string {
  const parsed = new URL(url);
  parsed.pathname = '/' + databaseName;
  return parsed.toString();
}

/** 未指定 `DATABASE_URL_TEST` 时使用的"模板"连接串（库名会被替换为唯一名）。 */
export function baseTestDatabaseUrl(): string {
  return (
    process.env['DATABASE_URL_TEST'] ??
    'postgres://music_drift:music_drift_dev@localhost:5433/' + BASE_DATABASE
  );
}

/** 本次运行实际使用的库连接串（`DATABASE_URL_TEST` 显式给定则原样返回）。 */
export function resolveTestDatabaseUrl(): string {
  const explicit = process.env['DATABASE_URL_TEST'];
  if (explicit !== undefined && explicit.length > 0) {
    return explicit;
  }
  // 名字里嵌**创建时间戳**：回收时据此判新旧 —— 「有没有连接」在两次操作之间会瞬时为 0，不可靠
  // （第一版按连接数回收，把并发另一次运行的库在迁移中途删掉过，实测 exit=1）。
  const epochSeconds = Math.floor(Date.now() / 1000);
  const suffix = `${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  return withDatabaseName(baseTestDatabaseUrl(), `${BASE_DATABASE}_${epochSeconds}_${suffix}`);
}

export function adminUrlFor(testUrl: string): string {
  const url = new URL(testUrl);
  url.pathname = '/postgres';
  return url.toString();
}

export function databaseNameOf(testUrl: string): string {
  return new URL(testUrl).pathname.replace(/^\//, '');
}

/**
 * 回收**陈旧**的派生库：只清「名字里的时间戳早于阈值」的那些（默认 30 分钟）。
 * 判据不能是"有没有连接"——两次操作之间连接数会瞬时为 0，会把并发运行中的库删掉。
 * 返回值：被清掉的库名（便于测试与诊断）。`nowSeconds` 可注入，便于测试。
 */
export async function sweepStaleTestDatabases(testUrl: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string[]> {
  const current = databaseNameOf(testUrl);
  const client = new Client({ connectionString: adminUrlFor(testUrl) });
  await client.connect();
  try {
    const candidates = await client.query<{ datname: string }>(
      `select datname from pg_database where datname like $1 and datname <> $2`,
      [SWEEP_PATTERN, current],
    );
    const stale = candidates.rows
      .map((row) => ({ name: row.datname, epoch: Number(/^music_drift_test_(\d+)_/.exec(row.datname)?.[1] ?? '0') }))
      .filter((candidate) => candidate.epoch > 0 && nowSeconds - candidate.epoch > STALE_AFTER_SECONDS);
    for (const candidate of stale) {
      await client.query(`drop database if exists "${candidate.name}" with (force)`);
    }
    return stale.map((candidate) => candidate.name);
  } finally {
    await client.end();
  }
}
