/**
 * 请求身份解析（t9）：复用 t6 的会话实现，**不重复实现鉴权**。
 *
 * 401/403 由 `problem.ts` 的传输层码给出（内核不管鉴权）；路由只做「有没有身份 / 够不够角色」。
 */
import type { Clock } from '@music-drift/shared/domain';
import type { FastifyRequest } from 'fastify';
import { createAuthRepository, type UserRow } from '../auth/repository.js';
import {
  SESSION_COOKIE_NAME,
  hashSessionToken,
  isSessionActive,
  readCookie,
} from '../auth/session.js';
import type { Db } from '../db/client.js';

export interface SessionActor {
  user: UserRow;
  isAdmin: boolean;
}

export interface ActorResolver {
  /** 返回当前会话用户；无 cookie / 会话失效 / 已过期 → null。 */
  resolve(request: FastifyRequest): Promise<SessionActor | null>;
}

export function createActorResolver(db: Db, clock: Clock): ActorResolver {
  const repo = createAuthRepository(db);
  return {
    async resolve(request: FastifyRequest): Promise<SessionActor | null> {
      const token = readCookie(request.headers.cookie, SESSION_COOKIE_NAME);
      if (token === null) {
        return null;
      }
      const session = await repo.findSessionByTokenHash(hashSessionToken(token));
      if (session === null || !isSessionActive(session.expiresAt, clock.now())) {
        return null;
      }
      /**
       * 封禁（t12 审核台）：**在身份解析这一层拦**，而不是在每个路由里记得判断 ——
       * 结构性覆盖，遗漏在结构上不可能。被封者一律按"无身份"（401）处理。
       */
      if (session.user.bannedAt !== null) {
        return null;
      }
      return { user: session.user, isAdmin: session.user.role === 'ADMIN' };
    },
  };
}
