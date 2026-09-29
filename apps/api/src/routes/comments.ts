import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CreatePublicCommentRequestSchema,
  IsoDateTimeSchema,
  PublicCommentPageSchema,
  PublicCommentSchema,
  UuidSchema,
} from '@music-drift/shared';
import type { Clock } from '@music-drift/shared/domain';
import type { Db } from '../db/client.js';
import { createActorResolver } from '../http/session.js';
import { problemFromViolations, sendProblem, transportProblem } from '../http/problem.js';

interface CommentRow {
  id: string;
  bottle_id: string;
  content: string;
  author_id: string;
  author_account: string;
  created_at: Date;
}

const ParamsSchema = z.object({ id: UuidSchema });
const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(20),
  cursor: z.string().min(1).optional(),
});

type Cursor = { createdAt: string; id: string };

function encodeCursor(row: CommentRow): string {
  return Buffer.from(JSON.stringify({ createdAt: row.created_at.toISOString(), id: row.id }))
    .toString('base64url');
}

function decodeCursor(value: string | undefined): Cursor | null | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<Cursor>;
    if (
      typeof parsed.createdAt !== 'string' ||
      !IsoDateTimeSchema.safeParse(parsed.createdAt).success ||
      typeof parsed.id !== 'string' ||
      !UuidSchema.safeParse(parsed.id).success
    ) {
      return null;
    }
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function toComment(row: CommentRow, viewerId: string | null) {
  return PublicCommentSchema.parse({
    id: row.id,
    bottleId: row.bottle_id,
    content: row.content,
    authorAccount: row.author_account,
    isMine: row.author_id === viewerId,
    createdAt: row.created_at.toISOString(),
  });
}

export function registerCommentRoutes(
  app: FastifyInstance,
  options: { db: Db; clock: Clock },
): void {
  const actors = createActorResolver(options.db, options.clock);

  app.get('/api/bottles/:id/comments', async (request, reply) => {
    const params = ParamsSchema.safeParse(request.params);
    const query = ListQuerySchema.safeParse(request.query ?? {});
    if (!params.success || !query.success) {
      return sendProblem(reply, transportProblem(params.success ? 'INVALID_BODY' : 'NOT_FOUND'));
    }
    const bottle = await options.db.query<{ status: string }>(
      `select status from bottles where id = $1`,
      [params.data.id],
    );
    if (bottle[0]?.status !== 'SEA') {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const cursor = decodeCursor(query.data.cursor);
    if (cursor === null) {
      return sendProblem(reply, transportProblem('INVALID_BODY'));
    }
    const actor = await actors.resolve(request);
    const args: unknown[] = [params.data.id, query.data.limit + 1];
    const cursorSql =
      cursor === undefined
        ? ''
        : `and (pc.created_at, pc.id) < ($3::timestamptz, $4::uuid)`;
    if (cursor !== undefined) args.push(cursor.createdAt, cursor.id);
    const rows = await options.db.query<CommentRow>(
      `select pc.id, pc.bottle_id, pc.content, pc.author_id,
              u.handle as author_account, pc.created_at
       from public_comments pc
       join users u on u.id = pc.author_id
       where pc.bottle_id = $1 and pc.deleted_at is null ${cursorSql}
       order by pc.created_at desc, pc.id desc
       limit $2`,
      args,
    );
    const hasMore = rows.length > query.data.limit;
    const pageRows = rows.slice(0, query.data.limit);
    return reply.send(
      PublicCommentPageSchema.parse({
        items: pageRows.map((row) => toComment(row, actor?.user.id ?? null)),
        nextCursor: hasMore ? encodeCursor(pageRows.at(-1) as CommentRow) : null,
      }),
    );
  });

  app.post('/api/bottles/:id/comments', async (request, reply) => {
    const actor = await actors.resolve(request);
    if (actor === null) return sendProblem(reply, transportProblem('UNAUTHENTICATED'));
    const params = ParamsSchema.safeParse(request.params);
    const body = CreatePublicCommentRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return sendProblem(reply, transportProblem(params.success ? 'INVALID_BODY' : 'NOT_FOUND'));
    }
    const created = await options.db.withTransaction(async (tx) => {
      const bottle = await tx.query<{ status: string }>(
        `select status from bottles where id = $1 for update`,
        [params.data.id],
      );
      if (bottle[0]?.status !== 'SEA') return null;
      const rows = await tx.query<CommentRow>(
        `insert into public_comments (id, bottle_id, author_id, content, created_at)
         values (gen_random_uuid(), $1, $2, $3, $4)
         returning id, bottle_id, content, author_id,
           (select handle from users where id = $2) as author_account, created_at`,
        [params.data.id, actor.user.id, body.data.content, new Date(options.clock.now())],
      );
      return rows[0] ?? null;
    });
    if (created === null) {
      const problem = problemFromViolations([
        { code: 'COMMENT_BOTTLE_LEFT_SEA', message: '作品已离开公海，评论未发布。' },
      ]);
      return problem === null ? reply : sendProblem(reply, problem);
    }
    return reply.code(201).send(toComment(created, actor.user.id));
  });

  app.delete('/api/comments/:id', async (request, reply) => {
    const actor = await actors.resolve(request);
    if (actor === null) return sendProblem(reply, transportProblem('UNAUTHENTICATED'));
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) return sendProblem(reply, transportProblem('NOT_FOUND'));
    const rows = await options.db.query<{ author_id: string }>(
      `select author_id from public_comments where id = $1`,
      [params.data.id],
    );
    const comment = rows[0];
    if (comment === undefined) return sendProblem(reply, transportProblem('NOT_FOUND'));
    if (comment.author_id !== actor.user.id) {
      return sendProblem(reply, transportProblem('FORBIDDEN'));
    }
    await options.db.query(
      `update public_comments set deleted_at = coalesce(deleted_at, $2) where id = $1`,
      [params.data.id, new Date(options.clock.now())],
    );
    return reply.code(204).send();
  });
}
