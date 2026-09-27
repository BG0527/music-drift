import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { motion } from '../../design-system';
import { bottleDetail } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { RiverPage } from '../river-page';

// fake timers 只属于单个用例：任何用例结束后都还原（否则同文件后续用例的 waitFor 会挂死）。
afterEach(() => {
  vi.useRealTimers();
});

/** 河道（Figma `home-river`）：一屏一个动作 —— 随机捞一个瓶子。 */
describe('河道页', () => {
  it('捞取 / 投下 是稿的两枚泊位（cap 逐字；稿的捞取 cap 无「随机打捞」句）', () => {
    renderWithProviders(<RiverPage />, { handlers: [] });
    expect(screen.getByRole('button', { name: '捞一个漂流瓶' })).toBeInTheDocument();
    // 投下：未登录时指向带 next 的登录页
    expect(screen.getByRole('link', { name: '投下一支漂流瓶' })).toHaveAttribute(
      'href',
      '/login?next=%2Fnew',
    );
    expect(
      screen.getByText('捞到别人的半句，接下一句。捞到即持有：同一时刻只有你拿着它。'),
      '捞取 cap 必须逐字照稿',
    ).toBeInTheDocument();
    expect(screen.getByText('选一首歌，录下第 1 段，投进河道，等一个陌生人接棒。')).toBeInTheDocument();
    expect(screen.getByText('DRAW')).toBeInTheDocument();
    expect(screen.getByText('CAST')).toBeInTheDocument();
    expect(screen.queryByText(/随机打捞/), '稿的捞取 cap 没有这句').toBeNull();
  });

  it('已登录时「投下」直达选歌页', async () => {
    renderWithProviders(<RiverPage />, {
      handlers: [
        {
          path: '/api/auth/me',
          respond: () => ({
            body: {
              user: {
                id: '11111111-1111-4111-8111-111111111111',
                handle: '午夜歌手',
                email: 'a@example.com',
                role: 'USER',
              },
              expiresAt: '2026-10-23T00:00:00.000Z',
            },
          }),
        },
      ],
    });
    await waitFor(() => {
      expect(screen.getByRole('link', { name: '投下一支漂流瓶' })).toHaveAttribute('href', '/new');
    });
  });

  it('捞到即进入这支瓶子（持有权由服务端给），且必须**动画播完才跳转**（architecture §103.3）', async () => {
    vi.useFakeTimers();
    const { fetchMock, container } = renderWithProviders(<RiverPage />, {
      handlers: [
        {
          method: 'POST',
          path: '/api/river/draw',
          respond: () => ({ body: { bottle: bottleDetail() } }),
        },
      ],
    });
    const base = window.location.pathname;

    // 点击之前：不发任何请求、河面无瓶（f0① 常驻态只有水在流）
    expect(fetchMock.calls.filter((call) => call.url === '/api/river/draw')).toHaveLength(0);
    expect(container.querySelector('[data-vessel]'), '默认态不得出现瓶子').toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /捞一个漂流瓶/ }));
    // 点击即进入操作态：瓶子入场（入场类引用 --motion-entry-duration）+ 同位文字状态
    const vessel = container.querySelector<HTMLElement>('[data-vessel]');
    expect(vessel, '点击后瓶子必须出现（只在操作态）').not.toBeNull();
    expect(vessel?.className, '缺入场动效类').toContain('river-vessel-enter-draw');
    expect(screen.getByRole('status'), 'aria-live 文字状态必须在同位出现').toHaveTextContent(
      '正在打捞…',
    );
    expect(window.location.pathname, '动画没播完不许跳').toBe(base);

    // 请求已返回（success 文案就位），但入场都没播完 —— 仍然不许跳
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock.calls.some((call) => call.url === '/api/river/draw'), '点击后才发请求').toBe(
      true,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/捞到了/);
    expect(window.location.pathname).toBe(base);

    // 入场（--motion-entry-duration）播完 → 收拢涟漪开始（feedback，只播一次）
    await act(async () => {
      await vi.advanceTimersByTimeAsync(motion.entryDuration);
    });
    expect(container.querySelector('[data-gather]'), '收拢涟漪阶段缺失').not.toBeNull();
    expect(window.location.pathname).toBe(base);

    // 涟漪（--motion-ripple-duration）播完 → 退场开始（--motion-exit-duration，比入场短）
    expect(motion.exitDuration, '契约要求退场短于入场').toBeLessThan(motion.entryDuration);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(motion.rippleDuration);
    });
    expect(container.querySelector<HTMLElement>('[data-vessel]')?.className).toContain(
      'river-vessel-exit-draw',
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(motion.exitDuration - 1);
    });
    expect(window.location.pathname, '退场还差 1ms —— 没播完不许跳').toBe(base);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(window.location.pathname).toBe('/bottles/8f1d6c2e-0f1a-4a1e-9f2b-aaaaaaaaaaaa');
  });

  it('河道空（409 NO_BOTTLE_AVAILABLE）给可读 alert；稿无重试块 ⇒ 无「再捞一次」、无出口链接', async () => {
    renderWithProviders(<RiverPage />, {
      handlers: [
        {
          method: 'POST',
          path: '/api/river/draw',
          respond: () => ({
            status: 409,
            body: {
              error: {
                message: '河道里暂时没有可以捞的瓶子。',
                violations: [
                  { code: 'NO_BOTTLE_AVAILABLE', message: '河道里暂时没有可以捞的瓶子。' },
                ],
              },
            },
          }),
        },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: '捞一个漂流瓶' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('河道里暂时没有可以捞的瓶子');
    expect(screen.queryByRole('button', { name: '再捞一次' }), '稿无重试块').toBeNull();
    expect(screen.queryByRole('link', { name: '去公海大厅' }), '稿无出口链接').toBeNull();
  });

  it('自己投出的瓶子不会再漂回来（422 CANNOT_DRAW_OWN_BOTTLE 有可读说明）', async () => {
    renderWithProviders(<RiverPage />, {
      handlers: [
        {
          method: 'POST',
          path: '/api/river/draw',
          respond: () => ({
            status: 422,
            body: {
              error: {
                message: '不能接自己投出的瓶子。',
                violations: [{ code: 'CANNOT_DRAW_OWN_BOTTLE', message: '不能接自己投出的瓶子。' }],
              },
            },
          }),
        },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: '捞一个漂流瓶' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('不能接自己投出的瓶子。');
    expect(screen.queryByRole('button', { name: '再捞一次' }), '稿无重试块').toBeNull();
  });
});

/**
 * 装置守卫（record-v1 · S3 标杆页）—— 对应实施计划 §5.1 那一行：
 * 「被点亮的沟槽＝河道；两枚**错落**圆盘泊位（捞/投）；**默认态无瓶**」。
 *
 * 为什么装置也要机器可检：实现阶段最大的风险不是"做不出来"，而是**响应式重排把设计稿的
 * 记忆点做没了**（§5 开头）。这三条断言是可执行的那部分：装置在不在、承担不承担信息。
 * **观感**（好不好看、像不像 `f4-groove.png`）机器判不了，那一步由 captain 并排看图。
 *
 * 断言口径尽量落在**结构性事实**上（有几圈环、谁被下移、盘身有没有彩色填充），
 * 而不是具体像素 —— 像素会随断点调整，结构不会。
 */
describe('河道页 · 三件装置（S3）', () => {
  const source = (): string =>
    readFileSync(resolve(process.cwd(), 'src', 'pages', 'river-page.tsx'), 'utf8');

  const port = (container: HTMLElement, id: 'draw' | 'cast'): HTMLElement => {
    const found = container.querySelector<HTMLElement>(`[data-port="${id}"]`);
    expect(found, `缺少「${id}」泊位`).not.toBeNull();
    return found as HTMLElement;
  };

  it('① 被点亮的沟槽＝河道：唱片 SVG 里 r900 一族的**六层水槽**（底槽/亮面/两岸/两道水流虚线）', () => {
    const { container } = renderWithProviders(<RiverPage />, { handlers: [] });
    const channel = container.querySelector<HTMLElement>('[data-device="river"]');
    expect(channel, '缺少「被点亮的沟槽＝河道」这件装置').not.toBeNull();
    // 装饰纪律：河道画在唱片 SVG 里，宿主不吃指针事件 + 绝对定位（零布局高度）+ aria-hidden
    const canvas = channel?.closest('svg');
    expect(canvas, '河道必须画在唱片 SVG 里（稿 §4.3）').not.toBeNull();
    expect(canvas?.getAttribute('viewBox'), '唱片画布 = 稿的 1440×900').toBe('0 0 1440 900');
    expect(canvas?.getAttribute('aria-hidden'), '唱片 SVG 必须 aria-hidden').toBe('true');
    const host = canvas?.parentElement;
    expect(host?.className, '唱片装饰宿主必须 pointer-events-none').toContain('pointer-events-none');
    expect(host?.className, '唱片装饰宿主必须绝对定位（零布局高度）').toContain('absolute');
    // 它是「有宽度的水槽」而不是一条线：六层 = 底槽(26) + 水面亮线(7) + 下岸(887) + 上岸(913)
    //   + 两道错拍的水流虚线（r900 / r906）
    const circles = [...(channel?.querySelectorAll('circle') ?? [])];
    expect(circles, '河道必须是六层水槽').toHaveLength(6);
    expect(
      circles.map((circle) => circle.getAttribute('r')),
      '半径族群必须是 r900 一族（含两岸 887/913、虚线 B 906）',
    ).toEqual(['900', '900', '887', '913', '900', '906']);
    expect(
      circles.map((circle) => circle.getAttribute('stroke-width')),
      '底槽 26 / 亮线 7 / 两岸 1.4 / 虚线 2 与 1.6',
    ).toEqual(['26', '7', '1.4', '1.4', '2', '1.6']);
    expect(
      circles.filter((circle) => circle.getAttribute('stroke-dasharray')).length,
      '两道水流虚线（dasharray 16 30 / 10 40）',
    ).toBe(2);
  });

  /**
   * ⚠️ **captain 裁决（f4-groove）改掉的守卫（原文 → 新文）**：
   * 原文：`expect(sizeOf(cast), '投下必须与捞取共用同一份尺寸（只改其中一个 = 等权静默失衡）').toBe(sizeOf(draw))`
   *       （两枚泊位共用同一个 `PORT_SIZE` 常量，等大才成立）。
   * 新文：两枚泊位按稿 §4.8 **错落不等** —— 捞取 190×190、投下 150×150（小一档且更靠下）；
   *      「等权」由同一结构 + 同三圈外环 + 同盘身表达，不再由等大表达。
   */
  it('② 圆盘泊位按稿错落不等（190×190 / 150×150），盘身不填彩色，冷/暖只在边缘', () => {
    const { container } = renderWithProviders(<RiverPage />, { handlers: [] });
    const draw = port(container, 'draw');
    const cast = port(container, 'cast');

    /** 流体尺寸（固定 px → clamp 流体）里稿值的那一档：上限必须等于稿的 190 / 150。 */
    const fluidMax = (element: HTMLElement): number | null => {
      const found = /w-\[clamp\(\d+px,[\d.]+vw,(\d+)px\)\]/.exec(element.className);
      return found === null ? null : Number(found[1]);
    };
    expect(fluidMax(draw), '捞取圆盘缺「圆形 + clamp 流体尺寸」').not.toBeNull();
    expect(draw.className, '两枚泊位都必须是圆盘').toContain('rounded-full');
    expect(cast.className, '两枚泊位都必须是圆盘').toContain('rounded-full');
    expect(fluidMax(draw), '捞取按稿 190×190').toBe(190);
    expect(fluidMax(cast), '投下按稿 150×150（小一档）').toBe(150);
    expect(fluidMax(cast), 'captain 裁决：不再共用同一份尺寸（错落不等）').not.toBe(fluidMax(draw));

    for (const [name, element] of [
      ['捞取', draw],
      ['投下', cast],
    ] as const) {
      expect(element.querySelector('.disc-core'), `${name}缺深色盘身（disc-core）`).not.toBeNull();
      expect(element.innerHTML, `${name}盘身不得填彩色（彩色只出现在边缘微光）`).not.toMatch(
        /bg-(coral|glass|warm|peacock|sea-glass|lagoon)/,
      );
      const rings = element.querySelectorAll('[data-ring]').length;
      expect(rings, `${name}的外环应为 2~3 圈`).toBeGreaterThanOrEqual(2);
      expect(rings, `${name}的外环应为 2~3 圈`).toBeLessThanOrEqual(3);
    }
    expect(draw.querySelector('.disc-edge-cool'), '捞取是冷边').not.toBeNull();
    expect(cast.querySelector('.disc-edge-warm'), '投下是暖边').not.toBeNull();
  });

  it('② 两枚泊位**错落**：只有「投下」被下移，两枚不在同一条水平线上', () => {
    /**
     * ⚠️ 断言原文 → 新文（一比一复刻 2026-09-27）：
     * 原文：draw className 不含 `md:mt-`、drop 含 `md:mt-`（旧 grid 流式错落机制，md:mt-16=64px）。
     * 新文：稿的错落 = 绝对坐标垂直差 180px ⇒ draw `md:absolute md:top-0`（不下移）、
     * drop `md:top-[180px]`（下移 180px，较稿 64px 的旧值多 116px）。
     */
    const { container } = renderWithProviders(<RiverPage />, { handlers: [] });
    const wrap = (id: 'draw' | 'drop'): HTMLElement | null =>
      container.querySelector<HTMLElement>(`[data-anchor="river-${id}"]`);
    expect(wrap('draw')?.className, '捞取不该被下移（贴画布顶）').toContain('md:top-0');
    expect(wrap('draw')?.className, '捞取走绝对定位贴左').toContain('md:absolute md:left-0');
    expect(wrap('drop')?.className, '投下必须与捞取错开（桌面下移 180px）').toContain(
      'md:top-[180px]',
    );
  });

  it('③ 默认态没有漂流瓶（用户第 ④ 条硬约束：只有水在流，瓶的缺席本身可读）', () => {
    // 源码层断言：这一页**不得**接入任何漂流瓶母题（BottleMark / DriftingBottle）。
    // 依据：`docs/ui-review/design-explore/_LANGUAGE.md` §7.1-5「不可违反」条款 +
    // 设计稿 `f4-groove.png`（画面里没有瓶）。谁把瓶子加回来，这里必须红。
    expect(source(), '河道页默认态出现了漂流瓶母题').not.toMatch(/BottleMark|DriftingBottle/);
  });
});

/**
 * f4 块对照（`docs/review-river-blocks.md` 唯一值源）——稿（f4-groove.html）逐块落地的结构守卫：
 * B1 背景五层 / B2 唱片 SVG 整套 / B3 左上标题 / B4 右上信息 / B7 页脚，
 * 以及「现页有稿无 → 删」的三块（波形带、重试块、「我参与过的漂流瓶」）。
 * 口径：文案逐字、结构可检、源码无 hex（色值一律 var(--color-*) / rgba）。
 */
describe('河道页 · f4 块对照（review-river-blocks）', () => {
  const source = (): string =>
    readFileSync(resolve(process.cwd(), 'src', 'pages', 'river-page.tsx'), 'utf8');

  it('B1 背景五层：platter / body / center / field>i / light 各就各位；两档沟距 11 与 4.4px 已流体化', () => {
    const { container } = renderWithProviders(<RiverPage />, { handlers: [] });
    const backdrop = container.querySelector<HTMLElement>('[data-river-backdrop]');
    expect(backdrop, '缺背景层宿主（稿 B1）').not.toBeNull();
    for (const layer of ['platter', 'body', 'center', 'field', 'light'] as const) {
      expect(backdrop?.querySelector(`.${layer}`), `缺背景层 .${layer}`).not.toBeNull();
    }
    expect(backdrop?.querySelector('.field > i'), '缺 .field 里的沟槽层 i').not.toBeNull();
    const src = source();
    expect(src, '中心区沟距 11px → 0.764vw（1440 基准流体化）').toContain('0.764vw');
    expect(src, '外圈沟距 4.4px → 0.306vw（1440 基准流体化）').toContain('0.306vw');
    expect(
      (src.match(/repeating-radial-gradient/g) ?? []).length,
      '两档同心沟距纹理（11 / 4.4）',
    ).toBeGreaterThanOrEqual(2);
    expect(
      (src.match(/maskImage/g) ?? []).length,
      '分段遮罩（录音区 / 外圈 land / 左上角衰减 / 掠光）',
    ).toBeGreaterThanOrEqual(3);
  });

  it('B2 唱片 SVG 整套：圆族 + 擦痕弧 + 尘点 + 转向箭头「顺槽 · 33⅓」，且源码禁 hex', () => {
    const { container } = renderWithProviders(<RiverPage />, { handlers: [] });
    const canvas = container.querySelector('[data-river-backdrop] > svg');
    expect(canvas, '缺唱片表面 SVG（稿 B2）').not.toBeNull();
    expect(canvas?.getAttribute('viewBox')).toBe('0 0 1440 900');
    // 圆族 ≥20：标签族 6（268/262/275/336/1276/1268）+ 河道 6 + 擦痕弧 4 + 尘点 4
    expect(
      canvas?.querySelectorAll('circle').length ?? 0,
      '唱片圆族（标签/水槽/擦痕/尘点）不足 20',
    ).toBeGreaterThanOrEqual(20);
    expect(canvas?.textContent, '转向箭头文字缺失').toContain('顺槽 · 33⅓');
    const src = source();
    expect(src, '源码出现 hex 色值（一律 var(--color-*) / rgba）').not.toMatch(
      /#[0-9a-fA-F]{3,8}\b/,
    );
    expect(
      (src.match(/strokeDashoffset/g) ?? []).length,
      '四条擦痕弧的 dashoffset',
    ).toBeGreaterThanOrEqual(4);
  });

  it('B3/B4 文案与结构：cat 带 ·0001、副标题两行逐字、右上两行说明；页面自带 <main>、页脚是 <footer>', () => {
    const { container } = renderWithProviders(<RiverPage />, { handlers: [] });
    expect(screen.getByText('音乐共创 · 匿名接力 · 0001')).toBeInTheDocument();
    expect(screen.getByText('暖流河道')).toBeInTheDocument();
    const sub = screen.getByText(/一条沟槽就是一条河/);
    expect(sub.innerHTML, '副标题必须两行（<br/>）').toContain('<br');
    expect(sub, '副标题第二行逐字').toHaveTextContent('唱一段，让它顺水去找下一个陌生人。');
    expect(screen.getByText('33⅓')).toBeInTheDocument();
    expect(screen.getByText('RPM · 匿名接力')).toBeInTheDocument();
    const note = screen.getByText(/唱一段，投进河里，让陌生人接棒/);
    expect(note.innerHTML, '右上说明必须两行（<br/>）').toContain('<br');
    expect(note, '右上说明第二行逐字').toHaveTextContent('四段齐了入海，成为公共作品');
    expect(container.querySelector('main'), '页面自带 <main>（外壳不渲染）').not.toBeNull();
    expect(container.querySelector('footer'), '页脚必须是 <footer>（稿 B7）').not.toBeNull();
  });

  it('横向溢出回归：页面 <main> 不得带负外边距出血（外壳不给 padding，-mx 会把 scrollWidth 撑出视口）', () => {
    // one-screen 实测：1440 档 scrollWidth=1488（+48 = md:-mx-12）、375 档 399（+24 = -mx-6）。
    // 外壳（app-shell.tsx）明文「不加 padding」、body margin:0 ⇒ 负外边距没有可抵消的对象，
    // 出血一律由 backdrop 的 absolute inset-0 承担。
    const { container } = renderWithProviders(<RiverPage />, { handlers: [] });
    const main = container.querySelector('main');
    expect(main, '页面自带 <main>（外壳不渲染）').not.toBeNull();
    expect(
      main?.className ?? '',
      '<main> 不得出现 -mx-6 / md:-mx-12（1440 → 1488>1440，375 → 399>375）',
    ).not.toMatch(/-mx-/);
    expect(source(), '源码层面同样钉住：<main> 行不得再写负外边距').not.toMatch(
      /<main className="[^"]*-mx-/,
    );
    // 负外边距去掉后，唱片背景的整面出血不得丢：宿主仍是 absolute inset-0 铺满全宽。
    expect(
      container.querySelector('[data-river-backdrop]')?.className ?? '',
      '背景五层宿主保持 absolute inset-0（出血改由 main 自身贴视口宽承担）',
    ).toContain('inset-0');
  });

  it('现页有稿无的三块已删：波形带（CurrentLines）、重试块、「我参与过的漂流瓶」链接', () => {
    const { container } = renderWithProviders(<RiverPage />, { handlers: [] });
    const src = source();
    expect(src, '稿无波形带 h-48').not.toContain('<CurrentLines');
    expect(src, '稿无重试块（ConflictNotice / retryLabel）').not.toMatch(/ConflictNotice|retryLabel/);
    expect(
      screen.queryByText(/我参与过的漂流瓶/),
      '稿右上块没有「我参与过的漂流瓶」链接',
    ).toBeNull();
    expect(src, '投下 cap 也不得再引用「我参与过的漂流瓶」').not.toContain('我参与过的漂流瓶');
    expect(container.querySelector('[data-vessel]'), '默认态不得出现瓶子').toBeNull();
  });
});

/**
 * 任务 E · f0 三段分镜（`docs/ui-review/design-explore/f0-sequence.html`）
 * + architecture §103.3 用户裁决：**捞/投 动画播完再跳转**（明确覆盖「不得阻塞交互」默认条款）。
 *
 * 断言分三层，各自能证明什么写清楚（motion-web §8）：
 *  - 静态扫描 `river-motion.css`：参数只引用 `--motion-*` token、keyframes 只动
 *    transform/opacity、`prefers-reduced-motion` 块在；
 *  - fake timers 时序：状态机顺序与「播完才导航」的先后（可证明）；
 *  - reduced-motion 分支：§103.3 的回归守卫 —— 两条路径都**不等动画**（可证明）。
 * **不能证明**：屏幕上的观感与流畅度（jsdom 无布局/合成器）——由 captain 并排看图（impl-plan §5.3）。
 */
describe('河道页 · f0 三段分镜（任务 E）', () => {
  const riverCss = (): string =>
    readFileSync(resolve(process.cwd(), 'src', 'pages', 'river-motion.css'), 'utf8');

  /** 去注释正文：守卫只扫真实声明（注释里的形态值说明不算内联参数）。 */
  const codeOnly = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '');

  /** 花括号配对地取出全部 `@keyframes` 块。 */
  const keyframeBlocks = (text: string): string[] => {
    const blocks: string[] = [];
    for (const found of text.matchAll(/@keyframes\s+[\w-]+\s*\{/g)) {
      let depth = 1;
      let at = (found.index ?? 0) + found[0].length;
      const start = at;
      while (at < text.length && depth > 0) {
        if (text[at] === '{') depth += 1;
        else if (text[at] === '}') depth -= 1;
        at += 1;
      }
      blocks.push(text.slice(start, at - 1));
    }
    return blocks;
  };

  /** reduced-motion 分支的 matchMedia 桩（jsdom 没有真实媒体查询）。 */
  const stubReducedMotion = (): (() => void) => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    return () => {
      window.matchMedia = original;
    };
  };

  it('① 常驻态只有水在流：装饰层（两圈场景涟漪）aria-hidden、零信息、默认无页中横线', () => {
    const { container } = renderWithProviders(<RiverPage />, { handlers: [] });
    const decor = container.querySelector<HTMLElement>('[data-river-decor]');
    expect(decor, '缺 f0① 的常驻装饰层').not.toBeNull();
    expect(decor?.getAttribute('aria-hidden'), '装饰层必须 aria-hidden').toBe('true');
    expect(decor?.className, '装饰层必须不吃指针事件').toContain('pointer-events-none');
    expect(decor?.querySelectorAll('.ripple-ring').length, '缺「偶尔扩散」的场景涟漪').toBeGreaterThanOrEqual(
      2,
    );
    /**
     * ⚠️ 断言原文 → 新文（一比一复刻裁决 2026-09-27，用户点名「河道中间多了一条」）：
     * 原文：`expect(decor?.querySelector('.passage-drift'), '缺 46s 漂移虚线').not.toBeNull()`。
     * 新文：稿 f4-groove **全页没有任何横贯直线** ⇒ 漂移虚线与 SurfaceLine 横线一并删除，
     * 断言反向钉住「两条横线不存在」（f0 状态机/时序/aria-live 断言不动，仅常驻装饰随稿退场）。
     */
    expect(container.querySelector('.river-flowline'), '稿全页无横线：漂移虚线应已删').toBeNull();
    expect(container.querySelector('[class*="surface-line"]'), '稿全页无横线：SurfaceLine 应已删').toBeNull();
    expect(container.querySelector('[data-vessel]'), '默认态不得出现瓶子').toBeNull();
    expect(screen.queryByRole('status'), '默认态零信息：不该有状态文案').toBeNull();
  });

  it('② 动效参数只引用 --motion-* token：无内联毫秒/缓动/hex，且退场短于入场', () => {
    const text = codeOnly(riverCss());
    for (const token of [
      'var(--motion-entry-duration)', // 入场 480ms（f0 图例：入场 480 / 退场 240）
      'var(--motion-exit-duration)', // 退场 240ms
      'var(--motion-ripple-duration)', // 收拢涟漪 2.4s（f0 图例：只播一次）
      'var(--motion-entry-easing)', // 唯一缓动 token
      'var(--motion-passage-shift)', // 位移距离 token（瓶子行程）
    ]) {
      expect(text, `river-motion.css 未引用 ${token}`).toContain(token);
    }
    expect(text, '出现内联时长字面量').not.toMatch(/\d+(?:\.\d+)?m?s\b/);
    expect(text, '出现内联缓动').not.toContain('cubic-bezier');
    expect(text, '出现内联色值').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(motion.exitDuration, '契约必须满足退场 < 入场（f0 进出配对）').toBeLessThan(
      motion.entryDuration,
    );
    for (const cls of [
      '.river-vessel-enter-draw',
      '.river-vessel-enter-cast',
      '.river-vessel-exit-draw',
      '.river-vessel-exit-cast',
    ]) {
      expect(text, `缺入场/退场动效类 ${cls}`).toContain(cls);
    }
  });

  it('③ keyframes 只动 transform / opacity；收拢涟漪只播一次', () => {
    const text = codeOnly(riverCss());
    const blocks = keyframeBlocks(text);
    expect(blocks.length, '缺 @keyframes').toBeGreaterThanOrEqual(5);
    for (const block of blocks) {
      const props = [...block.matchAll(/^\s*([a-z-]+)\s*:/gm)].map((found) => found[1] as string);
      for (const prop of props) {
        expect(['transform', 'opacity'], `keyframes 动画了布局/其它属性 ${prop}`).toContain(prop);
      }
    }
    expect(text, '收拢涟漪必须只播一次（iteration = 1）').toMatch(
      /animation:\s*river-gather\s+var\(--motion-ripple-duration\)\s+var\(--motion-entry-easing\)\s+1\s+both/,
    );
  });

  it('④ reduced-motion 媒体查询存在：本页全部动效冻结（只留文字状态）', () => {
    const block =
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\}\s*$/.exec(riverCss())?.[0] ?? '';
    expect(block, 'river-motion.css 缺 prefers-reduced-motion 块').not.toBe('');
    expect(block, '降级 = 动画全关').toContain('animation: none');
    for (const cls of [
      '.ripple-ring.river-scene-delay',
      '.river-gather',
      '.river-vessel-enter-draw',
      '.river-vessel-exit-cast',
    ]) {
      expect(block, `reduced-motion 下未冻结 ${cls}`).toContain(cls);
    }
  });

  /**
   * 一比一复刻（2026-09-27 用户点名）：泊位按稿 f4-groove 的绝对坐标落位——
   * draw 60,400（190²）/ cast 380,580（150²），垂直错落 180px、投下位右移 23.6%（(380−76)/1288），
   * cap 下沉 draw 40 / cast 165。DOM 在 jsdom 无布局 ⇒ 源码级钉 class 语义。
   */
  it('泊位一比一：绝对坐标骑在河道弧上（垂直错落 180px + cap 下沉 40/165）', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src', 'pages', 'river-page.tsx'),
      'utf8',
    );
    const draw = /<section[\s\S]{0,400}?data-anchor="river-draw"[\s\S]{0,260}?className=\{?"([^"]+)"/.exec(src)?.[1] ?? '';
    const cast = /<section[\s\S]{0,400}?data-anchor="river-drop"[\s\S]{0,260}?className=\{?"([^"]+)"/.exec(src)?.[1] ?? '';
    expect(draw, '捞取：桌面绝对定位在画布左上').toContain('md:absolute md:left-0 md:top-0');
    expect(cast, '投下：桌面绝对定位、右移 23.6%、垂直错落 180px').toContain(
      'md:absolute md:left-[23.6%] md:top-[180px]',
    );
    expect(src, '容器须是桌面相对画布并给定稿高').toMatch(/md:h-\[clamp\(4[0-9]{2}px,31\.9vw,470px\)\]/);
    expect(src, '捞取 cap 下沉 40px（稿 top:40）').toContain('md:mt-[40px]');
    expect(src, '投下 cap 下沉 165px（稿 top:165）').toContain('md:mt-[165px]');
  });

  it('捞取失败：aria-live 补失败文案（动效不是唯一反馈），不播「收拢确认」、不跳转', async () => {
    vi.useFakeTimers();
    const { container } = renderWithProviders(<RiverPage />, {
      handlers: [
        {
          method: 'POST',
          path: '/api/river/draw',
          respond: () => ({
            status: 409,
            body: {
              error: {
                message: '河道里暂时没有可以捞的瓶子。',
                violations: [
                  { code: 'NO_BOTTLE_AVAILABLE', message: '河道里暂时没有可以捞的瓶子。' },
                ],
              },
            },
          }),
        },
      ],
    });
    const base = window.location.pathname;
    fireEvent.click(screen.getByRole('button', { name: '捞一个漂流瓶' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('status')).toHaveTextContent(/打捞失败/);
    expect(screen.getByRole('alert')).toHaveTextContent('河道里暂时没有可以捞的瓶子');
    expect(window.location.pathname, '失败绝不能跳转').toBe(base);
    // 失败没有「捞起」可确认 ⇒ 不得进入收拢涟漪段，瓶子直接退场（feedback 不许说谎）
    expect(container.querySelector<HTMLElement>('[data-vessel]')?.className).toContain(
      'river-vessel-exit-draw',
    );
    expect(container.querySelector('[data-gather]'), '失败后不得出现收拢涟漪').toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(motion.exitDuration);
    });
    expect(container.querySelector('[data-vessel]'), '退场播完舞台应清空').toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(motion.entryDuration);
    });
    expect(container.querySelector('[data-gather]'), '之后任何时刻都不得补播收拢涟漪').toBeNull();
    expect(window.location.pathname).toBe(base);
  });

  it('投下：点击前不发请求、河面不变；动画播完才切换界面（§103.3 第二条路径）', async () => {
    vi.useFakeTimers();
    const { container } = renderWithProviders(<RiverPage />, {
      handlers: [
        {
          path: '/api/auth/me',
          respond: () => ({
            body: {
              user: {
                id: '11111111-1111-4111-8111-111111111111',
                handle: '午夜歌手',
                email: 'a@example.com',
                role: 'USER',
              },
              expiresAt: '2026-10-23T00:00:00.000Z',
            },
          }),
        },
      ],
    });
    const base = window.location.pathname;
    // 会话加载完（微任务），投下仍是原样的链接：没请求、没瓶、没状态文案
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const cast = screen.getByRole('link', { name: '投下一支漂流瓶' });
    expect(cast).toHaveAttribute('href', '/new');
    expect(container.querySelector('[data-vessel]')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.click(cast);
    // 点击后：落水确认的动画开始 + 文字状态同位出现，但界面还没切
    const vessel = container.querySelector<HTMLElement>('[data-vessel]');
    expect(vessel, '点击后瓶子必须出现').not.toBeNull();
    expect(vessel?.className, '缺投下入场动效类').toContain('river-vessel-enter-cast');
    expect(screen.getByRole('status')).toHaveTextContent(/顺河而下/);
    expect(window.location.pathname).toBe(base);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(motion.entryDuration);
    });
    expect(container.querySelector('[data-gather]'), '落水的收拢涟漪（confirmation）缺失').not.toBeNull();
    expect(window.location.pathname).toBe(base);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(motion.rippleDuration);
    });
    expect(container.querySelector<HTMLElement>('[data-vessel]')?.className).toContain(
      'river-vessel-exit-cast',
    );
    expect(window.location.pathname).toBe(base);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(motion.exitDuration);
    });
    expect(window.location.pathname, '退场播完才切换界面').toBe('/new');
  });

  it('§103.3 回归守卫：reduced-motion 下捞取**不等动画**立即跳转，只留 aria-live 文字', async () => {
    const restore = stubReducedMotion();
    try {
      const { container } = renderWithProviders(<RiverPage />, {
        handlers: [
          {
            method: 'POST',
            path: '/api/river/draw',
            respond: () => ({ body: { bottle: bottleDetail() } }),
          },
        ],
      });
      fireEvent.click(screen.getByRole('button', { name: /捞一个漂流瓶/ }));
      expect(container.querySelector('[data-vessel]'), 'reduce 下不渲染瓶子').toBeNull();
      expect(screen.getByRole('status'), 'reduce 下只留文字状态').toHaveTextContent('正在打捞…');
      await waitFor(
        () => {
          expect(window.location.pathname).toBe('/bottles/8f1d6c2e-0f1a-4a1e-9f2b-aaaaaaaaaaaa');
        },
        { timeout: 500 },
      );
      expect(container.querySelector('[data-vessel]')).toBeNull();
    } finally {
      restore();
    }
  });

  it('§103.3 回归守卫：reduced-motion 下投下也立即切换界面（不等动画）', async () => {
    const restore = stubReducedMotion();
    try {
      const { container } = renderWithProviders(<RiverPage />, {
        handlers: [
          {
            path: '/api/auth/me',
            respond: () => ({
              body: {
                user: {
                  id: '11111111-1111-4111-8111-111111111111',
                  handle: '午夜歌手',
                  email: 'a@example.com',
                  role: 'USER',
                },
                expiresAt: '2026-10-23T00:00:00.000Z',
              },
            }),
          },
        ],
      });
      await waitFor(() => {
        expect(screen.getByRole('link', { name: '投下一支漂流瓶' })).toHaveAttribute('href', '/new');
      });
      fireEvent.click(screen.getByRole('link', { name: '投下一支漂流瓶' }));
      expect(window.location.pathname, 'reduce 下点击即切换').toBe('/new');
      expect(container.querySelector('[data-vessel]')).toBeNull();
    } finally {
      restore();
    }
  });
});
