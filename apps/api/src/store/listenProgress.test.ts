/**
 * 已听覆盖率的**服务端增长规则**（t20）：纯函数，无 DB、无时钟依赖（时间由参数注入）。
 *
 * 为什么要有这个函数、而不是把上报值直接写库：
 * 1. **只增不减**：进度是"历史最大值"，退出再回来不清零（用户诉求原文）；
 * 2. **单次上报不能把覆盖率抬高**：否则一个 `POST /listen {coveredMs: 999999}` 就能绕过听满门槛
 *    ⇒ 首次上报最多给**段长的一半**，之后每次最多按"距上次上报的墙上时间 × 1.25 + 3s 宽限"增长。
 *    正常周期上报（播放中每几秒一次、按 1× 实时速率）永远不会被夹；
 * 3. **时长不可信则不记进度**（fail-closed）：宽度语义上，`durationMs <= 0` 时覆盖率恒 0，
 *    记多少都点不了踩，索性不记（免得给"已经听过"的错觉）。
 *
 * ⚠️ 这里**只是"输入的可信度/增长"规则**，不是第二份覆盖率规则：覆盖率本身仍由
 * `packages/shared/src/audio/listening.ts` 的 `listenedRatio` / `canDislike` 判定（见 store 层）。
 */
import { DEFAULT_POLICY } from '@music-drift/shared/domain';
import { describe, expect, it } from 'vitest';
import { LISTEN_GROWTH, nextCoveredMs } from './listenProgress.js';

const DURATION_30S = 30_000;

describe('nextCoveredMs：只增不减 + 首次封顶一半 + 之后按真实时间增长', () => {
  it('首次上报最多给段长的一半 —— 单次伪造到"全听完"会被夹下来', () => {
    const decision = nextCoveredMs(null, { coveredMs: DURATION_30S, durationMs: DURATION_30S }, 1_000);

    expect(decision.coveredMs).toBe(15_000);
    expect(decision.clamped).toBe(true);
    // 关键不变式：首次放行上限**必须**低于点踩门槛，否则"单次伪造即绕过"
    expect(LISTEN_GROWTH.FIRST_REPORT_MAX_RATIO).toBeLessThan(
      DEFAULT_POLICY.dislikeListenRatioThreshold,
    );
  });

  it('首次上报小于一半时按原值（正常播放不受影响）', () => {
    const decision = nextCoveredMs(null, { coveredMs: 4_000, durationMs: DURATION_30S }, 1_000);

    expect(decision.coveredMs).toBe(4_000);
    expect(decision.clamped).toBe(false);
  });

  it('同一时刻连续上报：只能多拿一个"宽限"（3s），不能一步跳满', () => {
    const previous = { coveredMs: 15_000, updatedAtMs: 1_000 };
    const decision = nextCoveredMs(previous, { coveredMs: DURATION_30S, durationMs: DURATION_30S }, 1_000);

    expect(decision.coveredMs).toBe(15_000 + LISTEN_GROWTH.RATE_SLACK_MS);
    expect(decision.clamped).toBe(true);
    expect(decision.coveredMs).toBeLessThan(DURATION_30S * DEFAULT_POLICY.dislikeListenRatioThreshold);
  });

  it('等待后按墙上时间增长（1.25 倍容差），最终够得着门槛', () => {
    const previous = { coveredMs: 15_000, updatedAtMs: 1_000 };
    // 等 10 秒：15s + 10×1.25 + 3s = 30.5s → 夹到段长 30s（= 100%）
    const decision = nextCoveredMs(previous, { coveredMs: DURATION_30S, durationMs: DURATION_30S }, 11_000);

    expect(decision.coveredMs).toBe(DURATION_30S);
    expect(decision.clamped).toBe(false);
  });

  it('先报大值再报小值：保持历史最大值（进度只增不减）', () => {
    const big = nextCoveredMs(null, { coveredMs: 15_000, durationMs: DURATION_30S }, 1_000);
    expect(big.coveredMs).toBe(15_000);

    const small = nextCoveredMs(
      { coveredMs: big.coveredMs, updatedAtMs: 1_000 },
      { coveredMs: 2_000, durationMs: DURATION_30S },
      2_000,
    );

    expect(small.coveredMs).toBe(15_000);
    expect(small.clamped).toBe(false);
  });

  it('上报超过段长 → 夹到段长（覆盖率封顶 1）', () => {
    const decision = nextCoveredMs(
      { coveredMs: 29_000, updatedAtMs: 0 },
      { coveredMs: 999_999, durationMs: DURATION_30S },
      60_000,
    );

    expect(decision.coveredMs).toBe(DURATION_30S);
  });

  it('时长不可信（0 / 负数 / NaN）→ 不记进度（fail-closed，覆盖率恒 0）', () => {
    for (const durationMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const decision = nextCoveredMs(null, { coveredMs: 999_999, durationMs }, 1_000);
      expect(decision.coveredMs).toBe(0);
    }
  });

  it('畸形上报值（负数/小数/NaN）被归一化，不会污染库', () => {
    expect(nextCoveredMs(null, { coveredMs: -5, durationMs: DURATION_30S }, 0).coveredMs).toBe(0);
    expect(nextCoveredMs(null, { coveredMs: 1_999.7, durationMs: DURATION_30S }, 0).coveredMs).toBe(1_999);
    expect(nextCoveredMs(null, { coveredMs: Number.NaN, durationMs: DURATION_30S }, 0).coveredMs).toBe(0);
  });
});
