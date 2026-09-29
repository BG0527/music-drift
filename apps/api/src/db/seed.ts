/**
 * 种子数据（t5）：3 首**占位**歌 × 每首 4 段。
 *
 * - 只提供分段元数据，**不含音频**：曲库音频等用户交付后再接（CONTEXT §14 / D-07 / §18）。
 * - 幂等：固定 UUID + upsert，重复执行结果不变（可安全纳入 CI 与本地重跑）。
 * - `licensed_source = 'placeholder'` 便于与将来用户提供的曲库区分，且 seed 只动这一类。
 *
 * t10（用户裁决）：幂等创建管理员账号 `admin/admin123` —— 用 auth/password.ts 的
 * hashPassword（scrypt）生成哈希**直插 users 表**，绕开注册接口的弱口令黑名单
 * （admin123 ∈ COMMON_WEAK_PASSWORDS）。登录只验哈希不受影响；**不得**为此改 passwordPolicy。
 */
import { createHash } from 'node:crypto';
import { hashPassword } from '../auth/password.js';
import { createDb, type Db } from './client.js';

export const PLACEHOLDER_SOURCE = 'placeholder';

/** 每段 20 秒、4 段共 80 秒，落在 CONTEXT §14.1「每段 15–30s、总 60–120s」区间内。 */
const SEGMENT_DURATION_MS = 20_000;

/** t10（用户裁决）：管理员种子账号。口令 admin123 的明文是裁决的一部分（演示账号，不承担保密性）。 */
export const SEED_ADMIN = {
  handle: 'admin',
  password: 'admin123',
  role: 'ADMIN',
} as const;

/**
 * 管理员口令哈希（**固定 salt** = sha256('music-drift/seed/admin')）。
 *
 * 为什么不能用随机 salt：seed 的硬要求是「跑两次结果一致」（字节级幂等）——
 * 随机 salt 会让第二次 upsert 改写 password_hash，同一份种子跑出不同的行。
 * 固定 salt 走的是 password.ts 既有的「显式 salt（可复现）」入口；登录只走
 * verifyPassword（解析哈希自带的参数与 salt），校验逻辑零特判。
 */
function adminPasswordHash(): string {
  const salt = createHash('sha256').update('music-drift/seed/admin').digest();
  return hashPassword(SEED_ADMIN.password, { salt });
}

interface PlaceholderSong {
  /** 曲目序号：用于派生固定的段落 id（**不能**用 songId 切片派生，会撞车）。 */
  ordinal: number;
  id: string;
  title: string;
  totalSegments: number;
}

/** 固定 UUID：种子必须可重复执行，绝不使用随机 id。 */
export const PLACEHOLDER_SONGS: readonly PlaceholderSong[] = [
  {
    ordinal: 1,
    id: '00000000-0000-4000-8000-000000000001',
    title: '占位曲目 · 一',
    totalSegments: 4,
  },
  {
    ordinal: 2,
    id: '00000000-0000-4000-8000-000000000002',
    title: '占位曲目 · 二',
    totalSegments: 4,
  },
  {
    ordinal: 3,
    id: '00000000-0000-4000-8000-000000000003',
    title: '占位曲目 · 三',
    totalSegments: 4,
  },
];

/** 段落 id 显式派生自「曲目序号 + 段号」，保证每个 (歌曲, 段号) 都有唯一且稳定的 id。 */
export function segmentId(ordinal: number, index: number): string {
  return `00000000-0000-4000-900${ordinal}-${String(index).padStart(12, '0')}`;
}

export async function runSeed(
  db: Db,
): Promise<{ songs: number; segments: number; admin: string }> {
  let segments = 0;
  const songIds = PLACEHOLDER_SONGS.map((song) => song.id);
  const segmentIds = PLACEHOLDER_SONGS.flatMap((song) =>
    Array.from({ length: song.totalSegments }, (_unused, offset) =>
      segmentId(song.ordinal, offset + 1),
    ),
  );

  // 收敛（只动 licensed_source = 'placeholder' 的行）：
  // ① 清掉已不在清单里的占位歌（级联删段落）；② 清掉占位歌里 id 已不在清单的旧段落。
  // 没有这一步，任何一次「id 方案变化」都会让 seed 二次执行时撞 (song_id, index) 唯一键。
  await db.query(`delete from songs where licensed_source = $1 and id <> all($2::uuid[])`, [
    PLACEHOLDER_SOURCE,
    songIds,
  ]);
  await db.query(
    `delete from song_segments where song_id = any($1::uuid[]) and id <> all($2::uuid[])`,
    [songIds, segmentIds],
  );
  for (const song of PLACEHOLDER_SONGS) {
    await db.query(
      `insert into songs (id, title, total_segments, licensed_source)
       values ($1, $2, $3, $4)
       on conflict (id) do update set title = excluded.title, total_segments = excluded.total_segments`,
      [song.id, song.title, song.totalSegments, PLACEHOLDER_SOURCE],
    );
    for (let index = 1; index <= song.totalSegments; index += 1) {
      await db.query(
        `insert into song_segments (id, song_id, "index", start_ms, duration_ms, accompaniment_ref)
         values ($1, $2, $3, $4, $5, null)
         on conflict (id) do update set start_ms = excluded.start_ms, duration_ms = excluded.duration_ms`,
        [
          segmentId(song.ordinal, index),
          song.id,
          index,
          (index - 1) * SEGMENT_DURATION_MS,
          SEGMENT_DURATION_MS,
        ],
      );
      segments += 1;
    }
  }
  // t10：管理员账号 upsert（幂等；handle 唯一键冲突时收敛 role 与口令哈希）。
  // 直插 users 绕开注册弱口令黑名单（admin123 ∈ COMMON_WEAK_PASSWORDS）——
  // 登录只验哈希，passwordPolicy 不需要改、也不允许为此改（注册 admin123 仍必须被拒）。
  await db.query(
    `insert into users (handle, password_hash, role)
     values ($1, $2, $3)
     on conflict (handle) do update set password_hash = excluded.password_hash, role = excluded.role`,
    [SEED_ADMIN.handle, adminPasswordHash(), SEED_ADMIN.role],
  );
  return { songs: PLACEHOLDER_SONGS.length, segments, admin: SEED_ADMIN.handle };
}

if (process.argv[1]?.includes('seed')) {
  const db = await createDb(process.env['DATABASE_URL'] ?? '');
  try {
    const result = await runSeed(db);
    process.stdout.write(
      `seed ok: ${result.songs} songs / ${result.segments} segments / admin=${result.admin}\n`,
    );
  } finally {
    await db.close();
  }
}
