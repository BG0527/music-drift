/**
 * `useMixExport`：阶段一成品导出（纯人声拼接 → WAV → 可播放/可下载）。
 *
 * ## 流程
 *
 * ```text
 * plan(MixPlan)                     ← 规划层（@music-drift/shared/audio）
 *   ├─ 对每个 voice 段：GET /api/segments/:id/audio（Range 端点）→ decodeAudioData
 *   ├─ 混音（默认 OfflineAudioContext / D-05；无 AudioContext 时降级到纯 PCM 混音）
 *   ├─ 实测每段起拍 → summarizeAlignment（阈值 120ms）
 *   └─ 编码 WAV → Blob → objectURL（<audio> 试听 + <a download> 下载）
 * ```
 *
 * ## 三条"不许静默成功"的纪律
 *
 * 1. **缺口静音要被验证**：`findNonSilentGaps` 若发现缺口位置有声音，作为警告上报（成品可疑）；
 * 2. **计划里是人声却没拿到音频** → `missingAudioIndexes` 如实上报；
 * 3. **失败必须有具体原因**：取字节失败 vs 解码失败分开报，都带上"哪一段"。
 *
 * 资源纪律：objectURL 在 reset / 卸载 / 重新导出时都要 `revokeObjectURL`，否则 90 秒 WAV 会在
 * 内存里堆着不放（每份 ≈ 8.6MB）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  describeMissingSegments,
  mixSummaryLabel,
  summarizeAlignment,
  type AlignmentReport,
  type MixPlan,
} from '@music-drift/shared/audio';
import {
  encodeWavPcm16,
  findNonSilentGaps,
  measureClipOnsets,
  mixPcm,
  renderOfflineMix,
  type AudioBufferLike,
  type MixedPcm,
  type OfflineAudioContextLike,
} from './mix-render';

export type MixExportPhase =
  'idle' | 'preparing' | 'decoding' | 'mixing' | 'encoding' | 'done' | 'failed';

export interface MixExportProgress {
  done: number;
  total: number;
}

/** 渲染器输出：与 `MixedPcm` 同形（缺哪几段音频也一并带出）。 */
export type MixRenderResult = Pick<MixedPcm, 'channels' | 'sampleRate' | 'missingAudioIndexes'>;

export interface MixExportEnvironment {
  fetchBytes: (url: string) => Promise<ArrayBuffer>;
  decode: (bytes: ArrayBuffer) => Promise<AudioBufferLike>;
  /** 混音实现（默认 OfflineAudioContext 路径；不可用时自动降级）。 */
  render: (input: {
    plan: MixPlan;
    buffers: ReadonlyMap<number, AudioBufferLike>;
  }) => Promise<MixRenderResult>;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
}

export interface UseMixExportOptions {
  plan: MixPlan;
  /** 覆盖任意端口（测试用；生产只用默认实现）。 */
  environment?: Partial<MixExportEnvironment>;
  /** 覆盖文件名（默认按 plan 生成，带缺口标注）。 */
  fileName?: string;
  onPhase?: (phase: MixExportPhase, progress: MixExportProgress) => void;
}

export interface UseMixExportResult {
  phase: MixExportPhase;
  progress: MixExportProgress;
  canExport: boolean;
  objectUrl: string | null;
  fileName: string;
  blob: Blob | null;
  alignment: AlignmentReport | null;
  /** **问题**清单（计划警告 + 运行期警告，中文，可直接展示）。 */
  warnings: string[];
  /** 成品摘要（如「4 段完整（纯人声）」/「缺第 2 段 · 有效 3 / 4 段（纯人声）」）；不是警告。 */
  summary: string;
  missingAudioIndexes: number[];
  nonSilentGaps: number[];
  error: string | null;
  start: () => Promise<void>;
  reset: () => void;
}

/** 默认文件名：`漂流瓶成品-4段-缺第2段.wav`（不完整绝不写成"完整"）。 */
export function buildMixFileName(plan: MixPlan): string {
  const missing = describeMissingSegments(plan.missingSegmentIndexes);
  const state = missing === null ? '完整' : missing.replace(/\s+/g, '');
  return `漂流瓶成品-${String(plan.clips.length)}段-${state}.wav`;
}

function defaultFetchBytes(url: string): Promise<ArrayBuffer> {
  return fetch(url, { credentials: 'same-origin' }).then((response) => {
    if (!response.ok) {
      throw new Error(`取音频失败（HTTP ${String(response.status)}）`);
    }
    return response.arrayBuffer();
  });
}

type OfflineContextCtor = new (
  channels: number,
  frames: number,
  sampleRate: number,
) => OfflineAudioContextLike;

interface AudioGlobals {
  OfflineAudioContext?: OfflineContextCtor;
  /** Safari 早期版本的前缀实现。 */
  webkitOfflineAudioContext?: OfflineContextCtor;
}

/**
 * **调用时**解析（不在模块加载时缓存）：SSR / 测试环境下加载模块时可能还没有这些构造器，
 * 缓存 null 会让后来具备能力的页面永远走降级路径。
 */
function resolveOfflineContextCtor(): OfflineContextCtor | null {
  const globals = globalThis as unknown as AudioGlobals;
  return globals.OfflineAudioContext ?? globals.webkitOfflineAudioContext ?? null;
}

function defaultDecode(bytes: ArrayBuffer): Promise<AudioBufferLike> {
  const Ctor = (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext;
  if (typeof Ctor !== 'function') {
    throw new Error('这个浏览器没有提供音频解码能力（OfflineAudioContext 不可用）。');
  }
  const context = new (
    Ctor as new (
      channels: number,
      frames: number,
      sampleRate: number,
    ) => {
      decodeAudioData: (data: ArrayBuffer) => Promise<AudioBufferLike>;
    }
  )(1, 1, 48_000);
  return context.decodeAudioData(bytes);
}

/**
 * 默认渲染器：优先 `OfflineAudioContext`（D-05）；没有该能力时**降级为纯 PCM 混音**。
 * 两条路径消费同一条 `MixPlan`，输出格式一致（WAV/PCM16），因此降级不会改变成品语义。
 */
async function defaultRender(input: {
  plan: MixPlan;
  buffers: ReadonlyMap<number, AudioBufferLike>;
}): Promise<MixRenderResult> {
  const Ctor = resolveOfflineContextCtor();
  if (Ctor !== null) {
    const rendered = await renderOfflineMix({
      plan: input.plan,
      buffers: input.buffers,
      createContext: (channels, frames, sampleRate) => new Ctor(channels, frames, sampleRate),
    });
    return {
      channels: Array.from({ length: rendered.numberOfChannels }, (_value, channel) =>
        Float32Array.from(rendered.getChannelData(channel)),
      ),
      sampleRate: rendered.sampleRate,
      missingAudioIndexes: [],
    };
  }

  const clips = [...input.buffers.entries()].map(([index, buffer]) => ({
    index,
    channels: Array.from({ length: buffer.numberOfChannels }, (_value, channel) =>
      Float32Array.from(buffer.getChannelData(channel)),
    ),
  }));
  const mixed = mixPcm(input.plan, clips);
  return {
    channels: mixed.channels,
    sampleRate: mixed.sampleRate,
    missingAudioIndexes: mixed.missingAudioIndexes,
  };
}

export function useMixExport(options: UseMixExportOptions): UseMixExportResult {
  const { plan } = options;
  const [phase, setPhase] = useState<MixExportPhase>('idle');
  const [progress, setProgress] = useState<MixExportProgress>({ done: 0, total: 0 });
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [alignment, setAlignment] = useState<AlignmentReport | null>(null);
  const [runtimeWarnings, setRuntimeWarnings] = useState<string[]>([]);
  const [missingAudioIndexes, setMissingAudioIndexes] = useState<number[]>([]);
  const [nonSilentGaps, setNonSilentGaps] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const urlRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const environmentRef = useRef(options.environment);
  const onPhaseRef = useRef(options.onPhase);

  useEffect(() => {
    environmentRef.current = options.environment;
  }, [options.environment]);
  useEffect(() => {
    onPhaseRef.current = options.onPhase;
  }, [options.onPhase]);

  const releaseUrl = useCallback((): void => {
    const url = urlRef.current;
    if (url === null) return;
    const revoke = environmentRef.current?.revokeObjectURL ?? URL.revokeObjectURL;
    revoke(url);
    urlRef.current = null;
  }, []);

  useEffect(() => () => releaseUrl(), [releaseUrl]);

  const voiceClipCount = plan.clips.filter((clip) => clip.kind === 'voice').length;
  const canExport = voiceClipCount > 0;

  const start = useCallback(async (): Promise<void> => {
    if (!canExport || runningRef.current) return;
    runningRef.current = true;
    releaseUrl();

    const environment = environmentRef.current ?? {};
    const fetchBytes = environment.fetchBytes ?? defaultFetchBytes;
    const decode = environment.decode ?? defaultDecode;
    const render = environment.render ?? defaultRender;
    const createObjectURL = environment.createObjectURL ?? URL.createObjectURL;
    const report = (next: MixExportPhase, nextProgress: MixExportProgress): void => {
      setPhase(next);
      setProgress(nextProgress);
      onPhaseRef.current?.(next, nextProgress);
    };

    setObjectUrl(null);
    setBlob(null);
    setAlignment(null);
    setRuntimeWarnings([]);
    setMissingAudioIndexes([]);
    setNonSilentGaps([]);
    setError(null);

    const total = voiceClipCount;
    report('preparing', { done: 0, total });

    try {
      const buffers = new Map<number, AudioBufferLike>();
      let done = 0;
      for (const clip of plan.clips) {
        if (clip.kind !== 'voice') continue;
        const url = clip.audioUrl ?? null;
        if (url === null) continue;
        let bytes: ArrayBuffer;
        try {
          bytes = await fetchBytes(url);
        } catch (thrown) {
          throw new Error(
            `取第 ${String(clip.index)} 段的音频失败：${thrown instanceof Error ? thrown.message : '未知错误'}`,
            { cause: thrown },
          );
        }
        try {
          buffers.set(clip.index, await decode(bytes));
        } catch {
          throw new Error(
            `第 ${String(clip.index)} 段的音频解码失败（文件可能损坏或格式不受支持）。`,
          );
        }
        done += 1;
        report('decoding', { done, total });
      }

      report('mixing', { done: total, total });
      const rendered = await render({ plan, buffers });

      report('encoding', { done: total, total });
      const wav = encodeWavPcm16({ sampleRate: rendered.sampleRate, channels: rendered.channels });
      const nextBlob = new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' });

      const pcm: MixedPcm = {
        sampleRate: rendered.sampleRate,
        channels: rendered.channels.map((channel) => Float32Array.from(channel)),
        frames: Math.min(...rendered.channels.map((channel) => channel.length), plan.totalFrames),
        missingAudioIndexes: rendered.missingAudioIndexes,
      };
      const measurements = measureClipOnsets({ pcm, plan });
      const gaps = findNonSilentGaps({ pcm, plan });

      setAlignment(summarizeAlignment(measurements));
      setMissingAudioIndexes(rendered.missingAudioIndexes);
      setNonSilentGaps(gaps);

      const warnings: string[] = [];
      if (gaps.length > 0) {
        warnings.push(
          `缺口位置（第 ${gaps.join('、')} 段）本该是静音，但检测到声音，成品可能错位。`,
        );
      }
      if (rendered.missingAudioIndexes.length > 0) {
        warnings.push(
          `第 ${rendered.missingAudioIndexes.join('、')} 段没有取到音频，成品里这几段是静音。`,
        );
      }
      setRuntimeWarnings(warnings);

      const url = createObjectURL(nextBlob);
      urlRef.current = url;
      setObjectUrl(url);
      setBlob(nextBlob);
      report('done', { done: total, total });
    } catch (thrown) {
      releaseUrl();
      setError(thrown instanceof Error ? thrown.message : '导出失败，请重试。');
      report('failed', { done: 0, total });
    } finally {
      runningRef.current = false;
    }
  }, [canExport, plan, releaseUrl, voiceClipCount]);

  const reset = useCallback((): void => {
    releaseUrl();
    setObjectUrl(null);
    setBlob(null);
    setAlignment(null);
    setRuntimeWarnings([]);
    setMissingAudioIndexes([]);
    setNonSilentGaps([]);
    setError(null);
    setPhase('idle');
    setProgress({ done: 0, total: 0 });
  }, [releaseUrl]);

  return {
    phase,
    progress,
    canExport,
    objectUrl,
    fileName: options.fileName ?? buildMixFileName(plan),
    blob,
    alignment,
    // 只放"问题"：摘要（如「4 段完整（纯人声）」）不是警告，
    // 混进 warnings 会让界面把好消息渲染进 warning 语义色里（测试抓到过这个 bug）
    warnings: [...plan.warnings.map((warning) => warning.message), ...runtimeWarnings].filter(
      (warning, index, all) => all.indexOf(warning) === index,
    ),
    summary: mixSummaryLabel(plan),
    missingAudioIndexes,
    nonSilentGaps,
    error,
    start,
    reset,
  };
}
