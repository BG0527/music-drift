import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResolutionModal } from './resolution-modal';

describe('去向三选一（模态）', () => {
  const available = ['RIVER', 'RETURN', 'SEA'] as const;

  it('三张选择卡由服务端给的可选值决定（不可选的不出现）', () => {
    render(
      <ResolutionModal
        open
        available={['SEA']}
        onCancel={() => undefined}
        onConfirm={() => undefined}
        stageLabel="接力第 2 棒 · 第 2 段已录好"
      />,
    );
    expect(screen.getByRole('button', { name: /入海/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /继续投河/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /回传/ })).not.toBeInTheDocument();
  });

  it('没选去向时「确认投递」禁用（不给用户点一下才知道）', () => {
    render(
      <ResolutionModal
        open
        available={available}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: '确认投递' })).toBeDisabled();
  });

  it('选中后确认，把选择交给上层', () => {
    const onConfirm = vi.fn();
    render(
      <ResolutionModal
        open
        available={available}
        onCancel={() => undefined}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /继续投河/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认投递' }));
    expect(onConfirm).toHaveBeenCalledWith('RIVER');
  });

  it('发起者第一次投河走「确认投河」的口径（说清交出去意味着什么）', () => {
    render(
      <ResolutionModal
        open
        stage="FIRST_CAST"
        available={['RIVER', 'SEA']}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );
    expect(screen.getByRole('heading', { name: '确认投河' })).toBeInTheDocument();
    expect(screen.getByText(/只有下一位捞到的人能听到它/)).toBeInTheDocument();
  });

  it('取消并返回不产生任何去向', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ResolutionModal open available={available} onCancel={onCancel} onConfirm={onConfirm} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '取消并返回' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
