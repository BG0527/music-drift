import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T3.1 设计系统 · token 契约（设计文档的唯一实现源是 DESIGN.md）
 *
 * 这些测试把 `DESIGN.md` 的 front matter 当作**唯一真相**：
 * 主题文件里出现任何 DESIGN.md 未定义的 hex，都必须让测试变红 —— 这是
 * AGENTS.md §4「禁止在组件里内联硬编码新值」的机器守卫。
 */
const repoRoot = resolve(process.cwd(), '..', '..'); // apps/web → repo root
const dsDir = resolve(process.cwd(), 'src', 'design-system'); // vitest 的 cwd = apps/web
const designMd = readFileSync(resolve(repoRoot, 'DESIGN.md'), 'utf8');
const themeCss = readFileSync(resolve(dsDir, 'theme.css'), 'utf8');
const tokensTs = readFileSync(resolve(dsDir, 'tokens.ts'), 'utf8');

/** 从 DESIGN.md 的 front matter `colors:` 块抽 `名字: "#RRGGBB"`（逐行扫描，避免脆弱的跨行正则）。 */
function frontMatterColors(md: string): Record<string, string> {
  const front = md.split('---\n')[1] ?? '';
  const out: Record<string, string> = {};
  let inColors = false;
  for (const line of front.split('\n')) {
    if (/^colors:\s*$/.test(line)) {
      inColors = true;
      continue;
    }
    if (!inColors) continue;
    if (/^\S/.test(line)) break; // colors 块结束
    const m = /^\s{2}([a-z0-9-]+):\s*"(#[0-9A-Fa-f]{6})"\s*$/.exec(line);
    const name = m?.[1];
    const hex = m?.[2];
    if (name !== undefined && hex !== undefined) out[name] = hex.toUpperCase();
  }
  return out;
}

/** emoji 检测：按码点范围扫描，不用字符类里的组合字符（避免 lint 的 misleading-character-class）。 */
function containsEmoji(text: string): boolean {
  const ranges: ReadonlyArray<readonly [number, number]> = [
    [0x1f300, 0x1faff],
    [0x2600, 0x27bf],
  ];
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    if (ranges.some(([start, end]) => code >= start && code <= end)) return true;
  }
  return false;
}

const palette = frontMatterColors(designMd);

describe('DESIGN.md front matter 是色板唯一真相', () => {
  it('能解析出完整色板（含本轮提升的 8 个语义 tint/border token）', () => {
    expect(Object.keys(palette).length).toBeGreaterThanOrEqual(30);
    for (const key of [
      'success-tint',
      'success-border',
      'warning-tint',
      'warning-border',
      'danger-tint',
      'danger-border',
      'info-tint',
      'info-border',
    ]) {
      expect(palette).toHaveProperty(key);
    }
  });

  it('每个色 token 都在 theme.css 里以 --color-<name> 暴露，且值与 DESIGN.md 完全一致', () => {
    const normalized = themeCss.toLowerCase();
    for (const [name, hex] of Object.entries(palette)) {
      const declared = normalized.includes(`--color-${name.toLowerCase()}: ${hex.toLowerCase()}`);
      expect(declared, `theme.css 缺少 --color-${name}: ${hex}`).toBe(true);
    }
  });

  it('theme.css 不得出现 DESIGN.md 色板之外的 hex（禁止发明新颜色）', () => {
    const allowed = new Set(Object.values(palette));
    const found = themeCss.match(/#[0-9A-Fa-f]{6}(?![0-9A-Fa-f])/g) ?? [];
    const unknown = found.map((hex) => hex.toUpperCase()).filter((hex) => !allowed.has(hex));
    expect(unknown, `theme.css 出现未定义色值：${unknown.join(', ')}`).toEqual([]);
  });

  it('tokens.ts 与 front matter 同源（JS 侧不另写一份色值）', () => {
    for (const hex of Object.values(palette)) {
      expect(tokensTs.toUpperCase()).toContain(hex);
    }
  });
});

describe('布局 / 圆角 / 层级 token 与 DESIGN.md 一致', () => {
  it('8px 节奏：不覆盖 --spacing，节奏档用偶数表达（ADR §48）', () => {
    // ① 负向守卫：不得声明 --spacing。框架默认 0.25rem（=「尺度值 1 的长度」）才让
    //    `min-h-11` = 44px、`w-64` = 256px 成立；覆盖它会让**每个数字档 ×2**
    //    （这正是 2026-09-23 的"前端丑"事故根因，故用负向断言钉死）。
    expect(themeCss, 'theme.css 不得声明 --spacing（覆盖会让所有数字档 ×2）').not.toMatch(/--spacing\s*:/);

    // ② 真正要守卫的是「档位全集」，由 --space-* token 表达，与基准确认无关
    for (const step of ['4px', '8px', '12px', '16px', '24px', '32px', '48px', '64px']) {
      expect(themeCss, `缺少间距档 ${step}`).toContain(step);
    }

    // ③ 触控底线 44px 必须存在，且在 0.25rem 基准下用标准类 min-h-11 表达
    expect(themeCss).toContain('--touch-target-min: 44px');

    // ④ 术语澄清必须留在文档里，否则下一个人会重犯同一误解
    expect(themeCss, 'theme.css 应保留"不覆盖 --spacing"的说明').toContain('不覆盖 Tailwind');
  });

  it('容器宽度与侧边距映射正确', () => {
    expect(themeCss).toContain('--container-max-width: 1280px');
    expect(themeCss).toContain('--container-padding-inline: 1.5rem');
  });

  it('rounded 全量档位映射正确（基准 12px）', () => {
    expect(themeCss).toContain('--radius-none: 0');
    for (const [token, value] of Object.entries({
      sm: 6,
      md: 8,
      base: 12,
      lg: 16,
      xl: 20,
      '2xl': 24,
    })) {
      expect(themeCss, `缺少 --radius-${token}: ${value}px`).toContain(
        `--radius-${token}: ${value}px`,
      );
    }
    expect(themeCss).toContain('--radius-pill: 999px');
    expect(themeCss).toContain('--radius-full: 50%');
  });

  it('z-index 契约 base0/sticky100/overlay200/modal300/toast500 逐条映射', () => {
    for (const [name, value] of Object.entries({
      base: 0,
      sticky: 100,
      overlay: 200,
      modal: 300,
      toast: 500,
    })) {
      expect(themeCss, `缺少 --z-${name}: ${value}`).toContain(`--z-${name}: ${value}`);
    }
  });

  it('动效物理参数逐条映射（spring 120/20、480ms、交错 100ms、scale 1.03、hover 200ms、页面 300ms）', () => {
    expect(tokensTs).toContain('stiffness: 120');
    expect(tokensTs).toContain('damping: 20');
    for (const declaration of [
      '--motion-entry-duration: 480ms',
      '--motion-entry-shift: 16px',
      '--motion-stagger: 100ms',
      '--motion-hover-scale: 1.03',
      '--motion-hover-duration: 200ms',
      '--motion-page-duration: 300ms',
      // 2026-09-24 amend（审计 A1/A2/A4）：原先 shimmer 1.4s / ripple 2.4s 是 motion.css 的内联字面量、
      // 退场时长则根本不存在 —— 违反「参数只能来自设计契约」。现登记为 token。
      '--motion-shimmer-duration: 1400ms',
      '--motion-ripple-duration: 2400ms',
      '--motion-exit-duration: 240ms',
    ]) {
      expect(themeCss, `缺少动效契约 ${declaration}`).toContain(declaration);
    }
  });

  it('动画只被允许作用在 transform / opacity 上（主题层声明）', () => {
    expect(themeCss).toContain('--motion-animated-properties: transform, opacity');
  });

  it('motion.css 的工作变量与 theme.css 契约同值（drift guard）', () => {
    const motionCss = readFileSync(resolve(dsDir, 'motion.css'), 'utf8');
    const pairs: ReadonlyArray<readonly [string, string]> = [
      ['480ms', '--entry-duration: 480ms'],
      ['16px', '--entry-shift: 16px'],
      ['100ms', '--stagger-step: 100ms'],
      ['200ms', '--hover-duration: 200ms'],
      ['300ms', '--page-duration: 300ms'],
      ['1400ms', '--shimmer-duration: 1400ms'],
      ['2400ms', '--ripple-duration: 2400ms'],
      ['240ms', '--exit-duration: 240ms'],
    ];
    for (const [contract, working] of pairs) {
      expect(themeCss, `theme.css 缺少契约值 ${contract}`).toContain(contract);
      expect(motionCss, `motion.css 缺少工作变量 ${working}`).toContain(working);
    }
  });
});

describe('尺度守卫：源码级恒跑 + 产物级「新鲜才断言」', () => {
  // ── ① 源码级负向守卫：**不依赖 build，永不跳过** ──────────────────────
  // 这是主守卫：把「按 0.5rem 覆盖 --spacing」这个事故钉死在任何 CSS 源文件上。
  it('任何 CSS 源文件都不得声明 --spacing（恒跑守卫，ADR §48）', () => {
    const cssFiles = readdirSync(dsDir, { recursive: true, encoding: 'utf8' })
      .map((entry) => String(entry).replaceAll(String.fromCharCode(92), '/'))
      .filter((entry) => entry.endsWith('.css'));
    expect(cssFiles.length, '没扫到任何 CSS 源文件，守卫失效').toBeGreaterThan(0);
    for (const file of cssFiles) {
      const text = readFileSync(join(dsDir, file), 'utf8');
      // 注释里允许出现 `--spacing`（用于术语说明），只查真实的声明
      const codeOnly = text.replace(/\/\*[\s\S]*?\*\//g, '');
      expect(codeOnly, `${file} 声明了 --spacing（会让所有数字档 ×2）`).not.toMatch(/--spacing\s*:/);
    }
  });

  // ── ② 产物级：只有在"产物比主题源文件新"时才断言 ────────────────────
  // 为什么不是无脑断言：产物可能是**过期**的（build 之后又改了 theme.css），
  // 用过期产物做断言会给出假安全感。因此三种情形分别是：
  //   产物不存在        → 跳过（测试名写明原因）
  //   产物比源文件旧    → 跳过（测试名写明"产物过期"）
  //   产物比源文件新    → 真正断言 `--spacing` 不得为 .5rem
  const distAssets = resolve(repoRoot, 'apps', 'web', 'dist', 'assets');
  const themeSource = resolve(dsDir, 'theme.css');
  const builtCssName = existsSync(distAssets)
    ? readdirSync(distAssets).find((name) => name.startsWith('index-') && name.endsWith('.css'))
    : undefined;

  const skipReason: string | undefined = (() => {
    if (builtCssName === undefined) return 'dist 不存在（未 build）';
    const builtAt = statSync(resolve(distAssets, builtCssName)).mtimeMs;
    const sourceAt = statSync(themeSource).mtimeMs;
    if (builtAt < sourceAt) return '产物比 theme.css 旧（需重新 build）';
    return undefined;
  })();

  it.skipIf(skipReason !== undefined)(
    `构建产物里 --spacing 不得为 .5rem（dist 缺失/过期时自动跳过：${skipReason ?? '产物新鲜，本次已执行'}）`,
    () => {
      const css = readFileSync(resolve(distAssets, builtCssName as string), 'utf8');
      expect(css, '产物里出现 --spacing: .5rem ⇒ 基准被再次覆盖').not.toMatch(/--spacing:\s*0?\.5rem/);
      // 正面确认：Tailwind 默认基准在场
      expect(css).toMatch(/--spacing:\s*0?\.25rem/);
    },
  );
});

describe('纪律守卫（禁 emoji / 禁写死视口高度 / 禁纯黑）', () => {
  it('设计系统源码内不得出现 emoji', () => {
    for (const [name, text] of Object.entries({ themeCss, tokensTs })) {
      expect(containsEmoji(text), `${name} 含 emoji`).toBe(false);
    }
  });

  it('不得使用被禁用的视口高度类名（必须用 100dvh）', () => {
    const banned = ['h', 'screen'].join('-'); // 拼接以避开被禁字面量本身的扫描
    expect(themeCss).not.toContain(banned);
    expect(tokensTs).not.toContain(banned);
  });

  it('不得出现纯黑 / 纯白作为色板 token', () => {
    expect(Object.values(palette)).not.toContain('#000000');
    expect(Object.values(palette)).not.toContain('#FFFFFF');
  });
});
