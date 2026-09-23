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
import { BottleMark, TideLine, WakeLine, WaterSheen, WaterTexture } from '../index';

const SRC_DIR = join(process.cwd(), 'src');
const DS_DIR = join(SRC_DIR, 'design-system');
const REPO_ROOT = resolve(process.cwd(), '../..');

const readIfPresent = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8') : '');
/** 读某个页面源码（跨 describe 共用，故放在模块作用域）。 */
const pageSource = (name: string): string => readIfPresent(join(SRC_DIR, 'pages', name));
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
  // t44 增强
  'textureLineGapAlt',
  'textureFade',
  'textureAlphaLight',
  'wakeDash',
  'wakeGap',
  'wakeAlpha',
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

describe('t44 水感增强：不再是等距直线阵列', () => {
  it('水位线用**双线距干涉纹**（两个不同线距都在用）', () => {
    expect(waterCss).toContain('var(--motif-texture-line-gap)');
    expect(waterCss).toContain('var(--motif-texture-line-gap-alt)');
  });

  it('水位线用 **mask-image 左右渐隐**（水线不再顶到边）', () => {
    expect(waterCss, '缺少 mask-image 渐隐').toMatch(/mask-image:\s*linear-gradient/);
    expect(waterCss, 'mask 的渐隐边距必须取契约 token').toContain('var(--motif-texture-fade)');
  });

  it('两个线距必须**不相等**（相等就还是等距直线阵列 —— 反向控制点）', () => {
    const gaps = [...frontMatter.matchAll(/textureLineGap(?:Alt)?:\s*(\d+)px/g)].map((m) =>
      Number(m[1]),
    );
    expect(gaps).toHaveLength(2);
    expect(gaps[0], '两条线距相等 ⇒ 干涉纹不成立').not.toBe(gaps[1]);
  });
});

describe('t44 浅底强度上限（先定后用，机器可检）', () => {
  /**
   * 上限口径的来龙去脉（别退回旧值）：
   * 1. 起初按 `ui-ux` SKILL.md「Glass card (light) | `bg-white/80` or higher opacity」定为 0.04；
   * 2. **用户当场裁决：「水、河流、海洋、漂流瓶都要能一眼看出来」** ⇒ 可见性优先于内部 skill 的克制条款
   *    （同 AGENTS.md §4 与 t34-B1 的先例：用户直接指令优先于内部契约）；
   * 3. 因此把可调区间上限抬到 **0.12**（约束从"靠 alpha 猜"改成"靠实测"），最终定为 **0.09**：
   *    `docs/ui-review/theme-pass-2.md` §2 用 PIL 对真实截图做像素测量，要求正文与其实际背景 ≥4.5:1。
   * 4. **⚠️ 一次已被撤回的读数（别把它当依据）**：最初的结论是"0.12 → 4.29:1 < 4.5 ⇒ 否决"，
   *    但那次采样带落到了 `mist` 描边而不是水线（更正过程见 `theme-pass-2.md` §2.3 的自我更正）。
   *    更正后的口径：**水线的合成色比 `mist` 浅**，最坏候选 4.58:1 仍达标 ⇒ **0.09 是"够可见且有余量"
   *    的选择，而**不是**"0.12 违规所以降下来"。任何引用 4.29:1 的推断一律作废。
   * 注：浅底 alpha 必然要**高于**深底（0.05）才等效可见 —— 感知对比取决于底色，同一个 alpha 用在
   *   近白底与深蓝底上完全不是一个东西（这也是为什么"照抄一个数字"是错的）。
   */
  it('浅底强度必须有独立 token，且 **≤ 0.09**（这个数字由像素实测把关，不是拍出来的）', () => {
    const m = /textureAlphaLight:\s*([\d.]+)/.exec(frontMatter);
    expect(m, 'DESIGN.md 缺少 textureAlphaLight').not.toBeNull();
    // 依据 = theme-pass-2.md §2.3 更正后的口径（最坏水线合成 4.58:1 ≥ 4.5，留余量）。
    // 已撤回的 4.29:1 读数不作为依据 —— 那是把 mist 描边误当水线的误测。
    expect(Number(m?.[1])).toBeLessThanOrEqual(0.09);
  });

  it('浅底纹理类必须引用**浅底**强度 token（不得复用深底的 0.05 以上强度）', () => {
    const light = /\.water-texture-light\s*\{[^}]*opacity[^}]*\}/.exec(waterCss)?.[0] ?? '';
    expect(light, '缺少 .water-texture-light 规则').not.toBe('');
    expect(light).toContain('var(--motif-texture-alpha-light)');
  });
});

describe('t44 漂流瓶与航迹母题', () => {
  it('WakeLine：aria-hidden + pointer-events-none + 绝对定位（零布局高度）', () => {
    const { container } = render(<WakeLine />);
    const node = container.firstElementChild;
    expect(node?.getAttribute('aria-hidden')).toBe('true');
    expect(node?.className).toMatch(/pointer-events-none/);
    expect(node?.className).toMatch(/absolute/);
  });

  it('BottleMark 不吃指针事件（母题是装饰，不得挡住页头链接）', () => {
    const { container } = render(<BottleMark />);
    // 注意：SVG 元素的 `className` 是 SVGAnimatedString（不是字符串）⇒ 必须读属性
    expect(container.firstElementChild?.getAttribute('class')).toMatch(/pointer-events-none/);
  });

  it('公海大厅：整页水位线（浅底）+ 水面光带 + 页头瓶子 + 潮线', () => {
    const sea = pageSource('sea-page.tsx');
    expect(sea, '公海大厅缺浅底水位线').toMatch(/<WaterTexture\s+tone="light"/);
    expect(sea, '公海大厅缺水面光带').toMatch(/<WaterSheen\s+tone="light"/);
    expect(sea, '公海大厅缺漂流瓶母题（用户点名）').toContain('<BottleMark');
    expect(sea, '公海大厅缺潮线').toContain('<TideLine');
    expect(sea, '母题宿主必须是 isolate 容器（否则 z-underlay 看不见）').toMatch(
      /relative isolate/,
    );
  });

  it('漂流日志：页头瓶子 + 航迹（瓶子是用户点名的母题，日志页也该有）', () => {
    const log = pageSource('drift-log-page.tsx');
    expect(log, '漂流日志页头缺漂流瓶母题').toContain('<BottleMark');
    expect(log, '漂流日志缺航迹').toContain('<WakeLine');
    expect(log).toMatch(/relative/);
  });

  /**
   * 每个页头**只留一条细线**（captain 观感反馈：潮线与航迹只差约 10px，叠在一起读成"双线"、显噪）。
   * 语义分工 → 各自留一条：公海大厅留下「潮线」（海面边界），漂流日志留下「航迹」（这段"经过"）。
   */
  it('同一页头不得同时出现潮线与航迹（否则读成双线、显噪）', () => {
    const sea = pageSource('sea-page.tsx');
    const log = pageSource('drift-log-page.tsx');
    expect(sea.includes('<TideLine') && sea.includes('<WakeLine'), '公海大厅页头同时有两线').toBe(
      false,
    );
    expect(log.includes('<TideLine') && log.includes('<WakeLine'), '漂流日志页头同时有两线').toBe(
      false,
    );
  });
});


/* ── t46 第三批：全站扩面 ───────────────────────────────────────────────────
   用户第十四轮：「还要更明显：其他页面也加水与瓶子」。
   判据（机器可检）：① 每个页面至少一处母题；② 用整面水层（WaterTexture/WaterSheen）
   的页面，宿主必须 `isolate`（否则 z-underlay 会掉到背景之下而看不见 —— t43 踩过）；
   ③ 空状态里要有"漂流瓶"（用户点名）。 */
const MOTIF_TAGS = ['<BottleMark', '<TideLine', '<WakeLine', '<WaterSheen', '<WaterTexture'];
/** 页面里是否出现任一母题组件（用 includes 而不是正则：避免转义坑）。 */
const hasMotif = (src: string): boolean => MOTIF_TAGS.some((tag) => src.includes(tag));
const FULL_SURFACE_TAGS = ['<WaterTexture', '<WaterSheen'];
const hasFullSurface = (src: string): boolean =>
  FULL_SURFACE_TAGS.some((tag) => src.includes(tag));

describe('t46 扩面：每个页面至少一处水或漂流瓶母题', () => {
  const PAGES = [
    'river-page.tsx',
    'sea-page.tsx',
    'sea-detail-page.tsx',
    'drift-log-page.tsx',
    'profile-page.tsx',
    'settings-page.tsx',
    'song-picker-page.tsx',
    'admin-page.tsx',
    'not-found-page.tsx',
  ] as const;

  for (const page of PAGES) {
    it(`${page} 至少一处母题`, () => {
      const src = pageSource(page);
      expect(hasMotif(src), `${page} 没有任何水域/漂流瓶母题`).toBe(true);
    });
  }

  it('用整面水层（WaterTexture/WaterSheen）的页面，宿主必须 isolate', () => {
    const offenders = PAGES.filter((page) => {
      const src = pageSource(page);
      return hasFullSurface(src) && !src.includes('isolate');
    });
    expect(offenders, '这些页面有整面水层但宿主没 isolate（装饰会看不见）').toEqual([]);
  });

  it('空状态里有漂流瓶（用户点名）：选歌页与公海页', () => {
    expect(pageSource('song-picker-page.tsx'), '选歌页空状态缺漂流瓶').toContain('BottleMark');
    expect(pageSource('sea-page.tsx'), '公海页空状态缺漂流瓶').toContain('BottleMark');
  });
});

/* ── t46 第三批：水缓缓流动（常驻漂移）───────────────────────────────────────
   DESIGN.md 的「水域母题层」旧硬约束③写的是"本层不含任何动画"，并预告："若将来加漂移，
   必须走 motion-web §1 decoration 三条件并引用 motion 契约"。本组就是那个"将来"。
   判据（全部用 includes 断言，不用正则 —— 避免上一版把控制字符写进正则的事故）：
     ① 漂移参数来自 motion 契约；② 只动 transform；③ **是 CSS 动画**（这样 motion.css 的
        全局 reduced-motion 重置才管得到它），不得 JS/WAAPI 驱动；④ 旧条文已删（不许两份规则并存）。 */
/** 精确判据：`<WaterTexture …>` 标签内是否真的写了 `drift`（不能只看文件里有没有 "drift" 这个词）。 */
const usesDrift = (src: string): boolean => {
  let i = src.indexOf('<WaterTexture');
  while (i !== -1) {
    if (src.slice(i, i + 80).includes(' drift')) return true;
    i = src.indexOf('<WaterTexture', i + 1);
  }
  return false;
};

describe('t46 水流漂移：走契约 + reduced-motion 可静止（能真的区分）', () => {
  const motionCssDrift = readFileSync(join(DS_DIR, 'motion.css'), 'utf8');

  it('DESIGN.md 的 motion 块登记了漂移时长与位移', () => {
    expect(frontMatter, 'DESIGN.md motion 块缺 driftDuration').toContain('driftDuration:');
    expect(frontMatter, 'DESIGN.md motion 块缺 driftShift').toContain('driftShift:');
  });

  it('theme.css 暴露 --motion-drift-* 契约值', () => {
    expect(themeCss).toContain('--motion-drift-duration');
    expect(themeCss).toContain('--motion-drift-shift');
  });

  it('漂移是 CSS 动画（受全局 reduced-motion 重置管辖），且只动 transform', () => {
    expect(waterCss, 'water.css 缺漂移关键帧').toContain('@keyframes ocean-drift');
    const frames = waterCss.split('@keyframes ocean-drift')[1]?.split('}')[0] ?? '';
    expect(frames, '缺关键帧体').not.toBe('');
    expect(frames, '漂移只能动 transform').toContain('transform:');
    for (const banned of ['width:', 'height:', 'top:', 'left:', 'margin:', 'padding:']) {
      expect(frames, `漂移不得动 ${banned}`).not.toContain(banned);
    }
    expect(waterCss, '漂移时长必须取契约 token').toContain('var(--drift-duration)');
    expect(waterCss, '漂移幅度必须取契约 token').toContain('var(--drift-shift)');
  });

  it('漂移不得用 JS/WAAPI 驱动（会绕过 reduced-motion 的 CSS 重置）', () => {
    expect(waterCss, 'water.css 不得出现 JS 动画').not.toContain('.animate(');
    expect(waterCss, 'water.css 不得用 rAF 驱动').not.toContain('requestAnimationFrame');
  });

  it('motion.css 的全局 reduced-motion 重置覆盖所有动画（漂移因此静止）', () => {
    expect(motionCssDrift, 'motion.css 缺 reduced-motion 媒体查询').toContain(
      'prefers-reduced-motion: reduce',
    );
    expect(motionCssDrift, '缺通用 animation: none !important（漂移会漏网）').toContain(
      'animation: none !important',
    );
  });

  it('至少 3 个页面真的用了漂移（不是写了没人用）', () => {
    const users = ['sea-page.tsx', 'profile-page.tsx', 'settings-page.tsx'].filter((page) =>
      usesDrift(pageSource(page)),
    );
    expect(users.length, `只有 ${String(users.length)} 个页面用了 drift`).toBeGreaterThanOrEqual(3);
  });

  it('旧硬约束③已从 DESIGN.md 删除，且新条文在位（不许两份规则并存）', () => {
    expect(designMd, '旧条文还在：本层不含任何动画').not.toContain('本层不含任何动画');
    expect(designMd, '新条文缺失').toContain('低幅度常驻漂移');
  });
});

/* ── t47 收尾：深底水面也要流动（浅底活、深底死图 = 同一页两种水，不一致）─────────
   判据（全部 includes，无正则）：① 河道页两个深水面板的水层带 drift；
   ② 作品详情深底页头的水层带 drift；③ 降级通道唯一 —— water.css 里不得有 JS 驱动动画
   （`.animate(` / requestAnimationFrame），否则 reduced-motion 的 CSS 重置会被绕过。 */
const countDriftTags = (src: string, tag: string): number => {
  let n = 0;
  let i = src.indexOf('<' + tag);
  while (i !== -1) {
    if (src.slice(i, i + 80).includes(' drift')) n += 1;
    i = src.indexOf('<' + tag, i + 1);
  }
  return n;
};

/**
 * 深底容器（`bg-deep-current`）里是否**有**带 drift 的水层。
 * 判据放在"深底容器之后 700 字符"的窗口里 —— 因为装饰层是该容器的子节点，
 * 而 className 在容器标签上、装饰在它之后。
 */
const darkSurfaceDrifts = (src: string): 'none' | 'all' | 'partial' => {
  const hits: boolean[] = [];
  let i = src.indexOf('bg-deep-current');
  while (i !== -1) {
    hits.push(src.slice(i, i + 700).includes(' drift'));
    i = src.indexOf('bg-deep-current', i + 1);
  }
  if (hits.length === 0) return 'none';
  return hits.every(Boolean) ? 'all' : 'partial';
};

describe('t47 深底水面也流动（消除"浅底活在流、深底是贴图"）', () => {
  it('河道页的两个深水面板（bg-deep-current）里都有 drift 水层', () => {
    const src = pageSource('river-page.tsx');
    expect(src.split('bg-deep-current').length - 1, '河道页深底容器数量变了？').toBe(2);
    expect(darkSurfaceDrifts(src), '河道页有深水面板没开漂移').toBe('all');
    expect(countDriftTags(src, 'WaterTexture'), '河道页带 drift 的水层少于 2 处').toBeGreaterThanOrEqual(2);
  });

  it('作品详情深底页头（bg-deep-current）里也有 drift 水层', () => {
    const src = pageSource('sea-detail-page.tsx');
    expect(darkSurfaceDrifts(src), '详情页深底页头没开漂移').toBe('all');
  });

  it('降级通道唯一：water.css 里不得有 JS 驱动动画（否则 reduced-motion 会被绕过）', () => {
    expect(waterCss, 'water.css 出现 JS 动画').not.toContain('.animate(');
    expect(waterCss, 'water.css 出现 rAF 驱动').not.toContain('requestAnimationFrame');
  });

  it('深浅底共用同一对 token（不得出现"深底专用"的第二套规则）', () => {
    // 只允许一套漂移参数：motion 块里 drift 参数只能各出现一次
    expect(frontMatter.split('driftDuration:').length - 1, 'driftDuration 出现多次').toBe(1);
    expect(frontMatter.split('driftShift:').length - 1, 'driftShift 出现多次').toBe(1);
  });
});
