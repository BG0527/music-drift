/**
 * 基线命令守卫（Finding A 的回归钉）：
 * `pnpm -r test` 是 AGENTS.md §2 的**全量单测**命令基线，而 `.env` 是 gitignored 的，
 * 因此它在没有数据库、没有 DATABASE_URL 的前提下**必须返回 0**。
 * 集成测试只能由 `pnpm --filter @music-drift/api test:integration` 跑。
 *
 * 一旦有人放宽默认 include/exclude（例如把集成测试又收回来），这里先炸。
 */
import { describe, expect, it } from 'vitest';
import config from '../vitest.config';

const include = (config.test?.include ?? []).map((pattern) => String(pattern));
const exclude = (config.test?.exclude ?? []).map((pattern) => String(pattern));

const UNIT_INCLUDE = 'src/**/*.test.ts';
const INTEGRATION_EXCLUDE = '**/*.integration.test.ts';

/**
 * 只判本仓实际用到的两个模式的语义（不引第三方 glob 库、不手写正则转义）：
 * include = `src/**\/*.test.ts`，exclude = `**\/*.integration.test.ts`。
 * 任何模式被改动都会让 `include`/`exclude` 的精确断言先失败。
 */
function collectedByDefault(file: string): boolean {
  const matchesInclude = include.some((pattern) =>
    pattern === UNIT_INCLUDE ? file.startsWith('src/') && file.endsWith('.test.ts') : false,
  );
  if (!matchesInclude) {
    return false;
  }
  const matchesExclude = exclude.some((pattern) =>
    pattern === INTEGRATION_EXCLUDE ? file.endsWith('.integration.test.ts') : false,
  );
  return !matchesExclude;
}

describe('默认 vitest 配置：基线命令不得依赖数据库', () => {
  it('默认配置把 include 卡死在单测模式，并显式排除集成测试', () => {
    expect(include).toEqual([UNIT_INCLUDE]);
    expect(exclude).toContain(INTEGRATION_EXCLUDE);
  });

  it('默认收集单测、不收集任何集成测试文件', () => {
    expect(collectedByDefault('src/app.test.ts')).toBe(true);
    expect(collectedByDefault('src/db/holdings.integration.test.ts')).toBe(false);
    expect(collectedByDefault('src/db/events.integration.test.ts')).toBe(false);
    expect(collectedByDefault('src/db/segments.integration.test.ts')).toBe(false);
    expect(collectedByDefault('src/db/seed.integration.test.ts')).toBe(false);
  });

  it('集成测试配置只收集集成测试：两条命令职责不重叠', async () => {
    const integration = (await import('../vitest.integration.config')).default;
    const patterns = (integration.test?.include ?? []).map((pattern) => String(pattern));

    expect(patterns).toEqual(['src/**/*.integration.test.ts']);
  });
});
