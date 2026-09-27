import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bottleDetail, song, USER_A } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { SongPickerPage } from '../song-picker-page';

/** 选歌并发起（CONTEXT §3.1）：只给结构性信息，**不使用官方专辑封面、不复制歌词正文**。 */
describe('选歌页', () => {
  it('列出曲库（曲名 / 段数 / 每段时长），且没有任何 img 封面', async () => {
    const { container } = renderWithProviders(<SongPickerPage />, {
      handlers: [{ path: '/api/songs', respond: () => ({ body: [song()] }) }],
    });
    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();
    expect(screen.getByText(/共 4 段/)).toBeInTheDocument();
    expect(screen.getByText(/每段约 20 秒/)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('加载中显示骨架（aria-busy），不是 spinner', () => {
    const { container } = renderWithProviders(<SongPickerPage />, {
      handlers: [{ path: '/api/songs', respond: () => ({ body: [] }) }],
    });
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('选一首歌 → 建瓶 → 直接进入录制第一段', async () => {
    const { fetchMock } = renderWithProviders(<SongPickerPage />, {
      handlers: [
        { path: '/api/songs', respond: () => ({ body: [song()] }) },
        {
          method: 'POST',
          path: '/api/bottles',
          respond: () => ({
            status: 201,
            body: bottleDetail({
              status: 'DRAFT',
              isHolder: true,
              holderId: USER_A,
              segments: [],
              recordedCount: 0,
              missingSegmentIndexes: [1, 2, 3, 4],
              availableResolutions: [],
            }),
          }),
        },
      ],
    });
    fireEvent.click(await screen.findByRole('button', { name: /选这首，录第 1 段/ }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/bottles/8f1d6c2e-0f1a-4a1e-9f2b-aaaaaaaaaaaa');
    });
    const createCall = fetchMock.calls.find((call) => call.url === '/api/bottles');
    expect(createCall?.body).toEqual({ songId: '33333333-3333-4333-8333-333333333333' });
  });

  it('未登录（401）时不静默失败：说明要先登录并给出带 next 的登录入口', async () => {
    renderWithProviders(<SongPickerPage />, {
      handlers: [
        { path: '/api/songs', respond: () => ({ body: [song()] }) },
        {
          method: 'POST',
          path: '/api/bottles',
          respond: () => ({
            status: 401,
            body: { error: { message: '请先登录再继续。', violations: [] } },
          }),
        },
      ],
    });
    fireEvent.click(await screen.findByRole('button', { name: /选这首，录第 1 段/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('需要先登录');
    expect(screen.getByRole('link', { name: '去登录' })).toHaveAttribute(
      'href',
      expect.stringContaining('/login?next='),
    );
  });

  it('曲库为空是合法状态：空态说明（中性色），不是错误', async () => {
    renderWithProviders(<SongPickerPage />, {
      handlers: [{ path: '/api/songs', respond: () => ({ body: [] }) }],
    });
    expect(await screen.findByText(/曲库还没准备好/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

/**
 * 【用户可见缺陷】`user-provided` 的曲子 `song_segments` 是 0 行（没有切分/预设），
 * 但仍在 `GET /api/songs` 里 —— 选它发起会建出空草稿，然后录制被 fail-closed 拒 ⇒ **卡死在草稿**。
 * 所以选歌页必须：它**仍然可见**（不静默隐藏）+ **不可发起** + **写明理由**。
 */
describe('选歌页：没有切分的曲子', () => {
  const RAW_ID = '44444444-4444-4444-8444-444444444444';

  function setup() {
    return renderWithProviders(<SongPickerPage />, {
      handlers: [
        {
          path: '/api/songs',
          respond: () => ({
            body: [
              song(),
              song({
                id: RAW_ID,
                title: '别人写的歌',
                totalSegments: 4,
                licensedSource: 'user-provided',
                segments: [],
              }),
            ],
          }),
        },
      ],
    });
  }

  it('无切分的曲子仍然在列表里（不静默隐藏）', async () => {
    setup();
    expect(await screen.findByText('别人写的歌')).toBeInTheDocument();
  });

  it('但它不可发起：按钮禁用，且就在行内写明理由', async () => {
    const { fetchMock } = setup();
    const title = await screen.findByText('别人写的歌');
    const row = title.closest('li');
    expect(row).not.toBeNull();
    const button = within(row as HTMLElement).getByRole('button');
    expect(button).toBeDisabled();
    // 不能只是变灰：按钮文案也不能再叫「选这首，录第 1 段」
    expect(button).toHaveTextContent('暂不可发起');
    expect(within(row as HTMLElement).getByText(/还没有切分/)).toBeInTheDocument();

    fireEvent.click(button);
    expect(fetchMock.calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('有切分的曲子照常可发起（别把能用的也禁了）', async () => {
    setup();
    const title = await screen.findByText('深海鲸落');
    const row = title.closest('li') as HTMLElement;
    expect(within(row).getByRole('button')).toBeEnabled();
  });
});

/**
 * record-v1 的**必活装置**：五口独立浅盆。
 *
 * 语义（实施计划 §5.1 第 `/new` 行、设计稿 `p-songpicker-record.png`）：
 * - **水位 = 这首已切好的段位**（水越来越高 = 切好的段位越来越多）；
 * - **干盆 = 还没有切分**：见底 + 一条虚线弧标出水位本该到的地方（盆底那行读数写「未切分 0 / N 段」，
 *   与"这首还没有切分，暂不能发起"那句**行内理由**分工不同：读数是装置的口径，理由是业务的出口）；
 * - 盆里躺着**母版**（唱片）：沟槽 = 段位，**第 1 段在最外圈**，珊瑚弧标出"你要录的那一段"；
 * - 盆里的沟槽数量 = 段位数量，**在水下的画实线、在水面之上的画虚线** ——
 *   所以"切了几段"既读得到比例（水位高度），也数得清格子（实线/虚线）。
 *
 * 这些断言全是**语义锚点**（文字 + data-* + 几何比例），不是像素快照：
 * 装置一旦被响应式重排挤掉（例如窄屏折成一列后水位读不出来），这里会红。
 */
describe('选歌页：五口浅盆的水位映射（record-v1 装置）', () => {
  const HALF_ID = '55555555-5555-4555-8555-bbbbbbbbbbbb';
  const RAW_ID = '44444444-4444-4444-8444-444444444444';

  /** 满盆（4/4）· 半盆（2/4）· 干盆（0/4，还没有切分）三口。 */
  function setup() {
    return renderWithProviders(<SongPickerPage />, {
      handlers: [
        {
          path: '/api/songs',
          respond: () => ({
            body: [
              song(),
              song({ id: HALF_ID, title: '半切曲', segments: song().segments.slice(0, 2) }),
              song({
                id: RAW_ID,
                title: '别人写的歌',
                licensedSource: 'user-provided',
                segments: [],
              }),
            ],
          }),
        },
      ],
    });
  }

  function rowOf(title: string): HTMLElement {
    const row = screen.getByText(title).closest('li');
    expect(row, `找不到《${title}》那一行`).not.toBeNull();
    return row as HTMLElement;
  }

  it('每首歌一口浅盆，水位映射写成可见文字（不靠颜色深浅）', async () => {
    setup();
    await screen.findByText('半切曲');

    expect(screen.getAllByTestId('basin-level').map((node) => node.textContent)).toEqual([
      '已切分 4 / 4 段',
      '已切分 2 / 4 段',
      '未切分 0 / 4 段',
    ]);
  });

  it('水位高度 = 已切分比 × 满盆水位（数值随数据变，不是写死的装饰）', async () => {
    setup();
    await screen.findByText('半切曲');

    const water = screen.getAllByTestId('basin-water');
    expect(water.map((node) => node.getAttribute('data-level'))).toEqual(['1', '0.5']);
    // 满水 = 盆口内高的 88.2%（水面落在盆口下方 11.8%，设计稿水体路径实测）
    expect(water[0]?.style.height).toBe('88.2%');
    expect(water[1]?.style.height).toBe('44.1%');
  });

  it('干盆：见底（没有水）+ 一条虚线弧标出水位本该到的地方', async () => {
    setup();
    await screen.findByText('别人写的歌');
    const dry = rowOf('别人写的歌');

    expect(within(dry).queryByTestId('basin-water')).toBeNull();
    const expected = within(dry).getByTestId('basin-expected-waterline');
    expect(expected.className).toMatch(/border-dashed/);
    expect(within(dry).getByTestId('basin-level').textContent).toBe('未切分 0 / 4 段');
    // 干盆里没有水，也没有第 1 段的珊瑚弧（不能读成"可以发起"）
    expect(within(dry).queryByTestId('basin-seg1')).toBeNull();
  });

  it('满盆：四道沟槽全在水下（实线），且没有"水位本该到的地方"那条虚线', async () => {
    setup();
    await screen.findByText('深海鲸落');
    const wet = rowOf('深海鲸落');

    const rings = within(wet).getAllByTestId('basin-ring');
    expect(rings).toHaveLength(4);
    expect(rings.filter((ring) => ring.className.includes('border-dashed'))).toHaveLength(0);
    expect(within(wet).queryByTestId('basin-expected-waterline')).toBeNull();
    // 第 1 段（你先录的那一段）在盘面上有一道珊瑚弧
    expect(within(wet).getByTestId('basin-seg1')).toBeInTheDocument();
  });

  it('半盆：切过的沟槽实线、没切的虚线（段位格子真的在编码）', async () => {
    setup();
    await screen.findByText('半切曲');
    const half = rowOf('半切曲');

    const rings = within(half).getAllByTestId('basin-ring');
    expect(rings).toHaveLength(4);
    expect(rings.filter((ring) => ring.className.includes('border-dashed'))).toHaveLength(2);
    expect(within(half).getByTestId('basin-expected-waterline')).toBeInTheDocument();
  });

  it('浅盆图形是装饰（aria-hidden），水位另有可见文字等价物', async () => {
    setup();
    await screen.findByText('半切曲');

    for (const graphic of screen.getAllByTestId('basin-graphic')) {
      expect(graphic.getAttribute('aria-hidden')).toBe('true');
    }
    const level = screen.getAllByTestId('basin-level')[0] as HTMLElement;
    expect(level.getAttribute('aria-hidden')).toBeNull();
    expect(level.textContent).not.toBe('');
  });

  it('页头的「已切分 / 未切分」计数来自曲库，不是写死的', async () => {
    setup();
    await screen.findByTestId('stat-cut');

    expect(screen.getByTestId('stat-cut')).toHaveTextContent('2');
    expect(screen.getByTestId('stat-raw')).toHaveTextContent('1');
  });
});

/**
 * 页面的**语言守卫**（源码层）：record-v1 的迁移期别名会撒谎，最坏组合
 * `bg-foam` + `text-abyss` = **1.01:1**（DESIGN.md §Colors · 迁移别名 点名的坏组合）。
 * 页面重做时必须整批换成新名，否则"测试全绿但读不出来"。
 */
describe('选歌页：record-v1 语言（源码守卫）', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src', 'pages', 'song-picker-page.tsx'),
    'utf8',
  );
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');

  it('不出现迁移期撒谎别名', () => {
    const banned = [
      'bg-foam',
      'text-abyss',
      'bg-wave-white',
      'text-wave-white',
      'bg-tide-pool',
      'bg-deep-current',
      'bg-trench',
      'text-slate-current',
      'border-mist',
      'border-driftline',
      'bg-lagoon',
      'text-peacock',
      'bg-peacock',
      'text-coral-deep',
      'bg-sea-glass',
    ];
    const hits = banned.filter((alias) => code.includes(alias));
    expect(hits, `选歌页仍用会撒谎的别名：${hits.join('、')}`).toEqual([]);
  });

  it('不内联色值（颜色只能来自 token 生成的 utilities）', () => {
    expect(code.match(/#[0-9a-fA-F]{6}\b/g) ?? []).toEqual([]);
    expect(code.match(/\brgba?\(/g) ?? []).toEqual([]);
  });

  it('保留路由锚点与空态漂流瓶（一屏判据 + 母题判据都靠它）', () => {
    expect(code, '缺 /new 的锚点').toContain('data-anchor="new-catalog"');
    expect(code, '空态缺漂流瓶母题').toContain('BottleMark');
  });

  /**
   * 承载文字的颜色**不低于契约下限**：`muted`（#A9C7CF，10.84:1）本身就是文字的暗端下限，
   * 再往上叠 alpha 会掉到 4.5:1 以下（`text-muted/60` 合成后只有 ≈4.4:1、`text-muted/70` ≈5.7:1 但没必要）。
   * 元信息按契约用 `paper/50`（合成 ≈5.07:1 ✓）。
   *
   * 这条是**写代码时才发现的自己犯的错**（先写了 `text-muted/60` 与 `placeholder:text-muted/70`），
   * 所以它必须能红 —— 下面第一条就是它的反向控制。
   */
  function loweredTextColors(text: string): string[] {
    const hits: string[] = [];
    for (const match of text.matchAll(/text-(muted|paper)\/(\d+)/g)) {
      const token = match[1];
      const alpha = Number(match[2]);
      if ((token === 'muted' && alpha < 100) || (token === 'paper' && alpha < 50)) {
        hits.push(match[0]);
      }
    }
    return hits;
  }

  it('守卫能红（反向控制）：muted 降 alpha / paper 压到 50 以下都要被点出来', () => {
    expect(loweredTextColors('text-muted/60 text-paper/40')).toEqual([
      'text-muted/60',
      'text-paper/40',
    ]);
    expect(loweredTextColors('text-muted text-paper/50 text-warning')).toEqual([]);
  });

  it('页面里承载文字的颜色不低于契约下限', () => {
    expect(loweredTextColors(code)).toEqual([]);
  });
});

/**
 * 设计稿偏差复核（基准：`docs/ui-review/design-explore/p-songpicker-record.html`）：
 * - E12 沟槽半径梯：设计稿逐档 rx 74.2 / 63 / 48.8 / 27.2 ÷ 84 = 88.3% / 75% / 58.1% / 32.4%（非线性）；
 * - B2 检索牌挂片：`.tab .cat` = 悬于牌子上沿的「找 歌」（11px + .24em + 纸色，无下边框）；
 * - B4/B5 检索框语态：仅下边框 + 透明底 + focus 底边变 glass（高度保持 44）；
 * - F3 页脚：设计稿页脚只有文字，DESIGN.md 无「页脚必须有分隔线」条文 ⇒ 不画线。
 */
describe('选歌页：设计稿偏差复核（E12 / B2 / B4·B5 / F3）', () => {
  function setup() {
    return renderWithProviders(<SongPickerPage />, {
      handlers: [{ path: '/api/songs', respond: () => ({ body: [song()] }) }],
    });
  }

  it('E12 沟槽半径梯逐档 88.30% / 75.00% / 58.10% / 32.40%（不是 69.7 / 51.0 的线性插值）', async () => {
    setup();
    await screen.findByText('深海鲸落');
    const row = screen.getByText('深海鲸落').closest('li') as HTMLElement;
    const widths = within(row)
      .getAllByTestId('basin-ring')
      .map((ring) => ring.style.width);
    expect(widths).toEqual(['88.3%', '75%', '58.1%', '32.4%']);
  });

  it('B2 检索牌挂片：「找 歌」悬于牌子上沿（负 top、无下边框、11px + .24em、纸色 cat）', async () => {
    setup();
    await screen.findByText('深海鲸落');
    const label = screen.getByText('找 歌');
    expect(label.tagName).toBe('LABEL');
    const className = label.className;
    expect(className).toContain('text-[11px]');
    expect(className).toContain('tracking-[0.24em]');
    expect(className).toContain('text-paper/50');
    expect(className).toMatch(/-top-\[?-?[\d.]/); // 负 top：悬在牌子上沿
    expect(className).toContain('border-b-0');
    expect(className).not.toContain('text-muted');
    expect(screen.queryByText('找歌')).toBeNull(); // 旧行内形态不复存在
  });

  it('B4/B5 检索框只改语态：仅下边框 + 透明底 + focus 底边 glass，高度仍 44', async () => {
    setup();
    await screen.findByText('深海鲸落');
    const className = screen.getByRole('searchbox', { name: '按曲名过滤曲库' }).className;
    expect(className).toContain('border-b');
    expect(className).not.toContain('border-muted');
    expect(className).toContain('bg-transparent');
    expect(className).not.toContain('bg-water-void');
    expect(className).toContain('focus:border-glass');
    expect(className).toContain('min-h-11'); // 守卫未要求降高 → 保持 44px
  });

  it('F3 页脚无分隔线（设计稿页脚只有文字，DESIGN.md 也无「页脚必须有分隔线」条文）', async () => {
    setup();
    await screen.findByText('深海鲸落');
    const foot = screen.getByText(/匿名代号/);
    expect(foot.className).not.toContain('border-t');
    expect(foot.className).not.toContain('pt-4');
  });
});
