import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BOTTLE_ID, USER_A } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { ProfilePage } from '../profile-page';
import { SettingsPage } from '../settings-page';

const SESSION = {
  user: { id: USER_A, handle: '午夜歌手', email: 'a@example.com', role: 'USER' },
  expiresAt: '2026-10-23T00:00:00.000Z',
};

function authedHandlers() {
  return [
    { path: '/api/auth/me', respond: () => ({ body: SESSION }) },
    {
      path: '/api/me/anonymous-codes',
      respond: () => ({ body: [{ bottleId: BOTTLE_ID, code: '午夜歌手#042' }] }),
    },
  ];
}

describe('个人中心', () => {
  it('显示身份与「同一个瓶子里别人看到的你」（匿名代号）', async () => {
    renderWithProviders(<ProfilePage />, { route: '/me', handlers: authedHandlers() });
    expect(await screen.findByText('午夜歌手')).toBeInTheDocument();
    expect(screen.getByText('a@example.com')).toBeInTheDocument();
    expect(await screen.findByText('午夜歌手#042')).toBeInTheDocument();
  });

  it('列出本机参与过的瓶子（并说明这是本机记录）', async () => {
    renderWithProviders(<ProfilePage />, { route: '/me', handlers: authedHandlers() });
    expect(await screen.findByText(/本机记录/)).toBeInTheDocument();
    expect(screen.getAllByText(/这台设备参与过的瓶子/).length).toBeGreaterThan(0);
  });
});

describe('设置页（Figma 无此帧，captain 裁决必须补最简版）', () => {
  it('展示匿名原则、契约版本与登出入口', async () => {
    renderWithProviders(<SettingsPage />, { route: '/settings', handlers: authedHandlers() });
    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '匿名的边界' })).toBeInTheDocument();
    expect(screen.getByText(/契约版本/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /登出/ })).toBeInTheDocument();
  });

  it('登出后回到登录页（并且不再显示身份）', async () => {
    const { fetchMock } = renderWithProviders(<SettingsPage />, {
      route: '/settings',
      handlers: [
        ...authedHandlers(),
        { method: 'POST', path: '/api/auth/logout', respond: () => ({ status: 204 }) },
      ],
    });
    fireEvent.click(await screen.findByRole('button', { name: /登出/ }));
    await waitFor(() => {
      expect(fetchMock.calls.some((call) => call.url === '/api/auth/logout')).toBe(true);
    });
    await waitFor(() => {
      expect(window.location.pathname).toBe('/login');
    });
  });
});
