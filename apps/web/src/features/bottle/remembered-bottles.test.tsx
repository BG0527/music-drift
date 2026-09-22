import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/harness';
import type { StoragePort } from '../profile/bottle-index';
import { RememberedBottles } from './remembered-bottles';

function storageWith(entries: unknown): StoragePort {
  return { getItem: () => JSON.stringify(entries), setItem: () => undefined };
}

describe('「这台设备参与过的瓶子」列表', () => {
  it('列出书签并链到瓶子页与漂流日志', () => {
    renderWithProviders(
      <RememberedBottles
        storage={storageWith([
          {
            id: '8f1d6c2e-0f1a-4a1e-9f2b-777777777777',
            songTitle: '深海鲸落',
            role: 'INITIATOR',
            lastSeenAt: '2026-09-23T02:00:00.000Z',
          },
        ])}
      />,
    );
    expect(screen.getByText('深海鲸落')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /深海鲸落/ })).toHaveAttribute(
      'href',
      '/bottles/8f1d6c2e-0f1a-4a1e-9f2b-777777777777',
    );
    expect(screen.getByRole('link', { name: '漂流日志' })).toHaveAttribute(
      'href',
      '/bottles/8f1d6c2e-0f1a-4a1e-9f2b-777777777777/log',
    );
    expect(screen.getByText(/我发起的/)).toBeInTheDocument();
  });

  it('没有书签时用空态（中性色 + 说明 + 行动），不显示成错误', () => {
    renderWithProviders(<RememberedBottles storage={storageWith([])} />);
    expect(screen.getByText(/还没有/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('如实说明这是本机记录（换浏览器看不到），不暗示成账号级数据', () => {
    renderWithProviders(<RememberedBottles storage={storageWith([])} />);
    expect(screen.getByText(/本机记录/)).toBeInTheDocument();
  });
});
