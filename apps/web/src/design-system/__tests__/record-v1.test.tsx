/**
 * record-v1 语言守卫（S2：母题与组件层）
 *
 * ## 为什么需要它
 * S1 只换了契约底座（色板 / 圆角 / 别名），**组件层仍写着上一版（ocean-v1）的语言**
 * —— `bg-foam`（现在是浅水光面）+ `text-abyss`（现在是近白）= **1.01:1 不可读**。
 * 这个文件把 S2 的三件事实变成会红的断言：
 *   ① **对比度是自己算的**（WCAG 2.1 公式，逐项断言），不是目测；
 *   ② **过渡别名不得再出现在组件层**（旧名会撒谎，S8 才整批删；S2 起组件层不许再用）；
 *   ③ **母题必须承担信息**（BottleMark 的水位 = 已录段数、Groove 的已点亮部分 = 已录段位）。
 *
 * ## 能证明什么 / 不能证明什么
 * - 能证明：色值关系（数学）、类名语言、母题是否真的编码了数据。
 * - 不能证明：观感与真实渲染像素（jsdom 无布局/合成器；由人看 showcase 与后续截图）。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  BottleMark,
  Button,
  EmptyState,
  Glint,
  Groove,
  Platter,
  Ripple,
  Tabs,
  Waterline,
  colors,
  motif,
} from '../index';

const DS_DIR = resolve(process.cwd(), 'src', 'design-system');
const REPO_ROOT = resolve(process.cwd(), '..', '..');
const designMd = readFileSync(resolve(REPO_ROOT, 'DESIGN.md'), 'utf8');

/** WCAG 2.1 相对亮度（与 `pages/__tests__/deep-surface-cta.test.ts` 同一公式，口径必须一致）。 */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi! + 0.05) / (lo! + 0.05)) * 100) / 100;
}

/** 半透明前景以 alpha 合成到底色上 —— 「装饰层/细线的实测口径」，别拿基色直接算。 */
function composite(foreground: string, background: string, alpha: number): string {
  const mix = (offset: number): number => {
    const f = Number.parseInt(foreground.slice(offset, offset + 2), 16);
    const b = Number.parseInt(background.slice(offset, offset + 2), 16);
    return Math.round(f * alpha + b * (1 - alpha));
  };
  return `#${[1, 3, 5].map((i) => mix(i).toString(16).padStart(2, '0')).join('')}`;
}

const TEXT_ON_INK = ['paper', 'muted', 'glass', 'coral', 'warm'] as const;
const SEMANTICS = ['success', 'warning', 'danger', 'info'] as const;
const WATER_PLANES = ['water-bed', 'water-body', 'water-surface'] as const;

describe('record-v1 对比度：自己算，不目测（底色一律 = ink 页面底）', () => {
  it('承载文字的每一档都 ≥4.5:1（muted 是暗端下限）', () => {
    for (const token of TEXT_ON_INK) {
      const ratio = contrast(colors[token], colors.ink);
      expect(ratio, `${token} on ink = ${String(ratio)}:1，低于正文 4.5:1`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('主 CTA：coral 实心填充上的文字必须用 ink（双向 4.76:1）', () => {
    expect(contrast(colors.ink, colors.coral)).toBeGreaterThanOrEqual(4.5);
    // 负向控制：这条正是"填充上不许压浅色文字"的理由，数值必须真的不合格
    expect(contrast(colors.paper, colors.coral)).toBeLessThan(4.5);
  });

  it('语义四件套的文字在其 tint 底上都 ≥4.5:1', () => {
    for (const tone of SEMANTICS) {
      const ratio = contrast(colors[tone], colors[`${tone}-tint`]);
      expect(ratio, `${tone} on ${tone}-tint = ${String(ratio)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('有意义的非文本图形 ≥3:1（语义描边 / focus ring / 冷光）', () => {
    for (const tone of SEMANTICS) {
      const ratio = contrast(colors[`${tone}-border`], colors.ink);
      expect(ratio, `${tone}-border on ink = ${String(ratio)}:1，低于非文本 3:1`).toBeGreaterThanOrEqual(3);
    }
    // focus ring = 2px coral（DESIGN.md §Accessibility）
    expect(contrast(colors.coral, colors.ink)).toBeGreaterThanOrEqual(3);
    // 圆盘外环第 1 圈：water-light 以 motif.ringAlpha 合成在 ink 上（承重的边界装置，必须 ≥3）
    const ring1 = composite(colors['water-light'], colors.ink, motif.ringAlpha);
    expect(
      contrast(ring1, colors.ink),
      `外环第 1 圈合成 ${ring1} 对 ink = ${String(contrast(ring1, colors.ink))}:1`,
    ).toBeGreaterThanOrEqual(3);
  });

  it('水线（line 以 surfaceLineAlpha 合成）≥3:1 —— 它是分界，不是纹理', () => {
    const line = composite(colors.line, colors.ink, motif.surfaceLineAlpha);
    expect(contrast(line, colors.ink)).toBeGreaterThanOrEqual(3);
  });

  it('纯装饰允许 <3:1，但必须在契约里写明它是装饰（负向控制）', () => {
    // 沟槽纹理与掠光是"世界的底/上方"，不承载任何信息 ⇒ 不受 3:1 约束，只能极淡
    const groove = composite(colors.line, colors.ink, motif.platterAlpha);
    const glint = composite(colors['water-deep'], colors.ink, motif.glintAlpha);
    expect(contrast(groove, colors.ink)).toBeLessThan(3);
    expect(contrast(glint, colors.ink)).toBeLessThan(3);
    // 但它们必须真的"看得见"（不是 0）—— 否则等于没画
    expect(motif.platterAlpha).toBeGreaterThan(0);
    expect(motif.glintAlpha).toBeGreaterThan(0);
  });

  it('水体（河道剖面）上的信息图形只能用冷/暖光：coral 直接压水体不合格', () => {
    for (const plane of WATER_PLANES) {
      expect(
        contrast(colors.glass, colors[plane]),
        `glass on ${plane}`,
      ).toBeGreaterThanOrEqual(3);
      expect(contrast(colors.warm, colors[plane]), `warm on ${plane}`).toBeGreaterThanOrEqual(3);
    }
    // 负向控制（S3 河道页必须记住这条）：coral 直接落在水体上 <3:1
    expect(contrast(colors.coral, colors['water-surface'])).toBeLessThan(3);
    expect(contrast(colors.coral, colors['water-body'])).toBeLessThan(3);
  });

  it('迁移期记账的那对坏组合必须仍然不可读（它正是被禁的理由）', () => {
    expect(contrast(colors.foam, colors.abyss)).toBeLessThan(1.5);
  });
});

describe('组件层不得再使用过渡别名（旧名会撒谎，S8 才整批删）', () => {
  /** DESIGN.md front matter 的 17 个过渡别名（语义已 re-point，名字仍是旧的）。 */
  const LEGACY_ALIASES = [
    'wave-white',
    'foam',
    'tide-pool',
    'mist',
    'driftline',
    'deep-current',
    'trench',
    'night-ink',
    'peacock',
    'peacock-deep',
    'peacock-active',
    'lagoon',
    'sea-glass',
    'abyss',
    'slate-current',
    'on-dark-muted',
    'coral-deep',
  ] as const;

  const tsxFiles = readdirSync(DS_DIR, { recursive: true, encoding: 'utf8' })
    .map((entry) => String(entry).replaceAll(String.fromCharCode(92), '/'))
    .filter((entry) => entry.endsWith('.tsx') && !entry.includes('__tests__'));

  it('扫描范围非空（守卫不能空转）', () => {
    expect(tsxFiles.length).toBeGreaterThanOrEqual(10);
  });

  it('每个别名都在色板里登记（否则这条守卫会漏掉真名）', () => {
    const front = designMd.split('---\n')[1] ?? '';
    for (const alias of LEGACY_ALIASES) {
      expect(front, `DESIGN.md 少了过渡别名 ${alias}`).toMatch(
        new RegExp(`^\\s{2}${alias}:\\s*"#`, 'm'),
      );
    }
  });

  it('design-system 的组件与 showcase 里没有以别名为色的 utility', () => {
    const pattern = new RegExp(
      `\\b(?:bg|text|border|ring|from|to|via|fill|stroke|shadow|outline|divide|decoration|placeholder|caret|accent|ring-offset)-(?:${LEGACY_ALIASES.join('|')})\\b`,
      'g',
    );
    const offenders: string[] = [];
    for (const file of tsxFiles) {
      const text = readFileSync(join(DS_DIR, file), 'utf8');
      for (const match of text.matchAll(pattern)) offenders.push(`${file}: ${match[0]}`);
    }
    expect(offenders, `组件层还在用会撒谎的旧名：${offenders.join(' | ')}`).toEqual([]);
  });

  it('反面校准：这条正则真的抓得住旧写法（否则守卫是装饰）', () => {
    const pattern = /\b(?:bg|text|border)-(?:foam|abyss|slate-current)\b/;
    expect('rounded-base bg-foam text-abyss'.match(pattern)).not.toBeNull();
    expect('rounded-base bg-ink text-paper'.match(pattern)).toBeNull();
  });

  it('主题层不得再提供 shadow-card（record-v1 用亮度差 + 1px 细线造层次，阴影只给浮层）', () => {
    // 只看**代码**：注释里允许提到这个名字（说明"为什么删掉它"），声明才是违规
    // （与 tokens.test.ts 的 `--spacing` 守卫同一手法）。
    const themeCode = readFileSync(join(DS_DIR, 'theme.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    expect(themeCode, 'shadow-card 是"用阴影造层次"的遗留，卡片已改用细线').not.toContain(
      '--shadow-card',
    );
    // 浮层阴影必须还在（Modal / Toast / 浮动条靠它）
    expect(themeCode, '浮动层阴影不能被顺手删掉').toContain('--shadow-floating');
    expect(themeCode, '.hover-lift 抬升层依赖它').toContain('--shadow-lift');
  });
});

describe('record-v1 母题装置：行为契约', () => {
  it('BottleMark 的水位编码「已录段数」（空瓶 / 半瓶 / 满瓶水位不同，且可被机器读到）', () => {
    const waterHeight = (filled: number): string => {
      const { container } = render(<BottleMark filled={filled} />);
      const water = container.querySelector('[data-water]');
      expect(water, 'BottleMark 必须画出瓶内水位').not.toBeNull();
      return water?.getAttribute('height') ?? '';
    };
    expect(waterHeight(0), '0 段 = 干瓶').toBe('0');
    expect(waterHeight(2), '2 段 = 半瓶').toBe('9');
    expect(waterHeight(4), '4 段 = 满瓶').toBe('18');
    const { container } = render(<BottleMark filled={2} />);
    expect(container.firstElementChild?.getAttribute('data-filled')).toBe('2');
  });

  it('BottleMark 不吃指针事件（母题是装饰，不得挡住页头链接）', () => {
    const { container } = render(<BottleMark />);
    expect(container.firstElementChild?.getAttribute('class')).toMatch(/pointer-events-none/);
  });

  it('Groove 被点亮的长度 = 已录段位（progress 直接映射到宽度）', () => {
    const litWidth = (progress: number): string => {
      const { container } = render(<Groove progress={progress} />);
      const lit = container.querySelector('.groove-lit');
      expect(lit, 'Groove 必须渲染出被点亮的那一段').not.toBeNull();
      return (lit as HTMLElement).style.width;
    };
    expect(litWidth(0.5)).toBe('50%');
    expect(litWidth(1)).toBe('100%');
    expect(litWidth(0)).toBe('0%');
  });

  it('Groove 的进度被夹在 [0,1]（越界输入不得撑破容器）', () => {
    const width = (progress: number): string => {
      const lit = render(<Groove progress={progress} />).container.querySelector('.groove-lit');
      return (lit as HTMLElement).style.width;
    };
    expect(width(3)).toBe('100%');
    expect(width(-2)).toBe('0%');
  });
});

describe('record-v1 母题装置：装饰纪律（不喧宾夺主）', () => {
  const cases = [
    ['Platter', Platter],
    ['Glint', Glint],
    ['Groove', Groove],
    ['Waterline', Waterline],
    ['Ripple', Ripple],
  ] as const;

  for (const [name, Component] of cases) {
    it(`${name}：aria-hidden + pointer-events-none + 绝对定位（零布局高度）`, () => {
      const node = render(<Component />).container.firstElementChild;
      expect(node, `${name} 没有渲染任何元素`).not.toBeNull();
      expect(node?.getAttribute('aria-hidden'), `${name} 必须 aria-hidden`).toBe('true');
      expect(node?.className, `${name} 必须 pointer-events-none`).toMatch(/pointer-events-none/);
      expect(node?.className, `${name} 必须绝对定位（不得进入文档流）`).toMatch(/absolute/);
    });
  }
});

describe('record-v1 组件层：375 与触控底线（现在生效）', () => {
  it('圆盘按钮的可点目标 ≥44px（min-h-11）', () => {
    const { container } = render(
      <>
        <Button shape="disc">捞</Button>
        <Button>投瓶入海</Button>
      </>,
    );
    const [disc, plate] = [...container.querySelectorAll('button')];
    expect(disc?.className, '圆盘触控目标不足').toMatch(/min-h-(?:11|14)/);
    expect(plate?.className, 'plate 触控目标不足').toMatch(/min-h-11/);
  });

  it('多列网格必须带断点前缀（768px 以下折叠单列）', () => {
    const files = readdirSync(DS_DIR, { recursive: true, encoding: 'utf8' })
      .map((entry) => String(entry).replaceAll(String.fromCharCode(92), '/'))
      .filter((entry) => entry.endsWith('.tsx') && !entry.includes('__tests__'));
    const offenders: string[] = [];
    for (const file of files) {
      for (const match of readFileSync(join(DS_DIR, file), 'utf8').matchAll(
        /([a-z]*:)?grid-cols-(\d+)/g,
      )) {
        if (Number(match[2]) > 1 && (match[1] ?? '') === '') offenders.push(`${file}: ${match[0]}`);
      }
    }
    expect(offenders, `窄屏会横向挤爆：${offenders.join(' | ')}`).toEqual([]);
  });

  it('Tabs / EmptyState 仍然可达（角色与文案没有被这次换语言带走）', () => {
    render(<Tabs items={[{ key: 'a', label: '完整作品' }]} />);
    expect(document.querySelector('[role="tablist"]')).not.toBeNull();
    render(<EmptyState icon="Waves" title="这一段河道暂时安静" />);
    expect(document.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });
});
