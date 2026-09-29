/**
 * 种子数据（t5）：≥3 首占位歌 × 每首 4 段，且**可重复执行**（幂等）。
 * 占位歌只提供分段元数据，不含音频（曲库音频等用户交付，CONTEXT §14 / D-07）。
 *
 * t10（用户裁决）：seed 幂等创建 admin 管理员账号（admin/admin123）——
 * 直插 users 绕开注册弱口令黑名单（admin123 ∈ COMMON_WEAK_PASSWORDS），登录只验哈希不受影响。
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createManualClock } from '@music-drift/shared/domain';
import { buildApp } from '../app.js';
import { verifyPassword } from '../auth/password.js';
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

// ── t10（用户裁决）：admin/admin123 进 db:seed ────────────────────────────────
// 直插 users（scrypt 哈希）绕开注册弱口令黑名单；登录只验哈希 ⇒ 策略不削弱。
describe('seed：admin 管理员账号（admin/admin123）', () => {
  let db: Db;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    db = await createDb(process.env['DATABASE_URL'] ?? '');
    app = buildApp({ db, clock: createManualClock(1_700_000_000_000) });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    if (db !== undefined) {
      await db.close();
    }
  });

  async function adminRow(): Promise<
    { handle: string; role: string; password_hash: string } | undefined
  > {
    const rows = await db.query<{ handle: string; role: string; password_hash: string }>(
      `select handle, role, password_hash from users where handle = $1`,
      ['admin'],
    );
    return rows[0];
  }

  it('幂等 upsert handle=admin：连跑两次结果逐字节一致，role=ADMIN 且口令 admin123 校验通过', async () => {
    await runSeed(db);
    const first = await adminRow();

    await runSeed(db);
    const second = await adminRow();

    expect(first, 'seed 应创建 handle=admin 账号').toBeDefined();
    expect(second).toEqual(first); // 跑两次结果一致（含 password_hash 字节）
    expect(first?.role).toBe('ADMIN');
    expect(first?.password_hash.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('admin123', first?.password_hash ?? '')).toBe(true);
  });

  it('登录 API：admin/admin123 → 200（账号即 handle，会话可用）', async () => {
    await runSeed(db);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      // 登录契约的正名是 account（= users.handle；LoginRequestSchema 的 refine 只认 account/email）
      payload: { account: 'admin', password: 'admin123' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.handle).toBe('admin');
  });

  it('passwordPolicy 不削弱：注册接口用 admin123 仍被拒 422 + WEAK_PASSWORD', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        account: `singer-${randomUUID().slice(0, 8)}`,
        password: 'admin123',
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.violations[0].code).toBe('WEAK_PASSWORD');
    expect(response.body).not.toContain('admin123');
  });

  it('普通用户注册不受影响：仍 201 且 role=USER', async () => {
    const handle = `singer-${randomUUID().slice(0, 8)}`;
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        account: handle,
        password: '潮汐-9Run-away',
      },
    });
    expect(response.statusCode).toBe(201);

    const rows = await db.query<{ role: string }>(`select role from users where handle = $1`, [
      handle,
    ]);
    expect(rows[0]?.role).toBe('USER');
  });
});
