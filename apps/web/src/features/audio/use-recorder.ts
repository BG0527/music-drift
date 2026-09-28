/**
 * `useRecorder`：录音状态机（默认 idle → requesting → recording → reviewing_local）。
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
  SEGMENT_PRESET_TOLERANCE_MS,
  checkRecordingDurationAgainstPreset,
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
import { judgeClipLevel, type ClipLevel } from './clip-level';
import type { AudioElementLike } from './use-segment-player';

export type RecorderStatus =
  | 'unsupported'
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'reviewing_local';

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
  /**
   * 自动停止的时间点（ms）。
   * 默认取**本段固定时长**（`presetDurationMs`）；拿不到预设时退回 `SEGMENT_MAX_MS`（30 秒）。
   */
  autoStopMs?: number;
  /**
   * 本段的**固定时长**（曲库权威值，来自 `song.segments[index].durationMs` / t29 的段行）。
   * 它就是录制端的**唯一**分母：录满自动停、判定走 `checkRecordingDurationAgainstPreset`。
   *
   * **缺失（null / 未传）不是"退回旧口径"，而是"不允许录制"**：t31 起服务端对无预设的段
   * fail-closed 直接拒收（`AUDIO_SEGMENT_PRESET_MISSING`），前端再留一条"也能录"的路，
   * 唯一效果就是让用户白录一整段、提交时吃 422。所以这里连麦克风都不去要。
   */
  presetDurationMs?: number | null;
  /** 允许的偏差（默认 `SEGMENT_PRESET_TOLERANCE_MS` = ±2 秒，与上传/服务端同一常量）。 */
  presetToleranceMs?: number;
  /** 从哪里开始提示"接近上限"（默认 28 秒）。 */
  warnFromMs?: number;
  /** 录制完成后的回调（上传由上层负责）。 */
  onRecorded?: (recording: SegmentRecording) => void;
}

/** 试听状态（与分段播放器同一套语义，便于 UI 文案复用）。 */
export type PreviewState = 'idle' | 'playing' | 'paused' | 'ended';

/**
 * "这一段到底有没有录到声音"的实测结论（t40）。
 *
 * - `ok`：量到了声音（附峰值 dBFS）；
 * - `silent`：量到的是静音/几乎没有信号 —— UI 要**明确告诉用户**并给指引（用户实测的问题就出在这里）；
 * - `unavailable`：量不了（宿主不支持 / 解码失败）—— **绝不猜成 silent**，UI 如实说"测不出"。
 */
export interface ClipLevelReport {
  status: 'ok' | 'silent' | 'unavailable';
  /** 实测峰值（dBFS）；量不到时为 null。 */
  peakDbfs: number | null;
  message: string;
  guidance: string | null;
}

export interface UseRecorderResult {
  status: RecorderStatus;
  /** 刚录好那一段的本地地址（未录/已重录时为 null）。 */
  previewUrl: string | null;
  /** 试听状态：`idle` 未试听 / `playing` 试听中 / `paused` 暂停 / `ended` 听完。 */
  previewState: PreviewState;
  /** 播放/暂停/继续/从头重听（用户需求 ③：录完要能听到自己唱成什么样）。 */
  togglePreview: () => void;
  support: RecordingSupport;
  error: MicrophoneErrorDescription | null;
  elapsedMs: number;
  levels: number[];
  nearLimit: boolean;
  recording: SegmentRecording | null;
  durationViolations: AudioViolation[];
  /** 录完当场实测的录音电平（t40）；还没录完/重录后为 null。 */
  clipLevel: ClipLevelReport | null;
  /** 本段固定时长（曲库权威值）；拿不到时为 null。 */
  presetDurationMs: number | null;
  /** 本段时长是否缺失 —— 为 true 时 `start()` 拒绝执行（fail-closed，与 t31 服务端一致）。 */
  presetMissing: boolean;
  /** 不可录制的原因（可直接渲染给用户）；可录制时为 null。 */
  blockedReason: string | null;
  /** 允许的偏差（ms）——UI 文案要用同一个值，不能自己写 2 秒。 */
  presetToleranceMs: number;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

const TIMER_INTERVAL_MS = 100;
const METER_INTERVAL_MS = 40;

/**
 * 取试听用的 objectURL；拿不到就返回 null，即**放弃试听**，而不是让录制流程失败。
 *
 * 为什么必须容错：试听是附加能力，而"停止录制 → 产出成品 → 交给用户"是主路径。
 * 这一步一旦抛异常，`finalize` 会在 `setRecording` 之前炸掉，用户看不到成品、也点不动重录
 * （等于附加能力把主能力带崩）。而这并不罕见：`URL.createObjectURL` 在各宿主里对 Blob 的
 * 实现并不互通（Node 的实现只认自己的 Blob，收到别的 Blob 直接抛），浏览器里也可能被策略禁用。
 */
function createPreviewUrl(environment: RecorderEnvironment, blob: Blob): string | null {
  try {
    if (environment.createObjectURL !== undefined) return environment.createObjectURL(blob);
    if (typeof URL.createObjectURL !== 'function') return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/** 释放 objectURL：`revokeObjectURL` 同样可能缺失或抛，回收失败不该影响 UI 重置。 */
function revokePreviewUrl(environment: RecorderEnvironment, url: string): void {
  try {
    if (environment.revokeObjectURL !== undefined) {
      environment.revokeObjectURL(url);
      return;
    }
    if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
  } catch {
    // 回收失败只意味着这块内存要等页面卸载才释放，没有用户可见后果，不必打扰用户。
  }
}

export function useRecorder(options: UseRecorderOptions = {}): UseRecorderResult {
  const environment = useMemo(
    () => options.environment ?? createBrowserRecorderEnvironment(),
    [options.environment],
  );
  const bars = options.bars ?? 48;
  const presetToleranceMs = options.presetToleranceMs ?? SEGMENT_PRESET_TOLERANCE_MS;
  /** 本段固定时长（只认正数/有限值，别的当"没有"）。 */
  const presetDurationMs =
    typeof options.presetDurationMs === 'number' &&
    Number.isFinite(options.presetDurationMs) &&
    options.presetDurationMs > 0
      ? Math.round(options.presetDurationMs)
      : null;
  /**
   * 录满就停：拿得到本段时长就停在**本段时长**（多录的部分服务端也会拒），
   * 拿不到才退回 30 秒上限（回退口径，见 `SEGMENT_MAX_MS` 注释）。
   */
  /**
   * 录满就停的时间点 = **本段固定时长**（不是"最多 30 秒"）。
   * 末尾的 `SEGMENT_MAX_MS` 只作为类型收敛的兜底：`presetDurationMs` 为 null 时 `start()` 已被拦下，
   * 根本走不到这里，因此它不会变成"悄悄按 30 秒录"的第二套口径。
   */
  const autoStopMs = options.autoStopMs ?? presetDurationMs ?? SEGMENT_MAX_MS;
  /** 本段时长缺失 = 不许录（fail-closed）。文案要能直接给用户看：说明原因 + 给出路。 */
  const presetMissing = presetDurationMs === null;
  const blockedReason = presetMissing
    ? '这一段还没有登记固定时长（曲库数据缺失），现在不能录 —— 换一首歌，或者稍后再来。'
    : null;
  const warnFromMs =
    options.warnFromMs ?? Math.max(0, autoStopMs - Math.min(2_000, Math.round(autoStopMs * 0.1)));

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
  const [clipLevel, setClipLevel] = useState<ClipLevelReport | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>('idle');

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
  /** 作废迟到的 getUserMedia 结果（取消/卸载时自增）。 */
  const requestGenerationRef = useRef(0);
  /** 试听元素与 objectURL（不参与渲染的数据放 ref；URL 也必须能被释放）。 */
  const previewElementRef = useRef<AudioElementLike | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const previewHasPlayedRef = useRef(false);
  const previewAtEndRef = useRef(false);
  /**
   * 解码测量的会话号：每次 finalize/reset 自增。
   * 解码是异步的（可能几百毫秒），晚到的结果**必须丢掉** —— 否则用户点了"重录"之后，
   * 上一段的静音结论会盖到新一轮上（当年覆盖率上报踩过同类竞态）。
   */
  const measureSessionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 释放试听资源（元素停掉 + objectURL 回收）：重录 / 卸载 / 换录时都要调用。 */
  const releasePreview = useCallback((): void => {
    previewElementRef.current?.pause();
    previewElementRef.current = null;
    const url = previewUrlRef.current;
    if (url !== null) {
      revokePreviewUrl(environment, url);
      previewUrlRef.current = null;
    }
    previewHasPlayedRef.current = false;
    previewAtEndRef.current = false;
    setPreviewUrl(null);
    setPreviewState('idle');
  }, [environment]);

  /** 录完立刻准备好试听：本地 Blob → objectURL → 元素 src。 */
  const preparePreview = useCallback(
    (blob: Blob): void => {
      // 先要元素、再要地址：**两个都拿到才对外暴露 `previewUrl`**。
      // 少任何一个都会渲染出一个"点了没反应"的试听按钮 —— 那比没有按钮更糟（用户会以为录音坏了）。
      let element: AudioElementLike | null = null;
      try {
        element = environment.createPreviewElement?.() ?? null;
      } catch {
        element = null;
      }
      const url = element === null ? null : createPreviewUrl(environment, blob);
      if (element === null || url === null) {
        // 宿主不支持/被策略禁用：安静地不提供试听，录制成品照常交付，其余动作不受影响。
        setPreviewUrl(null);
        setPreviewState('idle');
        return;
      }
      previewUrlRef.current = url;
      setPreviewUrl(url);
      element.src = url;
      const publish = (): void => {
        // 先看"是否已听完"再看 paused：浏览器在 ended 之后 paused 一定为 true，
        // 但不能反过来依赖它（替身/流式实现里 ended 与 paused 不一定同步），
        // 否则听完会显示成"暂停"，用户再点一次的行为与文案就对不上了。
        if (previewAtEndRef.current) {
          setPreviewState('ended');
          return;
        }
        setPreviewState(
          element.paused ? (previewHasPlayedRef.current ? 'paused' : 'idle') : 'playing',
        );
      };
      element.addEventListener('play', () => {
        previewHasPlayedRef.current = true;
        previewAtEndRef.current = false;
        publish();
      });
      element.addEventListener('pause', publish);
      element.addEventListener('ended', () => {
        previewAtEndRef.current = true;
        publish();
      });
      previewElementRef.current = element;
      setPreviewState('idle');
    },
    [environment],
  );

  /**
   * 录完当场量一次"有没有声音"（t40）。
   *
   * 三条纪律：
   * 1. **不阻塞主路径**：产物（`recording`）与试听先交付，解码在后台跑；
   * 2. **会话号守卫**：晚到的结果若属于已被重录/重置的那一轮，直接丢弃；
   * 3. **失败不猜**：端口缺失或解码抛错 ⇒ `unavailable`，绝不报成 `silent`（误判会让用户白重录）。
   */
  const measureClip = useCallback(
    (blob: Blob, session: number): void => {
      const port = environment.measureClip;
      if (port === undefined) {
        if (session === measureSessionRef.current) {
          setClipLevel({
            status: 'unavailable',
            peakDbfs: null,
            message: '这个浏览器测不出录音电平（不影响录制与试听）—— 请自己点「试听本段」确认。',
            guidance: null,
          });
        }
        return;
      }
      void port(blob)
        .then((level: ClipLevel) => {
          if (session !== measureSessionRef.current) return;
          const verdict = judgeClipLevel(level);
          setClipLevel({
            status: verdict.status,
            peakDbfs: Number.isFinite(level.peakDbfs) ? level.peakDbfs : null,
            message: verdict.message,
            guidance: verdict.guidance,
          });
        })
        .catch(() => {
          if (session !== measureSessionRef.current) return;
          setClipLevel({
            status: 'unavailable',
            peakDbfs: null,
            message: '这一段测不出电平（解码失败）—— 请自己点「试听本段」确认。',
            guidance: null,
          });
        });
    },
    [environment],
  );

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
    setStatus('reviewing_local');
    // t40：当场量"有没有声音"（异步、不阻塞；新一轮 = 新会话号，旧结果自动作废）
    measureSessionRef.current += 1;
    setClipLevel(null);
    measureClip(blob, measureSessionRef.current);
    // 用户需求 ③：录完就能试听（旧的那一份先释放，避免 blob 泄漏）
    releasePreview();
    preparePreview(blob);
    options.onRecorded?.(produced);
  }, [
    autoStopMs,
    environment,
    measureClip,
    options,
    preparePreview,
    releaseMic,
    releasePreview,
    stopTimers,
    teardownMeter,
  ]);

  const stop = useCallback((): void => {
    const recorder = recorderRef.current;
    if (recorder === null) return;
    recorder.stop();
  }, []);

  const start = useCallback(async (): Promise<void> => {
    // fail-closed：没有本段固定时长就不开录（连麦克风都不要，别让用户以为在录）
    if (!support.ok || sessionActiveRef.current || presetMissing) return;
    sessionActiveRef.current = true;
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;

    setError(null);
    setRecording(null);
    setClipLevel(null);
    measureSessionRef.current += 1; // 新一轮录制：作废上一轮的解码结果
    setElapsedMs(0);
    setStatus('requesting');

    let stream: RecorderStream;
    try {
      stream = await environment.getUserMedia({ audio: true });
    } catch (thrown) {
      if (requestGeneration !== requestGenerationRef.current) return;
      sessionActiveRef.current = false;
      setError(describeMicrophoneError(thrown as { name?: string }));
      setStatus('idle');
      return;
    }

    if (requestGeneration !== requestGenerationRef.current) {
      stream.getTracks().forEach((track) => track.stop());
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
    presetMissing,
    releaseMic,
    stop,
    stopTimers,
    support.ok,
    teardownMeter,
  ]);

  const reset = useCallback((): void => {
    sessionActiveRef.current = false;
    requestGenerationRef.current += 1;
    measureSessionRef.current += 1; // 重录：上一段的电平结论不再适用
    setClipLevel(null);
    releasePreview();
    stopTimers();
    teardownMeter();
    releaseMic();
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(null);
    setElapsedMs(0);
    setError(null);
    setStatus(support.ok ? 'idle' : 'unsupported');
  }, [releaseMic, releasePreview, stopTimers, support.ok, teardownMeter]);

  // 卸载时释放麦克风与定时器（否则标签页会一直显示"正在录音"）
  useEffect(
    () => () => {
      requestGenerationRef.current += 1;
      stopTimers();
      meterRef.current?.stop();
      meterRef.current = null;
      recorderRef.current = null;
      sessionActiveRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      // 卸载：试听元素停掉 + objectURL 回收（离开页面不留泄漏）
      previewElementRef.current?.pause();
      previewElementRef.current = null;
      const url = previewUrlRef.current;
      if (url !== null) {
        revokePreviewUrl(environment, url);
        previewUrlRef.current = null;
      }
    },
    [environment, stopTimers],
  );

  /**
   * 时长判定：**以曲库预设为分母**，与上传客户端/服务端读同一个函数与同一个容差
   * （`checkRecordingDurationAgainstPreset`），所以不会出现"前端说行、后端说不行"。
   * 没有预设时不存在"另一套区间判定"：`start()` 已被拦下，收不到任何录音。
   */
  const durationViolations = useMemo(() => {
    if (recording === null || presetDurationMs === null) return [];
    return checkRecordingDurationAgainstPreset(
      recording.durationMs,
      presetDurationMs,
      presetToleranceMs,
    );
  }, [presetDurationMs, presetToleranceMs, recording]);

  /** 试听切换：播放 / 暂停 / 继续 / 听完再点 = 从头重听（与分段播放器同一条语义）。 */
  const togglePreview = useCallback((): void => {
    const element = previewElementRef.current;
    if (element === null) return;
    // 先判"已听完"再判"是否在播"：听完之后用户的意图一定是"再听一遍"，
    // 而不是"暂停一个已经停下来的东西"（后者会让按钮点了没反应）。
    if (previewAtEndRef.current) {
      element.currentTime = 0;
      previewAtEndRef.current = false;
      void Promise.resolve(element.play()).catch(() => {
        setPreviewState('paused');
      });
      return;
    }
    if (!element.paused) {
      element.pause();
      return;
    }
    void Promise.resolve(element.play()).catch(() => {
      setPreviewState('paused');
    });
  }, []);

  return {
    status,
    clipLevel,
    presetDurationMs,
    presetToleranceMs,
    presetMissing,
    blockedReason,
    previewUrl,
    previewState,
    togglePreview,
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
