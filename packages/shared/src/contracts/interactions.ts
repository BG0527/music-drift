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
  /**
   * @deprecated t20：服务端**不再采信**这个字段。
   *
   * 点踩门槛改为读**服务端持久化**的已听覆盖率（`POST /api/segments/:id/listen`），
   * 因此这里传什么都不影响判定（传 1 也点不了踩）。保留为**可选**只为向后兼容：
   * 旧客户端仍会发它，新客户端可以不带。
   */
  listenedRatio: z.number().min(0).max(1).optional(),
});

/**
 * 已听覆盖率上报（t20）：**增量输入**，判定权在服务端。
 *
 * 只带 `coveredMs`（客户端 `ListenTracker` 算出的"听过区间并集长度"）：
 * **时长以服务端段行为准**（`bottle_segments.duration_ms`，上传时校验写入）——
 * 若采信请求体里的时长，伪造 `{coveredMs: X, durationMs: X}` 就是 100%。
 */
export const SubmitListenProgressRequestSchema = z.object({
  coveredMs: z.number().int().nonnegative(),
});

export const ListenProgressResponseSchema = z.object({
  segmentId: UuidSchema,
  /** 服务端当前记账的覆盖时长（只增不减：历史最大值）。 */
  coveredMs: z.number().int().nonnegative(),
  /** 段时长（服务端权威值）；缺失/不可信时为 0。 */
  durationMs: z.number().int().nonnegative(),
  /** 覆盖率 0..1（`shared/audio` 的 `listenedRatio`：时长不可信 → 0）。 */
  ratio: z.number().min(0).max(1),
  /** 点踩门槛（来自内核策略，不写死）。 */
  threshold: z.number().min(0).max(1),
  /** 服务端认为是否已达门槛（前端据此提示"还需再听一会儿"）。 */
  reachedThreshold: z.boolean(),
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
  /** 服务端记账的已听覆盖率（本次点踩的判定依据；前端可据此显示进度）。 */
  listenedRatio: z.number().min(0).max(1),
});

export const MessageStatusSchema = z.enum(['PENDING', 'DELIVERED', 'UNDELIVERED']);

export const AttachPrivateMessageRequestSchema = z.object({
  content: z.string().min(1).max(500),
  /**
   * 目标段号（**1-based，与 `Segment.index` 同语义**）：收件人 = 该段的作者。
   *
   * 为什么用段号而不是 `toUserId`：
   * 1. **不信任前端送来的身份** —— 谁是谁由服务端按 `(bottleId, index)` 解析；
   * 2. 「之前各段的作者」本身就是**位置语言**，前端列表里展示的也是"第 N 段 · 匿名代号"。
   *
   * 服务端校验：该段必须**存在且有效**（隐含 `index < nextRecordIndex`），且作者 ≠ 发送者；
   * 不满足 → `422 MESSAGE_TARGET_NOT_AVAILABLE`。
   */
  targetSegmentIndex: z.number().int().min(1),
});

export const PrivateMessageIdentitySchema = z.object({
  /** 该用户在当前瓶中的段号（1-based）。 */
  segmentIndex: z.number().int().min(1),
  /** 服务端按留言状态与查看者投影：瓶内匿名代号，或送达后的账号名。 */
  displayName: z.string().min(1),
  /** `true` 表示 displayName 已揭晓为账号名；前端不得自行推断。 */
  revealed: z.boolean(),
});

export const PrivateMessageSchema = z.object({
  id: UuidSchema,
  bottleId: UuidSchema,
  /** 可见性由服务端定：**只有目标**（已送达）与**发送者**（含未送达）拿得到内容。 */
  content: z.string().min(1),
  status: MessageStatusSchema,
  /** 我选的目标段号（发送者用它渲染"给第 N 段的作者"；目标用它认出这是给自己的）。 */
  targetSegmentIndex: z.number().int().min(1),
  sender: PrivateMessageIdentitySchema,
  recipient: PrivateMessageIdentitySchema,
  createdAt: IsoDateTimeSchema,
});

export const PublicCommentContentSchema = z
  .string()
  .transform((content) => content.trim())
  .pipe(
    z
      .string()
      .min(1)
      .refine((content) => [...content].length <= 200, '评论最多 200 个 Unicode 字符'),
  );

export const CreatePublicCommentRequestSchema = z
  .object({ content: PublicCommentContentSchema })
  .strict();

export const PublicCommentSchema = z.object({
  id: UuidSchema,
  bottleId: UuidSchema,
  content: z.string().min(1),
  authorAccount: z.string().min(1).max(32),
  isMine: z.boolean(),
  createdAt: IsoDateTimeSchema,
});

export const PublicCommentPageSchema = z.object({
  items: z.array(PublicCommentSchema).max(20),
  nextCursor: z.string().min(1).nullable(),
});

export const AdminCommentEvidenceSchema = z.object({
  content: z.string().min(1),
  authorAccount: z.string().min(1).max(32),
  deletedAt: IsoDateTimeSchema.nullable(),
});

export const ReportTargetTypeSchema = z.enum(['BOTTLE', 'SEGMENT', 'MESSAGE', 'COMMENT']);

export const ReportStatusSchema = z.enum(['PENDING', 'REVIEWED']);

/**
 * 审核结论（t12）。`NONE` = 驳回（不处置）；其余是人类管理员的显式动作。
 *
 * `RESTORE_SEGMENT` 是这条设计的关键：自动斩杀（10 踩）是**自动**动作，
 * 人工审核必须能**覆盖**它 —— 否则审核台就只有"删"、没有"恢复"，
 * 表现为"驳回一条举报"却无法把已被误斩的段还回去。
 */
export const ReportActionSchema = z.enum([
  'NONE',
  'REMOVE_SEGMENT',
  'RESTORE_SEGMENT',
  'REMOVE_BOTTLE',
  'REMOVE_COMMENT',
  'BAN_USER',
]);

export const ReportSchema = z.object({
  id: UuidSchema,
  targetType: ReportTargetTypeSchema,
  targetId: UuidSchema,
  reason: z.string().min(1),
  status: ReportStatusSchema,
  /** 裁决结论；`PENDING` 时为 null。 */
  action: ReportActionSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  reviewedAt: IsoDateTimeSchema.nullable(),
  /** COMMENT 举报的审核证据；普通举报省略。软删后仍保留正文与作者账号。 */
  commentEvidence: AdminCommentEvidenceSchema.nullable().optional(),
});

/** 裁决请求：`decision` 就是"要实施的结论"（驳回 = `NONE`）。 */
export const ReviewDecisionRequestSchema = z.object({
  decision: ReportActionSchema,
  /** 审核备注（可选，只进审计，不影响行为）。 */
  note: z.string().max(500).optional(),
});

export const CreateReportRequestSchema = z.object({
  targetType: ReportTargetTypeSchema,
  targetId: UuidSchema,
  reason: z.string().min(1).max(500),
});

export const CollectionSchema = z.object({
  bottleId: UuidSchema,
  createdAt: IsoDateTimeSchema,
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
export type SubmitListenProgressRequest = z.infer<typeof SubmitListenProgressRequestSchema>;
export type ListenProgressResponse = z.infer<typeof ListenProgressResponseSchema>;
export type CastVoteResponse = z.infer<typeof CastVoteResponseSchema>;
export type PrivateMessage = z.infer<typeof PrivateMessageSchema>;
export type PublicComment = z.infer<typeof PublicCommentSchema>;
export type PublicCommentPage = z.infer<typeof PublicCommentPageSchema>;
export type ReportStatus = z.infer<typeof ReportStatusSchema>;
export type ReportAction = z.infer<typeof ReportActionSchema>;
export type Report = z.infer<typeof ReportSchema>;
export type ReviewDecisionRequest = z.infer<typeof ReviewDecisionRequestSchema>;
export type Notification = z.infer<typeof NotificationSchema>;
