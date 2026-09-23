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
  nextRecordIndex,
} from '@music-drift/shared/domain';
import { ChooseResolutionRequestSchema, UuidSchema } from '@music-drift/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAnonCodeService } from '../auth/anonCodeService.js';
import { createAuthRepository } from '../auth/repository.js';
import { validateSegmentAudioUpload } from '../audio/ingest.js';
import { presetDurationMsFor } from '../store/segments.js';
import { readDomainEvents } from '../db/events.js';
import {
  problemFromOutcome,
  problemFromViolations,
  sendProblem,
  transportProblem,
} from '../http/problem.js';

import { createActorResolver, type ActorResolver } from '../http/session.js';
import type { Db } from '../db/client.js';
import type { BottleStore } from '../store/bottles.js';
import { createRequestContext } from '../store/context.js';
import {
  isEventVisible,
  isSegmentVisible,
  lastOwnEventIndex,
  segmentVisibility,
} from '../store/visibility.js';
import { toBottleDetail, toBottleSummary } from '../store/dto.js';

export interface BottleRoutesOptions {
  db: Db;
  store: BottleStore;
  clock: Clock;
}

const BottleIdParamsSchema = z.object({ id: UuidSchema });
const CreateBottleRequestSchema = z.object({ songId: UuidSchema });
/**
 * 「我的漂流瓶」列表参数：与其它列表端点同口径（默认 20、上限 100）。
 * **不做游标**：Demo 规模下个人参与量远小于一页，`nextCursor` 恒为 null（与 `/api/sea`、`/api/notifications` 一致）。
 */
const MyBottlesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function registerBottleRoutes(app: FastifyInstance, options: BottleRoutesOptions): void {
  const { db, store, clock } = options;
  const actors: ActorResolver = createActorResolver(db, clock);
  const repo = createAuthRepository(db);
  const anonCodes = createAnonCodeService({ repo });

  /** 同瓶不同码：缺码就补（幂等），保证 DTO 的 `ownerCode` 永远可用。 */
  async function codesFor(
    bottleId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>> {
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
    const allSegments = await store.listBottleSegments(bottleId);
    /**
     * §9.1：漂流中只把"我这一棒之前（含我自己）"的段交给观看者；
     * 入海后（§9.2）全部解锁。判据集中在 `store/visibility.ts`（详情与日志共用一份，避免漂移）。
     */
    const visibility = segmentVisibility({ state, viewerId });
    const segments = allSegments.filter((segment) => isSegmentVisible(visibility, segment.index));
    const hiddenLaterSegmentCount = allSegments.length - segments.length;
    const codes = await codesFor(bottleId, [
      state.initiatorId,
      ...state.segments.map((segment) => segment.ownerId),
    ]);
    const songs = await db.query<{ title: string }>(`select title from songs where id = $1`, [
      row.songId,
    ]);
    return toBottleDetail({
      row,
      state,
      segments,
      codes,
      songTitle: songs[0]?.title ?? '',
      voteCounts: await likeDislikeCounts(segments.map((segment) => segment.id)),
      viewerId,
      hiddenLaterSegmentCount,
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

  /**
   * 漂流日志（CONTEXT §11.1）：我参与过（发起或接唱）的漂流瓶。
   * 「参与过」的判据在 store 里（基于事件流），因此**被斩浪的段仍算参与过**（ADR-015 §16.7）。
   */
  app.get('/api/me/bottles', async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (actor === null) {
      return reply;
    }
    const query = MyBottlesQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      return sendProblem(reply, transportProblem('INVALID_BODY'));
    }
    const rows = await store.listParticipatedBottles({
      userId: actor.user.id,
      limit: query.data.limit,
    });
    if (rows.length === 0) {
      return reply.send({ items: [], nextCursor: null });
    }

    // 曲名一次性查（契约 `songTitle` 是 min(1)，不能写死空串 —— t9 修过的坑）
    const songIds = [...new Set(rows.map((row) => row.songId))];
    const titles = new Map<string, string>();
    const songRows = await db.query<{ id: string; title: string }>(
      `select id, title from songs where id = any($1::uuid[])`,
      [songIds],
    );
    for (const song of songRows) {
      titles.set(song.id, song.title);
    }

    const items = [];
    for (const row of rows) {
      const state = await store.loadState(row.id);
      if (state === null) {
        continue;
      }
      items.push({
        ...toBottleSummary(row, state, titles.get(row.songId) ?? ''),
        // 发起者不可能再接唱自己的瓶子（内核 hasEverSung 拦着）→ 只有两种角色
        role: row.initiatorId === actor.user.id ? 'INITIATOR' : 'SINGER',
        // 我从内核状态里取「当前有效的段号」：被斩的段不在其中（缺口另有 missingSegmentIndexes 表达）
        mySegmentIndexes: state.segments
          .filter((segment) => segment.deletedAt === null && segment.ownerId === actor.user.id)
          .map((segment) => segment.index)
          .sort((left, right) => left - right),
      });
    }
    return reply.send({ items, nextCursor: null });
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
    const actor = await actors.resolve(request);
    const state = await store.loadState(params.data.id);
    /**
     * §9.1：日志与详情**同一判据**（事件里带 actorId，后面那一棒的录音事件会暴露"后面是谁"）。
     * 入海后（§9.2）不裁 —— 完整接力链就是公海作品的卖点。
     */
    const visibility =
      state === null
        ? ({ mode: 'ALL', drifting: false } as const)
        : segmentVisibility({ state, viewerId: actor?.user.id ?? null });
    const ownEventIndex = lastOwnEventIndex(events, actor?.user.id ?? null);
    const visible = events.filter((_event, position) =>
      isEventVisible({ visibility, position, lastOwnEventIndex: ownEventIndex }),
    );
    return reply.send(
      visible.map((event, position) => ({
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
    const durationMs =
      typeof rawDuration === 'string' && /^[0-9]+$/.test(rawDuration) ? Number(rawDuration) : null;
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

    const state = await store.loadState(params.data.id);
    if (state === null) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }

    /**
     * t29：本段的时长**以曲库预设为权威**（`song_segments.duration_ms`，来自 `library.json`）。
     * `x-audio-duration-ms` 自本任务起**降级为提示/诊断**：只用来核对"你录的长度对不对"，
     * 不再进入分母（`db/segments.ts` 写库时用的是预设值）。
     * 段号用内核的 `nextRecordIndex`（最小缺口段号）——与 `recordSegment` 的判定同源，前端不得自选。
     */
    const presetDurationMs = await presetDurationMsFor(db, {
      songId: state.songId,
      index: nextRecordIndex(state),
    });

    const validation = validateSegmentAudioUpload(
      {
        mime: request.headers['content-type'] ?? null,
        bytes: bytes ?? new Uint8Array(0),
        durationMs,
      },
      presetDurationMs === null ? {} : { presetDurationMs },
    );
    if (!validation.ok) {
      const problem = problemFromViolations(validation.violations);
      return problem === null ? reply : sendProblem(reply, problem);
    }
    const ctx = createRequestContext(clock);
    const outcome = recordSegment(state, { userId: actor.user.id, note }, ctx);
    const problem = problemFromOutcome(outcome);
    if (problem !== null) {
      return sendProblem(reply, problem);
    }
    const recorded = outcome.events[0];
    const segmentId =
      recorded !== undefined && 'segmentId' in recorded ? String(recorded.segmentId) : '';
    const index = recorded !== undefined && 'index' in recorded ? Number(recorded.index) : 0;
    await store.applyOutcome(params.data.id, outcome, {
      segment: {
        audio: bytes,
        audioMime: validation.value.mime,
        durationMs: validation.value.durationMs,
      },
    });
    await codesFor(params.data.id, [actor.user.id]);
    const detail = await loadDetail(params.data.id, actor.user.id);
    return reply.code(201).send({
      segmentId,
      index,
      nextRecordIndex:
        detail === null || detail.missingSegmentIndexes.length === 0
          ? null
          : detail.missingSegmentIndexes[0],
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
    const violations = canChooseResolution(state, {
      userId: actor.user.id,
      resolution: body.data.resolution,
    });
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
