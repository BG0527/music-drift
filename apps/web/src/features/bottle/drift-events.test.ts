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

/**
 * 日志精简（用户第十三轮 ③）：**只留核心操作**，不显示赞/踩记录与系统行为细节。
 *
 * 过滤位置 = **前端映射层**（`eventTimeline`）：接口返回的是事件流（服务端真相），
 * "给用户看什么"是**展示策略**，不该烧进契约。
 */
describe('漂流日志：只留核心操作', () => {
  const seq = (type: string, index: number, actorId = USER_A) => ({
    ...bottleEvent(),
    type,
    seq: index,
    actorId,
  });

  it('点赞 / 点踩记录不出现（用户明说不要）', () => {
    const bottle = bottleDetail();
    const timeline = eventTimeline(
      [seq('BOTTLE_CREATED', 1), seq('VOTE_CAST', 2), seq('BOTTLE_CAST_TO_RIVER', 3)],
      bottle,
    );

    expect(timeline.map((entry) => entry.seq)).toEqual([1, 3]);
  });

  it('系统行为细节不出现（斩浪 / 损坏 / 缺口 / 退回）—— 状态在瓶子页展示', () => {
    const bottle = bottleDetail();
    const timeline = eventTimeline(
      [
        seq('SEGMENT_CUT', 1),
        seq('BOTTLE_DAMAGED', 2),
        seq('BOTTLE_GAP_OPENED', 3),
        seq('BOTTLE_REWOUND', 4),
        seq('BOTTLE_WENT_TO_SEA', 5),
      ],
      bottle,
    );

    expect(timeline.map((entry) => entry.seq)).toEqual([5]);
  });

  it('私密留言的**存在**不在日志里泄露（CONTEXT §5.1：中间传递者不知道它存在）', () => {
    const bottle = bottleDetail();
    const timeline = eventTimeline([seq('MESSAGE_ATTACHED', 1)], bottle);

    expect(timeline).toEqual([]);
  });

  it('核心操作全都在：发起 / 接唱 / 投河 / 捞取 / 放回 / 回传 / 入海', () => {
    const bottle = bottleDetail();
    const types = [
      'BOTTLE_CREATED',
      'SEGMENT_RECORDED',
      'BOTTLE_CAST_TO_RIVER',
      'BOTTLE_DRAWN',
      'BOTTLE_PUT_BACK',
      'BOTTLE_RETURNED',
      'BOTTLE_WENT_TO_SEA',
    ];
    const timeline = eventTimeline(
      types.map((type, index) => seq(type, index + 1)),
      bottle,
    );

    expect(timeline.map((entry) => entry.seq)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('完成：最后一段录好且作品已完整 ⇒ 标成「完成」', () => {
    const bottle = bottleDetail({ isComplete: true, missingSegmentIndexes: [] });
    const timeline = eventTimeline(
      [seq('SEGMENT_RECORDED', 1), seq('SEGMENT_RECORDED', 2)],
      bottle,
    );

    // 最后一段才是“完成”；前面那一段仍然只是接唱
    expect(timeline[0]?.label).toContain('接唱');
    expect(timeline[1]?.label).toContain('完成');
  });
});
