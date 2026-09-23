import type { ReactNode } from 'react';
import { Icon, type IconName } from './icon';
import { cn } from './utils';

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon?: IconName;
}

export interface NavProps {
  items: NavItem[];
  current: string;
  /** 侧栏底部槽位（用户卡）。内容由调用方给：设计系统不认识"用户"。 */
  footer?: ReactNode;
  className?: string;
}

const DEFAULT_ICONS: Record<string, IconName> = {
  river: 'Waves',
  sea: 'Ship',
  mine: 'UserRound',
  settings: 'Settings',
};

function iconFor(item: NavItem): IconName {
  return item.icon ?? DEFAULT_ICONS[item.key] ?? 'Circle';
}

/**
 * 桌面侧栏：四入口 IA（河道 / 公海 / 我的 / 设置）。
 * 来源：用户终裁「桌面为主要场景」+ Figma 帧 IA（`docs/figma/CONFLICTS.md` 采纳清单 #1）。
 * active 用 peacock 指示 + 字重 500（DESIGN.md §Components 导航条）。
 *
 * ⚠️ **几何一律写显式 px，不用 Tailwind 的数字 utility**：
 * `theme.css` 把 `--spacing` 覆盖成 0.5rem（为了让 `p-1` = 8px 符合 DESIGN 的 8px 节奏），
 * 于是 `w-64` = 0.5rem × 64 = **512px**（不是 256px）—— 侧栏因此宽到 512、把导航卡片顶进内容区
 * （captain 在 1440 截图上看到的"选中卡片溢出侧栏"就是这个）。
 *
 * Figma 契约（`docs/figma/frames/4-43--home-river.md` §1）：
 * sidebar 260×H · padding 40/24 · gap 48；nav-item 212×44 · padding 12/16 · gap 16。
 */
export function SidebarNav({ items, current, footer, className }: NavProps) {
  return (
    <nav
      aria-label="主导航"
      className={cn(
        'hidden w-[260px] shrink-0 flex-col gap-[48px] border-r border-mist bg-foam/70 px-[24px] py-[40px] md:flex',
        className,
      )}
    >
      <div className="flex items-center gap-[12px]">
        <span className="flex h-[36px] w-[36px] items-center justify-center rounded-full bg-peacock text-wave-white">
          <Icon name="AudioWaveform" size={18} />
        </span>
        <span className="text-[1.25rem] font-bold">音乐漂流瓶</span>
      </div>
      <ul className="flex w-[212px] flex-col gap-[12px]">
        {items.map((item) => {
          const active = item.key === current;
          return (
            <li key={item.key}>
              <a
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  // 212×44（Figma）：宽度由外层 ul 固定，这里只定高与内边距
                  'flex h-[44px] w-[212px] items-center gap-[16px] overflow-hidden rounded-base px-[16px] text-[1rem]',
                  'focus-visible:ring-2 focus-visible:ring-peacock focus-visible:ring-offset-2 focus-visible:ring-offset-foam',
                  active
                    ? 'bg-wave-white font-semibold text-peacock'
                    : 'text-slate-current font-normal hover:bg-wave-white/70',
                )}
              >
                <Icon name={iconFor(item)} size={20} />
                <span>{item.label}</span>
                {active ? (
                  <span aria-hidden="true" className="ml-auto h-4 w-1 rounded-pill bg-peacock" />
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
      {/* 用户卡贴在底部（Figma: user-block 212×72） */}
      {footer === undefined ? null : <div className="mt-auto w-[212px]">{footer}</div>}
    </nav>
  );
}

/**
 * 移动底栏：375px 下替代侧栏的四项导航（`docs/figma/CONFLICTS.md` C-14 裁决）。
 * 触控目标 ≥44px；预留 iOS 安全区。
 */
export function BottomNav({ items, current, className }: NavProps) {
  return (
    <nav
      aria-label="底部导航"
      className={cn(
        'fixed inset-x-0 bottom-0 z-sticky flex items-stretch justify-around border-t border-mist bg-foam',
        'pb-[env(safe-area-inset-bottom)] md:hidden',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.key === current;
        return (
          <a
            key={item.key}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-[0.75rem]',
              active ? 'font-medium text-peacock' : 'text-slate-current',
            )}
          >
            <Icon name={iconFor(item)} size={20} />
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
