/**
 * 音频能力层的 **record-v1 视觉语言守卫**（S4 片：`features/audio/**` 换语言）。
 *
 * ## 为什么要有它
 * 视觉换语言最容易出的两类事故，单元测试（断言文案/角色）**一个都抓不到**：
 * ① **继续用迁移期别名**：`bg-foam` / `text-abyss` / `bg-wave-white` 这些名字在 record-v1 里
 *    **会撒谎**（`foam` 现在是浅水光、`abyss` 现在是近白），最坏组合 `bg-foam` + `text-abyss`
 *    实测 **1.01:1**（DESIGN.md §Colors · 迁移别名 里点名的坏组合）。组件"测试全绿"但读不出来。
 * ② **偷偷内联颜色**：写死 `#RRGGBB` / `rgba(...)`，于是设计契约旁边多出第二份真相。
 *
 * 所以这里把「用新名、只用 token」变成**会红的断言**；每条断言都先见过它红（TDD：红→绿）。
 *
 * ## 这一层能证明什么、不能证明什么（别自欺）
 * - **能证明**：源码里只剩 record-v1 的 token 名、没有撒谎别名、没有内联色值，
 *   且各组件仍保留自己的**可访问结构**（role / aria-live / progressbar / alert…）。
 * - **不能证明**：观感（水感是否好看）与对比度实测 —— 前者靠 `docs/ui-review/impl-*` 的截图，
 *   后者靠像素取样。jsdom 不渲染，这里不能假装看到了颜色。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

/** 去掉块注释与整行行注释后的代码（注释里保留历史口径是允许的，见 copy-consistency.test.ts）。 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');
}

/** 本片负责的视觉面（纯逻辑文件 `format/waveform/upload/*` 不在这里）。 */
const FILES = [
  'recorder-panel.tsx',
  'segment-player.tsx',
  'segment-timeline.tsx',
  'mix-export-panel.tsx',
  'accompaniment-player.tsx',
  'library-attribution.tsx',
  'dislike-button.tsx',
] as const;

const SOURCES = FILES.map((name) => [name, code(read(name))] as const);

/**
 * 迁移期别名里**会撒谎**的那一批（DESIGN.md §Colors 的对照表逐条抄下来）。
 * 新写的代码一律用新名：`wave-white/abyss` → `ink/paper`、`foam/tide-pool` → `water-light/water-void`、
 * `deep-current/trench` → `water-body/water-bed`、`peacock*` → `coral/water-surface`、
 * `mist/driftline` → `line/water-mid`、`slate-current/on-dark-muted` → `muted`、
 * `coral-deep` → `danger`（语义色的提升档）、`sea-glass` → `glass`。
 */
const LYING_ALIASES = [
  'bg-foam',
  'text-abyss',
  'border-abyss',
  'bg-wave-white',
  'text-wave-white',
  'bg-tide-pool',
  'text-tide-pool',
  'bg-deep-current',
  'text-deep-current',
  'bg-trench',
  'text-trench',
  'bg-night-ink',
  'bg-peacock',
  'text-peacock',
  'border-peacock',
  'ring-peacock',
  'hover:bg-peacock-deep',
  'bg-peacock-active',
  'bg-lagoon',
  'text-lagoon',
  'border-lagoon',
  'text-sea-glass',
  'bg-sea-glass',
  'border-mist',
  'text-mist',
  'border-driftline',
  'text-slate-current',
  'text-coral-deep',
  'text-on-dark-muted',
] as const;

describe('音频层：只用 record-v1 的 token 名（迁移期别名会撒谎）', () => {
  for (const [name, source] of SOURCES) {
    it(`${name} 不出现迁移期别名`, () => {
      const hits = LYING_ALIASES.filter((alias) => source.includes(alias));
      expect(hits, `${name} 仍在用会撒谎的别名：${hits.join('、')}`).toEqual([]);
    });
  }

  it('扫描范围有效（每个文件都读到了内容，守卫不能空转）', () => {
    for (const [name, source] of SOURCES) {
      expect(source.length, `${name} 没读到内容`).toBeGreaterThan(400);
    }
  });
});

describe('音频层：颜色只能来自色板 token（不得内联 hex / rgb）', () => {
  for (const [name, source] of SOURCES) {
    it(`${name} 不内联色值`, () => {
      expect(source.match(/#[0-9a-fA-F]{6}\b/g) ?? [], `${name} 内联了 hex`).toEqual([]);
      expect(source.match(/\brgba?\(/g) ?? [], `${name} 内联了 rgb()/rgba()`).toEqual([]);
    });
  }
});

describe('音频层：每个组件的"面"来自 record-v1 的原生 token', () => {
  const required: ReadonlyArray<readonly [string, readonly string[]]> = [
    // DESIGN.md §Components：录制 / 波形区 = water-void 底 + 沟槽质感；波形条 glass；已录进度 water-deep
    ['recorder-panel.tsx', ['bg-water-void', 'bg-glass', 'bg-water-deep']],
    // 播放条：water-void 底 + L2 阴影；进度槽 rgba(line,·)、已播进度 coral
    ['segment-player.tsx', ['bg-water-void', 'bg-line/', 'bg-coral']],
    // 段链：横向沟槽；缺口必须是**虚线**（空槽），已唱段点亮 glass / 缺口 coral
    ['segment-timeline.tsx', ['bg-line/', 'bg-glass', 'bg-coral', 'border-dashed']],
    // 成品试听 = 沉浸式区块 → water-body（L4 deep）
    ['mix-export-panel.tsx', ['bg-water-body']],
    // 伴奏面板坐在盘面内层（water-bed）
    ['accompaniment-player.tsx', ['bg-water-bed', 'bg-glass']],
    // 署名块 = 内袋：ink 底 + 1px 细线
    ['library-attribution.tsx', ['bg-ink', 'border-line/']],
    // 点踩的"为什么不能踩"必须是 warning 语义（不是靠颜色，靠文案 + 图标）
    ['dislike-button.tsx', ['text-warning']],
  ];

  for (const [name, tokens] of required) {
    it(`${name} 用到了 ${tokens.join(' / ')}`, () => {
      const source = read(name);
      for (const token of tokens) {
        expect(source, `${name} 缺少 ${token}`).toContain(token);
      }
    });
  }
});

describe('音频层：换语言不得丢掉已有的无障碍结构', () => {
  const structure: ReadonlyArray<readonly [string, readonly string[]]> = [
    [
      'recorder-panel.tsx',
      ['data-testid="waveform"', 'aria-hidden="true"', 'role="alert"', 'aria-live="polite"'],
    ],
    [
      'segment-player.tsx',
      ['role="progressbar"', 'aria-live="polite"', 'enter-fade text-[0.875rem]'],
    ],
    ['segment-timeline.tsx', ['<ol', 'aria-current']],
    [
      'mix-export-panel.tsx',
      ['aria-label="成品试听"', 'role="alert"', 'data-testid="alignment-report"'],
    ],
    ['accompaniment-player.tsx', ['role="progressbar"', 'aria-live="polite"']],
    ['library-attribution.tsx', ['target="_blank"', 'rel="license noreferrer"']],
    ['dislike-button.tsx', ['aria-describedby']],
  ];

  for (const [name, markers] of structure) {
    it(`${name} 保留 ${markers.join(' / ')}`, () => {
      const source = read(name);
      for (const marker of markers) {
        expect(source, `${name} 丢了 ${marker}`).toContain(marker);
      }
    });
  }
});
