/**
 * 漂流瓶仓储（t9）：把**内核事件流**投影到 t5 的表上，并读回来重放成内核状态。
 *
 * 单一真相：规则状态由 `events` 表的**事件流**重放得到（ADR-005 不变式 3）；
 * `bottles` / `bottle_segments` / `holdings` / `votes` / `messages` 都是**投影**（供查询与音频存取）。
 * 每条命令的投影在一个事务里完成：事件流 + 投影 + 持有者锁要么全成、要么全不成。
 *
 * 路由层不写 SQL：它只调内核命令 + 本仓储。时间一律来自注入时钟。
 */
import {
  createBottle as createBottleCommand,
  drawBottle,
  participants,
  replayBottle,
  resolveDrawParent,
  seaZoneOf,
  type BottleState,
  type CommandOutcome,
  type DomainContext,
} from '@music-drift/shared/domain';
import type { Db, Queryable } from '../db/client.js';
import { appendDomainEvent, readDomainEvents } from '../db/events.js';
import { activeHoldingOf, applyDomainEventToHoldings, claimHolding } from '../db/holdings.js';
import { insertBottleSegment } from '../db/segments.js';
import { MESSAGE_STATE_EVENTS, projectNotifications } from './notifications.js';

/**
 * 候选超取倍数（`listParticipatedBottles` 与 `listSeaBottles` 共用）：候选里含被内核判定筛掉的行，
 * 不多取就会**静默少给**几行（契约说返回 limit 以内，但少给是静默损失）。
 */
const CANDIDATE_OVERFETCH = 3;

/** 公海列表的游标位置：稳定排序键 `(updated_at, id)` 上的一行。 */
export interface SeaCursorPosition {
  updatedAtMs: number;
  id: string;
}

/** 游标编码（base64url）——对客户端**不透明**，只要求原样回传。 */
export function encodeSeaCursor(position: SeaCursorPosition): string {
  return Buffer.from(position.updatedAtMs + ':' + position.id, 'utf8').toString('base64url');
}

/**
 * 游标解码；**畸形一律返回 null**（调用方据此回 400）。
 * 之所以不接受"解不开就当没给"：那会让客户端以为在翻页、实际每次拿到的都是第一页（静默损失）。
 */
export function decodeSeaCursor(raw: string): SeaCursorPosition | null {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const separator = decoded.indexOf(':');
  if (separator <= 0) {
    return null;
  }
  const updatedAtMs = Number(decoded.slice(0, separator));
  const id = decoded.slice(separator + 1);
  if (!Number.isSafeInteger(updatedAtMs) || updatedAtMs <= 0) {
    return null;
  }
  // id 必须是 uuid（否则是伪造/串台游标，直接拒绝而不是让它静默变成"从头开始"）
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  return { updatedAtMs, id };
}

export interface BottleRow {
  id: string;
  songId: string;
  initiatorId: string;
  status: string;
  totalSegments: number;
  revision: number;
  currentHolderId: string | null;
  currentCasterId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SongRow {
  id: string;
  title: string;
  totalSegments: number;
  licensedSource: string;
  segments: Array<{ id: string; index: number; startMs: number; durationMs: number }>;
}

export interface BottleSegmentRow {
  id: string;
  index: number;
  ownerId: string;
  note: string | null;
  audioMime: string | null;
  durationMs: number | null;
  createdAt: Date;
}

export interface ApplyExtras {
  /** `VOTE_CAST` 事件不带听满比例（内核只判是否达标），投影时由调用方补上。 */
  vote?: { listenedRatio: number };
  /** `SEGMENT_RECORDED` 的音频元数据（音频本体由 T2.1 的上传端点写入）。 */
  segment?: { audio?: Buffer | null; audioMime?: string | null; durationMs?: number | null };
}

interface BottleDbRow {
  id: string;
  song_id: string;
  initiator_id: string;
  status: string;
  total_segments: number;
  revision: number;
  current_holder_id: string | null;
  current_caster_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const BOTTLE_SELECT = `select id, song_id, initiator_id, status, total_segments, revision,
  current_holder_id, current_caster_id, created_at, updated_at from bottles`;

function toBottleRow(row: BottleDbRow): BottleRow {
  return {
    id: row.id,
    songId: row.song_id,
    initiatorId: row.initiator_id,
    status: row.status,
    totalSegments: row.total_segments,
    revision: row.revision,
    currentHolderId: row.current_holder_id,
    currentCasterId: row.current_caster_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface BottleStore {
  findBottle(bottleId: string): Promise<BottleRow | null>;
  /** 事件流重放出的内核状态（不存在返回 null）。 */
  loadState(bottleId: string): Promise<BottleState | null>;
  createBottle(input: {
    bottleId: string;
    songId: string;
    initiatorId: string;
    ctx: DomainContext;
  }): Promise<BottleRow | null>;
  /** 把命令产出的事件投影进库（事务内）；被拒的命令零副作用。 */
  applyOutcome(bottleId: string, outcome: CommandOutcome, extras?: ApplyExtras): Promise<void>;
  /** 捞取：内核守卫先说话，再原子抢占持有者锁；锁被抢走 → 零副作用返回 409 语义。 */
  drawFromRiver(input: {
    bottleId: string;
    userId: string;
    ctx: DomainContext;
  }): Promise<CommandOutcome | null>;
  releaseHolding(bottleId: string, holderId: string, at: Date): Promise<number>;
  listSongs(): Promise<SongRow[]>;
  /**
   * 公海列表（**真游标分页**，§46.2）。
   *
   * 排序键 = `(updated_at DESC, id DESC)`（`id` 是稳定的次序决胜，避免同一毫秒并列时顺序漂移）：
   * - 键集分页（`(updated_at, id) < (游标)`），**不是 offset** —— 遍历期间插入的新行排在游标之前，
   *   既不会让后续页重复，也不会挤掉尚未取到的旧行；
   * - `zone` 的判定**由内核给**（`seaZoneOf`），SQL 里的分区子查询只当**候选预筛**；
   * - 返回 `nextCursor`：**只有确实还有下一行时**才非 null（因此"某页不满 limit 却仍有下一页"在实现上不可能出现）。
   */
  listSeaBottles(input: {
    zone: 'COMPLETED' | 'INCOMPLETE' | null;
    status?: string | null;
    limit: number;
    after?: SeaCursorPosition | undefined;
  }): Promise<{ rows: BottleRow[]; nextCursor: string | null }>;
  /**
   * 我参与过的瓶子（CONTEXT §11.1 漂流日志）：判定 = **我在该瓶有有效段**（内核 `participatedIn`，§46.1）。
   *
   * 用户裁决第九轮推翻了"发起者豁免"：**被斩浪的段作者（含发起者）一律不算参与过**。
   * 这里刻意只把 `events` 当**候选**（我录过段的瓶子），判定交给内核 —— 事件流会留下"录过但后来被斩"的痕迹，
   * 那正是必须被筛掉的情形。排序按最近活跃倒序。
   */
  listParticipatedBottles(input: { userId: string; limit: number }): Promise<BottleRow[]>;
  listBottleSegments(bottleId: string): Promise<BottleSegmentRow[]>;
  liveSegmentIndexes(bottleId: string): Promise<number[]>;
  activeHolding(
    bottleId: string,
  ): Promise<{ holderId: string; parentId: string | null; origin: string } | null>;
  /**
   * 指定接唱未完成作品（CONTEXT §6.2）：把公海未完成作品交给指定的人接下一段。
   *
   * 内核冻结，没有对应命令 —— 这里用**内核已有事件词汇**表达同一状态转移：
   * 追加一条 `BOTTLE_DRAWN`（父节点 = 该作品**最后一段的接唱者**，正是 §6.2 原文规定），
   * 并原子抢占持有者锁。状态仍由事件流重放得到，规则不在路由里。
   */
  takeTargetedSegment(input: {
    bottleId: string;
    userId: string;
    ctx: DomainContext;
  }): Promise<CommandOutcome | null>;
}

/**
 * 「参与过」的**唯一判定**（用户裁决 §46.1：被斩浪的段作者 —— **含发起者** —— 一律不算参与过）。
 *
 * 规则不在本文件里重写，而是**直接用内核的 `participants(state)`**
 *（`packages/shared/src/domain/queries.ts`）：它从 `liveSegments` 取，被斩段（软删）的作者自然不在其中。
 *
 * ⚠️ 与 §16.7「防捣乱」是**两个维度**，别混：
 * - §16.7：被斩者**今后**不得再参与该瓶（`canRecordSegment` / `canDrawBottle` 故意查 `state.segments`，**含软删行**）；
 * - §46.1（本函数）：那**一次**参与不算数（只看**有效段**）。
 * 把 §16.7 改成只看有效段会让防捣乱静默失效（被斩者又能接唱/捞到同一支瓶），因此禁止。
 */
export function participatedIn(state: BottleState, userId: string): boolean {
  return participants(state).some((record) => record.userId === userId);
}

/** 事件 → 段/票/留言投影（这些表是「查询与媒体」视图，不参与规则判定）。 */
async function projectMedia(
  tx: Queryable,
  event: Record<string, unknown>,
  extras: ApplyExtras,
): Promise<void> {
  const type = String(event['type']);
  const stamp = new Date(Number(event['at']));
  const bottleId = String(event['bottleId']);
  const actorId = String(event['actorId']);

  switch (type) {
    case 'SEGMENT_RECORDED':
      await insertBottleSegment(tx, {
        id: String(event['segmentId']),
        bottleId,
        ownerId: actorId,
        index: Number(event['index']),
        note: (event['note'] as string | null) ?? null,
        audio: extras.segment?.audio ?? null,
        audioMime: extras.segment?.audioMime ?? null,
        durationMs: extras.segment?.durationMs ?? null,
        createdAt: stamp,
      });
      await tx.query(`update bottles set revision = revision + 1, updated_at = $2 where id = $1`, [
        bottleId,
        stamp,
      ]);
      return;
    case 'SEGMENT_CUT':
      await tx.query(
        `update bottle_segments set deleted_at = $2 where id = $1 and deleted_at is null`,
        [String(event['segmentId']), stamp],
      );
      return;
    case 'VOTE_CAST': {
      /**
       * 审计字段**不允许有默认值**（t24/F4，评审 low）：缺失时原来的 `?? 1` 会把 `votes.listened_ratio`
       * 静默写成 100% —— 一个让"没有数据"看起来"满分"的方向错误，而这类假正面证据会一路污染统计与评审。
       * 这里改为**响亮失败**：宁可抛错，也不写假数据（`VOTE_CAST` 事件本身不带比例，只能由调用方传）。
       */
      const listenedRatio = extras.vote?.listenedRatio;
      if (listenedRatio === undefined) {
        throw new Error('VOTE_CAST 投影缺少 extras.vote.listenedRatio：审计字段不允许猜（fail-closed）');
      }
      await tx.query(
        `insert into votes (id, segment_id, user_id, value, listened_ratio, created_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5)
         on conflict (segment_id, user_id, value) do nothing`,
        [String(event['segmentId']), actorId, String(event['value']), listenedRatio, stamp],
      );
      return;
    }
    case 'MESSAGE_ATTACHED':
      await tx.query(
        `insert into messages (id, bottle_id, from_user_id, to_user_id, content, status, created_at)
         values ($1, $2, $3, $4, $5, 'PENDING', $6)`,
        [
          String(event['messageId']),
          bottleId,
          actorId,
          String(event['toUserId']),
          String(event['content']),
          stamp,
        ],
      );
      return;
    default:
      return;
  }
}

/** 事件 → bottles 行投影（状态/持有者/时间线；规则判定仍以事件流重放为准）。 */
async function projectBottleRow(tx: Queryable, event: Record<string, unknown>): Promise<void> {
  const type = String(event['type']);
  const bottleId = String(event['bottleId']);
  const actorId = String(event['actorId']);
  const stamp = new Date(Number(event['at']));

  switch (type) {
    case 'BOTTLE_CAST_TO_RIVER':
      await tx.query(
        `update bottles set status = 'IN_RIVER', current_holder_id = null, current_caster_id = $2,
           river_cast_at = $3, sea_at = null, updated_at = $3 where id = $1`,
        [bottleId, actorId, stamp],
      );
      return;
    case 'BOTTLE_PUT_BACK':
      await tx.query(
        `update bottles set status = 'IN_RIVER', current_holder_id = null, river_cast_at = $2, updated_at = $2 where id = $1`,
        [bottleId, stamp],
      );
      return;
    case 'BOTTLE_DRAWN':
      await tx.query(
        `update bottles set status = 'HELD', current_holder_id = $2, updated_at = $3 where id = $1`,
        [bottleId, actorId, stamp],
      );
      return;
    case 'BOTTLE_RETURNED':
      await tx.query(
        `update bottles set status = 'HELD', current_holder_id = $2, updated_at = $3 where id = $1`,
        [bottleId, String(event['toUserId']), stamp],
      );
      return;
    case 'BOTTLE_REWOUND':
      await tx.query(
        `update bottles set status = $2, current_holder_id = $3, current_caster_id = 'SYSTEM', sea_at = null,
           updated_at = $4 where id = $1`,
        [bottleId, String(event['targetStatus']), String(event['toUserId']), stamp],
      );
      return;
    case 'BOTTLE_GAP_OPENED':
      await tx.query(
        `update bottles set status = 'IN_RIVER', current_holder_id = null, current_caster_id = 'SYSTEM',
           river_cast_at = $2, sea_at = null, updated_at = $2 where id = $1`,
        [bottleId, stamp],
      );
      return;
    case 'BOTTLE_WENT_TO_SEA':
      await tx.query(
        `update bottles set status = 'SEA', current_holder_id = null, sea_at = $2,
           return_completed = $3 or return_completed, return_chain_broken = $4 or return_chain_broken,
           updated_at = $2 where id = $1`,
        [bottleId, stamp, event['returnCompleted'] === true, event['chainBroken'] === true],
      );
      return;
    case 'BOTTLE_DAMAGED':
      await tx.query(
        `update bottles set status = 'DAMAGED', current_holder_id = null, damaged_at = $2,
           return_chain_broken = true, updated_at = $2 where id = $1`,
        [bottleId, stamp],
      );
      return;
    default:
      return;
  }
}

export function createBottleStore(db: Db): BottleStore {
  async function loadState(bottleId: string): Promise<BottleState | null> {
    const events = await readDomainEvents(db, bottleId);
    return events.length === 0 ? null : replayBottle(events);
  }

  async function findBottle(bottleId: string): Promise<BottleRow | null> {
    const rows = await db.query<BottleDbRow>(`${BOTTLE_SELECT} where id = $1`, [bottleId]);
    const row = rows[0];
    return row === undefined ? null : toBottleRow(row);
  }

  async function applyOutcome(
    bottleId: string,
    outcome: CommandOutcome,
    extras: ApplyExtras = {},
  ): Promise<void> {
    if (!outcome.ok) {
      return; // 被拒命令零副作用（内核语义）：不投影任何东西
    }
    await db.withTransaction(async (tx) => {
      for (const event of outcome.events) {
        const record = event as unknown as Record<string, unknown>;
        await projectMedia(tx, record, extras);
        // 通知必须在 projectBottleRow **之前**：后者会把 PENDING 留言一次性改终态，
        // 而通知要按"改之前"的收件关系决定发给谁（送达→发起者 / 未送达→发送者）。
        await projectNotifications(tx, record, bottleId, new Date(Number(record['at'])));
        await projectBottleRow(tx, record);
        await applyDomainEventToHoldings(tx, {
          type: String(record['type']),
          bottleId,
          at: new Date(Number(record['at'])),
          actorId: String(record['actorId']),
          ...(record['toUserId'] === undefined ? {} : { toUserId: String(record['toUserId']) }),
        });
        await appendDomainEvent(tx, event);

        /**
         * 留言投影的**状态**由内核说了算：事件落库后重放一次，把每条留言的状态同步过来。
         *
         * 为什么不再"每个事件手写一条规则"（旧实现只在 `BOTTLE_WENT_TO_SEA` 里一刀切把 PENDING 改终态）：
         * 规则变更后「送达 = 目标拿到瓶子」（DRAWN/RETURNED）、「失败」有三条路径
         *（SEGMENT_CUT 目标段被斩 / BOTTLE_DAMAGED / BOTTLE_WENT_TO_SEA），
         * 手写就会在投影层留下**第二份**判定；而 `messages` 表一旦与内核重放不一致，
         * `GET /messages`（读内核）与任何直接读表的统计/审计就会互相打脸（t42 实测到过这个不一致）。
         */
        if (MESSAGE_STATE_EVENTS.has(String(record['type']))) {
          const replayed = replayBottle(await readDomainEvents(tx, bottleId));
          for (const message of replayed.messages) {
            await tx.query(`update messages set status = $2 where id = $1 and status <> $2`, [
              message.id,
              message.status,
            ]);
          }
        }
      }
    });
  }

  return {
    findBottle,

    loadState,

    async createBottle(input): Promise<BottleRow | null> {
      const songs = await db.query<{ total_segments: number }>(
        `select total_segments from songs where id = $1`,
        [input.songId],
      );
      const totalSegments = songs[0]?.total_segments;
      if (totalSegments === undefined) {
        return null;
      }
      const outcome = createBottleCommand(
        {
          bottleId: input.bottleId,
          songId: input.songId,
          initiatorId: input.initiatorId,
          totalSegments,
        },
        input.ctx,
      );
      await db.withTransaction(async (tx) => {
        await tx.query(
          `insert into bottles (id, song_id, initiator_id, status, total_segments, revision, current_caster_id, updated_at)
           values ($1, $2, $3, 'DRAFT', $4, 0, $5, now())`,
          [input.bottleId, input.songId, input.initiatorId, totalSegments, input.initiatorId],
        );
        for (const event of outcome.events) {
          await appendDomainEvent(tx, event);
        }
      });
      return findBottle(input.bottleId);
    },

    applyOutcome,

    async drawFromRiver(input): Promise<CommandOutcome | null> {
      const state = await loadState(input.bottleId);
      if (state === null) {
        return null;
      }
      const drawOutcome = drawBottle(state, { userId: input.userId }, input.ctx);
      if (!drawOutcome.ok) {
        return drawOutcome;
      }
      // 父链由内核决定（正常=投出者；系统重开河道=缺口前一段作者）——DB 只搬运，不自作主张。
      const parentId = resolveDrawParent(state);
      const claimed = await db.withTransaction(async (tx) =>
        claimHolding(tx, {
          bottleId: input.bottleId,
          holderId: input.userId,
          parentId,
          origin: 'DRAW',
          acquiredAt: new Date(input.ctx.clock.now()),
        }),
      );
      if (!claimed.ok) {
        // 状态机那时说没人持有、锁现在说有人持有 → 并发落败者，零副作用。
        return {
          ok: false,
          state,
          events: [],
          violations: [
            { code: 'HOLDING_ALREADY_TAKEN', message: '这个漂流瓶已经被别人拿走了，换一个吧。' },
          ],
        };
      }
      await applyOutcome(input.bottleId, drawOutcome);
      return drawOutcome;
    },

    async releaseHolding(bottleId: string, holderId: string, at: Date): Promise<number> {
      const { releaseHolding } = await import('../db/holdings.js');
      return db.withTransaction(async (tx) =>
        releaseHolding(tx, { bottleId, holderId, releasedAt: at }),
      );
    },

    async listSongs(): Promise<SongRow[]> {
      const songs = await db.query<{
        id: string;
        title: string;
        total_segments: number;
        licensed_source: string;
      }>(`select id, title, total_segments, licensed_source from songs order by title asc`);
      const segments = await db.query<{
        id: string;
        song_id: string;
        index: number;
        start_ms: number;
        duration_ms: number;
      }>(
        `select id, song_id, "index", start_ms, duration_ms from song_segments order by song_id, "index" asc`,
      );
      return songs.map((song) => ({
        id: song.id,
        title: song.title,
        totalSegments: song.total_segments,
        licensedSource: song.licensed_source,
        segments: segments
          .filter((segment) => segment.song_id === song.id)
          .map((segment) => ({
            id: segment.id,
            index: segment.index,
            startMs: segment.start_ms,
            durationMs: segment.duration_ms,
          })),
      }));
    },

    /** 公海：缺口由**段投影**直接算（等价于内核 `gaps`，避免逐瓶重放）。 */
    async listSeaBottles(input): Promise<{ rows: BottleRow[]; nextCursor: string | null }> {
      /**
       * 候选页大小：多取一些（§46.1 的同一思路）—— SQL 的分区子查询只是**候选预筛**，
       * 真正的分区判定在内核（`seaZoneOf`），两者不一致时（例如段行与事件流短暂不同步）
       * 会筛掉一些候选；不多取就会静默少给行。
       */
      const candidatePageSize = Math.max(input.limit * CANDIDATE_OVERFETCH, input.limit + 1);

      const queryCandidates = async (after: SeaCursorPosition | null): Promise<BottleDbRow[]> =>
        await db.query<BottleDbRow>(
          `select b.id, b.song_id, b.initiator_id, b.status, b.total_segments, b.revision,
                  b.current_holder_id, b.current_caster_id, b.created_at, b.updated_at
           from bottles b
           where b.status = 'SEA'
             and ($3::text is null or b.status = $3)
             and ($4::timestamptz is null or (b.updated_at, b.id) < ($4::timestamptz, $5::uuid))
             and ($1::text is null
               or ($1 = 'COMPLETED' and not exists (
                     select 1 from generate_series(1, b.total_segments) as g(idx)
                     where not exists (select 1 from bottle_segments s
                                       where s.bottle_id = b.id and s."index" = g.idx and s.deleted_at is null)))
               or ($1 = 'INCOMPLETE' and exists (
                     select 1 from generate_series(1, b.total_segments) as g(idx)
                     where not exists (select 1 from bottle_segments s
                                       where s.bottle_id = b.id and s."index" = g.idx and s.deleted_at is null))))
           order by b.updated_at desc, b.id desc
           limit $2`,
          // ⚠️ `$4` 必须是**时间值**（Date/ISO），不能传 epoch 毫秒数：
          // 传数字时 PG 会当成日期字符串解析 → `date/time field value out of range`（t24 实测踩到，500）
          [
            input.zone,
            candidatePageSize + 1,
            input.status ?? null,
            after === null ? null : new Date(after.updatedAtMs),
            after?.id ?? null,
          ],
        );

      const accepted: BottleRow[] = [];
      let after: SeaCursorPosition | null = input.after ?? null;
      let exhausted = false;
      /**
       * 一直推进游标直到"装满 limit+1 行"或"候选取尽"——**不返回空页假装到底**。
       * 循环次数天然有界：每一轮都把游标向前推进一整页候选行。
       */
      while (accepted.length < input.limit + 1 && !exhausted) {
        const candidates = await queryCandidates(after);
        if (candidates.length === 0) {
          // 候选取尽：没有"多出来的那一行"⇒ 末页（不赋 `exhausted`，否则是死赋值、lint 会钉它）
          break;
        }
        const lastCandidate = candidates[candidates.length - 1];
        if (lastCandidate !== undefined) {
          after = { updatedAtMs: lastCandidate.updated_at.getTime(), id: lastCandidate.id };
        }
        if (candidates.length <= candidatePageSize) {
          exhausted = true; // 本次候选不足一页 ⇒ 之后没有更多行了
        }
        for (const candidate of candidates) {
          if (accepted.length >= input.limit + 1) {
            break;
          }
          const state = await loadState(candidate.id);
          if (state === null) {
            continue;
          }
          // 分区判定由**内核**给（不在这里重算 isComplete 的规则）
          if (input.zone !== null && seaZoneOf(state) !== input.zone) {
            continue;
          }
          accepted.push(toBottleRow(candidate));
        }
      }

      const hasMore = accepted.length > input.limit;
      const rows = accepted.slice(0, input.limit);
      const lastReturned = rows[rows.length - 1];
      const nextCursor =
        hasMore && lastReturned !== undefined
          ? encodeSeaCursor({ updatedAtMs: lastReturned.updatedAt.getTime(), id: lastReturned.id })
          : // 没有"多出来的那一行"就说明到头了（即便上一轮候选刚好用尽，也不会给出悬空游标）
            null;
      return { rows, nextCursor };
    },

    async listParticipatedBottles(input): Promise<BottleRow[]> {
      /**
       * SQL 只做**候选超集**（"我录过段的瓶子"），真正的判定交给内核（`participatedIn`）。
       *
       * ⚠️ 刻意**不再**有 `b.initiator_id = $1` 这个 disjunct：那正是「发起者豁免」——
       * 发起者的段被斩后照样会被列出（旧行为）。按 §46.1 整条删掉，不留特殊照顾分支。
       * 发起者发起时必须录第一段（CONTEXT §3），所以他的有效段本来就会经由 `SEGMENT_RECORDED` 进候选。
       *
       * 多取一些候选再筛（`limit * CANDIDATE_OVERFETCH`）：被斩者会被筛掉，不这样会**静默少给**几行。
       */
      const candidates = await db.query<BottleDbRow>(
        `select b.id, b.song_id, b.initiator_id, b.status, b.total_segments, b.revision,
                b.current_holder_id, b.current_caster_id, b.created_at, b.updated_at
         from bottles b
         where exists (
                 select 1 from events e
                 where e.bottle_id = b.id and e.type = 'SEGMENT_RECORDED' and e.actor_id = $1::text
               )
         -- 时间相同的行按 id 定序：分页/断言都要确定性（否则"最近活跃在前"会飘）
         order by b.updated_at desc, b.id desc
         limit $2`,
        [input.userId, input.limit * CANDIDATE_OVERFETCH],
      );

      const rows: BottleRow[] = [];
      for (const candidate of candidates) {
        const state = await loadState(candidate.id);
        if (state === null || !participatedIn(state, input.userId)) {
          continue;
        }
        rows.push(toBottleRow(candidate));
        if (rows.length >= input.limit) {
          break;
        }
      }
      return rows;
    },

    async listBottleSegments(bottleId: string): Promise<BottleSegmentRow[]> {
      const rows = await db.query<{
        id: string;
        index: number;
        owner_id: string;
        note: string | null;
        audio_mime: string | null;
        duration_ms: number | null;
        created_at: Date;
      }>(
        `select id, "index", owner_id, note, audio_mime, duration_ms, created_at
         from bottle_segments where bottle_id = $1 and deleted_at is null order by "index" asc`,
        [bottleId],
      );
      return rows.map((row) => ({
        id: row.id,
        index: row.index,
        ownerId: row.owner_id,
        note: row.note,
        audioMime: row.audio_mime,
        durationMs: row.duration_ms,
        createdAt: row.created_at,
      }));
    },

    async liveSegmentIndexes(bottleId: string): Promise<number[]> {
      const rows = await db.query<{ index: number }>(
        `select "index" from bottle_segments where bottle_id = $1 and deleted_at is null order by "index" asc`,
        [bottleId],
      );
      return rows.map((row) => row.index);
    },

    async takeTargetedSegment(input): Promise<CommandOutcome | null> {
      const state = await loadState(input.bottleId);
      if (state === null) {
        return null;
      }
      const live = state.segments.filter((segment) => segment.deletedAt === null);
      const last = live.length === 0 ? undefined : live[live.length - 1];
      const parentId = last === undefined ? state.initiatorId : last.ownerId;
      const claimed = await db.withTransaction(async (tx) =>
        claimHolding(tx, {
          bottleId: input.bottleId,
          holderId: input.userId,
          parentId,
          origin: 'DRAW',
          acquiredAt: new Date(input.ctx.clock.now()),
        }),
      );
      if (!claimed.ok) {
        return {
          ok: false,
          state,
          events: [],
          violations: [
            { code: 'HOLDING_ALREADY_TAKEN', message: '这个漂流瓶已经被别人拿走了，换一个吧。' },
          ],
        };
      }
      const outcome: CommandOutcome = {
        ok: true,
        state,
        events: [
          {
            type: 'BOTTLE_DRAWN',
            bottleId: input.bottleId,
            at: input.ctx.clock.now(),
            actorId: input.userId,
            parentId,
          },
        ],
        violations: [],
      };
      await applyOutcome(input.bottleId, outcome);
      return outcome;
    },

    async activeHolding(bottleId: string) {
      const holding = await activeHoldingOf(db, bottleId);
      return holding === null
        ? null
        : { holderId: holding.holderId, parentId: holding.parentId, origin: holding.origin };
    },
  };
}
