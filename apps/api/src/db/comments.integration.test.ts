import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from './client.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
let db: Db;

beforeAll(async () => {
  db = await createDb(DATABASE_URL);
});

afterAll(async () => {
  await db.close();
});

describe('W19 公开评论迁移', () => {
  it('建立 public_comments 与稳定分页索引，并允许软删除保留正文', async () => {
    const columns = await db.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable
       from information_schema.columns
       where table_schema = 'public' and table_name = 'public_comments'
       order by ordinal_position`,
    );
    expect(columns.map((row) => row.column_name)).toEqual([
      'id',
      'bottle_id',
      'author_id',
      'content',
      'deleted_at',
      'created_at',
    ]);
    expect(columns.find((row) => row.column_name === 'deleted_at')?.is_nullable).toBe('YES');

    const indexes = await db.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = 'public' and tablename = 'public_comments'`,
    );
    expect(indexes.map((row) => row.indexname)).toContain('public_comments_bottle_created_idx');
  });
});
