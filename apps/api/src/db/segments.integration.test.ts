/**
 * bottle_segments 的两条 DB 不变量（ADR-015 §16.1 / §17.5）：
 * 1. `(bottle_id, index) WHERE deleted_at IS NULL` 部分唯一索引 —— 同一段号同时至多一个**有效**段；
 *    软删后同段号可再插入 = **补位者占据缺口段号**。
 * 2. 段号必须在 `1..bottles.total_segments` 内（`total_segments` 是列，不是硬编码 4）。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from './client.js';
import { insertBottleSegment } from './segments.js';
import { insertBottle, insertUser } from './test-helpers.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';

describe('bottle_segments：补位段号不变量', () => {
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

  it('同一段号的第二条有效段被拒绝；软删该段后可以补位同一段号', async () => {
    const { bottleId } = await insertBottle(db);
    const first = await insertUser(db);
    const second = await insertUser(db);

    const bad = await insertBottleSegment(db, {
      bottleId,
      ownerId: first,
      index: 2,
      note: 'B 的第 2 段',
    });
    expect(bad.id).toBeTruthy();

    await expect(
      insertBottleSegment(db, { bottleId, ownerId: second, index: 2, note: '重复段号' }),
    ).rejects.toThrow(/bottle_segments_active_index_uniq|duplicate key/);

    // 斩浪：软删（位置留空，段号不压缩）→ 补位者可以占据同一段号
    await db.query(`update bottle_segments set deleted_at = now() where id = $1`, [bad.id]);
    const filler = await insertBottleSegment(db, {
      bottleId,
      ownerId: second,
      index: 2,
      note: '补位',
    });
    expect(filler.id).toBeTruthy();

    const live = await db.query<{ count: string }>(
      `select count(*)::text as count from bottle_segments where bottle_id = $1 and deleted_at is null`,
      [bottleId],
    );
    expect(live[0]?.count).toBe('1');
  });

  it('§17.5：段号越界（> total_segments）被写入侧拒绝且不落行', async () => {
    const { bottleId } = await insertBottle(db, { totalSegments: 5 });
    const owner = await insertUser(db);

    await expect(
      insertBottleSegment(db, { bottleId, ownerId: owner, index: 6, note: null }),
    ).rejects.toThrow(/段号越界/);
    await expect(
      insertBottleSegment(db, { bottleId, ownerId: owner, index: 0, note: null }),
    ).rejects.toThrow(/段号越界/);

    const fifth = await insertBottleSegment(db, { bottleId, ownerId: owner, index: 5, note: null });
    expect(fifth.id).toBeTruthy();

    const rows = await db.query<{ count: string }>(
      `select count(*)::text as count from bottle_segments where bottle_id = $1`,
      [bottleId],
    );
    expect(rows[0]?.count).toBe('1');
  });

  it('total_segments 是列：5 段歌的瓶子允许第 5 段，4 段歌的瓶子拒绝第 5 段', async () => {
    const five = await insertBottle(db, { totalSegments: 5 });
    const four = await insertBottle(db, { totalSegments: 4 });
    const owner = await insertUser(db);

    expect(
      (
        await insertBottleSegment(db, {
          bottleId: five.bottleId,
          ownerId: owner,
          index: 5,
          note: null,
        })
      ).id,
    ).toBeTruthy();
    await expect(
      insertBottleSegment(db, { bottleId: four.bottleId, ownerId: owner, index: 5, note: null }),
    ).rejects.toThrow(/段号越界/);
  });
});
