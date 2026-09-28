/**
 * 音频链路**真实数据库**集成测试（D-02：bytea 存库 + SQL 内切片 + HTTP Range）。
 *
 * 证明的是一条完整链路，而不是各层单测的拼接：
 * 写入用 t5 的 `insertBottleSegment`（t9 落地上传时调用的同一函数）→
 * 读取用 `createSegmentAudioRepository`（SQL `substring` 切片）→
 * 通过 `buildApp` 的真实 Fastify 实例发 HTTP 请求。
 *
 * 关键断言：**字节级一致**。SQL `substring` 是 1-based，而 HTTP Range 是 0-based，
 * 差一位在只看长度或只测 `bytes=0-` 时不会暴露 —— 所以这里跨 8KB 页边界做切片比对。
 *
 * 运行：`pnpm --filter @music-drift/api test:integration`（需要 `pnpm db:up`）。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { insertBottleSegment } from '../db/segments.js';
import { insertBottle } from '../db/test-helpers.js';
import { buildApp } from '../app.js';
import { createSegmentAudioRepository } from './repository.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';

/** 确定性伪随机负载：避免"顺序字节"在错位切片时也能比对通过。 */
function makeAudio(byteLength: number): Buffer {
  const buffer = Buffer.alloc(byteLength);
  buffer.set([0x1a, 0x45, 0xdf, 0xa3], 0); // WebM/EBML 头，让内容与 MIME 自洽
  let state = 0x1234_5678;
  for (let index = 4; index < byteLength; index += 1) {
    state = (state * 1_103_515_245 + 12_345) & 0x7fff_ffff;
    buffer[index] = (state >>> 16) & 0xff;
  }
  return buffer;
}

describe('分段音频：bytea 入库 → HTTP Range 流式播放', () => {
  let db: Db;
  let app: ReturnType<typeof buildApp>;
  let segmentId: string;
  const audio = makeAudio(300_000);
  const durationMs = 20_000;

  beforeAll(async () => {
    db = await createDb(DATABASE_URL);
    const { bottleId } = await insertBottle(db);
    const created = await insertBottleSegment(db, {
      bottleId,
      ownerId: (
        await db.query<{ initiator_id: string }>('select initiator_id from bottles where id = $1', [
          bottleId,
        ])
      )[0]!.initiator_id,
      index: 1,
      note: null,
      audio,
      audioMime: 'audio/webm',
      durationMs,
    });
    segmentId = created.id;
    // 本文件只验证 bytea/Range 字节链路；业务可见性由 visibility.integration.test.ts
    // 用真实会话与事件流覆盖。这里只注入仓储，避免无事件的底层夹具被业务权限正确拒绝。
    app = buildApp({ segmentAudio: createSegmentAudioRepository(db) });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await db?.close();
  });

  it('整段下发：200 + 字节与写入内容完全一致', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/segments/${segmentId}/audio`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-length']).toBe(String(audio.byteLength));
    expect(response.headers['content-type']).toContain('audio/webm');
    const received = response.rawPayload;
    expect(received.byteLength).toBe(audio.byteLength);
    expect(received.equals(audio)).toBe(true);
  });

  it('Range 切片：206 + 与源缓冲同一区间的字节逐位相同（含跨 8KB 页边界）', async () => {
    for (const [start, end] of [
      [0, 0],
      [0, 99],
      [8_000, 9_000], // 跨 8KB 页边界
      [299_000, 299_999], // 结尾
      [123_456, 123_555],
    ] as const) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/segments/${segmentId}/audio`,
        headers: { range: `bytes=${start}-${end}` },
      });

      expect(response.statusCode).toBe(206);
      expect(response.headers['content-range']).toBe(`bytes ${start}-${end}/${audio.byteLength}`);
      expect(response.rawPayload.byteLength).toBe(end - start + 1);
      expect(response.rawPayload.equals(audio.subarray(start, end + 1))).toBe(true);
    }
  });

  it('后缀请求（Safari 探测 moov 时会这么发）：206 + 末尾字节', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/segments/${segmentId}/audio`,
      headers: { range: 'bytes=-200' },
    });

    expect(response.statusCode).toBe(206);
    expect(response.headers['content-range']).toBe(`bytes 299800-299999/${audio.byteLength}`);
    expect(response.rawPayload.equals(audio.subarray(299_800))).toBe(true);
  });

  it('开放式请求 bytes=100000- ：从该位置到结尾', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/segments/${segmentId}/audio`,
      headers: { range: 'bytes=100000-' },
    });

    expect(response.statusCode).toBe(206);
    expect(response.headers['content-range']).toBe(`bytes 100000-299999/${audio.byteLength}`);
    expect(response.rawPayload.equals(audio.subarray(100_000))).toBe(true);
  });

  it('HEAD：Content-Length 与整段一致但无响应体', async () => {
    const response = await app.inject({
      method: 'HEAD',
      url: `/api/segments/${segmentId}/audio`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-length']).toBe(String(audio.byteLength));
    expect(response.headers['accept-ranges']).toBe('bytes');
    expect(response.rawPayload.byteLength).toBe(0);
  });

  it('越界 Range：416 + `Content-Range: bytes */size`', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/segments/${segmentId}/audio`,
      headers: { range: `bytes=${audio.byteLength}-` },
    });

    expect(response.statusCode).toBe(416);
    expect(response.headers['content-range']).toBe(`bytes */${audio.byteLength}`);
  });

  it('不存在的段 id → 404（不泄露是否存在）', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/segments/11111111-2222-4333-8444-555555555555/audio',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { message: '找不到这一段音频。', violations: [] } });
  });

  it('段存在但没有音频（只有接唱元数据）→ 404', async () => {
    const { bottleId } = await insertBottle(db);
    const created = await db.query<{ id: string }>(
      `insert into bottle_segments (bottle_id, owner_id, "index", note)
       select $1, initiator_id, 1, null from bottles where id = $1 returning id`,
      [bottleId],
    );

    const response = await app.inject({
      method: 'GET',
      url: `/api/segments/${created[0]!.id}/audio`,
    });

    expect(response.statusCode).toBe(404);
  });

  it('仓储 stat 读回的 MIME / 时长 / 字节数与写入一致（t9 拼 Segment DTO 需要它）', async () => {
    const repository = createSegmentAudioRepository(db);
    const meta = await repository.stat(segmentId);

    expect(meta).toEqual({
      segmentId,
      mime: 'audio/webm',
      durationMs,
      byteSize: audio.byteLength,
    });
    expect(await repository.stat('11111111-2222-4333-8444-555555555555')).toBeNull();
  });
});
