/**
 * 曲库元数据（t13）的**校验与消费**纯逻辑。
 *
 * `apps/web/public/library/library.json` 由 `tools/library-analysis.py` 生成（分析三首 CC BY 器乐），
 * 是**唯一元数据源**：网页（伴奏播放）与入库脚本（DB）都读它，因此不存在"两处真相"。
 *
 * 本模块负责：
 * 1. **契约校验**（zod）：文件损坏/字段缺失时立刻报错，而不是让播放器静默拿到 undefined；
 * 2. **分段表不变的校验**：段号 1..N 连续、边界首尾相接、每段 15–30 秒、总长 60–120 秒
 *    —— 与 `CONTEXT.md` §3.1 和 ADR-015 §16.1（段号永不压缩）一致；
 * 3. **起音证据门禁**：`significant: false` 的边界必须被列出来交人工复核（**不允许静默定稿**）；
 * 4. **响度归一算术**：等响目标 + 增益（只用增益，不做限幅/压缩）；
 * 5. **CC BY 4.0 署名文案**（单一来源，与 `LICENSES.md` 逐字一致）。
 */
import { z } from 'zod';
import { SEGMENT_MAX_MS, SEGMENT_MIN_MS } from './constants';

/** 与 `CONTEXT.md` §3.1：每段 15–30 秒、总 60–120 秒。 */
export const LIBRARY_TOTAL_MIN_MS = 60_000;
export const LIBRARY_TOTAL_MAX_MS = 120_000;

/** 静态元数据地址（web 直接 fetch，不经 API —— 曲库是构建资产，不是用户数据）。 */
export const LIBRARY_METADATA_URL = '/library/library.json';

/** 入库时写进 `songs.licensed_source` 的标识（seed 的 'placeholder' 与之区分，互不覆盖）。 */
export const LIBRARY_LICENSED_SOURCE = 'incompetech-cc-by-4.0';

/** 峰值上限：给后续混音（人声叠加）留 headroom。 */
export const LIBRARY_PEAK_CEILING_DBFS = -1.0;

// ── CC BY 4.0 署名（与 apps/web/public/library/LICENSES.md 的建议文案逐字一致）──
export const LIBRARY_LICENSE = {
  author: 'Kevin MacLeod',
  sourceName: 'Incompetech',
  sourceUrl: 'https://incompetech.com',
  licenseName: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
} as const;

/** 「设置 / 关于」页展示用的署名正文（含 remix 标注：成品里叠加了用户人声）。 */
export const LIBRARY_ATTRIBUTION_TEXT = [
  '本作品使用的伴奏音乐来自 Kevin MacLeod (incompetech.com)，',
  '依据 Creative Commons Attribution 4.0 许可使用。',
  'Licensed under Creative Commons: By Attribution 4.0 License',
  'https://creativecommons.org/licenses/by/4.0/',
  '',
  '成品在伴奏之上叠加了用户人声，属改编（remix）；署名与许可条款与原曲一致保留。',
].join('\n');

/** 逐段元数据（`docs/architecture.md` §19.3）。 */
export const LibrarySegmentSchema = z.object({
  /** 歌里的固定段落位置 1..N，**永不压缩**。 */
  index: z.number().int().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  durationMs: z.number().int().positive(),
  /** 起拍落在第几个节拍/小节（有则给，便于人工核对）。 */
  startBeat: z.number().int().nonnegative().optional(),
  startBar: z.number().nonnegative().optional(),
  barCount: z.number().positive().optional(),
});

export const LibraryOnsetEvidenceSchema = z.object({
  targetS: z.number(),
  snappedS: z.number(),
  onsetStrength: z.number().nullable(),
  windowMedian: z.number().nullable().optional(),
  windowP90: z.number().nullable().optional(),
  percentile: z.number().nullable(),
  significant: z.boolean(),
  note: z.string(),
});

export const LibraryNormalizationSchema = z.object({
  targetLufs: z.number(),
  nominalTargetLufs: z.number().optional(),
  maxSafeTargetLufs: z.number().optional(),
  policy: z.string().optional(),
  gainDb: z.number(),
  gainLimitedByPeak: z.boolean(),
  resultingPeakDbfs: z.number(),
  resultingLufs: z.number().optional(),
});

export const LibraryTrackSchema = z.object({
  file: z.string().min(1),
  title: z.string().min(1),
  /** 固定 UUID：与 `apps/api/src/db/seed.ts` 的曲目 id 方案一致（入库即"占位歌换真歌"）。 */
  songId: z.uuid(),
  ordinal: z.number().int().min(1),
  /** 伴奏文件的公开路径（`apps/web/public` 下的相对路径）。 */
  accompanimentRef: z.string().min(1),
  durationS: z.number().positive(),
  officialBpm: z.number().positive(),
  measuredBpm: z.number().positive(),
  bpmDeviationPercent: z.number(),
  meter: z.number().int().min(2).max(12),
  meterConfidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  loudnessLufs: z.number(),
  samplePeakDbfs: z.number(),
  segments: z.array(LibrarySegmentSchema).min(1),
  segmentEvidence: z
    .object({
      windowS: z.number().positive(),
      significanceGate: z.number(),
      boundaries: z.array(LibraryOnsetEvidenceSchema),
      segmentLengthsS: z.array(z.number()),
      totalS: z.number(),
    })
    .optional(),
  normalization: LibraryNormalizationSchema,
});

export const LibraryMetadataSchema = z.object({
  generatedBy: z.string().min(1),
  note: z.string().optional(),
  targetLufs: z.number().optional(),
  headroomPolicy: z
    .object({
      peakCeilingDbfs: z.number(),
      nominalTargetLufs: z.number(),
      maxSafeEqualLoudnessLufs: z.number(),
      processing: z.string(),
    })
    .optional(),
  tracks: z.array(LibraryTrackSchema).min(1),
});

export type LibrarySegment = z.infer<typeof LibrarySegmentSchema>;
export type LibraryTrack = z.infer<typeof LibraryTrackSchema>;
export type LibraryMetadata = z.infer<typeof LibraryMetadataSchema>;

export type LibraryViolationCode =
  | 'SEGMENT_INDEX_NOT_CONTIGUOUS'
  | 'SEGMENT_BOUNDARY_NOT_CONTIGUOUS'
  | 'SEGMENT_DURATION_OUT_OF_RANGE'
  | 'TOTAL_DURATION_OUT_OF_RANGE'
  | 'SEGMENT_TIME_INCONSISTENT'
  | 'EMPTY_SEGMENT_TABLE';

export interface LibraryViolation {
  code: LibraryViolationCode;
  message: string;
}

/**
 * 分段表校验（硬约束）。返回空数组 = 合法。
 *
 * 注意这里是**硬校验**：段号跳号/边界不接/时长越界都会让成品错位，
 * 因此入库脚本会在写库前先跑它（不合格直接拒绝写库，而不是写进去再说）。
 */
export function validateSegmentTable(segments: readonly LibrarySegment[]): LibraryViolation[] {
  const violations: LibraryViolation[] = [];
  if (segments.length === 0) {
    return [{ code: 'EMPTY_SEGMENT_TABLE', message: '分段表为空。' }];
  }

  segments.forEach((segment, position) => {
    if (segment.index !== position + 1) {
      violations.push({
        code: 'SEGMENT_INDEX_NOT_CONTIGUOUS',
        message: `第 ${String(position + 1)} 条的段号是 ${String(segment.index)}，应为 ${String(position + 1)}（段号永不压缩、不跳号）。`,
      });
    }
    const expectedDuration = segment.endMs - segment.startMs;
    if (expectedDuration !== segment.durationMs) {
      violations.push({
        code: 'SEGMENT_TIME_INCONSISTENT',
        message: `第 ${String(segment.index)} 段：endMs−startMs=${String(expectedDuration)} ≠ durationMs=${String(segment.durationMs)}。`,
      });
    }
    if (segment.durationMs < SEGMENT_MIN_MS || segment.durationMs > SEGMENT_MAX_MS) {
      violations.push({
        code: 'SEGMENT_DURATION_OUT_OF_RANGE',
        message: `第 ${String(segment.index)} 段时长 ${(segment.durationMs / 1000).toFixed(2)}s 不在 15–30 秒内。`,
      });
    }
    const previous = segments[position - 1];
    if (previous !== undefined && previous.endMs !== segment.startMs) {
      violations.push({
        code: 'SEGMENT_BOUNDARY_NOT_CONTIGUOUS',
        message: `第 ${String(previous.index)} 段结束 ${String(previous.endMs)}ms ≠ 第 ${String(segment.index)} 段开始 ${String(segment.startMs)}ms（必须首尾相接，不留缝不重叠）。`,
      });
    }
  });

  const total = segments.reduce((sum, segment) => sum + segment.durationMs, 0);
  if (total < LIBRARY_TOTAL_MIN_MS || total > LIBRARY_TOTAL_MAX_MS) {
    violations.push({
      code: 'TOTAL_DURATION_OUT_OF_RANGE',
      message: `总时长 ${(total / 1000).toFixed(1)}s 不在 60–120 秒内。`,
    });
  }
  return violations;
}

/**
 * 需要人工复核的边界段号。
 *
 * - 有证据：返回 `significant === false` 的内部边界（起点/终点不吸附，不算）；
 * - **没有证据：保守处理 —— 要求复核全部内部边界**（1..N−1）。
 *   "没检查" 与 "检查通过" 是两件事，界面/入库不能把前者当成后者。
 */
export function segmentsNeedingManualReview(track: LibraryTrack): number[] {
  const boundaries = track.segmentEvidence?.boundaries;
  if (boundaries === undefined) {
    return track.segments.slice(1).map((segment) => segment.index);
  }
  return boundaries
    .map((boundary, position) => ({ boundary, position }))
    .filter((item) => !item.boundary.significant && item.position > 0)
    .map((item) => item.position);
}

/** 取某一段的时间窗（播放器"只播当前段"用）；`index` 越界返回 null。 */
export function segmentWindow(
  track: LibraryTrack,
  index: number,
): { index: number; startMs: number; endMs: number; durationMs: number } | null {
  const segment = track.segments.find((item) => item.index === index);
  if (segment === undefined) return null;
  return {
    index: segment.index,
    startMs: segment.startMs,
    endMs: segment.endMs,
    durationMs: segment.durationMs,
  };
}

/** 播放位置落在哪一段（越界返回 null）—— 播放器用它做"不允许跑到下一段"的兜底判定。 */
export function segmentAtPosition(track: LibraryTrack, positionMs: number): LibrarySegment | null {
  return (
    track.segments.find((segment) => positionMs >= segment.startMs && positionMs < segment.endMs) ??
    null
  );
}

/**
 * 三首之间"不需要限幅就能达到"的最大等响目标（LUFS）。
 *
 * 直觉：逐首打到标称目标（-16 LUFS）会顶破峰值上限，于是取
 * `min_i(LUFS_i + ceiling − peak_i)` —— 这是所有曲目都能达到、且都不越界的最高等响点。
 */
export function maxSafeEqualLoudnessLufs(
  tracks: readonly { loudnessLufs: number; samplePeakDbfs: number }[],
  ceilingDbfs: number = LIBRARY_PEAK_CEILING_DBFS,
): number {
  if (tracks.length === 0) return Number.NEGATIVE_INFINITY;
  return Math.min(
    ...tracks.map((track) => track.loudnessLufs + (ceilingDbfs - track.samplePeakDbfs)),
  );
}

export interface NormalizationGain {
  gainDb: number;
  limitedByPeak: boolean;
  resultingPeakDbfs: number;
  resultingLufs: number;
}

/** 单首的归一增益（只用增益，不做限幅/压缩；峰值越界时以峰值上限为准）。 */
export function normalizationGain(input: {
  loudnessLufs: number;
  samplePeakDbfs: number;
  targetLufs: number;
  ceilingDbfs?: number;
}): NormalizationGain {
  const ceiling = input.ceilingDbfs ?? LIBRARY_PEAK_CEILING_DBFS;
  const wanted = input.targetLufs - input.loudnessLufs;
  const headroom = ceiling - input.samplePeakDbfs;
  const gainDb = Math.min(wanted, headroom);
  return {
    gainDb,
    limitedByPeak: gainDb < wanted - 1e-9,
    resultingPeakDbfs: input.samplePeakDbfs + gainDb,
    resultingLufs: input.loudnessLufs + gainDb,
  };
}

/** dB → 线性增益（Web Audio `GainNode.gain.value` 用）。 */
export function dbToLinear(gainDb: number): number {
  return Number.isFinite(gainDb) ? 10 ** (gainDb / 20) : 1;
}

/** 曲目摘要元信息（**不含标题**）：播放条等已经单独显示标题的地方用它，避免标题重复出现。 */
export function describeLibraryTrackMeta(track: LibraryTrack): string {
  return `${String(Math.round(track.measuredBpm))} BPM · ${String(track.meter)}/4 · ${String(track.segments.length)} 段`;
}

/** 曲目一行摘要（**含标题**）：选歌列表等需要"一行说清"的地方用它。 */
export function describeLibraryTrack(track: LibraryTrack): string {
  return `${track.title} · ${describeLibraryTrackMeta(track)}`;
}
