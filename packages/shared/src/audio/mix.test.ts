/**
 * 混音**规划层**单测（阶段一：纯人声、按歌里固定段号拼接）。
 *
 * 这些测试钉的是 ADR-015 / §16.6 的硬语义，全是"错了会毁掉成品"的那几条：
 * 1. **段号永不压缩**：`[1,3,4]` 必须拼成「1 → 静音(第2段) → 3 → 4」，
 *    **绝不**把第 3 段放成第 2 段的位置（否则阶段二接回伴奏时会整体错位）；
 * 2. **缺口必须显式**：`missingSegmentIndexes` + 静音占位 + 可读标注，
 *    严禁"默默拼出一个看似完整"的成品；
 * 3. **顺序 = 段号升序**，与输入顺序无关；**无重复段**（重复段号是脏数据，要报出来）；
 * 4. **采样网格上无漂移**：每段落在整数帧上，且相邻段首尾相接（不留缝、不重叠）；
 * 5. **策略可替换**：阶段二换 `MixPlanner` 即可，调用方一行不用改。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAP_PLACEHOLDER_MS,
  MIX_ALIGNMENT_TOLERANCE_MS,
  MONO_SEQUENTIAL_STRATEGY,
  describeMissingSegments,
  mixSummaryLabel,
  planMix,
  planMonoSequentialMix,
  summarizeAlignment,
  type MixPlanner,
  type MixSourceSegment,
} from './mix';

const SAMPLE_RATE = 48_000;

function segment(index: number, durationMs = 20_000): MixSourceSegment {
  return {
    index,
    durationMs,
    audioUrl: `/api/segments/seg-${index}/audio`,
    ownerCode: `匿名#${index}`,
  };
}

function plan(segments: MixSourceSegment[], totalSegments = 4) {
  return planMonoSequentialMix({ segments, totalSegments, sampleRate: SAMPLE_RATE });
}

describe('planMonoSequentialMix：段号与顺序', () => {
  it('按段号升序拼接，与输入顺序无关；总时长 = 各段之和', () => {
    const result = plan([
      segment(3, 19_000),
      segment(1, 22_500),
      segment(2, 18_000),
      segment(4, 30_000),
    ]);

    expect(result.clips.map((clip) => clip.index)).toEqual([1, 2, 3, 4]);
    expect(result.clips.map((clip) => clip.kind)).toEqual(['voice', 'voice', 'voice', 'voice']);
    expect(result.totalMs).toBe(89_500);
    expect(result.isComplete).toBe(true);
    expect(result.missingSegmentIndexes).toEqual([]);
  });

  it('每段落在整数帧上，且首尾相接（不留缝、不重叠）', () => {
    const result = plan([
      segment(1, 21_176),
      segment(2, 21_177),
      segment(3, 21_178),
      segment(4, 21_179),
    ]);

    let expectedFrame = 0;
    for (const clip of result.clips) {
      expect(Number.isInteger(clip.startFrame)).toBe(true);
      expect(Number.isInteger(clip.durationFrame)).toBe(true);
      expect(clip.startFrame).toBe(expectedFrame);
      expectedFrame += clip.durationFrame;
    }
    expect(result.totalFrames).toBe(expectedFrame);
  });

  it('毫秒字段是由帧派生的（时间轴唯一真相是帧）', () => {
    const result = plan([segment(1, 22_500)]);

    const first = result.clips[0];
    expect(first?.durationFrame).toBe(22_500 * (SAMPLE_RATE / 1000));
    expect(first?.durationMs).toBe(22_500);
    expect(first?.startMs).toBe(0);
  });

  it('阶段一没有伴奏轨道（不得引入任何自制占位伴奏）', () => {
    const result = plan([segment(1), segment(2), segment(3), segment(4)]);

    expect(result.strategy).toBe(MONO_SEQUENTIAL_STRATEGY);
    expect(result.hasAccompaniment).toBe(false);
    expect(result.sampleRate).toBe(SAMPLE_RATE);
  });
});

describe('planMonoSequentialMix：缺口必须显式（禁止重编号）', () => {
  it('缺第 2 段：位置保留为静音，且段号不压缩（3 不会变成 2）', () => {
    const result = plan([segment(1, 20_000), segment(3, 19_000), segment(4, 21_000)]);

    expect(result.clips.map((clip) => [clip.index, clip.kind])).toEqual([
      [1, 'voice'],
      [2, 'gap'],
      [3, 'voice'],
      [4, 'voice'],
    ]);
    expect(result.missingSegmentIndexes).toEqual([2]);
    expect(result.isComplete).toBe(false);
    // 关键：第 3 段的起点 = 第 1 段时长 + 缺口占位时长（它老老实实待在第 3 段的时间槽里）
    const third = result.clips[2];
    expect(third?.startMs).toBe(20_000 + (result.clips[1]?.durationMs ?? 0));
  });

  it('缺口占位时长优先取歌的分段元数据（nominalDurationByIndex）', () => {
    const result = planMonoSequentialMix({
      segments: [segment(1, 20_000), segment(3, 19_000), segment(4, 21_000)],
      totalSegments: 4,
      sampleRate: SAMPLE_RATE,
      nominalDurationByIndex: { 2: 17_500 },
    });

    expect(result.clips[1]?.durationMs).toBe(17_500);
    expect(result.clips[1]?.durationSource).toBe('NOMINAL');
    expect(result.totalMs).toBe(20_000 + 17_500 + 19_000 + 21_000);
  });

  it('没有元数据时用已录段时长的中位数；一个都没有时用 15–30 秒区间的中值', () => {
    const withSegments = plan([segment(1, 20_000), segment(3, 30_000), segment(4, 22_000)]);
    expect(withSegments.clips[1]?.durationMs).toBe(22_000);
    expect(withSegments.clips[1]?.durationSource).toBe('MEDIAN');

    const nothingValid = planMonoSequentialMix({
      segments: [],
      totalSegments: 4,
      sampleRate: SAMPLE_RATE,
    });
    expect(nothingValid.clips.map((clip) => clip.kind)).toEqual(['gap', 'gap', 'gap', 'gap']);
    expect(nothingValid.clips[0]?.durationMs).toBe(DEFAULT_GAP_PLACEHOLDER_MS);
    expect(DEFAULT_GAP_PLACEHOLDER_MS).toBe(22_500);
  });

  it('多缺口：全部列出且升序', () => {
    const result = plan([segment(1, 20_000), segment(4, 20_000)]);

    expect(result.missingSegmentIndexes).toEqual([2, 3]);
    expect(result.isComplete).toBe(false);
    expect(result.clips.map((clip) => clip.kind)).toEqual(['voice', 'gap', 'gap', 'voice']);
  });

  it('段数来自数据（不硬编码 4）：totalSegments=5 时缺口是 1..5 的补集', () => {
    const result = planMonoSequentialMix({
      segments: [segment(1), segment(5)],
      totalSegments: 5,
      sampleRate: SAMPLE_RATE,
    });

    expect(result.missingSegmentIndexes).toEqual([2, 3, 4]);
    expect(result.clips).toHaveLength(5);
  });
});

describe('planMonoSequentialMix：脏数据要报出来，不能静默处理', () => {
  it('重复段号：报 DUPLICATE_SEGMENT_INDEX，只保留第一个，且不重编号', () => {
    const result = plan([
      segment(1, 20_000),
      segment(2, 18_000),
      segment(2, 19_000),
      segment(4, 20_000),
    ]);

    expect(result.warnings.map((warning) => warning.code)).toContain('DUPLICATE_SEGMENT_INDEX');
    // 缺口 3 的占位时长 = 已录段时长中位数（18000/20000/20000 → 20000），不是"15–30 秒中值"
    expect(result.clips.map((clip) => [clip.index, clip.durationMs, clip.durationSource])).toEqual([
      [1, 20_000, 'MEASURED'],
      [2, 18_000, 'MEASURED'],
      [3, 20_000, 'MEDIAN'],
      [4, 20_000, 'MEASURED'],
    ]);
    expect(result.missingSegmentIndexes).toEqual([3]);
  });

  it('段号越界（<1 或 > totalSegments）：报错并跳过该段，不改变其它段的位置', () => {
    const result = plan([
      segment(1, 20_000),
      segment(7, 10_000),
      segment(0, 10_000),
      segment(2, 20_000),
    ]);

    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'SEGMENT_INDEX_OUT_OF_RANGE',
      'SEGMENT_INDEX_OUT_OF_RANGE',
    ]);
    expect(result.clips.map((clip) => clip.index)).toEqual([1, 2, 3, 4]);
    expect(result.missingSegmentIndexes).toEqual([3, 4]);
  });

  it('时长非法（<=0 / NaN）的段按缺口处理：宁可有缺口，也不拼出错误的时长', () => {
    const result = plan([
      segment(1, 20_000),
      { index: 2, durationMs: Number.NaN, audioUrl: '/api/segments/seg-2/audio' },
      segment(3, 20_000),
      segment(4, 20_000),
    ]);

    expect(result.warnings.map((warning) => warning.code)).toContain('SEGMENT_DURATION_INVALID');
    expect(result.clips[1]?.kind).toBe('gap');
    expect(result.missingSegmentIndexes).toEqual([2]);
    expect(result.isComplete).toBe(false);
  });

  it('一段有效都没有：全缺口 + NO_VALID_SEGMENT 警告（不抛异常，界面能显示"还没有人接唱"）', () => {
    const result = planMonoSequentialMix({
      segments: [],
      totalSegments: 4,
      sampleRate: SAMPLE_RATE,
    });

    expect(result.warnings.map((warning) => warning.code)).toContain('NO_VALID_SEGMENT');
    expect(result.isComplete).toBe(false);
    expect(result.missingSegmentIndexes).toEqual([1, 2, 3, 4]);
  });
});

describe('阶段二依赖的两个不变式（clip.index 将来要驱动伴奏时间槽）', () => {
  /*
   * 为什么现在就钉（阶段一它还是"信息性"的）：
   * 阶段一按帧顺序首尾相接，clip.index 变不变都不影响成品；
   * **阶段二用 index 映射到伴奏的固定时间槽**，一旦有人让 index 与被拼的顺序解耦
   * （例如"过滤掉缺口后按顺序重新编号"），阶段一的成品听不出差别，阶段二会整条时间轴错位
   * —— 这正是 §15.1 问题 2 的同一个机制。所以在这里把两条不变式钉死。
   */
  it('不变式 A：clips[i].index === i + 1（1..N 每个段号恰好产出一个 clip，缺口也占位）', () => {
    for (const [segments, total] of [
      [[1, 2, 3, 4], 4],
      [[1, 3, 4], 4],
      [[2], 4],
      [[1, 5], 5],
      [[], 4],
    ] as Array<[number[], number]>) {
      const result = planMonoSequentialMix({
        segments: segments.map((index) => ({ index, durationMs: 20_000 })),
        totalSegments: total,
        sampleRate: SAMPLE_RATE,
      });
      result.clips.forEach((clip, position) => {
        expect(clip.index).toBe(position + 1);
      });
      expect(result.clips).toHaveLength(total);
    }
  });

  it('不变式 B：人声 clip 的段号 = 该音频源段的段号（不是"第几个被拼进去"）', () => {
    const result = planMonoSequentialMix({
      segments: [
        { index: 2, durationMs: 20_000, audioUrl: '/api/segments/b/audio' },
        { index: 5, durationMs: 20_000, audioUrl: '/api/segments/e/audio' },
      ],
      totalSegments: 5,
      sampleRate: SAMPLE_RATE,
    });

    const voice = result.clips.filter((clip) => clip.kind === 'voice');
    expect(voice.map((clip) => clip.index)).toEqual([2, 5]);
    expect(voice.map((clip) => clip.audioUrl)).toEqual([
      '/api/segments/b/audio',
      '/api/segments/e/audio',
    ]);
    // 若有人改成"过滤后按顺序编号"，这里会变成 [1, 2] → 立即红
    expect(voice.map((clip) => clip.index)).not.toEqual([1, 2]);
  });
});

describe('拼接策略可替换（阶段二只换实现，不重写调用方）', () => {
  it('planMix 接受任意 MixPlanner：阶段二的"伴奏时间轴"策略可以原样替换', () => {
    const accompanimentTimeline: MixPlanner = (input) => ({
      strategy: 'ACCOMPANIMENT_TIMELINE',
      sampleRate: input.sampleRate ?? SAMPLE_RATE,
      clips: [
        {
          index: 1,
          kind: 'voice',
          startFrame: 0,
          durationFrame: 48_000,
          startMs: 0,
          durationMs: 1_000,
          durationSource: 'MEASURED',
        },
      ],
      totalFrames: 48_000,
      totalMs: 1_000,
      missingSegmentIndexes: [2, 3, 4],
      isComplete: false,
      hasAccompaniment: true,
      warnings: [],
    });

    const result = planMix(accompanimentTimeline, {
      segments: [segment(1)],
      totalSegments: 4,
      sampleRate: SAMPLE_RATE,
    });

    expect(result.strategy).toBe('ACCOMPANIMENT_TIMELINE');
    expect(result.hasAccompaniment).toBe(true);
    expect(result.clips).toHaveLength(1);
  });

  it('planMix 默认策略 = 阶段一纯人声拼接', () => {
    const result = planMix(planMonoSequentialMix, {
      segments: [segment(1)],
      totalSegments: 4,
      sampleRate: SAMPLE_RATE,
    });

    expect(result.strategy).toBe(MONO_SEQUENTIAL_STRATEGY);
  });
});

describe('缺口标注与摘要文案', () => {
  it('describeMissingSegments：可读的中文标注（界面与下载文件名都用它）', () => {
    expect(describeMissingSegments([])).toBeNull();
    expect(describeMissingSegments([2])).toBe('缺第 2 段');
    expect(describeMissingSegments([2, 4])).toBe('缺第 2、4 段');
    expect(describeMissingSegments([1, 2, 3])).toBe('缺第 1、2、3 段');
  });

  it('mixSummaryLabel：完整与不完整两种口径都不得撒谎', () => {
    const complete = plan([segment(1), segment(2), segment(3), segment(4)]);
    expect(mixSummaryLabel(complete)).toBe('4 段完整（纯人声）');

    const incomplete = plan([segment(1), segment(3), segment(4)]);
    expect(mixSummaryLabel(incomplete)).toBe('缺第 2 段 · 有效 3 / 4 段（纯人声）');
  });
});

describe('对齐误差汇总（D-05 客观验收：段落起拍对齐误差 ≤ 120ms）', () => {
  it('阈值是 120ms', () => {
    expect(MIX_ALIGNMENT_TOLERANCE_MS).toBe(120);
  });

  it('全部在阈值内 → withinTolerance=true，并给出最大/平均误差', () => {
    const report = summarizeAlignment([
      { index: 1, kind: 'voice', expectedStartMs: 0, measuredStartMs: 0.02, errorMs: 0.02 },
      { index: 2, kind: 'voice', expectedStartMs: 20_000, measuredStartMs: 20_040, errorMs: 40 },
      { index: 3, kind: 'voice', expectedStartMs: 40_000, measuredStartMs: 39_950, errorMs: -50 },
    ]);

    expect(report.withinTolerance).toBe(true);
    expect(report.maxAbsErrorMs).toBe(50);
    expect(report.meanAbsErrorMs).toBeCloseTo((0.02 + 40 + 50) / 3, 6);
    expect(report.violations).toEqual([]);
  });

  it('超过 120ms → withinTolerance=false，并列出违规段（供"是否提案 ffmpeg"的依据）', () => {
    const report = summarizeAlignment([
      { index: 1, kind: 'voice', expectedStartMs: 0, measuredStartMs: 130, errorMs: 130 },
      { index: 2, kind: 'voice', expectedStartMs: 20_000, measuredStartMs: 20_010, errorMs: 10 },
      { index: 3, kind: 'voice', expectedStartMs: 40_000, measuredStartMs: 39_700, errorMs: -300 },
    ]);

    expect(report.withinTolerance).toBe(false);
    expect(report.violations.map((measurement) => measurement.index)).toEqual([1, 3]);
    expect(report.maxAbsErrorMs).toBe(300);
  });

  it('缺口段不参与对齐判定（它是静音占位，没有"起拍"）', () => {
    const report = summarizeAlignment([
      { index: 1, kind: 'voice', expectedStartMs: 0, measuredStartMs: 0, errorMs: 0 },
      { index: 2, kind: 'gap', expectedStartMs: 20_000, measuredStartMs: null, errorMs: 0 },
    ]);

    expect(report.measurements).toHaveLength(1);
    expect(report.withinTolerance).toBe(true);
  });

  it('没有可测段落 → 不谎报达标（withinTolerance=false，等第 0 条）', () => {
    const report = summarizeAlignment([]);

    expect(report.measurements).toEqual([]);
    expect(report.withinTolerance).toBe(false);
    expect(report.maxAbsErrorMs).toBe(0);
    expect(report.unmeasurableIndexes).toEqual([]);
  });

  it('起拍测不到（errorMs=+∞）→ 出现在 violations 与 unmeasurableIndexes 里，不静默消失', () => {
    const report = summarizeAlignment([
      {
        index: 1,
        kind: 'voice',
        expectedStartMs: 0,
        measuredStartMs: null,
        errorMs: Number.POSITIVE_INFINITY,
      },
      { index: 2, kind: 'voice', expectedStartMs: 20_000, measuredStartMs: 20_000, errorMs: 0 },
    ]);

    expect(report.withinTolerance).toBe(false);
    expect(report.violations.map((violation) => violation.index)).toEqual([1]);
    expect(report.unmeasurableIndexes).toEqual([1]);
    // 有限误差的最大值照常统计（不因为有个 ∞ 就毁掉数字）
    expect(report.maxAbsErrorMs).toBe(0);
  });
});
