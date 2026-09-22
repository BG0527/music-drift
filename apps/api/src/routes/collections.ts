/**
 * 收藏（t9，`docs/api.md` §2.6）：**仅限已完成并进入公海的作品**（CONTEXT §6.4），私人可见、不影响作品状态。
 *
 * 错误码 `COLLECTION_REQUIRES_FINISHED_WORK` 属 **API 层功能规则码**（ADR-018 裁决 ①）：
 * `/api/collections` 是独立端点，返回的是功能级规则，既不是状态机转移，也不该塞进已冻结的内核。
 * 客户端据此**禁用/隐藏收藏按钮**、作品完成后**允许**收藏 —— 符合「需据此区分处置」的准入规则。
 */
import { seaZoneOf } from '@music-drift/shared/domain';
import { UuidSchema } from '@music-drift/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { problemFromViolations, sendProblem, transportProblem } from '../http/problem.js';
import { createActorResolver } from '../http/session.js';
import type { Clock } from '@music-drift/shared/domain';
import type { Db } from '../db/client.js';
import type { BottleStore } from '../store/bottles.js';

export interface CollectionRoutesOptions {
  db: Db;
  store: BottleStore;
  clock: Clock;
}

export function registerCollectionRoutes(app: FastifyInstance, options: CollectionRoutesOptions): void {
  const actors = createActorResolver(options.db, options.clock);
  const { db, store } = options;

  app.get('/api/me/collections', async (request, reply) => {
    const actor = await actors.resolve(request);
    if (actor === null) {
      return sendProblem(reply, transportProblem('UNAUTHENTICATED'));
    }
    const rows = await db.query<{ bottle_id: string; created_at: Date }>(
      `select bottle_id, created_at from collections where user_id = $1 order by created_at desc limit 100`,
      [actor.user.id],
    );
    return reply.send(rows.map((row) => ({ bottleId: row.bottle_id, createdAt: row.created_at.toISOString() })));
  });

  app.post('/api/collections/:bottleId', async (request, reply) => {
    const actor = await actors.resolve(request);
    if (actor === null) {
      return sendProblem(reply, transportProblem('UNAUTHENTICATED'));
    }
    const params = z.object({ bottleId: UuidSchema }).safeParse(request.params);
    if (!params.success) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const state = await store.loadState(params.data.bottleId);
    if (state === null) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    // 规则：只有「已完成并在公海」的作品可收藏（未完成作品在公海未完成区，不可收藏）。
    if (seaZoneOf(state) !== 'COMPLETED') {
      // 注意：不用内核的 `violation()` —— 内核**不认识** API 层码（那正是分层的目的）；
      // 这里直接构造违规条目，经同一个 `problem.ts` 出口映射为 422。
      const problem = problemFromViolations([
        { code: 'COLLECTION_REQUIRES_FINISHED_WORK', message: '收藏只对已完成并进入公海的作品开放。' },
      ]);
      return problem === null ? reply : sendProblem(reply, problem);
    }
    // 幂等：同一作品重复收藏不产生第二行。
    await db.query(
      `insert into collections (id, user_id, bottle_id, created_at)
       values (gen_random_uuid(), $1, $2, $3) on conflict (user_id, bottle_id) do nothing`,
      [actor.user.id, params.data.bottleId, new Date(options.clock.now())],
    );
    return reply.code(201).send({ bottleId: params.data.bottleId, createdAt: new Date(options.clock.now()).toISOString() });
  });

  app.delete('/api/collections/:bottleId', async (request, reply) => {
    const actor = await actors.resolve(request);
    if (actor === null) {
      return sendProblem(reply, transportProblem('UNAUTHENTICATED'));
    }
    const params = z.object({ bottleId: UuidSchema }).safeParse(request.params);
    if (!params.success) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    // 幂等：不存在也返回 204（重复取消不报错）。
    await db.query(`delete from collections where user_id = $1 and bottle_id = $2`, [
      actor.user.id,
      params.data.bottleId,
    ]);
    return reply.code(204).send();
  });
}
