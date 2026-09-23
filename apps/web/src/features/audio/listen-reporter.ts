/**
 * 收听覆盖率上报器（t21）：**边播边报**，让服务端持久化的覆盖率长到点踩门槛。
 *
 * ## 为什么必须周期性上报（而不是投票前塞一个数）
 *
 * t20 之后服务端的增长规则是：
 *
 * ```text
 * 首次上报：最多给 段长 × 0.5                      （单次伪造必然 < 门槛）
 * 之后每次：最多增长 距上次上报的墙上时间 × 1.25 + 3s （想跳到门槛必须真的等够时间）
 * ```
 *
 * 所以客户端**唯一诚实且可行的路径**就是：播放过程中按真实覆盖周期性上报 —— 覆盖率随播放推进，
 * 自然满足限速（1× 实时速率远低于 ×1.25 的夹子）。本模块就是这条路径的唯一实现，
 * 前端组件（`SegmentPlayer.onProgress` / 点踩按钮）都走它。
 *
 * ## 与 `ListenTracker` 的分工
 *
 * 覆盖率由内核 `ListenTracker` 算（听过区间并集、拖动不计、循环不叠加）；
 * 本模块**不重算**覆盖率，只负责"把最新的 `coveredMs` 按周期送到服务端，并在投票前先 flush"。
 * 判定以**服务端返回值**为准（`serverRatio`），本地 `dislikeUnlocked` 只用于按钮态的即时反馈。
 *
 * ## 纪律
 *
 * - **票体只有 `value`**：t20 起 `listenedRatio` 被忽略，带上它等于自欺（有测试钉住）；
 * - **不自动重试**：网络失败 / 422 都如实暴露给调用方；周期上报的下一次 tick 自然重报（那正是"周期上报"本身），
 *   但**投票**这条路径绝不重试（用户再点一次才算重试）。
 */
import { DEFAULT_POLICY } from '@music-drift/shared/domain';

export interface ListenReportTransport {
  /** `POST /api/segments/:id/listen`，body 只有 `coveredMs`（时长以服务端段行为准）。 */
  reportListen: (
    segmentId: string,
    coveredMs: number,
  ) => Promise<{ status: number; body: unknown }>;
  /** `POST /api/segments/:id/votes`，**body 只有 value**。 */
  castVote: (
    segmentId: string,
    body: { value: 'DISLIKE' | 'LIKE' },
  ) => Promise<{ status: number; body: unknown }>;
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
}

export interface ListenReporterOptions {
  segmentId: string;
  transport: ListenReportTransport;
  /** 上报周期（ms）：默认 1000；播放中每周期最多发一次请求。 */
  periodMs?: number;
  /** 本地门槛（仅用于按钮即时反馈；判定仍以服务端为准）。 */
  threshold?: number;
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

export interface ListenReporter {
  /** 接 `SegmentPlayer.onProgress`（只需要 `coveredMs`）。 */
  observe: (snapshot: { coveredMs: number }) => void;
  /** 立刻把最新覆盖报上去（切换段、页面隐藏、投票前用）。 */
  flush: () => Promise<ReportOutcome>;
  /** 先 flush，再投点踩票（**票体不含 `listenedRatio`**）。 */
  castDislike: () => Promise<VoteOutcome>;
  /** 本地是否已达门槛（即时反馈用；真正的判定看服务端 422）。 */
  locallyUnlocked: () => boolean;
  state: () => ListenReporterState;
  subscribe: (listener: (state: ListenReporterState) => void) => () => void;
  dispose: () => void;
}

const DEFAULT_PERIOD_MS = 1_000;

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
  };

  const listeners = new Set<(next: ListenReporterState) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;
  let inFlight = false;

  const emit = (patch: Partial<ListenReporterState>): void => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };

  /** 上报一次（内部用：不允许并发在同一时刻重复打接口）。 */
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

    locallyUnlocked: () =>
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
