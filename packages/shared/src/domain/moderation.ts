/**
 * 斩浪与投票（`CONTEXT.md` §7.1–§7.4 / §16，斩浪后的流转见 `docs/architecture.md` ADR-015）。
 *
 * 关键纪律：点赞与斩杀**完全解耦** —— 点赞只进 `likes`，不参与阈值判定、不救生；
 * 点踩一人一票、作者不能踩自己的段、必须听满 80%。
 */
import type { DomainPolicy } from './constants';
import { violation, type RuleViolation } from './errors';
import { reduceBottle, type DomainEvent } from './events';
import { accepted, rejected, type CommandOutcome } from './outcome';
import type { DomainContext } from './ports';
import { findSegment, liveSegments, nextRecordIndex } from './queries';
import type { BottleState, Segment, VoteValue } from './types';

export interface VoteCommand {
  userId: string;
  segmentId: string;
  value: VoteValue;
  /** 已播放比例（0–1）；`DISLIKE` 必须 ≥ policy.dislikeListenRatioThreshold。 */
  listenedRatio: number;
}

export function canCastVote(
  state: BottleState,
  cmd: VoteCommand,
  policy: DomainPolicy,
): RuleViolation[] {
  const segment = findSegment(state, cmd.segmentId);
  if (segment === null) {
    return [violation('SEGMENT_NOT_FOUND')];
  }
  if (segment.deletedAt !== null) {
    return [violation('SEGMENT_ALREADY_CUT')];
  }
  if (cmd.value === 'DISLIKE') {
    if (segment.ownerId === cmd.userId) {
      return [violation('CANNOT_DISLIKE_OWN_SEGMENT')];
    }
    if (cmd.listenedRatio < policy.dislikeListenRatioThreshold) {
      return [violation('LISTEN_RATIO_TOO_LOW')];
    }
    if (segment.dislikes.includes(cmd.userId)) {
      return [violation('DISLIKE_ALREADY_CAST')];
    }
    return [];
  }
  if (segment.likes.includes(cmd.userId)) {
    return [violation('LIKE_ALREADY_CAST')];
  }
  return [];
}

/** 投一票；点踩达阈值时追加斩浪事件，并交给 `gapOpenEvent` 决定后续流转。 */
export function castVote(state: BottleState, cmd: VoteCommand, ctx: DomainContext): CommandOutcome {
  const violations = canCastVote(state, cmd, ctx.policy);
  if (violations.length > 0) {
    return rejected(state, violations);
  }
  const at = ctx.clock.now();
  const voteEvent: DomainEvent = {
    type: 'VOTE_CAST',
    bottleId: state.id,
    at,
    actorId: cmd.userId,
    segmentId: cmd.segmentId,
    value: cmd.value,
  };
  const events: DomainEvent[] = [voteEvent];

  if (cmd.value === 'DISLIKE') {
    const afterVote = reduceBottle(state, voteEvent);
    const target = findSegment(afterVote, cmd.segmentId);
    if (target !== null && target.dislikes.length >= ctx.policy.dislikeThreshold) {
      const cutEvent: DomainEvent = {
        type: 'SEGMENT_CUT',
        bottleId: state.id,
        at,
        actorId: 'SYSTEM',
        segmentId: cmd.segmentId,
      };
      events.push(cutEvent);
      events.push(gapOpenEvent(reduceBottle(afterVote, cutEvent), at, ctx));
    }
  }
  return accepted(state, events);
}

/**
 * 斩浪后的状态流转 —— **单一出口**（ADR-015 §16.3；缺口=1 的终裁见下）。
 *
 * 将来若要重新引入策略（例如换一种「谁来接盘」的规则），只改这一个函数，业务逻辑不必动。
 *
 * 注：此处曾有过 `DomainPolicy.damagePolicy`（`REWIND_TO_LAST_VALID` / `TERMINAL`）备选；
 * ADR-015 冻结了唯一流转后已删除 —— 保留一个与冻结结论矛盾的策略开关是死灵活性（captain 裁决 Q2）。
 *
 * 三分支：
 * 1. 作品被斩空（一段有效段都不剩）→ `DAMAGED{CHAIN_BROKEN_BY_CUT}`；
 * 2. 缺口是第 1 段（锚被斩）→ `DAMAGED{ANCHOR_SEGMENT_CUT}`（用户 2026-09-23 终裁：
 *    位置 1 是发起者/父链起点/回传终点，锚没了整套结构失去基底；代价是这一窄情形下缺口不会被补上）；
 * 3. 其余 → `BOTTLE_GAP_OPENED`：系统把作品置回 `IN_RIVER`（`currentCasterId = 'SYSTEM'`），等陌生人补位；
 *    **不再**把责任转嫁给前驱段作者（`BOTTLE_REWOUND` 那条路径已废弃）。
 */
function gapOpenEvent(afterCut: BottleState, at: number, _ctx: DomainContext): DomainEvent {
  const damaged = (reason: 'CHAIN_BROKEN_BY_CUT' | 'ANCHOR_SEGMENT_CUT'): DomainEvent => ({
    type: 'BOTTLE_DAMAGED',
    bottleId: afterCut.id,
    at,
    actorId: 'SYSTEM',
    reason,
  });

  if (liveSegments(afterCut).length === 0) {
    return damaged('CHAIN_BROKEN_BY_CUT');
  }
  const gapIndex = nextRecordIndex(afterCut);
  if (gapIndex === 1) {
    return damaged('ANCHOR_SEGMENT_CUT');
  }
  return { type: 'BOTTLE_GAP_OPENED', bottleId: afterCut.id, at, actorId: 'SYSTEM', gapIndex };
}

/** 公海展示的段：被斩的段不留任何遗迹（CONTEXT §7.4）。 */
export function publicSegments(state: BottleState): Segment[] {
  return liveSegments(state);
}
