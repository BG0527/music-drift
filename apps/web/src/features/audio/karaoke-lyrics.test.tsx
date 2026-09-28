import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KaraokeLyrics } from './karaoke-lyrics';

const LINES = [
  { text: '潮声把夜色轻轻推远', startMs: 0, endMs: 8_000 },
  { text: '我沿着微光慢慢向前', startMs: 8_000, endMs: 16_000 },
  { text: '让这一句落进水面', startMs: 16_000, endMs: 24_000 },
  { text: '风从旧码头带来回响', startMs: 24_000, endMs: 32_000 },
] as const;

describe('KaraokeLyrics', () => {
  it('用传入的真实媒体 currentTime 选择当前歌词行', () => {
    const { rerender } = render(<KaraokeLyrics currentTime={9} lines={LINES} />);

    expect(screen.getByText('我沿着微光慢慢向前')).toHaveAttribute('aria-current', 'true');

    rerender(<KaraokeLyrics currentTime={16} lines={LINES} />);
    expect(screen.getByText('让这一句落进水面')).toHaveAttribute('aria-current', 'true');
  });

  it('按当前句时间窗把进度从左到右映射到每个字', () => {
    render(<KaraokeLyrics currentTime={12} lines={LINES} />);

    const current = screen.getByTestId('karaoke-current-line');
    expect(current).toHaveAttribute('data-progress', '0.500');
    const characters = current.querySelectorAll<HTMLElement>('[data-karaoke-character]');
    expect(characters.length).toBe(Array.from('我沿着微光慢慢向前').length);
    expect(characters[0]?.style.opacity).toBe('1');
    expect(characters[characters.length - 1]?.style.opacity).toBe('0');
  });

  it('视窗只保留上一行、当前行和下一行', () => {
    render(<KaraokeLyrics currentTime={9} lines={LINES} />);

    expect(screen.getByText('潮声把夜色轻轻推远')).toBeInTheDocument();
    expect(screen.getByText('我沿着微光慢慢向前')).toBeInTheDocument();
    expect(screen.getByText('让这一句落进水面')).toBeInTheDocument();
    expect(screen.queryByText('风从旧码头带来回响')).not.toBeInTheDocument();
  });

  it('reduced-motion 可声明为即时切换，同时保留当前行和文字进度', () => {
    render(<KaraokeLyrics currentTime={12} lines={LINES} reducedMotion />);

    const current = screen.getByTestId('karaoke-current-line');
    expect(current.className).toContain('transition-none');
    expect(current.className).not.toContain('transition-[transform,opacity]');
    expect(current).toHaveAttribute('data-progress', '0.500');
    for (const character of current.querySelectorAll<HTMLElement>('[data-karaoke-character]')) {
      expect(character.className).toContain('transition-none');
    }
  });
});
