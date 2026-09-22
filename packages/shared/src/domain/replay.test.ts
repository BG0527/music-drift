import { describe, expect, it } from 'vitest';
import { chooseResolution, createBottle, drawBottle, putBack, recordSegment } from './bottle';
import type { CommandOutcome } from './outcome';
import { replayBottle, type DomainEvent } from './events';
import { castVote } from './moderation';
import { segmentByIndex, createHarness } from './test-support';

describe('ADR-005 不变式 3 — 事件可重放', () => {
  it('重放：把命令产出的事件按序折叠，重建出与命令结果完全一致的状态', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const collected: DomainEvent[] = [];
    const step = (outcome: CommandOutcome) => {
      collected.push(...outcome.events);
      return outcome.state;
    };

    let state = step(createBottle({ bottleId: 'b1', songId: 'song-1', initiatorId: 'u:A' }, ctx));
    state = step(recordSegment(state, { userId: 'u:A', note: '第一段' }, ctx));
    state = step(chooseResolution(state, { userId: 'u:A', resolution: 'RIVER' }, ctx));
    harness.advanceHours(2);
    state = step(drawBottle(state, { userId: 'u:B' }, ctx));
    state = step(recordSegment(state, { userId: 'u:B', note: null }, ctx));
    state = step(chooseResolution(state, { userId: 'u:B', resolution: 'RIVER' }, ctx));
    state = step(drawBottle(state, { userId: 'u:C' }, ctx));
    state = step(recordSegment(state, { userId: 'u:C', note: '接力' }, ctx));
    state = step(chooseResolution(state, { userId: 'u:C', resolution: 'RETURN' }, ctx));
    state = step(chooseResolution(state, { userId: 'u:B', resolution: 'RETURN' }, ctx));
    state = step(chooseResolution(state, { userId: 'u:A', resolution: 'SEA' }, ctx));

    expect(replayBottle(collected)).toEqual(state);
  });

  it('重放：包含斩浪与放回的事件流也能重建', () => {
    const harness = createHarness();
    const ctx = harness.ctx;
    const collected: DomainEvent[] = [];
    const step = (outcome: CommandOutcome) => {
      collected.push(...outcome.events);
      return outcome.state;
    };

    let state = step(createBottle({ bottleId: 'b1', songId: 'song-1', initiatorId: 'u:A' }, ctx));
    state = step(recordSegment(state, { userId: 'u:A', note: null }, ctx));
    state = step(chooseResolution(state, { userId: 'u:A', resolution: 'RIVER' }, ctx));
    state = step(drawBottle(state, { userId: 'u:B' }, ctx));
    state = step(putBack(state, { userId: 'u:B' }, ctx));
    state = step(drawBottle(state, { userId: 'u:C' }, ctx));
    state = step(recordSegment(state, { userId: 'u:C', note: null }, ctx));
    state = step(chooseResolution(state, { userId: 'u:C', resolution: 'RIVER' }, ctx));
    state = step(drawBottle(state, { userId: 'u:D' }, ctx));
    state = step(recordSegment(state, { userId: 'u:D', note: null }, ctx));
    state = step(chooseResolution(state, { userId: 'u:D', resolution: 'RIVER' }, ctx));
    state = step(drawBottle(state, { userId: 'u:E' }, ctx));
    state = step(recordSegment(state, { userId: 'u:E', note: null }, ctx));
    const cutTarget = segmentByIndex(state, 2);
    for (const voter of [
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
    ]) {
      state = step(
        castVote(
          state,
          { userId: voter, segmentId: cutTarget.id, value: 'DISLIKE', listenedRatio: 1 },
          ctx,
        ),
      );
    }

    const replayed = replayBottle(collected);
    expect(replayed).toEqual(state);
    // ADR-015 §16.3（GAP_TRIGGER）：斩第 2 段后系统把作品置回河道，段号不压缩、位置留空。
    expect(replayed.status).toBe('IN_RIVER');
    expect(replayed.holder).toBe(null);
    expect(replayed.currentCasterId).toBe('SYSTEM');
  });

  it('重放：空事件流是显式错误（不允许静默产出空状态）', () => {
    expect(() => replayBottle([])).toThrow(/至少一条事件/);
  });
});
