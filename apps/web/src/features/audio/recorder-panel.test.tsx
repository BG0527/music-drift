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

describe('RecorderPanel：段号来自服务端', () => {
  it('显示"第 N 段 · 共 M 段"，不自行推算段号', () => {
    const { environment } = makeRecorderEnvironment();
    render(<RecorderPanel segmentIndex={2} totalSegments={4} environment={environment} />);

    expect(screen.getByText(/第 2 段/)).toBeInTheDocument();
    expect(screen.getByText(/共 4 段/)).toBeInTheDocument();
  });

  it('提示是结构性的（15–30 秒 / 第几段），不放歌词', () => {
    const { environment } = makeRecorderEnvironment();
    render(<RecorderPanel segmentIndex={1} totalSegments={4} environment={environment} />);

    expect(screen.getByText(/录一段 15–30 秒/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/歌词/);
  });
});

describe('RecorderPanel：环境与权限的降级引导', () => {
  it('http 局域网：给"改用 https 或 localhost"的引导，并禁用开始按钮', () => {
    const { environment } = makeRecorderEnvironment({
      isSecureContext: false,
      hostname: '10.0.0.7',
    });
    render(<RecorderPanel segmentIndex={1} totalSegments={4} environment={environment} />);

    expect(screen.getByRole('alert').textContent).toContain('localhost');
    expect(screen.getByRole('button', { name: /开始录制/ })).toBeDisabled();
  });

  it('权限被拒：danger 态 + Chrome/Safari 分平台指引，且按钮可再次尝试', async () => {
    const { environment } = makeRecorderEnvironment({
      getUserMedia: async () => {
        throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
      },
    });
    render(<RecorderPanel segmentIndex={1} totalSegments={4} environment={environment} />);

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
  it('计时文案可读出"录制中 00:12 / 30"，波形柱子数可配置', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    render(
      <RecorderPanel segmentIndex={1} totalSegments={4} environment={environment} bars={24} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始录制/ }));
    });
    await act(async () => {
      vi.advanceTimersByTime(12_400);
    });

    expect(screen.getByText(/录制中 00:12 \/ 30/)).toBeInTheDocument();
    expect(screen.getByTestId('waveform').children).toHaveLength(24);
    expect(screen.getByRole('button', { name: /停止录制/ })).toBeInTheDocument();
  });

  it('28 秒起给"接近上限"警告；30 秒自动停并回到可上传状态', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    render(<RecorderPanel segmentIndex={1} totalSegments={4} environment={environment} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始录制/ }));
    });
    await act(async () => {
      vi.advanceTimersByTime(28_500);
    });
    expect(screen.getByText(/接近 30 秒/)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByText(/已录 00:30/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /用这一段/ })).toBeEnabled();
  });

  it('波形是装饰性的（aria-hidden），进度不依赖颜色表达', () => {
    const { environment } = makeRecorderEnvironment();
    render(<RecorderPanel segmentIndex={1} totalSegments={4} environment={environment} />);

    expect(screen.getByTestId('waveform').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText(/尚未开始/)).toBeInTheDocument();
  });
});

describe('RecorderPanel：录完之后的校验与动作', () => {
  it('不足 15 秒：warning 文案说明区间，且"用这一段"不可用（只能重录）', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    render(<RecorderPanel segmentIndex={1} totalSegments={4} environment={environment} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始录制/ }));
    });
    await act(async () => {
      vi.advanceTimersByTime(9_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /停止录制/ }));
    });

    const warning = screen.getByRole('status');
    expect(warning.textContent).toContain('15');
    expect(warning.textContent).toContain('30');
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
        onRecorded={onRecorded}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始录制/ }));
    });
    await act(async () => {
      vi.advanceTimersByTime(18_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /停止录制/ }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /用这一段/ }));
    });

    expect(onRecorded).toHaveBeenCalledTimes(1);
    const recording = onRecorded.mock.calls[0]?.[0] as { durationMs: number; mime: string };
    expect(recording.durationMs).toBe(18_000);
    expect(recording.mime).toBe('audio/webm');
  });

  it('点"重录"清空刚才那一段，回到未开始状态', async () => {
    vi.useFakeTimers();
    const { environment } = makeRecorderEnvironment();
    render(<RecorderPanel segmentIndex={1} totalSegments={4} environment={environment} />);

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
        upload={{ phase: 'done', ratio: 1, message: '这一句已经接上了。', retryable: false }}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain('接上');
    expect(screen.getByRole('status').className).toMatch(/success-tint/);
  });
});
