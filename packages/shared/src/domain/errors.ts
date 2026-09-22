/**
 * 规则违规的稳定错误码（ADR-004 / ADR-005）。
 *
 * 守卫一律返回 `RuleViolation[]`，**不抛异常、不返回裸布尔**；
 * `RULE_HTTP_STATUS` 给出 API 层的默认映射（409 = 并发/状态冲突，422 = 规则违反）。
 * 码给程序判断，`RULE_MESSAGES` 的中文文案给用户（码与文案分离）。
 */
export const RULE_CODES = [
  'NOT_INITIATOR',
  'NOT_HOLDER',
  'HOLDING_ALREADY_TAKEN',
  'BOTTLE_NOT_IN_RIVER',
  'BOTTLE_DAMAGED',
  'BOTTLE_ALREADY_COMPLETE',
  'RESOLUTION_NOT_AVAILABLE',
  'CANNOT_RECORD_TWICE_IN_BOTTLE',
  'SEGMENT_NOT_FOUND',
  'SEGMENT_ALREADY_CUT',
  'CANNOT_DRAW_OWN_BOTTLE',
  'ALREADY_SANG_IN_BOTTLE',
  'DRAW_COOLDOWN_ACTIVE',
  'NO_BOTTLE_AVAILABLE',
  'DISLIKE_ALREADY_CAST',
  'LIKE_ALREADY_CAST',
  'CANNOT_DISLIKE_OWN_SEGMENT',
  'LISTEN_RATIO_TOO_LOW',
  'MESSAGE_SENDER_NOT_PARTICIPANT',
  'MESSAGE_CONTENT_EMPTY',
  'MESSAGE_BOTTLE_NOT_DRIFTING',
] as const;

export type RuleCode = (typeof RULE_CODES)[number];

export interface RuleViolation {
  code: RuleCode;
  message: string;
}

export const RULE_MESSAGES: Record<RuleCode, string> = {
  NOT_INITIATOR: '只有发起者能录制第一段。',
  NOT_HOLDER: '你现在没有持有这个漂流瓶，无法执行该操作。',
  HOLDING_ALREADY_TAKEN: '这个漂流瓶已经被别人拿走了，换一个吧。',
  BOTTLE_NOT_IN_RIVER: '这个漂流瓶当前不在河道里。',
  BOTTLE_DAMAGED: '这个作品已损坏，不再继续漂流。',
  BOTTLE_ALREADY_COMPLETE: '这个作品已经录满了，请选择去向。',
  RESOLUTION_NOT_AVAILABLE: '当前阶段不能选择这个去向。',
  CANNOT_RECORD_TWICE_IN_BOTTLE: '同一个漂流瓶里不能接唱两次。',
  SEGMENT_NOT_FOUND: '找不到这一段。',
  SEGMENT_ALREADY_CUT: '这一段已经被斩浪删除了。',
  CANNOT_DRAW_OWN_BOTTLE: '不能接自己投出的瓶子。',
  ALREADY_SANG_IN_BOTTLE: '你参与过的瓶子不会再漂回你手上。',
  DRAW_COOLDOWN_ACTIVE: '你刚放回了这个瓶子，短时间内不会再捞到它。',
  NO_BOTTLE_AVAILABLE: '河道里暂时没有可以捞的瓶子。',
  DISLIKE_ALREADY_CAST: '同一段只能踩一次。',
  LIKE_ALREADY_CAST: '同一段只能点一次赞。',
  CANNOT_DISLIKE_OWN_SEGMENT: '不能踩自己的段。',
  LISTEN_RATIO_TOO_LOW: '听满 80% 才能点踩。',
  MESSAGE_SENDER_NOT_PARTICIPANT: '只有接唱者能给发起者留私密留言。',
  MESSAGE_CONTENT_EMPTY: '留言内容不能为空。',
  MESSAGE_BOTTLE_NOT_DRIFTING: '这个瓶子已经不再漂流，留言无法送达。',
};

/** 冲突类（409）与规则类（422）的默认映射。 */
export const RULE_HTTP_STATUS: Record<RuleCode, 409 | 422> = {
  NOT_INITIATOR: 422,
  NOT_HOLDER: 409,
  HOLDING_ALREADY_TAKEN: 409,
  BOTTLE_NOT_IN_RIVER: 409,
  BOTTLE_DAMAGED: 422,
  BOTTLE_ALREADY_COMPLETE: 422,
  RESOLUTION_NOT_AVAILABLE: 422,
  CANNOT_RECORD_TWICE_IN_BOTTLE: 422,
  SEGMENT_NOT_FOUND: 422,
  SEGMENT_ALREADY_CUT: 422,
  CANNOT_DRAW_OWN_BOTTLE: 422,
  ALREADY_SANG_IN_BOTTLE: 422,
  DRAW_COOLDOWN_ACTIVE: 422,
  NO_BOTTLE_AVAILABLE: 409,
  DISLIKE_ALREADY_CAST: 422,
  LIKE_ALREADY_CAST: 422,
  CANNOT_DISLIKE_OWN_SEGMENT: 422,
  LISTEN_RATIO_TOO_LOW: 422,
  MESSAGE_SENDER_NOT_PARTICIPANT: 422,
  MESSAGE_CONTENT_EMPTY: 422,
  MESSAGE_BOTTLE_NOT_DRIFTING: 422,
};

export function violation(code: RuleCode, message?: string | undefined): RuleViolation {
  return { code, message: message ?? RULE_MESSAGES[code] };
}

export function httpStatusOf(code: RuleCode): 409 | 422 {
  return RULE_HTTP_STATUS[code];
}
