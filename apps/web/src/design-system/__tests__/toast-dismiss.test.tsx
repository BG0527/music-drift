import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Toast } from '../toast';

afterEach(() => vi.useRealTimers());

it('父组件重新渲染不会延长成功提示的停留时间', () => {
  vi.useFakeTimers();
  const view = render(<Toast tone="success" message="已完成" onDismiss={() => undefined} />);
  act(() => vi.advanceTimersByTime(2000));
  view.rerender(<Toast tone="success" message="已完成" onDismiss={() => undefined} />);
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByText('已完成')).not.toBeInTheDocument();
});

it('成功提示显示三秒后消失，新消息重新显示；错误持续显示', () => {
  vi.useFakeTimers();
  const view = render(<Toast tone="success" message="已记录你的赞" />);
  expect(screen.getByText('已记录你的赞')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(3000));
  expect(screen.queryByText('已记录你的赞')).not.toBeInTheDocument();
  view.rerender(<Toast tone="success" message="已投河" />);
  expect(screen.getByText('已投河')).toBeInTheDocument();
  view.rerender(<Toast tone="danger" message="请重试" />);
  act(() => vi.advanceTimersByTime(10000));
  expect(screen.getByText('请重试')).toBeInTheDocument();
});
