import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 集成契约守卫 —— 记的是**真实踩过的坑**，不是设想：
 *
 * 1. `@tailwindcss/vite` 必须注册在 vite.config.ts 里。缺了它，`@import 'tailwindcss'`
 *    不会展开 utilities → 构建产物 212KB CSS 里**一个 utility 都没有**，组件全部无样式，
 *    但单元测试（断言类名字符串）仍然全绿。这个坑在 T3.1 实际发生过一次。
 * 2. 依赖必须走 catalog（AGENTS.md §7：版本唯一来源）。
 * 3. `DESIGN.md` 与本任务的 amend 必须同时存在（Use Case 行 + 8 个 tint/border token）。
 */
const webRoot = process.cwd();
const repoRoot = resolve(webRoot, '..', '..');
const readWeb = (name: string): string => readFileSync(resolve(webRoot, name), 'utf8');

const viteConfig = readWeb('vite.config.ts');
const webPkg = JSON.parse(readWeb('package.json')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const designMd = readFileSync(resolve(repoRoot, 'DESIGN.md'), 'utf8');

describe('Tailwind v4 接入契约（防止 utility 静默不生成）', () => {
  it('vite.config.ts 注册了 @tailwindcss/vite 插件', () => {
    expect(viteConfig).toMatch(/@tailwindcss\/vite/);
    expect(viteConfig).toMatch(/plugins:\s*\[[^\]]*tailwindcss\(\)/);
  });

  it('tailwindcss 与插件都走 catalog 且是构建期依赖', () => {
    expect(webPkg.devDependencies['tailwindcss']).toBe('catalog:');
    expect(webPkg.devDependencies['@tailwindcss/vite']).toBe('catalog:');
  });

  it('样式入口先引入 tailwind 本体', () => {
    const indexCss = readWeb('src/design-system/index.css');
    expect(indexCss).toMatch(/fonts\.css/);
    expect(indexCss).toMatch(/theme\.css/);
    expect(indexCss).toMatch(/motion\.css/);
    expect(readWeb('src/design-system/theme.css')).toMatch(/@import\s+'tailwindcss'/);
  });

  it('运行时依赖（图标 / 字体）也走 catalog', () => {
    for (const dep of ['lucide-react', 'lxgw-wenkai-webfont', '@fontsource/quattrocento']) {
      expect(webPkg.dependencies[dep]).toBe('catalog:');
    }
  });

  it('应用入口加载了设计系统样式（否则页面无 token）', () => {
    expect(readWeb('src/main.tsx')).toMatch(/design-system\/index\.css/);
  });
});

describe('DESIGN.md 的 t10 amend 已落地（跨文档契约）', () => {
  it('front matter 含 8 个语义 tint / border token', () => {
    for (const token of [
      'success-tint',
      'success-border',
      'warning-tint',
      'warning-border',
      'danger-tint',
      'danger-border',
      'info-tint',
      'info-border',
    ]) {
      expect(designMd, `DESIGN.md 缺少 ${token}`).toMatch(
        new RegExp(`^\\s{2}${token}:\\s*"#[0-9A-Fa-f]{6}"`, 'm'),
      );
    }
  });

  it('Use Case 已改为「桌面为主要场景 + 移动端可用性适配」且不再自称移动优先 H5', () => {
    expect(designMd).toMatch(/桌面为主要场景的 Web 应用/);
    expect(designMd).not.toMatch(/移动优先 H5 应用/);
  });

  it('核心纪律未被 amend 改动（抽样：8px、12px 圆角、spring 120/20、480ms、z-index 契约）', () => {
    for (const line of [
      'Base unit: 0.5rem (8px)',
      'Base corner radius: 12px',
      'stiffness 120, damping 20',
      'over 480ms ease-out',
      'base (0) / sticky-nav (100) / overlay (200) / modal (300) / toast (500)',
      'Max-width containment: 1280px centered with 1.5rem side padding',
    ]) {
      expect(designMd, `核心纪律被改动：${line}`).toContain(line);
    }
  });
});
