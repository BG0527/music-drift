/**
 * 账号路由（t6 落地 `docs/api.md` §2.2）。
 *
 * 分层：路由**薄** —— 校验（zod 契约）→ 纯策略（口令强度）→ 持久化/会话（`auth/*`）→ 响应。
 * 规则不写在这里，错误语义集中走 `sendAuthError`（码 → 状态 → envelope）。
 *
 * 安全纪律（ADR-008）：
 * - 响应体**永不**出现口令或会话令牌（令牌只进 `Set-Cookie`）；
 * - 登录失败不区分「账号不存在 / 口令错误」（防账号枚举）；
 * - 账号不存在时也跑一次等价的口令校验（防时序侧信道）；
 * - 时间一律 `clock.now()`（`eslint.config.mjs` 禁止 API 层自取墙上时间）。
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AnonymousCodeSchema,
  AuthErrorResponseSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  SessionResponseSchema,
  authHttpStatusOf,
  authViolation,
  type AuthErrorCode,
} from '@music-drift/shared';
import type { Clock } from '@music-drift/shared/domain';
import type { Db } from '../db/client.js';
import { checkPassword } from '../auth/passwordPolicy.js';
import { hashPassword, type ScryptParams, verifyPassword } from '../auth/password.js';
import {
  DEFAULT_SESSION_TTL_MS,
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  createSessionToken,
  hashSessionToken,
  isSessionActive,
  readCookie,
  serializeSessionCookie,
  sessionExpiresAt,
} from '../auth/session.js';
import { createAuthRepository, type AuthRepository, type UserRow } from '../auth/repository.js';

export interface AuthRouteOptions {
  db: Db;
  clock: Clock;
  /** 会话 TTL（可注入策略；缺省 30 天）。 */
  sessionTtlMs?: number | undefined;
  /** 仅生产环境为 true：本地 http 下带 Secure 浏览器不会保存 cookie。 */
  secureCookies?: boolean | undefined;
  /** scrypt 参数覆盖：仅测试用（生产走 D-03 冻结参数）。 */
  passwordParams?: ScryptParams | undefined;
}

type SessionResolution =
  { kind: 'ok'; user: UserRow; expiresAt: Date } | { kind: 'none' } | { kind: 'expired' };

/** 账号不存在时也跑一次等价校验，避免用响应时间区分「账号是否存在」。 */
const TIMING_DUMMY_HASH = hashPassword('not-a-real-password-0000');

export function registerAuthRoutes(app: FastifyInstance, options: AuthRouteOptions): void {
  const repo = createAuthRepository(options.db);
  const ttlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const secure = options.secureCookies ?? false;

  function sendAuthError(
    reply: FastifyReply,
    code: AuthErrorCode,
    status: number = authHttpStatusOf(code),
  ): FastifyReply {
    const violation = authViolation(code);
    return reply
      .status(status)
      .send(
        AuthErrorResponseSchema.parse({
          error: { message: violation.message, violations: [violation] },
        }),
      );
  }

  function sendValidationError(
    reply: FastifyReply,
    issues: readonly { path: readonly PropertyKey[] }[],
  ): FastifyReply {
    const fields = [...new Set(issues.map((issue) => issue.path.join('.') || 'body'))].join('、');
    return reply.status(422).send(
      AuthErrorResponseSchema.parse({
        error: { message: `请求体不合法：${fields}`, violations: [] },
      }),
    );
  }

  function sessionPayload(user: UserRow, expiresAt: Date) {
    return SessionResponseSchema.parse({
      user: { id: user.id, handle: user.handle, email: user.email, role: user.role },
      expiresAt: expiresAt.toISOString(),
    });
  }

  async function issueSession(reply: FastifyReply, user: UserRow): Promise<Date> {
    const token = createSessionToken();
    const expiresAt = sessionExpiresAt(options.clock.now(), ttlMs);
    await repo.createSession({ userId: user.id, tokenHash: hashSessionToken(token), expiresAt });
    reply.header(
      'set-cookie',
      serializeSessionCookie({ token, ttlMs, nowMs: options.clock.now(), secure }),
    );
    return expiresAt;
  }

  async function resolveSession(request: FastifyRequest): Promise<SessionResolution> {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE_NAME);
    if (token === null) {
      return { kind: 'none' };
    }
    const found = await repo.findSessionByTokenHash(hashSessionToken(token));
    if (found === null) {
      return { kind: 'none' };
    }
    if (!isSessionActive(found.expiresAt, options.clock.now())) {
      // 顺手清理：过期行不再保留（避免 sessions 表无限增长）。
      await repo.deleteSessionByTokenHash(hashSessionToken(token));
      return { kind: 'expired' };
    }
    return { kind: 'ok', user: found.user, expiresAt: found.expiresAt };
  }

  async function requireSession(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<Extract<SessionResolution, { kind: 'ok' }> | null> {
    const session = await resolveSession(request);
    if (session.kind === 'ok') {
      return session;
    }
    sendAuthError(reply, session.kind === 'expired' ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED');
    return null;
  }

  app.post('/api/auth/register', async (request, reply) => {
    const parsed = RegisterRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }
    const email = parsed.data.email.trim().toLowerCase();
    const handle = parsed.data.handle.trim();
    if (handle.length < 2) {
      return sendValidationError(reply, [{ path: ['handle'] }]);
    }
    const weak = checkPassword(parsed.data.password, { handle, email });
    if (weak !== null) {
      return sendAuthError(reply, weak);
    }

    const created = await repo.createUser({
      handle,
      email,
      passwordHash: hashPassword(parsed.data.password, { params: options.passwordParams }),
    });
    if (!created.ok) {
      return sendAuthError(reply, created.code);
    }

    const expiresAt = await issueSession(reply, created.user);
    return reply.status(201).send(sessionPayload(created.user, expiresAt));
  });

  app.post('/api/auth/login', async (request, reply) => {
    const parsed = LoginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }
    const email = parsed.data.email.trim().toLowerCase();
    const user = await repo.findUserByEmail(email);
    const matched = verifyPassword(parsed.data.password, user?.passwordHash ?? TIMING_DUMMY_HASH);
    if (user === null || !matched) {
      return sendAuthError(reply, 'INVALID_CREDENTIALS');
    }

    await repo.deleteExpiredSessions(options.clock.now());
    const expiresAt = await issueSession(reply, user);
    return reply.status(200).send(sessionPayload(user, expiresAt));
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE_NAME);
    if (token !== null) {
      await repo.deleteSessionByTokenHash(hashSessionToken(token));
    }
    reply.header('set-cookie', clearSessionCookie({ secure }));
    return reply.status(204).send();
  });

  app.get('/api/auth/me', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (session === null) {
      return reply;
    }
    return reply.status(200).send(sessionPayload(session.user, session.expiresAt));
  });

  app.get('/api/me/anonymous-codes', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (session === null) {
      return reply;
    }
    const codes = await repo.listAnonCodes(session.user.id);
    return reply
      .status(200)
      .send(
        codes.map((row) => AnonymousCodeSchema.parse({ bottleId: row.bottleId, code: row.code })),
      );
  });
}

export type { AuthRepository };
