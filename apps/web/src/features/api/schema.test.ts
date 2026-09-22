import { describe, expect, it } from 'vitest';
import { BottleSummarySchema, SongSchema } from '@music-drift/shared';
import { arrayOf, pageOf } from './schema';

/**
 * 结构化的两个组合子：列表响应（`T[]`）与游标分页（`{items, nextCursor}`）。
 * 不引 zod：契约 schema 本身就是 `{ safeParse }`，这里只把"数组/分页"两件外壳套上去
 * （`apps/web` 不为了 `z.array` 去改依赖基线）。
 */
describe('契约组合子', () => {
  it('arrayOf 透传每一项的契约校验结果', () => {
    const songs = arrayOf(SongSchema);
    const parsed = songs.safeParse([
      {
        id: '8f1d6c2e-0f1a-4a1e-9f2b-444444444444',
        title: '深海鲸落',
        totalSegments: 4,
        licensedSource: 'Demo 授权曲库',
        segments: [],
      },
    ]);
    expect(parsed.success).toBe(true);
  });

  it('arrayOf 拦下「不是数组」与「有一项不合格」两种脏响应', () => {
    const songs = arrayOf(SongSchema);
    expect(songs.safeParse({ items: [] }).success).toBe(false);
    expect(songs.safeParse([{ id: 'x' }]).success).toBe(false);
    expect(songs.safeParse(null).success).toBe(false);
  });

  it('pageOf 要求 items 是数组、nextCursor 是 string 或 null', () => {
    const page = pageOf(BottleSummarySchema);
    expect(page.safeParse({ items: [], nextCursor: null }).success).toBe(true);
    expect(page.safeParse({ items: [], nextCursor: 'next' }).success).toBe(true);
    expect(page.safeParse({ items: [] }).success).toBe(false);
    expect(page.safeParse({ items: {}, nextCursor: null }).success).toBe(false);
  });

  it('pageOf 会逐项校验（列表里混进一条不合格就不放行）', () => {
    const page = pageOf(BottleSummarySchema);
    const result = page.safeParse({ items: [{ id: 'not-a-uuid' }], nextCursor: null });
    expect(result.success).toBe(false);
  });
});
