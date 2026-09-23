/**
 * 音频链路的数值与格式口径（**唯一来源**：前端录制、上传客户端、API 校验都读这里）。
 *
 * 数字来自 `CONTEXT.md`：§3.1「每段 15–30 秒」；上限与容器偏好是本实现的工程选择，逐条给了理由。
 */

/**
 * 每段时长的**预设值容差**：录制时长必须匹配该段曲库预设时长 ± 此值（t29）。
 *
 * 取值 **±2000ms** 的理由：
 * - 下界方向：录音链路的固有抖动（`MediaRecorder` start/stop 延迟、用户点击反应）典型 100–400ms，
 *   留 5 倍余量以覆盖低端设备与蓝牙麦的缓冲；
 * - 上界方向：对 ~22s 的段约为 9%，换算到点踩门槛只差 `0.8×2s = 1.6s` 的收听量，
 *   不足以让"明显不对的时长"蒙过去；
 * - 更严（<1s）会因各浏览器时钟精度差异产生假拒；更松（>3s）则失去"必须接这一段"的约束意义。
 * 该值可注入（`checkRecordingDurationAgainstPreset` 的第三参），将来按用户裁决调整不必改调用方。
 */
export const SEGMENT_PRESET_TOLERANCE_MS = 2_000;

/**
 * 每段时长下界 / 上界：**仅在拿不到曲库预设时**作为回退区间使用（t29 起曲库预设才是权威）。
 * 保留这两个常量是因为：上传时若该段尚无预设行（历史/异常数据），仍需一个兜底口径，
 * 且前端在预设未加载完时的本地提示也用它。
 */
export const SEGMENT_MIN_MS = 15_000;

/** 每段时长上界（回退区间，见 `SEGMENT_MIN_MS` 注释）。 */
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
