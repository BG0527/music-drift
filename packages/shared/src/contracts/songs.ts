/** 曲库与分段契约（CONTEXT §3.1 / §14：Demo 固定 4 段，正式版 3–5 段）。 */
import { z } from 'zod';
import { UuidSchema } from './common';

/** 一句 K 歌歌词的全曲绝对时间窗；高亮进度只由媒体 currentTime 派生。 */
export const SongLyricLineSchema = z
  .object({
    text: z.string().trim().min(1),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
  })
  .refine((line) => line.endMs > line.startMs, {
    message: '歌词行 endMs 必须晚于 startMs',
  });

export const SongSegmentLyricsSchema = z.object({
  /** 与歌曲固定段落位置一致（1-based，永不压缩）。 */
  index: z.number().int().min(1),
  lines: z.array(SongLyricLineSchema).min(1),
});

export type SongLyricLine = z.infer<typeof SongLyricLineSchema>;
export type SongSegmentLyrics = z.infer<typeof SongSegmentLyricsSchema>;

export const SongSegmentSchema = z.object({
  id: UuidSchema,
  /** 歌里的固定段落位置（1-based，永不压缩）。 */
  index: z.number().int().min(1),
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  /** 旧数据允许暂缺；曲库 Demo 的三首歌均由共享曲库补齐。 */
  lyrics: z.array(SongLyricLineSchema).min(1).optional(),
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
