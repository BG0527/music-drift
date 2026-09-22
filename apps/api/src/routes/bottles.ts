/**
 * 漂流瓶主流程路由（t9，`docs/api.md` §2.4）。
 *
 * 纪律：**路由零规则** —— 只做「身份/归属 → 调内核命令/守卫 → 交给 `problem.ts`」。
 * 业务判断一律来自内核导出（`availableResolutions` / `gaps` / `resolveDrawParent` …），不在这里重写。
 * 持久化只走 `store`（事件流 + 事务投影）；段号由内核 `nextRecordIndex` 决定（请求体没有 index）。
 */
import {
  canChooseResolution,
  canPutBack,
  chooseResolution,
  putBack,
  recordSegment,
  type Clock,
} from '@music-drift/shared/domain';
import { ChooseResolutionRequestSchema, UuidSchema } from '@music-drift/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAnonCodeService } from '../auth/anonCodeService.js';
import { createAuthRepository } from '../auth/repository.js';
import { validateSegmentAudioUpload } from '../audio/ingest.js';
import { readDomainEvents } from '../db/events.js';
import { problemFromOutcome, problemFromViolations, sendProblem, transportProblem } from '../http/problem.js';

import { createActorResolver, type ActorResolver } from '../http/session.js';
import type { Db } from '../db/client.js';
import type { BottleStore } from '../store/bottles.js';
import { createRequestContext } from '../store/context.js';
import { toBottleDetail } from '../store/dto.js';

export interface BottleRoutesOptions {
  db: Db;
  store: BottleStore;
  clock: Clock;
}

const BottleIdParamsSchema = z.object({ id: UuidSchema });
const CreateBottleRequestSchema = z.object({ songId: UuidSchema });

export function registerBottleRoutes(app: FastifyInstance, options: BottleRoutesOptions): void {
  const { db, store, clock } = options;
  const actors: ActorResolver = createActorResolver(db, clock);
  const repo = createAuthRepository(db);
  const anonCodes = createAnonCodeService({ repo });

  /** 同瓶不同码：缺码就补（幂等），保证 DTO 的 `ownerCode` 永远可用。 */
  async function codesFor(bottleId: string, userIds: readonly string[]): Promise<Map<string, string>> {
    const rows = await db.query<{ user_id: string; code: string }>(
      `select user_id, code from anon_codes where bottle_id = $1`,
      [bottleId],
    );
    const codes = new Map(rows.map((row) => [row.user_id, row.code]));
    for (const userId of new Set(userIds)) {
      if (!codes.has(userId)) {
        const assigned = await anonCodes.assign({ userId, bottleId });
        codes.set(userId, assigned.code);
      }
    }
    return codes;
  }

  async function likeDislikeCounts(segmentIds: readonly string[]) {
    const counts = new Map<string, { likeCount: number; dislikeCount: number }>();
    if (segmentIds.length === 0) {
      return counts;
    }
    const rows = await db.query<{ segment_id: string; value: string; total: string }>(
      `select segment_id, value, count(*)::text as total from votes
       where segment_id = any($1::uuid[]) group by segment_id, value`,
      [segmentIds],
    );
    for (const row of rows) {
      const current = counts.get(row.segment_id) ?? { likeCount: 0, dislikeCount: 0 };
      if (row.value === 'LIKE') {
        current.likeCount = Number(row.total);
      } else {
        current.dislikeCount = Number(row.total);
      }
      counts.set(row.segment_id, current);
    }
    return counts;
  }

  async function loadDetail(bottleId: string, viewerId: string | null) {
    const row = await store.findBottle(bottleId);
    const state = await store.loadState(bottleId);
    if (row === null || state === null) {
      return null;
    }
    const segments = await store.listBottleSegments(bottleId);
    const codes = await codesFor(bottleId, [
      state.initiatorId,
      ...state.segments.map((segment) => segment.ownerId),
    ]);
    const songs = await db.query<{ title: string }>(`select title from songs where id = $1`, [row.songId]);
    return toBottleDetail({
      row,
      state,
      segments,
      codes,
      songTitle: songs[0]?.title ?? '',
      voteCounts: await likeDislikeCounts(segments.map((segment) => segment.id)),
      viewerId,
    });
  }

  async function requireActor(request: FastifyRequest, reply: FastifyReply) {
    const actor = await actors.resolve(request);
    if (actor === null) {
      sendProblem(reply, transportProblem('UNAUTHENTICATED'));
      return null;
    }
    return actor;
  }

  app.post('/api/bottles', async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (actor === null) {
      return reply;
    }
    const body = CreateBottleRequestSchema.safeParse(request.body);
    if (!body.success) {
      return sendProblem(reply, transportProblem('INVALID_BODY'));
    }
    const created = await store.createBottle({
      bottleId: crypto.randomUUID(),
      songId: body.data.songId,
      initiatorId: actor.user.id,
      ctx: createRequestContext(clock),
    });
    if (created === null) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    await codesFor(created.id, [actor.user.id]);
    const detail = await loadDetail(created.id, actor.user.id);
    return detail === null
      ? sendProblem(reply, transportProblem('NOT_FOUND'))
      : reply.code(201).send(detail);
  });

  app.get('/api/bottles/:id', async (request, reply) => {
    const params = BottleIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const actor = await actors.resolve(request);
    const detail = await loadDetail(params.data.id, actor?.user.id ?? null);
    return detail === null ? sendProblem(reply, transportProblem('NOT_FOUND')) : reply.send(detail);
  });

  /** 漂流日志：只给时间线（类型/时间/操作者），内容可见性由前端按 seq 裁剪（CONTEXT §9.1）。 */
  app.get('/api/bottles/:id/events', async (request, reply) => {
    const params = BottleIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const events = await readDomainEvents(db, params.data.id);
    if (events.length === 0) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    return reply.send(
      events.map((event, position) => ({
        seq: position + 1,
        type: event.type,
        actorId: event.actorId,
        occurredAt: new Date(event.at).toISOString(),
        occurredAtMs: event.at,
      })),
    );
  });

  /**
   * 录音上传（原始二进制协议）：`Content-Type` = 音频 MIME，body = 字节流，
   * 时长走 `x-audio-duration-ms` 请求头，附言走 `?note=`。守门人是 t7 的 `validateSegmentAudioUpload`。
   * 落库：**真实字节** + 归一化 MIME + 时长（不再写 `audio: null`）。
   */
  app.post('/api/bottles/:id/segments', async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (actor === null) {
      return reply;
    }
    const params = BottleIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const rawDuration = request.headers['x-audio-duration-ms'];
    const durationMs = typeof rawDuration === 'string' && /^[0-9]+$/.test(rawDuration) ? Number(rawDuration) : null;
    const rawNote = request.headers['x-segment-note'];
    const noteQuery = (request.query as { note?: string } | undefined)?.note;
    const noteSource = typeof rawNote === 'string' && rawNote.length > 0 ? rawNote : noteQuery;
    let note: string | null = null;
    if (typeof noteSource === 'string' && noteSource.length > 0) {
      try {
        note = decodeURIComponent(noteSource).slice(0, 200);
      } catch {
        note = noteSource.slice(0, 200);
      }
    }
    const bytes = Buffer.isBuffer(request.body) ? request.body : null;

    const validation = validateSegmentAudioUpload({
      mime: request.headers['content-type'] ?? null,
      bytes: bytes ?? new Uint8Array(0),
      durationMs,
    });
    if (!validation.ok) {
      const problem = problemFromViolations(validation.violations);
      return problem === null ? reply : sendProblem(reply, problem);
    }

    const state = await store.loadState(params.data.id);
    if (state === null) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const ctx = createRequestContext(clock);
    const outcome = recordSegment(state, { userId: actor.user.id, note }, ctx);
    const problem = problemFromOutcome(outcome);
    if (problem !== null) {
      return sendProblem(reply, problem);
    }
    const recorded = outcome.events[0];
    const segmentId = recorded !== undefined && 'segmentId' in recorded ? String(recorded.segmentId) : '';
    const index = recorded !== undefined && 'index' in recorded ? Number(recorded.index) : 0;
    await store.applyOutcome(params.data.id, outcome, {
      segment: { audio: bytes, audioMime: validation.value.mime, durationMs: validation.value.durationMs },
    });
    await codesFor(params.data.id, [actor.user.id]);
    const detail = await loadDetail(params.data.id, actor.user.id);
    return reply.code(201).send({
      segmentId,
      index,
      nextRecordIndex: detail === null || detail.missingSegmentIndexes.length === 0 ? null : detail.missingSegmentIndexes[0],
      bottle: detail,
    });
  });

  app.post('/api/bottles/:id/resolution', async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (actor === null) {
      return reply;
    }
    const params = BottleIdParamsSchema.safeParse(request.params);
    const body = ChooseResolutionRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return sendProblem(reply, transportProblem('INVALID_BODY'));
    }
    const state = await store.loadState(params.data.id);
    if (state === null) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    // 守卫先行：内核返回稳定码 → problem.ts 映射 409/422（路由不判断任何状态）。
    const violations = canChooseResolution(state, { userId: actor.user.id, resolution: body.data.resolution });
    if (violations.length > 0) {
      const problem = problemFromViolations(violations);
      return problem === null ? reply : sendProblem(reply, problem);
    }
    const outcome = chooseResolution(
      state,
      { userId: actor.user.id, resolution: body.data.resolution },
      createRequestContext(clock),
    );
    const problem = problemFromOutcome(outcome);
    if (problem !== null) {
      return sendProblem(reply, problem);
    }
    await store.applyOutcome(params.data.id, outcome);
    const detail = await loadDetail(params.data.id, actor.user.id);
    return detail === null ? sendProblem(reply, transportProblem('NOT_FOUND')) : reply.send(detail);
  });

  app.post('/api/bottles/:id/put-back', async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (actor === null) {
      return reply;
    }
    const params = BottleIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const state = await store.loadState(params.data.id);
    if (state === null) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const violations = canPutBack(state, { userId: actor.user.id });
    if (violations.length > 0) {
      const problem = problemFromViolations(violations);
      return problem === null ? reply : sendProblem(reply, problem);
    }
    const ctx = createRequestContext(clock);
    const outcome = putBack(state, { userId: actor.user.id }, ctx);
    const problem = problemFromOutcome(outcome);
    if (problem !== null) {
      return sendProblem(reply, problem);
    }
    await store.applyOutcome(params.data.id, outcome);
    const detail = await loadDetail(params.data.id, actor.user.id);
    return detail === null
      ? sendProblem(reply, transportProblem('NOT_FOUND'))
      : reply.send({ bottle: detail, cooldownDraws: ctx.policy.putBackCooldownDraws });
  });
}
