/**
 * 种子数据（t5）：≥3 首占位歌 × 每首 4 段，且**可重复执行**（幂等）。
 * 占位歌只提供分段元数据，不含音频（曲库音频等用户交付，CONTEXT §14 / D-07）。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from './client.js';
import { PLACEHOLDER_SOURCE, runSeed } from './seed.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';

async function placeholderStats(
  db: Db,
): Promise<{ songs: number; segments: number[]; durationsMs: number[] }> {
  const songs = await db.query<{ id: string; total_segments: number }>(
    `select id, total_segments from songs where licensed_source = $1 order by id`,
    [PLACEHOLDER_SOURCE],
  );
  const segments = await db.query<{ duration_ms: number; song_id: string }>(
    `select ss.duration_ms, ss.song_id from song_segments ss
     join songs s on s.id = ss.song_id
     where s.licensed_source = $1
     order by ss.song_id, ss."index"`,
    [PLACEHOLDER_SOURCE],
  );
  const perSong = songs.map(
    (song) => segments.filter((segment) => segment.song_id === song.id).length,
  );
  return {
    songs: songs.length,
    segments: perSong,
    durationsMs: segments.map((segment) => segment.duration_ms),
  };
}

describe('seed：占位曲库', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createDb(DATABASE_URL);
  });

  afterAll(async () => {
    // 客户端可能压根没建起来（例如缺 DATABASE_URL）：teardown 不应再抛次生错误，
    // 否则真正的首因（连接配置问题）会被 TypeError 掩盖。
    if (db !== undefined) {
      await db.close();
    }
  });

  it('至少 3 首占位歌、每首 4 段、每段 15–30 秒；连跑两次结果不变（幂等）', async () => {
    await runSeed(db);
    const first = await placeholderStats(db);

    await runSeed(db);
    const second = await placeholderStats(db);

    expect(second).toEqual(first);
    expect(first.songs).toBeGreaterThanOrEqual(3);
    expect(first.segments.every((count) => count === 4)).toBe(true);
    expect(first.durationsMs.every((duration) => duration >= 15_000 && duration <= 30_000)).toBe(
      true,
    );
  });

  it('seed 只写占位曲库，不碰其它 licensed_source 的歌曲', async () => {
    await db.query(
      `insert into songs (id, title, total_segments, licensed_source) values (gen_random_uuid(), $1, 4, $2)`,
      ['别人写的歌', 'user-provided'],
    );
    await runSeed(db);

    const rows = await db.query<{ count: string }>(
      `select count(*)::text as count from songs where licensed_source = 'user-provided'`,
      [],
    );
    expect(rows[0]?.count).toBe('1');
  });
});
