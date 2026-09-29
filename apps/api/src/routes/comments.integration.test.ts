import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PublicCommentPageSchema, PublicCommentSchema, ReportSchema } from '@music-drift/shared';
import { buildApp } from '../app.js';
import { createDb, type Db } from '../db/client.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
const PASSWORD = 'RiverSong2026';
let db: Db;
let app: ReturnType<typeof buildApp>;

async function register(prefix: string): Promise<{ cookie: string; userId: string; account: string }> {
  const account = `${prefix}-${randomUUID().slice(0, 8)}`;
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { account, password: PASSWORD },
  });
  expect(response.statusCode).toBe(201);
  return {
    cookie:
      (Array.isArray(response.headers['set-cookie'])
        ? response.headers['set-cookie'][0]
        : response.headers['set-cookie'])?.split(';')[0] ?? '',
    userId: (response.json() as { user: { id: string } }).user.id,
    account,
  };
}

async function seaBottle(initiatorId: string, status = 'SEA'): Promise<string> {
  const songId = randomUUID();
  const bottleId = randomUUID();
  await db.query(
    `insert into songs (id, title, total_segments, licensed_source) values ($1, '评论测试曲', 1, 'test')`,
    [songId],
  );
  await db.query(
    `insert into bottles (id, song_id, initiator_id, status, total_segments, revision, sea_at)
     values ($1, $2, $3, $4, 1, 1, case when $4 = 'SEA' then now() else null end)`,
    [bottleId, songId, initiatorId, status],
  );
  return bottleId;
}

beforeAll(async () => {
  db = await createDb(DATABASE_URL);
  app = buildApp({ db, logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('W19 公海公开评论', () => {
  it('登录用户可在 SEA 创建实名纯文本评论，匿名访客可读', async () => {
    const author = await register('comment-author');
    const bottleId = await seaBottle(author.userId);

    const created = await app.inject({
      method: 'POST',
      url: `/api/bottles/${bottleId}/comments`,
      headers: { cookie: author.cookie },
      payload: { content: '  顺流而歌  ' },
    });
    expect(created.statusCode).toBe(201);
    expect(PublicCommentSchema.parse(created.json())).toMatchObject({
      bottleId,
      content: '顺流而歌',
      authorAccount: author.account,
      isMine: true,
    });

    const listed = await app.inject({ method: 'GET', url: `/api/bottles/${bottleId}/comments` });
    expect(listed.statusCode).toBe(200);
    expect(PublicCommentPageSchema.parse(listed.json()).items).toMatchObject([
      { content: '顺流而歌', authorAccount: author.account, isMine: false },
    ]);
  });

  it('只有作者可软删；删除后普通列表消失但正文仍留作审核证据', async () => {
    const author = await register('delete-author');
    const other = await register('delete-other');
    const bottleId = await seaBottle(author.userId);
    const created = await app.inject({
      method: 'POST',
      url: `/api/bottles/${bottleId}/comments`,
      headers: { cookie: author.cookie },
      payload: { content: '请保留这条审核证据' },
    });
    const commentId = PublicCommentSchema.parse(created.json()).id;

    const forbidden = await app.inject({
      method: 'DELETE',
      url: `/api/comments/${commentId}`,
      headers: { cookie: other.cookie },
    });
    expect(forbidden.statusCode).toBe(403);

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/comments/${commentId}`,
      headers: { cookie: author.cookie },
    });
    expect(removed.statusCode).toBe(204);
    const listed = PublicCommentPageSchema.parse(
      (await app.inject({ method: 'GET', url: `/api/bottles/${bottleId}/comments` })).json(),
    );
    expect(listed.items).toEqual([]);
    const rows = await db.query<{ content: string; deleted_at: Date | null }>(
      `select content, deleted_at from public_comments where id = $1`,
      [commentId],
    );
    expect(rows[0]?.content).toBe('请保留这条审核证据');
    expect(rows[0]?.deleted_at).toBeInstanceOf(Date);
  });

  it('只能举报他人评论，作者软删后管理员仍可凭正文证据完成 REMOVE_COMMENT', async () => {
    const author = await register('report-author');
    const reporter = await register('report-reader');
    const admin = await register('report-admin');
    await db.query(`update users set role = 'ADMIN' where id = $1`, [admin.userId]);
    const bottleId = await seaBottle(author.userId);
    const created = PublicCommentSchema.parse(
      (
        await app.inject({
          method: 'POST',
          url: `/api/bottles/${bottleId}/comments`,
          headers: { cookie: author.cookie },
          payload: { content: '即使删除也要留给审核员' },
        })
      ).json(),
    );

    const selfReport = await app.inject({
      method: 'POST',
      url: '/api/reports',
      headers: { cookie: author.cookie },
      payload: { targetType: 'COMMENT', targetId: created.id, reason: '不能举报自己' },
    });
    expect(selfReport.statusCode).toBe(403);

    const reported = await app.inject({
      method: 'POST',
      url: '/api/reports',
      headers: { cookie: reporter.cookie },
      payload: { targetType: 'COMMENT', targetId: created.id, reason: '请人工判断' },
    });
    expect(reported.statusCode).toBe(204);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/comments/${created.id}`,
          headers: { cookie: author.cookie },
        })
      ).statusCode,
    ).toBe(204);

    const queue = await app.inject({
      method: 'GET',
      url: '/api/admin/reports?status=PENDING',
      headers: { cookie: admin.cookie },
    });
    const report = (queue.json() as unknown[])
      .map((item) => ReportSchema.parse(item))
      .find((item) => item.targetId === created.id);
    expect(report?.commentEvidence).toMatchObject({
      content: '即使删除也要留给审核员',
      authorAccount: author.account,
    });
    expect(report?.commentEvidence?.deletedAt).not.toBeNull();

    const decision = await app.inject({
      method: 'POST',
      url: `/api/admin/reports/${String(report?.id)}/decision`,
      headers: { cookie: admin.cookie },
      payload: { decision: 'REMOVE_COMMENT' },
    });
    expect(decision.statusCode).toBe(200);
    expect(ReportSchema.parse(decision.json()).action).toBe('REMOVE_COMMENT');
  });

  it('按 created_at/id 稳定游标每页最多 20 条；离海隐藏且拒绝新评论，再入海恢复旧数据', async () => {
    const author = await register('page-author');
    const bottleId = await seaBottle(author.userId);
    for (let index = 0; index < 21; index += 1) {
      await db.query(
        `insert into public_comments (id, bottle_id, author_id, content, created_at)
         values ($1, $2, $3, $4, $5)`,
        [
          randomUUID(),
          bottleId,
          author.userId,
          `评论-${String(index)}`,
          new Date(Date.UTC(2026, 8, 29, 0, 0, index)),
        ],
      );
    }
    const first = PublicCommentPageSchema.parse(
      (await app.inject({ method: 'GET', url: `/api/bottles/${bottleId}/comments` })).json(),
    );
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    const second = PublicCommentPageSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/api/bottles/${bottleId}/comments?cursor=${encodeURIComponent(String(first.nextCursor))}`,
        })
      ).json(),
    );
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(21);

    await db.query(`update bottles set status = 'IN_RIVER', sea_at = null where id = $1`, [bottleId]);
    expect(
      (await app.inject({ method: 'GET', url: `/api/bottles/${bottleId}/comments` })).statusCode,
    ).toBe(404);
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/bottles/${bottleId}/comments`,
      headers: { cookie: author.cookie },
      payload: { content: '离海期间不能发布' },
    });
    expect(rejected.statusCode).toBe(422);
    expect(rejected.body).toContain('COMMENT_BOTTLE_LEFT_SEA');

    await db.query(`update bottles set status = 'SEA', sea_at = now() where id = $1`, [bottleId]);
    const restored = PublicCommentPageSchema.parse(
      (await app.inject({ method: 'GET', url: `/api/bottles/${bottleId}/comments` })).json(),
    );
    expect(restored.items).toHaveLength(20);
  });
});
