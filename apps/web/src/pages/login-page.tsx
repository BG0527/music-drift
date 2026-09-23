/**
 * 登录 / 注册（Figma `login-anonymous` 只贡献 IA 与文案：瓶 + 标题 + 一张卡 + 单一主行动）。
 *
 * 视觉一律按 `DESIGN.md`：恒浅底、peacock 主色、**不做外发光**（Figma 的双环泛光不复刻）。
 * 错误处理口径：
 * - `EMAIL_TAKEN` / `HANDLE_TAKEN` / `WEAK_PASSWORD` → **落到对应字段**（带修正动作）；
 * - 其余（凭证错误、结构错误、网络）→ **表单级**提示，并留在原地。
 */
import { useState, type FormEvent } from 'react';
import { ApiError } from '../features/api/client';
import { useLogin, useRegister } from '../features/api/mutations';
import { useSession } from '../features/session/session-context';
import { ConflictNotice } from '../features/bottle/conflict-notice';
import { BottleMark, Button, Card, Icon, Input, Tabs, WaveDivider } from '../design-system';
import { Link } from './shell/router';
import { useNavigate, useSearch } from './shell/router-context';
import { safeNextPath } from './shell/routes';
import { TEXT_LINK_STRONG } from './shell/link-styles';

type Mode = 'login' | 'register';

interface FieldErrors {
  handle?: string;
  email?: string;
  password?: string;
}

export function LoginPage() {
  const session = useSession();
  const navigate = useNavigate();
  const search = useSearch();
  const next = safeNextPath(search.get('next'));
  const [mode, setMode] = useState<Mode>('login');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<unknown>(null);

  const login = useLogin();
  const register = useRegister();
  const busy = login.isPending || register.isPending;

  function applyFailure(error: unknown): void {
    if (error instanceof ApiError) {
      if (error.code === 'EMAIL_TAKEN') {
        setFieldErrors({ email: error.message });
        return;
      }
      if (error.code === 'HANDLE_TAKEN') {
        setFieldErrors({ handle: error.message });
        return;
      }
      if (error.code === 'WEAK_PASSWORD') {
        setFieldErrors({ password: error.message });
        return;
      }
    }
    setFormError(error);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    try {
      if (mode === 'login') await login.mutateAsync({ email, password });
      else await register.mutateAsync({ handle, email, password });
      navigate(next);
    } catch (error) {
      applyFailure(error);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-wave-white px-6 py-12 text-abyss">
      <div className="mx-auto flex w-full max-w-[30rem] flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <BottleMark size={96} />
          <h1 className="text-[1.75rem] font-bold leading-tight md:text-[2.25rem]">
            每一段旋律，都在寻找下一个声音
          </h1>
          <p className="text-[1rem] leading-[1.6] text-slate-current">
            这是一个由歌声、回音和宿命组成的角落。你只录一段，剩下的交给漂流。
          </p>
        </div>

        <Card className="w-full">
          {session.status === 'authed' ? (
            <p role="status" className="flex flex-col gap-3 text-[0.9375rem] text-slate-current">
              <span>
                你已经登录为{' '}
                <strong className="font-semibold text-abyss">{session.user?.handle}</strong>
                ，不用再登录一次。
              </span>
              <Link to="/river" className={TEXT_LINK_STRONG}>
                直接去河道捞一个瓶子
              </Link>
            </p>
          ) : (
            <>
              <Tabs
                items={[
                  { key: 'login', label: '登录' },
                  { key: 'register', label: '注册' },
                ]}
                value={mode}
                onChange={(key) => {
                  setMode(key === 'register' ? 'register' : 'login');
                  setFieldErrors({});
                  setFormError(null);
                }}
              />

              <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
                {mode === 'register' ? (
                  <Input
                    label="用户名"
                    name="handle"
                    autoComplete="username"
                    value={handle}
                    onChange={(event) => {
                      setHandle(event.target.value);
                    }}
                    hint="2–32 个字符，别人看到的是每个瓶子里单独的匿名代号。"
                    {...(fieldErrors.handle === undefined ? {} : { error: fieldErrors.handle })}
                  />
                ) : null}

                <Input
                  label="邮箱"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                  }}
                  {...(fieldErrors.email === undefined ? {} : { error: fieldErrors.email })}
                />

                <Input
                  label="口令"
                  name="password"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                  }}
                  {...(mode === 'register' ? { hint: '至少 8 位，且要同时包含字母和数字。' } : {})}
                  {...(fieldErrors.password === undefined ? {} : { error: fieldErrors.password })}
                />

                {formError === null ? null : <ConflictNotice error={formError} />}

                <Button
                  type="submit"
                  variant="primary"
                  loading={busy}
                  icon={<Icon name={mode === 'login' ? 'LogIn' : 'UserPlus'} size={18} />}
                >
                  {mode === 'login' ? '登录' : '注册并进入'}
                </Button>
              </form>
            </>
          )}
        </Card>

        <WaveDivider />

        <p className="max-w-[38rem] text-center text-[0.875rem] leading-[1.6] text-slate-current">
          不用真名，不用露脸，只要一段声音。同一个瓶子里，不同的人看到的是不同的匿名代号；
          你的账号只用来认领自己的漂流瓶。
        </p>
      </div>
    </main>
  );
}
