/**
 * 录音测试替身（**不是产品代码**）：
 * 把"只存在于浏览器里的东西"（MediaRecorder / MediaStream / AnalyserNode）替换成可控对象，
 * 从而在 node 环境里复现权限被拒、Safari 只支持 mp4、30 秒到点等分支。
 */
import { vi } from 'vitest';
import type {
  AudioLevelMeter,
  MediaRecorderLike,
  RecorderEnvironment,
  RecorderStream,
} from '../recorder-environment';

export class FakeMediaRecorder implements MediaRecorderLike {
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  state: 'inactive' | 'recording' = 'inactive';

  constructor(private readonly mimeType: string) {}

  start(): void {
    this.state = 'recording';
  }

  stop(): void {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([new Uint8Array(64)], { type: this.mimeType }) });
    this.onstop?.();
  }
}

export function fakeStream(stopTrack = vi.fn()): RecorderStream {
  return { getTracks: () => [{ stop: stopTrack }] };
}

export interface RecorderHarness {
  environment: RecorderEnvironment;
  stopTrack: ReturnType<typeof vi.fn>;
  meterStop: ReturnType<typeof vi.fn>;
  getUserMedia: ReturnType<typeof vi.fn>;
}

export function makeRecorderEnvironment(
  overrides: Partial<RecorderEnvironment> = {},
): RecorderHarness {
  const stopTrack = vi.fn();
  const meterStop = vi.fn();
  const meter: AudioLevelMeter = {
    readLevels: (bars) => Array.from({ length: bars }, () => 0.5),
    stop: meterStop,
  };
  const getUserMedia = vi.fn(async () => fakeStream(stopTrack));
  const environment: RecorderEnvironment = {
    isSecureContext: true,
    hostname: 'localhost',
    hasGetUserMedia: true,
    hasMediaRecorder: true,
    getUserMedia,
    isTypeSupported: (mime) => mime === 'audio/webm;codecs=opus',
    createMediaRecorder: (_stream, mimeType) => new FakeMediaRecorder(mimeType),
    createLevelMeter: () => meter,
    now: () => Date.now(),
    ...overrides,
  };
  return { environment, stopTrack, meterStop, getUserMedia };
}
