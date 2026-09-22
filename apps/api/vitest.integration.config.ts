/**
 * 集成测试配置（需要真实 Postgres，由 docker-compose.yml 提供）。
 *
 * - 只收 `*.integration.test.ts`，默认 `pnpm test` 不含它们（避免无库环境假绿/假红）；
 * - `globalSetup` 先跑迁移，使「迁移可重复执行」在每次集成跑动时被顺带验证；
 * - `DATABASE_URL` 缺失时用本地 compose 的默认值（仅测试/开发路径），生产无默认值。
 */
import { defineConfig } from 'vitest/config';

// 集成测试跑在**可抛弃的测试库**上（global-setup 负责建库/清表/迁移），不碰开发库。
// 注意：`process.env` 是 index signature，`noPropertyAccessFromIndexSignature` 下必须用下标访问。
process.env['DATABASE_URL'] ??=
  process.env['DATABASE_URL_TEST'] ??
  'postgres://music_drift:music_drift_dev@localhost:5433/music_drift_test';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['./src/db/global-setup.ts'],
    // 文件之间完全隔离：每个文件前清表（per-file-setup） + 串行执行文件。
    setupFiles: ['./src/db/per-file-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
