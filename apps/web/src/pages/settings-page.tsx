/**
 * 设置页（Figma **没有**这一帧；captain 裁决：侧栏有「设置」入口就必须有最简页面，不能是死链）。
 *
 * 只做三件事：匿名说明 / 登出 / 关于（契约版本 + 运行环境）。不追求设计稿。
 */
import { CONTRACT_VERSION } from '@music-drift/shared';
import { useLogout } from '../features/api/mutations';
import { useSession } from '../features/session/session-context';
import { Button, Card, Icon, WaveDivider } from '../design-system';
import { useNavigate } from './shell/router-context';

export function SettingsPage() {
  const session = useSession();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-[1.75rem] font-bold text-abyss">设置</h1>
        <p className="max-w-[46rem] text-[1rem] leading-[1.6] text-slate-current">
          这一版只保留最小设置：看看匿名规则、退出登录、确认页面版本。
        </p>
      </header>

      <Card className="flex flex-col gap-3">
        <h2 className="text-[1.0625rem] font-semibold text-abyss">匿名的边界</h2>
        <ul className="flex flex-col gap-2 text-[0.9375rem] leading-[1.6] text-slate-current">
          <li>· 每支瓶子生成一个独立代号，同一个瓶子里的所有人看到的是同一个代号。</li>
          <li>· 别人拿不到你的账号信息，只能看到代号与你的声音。</li>
          <li>· 你的账号只用于认领自己的漂流瓶与查看漂流日志。</li>
        </ul>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-[1.0625rem] font-semibold text-abyss">当前身份</h2>
        <p className="text-[0.9375rem] text-slate-current">
          {session.user === null
            ? '未登录'
            : `已登录：${session.user.handle}（${session.user.email}）`}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            loading={logout.isPending}
            icon={<Icon name="LogOut" size={18} />}
            onClick={() => {
              void logout
                .mutateAsync()
                .then(() => {
                  navigate('/login');
                })
                .catch(() => undefined);
            }}
          >
            登出
          </Button>
          <span className="text-[0.875rem] text-slate-current">
            登出只清掉这台设备上的会话，别人不会因此看到你的瓶子。
          </span>
        </div>
      </Card>

      <WaveDivider />

      <section className="flex flex-col gap-2" aria-labelledby="about-heading">
        <h2 id="about-heading" className="text-[1.0625rem] font-semibold text-abyss">
          关于
        </h2>
        <p className="text-[0.875rem] text-slate-current">契约版本：{CONTRACT_VERSION}</p>
        <p className="text-[0.875rem] leading-[1.6] text-slate-current">
          录音只在 https 或 localhost 下可用（浏览器策略）；局域网 IP 访问时录不了音不是页面故障。
        </p>
      </section>
    </div>
  );
}
