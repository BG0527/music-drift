import { describe, expect, it } from 'vitest';
import {
  CreatePublicCommentRequestSchema,
  PublicCommentPageSchema,
  ReportActionSchema,
  ReportTargetTypeSchema,
} from './interactions';

describe('W19 公海公开评论契约', () => {
  it('trim 后只接受 1..200 个 Unicode 字符，并固定每页最多 20 条', () => {
    expect(CreatePublicCommentRequestSchema.parse({ content: '  顺流而歌  ' })).toEqual({
      content: '顺流而歌',
    });
    expect(CreatePublicCommentRequestSchema.safeParse({ content: '   ' }).success).toBe(false);
    expect(CreatePublicCommentRequestSchema.safeParse({ content: '𠮷'.repeat(200) }).success).toBe(true);
    expect(CreatePublicCommentRequestSchema.safeParse({ content: '𠮷'.repeat(201) }).success).toBe(false);

    const page = PublicCommentPageSchema.parse({ items: [], nextCursor: null });
    expect(page.items).toEqual([]);
  });

  it('举报与审核词表包含 COMMENT / REMOVE_COMMENT', () => {
    expect(ReportTargetTypeSchema.parse('COMMENT')).toBe('COMMENT');
    expect(ReportActionSchema.parse('REMOVE_COMMENT')).toBe('REMOVE_COMMENT');
  });
});
