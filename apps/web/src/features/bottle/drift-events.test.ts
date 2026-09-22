import { describe, expect, it } from 'vitest';
import { actorLabel, describeEvent, eventTimeline } from './drift-events';
import { bottleDetail, bottleEvent, USER_A, USER_B } from '../../test/fixtures';

/**
 * 漂流日志：事件类型 → 中文说明，操作者 → 匿名代号。
 * **系统行为不是人**（`actorId` 是哨兵 `SYSTEM`，不是用户 id）—— 必须显示成"系统"，不能显示成一串 id。
 */
describe('漂流日志文案', () => {
  it('每种领域事件都有中文说明（不把英文枚举漏给用户）', () => {
    const types = [
      'BOTTLE_CREATED',
      'SEGMENT_RECORDED',
      'BOTTLE_CAST_TO_RIVER',
      'BOTTLE_DRAWN',
      'BOTTLE_PUT_BACK',
      'BOTTLE_RETURNED',
      'BOTTLE_WENT_TO_SEA',
      'SEGMENT_CUT',
      'BOTTLE_DAMAGED',
      'BOTTLE_GAP_OPENED',
      'BOTTLE_REWOUND',
    ];
    for (const type of types) {
      const text = describeEvent({ ...bottleEvent(), type });
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain(type);
    }
  });

  it('未知事件类型有兜底说明，不抛错', () => {
    expect(describeEvent({ ...bottleEvent(), type: 'SOMETHING_NEW' })).toBe('有一条新的动态');
  });

  it('系统行为显示为「系统」，用户显示为该瓶子里的匿名代号', () => {
    const bottle = bottleDetail();
    expect(actorLabel(USER_A, bottle)).toBe('午夜歌手#042');
    expect(actorLabel('SYSTEM', bottle)).toBe('系统');
    expect(actorLabel(USER_B, bottle)).toBe('匿名歌手');
  });

  it('时间线按 seq 升序整理，并带上中文时间', () => {
    const bottle = bottleDetail();
    const timeline = eventTimeline(
      [
        bottleEvent({ seq: 2, type: 'BOTTLE_CAST_TO_RIVER', actorId: USER_A }),
        bottleEvent({ seq: 1, type: 'BOTTLE_CREATED', actorId: USER_A }),
      ],
      bottle,
    );
    expect(timeline.map((entry) => entry.seq)).toEqual([1, 2]);
    expect(timeline[0]!.label).toContain('发起');
    expect(timeline[0]!.actor).toBe('午夜歌手#042');
    expect(timeline[0]!.at.length).toBeGreaterThan(0);
  });
});
