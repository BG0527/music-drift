import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Showcase } from '../showcase/Showcase';

const dsDir = resolve(process.cwd(), 'src', 'design-system');

describe('组件展示页（开发用）', () => {
  it('渲染全部 10 类基础组件且不抛错', () => {
    render(<Showcase />);
    expect(screen.getByTestId('showcase')).toBeInTheDocument();
    // 导航：桌面侧栏 + 移动底栏同时存在（由断点类切换显隐）
    expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '底部导航' })).toBeInTheDocument();
    // 表单 / 标签 / 模态 / 空态 / 状态提示
    expect(screen.getByLabelText('接力代号')).toBeInTheDocument();
    expect(screen.getAllByRole('tab').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByRole('status').length).toBe(4);
    expect(screen.getByText('这一段河道暂时安静')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('设计系统展示');
  });

  it('页面外壳用 min-h-[100dvh]，不使用 h-screen', () => {
    const { container } = render(<Showcase />);
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toMatch(/min-h-\[100dvh\]/);
    expect(shell.outerHTML).not.toMatch(/h-screen/);
  });

  it('主内容区受 1280px 容器约束（窄屏不得出现固定超宽元素）', () => {
    render(<Showcase />);
    const main = screen.getByTestId('showcase');
    expect(main.className).toMatch(/max-w-\[var\(--container-max-width\)\]/);
  });

  it('展示页已是 record-v1 的活文档：六个装置都有展位，且旧版文案已清', () => {
    const { container } = render(<Showcase />);
    for (const device of ['platter', 'glint', 'groove', 'waterline', 'ripple', 'bottleMark']) {
      expect(
        container.querySelector(`[data-motif="${device}"]`),
        `展示页没有 ${device} 装置`,
      ).not.toBeNull();
    }
    expect(container.innerHTML, '旧版文案 Ocean Drift 还在').not.toContain('Ocean Drift');
    // 展示页必须把「圆盘 + 外环」和「coral 填充 + ink 字」的主 CTA 都露出来
    expect(container.querySelector('[data-demo="disc-button"]')).not.toBeNull();
    expect(container.querySelector('[data-demo="disc-rings-3"]')).not.toBeNull();
  });
});

describe('横向溢出守卫（375px 可用性底线）', () => {
  const files = readdirSync(dsDir, { recursive: true, encoding: 'utf8' })
    .map((entry) => String(entry).replaceAll('\\', '/'))
    .filter((entry) => /\.(tsx|ts|css)$/.test(entry) && !entry.includes('__tests__'));

  it('设计系统源码不得出现 ≥400px 的固定宽度（只允许 max-w 约束）', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(join(dsDir, file), 'utf8');
      for (const match of text.matchAll(/(?<!\w)(?<!max-)(w|min-w)-\[(\d{3,})px\]/g)) {
        const width = Number(match[2]);
        if (width >= 400) offenders.push(`${file}: ${match[0]}`);
      }
    }
    expect(offenders, `固定宽度会撑破 375px：${offenders.join(' | ')}`).toEqual([]);
  });

  it('不得使用 overflow-x-hidden 掩盖溢出（掩盖 ≠ 解决）', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(join(dsDir, file), 'utf8');
      if (/overflow-x-hidden/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
