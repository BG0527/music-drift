/**
 * 「这一段到底有没有录到声音」的**量化判定**（t40：真实麦克风盲区）。
 *
 * ## 为什么需要它（用户实测的问题）
 *
 * 用户实测："录完之后点试听，也没有声音"。用可控输入复现（`--use-file-for-fake-audio-capture`）后事实很清楚：
 * - 喂 440Hz 正弦（等价"真人在说话"）⇒ 解码峰值 **-4.8 dBFS**、应用自己的波形柱高 58%；
 * - 喂**数字静音**（等价"选错设备 / 系统静音 / 麦克风没声"）⇒ 解码峰值 **-673.8 dBFS**、波形柱高 4%（= 面板的最小柱高）。
 *
 * 两种情况下**试听都能正常播放**（`paused=false, currentTime` 正常推进）、**都没有任何提示**。
 * 也就是说：链路没坏，坏的是"**录到的是静音，而应用一声不吭**"。
 *
 * 所以这里把"有没有声音"变成一个可判定、可展示的量：录完当场量出峰值，低于阈值就明确告诉用户
 * "没录到声音"并给出去查什么 —— 而不是让用户去"点试听、听不出、再怀疑是不是功能没做"。
 *
 * ## 阈值为什么是 -60 dBFS（而不是 -40/-30）
 *
 * - 数字静音实测 ≈ **-674 dBFS**（只有非规格化小量），真实语音（Chrome 默认开 AGC）通常 > **-30 dBFS**；
 * - 阈值取 **-60 dBFS** 是为了**只抓"完全没有信号"**：宁可放过小声但真实的录音，
 *   也不要因为用户说话轻/离麦远就判它"没声音"（误判会逼用户白重录，比不提示更糟）；
 * - 真机上的具体读数由 `docs/audio.md` §11 记录，阈值若要调整必须同步那条记录。
 */

/** 一段录音的实测电平（dBFS；0 表示满刻度）。 */
export interface ClipLevel {
  /** 峰值（dBFS）；全 0 采样时为 `-Infinity`。 */
  peakDbfs: number;
  /** 均方根（dBFS）；全 0 采样时为 `-Infinity`。 */
  rmsDbfs: number;
  /** 解码出的时长（秒）。 */
  durationSeconds: number;
}

/** 判定阈值：峰值低于它即认为"没有录到声音"。理由见文件头。 */
export const SILENT_PEAK_DBFS = -60;

/** 振幅 → dBFS。0（以及负数/NaN）一律 `-Infinity`（不是 -∞ 的近似值，免得看起来像"很小的声音"）。 */
export function toDbfs(amplitude: number): number {
  if (!Number.isFinite(amplitude) || amplitude <= 0) return Number.NEGATIVE_INFINITY;
  return 20 * Math.log10(amplitude);
}

/** 逐样本量峰值与均方根（纯函数，便于测试与复用）。 */
export function measureSamples(samples: Float32Array): { peak: number; rms: number } {
  let peak = 0;
  let sumSquares = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index] ?? 0;
    const abs = Math.abs(value);
    if (abs > peak) peak = abs;
    sumSquares += value * value;
  }
  const rms = samples.length === 0 ? 0 : Math.sqrt(sumSquares / samples.length);
  return { peak, rms };
}

/** 把解码后的采样拼成 `ClipLevel`。 */
export function measureClipLevel(samples: Float32Array, durationSeconds: number): ClipLevel {
  const { peak, rms } = measureSamples(samples);
  return {
    peakDbfs: toDbfs(peak),
    rmsDbfs: toDbfs(rms),
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0,
  };
}

/** 判定的结果：给 UI 直接渲染的文案 + 机器可判的 `status`。 */
export interface ClipVerdict {
  status: 'ok' | 'silent';
  /** 一句话结论（含实测数值，用户能看到"凭什么这么说"）。 */
  message: string;
  /** 没录到声音时给"去查什么"的可执行指引；正常时为 null。 */
  guidance: string | null;
}

/** 峰值展示口径：`-Infinity` 不写成 `-Infinity`（用户看不懂），写成"无信号"。 */
export function formatPeakDbfs(peakDbfs: number): string {
  return Number.isFinite(peakDbfs) ? `${peakDbfs.toFixed(1)} dBFS` : '无信号（−∞ dBFS）';
}

/** 判定这一段有没有录到声音。`fail-open`：数值不可信时按"正常"处理，绝不误拦真实录音。 */
export function judgeClipLevel(level: ClipLevel): ClipVerdict {
  const peak = level.peakDbfs;
  if (!Number.isFinite(peak)) {
    return {
      status: 'silent',
      message: '这一段没有录到声音（完全没有音频信号）。',
      guidance:
        '先看录制时的波形有没有动，再检查系统输入设备是否选对、麦克风是否被静音或静音键按下，然后重录。',
    };
  }
  if (peak < SILENT_PEAK_DBFS) {
    return {
      status: 'silent',
      message: `这一段几乎没有录到声音（峰值 ${formatPeakDbfs(peak)}，低于 ${String(SILENT_PEAK_DBFS)} dBFS）。`,
      guidance:
        '先看录制时的波形有没有动，再检查系统输入设备是否选对、麦克风是否被静音，然后重录。',
    };
  }
  return {
    status: 'ok',
    message: `本段录到了声音（峰值 ${formatPeakDbfs(peak)}）。`,
    guidance: null,
  };
}
