/**
 * **API 层功能规则码**（叶子模块：不 import 任何 contracts 模块，避免与 `common.ts` 形成循环依赖）。
 *
 * 它们不是漂流瓶状态机转移，也不该塞进已冻结的内核（ADR-018）。
 *
 * **准入规则（captain 裁决，后续新增码一律按此审视）**：
 * 新增错误码的理由必须是「**客户端需要据此区分不同处置**」，而不是「我想给用户看一句不同的话」；
 * 后者用**通用码 + 不同 message**，不加码。
 *
 * - `COLLECTION_REQUIRES_FINISHED_WORK`：客户端应据此**禁用/隐藏收藏按钮**、作品完成后**允许**收藏
 *   —— 真正的处置差异，合格（CONTEXT §6.4）。
 */
export const API_RULE_CODES = ['COLLECTION_REQUIRES_FINISHED_WORK'] as const;

export type ApiRuleCode = (typeof API_RULE_CODES)[number];
