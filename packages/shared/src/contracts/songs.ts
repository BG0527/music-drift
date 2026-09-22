/** 曲库与分段契约（CONTEXT §3.1 / §14：Demo 固定 4 段，正式版 3–5 段）。 */
import { z } from 'zod';
import { UuidSchema } from './common';

export const SongSegmentSchema = z.object({
  id: UuidSchema,
  /** 歌里的固定段落位置（1-based，永不压缩）。 */
  index: z.number().int().min(1),
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
});

export const SongSchema = z.object({
  id: UuidSchema,
  title: z.string().min(1),
  /** 分段数**来自数据**，前端禁止写死 4。 */
  totalSegments: z.number().int().min(1).max(8),
  licensedSource: z.string().min(1),
  segments: z.array(SongSegmentSchema),
});

export type Song = z.infer<typeof SongSchema>;
export type SongSegment = z.infer<typeof SongSegmentSchema>;
