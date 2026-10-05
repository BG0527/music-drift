import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bottleDetail, song } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { SongPickerPage } from '../song-picker-page';

/** 选歌并发起（CONTEXT §3.1）：只给结构性信息，**不使用官方专辑封面、不复制歌词正文**。 */
describe('选歌页', () => {
  it('列出曲库（曲名 / 段数 / 每段时长），且没有任何 img 封面', async () => {
    const { container } = renderWithProviders(<SongPickerPage />, {
      handlers: [{ path: '/api/songs', respond: () => ({ body: [song()] }) }],
    });
    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();
    expect(screen.getByText('4 段')).toBeInTheDocument(); // 稿逐字「4 段」（不带「共」，返工令 2026-09-27）
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

  it('保留路由锚点与稿空态装置（一屏判据 + 母题判据都靠它）', () => {
    expect(code, '缺 /new 的锚点').toContain('data-anchor="new-catalog"');
    // 照抄批次（2026-09-27 返工令）：空态从 BottleMark 换成稿的状态区装置（「空 态」行）；
    // 本页的母题 = 五口浅盆水体（basin-graphic），water-motif 的 MOTIF_TAGS 已同步追加该标记。
    expect(code, '空态缺稿状态区装置').toContain('data-device="sp-states"');
    expect(code, '缺稿空态行「空 态」').toContain('空 态');
    expect(code, '稿里空态没有瓶（BottleMark 已按稿移除）').not.toContain('<BottleMark');
  });

  /**
   * 【用户可见缺陷】一屏放不下时**不许静默裁掉**。
   *
   * 本页根框是 `md:h-[100dvh]`，一旦配 `md:overflow-hidden`，凡是超出一屏的内容
   * 就被裁掉且滚不动 —— 网格本来就随宽度换列（sm:2 / lg:3 / xl:5），列数一变必然超高。
   * 实测（真实浏览器，1440 宽 900 高以外的中招）：
   *   1366×768 → 卡片下沿被裁 58px
   *   1250×900 → 掉 3 列、4 首歌折 2 行，被裁 397px（「选这首，录第 1 段」按钮看不见）
   *   1024×768 → 被裁 529px
   * 修法：根框 `overflow-y-auto`（本框仍 100dvh，背景三层 `absolute inset-0` 仍只铺满视口），
   * 放得下就是完整一屏，放不下就滚动可达。1440×900 实测回到 0 溢出。
   */
  it('一屏放不下时可滚动抵达，不静默裁掉内容', () => {
    expect(code, '根框仍在静默裁切内容（超一屏就看不见且滚不动）').toContain(
      'md:overflow-y-auto',
    );
    expect(code, '根框不许用 overflow-hidden 裁内容').not.toMatch(/md:overflow-hidden/);
  });

  /**
   * 【用户可见缺陷】页脚「先登录」是**行内**链接：design-discipline 契约要求它
   * min-h-11（44px 可点目标），但 44px 的行内盒子会把 12.5px 段落的行盒从 20px
   * 撑到 44px，整条底注涨成 64px，于是 900 高的窗口里底注底部 —— 正是用户反馈
   * "底部提示看不见"的那块 —— 被推出首屏。
   *
   * 契约（两条都要成立，缺一即回归）：
   *   1. 44px 可点目标**不许降**（design-discipline 守 `min-h-11`）；
   *   2. 必须用负外边距把 44px 在版面上的贡献抵消回 20px 行盒
   *      （负外边距不缩小元素本身，只收回它对块高的贡献）。
   */
  it('页脚行内「先登录」保 44px 可点目标，且不撑高底注（负外边距抵消行盒）', () => {
    const footerLink = code.match(/to=\{?'\/login\?next='[\s\S]{0,260}?>/);
    expect(footerLink, '找不到页脚「先登录」链接').not.toBeNull();
    const chunk = footerLink?.[0] ?? '';

    // 1) 可点目标不许降
    expect(chunk, '页脚「先登录」必须保 min-h-11（44px 可点目标）').toContain('min-h-11');

    // 2) 负外边距抵消：`-my-[12px]` ⇒ 44 - 12*2 = 20px，正好等于 12.5px × lh1.6
    const counter = chunk.match(/-my-\[(\d+)px\]/);
    expect(counter, '页脚「先登录」缺 -my-[..px] 负外边距，44px 行内盒子会撑高底注').not.toBeNull();
    const rem = 44 - Number(counter?.[1]) * 2;
    expect(rem, '负外边距抵消后应回到 12.5px × leading-1.6 = 20px 的行盒').toBe(20);
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

/**
 * 逐块照抄收尾（用户返工令 2026-09-27：完全按照 .html）。
 * 差值清单 = apps/web/docs/review-songpicker-blocks.md §1–§9 与 R3 复核的剩余偏差。
 * 源码级断言（本页守卫连 rgba 都禁，值只能是 token 工具类或 var()）。
 */
describe('选歌页：照稿差值收尾', () => {
  const raw = readFileSync(
    resolve(process.cwd(), 'src', 'pages', 'song-picker-page.tsx'),
    'utf8',
  );
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');

  it('页头节奏照稿：h1 上距 22px、副标单段逐字（无折行引入的双空格）', () => {
    expect(code).toContain('mt-[22px]');
    expect(code, '副标逐字（折叠为一段）').toContain(
      '这里每首歌都被切成固定段位（同一位置永远属于同一段，斩浪也不会把后面的段前移）。你录第 1 段，之后交给河道里的陌生人。',
    );
    expect(code, 'JSX 折行引入的双空格要清掉').not.toContain('）。 你录');
  });

  it('tally 照稿：组间 gap 38（不是 24）', () => {
    expect(code).toContain('gap-[38px]');
  });

  it('状态区照稿：dashed 框 + 两行 cat 标签「无匹配」「空 态」', () => {
    expect(code).toContain('data-device="sp-states"');
    expect(code).toContain('border-dashed');
    expect(code).toContain('无匹配');
    expect(code).toContain('空 态');
  });

  it('曲目行文案照稿：段数无「共」、来源空格形（无全角冒号）', () => {
    expect(code, '「共 {n} 段」是发明').not.toContain('共 {song.totalSegments}');
    expect(code).toContain('来源 {song.licensedSource}');
  });

  it('干盆理由照稿：note 在按钮之后、无图标、warm 色', () => {
    const noteAt = code.indexOf('这首还没有切分');
    const buttonAt = code.indexOf('选这首，录第 1 段');
    expect(noteAt, '缺 note 文案').toBeGreaterThan(0);
    expect(buttonAt, '缺按钮文案').toBeGreaterThan(0);
    expect(noteAt, 'note 必须在按钮之后（稿 top132 > 按钮 84+32）').toBeGreaterThan(buttonAt);
    expect(code, 'note 不带图标').not.toContain('AlertTriangle');
    expect(code, 'note 是 warm 色').toContain('text-warm');
  });

  it('发起按钮照稿语态：32px 描边幽灵 + 透明扩边保热区（44px 触控底线用 hit-area 实现）', () => {
    // W18.5 路 B6：原断言钉的是"透明外扩伪元素实现 >=44px"。那是**手段**
    // （DESIGN §Accessibility 明文写「不靠伪元素外扩」），目的只是 >=44px 可点。
    // 现在改用真实盒高 min-h-11（Tailwind 44px 档），键盘用户也因此真正拿到 44px
    // —— 伪元素撑出来的范围键盘是拿不到的。视觉形态（描边 + 淡底）仍照参考稿。
    expect(code).toContain('min-h-11');
    expect(code).not.toContain('before:absolute');
    expect(code).toContain('border-paper/25');
    expect(code).toContain('bg-paper/[0.03]');
  });

  it('格顶沿错落 0/6/2/8/4 与盆体 ±8 错落（稿的两组常量）', () => {
    expect(code).toContain('EDGE_TILT');
    expect(code).toContain('BASIN_TILT');
  });

  it('母版外圈描边 .38（稿值，不是 .25）', () => {
    expect(code).toContain('border-water-light/[0.38]');
  });

  it('页脚照稿：12.5px 右对齐；未登录底注带「先登录」出口（动线 G8）', () => {
    expect(code).toContain('text-[0.78125rem]');
    expect(code).toContain('md:text-right');
    expect(code).toContain('/login?next=');
  });

  it('动线 G1：页头左上常显「← 回河道」→ /river', () => {
    expect(code, '缺回河道链接').toContain('to="/river"');
    expect(code, '缺回河道文案').toContain('回河道');
  });

  it('背景三层照稿：platter / deep / glint（data-device 标记，token 驱动无 rgba）', () => {
    expect(code).toContain('data-device="sp-platter"');
    expect(code).toContain('data-device="sp-deep"');
    expect(code).toContain('data-device="sp-glint"');
  });
});

/**
 * t17 现状核验（并发会话 1cc4dde 之后，五档真机截图 vs `site/new.html` 逐块对照）。
 *
 * 用户截图所指的「内容被裁 / 底部提示看不见」已由 1cc4dde 修掉（根框 overflow-y-auto +
 * 页脚先登录负外边距，上面两组测试钉住）。对照唯一基准仍剩下的**结构 / 比例**级差距：
 *  R1 检索牌 `.plate` 与状态区 `.states` 照稿 width:844px ⇒ 844/1440 = 58.611vw 比例宽
 *     （md+ 生效，窄屏仍满幅；此前牌一路拉满内容宽，与稿的左半比例不符）；
 *  R2 检索框照稿 width:320px ⇒ 320/1440 = 22.222vw；计数控件照稿 `.count { margin-left:auto }`
 *     贴牌右缘（此前 input 拉通、计数只是跟在 input 后面 —— 牌一收窄计数必须自己靠右）；
 *  R3 `.platter` 照稿**两层**背景：密环 + 右下角 radial 光晕（稿 `rgba(127,209,217,.05)` ⇒
 *     token 化 `color-mix … var(--color-glass) 5%`，本页守卫禁 rgba/hex）；
 *  R4 干盆按钮照稿：disabled 行是**纯文字**「暂不可发起」（稿 `.act[disabled]` 无 svg）。
 */
describe('选歌页：site/new.html 逐块对照（t17 残余差距，先红后绿）', () => {
  const raw = readFileSync(
    resolve(process.cwd(), 'src', 'pages', 'song-picker-page.tsx'),
    'utf8',
  );
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');

  function setup(catalog: unknown[] = [song()]) {
    return renderWithProviders(<SongPickerPage />, {
      handlers: [{ path: '/api/songs', respond: () => ({ body: catalog }) }],
    });
  }

  it('R1 检索牌与状态区照稿 844 比例宽（md:max-w-[58.611vw]，两处状态区都要）', async () => {
    const plate = code.match(/data-anchor="new-catalog"\s*className="([^"]+)"/);
    expect(plate, '找不到检索牌容器（data-anchor=new-catalog）').not.toBeNull();
    expect(plate?.[1] ?? '', '检索牌缺 844/1440 = 58.611vw 比例宽').toContain(
      'md:max-w-[58.611vw]',
    );

    const states = [...code.matchAll(/data-device="sp-states"\s*className="([^"]+)"/g)];
    expect(states, '状态区应有「空 态」与「无匹配」两处').toHaveLength(2);
    for (const match of states) {
      expect(match[1] ?? '', '状态区缺 844/1440 = 58.611vw 比例宽').toContain(
        'md:max-w-[58.611vw]',
      );
    }
    // 真机口径：牌在渲染结果里（不是只写在注释里）
    setup();
    await screen.findByText('深海鲸落');
    expect(screen.getByText('找 歌')).toBeInTheDocument();
  });

  it('R2 检索框照稿 320 比例宽、计数 margin-left:auto 贴牌右缘', async () => {
    setup();
    await screen.findByText('深海鲸落');
    const input = screen.getByRole('searchbox', { name: '按曲名过滤曲库' });
    expect(input.className, '检索框缺 320/1440 = 22.222vw 比例宽').toContain(
      'md:max-w-[22.222vw]',
    );
    const count = code.match(/<span className="([^"]+)">\s*\{matched\.length/);
    expect(count, '找不到计数控件（曲库共 N 首）').not.toBeNull();
    expect(count?.[1] ?? '', '计数缺 margin-left:auto（稿 .count）').toContain('ml-auto');
  });

  it('R3 platter 照稿两层背景：密环 + 右下 5% glass 光晕（token 化，无 rgba）', () => {
    const platter = code.match(/data-device="sp-platter"\s*className="([^"]+)"/);
    expect(platter, '找不到 platter 背景层').not.toBeNull();
    const className = platter?.[1] ?? '';
    expect(className, '缺密环层').toContain('repeating-radial-gradient');
    expect(className, '缺 radial 光晕层（稿 .platter 第二层）').toMatch(/\),radial-gradient\(/);
    expect(className, '光晕必须走 token（5% glass ≈ 稿 rgba(127,209,217,.05)）').toContain(
      'color-mix(in_srgb,var(--color-glass)_5%',
    );
  });

  it('R4 干盆按钮照稿：disabled 纯文字无图标；可发起按钮带话筒', async () => {
    const RAW_ID = '44444444-4444-4444-8444-444444444444';
    setup([
      song(),
      song({
        id: RAW_ID,
        title: '别人写的歌',
        totalSegments: 4,
        licensedSource: 'user-provided',
        segments: [],
      }),
    ]);
    await screen.findByText('别人写的歌');
    const dryRow = screen.getByText('别人写的歌').closest('li') as HTMLElement;
    const disabled = within(dryRow).getByRole('button');
    expect(disabled).toBeDisabled();
    expect(disabled.querySelector('svg'), '稿的 disabled 按钮是纯文字（无话筒图标）').toBeNull();
    const wetRow = screen.getByText('深海鲸落').closest('li') as HTMLElement;
    const enabled = within(wetRow).getByRole('button');
    expect(enabled.querySelector('svg'), '可发起按钮应保留话筒图标').not.toBeNull();
  });

  it('R5 关键区块清单齐（对照 site/new.html 块清单）且根框可滚不静默裁切', () => {
    for (const marker of [
      'data-device="sp-platter"',
      'data-device="sp-deep"',
      'data-device="sp-glint"',
      'SIDE A · 未刻',
      '选一首歌，投出第一棒',
      'data-anchor="new-catalog"',
      '找 歌',
      'data-device="sp-states"',
      'EDGE_TILT',
      'BASIN_TILT',
      'data-testid="basin-graphic"',
      'md:mt-auto',
      'md:overflow-y-auto',
    ]) {
      expect(code, `缺块（对照 site/new.html 清单）：${marker}`).toContain(marker);
    }
    expect(code, '根框仍在静默裁切（超一屏就看不见且滚不动）').not.toMatch(/md:overflow-hidden/);
  });
});
