/**
 * 通用契约片段（ADR-004：zod 是唯一真相，类型一律 `z.infer` 推导）。
 *
 * 纪律：错误**码与文案分离** —— `code` 是稳定字符串（程序判断），`message` 是中文文案（给人看）。
 * 规则违反的 `code` 直接复用领域内核的稳定错误码，避免前后端各写一套。
 */
import { z } from 'zod';
import { AUDIO_RULE_CODES, type AudioRuleCode } from '../audio/errors';
import { API_RULE_CODES, type ApiRuleCode } from './error-codes';
import { RULE_CODES, type RuleCode } from '../domain/errors';

/** 契约版本：不兼容变更必须提升此值，并在 `docs/api.md` 留变更记录。 */
export const CONTRACT_VERSION = '0.2.0-s1';

export const UuidSchema = z.uuid();
export const IsoDateTimeSchema = z.iso.datetime();
/** epoch 毫秒（领域内核内部统一用毫秒数；跨网络用 ISO 字符串 + 毫秒二选一，这里两者都给。 */
export const EpochMsSchema = z.number().int().nonnegative();

export const ContractVersionSchema = z.literal(CONTRACT_VERSION);

/**
 * 稳定错误码（**联合两套，仍然是唯一来源**）：
 * 1. 领域内核 `RULE_CODES`（状态机守卫的码，409 / 422）；
 * 2. 音频链路 `AUDIO_RULE_CODES`（录音时长/格式/容器/体积，见 `audio/errors.ts`）。
 *
 * 为什么音频码不在内核里：内核是已冻结的终态（`packages/shared/src/domain/`），
 * 而"录音 15–30 秒""容器与声明不符"这些错误**只由音频链路产生**，内核守卫永远返回不到它们。
 * 但它们在 HTTP 上是同一类东西（422 + 码/文案分离），所以在这里合并成一个 wire 级联合，
 * 客户端只需要一套错误解析逻辑。
 */
export const RuleCodeSchema = z.enum([
  ...(RULE_CODES as unknown as [RuleCode, ...RuleCode[]]),
  ...(AUDIO_RULE_CODES as unknown as [AudioRuleCode, ...AudioRuleCode[]]),
  ...(API_RULE_CODES as unknown as [ApiRuleCode, ...ApiRuleCode[]]),
]);

export const RuleViolationSchema = z.object({
  code: RuleCodeSchema,
  message: z.string().min(1),
});

/** 统一错误响应：`httpStatus` 由 API 层按 `httpStatusOf(code)` 决定（409 冲突 / 422 规则违反）。 */
export const ErrorResponseSchema = z.object({
  error: z.object({
    message: z.string().min(1),
    violations: z.array(RuleViolationSchema).default([]),
  }),
});

/** 列表分页：Demo 用游标式即可，不做页码。 */
export const PageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});

export const PageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().min(1).nullable(),
  });

export type RuleViolation = z.infer<typeof RuleViolationSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type PageQuery = z.infer<typeof PageQuerySchema>;
