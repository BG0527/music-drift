import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /**
   * Postgres 连接串（本地由 `pnpm db:up` 提供，见 README「本地起库与迁移」）。
   *
   * **开发/测试**：允许缺省为空串 —— 没有库时 API 仍要能起来提供 `/healthz` 冒烟，
   * 依赖数据库的路由（`/api/auth/*`、`/api/segments/:id/audio`）不挂载并在启动日志里**显式告警**
   * （`server.ts`）；静默降级比启动失败更难查。
   * **生产**：缺省即失败，见下方 `superRefine`。
   */
  DATABASE_URL: z.string().default(''),
});

/**
 * 生产环境缺库 → **启动即失败**（captain 裁决）。
 *
 * dev 的"降级 + 告警"是便利；生产静默无库运行比起不来更糟：会表现为大面积 5xx，
 * 而不是立刻暴露配置错误。两种行为**故意不同**，对应测试 `env.test.ts`。
 */
const EnvSchemaWithProductionGuard = EnvSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && env.DATABASE_URL === '') {
    ctx.addIssue({
      code: 'custom',
      path: ['DATABASE_URL'],
      message:
        '生产环境必须设置 DATABASE_URL：缺少时拒绝启动（开发环境允许缺省，只会告警并降级）。',
    });
  }
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchemaWithProductionGuard.parse(source);
}
