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
 * 登录 / 注册页（Figma `login-anonymous` 只贡献 IA 与文案，视觉一律按 record-v1）。
 *
 * 三条口径写在这里，谁改都会红：
 * 1. **登录与注册都只用两项：账号 · 密码**（用户裁决；**界面与请求体都不再出现邮箱**）；
 * 2. **请求体与契约对齐**：登录 = `{ account, password }`（`LoginRequestSchema`）、
 *    注册 = `{ account, password }`（`RegisterRequestSchema` 的正名 `account`，
 *    **不发 `handle` 别名、不发 `email`** —— 后端 refine 见 account 即通过）；
 * 3. **label 措辞逐字沿用设计稿** `docs/ui-review/design-explore/p-login-record.html`
 *    （「账号」「密码」、提示语「登录和注册都只用这两项：账号、密码。」）。
 *
 * 错误处理：**字段级错误落到字段上**（HANDLE_TAKEN → 账号、WEAK_PASSWORD → 密码），
 * **无字段可落的错误落到表单级**（凭证错误、结构错误、网络，以及已无邮箱字段的 EMAIL_TAKEN）。
 * AUTH_ERROR_CODES 的中文文案照常显示，不回退。
 */
describe('登录 / 注册页', () => {
  it('登录与注册都只有两项：账号 · 密码（**任何档位都没有邮箱框**）', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByRole('tab', { name: '登录' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('账号')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    // 用户裁决：界面不再出现邮箱
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '注册' }));
    expect(screen.getByLabelText('账号')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument();
  });

  it('账号框是 text（不是 email）且 autoComplete = username / current-password', () => {
    renderWithProviders(<LoginPage />);
    const account = screen.getByLabelText('账号');
    expect(account).toHaveAttribute('type', 'text');
    expect(account).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('密码')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('提示语与设计稿逐字一致：登录和注册都只用这两项：账号、密码。', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByText('登录和注册都只用这两项：账号、密码。')).toBeInTheDocument();
  });

  it('登录成功后被带到 next 指定的站内页面，请求体是 {account, password}', async () => {
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
    fireEvent.change(screen.getByLabelText('账号'), { target: { value: '午夜歌手' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'abcd1234' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/bottles/abc');
    });
    expect(fetchMock.calls.some((call) => call.url === '/api/auth/login')).toBe(true);
    // 契约正名：账号这一格进的是 account 位，不再伪装成 email
    const loginCall = fetchMock.calls.find((call) => call.url === '/api/auth/login');
    expect(loginCall?.body).toEqual({ account: '午夜歌手', password: 'abcd1234' });
  });

  it('注册请求体是 {account, password}：不发 handle 别名、不发 email', async () => {
    const { fetchMock } = renderWithProviders(<LoginPage />, {
      route: '/login',
      handlers: [
        {
          method: 'POST',
          path: '/api/auth/register',
          respond: () => ({ status: 201, body: SESSION }),
        },
      ],
    });
    fireEvent.click(screen.getByRole('tab', { name: '注册' }));
    fireEvent.change(screen.getByLabelText('账号'), { target: { value: '午夜歌手' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'abcd1234' } });
    fireEvent.click(screen.getByRole('button', { name: '注册并进入' }));

    await waitFor(() => {
      expect(fetchMock.calls.some((call) => call.url === '/api/auth/register')).toBe(true);
    });
    const registerCall = fetchMock.calls.find((call) => call.url === '/api/auth/register');
    expect(registerCall?.body).toEqual({ account: '午夜歌手', password: 'abcd1234' });
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
            body: errorBody('账号或密码不正确。', 'INVALID_CREDENTIALS'),
          }),
        },
      ],
    });
    fireEvent.change(screen.getByLabelText('账号'), { target: { value: '午夜歌手' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'wrongpass1' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('账号或密码不正确。');
    expect(window.location.pathname).toBe('/login');
  });

  it('注册时账号已被占用（409 HANDLE_TAKEN）落到**账号**字段上（aria-invalid + 修正动作）', async () => {
    renderWithProviders(<LoginPage />, {
      route: '/login',
      handlers: [
        {
          method: 'POST',
          path: '/api/auth/register',
          respond: () => ({
            status: 409,
            body: errorBody('这个名字已经有人用了，换一个吧。', 'HANDLE_TAKEN'),
          }),
        },
      ],
    });
    fireEvent.click(screen.getByRole('tab', { name: '注册' }));
    fireEvent.change(screen.getByLabelText('账号'), { target: { value: '午夜歌手' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'abcd1234' } });
    fireEvent.click(screen.getByRole('button', { name: '注册并进入' }));

    await waitFor(() => {
      expect(screen.getByLabelText('账号')).toHaveAttribute('aria-invalid', 'true');
    });
    expect(screen.getByText('这个名字已经有人用了，换一个吧。')).toBeInTheDocument();
  });

  it('EMAIL_TAKEN（后端若仍回）落到**表单级**：页面已无邮箱字段可落，但文案不回退', async () => {
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
    fireEvent.change(screen.getByLabelText('账号'), { target: { value: '午夜歌手' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'abcd1234' } });
    fireEvent.click(screen.getByRole('button', { name: '注册并进入' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('这个邮箱已经注册过了，直接登录试试？');
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  it('密码太弱（422 WEAK_PASSWORD）落到**密码**字段上', async () => {
    renderWithProviders(<LoginPage />, {
      route: '/login',
      handlers: [
        {
          method: 'POST',
          path: '/api/auth/register',
          respond: () => ({
            status: 422,
            body: errorBody('密码太弱了：至少 8 位，且要同时包含字母和数字。', 'WEAK_PASSWORD'),
          }),
        },
      ],
    });
    fireEvent.click(screen.getByRole('tab', { name: '注册' }));
    fireEvent.change(screen.getByLabelText('账号'), { target: { value: '午夜歌手' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'aaaaaaaa' } });
    fireEvent.click(screen.getByRole('button', { name: '注册并进入' }));

    await waitFor(() => {
      expect(screen.getByLabelText('密码')).toHaveAttribute('aria-invalid', 'true');
    });
  });
});

/**
 * 登录页的装置是「**认领线**」（record-v1，`docs/impl-plan-record-v1.md` §5.1）：
 * **代号牌 → 线 → 线那头只露一角瓶口**。它在讲这条产品事实：线上那枚代号是别人看到的全部，
 * 线那头串着的瓶只有你认领得到（`CONTEXT.md` §12.1 + 账号只用于认领）。
 *
 * 机器判据里 `/login` 也不在路由表内，所以装置只能由这里钉住。
 */
describe('登录 · 认领线（代号牌 → 线 → 只露一角的瓶口）', () => {
  it('三个构件都在，且顺序是牌 → 线 → 瓶', () => {
    const { container } = renderWithProviders(<LoginPage />);
    const plate = container.querySelector('[data-device="claim-plate"]');
    const line = container.querySelector('[data-device="claim-line"]');
    const bottle = container.querySelector('[data-device="claim-bottle"]');

    expect(plate, '缺代号牌').not.toBeNull();
    expect(line, '缺认领线').not.toBeNull();
    expect(bottle, '缺线那头的瓶').not.toBeNull();
    expect(plate).toHaveTextContent('匿名代号');

    const follows = (a: Element, b: Element): boolean =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(plate as Element, line as Element), '牌子不在线的上游').toBe(true);
    expect(follows(line as Element, bottle as Element), '瓶子不在线的下游').toBe(true);
  });

  it('线那头**只露一角瓶口**：瓶被裁切容器包住（不是把一整只瓶画在页角）', () => {
    const { container } = renderWithProviders(<LoginPage />);
    const bottle = container.querySelector('[data-device="claim-bottle"]');
    expect(bottle, '缺线那头的瓶').not.toBeNull();
    expect(bottle?.closest('.overflow-hidden'), '瓶子没有被裁切 ⇒ 那不是「只露一角」').not.toBeNull();
  });

  it('整条认领线是装饰层：aria-hidden + 不吃指针事件（不挡表单）', () => {
    const { container } = renderWithProviders(<LoginPage />);
    const rail = container.querySelector('[data-device="claim-rail"]');
    expect(rail, '缺认领线整体').not.toBeNull();
    expect(rail?.getAttribute('aria-hidden')).toBe('true');
    expect(rail?.className).toContain('pointer-events-none');
  });

  it('线在讲什么，文案也说了（装饰不作为唯一信息载体）', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByText(/线上那枚代号，是别人在瓶里看到的全部/)).toBeInTheDocument();
  });

  it('已登录态：不再要求登录，给出直接去河道的出口', async () => {
    renderWithProviders(<LoginPage />, {
      route: '/login',
      handlers: [{ path: '/api/auth/me', respond: () => ({ body: SESSION }) }],
    });
    expect(await screen.findByText(/你已经登录为/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '直接去河道捞一个瓶子' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '注册' })).not.toBeInTheDocument();
  });
});
