/**
 * drizzle-kit 配置（D-04）：迁移产物落在 apps/api/drizzle/，与代码一起入库（评审可读）。
 * 连接串来自环境变量；本地开发缺省用 docker-compose.yml 的凭据（仅在 dev/测试路径）。
 */
import { defineConfig } from 'drizzle-kit';

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgres://music_drift:music_drift_dev@localhost:5433/music_drift';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  strict: true,
  verbose: true,
  dbCredentials: { url: DATABASE_URL },
});
