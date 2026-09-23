/**
 * 水域母题守卫（t43）—— 把「主题元素」也变成机器可检的契约，而不是靠眼睛。
 *
 * ## 为什么要有它
 * 本轮按用户要求增加水 / 河流 / 海洋 / 漂流瓶的视觉元素。装饰最容易出的两类事故是：
 * ① **内联新值**：手写一个 `rgba(...)` 或 hex，于是「设计契约」旁边多出第二份真相；
 * ② **喧宾夺主**：装饰层忘了 `aria-hidden` / `pointer-events-none`，被读屏念出来、或挡住点击。
 * 所以这里断言：**新元素一律只引用 `--motif-*` 契约变量**，并且**一律 aria-hidden + 不吃指针事件**。
 *
 * ## 这一层能证明什么、不能证明什么
 * - **能证明**：token 是否登记、值是否只来自契约、装饰层语义与指针穿透、页面是否真的用了它们。
 * - **不能证明**：观感（是否"像水"）与一屏是否被破坏 —— 前者靠人看截图，后者靠
 *   `apps/web/tools/one-screen-check.mjs`（真实浏览器，1440 / 375 各 12 条路由）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TideLine, WaterSheen, WaterTexture } from '../index';

const SRC_DIR = join(process.cwd(), 'src');
const DS_DIR = join(SRC_DIR, 'design-system');
const REPO_ROOT = resolve(process.cwd(), '../..');

const readIfPresent = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8') : '');
const designMd = readFileSync(resolve(REPO_ROOT, 'DESIGN.md'), 'utf8');
const themeCss = readFileSync(join(DS_DIR, 'theme.css'), 'utf8');
const waterCss = readIfPresent(join(DS_DIR, 'water.css'));
const frontMatter = designMd.split('---\n')[1] ?? '';

/** 契约里的 5 个母题 token（前端契约：`motif:` 块）。 */
const MOTIF_TOKENS = [
  'sheenAlphaDark',
  'sheenAlphaLight',
  'textureAlpha',
  'textureLineGap',
  'tideLineAlpha',
] as const;

const kebab = (name: string): string =>
  `--motif-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

describe('水域母题：契约先补（DESIGN.md → theme.css → water.css）', () => {
  it('DESIGN.md 的 front matter 有 motif: 块，且 5 个 token 都在', () => {
    const block = /motif:\n([\s\S]*?)\n[a-zA-Z]+:/.exec(frontMatter)?.[1] ?? '';
    expect(block, 'DESIGN.md front matter 缺少 motif: 块').not.toBe('');
    for (const token of MOTIF_TOKENS) {
      expect(block, `motif 块缺少 ${token}`).toMatch(new RegExp(`${token}\\s*:`));
    }
  });

  it('theme.css 把每个 motif token 暴露为 --motif-*', () => {
    for (const token of MOTIF_TOKENS) {
      expect(themeCss, `theme.css 缺少 ${kebab(token)}`).toContain(kebab(token));
    }
  });

  it('water.css 存在，且只引用契约变量（不得内联 hex / rgb / rgba）', () => {
    expect(waterCss, '缺少 design-system/water.css').not.toBe('');
    expect(waterCss, 'water.css 不得内联 hex 颜色').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(waterCss, 'water.css 不得内联 rgb()/rgba()').not.toMatch(/\brgba?\(/);
    // 颜色只能来自 --color-*（既有色板），强度只能来自 --motif-*
    expect(waterCss).toMatch(/var\(--color-/);
    expect(waterCss).toMatch(/var\(--motif-/);
    for (const token of MOTIF_TOKENS) {
      expect(waterCss, `water.css 未引用 ${kebab(token)}`).toContain(kebab(token));
    }
  });

  it('index.css 引入了 water.css（否则类名不生效）', () => {
    const indexCss = readFileSync(join(DS_DIR, 'index.css'), 'utf8');
    expect(indexCss).toContain("'./water.css'");
  });
});

describe('水域母题：装饰层的基本纪律（不喧宾夺主）', () => {
  const cases = [
    ['WaterSheen', WaterSheen],
    ['WaterTexture', WaterTexture],
    ['TideLine', TideLine],
  ] as const;

  for (const [name, Component] of cases) {
    it(`${name}：aria-hidden + pointer-events-none + 绝对定位（零布局高度）`, () => {
      const { container } = render(<Component />);
      const node = container.firstElementChild;
      expect(node, `${name} 没有渲染任何元素`).not.toBeNull();
      expect(node?.getAttribute('aria-hidden'), `${name} 必须 aria-hidden`).toBe('true');
      expect(node?.className, `${name} 必须 pointer-events-none`).toMatch(/pointer-events-none/);
      expect(node?.className, `${name} 必须绝对定位（不得进入文档流）`).toMatch(/absolute/);
    });
  }
});

describe('水域母题：页面确实接入了（不是写了组件没人用）', () => {
  const pageSource = (name: string): string => readIfPresent(join(SRC_DIR, 'pages', name));

  it('河道页的两个深水面板都加了水面光带与水纹', () => {
    const river = pageSource('river-page.tsx');
    expect(river, 'river-page 未接入 WaterSheen').toContain('<WaterSheen');
    expect(river, 'river-page 未接入 WaterTexture').toContain('<WaterTexture');
  });

  it('公海作品页的深底页头加了水面光带', () => {
    expect(pageSource('sea-detail-page.tsx'), 'sea-detail-page 未接入 WaterSheen').toContain(
      '<WaterSheen',
    );
  });
});
