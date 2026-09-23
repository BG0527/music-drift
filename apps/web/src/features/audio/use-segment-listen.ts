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
 * 为什么要做成 hook 而不是让页面自己写 fetch：**周期上报 + 先 flush 再投票** 这两个顺序约束
 * 一旦写错（例如先投票后上报、或漏掉 flush），服务端就会按旧覆盖率判 422，
 * 而这种错在页面上表现为"点踩没反应"，很难查。集中在一处实现，页面只做转发。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createListenReporter,
  type ListenReporter,
  type ListenReporterState,
  type ListenReportTransport,
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
}

export interface UseSegmentListenResult {
  /** 直接接 `<SegmentPlayer onProgress={...}>`。 */
  observe: (snapshot: { coveredMs: number }) => void;
  /** 直接接 `<SegmentPlayer onCastDislike={...}>`：先 flush 最新覆盖，再投票。 */
  castDislike: () => void;
  flush: () => Promise<ReportOutcome>;
  state: ListenReporterState;
  /** 本地是否已达门槛（按钮即时反馈用；最终判定看服务端 422）。 */
  locallyUnlocked: boolean;
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
      return { status: response.status, body: (await response.json().catch(() => null)) as unknown };
    },
    castVote: async (segmentId, body) => {
      const response = await fetch(`/api/segments/${segmentId}/votes`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: (await response.json().catch(() => null)) as unknown };
    },
  };
}

export function useSegmentListen(options: UseSegmentListenOptions): UseSegmentListenResult {
  const { segmentId, periodMs } = options;
  const transportRef = useRef(options.transport);
  const onVoteOutcomeRef = useRef(options.onVoteOutcome);
  useEffect(() => {
    transportRef.current = options.transport;
  }, [options.transport]);
  useEffect(() => {
    onVoteOutcomeRef.current = options.onVoteOutcome;
  }, [options.onVoteOutcome]);

  const [reporter, setReporter] = useState<ListenReporter | null>(null);
  const [state, setState] = useState<ListenReporterState | null>(null);
  const fallbackTransport = useMemo(() => fetchListenTransport(), []);

  // 段切换 → 换一个上报器（旧的一律 dispose，避免旧段的定时器继续打接口）
  useEffect(() => {
    if (segmentId === null) {
      setReporter(null);
      setState(null);
      return;
    }
    const created = createListenReporter({
      segmentId,
      transport: transportRef.current ?? fallbackTransport,
      ...(periodMs === undefined ? {} : { periodMs }),
    });
    setReporter(created);
    const unsubscribe = created.subscribe(setState);
    return () => {
      unsubscribe();
      created.dispose();
      setReporter(null);
    };
  }, [fallbackTransport, periodMs, segmentId]);

  const observe = useCallback(
    (snapshot: { coveredMs: number }): void => {
      reporter?.observe(snapshot);
    },
    [reporter],
  );

  const castDislike = useCallback((): void => {
    if (reporter === null) return;
    void reporter.castDislike().then((outcome) => {
      onVoteOutcomeRef.current?.(outcome);
    });
  }, [reporter]);

  const flush = useCallback((): Promise<ReportOutcome> => {
    if (reporter === null) {
      return Promise.resolve({
        ok: false,
        status: 0,
        coveredMs: 0,
        ratio: 0,
        message: '当前没有可上报的段。',
      });
    }
    return reporter.flush();
  }, [reporter]);

  return {
    observe,
    castDislike,
    flush,
    state:
      state ??
      ({
        pendingCoveredMs: 0,
        reportedCoveredMs: 0,
        serverRatio: null,
        serverDurationMs: null,
        lastError: null,
        thresholdNotReached: false,
        reporting: false,
      } satisfies ListenReporterState),
    locallyUnlocked: reporter?.locallyUnlocked() ?? false,
  };
}
