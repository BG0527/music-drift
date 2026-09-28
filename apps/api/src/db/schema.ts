/**
 * 持久化 schema（t5 / T1.2，D-01 方案 A：单一 Postgres；音频以 bytea 存库）。
 *
 * 设计纪律（逐条对应裁决）：
 * - `total_segments` **是列**，不得硬编码 4（CONTEXT §4.3：正式版为第 3–5 段中的最后一段）。
 * - `bottles.current_caster_id` 允许哨兵 `'SYSTEM'`，因此**不加 users 外键**（ADR-015 §16.3）。
 * - `bottle_segments` 的 `(bottle_id, index)` **部分唯一索引**只覆盖有效段（`deleted_at is null`），
 *   这是「补位段占据缺口段号」的基础（ADR-015 §16.1）。
 * - `holdings` 的 `(bottle_id)` **部分唯一索引**只覆盖未释放行 —— 「同瓶同时至多一个持有者」在 DB 层直接成立。
 * - `events` 用 CHECK 静态强制「首条必须是 BOTTLE_CREATED」，不靠仓储层自觉。
 * - 状态类字段用 `text + CHECK` 而非 PG enum：enum 增删值要迁移类型，CHECK 改一行即可。
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** 音频二进制（D-02：库内 bytea）。 */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------- 账号（t6 消费）

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * **账号**（W6 正名 = `account`）：2–32 字符、非邮箱，注册/登录都只用它。
     *
     * 为什么账号不新加一列而直接复用 `handle`：**迁移越大越危险** ——
     * 这一列本来就满足「2–32 字符、非邮箱」，加列会同时带来回填、双写、旧数据兜底三件事。
     */
    handle: text('handle').notNull(),
    /**
     * 邮箱（W6 起**可空**）：账号注册的用户没有邮箱；旧的 `{handle, email, password}`
     * 注册写法仍会把邮箱存进来（迁移 0007 只 DROP NOT NULL，旧数据原样保留）。
     */
    email: text('email'),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('USER'),
    /**
     * 封禁时间（t12 审核台）：非空 = 该账号被人工封禁。
     * 保留行而不删除用户：审核动作必须可审计、可申诉（与软删段同一原则）。
     */
    bannedAt: timestamp('banned_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('users_handle_uniq').on(table.handle),
    // 唯一索引保留：PG 里多个 NULL 互不冲突，因此"没有邮箱"的账号可以有很多个。
    uniqueIndex('users_email_uniq').on(table.email),
    check('users_role_check', sql`${table.role} in ('USER', 'ADMIN')`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_uniq').on(table.tokenHash),
    index('sessions_user_idx').on(table.userId),
  ],
);

/** 同一用户在不同瓶子显示不同代号（CONTEXT §12.1）。 */
export const anonCodes = pgTable(
  'anon_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bottleId: uuid('bottle_id').notNull(),
    code: text('code').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('anon_codes_user_bottle_uniq').on(table.userId, table.bottleId),
    uniqueIndex('anon_codes_code_uniq').on(table.code),
  ],
);

// ---------------------------------------------------------------- 曲库

export const songs = pgTable(
  'songs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    /** 分段数：**列存储**，禁止硬编码 4。 */
    totalSegments: integer('total_segments').notNull(),
    licensedSource: text('licensed_source').notNull(),
    createdAt: createdAt(),
  },
  (table) => [check('songs_total_segments_check', sql`${table.totalSegments} between 1 and 8`)],
);

export const songSegments = pgTable(
  'song_segments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    songId: uuid('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade' }),
    /** 歌里的固定段落位置（1-based，永不压缩）。 */
    index: integer('index').notNull(),
    startMs: integer('start_ms').notNull(),
    durationMs: integer('duration_ms').notNull(),
    accompanimentRef: text('accompaniment_ref'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('song_segments_song_index_uniq').on(table.songId, table.index),
    check('song_segments_index_check', sql`${table.index} >= 1`),
    check('song_segments_duration_check', sql`${table.durationMs} > 0`),
  ],
);

// ---------------------------------------------------------------- 漂流瓶

export const bottles = pgTable(
  'bottles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    songId: uuid('song_id')
      .notNull()
      .references(() => songs.id),
    initiatorId: uuid('initiator_id')
      .notNull()
      .references(() => users.id),
    /** DRAFT | IN_RIVER | HELD | SEA | DAMAGED（ADR-005 状态集合）。 */
    status: text('status').notNull(),
    totalSegments: integer('total_segments').notNull(),
    /** 乐观锁版本号 = 已录制段数（内核 revision）。 */
    revision: integer('revision').notNull().default(0),
    currentHolderId: uuid('current_holder_id').references(() => users.id),
    /**
     * 最近一次投出者。**允许哨兵 `'SYSTEM'`**（斩浪后系统重新投河），
     * 因此故意**不加** users 外键（ADR-015 §16.3）。
     */
    currentCasterId: text('current_caster_id'),
    riverCastAt: timestamp('river_cast_at', { withTimezone: true }),
    seaAt: timestamp('sea_at', { withTimezone: true }),
    damagedAt: timestamp('damaged_at', { withTimezone: true }),
    returnChainBroken: boolean('return_chain_broken').notNull().default(false),
    returnCompleted: boolean('return_completed').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'bottles_status_check',
      sql`${table.status} in ('DRAFT', 'IN_RIVER', 'HELD', 'SEA', 'DAMAGED')`,
    ),
    check('bottles_total_segments_check', sql`${table.totalSegments} >= 1`),
    check('bottles_revision_check', sql`${table.revision} >= 0`),
    index('bottles_status_idx').on(table.status),
    index('bottles_initiator_idx').on(table.initiatorId),
  ],
);

export const bottleSegments = pgTable(
  'bottle_segments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bottleId: uuid('bottle_id')
      .notNull()
      .references(() => bottles.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    /** 歌里的固定段落位置；斩浪只软删、位置留空（ADR-015 §16.1）。 */
    index: integer('index').notNull(),
    note: text('note'),
    /** 音频本体（D-02：bytea 存库；阶段一为纯人声）。 */
    audio: bytea('audio'),
    audioMime: text('audio_mime'),
    durationMs: integer('duration_ms'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    // 「补位段占据缺口段号」的基础：同一段号同时至多一个**有效**段。
    uniqueIndex('bottle_segments_active_index_uniq')
      .on(table.bottleId, table.index)
      .where(sql`${table.deletedAt} is null`),
    check('bottle_segments_index_check', sql`${table.index} >= 1`),
    index('bottle_segments_bottle_idx').on(table.bottleId),
    index('bottle_segments_owner_idx').on(table.ownerId),
  ],
);

/** 当前持有者（并发抢占原语，见 holdings.ts）。 */
export const holdings = pgTable(
  'holdings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bottleId: uuid('bottle_id')
      .notNull()
      .references(() => bottles.id, { onDelete: 'cascade' }),
    holderId: uuid('holder_id')
      .notNull()
      .references(() => users.id),
    /** 缺口前一段的作者或投出者；发起者的一棒为 null。 */
    parentId: uuid('parent_id').references(() => users.id),
    origin: text('origin').notNull(),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull(),
    /** null = 仍持有；非 null = 已释放（部分唯一索引只看 null 行）。 */
    releasedAt: timestamp('released_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('holdings_active_bottle_uniq')
      .on(table.bottleId)
      .where(sql`${table.releasedAt} is null`),
    check('holdings_origin_check', sql`${table.origin} in ('DRAW', 'RETURN', 'REWIND')`),
    index('holdings_holder_idx').on(table.holderId),
  ],
);

// ---------------------------------------------------------------- 互动

export const votes = pgTable(
  'votes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    segmentId: uuid('segment_id')
      .notNull()
      .references(() => bottleSegments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    value: text('value').notNull(),
    /** 点踩门槛：必须听满 80%（CONTEXT §7.3）。 */
    listenedRatio: numeric('listened_ratio', { precision: 4, scale: 3 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    /**
     * ⚠️ 已接受的行为（captain 裁决 2026-09-23，勿当 bug 修）：唯一键是
     * `(segment_id, user_id, value)`，因此**同一用户可以对同一段分别投一赞一踩**。
     * 与领域内核 `canCastVote`（likes/dislikes 两个独立集合）一致；
     * 点赞不抵消点踩、不提高阈值（CONTEXT §7.1），点踩仍照常计入斩杀阈值。
     * 若日后要改成「一人一段总共一票」，必须先改领域内核，属返工单而非本表事务。
     */
    uniqueIndex('votes_segment_user_value_uniq').on(table.segmentId, table.userId, table.value),
    check('votes_value_check', sql`${table.value} in ('LIKE', 'DISLIKE')`),
    check('votes_listened_ratio_check', sql`${table.listenedRatio} between 0 and 1`),
  ],
);

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id),
    reason: text('reason').notNull(),
    /** PENDING | REVIEWED（人工审核为最终决定权，CONTEXT §8）。 */
    status: text('status').notNull().default('PENDING'),
    /** NONE | REMOVE_SEGMENT | REMOVE_BOTTLE | BAN_USER（审核结论，t12 落地）。 */
    action: text('action'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    check(
      'reports_target_type_check',
      sql`${table.targetType} in ('BOTTLE', 'SEGMENT', 'MESSAGE')`,
    ),
    check('reports_status_check', sql`${table.status} in ('PENDING', 'REVIEWED')`),
    check(
      'reports_action_check',
      // `RESTORE_SEGMENT`（t12）：审核台必须能**覆盖自动斩杀** —— 只列"删"的动作会让
      // 「人工恢复」在 DB 层就被拒绝（本仓真实踩过：裁决时报 reports_action_check 违规）。
      sql`${table.action} is null or ${table.action} in ('NONE', 'REMOVE_SEGMENT', 'RESTORE_SEGMENT', 'REMOVE_BOTTLE', 'BAN_USER')`,
    ),
    index('reports_status_idx').on(table.status),
  ],
);

/** 点对点私密留言（CONTEXT §5）：只有发起者最终能看到，中间传递者不知情。 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bottleId: uuid('bottle_id')
      .notNull()
      .references(() => bottles.id, { onDelete: 'cascade' }),
    fromUserId: uuid('from_user_id')
      .notNull()
      .references(() => users.id),
    toUserId: uuid('to_user_id')
      .notNull()
      .references(() => users.id),
    content: text('content').notNull(),
    /** PENDING | DELIVERED | UNDELIVERED（§5.2 未送达处理）。 */
    status: text('status').notNull().default('PENDING'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    check('messages_status_check', sql`${table.status} in ('PENDING', 'DELIVERED', 'UNDELIVERED')`),
    index('messages_bottle_idx').on(table.bottleId),
    index('messages_to_user_idx').on(table.toUserId),
  ],
);

/**
 * 已听覆盖率（t20）：每个 (user, segment) 一行，**只增不减**（服务端取历史最大值）。
 *
 * 为什么落库而不是进程内缓存：用户诉求是"听过 80% 要记录，别每次退出就清零"，
 * 因此进度必须跨会话/跨重启存活；判定权也必须在服务端（客户端上报只是增量输入）。
 *
 * 覆盖率的**语义**不在这里：区间并集、拖动不计、循环不叠加、时长不可信→0 全部复用
 * `packages/shared/src/audio/listening.ts`；本表只存 `covered_ms` 与权威 `duration_ms`。
 */
export const listenProgress = pgTable(
  'listen_progress',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    segmentId: uuid('segment_id')
      .notNull()
      .references(() => bottleSegments.id, { onDelete: 'cascade' }),
    /** 已覆盖的音频区间并集长度（ms）。 */
    coveredMs: integer('covered_ms').notNull(),
    /** 记录时的段时长（来自 `bottle_segments.duration_ms`，不采信请求体）。 */
    durationMs: integer('duration_ms').notNull(),
    /** 最后一次上报时间：增长限速（"不可能一小时内容 5 秒听完"）按它与当前时间的差计算。 */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.segmentId] }),
    check('listen_progress_ms_check', sql`${table.coveredMs} >= 0 and ${table.durationMs} >= 0`),
  ],
);

/** 收藏：仅限已完成公海作品，私人可见（CONTEXT §6.4）。 */
export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bottleId: uuid('bottle_id')
      .notNull()
      .references(() => bottles.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('collections_user_bottle_uniq').on(table.userId, table.bottleId)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index('notifications_user_idx').on(table.userId, table.createdAt)],
);

/**
 * 河道状态（每个用户一行）：回河道后的「接下来 N 次打捞不再给同一用户」（CONTEXT §15，N=10）。
 * 规则在内核（`RiverState` 纯函数），这里只存它的状态 —— 单用户单行，避免为 Demo 引入计数服务。
 */
export const riverState = pgTable('river_state', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** 该用户已发起的打捞尝试次数（冷却计数的基准）。 */
  ordinal: integer('ordinal').notNull().default(0),
  /** 冷却条目（`DrawExclusion[]`）。 */
  exclusions: jsonb('exclusions')
    .notNull()
    .default(sql`'[]'::jsonb`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 事件日志：漂流日志与状态重放的唯一来源（ADR-005 不变式 3）。
 * 注意**没有 badges 表**：ADR-014 裁决 #1 明确「徽章保持派生、不落库」，优先于 t5 任务书的旧清单。
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bottleId: uuid('bottle_id')
      .notNull()
      .references(() => bottles.id, { onDelete: 'cascade' }),
    /** 瓶子内单调序号（1-based）；seq=1 被 CHECK 强制为 BOTTLE_CREATED。 */
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    /** 主动方；系统行为为哨兵 `'SYSTEM'` → 故意不加外键。 */
    actorId: text('actor_id').notNull(),
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    // 首条必须是 BOTTLE_CREATED：静态强制，不靠仓储层自觉（replayBottle 依赖它）。
    check('events_first_event_check', sql`seq > 1 or type = 'BOTTLE_CREATED'`),
    check('events_seq_check', sql`${table.seq} >= 1`),
    uniqueIndex('events_bottle_seq_uniq').on(table.bottleId, table.seq),
    index('events_bottle_occurred_idx').on(table.bottleId, table.occurredAt),
  ],
);
