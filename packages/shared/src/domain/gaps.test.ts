import { describe, expect, it } from 'vitest';
import { createBottle, recordSegment } from './bottle';
import { replayBottle } from './events';
import {
  gaps,
  isComplete,
  liveSegments,
  liveSegmentByIndex,
  missingSegmentIndexes,
  nextRecordIndex,
  seaZoneOf,
  versionOf,
} from './queries';
import {
  castToRiverBy,
  drawBy,
  createHarness,
  dislikeTimes,
  drawAndSing,
  expectOk,
  expectRejected,
  resolve,
  segmentByIndex,
  startBottle,
} from './test-support';

const TEN_VOTERS = [
  'u:X1',
  'u:X2',
  'u:X3',
  'u:X4',
  'u:X5',
  'u:X6',
  'u:X7',
  'u:X8',
  'u:X9',
  'u:X10',
];

/** A 投河 → B/C/D 依次接唱投河，最后一个 singer 持有（4 段完整版本）。 */
function fourSegmentsHeld(harness: ReturnType<typeof createHarness>) {
  const ctx = harness.ctx;
  let state = castToRiverBy(startBottle(ctx), ctx, 'u:A');
  state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
  state = castToRiverBy(drawAndSing(state, ctx, 'u:C'), ctx, 'u:C');
  return drawAndSing(state, ctx, 'u:D');
}

describe('ADR-015 §16.1 — 段号 = 歌的固定位置，永不压缩', () => {
  it('16.1：斩浪只软删，不改动任何段的段号', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);

    const afterCut = dislikeTimes(holding, ctx, TEN_VOTERS, segmentByIndex(holding, 2).id).state;

    expect(
      afterCut.segments.map(
        (segment) =>
          `${segment.index}:${segment.ownerId}:${segment.deletedAt === null ? 'live' : 'cut'}`,
      ),
    ).toEqual(['1:u:A:live', '2:u:B:cut', '3:u:C:live', '4:u:D:live']);
    expect(liveSegments(afterCut).map((segment) => segment.index)).toEqual([1, 3, 4]);
  });

  it('16.1：gaps(state) 派生缺口集合（升序，缺口是合法状态）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);

    const oneGap = dislikeTimes(holding, ctx, TEN_VOTERS, segmentByIndex(holding, 2).id).state;
    expect(gaps(oneGap)).toEqual([2]);

    const twoGaps = dislikeTimes(oneGap, ctx, TEN_VOTERS, segmentByIndex(oneGap, 4).id).state;
    expect(gaps(twoGaps)).toEqual([2, 4]);
    expect(missingSegmentIndexes(twoGaps)).toEqual([2, 4]);
  });

  it('16.1：nextRecordIndex = 最小缺口；无缺口时天然等于 live.length + 1（无分支）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    const fresh = startBottle(ctx); // 只有第 1 段：缺口 = 还没人唱的第 2..4 段
    expect(gaps(fresh)).toEqual([2, 3, 4]);
    expect(nextRecordIndex(fresh)).toBe(liveSegments(fresh).length + 1);
    expect(nextRecordIndex(fresh)).toBe(2);

    const held = fourSegmentsHeld(harness);
    const oneGap = dislikeTimes(held, ctx, TEN_VOTERS, segmentByIndex(held, 4).id).state;
    expect(gaps(oneGap)).toEqual([4]);
    expect(nextRecordIndex(oneGap)).toBe(4); // 最小缺口，而不是末尾追加 5

    const twoGaps = dislikeTimes(oneGap, ctx, TEN_VOTERS, segmentByIndex(oneGap, 3).id).state;
    expect(gaps(twoGaps)).toEqual([3, 4]);
    expect(nextRecordIndex(twoGaps)).toBe(3);
  });

  it('16.1：有效段不连续是合法状态，作品不会因此损坏', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);

    const afterCut = dislikeTimes(holding, ctx, TEN_VOTERS, segmentByIndex(holding, 2).id).state;

    expect(afterCut.status).toBe('IN_RIVER');
    expect(gaps(afterCut)).toEqual([2]);
    expect(isComplete(afterCut)).toBe(false);
  });

  it('16.6：混音输入按 index 升序排列，并显式导出缺口（禁止静默拼出缺段成品）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);

    const afterCut = dislikeTimes(holding, ctx, TEN_VOTERS, segmentByIndex(holding, 2).id).state;

    expect(liveSegments(afterCut).map((segment) => segment.index)).toEqual([1, 3, 4]);
    expect(versionOf(afterCut).segmentIds).toEqual([
      liveSegmentByIndex(afterCut, 1)?.id,
      liveSegmentByIndex(afterCut, 3)?.id,
      liveSegmentByIndex(afterCut, 4)?.id,
    ]);
    expect(missingSegmentIndexes(afterCut)).toEqual([2]);

    // 补位者填回缺口后，仍然按段号升序输出（插入顺序 ≠ 段号顺序）
    const refilled = drawAndSing(afterCut, ctx, 'u:E');
    expect(refilled.segments.map((segment) => segment.index)).toEqual([1, 2, 3, 4, 2]);
    expect(liveSegments(refilled).map((segment) => segment.index)).toEqual([1, 2, 3, 4]);
    expect(liveSegments(refilled).map((segment) => segment.ownerId)).toEqual([
      'u:A',
      'u:E',
      'u:C',
      'u:D',
    ]);
    expect(missingSegmentIndexes(refilled)).toEqual([]);
  });

  it('16.1：补位者录制的是「最小缺口段号」，不是末尾追加', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const holding = fourSegmentsHeld(harness);
    const afterCut = dislikeTimes(holding, ctx, TEN_VOTERS, segmentByIndex(holding, 2).id).state;

    const refill = expectOk(
      recordSegment(drawBy(afterCut, ctx, 'u:E'), { userId: 'u:E', note: null }, ctx),
    );

    expect(liveSegmentByIndex(refill, 2)?.ownerId).toBe('u:E');
    expect(refill.segments).toHaveLength(5); // 4 段 + 被软删的历史行
    expect(refill.revision).toBe(5);
    expect(isComplete(refill)).toBe(true);
  });
});

describe('ADR-015 §16.2 — 完成判定在 totalSegments ≠ 4 时的边界与防御', () => {
  /** 5 段歌：A 唱 1 → B 唱 2 → C 唱 3 → D 唱 4（D 持有，第 5 段还空着）。 */
  function fourOfFive(harness: ReturnType<typeof createHarness>) {
    const ctx = harness.ctx;
    let state = expectOk(
      createBottle({ bottleId: 'b5', songId: 'song-5', initiatorId: 'u:A', totalSegments: 5 }, ctx),
    );
    state = expectOk(recordSegment(state, { userId: 'u:A', note: null }, ctx));
    state = castToRiverBy(state, ctx, 'u:A');
    state = castToRiverBy(drawAndSing(state, ctx, 'u:B'), ctx, 'u:B');
    state = castToRiverBy(drawAndSing(state, ctx, 'u:C'), ctx, 'u:C');
    return drawAndSing(state, ctx, 'u:D');
  }

  it('16.2：5 段歌只唱到第 4 段时不算完成（缺口 = 第 5 段）', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const state = fourOfFive(harness);

    expect(liveSegments(state)).toHaveLength(4);
    expect(gaps(state)).toEqual([5]);
    expect(isComplete(state)).toBe(false); // 旧定义 live.length >= totalSegments 同样为 false，但语义来源不同
    expect(nextRecordIndex(state)).toBe(5);
    expect(missingSegmentIndexes(state)).toEqual([5]);
    expect(versionOf(state).ownerIds).toEqual(['u:A', 'u:B', 'u:C', 'u:D']);

    const atSea = resolve(state, ctx, 'u:D', 'SEA');
    expect(seaZoneOf(atSea)).toBe('INCOMPLETE');
    expect(missingSegmentIndexes(atSea)).toEqual([5]);
  });

  it('16.2：5 段歌补齐第 5 段才算完成，且版本按段号给出 5 段', () => {
    const harness = createHarness();
    const ctx = harness.ctx;

    const complete = drawAndSing(castToRiverBy(fourOfFive(harness), ctx, 'u:D'), ctx, 'u:E');

    expect(gaps(complete)).toEqual([]);
    expect(isComplete(complete)).toBe(true);
    expect(missingSegmentIndexes(complete)).toEqual([]);
    expect(liveSegments(complete).map((segment) => segment.index)).toEqual([1, 2, 3, 4, 5]);
    expect(versionOf(complete).ownerIds).toEqual(['u:A', 'u:B', 'u:C', 'u:D', 'u:E']);
    expect(versionOf(complete).revision).toBe(5);
    expect(nextRecordIndex(complete)).toBe(6); // live.length + 1（无缺口），但录制已被 isComplete 挡住
    expectRejected(recordSegment(complete, { userId: 'u:E', note: null }, ctx), [
      'BOTTLE_ALREADY_COMPLETE',
    ]);

    const atSea = resolve(complete, ctx, 'u:E', 'SEA');
    expect(seaZoneOf(atSea)).toBe('COMPLETED');
  });

  it('16.2（防御）：事件流带入越界段号时，1..N 未齐全就不算完成', () => {
    const at = 1_700_000_000_000;
    const state = replayBottle([
      {
        type: 'BOTTLE_CREATED',
        bottleId: 'bx',
        at,
        actorId: 'u:A',
        songId: 's',
        initiatorId: 'u:A',
        totalSegments: 4,
      },
      {
        type: 'SEGMENT_RECORDED',
        bottleId: 'bx',
        at,
        actorId: 'u:A',
        segmentId: 'x1',
        index: 1,
        note: null,
      },
      {
        type: 'SEGMENT_RECORDED',
        bottleId: 'bx',
        at,
        actorId: 'u:B',
        segmentId: 'x3',
        index: 3,
        note: null,
      },
      {
        type: 'SEGMENT_RECORDED',
        bottleId: 'bx',
        at,
        actorId: 'u:C',
        segmentId: 'x4',
        index: 4,
        note: null,
      },
      {
        type: 'SEGMENT_RECORDED',
        bottleId: 'bx',
        at,
        actorId: 'u:D',
        segmentId: 'x5',
        index: 5,
        note: null,
      },
    ]);

    expect(liveSegments(state)).toHaveLength(4); // 段数与 totalSegments 相等……
    expect(gaps(state)).toEqual([2]); // ……但第 2 段缺席

    // 旧定义 live.length >= totalSegments 会判「已完成」，公海就会把缺段作品当完整展示（§15.1 问题 1）。
    expect(isComplete(state)).toBe(false);
    expect(missingSegmentIndexes(state)).toEqual([2]);
    expect(versionOf(state).ownerIds).toEqual(['u:A', 'u:B', 'u:C', 'u:D']);
  });
});
