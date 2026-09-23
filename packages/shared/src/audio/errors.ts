/**
 * 音频链路的**音频侧错误码**（与领域内核 `domain/errors.ts` 并列，不进内核）。
 *
 * 为什么另立一套而不是加进 `RULE_CODES`：内核是已冻结的终态（`packages/shared/src/domain/` 不许改），
 * 而"录音时长超限""容器不匹配"这类错误**只由音频链路产生**，内核守卫永远返回不到它们。
 * 契约层（`contracts/common.ts`）把两套码**合并**进 `RuleCodeSchema`，
 * 因此 API 的 422 错误体（`ErrorResponseSchema`）仍能用统一形状表达二者。
 *
 * 纪律不变：码给程序判断，文案给人看（ADR-004）；错误码是稳定字符串，改文案不改码。
 */
export const AUDIO_RULE_CODES = [
  /**
   * 录制时长与**该段曲库预设时长**不符（超出 ±容差；t29）。
   * 回退：该段没有预设行时，退化为旧的 15–30 秒区间判定（同一码、文案不同）。
   */
  'AUDIO_DURATION_OUT_OF_RANGE',
  /** 声明的 MIME 不在白名单（不是浏览器录音会产出的容器）。 */
  'AUDIO_FORMAT_UNSUPPORTED',
  /** 文件实际容器与声明的 MIME 不一致（魔数嗅探结果不匹配）。 */
  'AUDIO_CONTAINER_MISMATCH',
  /** 超过体积上限。 */
  'AUDIO_TOO_LARGE',
  /** 没有音频数据（空 body / 字段缺失）。 */
  'AUDIO_MISSING',
  /**
   * 该段**没有曲库预设时长**（`song_segments` 无对应行）⇒ 拒绝录制/上传（t31，fail-closed）。
   * 准入理由：客户端要据此**改选动作**（换一首歌 / 等曲库补齐），与格式、体积类错误不是同一处置；
   * 且这条**必须显式可见**——静默回退到客户端自报值会让该段悄悄失去权威分母（本会话反复清理的静默降级）。
   */
  'AUDIO_SEGMENT_PRESET_MISSING',
] as const;

export type AudioRuleCode = (typeof AUDIO_RULE_CODES)[number];

export interface AudioViolation {
  code: AudioRuleCode;
  message: string;
}

export const AUDIO_RULE_MESSAGES: Record<AudioRuleCode, string> = {
  AUDIO_DURATION_OUT_OF_RANGE: '这一段有固定时长，必须录满同样的长度（允许 ±2 秒），请重新录制。',
  AUDIO_FORMAT_UNSUPPORTED:
    '这个音频格式不被支持（支持 webm / mp4 / ogg / wav），请用浏览器直接录制。',
  AUDIO_CONTAINER_MISMATCH: '音频文件内容与声明的格式不一致，请重新录制。',
  AUDIO_TOO_LARGE: '录音文件超过体积上限，请重新录制。',
  AUDIO_MISSING: '没有收到音频数据，请重新录制。',
  AUDIO_SEGMENT_PRESET_MISSING:
    '这一段的段时长还没在曲库里登记，暂时不能录制。请换一首歌，或等曲库补齐后再来。',
};

/** 音频侧错误一律是"规则违反"（非并发冲突）：422（ADR-004 的错误语义骨架）。 */
export const AUDIO_HTTP_STATUS = 422;

export function audioViolation(code: AudioRuleCode, message?: string): AudioViolation {
  return { code, message: message ?? AUDIO_RULE_MESSAGES[code] };
}
