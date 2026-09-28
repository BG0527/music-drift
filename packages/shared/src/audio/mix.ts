/**
 * 混音**规划层**（纯逻辑，无 DOM / 无 Web Audio / 无 IO）——阶段一：纯人声拼接。
 *
 * ## 为什么规划与渲染分开
 *
 * 「按什么顺序、放在哪个时间槽、缺哪一段」是**产品语义**，与"用 OfflineAudioContext 还是别的手段
 * 把样本加起来"是两件事。分开之后：
 * - 阶段二（叠加伴奏 + 按固定时间轴对齐）**只换 `MixPlanner`**，调用方一行不改；
 * - 规划层可以逐条单测（段号、缺口、时长来源、脏数据），不必启动浏览器。
 *
 * ## 三条硬语义（错了会毁掉成品）
 *
 * 1. **段号 = 歌里的固定位置（1..totalSegments），永不压缩、永不重编号**（ADR-015 §16.1）。
 *    缺第 2 段时，第 3 段**仍然**待在第 3 段的时间槽里 —— 位置保留为静音占位。
 *    若把第 3 段前移占据第 2 段的位置，阶段二接回伴奏时整条时间轴都会错位（§15.1 问题 2）。
 * 2. **缺口必须显式**：`missingSegmentIndexes` + 静音占位 + 可读标注（`describeMissingSegments`），
 *    **严禁**静默拼出一个"看似完整"的成品（§16.6）。
 * 3. **时间轴唯一真相是帧（frame）**，不是毫秒：`startFrame` / `durationFrame` 是整数，
 *    且相邻段首尾相接（`startFrame[i+1] === startFrame[i] + durationFrame[i]`），
 *    因此既不留缝也不重叠、也不会跨段累积漂移。毫秒字段由帧派生，仅供展示。
 *
 * ## 阶段一的输出形态
 *
 * 纯人声成品 = 按段号升序把人声首尾相接，缺口处留等长静音。**没有任何伴奏轨道**
 * （用户 2026-09-23 裁决：曲库最后提供，阶段一禁止用自制素材占位伴奏）。
 */

/** D-05 客观验收阈值：段落起拍对齐误差必须 ≤ 120ms。 */
export const MIX_ALIGNMENT_TOLERANCE_MS = 120;

/** 缺口静音占位的兜底时长：15–30 秒区间的中值（无元数据、也无任何已录段时使用）。 */
export const DEFAULT_GAP_PLACEHOLDER_MS = 22_500;

/** 阶段一策略标识（写进 `MixPlan.strategy`，便于报告与排查）。 */
export const MONO_SEQUENTIAL_STRATEGY = 'MONO_SEQUENTIAL';

export const DEFAULT_MIX_SAMPLE_RATE = 48_000;

/** 段在成品里的角色：人声段 / 缺口（静音占位）。 */
export type MixClipKind = 'voice' | 'gap';

/** 完整试听里每个固定时间槽的可见状态。 */
export type MixClipAvailability = 'RECORDED' | 'UNRECORDED' | 'LOCKED';

/** 缺口占位时长的来源（写进 plan，便于报告说明"这个时长是怎么来的"）。 */
export type GapDurationSource = 'NOMINAL' | 'MEDIAN' | 'DEFAULT' | 'MEASURED';

export interface MixSourceSegment {
  /** 歌里的固定段落位置（1..totalSegments）。 */
  index: number;
  /** 该段实际音频时长（服务端 `durationMs`）。 */
  durationMs: number;
  /** 音频地址（取字节用）；可为空（规划不依赖它）。 */
  audioUrl?: string | null;
  /** 该段在本瓶子里的匿名代号（展示用）。 */
  ownerCode?: string | null;
}

export interface MixClip {
  /** 段号（**原样保留**，不因缺口而重编号）。 */
  index: number;
  kind: MixClipKind;
  /** 在成品里的起始帧（整数，含 0）。 */
  startFrame: number;
  /** 时长帧（整数，> 0）。 */
  durationFrame: number;
  /** 由帧派生：`startFrame / sampleRate * 1000`。 */
  startMs: number;
  /** 由帧派生：`durationFrame / sampleRate * 1000`。 */
  durationMs: number;
  durationSource: GapDurationSource;
  audioUrl?: string | null;
  ownerCode?: string | null;
  /** `LOCKED` 的段不得携带音频地址，也不得由客户端请求。 */
  availability?: MixClipAvailability;
}

export type MixWarningCode =
  | 'DUPLICATE_SEGMENT_INDEX'
  | 'SEGMENT_INDEX_OUT_OF_RANGE'
  | 'SEGMENT_DURATION_INVALID'
  | 'NO_VALID_SEGMENT';

export interface MixWarning {
  code: MixWarningCode;
  message: string;
}

export interface MixPlan {
  /** 使用的拼接策略（阶段一 = `MONO_SEQUENTIAL`）。 */
  strategy: string;
  sampleRate: number;
  clips: MixClip[];
  totalFrames: number;
  totalMs: number;
  /** 缺口段号（升序）；空数组 = 作品完整。 */
  missingSegmentIndexes: number[];
  isComplete: boolean;
  /** 是否含伴奏轨道。阶段一恒为 false。 */
  hasAccompaniment: boolean;
  /** 静态曲库伴奏；存在时贯穿所有时间槽，缺口不再是整段静音。 */
  accompanimentUrl?: string | null;
  /** 没有人声、但仍播放伴奏的真实缺口。 */
  unrecordedSegmentIndexes?: number[];
  /** 已有人声但当前观看者尚无权试听的后续段。 */
  lockedSegmentIndexes?: number[];
  warnings: MixWarning[];
}

export interface AccompaniedMixPlanInput extends MixPlanInput {
  /** 由详情投影返回的真实缺口；与不可见的已录段不是一回事。 */
  missingSegmentIndexes: readonly number[];
  /** 被服务端裁掉的已录后续段数量，仅用于一致性检查和界面解释。 */
  hiddenLaterSegmentCount: number;
  accompanimentUrl: string;
}

/** 固定伴奏时间轴上的完整试听计划；只信任调用方传入的服务端可见 `segments`。 */
export function planAccompaniedMix(input: AccompaniedMixPlanInput): MixPlan {
  const base = planMonoSequentialMix({
    ...input,
    // 人声文件的实测长短不能改变曲目时间轴；完整试听以曲库固定段界为准。
    segments: input.segments.map((segment) => ({
      ...segment,
      durationMs: input.nominalDurationByIndex?.[segment.index] ?? segment.durationMs,
    })),
  });
  const missing = new Set(input.missingSegmentIndexes);
  const visible = new Set(input.segments.map((segment) => segment.index));
  const clips = base.clips.map((clip) => {
    const availability: MixClipAvailability = visible.has(clip.index)
      ? 'RECORDED'
      : missing.has(clip.index)
        ? 'UNRECORDED'
        : 'LOCKED';
    return {
      ...clip,
      durationSource:
        input.nominalDurationByIndex?.[clip.index] === undefined
          ? clip.durationSource
          : 'NOMINAL',
      availability,
      audioUrl: availability === 'RECORDED' ? (clip.audioUrl ?? null) : null,
    };
  });
  const lockedSegmentIndexes = clips
    .filter((clip) => clip.availability === 'LOCKED')
    .map((clip) => clip.index);
  if (lockedSegmentIndexes.length !== input.hiddenLaterSegmentCount) {
    throw new Error(
      `hiddenLaterSegmentCount=${String(input.hiddenLaterSegmentCount)} 与锁定段数量 ${String(lockedSegmentIndexes.length)} 不一致。`,
    );
  }
  return {
    ...base,
    strategy: 'ACCOMPANIMENT_TIMELINE',
    hasAccompaniment: true,
    accompanimentUrl: input.accompanimentUrl,
    clips,
    missingSegmentIndexes: [...missing].sort((left, right) => left - right),
    // `missing=[]` 只说明服务端没有真实缺口；仍有 LOCKED 时当前观看者不能确认/试听完整作品。
    isComplete: missing.size === 0 && lockedSegmentIndexes.length === 0,
    unrecordedSegmentIndexes: clips
      .filter((clip) => clip.availability === 'UNRECORDED')
      .map((clip) => clip.index),
    lockedSegmentIndexes,
  };
}

export interface MixPlanInput {
  segments: readonly MixSourceSegment[];
  /** 歌的分段数（来自数据，禁止硬编码 4）。 */
  totalSegments: number;
  sampleRate?: number;
  /**
   * 各段的名义时长（来自 `/api/songs` 的 `songSegments.durationMs`）。
   * 缺口占位优先用它 —— 这样缺口的静音长度与"那一段本该多长"一致。
   */
  nominalDurationByIndex?: Readonly<Record<number, number | undefined>>;
}

/** 拼接策略（阶段二换实现，调用方不变）。 */
export type MixPlanner = (input: MixPlanInput) => MixPlan;

const WARNING_MESSAGES: Record<MixWarningCode, string> = {
  DUPLICATE_SEGMENT_INDEX: '同一个段号出现了多条有效段，已保留第一条（其余忽略）。',
  SEGMENT_INDEX_OUT_OF_RANGE: '段号超出这首歌的分段范围，已忽略该段。',
  SEGMENT_DURATION_INVALID: '该段没有可用的时长，已按缺口处理。',
  NO_VALID_SEGMENT: '这个作品还没有任何有效段，成品只有静音占位。',
};

function warning(code: MixWarningCode, message?: string): MixWarning {
  return { code, message: message ?? WARNING_MESSAGES[code] };
}

/** 用给定的拼接策略生成计划（阶段二只需换一个 `MixPlanner`）。 */
export function planMix(strategy: MixPlanner, input: MixPlanInput): MixPlan {
  return strategy(input);
}

/**
 * 阶段一策略：按段号升序把人声首尾相接，缺口留等长静音。
 * 纯函数：同样的输入永远得到同样的计划（可缓存、可比较）。
 */
export const planMonoSequentialMix: MixPlanner = (input) => {
  const sampleRate =
    Number.isFinite(input.sampleRate) && (input.sampleRate ?? 0) > 0
      ? (input.sampleRate as number)
      : DEFAULT_MIX_SAMPLE_RATE;

  const warnings: MixWarning[] = [];
  const seen = new Set<number>();
  const valid = new Map<number, MixSourceSegment>();

  for (const segment of input.segments) {
    if (
      !Number.isInteger(segment.index) ||
      segment.index < 1 ||
      segment.index > input.totalSegments
    ) {
      warnings.push(warning('SEGMENT_INDEX_OUT_OF_RANGE'));
      continue;
    }
    if (seen.has(segment.index)) {
      warnings.push(warning('DUPLICATE_SEGMENT_INDEX'));
      continue;
    }
    seen.add(segment.index);

    if (!Number.isFinite(segment.durationMs) || segment.durationMs <= 0) {
      warnings.push(warning('SEGMENT_DURATION_INVALID'));
      continue; // 该段号留作缺口
    }
    valid.set(segment.index, segment);
  }

  if (valid.size === 0) warnings.push(warning('NO_VALID_SEGMENT'));

  const medianDurationMs = medianOf([...valid.values()].map((segment) => segment.durationMs));

  const clips: MixClip[] = [];
  let frame = 0;
  for (let index = 1; index <= input.totalSegments; index += 1) {
    const segment = valid.get(index);
    if (segment !== undefined) {
      const durationFrame = msToFrames(segment.durationMs, sampleRate);
      clips.push({
        index,
        kind: 'voice',
        startFrame: frame,
        durationFrame,
        startMs: framesToMs(frame, sampleRate),
        durationMs: framesToMs(durationFrame, sampleRate),
        durationSource: 'MEASURED',
        audioUrl: segment.audioUrl ?? null,
        ownerCode: segment.ownerCode ?? null,
      });
      frame += durationFrame;
      continue;
    }

    const nominal = input.nominalDurationByIndex?.[index];
    const nominalUsable = typeof nominal === 'number' && Number.isFinite(nominal) && nominal > 0;
    const placeholderMs = nominalUsable
      ? nominal
      : (medianDurationMs ?? DEFAULT_GAP_PLACEHOLDER_MS);
    const durationSource: GapDurationSource = nominalUsable
      ? 'NOMINAL'
      : medianDurationMs === null
        ? 'DEFAULT'
        : 'MEDIAN';
    const durationFrame = msToFrames(placeholderMs, sampleRate);
    clips.push({
      index,
      kind: 'gap',
      startFrame: frame,
      durationFrame,
      startMs: framesToMs(frame, sampleRate),
      durationMs: framesToMs(durationFrame, sampleRate),
      durationSource,
      audioUrl: null,
      ownerCode: null,
    });
    frame += durationFrame;
  }

  return {
    strategy: MONO_SEQUENTIAL_STRATEGY,
    sampleRate,
    clips,
    totalFrames: frame,
    totalMs: framesToMs(frame, sampleRate),
    missingSegmentIndexes: clips.filter((clip) => clip.kind === 'gap').map((clip) => clip.index),
    isComplete: clips.every((clip) => clip.kind === 'voice'),
    hasAccompaniment: false,
    warnings,
  };
};

/** 毫秒 → 帧（四舍五入到最近的整数帧，保证落在采样网格上）。 */
export function msToFrames(durationMs: number, sampleRate: number): number {
  return Math.round((durationMs / 1000) * sampleRate);
}

/** 帧 → 毫秒（由帧派生，展示用）。 */
export function framesToMs(frames: number, sampleRate: number): number {
  return (frames / sampleRate) * 1000;
}

/** 中位数；空数组返回 null（调用方据此选兜底）。 */
function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1];
  const right = sorted[middle];
  if (left === undefined || right === undefined) return null;
  return Math.round((left + right) / 2);
}

/** 缺口的中文标注；完整时返回 null（CONTEXT §7.4 的"缺口"语义，界面与文件名共用）。 */
export function describeMissingSegments(missing: readonly number[]): string | null {
  if (missing.length === 0) return null;
  return `缺第 ${missing.join('、')} 段`;
}

/** 成品摘要（不得把不完整说成完整）。 */
export function mixSummaryLabel(plan: MixPlan): string {
  const total = plan.clips.length;
  const format = plan.hasAccompaniment ? '伴奏 + 人声' : '纯人声';
  if (plan.isComplete) return `${total} 段完整（${format}）`;
  if (plan.hasAccompaniment && (plan.lockedSegmentIndexes?.length ?? 0) > 0) {
    const parts: string[] = [];
    const missing = describeMissingSegments(plan.missingSegmentIndexes);
    if (missing !== null) parts.push(missing);
    parts.push(`第 ${plan.lockedSegmentIndexes?.join('、') ?? ''} 段暂未解锁`);
    const visible = plan.clips.filter((clip) => clip.availability === 'RECORDED').length;
    return `${parts.join(' · ')} · 可试听 ${String(visible)} / ${String(total)} 段（${format}）`;
  }
  const missing = describeMissingSegments(plan.missingSegmentIndexes) ?? '';
  return `${missing} · 有效 ${total - plan.missingSegmentIndexes.length} / ${total} 段（${format}）`;
}

export interface AlignmentMeasurement {
  index: number;
  kind: MixClipKind;
  expectedStartMs: number;
  /** 实测起拍位置（ms）；缺口段为 null（静音没有起拍）。 */
  measuredStartMs: number | null;
  /** 实测 − 期望（ms）；正数 = 晚了。 */
  errorMs: number;
}

export interface AlignmentReport {
  toleranceMs: number;
  measurements: AlignmentMeasurement[];
  maxAbsErrorMs: number;
  meanAbsErrorMs: number;
  /** 是否所有可测段落都在阈值内。**没有可测段落时为 false**（不谎报达标）。 */
  withinTolerance: boolean;
  /**
   * 违规段：误差超阈值，**或**起拍根本找不到（`measuredStartMs === null`）。
   * "找不到起拍"必须出现在这里 —— 它曾经被静默排除在报告之外，界面就会显示
   * 「未达标 · 最大误差 0.0ms · 无违规段」，既不解释也不可排查。
   */
  violations: AlignmentMeasurement[];
  /** 起拍未能测到的段号（其音频可能整段是静音，或计划与渲染不一致）。 */
  unmeasurableIndexes: number[];
}

/**
 * 汇总对齐测量结果（D-05 的客观验收口径）。
 * 注意：`withinTolerance` 在"没有任何可测人声段"时为 **false** —— 缺数据不等于达标。
 */
export function summarizeAlignment(
  measurements: readonly AlignmentMeasurement[],
  toleranceMs: number = MIX_ALIGNMENT_TOLERANCE_MS,
): AlignmentReport {
  const voice = measurements.filter((measurement) => measurement.kind === 'voice');
  const measurable = voice.filter((measurement) => Number.isFinite(measurement.errorMs));
  const errors = measurable.map((measurement) => Math.abs(measurement.errorMs));
  const maxAbsErrorMs = errors.length === 0 ? 0 : Math.max(...errors);
  const meanAbsErrorMs =
    errors.length === 0 ? 0 : errors.reduce((sum, value) => sum + value, 0) / errors.length;
  const violations = voice.filter(
    (measurement) =>
      !Number.isFinite(measurement.errorMs) || Math.abs(measurement.errorMs) > toleranceMs,
  );
  const unmeasurableIndexes = voice
    .filter((measurement) => !Number.isFinite(measurement.errorMs))
    .map((measurement) => measurement.index);

  return {
    toleranceMs,
    measurements: voice,
    maxAbsErrorMs,
    meanAbsErrorMs,
    withinTolerance: voice.length > 0 && violations.length === 0,
    violations,
    unmeasurableIndexes,
  };
}
