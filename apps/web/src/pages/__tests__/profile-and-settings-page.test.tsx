import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BOTTLE_ID, USER_A, bottleSummary } from '../../test/fixtures';
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
  it('显示账号身份，但**不显示任何匿名代号**（用户裁决：系统里不存在"你的代号"）', async () => {
    renderWithProviders(<ProfilePage />, { route: '/me', handlers: authedHandlers() });
    expect(await screen.findByText('午夜歌手')).toBeInTheDocument();
    expect(screen.getByText('a@example.com')).toBeInTheDocument();
    // 代号是"每瓶一个"（CONTEXT §12.1），个人中心不该出现这一块
    expect(screen.queryByText('你的匿名代号')).not.toBeInTheDocument();
    expect(screen.queryByText('午夜歌手#042')).not.toBeInTheDocument();
  });

  it('「通知」区块把三类写入的消息呈现成可读文案（未送达 / 已完成）', async () => {
    const bottleId = '8f1d6c2e-0f1a-4a1e-9f2b-aaaaaaaaaaaa';
    renderWithProviders(<ProfilePage />, {
      route: '/me',
      handlers: [
        ...authedHandlers(),
        {
          path: /\/api\/notifications/,
          respond: () => ({
            body: {
              items: [
                {
                  id: '11111111-1111-4111-8111-111111111111',
                  type: 'MESSAGE_UNDELIVERED',
                  payload: { bottleId, messageId: '22222222-2222-4222-8222-222222222222' },
                  readAt: null,
                  createdAt: '2026-09-23T02:00:00.000Z',
                },
                {
                  id: '33333333-3333-4333-8333-333333333333',
                  type: 'BOTTLE_COMPLETED',
                  payload: { bottleId, songTitle: '深海鲸落', isComplete: true },
                  readAt: '2026-09-23T03:00:00.000Z',
                  createdAt: '2026-09-23T03:00:00.000Z',
                },
              ],
              nextCursor: null,
            },
          }),
        },
      ],
    });
    expect(await screen.findByText('你的留言未送达')).toBeInTheDocument();
    expect(screen.getByText(/深海鲸落/)).toBeInTheDocument();
    expect(screen.getByText('未读')).toBeInTheDocument();
    expect(screen.getByText('已读')).toBeInTheDocument();
  });

  it('「我参与过的漂流瓶」来自服务端（不再有"本机记录"这种说法）', async () => {
    renderWithProviders(<ProfilePage />, {
      route: '/me',
      handlers: [
        ...authedHandlers(),
        {
          path: /\/api\/me\/bottles/,
          respond: () => ({
            body: {
              items: [
                {
                  ...bottleSummary({ status: 'IN_RIVER', seaZone: null, isComplete: false }),
                  role: 'SINGER',
                  mySegmentIndexes: [2],
                },
              ],
              nextCursor: null,
            },
          }),
        },
      ],
    });

    expect(await screen.findByText('我参与过的漂流瓶')).toBeInTheDocument();
    // 标题先渲染、数据后到：行内容必须用 findBy* 等（同步 getBy* 会撞上骨架态）
    expect(await screen.findByText('我接唱的')).toBeInTheDocument();
    expect(screen.getByText('深海鲸落')).toBeInTheDocument();
    // 换了服务端口径之后，不能再出现"本机记录 / 换浏览器看不到"这类临时态说法
    expect(screen.queryByText(/本机记录/)).not.toBeInTheDocument();
    expect(screen.queryByText(/这台设备参与过的瓶子/)).not.toBeInTheDocument();
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

/**
 * 收藏 / 徽章的入口在「我的」里（§46.2：属于声明式/次要内容 ⇒ 入口 + 弹窗，不摊在首屏）。
 */
describe('我的：收藏与徽章入口', () => {
  it('两个入口都在，点开各自弹出对应面板', async () => {
    renderWithProviders(<ProfilePage />, {
      handlers: [
        ...authedHandlers(),
        { path: '/api/me/collections', respond: () => ({ body: [] }) },
        { path: '/api/me/badges', respond: () => ({ body: [] }) },
        { path: '/api/me/notifications', respond: () => ({ body: { items: [], nextCursor: null } }) },
        { path: '/api/me/bottles', respond: () => ({ body: { items: [], nextCursor: null } }) },
      ],
    });

    fireEvent.click(await screen.findByRole('button', { name: '我的收藏' }));
    expect(await screen.findByRole('heading', { name: '我的收藏' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '我的徽章' }));
    expect(await screen.findByRole('heading', { name: '我的徽章' })).toBeInTheDocument();
  });
});
