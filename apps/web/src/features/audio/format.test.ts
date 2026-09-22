/**
 * 录音计时 / 播放位置的文本格式化单测。
 *
 * 为什么单独成模块：DESIGN.md 要求"状态变化必须有文案（不依赖波形颜色表达进度）"，
 * 因此 00:12 / 30 这类文本是**无障碍要求**的一部分，不是装饰。
 * 边界（0、负数、NaN、超过 1 分钟、恰好 30 秒）必须可预期，否则计时器会闪出 "NaN:NaN"。
 */
import { describe, expect, it } from 'vitest';
import { formatClock, formatSeconds } from './format';

describe('formatClock', () => {
  it('mm:ss 两位补零（录音计时与播放位置共用）', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(1_000)).toBe('00:01');
    expect(formatClock(12_400)).toBe('00:12');
    expect(formatClock(59_999)).toBe('00:59');
    expect(formatClock(60_000)).toBe('01:00');
    expect(formatClock(65_000)).toBe('01:05');
  });

  it('秒数向下取整（计时器不显示"还没到的时间"）', () => {
    expect(formatClock(1_999)).toBe('00:01');
    expect(formatClock(29_999)).toBe('00:29');
  });

  it('非法输入一律回落到 00:00，不显示 NaN', () => {
    expect(formatClock(Number.NaN)).toBe('00:00');
    expect(formatClock(-1)).toBe('00:00');
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('00:00');
  });
});

describe('formatSeconds', () => {
  it('一位小数的秒数（用于"12.4 / 30 秒"这类标签）', () => {
    expect(formatSeconds(12_400)).toBe('12.4');
    expect(formatSeconds(30_000)).toBe('30.0');
    expect(formatSeconds(0)).toBe('0.0');
  });

  it('非法输入回落到 0.0', () => {
    expect(formatSeconds(Number.NaN)).toBe('0.0');
    expect(formatSeconds(-5)).toBe('0.0');
  });
});
