/**
 * `useSegmentListen` 单测（t21）：页面侧接线的**行为契约**。
 *
 * 这一层最容易出两种错，两种都会让"点踩没反应"：
 * 1. **先投票后上报** → 服务端读到的还是旧覆盖率 → 422；
 * 2. **段切换后旧上报器还在打接口** → 覆盖率记到错误的段上。
 * 因此这里既测"顺序"，也测"生命周期"。
 *
 * 另外直接用真 fetch mock 钉住**请求形状**：`/listen` 只带 `coveredMs`、
 * `/votes` 只带 `value` —— 这是"不再依赖 listenedRatio"的可执行证据（配合 grep 证据一起看）。
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSegmentListen } from './use-segment-listen';
import type { ListenReportTransport } from './listen-reporter';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function fakeTransport(overrides: Partial<ListenReportTransport> = {}): {
  transport: ListenReportTransport;
  calls: Array<{ kind: 'listen' | 'vote'; segmentId: string; coveredMs?: number; body?: unknown }>;
} {
  const calls: Array<{
    kind: 'listen' | 'vote';
    segmentId: string;
    coveredMs?: number;
    body?: unknown;
  }> = [];
  const transport: ListenReportTransport = {
    reportListen: async (segmentId, coveredMs) => {
      calls.push({ kind: 'listen', segmentId, coveredMs });
      return { status: 200, body: { coveredMs, durationMs: 20_000, ratio: coveredMs / 20_000 } };
    },
    castVote: async (segmentId, body) => {
      calls.push({ kind: 'vote', segmentId, body });
      return { status: 200, body: { segmentCut: false } };
    },
    ...overrides,
  };
  return { transport, calls };
}

describe('useSegmentListen：接线与顺序', () => {
  it('observe 直接转发给上报器（页面只做 `<SegmentPlayer onProgress={listen.observe}>`）', async () => {
    vi.useFakeTimers();
    const { transport, calls } = fakeTransport();
    const { result } = renderHook(() =>
      useSegmentListen({ segmentId: 'seg-1', periodMs: 1_000, transport }),
    );

    result.current.observe({ coveredMs: 1_500 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(calls.filter((call) => call.kind === 'listen').map((call) => call.coveredMs)).toEqual([
      1_500,
    ]);
  });

  it('castDislike：**先上报再投票**（顺序反了服务端会按旧覆盖率判 422）', async () => {
    vi.useFakeTimers();
    const { transport, calls } = fakeTransport();
    const { result } = renderHook(() =>
      useSegmentListen({ segmentId: 'seg-1', periodMs: 60_000, transport }),
    );

    result.current.observe({ coveredMs: 16_000 });
    await act(async () => {
      result.current.castDislike();
      await Promise.resolve();
    });

    expect(calls.map((call) => call.kind)).toEqual(['listen', 'vote']);
    expect(calls[0]?.coveredMs).toBe(16_000);
  });

  it('投票结果回调给页面（用于播报"已记录"/"需要听满 80%"）', async () => {
    const { transport } = fakeTransport({
      castVote: async () => ({
        status: 422,
        body: {
          error: {
            message: '需要听满 80% 才能点踩。',
            violations: [{ code: 'LISTEN_THRESHOLD_NOT_REACHED', message: '听满 80% 才能点踩。' }],
          },
        },
      }),
    });
    const onVoteOutcome = vi.fn();
    const { result } = renderHook(() =>
      useSegmentListen({ segmentId: 'seg-1', periodMs: 60_000, transport, onVoteOutcome }),
    );

    result.current.observe({ coveredMs: 1_000 });
    await act(async () => {
      result.current.castDislike();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onVoteOutcome).toHaveBeenCalledTimes(1);
    const outcome = onVoteOutcome.mock.calls[0]?.[0] as { ok: boolean; code: string | null };
    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe('LISTEN_THRESHOLD_NOT_REACHED');
  });

  it('段切换：旧上报器被释放，不再往旧段打接口', async () => {
    vi.useFakeTimers();
    const { transport, calls } = fakeTransport();
    const { result, rerender } = renderHook(
      ({ segmentId }: { segmentId: string }) =>
        useSegmentListen({ segmentId, periodMs: 1_000, transport }),
      { initialProps: { segmentId: 'seg-1' } },
    );

    result.current.observe({ coveredMs: 1_000 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    const beforeSwitch = calls.length;

    rerender({ segmentId: 'seg-2' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(calls.length).toBe(beforeSwitch);
    expect(calls.every((call) => call.segmentId === 'seg-1')).toBe(true);
  });

  it('卸载：不再打接口（卸载后还在上报会把覆盖率记到已离开的段上）', async () => {
    vi.useFakeTimers();
    const { transport, calls } = fakeTransport();
    const { result, unmount } = renderHook(() =>
      useSegmentListen({ segmentId: 'seg-1', periodMs: 1_000, transport }),
    );

    result.current.observe({ coveredMs: 900 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    const before = calls.length;

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(calls.length).toBe(before);
  });

  it('segmentId 为 null：不启用上报，observe/castDislike 都是安全空操作', async () => {
    const { transport, calls } = fakeTransport();
    const { result } = renderHook(() =>
      useSegmentListen({ segmentId: null, periodMs: 1_000, transport }),
    );

    result.current.observe({ coveredMs: 5_000 });
    result.current.castDislike();
    await act(async () => {
      await Promise.resolve();
    });

    expect(calls).toEqual([]);
    expect(result.current.state.reportedCoveredMs).toBe(0);
  });
});

describe('useSegmentListen：默认 fetch 传输层的请求形状（可执行证据）', () => {
  it('实测时长走**独立端点** `/duration`，body 只有实测值 + 上报时的覆盖量（t28 / F2）', async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init?.body ?? '{}')) as unknown });
        return new Response(
          JSON.stringify(
            url.includes('/duration')
              ? {
                  declaredDurationMs: 20_000,
                  measuredDurationMs: 2_000,
                  effectiveDurationMs: 2_000,
                  corrected: true,
                  sampleCount: 1,
                }
              : { coveredMs: 2_000, durationMs: 20_000, ratio: 0.1, threshold: 0.8 },
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const { result } = renderHook(() => useSegmentListen({ segmentId: 'seg-1', periodMs: 60_000 }));
    // 真实播放过（playedMs>0）+ 元素报出真实时长 2s
    result.current.observe({ coveredMs: 2_000, playedMs: 2_000, measuredDurationMs: 2_000 });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const durationCall = calls.find((call) => call.url.includes('/duration'));
    expect(durationCall?.url).toBe('/api/segments/seg-1/duration');
    expect(durationCall?.body).toEqual({ measuredDurationMs: 2_000, coveredMsAtReportMs: 2_000 });
    // 声明时长不由客户端转述（服务端自己读段行）
    expect(JSON.stringify(durationCall?.body)).not.toContain('declaredDurationMs');
    expect(JSON.stringify(durationCall?.body)).not.toContain('listenedRatio');
    expect(result.current.state.durationReport?.status).toBe('reported');
    expect(result.current.state.durationReport?.corrected).toBe(true);
  });

  it('/listen 只带 coveredMs；/votes 只带 value（**绝不出现 listenedRatio**）', async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body ?? '{}')) as unknown });
      return new Response(
        JSON.stringify(
          url.includes('/listen')
            ? { coveredMs: 16_000, durationMs: 20_000, ratio: 0.8, threshold: 0.8 }
            : { segmentId: 'seg-1', value: 'DISLIKE', segmentCut: false },
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSegmentListen({ segmentId: 'seg-1', periodMs: 60_000 }));
    result.current.observe({ coveredMs: 16_000 });
    await act(async () => {
      result.current.castDislike();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(calls.map((call) => call.url)).toEqual([
      '/api/segments/seg-1/listen',
      '/api/segments/seg-1/votes',
    ]);
    expect(calls[0]?.body).toEqual({ coveredMs: 16_000 });
    expect(calls[1]?.body).toEqual({ value: 'DISLIKE' });
    for (const call of calls) {
      expect(JSON.stringify(call.body)).not.toContain('listenedRatio');
    }
  });
});
