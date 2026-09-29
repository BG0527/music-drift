/**
 * 互动路由（t9，`docs/api.md` §2.6）：点踩/点赞、私密留言、举报、通知、徽章。
 *
 * 纪律：**路由零规则** —— 投票与留言的判定、以及「谁能看到留言」全部来自内核
 * （`castVote` / `attachPrivateMessage` / `visibleMessagesFor`）；徽章是**派生**的
 * （ADR-014 裁决 #1：不落库），每次由内核 `evaluateBadges` 现算。
 *
 * ⚠️ t20：点踩门槛**不再采信请求体里的 `listenedRatio`**，改为读服务端持久化的已听覆盖率
 *（`POST /api/segments/:id/listen` 增量上报 + 只增不减）。覆盖率语义复用 `shared/audio`，
 * 本模块只做"读进度 → 判门槛 → 交给内核"，不重算覆盖率。
 *
 * ⚠️ 已接受的行为（captain 裁决，勿当 bug 修）：点赞与点踩是**两个独立的票** ——
 * 同一用户可对同一段**分别投一赞一踩**；点赞不抵消点踩、不提高斩杀阈值，点踩照常计入阈值。
 * 契约注释与 `docs/api.md` 都显式记录了这一点。
 */
import {
  DEFAULT_POLICY,
  attachPrivateMessage,
  castVote,
  visibleMessagesFor,
} from '@music-drift/shared/domain';
import { canDislike } from '@music-drift/shared/audio';
import {
  AttachPrivateMessageRequestSchema,
  CastVoteRequestSchema,
  CreateReportRequestSchema,
  SubmitListenProgressRequestSchema,
  UuidSchema,
} from '@music-drift/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { problemFromOutcome, problemFromViolations, sendProblem, transportProblem } from '../http/problem.js';
import { createActorResolver } from '../http/session.js';
import type { Clock } from '@music-drift/shared/domain';
import type { Db } from '../db/client.js';
import type { BottleStore } from '../store/bottles.js';
import { createRequestContext } from '../store/context.js';
import { createListenProgressStore } from '../store/listenProgress.js';

export interface InteractionRoutesOptions {
  db: Db;
  store: BottleStore;
  clock: Clock;
}

const IdParamsSchema = z.object({ id: UuidSchema });

export function registerInteractionRoutes(
  app: FastifyInstance,
  options: InteractionRoutesOptions,
): void {
  const actors = createActorResolver(options.db, options.clock);
  const { db, store, clock } = options;
  /**
   * 已听覆盖率仓储：阈值取自**内核策略**（`createDomainContext` 缺省即 `DEFAULT_POLICY`，
   * 所以这里的门槛与 `ctx.policy.dislikeListenRatioThreshold` 是同一个值，不存在第二份常量）。
   */
  const listen = createListenProgressStore(db, { threshold: DEFAULT_POLICY.dislikeListenRatioThreshold });

  async function messageParties(
    bottleId: string,
    sender: { userId: string; segmentIndex: number },
    recipient: { userId: string; segmentIndex: number },
    revealed: boolean,
  ) {
    const rows = await db.query<{ user_id: string; code: string | null; handle: string }>(
      `select u.id as user_id, ac.code, u.handle
       from users u
       left join anon_codes ac on ac.bottle_id = $1 and ac.user_id = u.id
       where u.id = any($2::uuid[])`,
      [bottleId, [sender.userId, recipient.userId]],
    );
    const identities = new Map(rows.map((row) => [row.user_id, row]));
    const displayName = (userId: string): string => {
      const identity = identities.get(userId);
      return revealed ? (identity?.handle ?? '账号用户') : (identity?.code ?? '匿名歌手');
    };
    return {
      sender: {
        segmentIndex: sender.segmentIndex,
        displayName: displayName(sender.userId),
        revealed,
      },
      recipient: {
        segmentIndex: recipient.segmentIndex,
        displayName: displayName(recipient.userId),
        revealed,
      },
    };
  }

  /**
   * 上报已听覆盖率（t20）：**增量输入**，服务端只增不减地记账（跨会话保留）。
   *
   * 前端在播放过程中**周期性**调用（例如每 5 秒 + 暂停/切页时），body 只带 `coveredMs`
   *（客户端 `ListenTracker` 的"听过区间并集"）。服务端按墙上时间限速增长，
   * 因此"一次上报就报满"拿不到门槛（详见 `store/listenProgress.ts`）。
   */
  app.post('/api/segments/:id/listen', async (request, reply) => {
    const actor = await actors.resolve(request);
    if (actor === null) {
      return sendProblem(reply, transportProblem('UNAUTHENTICATED'));
    }
    const params = IdParamsSchema.safeParse(request.params);
    const body = SubmitListenProgressRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return sendProblem(reply, transportProblem('INVALID_BODY'));
    }
    const progress = await listen.record({
      userId: actor.user.id,
      segmentId: params.data.id,
      coveredMs: body.data.coveredMs,
      nowMs: clock.now(),
    });
    if (progress === null) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    return reply.send({
      segmentId: params.data.id,
      coveredMs: progress.coveredMs,
      durationMs: progress.durationMs,
      ratio: progress.ratio,
      threshold: progress.threshold,
      reachedThreshold: progress.reachedThreshold,
    });
  });

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
    const owners = await db.query<{ bottle_id: string }>(
      `select bottle_id from bottle_segments where id = $1`,
      [params.data.id],
    );
    const bottleId = owners[0]?.bottle_id;
    if (bottleId === undefined) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const state = await store.loadState(bottleId);
    if (state === null) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    /**
     * 判定依据 = **服务端持久化**的已听覆盖率（不是请求体里那个字段）。
     * 用 `canDislike`（`shared/audio`，与客户端同一实现）判门槛，阈值来自内核策略 ⇒ 不写死 0.8。
     */
    const progress = await listen.read({ userId: actor.user.id, segmentId: params.data.id });
    if (progress === null) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const listenedRatio = progress.ratio;
    const ctx = createRequestContext(clock);
    const outcome = castVote(
      state,
      {
        userId: actor.user.id,
        segmentId: params.data.id,
        value: body.data.value,
        listenedRatio,
      },
      ctx,
    );
    if (!outcome.ok) {
      /**
       * 内核的规则是**有序**的（自踩 → 重复票 → 段已斩 → 听满），所以先让它说话；
       * 只有"覆盖率不足"这一条换成 API 层功能码（客户端据此**弹「需要听满 X%」的提醒**，
       * 与通用的规则违反不是同一种处置）。其余违规照旧走内核映射（409/422 + 内核码）。
       */
      const ratioViolation = outcome.violations.find((violation) => violation.code === 'LISTEN_RATIO_TOO_LOW');
      if (ratioViolation !== undefined) {
        return sendProblem(
          reply,
          problemFromViolations([
            {
              code: 'LISTEN_THRESHOLD_NOT_REACHED',
              message:
                '需要听满 ' +
                String(Math.round(progress.threshold * 100)) +
                '% 才能点踩（服务端记录的已听覆盖率 ' +
                String(Math.round(listenedRatio * 100)) +
                '%，请继续聆听后再试）。',
            },
          ]) ?? transportProblem('INTERNAL'),
        );
      }
      const problem = problemFromOutcome(outcome);
      return problem === null
        ? sendProblem(reply, transportProblem('INTERNAL'))
        : sendProblem(reply, problem);
    }
    // 用 `canDislike`（shared/audio，与客户端同一实现）复核一次：内核与本模块的口径必须一致
    if (body.data.value === 'DISLIKE' && !canDislike(listenedRatio, progress.threshold)) {
      return sendProblem(reply, transportProblem('INTERNAL'));
    }
    // 入库的是**服务端**算出的覆盖率（旧客户端发来的字段不参与判定，也不入库）
    await store.applyOutcome(bottleId, outcome, {
      vote: { listenedRatio },
    });
    const after = await store.loadState(bottleId);
    const segment = after?.segments.find((candidate) => candidate.id === params.data.id);
    return reply.send({
      segmentId: params.data.id,
      value: body.data.value,
      likeCount: segment?.likes.length ?? 0,
      dislikeCount: segment?.dislikes.length ?? 0,
      dislikeThreshold: ctx.policy.dislikeThreshold,
      listenedRatio,
      segmentCut: outcome.events.some((event) => event.type === 'SEGMENT_CUT'),
    });
  });

  app.post('/api/bottles/:id/messages', async (request, reply) => {
    const actor = await actors.resolve(request);
    if (actor === null) {
      return sendProblem(reply, transportProblem('UNAUTHENTICATED'));
    }
    const params = IdParamsSchema.safeParse(request.params);
    const body = AttachPrivateMessageRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return sendProblem(reply, transportProblem('INVALID_BODY'));
    }
    const state = await store.loadState(params.data.id);
    if (state === null) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const outcome = attachPrivateMessage(
      state,
      {
        userId: actor.user.id,
        content: body.data.content,
        // 目标由**段号**表达；收件人在内核里解析成该段作者（不采信客户端送来的 userId）
        targetSegmentIndex: body.data.targetSegmentIndex,
      },
      createRequestContext(clock),
    );
    const problem = problemFromOutcome(outcome);
    if (problem !== null) {
      return sendProblem(reply, problem);
    }
    await store.applyOutcome(params.data.id, outcome);
    const attached = outcome.events.find((event) => event.type === 'MESSAGE_ATTACHED');
    const messageId =
      attached !== undefined && 'messageId' in attached ? String(attached.messageId) : '';
    const senderSegment = state.segments.find((segment) => segment.ownerId === actor.user.id);
    const recipientSegment = state.segments.find(
      (segment) => segment.index === body.data.targetSegmentIndex && segment.deletedAt === null,
    );
    if (senderSegment === undefined || recipientSegment === undefined) {
      return sendProblem(reply, transportProblem('INTERNAL'));
    }
    const parties = await messageParties(
      params.data.id,
      { userId: actor.user.id, segmentIndex: senderSegment.index },
      { userId: recipientSegment.ownerId, segmentIndex: recipientSegment.index },
      false,
    );
    return reply.code(201).send({
      id: messageId,
      bottleId: params.data.id,
      content: body.data.content,
      status: 'PENDING',
      targetSegmentIndex: body.data.targetSegmentIndex,
      ...parties,
      createdAt: new Date(clock.now()).toISOString(),
    });
  });

  /**
   * 可见性由**内核**决定（用户第十三轮第 ④ 条后的规则）：
   * **只有目标**（该留言已送达给他）能看内容；**发送者**能看到自己写的（含未送达）；
   * 发起者与其他段作者一律看不到。前端只渲染这里返回的。
   */
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
    if (state.status === 'SEA') {
      return reply.send([]);
    }
    const visible = visibleMessagesFor(state, actor.user.id);
    const projected = await Promise.all(
      visible.map(async (message) => ({
        id: message.id,
        bottleId: params.data.id,
        content: message.content,
        status: message.status,
        targetSegmentIndex: message.targetSegmentIndex,
        ...(await messageParties(
          params.data.id,
          {
            userId: message.fromUserId,
            segmentIndex:
              state.segments.find((segment) => segment.ownerId === message.fromUserId)?.index ?? 1,
          },
          { userId: message.toUserId, segmentIndex: message.targetSegmentIndex },
          message.status === 'DELIVERED' &&
            (actor.user.id === message.fromUserId || actor.user.id === message.toUserId),
        )),
        createdAt: new Date(message.createdAt).toISOString(),
      })),
    );
    return reply.send(projected);
  });

  /** 全链路举报入口（CONTEXT §8）：落库进人工审核队列；审核流转属 t12。 */
  app.post('/api/reports', async (request, reply) => {
    const actor = await actors.resolve(request);
    if (actor === null) {
      return sendProblem(reply, transportProblem('UNAUTHENTICATED'));
    }
    const body = CreateReportRequestSchema.safeParse(request.body);
    if (!body.success) {
      return sendProblem(reply, transportProblem('INVALID_BODY'));
    }
    if (body.data.targetType === 'COMMENT') {
      const comments = await db.query<{ author_id: string }>(
        `select author_id from public_comments where id = $1 and deleted_at is null`,
        [body.data.targetId],
      );
      const comment = comments[0];
      if (comment === undefined) return sendProblem(reply, transportProblem('NOT_FOUND'));
      if (comment.author_id === actor.user.id) {
        return sendProblem(reply, transportProblem('FORBIDDEN'));
      }
    }
    await db.query(
      `insert into reports (id, target_type, target_id, reporter_id, reason, status, created_at)
       values (gen_random_uuid(), $1, $2, $3, $4, 'PENDING', $5)`,
      [
        body.data.targetType,
        body.data.targetId,
        actor.user.id,
        body.data.reason,
        new Date(clock.now()),
      ],
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
    return rows.length === 0
      ? sendProblem(reply, transportProblem('NOT_FOUND'))
      : reply.code(204).send();
  });

}
