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
 * ## F2（客户端上报"实测时长"以校正门槛分母）已作废
 *
 * 用户第十一轮第 4 条裁决：**每段时长由曲库切分决定**（如 `Immersed` = 23870/20619/22501/23010ms），
 * 分母的权威来源只有一处 —— 曲库预设（服务端 `presetDurationMsFor`）。
 * 于是"客户端实测时长上报"整条链路（端点 / 一次性状态机 / fail-closed band / 方向枚举）
 * 全部失去消费者，按纪律**删除而不是留着**：留着就是第二套分母规则，迟早有人再去用。
 *
 * 顺带记录它当初要解决的问题（避免以后重新发明）：分母若采信上传者自报的时长，
 * 真实 2s 却声明 30s 的段会让诚实听众永远够不到 80% 门槛。
 * 那个问题现在由**服务端用曲库权威值做校验**解决（录制时长必须匹配预设 ± `SEGMENT_PRESET_TOLERANCE_MS`），
 * 客户端不参与任何时长判定。
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

/**
 * 覆盖率观测快照（接 `timeupdate` 的进度）。
 *
 * t30 起只剩 `coveredMs`：曾经的 `playedMs` / `measuredDurationMs` / `declaredDurationMs`
 * 都只服务于已作废的 F2 时长上报，一并删掉 —— 留着会让人以为"时长还能从这条路走"。
 */
export interface ListenProgressSnapshot {
  coveredMs: number;
}

export interface ListenReporter {
  /** 接 `SegmentPlayer.onProgress`（覆盖率）。 */
  observe: (snapshot: ListenProgressSnapshot) => void;
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
      /**
       * **必须取整**：`coveredMs` 来自 `currentTime * 1000`，是浮点；
       * 而契约 `SubmitListenProgressRequestSchema` 是 `z.number().int().nonnegative()`。
       * 真实浏览器跑通链路时发现：原样发浮点会被服务端判为非法请求，
       * `POST /api/segments/:id/listen` 一律 **400**（连 `violations` 都是空数组，光看响应体查不出原因），
       * 后果不是"少报一点"而是**覆盖率永远推不上去** ⟹ 点踩门槛（0.8）永远不满足。
       * 当时本地单测全绿：假传输层默默把小数抹平了，契约校验只发生在真服务端。
       *
       * 取整方向选**向下**（宁少报不多报）：覆盖率是"我听够了没有"的证据，不能靠四舍五入凑门槛。
       * 这是唯一的归一化点（下游 pending / `coveredMsAtReportMs` 都由它派生），所以只此一处。
       */
      const observed = Number.isFinite(snapshot.coveredMs)
        ? Math.max(0, Math.floor(snapshot.coveredMs))
        : 0;
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
