/**
 * `RecorderPanel` 单测：录音页的**全部状态**（DESIGN.md 要求"Figma 没有状态帧也要自建状态"）。
 *
 * 覆盖：
 * - 环境不满足（http 局域网 / 缺接口）→ 可照做的引导，且开始按钮不可用；
 * - 麦克风权限被拒 → 分平台修复指引（danger 态，不是 alert）；
 * - 录制中 → 计时文字 + 波形柱子 + 接近上限警告 + 到点自动停；
 * - 录完 → 时长不足 15 秒给 warning 文案，合格则给"用这一段 / 重录"；
 * - 上传 → 进度百分比 / 失败文案 + 重试上传（网络失败用 warning，因为数据没丢）。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecorderPanel } from './recorder-panel';
import { makeRecorderEnvironment } from './__tests__/recorder-doubles';

afterEach(() => {
  vi.useRealTimers();
});

/**
 * 测试用的"本段固定时长"（`Immersed` 第 2 段的曲库真实值）。
 *
 * t30 起**没有本段时长就不允许录制**（fail-closed，与 t31 服务端一致），
 * 所以"要真的录一段"的用例都必须显式给出本段时长 —— 这是设计意图，不是噪音。
 */
const ANY_PRESET_MS = 20_619;

describe('RecorderPanel：段号来自服务端', () => {
  it('显示"第 N 段 · 共 M 段"，不自行推算段号', () => {
    const { environment } = makeRecorderEnvironment();
    render(
      <RecorderPanel
        segmentIndex={2}
        totalSegments={4}
        environment={environment}
        presetDurationMs={ANY_PRESET_MS}
      />,
    );

    expect(screen.getByText(/第 2 段/)).toBeInTheDocument();
    expect(screen.getByText(/共 4 段/)).toBeInTheDocument();
  });

  it('提示是结构性的（本段固定时长 / 第几段），不放歌词', () => {
    const { environment } = makeRecorderEnvironment();
    render(
      <RecorderPanel
        segmentIndex={1}
        totalSegments={4}
        environment={environment}
        presetDurationMs={ANY_PRESET_MS}
      />,
    );

    expect(screen.getByTestId('preset-duration').textContent).toContain('本段 20.6 秒');
    expect(document.body.textContent).not.toMatch(/歌词/);
    // 用户第 4 条：动态区间口径已被本段固定时长取代
    expect(document.body.textContent).not.toMatch(/15–30 秒/);
  });
});

describe('RecorderPanel：环境与权限的降级引导', () => {
  it('http 局域网：给"改用 https 或 localhost"的引导，并禁用开始按钮', () => {
    const { environment } = makeRecorderEnvironment({
      isSecureContext: false,
      hostname: '10.0.0.7',
    });
    render(
      <RecorderPanel
        segmentIndex={1}
        totalSegments={4}
        environment={environment}
        presetDurationMs={ANY_PRESET_MS}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('localhost');
    expect(screen.getByRole('button', { name: /开始录制/ })).toBeDisabled();
  });

  it('权限被拒：danger 态 + Chrome/Safari 分平台指引，且按钮可再次尝试', async () => {
    const { environment } = makeRecorderEnvironment({
      getUserMedia: async () => {
        throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
      },
    });
    render(
      <RecorderPanel
        segmentIndex={1}
        totalSegments={4}
        environment={environment}
        presetDurationMs={ANY_PRESET_MS}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始录制/ }));
    });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('麦克风');
    expect(alert.textContent).toContain('Chrome');
    expect(alert.textContent).toContain('Safari');
    expect(alert.className).toMatch(/danger-tint/);
    expect(screen.getByRole('button', { name: /开始录制/ })).toBeEnabled();
  });
});

describe('RecorderPanel：录制中', () => {
  it('计时文案可读出"录制中 00:12 / 20.6"（分母是本段固定时长），波形柱子数可配置', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    render(
      <RecorderPanel
        segmentIndex={1}
        totalSegments={4}
        environment={environment}
        presetDurationMs={ANY_PRESET_MS}
        bars={24}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始录制/ }));
    });
    await act(async () => {
      vi.advanceTimersByTime(12_400);
    });

    expect(screen.getByText(/录制中 00:12 \/ 20\.6/)).toBeInTheDocument();
    expect(screen.getByTestId('waveform').children).toHaveLength(24);
    expect(screen.getByRole('button', { name: /停止录制/ })).toBeInTheDocument();
  });

  it('临近本段时长（差 2 秒内）给"快到本段时长"警告；录满自动停并回到可上传状态', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    render(
      <RecorderPanel
        segmentIndex={1}
        totalSegments={4}
        environment={environment}
        presetDurationMs={ANY_PRESET_MS}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始录制/ }));
    });
    await act(async () => {
      vi.advanceTimersByTime(18_800);
    });
    expect(screen.getByText(/快到本段时长了/)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByText(/已录 00:20 \/ 20\.6/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /用这一段/ })).toBeEnabled();
  });

  it('波形是装饰性的（aria-hidden），进度不依赖颜色表达', () => {
    const { environment } = makeRecorderEnvironment();
    render(
      <RecorderPanel
        segmentIndex={1}
        totalSegments={4}
        environment={environment}
        presetDurationMs={ANY_PRESET_MS}
      />,
    );

    expect(screen.getByTestId('waveform').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText(/尚未开始/)).toBeInTheDocument();
  });
});

describe('RecorderPanel：录完之后的校验与动作', () => {
  it('差太多（超出 ±2 秒）：warning 文案说明本段固定时长与相差多少，"用这一段"不可用', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    render(
      <RecorderPanel
        segmentIndex={1}
        totalSegments={4}
        environment={environment}
        presetDurationMs={ANY_PRESET_MS}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始录制/ }));
    });
    await act(async () => {
      vi.advanceTimersByTime(9_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /停止录制/ }));
    });

    const warning = screen.getByTestId('duration-violation');
    expect(warning.textContent).toContain('20.6 秒'); // 本段固定时长
    expect(warning.textContent).toContain('9.0 秒'); // 实际录到
    expect(warning.textContent).toContain('相差');
    expect(screen.getByRole('button', { name: /用这一段/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /重录/ })).toBeEnabled();
  });

  it('合格录音：点"用这一段"把 Blob 与时长交给上层', async () => {
    vi.useFakeTimers();
    const onRecorded = vi.fn();
    const { environment } = makeRecorderEnvironment();
    render(
      <RecorderPanel
        segmentIndex={1}
        totalSegments={4}
        environment={environment}
        presetDurationMs={ANY_PRESET_MS}
        onRecorded={onRecorded}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始录制/ }));
    });
    await act(async () => {
      vi.advanceTimersByTime(19_500); // 差 1.1 秒，落在本段 ±2 秒容差内
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /停止录制/ }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /用这一段/ }));
    });

    expect(onRecorded).toHaveBeenCalledTimes(1);
    const recording = onRecorded.mock.calls[0]?.[0] as { durationMs: number; mime: string };
    expect(recording.durationMs).toBe(19_500);
    expect(recording.mime).toBe('audio/webm');
  });

  it('点"重录"清空刚才那一段，回到未开始状态', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    render(
      <RecorderPanel
        segmentIndex={1}
        totalSegments={4}
        environment={environment}
        presetDurationMs={ANY_PRESET_MS}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始录制/ }));
    });
    await act(async () => {
      vi.advanceTimersByTime(17_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /停止录制/ }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /重录/ }));
    });

    expect(screen.getByText(/尚未开始/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /用这一段/ })).toBeNull();
  });
});

describe('RecorderPanel：上传进度与失败重试', () => {
  const base = { segmentIndex: 1, totalSegments: 4 };

  it('上传中：显示百分比与进度条，不显示重试', () => {
    const { environment } = makeRecorderEnvironment();
    render(
      <RecorderPanel
        {...base}
        environment={environment}
        presetDurationMs={ANY_PRESET_MS}
        upload={{ phase: 'uploading', ratio: 0.42, message: null, retryable: false }}
      />,
    );

    expect(screen.getByText(/上传中 42%/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /重试上传/ })).toBeNull();
  });

  it('上传失败：warning 语义（数据没丢）+ 重试按钮回调', () => {
    const onRetryUpload = vi.fn();
    const { environment } = makeRecorderEnvironment();
    render(
      <RecorderPanel
        {...base}
        environment={environment}
        presetDurationMs={ANY_PRESET_MS}
        upload={{
          phase: 'failed',
          ratio: null,
          message: '网络中断，录音已保留在本机，可以重试上传。',
          retryable: true,
          onRetry: onRetryUpload,
        }}
      />,
    );

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('已保留在本机');
    expect(status.className).toMatch(/warning-tint/);
    fireEvent.click(screen.getByRole('button', { name: /重试上传/ }));
    expect(onRetryUpload).toHaveBeenCalledTimes(1);
  });

  it('规则违反（不可重试）→ 不显示重试按钮，只给原因', () => {
    const { environment } = makeRecorderEnvironment();
    render(
      <RecorderPanel
        {...base}
        environment={environment}
        presetDurationMs={ANY_PRESET_MS}
        upload={{
          phase: 'failed',
          ratio: null,
          message: '每段录音需在 15–30 秒之间，请重新录制。',
          retryable: false,
        }}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain('15–30 秒');
    expect(screen.queryByRole('button', { name: /重试上传/ })).toBeNull();
  });

  it('上传成功：显示成功文案（success 语义）', () => {
    const { environment } = makeRecorderEnvironment();
    render(
      <RecorderPanel
        {...base}
        environment={environment}
        presetDurationMs={ANY_PRESET_MS}
        upload={{ phase: 'done', ratio: 1, message: '这一句已经接上了。', retryable: false }}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain('接上');
    expect(screen.getByRole('status').className).toMatch(/success-tint/);
  });
});

describe('RecorderPanel：录完要能试听自己那一段（用户实测需求 ③）', () => {
  /**
   * 试听元素替身：状态由 `play` / `pause` / `ended` 事件驱动（与 `use-recorder.test.ts` 同语义），
   * 从而能复现"播完再点"这条最容易做错的分支。
   */
  function makePreviewEnv() {
    const listeners = new Map<string, Set<() => void>>();
    const element = {
      src: '',
      currentTime: 0,
      duration: 18,
      paused: true,
      play: vi.fn(async () => {
        element.paused = false;
        emit('play');
      }),
      pause: vi.fn(() => {
        element.paused = true;
        emit('pause');
      }),
      addEventListener: (type: string, handler: () => void) => {
        const set = listeners.get(type) ?? new Set<() => void>();
        set.add(handler);
        listeners.set(type, set);
      },
      removeEventListener: (type: string, handler: () => void) => {
        listeners.get(type)?.delete(handler);
      },
    };
    function emit(type: string): void {
      listeners.get(type)?.forEach((handler) => handler());
    }
    const harness = makeRecorderEnvironment({
      createPreviewElement: () => element as never,
      createObjectURL: () => 'blob:preview-panel',
      revokeObjectURL: () => undefined,
    });
    return { ...harness, element, emit };
  }

  /** 录满 18 秒后停止（合格时长），返回试听替身。 */
  async function recordAndStop(harness: ReturnType<typeof makePreviewEnv>) {
    render(
      <RecorderPanel
        segmentIndex={1}
        totalSegments={4}
        environment={harness.environment}
        presetDurationMs={ANY_PRESET_MS}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始录制/ }));
    });
    await act(async () => {
      vi.advanceTimersByTime(19_500);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /停止录制/ }));
    });
  }

  it('录完立刻出现「试听本段」，并有可读的状态文字（不是只靠颜色/图标）', async () => {
    vi.useFakeTimers();
    const harness = makePreviewEnv();
    await recordAndStop(harness);

    expect(screen.getByRole('button', { name: /试听本段/ })).toBeEnabled();
    const state = screen.getByTestId('preview-state');
    expect(state.getAttribute('aria-live')).toBe('polite');
    expect(state.textContent).toMatch(/刚录/);
  });

  it('点「试听本段」→ 正在试听；再点 → 暂停并给出"继续试听"这条路', async () => {
    vi.useFakeTimers();
    const harness = makePreviewEnv();
    await recordAndStop(harness);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /试听本段/ }));
    });
    expect(harness.element.play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /暂停试听/ })).toBeInTheDocument();
    expect(screen.getByTestId('preview-state').textContent).toMatch(/正在试听/);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /暂停试听/ }));
    });
    expect(harness.element.pause).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /继续试听/ })).toBeInTheDocument();
    expect(screen.getByTestId('preview-state').textContent).toMatch(/暂停/);
  });

  it('听完之后再点：按钮变「重听本段」，且从头开始（currentTime 归零）', async () => {
    vi.useFakeTimers();
    const harness = makePreviewEnv();
    await recordAndStop(harness);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /试听本段/ }));
    });

    await act(async () => {
      harness.element.currentTime = 18;
      harness.emit('ended');
    });
    expect(screen.getByTestId('preview-state').textContent).toMatch(/听完/);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /重听本段/ }));
    });
    expect(harness.element.currentTime).toBe(0);
  });

  it('重录会停掉试听并收回按钮（不留下"上一段还在响"）', async () => {
    vi.useFakeTimers();
    const harness = makePreviewEnv();
    await recordAndStop(harness);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /试听本段/ }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /重录/ }));
    });

    expect(harness.element.pause).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /试听本段/ })).toBeNull();
    expect(screen.getByText(/尚未开始/)).toBeInTheDocument();
  });

  it('宿主没有试听元素时：同样不显示试听按钮（绝不给"点了没反应"的按钮）', async () => {
    vi.useFakeTimers();
    // 拿得到 objectURL，但拿不到可播放的元素 —— 例如页面只传了部分端口。
    // 这种情况下如果照常渲染按钮，用户点下去**什么都不会发生**（比没有按钮更糟）。
    const { environment } = makeRecorderEnvironment({
      createObjectURL: () => 'blob:preview-panel',
    });
    render(
      <RecorderPanel
        segmentIndex={1}
        totalSegments={4}
        environment={environment}
        presetDurationMs={ANY_PRESET_MS}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始录制/ }));
    });
    await act(async () => {
      vi.advanceTimersByTime(19_500);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /停止录制/ }));
    });

    expect(screen.queryByRole('button', { name: /试听本段/ })).toBeNull();
    expect(screen.queryByTestId('preview-state')).toBeNull();
    expect(screen.getByRole('button', { name: /用这一段/ })).toBeEnabled();
  });

  it('宿主不给 objectURL 时安静地不提供试听：主路径（用这一段 / 重录）照常可用', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment({
      createObjectURL: () => {
        throw new Error('blocked by policy');
      },
    });
    render(
      <RecorderPanel
        segmentIndex={1}
        totalSegments={4}
        environment={environment}
        presetDurationMs={ANY_PRESET_MS}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始录制/ }));
    });
    await act(async () => {
      vi.advanceTimersByTime(19_500);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /停止录制/ }));
    });

    expect(screen.queryByRole('button', { name: /试听本段/ })).toBeNull();
    expect(screen.getByRole('button', { name: /用这一段/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /重录/ })).toBeEnabled();
  });
});

describe('RecorderPanel：本段固定时长（用户第 4 条裁决 —— 取代"15–30 秒"）', () => {
  const PRESET = 20_619; // Immersed 第 2 段（曲库真实值）

  it('给了本段时长：显示"本段 20.6 秒 / ±2.0 秒"，不再出现动态区间', () => {
    const { environment } = makeRecorderEnvironment();
    render(
      <RecorderPanel
        segmentIndex={2}
        totalSegments={4}
        environment={environment}
        presetDurationMs={PRESET}
      />,
    );

    // 用 testid 精确定位那句说明（"尚未开始（本段 20.6 秒）"里也有同样的字样）
    const presetLine = screen.getByTestId('preset-duration');
    expect(presetLine.textContent).toContain('本段 20.6 秒');
    expect(presetLine.textContent).toContain('±2.0 秒');
    expect(document.body.textContent).not.toMatch(/15–30 秒/);
    expect(screen.getByText(/尚未开始（本段 20\.6 秒）/)).toBeInTheDocument();
  });

  it('录制中显示"还差多少"，而不是倒计时恐慌式提示', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    render(
      <RecorderPanel
        segmentIndex={2}
        totalSegments={4}
        environment={environment}
        presetDurationMs={PRESET}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始录制/ }));
    });
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(screen.getByText(/录制中 00:05 \/ 20\.6/)).toBeInTheDocument();
    expect(screen.getByText(/还差 15\.6 秒/)).toBeInTheDocument();
  });

  it('录满自动停：状态变"已录 20.6"，且可以"用这一段"（不需要用户掐秒）', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    render(
      <RecorderPanel
        segmentIndex={2}
        totalSegments={4}
        environment={environment}
        presetDurationMs={PRESET}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始录制/ }));
    });
    await act(async () => {
      vi.advanceTimersByTime(PRESET + 3_000);
    });

    expect(screen.getByText(/已录 00:20 \/ 20\.6/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /用这一段/ })).toBeEnabled();
    expect(screen.queryByText(/还差/)).toBeNull();
  });

  it('提前停：明确还差多少（含容差），并禁用"用这一段"', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    render(
      <RecorderPanel
        segmentIndex={2}
        totalSegments={4}
        environment={environment}
        presetDurationMs={PRESET}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始录制/ }));
    });
    await act(async () => {
      vi.advanceTimersByTime(16_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /停止录制/ }));
    });

    const warning = screen.getByTestId('duration-violation');
    expect(warning.textContent).toContain('20.6 秒');
    expect(warning.textContent).toContain('相差 4.6 秒');
    expect(screen.getByRole('button', { name: /用这一段/ })).toBeDisabled();
  });

  it('拿不到本段时长：**不允许录制**（fail-closed，与 t31 服务端一致），并说明原因', () => {
    const { environment } = makeRecorderEnvironment();
    render(<RecorderPanel segmentIndex={2} totalSegments={4} environment={environment} />);

    // 不是"退回 15–30 秒也能录"：服务端会直接拒收，所以前端连麦克风都不开
    const start = screen.getByRole('button', { name: /开始录制/ });
    expect(start).toBeDisabled();
    const notice = screen.getByTestId('preset-missing');
    expect(notice.textContent).toContain('固定时长');
    expect(notice.textContent).toContain('换一首歌');
    // 说明挂在按钮上（读屏用户能听到"为什么不能点"）
    expect(start.getAttribute('aria-describedby')).toBe(notice.getAttribute('id'));
    expect(document.body.textContent).not.toMatch(/15–30 秒/);
  });
});

describe('RecorderPanel：录到静音时必须明说（t40 用户实测「试听没有声音」）', () => {
  /*
   * 用户实测："录完之后点试听，也没有声音"。可控复现（真 Chromium + 受控输入，docs/audio.md §11）：
   * 数字静音 ⇒ 解码峰值 **-673.8 dBFS**、波形柱高 4%（= 面板最小柱高），而当时应用**一句话都没有**。
   * 于是用户只能怀疑"功能没做"。所以结论必须落在 UI 上：说清"没录到声音" + 去查什么 + 不许用这一段。
   */
  const SILENT = { peakDbfs: -673.8, rmsDbfs: -673.8, durationSeconds: 3.2 };
  const LOUD = { peakDbfs: -4.8, rmsDbfs: -21.9, durationSeconds: 3.2 };

  async function record(environment: ReturnType<typeof makeRecorderEnvironment>['environment']) {
    render(
      <RecorderPanel
        segmentIndex={1}
        totalSegments={4}
        environment={environment}
        presetDurationMs={ANY_PRESET_MS}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始录制/ }));
    });
    await act(async () => {
      vi.advanceTimersByTime(19_500);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /停止录制/ }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('静音：给出实测峰值 + 可执行指引，并禁用「用这一段」（只能重录）', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment({ measureClip: async () => SILENT });
    await record(environment);

    const warning = screen.getByTestId('clip-silent');
    expect(warning.textContent).toContain('-673.8 dBFS');
    expect(warning.textContent).toMatch(/输入设备|静音/);
    expect(warning.className).toMatch(/warning-tint/);

    const useThis = screen.getByRole('button', { name: /用这一段/ });
    expect(useThis).toBeDisabled();
    expect(useThis.getAttribute('aria-describedby')).toBe(warning.getAttribute('id'));
    expect(screen.getByRole('button', { name: /重录/ })).toBeEnabled();
    vi.useRealTimers();
  });

  it('正常音量：显示实测峰值（让用户看到"凭什么说正常"），不拦', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment({ measureClip: async () => LOUD });
    await record(environment);

    expect(screen.getByTestId('clip-ok').textContent).toContain('-4.8 dBFS');
    expect(screen.queryByTestId('clip-silent')).toBeNull();
    expect(screen.getByRole('button', { name: /用这一段/ })).toBeEnabled();
    vi.useRealTimers();
  });

  it('量不了（解码失败）：如实说"测不出"，既不吓人也不放行假绿', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment({
      measureClip: async () => {
        throw new Error('boom');
      },
    });
    await record(environment);

    const note = screen.getByTestId('clip-unavailable');
    expect(note.textContent).toMatch(/测不出/);
    expect(screen.queryByTestId('clip-silent')).toBeNull();
    // 量不了 ≠ 静音：不能因此拦住用户（用户自己点试听判断）
    expect(screen.getByRole('button', { name: /用这一段/ })).toBeEnabled();
    vi.useRealTimers();
  });
});
