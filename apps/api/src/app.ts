import Fastify, { type FastifyInstance } from 'fastify';
import { createSystemClock, type Clock } from '@music-drift/shared/domain';
import { registerHealthRoutes } from './routes/health';
import { registerAuthRoutes } from './routes/auth';
import { registerBottleRoutes } from './routes/bottles';
import { registerRiverRoutes } from './routes/river';
import { registerSongRoutes } from './routes/songs';
import type { ScryptParams } from './auth/password';
import { createSegmentAudioRepository } from './audio/repository';
import { registerSegmentAudioRoutes } from './audio/routes';
import type { Db } from './db/client';
import { createBottleStore } from './store/bottles';
import { createRiverStateStore } from './store/riverState';

export type BuildAppOptions = {
  logger?: boolean;
  /**
   * 数据库连接池（**可选注入**）。
   *
   * 本文件是"路由装配"，不是"资源生命周期"：连接池的创建与关闭归 `server.ts`（谁建谁关）。
   * 传了 `db` 时，依赖数据库的路由（当前：账号体系、分段音频播放）自动挂载；不传则只挂无库路由，
   * 于是单测与 `/healthz` 冒烟都不需要数据库。
   */
  db?: Db;
  /**
   * 分段音频仓储的**显式覆盖**（D-02：bytea + HTTP Range）。
   * 只有"不想带整个连接池"的路由级单测才需要它；传了 `db` 时无需再传。
   */
  segmentAudio?: ReturnType<typeof createSegmentAudioRepository>;
  /** 注入时钟（ADR-005 不变式 4：API 层不自取墙上时间）；缺省用系统时钟。 */
  clock?: Clock | undefined;
  /** 会话 TTL 覆盖（缺省 30 天，见 `auth/session.ts`）。 */
  sessionTtlMs?: number | undefined;
  /** 仅生产开启 `Secure`（本地 http 下带 Secure 浏览器不会保存 cookie）。 */
  secureCookies?: boolean | undefined;
  /** scrypt 参数覆盖：仅测试用（生产走 D-03 冻结参数）。 */
  passwordParams?: ScryptParams | undefined;
  /** 河道随机源（可注入，便于测试确定性；缺省 Math.random）。 */
  random?: (() => number) | undefined;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  registerHealthRoutes(app);

  if (options.db !== undefined) {
    registerAuthRoutes(app, {
      db: options.db,
      clock: options.clock ?? createSystemClock(),
      sessionTtlMs: options.sessionTtlMs,
      secureCookies: options.secureCookies,
      passwordParams: options.passwordParams,
    });
  }

  const segmentAudio =
    options.segmentAudio ??
    (options.db === undefined ? undefined : createSegmentAudioRepository(options.db));
  if (segmentAudio !== undefined) {
    registerSegmentAudioRoutes(app, { repository: segmentAudio });
  }

  if (options.db !== undefined) {
    // 业务路由族（t9）：装配只做增量追加，**不得**覆盖已有族（healthz / auth / segmentAudio）。
    const clock = options.clock ?? createSystemClock();
    const store = createBottleStore(options.db);
    registerSongRoutes(app, { db: options.db, store, clock });
    registerBottleRoutes(app, { db: options.db, store, clock });
    registerRiverRoutes(app, {
      db: options.db,
      store,
      clock,
      random: options.random,
      riverState: createRiverStateStore(options.db),
    });
  }

  return app;
}
