/**
 * 文字链接的统一形态。
 *
 * 为什么要有这个文件：`DESIGN.md` §Accessibility 要求**可点目标 ≥44×44px**，
 * 而"裸文字链接"默认只有一行字高（约 24px）—— 手写 className 很容易漏掉这条。
 * 统一出口之后，页面只写 `className={TEXT_LINK}`，守卫测试还能静态检查（见 design-discipline.test.ts）。
 */
export const TEXT_LINK =
  // `whitespace-nowrap` 是**防竖排**的关键：flex 容器里的裸文本会被压到 min-content（一行一个字符），
  // nowrap 之后最坏情况是"整串文字换行到下一行"，而不是"捞 一 个 漂 流 瓶"竖成一列（captain 截图实测）。
  'inline-flex min-h-11 items-center gap-2 whitespace-nowrap font-medium text-peacock underline';

/** 需要更醒目的（主行动级别的文字链接）。 */
export const TEXT_LINK_STRONG =
  'inline-flex min-h-11 items-center gap-2 whitespace-nowrap text-[0.9375rem] font-semibold text-peacock underline';

/**
 * 边框式行动链接（ghost 按钮形态，landing 次级 CTA 用）。
 * 同样带 `min-h-11` + `whitespace-nowrap`，design-discipline 的 `TEXT_LINK` 口径可静态识别。
 * 过渡参数只引 `--motion-*` 契约 token（motion-web §2）。
 */
export const TEXT_LINK_GHOST =
  'inline-flex min-h-11 items-center whitespace-nowrap rounded-base border border-muted px-6 text-[0.9375rem] font-semibold text-coral transition-[transform,colors] duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)] hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink';

/** 实心主行动链接（coral 填充 + ink 文字；landing 链尾「去开始体验」）。 */
export const TEXT_LINK_PRIMARY =
  'inline-flex min-h-11 items-center whitespace-nowrap rounded-base bg-coral px-8 text-[1rem] font-semibold text-ink transition-[transform,colors] duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)] hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink';
