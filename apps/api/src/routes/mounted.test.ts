/**
 * **路由注册守卫**（captain 硬要求，永久防止「静默丢失」）。
 *
 * 背景：`app.ts` 曾被整文件覆盖，导致一族路由**静默 404** —— 不红、看起来完全正常，
 * 只有跑集成用例才会发现（§28.4「静默丢失：不红但坏」）。
 *
 * 判定方式：给 app 装一个**未匹配专用**的 notFound 处理器（返回 `{unmatched:true}`），
 * 再逐族发请求 —— 只要响应不是 `{unmatched:true}`，就说明**路由已挂载并被匹配**。
 * 这样“合法 404（资源不存在）”与“路由根本没挂”不会被混淆，而且**不需要数据库**，
 * 因此跑在默认 `pnpm test` 基线上：任何人再整文件覆盖 `app.ts`，这里立刻炸。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { Db } from '../db/client.js';

/** 注册路由只需要对象存在（请求期才用其方法），故守卫无需真实数据库。 */
const fakeDb = {
  query: async () => [],
  orm: {},
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ query: async () => [] }),
  close: async () => undefined,
} as unknown as Db;

interface Family {
  family: string;
  method: 'GET' | 'POST';
  path: string;
}

/** 已知路由族 → 至少一个必须存在的路径；新增族时必须同步登记，否则守卫失去意义。 */
const KNOWN_FAMILIES: readonly Family[] = [
  { family: 'health', method: 'GET', path: '/healthz' },
  { family: 'auth', method: 'POST', path: '/api/auth/register' },
  { family: 'auth', method: 'POST', path: '/api/auth/login' },
  { family: 'auth', method: 'POST', path: '/api/auth/logout' },
  { family: 'auth', method: 'GET', path: '/api/auth/me' },
  { family: 'auth-anon-codes', method: 'GET', path: '/api/me/anonymous-codes' },
  { family: 'segment-audio', method: 'GET', path: '/api/segments/00000000-0000-4000-8000-000000000000/audio' },
  { family: 'songs', method: 'GET', path: '/api/songs' },
  { family: 'bottles-create', method: 'POST', path: '/api/bottles' },
  { family: 'bottles-detail', method: 'GET', path: '/api/bottles/00000000-0000-4000-8000-000000000000' },
  { family: 'bottles-segments', method: 'POST', path: '/api/bottles/00000000-0000-4000-8000-000000000000/segments' },
  { family: 'bottles-resolution', method: 'POST', path: '/api/bottles/00000000-0000-4000-8000-000000000000/resolution' },
  { family: 'bottles-put-back', method: 'POST', path: '/api/bottles/00000000-0000-4000-8000-000000000000/put-back' },
  { family: 'bottles-events', method: 'GET', path: '/api/bottles/00000000-0000-4000-8000-000000000000/events' },
  { family: 'river', method: 'POST', path: '/api/river/draw' },
  { family: 'sea', method: 'GET', path: '/api/sea' },
  { family: 'sea-detail', method: 'GET', path: '/api/sea/00000000-0000-4000-8000-000000000000' },
  {
    family: 'sea-targeted',
    method: 'POST',
    path: '/api/sea/00000000-0000-4000-8000-000000000000/targeted-segment',
  },
  { family: 'votes', method: 'POST', path: '/api/segments/00000000-0000-4000-8000-000000000000/votes' },
  { family: 'messages', method: 'GET', path: '/api/bottles/00000000-0000-4000-8000-000000000000/messages' },
  { family: 'reports', method: 'POST', path: '/api/reports' },
  { family: 'notifications', method: 'GET', path: '/api/notifications' },
  { family: 'badges', method: 'GET', path: '/api/me/badges' },
  { family: 'collections', method: 'GET', path: '/api/me/collections' },
  {
    family: 'collections-create',
    method: 'POST',
    path: '/api/collections/00000000-0000-4000-8000-000000000000',
  },
  { family: 'admin', method: 'GET', path: '/api/admin/reports' },
];

const UNMATCHED_MARKER = '/__unmatched__';

async function buildGuardedApp(withDb: boolean) {
  const app = buildApp(withDb ? { db: fakeDb } : {});
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ unmatched: true }));
  await app.ready();
  return app;
}

describe('路由注册守卫：所有已知路由族必须同时挂载（防静默 404）', () => {
  let app: Awaited<ReturnType<typeof buildGuardedApp>>;

  beforeAll(async () => {
    app = await buildGuardedApp(true);
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(KNOWN_FAMILIES)('$family 已挂载且被匹配：$method $path', async ({ method, path }) => {
    const response = await app.inject(method === 'POST' ? { method, url: path, payload: {} } : { method, url: path });
    // 用文本判定（204 无 body 时 .json() 会抛）；未匹配唯一特征就是 notFound 处理器写的 unmatched 标记。
    expect(response.body, `${path} 未被路由匹配（疑似注册被覆盖）`).not.toContain('unmatched');
  });

  it('负向对照：未注册路径必须被判定为 unmatched（证明本守卫有牙齿）', async () => {
    const response = await app.inject({ method: 'GET', url: UNMATCHED_MARKER });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ unmatched: true });
  });

  it('没有 db 时只挂无库族：healthz 匹配，业务族按预期缺席（env 会告警说明）', async () => {
    const noDb = await buildGuardedApp(false);
    const health = await noDb.inject({ method: 'GET', url: '/healthz' });
    const bottles = await noDb.inject({ method: 'POST', url: '/api/bottles', payload: {} });

    expect(health.body).not.toContain('unmatched');
    expect(bottles.body).toContain('unmatched');
  });
});
