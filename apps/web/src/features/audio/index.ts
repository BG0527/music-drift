/**
 * 音频能力层（`@/features/audio`）—— **自包含**，页面只从这里 import。
 *
 * 所有权（captain 2026-09-23 划定的目录边界）：`apps/web/src/features/audio/**` 归 t7（audio-engineer）。
 * `apps/web/src/pages/**` 与其他 `features/*` 归 frontend-flow（t11/t12）：
 * 页面**可以** import 本模块，但**不要修改**它；需要改动请通过 captain 转达。
 *
 * 一句话接线（详见 `docs/audio.md`）：
 *
 * ```tsx
 * // 录制第 N 段（N 来自服务端 nextRecordIndex，绝不能自己算）
 * <RecorderPanel segmentIndex={nextRecordIndex} totalSegments={song.totalSegments}
 *                onRecorded={async (rec) => { const r = await uploadSegmentAudio({bottleId, ...rec}); ... }} />
 *
 * // 试听某一段（src 指向 Range 端点），<80% 时点踩按钮自动禁用并说明原因
 * <SegmentPlayer src={`/api/segments/${segment.id}/audio`} segmentIndex={segment.index}
 *                durationMs={segment.durationMs} isOwnSegment={segment.ownerId === me}
 *                onCastDislike={(index) => castVote(segment.id, 'DISLIKE', player.ratio)} />
 * ```
 */
export { RecorderPanel, type RecorderPanelProps, type RecorderUploadView } from './recorder-panel';
export { SegmentPlayer, type SegmentPlayerProps } from './segment-player';
export { DislikeButton, type DislikeButtonProps } from './dislike-button';
export {
  SegmentTimeline,
  type SegmentTimelineProps,
  type TimelineSegment,
  type TimelineSegmentState,
} from './segment-timeline';

export {
  useRecorder,
  type RecorderStatus,
  type SegmentRecording,
  type UseRecorderResult,
} from './use-recorder';
export {
  useSegmentPlayer,
  type AudioElementLike,
  type PlayerProgressSnapshot,
  type UseSegmentPlayerResult,
} from './use-segment-player';

export {
  uploadSegmentAudio,
  buildSegmentUploadForm,
  fileNameForMime,
  isRetryableStatus,
  retryDelayMs,
  xhrTransport,
  type UploadFailure,
  type UploadPhase,
  type UploadProgress,
  type UploadResult,
  type UploadSuccess,
  type UploadTransport,
} from './upload';

export { formatClock, formatSeconds } from './format';
export { downsampleLevels, normalizeLevels, peakLevel } from './waveform';
export {
  createBrowserRecorderEnvironment,
  normalizeRecorderMime,
  type AudioLevelMeter,
  type MediaRecorderLike,
  type RecorderEnvironment,
  type RecorderStream,
} from './recorder-environment';
