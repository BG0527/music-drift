/**
 * 上传入库前的校验（t9 的录音上传路由的唯一音频守门人）。
 *
 * 与前端**共用同一套规则与文案**（`@music-drift/shared/audio`）：前端提前拦是体验，
 * 服务端再拦一次是安全 —— 二者读同一个常量，因此不会出现"前端说可以、后端说不行"。
 *
 * 校验顺序固定（便于测试与逐条展示）：缺失 → 格式 → 体积 → 容器一致性 → 时长。
 */
import {
  DEFAULT_RECORDING_LIMITS,
  checkAudioFormat,
  checkRecordingDuration,
  checkRecordingDurationAgainstPreset,
  normalizeMimeType,
  type AudioViolation,
} from '@music-drift/shared/audio';
import { containerOfMime, sniffAudioContainer, type AudioContainer } from './sniff.js';

export interface SegmentAudioUpload {
  /** 客户端声明的 MIME（`Content-Type`）；缺失传 null。 */
  mime: string | null | undefined;
  bytes: Uint8Array;
  /** 客户端上报的时长；缺失传 null。 */
  durationMs: number | null | undefined;
}

export interface ValidatedSegmentAudio {
  bytes: Uint8Array;
  /** **归一化**后的 MIME（落库用规范值：去掉 `;codecs=...`）。 */
  mime: string;
  container: AudioContainer;
  durationMs: number | null;
  byteSize: number;
  /**
   * 时长是否经过核对。
   * 目前只有"客户端给了合法时长"这一种来源；`requireDuration: false` 时允许缺失，
   * 但会显式标注 `false`，让调用方（与将来的评审）知道这条数据没有核对过。
   */
  durationVerified: boolean;
}

export type SegmentAudioValidation =
  { ok: true; value: ValidatedSegmentAudio } | { ok: false; violations: AudioViolation[] };

export interface ValidateSegmentAudioOptions {
  /**
   * 是否要求客户端提供 `durationMs`。默认 **true**：
   * 时长是产品规则（t29 起为"该段曲库预设时长"，缺失即无法核对 → 拒绝（fail-closed））。
   * 契约 `RecordSegmentRequestSchema.durationMs` 目前是可选字段，若确认要放宽，
   * 由调用方显式传 `false` 并在响应里承担"时长未核实"的后果（不要静默放宽）。
   */
  requireDuration?: boolean;
  maxBytes?: number;
  /**
   * t29：该段的**曲库预设时长**。传了就按「必须匹配预设 ±容差」判定（权威口径）；
   * 不传（历史/异常数据）才回退到 15–30 秒区间。
   */
  presetDurationMs?: number | undefined;
}

export function validateSegmentAudioUpload(
  upload: SegmentAudioUpload,
  options: ValidateSegmentAudioOptions = {},
): SegmentAudioValidation {
  const requireDuration = options.requireDuration ?? true;
  const byteSize = upload.bytes.byteLength;
  const violations: AudioViolation[] = [
    ...checkAudioFormat(
      { mime: upload.mime, byteSize },
      options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes },
    ),
  ];

  const declaredContainer = containerOfMime(upload.mime);
  const actualContainer = byteSize > 0 ? sniffAudioContainer(upload.bytes) : 'unknown';
  if (declaredContainer !== null && byteSize > 0 && actualContainer !== declaredContainer) {
    violations.push({
      code: 'AUDIO_CONTAINER_MISMATCH',
      message: `声明的格式是 ${declaredContainer}，但文件内容看起来是 ${actualContainer === 'unknown' ? '无法识别的格式' : actualContainer}，请重新录制。`,
    });
  }

  const durationMs = upload.durationMs ?? null;
  const durationUsable =
    typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0;
  /**
   * t29：拿到该段曲库预设时长时，判定口径是「**必须匹配预设 ±容差**」；
   * 拿不到预设（历史/异常数据）才回退到旧的 15–30 秒区间 —— 两条口径共用同一个错误码，
   * 且**只有预设口径参与分母**（`bottle_segments.duration_ms` 由 `db/segments.ts` 写预设值）。
   */
  if (options.presetDurationMs !== undefined) {
    violations.push(
      ...checkRecordingDurationAgainstPreset(
        durationUsable ? durationMs : Number.NaN,
        options.presetDurationMs,
      ),
    );
  } else if (durationUsable) {
    violations.push(...checkRecordingDuration(durationMs));
  } else if (requireDuration) {
    violations.push(...checkRecordingDuration(Number.NaN));
  }

  if (violations.length > 0) return { ok: false, violations };

  return {
    ok: true,
    value: {
      bytes: upload.bytes,
      // 到这里 mime 一定在白名单内（否则上面已短路），normalize 只是为了去掉 codecs 参数
      mime: normalizeMimeType(upload.mime) ?? '',
      container: actualContainer,
      durationMs: durationUsable ? durationMs : null,
      byteSize,
      durationVerified: durationUsable,
    },
  };
}

/** 供调用方断言"上限就是共享常量"，避免两端各写一份。 */
export const AUDIO_UPLOAD_MAX_BYTES = DEFAULT_RECORDING_LIMITS.maxBytes;
