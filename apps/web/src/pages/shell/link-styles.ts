/**
 * 文字链接的统一形态。
 *
 * 为什么要有这个文件：`DESIGN.md` §Accessibility 要求**可点目标 ≥44×44px**，
 * 而"裸文字链接"默认只有一行字高（约 24px）—— 手写 className 很容易漏掉这条。
 * 统一出口之后，页面只写 `className={TEXT_LINK}`，守卫测试还能静态检查（见 design-discipline.test.ts）。
 */
export const TEXT_LINK =
  'inline-flex min-h-11 items-center gap-2 font-medium text-peacock underline';

/** 需要更醒目的（主行动级别的文字链接）。 */
export const TEXT_LINK_STRONG =
  'inline-flex min-h-11 items-center gap-2 text-[0.9375rem] font-semibold text-peacock underline';
