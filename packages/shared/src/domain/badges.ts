/**
 * 徽章判定（`CONTEXT.md` §10.1）。
 *
 * - 大徽章 `RETURN_COMPLETED`：发起者，且作品最终回传完成并入海；
 * - 小徽章 `DRIFT_PARTICIPANT`：最终版本里的所有接唱者（无论是否回传过）；
 * - 回传中断：没有大徽章，但参与者的「漂流参与」记录不丢（§11.1 漂流日志读的是 `participants`）。
 *
 * 徽章是从状态**派生**的（不存第二份真相）：只要状态一致，重复判定结果就一致。
 */
import { participants } from './queries';
import type { BadgeAward, BottleState } from './types';

export function evaluateBadges(state: BottleState): BadgeAward[] {
  const grantedAt = state.seaAt ?? state.damagedAt ?? state.updatedAt;
  const awards: BadgeAward[] = [];

  if (state.status === 'SEA' && state.returnCompleted) {
    awards.push({
      userId: state.initiatorId,
      kind: 'RETURN_COMPLETED',
      bottleId: state.id,
      grantedAt,
    });
  }

  if (state.status === 'SEA' || state.status === 'DAMAGED') {
    for (const record of participants(state)) {
      if (record.role === 'SINGER') {
        awards.push({
          userId: record.userId,
          kind: 'DRIFT_PARTICIPANT',
          bottleId: state.id,
          grantedAt,
        });
      }
    }
  }

  return awards;
}
