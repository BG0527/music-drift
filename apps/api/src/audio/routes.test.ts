/**
 * `GET /api/segments/:segmentId/audio` 的行为单测（用假仓储 + `app.inject`，不碰数据库）。
 *
 * 这是「被别人听到」的唯一入口，也是分段试听/拖动进度条的底座，因此把 HTTP 语义逐条钉死：
 * 200 / 206 / 416 / 404、`Content-Range`、`Content-Length`、`Accept-Ranges`、HEAD。
 * 真实数据库上的字节级一致性另见 `audio.integration.test.ts`。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerSegmentAudioRoutes } from './routes';
import type { SegmentAudioMeta, SegmentAudioRepository } from './repository';

const SEGMENT_ID = '3f1e6b1c-1a2b-4c3d-8e4f-5a6b7c8d9e0f';
/** 1000 字节的确定性音频内容：第 i 字节 = i % 256，便于逐字节断言。 */
const AUDIO = new Uint8Array(1_000).map((_, index) => index % 256);

const META: SegmentAudioMeta = {
  segmentId: SEGMENT_ID,
  mime: 'audio/webm',
  durationMs: 20_000,
  byteSize: AUDIO.byteLength,
};

interface Recorder {
  sliceCalls: Array<{ segmentId: string; start: number; end: number }>;
}

function buildTestApp(meta: SegmentAudioMeta | null = META): {
  app: ReturnType<typeof Fastify>;
  calls: Recorder;
} {
  const calls: Recorder = { sliceCalls: [] };
  const repository: SegmentAudioRepository = {
    stat: async (segmentId) => (meta !== null && meta.segmentId === segmentId ? meta : null),
    readSlice: async (segmentId, start, end) => {
      calls.sliceCalls.push({ segmentId, start, end });
      return AUDIO.slice(start, end + 1);
    },
  };
  const app = Fastify({ logger: false });
  registerSegmentAudioRoutes(app, { repository });
  return { app, calls };
}

describe('GET /api/segments/:segmentId/audio', () => {
  it('服务端判定当前观看者不可见时返回 404，且绝不读取音频字节', async () => {
    const calls: Recorder = { sliceCalls: [] };
    const repository: SegmentAudioRepository = {
      stat: async () => META,
      readSlice: async (segmentId, start, end) => {
        calls.sliceCalls.push({ segmentId, start, end });
        return AUDIO.slice(start, end + 1);
      },
    };
    const app = Fastify({ logger: false });
    registerSegmentAudioRoutes(app, {
      repository,
      canRead: async () => false,
    });

    const response = await app.inject({ method: 'GET', url: `/api/segments/${SEGMENT_ID}/audio` });

    expect(response.statusCode).toBe(404);
    expect(calls.sliceCalls).toEqual([]);
    await app.close();
  });

  it('整段请求：200 + 完整字节 + 试听所需响应头', async () => {
    const { app } = buildTestApp();

    const response = await app.inject({ method: 'GET', url: `/api/segments/${SEGMENT_ID}/audio` });

    expect(response.statusCode).toBe(200);
    expect(response.headers['accept-ranges']).toBe('bytes');
    expect(response.headers['content-type']).toContain('audio/webm');
    expect(response.headers['content-length']).toBe('1000');
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.rawPayload.byteLength).toBe(1_000);
    expect(Buffer.from(response.rawPayload).equals(Buffer.from(AUDIO))).toBe(true);
    await app.close();
  });

  it('HEAD：与 GET 同头、无响应体（浏览器探测可用性靠它）', async () => {
    const { app } = buildTestApp();

    const response = await app.inject({ method: 'HEAD', url: `/api/segments/${SEGMENT_ID}/audio` });

    expect(response.statusCode).toBe(200);
    expect(response.headers['accept-ranges']).toBe('bytes');
    expect(response.headers['content-length']).toBe('1000');
    expect(response.rawPayload.byteLength).toBe(0);
    await app.close();
  });

  it('Range：206 + Content-Range + 精确切片（拖动进度条靠它）', async () => {
    const { app, calls } = buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: `/api/segments/${SEGMENT_ID}/audio`,
      headers: { range: 'bytes=100-199' },
    });

    expect(response.statusCode).toBe(206);
    expect(response.headers['content-range']).toBe('bytes 100-199/1000');
    expect(response.headers['content-length']).toBe('100');
    expect(Buffer.from(response.rawPayload).equals(Buffer.from(AUDIO.slice(100, 200)))).toBe(true);
    expect(calls.sliceCalls).toEqual([{ segmentId: SEGMENT_ID, start: 100, end: 199 }]);
    await app.close();
  });

  it('开放式 Range（bytes=900-）与后缀 Range（bytes=-100）都对', async () => {
    const { app } = buildTestApp();

    const open = await app.inject({
      method: 'GET',
      url: `/api/segments/${SEGMENT_ID}/audio`,
      headers: { range: 'bytes=900-' },
    });
    expect(open.statusCode).toBe(206);
    expect(open.headers['content-range']).toBe('bytes 900-999/1000');
    expect(open.rawPayload.byteLength).toBe(100);

    const suffix = await app.inject({
      method: 'GET',
      url: `/api/segments/${SEGMENT_ID}/audio`,
      headers: { range: 'bytes=-100' },
    });
    expect(suffix.statusCode).toBe(206);
    expect(suffix.headers['content-range']).toBe('bytes 900-999/1000');
    await app.close();
  });

  it('Range 越界：416 + `Content-Range: bytes */size`（RFC 7233 要求）', async () => {
    const { app, calls } = buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: `/api/segments/${SEGMENT_ID}/audio`,
      headers: { range: 'bytes=5000-' },
    });

    expect(response.statusCode).toBe(416);
    expect(response.headers['content-range']).toBe('bytes */1000');
    expect(response.rawPayload.byteLength).toBe(0);
    // 416 不该去读数据
    expect(calls.sliceCalls).toEqual([]);
    await app.close();
  });

  it('语法非法的 Range → 忽略它，整段 200（RFC：ignore the header）', async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: `/api/segments/${SEGMENT_ID}/audio`,
      headers: { range: 'bytes=abc' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-range']).toBeUndefined();
    await app.close();
  });

  it('段不存在 / 段上没有音频 → 404，且不回显内部信息', async () => {
    const missing = buildTestApp(null);
    const notFound = await missing.app.inject({
      method: 'GET',
      url: `/api/segments/${SEGMENT_ID}/audio`,
    });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toMatchObject({ error: { violations: [] } });
    await missing.app.close();
  });

  it('0 字节音频（历史/异常数据）按 404 处理，不返回空 200', async () => {
    const empty = buildTestApp({ ...META, byteSize: 0 });
    const response = await empty.app.inject({
      method: 'GET',
      url: `/api/segments/${SEGMENT_ID}/audio`,
    });

    expect(response.statusCode).toBe(404);
    await empty.app.close();
  });

  it('非法 segmentId（非 UUID）→ 404，且不查库（避免把探测变成查询压力）', async () => {
    const { app, calls } = buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/api/segments/not-a-uuid/audio' });

    expect(response.statusCode).toBe(404);
    expect(calls.sliceCalls).toEqual([]);
    await app.close();
  });

  it('另一个段的 id 查不到（仓储按 id 过滤）→ 404', async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/segments/00000000-0000-4000-8000-000000000000/audio',
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

/**
 * 装配守卫（回归测试，保护**共享装配点** `app.ts`）。
 *
 * 背景（真实事故）：`apps/api/src/app.ts` 被两个人同时改过，其中一方**整文件覆盖**，
 * 结果另一方注册的路由全部变成 404 —— 而单元测试如果只测自己的模块，**根本不会报警**
 * （静默 404 连"红"都不是）。
 *
 * 因此这里对 `app.ts` 做两层守卫：
 * 1. **文本层**：三个 `register*Routes` 调用必须同时存在（谁整文件覆盖，这里立刻红）；
 * 2. **行为层**：给了仓储时，真实 Fastify 实例上一定能路由到音频端点。
 */
describe('app.ts 装配守卫（防整文件覆盖导致路由静默消失）', () => {
  const appSource = readFileSync(resolve(process.cwd(), 'src/app.ts'), 'utf8');

  it('健康检查 / 账号 / 分段音频三条注册调用同时存在（增量合并，禁止整文件覆盖）', () => {
    expect(appSource).toMatch(/registerHealthRoutes\(app\)/);
    expect(appSource).toMatch(/registerAuthRoutes\(app,/);
    expect(appSource).toMatch(/registerSegmentAudioRoutes\(app,/);
  });

  it('注入了仓储时，真实 app 上音频端点可路由（不是 404）', async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: 'HEAD',
      url: `/api/segments/${SEGMENT_ID}/audio`,
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
