/**
 * 动效契约守卫 —— 把 `motion-web` 的纪律变成**可断言的契约**（§8：动效必须可验证）。
 *
 * ## 为什么需要这个文件
 * `docs/ui-review/motion-audit.md`（t37）审计出 5 类违规、10 处「该有反馈却硬切」。
 * 其中三条纪律原本**全仓无人守**：
 * - ① §3 只允许动 `transform` / `opacity`；
 * - ② §2 参数只能来自设计契约 token（不得内联时长）；
 * - ③ §5 禁止靠改 `key` 造成子树重建来「重播动画」。
 * 既有 `features/audio/motion-usage.test.ts` 守住了 ③，但**只覆盖 audio 两个文件**；本文件扩到全仓。
 *
 * ## 这一层能证明什么、不能证明什么（别自欺）
 * - **能证明**：属性白名单、参数引用来源、key 用法、以及「某个交互有没有反馈类」——
 *   即 `motion-web` §8 表格里的「属性」「时长/缓动」两行。
 * - **不能证明**：屏幕上的流畅度与观感（jsdom 没有布局与合成器；静帧截图也证明不了动效）。
 *   真机/录屏验证的缺口在 `docs/ui-review/motion-audit.md` §10 显式列出。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BottomNav, SidebarNav, Tabs } from '../index';

// vitest 的 cwd = apps/web（与 pages/__tests__/copy-consistency.test.ts 同口径）
const WEB_SRC = join(process.cwd(), 'src');
const DS_DIR = resolve(WEB_SRC, 'design-system');
const REPO_ROOT = resolve(process.cwd(), '../..');

const read = (path: string): string => readFileSync(path, 'utf8');
const designMd = read(resolve(REPO_ROOT, 'DESIGN.md'));
const motionCss = read(resolve(DS_DIR, 'motion.css'));

/** 全仓源码（默认排除测试文件：守卫自身与旧守卫里有「故意的坏样本」）。 */
function sources(exts: readonly string[], options: { skipTests?: boolean } = {}): string[] {
  const { skipTests = true } = options;
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(WEB_SRC);
  return out
    .filter((f) => exts.some((ext) => f.endsWith(ext)))
    .filter((f) => (skipTests ? !f.includes('__tests__') && !f.includes('.test.') : true));
}

/**
 * 花括号 / 引号感知的 JSX 开标签扫描器。
 * 朴素的 `/<div[^>]*>/` 会在 `onClick={() => …}`（属性里的 `=>`）上截断，也会把
 * `className={\`stagger-${…}\`}` 里的内容误当属性分隔 —— 所以必须自己走一遍。
 */
interface JsxTag {
  tag: string;
  attrs: string;
  at: number;
}

function jsxTags(src: string): JsxTag[] {
  const tags: JsxTag[] = [];
  for (let i = 0; i < src.length; i += 1) {
    if (src[i] !== '<') continue;
    const head = /^<([A-Za-z][A-Za-z0-9.]*)/.exec(src.slice(i));
    if (head === null) continue;
    let depth = 0;
    let quote: string | null = null;
    let j = i + head[0].length;
    for (; j < src.length; j += 1) {
      const c = src[j] as string;
      if (quote !== null) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        quote = c;
        continue;
      }
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
    }
    tags.push({ tag: head[1] as string, attrs: src.slice(i + head[0].length, j), at: i });
    i = j;
  }
  return tags;
}

/** `.map(...)` 回调覆盖的字符区间 —— 用来区分「列表项的合法 key」与「单例容器改 key 重播动画」。 */
function mapRanges(src: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const match of src.matchAll(/\.map\s*\(/g)) {
    const start = match.index;
    let depth = 0;
    let quote: string | null = null;
    for (let j = start + match[0].length - 1; j < src.length; j += 1) {
      const c = src[j] as string;
      if (quote !== null) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        quote = c;
        continue;
      }
      if (c === '(') depth += 1;
      else if (c === ')') {
        depth -= 1;
        if (depth === 0) {
          ranges.push([start, j]);
          break;
        }
      }
    }
  }
  return ranges;
}

const MOTION_CLASS = /\b(?:enter-rise|enter-fade|stagger-[1-9]|motion-fade-in|hover-lift|skeleton-shimmer|ripple-ring)\b/;

/**
 * §5 违规检测：**动效类与 `key` 同时出现、且不在 `.map()` 里**。
 * 列表项 `key={x.id}` + 入场动画是合法的（key 标识身份，不是用来重播动画）；
 * 单例容器 `key={match.path}` 则是「换一次就重建整棵树」——正是 §5 点名禁止的 remount 抖动。
 */
function keyRemountViolations(src: string): JsxTag[] {
  const ranges = mapRanges(src);
  const inMap = (at: number): boolean => ranges.some(([s, e]) => at > s && at < e);
  return jsxTags(src).filter(
    (t) => /(^|\s)key=/.test(t.attrs) && MOTION_CLASS.test(t.attrs) && !inMap(t.at),
  );
}

/**
 * 已登记为「已知违规、但修复被排到后续切片」的位置（只允许这里列出的条目）。
 *
 * W18.5 · B1：`pages/route-view.tsx` 的后门**已关闭** —— 换页改成显式两阶段
 * （`exit-fade` 退场 → `enter-rise` 入场，由 `motion.exitDuration` 计时切换），
 * 不再靠 `key={match.path}` 整树重挂。现在全站没有任何已知违例，白名单为空。
 * （`route-transition.test.ts` 有一条守卫专门钉住"后门不得被重新打开"。）
 */
const KEY_REMOUNT_ALLOWLIST: readonly string[] = [];

describe('§3 属性白名单：只允许动 transform / opacity', () => {
  it('.hover-lift 的过渡只含 transform，不含 box-shadow（box-shadow 的尺寸/位置是明文禁止）', () => {
    const block = /\.hover-lift\s*\{([\s\S]*?)\}/.exec(motionCss)?.[1] ?? '';
    expect(block, 'missing .hover-lift block').not.toBe('');
    expect(block).toMatch(/transition:\s*transform/);
    expect(block).not.toMatch(/box-shadow/);
  });

  it('.hover-lift:hover 不得声明 box-shadow（抬升必须走独立图层的 opacity 交叉）', () => {
    const hover = /\.hover-lift:hover\s*\{([\s\S]*?)\}/.exec(motionCss)?.[1] ?? '';
    expect(hover, 'missing .hover-lift:hover block').not.toBe('');
    expect(hover).not.toMatch(/box-shadow/);
    expect(hover).toMatch(/transform:\s*scale/);
  });

  it('阴影抬升由 ::after 的 opacity 交叉实现（只动 opacity，几何固定）', () => {
    const layer = /\.hover-lift::after\s*\{([\s\S]*?)\}/.exec(motionCss)?.[1] ?? '';
    expect(layer, 'missing .hover-lift::after shadow layer').not.toBe('');
    expect(layer).toMatch(/box-shadow:\s*var\(--shadow-lift\)/);
    expect(layer).toMatch(/opacity:\s*0/);
    expect(layer).toMatch(/transition:\s*opacity/);
    const active = /\.hover-lift:hover::after\s*\{([\s\S]*?)\}/.exec(motionCss)?.[1] ?? '';
    expect(active, 'missing .hover-lift:hover::after').toMatch(/opacity:\s*1/);
  });

  it('Button 的过渡属性不含 box-shadow', () => {
    const button = read(resolve(DS_DIR, 'button.tsx'));
    expect(button).not.toMatch(/transition-\[[^\]]*box-shadow/);
  });

  it('全仓没有 transition-all、也没有动画布局属性（width/height/top/left/margin/padding）', () => {
    for (const file of sources(['.tsx', '.css', '.ts'])) {
      const src = read(file);
      const where = relative(WEB_SRC, file);
      expect(src, `${where} 不得用 transition-all`).not.toMatch(/\btransition-all\b/);
      expect(src, `${where} 不得动画布局属性`).not.toMatch(
        /\b(?:transition|animate)-(?:width|height|top|left|right|bottom|margins?|paddings?)\b/,
      );
    }
  });
});

describe('§2 参数只能来自设计契约：不得内联时长', () => {
  it('motion.css 的 animation/transition 声明里不得出现时间字面量（必须 var(--token)）', () => {
    const offenders = motionCss
      .split('\n')
      .map((line, index) => ({ line, index: index + 1 }))
      .filter(({ line }) => /(?:animation|transition)\s*:/.test(line))
      .filter(({ line }) => /\d+(?:\.\d+)?m?s\b/.test(line));
    expect(
      offenders.map((o) => `${String(o.index)}: ${o.line.trim()}`),
      '这些动画声明内联了时长字面量（motion-web §2：需要契约里没有的参数 ⇒ 先补设计契约）',
    ).toEqual([]);
  });

  it('DESIGN.md 的 motion 块登记了 shimmer / ripple / exit 三项时长（审计 A1/A2/A4）', () => {
    const block = /motion:\n([\s\S]*?)\nzIndex:/.exec(designMd)?.[1] ?? '';
    expect(block, 'missing DESIGN.md motion block').not.toBe('');
    for (const key of ['shimmerDuration', 'rippleDuration', 'exitDuration']) {
      expect(block, `DESIGN.md motion 块缺少 ${key}`).toMatch(new RegExp(`${key}:`));
    }
  });

  it('theme.css 把新登记的 token 暴露为 --motion-*', () => {
    const theme = read(resolve(DS_DIR, 'theme.css'));
    for (const name of ['shimmer-duration', 'ripple-duration', 'exit-duration']) {
      expect(theme, `theme.css 缺少 --motion-${name}`).toContain(`--motion-${name}`);
    }
  });

  it('全仓 duration-<n> / scale-[…] / translate-y-[…] 字面量都在 DESIGN.md 契约值集合内', () => {
    const motionBlock = /motion:\n([\s\S]*?)\nzIndex:/.exec(designMd)?.[1] ?? '';
    const contractDurations = new Set(
      [...motionBlock.matchAll(/(?:Duration|Transition|Stagger):\s*(\d+)ms/g)].map((m) =>
        Number(m[1]),
      ),
    );
    const contractScales = new Set(
      [...motionBlock.matchAll(/hoverScale:\s*([\d.]+)/g)].map((m) => m[1] as string),
    );
    expect(contractDurations.size).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of sources(['.tsx', '.css'])) {
      const src = read(file);
      const where = relative(WEB_SRC, file);
      for (const m of src.matchAll(/\bduration-(\d+)\b/g)) {
        if (!contractDurations.has(Number(m[1]))) offenders.push(`${where}: duration-${m[1]}`);
      }
      for (const m of src.matchAll(/\bscale-\[([\d.]+)\]/g)) {
        if (!contractScales.has(m[1] as string)) offenders.push(`${where}: scale-[${m[1]}]`);
      }
      // 按下的 -1px 位移写在 DESIGN.md §Interaction States 表里（active / pressed 行）
      for (const m of src.matchAll(/translate-y-\[(-[\d.]+px)\]/g)) {
        if (!designMd.includes(`translateY(${m[1]})`)) {
          offenders.push(`${where}: translate-y-[${m[1]}]`);
        }
      }
    }
    expect(offenders, '这些数值不在 DESIGN.md 契约里（档位值与契约漂移）').toEqual([]);
  });
});

describe('§5 禁止靠改 key 重播动画（全仓，含反向控制）', () => {
  it('反向控制：检测器确实会红（坏样本命中、列表 key 不误报）', () => {
    // 坏样本：单例容器改 key 重播入场动画（route-view 的同款写法）
    expect(keyRemountViolations('<div key={match.path} className="enter-fade">x</div>')).toHaveLength(1);
    // 合法样本：列表项的 key 标识身份，不是用来重播动画
    const legit = '{list.map((b) => (<li key={b.id} className="enter-rise">x</li>))}';
    expect(keyRemountViolations(legit)).toEqual([]);
  });

  it('全仓扫描：违例只允许出现在已登记的位置（当前为 route-view，修复排在 P8/P9）', () => {
    const found = sources(['.tsx'])
      .flatMap((file) =>
        keyRemountViolations(read(file)).map(() => relative(WEB_SRC, file).replace(/\\/g, '/')),
      )
      .sort();
    expect([...new Set(found)]).toEqual([...KEY_REMOUNT_ALLOWLIST]);
  });
});

describe('§1 feedback 落位：导航 / Tab / 投票 / 列表追加 / 可点性', () => {
  const NAV_ITEMS = [
    { key: 'river', label: '河道', href: '/river' },
    { key: 'sea', label: '公海', href: '/sea' },
    { key: 'mine', label: '我的', href: '/mine' },
    { key: 'settings', label: '设置', href: '/settings' },
  ];

  it('BottomNav：每项都有过渡 + 按下反馈 + 焦点环（移动端主交互不得零反馈）', () => {
    render(<BottomNav items={NAV_ITEMS} current="river" />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(NAV_ITEMS.length);
    for (const link of links) {
      expect(link.className, '底栏项缺少颜色过渡').toMatch(/transition-colors/);
      expect(link.className, '底栏项缺少按下反馈（mobile 无 hover，:active 是唯一即时回应）').toMatch(
        /active:/,
      );
      expect(link.className, '底栏项缺少 focus-visible 环').toMatch(/focus-visible:ring-2/);
    }
  });

  it('SidebarNav：每项都有颜色过渡（对照 BottomNav，两处手感必须一致）', () => {
    render(<SidebarNav items={NAV_ITEMS} current="river" />);
    for (const link of screen.getAllByRole('link')) {
      expect(link.className).toMatch(/transition-colors/);
    }
  });

  it('Tabs：每个 tab 都有颜色过渡（选中态切换不得瞬变）', () => {
    render(
      <Tabs
        items={[
          { key: 'a', label: '完整作品', content: <p>甲</p> },
          { key: 'b', label: '等待接力', content: <p>乙</p> },
        ]}
        value="a"
        onChange={() => undefined}
      />,
    );
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.className).toMatch(/transition-colors/);
    }
  });

  it('hover-lift 只能挂在可交互宿主上（不可点的卡片/行挂它 = 承诺不存在的交互）', () => {
    const offenders: string[] = [];
    for (const file of sources(['.tsx'])) {
      const src = read(file);
      const where = relative(WEB_SRC, file).replace(/\\/g, '/');
      for (const tag of jsxTags(src)) {
        if (!/\bhover-lift\b/.test(tag.attrs)) continue;
        const interactive =
          ['a', 'button', 'Link', 'NavLink'].includes(tag.tag) || /(^|\s)onClick=/.test(tag.attrs);
        if (!interactive) offenders.push(`${where}: <${tag.tag}>`);
      }
    }
    expect(offenders, 'hover-lift 宿主不可交互（要么去掉动效，要么把整块做成可点）').toEqual([]);
  });

  it('公海列表的每一项都有入场（追加的第 5 项起不得凭空出现）', () => {
    const seaPage = read(resolve(WEB_SRC, 'pages/sea-page.tsx'));
    expect(seaPage, '不得再用 index < N 只给首批做入场').not.toMatch(/index\s*<\s*\d+/);
    expect(seaPage).toMatch(/enter-rise/);
    expect(seaPage, 'stagger 必须对任意下标都成立（取模，避免长尾延迟）').toMatch(
      /stagger-\$\{String\(\(index % \d\) \+ 1\)\}/,
    );
  });

  it('投票计数变化有一次性反馈，且 reduced-motion 下不发动画（§7）', () => {
    const source = read(resolve(WEB_SRC, 'features/bottle/vote-controls.tsx'));
    expect(source, '计数的改变必须有可见反馈（§1 原文点名「投票后的确认」）').toMatch(
      /\.animate\??\.\(/,
    );
    expect(source, '动效不得绕过 reduced-motion：必须读 tokens 的偏好判定').toMatch(
      /prefersReducedMotion/,
    );
    expect(source, '时长必须引用 token 而不是字面量（§2）').toMatch(/motion\.\w+/);
    expect(source, '不得靠改 key 重播动画（§5）').not.toMatch(/key=\{count\}/);
  });
});
