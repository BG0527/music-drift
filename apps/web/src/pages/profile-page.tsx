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
import { useState } from 'react';
import { BadgesPanel } from '../features/bottle/badges-panel';
import { CollectionsPanel } from '../features/bottle/collections-panel';
import { NotificationList } from '../features/bottle/notification-list';
import { MyBottles } from '../features/bottle/my-bottles';
import { useSession } from '../features/session/session-context';
import {
  BottleMark,
  Button,
  Card,
  Icon,
  TideLine,
  WaterTexture,
  WaveDivider,
} from '../design-system';

export function ProfilePage() {
  const session = useSession();
  /** 收藏 / 徽章都是**声明式内容**（§46.2）⇒ 只做入口，内容进弹窗（首屏只多两个按钮的高度）。 */
  const [panel, setPanel] = useState<'collections' | 'badges' | null>(null);

  return (
    <div className="relative isolate flex flex-col gap-3">
      {/* 水域母题（t46 扩面）：整面水位线 + 页头潮线 + 一只漂流瓶（全部绝对定位、零布局高度） */}
      <WaterTexture tone="light" drift />
      <header className="relative flex flex-col gap-2 pb-[12px]">
        <BottleMark size={52} className="absolute right-0 -bottom-[6px] hidden text-peacock md:block" />
        <BottleMark size={36} className="absolute right-0 -bottom-[4px] text-peacock md:hidden" />
        <TideLine />
        <h1 className="text-[1.75rem] font-bold text-abyss">我的</h1>
        <p className="max-w-[46rem] text-[1rem] leading-[1.6] text-slate-current">
          账号只用来认领你自己的漂流瓶。别人在瓶子里看到的是匿名代号，看不到你的账号。
        </p>
      </header>

      {/* 身份卡压成一行（§46.3）：头像 + 代号 + 邮箱 + 角色 —— 信息一个不少，行数减两行 */}
      <Card className="flex flex-wrap items-center gap-x-[16px] gap-y-[4px] py-[12px]">
        <span className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-tide-pool text-peacock">
          <Icon name="UserRound" size={20} />
        </span>
        <p className="text-[1.125rem] font-semibold text-abyss">{session.user?.handle}</p>
        <p className="text-[0.875rem] text-slate-current">{session.user?.email}</p>
        <span className="rounded-pill bg-tide-pool px-3 py-1 text-[0.8125rem] text-abyss">
          {session.isAdmin ? '管理员账号' : '普通用户'}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-[8px]">
          <Button
            variant="ghost"
            className="h-[44px] min-h-[44px] px-[12px] text-[0.875rem]"
            icon={<Icon name="Anchor" size={16} />}
            onClick={() => {
              setPanel('collections');
            }}
          >
            我的收藏
          </Button>
          <Button
            variant="ghost"
            className="h-[44px] min-h-[44px] px-[12px] text-[0.875rem]"
            icon={<Icon name="CheckCircle2" size={16} />}
            onClick={() => {
              setPanel('badges');
            }}
          >
            我的徽章
          </Button>
        </span>
      </Card>

      <CollectionsPanel
        open={panel === 'collections'}
        onClose={() => {
          setPanel(null);
        }}
      />
      <BadgesPanel
        open={panel === 'badges'}
        onClose={() => {
          setPanel(null);
        }}
      />

      <section className="flex flex-col gap-3" aria-labelledby="notifications-heading">
        <h2 id="notifications-heading" className="text-[1.0625rem] font-semibold text-abyss">
          通知
        </h2>
        <p className="text-[0.875rem] leading-[1.5] text-slate-current">
          只显示你自己的消息（留言送达 / 未送达 · 作品进公海）；别人的消息读不到，权限在服务端判定。
        </p>
        <NotificationList />
      </section>

      <WaveDivider />

      <MyBottles />
    </div>
  );
}
