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
