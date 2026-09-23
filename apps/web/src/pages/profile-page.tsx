/**
 * 个人中心（「我的」）。
 *
 * 三段：账号身份卡 / 通知 / 我参与过的漂流瓶（服务端 `GET /api/me/bottles`）。
 *
 * 两处刻意的取舍：
 * 1. **不显示匿名代号**（用户 2026-09-23 裁决）：`CONTEXT.md` §12.1 是"同一用户在不同瓶子里代号不同"，
 *    所以不存在"你的代号"这一行 —— 填任何值都是编的；
 * 2. 「我参与过的漂流瓶」来自服务端（跨设备可见、被斩的段仍算参与过），不是本机书签。
 */
import { NotificationList } from '../features/bottle/notification-list';
import { MyBottles } from '../features/bottle/my-bottles';
import { useSession } from '../features/session/session-context';
import { Card, Icon, WaveDivider } from '../design-system';

export function ProfilePage() {
  const session = useSession();

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

      <WaveDivider />

      <section className="flex flex-col gap-3" aria-labelledby="notifications-heading">
        <h2 id="notifications-heading" className="text-[1.0625rem] font-semibold text-abyss">
          通知
        </h2>
        <p className="text-[0.875rem] leading-[1.6] text-slate-current">
          只显示你自己的消息：留言送达 / 未送达（CONTEXT §5.2），以及你参与的作品进公海。
          标记已读是幂等的，别人的消息读不到 —— 权限在服务端判定。
        </p>
        <NotificationList />
      </section>

      <WaveDivider />

      <MyBottles />
    </div>
  );
}
