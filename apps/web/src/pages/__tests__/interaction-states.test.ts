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
