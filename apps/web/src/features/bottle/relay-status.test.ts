import { describe, expect, it } from 'vitest';
import {
  BOTTLE_STATUS_LABEL,
  gapNotice,
  progressLabel,
  relayHeadline,
  resolutionCopy,
} from './relay-status';

/**
 * 缺口必须**显式展示**（这是产品核心语义）：段号是歌里的固定位置，永不压缩，
 * 斩浪留下的空位要么被补上、要么在成品里留静音 —— 页面不许把后面的段前移伪装成完整作品。
 */
describe('接力状态文案', () => {
  it('进度说明用服务端字段，不自己算完成度', () => {
    expect(
      progressLabel({ recordedCount: 2, totalSegments: 4, missingSegmentIndexes: [2, 3] }),
    ).toBe('已录 2 / 4 段');
  });

  it('有缺口时明确写出「缺第 N 段」，并把多个缺口列全', () => {
    expect(gapNotice([2])).toBe('缺第 2 段');
    expect(gapNotice([1, 3, 4])).toBe('缺第 1、3、4 段');
    expect(gapNotice([])).toBeNull();
  });

  it('完整作品必须说「已完整」，而不是按段数猜', () => {
    expect(relayHeadline({ isComplete: true, missingSegmentIndexes: [], status: 'SEA' })).toContain(
      '完整',
    );
    expect(
      relayHeadline({ isComplete: false, missingSegmentIndexes: [3], status: 'IN_RIVER' }),
    ).toContain('缺第 3 段');
  });

  it('五种瓶子状态都有中文标签（不把英文枚举漏给用户）', () => {
    expect(BOTTLE_STATUS_LABEL.DRAFT).toBe('草稿');
    expect(BOTTLE_STATUS_LABEL.IN_RIVER).toBe('在河道');
    expect(BOTTLE_STATUS_LABEL.HELD).toBe('有人持有');
    expect(BOTTLE_STATUS_LABEL.SEA).toBe('已入公海');
    expect(BOTTLE_STATUS_LABEL.DAMAGED).toBe('已损坏');
  });

  it('去向三选一各自带「发生什么」的解释（不许只写按钮名）', () => {
    expect(resolutionCopy('RIVER').title).toBe('继续投河');
    expect(resolutionCopy('RIVER').detail).toContain('下一位');
    expect(resolutionCopy('RETURN').title).toBe('回传');
    expect(resolutionCopy('RETURN').detail).toContain('投给你的那个人');
    expect(resolutionCopy('SEA').title).toBe('入海');
    expect(resolutionCopy('SEA').detail).toContain('公海');
  });
});
