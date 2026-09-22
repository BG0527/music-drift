/**
 * 口令强度策略（「弱密码」→ `WEAK_PASSWORD` / 422）。
 *
 * 契约层 `RegisterRequestSchema` 只约束长度 8..128，强度规则在这里（纯函数）：
 * 可穷举边界、可被将来的「改密 / 重置」流程复用，也让 API 层保持薄。
 *
 * 规则（任一不满足即弱）：
 * 1. 长度 8..128；
 * 2. 同时包含字母与数字；
 * 3. 不包含自己的 handle / 邮箱名（长度 ≥3 才判定，避免误伤正常口令）；
 * 4. 不在常见弱口令黑名单里（大小写不敏感）。
 */
import type { AuthErrorCode } from '@music-drift/shared';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** 身份片段的最小长度：太短的片段（如 handle="ab"）参与包含判定会大面积误伤。 */
const IDENTITY_MIN_LENGTH = 3;

/** 常见弱口令（demo 只放最典型的几条；正式版可换体积更大的字典或改用泄露库校验）。 */
const COMMON_WEAK_PASSWORDS = new Set([
  'password1',
  'password123',
  'passw0rd',
  '12345678',
  '123456789',
  'qwerty123',
  'iloveyou1',
  'admin123',
  'letmein1',
]);

export interface PasswordIdentity {
  handle: string;
  email: string;
}

/** 合规返回 `null`；否则返回稳定错误码（不抛异常、不返回裸布尔）。 */
export function checkPassword(password: string, identity: PasswordIdentity): AuthErrorCode | null {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return 'WEAK_PASSWORD';
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'WEAK_PASSWORD';
  }
  const lowered = password.toLowerCase();
  if (COMMON_WEAK_PASSWORDS.has(lowered)) {
    return 'WEAK_PASSWORD';
  }
  const localPart = identity.email.split('@')[0] ?? '';
  for (const fragment of [identity.handle, localPart]) {
    const normalized = fragment.trim().toLowerCase();
    if (normalized.length >= IDENTITY_MIN_LENGTH && lowered.includes(normalized)) {
      return 'WEAK_PASSWORD';
    }
  }
  return null;
}
