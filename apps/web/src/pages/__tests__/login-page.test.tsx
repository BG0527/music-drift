import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { USER_A } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { LoginPage } from '../login-page';

const SESSION = {
  user: { id: USER_A, handle: '午夜歌手', email: 'a@example.com', role: 'USER' },
  expiresAt: '2026-10-23T00:00:00.000Z',
};

function errorBody(message: string, code?: string) {
  return {
    error: {
      message,
      violations: code === undefined ? [] : [{ code, message }],
    },
  };
}

/**
 * 登录 / 注册页（Figma `login-anonymous` 只贡献 IA 与文案，视觉一律按 DESIGN.md）。
 * 关键在错误处理：**字段级错误落到字段上，凭证错误落到表单级**，都给出可照做的修正动作。
 */
describe('登录 / 注册页', () => {
  it('默认是登录表单，可切到注册；两套字段都有 label 关联', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByRole('tab', { name: '登录' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('邮箱')).toBeInTheDocument();
    expect(screen.getByLabelText('口令')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '注册' }));
    expect(screen.getByLabelText('用户名')).toBeInTheDocument();
    expect(screen.getByLabelText('邮箱')).toBeInTheDocument();
  });

  it('登录成功后被带到 next 指定的站内页面（不是每次都回首页）', async () => {
    const { fetchMock } = renderWithProviders(<LoginPage />, {
      route: '/login?next=%2Fbottles%2Fabc',
      handlers: [
        {
          method: 'POST',
          path: '/api/auth/login',
          respond: () => ({ status: 200, body: SESSION }),
        },
      ],
    });
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('口令'), { target: { value: 'abcd1234' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/bottles/abc');
    });
    expect(fetchMock.calls.some((call) => call.url === '/api/auth/login')).toBe(true);
  });

  it('凭证错误（401）在表单级提示，并留在原地（不跳转、不区分账号不存在）', async () => {
    renderWithProviders(<LoginPage />, {
      route: '/login',
      handlers: [
        {
          method: 'POST',
          path: '/api/auth/login',
          respond: () => ({
            status: 401,
            body: errorBody('账号或口令不正确。', 'INVALID_CREDENTIALS'),
          }),
        },
      ],
    });
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('口令'), { target: { value: 'wrongpass1' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('账号或口令不正确。');
    expect(window.location.pathname).toBe('/login');
  });

  it('注册时邮箱已占用（409）落到邮箱字段上（aria-invalid + 修正动作）', async () => {
    renderWithProviders(<LoginPage />, {
      route: '/login',
      handlers: [
        {
          method: 'POST',
          path: '/api/auth/register',
          respond: () => ({
            status: 409,
            body: errorBody('这个邮箱已经注册过了，直接登录试试？', 'EMAIL_TAKEN'),
          }),
        },
      ],
    });
    fireEvent.click(screen.getByRole('tab', { name: '注册' }));
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: '午夜歌手' } });
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('口令'), { target: { value: 'abcd1234' } });
    fireEvent.click(screen.getByRole('button', { name: '注册并进入' }));

    await waitFor(() => {
      expect(screen.getByLabelText('邮箱')).toHaveAttribute('aria-invalid', 'true');
    });
    expect(screen.getByText('这个邮箱已经注册过了，直接登录试试？')).toBeInTheDocument();
  });

  it('口令太弱（422 WEAK_PASSWORD）落到口令字段上', async () => {
    renderWithProviders(<LoginPage />, {
      route: '/login',
      handlers: [
        {
          method: 'POST',
          path: '/api/auth/register',
          respond: () => ({
            status: 422,
            body: errorBody('口令太弱了：至少 8 位，且要同时包含字母和数字。', 'WEAK_PASSWORD'),
          }),
        },
      ],
    });
    fireEvent.click(screen.getByRole('tab', { name: '注册' }));
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: '午夜歌手' } });
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('口令'), { target: { value: 'aaaaaaaa' } });
    fireEvent.click(screen.getByRole('button', { name: '注册并进入' }));

    await waitFor(() => {
      expect(screen.getByLabelText('口令')).toHaveAttribute('aria-invalid', 'true');
    });
  });
});
