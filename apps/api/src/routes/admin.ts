/**
 * 管理员路由（t9 骨架 + t12 真实裁决流转）。
 *
 * 分工没变，只是把 501 换成真实实现：
 * - **权限必须服务端校验**（前端隐藏按钮不算）：无 cookie → 401，非管理员 → 403，
 *   **且 403 的响应体不包含任何队列内容**（连"这条举报存在"都不说）；
 * - 四种处置：`NONE`（驳回）/ `REMOVE_SEGMENT` / `REMOVE_BOTTLE` / `BAN_USER`，
 *   外加 **`RESTORE_SEGMENT`** —— 人工**覆盖**自动斩杀的唯一入口（见下）。
 *
 * 三条设计原则：
 * 1. **自动 vs 人工的优先级是显式的**：自动斩杀（10 踩）只做软删；人工 `RESTORE_SEGMENT`
 *    能把段**真的还回有效段**（清 `deleted_at`）。不做恢复，审核台就只是"删东西的按钮"；
 * 2. **删是软删、封是标记**：段软删保留审计、用户留行只置 `banned_at`，申诉与追责都还有依据；
 * 3. **失败零副作用**：动作与对象不匹配（如对"瓶子"选「删段」）→ 422
 *    `REVIEW_ACTION_NOT_APPLICABLE`，且举报**保持 PENDING**；
 *    同一条举报改主意 → 422 `REPORT_ALREADY_REVIEWED`（客户端该刷新队列），相同裁决幂等（200）。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ReportActionSchema, ReportSchema, UuidSchema } from '@music-drift/shared';
import { problemFromViolations, sendProblem, transportProblem } from '../http/problem.js';
import { createActorResolver } from '../http/session.js';
import type { Clock } from '@music-drift/shared/domain';
import type { Db, Queryable } from '../db/client.js';
import { banUser, removeBottle, removeSegment, restoreSegment } from '../store/moderation.js';

export interface AdminRoutesOptions {
  db: Db;
  clock: Clock;
}

interface ReportRow {
  id: string;
  target_type: string;
  target_id: string;
  reporter_id: string;
  reason: string;
  status: string;
  action: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  comment_content: string | null;
  comment_author_account: string | null;
  comment_deleted_at: Date | null;
}

const REPORT_SELECT = `select r.id, r.target_type, r.target_id, r.reporter_id, r.reason, r.status,
  r.action, r.reviewed_at, r.created_at, pc.content as comment_content,
  cu.handle as comment_author_account, pc.deleted_at as comment_deleted_at
  from reports r
  left join public_comments pc on r.target_type = 'COMMENT' and pc.id = r.target_id
  left join users cu on cu.id = pc.author_id`;

function toReport(row: ReportRow) {
  return ReportSchema.parse({
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    status: row.status,
    action: row.action,
    createdAt: row.created_at.toISOString(),
    reviewedAt: row.reviewed_at === null ? null : row.reviewed_at.toISOString(),
    ...(row.target_type === 'COMMENT'
      ? {
          commentEvidence:
            row.comment_content === null || row.comment_author_account === null
              ? null
              : {
                  content: row.comment_content,
                  authorAccount: row.comment_author_account,
                  deletedAt:
                    row.comment_deleted_at === null
                      ? null
                      : row.comment_deleted_at.toISOString(),
                },
        }
      : {}),
  });
}

const ListQuerySchema = z.object({
  /** 默认只看待处理队列；`REVIEWED` 用于回看历史（恢复动作的入口）。 */
  status: z.enum(['PENDING', 'REVIEWED', 'ALL']).default('PENDING'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const DecisionSchema = z.object({
  decision: ReportActionSchema,
  note: z.string().max(500).optional(),
});

/** 动作 → 允许的举报对象类型（不匹配就是 422，绝不是静默成功）。 */
const ACTION_TARGETS: Record<string, readonly string[]> = {
  NONE: ['BOTTLE', 'SEGMENT', 'MESSAGE', 'COMMENT'],
  REMOVE_SEGMENT: ['SEGMENT'],
  RESTORE_SEGMENT: ['SEGMENT'],
  REMOVE_BOTTLE: ['BOTTLE'],
  REMOVE_COMMENT: ['COMMENT'],
  BAN_USER: ['BOTTLE', 'SEGMENT', 'MESSAGE'],
};

export function registerAdminRoutes(app: FastifyInstance, options: AdminRoutesOptions): void {
  const actors = createActorResolver(options.db, options.clock);

  async function requireAdmin(
    request: Parameters<typeof actors.resolve>[0],
    reply: Parameters<typeof sendProblem>[0],
  ) {
    const actor = await actors.resolve(request);
    if (actor === null) {
      sendProblem(reply, transportProblem('UNAUTHENTICATED'));
      return null;
    }
    if (!actor.isAdmin) {
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
    const query = ListQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      return sendProblem(reply, transportProblem('INVALID_BODY'));
    }
    const rows =
      query.data.status === 'ALL'
        ? await options.db.query<ReportRow>(`${REPORT_SELECT} order by r.created_at asc limit $1`, [
            query.data.limit,
          ])
        : await options.db.query<ReportRow>(
            `${REPORT_SELECT} where r.status = $1 order by r.created_at asc limit $2`,
            [query.data.status, query.data.limit],
          );
    return reply.send(rows.map(toReport));
  });

  app.post('/api/admin/reports/:id/decision', async (request, reply) => {
    const actor = await requireAdmin(request, reply);
    if (actor === null) {
      return reply;
    }
    const params = z.object({ id: UuidSchema }).safeParse(request.params);
    const body = DecisionSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      // 结构错误 → 400（传输层，envelope 不带码；见 docs/api.md §1）
      return sendProblem(reply, transportProblem('INVALID_BODY'));
    }

    const rows = await options.db.query<ReportRow>(`${REPORT_SELECT} where r.id = $1`, [
      params.data.id,
    ]);
    const report = rows[0];
    if (report === undefined) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }

    const decision = body.data.decision;

    // 重复裁决：同一结论幂等（200）；改主意则拒绝，让客户端刷新队列
    if (report.status === 'REVIEWED') {
      if (report.action === decision) {
        return reply.send(toReport(report));
      }
      const problem = problemFromViolations([
        {
          code: 'REPORT_ALREADY_REVIEWED',
          message: '这条举报已经有裁定了；刷新队列再决定要不要改判。',
        },
      ]);
      return problem === null ? reply : sendProblem(reply, problem);
    }

    const allowedTargets = ACTION_TARGETS[decision] ?? [];
    if (!allowedTargets.includes(report.target_type)) {
      const problem = problemFromViolations([
        {
          code: 'REVIEW_ACTION_NOT_APPLICABLE',
          message: '这个动作不适用于这条举报的对象类型，请换一个动作。',
        },
      ]);
      return problem === null ? reply : sendProblem(reply, problem);
    }

    // 有些动作要先解出"对象的所有者"（封禁封的是人，不是内容）
    const ownerId = await resolveOwner(options.db, report);
    if (decision === 'BAN_USER' && ownerId === null) {
      const problem = problemFromViolations([
        {
          code: 'REVIEW_ACTION_NOT_APPLICABLE',
          message: '找不到这条内容的主人，无法封禁；请改用删段或删瓶。',
        },
      ]);
      return problem === null ? reply : sendProblem(reply, problem);
    }

    const now = new Date(options.clock.now());
    await options.db.withTransaction(async (tx) => {
      await applyAction(tx, decision, report, ownerId, actor.user.id, now);
      await tx.query(
        `update reports set status = 'REVIEWED', action = $2, reviewed_by = $3, reviewed_at = $4 where id = $1`,
        [report.id, decision, actor.user.id, now],
      );
    });

    const updated = await options.db.query<ReportRow>(`${REPORT_SELECT} where r.id = $1`, [
      report.id,
    ]);
    return reply.send(toReport(updated[0] as ReportRow));
  });
}

/** 举报对象 → 内容所有者（封禁用）；解不出来返回 null（调用方据此拒绝动作）。 */
async function resolveOwner(db: Queryable, report: ReportRow): Promise<string | null> {
  if (report.target_type === 'BOTTLE') {
    const rows = await db.query<{ initiator_id: string }>(
      `select initiator_id from bottles where id = $1`,
      [report.target_id],
    );
    return rows[0]?.initiator_id ?? null;
  }
  if (report.target_type === 'SEGMENT') {
    const rows = await db.query<{ owner_id: string }>(
      `select owner_id from bottle_segments where id = $1`,
      [report.target_id],
    );
    return rows[0]?.owner_id ?? null;
  }
  if (report.target_type === 'MESSAGE') {
    const rows = await db.query<{ from_user_id: string }>(
      `select from_user_id from messages where id = $1`,
      [report.target_id],
    );
    return rows[0]?.from_user_id ?? null;
  }
  return null;
}

async function applyAction(
  tx: Queryable,
  decision: string,
  report: ReportRow,
  ownerId: string | null,
  actorId: string,
  now: Date,
): Promise<void> {
  switch (decision) {
    case 'NONE':
      // 驳回：什么都不改（审计写在 reports 行上）
      return;
    case 'REMOVE_SEGMENT':
      // 事件流 + 投影一起改，否则审核动作对规则不可见（见 store/moderation.ts 顶部说明）
      await removeSegment({ tx, segmentId: report.target_id, actorId, at: now });
      return;
    case 'RESTORE_SEGMENT':
      // **人工覆盖自动斩杀**：按同一个段号把这一段的音频重新登记为有效段
      await restoreSegment({ tx, segmentId: report.target_id, actorId, at: now });
      return;
    case 'REMOVE_BOTTLE':
      await removeBottle({ tx, bottleId: report.target_id, at: now });
      return;
    case 'REMOVE_COMMENT':
      await tx.query(
        `update public_comments set deleted_at = coalesce(deleted_at, $2) where id = $1`,
        [report.target_id, now],
      );
      return;
    case 'BAN_USER':
      if (ownerId === null) return;
      await banUser({ tx, userId: ownerId, at: now });
      return;
    default:
      return;
  }
}
