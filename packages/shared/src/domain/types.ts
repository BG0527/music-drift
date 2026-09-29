/**
 * 领域类型（纯数据，无行为、无 IO）。
 *
 * 状态机宏观状态见 `docs/architecture.md` ADR-005：
 * `DRAFT → IN_RIVER ⇄ HELD → SEA`，`DAMAGED` 为斩浪断链后的终态（默认策略）。
 */
export type BottleStatus = 'DRAFT' | 'IN_RIVER' | 'HELD' | 'SEA' | 'DAMAGED';

/** 接唱完成后的去向三选一（CONTEXT §3.3）。 */
export type Resolution = 'RIVER' | 'RETURN' | 'SEA';

/** 持有权的来源：捞取 / 收到回传 / 斩浪断链后系统退回。 */
export type HoldingOrigin = 'DRAW' | 'RETURN' | 'REWIND';

export type VoteValue = 'LIKE' | 'DISLIKE';

export type MessageStatus = 'PENDING' | 'DELIVERED' | 'UNDELIVERED';


export type ParticipantRole = 'INITIATOR' | 'SINGER';

export interface Segment {
  /** 每段独立 ID：可单独点赞 / 点踩 / 举报（CONTEXT §7.1）。 */
  id: string;
  /** 1-based 段序号。 */
  index: number;
  ownerId: string;
  createdAt: number;
  /** 每段附言（CONTEXT §12.2）。 */
  note: string | null;
  /** 斩浪后置为非 null；公海不展示、不留遗迹（CONTEXT §7.4）。 */
  deletedAt: number | null;
  likes: string[];
  dislikes: string[];
}

export interface Holding {
  holderId: string;
  acquiredAt: number;
  origin: HoldingOrigin;
}

export interface PrivateMessage {
  id: string;
  fromUserId: string;
  /** 收件人：由 `targetSegmentIndex` 解析出来的**那一段的作者**（不再固定是发起者）。 */
  toUserId: string;
  /** 发送者选定的目标段号（1-based，与 `Segment.index` 同语义）；服务端据此解析收件人。 */
  targetSegmentIndex: number;
  content: string;
  createdAt: number;
  status: MessageStatus;
}

export interface BottleState {
  id: string;
  songId: string;
  initiatorId: string;
  totalSegments: number;
  status: BottleStatus;
  /** 版本号：每录一段 +1；回传递交的是完整版本而非单段（CONTEXT §4.3）。 */
  revision: number;
  segments: Segment[];
  /** 父链：参与者 → 把瓶子投给他的人（发起者为 null）。 */
  parents: Record<string, string | null>;
  holder: Holding | null;
  /** 最近一次把瓶子投进河道的人（捞取者的父节点）。 */
  currentCasterId: string | null;
  riverCastAt: number | null;
  seaAt: number | null;
  damagedAt: number | null;
  /** 回传链是否已断裂（中途有人选入海 / 斩浪断链）。 */
  returnChainBroken: boolean;
  /** 回传是否最终完成（发起者收到回传并入海）。 */
  returnCompleted: boolean;
  messages: PrivateMessage[];
  createdAt: number;
  updatedAt: number;
}

/** 回传递交的完整版本快照。 */
export interface SegmentVersion {
  bottleId: string;
  revision: number;
  segmentIds: string[];
  ownerIds: string[];
}

export interface ParticipantRecord {
  userId: string;
  role: ParticipantRole;
  segmentId: string;
  segmentIndex: number;
}

