/**
 * 口令哈希（D-03 裁决：`node:crypto` scrypt，N=2^15 / r=8 / p=1 / salt 32B）。
 *
 * 纪律：口令明文只进不出 —— 哈希串自描述参数（便于将来提升参数后在线迁移），
 * 校验失败一律返回 `false`（畸形串不抛异常，避免把内部结构暴露成 500）。
 */
import { describe, expect, it } from 'vitest';
import {
  KEY_BYTES,
  SALT_BYTES,
  SCRYPT_PARAMS,
  hashPassword,
  parsePasswordHash,
  verifyPassword,
} from './password';

/** 测试用轻参数：N=1024（规则逻辑与参数无关，真实参数见下一条断言）。 */
const FAST = { N: 1024, r: 8, p: 1 } as const;

describe('scrypt 参数（D-03 冻结）', () => {
  it('默认参数与裁决一致：N=2^15、r=8、p=1、salt 32B、keylen 64B', () => {
    expect(SCRYPT_PARAMS).toEqual({ N: 32768, r: 8, p: 1 });
    expect(SALT_BYTES).toBe(32);
    expect(KEY_BYTES).toBe(64);
  });

  it('默认参数下可哈希（maxmem 必须显式给够，否则 Node 会直接 throw）', () => {
    expect(() =>
      hashPassword('漂流瓶-Passw0rd', { salt: Buffer.alloc(SALT_BYTES, 7) }),
    ).not.toThrow();
  });
});

describe('hashPassword / verifyPassword', () => {
  it('哈希串自描述参数，且不含口令明文', () => {
    const stored = hashPassword('漂流瓶-Passw0rd', {
      params: FAST,
      salt: Buffer.alloc(SALT_BYTES, 1),
    });
    expect(stored.startsWith('scrypt$1024$8$1$')).toBe(true);
    expect(stored).not.toContain('漂流瓶-Passw0rd');
    expect(parsePasswordHash(stored)).not.toBeNull();
  });

  it('相同口令 + 相同 salt → 同一哈希（可复现）', () => {
    const salt = Buffer.alloc(SALT_BYTES, 2);
    const a = hashPassword('same-password-1', { params: FAST, salt });
    const b = hashPassword('same-password-1', { params: FAST, salt });
    expect(a).toBe(b);
  });

  it('相同口令 + 不同 salt → 不同哈希（未加盐即视为缺陷）', () => {
    const a = hashPassword('same-password-1', { params: FAST });
    const b = hashPassword('same-password-1', { params: FAST });
    expect(a).not.toBe(b);
  });

  it('正确口令校验通过，错误口令被拒', () => {
    const stored = hashPassword('correct-horse-9', { params: FAST });
    expect(verifyPassword('correct-horse-9', stored)).toBe(true);
    expect(verifyPassword('correct-horse-8', stored)).toBe(false);
    expect(verifyPassword('', stored)).toBe(false);
  });

  it('按行内参数校验：用快参数生成的哈希，将来换默认参数后仍可校验', () => {
    const stored = hashPassword('legacy-password-1', { params: { N: 512, r: 8, p: 1 } });
    expect(stored.startsWith('scrypt$512$8$1$')).toBe(true);
    expect(verifyPassword('legacy-password-1', stored)).toBe(true);
  });

  it('畸形/空哈希串返回 false，不抛异常（不把内部结构暴露成 500）', () => {
    for (const bad of [
      '',
      'x',
      'scrypt$1$2$3$4',
      'bcrypt$32768$8$1$AA$BB',
      'scrypt$1024$8$1$!!$!!',
    ]) {
      expect(verifyPassword('whatever-1', bad)).toBe(false);
    }
  });
});
