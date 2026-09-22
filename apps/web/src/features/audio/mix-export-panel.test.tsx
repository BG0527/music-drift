/**
 * `MixExportPanel` 单测：成品导出的**全部界面状态**（DESIGN.md：状态由我们自建，不因 Figma 缺帧而跳过）。
 *
 * 覆盖：完整 / 有缺口 / 一个有效段都没有 / 导出中 / 导出失败 / 导出成功（试听 + 下载 + 对齐报告）。
 * 硬性要求：
 * - 缺口必须以**文字**说明"这段时间是静音、不会被别人的段顶替"（不能只靠颜色或波形）；
 * - 对齐误差必须**显示实测数字**与阈值判定（"达标/未达标"），否则 t8 的验收报告没有界面依据；
 * - 成功后必须同时给出「试听」与「下载」，且下载文件名带缺口标注。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  planMonoSequentialMix,
  type MixPlan,
  type MixSourceSegment,
} from '@music-drift/shared/audio';
import { mixPcm } from './mix-render';
import { MixExportPanel } from './mix-export-panel';
import type { MixExportEnvironment, MixRenderResult } from './use-mix-export';

const SAMPLE_RATE = 8_000;

function plan(segments: MixSourceSegment[], totalSegments = 4): MixPlan {
  return planMonoSequentialMix({ segments, totalSegments, sampleRate: SAMPLE_RATE });
}

const ALL_FOUR: MixSourceSegment[] = [1, 2, 3, 4].map((index) => ({
  index,
  durationMs: 1_000,
  audioUrl: `/api/segments/${String(index)}/audio`,
}));

const MISSING_TWO: MixSourceSegment[] = [1, 3, 4].map((index) => ({
  index,
  durationMs: 1_000,
  audioUrl: `/api/segments/${String(index)}/audio`,
}));

function constantClip(index: number, frames: number) {
  return { index, channels: [Float32Array.from({ length: frames }, () => index / 10)] };
}

function renderWith(clips: readonly { index: number; channels: Float32Array[] }[]) {
  return async ({ plan: mixPlan }: { plan: MixPlan }): Promise<MixRenderResult> => {
    const mixed = mixPcm(mixPlan, clips);
    return {
      channels: mixed.channels,
      sampleRate: mixed.sampleRate,
      missingAudioIndexes: mixed.missingAudioIndexes,
    };
  };
}

function environment(overrides: Partial<MixExportEnvironment> = {}): Partial<MixExportEnvironment> {
  return {
    fetchBytes: async () => new ArrayBuffer(8),
    decode: async () => ({
      numberOfChannels: 1,
      length: 8_000,
      sampleRate: SAMPLE_RATE,
      duration: 1,
      getChannelData: () => Float32Array.from({ length: 8_000 }, () => 0.2),
    }),
    createObjectURL: () => 'blob:mock-1',
    revokeObjectURL: () => undefined,
    ...overrides,
  };
}

describe('MixExportPanel：摘要与缺口标注', () => {
  it('完整作品：显示"4 段完整（纯人声）"，并说明阶段一无伴奏', () => {
    render(
      <MixExportPanel
        plan={plan(ALL_FOUR)}
        environment={environment({
          render: renderWith([1, 2, 3, 4].map((i) => constantClip(i, 8_000))),
        })}
      />,
    );

    // 摘要只出现一次（在头部），且不会被当成"警告"塞进 warning 语义色的框里
    expect(screen.getAllByText(/4 段完整（纯人声）/)).toHaveLength(1);
    expect(screen.getByText(/阶段一只拼接人声、不加伴奏/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /导出成品/ })).toBeEnabled();
  });

  it('有缺口：明确写"缺第 2 段"+ 说明那段是静音、不会被别人的段顶替', () => {
    render(
      <MixExportPanel
        plan={plan(MISSING_TWO)}
        environment={environment({
          render: renderWith([
            constantClip(1, 8_000),
            constantClip(3, 8_000),
            constantClip(4, 8_000),
          ]),
        })}
      />,
    );

    const statuses = screen.getAllByRole('status').map((node) => node.textContent ?? '');
    expect(statuses.some((text) => text.includes('缺第 2 段'))).toBe(true);
    expect(statuses.some((text) => text.includes('静音'))).toBe(true);
    expect(statuses.some((text) => text.includes('不会被别人的段顶替'))).toBe(true);
  });

  it('一个有效段都没有：不允许导出，并给出可读的空态说明', () => {
    render(<MixExportPanel plan={plan([])} environment={environment()} />);

    expect(screen.getByRole('button', { name: /导出成品/ })).toBeDisabled();
    expect(screen.getByText(/还没有人接唱/)).toBeInTheDocument();
  });

  it('脏数据警告（重复段号等）会显示给用户，而不是悄悄处理', () => {
    const duplicated: MixSourceSegment[] = [
      { index: 1, durationMs: 1_000, audioUrl: '/a' },
      { index: 1, durationMs: 1_000, audioUrl: '/b' },
      { index: 2, durationMs: 1_000, audioUrl: '/c' },
      { index: 3, durationMs: 1_000, audioUrl: '/d' },
      { index: 4, durationMs: 1_000, audioUrl: '/e' },
    ];
    render(<MixExportPanel plan={plan(duplicated)} environment={environment()} />);

    expect(
      screen.getAllByRole('status').some((node) => (node.textContent ?? '').includes('段号')),
    ).toBe(true);
  });
});

describe('MixExportPanel：导出流程', () => {
  it('导出中：按钮变 loading 且不可重复点；完成后出现试听与下载', async () => {
    render(
      <MixExportPanel
        plan={plan(ALL_FOUR)}
        environment={environment({
          render: renderWith([1, 2, 3, 4].map((i) => constantClip(i, 8_000))),
        })}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /导出成品/ }));
    });

    const audio = await screen.findByLabelText('成品试听');
    expect(audio.tagName).toBe('AUDIO');
    expect(audio.getAttribute('src')).toBe('blob:mock-1');

    const download = screen.getByRole('link', { name: /下载成品/ });
    expect(download.getAttribute('download')).toBe('漂流瓶成品-4段-完整.wav');
    expect(download.getAttribute('href')).toBe('blob:mock-1');
  });

  it('有缺口时下载文件名带缺口标注（用户一眼知道成品不完整）', async () => {
    render(
      <MixExportPanel
        plan={plan(MISSING_TWO)}
        environment={environment({
          render: renderWith([
            constantClip(1, 8_000),
            constantClip(3, 8_000),
            constantClip(4, 8_000),
          ]),
        })}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /导出成品/ }));
    });

    expect(screen.getByRole('link', { name: /下载成品/ }).getAttribute('download')).toBe(
      '漂流瓶成品-4段-缺第2段.wav',
    );
  });

  it('显示对齐误差实测数字与判定（达标）', async () => {
    render(
      <MixExportPanel
        plan={plan(ALL_FOUR)}
        environment={environment({
          render: renderWith([1, 2, 3, 4].map((i) => constantClip(i, 8_000))),
        })}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /导出成品/ }));
    });

    const report = screen.getByTestId('alignment-report');
    expect(report.textContent).toContain('120');
    expect(report.textContent).toContain('达标');
  });

  it('对齐超阈值：显示"未达标"并列出违规段（供是否提案 ffmpeg 的判断）', async () => {
    // 每段音频晚 150ms 才出现（模拟解码器延迟超阈值）
    // 每段音频自身的前 150ms 是静音 → 渲染后起拍比计划晚 150ms（>120ms 阈值）
    const late = (index: number) => ({
      index,
      channels: [Float32Array.from({ length: 8_000 }, (_v, frame) => (frame >= 1_200 ? 0.5 : 0))],
    });
    render(
      <MixExportPanel
        plan={plan(ALL_FOUR)}
        environment={environment({ render: renderWith([late(1), late(2), late(3), late(4)]) })}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /导出成品/ }));
    });

    const report = screen.getByTestId('alignment-report');
    expect(report.textContent).toContain('未达标');
    expect(report.textContent).toContain('第 1 段');
  });

  it('导出失败：danger 文案说明原因，且不出现试听/下载', async () => {
    render(
      <MixExportPanel
        plan={plan(ALL_FOUR)}
        environment={environment({
          fetchBytes: async () => {
            throw new Error('boom');
          },
        })}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /导出成品/ }));
    });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/音频/);
    expect(screen.queryByLabelText('成品试听')).toBeNull();
    expect(screen.queryByRole('link', { name: /下载成品/ })).toBeNull();
  });

  it('重新导出保留成品；「清空成品」才回收（避免误点丢结果）', async () => {
    render(
      <MixExportPanel
        plan={plan(ALL_FOUR)}
        environment={environment({
          render: renderWith([1, 2, 3, 4].map((i) => constantClip(i, 8_000))),
        })}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /导出成品/ }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /重新导出/ }));
    });
    expect(screen.getByLabelText('成品试听')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /清空成品/ }));
    });
    expect(screen.queryByLabelText('成品试听')).toBeNull();
    expect(screen.getByRole('button', { name: /导出成品/ })).toBeEnabled();
  });
});
