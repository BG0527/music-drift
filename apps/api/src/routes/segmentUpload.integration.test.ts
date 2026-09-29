/**
 * **P0 端到端验收**：录音上传 → 另一个会话取回 → Range 分段拉取 → **字节级一致**。
 *
 * 为什么必须端到端：t7 与 t9 曾各自"全绿"，接缝却是断的（上传 400 硬拒、`audio` 落 null，
 * 于是「音频能被别人听到」根本跑不通）。**推断不算证据** —— 这条测试用真 app、真库、真 cookie、
 * 真字节流把整条链路走一遍。
 *
 * 协议（ADR-018）：body = 原始二进制，`Content-Type` = 音频 MIME，时长走 `x-audio-duration-ms`。
 */
import { createSystemClock } from '@music-drift/shared/domain';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createDb, type Db } from '../db/client.js';
import { runSeed } from '../db/seed.js';
import { insertSong } from '../db/test-helpers.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
const PASSWORD = 'Drift-Bottle-2026';

/** 最小合法 webm 载荷：EBML 魔数 + 填充（体积远小于上限，时长用合法值）。 */
function webmPayload(size = 4096): Buffer {
  const magic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  const filler = Buffer.alloc(size - magic.length, 0x42);
  return Buffer.concat([magic, filler]);
}

describe('P0：录音上传 → 跨会话取回 → Range 字节级一致', () => {
  let db: Db;
  let app: FastifyInstance;
  let uploaderCookie = '';
  let listenerCookie = '';
  let bottleId = '';
  let songId = '';
  let segmentId = '';

  async function register(handle: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { account: handle, password: PASSWORD },
    });
    expect(response.statusCode).toBe(201);
    const cookie = response.cookies.find((entry) => entry.name === 'mdb_session');
    return cookie === undefined ? '' : cookie.name + '=' + cookie.value;
  }

  beforeAll(async () => {
    db = await createDb(DATABASE_URL);
    app = buildApp({ db, clock: createSystemClock() });
    await app.ready();
    await runSeed(db);
    songId = await insertSong(db, 4);
    const suffix = Date.now().toString().slice(-6);
    uploaderCookie = await register('up' + suffix);
    listenerCookie = await register('li' + suffix);
    const created = await app.inject({
      method: 'POST',
      url: '/api/bottles',
      payload: { songId },
      headers: { cookie: uploaderCookie },
    });
    bottleId = (created.json() as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
    if (db !== undefined) {
      await db.close();
    }
  });

  it('上传原始二进制 → 201，且 DB 里 audio 非空、MIME 与时长为归一化后的值', async () => {
    const payload = webmPayload();
    const response = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/segments',
      payload,
      headers: {
        cookie: uploaderCookie,
        'content-type': 'audio/webm;codecs=opus',
        'x-audio-duration-ms': '20000',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { segmentId: string; index: number };
    segmentId = body.segmentId;
    expect(body.index).toBe(1);

    const rows = await db.query<{ size: string; mime: string | null; duration: number | null }>(
      `select octet_length(audio)::text as size, audio_mime as mime, duration_ms as duration
       from bottle_segments where id = $1`,
      [segmentId],
    );
    expect(rows[0]?.size).toBe(String(payload.byteLength));
    expect(rows[0]?.mime).toBe('audio/webm'); // `;codecs=opus` 被归一化掉
    expect(rows[0]?.duration).toBe(20000);
  });

  it('另一个会话 Range 取回：字节级与上传内容一致', async () => {
    const payload = webmPayload();
    const response = await app.inject({
      method: 'GET',
      url: '/api/segments/' + segmentId + '/audio',
      headers: { cookie: listenerCookie, range: 'bytes=10-109' },
    });

    expect([200, 206]).toContain(response.statusCode);
    const received = response.rawPayload;
    expect(received.byteLength).toBe(100);
    expect(Buffer.from(received)).toEqual(payload.subarray(10, 110));
    expect(response.headers['content-range'] ?? response.headers['content-length']).toBeDefined();
  });

  it('全量取回也一致（不同 Range 请求不改变内容）', async () => {
    const payload = webmPayload();
    const response = await app.inject({
      method: 'GET',
      url: '/api/segments/' + segmentId + '/audio',
      headers: { cookie: listenerCookie },
    });

    expect([200, 206]).toContain(response.statusCode);
    expect(Buffer.from(response.rawPayload)).toEqual(payload);
  });

  it('缺时长 → 422（fail-closed：无法核对 15–30 秒就拒绝），且不落任何段', async () => {
    const before = await db.query<{ count: string }>(
      `select count(*)::text as count from bottle_segments where bottle_id = $1`,
      [bottleId],
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/segments',
      payload: webmPayload(),
      headers: { cookie: uploaderCookie, 'content-type': 'audio/webm' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.body).toContain('AUDIO_DURATION');
    const after = await db.query<{ count: string }>(
      `select count(*)::text as count from bottle_segments where bottle_id = $1`,
      [bottleId],
    );
    expect(after[0]?.count).toBe(before[0]?.count);
  });

  it('声明的格式与内容不符 → 422 AUDIO_CONTAINER_MISMATCH（魔数嗅探，不信任头部）', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/segments',
      payload: Buffer.from('这不是音频，只是一段普通文本'.repeat(64)),
      headers: {
        cookie: uploaderCookie,
        'content-type': 'audio/webm',
        'x-audio-duration-ms': '20000',
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.body).toContain('AUDIO_');
  });
});
