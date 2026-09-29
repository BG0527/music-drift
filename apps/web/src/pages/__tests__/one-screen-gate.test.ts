/**
 * 一屏/窄屏门禁的判据覆盖（W18.5 · B3）。
 *
 * 门禁盲区（本轮要补的两条，都是"真实缺陷曾经能溜过去"的直接原因）：
 *   1. **375 顶栏压内容**：门禁的 mobile 分支只查「锚点下沿 ≤ 812」+「无横向溢出」，
 *      **不查重叠**。而 fixed 顶栏（`top-10 + min-h-11`）压住页面首行时，
 *      锚点下沿完全可能是 200px（"在视口内"）—— 于是 5 个页面在 375 下被压住却全绿。
 *      判据缺口：`/sea` 375 的六列压叠、选歌/设置/瓶子/公海/日志的首行被压，都属于这一类。
 *   2. **`routesFor()` 不含 `/login` 与 `/admin`**：这两页从来没被量过，
 *      所以 `/admin` 的「非管理员分支没有 <main>/h1」这类问题不会被门禁发现。
 *
 * 本文件是**门禁脚本自身的契约**（静态扫描 `one-screen-check.mjs`）：
 *   - mobile 分支必须有「顶栏矩形 ∩ 首屏内容 = 0」的判据；
 *   - `routesFor()` 必须覆盖 `/login` 与 `/admin`；
 *   - 门禁仍必须保留反向控制能力（`--negative-control`），否则"全绿"可能只是"没在测"。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
/** 本文件在 `src/pages/__tests__/` ⇒ 上溯三级到 web 根。 */
const webRoot = join(here, '..', '..', '..');
const gate = readFileSync(join(webRoot, 'tools', 'one-screen-check.mjs'), 'utf8');

describe('B3-1 窄屏（<1024）门禁查顶栏重叠，不再只查高度与横向', () => {
  it('measure() 量了顶栏矩形（top-nav）', () => {
    expect(gate, '门禁没有量顶栏矩形').toMatch(/top-nav|topNav/);
  });

  it('存在「顶栏与首屏内容相交」的判据', () => {
    expect(gate, '门禁没有顶栏重叠判据').toMatch(/navOverlaps|navIntersection|顶栏/);
  });

  it('该判据对 mobile 生效（不是只写不判）', () => {
    // 判据必须真的把重叠算成 problem，且明确限定在 mobile（桌面另有一整套高度判据）
    expect(gate, 'mobile 分支只查横向/锚点，没有把顶栏重叠算成 problem').toMatch(
      /if \(mobile[^)]*\)[\s\S]{0,200}?problems\.push\(/,
    );
    expect(gate, '重叠判据没有用 navOverlaps').toMatch(/problems\.push\([^)]*navOverlaps/);
  });
});

describe('B3-2 routesFor() 覆盖 /login 与 /admin（此前从未被量过）', () => {
  const routesBlock = /function routesFor\(seed\)\s*\{[\s\S]*?\n\}/.exec(gate)?.[0] ?? '';

  it('/login 在门禁路由表里', () => {
    expect(routesBlock, "routesFor() 缺 '/login'").toMatch(/path:\s*'\/login'/);
  });

  it('/admin 在门禁路由表里', () => {
    expect(routesBlock, "routesFor() 缺 '/admin'").toMatch(/path:\s*'\/admin'/);
  });

  it('两页各自带锚点（无锚点 = 什么都没量）', () => {
    const login = /path:\s*'\/login',\s*anchors:\s*\[([^\]]*)\]/.exec(routesBlock)?.[1] ?? '';
    const admin = /path:\s*'\/admin',\s*anchors:\s*\[([^\]]*)\]/.exec(routesBlock)?.[1] ?? '';
    expect(login.trim(), '/login 没有锚点').not.toBe('');
    expect(admin.trim(), '/admin 没有锚点').not.toBe('');
  });
});

describe('B3-3 门禁必须保留反向控制（否则"全绿"可能只是"没在测"）', () => {
  it('--negative-control 仍在：注入超高元素后必须整片红', () => {
    expect(gate, '门禁失去了反向控制能力').toMatch(/negativeControl/);
    expect(gate, '反向控制没有插到 body 最前面（那样只会把内容往下推而不影响已有断言）').toMatch(
      /document\.body\.prepend/,
    );
  });

  it('反向控制下 mobile 的判据也会红（不只是桌面）', () => {
    expect(gate).toMatch(/provedRed\s*=/);
  });
});

describe('B8 顶栏让位是契约值，且各页都引用它（不再各写各的）', () => {
  /**
   * 缺陷：站点顶栏是 `position: fixed`（`top-[10px]` + 每项 `min-h-11`），
   * 占据视口顶 10..54px 这条带且不占文档流。各页首行的让位却各写各的：
   * song-picker 0、bottle 24px、drift-log 40px、settings 45px、login 32px ——
   * 结果在 375 下有 4 个页面的首行被顶栏压住（B3 门禁补盲后实测会红）。
   *
   * 修法不是"逐页把数字调大"，而是把让位收成一个契约 token
   * （`--top-nav-reserve-min`），页面一律 `max(自己的设计顶距, var(--top-nav-reserve-min))`。
   * 这样顶栏高度将来一改，全站一起让位，不会再漏掉某一页。
   */
  const themeCss = readFileSync(join(webRoot, 'src', 'design-system', 'theme.css'), 'utf8');
  const readPage = (name: string): string =>
    readFileSync(join(webRoot, 'src', 'pages', name), 'utf8');

  it('theme.css 定义了顶栏几何四元组与让位底线', () => {
    for (const token of [
      '--top-nav-offset',
      '--top-nav-height',
      '--top-nav-bottom',
      '--top-nav-clearance',
      '--top-nav-reserve-min',
    ]) {
      expect(themeCss, `theme.css 缺 ${token}`).toContain(`${token}:`);
    }
  });

  it('让位底线的算法是「顶栏底边 + 呼吸位」，不是写死的数字', () => {
    expect(themeCss).toMatch(
      /--top-nav-bottom:\s*calc\(var\(--top-nav-offset\)\s*\+\s*var\(--top-nav-height\)\)/,
    );
    expect(themeCss).toMatch(
      /--top-nav-reserve-min:\s*calc\(var\(--top-nav-bottom\)\s*\+\s*var\(--top-nav-clearance\)\)/,
    );
  });

  const PAGES: ReadonlyArray<readonly [string, string]> = [
    ['song-picker-page.tsx', readPage('song-picker-page.tsx')],
    ['drift-log-page.tsx', readPage('drift-log-page.tsx')],
    ['bottle-page.tsx', readPage('bottle-page.tsx')],
    ['settings-page.css', readFileSync(join(webRoot, 'src', 'pages', 'settings-page.css'), 'utf8')],
  ];

  it.each(PAGES)('%s 的首行让位引 --top-nav-reserve-min', (_name, src) => {
    expect(src, '页面首行没有引用顶栏让位 token').toMatch(/var\(--top-nav-reserve-min\)/);
  });

  it.each(PAGES)('%s 的根级顶距不小于让位底线', (_name, src) => {
    /**
     * 只查**根容器**的顶距（页面根元素 / 主容器），不查元素内部的盒内间距 ——
     * 内部 1px/1.5px 的 padding 是排版细节，与"顶栏让位"无关。
     * 判据取「根级 pt-[...] 的第一个数字」：那才是页面自己的设计顶距。
     */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '{}');
    const rootPadding = [...code.matchAll(/pt-\[max\(\s*([\d.]+)(?:px|rem)/g)].map((m) => Number(m[1]));
    // 底线 = 10 + 44 + 8 = 62px；根级设计顶距低于它且没引 token，就是漏网之鱼
    const needsToken = rootPadding.filter((px) => px > 0 && px < 62);
    for (const px of needsToken) {
      expect(
        code.includes('var(--top-nav-reserve-min)'),
        `根级设计顶距 ${String(px)}px < 让位底线 62px，却没引 var(--top-nav-reserve-min)`,
      ).toBe(true);
    }
  });
});
