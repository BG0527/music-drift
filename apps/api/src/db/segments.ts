/**
 * 接唱片段的写入路径。
 *
 * §17.5：段号必须在 `1..bottles.total_segments` 内才允许写入 —— 写入侧主动校验，
 * **不依赖**内核 `replayBottle` 的兜底来掩盖脏数据。
 * 段号本身是「歌里的固定位置」，斩浪只软删、位置留空（ADR-015 §16.1）；
 * 「同段号同时至多一个有效段」由 `bottle_segments_active_index_uniq` 部分唯一索引保证。
 */
import type { Queryable } from './client.js';
import { presetDurationMsOfBottle } from '../store/segments.js';

export interface InsertBottleSegmentCommand {
  /**
   * 段落 id：**应传内核事件里的 `segmentId`**。
   * 不传时由 DB 生成 `gen_random_uuid()`，但那样会与事件流里的 id 不一致 ——
   * 投票外键（`votes.segment_id`）、音频播放地址、重放都会对不上（集成测试抓到过）。
   */
  id?: string;
  bottleId: string;
  ownerId: string;
  /** 歌里的固定段落位置（1-based）。 */
  index: number;
  note: string | null;
  audio?: Buffer | null;
  audioMime?: string | null;
  durationMs?: number | null;
  createdAt?: Date;
}

export async function insertBottleSegment(
  db: Queryable,
  cmd: InsertBottleSegmentCommand,
): Promise<{ id: string }> {
  const bottles = await db.query<{ total_segments: number }>(
    `select total_segments from bottles where id = $1`,
    [cmd.bottleId],
  );
  const totalSegments = bottles[0]?.total_segments;
  if (totalSegments === undefined) {
    throw new Error(`瓶子不存在，无法写入段落：${cmd.bottleId}`);
  }
  if (!Number.isInteger(cmd.index) || cmd.index < 1 || cmd.index > totalSegments) {
    throw new Error(
      `段号越界：index=${cmd.index} 不在 1..${totalSegments}（瓶子 ${cmd.bottleId}）`,
    );
  }

  /**
   * t29：**分母的权威来源是曲库预设时长**，不是上传者自报的 `x-audio-duration-ms`。
   * 客户端那个值只能当"提示/诊断"，不参与判定 —— 否则谎报时长就能改变点踩门槛（F2 的根因）。
   * 回退：该段没有预设行（历史/异常数据）时才用调用方声明值，避免写入 NULL 让覆盖率口径整体 fail-closed。
   */
  const presetDurationMs = await presetDurationMsOfBottle(db, {
    bottleId: cmd.bottleId,
    index: cmd.index,
  });
  const durationToStore = presetDurationMs ?? cmd.durationMs ?? null;

  const rows = await db.query<{ id: string }>(
    `insert into bottle_segments (id, bottle_id, owner_id, "index", note, audio, audio_mime, duration_ms, created_at)
     values (coalesce($9::uuid, gen_random_uuid()), $1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()))
     returning id`,
    [
      cmd.bottleId,
      cmd.ownerId,
      cmd.index,
      cmd.note,
      cmd.audio ?? null,
      cmd.audioMime ?? null,
      durationToStore,
      cmd.createdAt ?? null,
      cmd.id ?? null,
    ],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new Error('段落写入没有返回行');
  }
  return { id: row.id };
}

/** 作品当前的有效段（按段号升序）——t8 混音、t9 详情都从这里取。 */
export async function liveSegmentsOf(
  db: Queryable,
  bottleId: string,
): Promise<
  Array<{
    id: string;
    index: number;
    ownerId: string;
    note: string | null;
    audioMime: string | null;
  }>
> {
  const rows = await db.query<{
    id: string;
    index: number;
    owner_id: string;
    note: string | null;
    audio_mime: string | null;
  }>(
    `select id, "index", owner_id, note, audio_mime
     from bottle_segments
     where bottle_id = $1 and deleted_at is null
     order by "index" asc`,
    [bottleId],
  );
  return rows.map((row) => ({
    id: row.id,
    index: row.index,
    ownerId: row.owner_id,
    note: row.note,
    audioMime: row.audio_mime,
  }));
}
