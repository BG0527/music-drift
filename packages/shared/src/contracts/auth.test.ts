/**
 * 账号错误码自检（t6）。
 *
 * 为什么 auth 自带一张码表：`RuleViolationSchema` 的 code 枚举来自领域内核 `RULE_CODES`，
 * 而账号流程的错误（凭证错误 / 会话过期 / 重复注册）不属于领域规则；
 * `packages/shared/src/domain/` 是终态内核（captain 明确禁改），因此 auth 词汇表放在契约层，
 * **envelope 与 `ErrorResponseSchema` 同形**（`{ error: { message, violations[] } }`），保证客户端只有一种解析方式。
 */
import { describe, expect, it } from 'vitest';
import { ErrorResponseSchema } from './common';
import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_HTTP_STATUS,
  AUTH_ERROR_MESSAGES,
  AuthErrorResponseSchema,
  AuthUserSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  authHttpStatusOf,
} from './auth';

describe('账号错误码词表', () => {
  it('码表与文档一致：6 个稳定码，码给程序、文案给人', () => {
    expect([...AUTH_ERROR_CODES]).toEqual([
      'EMAIL_TAKEN',
      'HANDLE_TAKEN',
      'INVALID_CREDENTIALS',
      'UNAUTHENTICATED',
      'SESSION_EXPIRED',
      'WEAK_PASSWORD',
    ]);
  });

  it('每个码都有中文文案与 HTTP 状态（不允许漏项）', () => {
    for (const code of AUTH_ERROR_CODES) {
      expect(AUTH_ERROR_MESSAGES[code], `${code} 缺文案`).toMatch(/[。？]$/);
      expect([401, 409, 422]).toContain(AUTH_ERROR_HTTP_STATUS[code]);
    }
  });

  it('状态映射：重复注册 409、凭证/会话 401、弱密码 422', () => {
    expect(authHttpStatusOf('EMAIL_TAKEN')).toBe(409);
    expect(authHttpStatusOf('HANDLE_TAKEN')).toBe(409);
    expect(authHttpStatusOf('INVALID_CREDENTIALS')).toBe(401);
    expect(authHttpStatusOf('UNAUTHENTICATED')).toBe(401);
    expect(authHttpStatusOf('SESSION_EXPIRED')).toBe(401);
    expect(authHttpStatusOf('WEAK_PASSWORD')).toBe(422);
  });

  it('凭证错误的文案不区分「邮箱不存在」与「密码错误」（防账号枚举）', () => {
    expect(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS).not.toMatch(/邮箱|用户不存在/);
  });
});

describe('AuthErrorResponseSchema', () => {
  it('envelope 与 ErrorResponseSchema 同形（客户端只有一种解析方式）', () => {
    const authShape = Object.keys(AuthErrorResponseSchema.shape.error.shape).sort();
    const domainShape = Object.keys(ErrorResponseSchema.shape.error.shape).sort();
    expect(authShape).toEqual(domainShape);
  });

  it('接受 auth 错误码，拒绝未知码', () => {
    expect(
      AuthErrorResponseSchema.safeParse({
        error: {
          message: '账号或口令不正确。',
          violations: [{ code: 'INVALID_CREDENTIALS', message: '账号或口令不正确。' }],
        },
      }).success,
    ).toBe(true);

    expect(
      AuthErrorResponseSchema.safeParse({
        error: { message: 'x', violations: [{ code: 'NOT_A_REAL_CODE', message: 'x' }] },
      }).success,
    ).toBe(false);
  });

  it('violations 可省略（默认空数组）', () => {
    const parsed = AuthErrorResponseSchema.parse({ error: { message: '会话已过期。' } });
    expect(parsed.error.violations).toEqual([]);
  });
});

/**
 * W6（`docs/deploy-plan-html.md` §13 需求 7）：登录与注册**都只要「账号 + 密码」**，
 * 不要用户名、**账号不是邮箱**。旧写法必须继续可用（W7/W8 的脚本还在用 `{handle, email}` / `{email}`）。
 */
describe('W6 账号契约：正名 = 账号 + 密码，旧写法仍兼容', () => {
  const PASSWORD = 'Bottle2026';

  it('注册接受「账号 + 密码」两项（没有用户名，也没有邮箱）', () => {
    const parsed = RegisterRequestSchema.safeParse({ account: 'midnight-singer', password: PASSWORD });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.account).toBe('midnight-singer');
  });

  it('登录接受「账号 + 密码」两项（账号按 handle 查，不要求邮箱）', () => {
    expect(LoginRequestSchema.safeParse({ account: 'midnight-singer', password: PASSWORD }).success).toBe(
      true,
    );
  });

  it('旧的 { handle, email, password } / { email, password } 写法仍然可用（向后兼容）', () => {
    expect(
      RegisterRequestSchema.safeParse({
        handle: 'midnight-singer',
        email: 'singer@example.com',
        password: PASSWORD,
      }).success,
    ).toBe(true);
    expect(
      LoginRequestSchema.safeParse({ email: 'singer@example.com', password: PASSWORD }).success,
    ).toBe(true);
  });

  it('注册必须带账号：既没有 account 也没有 handle → 结构非法', () => {
    const parsed = RegisterRequestSchema.safeParse({ email: 'singer@example.com', password: PASSWORD });

    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0]?.path).toEqual(['account']);
  });

  it('登录必须带账号或邮箱：两者都没有 → 结构非法', () => {
    expect(LoginRequestSchema.safeParse({ password: PASSWORD }).success).toBe(false);
  });

  it('AuthUserSchema：account 是正名、email 可为 null；旧载荷缺 account 时解析后取 handle', () => {
    const id = '00000000-0000-4000-8000-000000000001';

    expect(
      AuthUserSchema.safeParse({ id, handle: 'demo', account: 'demo', email: null, role: 'USER' })
        .success,
    ).toBe(true);
    // 冻结的客户端（apps/web）用自己的夹具解析这份 schema，夹具里没有新字段 ⇒ 必须照收
    const legacy = AuthUserSchema.parse({ id, handle: 'demo', email: null, role: 'USER' });
    expect(legacy.account).toBe('demo');
    // email 是必填字段（可空），缺了就是结构错误 —— 不静默补 null
    expect(AuthUserSchema.safeParse({ id, handle: 'demo', account: 'demo', role: 'USER' }).success).toBe(
      false,
    );
    expect(
      AuthUserSchema.safeParse({ id, handle: 'demo', account: 'demo', email: 'not-an-email', role: 'USER' })
        .success,
    ).toBe(false);
  });
});
