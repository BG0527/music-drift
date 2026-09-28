import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BOTTLE_ID, bottleDetail, bottleEvent } from '../../test/fixtures';
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
   * 逐块照抄 `docs/ui-review/design-explore/p-driftlog-record.html`（record-v1）：
   * main 边距（稿 64/76/0 → 流体）、背景三层、页头逐字与字号字距、右上统计、
   * 七项刻痕语法表（svg 逐值）、时间线 grid 与行线、480×540 刻痕盘（defs/湿痕/水汪/瓶逐值）。
   * 唯一翻译 = 固定 px → 流体。
   */
  it('逐值照稿：main 边距、背景三层、页头、右上统计、语法表七项、时间线 grid、刻痕盘', async () => {
    renderWithProviders(<DriftLogPage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}/log`,
      handlers: [
        { path: `/api/bottles/${BOTTLE_ID}/events`, respond: () => ({ body: ALL_OPS_EVENTS }) },
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({ body: bottleDetail({ isComplete: true }) }),
        },
      ],
    });

    /* ── 页面自带 <main>（稿 padding 64px 76px 0 → 流体 4.444vw / 5.278vw）──── */
    await screen.findByRole('heading', { level: 1, name: '漂流日志' });
    const main = document.querySelector('main');
    expect(main, '页面自带 <main>（外壳不渲染）').not.toBeNull();
    const mainCls = main!.getAttribute('class') ?? '';
    expect(mainCls, '水平边距 = 稿 76px 的流体值').toContain('px-[max(1.5rem,5.278vw)]');
    expect(mainCls, '顶部边距 = 稿 64px 的流体值').toContain('pt-[max(2.5rem,4.444vw)]');
    expect(mainCls, '底部 = 稿 0').toContain('pb-0');

    /* ── 背景三层（稿 .clip：platter / glint / waterlight）──────────────────── */
    expect(main!.querySelector('.platter'), '盘面细纹层').not.toBeNull();
    expect(main!.querySelector('.glint'), '斜向高光层').not.toBeNull();
    expect(main!.querySelector('.waterlight'), '水面光带层').not.toBeNull();

    /* ── 页头：crumb（稿 svg 逐值 8×12）+ cat + h1 + sub 逐字 ───────────────── */
    const crumb = screen.getByRole('link', { name: '回漂流瓶' });
    expect(crumb.className).toContain('gap-[7px]');
    expect(crumb.className).toContain('px-[12px]');
    expect(crumb.className).toContain('rounded-[2px]');
    expect(crumb.className).toContain('border-[rgba(243,249,250,0.16)]');
    expect(crumb.className).toContain('text-[12.5px]');
    const crumbSvg = crumb.querySelector('svg')!;
    expect(crumbSvg.getAttribute('width')).toBe('8');
    expect(crumbSvg.getAttribute('height')).toBe('12');
    expect(crumbSvg.getAttribute('viewBox')).toBe('0 0 8 12');
    expect(crumbSvg.innerHTML).toContain('M6.4 1.2 1.8 6l4.6 4.8');
    expect(crumbSvg.innerHTML).toContain('stroke-width="1.4"');

    const cat = screen.getByText('SIDE A · 刻痕');
    expect(cat.className).toContain('mt-[16px]');
    expect(cat.className).toContain('text-[11px]');
    expect(cat.className).toContain('tracking-[0.24em]');
    expect(cat.className, '.cat = paper/.5').toContain('text-paper/50');

    const h1 = screen.getByRole('heading', { level: 1, name: '漂流日志' });
    expect(h1.className).toContain('mt-[14px]');
    expect(h1.className).toContain('tracking-[0.02em]');
    expect(h1.className, 'h1 上限 56px').toContain('3.5rem');
    expect(h1.className).toContain('font-bold');

    const sub = screen.getByText(
      '这里只记核心操作：发起、接唱、捞取、投河、回传、入海。操作者只显示匿名代号。',
    );
    expect(sub.className).toContain('mt-[14px]');
    expect(sub.className).toContain('max-w-[730px]');
    expect(sub.className).toContain('text-[15px]');
    expect(sub.className).toContain('leading-[1.85]');

    /* ── 右上统计（稿 .hright：曲名 / 曲 / N / 道刻痕）──────────────────────── */
    const songCat = screen.getByText('曲名');
    expect(songCat.className).toContain('text-[11px]');
    expect(songCat.className).toContain('tracking-[0.24em]');
    expect(songCat.className).toContain('text-paper/50');
    expect(screen.getByText('深海鲸落').className).toContain('text-[19px]');
    const count = screen.getByText('7');
    expect(count.className).toContain('text-[30px]');
    expect(count.className).toContain('text-glass');
    expect(screen.getByText('道刻痕').className).toContain('mt-[2px]');

    /* ── 刻痕语法表：七项 figcaption 逐字 + 每个 svg 逐值（44×30、基准线、切口）── */
    const legend = await screen.findByTestId('log-legend');
    const figures = [...legend.querySelectorAll('figure')];
    expect(
      figures.map((fig) => fig.querySelector('figcaption')?.textContent),
      '七项顺序照稿：发起 接唱 投河 捞取 回传 完成 入海',
    ).toEqual(['发起', '接唱', '投河', '捞取', '回传', '完成', '入海']);
    for (const fig of figures) {
      const svg = fig.querySelector('svg')!;
      expect(svg.getAttribute('viewBox')).toBe('0 0 44 30');
      expect(svg.getAttribute('width')).toBe('44');
      expect(svg.getAttribute('height')).toBe('30');
      expect(svg.innerHTML, '公共竖基准线').toContain('d="M6 8v14"');
      const caption = fig.querySelector('figcaption')!;
      expect(caption.className).toContain('text-[12px]');
      expect(caption.className).toContain('tracking-[0.03em]');
      expect(caption.className).toContain('text-muted');
    }
    const legendSvg = (caption: string): string =>
      figures.find((fig) => fig.querySelector('figcaption')?.textContent === caption)!
        .querySelector('svg')!
        .innerHTML;
    const legendClass = (caption: string): string =>
      figures.find((fig) => fig.querySelector('figcaption')?.textContent === caption)!
        .querySelector('svg')!
        .getAttribute('class') ?? '';
    // 长度＝重量，色＝归处（稿 stroke 字面值 → 同值 token 类）
    expect(legendSvg('发起')).toContain('d="M6 15h26"');
    expect(legendSvg('发起')).toContain('stroke-width="2.4"');
    expect(legendClass('发起')).toContain('text-glass/95');
    expect(legendSvg('接唱')).toContain('d="M6 15h18"');
    expect(legendSvg('接唱')).toContain('stroke-width="1.8"');
    expect(legendClass('接唱')).toContain('text-paper/85');
    expect(legendSvg('投河')).toContain('d="M6 15h14"');
    expect(legendClass('投河')).toContain('text-glass/62');
    expect(legendSvg('捞取')).toContain('d="M6 15h11"');
    expect(legendClass('捞取')).toContain('text-muted/62');
    expect(legendSvg('回传')).toContain('d="M6 15h21"');
    expect(legendClass('回传')).toContain('text-warm/90');
    // 完成 = 双刻线（两道 1.6）
    expect(legendSvg('完成')).toContain('d="M6 13.5h20"');
    expect(legendSvg('完成')).toContain('d="M6 16.5h20"');
    expect(legendSvg('完成')).toContain('stroke-width="1.6"');
    expect(legendClass('完成')).toContain('text-paper');
    expect(legendSvg('入海')).toContain('d="M6 15h30"');
    expect(legendSvg('入海')).toContain('stroke-width="2.4"');
    expect(legendClass('入海')).toContain('text-coral');

    /* ── 时间线：grid 52px 1fr 126px 150px、py11、行线 .07 / 末行 .13、珊瑚边 ── */
    const list = await screen.findByTestId('drift-log');
    expect(list.tagName).toBe('OL');
    expect(list.className, '卷首线 = var(--line) .13').toContain('border-line/13');
    // 1440 横向溢出修复：lg 下卷是右栏（左边距 43.8%），宽度必须让出左边距——
    // `w-full`（= 容器 100%）与百分比左边距叠加会把卷右缘推出视口
    // （76 + 43.8%×1288 + 1288 = 1928 > 1440）。
    expect(list.className, 'lg 右栏宽度让位（100% − 43.8%）').toContain('lg:w-auto');
    expect(list.className, '右栏起点仍是稿的 43.8%').toContain('lg:ml-[43.8%]');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(7);
    expect(items[0]!.className).toContain('md:grid-cols-[52px_1fr_126px_150px]');
    expect(items[0]!.className).toContain('md:items-baseline');
    expect(items[0]!.className).toContain('py-[11px]');
    expect(items[0]!.className, '行线 rgba(243,249,250,.07)').toContain('border-line/7');
    expect(items[0]!.className).not.toContain('border-line/13');
    const lastItem = items[items.length - 1]!;
    expect(lastItem.className, '末行行线 = var(--line) .13').toContain('border-line/13');
    const coralEdge = lastItem.querySelector('span[aria-hidden="true"]');
    expect(coralEdge).toHaveClass('left-[-14px]', 'inset-y-[10px]', 'w-[2px]', 'bg-coral');

    const spans = items[0]!.querySelectorAll('span');
    expect(spans).toHaveLength(4);
    expect(spans[0]!.className).toContain('text-[11px]'); // .seq
    expect(spans[0]!.className).toContain('tracking-[0.08em]');
    expect(spans[0]!.className).toContain('text-paper/50');
    expect(spans[1]!.className).toContain('text-[17px]'); // .op
    expect(spans[1]!.className).toContain('leading-[1.4]');
    expect(spans[1]!.className).toContain('md:pr-[18px]');
    expect(spans[2]!.className).toContain('text-[14px]'); // .who（匿名代号，无图标）
    expect(spans[2]!.className).toContain('text-muted');
    expect(spans[3]!.className).toContain('text-[12px]'); // .at
    expect(spans[3]!.className).toContain('text-paper/50');
    expect(spans[3]!.className).toContain('md:text-right');

    /* ── 刻痕盘：480×540、translate(8 4)、defs 逐值、水汪逐值、瓶在水里 ──────── */
    const lathe = screen.getByTestId('log-scratch');
    expect(lathe.tagName).toBe('svg');
    expect(lathe.getAttribute('viewBox')).toBe('0 0 480 540');
    expect(lathe.getAttribute('width')).toBe('480');
    expect(lathe.getAttribute('height')).toBe('540');
    expect(lathe.querySelector('g[transform="translate(8 4)"]'), '稿的内层平移').not.toBeNull();

    const markup = lathe.innerHTML;
    // defs #wet：冷光水痕渐变（稿 #cbeef6 → water-mid token；断言原文→新文：字面 hex → var(--color-*)，禁内联 hex）
    expect(markup).toContain('id="wet"');
    expect(markup).toContain('stop-color="var(--color-water-mid)" stop-opacity=".34"');
    expect(markup).toContain('offset=".45" stop-color="var(--color-water-mid)" stop-opacity=".13"');
    expect(markup).toContain('offset="1" stop-color="var(--color-water-mid)" stop-opacity="0"');
    // defs #spill：那汪水（稿 #7fd1d9 → glass token）
    expect(markup).toContain('id="spill"');
    expect(markup).toContain('stop-color="var(--color-glass)" stop-opacity=".46"');
    // 湿痕压在最新一笔下面（stroke=url(#wet)、宽 9）
    expect(markup).toContain('stroke="url(#wet)"');
    expect(markup).toContain('stroke-width="9"');
    // 盘心
    expect(markup).toContain('cx="197" cy="242" r="2.6" fill="rgba(127,209,217,.5)"');
    // 盘边那汪水 + 溅开的一滴（稿逐值）
    expect(markup).toContain('d="M62 484 C58 473 80 467 102 469');
    expect(markup).toContain('stroke="rgba(203,238,246,.26)"');
    expect(markup).toContain('cx="166" cy="492" rx="6" ry="3"');
    // 瓶子停在水里（稿的 translate(101 487) rotate(-26) scale(.8) + 瓶母题）
    const bottle = lathe.querySelector('g[transform="translate(101 487) rotate(-26) scale(.8)"]');
    expect(bottle, '瓶的落位照稿').not.toBeNull();
    expect(bottle!.querySelector('[data-filled]'), '瓶母题（BottleMark）').not.toBeNull();
    // 刻痕编号灰字 = paper/50（稿 text fill rgba(243,249,250,.5)）
    expect(lathe.querySelector('text')).toHaveClass('text-paper/50');
  });

  it('图例只列这份日志里真的发生过的操作（凭空多一个就是编造业务事实）', async () => {
    renderWithProviders(<DriftLogPage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}/log`,
      handlers: [
        { path: `/api/bottles/${BOTTLE_ID}/events`, respond: () => ({ body: EVENTS }) },
        { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: bottleDetail() }) },
      ],
    });

    const legend = await screen.findByTestId('log-legend');
    const captions = [...legend.querySelectorAll('figcaption')].map((node) => node.textContent);
    expect(captions).toContain('发起');
    expect(captions).toContain('接唱');
    expect(captions).toContain('投河');
    // 没有发生过的操作不许出现在图例里
    expect(captions).not.toContain('入海');
    expect(captions).not.toContain('回传');
    expect(captions).not.toContain('完成');
  });
});

const EVENTS = [
  bottleEvent({ seq: 1, type: 'BOTTLE_CREATED', actorCode: '午夜歌手#042' }),
  bottleEvent({ seq: 2, type: 'SEGMENT_RECORDED', actorCode: '午夜歌手#042' }),
  // 下面两条是**该被过滤掉**的：系统行为（斩浪）与互动流水（点跩）
  bottleEvent({ seq: 3, type: 'SEGMENT_CUT', actorCode: '系统' }),
  bottleEvent({ seq: 4, type: 'VOTE_CAST', actorCode: '午夜歌手#042' }),
  bottleEvent({ seq: 5, type: 'BOTTLE_CAST_TO_RIVER', actorCode: '午夜歌手#042' }),
];

/** 逐值复核用：稿语法表的**全部七种切口**（发起 接唱 投河 捞取 回传 完成 入海）。 */
const ALL_OPS_EVENTS = [
  bottleEvent({ seq: 1, type: 'BOTTLE_CREATED', actorCode: '午夜歌手#042' }),
  bottleEvent({ seq: 2, type: 'SEGMENT_RECORDED', actorCode: '午夜歌手#042' }),
  bottleEvent({ seq: 3, type: 'BOTTLE_CAST_TO_RIVER', actorCode: '午夜歌手#042' }),
  bottleEvent({ seq: 4, type: 'BOTTLE_DRAWN', actorCode: '午夜歌手#042' }),
  bottleEvent({ seq: 5, type: 'BOTTLE_RETURNED', actorCode: '午夜歌手#042' }),
  // isComplete=true ⇒ 最后一次接唱（seq 6）显示成「完成」
  bottleEvent({ seq: 6, type: 'SEGMENT_RECORDED', actorCode: '午夜歌手#042' }),
  bottleEvent({ seq: 7, type: 'BOTTLE_WENT_TO_SEA', actorCode: '午夜歌手#042' }),
];
