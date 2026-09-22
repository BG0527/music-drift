/**
 * 分段音频播放端点：`GET /api/segments/:segmentId/audio`（D-02 裁决：音频存库 bytea + HTTP Range 流式下发）。
 *
 * 这是「陌生人能听到你的声音」的技术底座：
 * - `206 Partial Content` + `Content-Range` → 拖动进度条只取需要的字节，不重下整段；
 * - `Accept-Ranges: bytes` → 浏览器敢做 seek；Safari 探测 moov 时会先发 `bytes=-N` 后缀请求；
 * - `Cache-Control: private, no-store` → 别人的声音不进任何共享缓存（匿名社区，Figma/DESIGN.md 的隐私口径）。
 *
 * 权限：**本 Demo 该端点匿名可读**，因为 segment id 是 UUIDv4（不可枚举），
 * 且「随机捞到就能听」正是产品语义（CONTEXT §3.2）。账号级/持有者级收紧归 t9/t12，
 * 届时在 `registerSegmentAudioRoutes` 前加 preHandler 即可（本函数不改变这一扩展点）。
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { UuidSchema } from '@music-drift/shared/contracts';
import { parseRangeHeader } from './range.js';
import type { SegmentAudioRepository } from './repository.js';

export interface SegmentAudioRoutesOptions {
  repository: SegmentAudioRepository;
}

/** 404 只给"找不到"，不回显 id 或是否存在（避免成为探测接口）。 */
function sendNotFound(reply: FastifyReply): FastifyReply {
  return reply.code(404).send({ error: { message: '找不到这一段音频。', violations: [] } });
}

export function registerSegmentAudioRoutes(
  app: FastifyInstance,
  options: SegmentAudioRoutesOptions,
): void {
  app.get('/api/segments/:segmentId/audio', async (request, reply) => {
    const params = request.params as { segmentId?: string };
    const parsedId = UuidSchema.safeParse(params.segmentId);
    if (!parsedId.success) return sendNotFound(reply);

    const segmentId = parsedId.data;
    const meta = await options.repository.stat(segmentId);
    if (meta === null || meta.byteSize <= 0) return sendNotFound(reply);

    const size = meta.byteSize;
    const range = parseRangeHeader(request.headers.range, size);

    reply.header('Accept-Ranges', 'bytes');
    reply.header('Cache-Control', 'private, no-store');

    if (range.kind === 'unsatisfiable') {
      reply.header('Content-Range', `bytes */${size}`);
      return reply.code(416).send();
    }

    const start = range.kind === 'partial' ? range.start : 0;
    const end = range.kind === 'partial' ? range.end : size - 1;

    const chunk = await options.repository.readSlice(segmentId, start, end);
    if (chunk === null) return sendNotFound(reply);

    reply.header('Content-Type', meta.mime ?? 'application/octet-stream');
    reply.header('Content-Length', String(chunk.byteLength));
    if (range.kind === 'partial') {
      reply.header('Content-Range', `bytes ${start}-${end}/${size}`);
      return reply.code(206).send(Buffer.from(chunk));
    }
    return reply.code(200).send(Buffer.from(chunk));
  });
}
