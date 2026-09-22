import Fastify, { type FastifyInstance } from 'fastify';
import { registerHealthRoutes } from './routes/health';

export type BuildAppOptions = {
  logger?: boolean;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  registerHealthRoutes(app);

  return app;
}
