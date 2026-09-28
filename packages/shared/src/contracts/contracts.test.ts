/**
 * 契约自检（t5）：形状 + 三条「契约层面必须钉住的语义」。
 * 契约是前后端唯一接口，因此这里既测校验成功/失败，也测「不该出现的东西没有出现」。
 */
import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, ErrorResponseSchema, RuleCodeSchema, UuidSchema } from './common';
import {
  BottleDetailSchema,
  BottleEventSchema,
  BottleSummarySchema,
  RecordSegmentRequestSchema,
  SeaBottleListSchema,
} from './bottles';
import { CastVoteRequestSchema } from './interactions';
import { SongSchema } from './songs';

const UUID = '00000000-0000-4000-8000-000000000001';

function summaryPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: UUID,
    songId: UUID,
    songTitle: '占位曲目 · 一',
    status: 'IN_RIVER',
    totalSegments: 4,
    recordedCount: 3,
    missingSegmentIndexes: [2],
    isComplete: false,
    seaZone: null,
    revision: 4,
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('契约：基本校验', () => {
  it('契约版本是常量且随不兼容变更提升', () => {
    expect(CONTRACT_VERSION).toBe('0.2.0-s1');
  });

  it('错误码枚举与领域内核一致：未知码被拒', () => {
    expect(RuleCodeSchema.safeParse('RESOLUTION_NOT_AVAILABLE').success).toBe(true);
    expect(RuleCodeSchema.safeParse('NOT_A_REAL_CODE').success).toBe(false);
  });

  it('错误响应：缺 message 或空 violations 结构错误时被拒', () => {
    expect(ErrorResponseSchema.safeParse({ error: { message: '末段不可继续投河' } }).success).toBe(
      true,
    );
    expect(
      ErrorResponseSchema.safeParse({
        error: { message: 'x', violations: [{ code: 'NOPE', message: 'y' }] },
      }).success,
    ).toBe(false);
  });

  it('uuid 校验拒绝非 uuid（防止 id 混用）', () => {
    expect(UuidSchema.safeParse(UUID).success).toBe(true);
    expect(UuidSchema.safeParse('SYSTEM').success).toBe(false);
  });
});

describe('契约：ADR-015 三条硬语义', () => {
  it('录制请求体**没有** index 字段：段号必须由服务端决定，前端不得猜', () => {
    // durationMs 必填（ADR-018）：缺失即拒绝，否则无法核对 15–30 秒
    expect(RecordSegmentRequestSchema.safeParse({ note: null }).success).toBe(false);
    expect(RecordSegmentRequestSchema.safeParse({ note: null, durationMs: 20_000 }).success).toBe(true);
    // 非法字段不会被静默忽略为「合法」——契约显式声明形状，前端写了 index 说明理解错了协议
    const parsed = RecordSegmentRequestSchema.safeParse({ note: null, durationMs: 20_000, index: 3 });
    expect(parsed.success && 'index' in parsed.data).toBe(false);
  });

  it('作品完整性由 missingSegmentIndexes / isComplete 表达，而不是「段数」', () => {
    const gapped = BottleSummarySchema.safeParse(summaryPayload());
    expect(gapped.success).toBe(true);
    if (gapped.success) {
      expect(gapped.data.missingSegmentIndexes).toEqual([2]);
      expect(gapped.data.recordedCount).toBe(3);
      expect(gapped.data.isComplete).toBe(false);
    }
    // 缺字段即被拒：不允许前端自己推算完整性
    const missing = BottleSummarySchema.safeParse({ ...summaryPayload(), isComplete: undefined });
    expect(missing.success).toBe(false);
  });

  it('有缺口也可以入海：seaZone 表达公海分区，且未完成区不等于已完成区', () => {
    const incompleteAtSea = BottleSummarySchema.safeParse(
      summaryPayload({ status: 'SEA', seaZone: 'INCOMPLETE', isComplete: false }),
    );
    expect(incompleteAtSea.success).toBe(true);
    if (incompleteAtSea.success) {
      expect(incompleteAtSea.data.seaZone).not.toBe('COMPLETED');
    }
    expect(BottleSummarySchema.safeParse(summaryPayload({ seaZone: 'WEIRD' })).success).toBe(false);
  });

  it('分段数来自数据：totalSegments 可非 4（正式版 3–5 段）', () => {
    const five = SongSchema.safeParse({
      id: UUID,
      title: '五段歌',
      totalSegments: 5,
      licensedSource: 'placeholder',
      segments: [
        { id: UUID, index: 1, startMs: 0, durationMs: 20_000 },
        { id: UUID, index: 2, startMs: 20_000, durationMs: 20_000 },
      ],
    });
    expect(five.success).toBe(true);
    expect(
      SongSchema.safeParse({
        id: UUID,
        title: 'x',
        totalSegments: 0,
        licensedSource: 's',
        segments: [],
      }).success,
    ).toBe(false);
  });

  it('票的 listenedRatio 必须落在 0–1（点踩 0.8 门槛由服务端判定）', () => {
    expect(CastVoteRequestSchema.safeParse({ value: 'DISLIKE', listenedRatio: 0.8 }).success).toBe(
      true,
    );
    expect(CastVoteRequestSchema.safeParse({ value: 'DISLIKE', listenedRatio: 1.5 }).success).toBe(
      false,
    );
    expect(CastVoteRequestSchema.safeParse({ value: 'NOPE', listenedRatio: 0.8 }).success).toBe(
      false,
    );
  });

  it('详情契约包含补位上下文、viewer-relative 字段与可选去向', () => {
    const detail = BottleDetailSchema.safeParse({
      ...summaryPayload(),
      initiatorCode: '匿名歌手#042',
      returnCompleted: false,
      returnChainBroken: false,
      segments: [],
      availableResolutions: ['RIVER', 'SEA'],
      isHolder: false,
      replacementContext: {
        gapIndex: 2,
        listenSegmentIndex: 1,
        listenSegmentId: UUID,
        hasLaterSegments: true,
      },
      riverCastAt: '2026-09-23T00:00:00.000Z',
      seaAt: null,
      damagedAt: null,
    });
    expect(detail.success).toBe(true);
  });
});

describe('契约：公共漂流日志只暴露瓶级匿名代号', () => {
  it('接受 actorCode，拒绝只有真实 actorId 的旧载荷', () => {
    const base = {
      seq: 1,
      type: 'SEGMENT_RECORDED',
      occurredAt: '2026-09-23T00:00:00.000Z',
      occurredAtMs: 1_758_585_600_000,
    };
    expect(BottleEventSchema.safeParse({ ...base, actorCode: '匿名歌手#042' }).success).toBe(true);
    expect(BottleEventSchema.safeParse({ ...base, actorId: UUID }).success).toBe(false);
  });
});

describe('契约：公海列表响应的可选 total（页码一次全显的数据来源）', () => {
  it('带 total 解析成功且原样保留（前端据此一次性算出总页数）', () => {
    const parsed = SeaBottleListSchema.safeParse({
      items: [summaryPayload()],
      nextCursor: '游标一',
      total: 39,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.total).toBe(39);
      expect(parsed.data.items).toHaveLength(1);
      expect(parsed.data.nextCursor).toBe('游标一');
    }
  });

  it('缺 total 仍成功（向后兼容：旧响应/缓存没有该字段，不得把老服务端当坏数据拒掉）', () => {
    expect(SeaBottleListSchema.safeParse({ items: [], nextCursor: null }).success).toBe(true);
    expect(
      SeaBottleListSchema.safeParse({ items: [summaryPayload()], nextCursor: null }).success,
    ).toBe(true);
  });

  it('total 出现时必须是非负整数（负数/小数是坏数据，拒绝而不是算出假页码）', () => {
    expect(
      SeaBottleListSchema.safeParse({ items: [], nextCursor: null, total: -1 }).success,
    ).toBe(false);
    expect(
      SeaBottleListSchema.safeParse({ items: [], nextCursor: null, total: 1.5 }).success,
    ).toBe(false);
    expect(
      SeaBottleListSchema.safeParse({ items: [], nextCursor: null, total: 0 }).success,
    ).toBe(true);
  });
});
