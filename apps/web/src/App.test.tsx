import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App shell (S0 placeholder)', () => {
  it('renders the level-1 heading', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('音乐漂流瓶');
  });
});
