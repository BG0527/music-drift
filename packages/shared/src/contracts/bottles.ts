/**
 * 漂流瓶契约（CONEXT §3/§4/§6/§15，语义以 ADR-015 为准）。
 *
 * ADR-015 的三条硬语义必须体现在契约里：
 * 1. `index` = 歌里的固定段落位置，**永不压缩**；斩浪后位置留空 → `missingSegmentIndexes` 显式暴露缺口；
 * 2. 录制的段号**由服务端 `nextRecordIndex` 决定**，请求体里**没有** index 字段（前端不得猜）；
 * 3. 有缺口也可以入海 → 公海分「已完成区 / 未完成区」（`seaZone`），前端不得把不完整作品当完整。
 */
import { z } from 'zod';
import { ErrorResponseSchema, EpochMsSchema, IsoDateTimeSchema, PageSchema, UuidSchema } from './common';

export const BottleStatusSchema = z.enum(['DRAFT', 'IN_RIVER', 'HELD', 'SEA', 'DAMAGED']);
export const ResolutionSchema = z.enum(['RIVER', 'RETURN', 'SEA']);
/** 公海分区：已完成区 / 未完成区（ADR-015 §16.4）。 */
export const SeaZoneSchema = z.enum(['COMPLETED', 'INCOMPLETE']);

export const SegmentSchema = z.object({
  id: UuidSchema,
  /** 歌里的固定段落位置；被斩的段不出现在有效段列表里，缺口由 `missingSegmentIndexes` 表达。 */
  index: z.number().int().min(1),
  ownerId: UuidSchema,
  /** 每段附言（CONTEXT §12.2）。 */
  note: z.string().max(200).nullable(),
  /** 该段在本瓶子里显示的匿名代号（不跨瓶关联，CONTEXT §12.1）。 */
  ownerCode: z.string().min(1),
  likeCount: z.number().int().nonnegative(),
  dislikeCount: z.number().int().nonnegative(),
  /** 斩浪后为 ISO 时间；对外列表不展示被斩段（不留遗迹）。 */
  deletedAt: IsoDateTimeSchema.nullable(),
  audioMime: z.string().min(1).nullable(),
  durationMs: z.number().int().positive().nullable(),
});

/**
 * 补位上下文（ADR-015 §16.5）：补位者听**缺口前一段**；
 * 「后面已有人」只给状态标志，**不暴露身份与内容**（与 CONTEXT §9.1 一致）。
 */
export const ReplacementContextSchema = z.object({
  gapIndex: z.number().int().min(1),
  listenSegmentIndex: z.number().int().min(1).nullable(),
  listenSegmentId: UuidSchema.nullable(),
  hasLaterSegments: z.boolean(),
});

export const BottleSummarySchema = z.object({
  id: UuidSchema,
  songId: UuidSchema,
  songTitle: z.string().min(1),
  status: BottleStatusSchema,
  /** 分段数来自数据，前端禁止写死 4。 */
  totalSegments: z.number().int().min(1).max(8),
  /** 已录段数（有效段）。 */
  recordedCount: z.number().int().nonnegative(),
  /** 缺口段号（升序）；空数组 = 作品完整。 */
  missingSegmentIndexes: z.array(z.number().int().min(1)),
  isComplete: z.boolean(),
  /** 仅在 `status === 'SEA'` 时有值。 */
  seaZone: SeaZoneSchema.nullable(),
  revision: z.number().int().nonnegative(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

/**
 * 漂流日志用的一行（CONTEXT §11.1「我参与过的所有漂流瓶」）。
 *
 * 语义要点（**参与过 ≠ 现在还有效**）：
 * - `role` 取自「我是发起者还是接唱者」；发起者不可能再接唱自己的瓶子（内核 `hasEverSung` 拦着），
 *   因此**没有第三种取值**，不要为不存在的状态设计 UI 分支；
 * - 判定基于事件（`SEGMENT_RECORDED` 的主动方），所以我的那一段被斩浪（ADR-015 §16.7 软删）之后
 *   **仍然算参与过**：`role` 不变，只是 `mySegmentIndexes` 里不再有它。
 */
export const MyBottleSchema = BottleSummarySchema.extend({
  role: z.enum(['INITIATOR', 'SINGER']),
  /** 我在这个瓶子里**当前有效**的段号（升序）；被斩的段不出现（缺口由 `missingSegmentIndexes` 表达）。 */
  mySegmentIndexes: z.array(z.number().int().min(1)),
  /**
   * 「**待你操作**」（W6，`CONTEXT.md` §4.2）：这支瓶子回到了我手里，且我只能选「入海」。
   *
   * 典型场景：我发起 → 别人接唱 → 作品完整地**回传**到我手里 ⇒ 界面要提示「收到回传，等你操作」。
   * 判据不在这里重写：服务端用内核 `isAwaitingMyAction`（`availableResolutions` 恰好只剩 `['SEA']`）。
   *
   * `default(false)` 是**向后兼容**（`apps/web` 用这份 schema 解析自己的测试夹具，本轮冻结不改）：
   * 缺字段 = 「没有待你操作的事」，这是安全的默认值（不确定时宁可不弹提示，也不要误报）。
   */
  awaitingMyAction: z.boolean().default(false),
});

export const MyBottleListSchema = PageSchema(MyBottleSchema);

/**
 * 公海列表响应：`PageSchema` + **可选** `total`（该 zone 的总条数）。
 *
 * 为什么只给这一个列表加 `total`：公海大厅要一次性显示全部页码，而游标分页只回
 * `nextCursor` 不回总数（`pageCount = 已取页数 + hasNextPage` 会让页码渐进出现）。
 * `total` 是**可选**的 —— 老响应/缓存里没有它时解析照常成功（向后兼容），
 * 前端缺它时回退旧口径。其它 `Page` 用法（通知、我的瓶子…）不携带此字段，不动 `PageSchema` 本身。
 */
export const SeaBottleListSchema = PageSchema(BottleSummarySchema).extend({
  total: z.number().int().nonnegative().optional(),
});

export const BottleDetailSchema = BottleSummarySchema.extend({
  initiatorCode: z.string().min(1),
  holderId: UuidSchema.nullable(),
  /** 最近一次投出者；斩浪后系统重新投河时为哨兵 `'SYSTEM'`（不是用户 id）。 */
  currentCasterId: z.string().min(1).nullable(),
  returnCompleted: z.boolean(),
  returnChainBroken: z.boolean(),
  segments: z.array(SegmentSchema),
  /** 当前观看者此刻可选的去向（顺序即展示顺序）；空数组 = 他不能选。 */
  availableResolutions: z.array(ResolutionSchema),
  /** 观看者是否持有该瓶子。 */
  isHolder: z.boolean(),
  /**
   * 因 §9.1（漂流中不可见后续）被裁掉的段数。
   *
   * 为什么要有这个字段：裁剪之后 `segments` 会比 `recordedCount` 短，
   * 界面需要能解释"**不是丢了，是你看不到**"，否则用户会以为瓶子坏了。
   * `0` = 没有裁剪（持有者 / 已入海）。
   */
  hiddenLaterSegmentCount: z.number().int().nonnegative(),
  /** 有缺口且该观看者可能补位时的上下文；无缺口或已损坏为 null。 */
  replacementContext: ReplacementContextSchema.nullable(),
  riverCastAt: IsoDateTimeSchema.nullable(),
  seaAt: IsoDateTimeSchema.nullable(),
  damagedAt: IsoDateTimeSchema.nullable(),
});

/**
 * 列表查询（**唯一**一份：`/api/sea` 直接复用它，不再维护内联 schema）。
 *
 * 游标口径：`cursor` 是**不透明字符串**，由服务端按稳定排序键
 * `(updated_at DESC, id DESC)` 生成（`encodeSeaCursor`），客户端只需原样回传；
 * 末页 `nextCursor` 为 `null`。**不要**自己拼游标，也不要把它当 offset。
 */
export const BottleListQuerySchema = z.object({
  /** 公海列表默认只看已完成区（ADR-015 §16.4）。 */
  seaZone: SeaZoneSchema.optional(),
  /**
   * @deprecated 旧名，等价于 `seaZone`：保留一段时间以免既有客户端（前端分页控件 / 金路径脚本）
   * 静默失效 —— "参数名改了但被忽略"正是本项目反复抓到的第 4 类静默损失。
   */
  zone: SeaZoneSchema.optional(),
  status: BottleStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});

/** 捞取响应：随机捞到一支，并附带补位上下文（缺口时用来提示「后面已有人」）。 */
export const DrawResponseSchema = z.object({
  bottle: BottleDetailSchema,
});

export const CreateBottleRequestSchema = z.object({
  songId: UuidSchema,
});

/**
 * 录一段接唱：**请求体没有 index** —— 段号由服务端 `nextRecordIndex` 决定（ADR-015 §16.8）。
 *
 * 传输形态（ADR-018 裁决）：音频走**原始二进制** body（`Content-Type` = 音频 MIME），
 * `durationMs` 走请求头 `x-audio-duration-ms`，附言走 `?note=`。
 * 本 schema 描述**逻辑请求**：`durationMs` **必填**（否则无法核对「每段 15–30 秒」→ fail-closed）。
 */
export const RecordSegmentRequestSchema = z.object({
  note: z.string().max(200).nullable().optional(),
  durationMs: z.number().int().min(15_000).max(30_000),
});

export const RecordSegmentResponseSchema = z.object({
  segmentId: UuidSchema,
  /** 本次录的是歌里的第几段（补位时 = 最小缺口段号）。 */
  index: z.number().int().min(1),
  /** 录完后下一段该录的段号；已完整时为 null（此时只能选去向）。 */
  nextRecordIndex: z.number().int().min(1).nullable(),
  bottle: BottleDetailSchema,
});

export const ChooseResolutionRequestSchema = z.object({
  resolution: ResolutionSchema,
});

export const PutBackResponseSchema = z.object({
  bottle: BottleSummarySchema,
  /** 放回后的打捞冷却次数（CONTEXT §15：N = 10）。 */
  cooldownDraws: z.number().int().nonnegative(),
});

/** 超时/斩浪等系统行为对客户端的提示（阶段一只要状态，不做推送）。 */
export const BottleEventsQuerySchema = z.object({
  sinceSeq: z.coerce.number().int().min(0).default(0),
});

export const BottleEventSchema = z.object({
  seq: z.number().int().min(1),
  type: z.string().min(1),
  actorId: z.string().min(1),
  /** 系统行为的时间；客户端不要本地推算时间线。 */
  occurredAt: IsoDateTimeSchema,
  occurredAtMs: EpochMsSchema,
});

export const ApiErrorSchema = ErrorResponseSchema;

export type BottleStatus = z.infer<typeof BottleStatusSchema>;
export type Resolution = z.infer<typeof ResolutionSchema>;
export type SeaZone = z.infer<typeof SeaZoneSchema>;
export type Segment = z.infer<typeof SegmentSchema>;
export type ReplacementContext = z.infer<typeof ReplacementContextSchema>;
export type BottleSummary = z.infer<typeof BottleSummarySchema>;
export type MyBottle = z.infer<typeof MyBottleSchema>;
export type MyBottleList = z.infer<typeof MyBottleListSchema>;
export type BottleDetail = z.infer<typeof BottleDetailSchema>;
export type DrawResponse = z.infer<typeof DrawResponseSchema>;
export type RecordSegmentRequest = z.infer<typeof RecordSegmentRequestSchema>;
export type RecordSegmentResponse = z.infer<typeof RecordSegmentResponseSchema>;
export type BottleEvent = z.infer<typeof BottleEventSchema>;
