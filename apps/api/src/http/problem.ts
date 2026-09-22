/**
 * **唯一**的「内核守卫 → HTTP」映射出口（t9，captain 批准的设计）。
 *
 * 分工：
 * - **内核只负责 409/422**（`httpStatusOf(code)`）—— 会话、角色、资源存在性**不是领域规则**，
 *   内核不该知道它们；
 * - **传输层码**（`UNAUTHENTICATED` / `FORBIDDEN` / `NOT_FOUND` / `INTERNAL`）由本模块提供 401/403/404/500；
 * - 响应体一律 `ErrorResponseSchema`：`message` 是**中文用户可读文案**，`violations[].code` 是**稳定码**
 *   （码与文案分离，ADR-004）；`violations[0]` 决定状态码，但**全部**违规都保留在数组里。
 *
 * 两条硬线（都有可执行守卫，见 `routes/guard.test.ts` 与 `problem.test.ts`）：
 * 1. `message` 必须是中文可读文案，不得把 `code` 当文案透出；
 * 2. **不得泄漏内部细节** —— `internalProblem()` **不接受任何错误对象**，
 *    因此「把 SQL 报错 / 堆栈 / 驱动码塞进响应体」在结构上就不可能。
 *
 * 本文件是**唯一**允许出现 4xx/5xx 数字字面量的地方（`TRANSPORT_STATUS`），守卫测试会强制这一点。
 */
import { API_RULE_CODES, ErrorResponseSchema, type ErrorResponse } from '@music-drift/shared';
import {
  RULE_CODES,
  RULE_MESSAGES,
  httpStatusOf,
  type CommandOutcome,
  type RuleCode,
} from '@music-drift/shared/domain';
import type { FastifyReply } from 'fastify';

/** 传输层错误码：与领域规则无关，因此不进内核（内核不该管鉴权）。 */
export const TRANSPORT_ERROR_CODES = [
  'INVALID_BODY',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'NOT_IMPLEMENTED',
  'INTERNAL',
] as const;

export type TransportErrorCode = (typeof TRANSPORT_ERROR_CODES)[number];
export type ApiErrorCode = RuleCode | TransportErrorCode;

const TRANSPORT_MESSAGES: Record<TransportErrorCode, string> = {
  INVALID_BODY: '请求内容不合法，请检查后重试。',
  UNAUTHENTICATED: '请先登录再继续。',
  FORBIDDEN: '你没有权限执行这个操作。',
  NOT_FOUND: '找不到这个资源。',
  NOT_IMPLEMENTED: '这个功能还没上线（属后续切片），请稍后关注。',
  INTERNAL: '服务器出了点问题，请稍后再试。',
};

const TRANSPORT_STATUS: Record<TransportErrorCode, number> = {
  INVALID_BODY: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  NOT_IMPLEMENTED: 501,
  INTERNAL: 500,
};

/** `violations[].code` 的**完整**词表（内核 ∪ API 层功能规则 ∪ 传输层）：docs/api.md 的错误码表据此派生。 */
export const ALL_API_ERROR_CODES: readonly string[] = [
  ...RULE_CODES,
  ...API_RULE_CODES,
  ...TRANSPORT_ERROR_CODES,
];

export interface HttpProblem {
  status: number;
  body: ErrorResponse;
}

/**
 * 违规条目：内核码走内核状态表，**同端点上出现的其它词表**（音频码 `AUDIO_RULE_CODES`，
 * 见 `contracts/common.ts` 的 `RuleCodeSchema`）按规则违反处理 → 422。
 * 判别原则（captain 裁决 ADR-018）：**决定因素是「是否与领域码出现在同一端点」**，不是「是不是领域规则」。
 */
export interface ApiViolation {
  code: string;
  message: string;
}

const KERNEL_CODES = new Set<string>(RULE_CODES);

function statusOfViolationCode(code: string): number {
  return KERNEL_CODES.has(code) ? httpStatusOf(code as RuleCode) : 422;
}

/** 内核违规 → 错误响应；没有违规时返回 `null`（成功路径不需要映射）。 */
export function problemFromViolations(violations: readonly ApiViolation[]): HttpProblem | null {
  const first = violations[0];
  if (first === undefined) {
    return null;
  }
  const message =
    first.message.trim().length > 0
      ? first.message
      : KERNEL_CODES.has(first.code)
        ? RULE_MESSAGES[first.code as RuleCode]
        : '请求内容不合法，请检查后重试。';
  return {
    status: statusOfViolationCode(first.code),
    body: ErrorResponseSchema.parse({
      error: { message, violations: violations.map((violation) => ({ ...violation })) },
    }),
  };
}

/** 命令结果 → 错误响应：被接受（`ok`）说明没有副作用被拒，返回 `null`。 */
export function problemFromOutcome(outcome: CommandOutcome): HttpProblem | null {
  return outcome.ok ? null : problemFromViolations(outcome.violations);
}

export function transportProblem(code: TransportErrorCode): HttpProblem {
  return {
    status: TRANSPORT_STATUS[code],
    body: ErrorResponseSchema.parse({ error: { message: TRANSPORT_MESSAGES[code], violations: [] } }),
  };
}

/**
 * 5xx 固定文案：**不接受任何错误对象**。
 * 底层错误只允许进服务端日志（`request.log.error`），永不进响应体。
 */
export function internalProblem(): HttpProblem {
  return transportProblem('INTERNAL');
}

export function sendProblem(reply: FastifyReply, problem: HttpProblem): FastifyReply {
  return reply.code(problem.status).send(problem.body);
}
