import { buildApp } from './app';
import { loadEnv } from './env';
import { createDb, type Db } from './db/client';

const env = loadEnv();

/**
 * 数据库是**可选**依赖：没有 `DATABASE_URL`（或库没起）时 API 仍要能启动并提供 `/healthz`，
 * 只是依赖数据库的端点在启动日志里明确标注不可用 —— 静默降级比启动失败更难查。
 */
async function connectDbIfConfigured(): Promise<Db | null> {
  if (env.DATABASE_URL === '') {
    return null;
  }
  try {
    return await createDb(env.DATABASE_URL);
  } catch (error) {
    console.error('[api] 数据库连接失败，依赖数据库的端点不会挂载：', error);
    return null;
  }
}

const db = await connectDbIfConfigured();
const app = buildApp({
  logger: env.LOG_LEVEL !== 'silent',
  ...(db === null ? {} : { db }),
  // 本地 http 下带 Secure 浏览器不会保存 cookie，因此只在生产开启。
  secureCookies: env.NODE_ENV === 'production',
});

if (db === null) {
  console.warn(
    '[api] 未配置 DATABASE_URL：/api/auth/* 与 /api/segments/:id/audio 未挂载（先 `pnpm db:up` 并复制 .env.example 为 .env）。',
  );
}

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
