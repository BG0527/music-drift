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
