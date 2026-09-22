/**
 * 单元测试配置（AGENTS.md §2 的基线命令 `pnpm -r test` 走这里）。
 *
 * **必须在没有数据库、没有 `.env` 的情况下返回 0**：`.env` 是 gitignored 的，
 * 全新克隆 / CI / 其他成员跑基线命令时不该因为缺 DATABASE_URL 而变红。
 * 因此这里显式排除集成测试；集成测试只由 `pnpm --filter @music-drift/api test:integration`
 * （`vitest.integration.config.ts`）跑。
 * 守卫：`src/vitest-config.test.ts`（放宽 include/exclude 会先炸）。
 */
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
  },
});
