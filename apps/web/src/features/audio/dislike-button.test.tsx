/**
 * `DislikeButton` 单测：把「听满 80% 才能点踩」变成**界面上可解释的禁用**，而不是一个灰按钮。
 *
 * DESIGN.md 的硬要求：
 * - 禁用不能是"唯一的不可用提示"（必须同时有文案）；
 * - 语义色必须同时给"图标 + 文案"，不能只靠颜色；
 * - 触控目标 ≥44px；
 * - 纯图标按钮必须带 `aria-label`，禁用态要能被读屏解释（`aria-describedby` 指向原因）。
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { describeDislikeAvailability } from '@music-drift/shared/audio';
import { DislikeButton } from './dislike-button';

const blocked = describeDislikeAvailability({ ratio: 0.799, durationMs: 20_000 });
const allowed = describeDislikeAvailability({ ratio: 0.8, durationMs: 20_000 });
const ownSegment = describeDislikeAvailability({
  ratio: 1,
  durationMs: 20_000,
  isOwnSegment: true,
});

describe('DislikeButton', () => {
  it('未听满 80%：按钮不可点，并把原因文字与按钮用 aria-describedby 关联', () => {
    render(<DislikeButton availability={blocked} onCast={vi.fn()} />);

    const button = screen.getByRole('button', { name: /点踩/ });
    expect(button).toBeDisabled();
    expect(button.className).toMatch(/min-h-11/);

    const reasonId = button.getAttribute('aria-describedby');
    expect(reasonId).toBeTruthy();
    const reason = document.getElementById(reasonId ?? '');
    expect(reason?.textContent).toContain('80%');
    expect(reason?.textContent).toContain('还需');
  });

  it('原因文字用 warning 语义色 + 图标（不是只靠颜色）', () => {
    render(<DislikeButton availability={blocked} onCast={vi.fn()} />);

    const reason = screen.getByRole('status');
    expect(reason.className).toMatch(/text-warning/);
    expect(reason.querySelector('svg')).not.toBeNull();
  });

  it('听满 80%：可以点踩，且不再显示原因文案', () => {
    const onCast = vi.fn();
    render(<DislikeButton availability={allowed} onCast={onCast} />);

    const button = screen.getByRole('button', { name: /点踩/ });
    expect(button).toBeEnabled();
    expect(button.getAttribute('aria-describedby')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.click(button);
    expect(onCast).toHaveBeenCalledTimes(1);
  });

  it('自己的段：文案是内核那句"不能踩自己的段。"，且不可点', () => {
    render(<DislikeButton availability={ownSegment} onCast={vi.fn()} />);

    expect(screen.getByRole('button', { name: /点踩/ })).toBeDisabled();
    expect(screen.getByRole('status').textContent).toBe('不能踩自己的段。');
  });

  it('提交中：不可重复点，且 aria-busy 让读屏知道在处理', () => {
    render(<DislikeButton availability={allowed} onCast={vi.fn()} casting />);

    const button = screen.getByRole('button', { name: /点踩/ });
    expect(button).toBeDisabled();
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('无法点踩时点击不触发回调（不能靠"点了再报错"）', () => {
    const onCast = vi.fn();
    render(<DislikeButton availability={blocked} onCast={onCast} />);

    fireEvent.click(screen.getByRole('button', { name: /点踩/ }));

    expect(onCast).not.toHaveBeenCalled();
  });
});
