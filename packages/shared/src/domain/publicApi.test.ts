import { describe, expect, it } from 'vitest';
import * as domain from '../domain';
import * as packageRoot from '../index';

/**
 * 内核的消费入口是稳定子路径 `@music-drift/shared/domain`（docs/architecture.md §17.3），
 * 不是包根：包根 = 契约层（ADR-004），因为领域与契约有同名但语义不同的类型
 * （Segment / Resolution / SeaZone / VoteValue / RuleViolation）。
 * t5 起这条边界是**有意的**，下面两条测试把它钉住。
 */
const REQUIRED_EXPORTS = [
  'DEFAULT_POLICY',
  'DEFAULT_RIVER_TIMEOUT_OUTCOME',
  'SYSTEM_ACTOR_ID',
  'gaps',
  'nextRecordIndex',
  'missingSegmentIndexes',
  'replacementContext',
  'seaZoneOf',
  'hasEverSung',
  'resolveDrawParent',
  'liveSegmentByIndex',
  'createDomainContext',
  'createManualClock',
  'createSystemClock',
  'createSequentialIds',
  'createBottle',
  'recordSegment',
  'drawBottle',
  'claimBottle',
  'putBack',
  'chooseResolution',
  'availableResolutions',
  'canRecordSegment',
  'canDrawBottle',
  'canChooseResolution',
  'canCastVote',
  'castVote',
  'publicSegments',
  'attachPrivateMessage',
  'visibleMessagesFor',
  'applyTimeouts',
  'participants',
  'versionOf',
  'parentOf',
  'liveSegments',
  'isComplete',
  'createRiverState',
  'drawFromRiver',
  'eligibleBottlesFor',
  'recordPutBack',
  'isDrawExcluded',
  'createInMemoryHoldingRegistry',
  'syncHoldingRegistry',
  'reduceBottle',
  'replayBottle',
  'publicSegments',
  'liveSegments',
  'httpStatusOf',
  'RULE_CODES',
] as const;

describe('包公共接口', () => {
  it('领域 API 全部从 @music-drift/shared/domain 可用（无遗漏导出）', () => {
    const missing = REQUIRED_EXPORTS.filter((symbol) => !(symbol in domain));

    expect(missing).toEqual([]);
  });

  it('包根只出契约、不出领域内核（防止同名类型歧义被「顺手合并」回去）', () => {
    expect('createBottle' in packageRoot).toBe(false);
    expect('resolveDrawParent' in packageRoot).toBe(false);
    expect('HealthResponseSchema' in packageRoot).toBe(true); // 契约照常从包根可用
  });
});
