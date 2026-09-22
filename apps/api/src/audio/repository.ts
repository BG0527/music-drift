/**
 * 分段音频的**只读仓储**（D-02：音频以 `bytea` 存在 `bottle_segments.audio`）。
 *
 * 只做两件事：读元信息（长度/MIME/时长）、读**一段字节范围**。
 * 关键点：Range 切片在 **SQL 里**用 `substring` 完成（`db/client.ts` 的原生 SQL 通道），
 * 不把整段音频读进 Node 内存再切 —— 否则 4 MB × 并发试听会把内存放大成主要问题。
 *
 * 写入路径**不在这里**：新增段落统一走 t5 的 `db/segments.ts#insertBottleSegment`（它已接受
 * `audio` / `audioMime` / `durationMs`），避免出现第二条 INSERT 真相。
 */
import type { Db } from '../db/client.js';

export interface SegmentAudioMeta {
  segmentId: string;
  mime: string | null;
  durationMs: number | null;
  /** 音频字节数；0 表示该段没有音频。 */
  byteSize: number;
}

export interface SegmentAudioRepository {
  /** 段不存在、或段上没有音频 → null。 */
  stat(segmentId: string): Promise<SegmentAudioMeta | null>;
  /** 读取闭区间 `[start, end]` 的字节；段/音频不存在 → null。 */
  readSlice(segmentId: string, start: number, end: number): Promise<Uint8Array | null>;
}

export function createSegmentAudioRepository(db: Db): SegmentAudioRepository {
  return {
    async stat(segmentId) {
      const rows = await db.query<{
        id: string;
        audio_mime: string | null;
        duration_ms: number | null;
        byte_size: number;
      }>(
        `select id, audio_mime, duration_ms, coalesce(octet_length(audio), 0)::int as byte_size
         from bottle_segments
         where id = $1`,
        [segmentId],
      );
      const row = rows[0];
      if (row === undefined || row.byte_size <= 0) return null;
      return {
        segmentId: row.id,
        mime: row.audio_mime,
        durationMs: row.duration_ms,
        byteSize: row.byte_size,
      };
    },

    async readSlice(segmentId, start, end) {
      const length = end - start + 1;
      if (length <= 0) return null;
      const rows = await db.query<{ chunk: Buffer | null }>(
        // Postgres 的 substring 对 bytea 是 1-based：起始位置 = start + 1，长度 = end - start + 1
        `select substring(audio from $2 for $3) as chunk
         from bottle_segments
         where id = $1 and audio is not null`,
        [segmentId, start + 1, length],
      );
      const chunk = rows[0]?.chunk;
      if (chunk === null || chunk === undefined) return null;
      return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    },
  };
}
