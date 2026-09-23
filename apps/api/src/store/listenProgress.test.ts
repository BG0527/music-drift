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
import {
  LISTEN_GROWTH,
  isMeasuredDurationAcceptable,
  nextCoveredMs,
  resolveEffectiveDuration,
} from './listenProgress.js';

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

  it('同一时刻连续上报：宽限**只发一次**（锚定首次上报预算），不按请求次数累积', () => {
    const first = { coveredMs: 15_000, updatedAtMs: 1_000 };
    const once = nextCoveredMs(first, { coveredMs: DURATION_30S, durationMs: DURATION_30S }, 1_000);

    // 第一次后续上报：拿到一次性宽限
    expect(once.coveredMs).toBe(15_000 + LISTEN_GROWTH.RATE_SLACK_MS);
    expect(once.clamped).toBe(true);

    // 第二次立即上报（elapsed 仍为 0）：**不再发放**宽限
    const twice = nextCoveredMs(
      { coveredMs: once.coveredMs, updatedAtMs: 1_000 },
      { coveredMs: DURATION_30S, durationMs: DURATION_30S },
      1_000,
    );
    expect(twice.coveredMs).toBe(once.coveredMs);
    expect(twice.coveredMs).toBeLessThan(DURATION_30S * DEFAULT_POLICY.dislikeListenRatioThreshold);
  });

  /**
   * t25 / F1 的**核心不变式**（原实现缺这条，才让「3–4 次即时上报即跨门槛」漏到线上）：
   * 连打再多次、零播放、零延时，也**永远**跨不过点踩门槛。
   * 旧实现 `cap = previous + floor(elapsed×1.25) + 3000` 每次请求都发 3s ⇒ 4 次即 24s ⇒ 绕过。
   */
  it('t25/F1 不变式：N=10 次即时上报（零播放、零延时）仍达不到点踩门槛', () => {
    const threshold = DURATION_30S * DEFAULT_POLICY.dislikeListenRatioThreshold;
    let previous: { coveredMs: number; updatedAtMs: number } | null = null;
    const now = 1_000; // 时钟**一次都不推进**

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const decision = nextCoveredMs(previous, { coveredMs: DURATION_30S, durationMs: DURATION_30S }, now);
      previous = { coveredMs: decision.coveredMs, updatedAtMs: now };
      expect(decision.coveredMs).toBeLessThan(threshold);
    }

    // 硬上限：零延时下最多只能到「首次预算 + 一次宽限」，且必须严格低于门槛
    expect(previous?.coveredMs).toBe(
      Math.floor(DURATION_30S * LISTEN_GROWTH.FIRST_REPORT_MAX_RATIO) + LISTEN_GROWTH.RATE_SLACK_MS,
    );
  });

  it('t25/F1 边界：最小允许段长（15s）下连打同样跨不过门槛', () => {
    const duration = 15_000;
    const threshold = duration * DEFAULT_POLICY.dislikeListenRatioThreshold;
    let previous: { coveredMs: number; updatedAtMs: number } | null = null;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const decision = nextCoveredMs(previous, { coveredMs: duration, durationMs: duration }, 1_000);
      previous = { coveredMs: decision.coveredMs, updatedAtMs: 1_000 };
      expect(decision.coveredMs).toBeLessThan(threshold);
    }
  });

  it('正常路径不被夹：1×/秒实时上报持续增长，最终达到门槛（修漏洞不能废掉正常功能）', () => {
    const threshold = DURATION_30S * DEFAULT_POLICY.dislikeListenRatioThreshold;
    let previous: { coveredMs: number; updatedAtMs: number } | null = null;
    const growth: number[] = [];
    let now = 1_000;

    for (let second = 0; second < 20; second += 1) {
      const decision = nextCoveredMs(previous, { coveredMs: DURATION_30S, durationMs: DURATION_30S }, now);
      growth.push(decision.coveredMs);
      previous = { coveredMs: decision.coveredMs, updatedAtMs: now };
      now += 1_000; // 每秒上报一次，按 1× 实时速率
    }

    // 单调不减（进度只增不减）
    for (let index = 1; index < growth.length; index += 1) {
      expect(growth[index]!).toBeGreaterThanOrEqual(growth[index - 1]!);
    }
    // 且确实在有限次内达到门槛（否则就是"修了漏洞但顺手废掉正常路径"）
    expect(growth[growth.length - 1]!).toBeGreaterThanOrEqual(threshold);
    expect(growth.findIndex((coveredMs) => coveredMs >= threshold)).toBeLessThan(10);
  });

  it('等待后按墙上时间增长（1.25 倍容差），最终够得着门槛', () => {
    const previous = { coveredMs: 15_000, updatedAtMs: 1_000 };
    // 等 12 秒：15s + 12×1.25 = 30s → 夹到段长（100%）
    const decision = nextCoveredMs(previous, { coveredMs: DURATION_30S, durationMs: DURATION_30S }, 13_000);

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

/**
 * F2（t26）：**实测时长校正**的判定规则（纯函数，无 IO）。
 *
 * 背景：声明时长（上传时的 `x-audio-duration-ms`，15–30s）可能远大于文件真实长度，
 * 于是诚实用户永远够不到 0.8×声明值 的门槛；用户裁决 (c) = 播放时用浏览器实测
 * `HTMLMediaElement.duration` 回填分母。但**实测值同样来自客户端** ⇒ 这些规则
 * 只修诚实路径，**不是安全边界**（详见实现注释）。
 */
describe('F2：resolveEffectiveDuration（实测时长校正）', () => {
  const D = 30_000;

  it('样本不在可接受带内 → 一律不采用（防「2ms 时长」把门槛打到 0）', () => {
    for (const measured of [0, -1, 200, 400_000, Number.NaN, D * 2 + 1]) {
      expect(isMeasuredDurationAcceptable(measured, D)).toBe(false);
    }
    expect(isMeasuredDurationAcceptable(12_000, D)).toBe(true);
    expect(isMeasuredDurationAcceptable(1_000, D)).toBe(true);
  });

  it('无样本 → 用声明值，未校正', () => {
    const result = resolveEffectiveDuration({ declaredDurationMs: D, samples: [], maxCoveredMs: 0 });

    expect(result.effectiveDurationMs).toBe(D);
    expect(result.corrected).toBe(false);
    expect(result.direction).toBe('NONE');
    expect(result.sampleCount).toBe(0);
  });

  it('单个更小的实测值 → 立即下调（这正是 F2 要修的诚实场景）', () => {
    const result = resolveEffectiveDuration({
      declaredDurationMs: D,
      samples: [{ measuredDurationMs: 18_000, coveredMsAtReportMs: 9_000 }],
      maxCoveredMs: 9_000,
    });

    expect(result.effectiveDurationMs).toBe(18_000);
    expect(result.corrected).toBe(true);
    expect(result.direction).toBe('LOWER');
  });

  it('单个更大的实测值 → **只记录不生效**（需多用户接近），避免单点抬高分母', () => {
    const result = resolveEffectiveDuration({
      declaredDurationMs: D,
      samples: [{ measuredDurationMs: 40_000, coveredMsAtReportMs: 5_000 }],
      maxCoveredMs: 5_000,
    });

    expect(result.effectiveDurationMs).toBe(D);
    expect(result.corrected).toBe(false);
    expect(result.direction).toBe('PENDING_AGREEMENT');
  });

  it('两个互相接近（±10%）的上调样本 → 才允许升高', () => {
    const result = resolveEffectiveDuration({
      declaredDurationMs: D,
      samples: [
        { measuredDurationMs: 40_000, coveredMsAtReportMs: 5_000 },
        { measuredDurationMs: 41_000, coveredMsAtReportMs: 6_000 },
      ],
      maxCoveredMs: 6_000,
    });

    expect(result.effectiveDurationMs).toBe(40_500);
    expect(result.direction).toBe('RAISED');
    expect(result.corrected).toBe(true);
  });

  it('两个相差很远的上调样本 → 不生效（单点离群不足以改分母）', () => {
    const result = resolveEffectiveDuration({
      declaredDurationMs: D,
      samples: [
        { measuredDurationMs: 40_000, coveredMsAtReportMs: 5_000 },
        { measuredDurationMs: 55_000, coveredMsAtReportMs: 6_000 },
      ],
      maxCoveredMs: 6_000,
    });

    expect(result.effectiveDurationMs).toBe(D);
    expect(result.direction).toBe('PENDING_AGREEMENT');
  });

  it('多个样本取**中位数**（抗单点离群）', () => {
    const result = resolveEffectiveDuration({
      declaredDurationMs: D,
      samples: [
        { measuredDurationMs: 10_000, coveredMsAtReportMs: 5_000 },
        { measuredDurationMs: 11_000, coveredMsAtReportMs: 5_000 },
        { measuredDurationMs: 29_000, coveredMsAtReportMs: 5_000 },
      ],
      maxCoveredMs: 5_000,
    });

    expect(result.effectiveDurationMs).toBe(11_000);
  });

  it('下限 = max(500ms, 该段已记录的最大 coveredMs)：不出现 ratio>1、不追溯作废已听进度', () => {
    const result = resolveEffectiveDuration({
      declaredDurationMs: D,
      samples: [{ measuredDurationMs: 3_000, coveredMsAtReportMs: 12_000 }],
      maxCoveredMs: 12_000,
    });

    expect(result.effectiveDurationMs).toBe(12_000);
    expect(result.effectiveDurationMs).toBeGreaterThanOrEqual(12_000);
  });

  it('拒绝的样本不计入 sampleCount（审计口径：只数被采纳的）', () => {
    const result = resolveEffectiveDuration({
      declaredDurationMs: D,
      samples: [
        { measuredDurationMs: 200, coveredMsAtReportMs: 0 },
        { measuredDurationMs: 18_000, coveredMsAtReportMs: 9_000 },
      ],
      maxCoveredMs: 9_000,
    });

    expect(result.sampleCount).toBe(1);
    expect(result.effectiveDurationMs).toBe(18_000);
  });

  it('声明值未知（null，旧数据）时用绝对上限 60s 判带', () => {
    expect(isMeasuredDurationAcceptable(30_000, null)).toBe(true);
    expect(isMeasuredDurationAcceptable(61_000, null)).toBe(false);
    const result = resolveEffectiveDuration({
      declaredDurationMs: 0,
      samples: [],
      maxCoveredMs: 0,
    });
    expect(result.effectiveDurationMs).toBe(0);
  });
});
