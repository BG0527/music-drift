/**
 * 账号持久化（users / sessions / anon_codes）。
 *
 * 纪律（与 `db/holdings.ts` 同一教训）：**只吞你意图吞的那一个冲突**。
 * 裸 `ON CONFLICT DO NOTHING` 或「见到 23505 就当重复」会把主键碰撞、外键问题、
 * 将来新增的约束一起吞掉，变成没有任何信号的静默失败。因此这里按**约束名**精确映射：
 * `users_email_uniq` / `users_handle_uniq` / `anon_codes_code_uniq` 各归各码，其余一律上抛。
 *
 * 会话与代号的两条不变量：
 * - 同一用户可有**多个会话**（多浏览器并行、多账号互不干扰是 t6 的验收前提）；
 * - 同 (user, bottle) 只可能有一行代号（`anon_codes_user_bottle_uniq`），重复分配**复用**而非新增。
 */
import { randomUUID } from 'node:crypto';
import type { Db } from '../db/client.js';

export interface UserRow {
  id: string;
  /** **账号**（W6 正名 = `account`）：注册/登录都只用它。 */
  handle: string;
  /** 邮箱可空（账号注册的用户没有邮箱）；旧注册写法仍会写入。 */
  email: string | null;
  passwordHash: string;
  role: 'USER' | 'ADMIN';
  /** 封禁时间（t12 审核台）；非空 = 被封禁，身份解析层直接拒绝（401）。 */
  bannedAt: Date | null;
  createdAt: Date;
}

export interface AnonCodeRow {
  bottleId: string;
  code: string;
  createdAt: Date;
}

export type CreateUserResult =
  { ok: true; user: UserRow } | { ok: false; code: 'EMAIL_TAKEN' | 'HANDLE_TAKEN' };

export type AssignAnonCodeResult =
  { ok: true; code: string; created: boolean } | { ok: false; code: 'ANON_CODE_TAKEN' };

export interface CreateUserInput {
  /** 账号（= `users.handle`）。 */
  handle: string;
  /** 邮箱可省略（`null` = 账号注册，没有邮箱）。 */
  email: string | null;
  passwordHash: string;
  role?: 'USER' | 'ADMIN' | undefined;
  /** 仅供测试/种子指定 id（幂等重放）；缺省由 DB 生成。 */
  id?: string | undefined;
}

export interface CreateSessionInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  /** 仅供测试指定 id；缺省由 DB 生成。 */
  id?: string | undefined;
}

export interface SessionWithUser {
  user: UserRow;
  expiresAt: Date;
}

export interface AuthRepository {
  createUser(input: CreateUserInput): Promise<CreateUserResult>;
  /** 按**账号**（= `handle`，大小写敏感）查用户：W6 起登录/注册的主路径。 */
  findUserByHandle(handle: string): Promise<UserRow | null>;
  /** 按邮箱查用户：仅旧登录写法（`{ email, password }`）使用。 */
  findUserByEmail(email: string): Promise<UserRow | null>;
  findUserById(id: string): Promise<UserRow | null>;
  createSession(input: CreateSessionInput): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionWithUser | null>;
  deleteSessionByTokenHash(tokenHash: string): Promise<boolean>;
  /** 清理已过期会话（`expires_at <= nowMs`，与 `isSessionActive` 的边界一致）；返回删除行数。 */
  deleteExpiredSessions(nowMs: number): Promise<number>;
  assignAnonCode(input: {
    userId: string;
    bottleId: string;
    code: string;
  }): Promise<AssignAnonCodeResult>;
  listAnonCodes(userId: string): Promise<AnonCodeRow[]>;
  listCodesForUser(userId: string): Promise<string[]>;
  listCodesInBottle(bottleId: string): Promise<string[]>;
}

interface UserDbRow {
  id: string;
  handle: string;
  email: string | null;
  password_hash: string;
  role: string;
  banned_at: Date | null;
  created_at: Date;
}

interface AnonCodeDbRow {
  bottle_id: string;
  code: string;
  created_at: Date;
}

const UNIQUE_VIOLATION = '23505';

/** 返回唯一冲突的约束名；不是唯一冲突时返回 null（调用方据此决定上抛）。 */
function uniqueViolationConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const candidate = error as { code?: unknown; constraint?: unknown };
  if (candidate.code !== UNIQUE_VIOLATION) {
    return null;
  }
  return typeof candidate.constraint === 'string' ? candidate.constraint : '';
}

function toUserRow(row: UserDbRow): UserRow {
  return {
    id: row.id,
    handle: row.handle,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role === 'ADMIN' ? 'ADMIN' : 'USER',
    bannedAt: row.banned_at,
    createdAt: row.created_at,
  };
}

export function createAuthRepository(db: Db): AuthRepository {
  return {
    async createUser(input: CreateUserInput): Promise<CreateUserResult> {
      try {
        const rows = await db.query<UserDbRow>(
          `insert into users (id, handle, email, password_hash, role)
           values ($1, $2, $3, $4, $5)
           returning id, handle, email, password_hash, role, created_at`,
          [
            input.id ?? randomUUID(),
            input.handle,
            input.email,
            input.passwordHash,
            input.role ?? 'USER',
          ],
        );
        const row = rows[0];
        if (row === undefined) {
          throw new Error('createUser：insert 未返回行');
        }
        return { ok: true, user: toUserRow(row) };
      } catch (error) {
        const constraint = uniqueViolationConstraint(error);
        if (constraint === 'users_email_uniq') {
          return { ok: false, code: 'EMAIL_TAKEN' };
        }
        if (constraint === 'users_handle_uniq') {
          return { ok: false, code: 'HANDLE_TAKEN' };
        }
        throw error;
      }
    },

    async findUserByHandle(handle: string): Promise<UserRow | null> {
      const rows = await db.query<UserDbRow>(
        `select id, handle, email, password_hash, role, banned_at, created_at from users where handle = $1`,
        [handle],
      );
      const row = rows[0];
      return row === undefined ? null : toUserRow(row);
    },

    async findUserByEmail(email: string): Promise<UserRow | null> {
      const rows = await db.query<UserDbRow>(
        `select id, handle, email, password_hash, role, banned_at, created_at from users where email = $1`,
        [email],
      );
      const row = rows[0];
      return row === undefined ? null : toUserRow(row);
    },

    async findUserById(id: string): Promise<UserRow | null> {
      const rows = await db.query<UserDbRow>(
        `select id, handle, email, password_hash, role, banned_at, created_at from users where id = $1`,
        [id],
      );
      const row = rows[0];
      return row === undefined ? null : toUserRow(row);
    },

    async createSession(input: CreateSessionInput): Promise<void> {
      await db.query(
        `insert into sessions (id, user_id, token_hash, expires_at) values ($1, $2, $3, $4)`,
        [input.id ?? randomUUID(), input.userId, input.tokenHash, input.expiresAt],
      );
    },

    async findSessionByTokenHash(tokenHash: string): Promise<SessionWithUser | null> {
      const rows = await db.query<UserDbRow & { expires_at: Date }>(
        `select u.id, u.handle, u.email, u.password_hash, u.role, u.banned_at, u.created_at, s.expires_at
         from sessions s
         join users u on u.id = s.user_id
         where s.token_hash = $1`,
        [tokenHash],
      );
      const row = rows[0];
      if (row === undefined) {
        return null;
      }
      return { user: toUserRow(row), expiresAt: row.expires_at };
    },

    async deleteSessionByTokenHash(tokenHash: string): Promise<boolean> {
      const rows = await db.query<{ id: string }>(
        `delete from sessions where token_hash = $1 returning id`,
        [tokenHash],
      );
      return rows.length > 0;
    },

    async deleteExpiredSessions(nowMs: number): Promise<number> {
      const rows = await db.query<{ id: string }>(
        `delete from sessions where expires_at <= to_timestamp($1 / 1000.0) returning id`,
        [nowMs],
      );
      return rows.length;
    },

    async assignAnonCode(input): Promise<AssignAnonCodeResult> {
      try {
        const inserted = await db.query<{ code: string }>(
          `insert into anon_codes (user_id, bottle_id, code)
           values ($1, $2, $3)
           on conflict (user_id, bottle_id) do nothing
           returning code`,
          [input.userId, input.bottleId, input.code],
        );
        const row = inserted[0];
        if (row !== undefined) {
          return { ok: true, code: row.code, created: true };
        }
      } catch (error) {
        const constraint = uniqueViolationConstraint(error);
        if (constraint === 'anon_codes_code_uniq') {
          return { ok: false, code: 'ANON_CODE_TAKEN' };
        }
        throw error;
      }

      // 走到这里 = (user, bottle) 已有行：复用已分配的代号（幂等）。
      const existing = await db.query<{ code: string }>(
        `select code from anon_codes where user_id = $1 and bottle_id = $2`,
        [input.userId, input.bottleId],
      );
      const row = existing[0];
      if (row === undefined) {
        throw new Error('assignAnonCode：冲突后未查到既有代号');
      }
      return { ok: true, code: row.code, created: false };
    },

    async listAnonCodes(userId: string): Promise<AnonCodeRow[]> {
      const rows = await db.query<AnonCodeDbRow>(
        `select bottle_id, code, created_at from anon_codes where user_id = $1 order by created_at`,
        [userId],
      );
      return rows.map((row) => ({
        bottleId: row.bottle_id,
        code: row.code,
        createdAt: row.created_at,
      }));
    },

    async listCodesForUser(userId: string): Promise<string[]> {
      const rows = await db.query<{ code: string }>(
        `select code from anon_codes where user_id = $1`,
        [userId],
      );
      return rows.map((row) => row.code);
    },

    async listCodesInBottle(bottleId: string): Promise<string[]> {
      const rows = await db.query<{ code: string }>(
        `select code from anon_codes where bottle_id = $1`,
        [bottleId],
      );
      return rows.map((row) => row.code);
    },
  };
}
