/**
 * 曲库每段固定时长的读取（t29 的**权威来源**）。
 *
 * 为什么权威放这里：用户第十一轮第 4 条——「一首歌被切割成四段，它的时长应该是固定的，
 * 而用户需要接的就是这段时长」。段的长度由曲库切分决定（`library.json` 的 CC BY 数据，
 * 经 `audio/library-ingest.ts` 幂等写入 `song_segments`），**不由上传者自报**。
 *
 * 因此：
 * - `bottle_segments.duration_ms` 的写入值以本模块的读数为准（见 `db/segments.ts`）；
 * - 上传校验用它做「必须匹配该段预设时长（±容差）」判定（见 `audio/ingest.ts`）；
 * - 点踩门槛的分母由此成为**曲库值**，客户端谎报时长不再影响分母。
 *
 * 无预设行时返回 `null`（调用方自行决定回退口径）——**不猜、不编造默认时长**。
 */
import type { Queryable } from '../db/client.js';

export interface SongSegmentPreset {
  index: number;
  startMs: number;
  durationMs: number;
}

/** 按 (songId, index) 取该段的预设时长；没有该行 → `null`。 */
export async function presetDurationMsFor(
  queryable: Queryable,
  input: { songId: string; index: number },
): Promise<number | null> {
  const rows = await queryable.query<{ duration_ms: number }>(
    `select duration_ms from song_segments where song_id = $1 and "index" = $2`,
    [input.songId, input.index],
  );
  const value = rows[0]?.duration_ms;
  return typeof value === 'number' && value > 0 ? value : null;
}

/** 一首歌的全部段落预设（前端「我要接的这一段是多少秒」与曲面展示用）。 */
export async function presetsForSong(
  queryable: Queryable,
  songId: string,
): Promise<SongSegmentPreset[]> {
  const rows = await queryable.query<{ index: number; start_ms: number; duration_ms: number }>(
    `select "index", start_ms, duration_ms from song_segments where song_id = $1 order by "index"`,
    [songId],
  );
  return rows.map((row) => ({
    index: row.index,
    startMs: row.start_ms,
    durationMs: row.duration_ms,
  }));
}

/** 瓶子所属的歌（写入路径需要它来查预设）。 */
export async function songIdOfBottle(
  queryable: Queryable,
  bottleId: string,
): Promise<string | null> {
  const rows = await queryable.query<{ song_id: string }>(
    `select song_id from bottles where id = $1`,
    [bottleId],
  );
  return rows[0]?.song_id ?? null;
}

/** 一步到位：按 (瓶子, 段号) 取预设时长（写入路径与校验路径共用）。 */
export async function presetDurationMsOfBottle(
  queryable: Queryable,
  input: { bottleId: string; index: number },
): Promise<number | null> {
  const songId = await songIdOfBottle(queryable, input.bottleId);
  if (songId === null) {
    return null;
  }
  return await presetDurationMsFor(queryable, { songId, index: input.index });
}
