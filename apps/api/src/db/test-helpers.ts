/** 集成测试夹具（非应用运行时代码）：直接建最小可用的关联行。 */
import { randomUUID } from 'node:crypto';
import type { Db } from './client.js';

export async function insertUser(db: Db): Promise<string> {
  const userId = randomUUID();
  await db.query(`insert into users (id, handle, email, password_hash) values ($1, $2, $3, $4)`, [
    userId,
    `u-${userId.slice(0, 8)}`,
    `${userId.slice(0, 8)}@test.local`,
    'x',
  ]);
  return userId;
}

export async function insertSong(db: Db, totalSegments = 4): Promise<string> {
  const songId = randomUUID();
  await db.query(
    `insert into songs (id, title, total_segments, licensed_source) values ($1, $2, $3, $4)`,
    [songId, `song-${songId.slice(0, 8)}`, totalSegments, 'test'],
  );
  return songId;
}

export async function insertBottle(
  db: Db,
  cmd: { songId?: string; initiatorId?: string; totalSegments?: number; status?: string } = {},
): Promise<{ bottleId: string; songId: string; initiatorId: string }> {
  const songId = cmd.songId ?? (await insertSong(db, cmd.totalSegments ?? 4));
  const initiatorId = cmd.initiatorId ?? (await insertUser(db));
  const bottleId = randomUUID();
  await db.query(
    `insert into bottles (id, song_id, initiator_id, status, total_segments, revision, current_caster_id)
     values ($1, $2, $3, $4, $5, 1, $6)`,
    [bottleId, songId, initiatorId, cmd.status ?? 'IN_RIVER', cmd.totalSegments ?? 4, initiatorId],
  );
  return { bottleId, songId, initiatorId };
}
