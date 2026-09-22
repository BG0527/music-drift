/**
 * 录制链路纯逻辑单测（CONTEXT §3.1：每段 15–30 秒；§7.3：听满 80% 才能点踩）。
 *
 * 覆盖四类规则：
 * 1. 时长 15–30 秒（含 14999 / 15000 / 30000 / 30001 边界与不可信输入）；
 * 2. 格式白名单与大小上限（服务端与客户端共用同一份规则，避免两端各写一套）；
 * 3. 浏览器能力判定：`getUserMedia` 只在 `https://` 或 `localhost` 可用（AGENTS.md §9 环境约束）；
 * 4. 权限被拒 / 无设备 / 设备被占用的**分平台**降级引导文案，以及点踩按钮的可用性判定。
 */
import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_AUDIO_MIME_TYPES,
  MAX_AUDIO_BYTES,
  RECORDER_MIME_PREFERENCES,
  SEGMENT_MAX_MS,
  SEGMENT_MIN_MS,
} from './constants';
import {
  checkAudioFormat,
  checkRecordingDuration,
  checkRecordingSupport,
  describeDislikeAvailability,
  describeMicrophoneError,
  normalizeMimeType,
  pickRecorderMime,
} from './recording';

const BYTES_OK = 120 * 1024;

describe('时长校验：每段必须落在 15–30 秒', () => {
  it('边界：14999 太短、15000 通过、30000 通过、30001 太长', () => {
    expect(SEGMENT_MIN_MS).toBe(15_000);
    expect(SEGMENT_MAX_MS).toBe(30_000);

    const codes = (ms: number) => checkRecordingDuration(ms).map((violation) => violation.code);

    expect(codes(14_999)).toEqual(['AUDIO_DURATION_OUT_OF_RANGE']);
    expect(codes(15_000)).toEqual([]);
    expect(codes(22_500)).toEqual([]);
    expect(codes(30_000)).toEqual([]);
    expect(codes(30_001)).toEqual(['AUDIO_DURATION_OUT_OF_RANGE']);
  });

  it('不可信时长（NaN / 0 / 负数 / 缺失）一律拒绝：不给"无法判断"留后门', () => {
    for (const value of [Number.NaN, 0, -1, Number.POSITIVE_INFINITY]) {
      expect(checkRecordingDuration(value).map((v) => v.code)).toEqual([
        'AUDIO_DURATION_OUT_OF_RANGE',
      ]);
    }
  });

  it('拒绝文案可读且给出修正动作（含区间与秒数）', () => {
    const [tooShort] = checkRecordingDuration(9_000);
    const [tooLong] = checkRecordingDuration(45_000);

    expect(tooShort?.message).toContain('15');
    expect(tooShort?.message).toContain('30');
    expect(tooShort?.message).toContain('重新录制');
    expect(tooLong?.message).toContain('重新录制');
    // 码给程序、文案给人（ADR-004）
    expect(tooShort?.code).toBe('AUDIO_DURATION_OUT_OF_RANGE');
  });

  it('区间可注入（策略翻案时不用改这个文件）', () => {
    expect(checkRecordingDuration(5_000, { minMs: 3_000, maxMs: 6_000 })).toEqual([]);
    expect(
      checkRecordingDuration(5_000, { minMs: 6_000, maxMs: 9_000 }).map((v) => v.code),
    ).toEqual(['AUDIO_DURATION_OUT_OF_RANGE']);
  });
});

describe('格式与体积校验', () => {
  it('normalizeMimeType 剥掉 codecs 参数并归一大小写', () => {
    expect(normalizeMimeType('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(normalizeMimeType('audio/webm; codecs="opus"')).toBe('audio/webm');
    expect(normalizeMimeType('AUDIO/MP4')).toBe('audio/mp4');
    expect(normalizeMimeType('')).toBeNull();
    expect(normalizeMimeType(null)).toBeNull();
    expect(normalizeMimeType(undefined)).toBeNull();
  });

  it('白名单：浏览器录音会产出的容器才收（webm / mp4 / ogg / wav）', () => {
    expect(ACCEPTED_AUDIO_MIME_TYPES).toEqual([
      'audio/webm',
      'audio/mp4',
      'audio/ogg',
      'audio/wav',
    ]);

    for (const mime of ACCEPTED_AUDIO_MIME_TYPES) {
      expect(checkAudioFormat({ mime, byteSize: BYTES_OK })).toEqual([]);
      // codecs 参数不影响判定
      expect(checkAudioFormat({ mime: `${mime};codecs=opus`, byteSize: BYTES_OK })).toEqual([]);
    }
  });

  it('不是音频 / 不在白名单 → 拒绝（视频容器与整首歌的 mp3 都不收）', () => {
    const codes = (mime: string | null) =>
      checkAudioFormat({ mime, byteSize: BYTES_OK }).map((v) => v.code);

    expect(codes('video/webm')).toEqual(['AUDIO_FORMAT_UNSUPPORTED']);
    expect(codes('audio/mpeg')).toEqual(['AUDIO_FORMAT_UNSUPPORTED']);
    expect(codes('text/plain')).toEqual(['AUDIO_FORMAT_UNSUPPORTED']);
    expect(codes(null)).toEqual(['AUDIO_FORMAT_UNSUPPORTED']);
  });

  it('空音频 → AUDIO_MISSING；超过上限 → AUDIO_TOO_LARGE', () => {
    expect(checkAudioFormat({ mime: 'audio/webm', byteSize: 0 }).map((v) => v.code)).toEqual([
      'AUDIO_MISSING',
    ]);
    expect(
      checkAudioFormat({ mime: 'audio/webm', byteSize: MAX_AUDIO_BYTES + 1 }).map((v) => v.code),
    ).toEqual(['AUDIO_TOO_LARGE']);
    expect(checkAudioFormat({ mime: 'audio/webm', byteSize: MAX_AUDIO_BYTES })).toEqual([]);
    expect(MAX_AUDIO_BYTES).toBe(4 * 1024 * 1024);
  });

  it('多个问题一次报全（不玩"修一个再报下一个"）', () => {
    const codes = checkAudioFormat({ mime: 'video/mp4', byteSize: 0 }).map((v) => v.code);

    expect(codes).toEqual(['AUDIO_MISSING', 'AUDIO_FORMAT_UNSUPPORTED']);
  });
});

describe('录音容器协商（Chrome webm/opus 为主，Safari mp4 兜底）', () => {
  it('优先 webm+opus；Safari 只支持 mp4 时退回 mp4', () => {
    expect(RECORDER_MIME_PREFERENCES[0]).toBe('audio/webm;codecs=opus');

    const all = pickRecorderMime(() => true);
    expect(all).toBe('audio/webm;codecs=opus');

    const safari = pickRecorderMime((mime) => mime === 'audio/mp4');
    expect(safari).toBe('audio/mp4');
  });

  it('逐个偏好按顺序协商，取第一个被支持的', () => {
    const supported = new Set(['audio/webm', 'audio/ogg;codecs=opus']);
    expect(pickRecorderMime((mime) => supported.has(mime))).toBe('audio/webm');
  });

  it('一个都不支持 → null（调用方必须据此显示"浏览器不支持录音"而不是静默失败）', () => {
    expect(pickRecorderMime(() => false)).toBeNull();
  });

  it('isTypeSupported 抛异常时视为不支持（不能把探测本身炸成白屏）', () => {
    expect(
      pickRecorderMime(() => {
        throw new Error('boom');
      }),
    ).toBeNull();
  });
});

describe('录音能力判定：getUserMedia 只在 https:// 或 localhost 可用', () => {
  const capable = { hasGetUserMedia: true, hasMediaRecorder: true };

  it('https 与 localhost 可用（含 127.0.0.1 与 [::1]）', () => {
    for (const hostname of ['localhost', '127.0.0.1', '[::1]', 'music.example.com']) {
      const support = checkRecordingSupport({
        ...capable,
        isSecureContext: true,
        hostname,
      });
      expect(support.ok).toBe(true);
      expect(support.reason).toBe('OK');
      expect(support.guidance).toBeNull();
    }
  });

  it('http 下的局域网 IP / 域名判为不安全上下文，并给出可照做的引导', () => {
    const support = checkRecordingSupport({
      ...capable,
      isSecureContext: false,
      hostname: '192.168.1.20',
    });

    expect(support.ok).toBe(false);
    expect(support.reason).toBe('INSECURE_CONTEXT');
    expect(support.guidance).toContain('https');
    expect(support.guidance).toContain('localhost');
    expect(support.guidance).toContain('浏览器');
  });

  it('环境问题优先于能力问题（http 页面里 mediaDevices 本来就存在但不可用）', () => {
    const support = checkRecordingSupport({
      isSecureContext: false,
      hostname: '10.0.0.5',
      hasGetUserMedia: false,
      hasMediaRecorder: false,
    });

    expect(support.reason).toBe('INSECURE_CONTEXT');
  });

  it('安全上下文但缺接口 → 明确说缺哪个，并建议换浏览器', () => {
    const noGetUserMedia = checkRecordingSupport({
      isSecureContext: true,
      hostname: 'localhost',
      hasGetUserMedia: false,
      hasMediaRecorder: true,
    });
    expect(noGetUserMedia.reason).toBe('NO_GET_USER_MEDIA');
    expect(noGetUserMedia.guidance).toContain('Chrome');

    const noRecorder = checkRecordingSupport({
      isSecureContext: true,
      hostname: 'localhost',
      hasGetUserMedia: true,
      hasMediaRecorder: false,
    });
    expect(noRecorder.reason).toBe('NO_MEDIA_RECORDER');
    expect(noRecorder.guidance).toContain('MediaRecorder');
  });
});

describe('麦克风错误 → 降级引导（DESIGN.md Error States #5：分平台修复指引，不用 alert）', () => {
  it('权限被拒：说明怎么改授权，并给出"还能做什么"', () => {
    const denied = describeMicrophoneError({ name: 'NotAllowedError' });

    expect(denied.kind).toBe('DENIED');
    expect(denied.title).toContain('麦克风');
    expect(denied.guidance).toContain('Chrome');
    expect(denied.guidance).toContain('Safari');
  });

  it('没有设备 / 设备被占用 / 其他错误各有独立文案', () => {
    expect(describeMicrophoneError({ name: 'NotFoundError' }).kind).toBe('NO_DEVICE');
    expect(describeMicrophoneError({ name: 'DevicesNotFoundError' }).kind).toBe('NO_DEVICE');
    expect(describeMicrophoneError({ name: 'NotReadableError' }).kind).toBe('DEVICE_BUSY');
    expect(describeMicrophoneError({ name: 'TrackStartError' }).kind).toBe('DEVICE_BUSY');
    expect(describeMicrophoneError({ name: 'SecurityError' }).kind).toBe('DENIED');
    expect(describeMicrophoneError({ name: 'WeirdError' }).kind).toBe('UNKNOWN');
    expect(describeMicrophoneError(null).kind).toBe('UNKNOWN');
    expect(describeMicrophoneError(undefined).guidance.length).toBeGreaterThan(0);
  });

  it("每类错误的文案都非空且不含 emoji（DESIGN.md Do&Don't）", () => {
    const kinds = ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'WeirdError'];
    for (const name of kinds) {
      const described = describeMicrophoneError({ name });
      expect(described.title.length).toBeGreaterThan(0);
      expect(described.guidance.length).toBeGreaterThan(0);
      expect(
        /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(`${described.title}${described.guidance}`),
      ).toBe(false);
    }
  });
});

describe('点踩按钮可用性（UI 侧与内核同源，阈值不另写）', () => {
  const blockedByRatio = 0.799;
  const unlocked = 0.8;

  it('79.9% 不可点踩，且文案告诉用户还差多少', () => {
    const state = describeDislikeAvailability({ ratio: blockedByRatio, durationMs: 20_000 });

    expect(state.allowed).toBe(false);
    expect(state.code).toBe('LISTEN_RATIO_TOO_LOW');
    expect(state.message).toContain('80%');
    expect(state.message).toContain('79%');
    expect(state.remainingRatio).toBeCloseTo(0.001, 10);
  });

  it('80% 可点踩（边界），且无残留提示', () => {
    const state = describeDislikeAvailability({ ratio: unlocked, durationMs: 20_000 });

    expect(state.allowed).toBe(true);
    expect(state.code).toBeNull();
    expect(state.message).toBeNull();
    expect(state.remainingRatio).toBe(0);
  });

  it('自己的段听满也不能踩（内核规则 CANNOT_DISLIKE_OWN_SEGMENT，文案与内核一致）', () => {
    const state = describeDislikeAvailability({
      ratio: 1,
      durationMs: 20_000,
      isOwnSegment: true,
    });

    expect(state.allowed).toBe(false);
    expect(state.code).toBe('CANNOT_DISLIKE_OWN_SEGMENT');
    expect(state.message).toBe('不能踩自己的段。');
  });

  it('时长不可信时按 0% 处理：宁可点不了踩，也不放行', () => {
    expect(describeDislikeAvailability({ ratio: 1, durationMs: 0 }).allowed).toBe(false);
    expect(describeDislikeAvailability({ ratio: Number.NaN, durationMs: 20_000 }).allowed).toBe(
      false,
    );
  });
});
