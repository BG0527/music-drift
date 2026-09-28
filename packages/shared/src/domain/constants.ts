/**
 * 领域常量与策略（`CONTEXT.md` §3/§4/§7/§11.3/§15 的可注入数值口径）。
 *
 * 纪律：内核不写死业务数字，全部走 `DomainPolicy`，便于按裁决翻案（D-13 / D-14）。
 */
/**
 * 系统行为（自动投河等）的 actor 哨兵值：真实 userId 不可能等于它，
 * 因此「不能接自己投出的瓶子」等守卫不会被系统行为误伤（ADR-015 §16.3）。
 */
export const SYSTEM_ACTOR_ID = 'SYSTEM';

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;

/**
 * D-13 默认值（单一出口）：72h 无人接唱 → 自动入海（captain 裁决；另一候选见 `DomainPolicy`）。
 */
export const DEFAULT_RIVER_TIMEOUT_OUTCOME: DomainPolicy['riverTimeoutOutcome'] = 'SEA';

export interface DomainPolicy {
  /** Demo 固定 4 段（CONTEXT §14.1）。 */
  totalSegments: number;
  /** 斩浪踩数阈值，默认 10（CONTEXT §7.2）。 */
  dislikeThreshold: number;
  /** 回河道后的打捞冷却次数，N = 10（CONTEXT §15）。 */
  putBackCooldownDraws: number;
  /** 投河后无人接唱的超时，72h（CONTEXT §11.3）。 */
  riverIdleTimeoutMs: number;
  /** 回传决策超时，48h（CONTEXT §11.3）。 */
  returnDecisionTimeoutMs: number;
  /** 点踩前必须听满的比例，0.8（CONTEXT §7.3）。 */
  dislikeListenRatioThreshold: number;
  /**
   * D-13（已裁决）：投河超时后的归宿。
   * 默认 `SEA`；`RETURN_TO_OWNER` 为 CONTEXT §11.3 原文的另一候选（保留可注入）。
   * 两者都只影响一条事件的选型，业务上翻转成本为 0。
   */
  riverTimeoutOutcome: 'SEA' | 'RETURN_TO_OWNER';
}

export const DEFAULT_POLICY: DomainPolicy = {
  totalSegments: 4,
  dislikeThreshold: 10,
  putBackCooldownDraws: 10,
  riverIdleTimeoutMs: 72 * HOUR_MS,
  returnDecisionTimeoutMs: 48 * HOUR_MS,
  dislikeListenRatioThreshold: 0.8,
  riverTimeoutOutcome: DEFAULT_RIVER_TIMEOUT_OUTCOME,
};
