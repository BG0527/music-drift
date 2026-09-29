/**
 * Landing v3（`/` 根路由 · 整页翻页式）守卫 —— t12 验收的机器化（v3 文案重写后同步）。
 *
 * 钉住七件事：
 * 1. **根路由直达**：`/` 渲染 landing（非河道页、不跳 /intro）；`/intro` 已收编（notFound）；
 *    原 `/`→`/river` 行为的测试已按**用户 t12 新裁决**重写（见 river-merge.test.tsx）；
 * 2. **第一屏三问**：钩子 h1 → 定义 → 价值句 → 免注册当场体验，同屏可达；
 * 3. **八屏每屏一段**：8 屏（开场 + 七段），h2 顺序与 docs/landing-copy-v3.md §1 一致；
 * 4. **整页翻页**：滚轮一划翻一屏（root 不滚动）、方向键/圆点可导航、连滑防抖、
 *    reduced-motion 由全局 CSS 降级为即时切换（transition 只引 --motion-* token，此处静态钉）；
 * 5. **CTA 链**：链尾「去开始体验」→ `/login?next=%2Friver`；
 * 6. **功能页守卫**：guest 访问 /river、/sea、/settings 进 /login（验收④回归）；
 * 7. **内容与红线**：文案逐字来自 docs/landing-copy-v3.md（用户逐屏锁定），
 *    不逐字照搬用户示例；无 emoji / AI 陈词 / lorem / 15–30 旧口径 / 内联 hex / h-screen；
 *    feature 卡非对称（CONFLICTS #7）。
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, type FetchHandler } from '../../test/harness';
import { BOTTLE_ID, bottleDetail, bottleSummary } from '../../test/fixtures';
import { RouteView } from '../route-view';
import { matchRoute } from '../shell/routes';

/* 文案常量（与 docs/landing-copy-v3.md §2 逐字一致；brainstorm §5 落点表同步收录） */
const HOOK = '唱过无痕，声声有应。';
const DEFINITION = '匿名接力唱：唱约 20 秒投进河里，陌生人接唱下一段，四段拼成一首。';
const VALUE_LINE = '不署名，不入册，不比谁唱得好——只问一件事：有没有人，接住你的声音。';
const CTA = '去开始体验';
/** 用户示例（brainstorm 红线）：最终文案不得逐字出现。 */
const USER_EXAMPLE_FRAGMENTS = ['想唱但怕被评价', '不用露脸', '不用唱完', '不用等点赞'];

/** v3 标题系统 A（瓶语线）：八屏，与 landing-copy-v3.md §1 逐字一致。 */
const SCREEN_TITLES = [
  '开场',
  '漂流瓶，是什么',
  '怎么漂起来',
  '歌，都漂去哪儿',
  '什么时候，漂一瓶',
  '它漂到哪儿了',
  '漂流的规矩',
  '投出你的第一瓶',
] as const;

const SCREEN_COUNT = SCREEN_TITLES.length;
const INDICATOR_TOTAL = String(SCREEN_COUNT).padStart(2, '0');

function experienceHandlers(): FetchHandler[] {
  const detail = bottleDetail({
    status: 'SEA',
    seaZone: 'COMPLETED',
    isComplete: true,
    missingSegmentIndexes: [],
    isHolder: false,
    availableResolutions: [],
    segments: [1, 2, 3, 4].map((index) => ({
      id:
        index === 1
          ? '44444444-4444-4444-8444-444444444444'
          : index === 2
            ? '55555555-5555-4555-8555-555555555555'
            : index === 3
              ? '66666666-6666-4666-8666-666666666003'
              : '77777777-7777-4777-8777-777777777004',
      index,
      isMine: false,
      note: null,
      ownerCode: `匿名歌手#10${String(index)}`,
      likeCount: 0,
      dislikeCount: 0,
      deletedAt: null,
      audioMime: 'audio/webm',
      durationMs: 20_000 + index * 1000,
    })),
  });
  return [
    {
      path: '/api/sea?zone=COMPLETED&limit=30',
      respond: () => ({ body: { items: [bottleSummary()], nextCursor: null, total: 1 } }),
    },
    { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: detail }) },
  ];
}

const AUTHED_ME: FetchHandler = {
  path: '/api/auth/me',
  respond: () => ({
    body: {
      // W21 账号契约：AuthUserSchema strict 且 account 必填（正名），email 已退役不回显。
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        handle: '午夜歌手',
        account: '午夜歌手',
        role: 'USER',
      },
      expiresAt: '2030-01-01T00:00:00.000Z',
    },
  }),
};

function renderLanding(handlers: FetchHandler[] = experienceHandlers()) {
  return renderWithProviders(<RouteView />, { route: '/', handlers });
}

function indicator(): string {
  return screen.getByTestId('landing-indicator').textContent ?? '';
}

function activeScreenIndex(): number {
  const screens = [...document.querySelectorAll('[data-landing-screen]')];
  return screens.findIndex((node) => node.getAttribute('data-active') === 'true');
}

/* ─────────────── 1. 根路由直达 ─────────────── */

describe('根路由直达（t12 用户新裁决，覆盖 `/`→`/river` 旧裁决）', () => {
  it('/ 渲染 landing：钩子是 h1，不是河道页，且不跳 /intro', async () => {
    renderLanding();
    expect(await screen.findByRole('heading', { level: 1, name: HOOK })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '暖流河道' })).toBeNull();
    expect(window.location.pathname).toBe('/');
  });

  it('/intro 已收编进根路由（独立路由删除 → notFound）', () => {
    expect(matchRoute('/intro').name).toBe('notFound');
    expect(matchRoute('/').name).toBe('home');
  });

  it('顶栏「介绍」指向 `/` 且在本页高亮', async () => {
    renderLanding();
    const link = await screen.findByRole('link', { name: '介绍' });
    expect(link).toHaveAttribute('href', '/');
    expect(link).toHaveAttribute('aria-current', 'page');
  });
});

/* ─────────────── 2. 第一屏三问 ─────────────── */

describe('第一屏三问（首屏可达）', () => {
  it('钩子 h1 在定义之前；定义去空白 ≤32 字（v3 用户定稿放宽，见 landing-copy-v3.md §0/§2）', async () => {
    renderLanding();
    const hook = await screen.findByRole('heading', { level: 1, name: HOOK });
    const definition = screen.getByText(DEFINITION);
    expect(hook.compareDocumentPosition(definition) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(DEFINITION.replace(/\s/g, '').length).toBeLessThanOrEqual(32);
  });

  it('解决谁（价值句）+ 现在能否体验（免注册播放卡）都在第一屏内', async () => {
    renderLanding();
    expect(screen.getByText(VALUE_LINE)).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: '当场听一支成品' }),
    ).toBeInTheDocument();
    const hero = document.querySelector('[data-landing-screen]');
    expect(hero?.textContent ?? '').toContain('不用注册');
  });
});

/* ─────────────── 3. 六段每屏一段 ─────────────── */

describe('七段追问逻辑（每屏一段，翻页推进）', () => {
  it('h2 顺序 = 漂流瓶，是什么 → 怎么漂起来 → 歌，都漂去哪儿 → 什么时候，漂一瓶 → 它漂到哪儿了 → 漂流的规矩 → 投出你的第一瓶', async () => {
    renderLanding();
    await screen.findByRole('heading', { level: 1, name: HOOK });
    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
    expect(headings).toEqual([
      '漂流瓶，是什么',
      '怎么漂起来',
      '歌，都漂去哪儿',
      '什么时候，漂一瓶',
      '它漂到哪儿了',
      '漂流的规矩',
      '投出你的第一瓶',
    ]);
  });

  it('恰 8 屏（开场 + 七段），每屏一个 data-landing-screen，屏名与指示器一致', async () => {
    renderLanding();
    await screen.findByRole('heading', { level: 1, name: HOOK });
    const screens = [...document.querySelectorAll('[data-landing-screen]')];
    expect(screens).toHaveLength(SCREEN_COUNT);
    expect(screens.map((node) => node.getAttribute('data-screen-title'))).toEqual([
      ...SCREEN_TITLES,
    ]);
    expect(indicator()).toContain(`01 / ${INDICATOR_TOTAL}`);
    expect(activeScreenIndex()).toBe(0);
  });
});

/* ─────────────── 4. 整页翻页交互 ─────────────── */

describe('整页翻页（滚轮一划 = 翻一整页）', () => {
  it('滚轮向下翻一屏、向上返回；根不连续滚动（离散 translate 切屏）', async () => {
    renderLanding();
    await screen.findByRole('heading', { level: 1, name: HOOK });
    fireEvent.wheel(window, { deltaY: 120 });
    expect(indicator()).toContain(`02 / ${INDICATOR_TOTAL}`);
    expect(activeScreenIndex()).toBe(1);
    // 防抖锁（motion.entryDuration = 480ms）过后反向滚轮才生效 —— 锁本身即被验证
    await new Promise((resolve) => setTimeout(resolve, 520));
    fireEvent.wheel(window, { deltaY: -120 });
    expect(indicator()).toContain(`01 / ${INDICATOR_TOTAL}`);
    expect(activeScreenIndex()).toBe(0);
  });

  it('快速连滑有防抖：锁定窗口内的第二次滚轮不跳页', async () => {
    renderLanding();
    await screen.findByRole('heading', { level: 1, name: HOOK });
    fireEvent.wheel(window, { deltaY: 120 });
    fireEvent.wheel(window, { deltaY: 120 });
    fireEvent.wheel(window, { deltaY: 120 });
    expect(indicator()).toContain(`02 / ${INDICATOR_TOTAL}`);
    expect(activeScreenIndex()).toBe(1);
  });

  it('首屏继续上滑、末屏继续下滑都停在原屏（不循环、不越界）', async () => {
    renderLanding();
    await screen.findByRole('heading', { level: 1, name: HOOK });
    fireEvent.wheel(window, { deltaY: -120 });
    expect(indicator()).toContain(`01 / ${INDICATOR_TOTAL}`);
    fireEvent.keyDown(window, { key: 'End' });
    expect(indicator()).toContain(`08 / ${INDICATOR_TOTAL}`);
    fireEvent.wheel(window, { deltaY: 120 });
    expect(indicator()).toContain(`08 / ${INDICATOR_TOTAL}`);
  });

  it('方向键可导航：ArrowDown/ArrowUp 逐屏，Home/End 到首末屏', async () => {
    renderLanding();
    await screen.findByRole('heading', { level: 1, name: HOOK });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(indicator()).toContain(`02 / ${INDICATOR_TOTAL}`);
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(indicator()).toContain(`03 / ${INDICATOR_TOTAL}`);
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(indicator()).toContain(`02 / ${INDICATOR_TOTAL}`);
    fireEvent.keyDown(window, { key: 'Home' });
    expect(indicator()).toContain(`01 / ${INDICATOR_TOTAL}`);
    fireEvent.keyDown(window, { key: 'End' });
    expect(indicator()).toContain(`08 / ${INDICATOR_TOTAL}`);
  });

  it('圆点导航：8 个带屏名的按钮，点击跳屏并标 aria-current', async () => {
    renderLanding();
    await screen.findByRole('heading', { level: 1, name: HOOK });
    const dots = screen.getAllByRole('button', { name: /^第 \d 屏 · / });
    expect(dots).toHaveLength(SCREEN_COUNT);
    expect(dots[3]?.getAttribute('aria-label')).toContain('歌，都漂去哪儿');
    fireEvent.click(dots[3] as HTMLElement);
    expect(indicator()).toContain(`04 / ${INDICATOR_TOTAL}`);
    expect(activeScreenIndex()).toBe(3);
    expect(
      screen
        .getByRole('button', { name: /^第 4 屏 · 歌，都漂去哪儿$/ })
        .getAttribute('aria-current'),
    ).toBe('true');
  });

  it('翻页只动 transform，过渡参数只引 --motion-* token（无内联时长/缓动字面量）', async () => {
    renderLanding();
    await screen.findByRole('heading', { level: 1, name: HOOK });
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'pages', 'landing-page.tsx'),
      'utf8',
    );
    // 过渡类引用契约 token（motion-web §2：参数只能来自设计契约）
    expect(source).toContain('duration-[var(--motion-page-duration)]');
    expect(source).toContain('ease-[var(--motion-entry-easing)]');
    expect(source).not.toMatch(/\b(?:duration|delay)-\d+(?:\.\d+)?\b/);
    expect(source).not.toMatch(/cubic-bezier/);
    expect(source).not.toMatch(/\btransition-all\b/);
    // wheel 必须以 non-passive 监听挂载（否则 preventDefault 无效 ⇒ 浏览器原生滚动接管）
    expect(source).toMatch(/addEventListener\('wheel'[^)]*passive:\s*false/);
    // reduced-motion 即时切换由 motion.css 全局 transition:none 兜底（此处钉住入口可达）
    const motionCss = readFileSync(
      resolve(process.cwd(), 'src', 'design-system', 'motion.css'),
      'utf8',
    );
    expect(motionCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(motionCss).toContain('transition: none !important');
  });
});

/* ─────────────── 5. CTA 链 ─────────────── */

describe('链尾「去开始体验」CTA', () => {
  it('第 8 屏 CTA 指向 /login?next=%2Friver；旁支动作路径仍在', async () => {
    renderLanding();
    await screen.findByRole('heading', { level: 1, name: HOOK });
    const cta = screen.getByRole('link', { name: CTA });
    expect(cta).toHaveAttribute('href', '/login?next=%2Friver');
    const tryScreen = document.querySelectorAll('[data-landing-screen]')[SCREEN_COUNT - 1];
    expect(tryScreen?.textContent ?? '').toContain(CTA);
    // 行动路径旁支（t4 验收延续）：当场听（按钮）/ 去河道捞一个 / 唱一段投进去
    // （播放卡数据异步装配 ⇒ 用 findBy 等就绪）
    expect(await screen.findByRole('button', { name: '当场听一支成品' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '去河道捞一个' })).toHaveAttribute('href', '/river');
    for (const link of screen.getAllByRole('link', { name: '唱一段投进去' })) {
      expect(link).toHaveAttribute('href', '/new');
    }
  });
});

/* ─────────────── 6. 功能页守卫（验收④） ─────────────── */

describe('功能页守卫回归（guest → /login）', () => {
  for (const [route, next] of [
    ['/river', '%2Friver'],
    ['/sea', '%2Fsea'],
    ['/settings', '%2Fsettings'],
  ] as const) {
    it(`未登录访问 ${route} 进 /login?next=${next}`, async () => {
      renderWithProviders(<RouteView />, { route });
      await waitFor(() => {
        expect(window.location.pathname).toBe('/login');
      });
      expect(window.location.search).toBe(`?next=${next}`);
    });
  }

  it('已登录访问 /river 正常渲染河道页（守卫只拦访客）', async () => {
    renderWithProviders(<RouteView />, {
      route: '/river',
      handlers: [AUTHED_ME],
    });
    expect(await screen.findByRole('heading', { name: '暖流河道' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/river');
  });
});

/* ─────────────── 7. 内容与红线 ─────────────── */

describe('内容来自头脑风暴且不逐字照搬用户示例', () => {
  const repoRoot = resolve(process.cwd(), '..', '..');
  const brainstormPath = join(repoRoot, 'docs', 'landing-brainstorm.md');

  it('docs/landing-brainstorm.md 存在，含 ≥2 个概念方向与取舍结论', () => {
    expect(existsSync(brainstormPath), '头脑风暴文档缺失').toBe(true);
    const text = readFileSync(brainstormPath, 'utf8');
    // 三个方向（超出下限 2）
    expect(text).toContain('方向 A');
    expect(text).toContain('方向 B');
    expect(text).toContain('方向 C');
    expect(text).toMatch(/取舍结论/);
    expect(text).toMatch(/\| \*\*结论\*\* \| \*\*选定\*\*/);
  });

  it('页面最终文案 = brainstorm 落点表，且不含用户示例原句/排比', async () => {
    renderLanding();
    const hero = await screen.findByRole('heading', { level: 1, name: HOOK });
    expect(hero).toBeInTheDocument();
    const pageText = document.querySelector('main')?.textContent ?? '';
    for (const fragment of USER_EXAMPLE_FRAGMENTS) {
      expect(pageText, `最终文案不得逐字出现用户示例「${fragment}」`).not.toContain(fragment);
    }
    const brainstorm = readFileSync(brainstormPath, 'utf8');
    expect(brainstorm).toContain(HOOK);
    // 价值句的唯一依据 = docs/landing-copy-v3.md §2（用户逐屏锁定）；
    // brainstorm §5 落点表的价值句措辞后经并发会话按公开评论身份口径改写（docs 不归本任务改），
    // 页面文案仍逐字跟随 copy-v3 定稿，此处按定稿文档断言。
    const copyV3 = readFileSync(join(repoRoot, 'docs', 'landing-copy-v3.md'), 'utf8');
    expect(copyV3).toContain(VALUE_LINE);
  });

  it('红线：无 emoji / AI 陈词 / lorem / 15–30 旧口径 / 内联 hex / h-screen', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'pages', 'landing-page.tsx'),
      'utf8',
    );
    const visible = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith('//') && !trimmed.startsWith('*');
      })
      .join('\n');
    expect(visible).not.toMatch(/[\u{1F300}-\u{1FAFF}]|[\u{2700}-\u{27BF}]|\u{FE0F}/u);
    for (const banned of [
      'lorem',
      'Lorem',
      '赋能',
      '一键',
      '极致体验',
      '打造',
      '颠覆',
      '重新定义',
      '无限可能',
      '为梦想',
      'Seamless',
      'Elevate',
    ]) {
      expect(visible, `含 AI 陈词「${banned}」`).not.toContain(banned);
    }
    expect(visible).not.toMatch(/15\s*[–\-~～]\s*30/);
    expect(visible).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(visible).not.toMatch(/\bh-screen\b|\bw-screen\b/);
    expect(visible).not.toMatch(/所有人能用|全民适用/);
  });

  it('CONFLICTS #7：feature/卖点卡栅格非对称（场景卡 3/2 跨度）；三等宽只出现在带序号的顺序步骤 <ol> 内', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'pages', 'landing-page.tsx'),
      'utf8',
    );
    // 场景卡（feature 类）= grid-cols-5 + 跨度 3/2 ⇒ 非三等宽
    expect(source).toContain('md:grid-cols-5');
    expect(source).toContain('md:col-span-3');
    expect(source).toContain('md:col-span-2');
    // 文件里所有 grid-cols-3 必须落在 <ol>（带序号顺序步骤，#7 豁免）
    const colThree = [...source.matchAll(/grid-cols-3/g)];
    expect(colThree.length).toBeGreaterThan(0);
    for (const match of colThree) {
      const before = source.slice(Math.max(0, match.index - 400), match.index);
      expect(before, 'grid-cols-3 只允许出现在带序号顺序步骤（<ol>）里').toMatch(
        /<ol[\s\S]*$/,
      );
    }
  });
});

/* ─────────────── 8. 底部河流 + 主瓶横向漂移（用户裁决：推翻 9/29 的「自上而下」方案） ─────────────── */

describe('底部河流与主瓶横向漂移（用户裁决：推翻 9/29 的「自上而下」方案）', () => {
  it('河道是横贯底部的一条河 + 右端有海口；主瓶在河道之上', async () => {
    renderLanding();
    await screen.findByRole('heading', { level: 1, name: HOOK });
    const stage = document.querySelector<HTMLElement>('.landing-river-stage');
    expect(stage, '底部河流层缺失').not.toBeNull();
    // 河道是一条 SVG（viewBox 1600x900 的横向长河），末端是"海口"椭圆
    const map = document.querySelector<SVGSVGElement>('.landing-river-map');
    expect(map, '河道 SVG 缺失').not.toBeNull();
    expect(map?.getAttribute('viewBox')).toBe('0 0 1600 900');
    const sea = document.querySelector<SVGEllipseElement>('[data-river-sea]');
    expect(sea, '海口（入河终点）缺失').not.toBeNull();
    // 海口在河道右端（cx 1540 / 1600 ⇒ 靠右），主瓶存在
    expect(Number(sea?.getAttribute('cx'))).toBeGreaterThan(1200);
    expect(document.querySelector('[data-journey-bottle]'), '主瓶缺失').not.toBeNull();
  });

  it('每翻一页 data-journey 递增（驱动主瓶向右走一格）；末页最右（入河）', async () => {
    renderLanding();
    await screen.findByRole('heading', { level: 1, name: HOOK });
    /** 根节点的 data-journey = 当前屏序号：CSS 按它把主瓶一格一格往右挪。 */
    const journeyIndex = (): number =>
      Number(document.querySelector<HTMLElement>('[data-journey]')?.dataset['journey'] ?? '-1');

    expect(activeScreenIndex()).toBe(0);
    expect(journeyIndex()).toBe(0);
    fireEvent.wheel(window, { deltaY: 120 });
    expect(activeScreenIndex()).toBe(1);
    expect(journeyIndex(), '翻一页 data-journey 应 +1（主瓶随之右移一格）').toBe(1);
    fireEvent.keyDown(window, { key: 'End' });
    expect(activeScreenIndex()).toBe(SCREEN_COUNT - 1);
    expect(journeyIndex(), '末屏 data-journey = 7（主瓶最右 = 入海口）').toBe(SCREEN_COUNT - 1);
    fireEvent.keyDown(window, { key: 'Home' });
    expect(activeScreenIndex()).toBe(0);
    expect(journeyIndex(), '回到首页反向漂回起点').toBe(0);
  });

  it('主瓶横向位移由 CSS 按 data-journey 驱动：只动 transform/opacity、x 单调递增', () => {
    const css = readFileSync(resolve(process.cwd(), 'src', 'pages', 'landing-page.css'), 'utf8');
    // 河道层是装饰：不吃指针、不吃无障碍（内容在其上方滚动）
    expect(css).toMatch(/\.landing-river-stage\s*\{[^}]*pointer-events:\s*none/);
    expect(css).toMatch(/\.landing-river-stage\s*\{[^}]*z-index:\s*1/);
    // 主瓶逐屏横移（只取 @media 之外的桌面段；窄屏段是另一套刻度，不在此断言）：
    // x 分量从 -39vw 单调走到 +40vw（每页一格、由左到右）。
    const desktopCss = css.split('@media')[0] ?? '';
    const desktopXs = [...desktopCss.matchAll(/\[data-journey='(\d)'\]\s*\.landing-protagonist\s*\{[^}]*translate3d\(\s*calc\(-50%\s*([+-])\s*(\d+)vw/g)]
      .map((m) => (m[2] === '-' ? -Number(m[3]) : Number(m[3])));
    expect(desktopXs.length, '应逐屏定义主瓶横移').toBeGreaterThanOrEqual(7);
    for (let i = 1; i < desktopXs.length; i += 1) {
      expect(desktopXs[i], `第 ${String(i)} 屏的 x 必须大于上一屏（向右漂）`).toBeGreaterThan(desktopXs[i - 1] ?? 0);
    }
    expect(desktopXs[0]).toBeLessThan(0);
    expect(desktopXs[desktopXs.length - 1] ?? 0, '末屏应漂到右侧（入海口）').toBeGreaterThan(0);
    // 逐屏位移只允许 transform / opacity，且时长走 token
    const proto = /\.landing-protagonist\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(proto).toContain('transition-property: transform, opacity');
    expect(proto).toContain('var(--motion-page-duration)');
    expect(proto).toContain('var(--motion-entry-easing)');
    // 海口随接近而点亮（末屏最亮）
    expect(css).toMatch(/\[data-journey='7'\]\s*\.landing-river-sea\s*\{[^}]*opacity:\s*0\.9/);
    // 动效只动 transform/opacity：全文件不许有 transition 动画 width/height/top/left
    expect(css).not.toMatch(/transition(?:-property)?:[^;}]*\b(width|height|top|left)\b/);
    // 源码里不内联毫秒/缓动
    const source = readFileSync(resolve(process.cwd(), 'src', 'pages', 'landing-page.tsx'), 'utf8');
    expect(source).not.toMatch(/transitionDuration:\s*['"]?\d/);
    expect(source).not.toMatch(/transition:\s*['"][^'"]*\d+ms/);
  });
});

/* ─────────────── 9. 末屏入海意向（用户 9/29 裁决） ─────────────── */

describe('末屏「投出你的第一瓶」CTA 入海意向', () => {
  it('CTA 区呈现入海/公海语义（data-cta-into-sea），链接仍指 /login?next=%2Friver', async () => {
    renderLanding();
    await screen.findByRole('heading', { level: 1, name: HOOK });
    fireEvent.keyDown(window, { key: 'End' });
    expect(activeScreenIndex()).toBe(SCREEN_COUNT - 1);
    const cta = screen.getByRole('link', { name: CTA });
    expect(cta).toHaveAttribute('href', '/login?next=%2Friver');
    const ctaArea = cta.closest('[data-cta-into-sea]');
    expect(ctaArea, 'CTA 区需要入海意向标记 data-cta-into-sea').not.toBeNull();
    expect(ctaArea?.textContent ?? '').toMatch(/入海|公海/);
    const tryScreen = document.querySelectorAll('[data-landing-screen]')[SCREEN_COUNT - 1];
    expect(tryScreen?.textContent ?? '').toContain('投出你的第一瓶');
  });
});
