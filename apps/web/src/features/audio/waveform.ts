/**
 * 波形降采样（纯函数）：把 `AnalyserNode` 的时域数据压成 N 根柱子。
 *
 * 两种输入形态都支持：
 * - `Uint8Array`：`getByteTimeDomainData`（128 = 静音中心）；
 * - `Float32Array`：`getFloatTimeDomainData` / 解码后的 PCM（0 = 静音）。
 *
 * 取**峰值**而非平均值：平均值会把语音抹平成等高柱子，看不出停顿与重音，
 * 而"看到自己刚才唱的那一句的形状"正是录制页要给的反馈。
 */

const isByteData = (samples: ArrayLike<number>): boolean => samples instanceof Uint8Array;

/** 单个样点的电平（0..1）。 */
function sampleLevel(samples: ArrayLike<number>, index: number): number {
  const value = samples[index] ?? 0;
  if (!Number.isFinite(value)) return 0;
  if (isByteData(samples)) return Math.min(1, Math.abs(value - 128) / 128);
  return Math.min(1, Math.abs(value));
}

/** 峰值电平（0..1）：输入音量指示与单帧波形都用它。 */
export function peakLevel(samples: ArrayLike<number>): number {
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const level = sampleLevel(samples, index);
    if (level > peak) peak = level;
  }
  return peak;
}

/** 压成 `bars` 根柱子（每桶取峰值，0..1）；采样点不足时补零，不重复数据。 */
export function downsampleLevels(samples: ArrayLike<number>, bars: number): number[] {
  if (!Number.isInteger(bars) || bars <= 0) return [];
  const levels: number[] = [];
  const total = samples.length;
  // 样本比柱子少（解析度不足）：一柱一样点，不足补零 —— 不重复数据充数
  if (total <= bars) {
    for (let bar = 0; bar < bars; bar += 1) {
      levels.push(bar < total ? sampleLevel(samples, bar) : 0);
    }
    return levels;
  }
  for (let bar = 0; bar < bars; bar += 1) {
    const start = Math.floor((bar * total) / bars);
    const end = Math.floor(((bar + 1) * total) / bars);
    let peak = 0;
    for (let index = start; index < end; index += 1) {
      const level = sampleLevel(samples, index);
      if (level > peak) peak = level;
    }
    levels.push(peak);
  }
  return levels;
}

/** 按最大值归一（录完之后的静态波形）：小声录音也能看出形状；全零不除零。 */
export function normalizeLevels(levels: readonly number[]): number[] {
  let peak = 0;
  for (const level of levels) {
    if (Number.isFinite(level) && level > peak) peak = level;
  }
  if (peak <= 0) return levels.map(() => 0);
  return levels.map((level) => (Number.isFinite(level) ? Math.max(0, level) / peak : 0));
}
