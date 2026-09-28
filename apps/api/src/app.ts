import Fastify, { type FastifyInstance } from 'fastify';
import { createSystemClock, type Clock } from '@music-drift/shared/domain';
import { internalProblem, transportProblem } from './http/problem';
import { registerHealthRoutes } from './routes/health';
import { registerAuthRoutes } from './routes/auth';
import { registerAdminRoutes } from './routes/admin';
import { registerBottleRoutes } from './routes/bottles';
import { registerCollectionRoutes } from './routes/collections';
import { registerInteractionRoutes } from './routes/interactions';
import { registerSeaRoutes } from './routes/sea';
import { registerRiverRoutes } from './routes/river';
import { registerSongRoutes } from './routes/songs';
import type { ScryptParams } from './auth/password';
import { createSegmentAudioRepository } from './audio/repository';
import { createSegmentAudioAuthorizer, registerSegmentAudioRoutes } from './audio/routes';
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
  const clock = options.clock ?? createSystemClock();
  const store = options.db === undefined ? undefined : createBottleStore(options.db);

  /**
   * 录音上传走**原始二进制**（captain 裁决 ADR-018）：`Content-Type` 即音频 MIME，body 是字节流。
   * 用 Fastify **内置** `addContentTypeParser`，零新依赖（对比 multipart 需引 @fastify/multipart + busboy）。
   */
  for (const audioMime of ['audio/webm', 'audio/mp4']) {
    app.addContentTypeParser(audioMime, { parseAs: 'buffer' }, (_request, body, done) => {
      done(null, body);
    });
  }

  /**
   * 全局错误出口（t9）：**兜底**把所有未处理错误收敛成 `problem.ts` 的固定形态。
   *
   * 为什么必须有：Fastify 默认处理器会把 `error.message` 原样回显 —— 一个 pg 报错
   * （`insert or update on table "votes" violates foreign key constraint ...`）就会泄漏表名/约束名/SQL 片段。
   * 这里 4xx（框架层：非法 JSON、缺 content-type 等）统一成中文 `INVALID_BODY`，
   * 5xx 统一成 `INTERNAL`（不接受任何错误对象），原始错误只进服务端日志。
   */
  app.setErrorHandler((error: unknown, request, reply) => {
    request.log.error({ err: error }, 'unhandled request error');
    const rawStatus = (error as { statusCode?: unknown }).statusCode;
    const status = typeof rawStatus === 'number' ? rawStatus : 500;
    const problem =
      status >= 400 && status < 500 ? transportProblem('INVALID_BODY') : internalProblem();
    reply.code(problem.status).send(problem.body);
  });

  registerHealthRoutes(app);

  if (options.db !== undefined) {
    registerAuthRoutes(app, {
      db: options.db,
      clock,
      sessionTtlMs: options.sessionTtlMs,
      secureCookies: options.secureCookies,
      passwordParams: options.passwordParams,
    });
  }

  const segmentAudio =
    options.segmentAudio ??
    (options.db === undefined ? undefined : createSegmentAudioRepository(options.db));
  if (segmentAudio !== undefined) {
    registerSegmentAudioRoutes(app, {
      repository: segmentAudio,
      ...(options.db === undefined || store === undefined
        ? {}
        : { canRead: createSegmentAudioAuthorizer({ db: options.db, store, clock }) }),
    });
  }

  if (options.db !== undefined) {
    // 业务路由族（t9）：装配只做增量追加，**不得**覆盖已有族（healthz / auth / segmentAudio）。
    if (store === undefined) throw new Error('Bottle store is required when db is configured.');
    registerSongRoutes(app, { db: options.db, store, clock });
    registerBottleRoutes(app, { db: options.db, store, clock });
    registerSeaRoutes(app, { db: options.db, store, clock });
    registerInteractionRoutes(app, { db: options.db, store, clock });
    registerCollectionRoutes(app, { db: options.db, store, clock });
    registerAdminRoutes(app, { db: options.db, clock });
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
