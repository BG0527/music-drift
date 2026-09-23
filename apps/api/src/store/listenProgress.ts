/**
 * 「已听覆盖率」的服务端持久化（t20）：**唯一**的增长规则 + 读写实现。
 *
 * 三层职责，刻意分开，避免出现"第二份覆盖率规则"：
 * 1. **覆盖率语义**（听过区间并集、拖动不计、循环不叠加、时长不可信 → 0）由
 *    `packages/shared/src/audio/listening.ts` 提供：客户端用 `createListenTracker` 生成 `coveredMs`，
 *    服务端用同一个模块的 `listenedRatio` / `canDislike` 判比率与门槛 —— **本文件不重算覆盖率**；
 * 2. **增长规则**（本文件 `nextCoveredMs`）：只增不减 + 首次封顶一半 + 之后按**真实墙上时间**限速
 *    （宽限一次性、锚定首次上报预算，不按请求发放 —— t25/F1），使"上报"只是**增量输入**，
 *    既无法靠单次伪造、也无法靠连打多次跨过门槛；
 * 3. **持久化**（本文件 store）：`listen_progress(user_id, segment_id) = (covered_ms, duration_ms, updated_at)`，
 *    跨进程/跨会话保留 ⇒ "退出再回来不清零"。
 *
 * 时长的权威来源是 `bottle_segments.duration_ms`（上传时由 `x-audio-duration-ms` 头校验写入），
 * **不采信请求体里的时长** —— 否则伪造 `{coveredMs: X, durationMs: X}` 就是 100%。
 */
import {
  DEFAULT_POLICY,
  type Clock,
} from '@music-drift/shared/domain';
import { canDislike, listenedRatio } from '@music-drift/shared/audio';
import type { Db, Queryable } from '../db/client.js';

/**
 * 增长规则参数（**唯一实现**；测试里逐个钉住）：
 * - 首次上报最多给 `duration × 0.5`：必须**小于**点踩门槛，单次伪造才跨不过去；
 * - 之后最多按 `距上次上报的真实耗时 × 1.25` 增长；`RATE_SLACK_MS` 是**一次性**宽限，
 *   **锚定"首次上报预算"**（只在进度仍处于首次放行区间内时发放），不再按请求发放
 *   —— 见 `nextCoveredMs` 里 t25/F1 的说明。
 */
export const LISTEN_GROWTH = {
  FIRST_REPORT_MAX_RATIO: 0.5,
  RATE_TOLERANCE: 1.25,
  RATE_SLACK_MS: 3_000,
} as const;

export interface StoredListenProgress {
  coveredMs: number;
  updatedAtMs: number;
}

export interface ListenProgressDecision {
  coveredMs: number;
  /** 上报值被夹过（说明这次上报不可信/太快）—— 只用于诊断与测试，不影响判定。 */
  clamped: boolean;
}

function normalizeInt(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

/**
 * 由「上次的进度 + 本次上报 + 现在」算出该存多少（纯函数，无 IO）。
 * `durationMs` 必须是**服务端信任的**段时长（来自 `bottle_segments`）。
 */
export function nextCoveredMs(
  previous: StoredListenProgress | null,
  reported: { coveredMs: number; durationMs: number },
  nowMs: number,
): ListenProgressDecision {
  const durationMs = normalizeInt(reported.durationMs);
  if (durationMs === 0) {
    // fail-closed：时长不可信 → 覆盖率恒 0，记多少都点不了踩，因此不记进度
    return { coveredMs: 0, clamped: normalizeInt(reported.coveredMs) > 0 };
  }

  const bounded = Math.min(normalizeInt(reported.coveredMs), durationMs);

  if (previous === null) {
    const allowance = Math.floor(durationMs * LISTEN_GROWTH.FIRST_REPORT_MAX_RATIO);
    const coveredMs = Math.min(bounded, allowance);
    return { coveredMs, clamped: coveredMs < bounded };
  }

  const elapsedMs = Math.max(0, Math.floor(nowMs) - Math.floor(previous.updatedAtMs));
  /**
   * t25 / F1（review 阻断项）—— 宽限**锚定首次上报预算，只发一次**：
   *
   * 旧式 `cap = previous + floor(elapsed × 1.25) + RATE_SLACK_MS` 把 3s 宽限**按请求**发放，
   * 于是 `elapsed = 0` 时每次上报仍净增 3000ms ⇒ 零播放连打 4 次就跨过 80% 门槛（真 HTTP 复现）。
   *
   * 修法：只有当进度**仍处于首次放行区间内**（`previous.coveredMs <= firstGrantCap`）才发这一次宽限，
   * 之后完全按真实墙上时间增长。效果等价于锚定式预算
   * `firstGranted + floor((now − firstSeenAt) × 1.25) + RATE_SLACK_MS`
   * （每步只加 `elapsed × 1.25`，求和即得"首次预算 + 总真实耗时 × 1.25"，**不需要额外存 firstSeenAt**）。
   *
   * 不变式（有具名测试）：零延时连打任意次数，上限 = `firstGrantCap + RATE_SLACK_MS`。
   * 在 CONTEXT §14.1 允许的段长 15–30s 内 `0.5D + 3000 < 0.8D`（D > 10s）恒成立 ⇒ 永远跨不过门槛。
   *
   * 已知残余（非本任务范围，需业务裁决）：**"等够时间"≠"真的听"** —— 首次预算 0.5D 是白给的，
   * 之后只要真实等待 ~0.24×D（30s 段约 7.2s）再报一次即可达标。要做到"必须真的听"，
   * 需要上传播放位置序列（服务端重算 span）或按播放心跳计费，属契约级改动。
   */
  const firstGrantCap = Math.floor(durationMs * LISTEN_GROWTH.FIRST_REPORT_MAX_RATIO);
  const slackMs = previous.coveredMs <= firstGrantCap ? LISTEN_GROWTH.RATE_SLACK_MS : 0;
  const cap = previous.coveredMs + Math.floor(elapsedMs * LISTEN_GROWTH.RATE_TOLERANCE) + slackMs;
  const coveredMs = Math.max(previous.coveredMs, Math.min(bounded, cap));
  return { coveredMs, clamped: coveredMs < bounded };
}

export interface ListenProgressView {
  coveredMs: number;
  durationMs: number;
  /** 覆盖率 0..1（`listenedRatio`：时长不可信 → 0）。 */
  ratio: number;
  /** 点踩门槛（内核策略，不写死）。 */
  threshold: number;
  /** 服务端认为已达到门槛。 */
  reachedThreshold: boolean;
}

export interface ListenProgressStore {
  /** 记一次上报（增量输入），返回**服务端判定**后的视图；段不存在 → null。 */
  record(input: { userId: string; segmentId: string; coveredMs: number; nowMs: number }): Promise<ListenProgressView | null>;
  /** 读当前进度（投票判定用）；没有记录 → 0 覆盖率视图（段不存在 → null）。 */
  read(input: { userId: string; segmentId: string }): Promise<ListenProgressView | null>;
}

function viewOf(
  coveredMs: number,
  durationMs: number,
  threshold: number,
): ListenProgressView {
  const ratio = listenedRatio(coveredMs, durationMs);
  return { coveredMs, durationMs, ratio, threshold, reachedThreshold: canDislike(ratio, threshold) };
}

async function segmentDuration(queryable: Queryable, segmentId: string): Promise<number | null> {
  const rows = await queryable.query<{ duration_ms: number | null }>(
    `select duration_ms from bottle_segments where id = $1`,
    [segmentId],
  );
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return row.duration_ms ?? 0; // 未记录时长 → 0（fail-closed）
}

export function createListenProgressStore(
  db: Db,
  options: { threshold?: number } = {},
): ListenProgressStore {
  const threshold = options.threshold ?? DEFAULT_POLICY.dislikeListenRatioThreshold;

  return {
    async record(input): Promise<ListenProgressView | null> {
      return await db.withTransaction(async (tx) => {
        const durationMs = await segmentDuration(tx, input.segmentId);
        if (durationMs === null) {
          return null;
        }
        // `for update`：同一 (user, segment) 的并发上报串行化，避免两个请求各自读到旧值
        const rows = await tx.query<{ covered_ms: number; updated_at: Date }>(
          `select covered_ms, updated_at from listen_progress
           where user_id = $1 and segment_id = $2 for update`,
          [input.userId, input.segmentId],
        );
        const stored = rows[0];
        const previous =
          stored === undefined ? null : { coveredMs: stored.covered_ms, updatedAtMs: stored.updated_at.getTime() };

        const decision = nextCoveredMs(previous, { coveredMs: input.coveredMs, durationMs }, input.nowMs);
        const updatedAt = new Date(input.nowMs);
        await tx.query(
          `insert into listen_progress (user_id, segment_id, covered_ms, duration_ms, updated_at)
           values ($1, $2, $3, $4, $5)
           on conflict (user_id, segment_id)
           do update set covered_ms = excluded.covered_ms,
                         duration_ms = excluded.duration_ms,
                         updated_at = excluded.updated_at`,
          [input.userId, input.segmentId, decision.coveredMs, durationMs, updatedAt],
        );
        return viewOf(decision.coveredMs, durationMs, threshold);
      });
    },

    async read(input): Promise<ListenProgressView | null> {
      const rows = await db.query<{ covered_ms: number; duration_ms: number }>(
        `select covered_ms, duration_ms from listen_progress where user_id = $1 and segment_id = $2`,
        [input.userId, input.segmentId],
      );
      const stored = rows[0];
      if (stored !== undefined) {
        return viewOf(stored.covered_ms, stored.duration_ms, threshold);
      }
      // 没有记录：段存在则返回 0 覆盖率（投票判定用），段不存在则表示调用方该回 404
      const durationMs = await segmentDuration(db, input.segmentId);
      return durationMs === null ? null : viewOf(0, durationMs, threshold);
    },
  };
}

/** 便于路由层统一注入（缺省即内核策略，测试可覆盖）。 */
export function listenThresholdOf(policy: { dislikeListenRatioThreshold: number } | undefined): number {
  return policy?.dislikeListenRatioThreshold ?? DEFAULT_POLICY.dislikeListenRatioThreshold;
}

export type { Clock };
