/**
 * 分段音频播放端点：`GET /api/segments/:segmentId/audio`（D-02 裁决：音频存库 bytea + HTTP Range 流式下发）。
 *
 * 这是「陌生人能听到你的声音」的技术底座：
 * - `206 Partial Content` + `Content-Range` → 拖动进度条只取需要的字节，不重下整段；
 * - `Accept-Ranges: bytes` → 浏览器敢做 seek；Safari 探测 moov 时会先发 `bytes=-N` 后缀请求；
 * - `Cache-Control: private, no-store` → 别人的声音不进任何共享缓存（匿名社区，Figma/DESIGN.md 的隐私口径）。
 *
 * 权限：生产装配注入 `canRead`，并与详情投影共用段可见性判据；UUID 不再被当成权限。
 * 漂流中的隐藏后续段即使地址泄露也返回 404，入海后则对访客开放。
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Clock } from '@music-drift/shared/domain';
import { UuidSchema } from '@music-drift/shared/contracts';
import { createActorResolver } from '../http/session.js';
import type { Db } from '../db/client.js';
import type { BottleStore } from '../store/bottles.js';
import { isSegmentVisible, segmentVisibility } from '../store/visibility.js';
import { parseRangeHeader } from './range.js';
import type { SegmentAudioRepository } from './repository.js';

export interface SegmentAudioRoutesOptions {
  repository: SegmentAudioRepository;
  /** 详情投影之外的第二道权限边界；false 统一伪装为 404，避免泄露段是否存在。 */
  canRead?: (request: FastifyRequest, segmentId: string) => Promise<boolean>;
}

/** 与详情投影共用 `segmentVisibility`，防止 UUID 直链绕过“后续未解锁”。 */
export function createSegmentAudioAuthorizer(input: {
  db: Db;
  store: BottleStore;
  clock: Clock;
}): NonNullable<SegmentAudioRoutesOptions['canRead']> {
  const actors = createActorResolver(input.db, input.clock);
  return async (request, segmentId) => {
    const rows = await input.db.query<{ bottle_id: string; index: number }>(
      `select bottle_id, "index" from bottle_segments
       where id = $1 and deleted_at is null`,
      [segmentId],
    );
    const segment = rows[0];
    if (segment === undefined) return false;
    const state = await input.store.loadState(segment.bottle_id);
    if (state === null) return false;
    const actor = await actors.resolve(request);
    return isSegmentVisible(
      segmentVisibility({ state, viewerId: actor?.user.id ?? null }),
      segment.index,
    );
  };
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
    if (options.canRead !== undefined && !(await options.canRead(request, segmentId))) {
      return sendNotFound(reply);
    }

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
