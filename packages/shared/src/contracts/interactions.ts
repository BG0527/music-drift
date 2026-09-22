/**
 * 互动契约：投票 / 私密留言 / 举报 / 收藏 / 通知 / 徽章（CONTEXT §5/§6/§7/§8/§10）。
 *
 * ⚠️ 已接受的行为（captain 裁决 2026-09-23，勿当 bug 修）：
 * 点赞与点踩是**两个独立的票**，同一用户可以对同一段**分别投一赞一踩**；
 * 点赞不抵消点踩、不提高斩杀阈值（§7.1），点踩照常计入斩杀阈值。
 * 与领域内核 `canCastVote`（likes / dislikes 两个独立集合）以及 DB 唯一键
 * `votes_segment_user_value_uniq (segment_id, user_id, value)` 三方一致。
 * 若日后要改成「一人一段总共只能投一票」，必须先改领域内核 → 属返工单。
 */
import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema } from './common';
export { API_RULE_CODES, type ApiRuleCode } from './error-codes';

export const VoteValueSchema = z.enum(['LIKE', 'DISLIKE']);

export const CastVoteRequestSchema = z.object({
  value: VoteValueSchema,
  /** 已播放比例 0–1：点踩必须 ≥ 0.8（CONTEXT §7.3），服务端必须校验而不是信前端。 */
  listenedRatio: z.number().min(0).max(1),
});

export const CastVoteResponseSchema = z.object({
  segmentId: UuidSchema,
  value: VoteValueSchema,
  likeCount: z.number().int().nonnegative(),
  dislikeCount: z.number().int().nonnegative(),
  /** 斩杀阈值（来自服务端策略，Demo 默认 10）。 */
  dislikeThreshold: z.number().int().positive(),
  /** 本次投票是否触发了斩浪（触发了则该段已从作品移除）。 */
  segmentCut: z.boolean(),
});

export const MessageStatusSchema = z.enum(['PENDING', 'DELIVERED', 'UNDELIVERED']);

export const AttachPrivateMessageRequestSchema = z.object({
  content: z.string().min(1).max(500),
});

export const PrivateMessageSchema = z.object({
  id: UuidSchema,
  bottleId: UuidSchema,
  /** 发送者看到的自己的留言（含未送达状态）；发起者只看已送达的。 */
  content: z.string().min(1),
  status: MessageStatusSchema,
  createdAt: IsoDateTimeSchema,
});

export const ReportTargetTypeSchema = z.enum(['BOTTLE', 'SEGMENT', 'MESSAGE']);

export const CreateReportRequestSchema = z.object({
  targetType: ReportTargetTypeSchema,
  targetId: UuidSchema,
  reason: z.string().min(1).max(500),
});

export const CollectionSchema = z.object({
  bottleId: UuidSchema,
  createdAt: IsoDateTimeSchema,
});

/** 徽章是**派生**的（ADR-014 裁决 #1：不落库，作品被撤下即消失），因此只在响应里出现。 */
export const BadgeKindSchema = z.enum(['RETURN_COMPLETED', 'DRIFT_PARTICIPANT']);

export const BadgeAwardSchema = z.object({
  userId: UuidSchema,
  kind: BadgeKindSchema,
  bottleId: UuidSchema,
  grantedAt: IsoDateTimeSchema,
});

export const NotificationSchema = z.object({
  id: UuidSchema,
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  readAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});

export type VoteValue = z.infer<typeof VoteValueSchema>;
export type CastVoteRequest = z.infer<typeof CastVoteRequestSchema>;
export type CastVoteResponse = z.infer<typeof CastVoteResponseSchema>;
export type PrivateMessage = z.infer<typeof PrivateMessageSchema>;
export type BadgeAward = z.infer<typeof BadgeAwardSchema>;
export type Notification = z.infer<typeof NotificationSchema>;
