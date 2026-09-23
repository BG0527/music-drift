/**
 * `useSegmentListen`：把收听覆盖率上报器接到 `SegmentPlayer` 上（**页面侧的唯一接线点**）。
 *
 * ```tsx
 * const listen = useSegmentListen({ segmentId: segment.id });
 * <SegmentPlayer
 *   onProgress={listen.observe}            // 播放中周期上报（真实覆盖，不是"投票前塞满"）
 *   onCastDislike={listen.castDislike}     // 先 flush 再投票，票体不含 listenedRatio
 * />
 * ```
 *
 * ## React 纪律（这里踩过一次，写下来免得再踩）
 *
 * 上报器是**外部系统**（有定时器、发请求），所以：
 * - 它在 **effect 里创建**、在 effect 的清理里 `dispose()`，实例放在 **ref** 里（不参与渲染）；
 * - 组件要显示的进度来自 **订阅回调里的 setState**（外部 → React，这是允许且推荐的方向）；
 * - **effect 体内不调用 setState**（`react-hooks/set-state-in-effect`）：那会造成级联渲染，
 *   而且在高频播放进度场景下正是掉帧来源。段切换时"归零"不是靠 setState，
 *   而是给快照打上**会话键**（segmentId + 阈值），键不匹配即在渲染期派生为"零进度"。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createListenReporter,
  type ListenReporter,
  type ListenReporterState,
  type ListenReportTransport,
  type MeasuredDurationSnapshot,
  type ReportOutcome,
  type VoteOutcome,
} from './listen-reporter';

export interface UseSegmentListenOptions {
  /** 当前段的 segment id；为 null 时不启用（例如段数据还没加载）。 */
  segmentId: string | null;
  /** 上报周期（ms），默认 1000。 */
  periodMs?: number;
  /** 覆盖传输层（测试用）；默认走 fetch。 */
  transport?: ListenReportTransport;
  /** 投票结果回调（页面据此播报"已记录"/"需要听满 80%"）。 */
  onVoteOutcome?: (outcome: VoteOutcome) => void;
  /** 本地门槛（仅用于按钮即时反馈；最终判定看服务端 422）。 */
  threshold?: number;
}

export interface UseSegmentListenResult {
  /** 直接接 `<SegmentPlayer onProgress={...}>`：把播放进度交给上报器（按周期上报 + 一次性上报实测时长）。 */
  observe: (snapshot: MeasuredDurationSnapshot) => void;
  /** 直接接 `<SegmentPlayer onCastDislike={...}>`：先 flush 最新覆盖，再投票。 */
  castDislike: () => void;
  /** 立刻上报一次（切换段、页面隐藏、或投票前手动调用）。 */
  flush: () => Promise<ReportOutcome>;
  state: ListenReporterState;
  /** 本地是否已达门槛（按钮即时反馈；最终判定看服务端 422）。 */
  locallyUnlocked: boolean;
}

const EMPTY_STATE: ListenReporterState = {
  pendingCoveredMs: 0,
  reportedCoveredMs: 0,
  serverRatio: null,
  serverDurationMs: null,
  lastError: null,
  thresholdNotReached: false,
  reporting: false,
  durationReport: null,
};

interface Session {
  key: string;
  reporter: ListenReporter;
}

/** 默认传输层：只发契约要求的字段（**不发 `listenedRatio`**，t20 起该字段被忽略）。 */
export function fetchListenTransport(): ListenReportTransport {
  return {
    reportListen: async (segmentId, coveredMs) => {
      const response = await fetch(`/api/segments/${segmentId}/listen`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ coveredMs }),
      });
      return {
        status: response.status,
        body: (await response.json().catch(() => null)) as unknown,
      };
    },
    /**
     * `POST /api/segments/:id/duration`（t28 / F2，**已与 architect 提案的形状**）：
     * body 只带客户端才知道的两件事 —— 实测时长、上报时的已覆盖量；
     * **声明时长由服务端自己从段行读**（不采信客户端转述）。
     */
    reportMeasuredDuration: async (segmentId, measuredDurationMs, context) => {
      const response = await fetch(`/api/segments/${segmentId}/duration`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          measuredDurationMs,
          coveredMsAtReportMs: context.coveredMsAtReportMs,
        }),
      });
      return {
        status: response.status,
        body: (await response.json().catch(() => null)) as unknown,
      };
    },
    castVote: async (segmentId, body) => {
      const response = await fetch(`/api/segments/${segmentId}/votes`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        body: (await response.json().catch(() => null)) as unknown,
      };
    },
  };
}

export function useSegmentListen(options: UseSegmentListenOptions): UseSegmentListenResult {
  const { segmentId, periodMs } = options;
  const threshold = options.threshold ?? 0.8;
  const transportRef = useRef(options.transport);
  const onVoteOutcomeRef = useRef(options.onVoteOutcome);
  useEffect(() => {
    transportRef.current = options.transport;
  }, [options.transport]);
  useEffect(() => {
    onVoteOutcomeRef.current = options.onVoteOutcome;
  }, [options.onVoteOutcome]);

  const fallbackTransport = useRef<ListenReportTransport | null>(null);
  if (fallbackTransport.current === null) fallbackTransport.current = fetchListenTransport();

  const sessionRef = useRef<Session | null>(null);
  const key = `${segmentId ?? ''}|${String(periodMs ?? 1000)}`;
  const [snapshot, setSnapshot] = useState<{ key: string; state: ListenReporterState }>({
    key,
    state: EMPTY_STATE,
  });

  // 段切换 → 换一个上报器（旧的一律 dispose，避免旧段的定时器继续打接口）。
  // 注意：effect 体内**不** setState；清空显示靠"会话键不匹配 → 派生零值"。
  useEffect(() => {
    if (segmentId === null) {
      sessionRef.current = null;
      return;
    }
    const reporter = createListenReporter({
      segmentId,
      transport: transportRef.current ?? (fallbackTransport.current as ListenReportTransport),
      ...(periodMs === undefined ? {} : { periodMs }),
    });
    sessionRef.current = { key, reporter };
    const unsubscribe = reporter.subscribe((next) => {
      setSnapshot({ key, state: next });
    });
    return () => {
      unsubscribe();
      reporter.dispose();
      if (sessionRef.current?.reporter === reporter) sessionRef.current = null;
    };
  }, [key, periodMs, segmentId]);

  const observe = useCallback((input: MeasuredDurationSnapshot): void => {
    sessionRef.current?.reporter.observe(input);
  }, []);

  const castDislike = useCallback((): void => {
    const session = sessionRef.current;
    if (session === null) return;
    void session.reporter.castDislike().then((outcome) => {
      onVoteOutcomeRef.current?.(outcome);
    });
  }, []);

  const flush = useCallback((): Promise<ReportOutcome> => {
    const session = sessionRef.current;
    if (session === null) {
      return Promise.resolve({
        ok: false,
        status: 0,
        coveredMs: 0,
        ratio: 0,
        message: '当前没有可上报的段。',
      });
    }
    return session.reporter.flush();
  }, []);

  // 会话键不匹配 ⇒ 这段的进度还没开始（段刚切过来），派生零值而不是 setState 归零
  const currentState = snapshot.key === key ? snapshot.state : EMPTY_STATE;

  return {
    observe,
    castDislike,
    flush,
    state: currentState,
    locallyUnlocked:
      currentState.serverDurationMs !== null &&
      currentState.serverDurationMs > 0 &&
      currentState.reportedCoveredMs / currentState.serverDurationMs >= threshold,
  };
}
