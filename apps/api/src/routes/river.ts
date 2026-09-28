/**
 * 河道随机捞取（t9，`docs/api.md` §2.4）。
 *
 * 河道只能**随机**打捞（CONTEXT §3.2）：候选集合由内核守卫 + 放回冷却决定，
 * 随机源注入（`random`），并发只有一个赢家（DB 部分唯一索引）。
 */
import { drawFromRiver, type DomainContext } from '@music-drift/shared/domain';
import type { FastifyInstance } from 'fastify';
import {
  problemFromViolations,
  problemFromOutcome,
  sendProblem,
  transportProblem,
} from '../http/problem.js';
import { createActorResolver } from '../http/session.js';
import type { Clock } from '@music-drift/shared/domain';
import type { Db } from '../db/client.js';
import type { BottleStore } from '../store/bottles.js';
import { createRequestContext } from '../store/context.js';
import type { RiverStateStore } from '../store/riverState.js';
import { toBottleDetail } from '../store/dto.js';
import { createAnonCodeService } from '../auth/anonCodeService.js';
import { createAuthRepository } from '../auth/repository.js';

export interface RiverRoutesOptions {
  db: Db;
  store: BottleStore;
  clock: Clock;
  /** 随机源（可注入，便于测试确定性）。 */
  random?: (() => number) | undefined;
  /** 河道状态持久化（放回冷却计数）：内核持有规则，DB 只存它的状态。 */
  riverState: RiverStateStore;
}

export function registerRiverRoutes(app: FastifyInstance, options: RiverRoutesOptions): void {
  const actors = createActorResolver(options.db, options.clock);
  const anonCodes = createAnonCodeService({ repo: createAuthRepository(options.db) });

  async function codesFor(bottleId: string, userIds: readonly string[]): Promise<Map<string, string>> {
    const rows = await options.db.query<{ user_id: string; code: string }>(
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

  app.post('/api/river/draw', async (request, reply) => {
    const actor = await actors.resolve(request);
    if (actor === null) {
      return sendProblem(reply, transportProblem('UNAUTHENTICATED'));
    }
    const random = options.random ?? Math.random;
    const ctx: DomainContext = createRequestContext(options.clock);

    // 候选 = 河道中的全部瓶子（Demo 规模小，直接取）；过滤与冷却由内核决定。
    const candidates = await options.db.query<{ id: string }>(
      `select id from bottles where status = 'IN_RIVER'`,
    );
    const states = (
      await Promise.all(candidates.map((candidate) => options.store.loadState(candidate.id)))
    ).filter((state): state is NonNullable<typeof state> => state !== null);

    const river = await options.riverState.load(actor.user.id);
    const outcome = drawFromRiver({ bottles: states, river, userId: actor.user.id, random });
    await options.riverState.save(actor.user.id, outcome.river);
    const noBottle = problemFromViolations(outcome.violations);
    if (!outcome.ok || outcome.bottleId === null) {
      // 河道里没有可捞的瓶子：内核已经给出稳定码（NO_BOTTLE_AVAILABLE → 409），照它映射。
      return noBottle === null ? reply.send({ bottle: null }) : sendProblem(reply, noBottle);
    }
    const drawn = await options.store.drawFromRiver({
      bottleId: outcome.bottleId,
      userId: actor.user.id,
      ctx,
    });
    if (drawn === null) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    if (!drawn.ok) {
      const problem = problemFromOutcome(drawn);
      return problem === null ? reply.send({ bottle: null }) : sendProblem(reply, problem);
    }
    const row = await options.store.findBottle(outcome.bottleId);
    const state = await options.store.loadState(outcome.bottleId);
    if (row === null || state === null) {
      return sendProblem(reply, transportProblem('NOT_FOUND'));
    }
    const segments = await options.store.listBottleSegments(outcome.bottleId);
    const songs = await options.db.query<{ title: string }>(
      `select title from songs where id = $1`,
      [row.songId],
    );
    const codes = await codesFor(outcome.bottleId, [
      state.initiatorId,
      ...state.segments.map((segment) => segment.ownerId),
    ]);
    return reply.send({
      bottle: toBottleDetail({
        row,
        state,
        segments,
        codes,
        songTitle: songs[0]?.title ?? '',
        voteCounts: new Map(),
        viewerId: actor.user.id,
      }),
    });
  });
}
