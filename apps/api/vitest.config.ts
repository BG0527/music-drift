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
    // `app.ts` 现在 import 11 个路由 + 2 个 store 模块：**首个** import 它的文件要吃完整 transform/加载成本，
    // 在多人并发跑套件（CPU 争用）时会顶破默认 5s —— 症状是「每文件第一条用例超时、其余几十毫秒全过、复跑即绿」。
    // 那是与代码正确性无关、却会掩盖真实错误的基线红；提到 15s 吸收争用（上限不超过集成的 30s，保持两侧一致）。
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
