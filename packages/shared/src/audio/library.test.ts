/**
 * 曲库元数据（t13）单测。
 *
 * 这里钉的是"错了就会毁掉演示"的几条：
 * 1. **段号 1..N 连续、边界首尾相接、每段 15–30 秒、总长 60–120 秒**（CONTEXT §3.1 / ADR-015 §16.1）；
 * 2. **起音证据门禁**：`significant: false` 的边界必须被列出来交人工复核（不允许静默定稿）；
 * 3. **响度归一算术**：等响目标 = 所有曲目都不越界的最高点；只用增益，不做限幅；
 * 4. **CC BY 4.0 署名文案**与 `LICENSES.md` 一致（含 remix 标注）；
 * 5. **zod 契约**挡得住损坏的 library.json。
 *
 * 夹具直接用**真实生成物**（`apps/web/public/library/library.json`）：
 * 这样测试同时也在守卫"分析脚本的输出仍然满足产品约束"，而不是只测一个玩具输入。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LIBRARY_ATTRIBUTION_TEXT,
  LIBRARY_LICENSE,
  LIBRARY_PEAK_CEILING_DBFS,
  LibraryMetadataSchema,
  dbToLinear,
  describeLibraryTrack,
  describeLibraryTrackMeta,
  maxSafeEqualLoudnessLufs,
  normalizationGain,
  segmentAtPosition,
  segmentWindow,
  segmentsNeedingManualReview,
  validateSegmentTable,
  type LibraryMetadata,
  type LibrarySegment,
  type LibraryTrack,
} from './library';

const metadataUrl = new URL('../../../../apps/web/public/library/library.json', import.meta.url);
const metadata: LibraryMetadata = LibraryMetadataSchema.parse(
  JSON.parse(readFileSync(metadataUrl, 'utf8')) as unknown,
);

function track(title: string): LibraryTrack {
  const found = metadata.tracks.find((item) => item.title === title);
  if (found === undefined) throw new Error(`library.json 里没有 ${title}`);
  return found;
}

function segment(overrides: Partial<LibrarySegment> = {}): LibrarySegment {
  return { index: 1, startMs: 0, endMs: 22_500, durationMs: 22_500, ...overrides };
}

/** 合法表：4 段 × 22.5s = 90s —— 同时满足"每段 15–30s"与"总长 60–120s"。 */
function legalTable(): LibrarySegment[] {
  return [0, 1, 2, 3].map((position) =>
    segment({
      index: position + 1,
      startMs: position * 22_500,
      endMs: (position + 1) * 22_500,
      durationMs: 22_500,
    }),
  );
}

describe('真实生成物：三首曲目都满足产品硬约束', () => {
  it('至少 3 首、每首 4 段（Demo 固定 4 段），且段号 1..4 连续', () => {
    expect(metadata.tracks.length).toBeGreaterThanOrEqual(3);
    for (const item of metadata.tracks) {
      expect(item.segments).toHaveLength(4);
      expect(item.segments.map((s) => s.index)).toEqual([1, 2, 3, 4]);
      expect(validateSegmentTable(item.segments)).toEqual([]);
    }
  });

  it('每段时长都在 15–30 秒、总长 60–120 秒、边界首尾相接', () => {
    for (const item of metadata.tracks) {
      const total = item.segments.reduce((sum, s) => sum + s.durationMs, 0);
      expect(total).toBeGreaterThanOrEqual(60_000);
      expect(total).toBeLessThanOrEqual(120_000);
      for (const [position, s] of item.segments.entries()) {
        expect(s.durationMs).toBeGreaterThanOrEqual(15_000);
        expect(s.durationMs).toBeLessThanOrEqual(30_000);
        if (position > 0) expect(s.startMs).toBe(item.segments[position - 1]?.endMs);
      }
    }
  });

  it('每首都有伴奏文件引用、固定 songId 与 BPM/拍号依据', () => {
    for (const item of metadata.tracks) {
      expect(item.accompanimentRef.startsWith('/library/')).toBe(true);
      expect(item.songId).toMatch(/^[0-9a-f-]{36}$/);
      expect(item.measuredBpm).toBeGreaterThan(40);
      expect([2, 3, 4, 6]).toContain(item.meter);
      expect(item.segmentEvidence?.boundaries.length).toBe(5); // 起点 + 3 内部 + 终点
    }
  });

  it('拍号结论有据：Rains Will Fall 是圆舞曲（3/4），另两首 4/4 —— 与官方描述一致', () => {
    // captain 明确记录：官方描述里唯一的圆舞曲是 Rains Will Fall（他否掉了把 On the Shore 判成 3/4 的旧结果）
    expect(track('Rains Will Fall').meter).toBe(3);
    expect(track('On the Shore').meter).toBe(4);
    expect(track('Immersed').meter).toBe(4);
  });
});

describe('validateSegmentTable：硬约束', () => {
  it('合法表通过（4 段 × 22.5s = 90s）', () => {
    expect(validateSegmentTable(legalTable())).toEqual([]);
  });

  it('单段 22.5s 不合法：总长 22.5s < 60s（总长也要守区间）', () => {
    expect(validateSegmentTable([segment()]).map((v) => v.code)).toEqual([
      'TOTAL_DURATION_OUT_OF_RANGE',
    ]);
  });

  // 下面这些用例只断言"目标违规码出现在列表里"：它们构造的是**局部**非法表（总长往往也不达标），
  // 这与真实生成物的全量校验（见上面的"真实生成物"分组）互不替代。
  it('段号跳号 / 不连续 → 报错（段号永不压缩）', () => {
    const violations = validateSegmentTable([
      segment({ index: 1, startMs: 0, endMs: 20_000, durationMs: 20_000 }),
      segment({ index: 3, startMs: 20_000, endMs: 40_000, durationMs: 20_000 }),
    ]);

    expect(violations.map((v) => v.code)).toContain('SEGMENT_INDEX_NOT_CONTIGUOUS');
  });

  it('边界不留缝（endMs ≠ 下一段 startMs）→ 报错', () => {
    const violations = validateSegmentTable([
      segment({ index: 1, startMs: 0, endMs: 20_000, durationMs: 20_000 }),
      segment({ index: 2, startMs: 20_001, endMs: 40_000, durationMs: 19_999 }),
    ]);

    expect(violations.map((v) => v.code)).toContain('SEGMENT_BOUNDARY_NOT_CONTIGUOUS');
  });

  it('时长越界（<15s / >30s）→ 报错，并给可读文案', () => {
    const short = validateSegmentTable([segment({ endMs: 14_000, durationMs: 14_000 })]);
    expect(short.map((v) => v.code)).toContain('SEGMENT_DURATION_OUT_OF_RANGE');
    expect(short[0]?.message).toContain('15');

    const long = validateSegmentTable([segment({ endMs: 31_000, durationMs: 31_000 })]);
    expect(long.map((v) => v.code)).toContain('SEGMENT_DURATION_OUT_OF_RANGE');
  });

  it('总长越界 → 报错（60–120 秒）', () => {
    const violations = validateSegmentTable([segment({ endMs: 50_000, durationMs: 50_000 })]);
    expect(violations.map((v) => v.code)).toContain('TOTAL_DURATION_OUT_OF_RANGE');
  });

  it('时长字段自相矛盾（endMs−startMs ≠ durationMs）→ 报错', () => {
    const violations = validateSegmentTable([segment({ endMs: 22_500, durationMs: 20_000 })]);
    expect(violations.map((v) => v.code)).toContain('SEGMENT_TIME_INCONSISTENT');
  });

  it('空表 → 报错（不是静默通过）', () => {
    expect(validateSegmentTable([]).map((v) => v.code)).toEqual(['EMPTY_SEGMENT_TABLE']);
  });
});

describe('起音证据门禁：不显著就必须交人工复核', () => {
  it('真实生成物：三首都应无待复核边界（当前证据下）', () => {
    for (const item of metadata.tracks) {
      expect(segmentsNeedingManualReview(item)).toEqual([]);
    }
  });

  it('把某个内部边界标成不显著 → 该段号被列出来', () => {
    const item = track('Immersed');
    const doctored: LibraryTrack = {
      ...item,
      segmentEvidence: {
        windowS: 1.5,
        significanceGate: 0.01,
        segmentLengthsS: [23, 23, 22, 22],
        totalS: 90,
        boundaries: (item.segmentEvidence?.boundaries ?? []).map((boundary, position) =>
          position === 2
            ? { ...boundary, significant: false, note: '窗口内起音不显著 → 待人工复核' }
            : boundary,
        ),
      },
    };

    expect(segmentsNeedingManualReview(doctored)).toEqual([2]);
  });

  it('没有证据字段时保守处理：不返回空数组假装"都没问题"，而是要求复核全部内部边界', () => {
    const item = track('Immersed');
    const withoutEvidence: LibraryTrack = { ...item, segmentEvidence: undefined };

    expect(segmentsNeedingManualReview(withoutEvidence).length).toBeGreaterThan(0);
  });
});

describe('segmentWindow / segmentAtPosition：播放器"只播当前段"', () => {
  it('取第 N 段的时间窗（越界返回 null）', () => {
    const item = track('On the Shore');
    expect(segmentWindow(item, 1)).toEqual({
      index: 1,
      startMs: item.segments[0]?.startMs,
      endMs: item.segments[0]?.endMs,
      durationMs: item.segments[0]?.durationMs,
    });
    expect(segmentWindow(item, 5)).toBeNull();
  });

  it('位置落在哪一段（边界属于后一段的起点；末尾越界为 null）', () => {
    const item = track('On the Shore');
    const second = item.segments[1]!;
    expect(segmentAtPosition(item, second.startMs)?.index).toBe(2);
    expect(segmentAtPosition(item, second.startMs - 1)?.index).toBe(1);
    expect(segmentAtPosition(item, 90_000)).toBeNull();
  });
});

describe('响度归一算术', () => {
  it('等响目标 = 所有曲目都不越界的最高点（真实数据 → -24.73 LUFS）', () => {
    const maxSafe = maxSafeEqualLoudnessLufs(metadata.tracks, LIBRARY_PEAK_CEILING_DBFS);

    expect(maxSafe).toBeCloseTo(-24.73, 1);
    // 与生成器写进 JSON 的口径一致（两处不打架）
    expect(metadata.headroomPolicy?.maxSafeEqualLoudnessLufs).toBeCloseTo(maxSafe, 2);
  });

  it('按等响目标取增益：三首结果响度相同、峰值都不越界、只用到增益', () => {
    const target = maxSafeEqualLoudnessLufs(metadata.tracks, LIBRARY_PEAK_CEILING_DBFS);

    for (const item of metadata.tracks) {
      const gain = normalizationGain({
        loudnessLufs: item.loudnessLufs,
        samplePeakDbfs: item.samplePeakDbfs,
        targetLufs: target,
      });
      expect(gain.resultingLufs).toBeCloseTo(target, 6);
      expect(gain.resultingPeakDbfs).toBeLessThanOrEqual(LIBRARY_PEAK_CEILING_DBFS + 1e-9);
      expect(gain.gainDb).toBeCloseTo(item.normalization.gainDb, 1);
    }
  });

  it('标称目标（-16 LUFS）会被峰值上限截断 → limitedByPeak=true（诚实标注）', () => {
    const item = track('Immersed');
    const gain = normalizationGain({
      loudnessLufs: item.loudnessLufs,
      samplePeakDbfs: item.samplePeakDbfs,
      targetLufs: -16,
    });

    expect(gain.limitedByPeak).toBe(true);
    expect(gain.resultingPeakDbfs).toBeCloseTo(LIBRARY_PEAK_CEILING_DBFS, 6);
    expect(gain.resultingLufs).toBeLessThan(-16);
  });

  it('dB → 线性增益（Web Audio GainNode 用）', () => {
    expect(dbToLinear(0)).toBeCloseTo(1, 10);
    expect(dbToLinear(6)).toBeCloseTo(1.995, 3);
    expect(dbToLinear(-6)).toBeCloseTo(0.501, 3);
    expect(dbToLinear(Number.NaN)).toBe(1);
  });
});

describe('CC BY 4.0 署名（与 LICENSES.md 一致，含 remix 标注）', () => {
  it('署名正文含作者、来源、许可名与链接', () => {
    expect(LIBRARY_ATTRIBUTION_TEXT).toContain('Kevin MacLeod');
    expect(LIBRARY_ATTRIBUTION_TEXT).toContain('incompetech.com');
    expect(LIBRARY_ATTRIBUTION_TEXT).toContain('Creative Commons Attribution 4.0');
    expect(LIBRARY_LICENSE.licenseUrl).toBe('https://creativecommons.org/licenses/by/4.0/');
  });

  it('必须标注"改编(remix)"：成品里叠加了用户人声', () => {
    expect(LIBRARY_ATTRIBUTION_TEXT).toContain('改编');
    expect(LIBRARY_ATTRIBUTION_TEXT).toContain('人声');
  });

  it("不得出现 emoji（DESIGN.md Do&Don't）", () => {
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(LIBRARY_ATTRIBUTION_TEXT)).toBe(false);
  });

  it('曲目摘要给得出 BPM 与拍号（选歌列表要显示依据，而不是只写"好听"）', () => {
    expect(describeLibraryTrack(track('Rains Will Fall'))).toContain('3/4');
    expect(describeLibraryTrack(track('Immersed'))).toContain('BPM');
  });

  it('meta 摘要不含标题（播放条已单独显示标题，避免重复出现两次）', () => {
    const meta = describeLibraryTrackMeta(track('Immersed'));

    expect(meta).toContain('BPM');
    expect(meta).not.toContain('Immersed');
  });
});

describe('zod 契约：挡得住损坏的元数据', () => {
  it('缺少 tracks / 字段类型不对 → parse 抛错', () => {
    expect(LibraryMetadataSchema.safeParse({ generatedBy: 'x' }).success).toBe(false);
    expect(
      LibraryMetadataSchema.safeParse({ generatedBy: 'x', tracks: [{ title: 'x' }] }).success,
    ).toBe(false);
  });

  it('段号非整数 / 时长为负 → 拒绝', () => {
    const bad = JSON.parse(JSON.stringify(metadata)) as LibraryMetadata;
    bad.tracks[0]!.segments[0]!.index = 1.5;
    expect(LibraryMetadataSchema.safeParse(bad).success).toBe(false);
  });
});
