/**
 * 契约 DTO 组装（t9）：把「瓶子行 + 内核状态 + 段投影 + 匿名代号」拼成 `contracts/bottles.ts` 的形状。
 *
 * 放在 store 层而不是路由里：路由要薄，且这些派生值（缺口、可选去向、补位上下文、公海分区）
 * 一律**来自内核导出**，不在这里重算规则。
 */
import {
  availableResolutions,
  currentHolderId,
  gaps,
  isComplete,
  participants,
  replacementContext,
  seaZoneOf,
  type BottleState,
} from '@music-drift/shared/domain';
import type { BottleDetail, BottleSummary, Segment } from '@music-drift/shared';
import type { BottleRow, BottleSegmentRow } from './bottles.js';

function iso(date: Date | null): string | null {
  return date === null ? null : date.toISOString();
}

/**
 * 列表/详情的公共部分。
 *
 * ⚠️ `songTitle` **必须**由调用方查出来传进来：它不在 `bottles` 行里，早先这里写死空串，
 * 于是 `GET /api/sea` 返回的 `songTitle: ''` 直接违反契约 `BottleSummarySchema.songTitle.min(1)`
 * —— 公海列表会没有曲名。改成必填参数，让漏传在类型检查期就红。 */
export function toBottleSummary(
  row: BottleRow,
  state: BottleState,
  songTitle: string,
): BottleSummary {
  return {
    id: row.id,
    songId: row.songId,
    songTitle,
    status: state.status,
    totalSegments: state.totalSegments,
    recordedCount: state.segments.filter((segment) => segment.deletedAt === null).length,
    missingSegmentIndexes: gaps(state),
    isComplete: isComplete(state),
    seaZone: seaZoneOf(state),
    revision: state.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toSegments(
  rows: readonly BottleSegmentRow[],
  codes: ReadonlyMap<string, string>,
): Segment[] {
  return rows.map((row) => ({
    id: row.id,
    index: row.index,
    ownerId: row.ownerId,
    note: row.note,
    ownerCode: codes.get(row.ownerId) ?? '匿名歌手',
    likeCount: 0,
    dislikeCount: 0,
    deletedAt: null,
    audioMime: row.audioMime,
    durationMs: row.durationMs,
  }));
}

export interface DetailInput {
  /** §9.1：因"漂流中不可见后续"被裁掉的段数（0 = 未裁）。 */
  hiddenLaterSegmentCount?: number | undefined;
  row: BottleRow;
  state: BottleState;
  segments: readonly BottleSegmentRow[];
  codes: ReadonlyMap<string, string>;
  songTitle: string;
  voteCounts: ReadonlyMap<string, { likeCount: number; dislikeCount: number }>;
  viewerId: string | null;
}

export function toBottleDetail(input: DetailInput): BottleDetail {
  const { row, state, viewerId } = input;
  const segments = toSegments(input.segments, input.codes).map((segment) => ({
    ...segment,
    likeCount: input.voteCounts.get(segment.id)?.likeCount ?? 0,
    dislikeCount: input.voteCounts.get(segment.id)?.dislikeCount ?? 0,
  }));
  return {
    ...toBottleSummary(row, state, input.songTitle),
    initiatorCode: input.codes.get(state.initiatorId) ?? '匿名歌手',
    holderId: currentHolderId(state),
    currentCasterId: state.currentCasterId,
    returnCompleted: state.returnCompleted,
    returnChainBroken: state.returnChainBroken,
    segments,
    availableResolutions:
      viewerId === null
        ? []
        : availableResolutions(state, { userId: viewerId }).map((resolution) => resolution),
    isHolder: viewerId !== null && currentHolderId(state) === viewerId,
    hiddenLaterSegmentCount: input.hiddenLaterSegmentCount ?? 0,
    replacementContext: replacementContext(state),
    riverCastAt: iso(state.riverCastAt === null ? null : new Date(state.riverCastAt)),
    seaAt: iso(state.seaAt === null ? null : new Date(state.seaAt)),
    damagedAt: iso(state.damagedAt === null ? null : new Date(state.damagedAt)),
  };
}

/** 漂流日志用：参与者（含角色与段号）——供 `participants` 端点使用。 */
export function toParticipants(state: BottleState) {
  return participants(state);
}
