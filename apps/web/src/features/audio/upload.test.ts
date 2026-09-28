/**
 * 上传客户端单测（带进度与失败重试）。
 *
 * 三条纪律在这里落地：
 * 1. **请求体里没有 `index`**（ADR-015 §16.8）：段号由服务端 `nextRecordIndex` 决定，
 *    前端绝不能自己算 —— 有一条测试专门钉住"发出去的字段里不含 index"。
 * 2. **进度与重试**：默认 3 次尝试，只对"值得重试"的失败重试（网络错误 / 408 / 429 / 5xx），
 *    4xx 规则违反（422）与并发冲突（409）**不重试**（重试只会重复失败，还会把 409 变成雪崩）。
 * 3. **客户端先拦一遍**：时长与 MIME 先用 `@music-drift/shared/audio` 的同一套规则校验，
 *    不合格就不发请求（省一次往返，也给用户即时反馈）。服务端仍会再拦一遍。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  buildSegmentUploadRequest,
  fileNameForMime,
  isRetryableStatus,
  retryDelayMs,
  uploadSegmentAudio,
  type UploadTransport,
  type UploadTransportRequest,
} from './upload';

const BOTTLE_ID = '11111111-2222-4333-8444-555555555555';
const SEGMENT_ID = '99999999-8888-4777-8666-555555555555';

function makeAudio(mime = 'audio/webm;codecs=opus', bytes = 1024): Blob {
  return new Blob([new Uint8Array(bytes).fill(7)], { type: mime });
}

/** 记录调用的假传输层。 */
function fakeTransport(
  responses: Array<{ status: number; body?: unknown } | Error>,
  onCall?: (request: UploadTransportRequest) => void,
): { transport: UploadTransport; calls: UploadTransportRequest[] } {
  const calls: UploadTransportRequest[] = [];
  const transport: UploadTransport = async (request) => {
    calls.push(request);
    onCall?.(request);
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (next instanceof Error) throw next;
    return { status: next?.status ?? 200, body: next?.body ?? {} };
  };
  return { transport, calls };
}

/**
 * 服务端响应的**合法**夹具（用真实契约字段构造）。
 * 故意写全而不是 `bottle: {}`：客户端会用 `RecordSegmentResponseSchema` 校验响应，
 * 夹具一旦不合契约，成功路径的测试就会失败 —— 这正是我们要的严格性。
 */
const BOTTLE_DETAIL = {
  id: BOTTLE_ID,
  songId: '33333333-4444-4555-8666-777777777777',
  songTitle: 'Immersed',
  status: 'HELD' as const,
  totalSegments: 4,
  recordedCount: 1,
  missingSegmentIndexes: [2, 3, 4],
  isComplete: false,
  seaZone: null,
  revision: 1,
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:01:00.000Z',
  initiatorCode: '匿名歌手#042',
  returnCompleted: false,
  returnChainBroken: false,
  segments: [],
  availableResolutions: [],
  isHolder: true,
  replacementContext: null,
  riverCastAt: null,
  seaAt: null,
  damagedAt: null,
};

const SEGMENT_RESPONSE = {
  segmentId: SEGMENT_ID,
  index: 2,
  nextRecordIndex: 3,
  bottle: BOTTLE_DETAIL,
};

const BASE_OPTIONS = {
  sleep: async () => undefined,
  jitter: () => 0,
};

describe('buildSegmentUploadRequest / fileNameForMime（原始二进制协议，ADR-018）', () => {
  it('body 就是音频本体，**没有 index**（段号由服务端决定），时长与附言走请求头', () => {
    const audio = makeAudio();
    const request = buildSegmentUploadRequest({
      audio,
      durationMs: 20_000,
      note: '这句给我自己',
    });

    expect(request.body).toBe(audio);
    expect(request.headers['x-audio-duration-ms']).toBe('20000');
    expect(request.headers['x-segment-note']).toBe(encodeURIComponent('这句给我自己'));
    expect(request.headers['Content-Type']).toBe('audio/webm');
    expect(Object.keys(request.headers)).not.toContain('index');
  });

  it('附言为空时不带附言请求头（而不是发一个空字符串）', () => {
    const request = buildSegmentUploadRequest({
      audio: makeAudio(),
      durationMs: 20_000,
      note: null,
    });

    expect(request.headers['x-segment-note']).toBeUndefined();
    expect(request.headers['x-audio-duration-ms']).toBe('20000');
  });

  it('文件名按容器给出（Safari 的 mp4 与 Chrome 的 webm 都能被服务端/浏览器识别）', () => {
    expect(fileNameForMime('audio/webm;codecs=opus')).toBe('segment.webm');
    expect(fileNameForMime('audio/mp4')).toBe('segment.m4a');
    expect(fileNameForMime('audio/ogg;codecs=opus')).toBe('segment.ogg');
    expect(fileNameForMime('audio/wav')).toBe('segment.wav');
    expect(fileNameForMime(null)).toBe('segment.webm');
  });
});

describe('重试策略', () => {
  it('只重试"值得重试"的状态：网络错误 / 408 / 429 / 5xx', () => {
    expect(isRetryableStatus(0)).toBe(true); // 传输层网络错误约定用 0
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(422)).toBe(false); // 规则违反：重试无用
    expect(isRetryableStatus(409)).toBe(false); // 并发冲突：重试会把冲突放大
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(413)).toBe(false);
  });

  it('退避是 400/800/1600ms 且封顶 4 秒（不引第三方重试库）', () => {
    expect(retryDelayMs(1)).toBe(400);
    expect(retryDelayMs(2)).toBe(800);
    expect(retryDelayMs(3)).toBe(1_600);
    expect(retryDelayMs(6)).toBe(4_000);
  });
});

describe('uploadSegmentAudio：成功路径', () => {
  it('POST 到契约路径 /api/bottles/:id/segments 并回传服务端解析出的段号', async () => {
    const { transport, calls } = fakeTransport([{ status: 201, body: SEGMENT_RESPONSE }]);

    const result = await uploadSegmentAudio(
      { bottleId: BOTTLE_ID, audio: makeAudio(), durationMs: 20_000, note: null },
      { ...BASE_OPTIONS, transport },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`/api/bottles/${BOTTLE_ID}/segments`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 服务端说这次录的是第 2 段 —— 前端只接受这个值，不自己算
    expect(result.segment.index).toBe(2);
    expect(result.segment.nextRecordIndex).toBe(3);
  });

  it('上报进度（含总量未知的情况），最后到达 done', async () => {
    const phases: string[] = [];
    const ratios: number[] = [];
    const { transport } = fakeTransport([{ status: 200, body: SEGMENT_RESPONSE }], (request) => {
      request.onProgress(256, 1024);
      request.onProgress(1024, 1024);
    });

    const result = await uploadSegmentAudio(
      { bottleId: BOTTLE_ID, audio: makeAudio(), durationMs: 20_000, note: null },
      {
        ...BASE_OPTIONS,
        transport,
        onProgress: (progress) => {
          phases.push(progress.phase);
          if (progress.ratio !== null) ratios.push(progress.ratio);
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(ratios).toContain(0.25);
    expect(ratios).toContain(1);
    expect(phases.at(-1)).toBe('done');
    expect(phases).toContain('uploading');
  });

  it('服务端返回体不符合契约 → 视为失败（不把脏数据当成功）', async () => {
    const { transport } = fakeTransport([{ status: 200, body: { nonsense: true } }]);

    const result = await uploadSegmentAudio(
      { bottleId: BOTTLE_ID, audio: makeAudio(), durationMs: 20_000, note: null },
      { ...BASE_OPTIONS, transport },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('CONTRACT_VIOLATION');
  });
});

describe('uploadSegmentAudio：客户端先拦（不发请求）', () => {
  it('时长不足 15 秒 → 直接失败，一次请求都不发', async () => {
    const { transport, calls } = fakeTransport([{ status: 200 }]);

    const result = await uploadSegmentAudio(
      { bottleId: BOTTLE_ID, audio: makeAudio(), durationMs: 9_000, note: null },
      { ...BASE_OPTIONS, transport },
    );

    expect(calls).toHaveLength(0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('AUDIO_DURATION_OUT_OF_RANGE');
    expect(result.message).toContain('15');
  });

  it('时长超过 30 秒 → 直接失败', async () => {
    const { transport } = fakeTransport([{ status: 200 }]);

    const result = await uploadSegmentAudio(
      { bottleId: BOTTLE_ID, audio: makeAudio(), durationMs: 45_000, note: null },
      { ...BASE_OPTIONS, transport },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('AUDIO_DURATION_OUT_OF_RANGE');
  });

  it('MIME 不在白名单（例如浏览器给了 video/webm）→ 直接失败', async () => {
    const { transport, calls } = fakeTransport([{ status: 200 }]);

    const result = await uploadSegmentAudio(
      { bottleId: BOTTLE_ID, audio: makeAudio('video/webm'), durationMs: 20_000, note: null },
      { ...BASE_OPTIONS, transport },
    );

    expect(calls).toHaveLength(0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('AUDIO_FORMAT_UNSUPPORTED');
  });
});

describe('uploadSegmentAudio：失败与重试', () => {
  it('网络错误重试到第 3 次成功；期间进度为 retrying 且 attempt 递增', async () => {
    const attempts: number[] = [];
    const { transport, calls } = fakeTransport([
      new Error('network down'),
      { status: 503, body: {} },
      { status: 201, body: SEGMENT_RESPONSE },
    ]);

    const result = await uploadSegmentAudio(
      { bottleId: BOTTLE_ID, audio: makeAudio(), durationMs: 20_000, note: null },
      {
        ...BASE_OPTIONS,
        transport,
        onProgress: (progress) => attempts.push(progress.attempt),
      },
    );

    expect(calls).toHaveLength(3);
    expect(result.ok).toBe(true);
    expect(Math.max(...attempts)).toBe(3);
  });

  it('每次都失败 → 3 次后放弃，返回可重试的失败（带中文文案）', async () => {
    const sleep = vi.fn(async () => undefined);
    const { transport, calls } = fakeTransport([{ status: 500, body: {} }]);

    const result = await uploadSegmentAudio(
      { bottleId: BOTTLE_ID, audio: makeAudio(), durationMs: 20_000, note: null },
      { transport, sleep, jitter: () => 0 },
    );

    expect(calls).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.retryable).toBe(true);
    expect(result.code).toBe('SERVER_ERROR');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('422 规则违反不重试：把服务端 violations 原样带回来', async () => {
    const { transport, calls } = fakeTransport([
      {
        status: 422,
        body: {
          error: {
            message: '每段录音需在 15–30 秒之间，请重新录制。',
            violations: [
              {
                code: 'AUDIO_DURATION_OUT_OF_RANGE',
                message: '每段录音需在 15–30 秒之间，请重新录制。',
              },
            ],
          },
        },
      },
    ]);

    const result = await uploadSegmentAudio(
      { bottleId: BOTTLE_ID, audio: makeAudio(), durationMs: 20_000, note: null },
      { ...BASE_OPTIONS, transport },
    );

    expect(calls).toHaveLength(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.retryable).toBe(false);
    expect(result.code).toBe('AUDIO_DURATION_OUT_OF_RANGE');
    expect(result.message).toContain('重新录制');
  });

  it('409 并发冲突不重试（这一句已被别人接走）', async () => {
    const { transport, calls } = fakeTransport([
      {
        status: 409,
        body: {
          error: {
            message: '这个漂流瓶已经被别人拿走了，换一个吧。',
            violations: [
              { code: 'HOLDING_ALREADY_TAKEN', message: '这个漂流瓶已经被别人拿走了，换一个吧。' },
            ],
          },
        },
      },
    ]);

    const result = await uploadSegmentAudio(
      { bottleId: BOTTLE_ID, audio: makeAudio(), durationMs: 20_000, note: null },
      { ...BASE_OPTIONS, transport },
    );

    expect(calls).toHaveLength(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.retryable).toBe(false);
    expect(result.code).toBe('HOLDING_ALREADY_TAKEN');
  });

  it('已取消（AbortSignal）→ 立刻返回 UPLOAD_ABORTED 且不再重试', async () => {
    const controller = new AbortController();
    controller.abort();
    const { transport, calls } = fakeTransport([{ status: 500, body: {} }]);

    const result = await uploadSegmentAudio(
      { bottleId: BOTTLE_ID, audio: makeAudio(), durationMs: 20_000, note: null },
      { ...BASE_OPTIONS, transport, signal: controller.signal },
    );

    expect(calls).toHaveLength(0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('UPLOAD_ABORTED');
    expect(result.retryable).toBe(false);
  });

  it('上传过程中被取消 → 也返回 UPLOAD_ABORTED', async () => {
    const controller = new AbortController();
    const transport: UploadTransport = async (request) => {
      controller.abort();
      request.signal?.dispatchEvent?.(new Event('abort'));
      throw new DOMException('aborted', 'AbortError');
    };

    const result = await uploadSegmentAudio(
      { bottleId: BOTTLE_ID, audio: makeAudio(), durationMs: 20_000, note: null },
      { ...BASE_OPTIONS, transport, signal: controller.signal },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('UPLOAD_ABORTED');
  });

  it('maxAttempts 可配置（例如网络差时退避更多次）', async () => {
    const { transport, calls } = fakeTransport([{ status: 500, body: {} }]);

    const result = await uploadSegmentAudio(
      { bottleId: BOTTLE_ID, audio: makeAudio(), durationMs: 20_000, note: null },
      { ...BASE_OPTIONS, transport, maxAttempts: 1 },
    );

    expect(calls).toHaveLength(1);
    expect(result.ok).toBe(false);
  });
});
