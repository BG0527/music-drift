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
  checkRecordingDurationAgainstPreset,
  AUDIO_RULE_MESSAGES,
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
   * t31 起：判定只看**曲库预设**；客户端这个值仅作诊断（缺失即判不通过，无开关可放宽）。
   * 但会显式标注 `false`，让调用方（与将来的评审）知道这条数据没有核对过。
   */
  durationVerified: boolean;
}

export type SegmentAudioValidation =
  { ok: true; value: ValidatedSegmentAudio } | { ok: false; violations: AudioViolation[] };

export interface ValidateSegmentAudioOptions {
  /**
   * 该段的**曲库预设时长**（ms）—— **必填**（t31）。
   *
   * 为什么必填：它是分母的唯一权威来源，缺了就没有可判定口径。
   * 旧实现的"未传预设 → 回退 15–30s 区间"分支已**删除**；改成必填是**类型层面**的保证：
   * 新调用方忘了传就编译期报错，而不是运行时悄悄退回旧规则（那正是要根除的静默降级）。
   * 预设本身不可用（NaN / ≤0）→ `AUDIO_SEGMENT_PRESET_MISSING`（fail-closed）。
   *
   * 已删除的 `requireDuration` 原来守"客户端必须自报时长，否则拒"；现在由**预设规则**接手：
   * 不报时长 ⇒ `NaN` 进 `checkRecordingDurationAgainstPreset` ⇒ 仍是 `AUDIO_DURATION_OUT_OF_RANGE`
   *（"没有收到可用的录音时长…"），语义不减、开关更少。
   */
  presetDurationMs: number;
  maxBytes?: number;
}

export function validateSegmentAudioUpload(
  upload: SegmentAudioUpload,
  options: ValidateSegmentAudioOptions,
): SegmentAudioValidation {
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
   * t31：时长判定**只有一条规则** —— 「必须匹配该段曲库预设时长（±容差）」。
   * 旧的 15–30s 动态区间分支已删除（它守的是已被用户需求取代的规则）；
   * 预设必填，缺失/不可用即 fail-closed，不存在"回退到客户端自报值"的分叉。
   */
  if (!Number.isFinite(options.presetDurationMs) || options.presetDurationMs <= 0) {
    violations.push({
      code: 'AUDIO_SEGMENT_PRESET_MISSING',
      message: AUDIO_RULE_MESSAGES.AUDIO_SEGMENT_PRESET_MISSING,
    });
  } else {
    violations.push(
      ...checkRecordingDurationAgainstPreset(
        durationUsable ? durationMs : Number.NaN,
        options.presetDurationMs,
      ),
    );
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
