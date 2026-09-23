/**
 * 设置页（Figma **没有**这一帧；captain 裁决：侧栏有「设置」入口就必须有最简页面，不能是死链）。
 *
 * 只做三件事：匿名说明 / 登出 / 关于（契约版本 + 运行环境）。不追求设计稿。
 */
import { useState } from 'react';
import { CONTRACT_VERSION } from '@music-drift/shared';
import { useLibraryMetadata } from '../features/api/queries';
import { useLogout } from '../features/api/mutations';
import { LibraryAttribution } from '../features/audio';
import { useSession } from '../features/session/session-context';
import {
  BottleMark,
  Button,
  Card,
  Icon,
  Modal,
  TideLine,
  WaterTexture,
  WaveDivider,
} from '../design-system';
import { useNavigate } from './shell/router-context';

export function SettingsPage() {
  const session = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  /**
   * 伴奏署名（CC BY 4.0）—— t13 的授权义务，挂在本页履行。
   *
   * 关键取舍：**署名不依赖这个查询**。作者 / 来源 / 许可名 / 许可链接是编译期常量，
   * 只有"逐首曲名"来自 `library.json`；元数据读不到时**照样渲染署名块**
   * （组件会自己说明"曲目列表暂时读不到"），绝不因为接口挂掉而不显示署名。
   */
  const library = useLibraryMetadata();
  const [attributionOpen, setAttributionOpen] = useState(false);

  return (
    <div className="relative isolate flex flex-col gap-6">
      {/* 水域母题（t46 扩面）：同上（水位线 + 潮线 + 瓶子） */}
      <WaterTexture tone="light" drift />
      <header className="relative flex flex-col gap-2">
        {/* 注：这里**不加** pb —— /settings 在 375 下只剩 ~1px 余量（实测 settings-attribution=811/812），
            加 12px 会直接把一屏门顶破。潮线是绝对定位，贴着页头下沿即可。 */}
        <BottleMark size={52} className="absolute right-0 -bottom-[6px] hidden text-peacock md:block" />
        <BottleMark size={36} className="absolute right-0 -bottom-[4px] text-peacock md:hidden" />
        <TideLine />
        <h1 className="text-[1.75rem] font-bold text-abyss">设置</h1>
        <p className="max-w-[46rem] text-[1rem] leading-[1.6] text-slate-current">
          这一版只保留最小设置：看看匿名规则、退出登录、确认页面版本。
        </p>
      </header>

      <Card className="flex flex-col gap-[8px]">
        <h2 className="text-[1.0625rem] font-semibold text-abyss">匿名的边界</h2>
        <p className="text-[0.9375rem] leading-[1.6] text-slate-current">
          每支瓶子一个独立代号（同一瓶里大家看到的是同一个）；别人拿不到你的账号，只能看到代号与你的声音；
          账号只用于认领你自己的漂流瓶与漂流日志。
        </p>
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

      <section className="flex flex-wrap items-center gap-[16px]" aria-labelledby="attribution-heading">
        <h2 id="attribution-heading" className="text-[1.0625rem] font-semibold text-abyss">
          伴奏与授权
        </h2>
        <p className="text-[0.875rem] leading-[1.6] text-slate-current">
          曲库伴奏为 CC BY 4.0 授权（署名义务），点开查看完整署名与许可条款。
        </p>
        <Button
          variant="ghost"
          data-anchor="settings-attribution"
          className="whitespace-nowrap"
          onClick={() => { setAttributionOpen(true); }}
        >
          查看署名与许可
        </Button>
        <Modal
          open={attributionOpen}
          title="伴奏与授权"
          onClose={() => {
            setAttributionOpen(false);
          }}
        >
          <LibraryAttribution tracks={library.data?.tracks ?? []} />
        </Modal>
      </section>

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
