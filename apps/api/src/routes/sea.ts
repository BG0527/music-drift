/**
 * 公海（t9，`docs/api.md` §2.5）：已完成区 / 未完成区 + 详情 + 指定接唱。
 *
 * 分区口径来自内核 `isComplete` / `seaZoneOf`（ADR-015 §16.4），不在路由里重算。
 */
import { hasEverSung, isComplete, seaZoneOf, violation } from '@music-drift/shared/domain';
import { BottleListQuerySchema, UuidSchema } from '@music-drift/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { problemFromViolations, sendProblem, transportProblem } from '../http/problem.js';
import { createActorResolver } from '../http/session.js';
import type { Clock } from '@music-drift/shared/domain';
import type { Db } from '../db/client.js';
import { decodeSeaCursor, type BottleStore, type SeaCursorPosition } from '../store/bottles.js';
import { createRequestContext } from '../store/context.js';
import { toBottleSummary } from '../store/dto.js';

export interface SeaRoutesOptions {
  db: Db;
  store: BottleStore;
  clock: Clock;
}

export function registerSeaRoutes(app: FastifyInstance, options: SeaRoutesOptions): void {
  const actors = createActorResolver(options.db, options.clock);

  /** 曲名不在 `bottles` 行里，必须显式查：契约 `BottleSummarySchema.songTitle` 有 min(1)。 */
  async function songTitleOf(songId: string): Promise<string> {
    const rows = await options.db.query<{ title: string }>(
      `select title from songs where id = $1`,
      [songId],
    );
    return rows[0]?.title ?? '';
  }

  app.get('/api/sea', async (request, reply) => {
    /** 查询参数用**契约里那一份**（`BottleListQuerySchema`），不再维护内联 schema。 */
    const query = BottleListQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      return sendProblem(reply, transportProblem('INVALID_BODY'));
    }
    // `zone` 是 `seaZone` 的旧别名（向后兼容）；默认只看**已完成区**（CONTEXT §6.1）
    const zone = query.data.seaZone ?? query.data.zone ?? 'COMPLETED';

    let after: SeaCursorPosition | undefined;
    if (query.data.cursor !== undefined) {
      const decoded = decodeSeaCursor(query.data.cursor);
      if (decoded === null) {
        // 解不开的游标**必须报错**：静默忽略等于"每次都回到第一页"（第 4 类静默损失）
        return sendProblem(reply, transportProblem('INVALID_BODY'));
      }
      after = decoded;
    }

    const page = await options.store.listSeaBottles({
      zone,
      status: query.data.status ?? null,
      limit: query.data.limit,
      after,
    });
    const rows = page.rows;
    // 一次性把这一页用到的曲名查出来（避免每行一条查询）
    const songIds = [...new Set(rows.map((row) => row.songId))];
    const titles = new Map<string, string>();
    if (songIds.length > 0) {
      const songRows = await options.db.query<{ id: string; title: string }>(
        `select id, title from songs where id = any($1::uuid[])`,
        [songIds],
      );
      for (const song of songRows) {
        titles.set(song.id, song.title);
      }
    }
    const items = [];
    for (const row of rows) {
      const state = await options.store.loadState(row.id);
      if (state !== null) {
        items.push(toBottleSummary(row, state, titles.get(row.songId) ?? ''));
      }
    }
    // 分区判定已由 store 交给**内核**完成（`seaZoneOf`），这里不再自己 filter
    //（"先取 limit 再过滤"会让某页静默少给行，甚至返回空页却声称到底 —— §46.2 的原始缺陷）
    return reply.send({ items, nextCursor: page.nextCursor });
  });

  app.get('/api/sea/:id', async (request, reply) => {
    const params = z.object({ id: UuidSchema }).safeParse(request.params);
    if (!params.success) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const row = await options.store.findBottle(params.data.id);
    const state = await options.store.loadState(params.data.id);
    if (row === null || state === null || seaZoneOf(state) === null) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    return reply.send(toBottleSummary(row, state, await songTitleOf(row.songId)));
  });

  /** 指定接唱（CONTEXT §6.2）：只对**公海未完成**作品开放；完成品只能听不能接。 */
  app.post('/api/sea/:id/targeted-segment', async (request, reply) => {
    const actor = await actors.resolve(request);
    if (actor === null) {
      return sendProblem(reply, transportProblem('UNAUTHENTICATED'));
    }
    const params = z.object({ id: UuidSchema }).safeParse(request.params);
    if (!params.success) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const state = await options.store.loadState(params.data.id);
    if (state === null || seaZoneOf(state) === null) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    // 规则全部来自**内核导出**（内核冻结，没有 requestTargetedSegment 命令，但码与判定都在内核里）：
    // 已完整 → BOTTLE_ALREADY_COMPLETE；在本瓶唱过 → ALREADY_SANG_IN_BOTTLE。路由不发明规则。
    const violations = isComplete(state)
      ? [violation('BOTTLE_ALREADY_COMPLETE')]
      : hasEverSung(state, actor.user.id)
        ? [violation('ALREADY_SANG_IN_BOTTLE')]
        : [];
    if (violations.length > 0) {
      const problem = problemFromViolations(violations);
      return problem === null ? reply : sendProblem(reply, problem);
    }
    const outcome = await options.store.takeTargetedSegment({
      bottleId: params.data.id,
      userId: actor.user.id,
      ctx: createRequestContext(options.clock),
    });
    if (outcome === null) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const row = await options.store.findBottle(params.data.id);
    const next = await options.store.loadState(params.data.id);
    if (row === null || next === null) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    return reply.send(toBottleSummary(row, next, await songTitleOf(row.songId)));
  });
}
