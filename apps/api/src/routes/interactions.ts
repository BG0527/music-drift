/**
 * 互动路由（t9，`docs/api.md` §2.6）：点踩/点赞、私密留言、举报、通知、徽章。
 *
 * 纪律：**路由零规则** —— 投票与留言的判定、以及「谁能看到留言」全部来自内核
 * （`castVote` / `attachPrivateMessage` / `visibleMessagesFor`）；徽章是**派生**的
 * （ADR-014 裁决 #1：不落库），每次由内核 `evaluateBadges` 现算。
 *
 * ⚠️ 已接受的行为（captain 裁决，勿当 bug 修）：点赞与点踩是**两个独立的票** ——
 * 同一用户可对同一段**分别投一赞一踩**；点赞不抵消点踩、不提高斩杀阈值，点踩照常计入阈值。
 * 契约注释与 `docs/api.md` 都显式记录了这一点。
 */
import {
  attachPrivateMessage,
  castVote,
  evaluateBadges,
  participants,
  seaZoneOf,
  visibleMessagesFor,
} from '@music-drift/shared/domain';
import { CastVoteRequestSchema, UuidSchema } from '@music-drift/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { problemFromOutcome, sendProblem, transportProblem } from '../http/problem.js';
import { createActorResolver } from '../http/session.js';
import type { Clock } from '@music-drift/shared/domain';
import type { Db } from '../db/client.js';
import type { BottleStore } from '../store/bottles.js';
import { createRequestContext } from '../store/context.js';

export interface InteractionRoutesOptions {
  db: Db;
  store: BottleStore;
  clock: Clock;
}

const IdParamsSchema = z.object({ id: UuidSchema });

export function registerInteractionRoutes(app: FastifyInstance, options: InteractionRoutesOptions): void {
  const actors = createActorResolver(options.db, options.clock);
  const { db, store, clock } = options;

  app.post('/api/segments/:id/votes', async (request, reply) => {
    const actor = await actors.resolve(request);
    if (actor === null) {
      return sendProblem(reply, transportProblem('UNAUTHENTICATED'));
    }
    const params = IdParamsSchema.safeParse(request.params);
    const body = CastVoteRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return sendProblem(reply, transportProblem('INVALID_BODY'));
    }
    const owners = await db.query<{ bottle_id: string }>(`select bottle_id from bottle_segments where id = $1`, [
      params.data.id,
    ]);
    const bottleId = owners[0]?.bottle_id;
    if (bottleId === undefined) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const state = await store.loadState(bottleId);
    if (state === null) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const ctx = createRequestContext(clock);
    const outcome = castVote(
      state,
      { userId: actor.user.id, segmentId: params.data.id, value: body.data.value, listenedRatio: body.data.listenedRatio },
      ctx,
    );
    const problem = problemFromOutcome(outcome);
    if (problem !== null) {
      return sendProblem(reply, problem);
    }
    await store.applyOutcome(bottleId, outcome, { vote: { listenedRatio: body.data.listenedRatio } });
    const after = await store.loadState(bottleId);
    const segment = after?.segments.find((candidate) => candidate.id === params.data.id);
    return reply.send({
      segmentId: params.data.id,
      value: body.data.value,
      likeCount: segment?.likes.length ?? 0,
      dislikeCount: segment?.dislikes.length ?? 0,
      dislikeThreshold: ctx.policy.dislikeThreshold,
      segmentCut: outcome.events.some((event) => event.type === 'SEGMENT_CUT'),
    });
  });

  app.post('/api/bottles/:id/messages', async (request, reply) => {
    const actor = await actors.resolve(request);
    if (actor === null) {
      return sendProblem(reply, transportProblem('UNAUTHENTICATED'));
    }
    const params = IdParamsSchema.safeParse(request.params);
    const body = z.object({ content: z.string().min(1).max(500) }).safeParse(request.body);
    if (!params.success || !body.success) {
      return sendProblem(reply, transportProblem('INVALID_BODY'));
    }
    const state = await store.loadState(params.data.id);
    if (state === null) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const outcome = attachPrivateMessage(
      state,
      { userId: actor.user.id, content: body.data.content },
      createRequestContext(clock),
    );
    const problem = problemFromOutcome(outcome);
    if (problem !== null) {
      return sendProblem(reply, problem);
    }
    await store.applyOutcome(params.data.id, outcome);
    const attached = outcome.events.find((event) => event.type === 'MESSAGE_ATTACHED');
    const messageId = attached !== undefined && 'messageId' in attached ? String(attached.messageId) : '';
    return reply.code(201).send({
      id: messageId,
      bottleId: params.data.id,
      content: body.data.content,
      status: 'PENDING',
      createdAt: new Date(clock.now()).toISOString(),
    });
  });

  /** 可见性由**内核**决定：中间传递者看不到任何留言；发起者只看已送达的；发送者看自己的。 */
  app.get('/api/bottles/:id/messages', async (request, reply) => {
    const actor = await actors.resolve(request);
    if (actor === null) {
      return sendProblem(reply, transportProblem('UNAUTHENTICATED'));
    }
    const params = IdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const state = await store.loadState(params.data.id);
    if (state === null) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    return reply.send(
      visibleMessagesFor(state, actor.user.id).map((message) => ({
        id: message.id,
        bottleId: params.data.id,
        content: message.content,
        status: message.status,
        createdAt: new Date(message.createdAt).toISOString(),
      })),
    );
  });

  /** 全链路举报入口（CONTEXT §8）：落库进人工审核队列；审核流转属 t12。 */
  app.post('/api/reports', async (request, reply) => {
    const actor = await actors.resolve(request);
    if (actor === null) {
      return sendProblem(reply, transportProblem('UNAUTHENTICATED'));
    }
    const body = z
      .object({
        targetType: z.enum(['BOTTLE', 'SEGMENT', 'MESSAGE']),
        targetId: UuidSchema,
        reason: z.string().min(1).max(500),
      })
      .safeParse(request.body);
    if (!body.success) {
      return sendProblem(reply, transportProblem('INVALID_BODY'));
    }
    await db.query(
      `insert into reports (id, target_type, target_id, reporter_id, reason, status, created_at)
       values (gen_random_uuid(), $1, $2, $3, $4, 'PENDING', $5)`,
      [body.data.targetType, body.data.targetId, actor.user.id, body.data.reason, new Date(clock.now())],
    );
    return reply.code(204).send();
  });

  app.get('/api/notifications', async (request, reply) => {
    const actor = await actors.resolve(request);
    if (actor === null) {
      return sendProblem(reply, transportProblem('UNAUTHENTICATED'));
    }
    const rows = await db.query<{
      id: string;
      type: string;
      payload: Record<string, unknown>;
      read_at: Date | null;
      created_at: Date;
    }>(
      `select id, type, payload, read_at, created_at from notifications
       where user_id = $1 order by created_at desc limit 50`,
      [actor.user.id],
    );
    return reply.send({
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        payload: row.payload,
        readAt: row.read_at === null ? null : row.read_at.toISOString(),
        createdAt: row.created_at.toISOString(),
      })),
      nextCursor: null,
    });
  });

  app.post('/api/notifications/:id/read', async (request, reply) => {
    const actor = await actors.resolve(request);
    if (actor === null) {
      return sendProblem(reply, transportProblem('UNAUTHENTICATED'));
    }
    const params = IdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const rows = await db.query<{ id: string }>(
      `update notifications set read_at = $3 where id = $1 and user_id = $2 returning id`,
      [params.data.id, actor.user.id, new Date(clock.now())],
    );
    return rows.length === 0 ? sendProblem(reply, transportProblem('NOT_FOUND')) : reply.code(204).send();
  });

  /** 徽章：派生判定（ADR-014 #1 不落库）；只返回本人参与过、且已定稿（在公海）的作品。 */
  app.get('/api/me/badges', async (request, reply) => {
    const actor = await actors.resolve(request);
    if (actor === null) {
      return sendProblem(reply, transportProblem('UNAUTHENTICATED'));
    }
    const seaRows = await db.query<{ id: string }>(
      `select id from bottles where status = 'SEA' order by updated_at desc limit 200`,
    );
    const awards = [];
    for (const row of seaRows) {
      const state = await store.loadState(row.id);
      if (state === null || seaZoneOf(state) === null) {
        continue;
      }
      if (!participants(state).some((record) => record.userId === actor.user.id)) {
        continue;
      }
      for (const award of evaluateBadges(state).filter((candidate) => candidate.userId === actor.user.id)) {
        awards.push({
          userId: award.userId,
          kind: award.kind,
          bottleId: award.bottleId,
          grantedAt: new Date(award.grantedAt).toISOString(),
        });
      }
    }
    return reply.send(awards);
  });
}
