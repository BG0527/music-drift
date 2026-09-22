/**
 * 曲库入库（t13）：把 `library.json` 的分段元数据写进 `songs` / `song_segments`。
 *
 * ## 为什么是"占位歌换真歌"，而不是新建三首
 *
 * 段落 id 与 `apps/api/src/db/seed.ts` 的派生方案**逐字节一致**（`segmentRowId`），
 * `songId` 也复用 seed 的固定 UUID。于是：
 * - 已存在的瓶子（外键指向 songs.id）不会断；
 * - `song_segments` 走 `on conflict (id) do update`，不会堆积重复行；
 * - `licensed_source` 从 `'placeholder'` 变成 `'incompetech-cc-by-4.0'` 之后，
 *   **re-seed 不会再动这三首**（seed 只清 `licensed_source = 'placeholder'` 的行）——这条性质有测试。
 *
 * ## 两道入库闸门（不合格就不写库）
 *
 * 1. **硬约束校验**：`validateSegmentTable`（段号连续、边界相接、每段 15–30s、总长 60–120s）不过 → 抛错、零写入；
 * 2. **人工复核闸门**：存在"起音不显著"的边界时，**默认拒绝入库**（`docs/architecture.md` §19.4：
 *    分段表必须先经用户听感确认）。用户确认后由调用方显式传 `allowUnreviewed: true`，
 *    且待复核项仍会出现在报告里（不静默）。
 */
import {
  LIBRARY_LICENSED_SOURCE,
  segmentsNeedingManualReview,
  validateSegmentTable,
  type LibraryMetadata,
} from '@music-drift/shared/audio';
import type { Db } from '../db/client.js';

export interface LibraryIngestOptions {
  /** 用户已完成听感确认时置 true（否则"有起音不显著边界"会直接拒绝入库）。 */
  allowUnreviewed?: boolean;
  /** `songs.licensed_source` 覆盖（默认 CC BY 4.0 标识）。 */
  licensedSource?: string;
}

export interface LibraryIngestReport {
  songs: number;
  segments: number;
  licensedSource: string;
  needsManualReview: Array<{ title: string; indexes: number[] }>;
}

/** 该 id 方案只对 1..9 的曲目序号产出**合法 UUID**（见 `segmentRowId` 的说明）。 */
export const LIBRARY_MAX_ORDINAL_FOR_SEED_IDS = 9;

/**
 * 段落 id 派生（与 `db/seed.ts` 的 `segmentId` **同一方案**）。
 *
 * ⚠️ 该方案把序号写进 UUID 的第三个分组末尾（`...-900<序号>-...`），
 * 所以**只有 1..9 是合法 UUID**：`ordinal=10` 会产出 13 位分组 → PG 直接报
 * `invalid input syntax for type uuid`（这是集成测试真实撞到的）。
 * 因此这里**主动拒绝**超出范围的序号，把"静默产出非法 id"变成"立刻报错"。
 * 曲库要从 3 首扩到 10 首以上时，seed 与 ingest 必须一起换一套派生方案（一次性迁移）。
 */
export function segmentRowId(ordinal: number, index: number): string {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > LIBRARY_MAX_ORDINAL_FOR_SEED_IDS) {
    throw new Error(
      `曲目序号 ${String(ordinal)} 超出该 id 方案的范围（1..${String(LIBRARY_MAX_ORDINAL_FOR_SEED_IDS)}）：` +
        '再多的曲目需要与 db/seed.ts 一起改用新的 id 派生方案（否则会生成非法 UUID）。',
    );
  }
  return `00000000-0000-4000-900${String(ordinal)}-${String(index).padStart(12, '0')}`;
}

/** 报告用：曲目标题清单。 */
export function songTitleFrom(metadata: LibraryMetadata): string {
  return metadata.tracks.map((track) => track.title).join(' / ');
}

export async function ingestLibrary(
  db: Db,
  metadata: LibraryMetadata,
  options: LibraryIngestOptions = {},
): Promise<LibraryIngestReport> {
  const licensedSource = options.licensedSource ?? LIBRARY_LICENSED_SOURCE;

  // ── 闸门 1：硬约束（先全量校验，再动手写；有任何不合格 → 一条 SQL 都不发）──
  for (const track of metadata.tracks) {
    const violations = validateSegmentTable(track.segments);
    if (violations.length > 0) {
      throw new Error(
        `曲目「${track.title}」的分段表不合法，拒绝入库：\n` +
          violations.map((violation) => `  · [${violation.code}] ${violation.message}`).join('\n'),
      );
    }
  }

  // ── 闸门 2：人工复核（分段表不得自行定稿）──
  const needsManualReview = metadata.tracks
    .map((track) => ({ title: track.title, indexes: segmentsNeedingManualReview(track) }))
    .filter((entry) => entry.indexes.length > 0);
  if (needsManualReview.length > 0 && options.allowUnreviewed !== true) {
    throw new Error(
      '以下曲目的分段边界"起音不显著"，需先经用户听感确认（听感通过后重跑并加 --allow-unreviewed）：\n' +
        needsManualReview
          .map((entry) => `  · ${entry.title}：第 ${entry.indexes.join('、')} 段边界`)
          .join('\n'),
    );
  }

  // ── 写入（幂等 upsert）──
  let segments = 0;
  for (const track of metadata.tracks) {
    await db.query(
      `insert into songs (id, title, total_segments, licensed_source)
       values ($1, $2, $3, $4)
       on conflict (id) do update
         set title = excluded.title,
             total_segments = excluded.total_segments,
             licensed_source = excluded.licensed_source`,
      [track.songId, track.title, track.segments.length, licensedSource],
    );

    for (const segment of track.segments) {
      await db.query(
        `insert into song_segments (id, song_id, "index", start_ms, duration_ms, accompaniment_ref)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update
           set start_ms = excluded.start_ms,
               duration_ms = excluded.duration_ms,
               accompaniment_ref = excluded.accompaniment_ref`,
        [
          segmentRowId(track.ordinal, segment.index),
          track.songId,
          segment.index,
          segment.startMs,
          segment.durationMs,
          track.accompanimentRef,
        ],
      );
      segments += 1;
    }
  }

  return { songs: metadata.tracks.length, segments, licensedSource, needsManualReview };
}
