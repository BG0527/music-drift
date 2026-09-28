/**
 * `useMixExport` 单测：把"计划 → 取音频 → 混音 → WAV 成品 → 可播放/可下载 URL + 对齐报告"串起来。
 *
 * 全部依赖走注入端口（取字节 / 解码 / 混音器 / objectURL），因此不需要真浏览器与真 Web Audio：
 * - 产品路径默认是 `OfflineAudioContext`（D-05），测试注入等价渲染器；
 * - 没有 AudioContext 的环境会自动降级到纯 PCM 混音（同一条计划、同一份输出格式）。
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  planAccompaniedMix,
  planMonoSequentialMix,
  type MixPlan,
  type MixSourceSegment,
} from '@music-drift/shared/audio';
import { mixPcm, type AudioBufferLike } from './mix-render';
import { useMixExport, type MixExportEnvironment } from './use-mix-export';

const SAMPLE_RATE = 8_000;

function plan(segments: MixSourceSegment[], totalSegments = 4): MixPlan {
  return planMonoSequentialMix({ segments, totalSegments, sampleRate: SAMPLE_RATE });
}

/** 常量电平的假解码结果（值 = 段号/10）。 */
function buffer(index: number, frames: number): AudioBufferLike {
  return {
    numberOfChannels: 1,
    length: frames,
    sampleRate: SAMPLE_RATE,
    duration: frames / SAMPLE_RATE,
    getChannelData: () => Float32Array.from({ length: frames }, () => index / 10),
  };
}

function constantClip(index: number, frames: number): { index: number; channels: Float32Array[] } {
  return {
    index,
    channels: [Float32Array.from({ length: frames }, () => index / 10)],
  };
}

interface Harness {
  environment: Partial<MixExportEnvironment>;
  fetched: string[];
  revoked: string[];
  created: number;
}

function harness(overrides: Partial<MixExportEnvironment> = {}): Harness {
  const fetched: string[] = [];
  const revoked: string[] = [];
  const state = { created: 0 };
  const environment: Partial<MixExportEnvironment> = {
    fetchBytes: async (url: string) => {
      fetched.push(url);
      return new ArrayBuffer(8);
    },
    decode: async (bytes: ArrayBuffer) => buffer(Number(bytes.byteLength), 8_000),
    createObjectURL: () => {
      state.created += 1;
      return `blob:mock-${String(state.created)}`;
    },
    revokeObjectURL: (url: string) => {
      revoked.push(url);
    },
    ...overrides,
  };
  return {
    environment,
    fetched,
    revoked,
    get created() {
      return state.created;
    },
  } as Harness;
}

const THREE_SEGMENTS: MixSourceSegment[] = [
  { index: 1, durationMs: 1_000, audioUrl: '/api/segments/a/audio' },
  { index: 3, durationMs: 1_000, audioUrl: '/api/segments/c/audio' },
  { index: 4, durationMs: 1_000, audioUrl: '/api/segments/d/audio' },
];

/** 用纯 PCM 混音器充当渲染器（模拟一个"渲染结果可预测"的 OfflineAudioContext 路径）。 */
function pcmRenderer(clips: readonly { index: number; channels: Float32Array[] }[]) {
  return async ({ plan: mixPlan }: { plan: MixPlan }) => {
    const mixed = mixPcm(mixPlan, clips);
    return {
      channels: mixed.channels,
      sampleRate: mixed.sampleRate,
      missingAudioIndexes: mixed.missingAudioIndexes,
    };
  };
}

const FULL_RENDER = pcmRenderer([
  constantClip(1, 8_000),
  constantClip(3, 8_000),
  constantClip(4, 8_000),
]);

describe('useMixExport：成功路径', () => {
  it('尚无录音时仍可试听伴奏，未录段不会被请求', async () => {
    const accompanied = planAccompaniedMix({
      segments: [],
      totalSegments: 2,
      missingSegmentIndexes: [1, 2],
      nominalDurationByIndex: { 1: 1_000, 2: 1_000 },
      accompanimentUrl: '/library/accompaniment.mp3',
      sampleRate: SAMPLE_RATE,
    });
    const h = harness({
      render: async ({ plan: mixPlan, accompaniment }) => {
        const mixed = mixPcm(mixPlan, [], {
          ...(accompaniment === null
            ? {}
            : { accompaniment: [accompaniment.getChannelData(0)] }),
        });
        return mixed;
      },
    });
    const { result } = renderHook(() =>
      useMixExport({ plan: accompanied, environment: h.environment }),
    );

    expect(result.current.canExport).toBe(true);
    await act(async () => {
      await result.current.start();
    });

    expect(h.fetched).toEqual(['/library/accompaniment.mp3']);
    expect(result.current.phase).toBe('done');
  });

  it('完整试听先解码伴奏，并把它与服务端可见人声一起交给渲染器', async () => {
    let receivedAccompaniment: AudioBufferLike | null | undefined;
    const accompanied = planAccompaniedMix({
      segments: [{ index: 1, durationMs: 1_000, audioUrl: '/api/segments/a/audio' }],
      totalSegments: 2,
      missingSegmentIndexes: [2],
      nominalDurationByIndex: { 1: 1_000, 2: 1_000 },
      accompanimentUrl: '/library/accompaniment.mp3',
      sampleRate: SAMPLE_RATE,
    });
    const h = harness({
      render: async ({ plan: mixPlan, buffers, accompaniment }) => {
        receivedAccompaniment = accompaniment;
        const mixed = mixPcm(
          mixPlan,
          [...buffers.entries()].map(([index, item]) => ({
            index,
            channels: [item.getChannelData(0)],
          })),
          {
            ...(accompaniment === null
              ? {}
              : { accompaniment: [accompaniment.getChannelData(0)] }),
          },
        );
        return mixed;
      },
    });
    const { result } = renderHook(() =>
      useMixExport({ plan: accompanied, environment: h.environment }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(h.fetched).toEqual(['/library/accompaniment.mp3', '/api/segments/a/audio']);
    expect(receivedAccompaniment).not.toBeNull();
    expect(result.current.phase).toBe('done');
    expect(result.current.alignment).toBeNull();
  });

  it('只取有效段的音频（缺口不请求），产出可播放的 objectURL 与文件名', async () => {
    const h = harness({ render: FULL_RENDER });
    const { result } = renderHook(() =>
      useMixExport({ plan: plan(THREE_SEGMENTS), environment: h.environment }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(h.fetched).toEqual([
      '/api/segments/a/audio',
      '/api/segments/c/audio',
      '/api/segments/d/audio',
    ]);
    expect(result.current.phase).toBe('done');
    expect(result.current.objectUrl).toBe('blob:mock-1');
    expect(result.current.fileName).toBe('漂流瓶成品-4段-缺第2段.wav');
    expect(result.current.blob?.type).toBe('audio/wav');
  });

  it('完整作品的文件名不带缺口标注', async () => {
    const h = harness({ render: pcmRenderer([constantClip(1, 8_000), constantClip(2, 8_000)]) });
    const { result } = renderHook(() =>
      useMixExport({
        plan: plan(
          [
            { index: 1, durationMs: 1_000, audioUrl: '/a' },
            { index: 2, durationMs: 1_000, audioUrl: '/b' },
          ],
          2,
        ),
        environment: h.environment,
      }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.fileName).toBe('漂流瓶成品-2段-完整.wav');
  });

  it('产出对齐报告（实测起拍误差，D-05 阈值内）', async () => {
    const h = harness({ render: FULL_RENDER });
    const { result } = renderHook(() =>
      useMixExport({ plan: plan(THREE_SEGMENTS), environment: h.environment }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.alignment?.toleranceMs).toBe(120);
    expect(result.current.alignment?.withinTolerance).toBe(true);
    expect(result.current.alignment?.measurements).toHaveLength(3);
    expect(result.current.alignment?.maxAbsErrorMs).toBe(0);
  });

  it('上报进度（准备 → 解码 ×3 → 混音 → 编码 → 完成）', async () => {
    const h = harness({ render: FULL_RENDER });
    const phases: string[] = [];
    const done: number[] = [];
    const { result } = renderHook(() =>
      useMixExport({
        plan: plan(THREE_SEGMENTS),
        environment: h.environment,
        onPhase: (phase, progress) => {
          phases.push(phase);
          done.push(progress.done);
        },
      }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(phases).toContain('decoding');
    expect(phases).toContain('mixing');
    expect(phases).toContain('encoding');
    expect(phases.at(-1)).toBe('done');
    expect(Math.max(...done)).toBe(3);
  });

  it('成品 WAV 里缺口段的位置是静音（不是被后面的段顶替）', async () => {
    const h = harness({ render: FULL_RENDER });
    const mixPlan = plan(THREE_SEGMENTS);
    const { result } = renderHook(() =>
      useMixExport({ plan: mixPlan, environment: h.environment }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.nonSilentGaps).toEqual([]);
    const wav = new Uint8Array(await result.current.blob!.arrayBuffer());
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    const sampleAt = (frame: number): number => view.getInt16(44 + frame * 2, true);

    // 位置直接取自 plan（不靠手算，避免测试自己的算术错误掩盖真实问题）
    const [first, gap, third] = mixPlan.clips;
    expect(sampleAt(first!.startFrame + 100)).toBeGreaterThan(0);
    expect(sampleAt(gap!.startFrame + 100)).toBe(0);
    expect(sampleAt(gap!.startFrame + gap!.durationFrame - 100)).toBe(0);
    expect(sampleAt(third!.startFrame + 100)).toBeGreaterThan(0);
    // 缺口时长与"本该多长"一致（= 已录段时长中位数 1000ms）
    expect(gap!.durationMs).toBe(1_000);
  });
});

describe('useMixExport：失败与告警（不许静默成功）', () => {
  it('取音频失败 → phase=failed + 中文文案，且不产出 objectURL', async () => {
    const h = harness({
      fetchBytes: async () => {
        throw new Error('network down');
      },
    });
    const { result } = renderHook(() =>
      useMixExport({ plan: plan(THREE_SEGMENTS), environment: h.environment }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.phase).toBe('failed');
    expect(result.current.error).toContain('音频');
    expect(result.current.objectUrl).toBeNull();
  });

  it('解码失败 → 明确说明是解码问题（而不是笼统"导出失败"）', async () => {
    const h = harness({
      decode: async () => {
        throw new Error('decode error');
      },
    });
    const { result } = renderHook(() =>
      useMixExport({ plan: plan(THREE_SEGMENTS), environment: h.environment }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.phase).toBe('failed');
    expect(result.current.error).toContain('解码');
  });

  it('计划里是人声但取不到音频地址 → 如实报出缺哪几段（不假装导出成功）', async () => {
    const h = harness({ render: pcmRenderer([constantClip(1, 8_000)]) });
    const { result } = renderHook(() =>
      useMixExport({
        plan: plan(
          [
            { index: 1, durationMs: 1_000, audioUrl: '/a' },
            { index: 2, durationMs: 1_000, audioUrl: null },
          ],
          2,
        ),
        environment: h.environment,
      }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.missingAudioIndexes).toEqual([2]);
    expect(result.current.warnings.some((warning) => warning.includes('第 2 段'))).toBe(true);
  });

  it('缺口位置意外有声音 → 报出该段号（防止"看似完整但错位"的成品）', async () => {
    const h = harness({
      render: async () => ({
        channels: [Float32Array.from({ length: 16_000 }, () => 0.5)],
        sampleRate: SAMPLE_RATE,
        missingAudioIndexes: [],
      }),
    });
    const { result } = renderHook(() =>
      useMixExport({ plan: plan(THREE_SEGMENTS), environment: h.environment }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.nonSilentGaps).toEqual([2]);
    expect(result.current.warnings.some((warning) => warning.includes('静音'))).toBe(true);
  });

  it('没有任何有效段时不允许导出（界面就该拦住，而不是点完再报错）', async () => {
    const h = harness();
    const { result } = renderHook(() =>
      useMixExport({ plan: plan([]), environment: h.environment }),
    );

    expect(result.current.canExport).toBe(false);
    await act(async () => {
      await result.current.start();
    });
    expect(h.fetched).toEqual([]);
    expect(result.current.phase).toBe('idle');
  });
});

describe('useMixExport：资源释放', () => {
  it('reset 释放 objectURL（避免 blob 泄漏）', async () => {
    const h = harness({ render: FULL_RENDER });
    const { result } = renderHook(() =>
      useMixExport({ plan: plan(THREE_SEGMENTS), environment: h.environment }),
    );
    await act(async () => {
      await result.current.start();
    });

    act(() => {
      result.current.reset();
    });

    expect(h.revoked).toEqual(['blob:mock-1']);
    expect(result.current.objectUrl).toBeNull();
    expect(result.current.phase).toBe('idle');
  });

  it('卸载时也释放 objectURL', async () => {
    const h = harness({ render: FULL_RENDER });
    const { result, unmount } = renderHook(() =>
      useMixExport({ plan: plan(THREE_SEGMENTS), environment: h.environment }),
    );
    await act(async () => {
      await result.current.start();
    });

    unmount();

    expect(h.revoked).toEqual(['blob:mock-1']);
  });

  it('重复导出：先释放上一份，不留下孤儿 URL', async () => {
    const h = harness({ render: FULL_RENDER });
    const { result } = renderHook(() =>
      useMixExport({ plan: plan(THREE_SEGMENTS), environment: h.environment }),
    );

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.start();
    });

    expect(h.revoked).toEqual(['blob:mock-1']);
    expect(result.current.objectUrl).toBe('blob:mock-2');
  });
});
