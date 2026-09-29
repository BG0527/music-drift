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
