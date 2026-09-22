/**
 * `useRecorder`：录音状态机（默认 idle → requesting → recording → recorded）。
 *
 * 设计要点：
 * - **浏览器能力全部走端口**（`RecorderEnvironment`），因此权限被拒、设备被占用、Safari 只支持
 *   mp4、30 秒到点自动停这些分支都能在测试里复现；
 * - **30 秒自动停**：服务端会拒收超长音频，与其让用户白录一段再被拒，不如到点自动收尾；
 *   28 秒起给 warning 态提示（DESIGN.md：接近上限用 warning 语义色）；
 * - **录音期间持有麦克风**：停止/重置/卸载时一定 `track.stop()` + 断开电平表，否则浏览器标签页
 *   会一直亮着录音指示灯（用户会以为我们在偷录）；
 * - 时长/格式校验复用 `@music-drift/shared/audio`（与服务端同一套规则与文案）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SEGMENT_MAX_MS,
  checkRecordingDuration,
  describeMicrophoneError,
  checkRecordingSupport,
  pickRecorderMime,
  type AudioViolation,
  type MicrophoneErrorDescription,
  type RecordingSupport,
} from '@music-drift/shared/audio';
import {
  createBrowserRecorderEnvironment,
  normalizeRecorderMime,
  type AudioLevelMeter,
  type MediaRecorderLike,
  type RecorderEnvironment,
  type RecorderStream,
} from './recorder-environment';

export type RecorderStatus = 'unsupported' | 'idle' | 'requesting' | 'recording' | 'recorded';

export interface SegmentRecording {
  blob: Blob;
  /** 归一化后的容器 MIME（`audio/webm` / `audio/mp4` …）。 */
  mime: string;
  durationMs: number;
}

export interface UseRecorderOptions {
  environment?: RecorderEnvironment;
  /** 波形柱子数（默认 48）。 */
  bars?: number;
  /** 自动停止的时间点（默认 30 秒 = 服务端上限）。 */
  autoStopMs?: number;
  /** 从哪里开始提示"接近上限"（默认 28 秒）。 */
  warnFromMs?: number;
  /** 录制完成后的回调（上传由上层负责）。 */
  onRecorded?: (recording: SegmentRecording) => void;
}

export interface UseRecorderResult {
  status: RecorderStatus;
  support: RecordingSupport;
  error: MicrophoneErrorDescription | null;
  elapsedMs: number;
  levels: number[];
  nearLimit: boolean;
  recording: SegmentRecording | null;
  durationViolations: AudioViolation[];
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

const TIMER_INTERVAL_MS = 100;
const METER_INTERVAL_MS = 40;

export function useRecorder(options: UseRecorderOptions = {}): UseRecorderResult {
  const environment = useMemo(
    () => options.environment ?? createBrowserRecorderEnvironment(),
    [options.environment],
  );
  const bars = options.bars ?? 48;
  const autoStopMs = options.autoStopMs ?? SEGMENT_MAX_MS;
  const warnFromMs = options.warnFromMs ?? Math.max(0, autoStopMs - 2_000);

  const support = useMemo(
    () =>
      checkRecordingSupport({
        isSecureContext: environment.isSecureContext,
        hostname: environment.hostname,
        hasGetUserMedia: environment.hasGetUserMedia,
        hasMediaRecorder: environment.hasMediaRecorder,
      }),
    [environment],
  );

  const [status, setStatus] = useState<RecorderStatus>(support.ok ? 'idle' : 'unsupported');
  const [error, setError] = useState<MicrophoneErrorDescription | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [recording, setRecording] = useState<SegmentRecording | null>(null);

  const streamRef = useRef<RecorderStream | null>(null);
  const recorderRef = useRef<MediaRecorderLike | null>(null);
  const meterRef = useRef<AudioLevelMeter | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>('');
  const startedAtRef = useRef(0);
  /**
   * 是否已经有一路录制在进行中。
   *
   * 用 ref 而不是只看 `status`：连点两次"开始录制"时，两次点击拿到的是**同一份**渲染闭包
   * （`status` 都还是 `idle`），只靠 state 判断会开出两路麦克风（用户会看到"录制中"却录到两轨，
   * 而且第一路永远不被 stop）。ref 的读写只发生在事件处理函数里，不在 render 期。
   */
  const sessionActiveRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const releaseMic = useCallback((): void => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stopTimers = useCallback((): void => {
    if (timerRef.current !== null) clearInterval(timerRef.current);
    if (meterTimerRef.current !== null) clearInterval(meterTimerRef.current);
    timerRef.current = null;
    meterTimerRef.current = null;
  }, []);

  const teardownMeter = useCallback((): void => {
    meterRef.current?.stop();
    meterRef.current = null;
    setLevels([]);
  }, []);

  /** 结束录制并产出成品（幂等：重复调用不会产生第二份 recording）。 */
  const finalize = useCallback((): void => {
    const recorder = recorderRef.current;
    if (recorder === null) return;
    recorderRef.current = null;
    sessionActiveRef.current = false;
    stopTimers();
    teardownMeter();
    releaseMic();

    const durationMs = Math.min(autoStopMs, Math.max(0, environment.now() - startedAtRef.current));
    const mime = mimeRef.current;
    const blob = new Blob(chunksRef.current, { type: mime });
    chunksRef.current = [];
    setElapsedMs(durationMs);
    const produced: SegmentRecording = { blob, mime, durationMs };
    setRecording(produced);
    setStatus('recorded');
    options.onRecorded?.(produced);
  }, [autoStopMs, environment, options, releaseMic, stopTimers, teardownMeter]);

  const stop = useCallback((): void => {
    const recorder = recorderRef.current;
    if (recorder === null) return;
    recorder.stop();
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (!support.ok || sessionActiveRef.current) return;
    sessionActiveRef.current = true;

    setError(null);
    setRecording(null);
    setElapsedMs(0);
    setStatus('requesting');

    let stream: RecorderStream;
    try {
      stream = await environment.getUserMedia({ audio: true });
    } catch (thrown) {
      sessionActiveRef.current = false;
      setError(describeMicrophoneError(thrown as { name?: string }));
      setStatus('idle');
      return;
    }

    const mime = pickRecorderMime(environment.isTypeSupported);
    if (mime === null) {
      sessionActiveRef.current = false;
      stream.getTracks().forEach((track) => track.stop());
      setError({
        kind: 'UNKNOWN',
        title: '这个浏览器无法录制音频。',
        guidance:
          '它不支持任何可用的录音容器（webm / mp4 / ogg），请改用较新版本的 Chrome、Edge 或 Safari。',
      });
      setStatus('unsupported');
      return;
    }

    try {
      const recorder = environment.createMediaRecorder(stream, mime);
      streamRef.current = stream;
      recorderRef.current = recorder;
      mimeRef.current = normalizeRecorderMime(mime);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => finalize();
      recorder.onerror = () => {
        setError(describeMicrophoneError({ name: 'UnknownError' }));
        if (recorderRef.current !== null) {
          recorderRef.current = null;
          sessionActiveRef.current = false;
          stopTimers();
          teardownMeter();
          releaseMic();
        }
        setStatus('idle');
      };

      recorder.start();
      startedAtRef.current = environment.now();
      setStatus('recording');

      timerRef.current = setInterval(() => {
        const elapsed = environment.now() - startedAtRef.current;
        setElapsedMs(Math.min(elapsed, autoStopMs));
        if (elapsed >= autoStopMs) stop();
      }, TIMER_INTERVAL_MS);

      const meter = environment.createLevelMeter(stream);
      if (meter !== null) {
        meterRef.current = meter;
        setLevels(meter.readLevels(bars));
        meterTimerRef.current = setInterval(() => {
          setLevels(meterRef.current?.readLevels(bars) ?? []);
        }, METER_INTERVAL_MS);
      }
    } catch (thrown) {
      sessionActiveRef.current = false;
      stream.getTracks().forEach((track) => track.stop());
      setError(describeMicrophoneError(thrown as { name?: string }));
      setStatus('idle');
    }
  }, [
    autoStopMs,
    bars,
    environment,
    finalize,
    releaseMic,
    stop,
    stopTimers,
    support.ok,
    teardownMeter,
  ]);

  const reset = useCallback((): void => {
    sessionActiveRef.current = false;
    stopTimers();
    teardownMeter();
    releaseMic();
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(null);
    setElapsedMs(0);
    setError(null);
    setStatus(support.ok ? 'idle' : 'unsupported');
  }, [releaseMic, stopTimers, support.ok, teardownMeter]);

  // 卸载时释放麦克风与定时器（否则标签页会一直显示"正在录音"）
  useEffect(
    () => () => {
      stopTimers();
      meterRef.current?.stop();
      meterRef.current = null;
      recorderRef.current = null;
      sessionActiveRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    },
    [stopTimers],
  );

  const durationViolations = useMemo(
    () => (recording === null ? [] : checkRecordingDuration(recording.durationMs)),
    [recording],
  );

  return {
    status,
    support,
    error,
    elapsedMs,
    levels,
    nearLimit: status === 'recording' && elapsedMs >= warnFromMs,
    recording,
    durationViolations,
    start,
    stop,
    reset,
  };
}
