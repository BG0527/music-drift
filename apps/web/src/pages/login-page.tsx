/**
 * 登录 / 注册 —— 装置：**认领线**（record-v1；`docs/impl-plan-record-v1.md` §5.1，
 * 逐值对照 `docs/ui-review/design-explore/p-login-record.html`）。
 *
 * 装置要**承担信息**：右上是一枚方形的**代号牌**，从牌子垂下一根**线**，线的那头**只露一角瓶口**
 * —— 玻璃口沿（近唇亮、远唇暗）、瓶肩、以及**栓在口里的线头**（认领线终止在这只瓶里）。
 * 它讲的就是这一页的产品事实：线上那枚代号是别人在瓶里看到的全部，
 * 线那头串着的瓶只有你认领得到（`CONTEXT.md` §12.1 + 账号只用于认领）。
 *
 * 两处**刻意的响应式重排**（写明白，不藏）：
 * - 装置说明（「线上那枚代号…」）在 375 走正文列，在桌面靠右贴着那根线（`md:text-right`）；
 * - 瓶口只在页面底沿露出一角（裁切容器 + `bg-ink` 垫住线尾），因此内容列在底部留出它的高度。
 *
 * ## 「只用账号 · 密码两项」这件事（用户裁决；**界面与请求体都不再出现邮箱**）
 * 登录与注册都是两格：账号 · 密码（测试钉住了 `queryByLabelText('邮箱')` 两个档位都不存在），
 * **label 措辞逐字沿用设计稿** `docs/ui-review/design-explore/p-login-record.html`
 * （「账号」「密码」、提示语「登录和注册都只用这两项：账号、密码。」）。
 * 请求体与契约正名对齐：登录 = `{ account, password }`（`LoginRequestSchema`）、
 * 注册 = `{ account, password }`（`RegisterRequestSchema` 见 `account` 即通过 refine，
 * **不发 `handle` 别名、不发 `email`**）。账号这一格是 `type="text"`（账号非邮箱）。
 *
 * 错误处理口径：
 * - `HANDLE_TAKEN` → 账号字段、`WEAK_PASSWORD` → 密码字段（带修正动作）；
 * - 其余（凭证错误、结构错误、网络；含已无字段可落的 `EMAIL_TAKEN`）→ **表单级**提示，
 *   留在原地，AUTH_ERROR_CODES 的中文文案照常显示。
 */
import { useState, type FormEvent } from 'react';
import { ApiError } from '../features/api/client';
import { useLogin, useRegister } from '../features/api/mutations';
import { useSession } from '../features/session/session-context';
import { ConflictNotice } from '../features/bottle/conflict-notice';
import { Button, Glint, Icon, Input, Platter, Tabs } from '../design-system';
import { Link } from './shell/router';
import { useNavigate, useSearch } from './shell/router-context';
import { safeNextPath } from './shell/routes';

type Mode = 'login' | 'register';

interface FieldErrors {
  account?: string;
  password?: string;
}

/** 元信息行（11px + .24em，DESIGN.md §Typography）。 */
const META = 'text-[0.6875rem] tracking-[0.24em] text-muted/70';
/** `glass` = 冷光：DESIGN.md 把"链接"归给它；可点目标 ≥44px。
    名字里的 `TEXT_LINK_` 前缀是**故意的**：`design-discipline.test.ts` 用它与 `min-h-11`
    作为"这条链接是可点目标"的静态判据（同 `pages/shell/link-styles.ts` 的两个常量）。 */
const TEXT_LINK_COOL =
  'inline-flex min-h-11 items-center gap-2 whitespace-nowrap text-glass underline underline-offset-4';

export function LoginPage() {
  const session = useSession();
  const navigate = useNavigate();
  const search = useSearch();
  const next = safeNextPath(search.get('next'));
  const [mode, setMode] = useState<Mode>('login');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<unknown>(null);

  const login = useLogin();
  const register = useRegister();
  const busy = login.isPending || register.isPending;
  const authed = session.status === 'authed';

  function applyFailure(error: unknown): void {
    if (error instanceof ApiError) {
      // EMAIL_TAKEN 不再落字段：页面没有邮箱框，落到表单级（文案仍来自 AUTH_ERROR_CODES）
      if (error.code === 'HANDLE_TAKEN') {
        setFieldErrors({ account: error.message });
        return;
      }
      if (error.code === 'WEAK_PASSWORD') {
        setFieldErrors({ password: error.message });
        return;
      }
    }
    setFormError(error);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    try {
      // 与契约正名对齐（auth.ts）：登录/注册都只发 { account, password }
      if (mode === 'login') await login.mutateAsync({ account, password });
      else await register.mutateAsync({ account, password });
      navigate(next);
    } catch (error) {
      applyFailure(error);
    }
  }

  function switchMode(key: string): void {
    setMode(key === 'register' ? 'register' : 'login');
    setFieldErrors({});
    setFormError(null);
  }

  /**
   * 表单本体。两种模式共用同一份状态（都在这个组件里），所以切换档位不会丢掉已经输入的值 ——
   * 设计系统的 `Tabs` 只负责 tablist / tabpanel 与键盘，内容由这里给（`content` 为活动项时才渲染）。
   */
  const form = (
    <form className="flex max-w-[26rem] flex-col gap-4" onSubmit={submit} noValidate>
      <p className="max-w-[26rem] text-[0.78125rem] leading-[1.8] text-muted">
        登录和注册都只用这两项：账号、密码。
      </p>

      <Input
        label="账号"
        name="account"
        type="text"
        autoComplete="username"
        value={account}
        onChange={(event) => {
          setAccount(event.target.value);
        }}
        {...(mode === 'register'
          ? { hint: '2–32 个字符，别人看到的是每个瓶子里单独的匿名代号。' }
          : {})}
        {...(fieldErrors.account === undefined ? {} : { error: fieldErrors.account })}
      />

      <Input
        label="密码"
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
        className="self-start whitespace-nowrap"
        icon={<Icon name={mode === 'login' ? 'LogIn' : 'UserPlus'} size={18} />}
      >
        {mode === 'login' ? '登录' : '注册并进入'}
      </Button>

      <p className="max-w-[28rem] text-[0.84375rem] leading-[1.9] text-muted">
        不用真名，不用露脸，只要一段声音。同一个瓶子里，不同的人看到的是不同的匿名代号。
      </p>
    </form>
  );

  return (
    <main className="relative isolate flex min-h-[100dvh] flex-col bg-ink px-6 pb-6 pt-8 text-paper md:px-12">
      {/* 世界的底与上方：盘面沟槽 + 斜穿的掠光（背景层，零布局高度） */}
      <Platter />
      <Glint />

      {/* 认领线（装饰层）：代号牌 → 线 → 线那头只露一角瓶口。
          一根 flex 列把「牌在上、瓶口在下、线自己撑满中间」写成结构，不写魔法像素。 */}
      <div
        data-device="claim-rail"
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-3 flex w-[64px] flex-col items-center md:right-10 md:w-[88px]"
      >
        <div
          data-device="claim-plate"
          className="mt-16 flex aspect-square w-full flex-col items-center gap-1 border border-paper/30 bg-gradient-to-br from-paper/[0.11] to-paper/[0.03] py-2 md:mt-20"
        >
          <Icon name="Circle" size={16} className="text-paper/50" />
          <span className="text-[0.625rem] leading-[1.45] tracking-[0.12em] text-paper/90">
            匿名代号
          </span>
        </div>
        {/* 认领线：整根 ≥3:1（对盘面最亮的条纹也要读得出"线那一头串着瓶"） */}
        <span data-device="claim-line" className="w-px flex-1 bg-water-mid/50" />
        {/* 线的另一头只露一角：玻璃口沿 + 瓶肩 + 栓在口里的线头。
            裁切容器把瓶身切掉，只留底沿这一条；`bg-ink` 垫住线尾，线就"终止在瓶里"。 */}
        <span className="relative -mx-6 flex h-[28px] w-[120px] items-start overflow-hidden bg-ink md:-mx-14 md:w-[196px]">
          <svg
            data-device="claim-bottle"
            viewBox="0 0 196 28"
            className="block h-[28px] w-full text-water-mid"
            fill="none"
          >
            {/* 瓶肩：口沿以下只留两侧玻璃壁，中间不画 —— 全页没有一条横贯的线 */}
            <path d="M96 20 L84 28" stroke="currentColor" strokeOpacity="0.5" />
            <path d="M168 20 L180 28" stroke="currentColor" strokeOpacity="0.46" />
            {/* 玻璃口：暗的开口；近唇亮、远唇暗，只露这半边 */}
            <ellipse
              cx="132"
              cy="20"
              rx="36"
              ry="11"
              fill="var(--color-water-void)"
              fillOpacity="0.6"
            />
            <ellipse cx="132" cy="20" rx="36" ry="11" stroke="currentColor" strokeOpacity="0.4" />
            <path d="M96 20 A36 11 0 0 1 168 20" stroke="currentColor" strokeOpacity="0.6" />
            <path d="M168 20 A36 11 0 0 1 96 20" stroke="currentColor" strokeOpacity="0.3" />
            {/* 口里的线头：认领线终止在这只瓶里 */}
            <path d="M132 22 L132 28" stroke="currentColor" strokeOpacity="0.46" />
            <circle cx="132" cy="22" r="2.4" stroke="currentColor" strokeOpacity="0.66" />
          </svg>
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-6 pr-[84px] md:pr-[144px]">
        <p className={`${META} self-start md:self-end`}>SIDE A · {authed ? '已登录' : '未登录'}</p>

        <header className="flex flex-col gap-4">
          <h1 className="text-[1.625rem] font-bold leading-[1.05] text-paper md:text-[3.5rem]">
            每一段旋律，
            <br />
            都在寻找下一个声音
          </h1>
          <p className="max-w-[31rem] text-[0.90625rem] leading-[1.85] text-muted">
            这是一个由歌声、回音和宿命组成的角落。
            <br />
            你只录一段，剩下的交给漂流。
          </p>
        </header>

        {authed ? null : (
          <Tabs
            items={[
              { key: 'login', label: '登录', content: form },
              { key: 'register', label: '注册', content: form },
            ]}
            value={mode}
            onChange={switchMode}
          />
        )}

        {/* 装置说明：375 走正文列，桌面靠右贴着那根线 */}
        <p className="max-w-[28rem] text-[0.71875rem] leading-[1.8] text-muted md:ml-auto md:max-w-[15rem] md:text-right">
          线上那枚代号，是别人在瓶里看到的全部；线那头串着的瓶，只有你认领得到。
        </p>

        {/* 已登录态：不再要求登录，只给一条去河道的出口（就是设计稿底栏那一行） */}
        {authed ? (
          <div className="mt-auto border-t border-line/13 pt-3">
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <span className={META}>已登录态</span>
              <span className="text-[0.8125rem] text-muted">
                你已经登录为{' '}
                <strong className="font-semibold text-paper">{session.user?.handle}</strong>
                ，不用再登录一次。
              </span>
              <Link to="/river" className={`ml-auto ${TEXT_LINK_COOL}`}>
                直接去河道捞一个瓶子
              </Link>
            </div>
          </div>
        ) : (
          <span aria-hidden="true" className="mt-auto block h-[28px]" />
        )}
      </div>
    </main>
  );
}
