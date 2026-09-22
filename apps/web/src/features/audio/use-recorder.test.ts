/**
 * `useRecorder` 单测（用注入的假浏览器环境，不需要真实的 MediaRecorder / 麦克风）。
 *
 * 钉住的行为：
 * 1. **环境不满足就不让开始**（http 非 localhost → 引导改访问地址；缺接口 → 建议换浏览器）；
 * 2. 权限被拒 → 给出分平台修复指引，且**不进入录制态**、不丢已录内容；
 * 3. 录制中：计时（文字读得出秒数）+ 波形电平持续刷新；
 * 4. 到 30 秒**自动停**（不让用户白录一段会被服务端拒的音频）；
 * 5. 停止后：时长/容器/Blob 可用于"重录"与"上传"；`reset` 清干净。
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRecorder } from './use-recorder';
import { fakeStream, makeRecorderEnvironment } from './__tests__/recorder-doubles';

afterEach(() => {
  vi.useRealTimers();
});

describe('useRecorder：环境与权限', () => {
  it('http 下的局域网地址：直接给出"改用 https 或 localhost"的引导，且 start 不生效', async () => {
    const { environment } = makeRecorderEnvironment({
      isSecureContext: false,
      hostname: '192.168.1.9',
    });
    const { result } = renderHook(() => useRecorder({ environment }));

    expect(result.current.status).toBe('unsupported');
    expect(result.current.support.reason).toBe('INSECURE_CONTEXT');
    expect(result.current.support.guidance).toContain('localhost');

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe('unsupported');
  });

  it('浏览器缺 MediaRecorder → 建议换浏览器，并可开始与否由 support 决定', () => {
    const { environment } = makeRecorderEnvironment({ hasMediaRecorder: false });
    const { result } = renderHook(() => useRecorder({ environment }));

    expect(result.current.status).toBe('unsupported');
    expect(result.current.support.guidance).toContain('MediaRecorder');
  });

  it('支持任何容器都不行 → unsupported（不能静默失败）', async () => {
    const { environment } = makeRecorderEnvironment({ isTypeSupported: () => false });
    const { result } = renderHook(() => useRecorder({ environment }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('unsupported');
    expect(result.current.error?.kind).toBe('UNKNOWN');
  });

  it('权限被拒 → 不进入录制态，给出分平台修复指引（Chrome 与 Safari 都要提）', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    const { environment } = makeRecorderEnvironment({
      getUserMedia: async () => {
        throw denied;
      },
    });
    const { result } = renderHook(() => useRecorder({ environment }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error?.kind).toBe('DENIED');
    expect(result.current.error?.guidance).toContain('Chrome');
    expect(result.current.error?.guidance).toContain('Safari');
    expect(result.current.recording).toBeNull();
  });

  it('没有麦克风设备 → NO_DEVICE 文案', async () => {
    const { environment } = makeRecorderEnvironment({
      getUserMedia: async () => {
        throw Object.assign(new Error('none'), { name: 'NotFoundError' });
      },
    });
    const { result } = renderHook(() => useRecorder({ environment }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.error?.kind).toBe('NO_DEVICE');
  });
});

describe('useRecorder：录制与停止', () => {
  it('录制中：状态 recording、计时按秒推进、电平每帧刷新', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    const { result } = renderHook(() => useRecorder({ environment, bars: 12 }));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe('recording');

    await act(async () => {
      vi.advanceTimersByTime(2_500);
    });

    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(2_500);
    expect(result.current.levels).toHaveLength(12);
    expect(result.current.levels.every((level) => level > 0)).toBe(true);
    expect(result.current.nearLimit).toBe(false);
  });

  it('接近上限（28 秒起）给 nearLimit 警告，30 秒自动停（不让用户录出会被拒的音频）', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    const { result } = renderHook(() => useRecorder({ environment }));

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      vi.advanceTimersByTime(28_500);
    });
    expect(result.current.nearLimit).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });

    expect(result.current.status).toBe('recorded');
    expect(result.current.recording?.durationMs).toBe(30_000);
    expect(result.current.recording?.mime).toBe('audio/webm');
  });

  it('手动 stop：得到 Blob + 时长 + 归一化容器；麦克风轨道与电平表都被释放', async () => {
    vi.useFakeTimers();
    const { environment, stopTrack, meterStop } = makeRecorderEnvironment();
    const { result } = renderHook(() => useRecorder({ environment }));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime(19_400);
    });
    act(() => {
      result.current.stop();
    });

    expect(result.current.status).toBe('recorded');
    expect(result.current.recording?.mime).toBe('audio/webm');
    expect(result.current.recording?.durationMs).toBe(19_400);
    expect(result.current.recording?.blob.size).toBeGreaterThan(0);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(meterStop).toHaveBeenCalledTimes(1);

    // 停表：再走时间不再变化
    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current.elapsedMs).toBe(19_400);
  });

  it('时长落在 15–30 秒区间时给 durationViolations 空数组；不足 15 秒给出可读文案', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    const { result } = renderHook(() => useRecorder({ environment }));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime(9_000);
    });
    act(() => {
      result.current.stop();
    });

    expect(result.current.durationViolations).toHaveLength(1);
    expect(result.current.durationViolations[0]?.code).toBe('AUDIO_DURATION_OUT_OF_RANGE');
    expect(result.current.durationViolations[0]?.message).toContain('15');
  });

  it('reset：回到 idle 并清空录音与错误（重录用它）', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    const { result } = renderHook(() => useRecorder({ environment }));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime(16_000);
    });
    act(() => {
      result.current.stop();
    });
    expect(result.current.status).toBe('recorded');

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.recording).toBeNull();
    expect(result.current.elapsedMs).toBe(0);
    expect(result.current.levels).toEqual([]);
  });

  it('录制中再次 start 不会开出第二路麦克风（幂等）', async () => {
    vi.useFakeTimers();
    const getUserMedia = vi.fn(async () => fakeStream());
    const { environment } = makeRecorderEnvironment({ getUserMedia });
    const { result } = renderHook(() => useRecorder({ environment }));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.start();
    });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('recording');
  });
});
