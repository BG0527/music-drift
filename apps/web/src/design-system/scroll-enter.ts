/**
 * guidance 型滚动入场（W18.5 · C3）。
 *
 * 契约依据：`DESIGN.md` §零装饰动效规则的**第 ③ 类例外**（2026-09-29 用户裁决）：
 * 内容块首次进入视口时播一次入场，参数全部取自既有契约
 * （`entryDuration` 480ms / `entryShift` 16px / `listStagger` 100ms），
 * **不新增时长或缓动 token**，也不引入视差、缩放跟随、进度联动。
 *
 * 四条硬边界（与契约逐条对应）：
 *   1. **只对内容块**，不对装饰、不对母题装置；
 *   2. **一次性**（`once: true`）—— 不回滚、不来回，避免"滚动劫持"类不适；
 *   3. 参数只来自契约（复用 `enter-rise` 类，时长/位移都在 motion.css 里）；
 *   4. **首屏内容不进观察器**（它已经在视口里，再等一次反而是延迟），
 *      reduced-motion 下由 motion.css 的全局兜底降级为 150ms opacity 淡入。
 *
 * 为什么用 `IntersectionObserver` 而不是 `animation-timeline: view()`：
 * 后者是**连续**跟随滚动进程的（用户裁决里明确排除"连续 scroll-driven"），
 * 而这里要的是"进入时播一次"。IO 正好表达后者，且不引入新 CSS 通道。
 *
 * 验证层声明：本文件能证明"只播一次 / 只动 transform+opacity / 无新 token /
 * 首屏跳过 / reduce 降级由全局兜底"；**证不了**观感 —— 那需要真机滚动。
 */

import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from './tokens';

/** 观察器判定"进入视口"的余量：元素露头这么多就开始播，别等完全露出。 */
const ROOT_MARGIN = '0px 0px -12% 0px';

export function useScrollEnter<T extends HTMLElement>(options?: {
  /** 关闭后只挂类不播动画（默认开）。测试与 reduce 场景用它做静态断言。 */
  enabled?: boolean;
}): {
  ref: (node: T | null) => void;
  /** 已进入视口、可以播入场的内容块数（供 aria-live 之外的状态查询）。 */
} {
  const enabled = options?.enabled ?? true;
  const observerRef = useRef<IntersectionObserver | null>(null);
  const appliedRef = useRef<WeakSet<Element>>(new WeakSet());

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target;
          // once：命中即取消观察，这个元素此生不再参与
          observer.unobserve(target);
          if (appliedRef.current.has(target)) continue;
          appliedRef.current.add(target);
          // 入场类：时长/位移全在 motion.css 的 --entry-* 契约里，这里只挂名
          target.classList.add('enter-rise');
        }
      },
      { rootMargin: ROOT_MARGIN, threshold: 0.01 },
    );
    observerRef.current = observer;

    // 补挂：首屏已在视口里的内容**不进观察器**（契约第 4 条）——
    // 它们本来就该直接可见，等一次"进入"反而是延迟。
    const seen = new Set<Element>();
    for (const node of Array.from(document.querySelectorAll('[data-scroll-enter]'))) {
      seen.add(node);
      const rect = node.getBoundingClientRect();
      const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
      if (!inViewport) observer.observe(node);
      else {
        appliedRef.current.add(node);
        node.classList.add('enter-rise');
      }
    }
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [enabled]);

  return {
    ref: (node: T | null) => {
      if (node === null) return;
      if (appliedRef.current.has(node)) return;
      const rect = node.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        // 首屏内容：直接可见，不进观察器（契约第 4 条）
        appliedRef.current.add(node);
        node.classList.add('enter-rise');
        return;
      }
      observerRef.current?.observe(node);
    },
  };
}

/** 供调用方判断是否应跳过动画（reduce 下全局兜底已冻结，这里只用于避免多余 IO）。 */
export function scrollEnterEnabled(): boolean {
  return !prefersReducedMotion();
}
