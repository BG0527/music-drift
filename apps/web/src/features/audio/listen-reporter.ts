/**
 * 收听覆盖率上报器（t21）+ **实测时长上报**（t28 / F2）。
 *
 * ## 为什么必须周期性上报覆盖率（而不是投票前塞一个数）
 *
 * t20 之后服务端的增长规则是：
 *
 * ```text
 * 首次上报：最多给 段长 × 0.5                      （单次伪造必然 < 门槛）
 * 之后每次：最多增长 距上次上报的墙上时间 × 1.25 + 3s （想跳到门槛必须真的等够时间）
 * ```
 *
 * 所以客户端**唯一诚实且可行的路径**就是：播放过程中按真实覆盖周期性上报。
 *
 * ## 为什么还要报"实测时长"（F2）
 *
 * 点踩门槛的分母是**上传者自报**的 `x-audio-duration-ms`。真实 2s 却声明 30s 的段，
 * 诚实听众最多覆盖 2s ⇒ ratio ≤ 6.7% ⇒ **永久点不了踩**（上传者可单方面冻结自己那段的斩浪）。
 * 用户裁决 (c)：播放时用浏览器**实测** `HTMLMediaElement.duration` 上报，供服务端校正分母。
 *
 * 三条纪律：
 * - **只来自真实播放**：必须是 `durationchange/loadedmetadata` 之后读到的值，且 `playedMs > 0`
 *   （没播过就不算"播放时实测"）；
 * - **fail-closed**：`NaN / Infinity / ≤0 / <500ms / >5min / 远大于声明值` 一律**不上报**
 *   —— 分母宁可不动，也不能被脏值污染（分母一坏整段门槛永远算错）；
 * - **一次性**：同一页面会话内同一段最多报一次；**失败也不重试**（值不会变好，重试只是刷接口），
 *   与周期性覆盖上报**完全分开**（独立端点、独立状态，互不遮蔽）。
 *
 * ⚠️ **诚实边界（必须让后端知道）**：这个"实测值"同样来自客户端，因此**只修诚实路径，
 * 不构成对恶意客户端的安全防护** —— 脚本可以登录后直接 POST 一个数字。前端能提供的
 * "真实播放前置"仅为：值来自解码器的 `duration`、且此刻 `playedMs > 0`；服务端若要更强的保证，
 * 需要自己做（例如要求该 (user, segment) 已有覆盖率记录、`measured >= covered`、跨用户聚合取中位数、
 * 只允许下调分母）。详见 `docs/audio.md` 的 F2 小节。
 */
import { DEFAULT_POLICY } from '@music-drift/shared/domain';

export interface MeasuredDurationContext {
  /** 客户端已知的**声明时长**（段行 `duration_ms`，可能为 null）——服务端可用它做宽窄带判断。 */
  declaredDurationMs: number | null;
  /** 上报这一刻已覆盖的毫秒数（服务端可校验 `measured >= covered`：覆盖不可能超过真实时长）。 */
  coveredMsAtReportMs: number;
}

export interface ListenReportTransport {
  /** `POST /api/segments/:id/listen`，body 只有 `coveredMs`（时长以服务端段行为准）。 */
  reportListen: (
    segmentId: string,
    coveredMs: number,
  ) => Promise<{ status: number; body: unknown }>;
  /**
   * `POST /api/segments/:id/duration`（t28 / F2）：把**播放实测**的真实时长报给服务端校正门槛分母。
   * **可选**：不实现表示该传输层不支持时长上报（状态记为 `unavailable`，其它功能不受影响）。
   */
  reportMeasuredDuration?: (
    segmentId: string,
    measuredDurationMs: number,
    context: MeasuredDurationContext,
  ) => Promise<{ status: number; body: unknown }>;
  /** `POST /api/segments/:id/votes`，**body 只有 value**。 */
  castVote: (
    segmentId: string,
    body: { value: 'DISLIKE' | 'LIKE' },
  ) => Promise<{ status: number; body: unknown }>;
}

export interface MeasuredDurationReport {
  status: 'reported' | 'skipped' | 'failed' | 'unavailable';
  /** 客户端实测值（被拦下时为原始值，便于诊断）。 */
  measuredDurationMs: number | null;
  /** 值不可信被拦下的原因（仅 status='skipped'）。 */
  skippedReason?: string;
  /** 服务端采纳后的有效时长与是否发生校正（仅 status='reported'）。 */
  effectiveDurationMs?: number;
  corrected?: boolean;
  /**
   * 本次测量的生效方向（t26 冻结字段）：
   * - `LOWER`：实测比声明短 ⇒ **立即下调分母**（F2 要修的诚实场景）；
   * - `NONE`：一致，无需校正；
   * - `PENDING_AGREEMENT`：实测比声明长 ⇒ **只记录、不生效**，等 ≥2 个不同用户互相接近才上调
   *   （升调是对作者有利的滥用方向，故要求多用户一致）。
   */
  direction?: 'LOWER' | 'NONE' | 'PENDING_AGREEMENT';
  message?: string;
}

export interface ListenReporterState {
  /** 本地观测到的最大覆盖（来自 `ListenTracker`）。 */
  pendingCoveredMs: number;
  /** 服务端已确认记录的最大覆盖。 */
  reportedCoveredMs: number;
  /** 服务端确认的比率（0..1）；从未上报过为 null。 */
  serverRatio: number | null;
  /** 服务端给的段时长（用于展示"共多少秒"）。 */
  serverDurationMs: number | null;
  /** 上次上报失败的原因（成功则清空）。 */
  lastError: string | null;
  /** 上一次点踩是否因"没听满"被拒（供界面提示，成功投票后清除）。 */
  thresholdNotReached: boolean;
  /** 是否正在上报（请求在途）。 */
  reporting: boolean;
  /** 实测时长上报的状态（t28）：一次性；`skipped` = 值不可信被 fail-closed 拦下。 */
  durationReport: MeasuredDurationReport | null;
}

export interface ListenReporterOptions {
  segmentId: string;
  transport: ListenReportTransport;
  /** 上报周期（ms）：默认 1000；播放中每周期最多发一次请求。 */
  periodMs?: number;
  /** 本地门槛（仅用于按钮即时反馈；判定仍以服务端为准）。 */
  threshold?: number;
  /** 段行声明时长（用于实测时长的宽窄带判断）；缺失时回落到 `/listen` 响应里的值。 */
  declaredDurationMs?: number | null;
}

export interface ReportOutcome {
  ok: boolean;
  status: number;
  coveredMs: number;
  ratio: number;
  message: string | null;
}

export interface VoteOutcome {
  ok: boolean;
  status: number;
  code: string | null;
  message: string | null;
  segmentCut: boolean;
}

export interface MeasuredDurationSnapshot {
  coveredMs: number;
  /** 累计播放毫秒数（`ListenTracker.playedMs`）——**必须 > 0 才允许上报实测时长**（真实播放前置）。 */
  playedMs?: number;
  /** `HTMLMediaElement.duration × 1000`；未知传 null。 */
  measuredDurationMs?: number | null;
  /** 段行声明时长（组件已知，随快照一起带下来，避免依赖 `/listen` 的返回时序）。 */
  declaredDurationMs?: number | null;
}

export interface ListenReporter {
  /** 接 `SegmentPlayer.onProgress`（覆盖率 + 可选实测时长）。 */
  observe: (snapshot: MeasuredDurationSnapshot) => void;
  /** 立刻把最新覆盖报上去（切换段、页面隐藏、投票前用）。 */
  flush: () => Promise<ReportOutcome>;
  /** 先 flush，再投点踩票（**票体不含 `listenedRatio`**）。 */
  castDislike: () => Promise<VoteOutcome>;
  /** 本地是否已达门槛（即时反馈用；真正的判定看服务端 422）。 */
  localUnlocked: () => boolean;
  state: () => ListenReporterState;
  subscribe: (listener: (state: ListenReporterState) => void) => () => void;
  dispose: () => void;
}

const DEFAULT_PERIOD_MS = 1_000;

/** 实测时长的可信区间（客户端侧 fail-closed；服务端应镜像同一 band）。 */
export const MEASURED_DURATION_BOUNDS = {
  /** 下界：短于 0.5s 的"时长"几乎一定是解码/流式未就绪的产物（Safari 在未 demux 完时常给极小值）。 */
  minMs: 500,
  /** 上界：5 分钟（段本身只有 15–30s；超出即视为不可信）。 */
  maxMs: 300_000,
  /** 相对声明值的宽松倍数：声明 20s 时允许到 40s（与下面 floor 取较大者）。 */
  declaredMultiple: 2,
  /** 相对声明值的绝对下限：即使声明很短，也允许到 60s。 */
  declaredFloorMs: 60_000,
} as const;

/**
 * 实测时长是否可信（**纯函数，fail-closed**）。
 *
 * 不可信一律返回 `reason`，调用方**不得上报** —— 分母宁可不动，也不能被脏值污染。
 * 注意方向性：实测**比声明短**正是 F2 要修的诚实场景（允许）；实测**远大于声明**才是可疑方向。
 */
export function checkMeasuredDuration(
  measuredDurationMs: number | null | undefined,
  declaredDurationMs: number | null | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (measuredDurationMs === null || measuredDurationMs === undefined) {
    return { ok: false, reason: 'duration 未知（还没拿到 loadedmetadata）' };
  }
  if (!Number.isFinite(measuredDurationMs)) {
    return { ok: false, reason: 'duration 不是有限数（NaN / Infinity）' };
  }
  if (measuredDurationMs <= 0) {
    return { ok: false, reason: 'duration <= 0' };
  }
  if (measuredDurationMs < MEASURED_DURATION_BOUNDS.minMs) {
    return { ok: false, reason: `duration < ${String(MEASURED_DURATION_BOUNDS.minMs)}ms` };
  }
  if (measuredDurationMs > MEASURED_DURATION_BOUNDS.maxMs) {
    return { ok: false, reason: `duration > ${String(MEASURED_DURATION_BOUNDS.maxMs)}ms` };
  }
  const declared = declaredDurationMs ?? null;
  if (declared !== null && Number.isFinite(declared) && declared > 0) {
    const ceiling = Math.max(
      declared * MEASURED_DURATION_BOUNDS.declaredMultiple,
      MEASURED_DURATION_BOUNDS.declaredFloorMs,
    );
    if (measuredDurationMs > ceiling) {
      return { ok: false, reason: `duration 远大于声明值（> ${String(Math.round(ceiling))}ms）` };
    }
  }
  return { ok: true };
}

/** 读取 t26 约定的 `direction`（白名单校验；未知/缺失返回 null）。 */
function readDirection(source: unknown): 'LOWER' | 'NONE' | 'PENDING_AGREEMENT' | null {
  if (typeof source !== 'object' || source === null) return null;
  const value = (source as { direction?: unknown }).direction;
  return value === 'LOWER' || value === 'NONE' || value === 'PENDING_AGREEMENT' ? value : null;
}

function readNumber(source: unknown, key: string): number | null {
  if (typeof source !== 'object' || source === null) return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 从服务端响应里取错误码与文案（`{error:{message, violations:[{code,message}]}}`）。 */
function readError(body: unknown): { code: string | null; message: string | null } {
  if (typeof body !== 'object' || body === null) return { code: null, message: null };
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return { code: null, message: null };
  const message = (error as { message?: unknown }).message;
  const violations = (error as { violations?: unknown }).violations;
  const firstViolation = Array.isArray(violations) ? (violations[0] as unknown) : null;
  const code =
    typeof firstViolation === 'object' && firstViolation !== null
      ? (firstViolation as { code?: unknown }).code
      : null;
  return {
    code: typeof code === 'string' ? code : null,
    message: typeof message === 'string' ? message : null,
  };
}

export function createListenReporter(options: ListenReporterOptions): ListenReporter {
  const periodMs = options.periodMs ?? DEFAULT_PERIOD_MS;
  const threshold = options.threshold ?? DEFAULT_POLICY.dislikeListenRatioThreshold;

  let state: ListenReporterState = {
    pendingCoveredMs: 0,
    reportedCoveredMs: 0,
    serverRatio: null,
    serverDurationMs: null,
    lastError: null,
    thresholdNotReached: false,
    reporting: false,
    durationReport: null,
  };

  const listeners = new Set<(next: ListenReporterState) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;
  let inFlight = false;
  /** 实测时长是**一次性**的：发过就不再发（失败也不重试 —— 值不会变好，重试只是刷接口）。 */
  let durationReported = false;

  const emit = (patch: Partial<ListenReporterState>): void => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };

  /** 上报一次覆盖（内部用：不允许并发在同一时刻重复打接口）。 */
  const report = async (coveredMs: number): Promise<ReportOutcome> => {
    emit({ reporting: true });
    try {
      const response = await options.transport.reportListen(options.segmentId, coveredMs);
      const serverCovered = readNumber(response.body, 'coveredMs');
      const ratio = readNumber(response.body, 'ratio');
      const durationMs = readNumber(response.body, 'durationMs');
      if (response.status < 200 || response.status >= 300) {
        const { message } = readError(response.body);
        emit({
          reporting: false,
          lastError: message ?? `上报失败（HTTP ${String(response.status)}）`,
        });
        return {
          ok: false,
          status: response.status,
          coveredMs: state.reportedCoveredMs,
          ratio: state.serverRatio ?? 0,
          message: state.lastError,
        };
      }
      emit({
        reporting: false,
        lastError: null,
        reportedCoveredMs: Math.max(state.reportedCoveredMs, serverCovered ?? coveredMs),
        serverRatio: ratio ?? state.serverRatio,
        serverDurationMs: durationMs ?? state.serverDurationMs,
      });
      return {
        ok: true,
        status: response.status,
        coveredMs: state.reportedCoveredMs,
        ratio: state.serverRatio ?? 0,
        message: null,
      };
    } catch (thrown) {
      const message = `上报收听覆盖失败：${thrown instanceof Error ? thrown.message : '网络错误'}`;
      emit({ reporting: false, lastError: message });
      return {
        ok: false,
        status: 0,
        coveredMs: state.reportedCoveredMs,
        ratio: state.serverRatio ?? 0,
        message,
      };
    }
  };

  /**
   * 实测时长上报（t28 / F2）。三条件同时满足才发，任一不满足都不发：
   * ① 真实播放过（`playedMs > 0`）；② `duration` 通过 fail-closed band；③ 还没发过（一次性）。
   */
  const maybeReportMeasuredDuration = (snapshot: MeasuredDurationSnapshot): void => {
    const send = options.transport.reportMeasuredDuration;
    if (send === undefined) {
      if (state.durationReport === null) {
        emit({ durationReport: { status: 'unavailable', measuredDurationMs: null } });
      }
      return;
    }
    if (durationReported) return;

    const measured = snapshot.measuredDurationMs ?? null;
    const declared =
      snapshot.declaredDurationMs ?? options.declaredDurationMs ?? state.serverDurationMs;

    // ① 真实播放前置：没播过就不算"播放时实测"
    const playedMs = snapshot.playedMs ?? state.pendingCoveredMs;
    if (!Number.isFinite(playedMs) || playedMs <= 0) return;

    // ② fail-closed band
    const check = checkMeasuredDuration(measured, declared);
    if (!check.ok) {
      // "还没拿到值"（undefined/null）不算异常，不产生 skipped 状态；只有"拿到但不可信"才记
      if (measured !== null) {
        emit({
          durationReport: {
            status: 'skipped',
            measuredDurationMs: measured,
            skippedReason: check.reason,
          },
        });
      }
      return;
    }

    // ③ 一次性：先置位再发，失败也不重发
    durationReported = true;
    const value = measured as number;
    void send(options.segmentId, value, {
      declaredDurationMs: declared ?? null,
      coveredMsAtReportMs: state.pendingCoveredMs,
    })
      .then((response) => {
        if (response.status < 200 || response.status >= 300) {
          const { message } = readError(response.body);
          const reason = message ?? `HTTP ${String(response.status)}`;
          // 注意：**不写**共享 `lastError` —— 覆盖率通道的成功上报会清空它，
          // 那会把时长通道的失败擦掉（两条通道互相遮蔽）。时长通道的错误只放 `durationReport.message`。
          emit({
            durationReport: {
              status: 'failed',
              measuredDurationMs: value,
              message: `上报被拒：${reason}`,
            },
          });
          return;
        }
        const effective = readNumber(response.body, 'effectiveDurationMs');
        const direction = readDirection(response.body);
        emit({
          durationReport: {
            status: 'reported',
            measuredDurationMs: value,
            // exactOptionalPropertyTypes：可选字段要么给值、要么不给键（不能显式 undefined）
            ...(effective === null ? {} : { effectiveDurationMs: effective }),
            ...(direction === null ? {} : { direction }),
            corrected:
              typeof response.body === 'object' &&
              response.body !== null &&
              (response.body as { corrected?: unknown }).corrected === true,
          },
        });
      })
      .catch((thrown: unknown) => {
        const reason = thrown instanceof Error ? thrown.message : '网络错误';
        emit({
          durationReport: {
            status: 'failed',
            measuredDurationMs: value,
            message: `上报失败：${reason}`,
          },
        });
      });
  };

  const tick = (): void => {
    if (disposed || inFlight) return;
    // 覆盖没推进就不发请求（避免空转刷接口）
    if (state.pendingCoveredMs <= state.reportedCoveredMs) return;
    inFlight = true;
    void report(state.pendingCoveredMs).finally(() => {
      inFlight = false;
    });
  };

  return {
    observe: (snapshot) => {
      if (disposed) return;
      const observed = Number.isFinite(snapshot.coveredMs) ? Math.max(0, snapshot.coveredMs) : 0;
      // 只增不减：本地观测到更小的值（重播/回退）时不回落
      emit({ pendingCoveredMs: Math.max(state.pendingCoveredMs, observed) });
      if (timer === null && periodMs > 0) {
        timer = setInterval(tick, periodMs);
      }
      // 实测时长走**独立端点、一次性**：与周期性覆盖上报互不遮蔽
      maybeReportMeasuredDuration(snapshot);
    },

    flush: async (): Promise<ReportOutcome> => {
      if (disposed) {
        return {
          ok: false,
          status: 0,
          coveredMs: state.reportedCoveredMs,
          ratio: state.serverRatio ?? 0,
          message: '上报器已释放。',
        };
      }
      return report(state.pendingCoveredMs);
    },

    castDislike: async (): Promise<VoteOutcome> => {
      // ① 先把最新覆盖报上去：服务端判定读的是库里的值，不 flush 就等于"拿旧值投票"
      await report(state.pendingCoveredMs);
      try {
        const response = await options.transport.castVote(options.segmentId, { value: 'DISLIKE' });
        if (response.status >= 200 && response.status < 300) {
          emit({ thresholdNotReached: false, lastError: null });
          return {
            ok: true,
            status: response.status,
            code: null,
            message: null,
            segmentCut:
              typeof response.body === 'object' &&
              response.body !== null &&
              (response.body as { segmentCut?: unknown }).segmentCut === true,
          };
        }
        const { code, message } = readError(response.body);
        const notReached = code !== null && code.includes('THRESHOLD');
        emit({ thresholdNotReached: notReached, lastError: message });
        return { ok: false, status: response.status, code, message, segmentCut: false };
      } catch (thrown) {
        const message =
          `点踩失败（网络错误）：${thrown instanceof Error ? thrown.message : ''}`.trim();
        emit({ lastError: message });
        return { ok: false, status: 0, code: null, message, segmentCut: false };
      }
    },

    localUnlocked: () =>
      state.serverDurationMs !== null &&
      state.reportedCoveredMs / state.serverDurationMs >= threshold,

    state: () => state,

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose: () => {
      disposed = true;
      if (timer !== null) clearInterval(timer);
      timer = null;
      listeners.clear();
    },
  };
}
