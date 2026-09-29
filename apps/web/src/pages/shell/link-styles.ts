/**
 * 文字链接的统一形态。
 *
 * 为什么要有这个文件：`DESIGN.md` §Accessibility 要求**可点目标 ≥44×44px**，
 * 而"裸文字链接"默认只有一行字高（约 24px）—— 手写 className 很容易漏掉这条。
 * 统一出口之后，页面只写 `className={TEXT_LINK}`，守卫测试还能静态检查（见 design-discipline.test.ts）。
 *
 * 交互态（W18.5 · A3；守卫 `__tests__/interaction-states.test.ts`）：
 * 文字链**不放大** —— 它们常与相邻文字同行并排（`gap-2` 的按钮组、面包屑行），
 * `scale(1.03)` 会让字与字互相压边。所以文字链的悬停信号是**提亮到 paper**
 * （对 ink 从 coral 4.76:1 / glass 11.08:1 提到 18.20:1）+ 下划线随之提亮，
 * 只有按钮族（GHOST / PRIMARY）才 scale。时长与缓动只引 `--motion-*` 契约 token。
 */
export const TEXT_LINK =
  // `whitespace-nowrap` 是**防竖排**的关键：flex 容器里的裸文本会被压到 min-content（一行一个字符），
  // nowrap 之后最坏情况是"整串文字换行到下一行"，而不是"捞 一 个 漂 流 瓶"竖成一列（captain 截图实测）。
  'inline-flex min-h-11 items-center gap-2 whitespace-nowrap font-medium text-peacock underline transition-[color,text-decoration-color] duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)] hover:text-paper focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink active:translate-y-px';

/** 需要更醒目的（主行动级别的文字链接）。 */
export const TEXT_LINK_STRONG =
  'inline-flex min-h-11 items-center gap-2 whitespace-nowrap text-[0.9375rem] font-semibold text-peacock underline transition-[color,text-decoration-color] duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)] hover:text-paper focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink active:translate-y-px';

/**
 * 边框式行动链接（ghost 按钮形态，landing 次级 CTA 用）。
 * 同样带 `min-h-11` + `whitespace-nowrap`，design-discipline 的 `TEXT_LINK` 口径可静态识别。
 * 过渡参数只引 `--motion-*` 契约 token（motion-web §2）。
 */
export const TEXT_LINK_GHOST =
  'inline-flex min-h-11 items-center whitespace-nowrap rounded-base border border-muted px-6 text-[0.9375rem] font-semibold text-coral transition-[transform,colors] duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)] hover:scale-[var(--motion-hover-scale)] focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink active:translate-y-px';

/** 实心主行动链接（coral 填充 + ink 文字；landing 链尾「去开始体验」）。 */
export const TEXT_LINK_PRIMARY =
  'inline-flex min-h-11 items-center whitespace-nowrap rounded-base bg-coral px-8 text-[1rem] font-semibold text-ink transition-[transform,colors] duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)] hover:scale-[var(--motion-hover-scale)] focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink active:translate-y-px';
