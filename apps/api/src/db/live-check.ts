/**
 * live-check 的**可抛弃数据库**预备/回收（t19 Finding 1b）。
 *
 * 病根：`apps/web/tools/golden-path-live-check.mjs` 原来直接跑在本机 dev 库上 —— 库里混着别人的
 * 瓶子，而「河道随机捞取」会捞到不属于本次运行的瓶子，于是端到端检查**通过与否取决于环境运气**
 *（captain 复现：第 15 步断链，其后 11 项失败同源；我在同一台机器上实测 3 次里 1 次 exit 1、2 次 exit 0）。
 * 这不是读代码能"感觉"出来的问题：**唯一可靠的修法是让它跑在自己的库上**。
 *
 * 这里**复用** `test-database.ts` + `global-setup.ts` 的既有机制（派生 `music_drift_test_<epoch>_<pid>_<rand>`
 * + 建库 + 迁移 + 超龄回收 + 删库守卫），不另抄一份派生逻辑 —— 两份实现必然漂移。
 *
 * 用法（由 live-check 脚本 spawn，也可以在仓库根手动跑）：
 *   pnpm --filter @music-drift/api live-check:db create   # 建库 + 迁移 + 灌种子，末行打印 JSON
 *   pnpm --filter @music-drift/api live-check:db drop <库名>
 *   pnpm --filter @music-drift/api live-check:db sweep    # 回收超龄派生库（create 里也会做）
 *
 * 为什么 `drop` 收的是**库名**而不是连接串：建库进程会退出，分两个进程做更简单；而"让进程活着等信号"
 * 在 Windows 上有一堆坑。删库前一律过 `dropTestDatabase` 的派生名前缀守卫（开发库/共享库拒删）。
 *
 * 输出风格：直接写 stdout/stderr（与 `db/migrate.ts` 一致，避免 `no-console` 规则）。
 */
import { EOL } from 'node:os';
import { createDb } from './client.js';
import { dropTestDatabase, provisionTestDatabase } from './global-setup.js';
import { runSeed } from './seed.js';
import { databaseNameOf, sweepStaleTestDatabases } from './test-database.js';

function databaseUrlForName(name: string): string {
  const base =
    process.env['DATABASE_URL_TEST'] ??
    'postgres://music_drift:music_drift_dev@localhost:5433/music_drift_test';
  const parsed = new URL(base);
  parsed.pathname = '/' + name;
  return parsed.toString();
}

function out(payload: unknown): void {
  process.stdout.write(JSON.stringify(payload) + EOL);
}

function fail(message: string): never {
  process.stderr.write(message + EOL);
  process.exit(2);
}

async function main(): Promise<void> {
  const [subcommand, argument] = process.argv.slice(2);

  if (subcommand === 'create') {
    const databaseUrl = await provisionTestDatabase();
    // 灌种子：曲库要有 3 首带分段元数据的占位歌，端到端检查才能"选一首歌从头走完"。
    // 刻意不在 dev 库上跑（那里有 18 首 `song-xxxxxxxx` 测试残留，见 t11 回报）。
    const db = await createDb(databaseUrl);
    try {
      const seeded = await runSeed(db);
      out({
        databaseUrl,
        databaseName: databaseNameOf(databaseUrl),
        seededSongs: seeded.songs,
        seededSegments: seeded.segments,
      });
    } finally {
      await db.close();
    }
    return;
  }

  if (subcommand === 'drop') {
    if (argument === undefined || argument.length === 0) {
      fail('用法：live-check:db drop <库名>');
    }
    const dropped = await dropTestDatabase(databaseUrlForName(argument));
    out({ dropped, databaseName: argument });
    return;
  }

  if (subcommand === 'sweep') {
    const swept = await sweepStaleTestDatabases(databaseUrlForName('music_drift_test'));
    out({ swept });
    return;
  }

  fail('用法：live-check:db create | drop <库名> | sweep');
}

await main();
