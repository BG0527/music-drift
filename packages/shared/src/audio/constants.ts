/**
 * 音频链路的数值与格式口径（**唯一来源**：前端录制、上传客户端、API 校验都读这里）。
 *
 * 数字来自 `CONTEXT.md`：§3.1「每段 15–30 秒」；上限与容器偏好是本实现的工程选择，逐条给了理由。
 */

/** 每段时长下界（CONTEXT §3.1：15–30 秒）。 */
export const SEGMENT_MIN_MS = 15_000;

/** 每段时长上界（CONTEXT §3.1）。 */
export const SEGMENT_MAX_MS = 30_000;

/**
 * 单段音频体积上限：4 MB。
 * 核算（`docs/architecture.md` D-02）：20s opus ≈ 60–120 KB，Safari mp4/AAC ≈ 300–400 KB，
 * 16-bit 48kHz 单声道 WAV 30s ≈ 2.9 MB。4 MB 容得下最坏情况，又不至于让 bytea 行失控。
 */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/**
 * `MediaRecorder` 容器偏好（按顺序协商，取第一个被浏览器支持的）。
 * Chrome/Edge/Firefox 走 webm+opus；**Safari 只支持 mp4/AAC**，因此 mp4 必须在列表里
 * （D-10 裁决：Chromium + WebKit 双必须，Safari 的 mp4 降级路径不可省）。
 */
export const RECORDER_MIME_PREFERENCES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const;

/** 服务端接受的音频容器（浏览器录音的产出面；`audio/mpeg` 等整曲格式不收）。 */
export const ACCEPTED_AUDIO_MIME_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
] as const;

/** 时长 / 体积限制（可注入，便于按裁决调整而不改调用方）。 */
export interface RecordingLimits {
  minMs: number;
  maxMs: number;
  maxBytes: number;
}

export const DEFAULT_RECORDING_LIMITS: RecordingLimits = {
  minMs: SEGMENT_MIN_MS,
  maxMs: SEGMENT_MAX_MS,
  maxBytes: MAX_AUDIO_BYTES,
};
