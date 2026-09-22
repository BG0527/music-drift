import { describe, expect, it } from 'vitest';
import * as domain from '../index';

/** 内核是 t5/t9 的消费入口：包根必须能把领域 API 完整透出去（否则下游只能深链内部文件）。 */
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
  'evaluateBadges',
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
  it('领域 API 全部从包根可用（无遗漏导出）', () => {
    const missing = REQUIRED_EXPORTS.filter((symbol) => !(symbol in domain));

    expect(missing).toEqual([]);
  });
});
