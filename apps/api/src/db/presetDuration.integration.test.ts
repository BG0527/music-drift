/**
 * t29：**每段时长由曲库预设值决定**（服务端权威）+ 校验语义改写。
 *
 * 用户第十一轮第 4 条：「录制时长不应该是动态 15-30 秒。一首歌被切割成四段，它的时长应该是固定的，
 * 而用户需要接的就是这段时长。」⇒ 分母不再来自上传者自报（`x-audio-duration-ms`），而来自
 * `song_segments.duration_ms`（`library.json` 的 CC BY 数据，经 `audio/library-ingest.ts` 幂等入库）。
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateSegmentAudioUpload } from '../audio/ingest.js';
import { createDb, type Db } from './client.js';
import { insertBottleSegment } from './segments.js';
import { insertBottle, insertSong, insertUser } from './test-helpers.js';

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgres://music_drift:music_drift_dev@localhost:5433/music_drift_test';

/** `library.json` 里 `Immersed` 的四段真实时长（CC BY）。 */
const IMMERSED_PRESETS = [23_870, 20_619, 22_501, 23_010];

let db: Db;

/** 建一首带**曲库预设**的歌：每段写进 `song_segments`。 */
async function insertSongWithPresets(presets: readonly number[]): Promise<string> {
  // `insertSong` 现在会先写默认 20000 预设（t31 夹具要求），这里覆盖为库曲真实值。
  const songId = await insertSong(db, presets.length);
  for (const [offset, durationMs] of presets.entries()) {
    await db.query(
      `insert into song_segments (id, song_id, "index", start_ms, duration_ms, accompaniment_ref)
       values ($1, $2, $3, $4, $5, null)
       on conflict (song_id, "index") do update set duration_ms = excluded.duration_ms`,
      [randomUUID(), songId, offset + 1, offset * 25_000, durationMs],
    );
  }
  return songId;
}

beforeAll(async () => {
  db = await createDb(DATABASE_URL);
});

afterAll(async () => {
  await db.close();
});

describe('t29：bottle_segments.duration_ms 以曲库预设为权威', () => {
  it('落库的是曲库预设时长，**不是**调用方（客户端）声明的时长', async () => {
    const songId = await insertSongWithPresets(IMMERSED_PRESETS);
    const { bottleId } = await insertBottle(db, { songId, totalSegments: 4 });
    const ownerId = await insertUser(db);

    const { id } = await insertBottleSegment(db, {
      bottleId,
      ownerId,
      index: 3,
      note: null,
      audio: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      audioMime: 'audio/webm',
      // 客户端谎报 15 秒（想压低分母让这一段更容易被踩）
      durationMs: 15_000,
    });

    const rows = await db.query<{ duration_ms: number }>(
      `select duration_ms from bottle_segments where id = $1`,
      [id],
    );

    expect(rows[0]?.duration_ms).toBe(IMMERSED_PRESETS[2]); // 22501，不是 15000
  });

  it('t31：没有预设行 → **明确拒绝**（fail-closed），绝不采用调用方（客户端）声明值', async () => {
    const songId = await insertSong(db, 4);
    // 真·无预设：夹具歌现在默认会带预设（t31），因此显式删掉它们来构造该前提
    // （不能建 0 段的歌：`songs_total_segments_check` 不允许）。
    await db.query(`delete from song_segments where song_id = $1`, [songId]);
    const { bottleId } = await insertBottle(db, { songId, totalSegments: 4 });
    const ownerId = await insertUser(db);

    await expect(
      insertBottleSegment(db, {
        bottleId,
        ownerId,
        index: 1,
        note: null,
        durationMs: 18_500,
      }),
    ).rejects.toThrow(/预设/);

    const rows = await db.query<{ count: string }>(
      `select count(*)::text as count from bottle_segments where bottle_id = $1`,
      [bottleId],
    );
    expect(rows[0]?.count).toBe('0'); // 零副作用：既不写客户端的 18500，也不写别的
  });
});

describe('t29：上传校验的时长语义 = 「必须匹配该段预设时长（±容差）」', () => {
  const presets = { presetDurationMs: 22_501 };
  const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x42]);

  it('偏差在容差内（±2000ms）→ 通过', () => {
    for (const durationMs of [22_501, 20_501, 24_501]) {
      const result = validateSegmentAudioUpload({ mime: 'audio/webm', bytes, durationMs }, presets);
      expect(result.ok, String(durationMs)).toBe(true);
    }
  });

  it('偏差超出容差 → 422 语义（AUDIO_DURATION_OUT_OF_RANGE）+ 文案说清「这一段有多长」', () => {
    const result = validateSegmentAudioUpload(
      { mime: 'audio/webm', bytes, durationMs: 15_000 },
      presets,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations[0]?.code).toBe('AUDIO_DURATION_OUT_OF_RANGE');
    expect(result.violations[0]?.message).toContain('22.5');
    expect(result.violations[0]?.message).toContain('15.0');
  });
});
