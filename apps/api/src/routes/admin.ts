/**
 * 管理员路由骨架（t9）：**只做权限校验 + 只读队列**；审核流转（驳回/删段/删瓶/封禁 + 覆盖自动斩杀）
 * 属 t12，本任务不实现 —— 决策端点显式返回 501（`NOT_IMPLEMENTED`），而不是假装成功。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UuidSchema } from '@music-drift/shared';
import { sendProblem, transportProblem } from '../http/problem.js';
import { createActorResolver } from '../http/session.js';
import type { Clock } from '@music-drift/shared/domain';
import type { Db } from '../db/client.js';

export interface AdminRoutesOptions {
  db: Db;
  clock: Clock;
}

export function registerAdminRoutes(app: FastifyInstance, options: AdminRoutesOptions): void {
  const actors = createActorResolver(options.db, options.clock);

  async function requireAdmin(request: Parameters<typeof actors.resolve>[0], reply: Parameters<typeof sendProblem>[0]) {
    const actor = await actors.resolve(request);
    if (actor === null) {
      sendProblem(reply, transportProblem('UNAUTHENTICATED'));
      return null;
    }
    if (!actor.isAdmin) {
      // 权限必须**服务端**校验：前端隐藏不算（CONTEXT §8 / t12 纪律）。
      sendProblem(reply, transportProblem('FORBIDDEN'));
      return null;
    }
    return actor;
  }

  app.get('/api/admin/reports', async (request, reply) => {
    const actor = await requireAdmin(request, reply);
    if (actor === null) {
      return reply;
    }
    const rows = await options.db.query<{
      id: string;
      target_type: string;
      target_id: string;
      reason: string;
      status: string;
      created_at: Date;
    }>(
      `select id, target_type, target_id, reason, status, created_at from reports
       where status = 'PENDING' order by created_at asc limit 100`,
    );
    return reply.send(
      rows.map((row) => ({
        id: row.id,
        targetType: row.target_type,
        targetId: row.target_id,
        reason: row.reason,
        status: row.status,
        createdAt: row.created_at.toISOString(),
      })),
    );
  });

  app.post('/api/admin/reports/:id/decision', async (request, reply) => {
    const actor = await requireAdmin(request, reply);
    if (actor === null) {
      return reply;
    }
    const params = z.object({ id: UuidSchema }).safeParse(request.params);
    if (!params.success) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    // 审核结论（删段/删瓶/封禁）与「人工覆盖自动斩杀」属 t12；这里明确未实现。
    return sendProblem(reply, transportProblem('NOT_IMPLEMENTED'));
  });
}
