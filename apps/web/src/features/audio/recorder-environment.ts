/**
 * 浏览器音频能力的**端口定义 + 生产实现**。
 *
 * 为什么把 `MediaRecorder` / `getUserMedia` / `AnalyserNode` 都做成端口：
 * 1. 这套逻辑只能在浏览器里跑，但它的**分支**（权限被拒、设备被占用、容器不支持、30 秒到点）
 *    正是最需要测试的部分 —— 端口化后可以在 node/jsdom 里把每条分支都跑一遍；
 * 2. Safari 与 Chrome 的容器差异（mp4 vs webm）可以注入成"只支持 mp4 的浏览器"，一行测试覆盖。
 *
 * 生产实现在文件末尾（`createBrowserRecorderEnvironment`），消费方通常不需要感知它。
 */
import { normalizeMimeType } from '@music-drift/shared/audio';
import { measureClipLevel, type ClipLevel } from './clip-level';
import type { AudioElementLike } from './use-segment-player';

export interface RecorderTrack {
  stop: () => void;
}

export interface RecorderStream {
  getTracks: () => RecorderTrack[];
}

export interface MediaRecorderLike {
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  start: () => void;
  stop: () => void;
}

/** 电平读取端口：每帧返回 `bars` 个 0..1 的柱高。 */
export interface AudioLevelMeter {
  readLevels: (bars: number) => number[];
  stop: () => void;
}

export interface RecorderEnvironment {
  /**
   * 试听"刚录好的那一段"用的音频元素（用户需求 ③：录完要能听到自己唱成什么样）。
   * 用**类型复用**而不是新造一个接口：试听与分段播放是同一类元素，行为语义也应一致。
   */
  createPreviewElement?: () => AudioElementLike;
  /** 本地 Blob → objectURL（默认 `URL.createObjectURL`）。 */
  createObjectURL?: (blob: Blob) => string;
  /** 释放 objectURL（默认 `URL.revokeObjectURL`）：重录/卸载时必须调用，避免 blob 泄漏。 */
  revokeObjectURL?: (url: string) => void;
  /**
   * **量一段录音的实际电平**（t40）：解码 `blob` → 算峰值/RMS（dBFS）。
   *
   * 为什么必须由产品自己量：真实麦克风从未被验证过，用户实测"录完试听没有声音"，
   * 根因只能在"录到的内容"里 —— 用它把"有没有声音"从主观感受变成可展示的数值（含静音判定）。
   * 失败/不支持时**抛错**，由调用方记成 `unavailable`（绝不猜成"静音"）。
   */
  measureClip?: (blob: Blob) => Promise<ClipLevel>;
  isSecureContext: boolean;
  hostname: string;
  hasGetUserMedia: boolean;
  hasMediaRecorder: boolean;
  getUserMedia: (constraints: { audio: true }) => Promise<RecorderStream>;
  /** `MediaRecorder.isTypeSupported`。 */
  isTypeSupported: (mime: string) => boolean;
  createMediaRecorder: (stream: RecorderStream, mimeType: string) => MediaRecorderLike;
  /** 波形电平；无法建立（例如 AudioContext 被限制）时返回 null，录制本身不受影响。 */
  createLevelMeter: (stream: RecorderStream) => AudioLevelMeter | null;
  now: () => number;
}

/**
 * 浏览器全局里我们**实际用到**的那几个构造器/接口。
 * 单独声明而不是直接摸 `globalThis.X`：① `webkitAudioContext` 不在标准类型里；
 * ② `MediaRecorder` 的 `ondataavailable` 参数是 `BlobEvent`，而端口只需要 `{ data: Blob }`，
 * 在**这一处**（唯一接触真实浏览器对象的边界）做一次收窄，端口内部就保持干净可测。
 */
interface MediaRecorderConstructorLike {
  new (stream: MediaStream, options?: { mimeType?: string }): MediaRecorderLike;
  isTypeSupported?: (mime: string) => boolean;
}

interface AudioContextConstructorLike {
  new (): AudioContext;
}

interface BrowserGlobals {
  isSecureContext?: boolean;
  location?: { hostname?: string };
  navigator?: {
    mediaDevices?: { getUserMedia: (constraints: { audio: true }) => Promise<MediaStream> };
  };
  MediaRecorder?: MediaRecorderConstructorLike;
  AudioContext?: AudioContextConstructorLike;
  webkitAudioContext?: AudioContextConstructorLike;
}

/**
 * 生产实现：从 `window` / `navigator` 读取真实能力。
 * 注意 `getUserMedia` 的**调用时机** —— 这里只取函数引用，权限弹窗在 `useRecorder.start()` 里触发
 * （页面一加载就弹权限会被浏览器降级为"忽略"，也会吓到用户）。
 */
export function createBrowserRecorderEnvironment(): RecorderEnvironment {
  const globals = globalThis as unknown as BrowserGlobals;
  const mediaDevices = globals.navigator?.mediaDevices;
  const MediaRecorderCtor = globals.MediaRecorder;

  return {
    createPreviewElement: () => {
      const element = new Audio();
      element.preload = 'metadata';
      return element;
    },
    createObjectURL: (blob) => URL.createObjectURL(blob),
    /**
     * 解码录音并量电平。用 `AudioContext.decodeAudioData`：
     * 它**独立于**录制链路（不碰 MediaRecorder、不碰试听元素），所以量出来的就是"文件里到底有什么声音"。
     * 兼容两种 API 形状：现代返回 Promise；老 WebKit 只回调 ⇒ 同一处收口（见下方 `decodeAudio`）。
     */
    measureClip: async (blob) => {
      const AudioContextCtor = globals.AudioContext ?? globals.webkitAudioContext;
      if (AudioContextCtor === undefined) {
        throw new Error('AudioContext 不可用，无法测量录音电平');
      }
      const bytes = await blob.arrayBuffer();
      const context = new AudioContextCtor();
      try {
        const decoded = await decodeAudio(context, bytes);
        return measureClipLevel(decoded.getChannelData(0), decoded.duration);
      } finally {
        void context.close();
      }
    },
    revokeObjectURL: (url) => {
      URL.revokeObjectURL(url);
    },
    isSecureContext: globals.isSecureContext === true,
    hostname: globals.location?.hostname ?? '',
    hasGetUserMedia: typeof mediaDevices?.getUserMedia === 'function',
    hasMediaRecorder: typeof MediaRecorderCtor === 'function',
    getUserMedia: async (constraints) => {
      if (mediaDevices === undefined) throw new Error('mediaDevices 不可用');
      return mediaDevices.getUserMedia(constraints);
    },
    isTypeSupported: (mime) =>
      typeof MediaRecorderCtor?.isTypeSupported === 'function'
        ? MediaRecorderCtor.isTypeSupported(mime)
        : false,
    createMediaRecorder: (stream, mimeType) => {
      if (MediaRecorderCtor === undefined) throw new Error('MediaRecorder 不可用');
      return new MediaRecorderCtor(stream as MediaStream, { mimeType });
    },
    createLevelMeter: (stream) => {
      const AudioContextCtor = globals.AudioContext ?? globals.webkitAudioContext;
      if (AudioContextCtor === undefined) return null;
      const context = new AudioContextCtor();
      const source = context.createMediaStreamSource(stream as MediaStream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.fftSize);
      return {
        readLevels: (bars) => {
          analyser.getByteTimeDomainData(buffer);
          // 就地把 128 中心的字节数据转成 0..1 电平（避免每帧分配）
          const levels: number[] = [];
          const bucket = Math.max(1, Math.floor(buffer.length / Math.max(1, bars)));
          for (let bar = 0; bar < bars; bar += 1) {
            let peak = 0;
            for (let index = bar * bucket; index < (bar + 1) * bucket; index += 1) {
              const value = buffer[index] ?? 128;
              const level = Math.abs(value - 128) / 128;
              if (level > peak) peak = level;
            }
            levels.push(peak);
          }
          return levels;
        },
        stop: () => {
          source.disconnect();
          analyser.disconnect();
          void context.close();
        },
      };
    },
    now: () => Date.now(),
  };
}

/**
 * 解码一段录音字节（t40）。
 *
 * 为什么要兼容两种形状：现代浏览器 `decodeAudioData` 返回 Promise，老 WebKit 只接受回调。
 * 两处都交给同一个 Promise 收口（Promise 重复 resolve 是幂等的），避免"新浏览器能用、老 Safari 抛错"。
 */
function decodeAudio(context: AudioContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    const onError = (error?: unknown): void => {
      reject(error instanceof Error ? error : new Error('decodeAudioData 失败'));
    };
    const maybePromise = context.decodeAudioData(
      bytes,
      (buffer) => {
        resolve(buffer);
      },
      onError,
    ) as unknown as Promise<AudioBuffer> | undefined;
    if (maybePromise !== undefined && typeof maybePromise.then === 'function') {
      maybePromise.then(resolve, onError);
    }
  });
}

/** 归一化录音容器（`audio/webm;codecs=opus` → `audio/webm`），与上传/校验口径一致。 */
export function normalizeRecorderMime(raw: string | undefined): string {
  return normalizeMimeType(raw) ?? '';
}
