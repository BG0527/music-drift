/**
 * 集成测试配置（需要真实 Postgres，由 docker-compose.yml 提供）。
 *
 * - 只收 `*.integration.test.ts`，默认 `pnpm test` 不含它们（避免无库环境假绿/假红）；
 * - `globalSetup` 先跑迁移，使「迁移可重复执行」在每次集成跑动时被顺带验证；
 * - `DATABASE_URL` 缺失时用本地 compose 的默认值（仅测试/开发路径），生产无默认值。
 */
import { defineConfig } from 'vitest/config';
import { resolveTestDatabaseUrl } from './src/db/test-database';

// 集成测试跑在**本次运行专属**的可抛弃库上（globalSetup 建库/迁移/清表，teardown 删库）。
// 唯一名由 `resolveTestDatabaseUrl()` 派生：跨进程不再互相清表（captain 裁决 ②）。
// 显式设置 `DATABASE_URL_TEST` 时原样使用（CI / 共享基础设施的覆盖口）。
process.env['DATABASE_URL'] = resolveTestDatabaseUrl();

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    // 该文件具名导出 `setup` + `teardown`（默认导出会让 teardown 被静默忽略）。
    globalSetup: ['./src/db/global-setup.ts'],
    // 文件**串行**执行（并行的随机捞取会捞到别的文件建的瓶子）。
    // 注意：不要再加"每个文件前清表"——那会清掉某些文件在 beforeAll 里建的夹具，
    // 表现为"该文件 7 个用例 404、2 个期望 404 的用例反而通过"（本仓真实踩过）。
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
