/**
 * 曲库入库脚本单测（内存假 Db：只记录 SQL 与参数，不连库）。
 *
 * 目的很明确：**把"入库"这件事的决策点全部钉住**，而不是靠集成测试才发现问题：
 * 1. 分段表不合法 → **一条 SQL 都不发**（不合格数据不许进库）；
 * 2. 有"起音不显著"的边界 → 默认**拒绝入库**（分段表要用户听感确认后才能定稿）；
 * 3. 段落 id 与 `apps/api/src/db/seed.ts` 的派生方案**逐字节一致**（这样入库是"占位歌换真歌"，
 *    已存在的瓶子/外键不会断）；
 * 4. 幂等：同一份元数据跑两次，第二次仍是 upsert 同一批 id（不新增行）；
 * 5. `licensed_source` 必须与 seed 的 'placeholder' 区分（否则 re-seed 会把真曲目删掉）。
 */
import { describe, expect, it } from 'vitest';
import type { LibraryMetadata, LibraryTrack } from '@music-drift/shared/audio';
import { PLACEHOLDER_SOURCE } from '../db/seed.js';
import { ingestLibrary, segmentRowId, songTitleFrom } from './library-ingest.js';
import { embedLibraryFixture } from './library-fixture.js';

interface RecordedQuery {
  text: string;
  params: readonly unknown[];
}

/** 最小假 Db：记录 SQL，并按"调用顺序"返回预置结果。 */
function fakeDb(responses: unknown[][] = []) {
  const queries: RecordedQuery[] = [];
  let cursor = 0;
  const db = {
    query: async <T>(text: string, params: readonly unknown[] = []): Promise<T[]> => {
      queries.push({ text, params });
      const response = responses[cursor] ?? [];
      cursor += 1;
      return response as T[];
    },
    orm: undefined,
    close: async () => undefined,
  };
  return { db: db as unknown as Parameters<typeof ingestLibrary>[0], queries };
}

function fixture(overrides: Partial<LibraryTrack> = {}): LibraryMetadata {
  return embedLibraryFixture([
    {
      title: 'Test Track',
      songId: '11111111-1111-4111-8111-111111111111',
      ordinal: 1,
      accompanimentRef: '/library/test.mp3',
      segments: [1, 2, 3, 4].map((index) => ({
        index,
        startMs: (index - 1) * 22_500,
        endMs: index * 22_500,
        durationMs: 22_500,
      })),
      ...overrides,
    },
  ]);
}

describe('segmentRowId / songTitleFrom：与 seed 的 id 方案一致', () => {
  it('段落 id 与 seed 派生的完全一致（占位歌换真歌的前提）', () => {
    expect(segmentRowId(1, 1)).toBe('00000000-0000-4000-9001-000000000001');
    expect(segmentRowId(2, 4)).toBe('00000000-0000-4000-9002-000000000004');
    expect(segmentRowId(3, 2)).toBe('00000000-0000-4000-9003-000000000002');
  });

  it('序号越界（≥10）必须立刻报错，而不是产出非法 UUID（集成测试真实撞到过）', () => {
    expect(() => segmentRowId(10, 1)).toThrow(/1\.\.9|超出/);
    expect(() => segmentRowId(0, 1)).toThrow();
    expect(() => segmentRowId(1.5, 1)).toThrow();
    // 边界内仍然合法
    expect(segmentRowId(9, 4)).toBe('00000000-0000-4000-9009-000000000004');
  });

  it('songTitleFrom 只取标题（用于报告）', () => {
    expect(songTitleFrom(fixture())).toBe('Test Track');
  });
});

describe('ingestLibrary：合法元数据', () => {
  it('写 1 首歌 + 4 段，且 licenced_source 与 seed 的 placeholder 不同', async () => {
    const { db, queries } = fakeDb();

    const report = await ingestLibrary(db, fixture());

    expect(report.songs).toBe(1);
    expect(report.segments).toBe(4);
    const songInsert = queries.find((q) => q.text.includes('insert into songs'));
    expect(songInsert?.params).toContain('incompetech-cc-by-4.0');
    expect(songInsert?.params).not.toContain(PLACEHOLDER_SOURCE);
  });

  it('段落写入带 start_ms / duration_ms / accompaniment_ref，且带 id 冲突更新', async () => {
    const { db, queries } = fakeDb();

    await ingestLibrary(db, fixture());

    const segmentQueries = queries.filter((q) => q.text.includes('insert into song_segments'));
    expect(segmentQueries).toHaveLength(4);
    expect(segmentQueries[0]?.text).toMatch(/on conflict \(id\) do update/i);
    expect(segmentQueries[0]?.params).toContain('/library/test.mp3');
    expect(segmentQueries.map((q) => q.params[3])).toEqual([0, 22_500, 45_000, 67_500]); // start_ms
  });

  it('幂等：同一份元数据连跑两次 → 两次都只做 upsert，不出现 delete/新增', async () => {
    const { db, queries } = fakeDb();

    await ingestLibrary(db, fixture());
    const first = queries.length;
    await ingestLibrary(db, fixture());

    expect(queries).toHaveLength(first * 2);
    expect(queries.filter((q) => /delete|truncate/i.test(q.text))).toHaveLength(0);
  });
});

describe('ingestLibrary：拒绝不合格数据（一条 SQL 都不发）', () => {
  it('段长越界（这里把第 2 段改成 40 秒）→ 抛错且零写入', async () => {
    const { db, queries } = fakeDb();
    const bad = fixture();
    bad.tracks[0]!.segments[1] = {
      index: 2,
      startMs: 22_500,
      endMs: 62_500,
      durationMs: 40_000,
    };

    await expect(ingestLibrary(db, bad)).rejects.toThrow(/15–30/);
    expect(queries).toHaveLength(0);
  });

  it('段号跳号 → 抛错且零写入', async () => {
    const { db, queries } = fakeDb();
    const bad = fixture();
    bad.tracks[0]!.segments[2]!.index = 5;

    await expect(ingestLibrary(db, bad)).rejects.toThrow(/段号/);
    expect(queries).toHaveLength(0);
  });

  it('有"起音不显著"边界且未获人工复核标记 → 默认拒绝入库（分段表不得自行定稿）', async () => {
    const { db, queries } = fakeDb();
    const needsReview = embedLibraryFixture([
      {
        title: 'Needs Review',
        songId: '22222222-2222-4222-8222-222222222222',
        ordinal: 2,
        accompanimentRef: '/library/review.mp3',
        segments: [1, 2, 3, 4].map((index) => ({
          index,
          startMs: (index - 1) * 22_500,
          endMs: index * 22_500,
          durationMs: 22_500,
        })),
      },
    ]);
    needsReview.tracks[0]!.segments[1]!.index = 2;
    needsReview.tracks[0]!.segmentEvidence = {
      windowS: 1.5,
      significanceGate: 0.02,
      segmentLengthsS: [22.5, 22.5, 22.5, 22.5],
      totalS: 90,
      boundaries: [
        {
          targetS: 0,
          snappedS: 0,
          onsetStrength: null,
          percentile: null,
          significant: true,
          note: '起点',
        },
        {
          targetS: 22.5,
          snappedS: 22.5,
          onsetStrength: 0.001,
          percentile: 40,
          significant: false,
          note: '待人工复核',
        },
        {
          targetS: 45,
          snappedS: 45,
          onsetStrength: 0.5,
          percentile: 99,
          significant: true,
          note: 'ok',
        },
        {
          targetS: 67.5,
          snappedS: 67.5,
          onsetStrength: 0.5,
          percentile: 99,
          significant: true,
          note: 'ok',
        },
        {
          targetS: 90,
          snappedS: 90,
          onsetStrength: null,
          percentile: null,
          significant: true,
          note: '终点',
        },
      ],
    };

    await expect(ingestLibrary(db, needsReview)).rejects.toThrow(/人工复核|听感确认/);
    expect(queries).toHaveLength(0);
  });

  it('显式 allowUnreviewed=true → 允许入库，但把待复核项如实报出来', async () => {
    const { db } = fakeDb();
    const needsReview = embedLibraryFixture([
      {
        title: 'Approved By User',
        songId: '33333333-3333-4333-8333-333333333333',
        ordinal: 3,
        accompanimentRef: '/library/approved.mp3',
        segments: [1, 2, 3, 4].map((index) => ({
          index,
          startMs: (index - 1) * 22_500,
          endMs: index * 22_500,
          durationMs: 22_500,
        })),
      },
    ]);
    needsReview.tracks[0]!.segmentEvidence = {
      windowS: 1.5,
      significanceGate: 0.02,
      segmentLengthsS: [22.5, 22.5, 22.5, 22.5],
      totalS: 90,
      boundaries: [
        {
          targetS: 0,
          snappedS: 0,
          onsetStrength: null,
          percentile: null,
          significant: true,
          note: '起点',
        },
        {
          targetS: 22.5,
          snappedS: 22.5,
          onsetStrength: 0.001,
          percentile: 40,
          significant: false,
          note: '待人工复核',
        },
        {
          targetS: 45,
          snappedS: 45,
          onsetStrength: 0.5,
          percentile: 99,
          significant: true,
          note: 'ok',
        },
        {
          targetS: 67.5,
          snappedS: 67.5,
          onsetStrength: 0.5,
          percentile: 99,
          significant: true,
          note: 'ok',
        },
        {
          targetS: 90,
          snappedS: 90,
          onsetStrength: null,
          percentile: null,
          significant: true,
          note: '终点',
        },
      ],
    };

    const report = await ingestLibrary(db, needsReview, { allowUnreviewed: true });

    expect(report.needsManualReview).toEqual([{ title: 'Approved By User', indexes: [1] }]);
    expect(report.songs).toBe(1);
  });
});
