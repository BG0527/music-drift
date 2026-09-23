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

/**
 * 测试用的"本段固定时长"。
 *
 * t30 起**没有本段时长就不允许录制**（fail-closed，与 t31 服务端一致），
 * 所以每个"要真的录一段"的用例都必须显式给出本段时长 —— 这正是设计意图：
 * 让"我到底录多长"这件事在每个调用点都可见，而不是悄悄回退到一个默认值。
 */
const ANY_PRESET_MS = 20_619;

describe('useRecorder：环境与权限', () => {
  it('http 下的局域网地址：直接给出"改用 https 或 localhost"的引导，且 start 不生效', async () => {
    const { environment } = makeRecorderEnvironment({
      isSecureContext: false,
      hostname: '192.168.1.9',
    });
    const { result } = renderHook(() =>
      useRecorder({ environment, presetDurationMs: ANY_PRESET_MS }),
    );

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
    const { result } = renderHook(() =>
      useRecorder({ environment, presetDurationMs: ANY_PRESET_MS }),
    );

    expect(result.current.status).toBe('unsupported');
    expect(result.current.support.guidance).toContain('MediaRecorder');
  });

  it('支持任何容器都不行 → unsupported（不能静默失败）', async () => {
    const { environment } = makeRecorderEnvironment({ isTypeSupported: () => false });
    const { result } = renderHook(() =>
      useRecorder({ environment, presetDurationMs: ANY_PRESET_MS }),
    );

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
    const { result } = renderHook(() =>
      useRecorder({ environment, presetDurationMs: ANY_PRESET_MS }),
    );

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
    const { result } = renderHook(() =>
      useRecorder({ environment, presetDurationMs: ANY_PRESET_MS }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.error?.kind).toBe('NO_DEVICE');
  });
});

describe('useRecorder：录完可以试听自己那一段（用户实测需求 ③）', () => {
  /*
   * 用户原话级需求："录制接唱完成之后，我希望有一个试听按钮，让用户可以听到自己现在录下的声音。"
   * 所以录完必须能**就地回放刚录的 Blob**（不依赖上传、不依赖服务端），并有可见状态。
   */
  function envWithPreview() {
    const played: string[] = [];
    const revoked: string[] = [];
    const element = {
      src: '',
      currentTime: 0,
      duration: 19.4,
      paused: true,
      listeners: new Map<string, Set<() => void>>(),
      play: vi.fn(async function (this: { paused: boolean; emit: (t: string) => void }) {
        this.paused = false;
        this.emit('play');
      }),
      pause: vi.fn(function (this: { paused: boolean; emit: (t: string) => void }) {
        this.paused = true;
        this.emit('pause');
      }),
      addEventListener(type: string, handler: () => void) {
        const set = this.listeners.get(type) ?? new Set<() => void>();
        set.add(handler);
        this.listeners.set(type, set);
      },
      removeEventListener(type: string, handler: () => void) {
        this.listeners.get(type)?.delete(handler);
      },
      emit(type: string) {
        this.listeners.get(type)?.forEach((handler) => handler());
      },
    };
    Object.defineProperty(element, 'paused', { writable: true, value: true });
    const harness = makeRecorderEnvironment({
      createPreviewElement: () => {
        played.push('element');
        return element as never;
      },
      createObjectURL: (blob: Blob) => {
        played.push(`url:${String(blob.size)}`);
        return 'blob:preview-1';
      },
      revokeObjectURL: (url: string) => {
        revoked.push(url);
      },
    });
    return { ...harness, element, revoked, played };
  }

  it('录完自动准备试听：拿到 objectURL，且元素 src 指向它', async () => {
    vi.useFakeTimers();
    const harness = envWithPreview();
    const { result } = renderHook(() =>
      useRecorder({ environment: harness.environment, presetDurationMs: ANY_PRESET_MS }),
    );

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime(19_400);
    });
    act(() => {
      result.current.stop();
    });

    expect(result.current.previewUrl).toBe('blob:preview-1');
    expect(result.current.previewState).toBe('idle');
    vi.useRealTimers();
  });

  it('togglePreview：播放 → 暂停 → 继续；状态文字可读（不是静默）', async () => {
    vi.useFakeTimers();
    const harness = envWithPreview();
    const { result } = renderHook(() =>
      useRecorder({ environment: harness.environment, presetDurationMs: ANY_PRESET_MS }),
    );
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime(19_400);
    });
    act(() => {
      result.current.stop();
    });

    await act(async () => {
      result.current.togglePreview();
      await Promise.resolve();
    });
    expect(harness.element.play).toHaveBeenCalledTimes(1);
    expect(result.current.previewState).toBe('playing');

    act(() => {
      result.current.togglePreview();
    });
    expect(harness.element.pause).toHaveBeenCalled();
    expect(result.current.previewState).toBe('paused');
    vi.useRealTimers();
  });

  it('试听到结尾：状态变 ended，再点从头重听（与播放器同一条语义）', async () => {
    vi.useFakeTimers();
    const harness = envWithPreview();
    const { result } = renderHook(() =>
      useRecorder({ environment: harness.environment, presetDurationMs: ANY_PRESET_MS }),
    );
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime(19_400);
    });
    act(() => {
      result.current.stop();
    });
    await act(async () => {
      result.current.togglePreview();
      await Promise.resolve();
    });

    act(() => {
      harness.element.currentTime = 19.4;
      harness.element.emit('ended');
    });
    expect(result.current.previewState).toBe('ended');

    await act(async () => {
      result.current.togglePreview();
      await Promise.resolve();
    });
    expect(harness.element.currentTime).toBe(0);
    vi.useRealTimers();
  });

  it('重录（reset）会释放 objectURL：不留 blob 泄漏', async () => {
    vi.useFakeTimers();
    const harness = envWithPreview();
    const { result } = renderHook(() =>
      useRecorder({ environment: harness.environment, presetDurationMs: ANY_PRESET_MS }),
    );
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime(19_400);
    });
    act(() => {
      result.current.stop();
    });

    act(() => {
      result.current.reset();
    });

    expect(harness.revoked).toEqual(['blob:preview-1']);
    expect(result.current.previewUrl).toBeNull();
    expect(result.current.previewState).toBe('idle');
    vi.useRealTimers();
  });

  it('卸载也会释放 objectURL（离开录音页不留泄漏）', async () => {
    vi.useFakeTimers();
    const harness = envWithPreview();
    const { result, unmount } = renderHook(() =>
      useRecorder({ environment: harness.environment, presetDurationMs: ANY_PRESET_MS }),
    );
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime(19_400);
    });
    act(() => {
      result.current.stop();
    });

    unmount();

    expect(harness.revoked).toEqual(['blob:preview-1']);
    vi.useRealTimers();
  });
});

describe('useRecorder：录制与停止', () => {
  it('录制中：状态 recording、计时按秒推进、电平每帧刷新', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    const { result } = renderHook(() =>
      useRecorder({ environment, bars: 12, presetDurationMs: ANY_PRESET_MS }),
    );

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

  it('接近上限给 nearLimit 警告，到本段时长自动停（不让用户录出会被拒的音频）', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    // 本段 30 秒（曲库里的长段）：验证"临近上限提示 + 到点自动停"这套机制本身
    const { result } = renderHook(() => useRecorder({ environment, presetDurationMs: 30_000 }));

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
    const { result } = renderHook(() =>
      useRecorder({ environment, presetDurationMs: ANY_PRESET_MS }),
    );

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

  it('判定以**曲库预设**为分母：录满无违规，差太多则给出可读文案（不再是 15–30 区间）', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    const { result } = renderHook(() =>
      useRecorder({ environment, presetDurationMs: ANY_PRESET_MS }),
    );

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
    expect(result.current.durationViolations[0]?.message).toContain('20.6 秒'); // 本段固定时长
    expect(result.current.durationViolations[0]?.message).toContain('9.0 秒'); // 实际录到
  });

  it('reset：回到 idle 并清空录音与错误（重录用它）', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    const { result } = renderHook(() =>
      useRecorder({ environment, presetDurationMs: ANY_PRESET_MS }),
    );

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
    const { result } = renderHook(() =>
      useRecorder({ environment, presetDurationMs: ANY_PRESET_MS }),
    );

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

describe('useRecorder：本段固定时长（用户第 4 条裁决 · t29 的曲库权威时长）', () => {
  /*
   * 用户原话："一首歌被切割成四段，它的时长应该是固定的，而用户需要接的就是这段时长。"
   * 于是录制端的口径从"15–30 秒动态区间"变成"曲库该段时长 ± 容差"：
   * - **录满自动停**：到本段时长就收尾（不再让人录到 30 秒然后被服务端拒）；
   * - **判定读曲库值**：与上传/服务端校验共用 `checkRecordingDurationAgainstPreset` 与同一容差。
   */

  it('给了本段时长 → 到点自动停（不再跑到 30 秒上限）', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    const { result } = renderHook(() =>
      useRecorder({ environment, presetDurationMs: ANY_PRESET_MS }),
    );

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime(ANY_PRESET_MS + 5_000);
    });

    expect(result.current.status).toBe('recorded');
    expect(result.current.recording?.durationMs).toBe(ANY_PRESET_MS);
    // 录满：与曲库值一致 ⇒ 没有违规
    expect(result.current.durationViolations).toEqual([]);
  });

  it('提前停止 → 违规文案说明本段固定时长与相差多少（用户能知道还差多久）', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    const { result } = renderHook(() =>
      useRecorder({ environment, presetDurationMs: ANY_PRESET_MS }),
    );

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime(16_000);
    });
    act(() => {
      result.current.stop();
    });

    expect(result.current.durationViolations).toHaveLength(1);
    const message = result.current.durationViolations[0]?.message ?? '';
    expect(message).toContain('20.6 秒'); // 本段固定时长
    expect(message).toContain('相差 4.6 秒'); // 还差多少
    expect(message).toContain('±2.0 秒'); // 允许的容差
  });

  it('±2.0 秒以内算合格（与服务端用同一容差，不出现"前端说行、后端说不行"）', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    const { result } = renderHook(() =>
      useRecorder({ environment, presetDurationMs: ANY_PRESET_MS }),
    );

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime(ANY_PRESET_MS - 1_500); // 差 1.5 秒，落在容差内
    });
    act(() => {
      result.current.stop();
    });

    expect(result.current.durationViolations).toEqual([]);
  });
});

describe('useRecorder：没有本段固定时长 = 不允许录制（fail-closed，与 t31 的服务端口径一致）', () => {
  /*
   * t31 起服务端对"没有预设时长"是 **fail-closed 直接拒绝上传**（`AUDIO_SEGMENT_PRESET_MISSING`）。
   * 前端若还留一条"回退 30 秒也能录"的路，唯一效果就是：**用户白录一整段，提交时吃 422**。
   * 所以录制前就拦住 —— 而且**连麦克风都不去要**（不能让用户看到"正在录音"却注定失败）。
   */
  it('没有 presetDurationMs：start() 直接拒绝，且完全不占用麦克风', async () => {
    const { environment, getUserMedia } = makeRecorderEnvironment();
    const { result } = renderHook(() => useRecorder({ environment }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.presetMissing).toBe(true);
    expect(result.current.blockedReason).toMatch(/固定时长/);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('显式传 null 与"没传"同义（页面拿不到曲库值时就是这么传的）', async () => {
    const { environment, getUserMedia } = makeRecorderEnvironment();
    const { result } = renderHook(() => useRecorder({ environment, presetDurationMs: null }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.presetMissing).toBe(true);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('给了 presetDurationMs：presetMissing=false、blockedReason=null，可以正常开录', async () => {
    const { environment } = makeRecorderEnvironment();
    const { result } = renderHook(() => useRecorder({ environment, presetDurationMs: 20_619 }));

    expect(result.current.presetMissing).toBe(false);
    expect(result.current.blockedReason).toBeNull();

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe('recording');
  });
});

describe('useRecorder：录完当场量"有没有录到声音"（t40 真实麦克风盲区）', () => {
  /*
   * 用户实测"录完点试听没有声音"。可控复现（真 Chromium + 受控输入，见 docs/audio.md §11）：
   * 数字静音 → 解码峰值 -673.8 dBFS，而应用当时**什么都不说**，用户只能自己怀疑"功能没做"。
   * 所以录完必须**当场量一次**并把结论交给 UI：ok / silent / unavailable（量不了就老实说量不了）。
   */
  const SILENT = { peakDbfs: -673.8, rmsDbfs: -673.8, durationSeconds: 3.2 };
  const LOUD = { peakDbfs: -4.8, rmsDbfs: -21.9, durationSeconds: 3.2 };

  async function recordOnce(result: { current: { start: () => Promise<void> } }, ms = 3_000) {
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
    act(() => {
      (result.current as unknown as { stop: () => void }).stop();
    });
  }

  it('录到了声音（-4.8 dBFS）→ status=ok，并给出实测峰值', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment({ measureClip: async () => LOUD });
    const { result } = renderHook(() =>
      useRecorder({ environment, presetDurationMs: ANY_PRESET_MS }),
    );

    await recordOnce(result);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.clipLevel?.status).toBe('ok');
    expect(result.current.clipLevel?.peakDbfs).toBeCloseTo(-4.8, 1);
    expect(result.current.clipLevel?.message).toContain('-4.8 dBFS');
    vi.useRealTimers();
  });

  it('录到的是静音（-673.8 dBFS）→ status=silent + 可执行指引', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment({ measureClip: async () => SILENT });
    const { result } = renderHook(() =>
      useRecorder({ environment, presetDurationMs: ANY_PRESET_MS }),
    );

    await recordOnce(result);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.clipLevel?.status).toBe('silent');
    expect(result.current.clipLevel?.guidance).toMatch(/输入设备|静音/);
    vi.useRealTimers();
  });

  it('量不了（宿主不支持/解码失败）→ unavailable，**不误判成静音**、不影响录制产物', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment({
      measureClip: async () => {
        throw new Error('decodeAudioData 不支持这个容器');
      },
    });
    const { result } = renderHook(() =>
      useRecorder({ environment, presetDurationMs: ANY_PRESET_MS }),
    );

    await recordOnce(result);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.clipLevel?.status).toBe('unavailable');
    expect(result.current.recording).not.toBeNull(); // 产物照常交付
    vi.useRealTimers();
  });

  it('没提供 measureClip 端口（老宿主）→ unavailable，不是 silent', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    const { result } = renderHook(() =>
      useRecorder({ environment, presetDurationMs: ANY_PRESET_MS }),
    );

    await recordOnce(result);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.clipLevel?.status).toBe('unavailable');
    vi.useRealTimers();
  });

  it('解码结果**晚到**且用户已重录 → 不污染新一轮（竞态）', async () => {
    vi.useFakeTimers();
    let resolveMeasure: ((value: typeof SILENT) => void) | null = null;
    const { environment } = makeRecorderEnvironment({
      measureClip: () =>
        new Promise((resolve) => {
          resolveMeasure = resolve;
        }),
    });
    const { result } = renderHook(() =>
      useRecorder({ environment, presetDurationMs: ANY_PRESET_MS }),
    );

    await recordOnce(result);
    act(() => {
      result.current.reset(); // 用户点了重录
    });
    await act(async () => {
      resolveMeasure?.(SILENT);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.clipLevel).toBeNull();
    vi.useRealTimers();
  });
});
