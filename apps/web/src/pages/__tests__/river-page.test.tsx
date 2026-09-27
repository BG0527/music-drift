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
  it('捞起 / 投下 是**两个等权主区**（用户裁决：投下要与捞起同样重）', () => {
    renderWithProviders(<RiverPage />, { handlers: [] });
    // 捞起：圆形主按钮（110×110）+ 涟漪
    expect(screen.getByRole('button', { name: '捞一个漂流瓶' })).toBeInTheDocument();
    // 投下：同规格的第二个主区（未登录时指向带 next 的登录页）
    expect(screen.getByRole('link', { name: '投下一支漂流瓶' })).toHaveAttribute(
      'href',
      '/login?next=%2Fnew',
    );
    expect(screen.getByText(/随机打捞/)).toBeInTheDocument();
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

  it('河道空（409 NO_BOTTLE_AVAILABLE）给空态与两个出口', async () => {
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
    expect(screen.getByRole('button', { name: '再捞一次' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '去公海大厅' })).toHaveAttribute('href', '/sea');
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
    expect(screen.getByRole('button', { name: '再捞一次' })).toBeInTheDocument();
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

  it('① 被点亮的沟槽＝河道：一条**有宽度的水槽**（两条岸 + 槽里的水），且整条点亮', () => {
    const { container } = renderWithProviders(<RiverPage />, { handlers: [] });
    const channel = container.querySelector<HTMLElement>('[data-device="river"]');
    expect(channel, '缺少「被点亮的沟槽＝河道」这件装置').not.toBeNull();
    // 装饰纪律：不吃指针事件 + 绝对定位（零布局高度，不会推高整页）
    expect(channel?.className, '河道装饰必须 pointer-events-none').toContain('pointer-events-none');
    expect(channel?.className, '河道装饰必须绝对定位（零布局高度）').toContain('absolute');
    // 它是"槽"而不是"一条线"：两条岸（groove-bed 的上下两条 1px 细线）夹一道水（groove-lit）
    expect(channel?.querySelector('.groove-bed'), '缺岸 —— 只剩一条线就不是沟槽').not.toBeNull();
    const lit = channel?.querySelector<HTMLElement>('.groove-lit');
    expect(lit, '缺被点亮的水（河道没有被点亮）').not.toBeNull();
    // 「被点亮」= 整条槽都亮着：这一页不编码段位（河道页没有作品），只编码"河道通着、水在流"
    expect(lit?.style.width, '河道必须整条点亮').toBe('100%');
    expect(channel?.querySelector('[aria-hidden="true"]'), '河道装饰必须 aria-hidden').not.toBeNull();
  });

  it('② 圆盘泊位等权：两枚共用同一份尺寸，盘身不填彩色，冷/暖只在边缘', () => {
    const { container } = renderWithProviders(<RiverPage />, { handlers: [] });
    const draw = port(container, 'draw');
    const cast = port(container, 'cast');

    const sizeOf = (element: HTMLElement): string | null =>
      /h-\[\d+px\] w-\[\d+px\] rounded-full md:h-\[\d+px\] md:w-\[\d+px\]/.exec(element.className)?.[0] ??
      null;
    expect(sizeOf(draw), '捞取圆盘缺少「圆形 + 手机/桌面两档尺寸」').not.toBeNull();
    expect(sizeOf(cast), '投下必须与捞取共用同一份尺寸（只改其中一个 = 等权静默失衡）').toBe(
      sizeOf(draw),
    );

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
    const { container } = renderWithProviders(<RiverPage />, { handlers: [] });
    const wrap = (id: 'draw' | 'drop'): HTMLElement | null =>
      container.querySelector<HTMLElement>(`[data-anchor="river-${id}"]`);
    expect(wrap('draw')?.className, '捞取不该被下移').not.toMatch(/(^|\s)md:mt-/);
    expect(wrap('drop')?.className, '投下必须与捞取错开（桌面下移）').toMatch(/(^|\s)md:mt-/);
  });

  it('③ 默认态没有漂流瓶（用户第 ④ 条硬约束：只有水在流，瓶的缺席本身可读）', () => {
    // 源码层断言：这一页**不得**接入任何漂流瓶母题（BottleMark / DriftingBottle）。
    // 依据：`docs/ui-review/design-explore/_LANGUAGE.md` §7.1-5「不可违反」条款 +
    // 设计稿 `f4-groove.png`（画面里没有瓶）。谁把瓶子加回来，这里必须红。
    expect(source(), '河道页默认态出现了漂流瓶母题').not.toMatch(/BottleMark|DriftingBottle/);
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

  it('① 常驻态只有水在流：装饰层（漂移虚线 + 两圈场景涟漪）aria-hidden、零信息、默认无瓶', () => {
    const { container } = renderWithProviders(<RiverPage />, { handlers: [] });
    const decor = container.querySelector<HTMLElement>('[data-river-decor]');
    expect(decor, '缺 f0① 的常驻装饰层').not.toBeNull();
    expect(decor?.getAttribute('aria-hidden'), '装饰层必须 aria-hidden').toBe('true');
    expect(decor?.className, '装饰层必须不吃指针事件').toContain('pointer-events-none');
    expect(decor?.querySelector('.passage-drift'), '缺 46s 一个来回的漂移虚线').not.toBeNull();
    expect(decor?.querySelectorAll('.ripple-ring').length, '缺「偶尔扩散」的场景涟漪').toBeGreaterThanOrEqual(
      2,
    );
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
      '.river-flowline',
      '.river-gather',
      '.river-vessel-enter-draw',
      '.river-vessel-exit-cast',
    ]) {
      expect(block, `reduced-motion 下未冻结 ${cls}`).toContain(cls);
    }
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
