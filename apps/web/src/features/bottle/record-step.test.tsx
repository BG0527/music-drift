import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeRecorderEnvironment, renderWithProviders } from '../../test/harness';
import { song } from '../../test/fixtures';
import { RecordStep } from './record-step';

const BOTTLE = '8f1d6c2e-0f1a-4a1e-9f2b-aaaaaaaaaaaa';
const SONG_ID = '33333333-3333-4333-8333-333333333333';

/**
 * 曲库桩：第 2 段的固定时长 = 20 秒。
 * **这一段时长就是录制的分母**（`recorder-panel` 的 `presetDurationMs`）：拿不到它，
 * 录制按钮必须禁用并给出理由（fail-closed），而不是退回"15–30 秒随便录"。
 */
const songsWithPreset = {
  path: '/api/songs',
  respond: () => ({ body: [song({ id: SONG_ID })] }),
};
/** 没有切分预设的曲子（`user-provided` 的真实形态：`segments: []`）。 */
const songsWithoutPreset = {
  path: '/api/songs',
  respond: () => ({ body: [song({ id: SONG_ID, totalSegments: 4, segments: [] })] }),
};

/**
 * 录制步骤必须**原样复用**音频能力层（`features/audio`）：录音状态机、时长校验、
 * 上传重试都在那里做过 TDD，这里只负责"接上瓶子这一侧"（段号来自服务端、成功后刷新瓶子）。
 */
describe('录制步骤', () => {
  it('环境不支持录音时给出可照做的引导，并且不让用户白点（禁用）', async () => {
    renderWithProviders(
      <RecordStep
        bottleId={BOTTLE}
        songId={SONG_ID}
        segmentIndex={2}
        totalSegments={4}
        onUploaded={() => undefined}
        recorderEnvironment={{
          isSecureContext: false,
          hostname: '192.168.1.9',
          hasGetUserMedia: false,
          hasMediaRecorder: false,
        }}
      />,
      { handlers: [songsWithPreset] },
    );
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(await screen.findByText(/https:\/\/ 或 localhost/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /开始录制/ })).toBeDisabled();
  });

  it('环境正常时显示由服务端给的段号，并以曲库固定时长为口径', async () => {
    renderWithProviders(
      <RecordStep
        bottleId={BOTTLE}
        songId={SONG_ID}
        segmentIndex={2}
        totalSegments={4}
        onUploaded={() => undefined}
        recorderEnvironment={fakeRecorderEnvironment().environment}
      />,
      { handlers: [songsWithPreset] },
    );
    expect(await screen.findByRole('heading', { name: /第 2 段 · 共 4 段/ })).toBeInTheDocument();
    /*
     * 用户第 4 条要求：本段时长 = 曲库该段的固定时长。
     * 所以这里不再是"回退 15–30 秒区间"的文案，而是直接把预设时长告诉用户
     * （fixture 里第 2 段 = 22 秒）。
     */
    expect(screen.getByTestId('preset-duration')).toHaveTextContent(/22\.0 秒/);
    expect(screen.queryByText(/15–30 秒/)).not.toBeInTheDocument();
  });

  it('上传失败（网络）时保留录音、给「重试上传」与本地回放（warning 语义，不是 danger）', async () => {
    const onUploaded = vi.fn();
    const recorder = fakeRecorderEnvironment();
    renderWithProviders(
      <RecordStep
        bottleId={BOTTLE}
        songId={SONG_ID}
        segmentIndex={2}
        totalSegments={4}
        onUploaded={onUploaded}
        recorderEnvironment={recorder.environment}
        uploadTransport={() => Promise.reject(new TypeError('Failed to fetch'))}
      />,
      { handlers: [songsWithPreset] },
    );

    fireEvent.click(await screen.findByRole('button', { name: /开始录制/ }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /停止录制/ })).toBeInTheDocument();
    });
    recorder.clock.value += 20_000; // 录满 20 秒（在 15–30 秒区间内）
    fireEvent.click(screen.getByRole('button', { name: /停止录制/ }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /用这一段/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /用这一段/ }));
    // 上传层按指数退避重试（400/800ms）后才判定失败，所以这里要给它足够时间
    await waitFor(
      () => {
        expect(screen.getByText(/网络中断/)).toBeInTheDocument();
      },
      { timeout: 5_000 },
    );
    expect(screen.getByRole('button', { name: /重试上传/ })).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('上传成功时把服务端给的段号与详情交给上层（段号不由前端猜）', async () => {
    const onUploaded = vi.fn();
    const recorder = fakeRecorderEnvironment();
    const handlers = [
      {
        method: 'POST',
        path: `/api/bottles/${BOTTLE}/segments`,
        respond: () => ({
          status: 201,
          body: {
            segmentId: '77777777-7777-4777-8777-777777777777',
            index: 2,
            nextRecordIndex: 3,
            bottle: {
              id: BOTTLE,
              songId: '33333333-3333-4333-8333-333333333333',
              songTitle: '深海鲸落',
              status: 'HELD',
              totalSegments: 4,
              recordedCount: 2,
              missingSegmentIndexes: [3, 4],
              isComplete: false,
              seaZone: null,
              revision: 4,
              createdAt: '2026-09-23T01:00:00.000Z',
              updatedAt: '2026-09-23T02:00:00.000Z',
              initiatorCode: '午夜歌手#042',
              holderId: '22222222-2222-4222-8222-222222222222',
              currentCasterId: '11111111-1111-4111-8111-111111111111',
              returnCompleted: false,
              returnChainBroken: false,
              segments: [],
              availableResolutions: ['RIVER', 'RETURN', 'SEA'],
              isHolder: true,
              hiddenLaterSegmentCount: 0,
              replacementContext: null,
              riverCastAt: '2026-09-23T01:30:00.000Z',
              seaAt: null,
              damagedAt: null,
            },
          },
        }),
      },
    ];

    // 上传走的是 XHR（唯一能拿到进度的浏览器 API），所以这里替换成受控传输层
    const transport = vi.fn(() =>
      Promise.resolve({
        status: 201,
        body: handlers[0]!.respond().body,
      }),
    );

    renderWithProviders(
      <RecordStep
        bottleId={BOTTLE}
        songId={SONG_ID}
        segmentIndex={2}
        totalSegments={4}
        onUploaded={onUploaded}
        recorderEnvironment={recorder.environment}
        uploadTransport={transport}
      />,
      { handlers: [songsWithPreset, ...handlers] },
    );

    fireEvent.click(await screen.findByRole('button', { name: /开始录制/ }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /停止录制/ })).toBeInTheDocument();
    });
    recorder.clock.value += 20_000;
    fireEvent.click(screen.getByRole('button', { name: /停止录制/ }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /用这一段/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /用这一段/ }));

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalled();
    });
    const response = onUploaded.mock.calls[0]![0] as {
      index: number;
      nextRecordIndex: number | null;
    };
    expect(response.index).toBe(2);
    expect(response.nextRecordIndex).toBe(3);
  });
});

/**
 * 【用户可见】录制的分母 = 曲库该段的固定时长：页面**必须把它接下去**。
 * 接不下去的话，`recorder-panel` 会因 `presetMissing` fail-closed 把录制按钮变灰 ——
 * 用户点进来只看到"不能录"，主链路断在这里。
 * 两条断言分别钉住"接对了"与"真没预设时要说清楚为什么"。
 */
describe('录制步骤：本段固定时长（presetDurationMs）的接线', () => {
  it('有切分预设：录制按钮可用（预设已从曲库接到该段）', async () => {
    renderWithProviders(
      <RecordStep
        bottleId={BOTTLE}
        songId={SONG_ID}
        segmentIndex={2}
        totalSegments={4}
        onUploaded={() => undefined}
        recorderEnvironment={fakeRecorderEnvironment().environment}
      />,
      { handlers: [songsWithPreset] },
    );

    expect(await screen.findByRole('button', { name: /开始录制/ })).toBeEnabled();
    expect(screen.queryByTestId('preset-missing')).not.toBeInTheDocument();
  });

  it('没有切分预设：录制按钮禁用，**且给出理由**（不是只灰着）', async () => {
    renderWithProviders(
      <RecordStep
        bottleId={BOTTLE}
        songId={SONG_ID}
        segmentIndex={2}
        totalSegments={4}
        onUploaded={() => undefined}
        recorderEnvironment={fakeRecorderEnvironment().environment}
      />,
      { handlers: [songsWithoutPreset] },
    );

    expect(await screen.findByTestId('preset-missing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /开始录制/ })).toBeDisabled();
  });
});
