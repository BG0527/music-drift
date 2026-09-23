import { describe, expect, it } from 'vitest';
import { describeNotification } from './notification-labels';

/**
 * 通知文案（纯函数）。三类写入（§5.2 / §9.2）各自要有"人话"，并且：
 * - 未知类型必须有兜底（`type` 在契约里是自由字符串，服务端加新类型不许把页面弄崩）；
 * - **不许把类型码当文案给用户看**（码给程序、文案给人，ADR-004）。
 */
describe('通知 → 中文文案', () => {
  const base = { id: 'n1', payload: { bottleId: 'b1', songTitle: '深海鲸落' }, readAt: null };

  it('留言送达：通知发起者「有人留了话」', () => {
    const view = describeNotification({ ...base, type: 'MESSAGE_DELIVERED' });
    expect(view.label).toContain('私密留言');
    expect(view.detail).toContain('深海鲸落');
    expect(view.href).toBe('/bottles/b1');
    expect(view.tone).toBe('info');
  });

  it('留言未送达：直说「未送达」并解释原因（CONTEXT §5.2）', () => {
    const view = describeNotification({ ...base, type: 'MESSAGE_UNDELIVERED' });
    expect(view.label).toContain('未送达');
    expect(view.detail).toContain('公海');
    expect(view.tone).toBe('warning');
  });

  it('作品完成：用内核算出的 isComplete 决定文案，不把未完成说成已完成', () => {
    const done = describeNotification({
      ...base,
      type: 'BOTTLE_COMPLETED',
      payload: { bottleId: 'b1', songTitle: '深海鲸落', isComplete: true },
    });
    expect(done.label).toContain('已完成');
    expect(done.href).toBe('/sea/b1');
    expect(done.tone).toBe('success');

    const incomplete = describeNotification({
      ...base,
      type: 'BOTTLE_COMPLETED',
      payload: { bottleId: 'b1', songTitle: '深海鲸落', isComplete: false },
    });
    expect(incomplete.label).not.toContain('已完成');
  });

  it('曲名缺失时不显示书名号空壳（payload 是弱类型，必须容错）', () => {
    const view = describeNotification({
      id: 'n2',
      type: 'BOTTLE_COMPLETED',
      payload: { bottleId: 'b1' },
      readAt: null,
    });
    expect(view.detail).not.toContain('《》');
    expect(view.detail).not.toContain('undefined');
  });

  it('未知类型有兜底文案，不把类型码漏给用户（但仍能按 payload 定位到瓶子）', () => {
    const view = describeNotification({ ...base, type: 'SOMETHING_NEW' });
    expect(view.label.length).toBeGreaterThan(0);
    expect(view.label).not.toContain('SOMETHING_NEW');
    expect(view.detail).not.toContain('SOMETHING_NEW');
    expect(view.href).toBe('/bottles/b1');
  });

  it('payload 里没有 bottleId 时不给链接（不造死链）', () => {
    const view = describeNotification({
      id: 'n3',
      type: 'SOMETHING_NEW',
      payload: {},
      readAt: null,
    });
    expect(view.href).toBeNull();
  });
});
