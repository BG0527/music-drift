/**
 * 接力状态 → 中文文案（纯函数）。
 *
 * 铁律（ADR-015）：**段号是歌里的固定位置，永不压缩；完成度看缺口，不看段数。**
 * 所以这里只做"把服务端字段翻译成人话"，绝不自己数段数、也不自己判断是否完整。
 */
import type { BottleStatus, Resolution } from '@music-drift/shared';

export const BOTTLE_STATUS_LABEL: Record<BottleStatus, string> = {
  DRAFT: '草稿',
  IN_RIVER: '在河道',
  HELD: '有人持有',
  SEA: '已入公海',
  DAMAGED: '已损坏',
};

export interface ProgressInput {
  recordedCount: number;
  totalSegments: number;
  missingSegmentIndexes: readonly number[];
}

/** 「已录 2 / 4 段」（数字来自服务端 `recordedCount` / `totalSegments`）。 */
export function progressLabel(input: ProgressInput): string {
  return `已录 ${String(input.recordedCount)} / ${String(input.totalSegments)} 段`;
}

/** 缺口提示：`[2]` → 「缺第 2 段」；没有缺口返回 `null`（不显示空提示）。 */
export function gapNotice(missingSegmentIndexes: readonly number[]): string | null {
  if (missingSegmentIndexes.length === 0) return null;
  return `缺第 ${missingSegmentIndexes.join('、')} 段`;
}

export interface HeadlineInput {
  isComplete: boolean;
  missingSegmentIndexes: readonly number[];
  status: BottleStatus;
}

/** 一句话说清这瓶现在什么样：完整 / 缺哪几段。 */
export function relayHeadline(input: HeadlineInput): string {
  const gap = gapNotice(input.missingSegmentIndexes);
  if (input.isComplete) return '作品已完整，所有段位都有人唱过';
  if (gap !== null) return `作品还不完整：${gap}`;
  return '作品还没有有效唱段';
}

export interface ResolutionCopy {
  title: string;
  detail: string;
}

/** 去向三选一：每张选择卡都要说"会发生什么"，不能只写按钮名（CONTEXT §3.3）。 */
export const RESOLUTION_COPY: Record<Resolution, ResolutionCopy> = {
  RIVER: {
    title: '继续投河',
    detail: '把当前版本重新投进河道，交给下一位陌生人接下一棒。',
  },
  RETURN: {
    title: '回传',
    detail: '沿父链把当前版本交回投给你的那个人，由他决定下一步。',
  },
  SEA: {
    title: '入海',
    detail: '把当下的版本送进公海，成为所有人都能听到的公共作品。',
  },
};

export function resolutionCopy(resolution: Resolution): ResolutionCopy {
  return RESOLUTION_COPY[resolution];
}

/** 去向的展示顺序取服务端 `availableResolutions`（契约：顺序即展示顺序）。 */
export function resolutionOrder(available: readonly Resolution[]): Resolution[] {
  return [...available];
}
