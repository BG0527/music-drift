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

describe('W21 邮箱持久化退役', () => {
  it('新迁移删除 users.email 与 users_email_uniq，但保留历史迁移记录', async () => {
    const columns = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'users'`,
    );
    expect(columns.map((row) => row.column_name)).not.toContain('email');
    const indexes = await db.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = 'public' and tablename = 'users'`,
    );
    expect(indexes.map((row) => row.indexname)).not.toContain('users_email_uniq');
  });
});
