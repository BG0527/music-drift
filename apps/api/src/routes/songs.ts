/** 曲库路由（t9，`docs/api.md` §2.3）：只读列表，含分段元数据与 `totalSegments`。 */
import type { FastifyInstance } from 'fastify';

import { createActorResolver } from '../http/session.js';
import type { Clock } from '@music-drift/shared/domain';
import type { Db } from '../db/client.js';
import type { BottleStore } from '../store/bottles.js';

export interface SongRoutesOptions {
  db: Db;
  store: BottleStore;
  clock: Clock;
}

export function registerSongRoutes(app: FastifyInstance, options: SongRoutesOptions): void {
  const actors = createActorResolver(options.db, options.clock);

  app.get('/api/songs', async (request, reply) => {
    // 曲库只读、不含用户数据：未登录可读（前端首屏选歌要用）。
    await actors.resolve(request);
    const songs = await options.store.listSongs();
    // 空曲库是**合法状态**（返回空数组），不是 404：否则前端无法区分「没有歌」与「接口不存在」。
    return reply.send(
      songs.map((song) => ({
        id: song.id,
        title: song.title,
        totalSegments: song.totalSegments,
        licensedSource: song.licensedSource,
        segments: song.segments,
      })),
    );
  });
}
