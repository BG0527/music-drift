import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/harness';
import { ApiError } from '../api/client';
import { ConflictNotice } from './conflict-notice';

/**
 * DESIGN.md §Error States 第 3 条：**409 接力冲突必须解释「这段已被接走」并给两个出口动作**，
 * 不许静默失败或只弹一个 toast。
 */
describe('接力冲突提示（409）', () => {
  it('说明发生了什么，并给出两个出口动作（换一段 / 看日志）', () => {
    const error = new ApiError({
      status: 409,
      code: 'HOLDING_ALREADY_TAKEN',
      message: '这个漂流瓶已经被别人拿走了，换一个吧。',
    });
    renderWithProviders(
      <ConflictNotice error={error} bottleId="8f1d6c2e-0f1a-4a1e-9f2b-666666666666" />,
    );

    expect(screen.getByText(/已被别人接走/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '换一段继续' })).toHaveAttribute('href', '/river');
    expect(screen.getByRole('link', { name: '看一眼漂流日志' })).toHaveAttribute(
      'href',
      '/bottles/8f1d6c2e-0f1a-4a1e-9f2b-666666666666/log',
    );
    // 有非颜色信号（图标 + 文案），不只靠颜色
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('河道空（409 NO_BOTTLE_AVAILABLE）给「再捞一次」与「去公海」', () => {
    const error = new ApiError({
      status: 409,
      code: 'NO_BOTTLE_AVAILABLE',
      message: '河道里暂时没有可以捞的瓶子。',
    });
    renderWithProviders(<ConflictNotice error={error} onRetry={() => undefined} />);
    expect(screen.getByRole('button', { name: '再捞一次' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '去公海大厅' })).toHaveAttribute('href', '/sea');
  });

  it('规则违反（422）用服务端中文文案，并说明「录音还在本机」', () => {
    const error = new ApiError({
      status: 422,
      code: 'AUDIO_DURATION_OUT_OF_RANGE',
      message: '每段录音需在 15–30 秒之间，请重新录制。',
    });
    renderWithProviders(<ConflictNotice error={error} />);
    expect(screen.getByText('每段录音需在 15–30 秒之间，请重新录制。')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('本机');
  });
});
