/**
 * 集成测试夹具（非应用运行时代码）：直接建最小可用的关联行。
 *
 * `listenUntilThreshold` 是唯一一个"走 HTTP"的夹具：点踩门槛由服务端读持久化覆盖率判定（t20），
 * 而覆盖率只能通过真实端点写入（增长还按墙上时间限速）——所以它必须打真请求、并**真等一小会儿**。
 */
import { randomUUID } from 'node:crypto';
import { DEFAULT_POLICY } from '@music-drift/shared/domain';
import { LISTEN_GROWTH } from '../store/listenProgress.js';
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

/**
 * 让 `cookie` 对 `segmentId` 达到点踩门槛（t20）：两次真实上报 + 一次真实等待。
 *
 * 为什么要等：首次上报最多记 `时长 × 0.5`，之后每次最多按
 * `真实耗时 × RATE_TOLERANCE + RATE_SLACK_MS` 增长（防伪造）。等待时长按段长算出来，
 * 因此调用方只需在**投踩之前**批量调用一次（多个用户可共用同一次等待）。
 */
export async function listenUntilThresholdBatch(
  app: { inject: (options: Record<string, unknown>) => Promise<{ statusCode: number; body: string }> },
  cookies: readonly string[],
  segmentId: string,
  durationMs: number,
): Promise<void> {
  const report = async (cookie: string, coveredMs: number): Promise<number> =>
    (
      await app.inject({
        method: 'POST',
        url: '/api/segments/' + segmentId + '/listen',
        payload: { coveredMs },
        headers: { cookie },
      })
    ).statusCode;

  for (const cookie of cookies) {
    const first = await report(cookie, durationMs);
    if (first !== 200) {
      throw new Error('listenUntilThreshold：首报失败 ' + String(first));
    }
  }
  const neededMs =
    (DEFAULT_POLICY.dislikeListenRatioThreshold - LISTEN_GROWTH.FIRST_REPORT_MAX_RATIO) * durationMs -
    LISTEN_GROWTH.RATE_SLACK_MS;
  const waitMs = Math.max(0, Math.ceil(neededMs / LISTEN_GROWTH.RATE_TOLERANCE)) + 400;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  for (const cookie of cookies) {
    const second = await report(cookie, durationMs);
    if (second !== 200) {
      throw new Error('listenUntilThreshold：第二报失败 ' + String(second));
    }
  }
}

/** 单人版（内部走批量版；多人场景请直接用批量版共用一次等待）。 */
export async function listenUntilThreshold(
  app: { inject: (options: Record<string, unknown>) => Promise<{ statusCode: number; body: string }> },
  cookie: string,
  segmentId: string,
  durationMs: number,
): Promise<void> {
  await listenUntilThresholdBatch(app, [cookie], segmentId, durationMs);
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
