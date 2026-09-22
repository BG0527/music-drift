/**
 * 并发持有者锁（`CONTEXT.md` §15 / §16：同一瓶子同一时间只有一个持有者）。
 *
 * 这里是**接口先行**：内核只规定「唯一持有者」的语义，
 * 进程内实现供测试与本地开发使用；生产环境由 T1.2 用
 * `holdings` 表的唯一索引 / 事务行锁实现同一接口（ADR-006）。
 */
import type { DomainEvent } from './events';
import { violation, type RuleViolation } from './errors';

export interface HoldingClaim {
  bottleId: string;
  holderId: string;
  acquiredAt: number;
}

export type HoldingClaimResult = { ok: true } | { ok: false; violations: RuleViolation[] };

export interface HoldingRegistry {
  /** 原子抢占：已被占用时返回 `HOLDING_ALREADY_TAKEN`，不改变任何状态。 */
  tryAcquire(claim: HoldingClaim): HoldingClaimResult;
  /** 释放；传入 holderId 时为「比较后释放」（防误放别人的锁），省略则强制释放。 */
  release(bottleId: string, holderId?: string): boolean;
  holderOf(bottleId: string): string | null;
}

export function createInMemoryHoldingRegistry(): HoldingRegistry {
  const holders = new Map<string, string>();
  return {
    tryAcquire: (claim: HoldingClaim): HoldingClaimResult => {
      if (holders.has(claim.bottleId)) {
        return { ok: false, violations: [violation('HOLDING_ALREADY_TAKEN')] };
      }
      holders.set(claim.bottleId, claim.holderId);
      return { ok: true };
    },
    release: (bottleId: string, holderId?: string): boolean => {
      const current = holders.get(bottleId);
      if (current === undefined || (holderId !== undefined && current !== holderId)) {
        return false;
      }
      holders.delete(bottleId);
      return true;
    },
    holderOf: (bottleId: string): string | null => holders.get(bottleId) ?? null,
  };
}

/**
 * 把领域事件同步到锁：命令是纯函数，副作用留给调用方显式执行。
 * 返回值是「本次被清掉或接手的瓶子」。仅换手/交还类事件会影响持有权。
 */
export function syncHoldingRegistry(
  registry: HoldingRegistry,
  events: readonly DomainEvent[],
): void {
  for (const event of events) {
    switch (event.type) {
      case 'BOTTLE_RETURNED':
      case 'BOTTLE_REWOUND':
        registry.release(event.bottleId);
        registry.tryAcquire({
          bottleId: event.bottleId,
          holderId: event.toUserId,
          acquiredAt: event.at,
        });
        break;
      case 'BOTTLE_CAST_TO_RIVER':
      case 'BOTTLE_PUT_BACK':
        if (event.actorId !== 'SYSTEM') {
          registry.release(event.bottleId, event.actorId);
        }
        break;
      // 作品终局 / 系统收回瓶子（斩浪开缺口）：锁必须释放，否则补位者抢不到。
      case 'BOTTLE_WENT_TO_SEA':
      case 'BOTTLE_DAMAGED':
      case 'BOTTLE_GAP_OPENED':
        registry.release(event.bottleId);
        break;
      default:
        break;
    }
  }
}
