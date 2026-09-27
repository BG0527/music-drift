/**
 * 页面上方的同主题常显顶栏（替换旧的浮动收起式 demo-nav；用户原话「在页面上方同主题制作导航栏」）。
 *
 * 形态约束：
 * - 根节点 `position: fixed` 贴顶 + 水平居中窄条 ⇒ **零文档流占位**（全站一屏门禁不被撑破）；
 * - 1440 下落在各页 topbar 两端 meta 之间的中央空档（不遮左右 meta 与正文），条高 ≈46px；
 * - 入口常显（无收起态）：河道 / 公海 / 我的 / 设置（`session.isAdmin` 时由外壳追加审核台）；
 * - 热区 ≥44px（min-h-11）；`nav` landmark + `aria-current="page"`。
 *
 * 样式走 record-v1：`water-void` 底 + `border-hairline`（line 13% 细线）+ meta 字（11px / .24em）；
 * 激活项沿用 design-system Tabs 的选中语态（1px `border-coral` 下划线 + `text-coral`），圆角 rounded-base。
 */
import { cn } from '../../design-system';
import { Link } from './router';
import type { AppNavItem } from './routes';

export interface TopNavProps {
  items: readonly AppNavItem[];
  current: AppNavItem['key'];
}

export function TopNav({ items, current }: TopNavProps) {
  return (
    <div
      data-testid="top-nav"
      className="pointer-events-none fixed inset-x-0 top-[10px] z-sticky flex justify-center px-2"
    >
      {/* 窄条本体：pointer-events-auto 让 fixed 全宽层不挡页面点击 */}
      <nav
        aria-label="站内导航"
        className="pointer-events-auto flex items-stretch rounded-base border border-hairline bg-water-void"
      >
        <ul className="flex items-center">
          {items.map((item) => {
            const active = item.key === current;
            return (
              <li key={item.key}>
                <Link
                  to={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center whitespace-nowrap px-[10px] md:px-4',
                    'border-b border-transparent text-[0.6875rem] tracking-[0.24em]',
                    'focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
                    // feedback（motion-web §1）：切页时颜色与下划线过渡，不瞬变
                    'transition-colors duration-200 ease-out',
                    active ? 'border-coral font-medium text-coral' : 'text-muted hover:text-paper',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
