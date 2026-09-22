/**
 * 口令强度策略（t6 的「弱密码」错误语义，码 = `WEAK_PASSWORD` → 422）。
 *
 * 契约层 `RegisterRequestSchema` 只保证 8..128 的长度，强度规则放这里，
 * 因为它是**纯函数**：可被单测穷举边界，且 API 层与将来的改密/重置流程共用同一份判定。
 */
import { describe, expect, it } from 'vitest';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, checkPassword } from './passwordPolicy';

const identity = { handle: 'midnight-singer', email: 'someone@example.com' };

describe('口令强度策略', () => {
  it('长度边界：7 位太弱、8 位可用、128 位可用、129 位太弱', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
    expect(checkPassword('ab1defg', identity)).toBe('WEAK_PASSWORD');
    expect(checkPassword('ab1defgh', identity)).not.toBe('WEAK_PASSWORD');
    expect(checkPassword(`a1${'x'.repeat(PASSWORD_MAX_LENGTH - 2)}`, identity)).not.toBe(
      'WEAK_PASSWORD',
    );
    expect(checkPassword(`a1${'x'.repeat(PASSWORD_MAX_LENGTH - 1)}`, identity)).toBe(
      'WEAK_PASSWORD',
    );
  });

  it('必须同时含字母与数字（纯字母或纯数字都算弱）', () => {
    expect(checkPassword('abcdefgh', identity)).toBe('WEAK_PASSWORD');
    expect(checkPassword('12345678', identity)).toBe('WEAK_PASSWORD');
    expect(checkPassword('abcd1234', identity)).not.toBe('WEAK_PASSWORD');
  });

  it('不能包含自己的 handle 或邮箱名（大小写不敏感）', () => {
    expect(checkPassword('Midnight-singer1', identity)).toBe('WEAK_PASSWORD');
    expect(checkPassword('SOMEONE9x', identity)).toBe('WEAK_PASSWORD');
  });

  it('常见弱口令黑名单：就算满足长度与字母数字也算弱', () => {
    for (const weak of ['password1', 'Password123', 'qwerty123', 'iloveyou1']) {
      expect(checkPassword(weak, identity), weak).toBe('WEAK_PASSWORD');
    }
  });

  it('合规口令返回 null（不是抛异常、也不是裸布尔）', () => {
    expect(checkPassword('潮汐-9Run-away', identity)).toBeNull();
  });

  it('handle 极短（<3）时不参与包含判定，避免误伤正常口令', () => {
    expect(checkPassword('ab-123456', { handle: 'ab', email: 'x@example.com' })).toBeNull();
  });
});
