/**
 * 环境变量解析（captain 裁决：dev 与 prod 两种缺库行为**故意不同**）。
 *
 * - **开发/测试**：`DATABASE_URL` 可空 —— 单测与 `/healthz` 冒烟不该要求起数据库
 *   （`server.ts` 会在缺库时打告警且不挂载 `/api/auth/*`、`/api/segments/:id/audio`）；
 * - **生产**：缺 `DATABASE_URL` **启动即失败** —— 生产静默无库运行会比"起不来"更糟：
 *   表现为大面积 5xx，而不是立刻暴露配置错误。
 */
import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv：开发/测试环境', () => {
  it('允许没有 DATABASE_URL（空串），并给出默认端口', () => {
    const env = loadEnv({});

    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_URL).toBe('');
    expect(env.PORT).toBe(8788);
    expect(env.HOST).toBe('0.0.0.0');
  });

  it('给了 DATABASE_URL 就原样使用', () => {
    const url = 'postgres://u:p@localhost:5433/db';
    expect(loadEnv({ NODE_ENV: 'test', DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });
});

describe('loadEnv：生产环境（fail fast）', () => {
  it('有 DATABASE_URL 时正常解析', () => {
    const url = 'postgres://u:p@db:5432/music_drift';
    const env = loadEnv({ NODE_ENV: 'production', DATABASE_URL: url });

    expect(env.NODE_ENV).toBe('production');
    expect(env.DATABASE_URL).toBe(url);
  });

  it('缺 DATABASE_URL（未设置或空串）→ 直接抛错，不允许静默无库启动', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ NODE_ENV: 'production', DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });

  it('错误信息说明原因与做法（便于运维一眼定位）', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/生产环境/);
  });
});
