import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T3.1 设计系统 · 字体自托管 + 无障碍动效契约
 *
 * 纪律来源：`DESIGN.md` §Typography（霞鹜文楷 + Quattrocento，禁 CDN）、
 * §Elevation & Depth（spring 120/20 等物理参数）、§Accessibility（reduced-motion）。
 */
const dir = resolve(process.cwd(), 'src', 'design-system');
const read = (name: string): string => readFileSync(join(dir, name), 'utf8');

const fontsCss = read('fonts.css');
const motionCss = read('motion.css');

describe('字体自托管（禁 CDN）', () => {
  it('中文字体走 npm 包 lxgw-wenkai-webfont（自托管）', () => {
    expect(fontsCss).toMatch(/lxgw-wenkai-webfont/);
  });

  it('拉丁 / 数字走 npm 包 @fontsource/quattrocento（自托管）', () => {
    expect(fontsCss).toMatch(/@fontsource\/quattrocento/);
  });

  it('声明 font-display: swap（无 webfont 时立即用 fallback 渲染，不白屏）', () => {
    expect(fontsCss).toMatch(/font-display:\s*swap/);
  });

  it('中文 fallback 栈包含可用衬线兜底（Songti SC / Noto Serif SC）', () => {
    expect(fontsCss).toMatch(/Songti SC/);
    expect(fontsCss).toMatch(/Noto Serif SC/);
  });

  it('字体族 token 与 DESIGN.md 的 font-family 栈一致', () => {
    expect(fontsCss).toMatch(/--font-cjk:/);
    expect(fontsCss).toMatch(/--font-latin:/);
    expect(fontsCss).toMatch(/--font-mono:/);
    // 引号风格由仓库 prettier 配置（singleQuote）决定，契约只约束字体族名与栈顺序
    expect(fontsCss).toMatch(/['"]JetBrains Mono['"]/);
  });
});

describe('全文禁止 CDN 引用（jsDelivr 不可达）', () => {
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((entry) => String(entry).replaceAll('\\', '/'))
    .filter((entry) => /\.(css|ts|tsx)$/.test(entry) && !entry.includes('__tests__'));

  it('设计系统内的 css/ts/tsx 不含任何 http(s) 外链或 CDN 主机名', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = read(file);
      for (const banned of ['jsdelivr', 'fonts.googleapis', 'fonts.gstatic', 'unpkg', 'cdnjs']) {
        expect(text.toLowerCase(), `${file} 命中 CDN: ${banned}`).not.toContain(banned);
      }
      const urls = text.match(/url\(\s*['"]?https?:/g) ?? [];
      expect(urls, `${file} 含远程 url()`).toEqual([]);
    }
  });
});

describe('动效物理参数与 reduced-motion 降级', () => {
  it('入场动画是 480ms ease-out + 16px 位移', () => {
    expect(motionCss).toMatch(/--entry-shift:\s*16px/);
    expect(motionCss).toMatch(/--entry-duration:\s*480ms/);
    expect(motionCss).toMatch(/--entry-easing:\s*ease-out/);
  });

  it('列表交错 100ms 作为可继承变量暴露', () => {
    expect(motionCss).toMatch(/--stagger-step:\s*100ms/);
  });

  it('hover 只动 transform（scale 走 token）+ 200ms，且不碰 box-shadow', () => {
    // 2026-09-24 修正：本条原来叫「hover 只做 scale(1.03)…」却只断言了两个字面量，
    // **没有**检查同期存在的 box-shadow 过渡 —— 即「用例名比断言强」。
    // 现在断言的正是当年漏掉的那一点（motion-web §3：box-shadow 的尺寸/位置禁止动画）。
    const block = /\.hover-lift\s*\{([\s\S]*?)\}/.exec(motionCss)?.[1] ?? '';
    expect(block, 'missing .hover-lift block').not.toBe('');
    expect(block).toMatch(/transition:\s*transform/);
    expect(block).not.toMatch(/box-shadow/);
    expect(motionCss).toMatch(/transform:\s*scale\(var\(--hover-scale\)\)/);
    expect(motionCss).toMatch(/--hover-duration:\s*200ms/);
  });

  it('提供 prefers-reduced-motion 降级块，并关闭动画与过渡', () => {
    const block =
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}\s*$/.exec(motionCss)?.[1] ??
      '';
    expect(block, 'missing prefers-reduced-motion block').not.toBe('');
    expect(block).toMatch(/animation-duration:\s*0\.01ms|animation:\s*none/);
    expect(block).toMatch(/transition-duration:\s*0\.01ms|transition:\s*none/);
    // 降级后只允许 opacity 淡入（150ms），不得保留位移
    expect(block).toMatch(/opacity/);
  });
});
