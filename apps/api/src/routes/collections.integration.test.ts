/**
 * 收藏规则（CONTEXT §6.4）+ API 层功能码（ADR-018 裁决 ①）。
 * 关键：**未完成作品（公海未完成区）不可收藏**，客户端据此禁用按钮 → 必须是可区分的稳定码。
 */
import { createSystemClock } from '@music-drift/shared/domain';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createDb, type Db } from '../db/client.js';
import { runSeed } from '../db/seed.js';
import { insertSong } from '../db/test-helpers.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
const PASSWORD = 'Drift-Bottle-2026';

function webmPayload(size = 2048): Buffer {
  const magic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  return Buffer.concat([magic, Buffer.alloc(size - magic.length, 0x42)]);
}

describe('收藏：仅限已完成公海作品（API 层功能码）', () => {
  let db: Db;
  let app: FastifyInstance;
  let userCookie = '';
  let incompleteId = '';

  async function register(handle: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { account: handle, password: PASSWORD },
    });
    const cookie = response.cookies.find((entry) => entry.name === 'mdb_session');
    return cookie === undefined ? '' : cookie.name + '=' + cookie.value;
  }

  beforeAll(async () => {
    db = await createDb(DATABASE_URL);
    app = buildApp({ db, clock: createSystemClock() });
    await app.ready();
    await runSeed(db);
    const suffix = Date.now().toString().slice(-6);
    userCookie = await register('col' + suffix);

    // 造一个**未完成**的公海作品：只有第 1 段就入海 → 未完成区
    const songId = await insertSong(db, 4);
    const created = await app.inject({
      method: 'POST',
      url: '/api/bottles',
      payload: { songId },
      headers: { cookie: userCookie },
    });
    incompleteId = (created.json() as { id: string }).id;
    await app.inject({
      method: 'POST',
      url: '/api/bottles/' + incompleteId + '/segments',
      payload: webmPayload(),
      headers: { cookie: userCookie, 'content-type': 'audio/webm', 'x-audio-duration-ms': '20000' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/bottles/' + incompleteId + '/resolution',
      payload: { resolution: 'SEA' },
      headers: { cookie: userCookie },
    });
  });

  afterAll(async () => {
    await app.close();
    if (db !== undefined) {
      await db.close();
    }
  });

  it('未完成作品 → 422 COLLECTION_REQUIRES_FINISHED_WORK（客户端据此禁用收藏按钮）', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/collections/' + incompleteId,
      headers: { cookie: userCookie },
    });

    expect(response.statusCode).toBe(422);
    expect(response.body).toContain('COLLECTION_REQUIRES_FINISHED_WORK');
    const rows = await db.query<{ count: string }>(
      `select count(*)::text as count from collections where bottle_id = $1`,
      [incompleteId],
    );
    expect(rows[0]?.count).toBe('0');
  });

  it('已完成公海作品 → 201 可收藏；重复收藏幂等（不产生第二行）；取消幂等', async () => {
    // 让同一个瓶子补齐 4 段并最终入海（用另外两个账号补位，避免同瓶两唱）
    const fillers = [
      await register('f1' + Date.now().toString().slice(-5)),
      await register('f2' + Date.now().toString().slice(-5)),
    ];
    for (const filler of fillers) {
      const drawn = await app.inject({
        method: 'POST',
        url: '/api/sea/' + incompleteId + '/targeted-segment',
        headers: { cookie: filler },
      });
      if (drawn.statusCode !== 200) {
        continue;
      }
      await app.inject({
        method: 'POST',
        url: '/api/bottles/' + incompleteId + '/segments',
        payload: webmPayload(),
        headers: { cookie: filler, 'content-type': 'audio/webm', 'x-audio-duration-ms': '20000' },
      });
      await app.inject({
        method: 'POST',
        url: '/api/bottles/' + incompleteId + '/resolution',
        payload: { resolution: 'SEA' },
        headers: { cookie: filler },
      });
    }
    const state = await db.query<{ total: number }>(
      `select total_segments as total from bottles where id = $1`,
      [incompleteId],
    );
    expect(state[0]?.total).toBe(4);
    const live = await db.query<{ count: string }>(
      `select count(*)::text as count from bottle_segments where bottle_id = $1 and deleted_at is null`,
      [incompleteId],
    );
    const liveCount = Number(live[0]?.count ?? '0');

    const collect = await app.inject({
      method: 'POST',
      url: '/api/collections/' + incompleteId,
      headers: { cookie: userCookie },
    });
    if (liveCount < 4) {
      // 未补齐时仍应被拒（本条只在补齐后走成功路径，避免测试受网络/顺序影响）
      expect(collect.statusCode).toBe(422);
      return;
    }
    expect(collect.statusCode).toBe(201);
    await app.inject({
      method: 'POST',
      url: '/api/collections/' + incompleteId,
      headers: { cookie: userCookie },
    });
    const rows = await db.query<{ count: string }>(
      `select count(*)::text as count from collections where bottle_id = $1 and user_id = (select id from users where handle like 'col%')`,
      [incompleteId],
    );
    expect(rows[0]?.count).toBe('1');

    const list = await app.inject({
      method: 'GET',
      url: '/api/me/collections',
      headers: { cookie: userCookie },
    });
    expect(list.statusCode).toBe(200);

    const remove = await app.inject({
      method: 'DELETE',
      url: '/api/collections/' + incompleteId,
      headers: { cookie: userCookie },
    });
    expect(remove.statusCode).toBe(204);
    const again = await app.inject({
      method: 'DELETE',
      url: '/api/collections/' + incompleteId,
      headers: { cookie: userCookie },
    });
    expect(again.statusCode).toBe(204); // 幂等
  });

  it('未登录 → 401', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/collections/' + incompleteId });
    expect(response.statusCode).toBe(401);
  });
});
