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
  /** 时长不在 15–30 秒（CONTEXT §3.1）。 */
  'AUDIO_DURATION_OUT_OF_RANGE',
  /** 声明的 MIME 不在白名单（不是浏览器录音会产出的容器）。 */
  'AUDIO_FORMAT_UNSUPPORTED',
  /** 文件实际容器与声明的 MIME 不一致（魔数嗅探结果不匹配）。 */
  'AUDIO_CONTAINER_MISMATCH',
  /** 超过体积上限。 */
  'AUDIO_TOO_LARGE',
  /** 没有音频数据（空 body / 字段缺失）。 */
  'AUDIO_MISSING',
] as const;

export type AudioRuleCode = (typeof AUDIO_RULE_CODES)[number];

export interface AudioViolation {
  code: AudioRuleCode;
  message: string;
}

export const AUDIO_RULE_MESSAGES: Record<AudioRuleCode, string> = {
  AUDIO_DURATION_OUT_OF_RANGE: '每段录音需在 15–30 秒之间，请重新录制。',
  AUDIO_FORMAT_UNSUPPORTED:
    '这个音频格式不被支持（支持 webm / mp4 / ogg / wav），请用浏览器直接录制。',
  AUDIO_CONTAINER_MISMATCH: '音频文件内容与声明的格式不一致，请重新录制。',
  AUDIO_TOO_LARGE: '录音文件超过体积上限，请重新录制。',
  AUDIO_MISSING: '没有收到音频数据，请重新录制。',
};

/** 音频侧错误一律是"规则违反"（非并发冲突）：422（ADR-004 的错误语义骨架）。 */
export const AUDIO_HTTP_STATUS = 422;

export function audioViolation(code: AudioRuleCode, message?: string): AudioViolation {
  return { code, message: message ?? AUDIO_RULE_MESSAGES[code] };
}
