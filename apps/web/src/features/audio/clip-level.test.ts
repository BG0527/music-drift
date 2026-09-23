/**
 * `clip-level` 单测：把"有没有录到声音"钉成可断言的量（t40）。
 *
 * 真实读数（由 `mic-probe.mjs` 在真 Chromium 上用**受控输入**实测，见 `docs/audio.md` §11）：
 * - 440Hz @ -12 dBFS 正弦（AGC 后）⇒ 解码峰值 **-4.8 dBFS**；
 * - 数字静音 ⇒ 解码峰值 **-673.8 dBFS**（非规格化小量，不是精确的 -∞）。
 * 这两条决定了阈值必须落在两者之间，而且"完全没有信号"必须被判为 silent。
 */
import { describe, expect, it } from 'vitest';
import {
  SILENT_PEAK_DBFS,
  formatPeakDbfs,
  judgeClipLevel,
  measureClipLevel,
  measureSamples,
  toDbfs,
} from './clip-level';

/** 全 0 采样（数字静音）。 */
function silence(length = 4800): Float32Array {
  return new Float32Array(length);
}

/** 正弦（默认 -12 dBFS 幅度）。 */
function tone(amplitude = 0.25, length = 4800): Float32Array {
  const samples = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    samples[index] = amplitude * Math.sin((2 * Math.PI * 440 * index) / 48_000);
  }
  return samples;
}

describe('toDbfs', () => {
  it('满刻度 = 0 dBFS，0.5 振幅 ≈ -6 dBFS', () => {
    expect(toDbfs(1)).toBe(0);
    expect(toDbfs(0.5)).toBeCloseTo(-6.02, 2);
  });

  it('0 / 负数 / NaN → -Infinity（不返回"看起来像很小声音"的近似值）', () => {
    expect(toDbfs(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(toDbfs(-0.2)).toBe(Number.NEGATIVE_INFINITY);
    expect(toDbfs(Number.NaN)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('measureSamples / measureClipLevel', () => {
  it('数字静音：峰值 0、RMS 0 ⇒ dBFS 为 -Infinity', () => {
    const level = measureClipLevel(silence(), 3.2);
    expect(level.peakDbfs).toBe(Number.NEGATIVE_INFINITY);
    expect(level.rmsDbfs).toBe(Number.NEGATIVE_INFINITY);
    expect(level.durationSeconds).toBe(3.2);
  });

  it('0.25 幅度正弦：峰值 ≈ -12 dBFS、RMS ≈ -15 dBFS（正弦 RMS = 峰值/√2）', () => {
    const level = measureClipLevel(tone(0.25), 3.2);
    expect(level.peakDbfs).toBeCloseTo(-12, 1);
    // 25% 幅度正弦的 RMS = 0.25/√2 = 0.17678 → -15.05 dBFS（比峰值低 3.01 dB）
    expect(level.rmsDbfs).toBeCloseTo(-15.05, 2);
  });

  it('空数组不炸：峰值/RMS 都是 0（时长不可信时归 0）', () => {
    expect(measureSamples(new Float32Array(0))).toEqual({ peak: 0, rms: 0 });
    expect(measureClipLevel(new Float32Array(0), Number.NaN).durationSeconds).toBe(0);
  });
});

describe('judgeClipLevel：判定"有没有录到声音"', () => {
  it('数字静音（真机实测 -673.8 dBFS）→ silent，且给"去查什么"的指引', () => {
    const verdict = judgeClipLevel({ peakDbfs: -673.8, rmsDbfs: -673.8, durationSeconds: 3.2 });
    expect(verdict.status).toBe('silent');
    expect(verdict.message).toContain('-673.8 dBFS');
    expect(verdict.guidance).toMatch(/输入设备|静音/);
  });

  it('完全没有音频信号（-Infinity）→ silent，并说明"完全没有信号"', () => {
    const verdict = judgeClipLevel({
      peakDbfs: Number.NEGATIVE_INFINITY,
      rmsDbfs: Number.NEGATIVE_INFINITY,
      durationSeconds: 3,
    });
    expect(verdict.status).toBe('silent');
    expect(verdict.message).toContain('完全没有音频信号');
  });

  it('真机实测的 440Hz（-4.8 dBFS）→ ok', () => {
    const verdict = judgeClipLevel({ peakDbfs: -4.8, rmsDbfs: -21.9, durationSeconds: 3.2 });
    expect(verdict.status).toBe('ok');
    expect(verdict.guidance).toBeNull();
    expect(verdict.message).toContain('-4.8 dBFS');
  });

  it('边界是"严格小于"：恰好 -60 dBFS 不算静音（宁可放过小声，也不误拦真实录音）', () => {
    expect(SILENT_PEAK_DBFS).toBe(-60);
    expect(judgeClipLevel({ peakDbfs: -60, rmsDbfs: -70, durationSeconds: 3 }).status).toBe('ok');
    expect(judgeClipLevel({ peakDbfs: -60.1, rmsDbfs: -70, durationSeconds: 3 }).status).toBe(
      'silent',
    );
  });

  it('很小的声音（-35 dBFS，说话轻/离麦远）**不能**被拦：误判会逼用户白重录', () => {
    expect(judgeClipLevel({ peakDbfs: -35, rmsDbfs: -48, durationSeconds: 3 }).status).toBe('ok');
  });
});

describe('formatPeakDbfs：给用户看的读数', () => {
  it('有限值给一位小数；-Infinity 不写成 -Infinity', () => {
    expect(formatPeakDbfs(-12.34)).toBe('-12.3 dBFS');
    expect(formatPeakDbfs(Number.NEGATIVE_INFINITY)).toBe('无信号（−∞ dBFS）');
  });
});
