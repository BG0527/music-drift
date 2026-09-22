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
