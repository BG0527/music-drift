/**
 * **API 级泄漏测试**（captain 硬要求）：底层错误不得进响应体。
 *
 * 为什么必须有：Fastify 默认错误处理器会把 `error.message` **原样回显** ——
 * 一个 pg 报错会泄漏表名、约束名、SQL 片段、驱动错误码甚至堆栈。
 * 这里用「必然抛错」的假 Db 把真实故障注入进来（DB-free，跑在默认基线），
 * 断言响应是 5xx + **固定中文文案**，且不含任何内部细节；原始错误只进服务端日志。
 */
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { Db } from '../db/client.js';

/** 故意构造「最像真实泄漏源」的错误：约束名 + 表名 + SQL + 堆栈 + 驱动码。 */
const LEAK_SOURCE = [
  'insert or update on table "votes" violates foreign key constraint',
  '"votes_segment_id_bottle_segments_id_fk"',
  'select * from bottle_segments where id = $1',
  'at Object.query (D:/Develop/projects/music/apps/api/src/db/client.ts:59:28)',
  'code: 23503',
  'ECONNREFUSED 127.0.0.1:5433',
].join(' ');

/** 响应体里绝不允许出现的模式（白名单外的表名/约束名/SQL/堆栈/驱动码/英文错误串）。 */
const LEAK_PATTERNS = [
  'votes',
  'bottle_segments',
  'foreign key',
  'constraint',
  'duplicate key',
  'select ',
  'insert ',
  'update ',
  'at Object.',
  'at async',
  'client.ts',
  '23503',
  'ECONNREFUSED',
  'pg_',
  '127.0.0.1',
  'Error',
];

function throwingDb(): Db {
  const fail = async () => {
    throw new Error(LEAK_SOURCE);
  };
  return {
    query: fail,
    orm: {},
    withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      void fn;
      return fail();
    },
    close: async () => undefined,
  } as unknown as Db;
}

function expectNoLeak(body: string): void {
  for (const pattern of LEAK_PATTERNS) {
    expect(body, '响应体泄漏了内部细节：' + pattern).not.toContain(pattern);
  }
}

describe('API 泄漏测试：底层错误不进响应体', () => {
  const app = buildApp({ db: throwingDb() });

  it('夹具本身确实包含泄漏源（否则本测试会假绿）', () => {
    // 守住"测试有靶子"：如果哪天错误样本被改得不含敏感信息，这条会先失败。
    expect(LEAK_SOURCE).toContain('constraint');
    expect(LEAK_SOURCE).toContain('at Object.');
    expect(LEAK_PATTERNS.some((pattern) => LEAK_SOURCE.includes(pattern))).toBe(true);
  });

  it('数据库故障 → 500 + 中文固定文案，且不含表名/约束名/SQL/堆栈/驱动码', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/bottles/00000000-0000-4000-8000-000000000000',
      headers: { cookie: 'mdb_session=whatever' },
    });

    expect(response.statusCode).toBe(500);
    const body = response.json() as { error: { message: string; violations: unknown[] } };
    expect(/[\u4e00-\u9fff]/.test(body.error.message)).toBe(true);
    expect(body.error.violations).toEqual([]);
    expectNoLeak(response.body);
  });

  it('非法 JSON 请求体 → 4xx 中文文案（不泄漏解析器的英文报错）', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/bottles',
      payload: '{ this is not json',
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
    const body = response.json() as { error: { message: string } };
    expect(/[\u4e00-\u9fff]/.test(body.error.message)).toBe(true);
    expectNoLeak(response.body);
  });

  it('未匹配路由仍是 404（错误处理器不得把 404 吞成 500）', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/definitely-not-a-route' });

    expect(response.statusCode).toBe(404);
  });
});
