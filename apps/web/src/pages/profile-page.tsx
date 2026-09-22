/**
 * 个人中心（「我的」）。
 *
 * 诚实原则：**服务端目前没有「列出我参与过的瓶子」的接口**（`docs/api.md` §2 只有
 * `/api/me/anonymous-codes`、`/api/me/badges`、`/api/me/collections`），所以这里
 * ① 显示账号身份与该用户的匿名代号；② 列出**这台设备**参与过的瓶子（本机记录，文案如实说明）。
 * 缺口已在 T3.2 回报里登记，不在此处伪造一个"账号级列表"。
 */
import { useAnonymousCodes } from '../features/api/queries';
import { RememberedBottles } from '../features/bottle/remembered-bottles';
import { useSession } from '../features/session/session-context';
import { Card, Icon, Skeleton, WaveDivider } from '../design-system';
import { AsyncBoundary } from './shell/async-boundary';

export function ProfilePage() {
  const session = useSession();
  const codes = useAnonymousCodes(session.status === 'authed');

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-[1.75rem] font-bold text-abyss">我的</h1>
        <p className="max-w-[46rem] text-[1rem] leading-[1.6] text-slate-current">
          账号只用来认领你自己的漂流瓶。别人在瓶子里看到的是匿名代号，看不到你的账号。
        </p>
      </header>

      <Card className="flex flex-wrap items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-tide-pool text-peacock">
          <Icon name="UserRound" size={24} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[1.125rem] font-semibold text-abyss">{session.user?.handle}</p>
          <p className="text-[0.875rem] text-slate-current">{session.user?.email}</p>
          <p className="text-[0.875rem] text-slate-current">
            {session.isAdmin ? '管理员账号' : '普通用户'}
          </p>
        </div>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="codes-heading">
        <h2 id="codes-heading" className="text-[1.0625rem] font-semibold text-abyss">
          你的匿名代号
        </h2>
        <p className="text-[0.875rem] leading-[1.6] text-slate-current">
          同一支瓶子里，所有人看到的都是这同一个代号；换一支瓶子，代号就会变。
        </p>
        <AsyncBoundary
          query={codes}
          skeleton={<Skeleton height="3rem" width="100%" />}
          emptyWhen={(items) => items.length === 0}
          empty={
            <p role="status" className="text-[0.875rem] leading-[1.6] text-slate-current">
              你还没有发起或接过瓶子，所以暂时没有代号。去河道捞一个，代号会在第一次参与时生成。
            </p>
          }
        >
          {(items) => (
            <ul className="flex flex-wrap gap-3">
              {items.map((code) => (
                <li
                  key={code.bottleId}
                  className="rounded-pill border border-mist bg-foam px-4 py-2 text-[0.9375rem] text-abyss"
                >
                  {code.code}
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </section>

      <WaveDivider />

      <RememberedBottles />
    </div>
  );
}
