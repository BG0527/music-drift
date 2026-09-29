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
export const API_RULE_CODES = [
  'COLLECTION_REQUIRES_FINISHED_WORK',
  /** 创建事务锁瓶后发现作品已离海：客户端保留草稿并提示未发布。 */
  'COMMENT_BOTTLE_LEFT_SEA',
  /**
   * 同一条举报已被裁决过、且这次裁决与上次**不同**（t12）。
   *
   * 准入理由：客户端必须据此**刷新队列**（而不是重试）—— 与"重复提交"是两回事，
   * 所以不能只靠 message 区分。**相同**裁决是幂等的（不报错），只有"改主意"才拒绝。
   */
  'REPORT_ALREADY_REVIEWED',
  /**
   * 裁决动作与举报对象类型不匹配（t12）：例如对"瓶子"的举报选了「删段」。
   *
   * 准入理由：客户端要据此**改选动作/禁用按钮**（拉取对象类型后再启用），
   * 与「参数结构错误」（400）不是同一类问题。
   */
  'REVIEW_ACTION_NOT_APPLICABLE',
  /**
   * 已听覆盖率不足，不能点踩（t20）。
   *
   * 准入理由：客户端要据此**弹出「需要听满 80%」的提醒**（并展示服务端记账的进度），
   * 与「参数结构错误」（400）、「不是持有者」（409）不是同一类处置；
   * 且阈值来自内核策略（`DEFAULT_POLICY.dislikeListenRatioThreshold`），文案里的百分比随策略生成。
   */
  'LISTEN_THRESHOLD_NOT_REACHED',
] as const;

export type ApiRuleCode = (typeof API_RULE_CODES)[number];
