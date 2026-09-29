/**
 * 交互态契约（W18.5 · A1/A2/A4 共用一个文件，按切片逐段追加）。
 *
 * 要钉住的事：`DESIGN.md` §Interaction States 规定每个交互元素都必须有
 * default / hover / active / focus-visible 的**视觉差异**，且
 * §Elevation 的性能纪律要求过渡只动 `transform` / `opacity`（颜色变化允许，
 * 因为不触发重排），参数只引 `--motion-*` 契约 token。
 *
 * 为什么用「静态扫描 CSS」而不是渲染后测量：
 *   1. 这些页面是绝对落位的复刻构图（`bottle-page.css` 的坐标系按参考稿逐值照抄），
 *      hover 态在 jsdom 里既不触发也不可测量；
 *   2. 静态扫描能同时钉住「有 hover/active」与「参数没有写死」两件事 ——
 *      后者才是本轮真正要防的回归（前端已有 4 套 hover 词汇并存的历史）。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string =>
  readFileSync(join(here, '..', '..', rel), 'utf8');

/** 取出「某个选择器声明块」的全部原文（同一选择器可能被多段媒体查询各写一次）。 */
const rulesOf = (css: string, selector: string): string =>
  (css.match(new RegExp(`(?:^|[,{}])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:,[^{]*)?\\{[^}]*\\}`, 'gm')) ?? []).join('\n');

/** 取出「某个选择器的 :hover / :active 态」原文。 */
const stateRulesOf = (css: string, selector: string, state: ':hover' | ':active'): string =>
  rulesOf(css, `${selector}${state}`);

describe('A1 瓶详情页：主 CTA 的交互态（DESIGN §Interaction States）', () => {
  const css = read('pages/bottle-page.css');
  const CTA = '.bottle-page .gapBox .cta';

  it('过渡只动 transform 与颜色，且时长/缓动只引契约 token（不写字面量）', () => {
    const base = rulesOf(css, CTA);
    expect(base, '.cta 没有任何 transition 声明（悬停与按下都没有回应）').toMatch(/transition:/);
    expect(base, '.cta 的过渡必须引 var(--motion-hover-duration)').toMatch(
      /var\(--motion-hover-duration\)/,
    );
    expect(base, '.cta 的过渡必须引 var(--motion-entry-easing)').toMatch(
      /var\(--motion-entry-easing\)/,
    );
    expect(base, '.cta 不得写时间字面量').not.toMatch(/\d+(?:\.\d+)?ms\b/);
    expect(base, '.cta 不得 transition-all').not.toMatch(/transition:\s*all/);
  });

  it('hover = scale(1.03)（token 引用），落在 hover-capable 媒体查询里', () => {
    expect(css, 'hover 规则必须包在 @media (hover: hover) 里（触屏不留粘滞 hover）').toMatch(
      /@media[^{]*\(hover:\s*hover\)/,
    );
    const hover = stateRulesOf(css, CTA, ':hover');
    expect(hover, '.cta:hover 缺失').not.toBe('');
    expect(hover, '.cta:hover 必须用 token 化的 scale(var(--motion-hover-scale))').toMatch(
      /scale\(\s*var\(--motion-hover-scale\)\s*\)/,
    );
  });

  it('active = translateY(-1px)，不写死档位（DESIGN §Components 按钮规格）', () => {
    const active = stateRulesOf(css, CTA, ':active');
    expect(active, '.cta:active 缺失').not.toBe('');
    expect(active).toMatch(/translateY\(-1px\)/);
  });
});

describe('A1 瓶详情页：其余可点控件的交互态', () => {
  const css = read('pages/bottle-page.css');

  /** 描边族按钮：hover 只提亮细线，**不填充**（DESIGN §Components button-ghost）。 */
  const GHOST_BUTTONS = [
    '.bottle-page .play',
    '.bottle-page .votes button',
    '.bottle-page .putBack .ghost',
  ];

  it.each(GHOST_BUTTONS)('%s 声明了 token 化过渡', (selector) => {
    const base = rulesOf(css, selector);
    expect(base, `${selector} 没有 transition`).toMatch(/transition:/);
    expect(base, `${selector} 的过渡必须引 var(--motion-hover-duration)`).toMatch(
      /var\(--motion-hover-duration\)/,
    );
  });

  it.each(GHOST_BUTTONS)('%s 的 hover 只提亮描边、不填充', (selector) => {
    const hover = stateRulesOf(css, selector, ':hover');
    expect(hover, `${selector}:hover 缺失`).not.toBe('');
    expect(hover, `${selector}:hover 必须提亮 border-color`).toMatch(/border-color:/);
    expect(hover, `${selector}:hover 不得改背景（DESIGN ghost：细线提亮，不填充）`).not.toMatch(
      /background(?:-color)?:\s*(?!transparent|none)/,
    );
  });

  it.each(GHOST_BUTTONS)('%s 的 active 有按下位移', (selector) => {
    expect(stateRulesOf(css, selector, ':active'), `${selector}:active 缺失`).toMatch(
      /translateY\(-1px\)/,
    );
  });

  /** 行与文字链：hover 改文字色（不是描边族按钮）。 */
  const TEXT_TARGETS = [
    '.bottle-page .bp-crumb a',
    '.bottle-page .destRow',
    '.bottle-page .bottom a',
    '.bottle-page .bottom button',
  ];

  it.each(TEXT_TARGETS)('%s 的 hover 改文字色且走 token 化过渡', (selector) => {
    expect(rulesOf(css, selector), `${selector} 没有 transition`).toMatch(/transition:/);
    const hover = stateRulesOf(css, selector, ':hover');
    expect(hover, `${selector}:hover 缺失`).not.toBe('');
    expect(hover, `${selector}:hover 必须改 color`).toMatch(/color:/);
  });
});

describe('A1 瓶详情页：过渡纪律（只动 transform/opacity，禁布局属性）', () => {
  const css = read('pages/bottle-page.css');
  const transitionDecls = (css.match(/transition:[^;}]+/g) ?? []).join('\n');

  it('全文件不出现 transition-all', () => {
    expect(transitionDecls).not.toMatch(/transition:\s*all/);
  });

  it('全文件不动画布局属性（width/height/top/left/margin/padding/box-shadow）', () => {
    expect(transitionDecls).not.toMatch(
      /transition:[^;}]*\b(width|height|top|left|right|bottom|margin|padding|box-shadow)\b/,
    );
  });

  it('全文件 transition 声明不写时间字面量（时长一律来自 --motion-* token）', () => {
    expect(transitionDecls).not.toMatch(/\d+(?:\.\d+)?ms\b/);
  });
});

describe('A2 公海大厅：分区 tab 的交互态', () => {
  const src = read('pages/sea-page.tsx');
  const TAB = '.sea-hall .zones li';

  it('tab 悬停有回应（提亮文字 + 显形下框线），且关在 hover-capable 媒体查询里', () => {
    expect(src, 'hover 规则必须包在 @media (hover: hover) 里').toMatch(
      /@media[^{]*\(hover:\s*hover\)/,
    );
    const hover = stateRulesOf(src, TAB, ':hover');
    expect(hover, '分区 tab:hover 缺失（cursor:pointer 承诺了交互，悬停却无回应）').not.toBe('');
    expect(hover, 'tab:hover 必须提亮 color').toMatch(/color:/);
    expect(hover, 'tab:hover 必须让下框线显形（border-bottom-color）').toMatch(/border-bottom-color:/);
  });

  it('tab 按下有 translateY(-1px) 回应', () => {
    expect(stateRulesOf(src, TAB, ':active'), '分区 tab:active 缺失').toMatch(
      /translateY\(-1px\)/,
    );
  });

  it('hover 规则不写时间字面量/缓动（参数只来自 --motion-* token）', () => {
    const hover = stateRulesOf(src, TAB, ':hover');
    expect(hover).not.toMatch(/\d+(?:\.\d+)?ms\b/);
    expect(hover).not.toMatch(/cubic-bezier|ease-(?:linear|in|out|in-out)/);
  });
});

describe('A3 文字链接：6 个变体的悬停/按下反馈（DESIGN §Interaction States）', () => {
  const linkStyles = read('pages/shell/link-styles.ts');

  /** 取 `export const NAME = … '类名字符串'`：定义与字符串之间允许有注释行与换行。 */
  const classNameOf = (src: string, name: string): string =>
    new RegExp(`\\b${name}\\s*=\\s*(?:cn\\()?[^']{0,600}?'([^']*)'`, 's').exec(src)?.[1] ?? '';

  /** 只有这两个变体已带反馈；其余四个（TEXT_LINK / TEXT_LINK_STRONG / NEXT / COOL）本轮补齐。 */
  const SHARED = [
    { file: 'pages/shell/link-styles.ts', name: 'TEXT_LINK' },
    { file: 'pages/shell/link-styles.ts', name: 'TEXT_LINK_STRONG' },
    { file: 'pages/bottle-page.tsx', name: 'NEXT_TEXT_LINK' },
    { file: 'pages/login-page.tsx', name: 'TEXT_LINK_COOL' },
    { file: 'pages/not-found-page.tsx', name: 'TEXT_LINK_COOL' },
  ];

  it.each(SHARED)('$name 声明了 token 化过渡', ({ file, name }) => {
    const decl = classNameOf(read(file), name);
    expect(decl, `${name} 的类名字符串没找到（定义形态变了？）`).not.toBe('');
    expect(decl, `${name} 缺 transition`).toMatch(/transition-/);
    expect(decl, `${name} 的过渡必须引 var(--motion-hover-duration)`).toMatch(
      /duration-\[var\(--motion-hover-duration\)\]/,
    );
    expect(decl, `${name} 不得写内联时长档 duration-200`).not.toMatch(/\bduration-\d/);
    expect(decl, `${name} 不得写 ease-out 字面档`).not.toMatch(/\bease-(?:linear|in|out|in-out)\b/);
  });

  it.each(SHARED)('$name 的悬停有可见变化且带焦点环', ({ file, name }) => {
    const decl = classNameOf(read(file), name);
    expect(decl, `${name} 缺 hover 态`).toMatch(/hover:/);
    expect(decl, `${name} 缺 focus-visible 焦点环（DESIGN §Accessibility：2px coral）`).toMatch(
      /focus-visible:ring-2/,
    );
    expect(decl, `${name} 不得 transition-all`).not.toMatch(/transition-all/);
  });

  it('scale 悬停只挂在按钮/实心行动链上，文字链不放大（避免与相邻内容重叠）', () => {
    // TEXT_LINK / TEXT_LINK_STRONG 是行内文字链：放大 1.03 会与同行相邻文字互相压边，
    // 因此文字链只做提亮 + 下划线位移，按钮族（GHOST/PRIMARY）才 scale。
    for (const name of ['TEXT_LINK', 'TEXT_LINK_STRONG']) {
      const decl = classNameOf(linkStyles, name);
      expect(decl, `${name} 不该有 hover:scale（文字链放大会压到相邻内容）`).not.toMatch(
        /hover:scale/,
      );
      expect(decl, `${name} 应改文字色或下划线作为悬停信号`).toMatch(
        /hover:(?:text|decoration|underline)/,
      );
    }
    for (const name of ['TEXT_LINK_GHOST', 'TEXT_LINK_PRIMARY']) {
      const decl = classNameOf(linkStyles, name);
      expect(decl, `${name} 保持 token 化 scale 悬停`).toMatch(
        /hover:scale-\[var\(--motion-hover-scale\)\]/,
      );
    }
  });
});

describe('A4 我的 / 漂流日志 / 设置：可点元素的反馈完整性', () => {
  const driftLogPage = read('pages/drift-log-page.tsx');
  const settingsPage = read('pages/settings-page.tsx');

  it('我的：.go 出口（两处）自带 token 化过渡 + 悬停/按下/焦点反馈', () => {
    // .go 是本页自建的出口文字链（glass 色），不走 link-styles 的 TEXT_LINK 变体，
    // 所以它必须自己声明全套反馈 —— 否则「查看/接唱」这类唯一出口点了没反应。
    const css = read('pages/profile-page.css');
    const go = rulesOf(css, '.p-record .mrow .go');
    expect(go, '.go 没有 transition').toMatch(/transition:/);
    expect(go, '.go 的过渡必须引 var(--motion-hover-duration)').toMatch(
      /var\(--motion-hover-duration\)/,
    );
    expect(go, '.go 不得写时间字面量').not.toMatch(/\d+(?:\.\d+)?ms\b/);

    expect(stateRulesOf(css, '.p-record .mrow .go', ':hover'), '.go:hover 缺失').toMatch(
      /color:/,
    );
    expect(stateRulesOf(css, '.p-record .mrow .go', ':active'), '.go:active 缺失').toMatch(
      /translateY\(-1px\)/,
    );
  });

  it('设置：可点控件走设计系统 Button（反馈由 DS 统一提供，不自造）', () => {
    const buttons = settingsPage.match(/<Button/g)?.length ?? 0;
    expect(buttons, '设置页应使用 DS Button').toBeGreaterThanOrEqual(2);
    expect(settingsPage, '不得自造裸 <button> 绕过 DS 反馈').not.toMatch(/<button(?![^>]*type=)/);
  });

  it('漂流日志：页头「回漂流瓶」是唯一可点出口，它必须自带悬停/按下/焦点反馈', () => {
    const crumb = /<Link\s+to=\{`\/bottles\/\$\{id\}`\}\s+className="([^"]+)"/s.exec(
      driftLogPage,
    )?.[1];
    expect(crumb, '没找到「回漂流瓶」链接的 className').toBeTruthy();
    const cls = crumb ?? '';
    expect(cls, '面包屑链缺 token 化过渡').toMatch(
      /duration-\[var\(--motion-hover-duration\)\]/,
    );
    expect(cls, '面包屑链缺悬停信号').toMatch(/hover:/);
    expect(cls, '面包屑链缺 focus-visible 焦点环').toMatch(/focus-visible:ring-2/);
    expect(cls, '面包屑链缺按下回应').toMatch(/active:/);
    expect(cls, '不得 transition-all').not.toMatch(/transition-all/);
  });

  it('三页的 CSS 都不出现布局属性过渡（禁 width/height/top/left 动画）', () => {
    for (const rel of [
      'pages/profile-page.css',
      'pages/settings-page.css',
      'pages/drift-log-page.css',
    ]) {
      const css = read(rel);
      const decls = (css.match(/transition:[^;}]+/g) ?? []).join('\n');
      expect(decls, `${rel} 不得动画布局属性`).not.toMatch(
        /transition:[^;}]*\b(width|height|top|left|right|bottom|margin|padding|box-shadow)\b/,
      );
      expect(decls, `${rel} 不得 transition-all`).not.toMatch(/transition:\s*all/);
    }
  });
});

describe('A6 按下反馈：触屏也要有即时回应（DESIGN §Interaction States 的 active 行）', () => {
  /**
   * 为什么单列一条守卫：悬停在触屏上不存在（`ui-ux` ux-guidelines #11「主交互不能只靠
   * hover」），所以 `active:` 是触屏唯一的即时反馈。此前只有 DS Button / BottomNav /
   * 投票按钮有，主顶栏、DS Tabs、landing 圆点导航这三处最显眼的导航件反而缺。
   */
  it('主顶栏入口有 active 按下反馈', () => {
    const src = read('pages/shell/top-nav.tsx');
    // 顶栏入口的 className 块以 `hover:-translate-y-px` 为锚（该入口唯一的悬停动作）
    const navItem = /'hover:-translate-y-px',[\s\S]{0,600}?\)\}/.exec(src)?.[0] ?? '';
    expect(navItem, '没找到顶栏入口的 className 块').not.toBe('');
    expect(navItem, '顶栏入口缺 active 按下反馈').toMatch(/active:/);
  });

  it('设计系统 Tabs 有 active 按下反馈', () => {
    const src = read('design-system/tabs.tsx');
    expect(src, 'Tabs 缺 active 按下反馈').toMatch(/active:/);
  });

  it('Landing 圆点导航有 active 按下反馈', () => {
    const src = read('pages/landing-page.tsx');
    const dot = /aria-label=\{`第 \$\{screenIndex \+ 1\} 屏[\s\S]{0,600}?className=\{cn\(([\s\S]{0,400}?)\)\}/.exec(
      src,
    )?.[1];
    expect(dot, '没找到圆点按钮的 className').toBeTruthy();
    expect(dot, '圆点按钮缺 active 按下反馈').toMatch(/active:/);
  });

  it('按下位移只用 Tailwind 的 1px 档（不写 translateY(2px) 之类自造值）', () => {
    for (const rel of [
      'pages/shell/top-nav.tsx',
      'design-system/tabs.tsx',
      'pages/landing-page.tsx',
    ]) {
      const src = read(rel);
      expect(src, `${rel} 出现了自造的按下位移`).not.toMatch(/translate-y-\[(?!1px)/);
    }
  });
});

describe('C5 CSS 文件也在守卫范围内（补长期盲区）', () => {
  /**
   * 盲区由来：既有守卫全部扫 **TSX**（`motion-apply.test.tsx` 的两组页面清单、
   * `motion-contract.test.tsx` 的 `motion.css`），而**页面级 CSS**
   * （`bottle-page.css` / `profile-page.css` / `settings-page.css` /
   *  `drift-log-page.css` / `landing-page.css` / 各页内联 `SEA_HALL_CSS`）
   * 从来没被扫过 —— 于是：
   *   · 在 CSS 里写 `transition: width` 不会红；
   *   · 在 CSS 里写 `ease-in-out` 字面量不会红（water.css 的那两条直到 B7 才被收编）；
   *   · 在 CSS 里写 `300ms` 时间字面量不会红。
   *
   * 本组把 CSS 纳入同一口径。需要放行的只有一类：
   *   **转场/进度/骨架这三类"物理上必须动尺寸"的东西**
   *   （`transition: width` 的进度槽、`transform` 之外的骨架 shimmer 背景位移），
   *   它们必须逐个显式登记，不许"整文件豁免"。
   */
  const CSS_FILES: ReadonlyArray<readonly [string, string]> = [
    ['pages/bottle-page.css', read('pages/bottle-page.css')],
    ['pages/profile-page.css', read('pages/profile-page.css')],
    ['pages/settings-page.css', read('pages/settings-page.css')],
    ['pages/drift-log-page.css', read('pages/drift-log-page.css')],
    ['pages/sea-page.tsx（内联 CSS）', read('pages/sea-page.tsx')],
    ['pages/landing-page.tsx（内联 CSS）', read('pages/landing-page.tsx')],
  ];

  /** 逐个登记的合法例外（选择器 + 原因）。新增例外必须在这里加一行 + 写理由。 */
  const ALLOWED: ReadonlyArray<readonly [string, string]> = [
    ['skeleton-shimmer', '骨架掠光：必须动 background-position 才能"扫过"，transform 做不到'],
  ];

  it.each(CSS_FILES)('%s 不写时间字面量（时长一律来自 --motion-* token）', (_name, src) => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const literals = [...code.matchAll(/(?:animation|transition)[^;{}]*?(\d+(?:\.\d+)?)ms/g)].map(
      (m) => m[0].trim(),
    );
    expect(
      literals.join(' | '),
      `${_name} 的动效声明里出现时间字面量（应引 var(--motion-*)）`,
    ).toBe('');
  });

  it.each(CSS_FILES)('%s 不写缓动字面量', (_name, src) => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const decls = (code.match(/(?:animation|transition)[^;{}]+/g) ?? []).join('\n');
    const offenders = decls
      .split('\n')
      .filter((line) => ALLOWED.every(([sel]) => !line.includes(sel)))
      .filter((line) => /\bease-(?:linear|in|out|in-out)\b/.test(line));
    expect(offenders.join(' | '), `${_name} 仍有缓动字面量`).toBe('');
  });

  it.each(CSS_FILES)('%s 不动画布局属性（width/height/top/left/margin/padding/box-shadow）', (_name, src) => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const decls = (code.match(/transition(?:-[a-z-]+)?\s*:[^;{}]+/g) ?? []).join('\n');
    const offenders = decls
      .split('\n')
      .filter((line) => ALLOWED.every(([sel]) => !line.includes(sel)))
      .filter((line) => /\b(width|height|top|left|right|bottom|margin|padding|box-shadow)\s*:/.test(line));
    expect(offenders.join(' | '), `${_name} 仍动画布局属性`).toBe('');
  });

  it('例外是逐条登记的，不是整文件放行', () => {
    // 守卫本身的形状：例外表必须存在且非空（否则上面几条就是"整文件豁免"）
    expect(ALLOWED.length, '例外表为空 ⇒ 等于整文件豁免，盲区没补上').toBeGreaterThan(0);
    for (const [selector, reason] of ALLOWED) {
      expect(reason.length, `例外 ${selector} 没写理由`).toBeGreaterThan(10);
    }
  });
});

describe('C4 离线态：预告而不是静默失败（横幅 + 禁危险操作，录音继续）', () => {
  /**
   * 缺口：全站此前**零** `navigator.onLine` 处理（grep = 0 命中），
   * 只有一句兜底文案。于是在录音/上传/投票场景里，断网的表现是
   * "点了没反应"或"过一会儿才报错" —— 录音是最不能接受这种不确定性的场景。
   *
   * 三条决定（用户裁决）：
   *   1. 横幅 = 顶栏下方 sticky 细条（断网是全局状态，不该要用户滚到底部找）；
   *   2. 禁用「会把数据丢在网络请求上」的操作；**录音不禁**（音频在本地）；
   *   3. 不静默：横幅走 role="status"，断网与恢复都要被读屏播报。
   */
  const offline = read('design-system/offline.tsx');
  const appShell = read('pages/shell/app-shell.tsx');

  it('订阅 online/offline 事件（不是轮询 navigator.onLine）', () => {
    expect(offline, "必须监听 'online' 事件").toMatch(/addEventListener\('online'/);
    expect(offline, "必须监听 'offline' 事件").toMatch(/addEventListener\('offline'/);
    expect(offline, '必须解绑（否则热重载会叠加监听）').toMatch(/removeEventListener\('offline'/);
  });

  it('横幅挂在外壳层 ⇒ 全站每一页自动覆盖', () => {
    expect(appShell, '离线横幅必须挂在 AppShell（外壳），而不是某个页面').toMatch(
      /OfflineBanner/,
    );
    expect(appShell, '外壳必须用 useOnline 订阅').toMatch(/useOnline\(\)/);
  });

  it('横幅可读：role=status + 图标 + 说明「录音仍可继续」', () => {
    expect(offline, '横幅必须 role="status"（读屏要能听到）').toMatch(/role="status"/);
    expect(offline, '横幅必须 aria-live').toMatch(/aria-live="polite"/);
    expect(offline, '横幅必须带图标（不能只靠颜色）').toMatch(/<Icon/);
    expect(offline, '文案必须说明录音仍可录（这是本条的关键承诺）').toMatch(/继续录音/);
  });

  it('危险操作被禁用，但录音不受影响', () => {
    const vote = read('features/bottle/vote-controls.tsx');
    expect(vote, '投票（依赖网络请求）应在断网时禁用').toMatch(/disabled=\{[^}]*!online/);
    // 关键：录音链路不得引入 offline 禁用
    const recorder = read('features/audio/recorder-panel.tsx');
    expect(recorder, '录音面板不得因断网被禁用（音频在本地，禁掉更差）').not.toMatch(
      /useOnline|!online|OfflineBanner/,
    );
  });

  it('不静默失败：断网态由全局兜底文案之外的横幅承担', () => {
    // 横幅文案必须具体说明"哪些还能做、哪些不能"，而不是只说"网络异常"
    const copy = /网络没有接通[\s\S]{0,120}/.exec(offline)?.[0] ?? '';
    expect(copy, '横幅文案要具体（说明录音可继续、投票要等网络）').toMatch(/录音/);
    expect(copy, '横幅文案要说明受限操作').toMatch(/投票|评论/);
  });
});

describe('C3 滚动驱动一次性入场：只播一次、参数来自契约、不引入新通道', () => {
  /**
   * 契约依据：DESIGN 零装饰动效规则的第 ③ 类例外（2026-09-29 用户裁决）。
   * 四条硬边界：只对内容块 / 一次性（once）/ 参数只来自既有契约 / 首屏内容不进观察器。
   *
   * 特别要防的是"变成 scroll 劫持"：如果实现里出现 `unobserve` 缺失、
   * 反复 add/remove 类、或 `animation-timeline`，就说明它在随滚动来回播 ——
   * 那是本项目明令禁止的不适来源。
   */
  const src = read('design-system/scroll-enter.ts');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('用 IntersectionObserver，而不是连续 scroll-driven（animation-timeline）', () => {
    expect(code, '应使用 IntersectionObserver').toMatch(/IntersectionObserver/);
    expect(code, '不得引入 animation-timeline（连续 scroll-driven，用户裁决明确排除）').not.toMatch(
      /animation-timeline/,
    );
  });

  it('一次性：命中即 unobserve（不回滚、不来回播）', () => {
    expect(code, '命中后必须 unobserve，否则会随滚动反复播').toMatch(/observer\.unobserve\(/);
    expect(code, '必须有幂等保护（appliedRef）').toMatch(/appliedRef/);
  });

  it('参数只来自既有契约（复用 enter-rise，不新增时长/位移）', () => {
    expect(code, '应挂既有的 enter-rise 类（时长与位移在 motion.css 的 --entry-* 里）').toMatch(
      /classList\.add\('enter-rise'\)/,
    );
    // 不得自造任何时长/位移数值
    expect(code, '不得内联时长字面量').not.toMatch(/\d+(?:\.\d+)?ms\b/);
    expect(code, '不得内联 translateY 位移').not.toMatch(/translateY\(/);
  });

  it('首屏内容不进观察器（它们本来就该直接可见）', () => {
    expect(code, '必须先量 rect 判断是否已在视口内').toMatch(/getBoundingClientRect\(\)/);
    expect(code, '视口内直接挂类，不 observe').toMatch(/if \(!inViewport\) observer\.observe/);
  });

  it('装饰与母题装置不参与（只对内容块）', () => {
    // 契约第 1 条：只对内容块。选择器只认 data-scroll-enter 标记的内容块，
    // 不去扫装饰层（.clip / .bp-scene / aria-hidden 的层）。
    expect(code, '只通过 data-scroll-enter 标记参与').toMatch(/data-scroll-enter/);
    expect(code, '不得扫装饰层选择器').not.toMatch(/aria-hidden|\.clip|\.platter/);
  });

  it('reduced-motion 由全局兜底降级（本实现不另开通道）', () => {
    expect(code, '应读 prefersReducedMotion（reduce 下不建观察器）').toMatch(
      /prefersReducedMotion/,
    );
    // 入场类本身在 motion.css 的 reduce 块里被复位为 opacity 淡入
    const motionCss = read('design-system/motion.css');
    expect(motionCss, 'enter-rise 必须在 reduce 块里被复位').toMatch(
      /\.enter-rise,[\s\S]{0,80}?animation: none/,
    );
  });

  it('契约条款已写进 DESIGN.md（四条边界 + 理由）', () => {
    const design = readFileSync(join(here, '..', '..', '..', '..', '..', 'DESIGN.md'), 'utf8');
    expect(design, 'DESIGN.md 缺 guidance 型滚动入场条款').toMatch(/guidance 型滚动入场/);
    const clause = /guidance 型滚动入场[\s\S]{0,1200}/.exec(design)?.[0] ?? '';
    expect(clause, '条款必须写明"只对内容块"').toMatch(/只对内容块/);
    expect(clause, '条款必须写明"一次性"').toMatch(/一次性/);
    expect(clause, '条款必须写明不新增 token').toMatch(/不新增任何时长|不新增时长/);
  });
});

describe('C2 触觉反馈：有守卫、有最短 pattern、不阻塞（用户裁决：全量无开关）', () => {
  /**
   * 触觉是**最早到达**的反馈通道：用户按下按钮的那一瞬往往还没看结果。
   * 投瓶 / 捞瓶 / 投票这类"一次性或不可逆"的操作给一次短促震动，操作更有实感。
   *
   * 但它也是最容易做坏的一层：桌面浏览器根本没有 `navigator.vibrate`，
   * 所以守卫钉住三条底线：
   *   ① **有守卫**：不支持时静默跳过，绝不抛错、绝不 await；
   *   ② **pattern 最短**：单次 12ms / 确认两下 10-40-18，不做成"震动 DSL"；
   *   ③ **不阻塞**：触感是纯副作用，失败不影响操作结果。
   */
  const haptics = read('design-system/haptics.ts');

  it('不支持 vibrate 的环境静默跳过（桌面浏览器）', () => {
    expect(haptics, '必须先探测 navigator.vibrate 是否存在').toMatch(
      /typeof api\.vibrate !== 'function'|\.vibrate === undefined|typeof .*\.vibrate/,
    );
    expect(haptics, '必须有 try/catch（无用户手势时部分浏览器抛错）').toMatch(/try\s*\{/);
    expect(haptics, 'catch 必须为空操作（触感是纯副作用）').toMatch(/catch\s*\{[\s\S]{0,200}?\}/);
  });

  it('pattern 保持最短（不做成震动 DSL）', () => {
    const code = haptics.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const tap = /const TAP_MS = (\d+)/.exec(code)?.[1];
    expect(tap, '未找到单击时长').toBeDefined();
    // 低于 ~10ms 多数马达不响应；高于 ~20ms 开始像"敲"
    expect(Number(tap), `单击 ${String(tap)}ms 超出 10..20 的可用区间`).toBeGreaterThanOrEqual(10);
    expect(Number(tap), `单击 ${String(tap)}ms 超出 10..20 的可用区间`).toBeLessThanOrEqual(20);
    // 只有两种模式，不做可配置的震动序列表
    expect(code, '只允许 tap / confirm 两种模式').toMatch(/type HapticPattern = 'tap' \| 'confirm'/);
    expect(code, '不得出现可配置的模式表').not.toMatch(/Record<HapticPattern/);
  });

  it('触感不参与 await（纯副作用，不阻塞交互）', () => {
    expect(haptics, 'vibrate 的返回值不可 await').not.toMatch(/await\s+.*vibrate/);
    expect(haptics, '导出函数不得返回 Promise').not.toMatch(/async function haptic/);
  });

  it('落点处同时给触感（与涟漪同拍：视觉之外多一条通道）', () => {
    const vote = read('features/bottle/vote-controls.tsx');
    expect(vote, '投票按钮未接触感').toMatch(/hapticTap\(\)/);
  });

  it('投/捞两个泊位都接上了（这是产品的一等动作）', () => {
    const river = read('pages/river-page.tsx');
    const taps = (river.match(/hapticTap\(\)/g) ?? []).length;
    expect(taps, '投下与捞取都应给触感').toBeGreaterThanOrEqual(2);
    expect(river, '捞取成功应给确认触感').toMatch(/hapticConfirm\(\)/);
  });

  it('河道页的红灯语义不受影响（reduced-motion 下触感仍可发）', () => {
    // 触感不是动效，不受 prefers-reduced-motion 管 —— 那是视觉通道的规则
    expect(haptics, '触感实现里不应出现 motion 相关判断').not.toMatch(/prefers-reduced-motion/);
  });
});

describe('C1 落点涟漪：与场景涟漪是两个角色，参数来自契约', () => {
  /**
   * 关键区分（DESIGN「Ripples — 两个角色，不可混为一谈」）：
   *   场景涟漪 `.ripple-ring`  = 常驻母题、infinite、不进内容区；
   *   落点涟漪 `.tap-ripple`  = 事件驱动、**播一次即停**、回答"这一下落到哪"。
   * 两者参数必须不同（2400ms/infinite vs 700ms/once），复用同一个类就等于
   * 把「刚刚发生过的事」和「世界的底」混成一样的东西。
   */
  const motionCss = read('design-system/motion.css');
  const themeCss = read('design-system/theme.css');

  it('落点涟漪是独立类，不复用场景涟漪', () => {
    expect(motionCss, '缺 .tap-ripple（落点涟漪）').toMatch(/\.tap-ripple\s*\{/);
    expect(motionCss, '场景涟漪应保持 infinite 常驻').toMatch(
      /\.ripple-ring\s*\{[^}]*infinite/,
    );
    expect(motionCss, '落点涟漪不得是 infinite（它播一次即停）').not.toMatch(
      /\.tap-ripple\s*\{[^}]*infinite/,
    );
  });

  it('落点涟漪的时长与峰值引契约 token，不写数值', () => {
    const block = /\.tap-ripple\s*\{[^}]*\}/.exec(motionCss)?.[0] ?? '';
    expect(block).toMatch(/var\(--tap-ripple-duration\)/);
    expect(block, '不得写时间字面量').not.toMatch(/\d+(?:\.\d+)?ms\b/);
    const keyframes = /@keyframes ocean-tap-ripple \{[\s\S]*?\n\}/.exec(motionCss)?.[0] ?? '';
    expect(keyframes, 'peak 必须引 var(--tap-ripple-peak)').toMatch(
      /var\(--tap-ripple-peak\)/,
    );
    // 只动 transform + opacity（§Elevation 性能纪律）
    expect(keyframes).not.toMatch(/(width|height|top|left|margin|box-shadow)\s*:/);
  });

  it('契约三处同源：DESIGN / theme.css / motion.css 都有', () => {
    const design = readFileSync(join(here, '..', '..', '..', '..', '..', 'DESIGN.md'), 'utf8');
    expect(design, 'DESIGN.md 缺 tapRippleDuration').toMatch(/tapRippleDuration:\s*700ms/);
    expect(design, 'DESIGN.md 缺 tapRipplePeak').toMatch(/tapRipplePeak:\s*1\.6/);
    expect(themeCss, 'theme.css 未暴露 --motion-tap-ripple-duration').toContain(
      '--motion-tap-ripple-duration: 700ms',
    );
    expect(motionCss, 'motion.css 未定义 --tap-ripple-duration').toContain(
      '--tap-ripple-duration: 700ms',
    );
  });

  it('涟漪是纯装饰：读屏隐藏 + 不可点（DESIGN 装饰三约束）', () => {
    const src = read('design-system/tap-ripple.tsx');
    expect(src, '涟漪必须 aria-hidden').toMatch(/aria-hidden/);
    expect(src, '涟漪必须 pointer-events-none').toMatch(/pointer-events-none/);
    expect(src, '涟漪必须绝对定位（不参与布局）').toMatch(/absolute/);
  });

  it('就地操作确实接上了（投票按钮是最典型的落点反馈点）', () => {
    const src = read('features/bottle/vote-controls.tsx');
    expect(src, '投票按钮未接落点涟漪').toMatch(/TapRippleLayer|onRippleAt/);
  });

  it('不靠改 key 重播（motion-web §5：新元素自然从头播）', () => {
    const src = read('design-system/tap-ripple.tsx');
    expect(src, '不得用 key 变化强制重播（那会让整棵子树重挂）').not.toMatch(
      /key=\{counter\}|key=\{Date\.now\(\)\}/,
    );
  });
});

describe('B7 母题缓动也是契约值（补 water.css 的守卫盲区）', () => {
  /**
   * 缺陷：守卫一直只扫**时间**字面量（`\d+ms`），**缓动**字面量是盲区 ——
   * 于是 `water.css` 的两条常驻装饰动画（drift / passage）长期直接写 `ease-in-out`，
   * 绕过了「参数只来自设计契约」这条纪律（与 W17 补 `castRippleDuration`、
   * 本轮补 `progressDuration/progressEasing` 是同一类"缺值/无据"问题）。
   *
   * 这条守卫的价值在于把**缓动**也纳入契约，并明确区分两类：
   *   - 状态过渡（hover / enter / exit）→ `entryEasing`（ease-out）
   *   - 母题漂移（drift / passage）→ `driftEasing`（ease-in-out，往返动画两端都要平滑）
   */
  const waterCss = read('design-system/water.css');
  const themeCss = read('design-system/theme.css');
  // `here` = apps/web/src/pages/__tests__ ⇒ 上溯四级到仓库根（DESIGN.md 在那里）
  const design = readFileSync(join(here, '..', '..', '..', '..', '..', 'DESIGN.md'), 'utf8');

  it('water.css 的常驻动画缓动引 token，不写字面量', () => {
    const code = waterCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const animations = (code.match(/animation:[^;]+;/g) ?? []).join('\n');
    expect(animations, 'water.css 里有 animation 声明').not.toBe('');
    expect(animations, '仍有 ease-in-out/ease-out 等缓动字面量').not.toMatch(
      /\bease-(?:linear|in|out|in-out)\b/,
    );
    expect(animations, 'drift / passage 必须引 var(--motion-drift-easing)').toMatch(
      /var\(--motion-drift-easing\)/,
    );
  });

  it('契约三处同源：DESIGN.md 与 theme.css 都登记了 driftEasing', () => {
    expect(design, 'DESIGN.md motion 块缺 driftEasing').toMatch(/driftEasing:\s*"ease-in-out"/);
    expect(themeCss, 'theme.css 未暴露 --motion-drift-easing').toContain(
      '--motion-drift-easing: ease-in-out',
    );
  });

  it('缓动与时长的分工写进了契约注释（不许后来者把 drift 改成 entryEasing）', () => {
    // 理由必须留在 DESIGN.md 里：漂移是往返动画，ease-out 只在末端收、回程会"弹一下"。
    // 注记写在 token 的**上一段**（YAML front matter 的注释块），所以连同上文一起取。
    const driftNote = /# ── W18\.5 补的第三条[\s\S]{0,900}?driftEasing[\s\S]{0,200}/.exec(
      design,
    )?.[0] ?? '';
    expect(driftNote, 'DESIGN.md 里找不到 driftEasing 的注记块').not.toBe('');
    expect(driftNote, 'driftEasing 缺少理由注记（往返动画 / alternate / 回程）').toMatch(
      /往返|alternate|回程/,
    );
    // 并且要写明它**只**用于漂移，状态过渡仍走 entryEasing
    expect(driftNote, '未写明 driftEasing 与 entryEasing 的分工').toMatch(/entryEasing/);
  });
});

describe('A7 加载态只有一种观感：统一用 DS Skeleton（shimmer）', () => {
  /**
   * 为什么统一：`DESIGN.md` §Components 规定 Skeletons 用 shimmer、禁 spinner；
   * 但此前仓库里有**三套**加载占位 —— ① DS `<Skeleton>`（真 shimmer）② 手写静态灰块
   * （`bg-water-void` 裸块，永不变化）③ 纯文字行。前两种同时出现时，同一个产品会
   * 同时出现"会掠光的骨架"和"死灰的方块"两种观感，看起来像坏了而不是像在加载。
   */
  const HAND_ROLLED = [
    'pages/admin-page.tsx',
    'features/bottle/private-messages.tsx',
    'features/bottle/record-step.tsx',
  ];

  it.each(HAND_ROLLED)('%s 不再手写静态灰块作加载占位', (rel) => {
    const src = read(rel);
    // 加载占位里出现的 `bg-water-void` 必须来自 <Skeleton>（组件内部），不是手写块
    const handRolled: string[] = [
      ...(src.match(/<div[^>]*aria-busy="true"[^>]*bg-water-void/g) ?? []),
      ...(src.match(/<span[^>]*aria-hidden="true"[^>]*bg-water-void/g) ?? []),
    ];
    expect(handRolled.join('\n'), `${rel} 仍有手写静态灰块当加载占位`).toBe('');
  });

  it.each(HAND_ROLLED)('%s 的加载占位改用 <Skeleton>', (rel) => {
    const src = read(rel);
    const busyBlocks = (src.match(/aria-busy="true"/g) ?? []).length;
    const skeletons = (src.match(/<Skeleton/g) ?? []).length;
    expect(busyBlocks, `${rel} 有 aria-busy 加载态`).toBeGreaterThan(0);
    expect(skeletons, `${rel} 的加载态应使用 DS <Skeleton>（自带 shimmer）`).toBeGreaterThan(0);
  });

  it('评论加载用 shimmer 骨架而不是纯文字行（文字行没有"正在填充"的视觉预期）', () => {
    const src = read('features/bottle/public-comments.tsx');
    const loadingLine = /comments\.isLoading \?[\s\S]{0,400}?:\s*null/.exec(src)?.[0] ?? '';
    expect(loadingLine, '没找到评论加载分支').not.toBe('');
    expect(loadingLine, '评论加载仍是纯文字行，应改用 <Skeleton>').toMatch(/<Skeleton/);
    // 文字播报不许被删掉：动效不得是唯一反馈（DESIGN §Accessibility）
    expect(loadingLine, '加载文案必须保留（读屏播报 + 空态引导）').toMatch(/正在听海里的回声/);
  });

  it('DS Skeleton 自身保持 shimmer、禁 spinner（不得被本轮改坏）', () => {
    const src = read('design-system/skeleton.tsx');
    expect(src, 'Skeleton 必须挂 shimmer 动效').toMatch(/skeleton-shimmer/);
    // 只查**代码**里的 spinner 用法；文件头注记里写着"禁 spinner"是纪律说明，不是用法
    const code = src.replace(/\/\*\*[\s\S]*?\*\//g, '');
    expect(code, 'Skeleton 不得引入 spinner').not.toMatch(/animate-spin|[Ss]pinner/);
    expect(src, 'Skeleton 必须对读屏隐藏').toMatch(/aria-hidden/);
  });
});

describe('A8 放回失败必须让用户看见（不许静默吞掉）', () => {
  /**
   * 探索阶段曾判这里是"静默失败"（`.catch(() => undefined)`），实测**证伪**了：
   * `putBack.isError` 会渲染 `ConflictNotice`（role="alert"），且已有测试钉住
   * （bottle-page.test.tsx「持有者放回失败时留在详情页，并显示可恢复错误」）。
   * 但那个 `() => undefined` 的写法仍然有害：它让人以为失败被吞，而它真正的唯一作用
   * 是阻止 unhandled rejection。所以本条守卫钉的是**意图的可见性**：
   *   ① 失败态必须渲染 role="alert"（读屏能听到）；
   *   ② catch 里不得再出现 `() => undefined` 这种「看起来在吞」的空处理。
   */
  const src = read('pages/bottle-page.tsx');
  /** 去掉注释再匹配：注记里会讨论这些模式本身（"此前写的是 `() => undefined`"）。 */
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  it('put-back 的失败态渲染 role="alert" 出口', () => {
    expect(src, 'putBack.isError 必须接一个出口').toMatch(/putBack\.isError/);
    expect(src, '失败出口必须是 ConflictNotice（role="alert"）').toMatch(
      /putBack\.isError\s*\?\s*\(?\s*<ConflictNotice/,
    );
  });

  it('catch 里不得用空处理（undefined）伪装成"已处理"', () => {
    expect(
      code,
      '出现 `.catch(() => undefined)` —— 读代码的人会以为失败被静默吞掉',
    ).not.toMatch(/\.catch\(\(\)\s*=>\s*undefined\)/);
    expect(code, '放回链路的 catch 必须带说明（阻止 unhandled rejection，错误已在页面上呈现）').toMatch(
      /mutateAsync\(\)[\s\S]{0,400}?\.catch\(\(\)\s*=>/,
    );
  });

  it('catch 分支里不含 navigate（失败必须留在原页面）', () => {
    // 逐个取出每个 `.catch(...)` 的函数体（到配对的收尾括号为止），逐个查 navigate
    const bodies = [...code.matchAll(/\.catch\(\(\)\s*=>\s*\{([^}]*)\}/g)].map((m) => m[1] ?? '');
    expect(bodies.length, '没找到任何 catch 分支').toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body, 'catch 分支里出现 navigate（失败必须留在原页面）').not.toMatch(/navigate\(/);
    }
  });

  it('去向选择（resolution）的失败也有出口，不是静默', () => {
    expect(src, 'resolution 失败必须接 ConflictNotice').toMatch(
      /resolution\.isError[\s\S]{0,80}?<ConflictNotice/,
    );
    expect(src, 'resolution 的错误要传进 ResolutionModal').toMatch(
      /resolution\.isError\s*\?\s*\{\s*error:\s*resolution\.error/,
    );
  });
});

describe('B4 状态变化必须可听：五个页面的播报通道（DESIGN §Accessibility）', () => {
  /**
   * 缺陷：`DESIGN.md` §Accessibility 要求「接力状态用 aria-live="polite" 播报」，
   * 且 motion-web §7 明确「动效不得是唯一反馈，必须配文字/结构/aria-live」。
   * 现状是**按页分布不均**：river 7 处、login/bottle 各 3 处，而
   * sea / song-picker / drift-log / profile / admin 五页**一处都没有** ——
   * 也就是说这五页的「切分区、翻页、发起、长列表加载、审核切换」全靠视觉，
   * 读屏用户什么都听不到。
   *
   * 判据：凡是有 `aria-busy`（即有异步加载）的页面，必须同时有播报通道。
   * 这条因果关系是本守卫的核心 —— 它不是"每个页面的固定配额"，
   * 而是"有异步就必须能听"。
   */
  const ASYNC_PAGES: ReadonlyArray<readonly [string, string]> = [
    ['pages/sea-page.tsx', read('pages/sea-page.tsx')],
    ['pages/song-picker-page.tsx', read('pages/song-picker-page.tsx')],
    ['pages/drift-log-page.tsx', read('pages/drift-log-page.tsx')],
    ['pages/admin-page.tsx', read('pages/admin-page.tsx')],
  ];

  it.each(ASYNC_PAGES)('%s 有异步加载（aria-busy）就必须有播报通道', (_name, src) => {
    expect(src, '该页没有 aria-busy，本条不适用？—— 若无异步请从本表移除').toMatch(/aria-busy/);
    expect(
      src,
      '有异步加载却没有 aria-live / role="status" —— 读屏用户听不到任何状态变化',
    ).toMatch(/aria-live="polite"|role="status"/);
  });

  it.each(ASYNC_PAGES)('%s 的播报通道是 polite 而不是 assertive', (_name, src) => {
    // assertive 会打断读屏当前朗读；本项目全是加载/切换提示，不该抢话
    expect(src, '不应使用 aria-live="assertive"（会打断读屏）').not.toMatch(
      /aria-live="assertive"/,
    );
  });

  it('公海：切分区与翻页都有播报（这两件事此前只有视觉变化）', () => {
    const src = read('pages/sea-page.tsx');
    expect(src, '公海缺少播报容器').toMatch(/aria-live="polite"|role="status"/);
  });

  it('审核台：视图切换（待处理 / 历史裁决）有播报', () => {
    const src = read('pages/admin-page.tsx');
    expect(src, '审核台缺少播报容器').toMatch(/aria-live="polite"|role="status"/);
  });
});

describe('A9 河道的两个泊位对称：未登录时「捞取」也有登录出口', () => {
  /**
   * 缺陷：投下侧有 `newHref`（未登录 → `/login?next=/new`），捞取侧**没有**对应物 ——
   * 匿名用户点「捞一个漂流瓶」会真的发请求、吃一个 401，然后只得到一句
   * 「打捞失败，请看下面的说明」，而下面的说明是固定文案、**没有任何出口**。
   * 也就是说主 CTA 对匿名用户是一条死路，而对称的另一半（投下）却是通的。
   */
  const src = read('pages/river-page.tsx');

  it('捞取侧有与投下侧对称的登录回跳地址', () => {
    expect(src, '缺少捞取侧的登录回跳地址（应与 newHref 对称）').toMatch(
      /session\.status === 'authed'[\s\S]{0,200}?\/login\?next=/,
    );
    // 两个泊位都要有：newHref（投下）与 drawHref（捞取）
    const loginHrefs = (src.match(/\/login\?next=/g) ?? []).length;
    expect(loginHrefs, '登录回跳地址应成对出现（投下 + 捞取）').toBeGreaterThanOrEqual(2);
  });

  it('onDraw 在未登录时不发请求，直接走登录回跳（与 onCast 同构）', () => {
    const onDraw = /function onDraw\(\)[\s\S]{0,900}?mutateAsync/.exec(src)?.[0] ?? '';
    expect(onDraw, '没找到 onDraw 函数体').not.toBe('');
    // 判据必须是 `isGuest`（会话已到达且确为访客），不能是「非 authed」——
    // 否则会话还在 loading 时刷新页面的人会被推去登录页。
    expect(src, '应先算出 isGuest（session.status === guest）').toMatch(
      /const isGuest = session\.status === 'guest'/,
    );
    expect(onDraw, 'onDraw 缺访客判定').toMatch(/if \(isGuest\)/);
    // 未登录分支必须在 `mutateAsync` **之前** return，并走登录回跳地址
    const guard = onDraw.slice(0, onDraw.indexOf('mutateAsync'));
    expect(guard, '未登录分支必须在发请求之前 return').toMatch(/return;/);
    expect(guard, '未登录分支必须走登录回跳地址（drawHref）').toMatch(
      /requestNav\(drawHref\)|navigate\(drawHref\)/,
    );
  });

  it('未登录时用户看到的状态文字说明为什么要登录（不是"打捞失败"）', () => {
    const src2 = read('pages/river-page.tsx');
    expect(src2, '未登录时不该报"打捞失败"（用户还没捞，是被引导去登录）').not.toMatch(
      /session\.status\s*!==\s*'authed'[\s\S]{0,400}?打捞失败/,
    );
    expect(src2, '未登录引导应有可读文案').toMatch(/登录/);
  });
});
