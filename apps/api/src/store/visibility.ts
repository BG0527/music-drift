/** W18：瓶中当前全部有效段对所有观看者可见。 */
import type { BottleState } from '@music-drift/shared/domain';

export interface VisibilityInput {
  state: BottleState;
  viewerId: string | null;
}

/**
 * 段可见性的三种形态。
 *
 * ⚠️ 第一版把"不设上限"（持有者）和"什么都看不到"（陌生人）**都用 `null` 表示**，
 * 于是持有者被判成"看不到任何段" —— 测试当场抓住（`expected [] to deeply equal [1,2]`）。
 * 这属于**用一个值表达两件事**的经典错误，所以改成显式三态。
 */
export type SegmentVisibility = { mode: 'ALL'; drifting: boolean };

export function segmentVisibility({ state }: VisibilityInput): SegmentVisibility {
  // W18 验收裁决：持有者、非持有者和未登录访客都能听当前全部已录段。
  return { mode: 'ALL', drifting: state.status !== 'SEA' };
}

/** 段是否对观看者可见。 */
export function isSegmentVisible(visibility: SegmentVisibility, index: number): boolean {
  return visibility.mode === 'ALL' && Number.isInteger(index) && index > 0;
}
