import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BOTTLE_ID, USER_A, bottleDetail, bottleEvent } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { DriftLogPage } from '../drift-log-page';

/** 漂流日志（CONTEXT §9）：**只给时间线**，按 seq 升序；客户端不本地推算时间线。 */
describe('漂流日志页', () => {
  it('按 seq 升序展示中文事件说明，系统行为显示成「系统」', async () => {
    renderWithProviders(<DriftLogPage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}/log`,
      handlers: [
        { path: `/api/bottles/${BOTTLE_ID}/events`, respond: () => ({ body: EVENTS }) },
        { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: bottleDetail() }) },
      ],
    });

    const list = await screen.findByTestId('drift-log');
    const items = within(list).getAllByRole('listitem');
    // 精简后只剩三条核心操作（发起 / 接唱 / 投河）：斩浪与点跩都不在日志里
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.textContent).join('|')).not.toContain('斩浪');
    expect(items.map((item) => item.textContent).join('|')).not.toContain('投了一票');
    expect(items[0]!.textContent).toContain('发起');
    expect(items[0]!.textContent).toContain('午夜歌手#042');
    expect(items[1]!.textContent).toContain('接唱');
    expect(items[2]!.textContent).toContain('投河');
    // 不允许把事件类型枚举漏成界面文案
    expect(list.textContent).not.toContain('SEGMENT_CUT');
    expect(list.textContent).not.toContain('VOTE_CAST');
  });

  it('瓶子不存在 / 没有事件（404）时用可读提示，不白屏', async () => {
    renderWithProviders(<DriftLogPage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}/log`,
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}/events`,
          respond: () => ({
            status: 404,
            body: { error: { message: '找不到这个资源。', violations: [] } },
          }),
        },
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            status: 404,
            body: { error: { message: '找不到这个资源。', violations: [] } },
          }),
        },
      ],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('这个漂流瓶不在这里');
  });
});

const EVENTS = [
  bottleEvent({ seq: 1, type: 'BOTTLE_CREATED', actorId: USER_A }),
  bottleEvent({ seq: 2, type: 'SEGMENT_RECORDED', actorId: USER_A }),
  // 下面两条是**该被过滤掉**的：系统行为（斩浪）与互动流水（点跩）
  bottleEvent({ seq: 3, type: 'SEGMENT_CUT', actorId: 'SYSTEM' }),
  bottleEvent({ seq: 4, type: 'VOTE_CAST', actorId: USER_A }),
  bottleEvent({ seq: 5, type: 'BOTTLE_CAST_TO_RIVER', actorId: USER_A }),
];
