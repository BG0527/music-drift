/**
 * 匿名代号（CONTEXT §12.1 / t6）。
 *
 * 规则：形如「午夜歌手#042」，**全局唯一**、**同一用户在每个瓶子里都必须不同**（否则可跨瓶关联同一个人的作品）。
 * 唯一性的两层保障：
 * 1. DB 层 `anon_codes.code` 全局唯一索引（最终防线，并发下唯一可靠的一道）；
 * 2. 生成层先排除「本用户已持有的代号」（本文件的纯函数部分，负责体验与减少冲突）。
 */
import { describe, expect, it } from 'vitest';
import {
  ANON_CODE_TITLES,
  AnonCodeExhaustedError,
  generateAnonCode,
  pickUniqueAnonCode,
} from './anonCode';

/** 固定序列随机源：便于把「冲突→重试」这条路径钉死。 */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => {
    const value = values[Math.min(i, values.length - 1)];
    i += 1;
    return value ?? 0;
  };
}

describe('代号池与格式', () => {
  it('词表去重且不含分隔符（避免生成歧义代号）', () => {
    expect(ANON_CODE_TITLES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(ANON_CODE_TITLES).size).toBe(ANON_CODE_TITLES.length);
    for (const title of ANON_CODE_TITLES) {
      expect(title).not.toMatch(/[#\s]/);
    }
  });

  it('格式 = 词 + # + 三位数字；下界与上界都被钉住', () => {
    expect(generateAnonCode(sequence([0, 0]))).toBe(`${ANON_CODE_TITLES[0]}#001`);
    expect(generateAnonCode(sequence([0.999999, 0.999999]))).toBe(`${ANON_CODE_TITLES.at(-1)}#999`);
    expect(generateAnonCode(sequence([0.5, 0.5]))).toMatch(/^[^#\s]+#\d{3}$/);
  });
});

describe('pickUniqueAnonCode', () => {
  it('首选候选未被占用时直接返回（不浪费随机数）', () => {
    const code = pickUniqueAnonCode({
      random: sequence([0, 0]),
      isCodeTaken: () => false,
    });
    expect(code).toBe(`${ANON_CODE_TITLES[0]}#001`);
  });

  it('候选被本用户在其他瓶子占用时换一个（同瓶不同码的关键路径）', () => {
    const taken = new Set([`${ANON_CODE_TITLES[0]}#001`]);
    const code = pickUniqueAnonCode({
      random: sequence([0, 0, 0, 0.5]),
      isCodeTaken: (candidate) => taken.has(candidate),
    });
    expect(code).not.toBe(`${ANON_CODE_TITLES[0]}#001`);
    expect(code).toBe(`${ANON_CODE_TITLES[0]}#500`);
  });

  it('耗尽重试次数则抛 AnonCodeExhaustedError（不返回半成品、不静默复用）', () => {
    let calls = 0;
    expect(() =>
      pickUniqueAnonCode({
        random: sequence([0, 0]),
        isCodeTaken: () => {
          calls += 1;
          return true;
        },
        maxAttempts: 3,
      }),
    ).toThrow(AnonCodeExhaustedError);
    expect(calls).toBe(3);
  });
});
