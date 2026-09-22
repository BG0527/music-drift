import { buildApp } from './app';
import { loadEnv } from './env';

const env = loadEnv();
const app = buildApp({ logger: env.LOG_LEVEL !== 'silent' });

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
