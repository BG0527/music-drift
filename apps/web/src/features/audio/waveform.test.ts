/**
 * 波形降采样单测（把 `AnalyserNode` 的时域数据压成 N 根柱子）。
 *
 * 两种输入形态都要支持：
 * - `Uint8Array`（`getByteTimeDomainData`，128 为静音中心）；
 * - `Float32Array`（`getFloatTimeDomainData` / `OfflineAudioContext` 解码结果，0 为静音）。
 * 取**峰值**而不是平均值：平均值会把语音波形抹平成一堆等高的柱子（看不出停顿）。
 */
import { describe, expect, it } from 'vitest';
import { downsampleLevels, normalizeLevels, peakLevel } from './waveform';

const bars = (values: number[]) => Uint8Array.from(values);

describe('peakLevel', () => {
  it('Uint8Array（128 = 静音中心）→ 距中心的相对峰值', () => {
    expect(peakLevel(bars([128, 128, 128]))).toBe(0);
    expect(peakLevel(bars([128, 255, 128]))).toBeCloseTo(0.992, 3);
    expect(peakLevel(bars([0, 128, 128]))).toBeCloseTo(1, 3);
  });

  it('Float32Array（0 = 静音）→ 绝对值峰值，且截断到 1', () => {
    expect(peakLevel(Float32Array.from([0, 0.5, -0.25]))).toBeCloseTo(0.5, 5);
    expect(peakLevel(Float32Array.from([0, 1.5]))).toBe(1);
    expect(peakLevel(Float32Array.from([0, 0]))).toBe(0);
  });

  it('空数组 → 0（不能抛异常，否则每帧都会炸）', () => {
    expect(peakLevel(new Uint8Array(0))).toBe(0);
    expect(peakLevel(Float32Array.from([]))).toBe(0);
  });
});

describe('downsampleLevels', () => {
  it('按柱子数分桶取峰值，长度恒等于 bars', () => {
    const samples = Float32Array.from([0.1, 0.9, 0.2, 0.1, 0.2, 0.3, 0.4, 0.05]);

    const levels = downsampleLevels(samples, 4);

    expect(levels).toHaveLength(4);
    expect(levels[0]).toBeCloseTo(0.9, 5);
    expect(levels[3]).toBeCloseTo(0.4, 5);
  });

  it('采样点少于柱子数时补零（不为了让数组变长而重复数据）', () => {
    const levels = downsampleLevels(Float32Array.from([1, 0.5]), 5);

    expect(levels).toHaveLength(5);
    expect(levels[0]).toBeCloseTo(1, 5);
    expect(levels[1]).toBeCloseTo(0.5, 5);
    expect(levels[2]).toBe(0);
    expect(levels[4]).toBe(0);
  });

  it('bars <= 0 视为不显示（返回空数组）', () => {
    expect(downsampleLevels(Float32Array.from([1, 2]), 0)).toEqual([]);
    expect(downsampleLevels(Float32Array.from([1, 2]), -3)).toEqual([]);
  });

  it('Uint8Array 输入同样可用（浏览器 getByteTimeDomainData 的默认形态）', () => {
    const levels = downsampleLevels(bars([128, 255, 128, 128, 0, 128]), 3);

    expect(levels).toHaveLength(3);
    expect(levels[0]).toBeCloseTo(127 / 128, 3);
    expect(levels[2]).toBeCloseTo(1, 3);
  });
});

describe('normalizeLevels（录完之后的静态波形）', () => {
  it('按最大值归一，让小声录音也能看出形状', () => {
    expect(normalizeLevels([0.1, 0.2, 0.05])).toEqual([0.5, 1, 0.25]);
  });

  it('全零（静音）不除零，返回全零', () => {
    expect(normalizeLevels([0, 0, 0])).toEqual([0, 0, 0]);
    expect(normalizeLevels([])).toEqual([]);
  });

  it('空数组不抛异常', () => {
    expect(normalizeLevels([])).toEqual([]);
  });
});
