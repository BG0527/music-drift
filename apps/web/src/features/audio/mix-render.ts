/**
 * 混音**渲染层**（阶段一：纯人声）+ WAV 成品导出 + 对齐误差测量。
 *
 * ## 两条渲染路径，各有分工
 *
 * | 路径 | 用途 | 为什么需要 |
 * | --- | --- | --- |
 * | `renderOfflineMix`（`OfflineAudioContext`） | **产品路径**（D-05 裁决：浏览器端混音） | 交给浏览器的音频引擎做重采样与混音，最快、最省内存 |
 * | `mixPcm`（纯 Float32 运算） | 可测性与**对齐测量** | Web Audio 在 node 里不存在；把"逐样本拼接"写成纯函数后，顺序/缺口/整数帧这些**能算的结论全都能断言**，而且它本身也是合法的浏览器端降级路径（不需要 AudioContext 也能拼） |
 *
 * 两者共用同一份 `MixPlan`（`@music-drift/shared/audio` 的规划层），因此不会出现
 * "计划说在 1500ms，渲染放在别处"这类漂移。
 *
 * ## 为什么成品是 WAV
 *
 * 导出需要**确定性**：`MediaRecorder` 只能实时录制（90 秒成品要等 90 秒），
 * WebCodecs 的 Opus 编码在各浏览器支持度不一。WAV/PCM16 用纯 JS 就能写，样本可逐字节回读校验
 * （测试里就是这么验的）。代价是体积：单声道 48kHz 16bit ≈ 96KB/秒（90 秒 ≈ 8.6MB）。
 * 阶段二若要压体积，可在同一 `MixedPcm` 之上换编码器，不影响本文件的结构。
 *
 * ## 对齐（D-05 客观验收：段落起拍误差 ≤ 120ms）
 *
 * `measureClipOnsets` 在渲染结果上**测**每段起拍位置并与计划对比；
 * `summarizeAlignment`（规划层）做阈值判定。测得的数据进 `docs/mix-report.md`。
 */
import type { AlignmentMeasurement, MixClip, MixPlan } from '@music-drift/shared/audio';

/** 起拍探测阈值（|样本| > 该值视为"这一段开始了"）；远高于 16-bit 量化噪声（≈3e-5）。 */
export const PROBE_ALIGNMENT_THRESHOLD = 1e-3;

/**
 * 起拍搜索窗口（ms）：**只向前**找这么多。
 *
 * 为什么不向后找：向后搜索会把**前一段的尾音**当成下一段的起拍（第一版就是这么写的，
 * 结果把"晚 40ms"的段读成"早 250ms"—— 误差方向都被读反了，这种误读会掩盖真实的解码延迟）。
 * 而音频源可能存在的偏差（前导静音 / 解码器 priming 延迟）**只会让起拍后移**，所以只向前找即可。
 */
export const PROBE_FORWARD_SEARCH_MS = 250;

export interface PcmClipInput {
  index: number;
  /** 每个声道的样本。 */
  channels: Float32Array[];
}

export interface MixedPcm {
  sampleRate: number;
  channels: Float32Array[];
  frames: number;
  /** 计划里标为人声、但调用方没给音频的段号（如实报出，不假装成功）。 */
  missingAudioIndexes: number[];
}

export interface AudioBufferLike {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  getChannelData: (channel: number) => Float32Array;
}

export interface AudioBufferSourceNodeLike {
  buffer: AudioBufferLike | null;
  connect: (destination: unknown) => void;
  start: (when?: number) => void;
}

export interface OfflineAudioContextLike {
  createBufferSource: () => AudioBufferSourceNodeLike;
  destination: unknown;
  startRendering: () => Promise<AudioBufferLike>;
}

export interface MixPcmOptions {
  /** 输出声道数；缺省 = 各段声道的最大值（至少 1）。 */
  channels?: number;
}

/**
 * 纯 Float32 混音：按 `plan.clips` 把人声**复制**到各自的时间槽。
 *
 * 复制而不是相加：计划保证段与段首尾相接、互不重叠，因此不存在叠加；
 * 复制语义还能让"某段的值只出现在自己的区间里"成为可断言的性质（防止错位拼接）。
 */
export function mixPcm(
  plan: MixPlan,
  clips: readonly PcmClipInput[],
  options: MixPcmOptions = {},
): MixedPcm {
  const byIndex = new Map(clips.map((clip) => [clip.index, clip]));
  const maxSourceChannels = clips.reduce((max, clip) => Math.max(max, clip.channels.length), 0);
  const channels = Math.max(1, options.channels ?? maxSourceChannels);
  const frames = plan.totalFrames;

  const output = Array.from({ length: channels }, () => new Float32Array(frames));
  const missingAudioIndexes: number[] = [];

  for (const clip of plan.clips) {
    if (clip.kind === 'voice') {
      const source = byIndex.get(clip.index);
      if (source === undefined || source.channels.length === 0) {
        missingAudioIndexes.push(clip.index);
        continue;
      }
      for (let channel = 0; channel < channels; channel += 1) {
        // 单声道源 → 所有输出声道；多声道源 → 按声道对齐，缺的声道用第一个源声道
        const sourceChannel = source.channels[channel] ?? source.channels[0];
        if (sourceChannel === undefined) continue;
        const target = output[channel];
        if (target === undefined) continue;
        const copyFrames = Math.min(clip.durationFrame, sourceChannel.length);
        target.set(sourceChannel.subarray(0, copyFrames), clip.startFrame);
      }
      // 缺口：什么都不写（静音占位）
    }
  }

  return { sampleRate: plan.sampleRate, channels: output, frames, missingAudioIndexes };
}

/**
 * 测量每段人声的**实测起拍位置**（帧 → ms），与计划起点比较。
 *
 * 找不到起拍（窗口内全静音）时 `measuredStartMs = null`、`errorMs = +∞` ——
 * 这是"错的"，不是"没数据"，因此会在 `summarizeAlignment` 里被判为违规。
 */
export function measureClipOnsets(input: {
  pcm: MixedPcm;
  plan: MixPlan;
  threshold?: number;
  forwardSearchMs?: number;
}): AlignmentMeasurement[] {
  const threshold = input.threshold ?? PROBE_ALIGNMENT_THRESHOLD;
  const forwardFrames = Math.round(
    ((input.forwardSearchMs ?? PROBE_FORWARD_SEARCH_MS) / 1000) * input.pcm.sampleRate,
  );

  return input.plan.clips.map((clip) => {
    const expectedStartMs = clip.startMs;
    if (clip.kind === 'gap') {
      return { index: clip.index, kind: 'gap', expectedStartMs, measuredStartMs: null, errorMs: 0 };
    }
    const measuredFrame = findOnsetFrame(input.pcm, clip, threshold, forwardFrames);
    if (measuredFrame === null) {
      return {
        index: clip.index,
        kind: 'voice',
        expectedStartMs,
        measuredStartMs: null,
        errorMs: Number.POSITIVE_INFINITY,
      };
    }
    const measuredStartMs = (measuredFrame / input.pcm.sampleRate) * 1000;
    return {
      index: clip.index,
      kind: 'voice',
      expectedStartMs,
      measuredStartMs,
      errorMs: measuredStartMs - expectedStartMs,
    };
  });
}

function findOnsetFrame(
  pcm: MixedPcm,
  clip: MixClip,
  threshold: number,
  forwardFrames: number,
): number | null {
  // 只向前：从计划起点开始，在"本段时间槽 + 一个前向窗口"内找第一个非静音帧
  const from = Math.max(0, clip.startFrame);
  const to = Math.min(pcm.frames, clip.startFrame + clip.durationFrame + forwardFrames);
  for (let frame = from; frame < to; frame += 1) {
    for (const channel of pcm.channels) {
      if (Math.abs(channel[frame] ?? 0) > threshold) return frame;
    }
  }
  return null;
}

/** 缺口区间里出现了声音的段号（非空 = 成品有"看似完整但错位"的风险，必须报警）。 */
export function findNonSilentGaps(input: {
  pcm: MixedPcm;
  plan: MixPlan;
  threshold?: number;
}): number[] {
  const threshold = input.threshold ?? PROBE_ALIGNMENT_THRESHOLD;
  const offenders: number[] = [];
  for (const clip of input.plan.clips) {
    if (clip.kind !== 'gap') continue;
    const to = Math.min(input.pcm.frames, clip.startFrame + clip.durationFrame);
    let loud = false;
    for (let frame = clip.startFrame; frame < to && !loud; frame += 1) {
      for (const channel of input.pcm.channels) {
        if (Math.abs(channel[frame] ?? 0) > threshold) {
          loud = true;
          break;
        }
      }
    }
    if (loud) offenders.push(clip.index);
  }
  return offenders;
}

/**
 * 浏览器端渲染路径（D-05）：按计划把人声段调度到 `OfflineAudioContext` 的精确时间点上。
 *
 * - 上下文长度来自 `plan.totalFrames`（不靠猜、不依赖元素时长）；
 * - **缺口段不调度任何源** —— 它本来就是静音；
 * - 没有音频的段不调度（宁可成品里是缺口，也不静默错位）；
 * - 返回渲染结果，上层负责编码/下载（见 `useMixExport`）。
 */
export async function renderOfflineMix(input: {
  plan: MixPlan;
  buffers: ReadonlyMap<number, AudioBufferLike>;
  createContext: (channels: number, frames: number, sampleRate: number) => OfflineAudioContextLike;
}): Promise<AudioBufferLike> {
  const channels = Math.max(
    1,
    ...[...input.buffers.values()].map((buffer) => buffer.numberOfChannels),
  );
  const context = input.createContext(channels, input.plan.totalFrames, input.plan.sampleRate);

  for (const clip of input.plan.clips) {
    if (clip.kind !== 'voice') continue;
    const buffer = input.buffers.get(clip.index);
    if (buffer === undefined) continue;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(clip.startMs / 1000);
  }

  return context.startRendering();
}

/** 从 Range 端点取字节并解码成 PCM（端口注入 → 测试不需要真浏览器）。 */
export async function fetchClipPcm(
  plan: MixPlan,
  ports: {
    fetchBytes: (url: string) => Promise<ArrayBuffer>;
    decode: (bytes: ArrayBuffer) => Promise<AudioBufferLike>;
  },
): Promise<PcmClipInput[]> {
  const clips: PcmClipInput[] = [];
  for (const clip of plan.clips) {
    if (clip.kind !== 'voice' || clip.audioUrl === null || clip.audioUrl === undefined) continue;
    const bytes = await ports.fetchBytes(clip.audioUrl);
    const buffer = await ports.decode(bytes);
    clips.push({
      index: clip.index,
      channels: Array.from({ length: buffer.numberOfChannels }, (_value, channel) =>
        Float32Array.from(buffer.getChannelData(channel)),
      ),
    });
  }
  return clips;
}

/** 把混音结果编成 16-bit PCM 的 WAV（RIFF 头 + 交错样本）。 */
export function encodeWavPcm16(input: {
  sampleRate: number;
  channels: readonly Float32Array[];
}): Uint8Array {
  const channels = input.channels.length === 0 ? [new Float32Array(0)] : input.channels;
  const channelCount = channels.length;
  const frames = Math.min(...channels.map((channel) => channel.length));
  const bytesPerSample = 2;
  const dataBytes = frames * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const writeAscii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      bytes[offset + index] = text.charCodeAt(index);
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk 长度
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channelCount, true);
  view.setUint32(24, input.sampleRate, true);
  view.setUint32(28, input.sampleRate * channelCount * bytesPerSample, true); // byteRate
  view.setUint16(32, channelCount * bytesPerSample, true); // blockAlign
  view.setUint16(34, 16, true); // 位深
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = channels[channel]?.[frame] ?? 0;
      // 按 32768 缩放再限幅到 [-32768, 32767]：这样 -1 → -32768、+1 → 32767，
      // 且 0.5 → 16384（往返误差为 0，而不是 1/32767 的倍数偏差）
      const scaled = Math.round(Math.max(-1, Math.min(1, sample)) * 32_768);
      view.setInt16(offset, Math.max(-32_768, Math.min(32_767, scaled)), true);
      offset += bytesPerSample;
    }
  }

  return bytes;
}

/** WAV Blob（`<audio src>` 与 `<a download>` 都用它）。 */
export function wavBlob(input: { sampleRate: number; channels: readonly Float32Array[] }): Blob {
  return new Blob([encodeWavPcm16(input).buffer as ArrayBuffer], { type: 'audio/wav' });
}
