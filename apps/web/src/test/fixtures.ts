/**
 * 契约夹具（**仅测试用**）：形状必须与 `packages/shared` 的 zod schema 一致，
 * 否则页面测试会因为 CONTRACT_VIOLATION 而红 —— 这本身也是一道"前端没有脱离契约"的守卫。
 */
import type { BottleDetail, BottleEvent, BottleSummary, Song } from '@music-drift/shared';

export const USER_A = '11111111-1111-4111-8111-111111111111';
export const USER_B = '22222222-2222-4222-8222-222222222222';
export const BOTTLE_ID = '8f1d6c2e-0f1a-4a1e-9f2b-aaaaaaaaaaaa';
export const SONG_ID = '33333333-3333-4333-8333-333333333333';
export const SEGMENT_1 = '44444444-4444-4444-8444-444444444444';
export const SEGMENT_2 = '55555555-5555-4555-8555-555555555555';

export function song(overrides: Partial<Song> = {}): Song {
  return {
    id: SONG_ID,
    title: '深海鲸落',
    totalSegments: 4,
    licensedSource: 'Demo 授权曲库',
    segments: [
      { id: '66666666-6666-4666-8666-000000000001', index: 1, startMs: 0, durationMs: 20_000 },
      { id: '66666666-6666-4666-8666-000000000002', index: 2, startMs: 20_000, durationMs: 22_000 },
      { id: '66666666-6666-4666-8666-000000000003', index: 3, startMs: 42_000, durationMs: 21_000 },
      { id: '66666666-6666-4666-8666-000000000004', index: 4, startMs: 63_000, durationMs: 23_000 },
    ],
    ...overrides,
  };
}

export interface BottleFixtureInput {
  id?: string;
  status?: BottleSummary['status'];
  recordedCount?: number;
  missingSegmentIndexes?: number[];
  isComplete?: boolean;
  isHolder?: boolean;
  holderId?: string | null;
  availableResolutions?: BottleDetail['availableResolutions'];
  segments?: BottleDetail['segments'];
  seaZone?: BottleSummary['seaZone'];
  initiatorCode?: string;
}

/** 默认形态：A 发起、已录第 1 段、缺口 [2,3,4]、B 正持有（等待接唱）。 */
export function bottleDetail(overrides: BottleFixtureInput = {}): BottleDetail {
  const segments = overrides.segments ?? [
    {
      id: SEGMENT_1,
      index: 1,
      ownerId: USER_A,
      note: '在深夜哼一段没有词的曲子，期待接唱',
      ownerCode: '午夜歌手#042',
      likeCount: 0,
      dislikeCount: 0,
      deletedAt: null,
      audioMime: 'audio/webm',
      durationMs: 20_000,
    },
  ];
  const missingSegmentIndexes = overrides.missingSegmentIndexes ?? [2, 3, 4];
  const isComplete = overrides.isComplete ?? missingSegmentIndexes.length === 0;
  return {
    id: overrides.id ?? BOTTLE_ID,
    songId: SONG_ID,
    songTitle: '深海鲸落',
    status: overrides.status ?? 'HELD',
    totalSegments: 4,
    recordedCount:
      overrides.recordedCount ?? segments.filter((segment) => segment.deletedAt === null).length,
    missingSegmentIndexes,
    isComplete,
    seaZone: overrides.seaZone ?? null,
    revision: 3,
    createdAt: '2026-09-23T01:00:00.000Z',
    updatedAt: '2026-09-23T02:00:00.000Z',
    initiatorCode: overrides.initiatorCode ?? '午夜歌手#042',
    holderId: overrides.holderId === undefined ? USER_B : overrides.holderId,
    currentCasterId: USER_A,
    returnCompleted: false,
    returnChainBroken: false,
    segments,
    availableResolutions: overrides.availableResolutions ?? ['RIVER', 'RETURN'],
    isHolder: overrides.isHolder ?? true,
    replacementContext: null,
    riverCastAt: '2026-09-23T01:30:00.000Z',
    seaAt: null,
    damagedAt: null,
  };
}

export function bottleSummary(overrides: Partial<BottleSummary> = {}): BottleSummary {
  return {
    id: BOTTLE_ID,
    songId: SONG_ID,
    songTitle: '深海鲸落',
    status: 'SEA',
    totalSegments: 4,
    recordedCount: 4,
    missingSegmentIndexes: [],
    isComplete: true,
    seaZone: 'COMPLETED',
    revision: 9,
    createdAt: '2026-09-23T01:00:00.000Z',
    updatedAt: '2026-09-23T03:00:00.000Z',
    ...overrides,
  };
}

export function bottleEvent(overrides: Partial<BottleEvent> = {}): BottleEvent {
  return {
    seq: 1,
    type: 'BOTTLE_CREATED',
    actorId: USER_A,
    occurredAt: '2026-09-23T01:00:00.000Z',
    occurredAtMs: 1_758_592_800_000,
    ...overrides,
  };
}
