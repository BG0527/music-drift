/**
 * 页面上方的同主题常显顶栏（替换旧的浮动收起式 demo-nav；用户原话「在页面上方同主题制作导航栏」）。
 *
 * 形态约束（美化 v2，2026-09-27 用户看图打回「太丑」）：
 * - 根节点 `position: fixed` 贴顶 + 水平居中 ⇒ **零文档流占位**（全站一屏门禁不被撑破）；
 * - **去框去底**：不再是 border-hairline + water-void 的居中药丸 —— 参考稿/站外同款顶栏 =
 *   纯文字链平铺（15px 正常字距、muted→paper hover），激活项 coral + 贴文字下方的 2px 指示线；
 * - 居中落位保留：1440 下落在各页 topbar 两端 meta 之间的中央空档（不遮左右 meta 与正文）；
 * - 入口常显（无收起态）：河道 / 公海 / 我的 / 设置（`session.isAdmin` 时由外壳追加审核台）；
 * - 热区 ≥44px（min-h-11）；`nav` landmark + `aria-current="page"`。
 *
 * 微动效（motion-web §1/§2）：只动 transform —— 链接 hover `translateY(-1px)`、
 * 激活指示线 `scaleX` 0→1 展开；时长/缓动只引 `var(--motion-hover-duration)` /
 * `var(--motion-entry-easing)`，不写死时间字面量 / 手写缓动曲线 / 内联 duration·ease 档。
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
      {/* 纯文字链导航（无框无底）：pointer-events-auto 让 fixed 层只在链接上可点 */}
      <nav
        aria-label="站内导航"
        className="pointer-events-auto flex items-stretch"
      >
        <ul className="flex items-center gap-1 md:gap-3">
          {items.map((item, index) => {
            const active = item.key === current;
            return (
              <li key={item.key}>
                <Link
                  to={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex min-h-11 items-center whitespace-nowrap px-2 md:px-3',
                    'text-[0.9375rem]',
                    'focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
                    // feedback（motion-web §1）：切页颜色过渡 + hover 抬升 1px，只动 transform/color；
                    // transition-property 显式列举（v4 的 translate/scale 是独立属性，不含在 transform 里）
                    'transition-[transform,translate,scale,color] duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)]',
                    'hover:-translate-y-px',
                    // continuity（t3）：应用落位时入口逐个淡入一次（AppShell 跨路由常驻 ⇒ 换页不重播）；
                    // 参数只经契约类 enter-fade / stagger-*（值在 motion.css 的 --motion-* token），封顶 4 档
                    'enter-fade',
                    index > 0 ? `stagger-${Math.min(index, 4)}` : '',
                    active
                      ? 'font-medium text-coral'
                      : 'text-muted hover:text-paper',
                  )}
                >
                  {item.label}
                  {/* 激活指示线：2px 贴文字下方、scaleX 0→1（origin-left），绝对定位不占布局 */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'pointer-events-none absolute inset-x-2 bottom-[10px] h-[2px] origin-left bg-coral',
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
