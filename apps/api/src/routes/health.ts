import type { FastifyInstance } from 'fastify';
import { CONTRACT_VERSION, HealthResponseSchema } from '@music-drift/shared';

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/healthz', async () => {
    return HealthResponseSchema.parse({
      status: 'ok',
      service: 'api',
      contractVersion: CONTRACT_VERSION,
    });
  });
}
