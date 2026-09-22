import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 页面层纪律守卫（可执行版）。
 *
 * 为什么需要：`DESIGN.md` 的 Do&Don't 有一半是"不许出现什么"，靠人眼 review 一定会漏；
 * 这组守卫把它们变成**会红的测试**。
 *
 * 扫描范围 = T3.2 自己写的页面与业务组件（设计系统与音频层各有自己的守卫）。
 * 只扫**去掉注释后的代码**：文档里写"禁用 h-screen"这种自述不算违规。
 */
const WEB_SRC = join(process.cwd(), 'src');

function collectSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules') collectSources(full, acc);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    acc.push(full);
  }
  return acc;
}

const OWNED_DIRS = [
  join(WEB_SRC, 'pages'),
  join(WEB_SRC, 'features', 'bottle'),
  join(WEB_SRC, 'features', 'api'),
  join(WEB_SRC, 'features', 'session'),
  join(WEB_SRC, 'features', 'profile'),
];

const SOURCES = OWNED_DIRS.flatMap((dir) => collectSources(dir));

function rel(path: string): string {
  return relative(WEB_SRC, path).split(sep).join('/');
}

/** 去掉块注释与行注释后的代码。 */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');
}

function offendersOf(predicate: (text: string, file: string) => string | null): string[] {
  const found: string[] = [];
  for (const file of SOURCES) {
    const reason = predicate(code(file), file);
    if (reason !== null) found.push(reason);
  }
  return found;
}

describe("页面文案纪律（DESIGN.md Do&Don't）", () => {
  it('扫描范围覆盖页面与业务组件（守卫不能空转）', () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(20);
    expect(SOURCES.map(rel)).toContain('pages/bottle-page.tsx');
  });

  it('不含 AI 陈词与占位文案', () => {
    const banned = [
      'Elevate',
      'Seamless',
      'Unleash',
      'Next-Gen',
      'lorem',
      'Lorem',
      '无缝',
      '赋能',
      '一键',
      '极致体验',
      '打造',
      '颠覆',
      '重新定义',
      '无限可能',
      '为梦想',
    ];
    const offenders = offendersOf((text, file) => {
      const hit = banned.find((word) => text.includes(word));
      return hit === undefined ? null : `${rel(file)} 含「${hit}」`;
    });
    expect(offenders).toEqual([]);
  });

  it('不使用 emoji（唯一图标来源是设计系统的 Lucide 注册表）', () => {
    // 覆盖常见 emoji 区段（含变体选择符 FE0F 单列，避免把区段写成误导性字符类）
    const emoji = /[\u{1F300}-\u{1FAFF}]|[\u{2700}-\u{27BF}]|\u{FE0F}/u;
    const offenders = offendersOf((text, file) => {
      const hit = text.match(emoji);
      return hit === null ? null : `${rel(file)}: ${String(hit[0])}`;
    });
    expect(offenders).toEqual([]);
  });

  it('页面不得直接 import lucide（实测会把 JS 从 227KB 涨到 978KB）', () => {
    const offenders = offendersOf((text, file) =>
      text.includes("from 'lucide-react'") ? rel(file) : null,
    );
    expect(offenders).toEqual([]);
  });

  it('不内联 hex 色值（颜色只能来自 DESIGN.md token 生成的 utilities）', () => {
    const offenders = offendersOf((text, file) => {
      const hex = text.match(/#[0-9a-fA-F]{6}\b/g);
      return hex === null ? null : `${rel(file)}: ${hex.join(',')}`;
    });
    expect(offenders).toEqual([]);
  });
});

describe('布局纪律（375px 与 1440px 都不横向溢出）', () => {
  it('不使用被禁的 h-screen / w-screen（改用 min-h-[100dvh]）', () => {
    const offenders = offendersOf((text, file) => {
      const hit = ['h-screen', 'w-screen', 'min-w-screen'].find((value) => text.includes(value));
      return hit === undefined ? null : `${rel(file)} 含 ${hit}`;
    });
    expect(offenders).toEqual([]);
  });

  it('没有超过 375px 的固定宽度（窄屏会横向溢出；max-w-* 不算）', () => {
    const offenders = offendersOf((text, file) => {
      const matches = [...text.matchAll(/(?<!max-)\b(?:w|min-w)-\[(\d+)px\]/g)];
      const tooWide = matches.filter((match) => Number(match[1]) > 375).map((match) => match[0]);
      return tooWide.length === 0 ? null : `${rel(file)}: ${tooWide.join(',')}`;
    });
    expect(offenders).toEqual([]);
  });

  it('多列网格都带断点前缀（768px 以下折叠为单列）', () => {
    const offenders = offendersOf((text, file) => {
      const found: string[] = [];
      for (const match of text.matchAll(/([a-z]*:)?grid-cols-(\d+)/g)) {
        const prefix = match[1] ?? '';
        if (Number(match[2]) > 1 && prefix === '') found.push(match[0]);
      }
      return found.length === 0 ? null : `${rel(file)}: ${found.join(',')}`;
    });
    expect(offenders).toEqual([]);
  });

  it('外壳与路由容器允许收缩（长代号 / 长曲名不撑破 375px）', () => {
    expect(code(join(WEB_SRC, 'pages', 'shell', 'app-shell.tsx'))).toContain('min-w-0');
    expect(code(join(WEB_SRC, 'pages', 'route-view.tsx'))).toContain('min-w-0');
  });

  it('每个页面级链接都是 ≥44px 的可点目标（min-h-11）', () => {
    const offenders = offendersOf((text, file) => {
      if (!rel(file).startsWith('pages/')) return null;
      const bare: string[] = [];
      for (const match of text.matchAll(/<Link[\s\S]{0,320}?>/g)) {
        const chunk = match[0];
        const className = /className=\{?([^}>]*)/.exec(chunk)?.[1] ?? '';
        if (!className.includes('min-h-11') && !className.includes('TEXT_LINK'))
          bare.push(chunk.trim());
      }
      return bare.length === 0 ? null : `${rel(file)}: ${bare.join(' | ')}`;
    });
    expect(offenders).toEqual([]);
  });
});
