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
 * 激活项沿用 design-system Tabs 的选中语态（1px coral 下划线 + `text-coral`），圆角 rounded-base；
 * 微动效（motion-web §1/§2）：只动 transform —— 链接 hover `translateY(-1px)`、
 * 激活指示线 `scaleX` 0→1 展开；时长/缓动只引 `var(--motion-hover-duration)` /
 * `var(--motion-entry-easing)`，不写死时间字面量 / 手写缓动曲线 / 内联 duration·ease 档（下划线由绝对定位
 * span 承担，故 border 只留颜色类不带宽度，避免静态线盖过 scaleX 动画）。
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
                    'relative flex min-h-11 items-center whitespace-nowrap px-[10px] md:px-4',
                    'text-[0.6875rem] tracking-[0.24em]',
                    'focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
                    // feedback（motion-web §1）：切页颜色过渡 + hover 抬升 1px，只动 transform/color；
                    // transition-property 显式列举（v4 的 translate/scale 是独立属性，不含在 transform 里）
                    'transition-[transform,translate,scale,color] duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)]',
                    'hover:-translate-y-px',
                    active ? 'border-coral font-medium text-coral' : 'border-transparent text-muted hover:text-paper',
                  )}
                >
                  {item.label}
                  {/* 激活指示线：scaleX 0→1（origin-left），绝对定位不占布局 */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'pointer-events-none absolute inset-x-0 bottom-0 h-px origin-left bg-coral',
                      'transition-[transform,scale] duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)]',
                      active ? 'scale-x-100' : 'scale-x-0',
                    )}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
