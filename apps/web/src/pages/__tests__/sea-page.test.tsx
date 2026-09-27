import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BOTTLE_ID, bottleSummary } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { SeaPage } from '../sea-page';

/** 稿 p-sea-hall 的顶部文案（逐字）。 */
const TOPBAR_LEFT = '音乐漂流瓶 · MUSIC DRIFT';
const TOPBAR_RIGHT = 'CATALOGUE OF THE OPEN SEA';
const LEDE =
  '聆听那些经历漂流与合唱、完全绽放的终极乐章。作品一旦入海就不再漂流 —— 这里只能听，不能接。';

/** 页面自带的稿级样式（组件内 <style>）。 */
function styleOf(container: HTMLElement): string {
  return container.querySelector('style')?.textContent ?? '';
}

/** 一页六支的桩（真实数据位：曲名/段数/时间都来自 BottleSummary）。 */
function sixBottlesHandler() {
  const items = Array.from({ length: 6 }, (_unused, index) =>
    bottleSummary({
      id: `30000000-0000-4000-8000-00000000000${String(index + 1)}`,
      songTitle: `到岸之${String(index + 1)}`,
    }),
  );
  return [
    {
      path: '/api/sea?zone=COMPLETED&limit=6',
      respond: () => ({ body: { items, nextCursor: null } }),
    },
  ];
}

const oneBottle = [
  {
    path: '/api/sea?zone=COMPLETED&limit=6',
    respond: () => ({ body: { items: [bottleSummary()], nextCursor: null } }),
  },
];

/** 公海（record-v1 设计稿 p-sea-hall）：默认只看**完整作品**，未完成作品要显式切分区。 */
describe('公海大厅 · 数据与交互', () => {
  it('默认请求完整作品分区，并列出作品（曲名 + 段数）', async () => {
    const { fetchMock } = renderWithProviders(<SeaPage />, { handlers: oneBottle });
    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();
    expect(fetchMock.calls.some((call) => call.url.includes('zone=COMPLETED'))).toBe(true);
  });

  it('切到「等待接力」时请求未完成分区，并显示缺口标注', async () => {
    const { fetchMock } = renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [], nextCursor: null } }),
        },
        {
          path: '/api/sea?zone=INCOMPLETE&limit=6',
          respond: () => ({
            body: {
              items: [
                bottleSummary({
                  status: 'SEA',
                  seaZone: 'INCOMPLETE',
                  isComplete: false,
                  recordedCount: 2,
                  missingSegmentIndexes: [2, 4],
                }),
              ],
              nextCursor: null,
            },
          }),
        },
      ],
    });
    fireEvent.click(screen.getByRole('tab', { name: '等待接力' }));
    expect(await screen.findByText(/缺第 2、4 段/)).toBeInTheDocument();
    expect(fetchMock.calls.some((call) => call.url.includes('zone=INCOMPLETE'))).toBe(true);
  });

  it('空分区用空态（说明为什么空 + 去河道），不是错误', async () => {
    renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [], nextCursor: null } }),
        },
      ],
    });
    expect(await screen.findByText(/还没有完整的作品/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  /**
   * 页码式分页（用户第十三轮 ②）。后端是 cursor/keyset ⇒ 页码 = 游标链上的索引，不自造 offset。
   * 下面两例是**缺 total 的回退口径**（响应没带 total 时）：页码数 = 已取页数 + (hasNextPage ? 1 : 0)；
   * 带 total 时的「一次全显」见文件末尾的 total 驱动用例。
   */
  it('只有一页（nextCursor = null）：页码里只有 1，不会凭空多出第 2 页（禁止假分页）', async () => {
    const { fetchMock } = renderWithProviders(<SeaPage />, { handlers: oneBottle });

    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '第 1 页' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryByRole('button', { name: '第 2 页' })).not.toBeInTheDocument();
    expect(fetchMock.calls.filter((call) => call.url.includes('/api/sea')).length).toBe(1);
  });

  it('nextCursor 非 null：出现页码 1 / 2，状态位是稿的「第 1 页 · 后面还有更多」', async () => {
    renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [bottleSummary()], nextCursor: '游标一' } }),
        },
      ],
    });

    expect(await screen.findByRole('button', { name: '第 2 页' })).toBeInTheDocument();
    expect(screen.getByText('第 1 页 · 后面还有更多')).toBeInTheDocument();
    expect(screen.queryByText(/加载更多/)).not.toBeInTheDocument();
  });

  it('点第 2 页：带上 cursor 取第二页，并**只显示第二页**（不是追加）', async () => {
    const { fetchMock } = renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [bottleSummary()], nextCursor: '游标一' } }),
        },
        {
          path: /cursor=%E6%B8%B8%E6%A0%87%E4%B8%80/,
          respond: () => ({
            body: {
              items: [
                bottleSummary({
                  id: '22222222-2222-4222-8222-222222222222',
                  songTitle: '第二页的歌',
                }),
              ],
              nextCursor: null,
            },
          }),
        },
      ],
    });

    fireEvent.click(await screen.findByRole('button', { name: '第 2 页' }));

    expect(await screen.findByText('第二页的歌')).toBeInTheDocument();
    expect(screen.queryByText('深海鲸落')).not.toBeInTheDocument();
    expect(fetchMock.calls.some((call) => call.url.includes('cursor=%E6%B8%B8%E6%A0%87%E4%B8%80'))).toBe(
      true,
    );
  });

  it('回到第 1 页：用缓存，不再发请求', async () => {
    const { fetchMock } = renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [bottleSummary()], nextCursor: '游标一' } }),
        },
        {
          path: /cursor=%E6%B8%B8%E6%A0%87%E4%B8%80/,
          respond: () => ({
            body: {
              items: [
                bottleSummary({
                  id: '22222222-2222-4222-8222-222222222222',
                  songTitle: '第二页的歌',
                }),
              ],
              nextCursor: null,
            },
          }),
        },
      ],
    });

    fireEvent.click(await screen.findByRole('button', { name: '第 2 页' }));
    expect(await screen.findByText('第二页的歌')).toBeInTheDocument();
    const afterSecond = fetchMock.calls.filter((call) => call.url.includes('/api/sea')).length;

    fireEvent.click(screen.getByRole('button', { name: '第 1 页' }));

    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();
    expect(fetchMock.calls.filter((call) => call.url.includes('/api/sea')).length).toBe(afterSecond);
  });

  it('服务端故障时给中文说明与重试，不白屏', async () => {
    renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({
            status: 503,
            body: { error: { message: '服务器出了点问题，请稍后再试。', violations: [] } },
          }),
        },
      ],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('服务器暂时不可用');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });
});

/**
 * 稿 `docs/ui-review/design-explore/p-sea-hall.html` 逐块落地的结构断言。
 * 块清单与顺序：.topbar → .rule → header.hero → .zones → 页级 .clip(水线/涟漪) →
 * .fleet 六支瓶 → 空态稿块 → .foot(.tail + .pages)。
 */
describe('公海大厅 · p-sea-hall 稿逐块', () => {
  it('.topbar 两行 meta 逐字（音乐漂流瓶 · MUSIC DRIFT / CATALOGUE OF THE OPEN SEA）', async () => {
    const { container } = renderWithProviders(<SeaPage />, { handlers: oneBottle });
    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();

    const topbar = container.querySelector('.topbar');
    expect(topbar, '稿第一块 .topbar 必须在').not.toBeNull();
    const metas = topbar?.querySelectorAll('p.meta') ?? [];
    expect(metas).toHaveLength(2);
    expect(metas[0]?.textContent).toBe(TOPBAR_LEFT);
    expect(metas[1]?.textContent).toBe(TOPBAR_RIGHT);
  });

  it('.rule 在 topbar 之下：1px 细线 + 左端 88px coral 段（稿 .rule i）', async () => {
    const { container } = renderWithProviders(<SeaPage />, { handlers: oneBottle });
    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();

    expect(container.querySelector('.rule i'), '左端 coral 段').not.toBeNull();
    const css = styleOf(container);
    expect(css, '.rule i 的样式必须在稿级 <style> 里').toContain('.sea-hall .rule i');
    expect(css, 'coral 段取 token').toContain('var(--color-coral)');
    expect(css, '稿值：88px 宽').toContain('width:88px');
  });

  it('header.hero：h1 公海大厅（60px 稿值）+ lede 逐字', async () => {
    const { container } = renderWithProviders(<SeaPage />, { handlers: oneBottle });
    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();

    const hero = container.querySelector('header.hero');
    expect(hero, '稿第三块 header.hero 必须在').not.toBeNull();
    expect(hero?.querySelector('h1')?.textContent).toBe('公海大厅');
    expect(hero?.querySelector('.lede')?.textContent).toBe(LEDE);
    expect(styleOf(container), 'h1 稿值 60px').toContain('font-size:60px');
  });

  it('.zones：「分区 · SECTIONS」+ tablist 两 tab；计数位算不出总数 ⇒ 留空', async () => {
    const { container } = renderWithProviders(<SeaPage />, { handlers: oneBottle });
    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();

    const zones = container.querySelector('.zones');
    expect(zones, '稿第四块 .zones 必须在').not.toBeNull();
    expect(zones?.querySelector('.meta')?.textContent).toBe('分区 · SECTIONS');

    const tabs = container.querySelectorAll('[role="tablist"] [role="tab"]');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.textContent).toBe('完整作品');
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[1]?.textContent).toBe('等待接力');
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('false');
    // 计数位：接口只有 items + nextCursor，算不出分区总数 ⇒ 稿里的 39/12 留空
    const counts = zones?.querySelectorAll('li .n') ?? [];
    expect(counts).toHaveLength(2);
    for (const count of counts) expect(count.textContent).toBe('');
  });

  it('切分区：aria-selected 翻转（稿的选中态 coral 下划线样式在位）', async () => {
    const { container } = renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [], nextCursor: null } }),
        },
        {
          path: '/api/sea?zone=INCOMPLETE&limit=6',
          respond: () => ({ body: { items: [], nextCursor: null } }),
        },
      ],
    });
    expect(await screen.findByText(/还没有完整的作品/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '等待接力' }));
    const tabs = container.querySelectorAll('[role="tab"]'); // 同步翻转
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('false');
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
    expect(styleOf(container), '选中态 = 稿的 coral 下划线').toContain(
      "[aria-selected='true']",
    );
  });

  it('页级 .clip（稿的底图十块）在 <main> 之前：sky/beam/platter/glint/shafts/lit/abyss/seabed/sed/bub', async () => {
    const { container } = renderWithProviders(<SeaPage />, { handlers: oneBottle });
    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();

    const clip = container.querySelector('.clip');
    const main = container.querySelector('main');
    expect(clip, '稿的 .clip 必须在').not.toBeNull();
    expect(main, '页面自带 <main>').not.toBeNull();
    expect(clip?.getAttribute('aria-hidden')).toBe('true');
    expect(
      (clip?.compareDocumentPosition(main as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
      '.clip 必须在 main 之前（稿顺序）',
    ).toBeTruthy();

    for (const layer of [
      '.sky',
      '.beam',
      '.platter',
      '.glint',
      '.shafts',
      '.lit',
      '.abyss',
      '.seabed',
      '.sed',
      '.bub',
    ]) {
      expect(clip?.querySelector(layer), `底图缺 ${layer}`).not.toBeNull();
    }
    expect(clip?.querySelectorAll('.sed i')).toHaveLength(7);
    expect(clip?.querySelectorAll('.bub i')).toHaveLength(16);
  });

  it('页级 .surface 水线 + .rings 涟漪（稿参数；稿放哪就放哪：.clip 内、main 之前）', async () => {
    const { container } = renderWithProviders(<SeaPage />, { handlers: oneBottle });
    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();

    const surface = container.querySelector('.clip svg.surface');
    expect(surface, '页级水线 SVG').not.toBeNull();
    expect(surface?.getAttribute('viewBox')).toBe('0 0 1440 900');
    expect(surface?.querySelector('path[stroke-width="26"]'), '宽软光带 stroke 26').not.toBeNull();
    expect(surface?.querySelector('path[stroke-width="1.1"]'), '1px 实线').not.toBeNull();

    const rings = container.querySelector('.clip svg.rings');
    expect(rings, '页级涟漪 SVG').not.toBeNull();
    expect(
      rings?.querySelectorAll('g[stroke-dasharray="26 24 26 24"] ellipse'),
      '外圈 6 枚（dasharray 26 24 26 24）',
    ).toHaveLength(6);
    const inner = rings?.querySelectorAll('ellipse[stroke-dasharray="18 7"]') ?? [];
    expect(inner.length, '内圈 6 枚（4 段断弧 = 4 个段位）').toBe(6);
    expect(inner[0]?.getAttribute('pathLength')).toBe('100');
  });

  it('.fleet 六支 col 结构照稿：sounding + bottle(glass(note×5, sub) + cork) + entry(song/rec/st/tm/listen)', async () => {
    const { container } = renderWithProviders(<SeaPage />, { handlers: sixBottlesHandler() });
    expect(await screen.findByText('到岸之6')).toBeInTheDocument();

    const cols = container.querySelectorAll('ul.fleet > li.col');
    expect(cols, '稿的六支列').toHaveLength(6);

    const first = cols[0];
    expect(first, '第 1 支').toBeDefined();
    const sounding = first?.querySelector('.sounding');
    expect(sounding?.getAttribute('aria-hidden')).toBe('true');

    const bottle = first?.querySelector('.bottle');
    expect(bottle?.getAttribute('aria-hidden'), '装置对读屏隐藏').toBe('true');
    expect(first?.querySelector('.bottle .glass'), '玻璃瓶身').not.toBeNull();
    expect(first?.querySelectorAll('.bottle .note i'), '五根音符条').toHaveLength(5);
    expect(first?.querySelector('.bottle .glass .sub'), '水下的一截').not.toBeNull();
    expect(first?.querySelector('.bottle .cork'), '木塞').not.toBeNull();

    const entry = first?.querySelector('.entry');
    expect(entry?.querySelector('.song')?.textContent).toBe('到岸之1');
    expect(entry?.querySelector('.rec')?.textContent).toBe('已录 4 / 4 段');
    expect(entry?.querySelector('.st.ok')?.textContent).toBe('全部段位都有人唱过');
    expect(entry?.querySelector('.tm')?.textContent).toContain('最近更新');
    expect(entry?.querySelector('a.listen')?.textContent).toBe('听这支作品');
  });

  it('列几何照稿：left 为流体 %（88→80.65% 六列），--wy/--tilt 用稿值', async () => {
    const { container } = renderWithProviders(<SeaPage />, { handlers: sixBottlesHandler() });
    expect(await screen.findByText('到岸之6')).toBeInTheDocument();

    const cols = container.querySelectorAll('ul.fleet > li.col');
    expect(cols).toHaveLength(6);
    // 注：CSSOM 序列化会吃掉尾零（65.7410% → 65.741%），断言按归一化后的值写。
    const lefts = ['6.1111%', '21.0188%', '35.9257%', '50.8333%', '65.741%', '80.6479%'];
    const wis = ['370.4px', '375px', '369.1px', '359.6px', '357.6px', '365.5px'];
    const tilts = ['2.4deg', '-0.22deg', '-2.58deg', '-1.92deg', '0.99deg', '2.74deg'];
    cols.forEach((col, index) => {
      const style = col as HTMLElement;
      expect(style.style.left, `第 ${String(index + 1)} 列 left`).toBe(lefts[index]);
      expect(style.style.getPropertyValue('--wy'), '水线高度（稿波形）').toBe(wis[index]);
      expect(style.style.getPropertyValue('--tilt'), '瓶倾角（稿波形）').toBe(tilts[index]);
    });
  });

  it('稿级 <style> 关键值在位：scoping .sea-hall + top 38/68/98/452、bottom 34、瓶 124、列宽 13.2410%', async () => {
    const { container } = renderWithProviders(<SeaPage />, { handlers: oneBottle });
    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();

    const css = styleOf(container);
    expect(css, '稿级样式必须随页渲染').not.toBe('');
    for (const needle of [
      '.sea-hall .topbar',
      '.sea-hall main{position:absolute;inset:0',
      'top:38px',
      'top:68px',
      'top:98px',
      'top:452px',
      'bottom:34px',
      'width:13.2410%',
      'height:124px',
      'clip-path:polygon(14% 100%',
      'transform-origin:50% 77.4%',
      'gap:30px',
      "[aria-selected='true']",
      '.sea-hall .col.wait .bottle',
    ]) {
      expect(css, `稿级样式缺 ${needle}`).toContain(needle);
    }
  });

  it('空态稿块（完整作品区）：lowtide 三刻度 + h2 + p + 去河道捞一个 → /river', async () => {
    renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [], nextCursor: null } }),
        },
      ],
    });
    const empty = (await screen.findByText('还没有完整的作品')).closest('.empty');
    expect(empty, '稿的 .empty 块').not.toBeNull();
    expect(empty?.querySelector('.lowtide')).not.toBeNull();
    expect(
      Array.from(empty?.querySelectorAll('.lowtide i') ?? []).map((tick) =>
        (tick as HTMLElement).style.left,
      ),
      '低潮刻度 64/128/192',
    ).toEqual(['64px', '128px', '192px']);
    expect(
      empty?.querySelector('p')?.textContent,
    ).toBe('完整作品要等每个段位都有人唱过之后，由持有者送进公海。');
    expect(screen.getByRole('link', { name: '去河道捞一个' })).toHaveAttribute('href', '/river');
  });

  it('空态稿块（等待接力区）：文案切到稿 B', async () => {
    renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [], nextCursor: null } }),
        },
        {
          path: '/api/sea?zone=INCOMPLETE&limit=6',
          respond: () => ({ body: { items: [], nextCursor: null } }),
        },
      ],
    });
    expect(await screen.findByText('还没有完整的作品')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '等待接力' }));
    expect(await screen.findByText('没有等待接力的作品')).toBeInTheDocument();
    expect(
      screen.getByText('这里的作品都还差几个段位，等着有人补上——补完才会进完整作品区。'),
    ).toBeInTheDocument();
  });

  it('页脚 .foot：tail「完整作品 · 本页 N 支」+ .pages（PAGE / 页码 / 状态位）', async () => {
    const { container } = renderWithProviders(<SeaPage />, { handlers: sixBottlesHandler() });
    expect(await screen.findByText('到岸之6')).toBeInTheDocument();

    const foot = container.querySelector('footer.foot');
    expect(foot, '稿的页脚').not.toBeNull();
    expect(foot?.querySelector('.tail')).toHaveTextContent('完整作品 · 本页 6 支');
    expect(foot?.querySelector('.tail .dot'), 'tail 前的 coral 点').not.toBeNull();

    const pages = foot?.querySelector('nav.pages');
    expect(pages, '稿的 .pages').not.toBeNull();
    expect(pages?.querySelector('.meta')?.textContent).toBe('PAGE');
    expect(pages?.querySelectorAll('ol li button')).toHaveLength(1);
    expect(pages?.querySelector('ol li button')?.getAttribute('aria-current')).toBe('page');
    expect(pages?.querySelectorAll('.meta')).toHaveLength(2);
  });

  it('等待接力区：col 带稿的 wait 类（瓶沉到水线以下）+ 缺口状态转暖', async () => {
    const { container } = renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [], nextCursor: null } }),
        },
        {
          path: '/api/sea?zone=INCOMPLETE&limit=6',
          respond: () => ({
            body: {
              items: [
                bottleSummary({
                  seaZone: 'INCOMPLETE',
                  isComplete: false,
                  recordedCount: 3,
                  missingSegmentIndexes: [3],
                }),
              ],
              nextCursor: null,
            },
          }),
        },
      ],
    });
    fireEvent.click(screen.getByRole('tab', { name: '等待接力' }));
    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();

    const col = container.querySelector('ul.fleet > li.col');
    expect(col?.className, '稿 .col.wait').toContain('wait');
    expect(col?.querySelector('.st.gap')?.textContent).toBe('缺第 3 段（成品里这段时间是静音）');
    expect(styleOf(container), 'wait 的沉瓶位').toContain('.sea-hall .col.wait .bottle');
  });

  it('「听这支作品」用 buildPath 指向瓶页 /bottles/<id>（不手拼路径）', async () => {
    renderWithProviders(<SeaPage />, { handlers: oneBottle });
    const link = await screen.findByRole('link', { name: '听这支作品' });
    expect(link).toHaveAttribute('href', `/bottles/${BOTTLE_ID}`);
  });

  it('「听这支作品」fireEvent.click → 路由真实切到 /bottles/<id>（控制组：jsdom 不做命中测试）', async () => {
    renderWithProviders(<SeaPage />, { handlers: oneBottle });
    const link = await screen.findByRole('link', { name: '听这支作品' });
    fireEvent.click(link);
    expect(window.location.pathname).toBe(`/bottles/${BOTTLE_ID}`);
  });

  /**
   * 层叠钉子（真浏览器「等待接力」tab 点不进去的真凶）：`.zones`（tablist）与全屏
   * `ul.fleet`（position:absolute;inset:0，tree order 在**后**）同为 z-auto ⇒ fleet 整层压在
   * tab 之上吃掉指针；fireEvent 不做命中测试，所以「切分区」老测试全绿而浏览器点不动。
   * jsdom 无布局算不出 elementFromPoint ⇒ 以层叠关系断言：.zones 的 z-index 必须高于 .fleet。
   */
  it('层叠：.zones（tablist）必须压过全屏 .fleet（z-index > fleet），否则浏览器里分区 tab 点不到', async () => {
    const { container } = renderWithProviders(<SeaPage />, { handlers: oneBottle });
    await screen.findByText('深海鲸落');
    const css = styleOf(container);
    const decl = (name: string): string =>
      new RegExp(`\\.sea-hall \\.${name}\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    const zIndex = (block: string): number => Number(/z-index:(-?\d+)/.exec(block)?.[1] ?? 0);
    expect(
      zIndex(decl('zones')),
      '.zones 缺显式 z-index ⇒ 被 z-auto 的全屏 .fleet 压住，tab 在真实浏览器里点不到',
    ).toBeGreaterThan(zIndex(decl('fleet')));
  });
});

/**
 * total 一次回全（用户裁决允许改后端）：`pageCount = ceil(total / SEA_PAGE_SIZE)`，
 * 页码**一次全部显示**，不再"先 1、2，点 2 才出 3"；缺 total 的老响应回退旧口径
 * （已取页数 + hasNextPage —— 上面「只有一页 / nextCursor 非 null」两组用例钉住不回归）。
 */
describe('公海大厅 · 页码一次全显（total 驱动）', () => {
  /** 读 nav.pages ol 的可视序列（含省略号占位），顺便钉住顺序。 */
  function pageSequence(container: HTMLElement): string[] {
    const list = container.querySelector('nav.pages ol');
    return Array.from(list?.querySelectorAll('li') ?? []).map((li) => li.textContent ?? '');
  }

  it('响应带 total：页码一次全显（total=24 → 1..4 全在，只取过第 1 页也不缺 3/4），状态位给真实总页数', async () => {
    const { container } = renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({
            body: { items: [bottleSummary()], nextCursor: '游标一', total: 24 },
          }),
        },
      ],
    });

    expect(await screen.findByRole('button', { name: '第 4 页' })).toBeInTheDocument();
    for (const number of [1, 2, 3, 4]) {
      expect(screen.getByRole('button', { name: `第 ${number} 页` })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: '第 5 页' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '第 1 页' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(pageSequence(container)).toEqual(['1', '2', '3', '4']);
    expect(screen.getByText('第 1 页 · 共 4 页')).toBeInTheDocument();
    expect(screen.queryByText(/后面还有更多/)).not.toBeInTheDocument();
  });

  it('total=0（空分区）：仍显示第 1 页，不塌成 0 个页码', async () => {
    renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [], nextCursor: null, total: 0 } }),
        },
      ],
    });
    expect(await screen.findByText(/还没有完整的作品/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '第 1 页' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '第 2 页' })).not.toBeInTheDocument();
  });

  it('>7 页折叠成「1 2 … 9 10」；点第 9 页沿既有游标链逐页预取，折叠窗口随当前页走（1 2 … 8 9 10）', async () => {
    let served = 1; // 游标链桩：第 1 页之后每次翻页推进一个游标，第 10 页收口（nextCursor: null）
    const { container, fetchMock } = renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({
            body: { items: [bottleSummary()], nextCursor: '游标1', total: 60 },
          }),
        },
        {
          path: /cursor=/,
          respond: () => {
            served += 1;
            return {
              body: {
                items: [
                  bottleSummary({
                    id: `30000000-0000-4000-8000-${String(served).padStart(12, '0')}`,
                    songTitle: `第${String(served)}页的歌`,
                  }),
                ],
                nextCursor: served < 10 ? `游标${String(served)}` : null,
                total: 60,
              },
            };
          },
        },
      ],
    });

    // 初始（当前页 = 1）：10 页一次全显两端，中间折叠 —— 不是"翻到哪才长出下一页"
    expect(await screen.findByRole('button', { name: '第 10 页' })).toBeInTheDocument();
    expect(pageSequence(container)).toEqual(['1', '2', '…', '9', '10']);
    for (const absent of ['3', '4', '5', '6', '7', '8']) {
      expect(screen.queryByRole('button', { name: `第 ${absent} 页` })).not.toBeInTheDocument();
    }

    // 点第 9 页：goToPage 既有游标链逐页推进（8 次带 cursor 的请求），不是本地伪造
    fireEvent.click(screen.getByRole('button', { name: '第 9 页' }));
    expect(await screen.findByText('第9页的歌')).toBeInTheDocument();
    expect(
      fetchMock.calls.filter((call) => call.url.includes('cursor=')).length,
      '沿游标链逐页预取',
    ).toBeGreaterThanOrEqual(8);
    expect(screen.getByRole('button', { name: '第 9 页' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(pageSequence(container)).toEqual(['1', '2', '…', '8', '9', '10']);
    expect(screen.getByText('第 9 页 · 共 10 页')).toBeInTheDocument();
  });
});

/**
 * flow-audit G3/P1：非空态页内无回河道键 ⇒ header 尾加常显「← 回河道」→ /river
 * （TEXT_LINK_STRONG，照 profile G7 写法），两分区与空态都渲染 —— 出口不随数据状态消失。
 */
describe('公海大厅 · 常显回河道（G3/P1）', () => {
  it('非空态：两分区都渲染「← 回河道」→ /river（TEXT_LINK_STRONG：min-h-11 + nowrap 热区）', async () => {
    const { container } = renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [bottleSummary()], nextCursor: null } }),
        },
        {
          path: '/api/sea?zone=INCOMPLETE&limit=6',
          respond: () => ({
            body: {
              items: [
                bottleSummary({
                  seaZone: 'INCOMPLETE',
                  isComplete: false,
                  recordedCount: 3,
                  missingSegmentIndexes: [3],
                }),
              ],
              nextCursor: null,
            },
          }),
        },
      ],
    });
    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();

    const back = screen.getByRole('link', { name: '← 回河道' });
    expect(back).toHaveAttribute('href', '/river');
    expect(back.className, 'min-h-11 热区 ≥44px').toContain('min-h-11');
    expect(back.className, '防竖排 nowrap').toContain('whitespace-nowrap');
    expect(container.querySelector('header.hero nav'), '常显出口挂在页头尾').not.toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: '等待接力' }));
    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← 回河道' })).toHaveAttribute('href', '/river');
  });

  it('空态：常显回河道键仍在（与空态「去河道捞一个」并存，不互相替代）', async () => {
    renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [], nextCursor: null } }),
        },
      ],
    });
    expect(await screen.findByText('还没有完整的作品')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← 回河道' })).toHaveAttribute('href', '/river');
    expect(screen.getByRole('link', { name: '去河道捞一个' })).toHaveAttribute('href', '/river');
  });
});

/**
 * one-screen 门禁（`tools/one-screen-check.mjs` 路由表）：`/sea` 声明锚点 `sea-list`，
 * 两档口径都查它（1440 阈值 900 / 375 阈值 812），锚点缺失 = FAIL —— 实测两档都报
 * 「锚点缺失 data-anchor="sea-list"」。位置约束：zones + 数据区的**共同祖先**，
 * 任何数据态（骨架 / 空态 / 列表）都渲染；包装 div 是静态透传（不建立包含块），
 * 稿的绝对定位几何一像素不动。
 */
describe('公海大厅 · one-screen 锚点 sea-list', () => {
  function seaSource(): string {
    // 源码读取用仓内已证模式（settings/river/admin 同款）：cwd = apps/web
    return readFileSync(join(process.cwd(), 'src', 'pages', 'sea-page.tsx'), 'utf8');
  }

  it('源码：data-anchor="sea-list" 挂在 zones + SeaZoneList 的共同祖先上', () => {
    const code = seaSource();
    expect(code, '缺 data-anchor="sea-list"（门禁两档必报缺失）').toContain(
      'data-anchor="sea-list"',
    );
    expect(code, '锚点容器必须包住 zones 与数据区（SeaZoneList 三态都装在里面）').toMatch(
      /data-anchor="sea-list"[\s\S]{0,2400}?<SeaZoneList/,
    );
  });

  it('骨架态（同步首帧）与列表态：锚点都在，列表区与 .zones 都装在锚点容器内', async () => {
    const { container } = renderWithProviders(<SeaPage />, { handlers: sixBottlesHandler() });
    const anchor = () => container.querySelector('[data-anchor="sea-list"]');

    // 同步首帧 = 骨架态（fetch 尚未落地 ⇒ AsyncBoundary 渲染 aria-busy）
    expect(container.querySelector('[aria-busy="true"]'), '此刻应是骨架态').not.toBeNull();
    expect(anchor(), '骨架态锚点缺失').not.toBeNull();

    expect(await screen.findByText('到岸之1')).toBeInTheDocument();
    expect(anchor(), '列表态锚点缺失').not.toBeNull();
    expect(anchor()?.querySelector('ul.fleet'), '列表区必须在锚点容器内').not.toBeNull();
    expect(anchor()?.querySelector('.zones'), '分区必须在锚点容器内').not.toBeNull();
  });

  it('空态：锚点仍在，且空态稿块装在锚点容器内', async () => {
    const { container } = renderWithProviders(<SeaPage />, {
      handlers: [
        {
          path: '/api/sea?zone=COMPLETED&limit=6',
          respond: () => ({ body: { items: [], nextCursor: null } }),
        },
      ],
    });
    expect(await screen.findByText(/还没有完整的作品/)).toBeInTheDocument();
    const anchor = container.querySelector('[data-anchor="sea-list"]');
    expect(anchor, '空态锚点缺失').not.toBeNull();
    expect(anchor?.querySelector('.empty'), '空态稿块必须在锚点容器内').not.toBeNull();
    expect(anchor?.querySelector('.zones'), '分区必须在锚点容器内').not.toBeNull();
  });
});
