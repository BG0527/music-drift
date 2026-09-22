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
 */
export function SidebarNav({ items, current, className }: NavProps) {
  return (
    <nav
      aria-label="主导航"
      className={cn(
        'hidden w-64 shrink-0 flex-col gap-6 border-r border-mist bg-foam/70 p-6 md:flex',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-peacock text-wave-white">
          <Icon name="AudioWaveform" size={18} />
        </span>
        <span className="text-[1.25rem] font-bold">音乐漂流瓶</span>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const active = item.key === current;
          return (
            <li key={item.key}>
              <a
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-base px-4 text-[1rem]',
                  'focus-visible:ring-2 focus-visible:ring-peacock focus-visible:ring-offset-2 focus-visible:ring-offset-foam',
                  active
                    ? 'bg-wave-white font-medium text-peacock shadow-card'
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
