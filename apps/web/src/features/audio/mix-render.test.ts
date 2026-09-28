/**
 * 混音**渲染层**单测（阶段一：纯人声）。
 *
 * 分两条路径，各有各的用处：
 * 1. `mixPcm`：**纯 Float32 运算**（不依赖 Web Audio）—— 可在 node 里逐样本断言，
 *    因此"顺序 / 无重复 / 缺口静音 / 落在整数帧上"这些能算的结论**全部在这里测**；
 * 2. `renderOfflineMix`：浏览器端 `OfflineAudioContext` 路径（D-05 裁决），
 *    用假上下文断言**调度参数**（每段 `start()` 的秒数、缺口段不调度、只调度一次）。
 *
 * 对齐误差实测（D-05 客观验收 ≤120ms）另见文件末尾：用**合成信号**做真实测量，
 * 并把「模拟解码器延迟」的三种情形（0 / 40 / 150ms）逐一刻画 —— 120ms 阈值是**测出来的**，不是声称的。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  planAccompaniedMix,
  planMonoSequentialMix,
  summarizeAlignment,
  type MixPlan,
  type MixSourceSegment,
} from '@music-drift/shared/audio';
import {
  PROBE_ALIGNMENT_THRESHOLD,
  PROBE_FORWARD_SEARCH_MS,
  encodeWavPcm16,
  fetchClipPcm,
  mixPcm,
  renderOfflineMix,
  wavBlob,
  measureClipOnsets,
  findNonSilentGaps,
  type AudioBufferLike,
  type OfflineAudioContextLike,
  type PcmClipInput,
} from './mix-render';

const SAMPLE_RATE = 8_000; // 小采样率让"帧 ↔ 毫秒"手算得清楚（1 帧 = 0.125ms）

describe('mixPcm：完整试听保留伴奏', () => {
  it('未录时间槽只保留伴奏，全部已有录音都会叠加', () => {
    const mixPlan = planAccompaniedMix({
      segments: [
        { index: 1, durationMs: 1_000, audioUrl: '/api/segments/a/audio' },
        { index: 3, durationMs: 1_000, audioUrl: '/api/segments/c/audio' },
      ],
      totalSegments: 3,
      missingSegmentIndexes: [2],
      nominalDurationByIndex: { 1: 1_000, 2: 1_000, 3: 1_000 },
      accompanimentUrl: '/library/accompaniment.mp3',
      sampleRate: SAMPLE_RATE,
    });
    const accompaniment = [Float32Array.from({ length: 24_000 }, () => 0.2)];

    const mixed = mixPcm(mixPlan, [clip(1, 8_000, 0.3), clip(3, 8_000, 0.4)], {
      accompaniment,
    });

    expect(mixed.channels[0]?.[0]).toBeCloseTo(0.5);
    expect(mixed.channels[0]?.[8_000]).toBeCloseTo(0.2);
    expect(mixed.channels[0]?.[16_000]).toBeCloseTo(0.6);
  });
});

function plan(segments: MixSourceSegment[], totalSegments = 4): MixPlan {
  return planMonoSequentialMix({ segments, totalSegments, sampleRate: SAMPLE_RATE });
}

/** 常量电平的假音频（值 = 段号 / 10），便于"哪一段在响"一眼可辨。 */
function clip(index: number, frames: number, value = index / 10, channels = 1): PcmClipInput {
  return {
    index,
    channels: Array.from({ length: channels }, () =>
      Float32Array.from({ length: frames }, () => value),
    ),
  };
}

describe('mixPcm：按计划把人声拼到整数帧上', () => {
  it('顺序 = 段号升序；每段恰好占据自己的时长；缺口位置是静音', () => {
    const mixPlan = plan([
      { index: 1, durationMs: 1_000 },
      { index: 3, durationMs: 500 },
      { index: 4, durationMs: 250 },
    ]);

    const mixed = mixPcm(mixPlan, [clip(1, 8_000), clip(3, 4_000), clip(4, 2_000)]);
    const channel = mixed.channels[0]!;

    // 段1(1000ms=8000f) + 缺口2(中位数 500ms=4000f) + 段3(500ms=4000f) + 段4(250ms=2000f) = 18000
    expect(mixed.frames).toBe(8_000 + 4_000 + 4_000 + 2_000);
    expect(mixed.sampleRate).toBe(SAMPLE_RATE);

    // 第 1 段：0..7999 为 0.1
    expect(channel[0]).toBeCloseTo(0.1, 6);
    expect(channel[7_999]).toBeCloseTo(0.1, 6);
    // 缺口（第 2 段，500ms = 4000 帧）：8000..11999 全静音
    for (let frame = 8_000; frame < 12_000; frame += 1) {
      expect(channel[frame]).toBe(0);
    }
    // 第 3 段：12000..15999 为 0.3（**没有前移**）
    expect(channel[12_000]).toBeCloseTo(0.3, 6);
    // 第 4 段：16000..17999 为 0.4
    expect(channel[16_000]).toBeCloseTo(0.4, 6);
    // 第 3 段的值绝不会出现在缺口位置（防止"把第 3 段当成第 2 段"）
    expect(channel[8_000]).not.toBeCloseTo(0.3, 6);
  });

  it('每段只出现一次（无重复段）', () => {
    const mixPlan = plan([
      { index: 1, durationMs: 500 },
      { index: 2, durationMs: 500 },
      { index: 3, durationMs: 500 },
      { index: 4, durationMs: 500 },
    ]);

    const mixed = mixPcm(mixPlan, [clip(1, 4_000), clip(2, 4_000), clip(3, 4_000), clip(4, 4_000)]);
    const channel = mixed.channels[0]!;

    for (const [index, expected] of [
      [1, 0.1],
      [2, 0.2],
      [3, 0.3],
      [4, 0.4],
    ] as const) {
      const start = (index - 1) * 4_000;
      const end = start + 4_000;
      let matches = 0;
      for (let frame = 0; frame < channel.length; frame += 1) {
        if (Math.abs(channel[frame]! - expected) < 1e-6 && frame >= start && frame < end)
          matches += 1;
      }
      expect(matches).toBe(4_000);
      // 该段的值不会出现在别人的区间里
      expect(channel[end] === undefined || Math.abs(channel[end]! - expected) > 1e-6).toBe(true);
    }
  });

  it('单声道源 → 多声道输出时复制到每个声道', () => {
    const mixPlan = plan([{ index: 1, durationMs: 1_000 }], 1);

    const mixed = mixPcm(mixPlan, [clip(1, 8_000)], { channels: 2 });

    expect(mixed.channels).toHaveLength(2);
    expect(mixed.channels[0]![10]).toBeCloseTo(mixed.channels[1]![10]!, 6);
  });

  it('立体声源保持左右差异（不做无脑混单声道）', () => {
    const mixPlan = plan([{ index: 1, durationMs: 250 }], 1);
    const stereo: PcmClipInput = {
      index: 1,
      channels: [
        Float32Array.from({ length: 2_000 }, () => 0.25),
        Float32Array.from({ length: 2_000 }, () => -0.5),
      ],
    };

    const mixed = mixPcm(mixPlan, [stereo]);

    expect(mixed.channels).toHaveLength(2);
    expect(mixed.channels[0]![100]).toBeCloseTo(0.25, 6);
    expect(mixed.channels[1]![100]).toBeCloseTo(-0.5, 6);
  });

  it('计划里是人声但没给音频 → 该区间静音，并**如实报出**缺哪几段', () => {
    const mixPlan = plan([
      { index: 1, durationMs: 500 },
      { index: 2, durationMs: 500 },
    ]);

    const mixed = mixPcm(mixPlan, [clip(1, 4_000)]);

    expect(mixed.missingAudioIndexes).toEqual([2]);
    expect(mixed.channels[0]![5_000]).toBe(0);
  });

  it('段比计划短时只填实际长度，其余留静音（不重复填充、不拉伸）', () => {
    const mixPlan = plan([{ index: 1, durationMs: 1_000 }], 1);

    const mixed = mixPcm(mixPlan, [clip(1, 2_000)]);

    expect(mixed.channels[0]![1_999]).toBeCloseTo(0.1, 6);
    expect(mixed.channels[0]![2_000]).toBe(0);
    expect(mixed.frames).toBe(8_000);
  });
});

describe('measureClipOnsets / findNonSilentGaps：把"对齐"与"缺口是静音"变成数字', () => {
  it('起拍位置精确落在计划起点 → 误差 0ms', () => {
    const mixPlan = plan([
      { index: 1, durationMs: 1_000 },
      { index: 3, durationMs: 1_000 },
    ]);
    const mixed = mixPcm(mixPlan, [clip(1, 8_000), clip(3, 8_000)]);

    const measurements = measureClipOnsets({ pcm: mixed, plan: mixPlan });
    const voice = measurements.filter((measurement) => measurement.kind === 'voice');

    expect(voice.map((measurement) => measurement.errorMs)).toEqual([0, 0]);
    // 缺口条目也在结果里（报告要展示"缺口：静音占位，不参与对齐判定"）
    expect(measurements.filter((measurement) => measurement.kind === 'gap')).toHaveLength(2);
  });

  it('模拟解码器延迟：整段音频晚 40ms → 实测误差 +40ms（D-05 阈值内）', () => {
    const mixPlan = plan([
      { index: 1, durationMs: 1_000 },
      { index: 2, durationMs: 1_000 },
    ]);
    const delayFrames = 320; // 40ms @8kHz
    const delayed = Float32Array.from({ length: 8_000 }, (_value, frame) =>
      frame >= delayFrames ? 0.5 : 0,
    );
    const mixed = mixPcm(mixPlan, [
      { index: 1, channels: [delayed] },
      { index: 2, channels: [Float32Array.from({ length: 8_000 }, () => 0.5)] },
    ]);

    const measurements = measureClipOnsets({ pcm: mixed, plan: mixPlan }).filter(
      (measurement) => measurement.kind === 'voice',
    );

    expect(measurements[0]?.errorMs).toBeCloseTo(40, 3);
    expect(measurements[1]?.errorMs).toBe(0);
  });

  it('窗口内找不到起拍 → 记为 +∞（不是"没数据"，而是错的，不能当达标）', () => {
    const mixPlan = plan([{ index: 1, durationMs: 1_000 }], 1);
    const silent = mixPcm(mixPlan, [
      { index: 1, channels: [Float32Array.from({ length: 8_000 }, () => 0)] },
    ]);

    const measurements = measureClipOnsets({ pcm: silent, plan: mixPlan });

    expect(measurements[0]?.measuredStartMs).toBeNull();
    expect(measurements[0]?.errorMs).toBe(Number.POSITIVE_INFINITY);
  });

  it('缺口区间必须真的是静音（否则就是"看似完整但错位"的成品）', () => {
    const mixPlan = plan([
      { index: 1, durationMs: 500 },
      { index: 3, durationMs: 500 },
    ]);
    const clean = mixPcm(mixPlan, [clip(1, 4_000), clip(3, 4_000)]);
    expect(findNonSilentGaps({ pcm: clean, plan: mixPlan })).toEqual([]);

    // 直接构造"缺口位置有声音"的渲染结果（不经 mixPcm，避免为测试在生产代码里留开关）
    const gapClip = mixPlan.clips[1]!;
    const dirtyChannels = [Float32Array.from({ length: mixPlan.totalFrames }, () => 0)];
    dirtyChannels[0]!.fill(0.5, gapClip.startFrame + 4, gapClip.startFrame + 40);
    const dirty = {
      sampleRate: mixPlan.sampleRate,
      channels: dirtyChannels,
      frames: mixPlan.totalFrames,
      missingAudioIndexes: [],
    };

    expect(findNonSilentGaps({ pcm: dirty, plan: mixPlan })).toEqual([2]);
  });

  it('探测阈值与前向窗口是常量（不靠魔法数字，且对量化噪声不敏感）', () => {
    expect(PROBE_ALIGNMENT_THRESHOLD).toBe(1e-3);
    // 只向前 250ms：向后找会把前一段尾音误读成本段起拍（误差方向都会读反）
    expect(PROBE_FORWARD_SEARCH_MS).toBe(250);
  });

  it('前一段的尾音不会被误读成后一段的起拍（只向前探测）', () => {
    const mixPlan = plan([
      { index: 1, durationMs: 1_000 },
      { index: 2, durationMs: 1_000 },
    ]);
    // 第 1 段一直响到自己的时间槽结束，第 2 段第 0 帧就开始响
    const mixed = mixPcm(mixPlan, [
      { index: 1, channels: [Float32Array.from({ length: 8_000 }, () => 0.5)] },
      { index: 2, channels: [Float32Array.from({ length: 8_000 }, () => 0.5)] },
    ]);

    const voice = measureClipOnsets({ pcm: mixed, plan: mixPlan }).filter(
      (measurement) => measurement.kind === 'voice',
    );

    expect(voice.map((measurement) => measurement.errorMs)).toEqual([0, 0]);
  });
});

describe('encodeWavPcm16 / wavBlob：可播放 + 可下载的成品', () => {
  it('RIFF/WAVE 头字段齐全（PCM 16-bit、声道数、采样率、字节率、块对齐）', () => {
    const wav = encodeWavPcm16({
      sampleRate: 44_100,
      channels: [Float32Array.from([0, 0.5, -0.5]), Float32Array.from([0, -0.5, 0.5])],
    });

    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    const ascii = (offset: number, length: number): string =>
      String.fromCharCode(...Array.from({ length }, (_v, i) => wav[offset + i] ?? 0));

    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 4)).toBe('WAVE');
    expect(ascii(12, 4)).toBe('fmt ');
    expect(ascii(36, 4)).toBe('data');
    expect(view.getUint32(16, true)).toBe(16); // PCM
    expect(view.getUint16(20, true)).toBe(1); // 单声道标记（format=1）
    expect(view.getUint16(22, true)).toBe(2); // 2 声道
    expect(view.getUint32(24, true)).toBe(44_100);
    expect(view.getUint32(28, true)).toBe(44_100 * 2 * 2); // byteRate
    expect(view.getUint16(32, true)).toBe(4); // blockAlign = 2ch * 2B
    expect(view.getUint16(34, true)).toBe(16); // 位深
    expect(view.getUint32(40, true)).toBe(3 * 2 * 2); // data 字节数
    expect(wav.byteLength).toBe(44 + 12);
  });

  it('样本按小端交错写入，且 16-bit 往返误差 ≤ 1/32768', () => {
    const values = [0, 0.5, -0.5, 1, -1, 0.123];
    const wav = encodeWavPcm16({
      sampleRate: 48_000,
      channels: [Float32Array.from(values), Float32Array.from(values.map(() => 0))],
    });
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

    values.forEach((value, index) => {
      const sample = view.getInt16(44 + index * 4, true);
      expect(Math.abs(sample / 32_768 - value)).toBeLessThanOrEqual(1 / 32_768 + 1e-9);
    });
  });

  it('超范围样本被限幅（不产生环绕噪声）', () => {
    const wav = encodeWavPcm16({ sampleRate: 48_000, channels: [Float32Array.from([2, -3])] });
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

    expect(view.getInt16(44, true)).toBe(32_767);
    expect(view.getInt16(46, true)).toBe(-32_768);
  });

  it('wavBlob 的 MIME 是 audio/wav（下载与 <audio> 都能识别）', () => {
    const blob = wavBlob({ sampleRate: 48_000, channels: [Float32Array.from([0, 0.1])] });

    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + 4);
  });
});

describe('renderOfflineMix：浏览器端 OfflineAudioContext 调度（D-05 路径）', () => {
  function fakeContext() {
    const starts: Array<[number, number, number | undefined]> = [];
    const buffers: unknown[] = [];
    const context = {
      starts,
      createBufferSource: () => ({
        buffer: null as AudioBufferLike | null,
        connect: vi.fn(),
        start: (when = 0, offset = 0, duration?: number) => {
          starts.push([when, offset, duration]);
        },
      }),
      destination: { id: 'destination' },
      startRendering: async () =>
        ({
          numberOfChannels: 1,
          length: 16_000,
          sampleRate: SAMPLE_RATE,
          duration: 2,
          getChannelData: () => Float32Array.from({ length: 16_000 }, () => 0),
        }) satisfies AudioBufferLike,
    } satisfies OfflineAudioContextLike & {
      starts: Array<[number, number, number | undefined]>;
    };
    return { context, starts, buffers };
  }

  const bufferFor = (index: number): AudioBufferLike => ({
    numberOfChannels: 1,
    length: 4_000,
    sampleRate: SAMPLE_RATE,
    duration: 0.5,
    getChannelData: () => Float32Array.from({ length: 4_000 }, () => index / 10),
  });

  it('每段人声按计划起点调度（秒，精确），缺口段不调度，段只调度一次', async () => {
    const mixPlan = plan([
      { index: 1, durationMs: 1_000 },
      { index: 3, durationMs: 500 },
      { index: 4, durationMs: 250 },
    ]);
    const { context, starts } = fakeContext();

    const rendered = await renderOfflineMix({
      plan: mixPlan,
      buffers: new Map([
        [1, bufferFor(1)],
        [3, bufferFor(3)],
        [4, bufferFor(4)],
      ]),
      createContext: () => context,
    });

    // 0ms / 1000+500(缺口)=1500ms / 2000ms
    expect(starts).toEqual([
      [0, 0, 1],
      [1.5, 0, 0.5],
      [2, 0, 0.25],
    ]);
    expect(rendered.length).toBe(16_000);
  });

  it('缺音频的段不调度（宁可有缺口，也不静默错位）', async () => {
    const mixPlan = plan([
      { index: 1, durationMs: 1_000 },
      { index: 2, durationMs: 1_000 },
    ]);
    const { context, starts } = fakeContext();

    await renderOfflineMix({
      plan: mixPlan,
      buffers: new Map([[1, bufferFor(1)]]),
      createContext: () => context,
    });

    expect(starts).toEqual([[0, 0, 1]]);
  });

  it('按计划的声道数与总帧数创建上下文（长度来自 plan，不靠猜）', async () => {
    const mixPlan = plan([{ index: 1, durationMs: 1_000 }], 1);
    const calls: Array<[number, number, number]> = [];

    await renderOfflineMix({
      plan: mixPlan,
      buffers: new Map([[1, bufferFor(1)]]),
      createContext: (channels, frames, sampleRate) => {
        calls.push([channels, frames, sampleRate]);
        return fakeContext().context;
      },
    });

    expect(calls).toEqual([[1, 8_000, SAMPLE_RATE]]);
  });
});

describe('fetchClipPcm：从 Range 端点取字节并解码（端口注入，测试无需真浏览器）', () => {
  it('对每个有效段调用一次取字节 + 解码，缺口段不取', async () => {
    const mixPlan = plan([
      { index: 1, durationMs: 1_000, audioUrl: '/api/segments/a/audio' },
      { index: 3, durationMs: 1_000, audioUrl: '/api/segments/c/audio' },
    ]);
    const fetched: string[] = [];
    const decoded: number[] = [];

    const clips = await fetchClipPcm(mixPlan, {
      fetchBytes: async (url) => {
        fetched.push(url);
        return new ArrayBuffer(8);
      },
      decode: async (bytes) => {
        decoded.push(bytes.byteLength);
        return {
          numberOfChannels: 1,
          length: 8_000,
          sampleRate: SAMPLE_RATE,
          duration: 1,
          getChannelData: () => Float32Array.from({ length: 8_000 }, () => 0.2),
        };
      },
    });

    expect(fetched).toEqual(['/api/segments/a/audio', '/api/segments/c/audio']);
    expect(decoded).toEqual([8, 8]);
    expect(clips.map((clip) => clip.index)).toEqual([1, 3]);
    expect(clips[0]?.channels[0]?.length).toBe(8_000);
  });

  it('段没有音频地址时跳过（不请求 /api/segments/null/audio）', async () => {
    const mixPlan = plan([{ index: 1, durationMs: 1_000, audioUrl: null }], 1);

    const clips = await fetchClipPcm(mixPlan, {
      fetchBytes: async () => {
        throw new Error('不应该被调用');
      },
      decode: async () => {
        throw new Error('不应该被调用');
      },
    });

    expect(clips).toEqual([]);
  });
});

/**
 * 对齐误差**实测报告**（t8 验收要求）。
 *
 * 这里是真实测量：合成 4 段 × 22.5 秒（48kHz 单声道）、按计划混音、逐样本测起拍位置，
 * 再用规划层的 `summarizeAlignment` 按 D-05 的 120ms 阈值判定。
 *
 * 三种情形：
 * 1. **本实现的数学上限**（段音频从第 0 帧开始响）：误差应恒为 0；
 * 2. **模拟 40ms 解码器延迟**（AAC/mp4 的 priming 与 padding 会造成这类前导静音）：仍在阈值内；
 * 3. **模拟 150ms 延迟**（大缓冲或异常客户端）：超阈值 → 报告列出违规段，作为"是否提案 ffmpeg"的依据。
 */
describe('对齐误差实测（合成信号，4 段 × 22.5s @48kHz）', () => {
  const RATE = 48_000;
  const SEGMENT_MS = 22_500;
  const SEGMENT_FRAMES = (SEGMENT_MS / 1000) * RATE; // 1_080_000

  function measure(label: string, delayMs: number, missingIndex = 4) {
    const sources: MixSourceSegment[] = [1, 2, 3, 4]
      .filter((index) => index !== missingIndex)
      .map((index) => ({ index, durationMs: SEGMENT_MS }));
    const mixPlan = planMonoSequentialMix({
      segments: sources,
      totalSegments: 4,
      sampleRate: RATE,
    });

    const delayFrames = Math.round((delayMs / 1000) * RATE);
    const clips = sources.map(({ index }) => ({
      index,
      channels: [
        Float32Array.from({ length: SEGMENT_FRAMES }, (_value, frame) =>
          frame < delayFrames ? 0 : 0.35,
        ),
      ],
    }));

    const started = performance.now();
    const mixed = mixPcm(mixPlan, clips);
    const mixingMs = performance.now() - started;
    const report = summarizeAlignment(measureClipOnsets({ pcm: mixed, plan: mixPlan }));
    const gaps = findNonSilentGaps({ pcm: mixed, plan: mixPlan });

    console.warn(
      `[mix-report] ${label}: 总帧 ${String(mixed.frames)} / ${String((mixPlan.totalMs / 1000).toFixed(1))}s` +
        ` · 段数 ${String(mixPlan.clips.length)}（缺口 ${mixPlan.missingSegmentIndexes.join(',') || '无'}）` +
        ` · 最大误差 ${report.maxAbsErrorMs.toFixed(3)}ms · 平均 ${report.meanAbsErrorMs.toFixed(3)}ms` +
        ` · 阈值 ${String(report.toleranceMs)}ms · ${report.withinTolerance ? '达标' : '未达标'}` +
        ` · 非静音缺口 [${gaps.join(',')}] · 纯 JS 混音耗时 ${mixingMs.toFixed(1)}ms`,
    );

    return { mixed, report };
  }

  it('情形 1：本实现（段从第 0 帧起响）—— 起拍误差 0ms，完整达标', () => {
    const { report } = measure('无延迟', 0);

    expect(report.maxAbsErrorMs).toBe(0);
    expect(report.withinTolerance).toBe(true);
  });

  it('情形 2：模拟 40ms 解码器延迟 —— 实测 40ms，仍在 120ms 阈值内', () => {
    const { report } = measure('模拟 40ms 解码延迟', 40);

    expect(report.maxAbsErrorMs).toBeCloseTo(40, 3);
    expect(report.withinTolerance).toBe(true);
  });

  it('情形 3：模拟 150ms 延迟 —— 超阈值，且列出违规段', () => {
    const { report } = measure('模拟 150ms 延迟', 150);

    expect(report.withinTolerance).toBe(false);
    expect(report.violations).toHaveLength(3);
    expect(report.maxAbsErrorMs).toBeCloseTo(150, 3);
  });
});
