/** 账号契约（t6 落地；本任务只定义形状）。 */
import { z } from 'zod';
import { UuidSchema } from './common';

export const RoleSchema = z.enum(['USER', 'ADMIN']);

export const AuthUserSchema = z.object({
  id: UuidSchema,
  handle: z.string().min(1).max(32),
  email: z.email(),
  role: RoleSchema,
});

export const RegisterRequestSchema = z.object({
  handle: z.string().min(2).max(32),
  email: z.email(),
  /** 口令只在这一层出现：响应体与日志中禁止回显（ADR-008）。 */
  password: z.string().min(8).max(128),
});

export const LoginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});

export const SessionResponseSchema = z.object({
  user: AuthUserSchema,
  expiresAt: z.iso.datetime(),
});

/** 匿名代号：同一用户在不同瓶子里显示不同代号（CONTEXT §12.1）。 */
export const AnonymousCodeSchema = z.object({
  bottleId: UuidSchema,
  code: z.string().min(1).max(32),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

// ---------------------------------------------------------------- 账号错误词表（t6）

/**
 * 为什么 auth 自带一张码表（captain 裁决 A 方案，`docs/architecture.md` §26.4）：
 *
 * 1. 领域内核 `RULE_CODES` 是**终态内核**（t4/t17 已冻结，禁改），auth 错误不该反向污染它；
 * 2. 凭证/会话/注册错误与「游戏规则违反」是**不同类别** —— 合并成一个枚举会让所有领域错误码消费方
 *    无谓携带 6 个 auth 码；
 * 3. 不加深 `contracts → domain` 的耦合。
 *
 * 代价：`docs/api.md` §1 的 `violations[].code` 口径变为 `RULE_CODES ∪ AUTH_ERROR_CODES`
 * （auth 路由取后者）。**envelope 形状与 `ErrorResponseSchema` 完全一致**，客户端只有一种解析方式。
 */
export const AUTH_ERROR_CODES = [
  /** 注册邮箱已被占用（409）。 */
  'EMAIL_TAKEN',
  /** 注册用户名已被占用（409）。 */
  'HANDLE_TAKEN',
  /** 凭证错误（401）：**不区分**「邮箱不存在」与「口令错误」，防账号枚举。 */
  'INVALID_CREDENTIALS',
  /** 未登录或 cookie 缺失/畸形（401）。 */
  'UNAUTHENTICATED',
  /** 会话已过期（401）：与「未登录」分开，便于前端清 cookie 并提示重新登录。 */
  'SESSION_EXPIRED',
  /** 口令强度不足（422）。 */
  'WEAK_PASSWORD',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

/** 码给程序，中文文案给人（与领域 `RULE_MESSAGES` 同一纪律）。 */
export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  EMAIL_TAKEN: '这个邮箱已经注册过了，直接登录试试？',
  HANDLE_TAKEN: '这个名字已经有人用了，换一个吧。',
  INVALID_CREDENTIALS: '账号或口令不正确。',
  UNAUTHENTICATED: '请先登录。',
  SESSION_EXPIRED: '登录状态已过期，请重新登录。',
  WEAK_PASSWORD: '口令太弱了：至少 8 位，且要同时包含字母和数字。',
};

/** 状态映射与领域 `RULE_HTTP_STATUS` 同构（码 → 默认 HTTP 状态）。 */
export const AUTH_ERROR_HTTP_STATUS: Record<AuthErrorCode, 401 | 409 | 422> = {
  EMAIL_TAKEN: 409,
  HANDLE_TAKEN: 409,
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  SESSION_EXPIRED: 401,
  WEAK_PASSWORD: 422,
};

export function authHttpStatusOf(code: AuthErrorCode): 401 | 409 | 422 {
  return AUTH_ERROR_HTTP_STATUS[code];
}

export const AuthErrorCodeSchema = z.enum(AUTH_ERROR_CODES);

export const AuthViolationSchema = z.object({
  code: AuthErrorCodeSchema,
  message: z.string().min(1),
});

/** 与 `ErrorResponseSchema` 同形（`{ error: { message, violations[] } }`），只是 code 取自 auth 词表。 */
export const AuthErrorResponseSchema = z.object({
  error: z.object({
    message: z.string().min(1),
    violations: z.array(AuthViolationSchema).default([]),
  }),
});

export type AuthViolation = z.infer<typeof AuthViolationSchema>;
export type AuthErrorResponse = z.infer<typeof AuthErrorResponseSchema>;

export function authViolation(code: AuthErrorCode, message?: string): AuthViolation {
  return { code, message: message ?? AUTH_ERROR_MESSAGES[code] };
}
