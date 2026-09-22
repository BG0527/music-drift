import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '@music-drift/shared';
import { buildApp } from './app';

describe('GET /healthz', () => {
  it('responds with a payload that satisfies the shared health contract', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    const parsed = HealthResponseSchema.safeParse(response.json());
    expect(parsed.success).toBe(true);

    await app.close();
  });
});

/**
 * 装配边界（回归钉，非 TDD 红→绿）：`db` 是可选注入，**没注入就不能挂账号路由**。
 * 这条保证了「单测与 `/healthz` 冒烟不需要数据库」；否则无库环境会静默出现半可用 API
 * （`/healthz` 活着、`/api/auth/*` 全 404），比启动失败更难查。
 */
describe('buildApp 装配边界', () => {
  it('未注入 db 时不注册账号路由（404），且健康检查仍可用', async () => {
    const app = buildApp();

    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { handle: 'someone', email: 'someone@example.com', password: 'abcd1234' },
    });
    const health = await app.inject({ method: 'GET', url: '/healthz' });

    expect(register.statusCode).toBe(404);
    expect(health.statusCode).toBe(200);

    await app.close();
  });
});
