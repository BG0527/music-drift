import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../features/api/client';
import { AsyncBoundary } from './async-boundary';

/** 取数的三种非成功状态都必须有专门界面：加载（骨架）/ 失败（可读文案 + 重试）/ 空（中性空态）。 */
describe('取数三态（骨架 / 错误 / 空态）', () => {
  it('加载中显示骨架屏，且不显示 spinner（DESIGN.md 禁 spinner）', () => {
    const { container } = render(
      <AsyncBoundary
        query={{ isPending: true, isError: false, error: null, refetch: () => undefined }}
      >
        {() => <p>内容</p>}
      </AsyncBoundary>,
    );
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.innerHTML).not.toContain('animate-spin');
    expect(screen.queryByText('内容')).not.toBeInTheDocument();
  });

  it('失败时给出中文文案与重试入口（不是空白页）', () => {
    const refetch = vi.fn();
    render(
      <AsyncBoundary
        query={{
          isPending: false,
          isError: true,
          error: new ApiError({
            status: 503,
            code: null,
            message: '服务器出了点问题，请稍后再试。',
          }),
          refetch,
        }}
      >
        {() => <p>内容</p>}
      </AsyncBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('服务器暂时不可用');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('没有数据时用空态（中性色），不把空当成错误', () => {
    render(
      <AsyncBoundary
        query={{
          isPending: false,
          isError: false,
          error: null,
          data: [],
          refetch: () => undefined,
        }}
        emptyWhen={(items: string[]) => items.length === 0}
        empty={<p>还没有内容</p>}
      >
        {(items: string[]) => <p>{items.join(',')}</p>}
      </AsyncBoundary>,
    );
    expect(screen.getByText('还没有内容')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('有数据时把契约数据交给子节点渲染', () => {
    render(
      <AsyncBoundary
        query={{
          isPending: false,
          isError: false,
          error: null,
          data: ['深海鲸落'],
          refetch: () => undefined,
        }}
      >
        {(items: string[]) => <p>曲库：{items.join('、')}</p>}
      </AsyncBoundary>,
    );
    expect(screen.getByText('曲库：深海鲸落')).toBeInTheDocument();
  });
});
