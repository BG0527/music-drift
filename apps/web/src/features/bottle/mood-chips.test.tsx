/**
 * 心情标签单测（用户第十三轮 ①）。
 *
 * 钉住三件事，缺一条这条特性就会变成"看起来在筛选但什么都没发生"的假功能：
 * 1. **点了有视觉反馈**（`aria-pressed` 切换 + 过渡类名），但**不改任何列表/URL**（无实质功能）；
 * 2. **文案如实**：明说"只作展示、不会筛选"；
 * 3. **动效参数来自契约 token**（`motion-web` §2/§8）：过渡的时长与缓动必须写成 `var(--motion-…)`，
 *    不许内联新数值 —— 这条用类名断言钉住（jsdom 算不出 var，但"引用了 token"是可断言的契约）。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MoodChips } from './mood-chips';

/** 五个标签的字面量（不 import 常量：那样"文案变了测试也跟着变"，断言会失去意义）。 */
const LABELS = ['全部', '深夜', '通勤', '告白', '雨天'];

describe('心情标签', () => {
  it('5 个标签都在，默认选中「全部」（aria-pressed 表达选中，不只靠颜色）', () => {
    render(<MoodChips />);

    expect(screen.getAllByRole('button')).toHaveLength(LABELS.length);
    for (const label of LABELS) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '深夜' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('点击切换选中态（视觉反馈）', () => {
    render(<MoodChips />);

    fireEvent.click(screen.getByRole('button', { name: '雨天' }));

    expect(screen.getByRole('button', { name: '雨天' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('如实说明"只作展示、不筛选"（不暗示它真的在筛选）', () => {
    render(<MoodChips />);

    expect(screen.getByText(/只作展示/)).toBeInTheDocument();
    expect(screen.getByText(/不会筛选/)).toBeInTheDocument();
  });

  it('动效参数引用契约 token（不内联新数值）', () => {
    render(<MoodChips />);
    const chip = screen.getByRole('button', { name: '全部' });

    expect(chip.className).toContain('duration-[var(--motion-hover-duration)]');
    expect(chip.className).toContain('ease-[var(--motion-entry-easing)]');
    expect(chip.className).toContain('scale-[var(--motion-hover-scale)]');
    // 只动 transform/opacity：不出现 width/height/top/left 之类的过渡
    expect(chip.className).not.toMatch(/transition-(all|colors|shadow|width|height)/);
  });

  it('点击不改 URL（它是展示件，不是筛选器）', () => {
    window.history.replaceState({}, '', '/river');
    render(<MoodChips />);

    fireEvent.click(screen.getByRole('button', { name: '通勤' }));

    expect(window.location.pathname).toBe('/river');
    expect(window.location.search).toBe('');
  });
});
