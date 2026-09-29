/**
 * 心情标签（用户第十三轮 ①：「添加另一个页面的心情标签，并且附有前端点击切换的动画，**只是没有实质功能**」）。
 *
 * 三条纪律：
 * 1. **不做假功能**：它不筛选、不请求、不改 URL —— 文案里也如实写着「只作展示」，
 *    不能让用户以为点了它作品列表会变；真要筛选，得先有推荐/匹配（CONTEXT §3.1 明确这一版没有）；
 * 2. **动效只为 feedback**（`motion-web` §1）：参数**引用契约 token**（`var(--motion-hover-duration)` /
 *    `var(--motion-entry-easing)` / `var(--motion-hover-scale)`），**不内联新数值**（§2）；
 *    只动 `transform`/`opacity`（§3）；reduced-motion 由 `design-system/motion.css` 全局兜底（§7）；
 * 3. **可断言**（`motion-web` §8）：选中态用 `aria-pressed` 表达（不是只靠颜色），
 *    并且「过渡用的是 token」这件事由测试钉住 —— 类名里必须出现 `var(--motion-`。
 */
import { useState } from 'react';
import { cn } from '../../design-system';

/** 标签清单（与首页那一版一致；Demo 只保留样式）。**不导出**：本文件只导出组件，避免破坏 Fast Refresh。 */
const MOOD_TAGS = ['全部', '深夜', '通勤', '告白', '雨天'] as const;

export interface MoodChipsProps {
  className?: string;
}

export function MoodChips({ className }: MoodChipsProps) {
  const [selected, setSelected] = useState<string>(MOOD_TAGS[0]);

  return (
    <section
      aria-labelledby="mood-heading"
      className={cn('flex flex-col gap-[8px]', className)}
    >
      <h2 id="mood-heading" className="sr-only">
        心情标签
      </h2>
      <ul className="flex flex-wrap items-center gap-[8px] md:gap-[12px]">
        {MOOD_TAGS.map((tag) => {
          const active = tag === selected;
          return (
            <li key={tag}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setSelected(tag);
                }}
                className={cn(
                  'flex h-[44px] items-center rounded-base px-[12px] text-[0.8125rem] md:px-[18px] md:text-[0.875rem]',
                  // 只动 transform/opacity，参数全部来自契约 token（时长 200ms / ease-out / 放大 1.03）
                  'transition-transform',
                  'duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)]',
                  'motion-safe:active:translate-y-[-1px]',
                  active
                    // t6 选中确认（feedback）：挂类即播一次 `bottle-pick`（design-system/motion.css）。
                    // t16（t10 观察项 · 方案②）：**不再写静态 scale** —— `fill:both` 收尾恒等
                    // `scale(1)`，会把它锁成死代码；选中线索由 `aria-pressed`（结构）+ 珊瑚底/字重
                    // （视觉）承担，缩放只留在未选中档的 hover（那里没有动画，工具类真的生效）。
                    ? 'mood-pick bg-coral font-semibold text-ink'
                    : 'border border-line/25 bg-transparent text-coral hover:scale-[var(--motion-hover-scale)]',
                )}
              >
                {tag}
              </button>
            </li>
          );
        })}
      </ul>
      {/* 短视口收起钩子（f1 / t4 评审并入）：md+ 矮窗时 CSS 视觉隐藏这一行（river-motion.css），
          DOM 与文案保留 —— 产品诚实说明不删，mood-chips.test 的 getByText 继续绿。 */}
      <p className="mood-note text-[0.8125rem] leading-[1.5] text-muted">
        心情标签这一版只作展示：点它只是换个心情，不会筛选下面的作品。
      </p>
    </section>
  );
}
