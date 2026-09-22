/**
 * 「已播放时长」与「听满 80%」的**测量层**（纯逻辑，无 IO / 无 DOM）。
 *
 * 为什么不是简单的"累计播放时长"：那会让循环重播一小段就解锁点踩
 * （2 秒的片段重播 10 次 = 20 秒，比整段还长）。CONTEXT §7.3 的要求是
 * **听满该段 80%**，因此这里的口径是**覆盖率**：
 *
 * - `coveredMs` = 真的播放过的音频区间的**并集**长度（同一区间重播只算一次）；
 * - `playedMs` = 累计播放时长（含重播），只用于展示与诊断；
 * - `ratio` = `coveredMs / durationMs`（0..1，截断）；
 * - 点踩门槛用 `ratio`，门槛值取自领域内核 `DEFAULT_POLICY.dislikeListenRatioThreshold`（0.8），
 *   这里**不另写一份魔数**，避免策略翻案时两处真相。
 *
 * 反作弊（全部有测试钉住）：
 * 1. **跳转不计**：相邻两次观察的时间差 > `maxStepMs`（默认 1500ms，浏览器 `timeupdate` 约 250ms 一次）
 *    视为拖动进度条，不产生任何覆盖率；
 * 2. **重播不叠加**：覆盖率是区间并集，重播已覆盖区间不增加覆盖率；
 * 3. **兜底后置**：时长不可信（0 / NaN）时 `ratio` 恒为 0（fail-closed：宁可点不了踩）；
 * 4. 只有"连续播放推进"到片尾时，`markEnded()` 才补齐最后一个 tick 与结尾之间的真实播放时长
 *    （否则拖到 99% 再等 `ended` 就能白拿尾差）。
 */
import { DEFAULT_POLICY } from '../domain/constants';

/**
 * 相邻两次播放位置观察之间的**最大**合理间隔。
 * 浏览器 `timeupdate` 约每 250ms 触发一次；超过此值的前进跳跃按"拖动进度条"处理。
 */
export const DEFAULT_MAX_STEP_MS = 1_500;

/** 已覆盖的音频区间（半开/闭合无关，合并规则同时吸收重叠与相邻）。 */
export interface ListenSpan {
  startMs: number;
  endMs: number;
}

export interface ListenProgress {
  /** 累计已播放时长（ms，含重播；只统计连续播放推进的时长）。仅用于展示。 */
  playedMs: number;
  /** 已覆盖的音频区间并集长度（ms）。判断"听满"的唯一依据。 */
  coveredMs: number;
  /** 覆盖率 = coveredMs / durationMs，0..1。时长不可信时为 0。 */
  ratio: number;
  /** 最近一次观察到的播放位置（ms）。 */
  positionMs: number;
  /** 覆盖区间的个数（连续播放段数；用于诊断，不参与判定）。 */
  spanCount: number;
  /** 是否已达到点踩门槛（`ratio >= threshold`）。 */
  dislikeUnlocked: boolean;
}

export interface ListenTrackerOptions {
  /** 该段音频时长（ms）；来自服务端（`SegmentSchema.durationMs`），不可信时按 0 处理。 */
  durationMs: number;
  /** 大跳跃容差，默认 `DEFAULT_MAX_STEP_MS`。 */
  maxStepMs?: number;
  /** 点踩门槛，默认内核策略值 0.8。 */
  threshold?: number;
}

export interface ListenTracker {
  readonly durationMs: number;
  readonly threshold: number;
  /** 播放位置观察（接 `timeupdate`）。 */
  observe(positionMs: number): ListenProgress;
  /** 跳转信号（接 `seeking`）：重置连续性，下一次观察不计入覆盖率。 */
  markSeek(): void;
  /** 播放结束（接 `ended`）：仅在连续播放到片尾时补齐尾差。 */
  markEnded(): ListenProgress;
  /** 只读快照。 */
  progress(): ListenProgress;
  /** 清空全部观察（重录 / 换段）。 */
  reset(): void;
}

/** 覆盖率：`0..1`，时长或数值不可信时按 0（fail-closed）。 */
export function listenedRatio(coveredMs: number, durationMs: number): number {
  if (!Number.isFinite(coveredMs) || !Number.isFinite(durationMs)) return 0;
  if (durationMs <= 0 || coveredMs <= 0) return 0;
  return Math.min(1, coveredMs / durationMs);
}

/** 是否达到点踩门槛。`ratio` 不可信 → 不放行。 */
export function canDislike(
  ratio: number,
  threshold: number = DEFAULT_POLICY.dislikeListenRatioThreshold,
): boolean {
  if (!Number.isFinite(ratio)) return false;
  return ratio >= threshold;
}

/** 合并新区间进已排序、互不相邻的区间表。 */
function mergeSpan(spans: ListenSpan[], startMs: number, endMs: number): ListenSpan[] {
  const merged: ListenSpan[] = [];
  let pending: ListenSpan = { startMs, endMs };
  for (const span of spans) {
    if (span.endMs < pending.startMs) {
      merged.push(span);
    } else if (span.startMs > pending.endMs) {
      merged.push(pending);
      pending = span;
    } else {
      pending = {
        startMs: Math.min(pending.startMs, span.startMs),
        endMs: Math.max(pending.endMs, span.endMs),
      };
    }
  }
  merged.push(pending);
  return merged;
}

function coverageOf(spans: readonly ListenSpan[]): number {
  let total = 0;
  for (const span of spans) total += span.endMs - span.startMs;
  return total;
}

export function createListenTracker(options: ListenTrackerOptions): ListenTracker {
  const rawDuration = options.durationMs;
  const durationMs = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0;
  const maxStepMs =
    Number.isFinite(options.maxStepMs) && (options.maxStepMs ?? 0) > 0
      ? (options.maxStepMs as number)
      : DEFAULT_MAX_STEP_MS;
  const threshold = Number.isFinite(options.threshold)
    ? (options.threshold as number)
    : DEFAULT_POLICY.dislikeListenRatioThreshold;

  let spans: ListenSpan[] = [];
  let playedMs = 0;
  let positionMs = 0;
  /**
   * 上一次位移是否构成"连续播放"（用于 `markEnded` 的尾差补齐）。
   * 初始为 false：首帧之前没有任何证据说明音频真的在播。
   */
  let continuous = false;
  /**
   * 位置是否已知。
   * - 起播时**已知**且为 0：`HTMLAudioElement.currentTime` 初始就是 0，因此首次观察推进的
   *   那段（通常一个 `timeupdate` 间隔）可以计；
   * - `markSeek()` 之后变为**未知**：跳转落点任意，下一次观察只定位、不计数（反作弊）。
   */
  let positionKnown = true;

  function clamp(value: number): number {
    if (value < 0) return 0;
    return durationMs > 0 ? Math.min(value, durationMs) : value;
  }

  function snapshot(): ListenProgress {
    const coveredMs = coverageOf(spans);
    const ratio = listenedRatio(coveredMs, durationMs);
    return {
      playedMs,
      coveredMs,
      ratio,
      positionMs,
      spanCount: spans.length,
      dislikeUnlocked: canDislike(ratio, threshold),
    };
  }

  return {
    durationMs,
    threshold,

    observe(nextMs: number): ListenProgress {
      if (!Number.isFinite(nextMs)) return snapshot();
      const next = clamp(nextMs);
      if (!positionKnown) {
        positionMs = next;
        positionKnown = true;
        continuous = false;
        return snapshot();
      }
      const delta = next - positionMs;
      if (delta > 0) {
        if (delta <= maxStepMs) {
          playedMs += delta;
          spans = mergeSpan(spans, positionMs, next);
          continuous = true;
        } else {
          continuous = false; // 前进跳跃 = 拖动进度条
        }
      } else if (delta < 0) {
        continuous = false; // 回退 = 跳转或重播
      }
      positionMs = next;
      return snapshot();
    },

    markSeek(): void {
      positionKnown = false;
      continuous = false;
    },

    markEnded(): ListenProgress {
      if (continuous && durationMs > 0) {
        const tailEnd = Math.min(durationMs, positionMs + maxStepMs);
        if (tailEnd > positionMs) {
          playedMs += tailEnd - positionMs;
          spans = mergeSpan(spans, positionMs, tailEnd);
          positionMs = tailEnd;
        }
      }
      continuous = false;
      return snapshot();
    },

    progress: snapshot,

    reset(): void {
      spans = [];
      playedMs = 0;
      positionMs = 0;
      continuous = false;
      positionKnown = true;
    },
  };
}
