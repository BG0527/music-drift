/**
 * 个人中心（「我的」）—— record-v1：**内袋身份卡 + 消息 + 沉积剖面**。
 *
 * 设计稿：`docs/ui-review/design-explore/p-profile-record.html`（精确值来源，§5.5 口径）。
 * 构图是**两区分栏**，不是一路纵向堆叠（实测：`main` 900px；上排 `.window` 高 260px 的固定列表窗
 * 与 `.sleeve` 内袋卡 470×296；下排 `.bottom` 自 `top:596` 起左右两栏，左消息、右 pocket 各 624px）：
 *   上排 [列表窗 | 内袋卡]、下排 [通知 | 收藏/徽章入口]。
 * 桌面（≥1024px）走网格分栏，列表窗在窗内滚动（设计稿本身就是 overflow:hidden 的固定窗，
 * 这里用 max-height + overflow-y-auto —— 锚点挂在标题上，不受滚动影响）；
 * 单列时 DOM 顺序 = 内袋 → 列表窗 → 消息（设计稿「窗口在上、消息在下」）——
 * 通知若排在列表窗前面，375 下 `me-bottles` 锚点会被它顶出首屏。
 *
 * 两处刻意的取舍：
 * 1. **不显示匿名代号**（用户 2026-09-23 裁决 + 本轮重申）：`CONTEXT.md` §12.1 是"同一用户在不同瓶子里代号不同"，
 *    所以不存在"你的代号"这一行 —— 内袋中心孔里那张标签盘是**空白的**（还没印字）；
 * 2. 「我参与过的漂流瓶」来自服务端（跨设备可见、被斩的段仍算参与过），不是本机书签。
 */
import { useState } from 'react';
import { BadgesPanel } from '../features/bottle/badges-panel';
import { CollectionsPanel } from '../features/bottle/collections-panel';
import { NotificationList } from '../features/bottle/notification-list';
import { MyBottles } from '../features/bottle/my-bottles';
import { useSession } from '../features/session/session-context';
import { BottleMark, Button, Icon, TideLine, WaterTexture } from '../design-system';

export function ProfilePage() {
  const session = useSession();
  /** 收藏 / 徽章都是**声明式内容**（§46.2）⇒ 只做入口，内容进弹窗（入口落在下排右栏）。 */
  const [panel, setPanel] = useState<'collections' | 'badges' | null>(null);

  return (
    <div className="relative isolate flex flex-col gap-4">
      {/* 水域母题（t46 扩面）：整面水位线 + 页头潮线 + 一只漂流瓶（全部绝对定位、零布局高度） */}
      <WaterTexture tone="light" drift />
      <header className="relative flex flex-col gap-2 pb-[12px]">
        <BottleMark size={52} className="absolute right-0 -bottom-[6px] hidden text-coral md:block" />
        <BottleMark size={36} className="absolute right-0 -bottom-[4px] text-coral md:hidden" />
        <TideLine />
        <p className="text-[0.6875rem] tracking-[0.24em] text-paper/50">ACCOUNT · 认领</p>
        <h1 className="text-[3.625rem] font-bold leading-none text-paper">我的</h1>
        <p className="max-w-[46.25rem] text-[0.9375rem] leading-[1.85] text-muted">
          账号只用来认领你自己的漂流瓶。别人在瓶子里看到的是匿名代号，看不到你的账号。
        </p>
      </header>

      {/* ── 上排：[列表窗 | 内袋卡]。DOM 里内袋在前（单列阅读顺序），桌面用网格把它放回右栏 ── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_470px] lg:items-start">
        {/* 内袋身份卡（装置）：从柜里抽出来的内套，中心孔是纸被挖掉的一块，
             透出来的标签盘还没印字 —— 这张唱片上不存在「你的代号」 ─────── */}
        <section
          data-anchor="me-identity"
          aria-label="内袋身份卡"
          className="flex flex-col gap-[12px] rounded-base border border-line/15 bg-gradient-to-br from-paper/[0.085] via-paper/[0.022] to-paper/[0.055] p-[16px] lg:col-start-2 lg:row-start-1"
        >
          <p className="text-[0.6875rem] tracking-[0.24em] text-paper/50">内袋</p>
          <div className="flex flex-col gap-[16px] sm:flex-row sm:gap-[24px]">
            {/* 中心孔：空白标签盘（aria-hidden —— 它编码的是"没有代号"这一缺席，文字行已说明） */}
            <span
              aria-hidden="true"
              className="grid h-[120px] w-[120px] shrink-0 place-items-center self-start rounded-full border-2 border-line/30 bg-water-void/90 md:h-[168px] md:w-[168px]"
            >
              <span className="relative block h-[72px] w-[72px] rounded-full border border-water-deep/30 bg-gradient-to-br from-water-bed/[0.5] to-water-void/[0.8] md:h-[104px] md:w-[104px]">
                <i className="absolute -inset-[13px] rounded-full border border-water-deep/40" />
                <i className="absolute -inset-[29px] hidden rounded-full border border-water-deep/20 md:block" />
                <i className="absolute left-1/2 top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-glass/40 bg-ink" />
              </span>
            </span>

            <div className="flex min-w-0 flex-1 flex-col">
              <p className="break-words text-[1.25rem] font-bold leading-[1.2] text-paper">
                {session.user?.handle}
              </p>
              <p className="mt-[6px] break-all font-latin text-[0.75rem] text-muted">
                {session.user?.email}
              </p>
              <span className="mt-[12px] w-fit rounded-base border border-coral/60 bg-coral/[0.14] px-[10px] py-[4px] text-[0.75rem] tracking-[0.06em] text-danger">
                {session.isAdmin ? '管理员账号' : '普通用户'}
              </span>
            </div>
          </div>
        </section>

        {/* 列表窗（沉积剖面）：锚点挂标题；桌面窗内滚动，窗高与设计稿 .window 同为 260px */}
        <MyBottles className="lg:col-start-1 lg:row-start-1" />
      </div>

      {/* ── 下排：[通知 | 收藏/徽章入口]（设计稿 bottom 左消息、右 pocket）────── */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <section className="flex flex-col gap-3" aria-labelledby="notifications-heading">
          <h2 id="notifications-heading" className="text-[1.0625rem] font-bold text-paper">
            通知
          </h2>
          <p className="text-[0.8125rem] leading-[1.6] text-muted">
            只显示你自己的消息（留言送达 / 未送达 · 作品进公海）；别人的消息读不到，权限在服务端判定。
          </p>
          <NotificationList />
        </section>

        <section
          className="flex flex-col gap-[12px] rounded-base border border-line/15 bg-gradient-to-br from-paper/[0.085] via-paper/[0.022] to-paper/[0.055] p-[16px]"
          aria-labelledby="pockets-heading"
        >
          <p className="text-[0.6875rem] tracking-[0.24em] text-paper/50">内袋口</p>
          <h2 id="pockets-heading" className="text-[1.0625rem] font-bold text-paper">
            收藏与徽章
          </h2>
          <p className="text-[0.8125rem] leading-[1.6] text-muted">
            收藏的作品与拿到的徽章都收在这里，点开各自的面板看明细。
          </p>

          {/* 收藏 / 徽章入口（§46.2：入口 + 弹窗，不摊在首屏） */}
          <span className="flex flex-wrap items-center gap-[8px]">
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
        </section>
      </div>

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
    </div>
  );
}
