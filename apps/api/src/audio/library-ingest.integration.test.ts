/**
 * 曲库入库**真实数据库**集成测试（t13）。
 *
 * 验证三件在假 Db 上测不出的事：
 * 1. upsert 真的写进 `songs` / `song_segments`，且 `accompaniment_ref` / start_ms / duration_ms 与元数据一致；
 * 2. **幂等**：连跑两次行数不变（`on conflict (id) do update`）；
 * 3. **与 t5 种子的互不干扰**：入库后的曲目（`licensed_source = 'incompetech-cc-by-4.0'`）
 *    在 `runSeed()` 重跑后**依然存在**、字段不被改 —— 这是"占位歌换真歌"能长期成立的关键性质。
 *
 * ⚠️ 为避免与其他测试文件（共用同一个可抛弃测试库、且都用固定 id）互相踩，
 * 本文件用**专属序号 8/9**（seed 只用 1..3）与专属 songId，并在前后各清一次自己的行。
 * 序号必须 ≤9：id 方案把序号写进 UUID 分组里，两位数会变成非法 UUID（见 `segmentRowId`）。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { runSeed } from '../db/seed.js';
import { ingestLibrary } from './library-ingest.js';
import { embedLibraryFixture, type TrackFixture } from './library-fixture.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
const SONG_A = '00000000-0000-4000-8000-0000000000a8';
const SONG_B = '00000000-0000-4000-8000-0000000000b9';

function segmentsFor(durationMs: number) {
  return [1, 2, 3, 4].map((index) => ({
    index,
    startMs: (index - 1) * durationMs,
    endMs: index * durationMs,
    durationMs,
  }));
}

const fixture: TrackFixture[] = [
  {
    title: 'IT · Track A',
    songId: SONG_A,
    ordinal: 8,
    accompanimentRef: '/library/it-a.mp3',
    segments: segmentsFor(22_500),
  },
  {
    title: 'IT · Track B',
    songId: SONG_B,
    ordinal: 9,
    accompanimentRef: '/library/it-b.mp3',
    segments: segmentsFor(20_000),
  },
];

async function countRows(db: Db, songId: string): Promise<number> {
  const rows = await db.query<{ count: string }>(
    'select count(*)::text as count from song_segments where song_id = $1',
    [songId],
  );
  return Number(rows[0]?.count ?? '0');
}

describe('ingestLibrary：真实数据库', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createDb(DATABASE_URL);
    await db.query('delete from songs where id = any($1::uuid[])', [[SONG_A, SONG_B]]);
  });

  afterAll(async () => {
    if (db !== undefined) {
      await db.query('delete from songs where id = any($1::uuid[])', [[SONG_A, SONG_B]]);
      await db.close();
    }
  });

  it('写入 2 首 / 8 段，字段与元数据一致（含 accompaniment_ref）', async () => {
    const report = await ingestLibrary(db, embedLibraryFixture(fixture));

    expect(report.songs).toBe(2);
    expect(report.segments).toBe(8);
    expect(await countRows(db, SONG_A)).toBe(4);

    const rows = await db.query<{
      index: number;
      start_ms: number;
      duration_ms: number;
      accompaniment_ref: string;
      title: string;
      licensed_source: string;
      total_segments: number;
    }>(
      `select s."index", s.start_ms, s.duration_ms, s.accompaniment_ref, o.title, o.licensed_source, o.total_segments
       from song_segments s join songs o on o.id = s.song_id
       where s.song_id = $1 order by s."index" asc`,
      [SONG_A],
    );

    expect(rows.map((row) => row.index)).toEqual([1, 2, 3, 4]);
    expect(rows.map((row) => row.start_ms)).toEqual([0, 22_500, 45_000, 67_500]);
    expect(rows.every((row) => row.duration_ms === 22_500)).toBe(true);
    expect(rows.every((row) => row.accompaniment_ref === '/library/it-a.mp3')).toBe(true);
    expect(rows[0]?.title).toBe('IT · Track A');
    expect(rows[0]?.licensed_source).toBe('incompetech-cc-by-4.0');
    expect(rows[0]?.total_segments).toBe(4);
  });

  it('幂等：连跑两次行数不变，且第二次仍更新同一批行（不新增）', async () => {
    await ingestLibrary(db, embedLibraryFixture(fixture));
    const before = await countRows(db, SONG_A);

    const second = await ingestLibrary(db, embedLibraryFixture(fixture));

    expect(second.segments).toBe(8);
    expect(await countRows(db, SONG_A)).toBe(before);
    const total = await db.query<{ count: string }>(
      'select count(*)::text as count from song_segments where song_id = any($1::uuid[])',
      [[SONG_A, SONG_B]],
    );
    expect(Number(total[0]?.count)).toBe(8);
  });

  it('与种子互不干扰：runSeed() 重跑后，已入库的真曲目仍在且字段未被改', async () => {
    await runSeed(db);

    const rows = await db.query<{ title: string; licensed_source: string; start_ms: number }>(
      `select o.title, o.licensed_source, s.start_ms
       from songs o join song_segments s on s.song_id = o.id
       where o.id = $1 order by s."index" asc`,
      [SONG_B],
    );

    expect(rows).toHaveLength(4);
    expect(rows[0]?.title).toBe('IT · Track B');
    expect(rows[0]?.licensed_source).toBe('incompetech-cc-by-4.0');
    expect(rows[0]?.start_ms).toBe(0);
  });
});
