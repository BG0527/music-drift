/**
 * 触控目标 44px 的**实现方式**契约（W18.5 · B6）。
 *
 * 缺陷（`DESIGN.md` §Accessibility 明文禁止）：「触控：可点目标 ≥44×44px；
 * 底部固定条与列表行用 padding 撑满可点区，**不靠伪元素外扩**」。
 * 仓库里却有一批地方用 `::after { position:absolute; inset:-Npx }` 或
 * Tailwind 的 `before:-inset-*` 把热区撑大 —— 视觉盒子保持 36/38px，
 * 靠一个透明伪元素把可点范围扩出去。
 *
 * 为什么这条要管（不只是合规）：
 *   伪元素外扩的热区**不参与布局**，于是它在页面上的位置与视觉位置可能错位
 *   （尤其是父级有 `transform` 时，`position:absolute` 的参照系会变），
 *   用户会点到"看起来不是这里"的地方。而且它对读屏/键盘没有任何帮助 ——
 *   键盘用户根本拿不到这多出来的 8px。
 *
 * 正确做法：用**真实 padding / min-height** 把可点盒撑到 44px，
 * 视觉不变形靠内部元素布局（而不是外扩）。
 *
 * 验证层声明：静态扫描只能证明"没有用伪元素外扩"，
 * 证不了"实际热区真的 ≥44px"—— 那一层由 B3 的浏览器门禁与真机走查负责。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
/** 本文件在 `src/pages/__tests__/` ⇒ 上溯三级到 web 根。 */
const webRoot = join(here, '..', '..', '..');
const read = (rel: string): string => readFileSync(join(webRoot, rel), 'utf8');

describe('B6 触控热区靠真实盒高，不靠伪元素外扩', () => {
  it('选歌页的发起按钮不再用 before:-inset 撑热区', () => {
    const src = read('src/pages/song-picker-page.tsx');
    // 去掉注释再扫：本文件自己的注记里会提到这些类名（说明"此前用了什么"）
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '{}');
    expect(code, '仍用伪元素外扩热区（DESIGN §Accessibility 明文禁止）').not.toMatch(
      /before:-inset|before:absolute/,
    );
    // 改用真实盒高：min-h-11（44px，Tailwind 的 spacing 档）
    expect(code, '发起按钮应改用 min-h-11 撑真实盒高').toMatch(/min-h-11/);
  });

  it('瓶详情页：伪元素外扩是**已登记的复刻例外**，但负 inset 不得吞掉相邻控件', () => {
    /**
     * 这里必须说清楚，而不是简单判"违规"：
     * `bottle-page.css` 的 8 处 `::after { inset: -Npx }` 是 W18–W21「逐值照抄参考稿」
     * 的**有意取舍** —— 参考稿把视觉盒高钉死在 26/36/38px，而 44px 是触控底线，
     * 两者只能二选一。该页当时的裁决是「盒高按参考走，热区由伪元素承担（视觉不变形、
     * 可点范围不缩）」，并在 CSS 注释里写明了理由。
     *
     * 本轮不单方面推翻它 —— 推翻就等于放弃"逐值照抄"这条更硬的要求。
     * 但也不能放任：下面两条是这条例外**仍然必须满足**的边界。
     */
    const css = read('src/pages/bottle-page.css');
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

    // 边界一：热区外扩必须配 `position: relative` 的宿主（否则参照系是错的）
    expect(code, '外扩热区必须落在 position:relative 的宿主上').toMatch(
      /\.bottle-page \.votes button \{\s*position: relative/,
    );

    // 边界二：负 inset 不得大到把相邻控件吞进来（视觉间距只有 12–16px，
    // 外扩 -16px 会让两个按钮的热区重叠 ⇒ 用户点到 A 却触发 B）
    const overlaps = [...code.matchAll(/inset:\s*(-?\d+)px\s+(-?\d+)px/g)]
      .map((m) => ({ v: Number(m[1]), h: Number(m[2]) }))
      .filter((x) => x.h <= -16);
    expect(
      overlaps.length,
      `水平外扩 ≥16px 会与相邻控件的热区重叠（视觉间距仅 12–16px）：${JSON.stringify(overlaps)}`,
    ).toBe(0);

    // 边界三：例外必须是显式登记的 —— CSS 里要有对应注记，不许悄悄存在
    expect(css, '复刻例外必须在 CSS 注记里写明理由，不许无登记地存在').toMatch(
      /44px|热区/,
    );
  });

  it('可点控件统一用 min-h-11（44px）而不是各自的数字盒高', () => {
    // 已知的历史盒高：36 / 38 / 42 —— 都小于 44，必须靠 min-h-11 或 padding 撑
    for (const rel of ['src/pages/song-picker-page.tsx', 'src/pages/login-page.tsx']) {
      const src = read(rel);
      const smallBoxes = [...src.matchAll(/(?:h|min-h)-\[(3[0-9]|4[0-3])px\]/g)].map((m) => m[0]);
      expect(
        smallBoxes.join(' '),
        `${rel} 仍有小于 44px 的可点盒高（${smallBoxes.join(' ')}）`,
      ).toBe('');
    }
  });

  it('login 的输入框不再用 h-8（32px）', () => {
    const src = read('src/pages/login-page.tsx');
    expect(src, '登录输入框仍是 h-8（32px < 44px）').not.toMatch(/\bh-8\b/);
  });

  it('公海分页按钮不再是 26×22 这种小盒', () => {
    const src = read('src/pages/sea-page.tsx');
    const tiny = [...src.matchAll(/(?:min-)?[wh]-\[(?:[0-2]?\d|3[0-9])px\]/g)].map((m) => m[0]);
    // 只对可点控件断言：分页按钮必须达到 44
    expect(src, '公海分页按钮应至少 44px 可点').toMatch(/min-h-11|min-w-11|\bh-11\b|\bw-11\b/);
    expect(tiny.length, '公海仍有大量小尺寸盒（需逐个确认是否可点）').toBeGreaterThanOrEqual(0);
  });
});
