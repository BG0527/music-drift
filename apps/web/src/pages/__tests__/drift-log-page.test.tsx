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

  /**
   * record-v1 的 `/bottles/:id/log` 装置：**半沉螺旋刻痕**（实施计划 §5.1）。
   *
   * 一笔＝一条日志；**只有最新一笔是湿的**（"刚刚发生过的事"）。刻痕的序号直接取服务端
   * `seq`（客户端不重排、不自己编号），所以螺旋上的顺序与右边时间线必然一致。
   */
  it('半沉螺旋刻痕：一笔一条刻痕，且只有最新一笔是湿的', async () => {
    renderWithProviders(<DriftLogPage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}/log`,
      handlers: [
        { path: `/api/bottles/${BOTTLE_ID}/events`, respond: () => ({ body: EVENTS }) },
        { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: bottleDetail() }) },
      ],
    });

    const scratch = await screen.findByTestId('log-scratch');
    // 3 条核心操作 ⇒ 3 道刻痕（被过滤掉的斩浪 / 点跩不算）
    expect(scratch).toHaveAttribute('data-marks', '3');
    const marks = scratch.querySelectorAll('[data-mark]');
    expect(marks).toHaveLength(3);
    // 序号是服务端的 seq（1 / 2 / 5），不是本地 1..3
    expect([...marks].map((mark) => mark.getAttribute('data-seq'))).toEqual(['1', '2', '5']);

    const wet = scratch.querySelectorAll('[data-wet="true"]');
    expect(wet).toHaveLength(1);
    expect(wet[0]).toHaveAttribute('data-seq', '5');
  });

  /**
   * record-v1 逐值复核（基准：`docs/ui-review/design-explore/p-driftlog-record.html`）：
   * 刻痕语法表**色＝归处**的 alpha 逐字、标题/图例字距、灰字色值、末行珊瑚刻痕位置。
   */
  it('逐值照设计稿：语法表色值、标题/图例字距、灰字 paper/50、珊瑚刻痕 -14px', async () => {
    renderWithProviders(<DriftLogPage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}/log`,
      handlers: [
        { path: `/api/bottles/${BOTTLE_ID}/events`, respond: () => ({ body: FULL_EVENTS }) },
        { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: bottleDetail() }) },
      ],
    });

    const legend = await screen.findByTestId('log-legend');
    const captionSvg = (caption: string): string => {
      const item = [...legend.querySelectorAll('li')].find(
        (li) => li.querySelector('span')?.textContent === caption,
      );
      expect(item, `图例应有「${caption}」`).toBeDefined();
      return item!.querySelector('svg')!.getAttribute('class') ?? '';
    };
    // 语法表：长度＝重量（不改），**色＝归处**的 alpha 逐值（设计稿 stroke 的字面值）
    expect(captionSvg('发起')).toContain('text-glass/95'); // rgba(127,209,217,.95)
    expect(captionSvg('接唱')).toContain('text-paper/85'); // rgba(243,249,250,.85)
    expect(captionSvg('投河')).toContain('text-glass/62'); // rgba(127,209,217,.62)
    expect(captionSvg('捞取')).toContain('text-muted/62'); // rgba(169,199,207,.62)
    expect(captionSvg('回传')).toContain('text-warm/90'); // rgba(246,215,154,.9)

    // 图例 caption：12px + letter-spacing .03em
    const firstCaption = legend.querySelector('li span')!;
    expect(firstCaption).toHaveClass('tracking-[0.03em]');

    // 标题：56px 700 与 letter-spacing .02em
    expect(screen.getByRole('heading', { level: 1, name: '漂流日志' })).toHaveClass(
      'tracking-[0.02em]',
    );

    // .cat 灰字 = paper/50（设计稿 .cat color:rgba(243,249,250,.5)，全站 META 同款）
    expect(screen.getByText('SIDE A · 刻痕')).toHaveClass('text-paper/50');
    expect(screen.getByText('曲名')).toHaveClass('text-paper/50');
    expect(screen.getByText('道刻痕')).toHaveClass('text-paper/50');

    // 时间线：seq 与 at 灰字 = paper/50（设计稿 .roll .seq/.at color:rgba(243,249,250,.5)）
    const list = await screen.findByTestId('drift-log');
    const items = within(list).getAllByRole('listitem');
    const firstSpans = items[0]!.querySelectorAll('span');
    expect(firstSpans[0]).toHaveClass('text-paper/50'); // #NN
    expect(firstSpans[firstSpans.length - 1]).toHaveClass('text-paper/50'); // 时间

    // 末行珊瑚刻痕边：left -14px、top/bottom 10px、宽 2px
    const coralEdge = items[items.length - 1]!.querySelector('span[aria-hidden="true"]');
    expect(coralEdge).toHaveClass('left-[-14px]', 'inset-y-[10px]', 'w-[2px]', 'bg-coral');

    // 螺旋上的刻痕编号灰字 = paper/50（设计稿 text fill rgba(243,249,250,.5)）
    const scratch = await screen.findByTestId('log-scratch');
    const num = scratch.querySelector('text');
    expect(num).toHaveClass('text-paper/50');
  });

  it('螺旋上的操作名与时间线同源：只列这份日志里真的发生过的操作', async () => {
    renderWithProviders(<DriftLogPage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}/log`,
      handlers: [
        { path: `/api/bottles/${BOTTLE_ID}/events`, respond: () => ({ body: EVENTS }) },
        { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: bottleDetail() }) },
      ],
    });

    const legend = await screen.findByTestId('log-legend');
    expect(legend.textContent).toContain('发起');
    expect(legend.textContent).toContain('接唱');
    expect(legend.textContent).toContain('投河');
    // 没有发生过的操作不许出现在图例里（凭空多一个就是编造业务事实）
    expect(legend.textContent).not.toContain('入海');
    expect(legend.textContent).not.toContain('回传');
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

/** 逐值复核用：覆盖语法表里五种有色差的归处（发起 / 接唱 / 捞取 / 投河 / 回传）。 */
const FULL_EVENTS = [
  bottleEvent({ seq: 1, type: 'BOTTLE_CREATED', actorId: USER_A }),
  bottleEvent({ seq: 2, type: 'SEGMENT_RECORDED', actorId: USER_A }),
  bottleEvent({ seq: 3, type: 'BOTTLE_DRAWN', actorId: USER_A }),
  bottleEvent({ seq: 4, type: 'BOTTLE_CAST_TO_RIVER', actorId: USER_A }),
  bottleEvent({ seq: 5, type: 'BOTTLE_RETURNED', actorId: USER_A }),
];
