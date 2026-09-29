/**
 * 落点涟漪（就地操作反馈，W18.5 · C1）。
 *
 * 为什么要它：投/捞有「事件涟漪」（`castRippleDuration`），用户点下去能看到
 * "这一下落到河里哪"。但投票 / 收藏 / 评论发送 / 选段确认这些**就地操作**
 * 此前没有任何落点表达 —— 按钮状态变一下就结束了，"这一下落在哪"无处可寻。
 *
 * 关键约束（DESIGN「Ripples — 两个角色，不可混为一谈」）：
 *   场景涟漪 `.ripple-ring` = 常驻母题、infinite、不进内容区；
 *   落点涟漪 `.tap-ripple`  = 事件驱动、**播一次即停**、不进内容区。
 * 两者参数不同（2400ms/infinite vs 700ms/once），所以不能复用同一个类。
 *
 * 为什么"挂类即播、不靠改 key 重播"（motion-web §5）：
 * 涟漪由 **DOM 插入**触发 —— 每次操作渲染一枚新的涟漪元素，新元素的 CSS
 * 动画自然从头播。这样就绕开了"改 key 强制重挂整棵树"这个被守卫禁止的做法，
 * 也就不需要 `key` 参与重播。
 *
 * 验证层声明：静态扫描能证明「时长/峰值来自契约 token」「只动 transform+opacity」
 * 「reduced-motion 下被冻结」；**证不了**"看起来像水滴落在水面"—— 那需要真机看。
 */

import { useCallback, useState } from 'react';
import { cn } from './utils';

/** 一次落点涟漪的挂载态。 */
interface Tap {
  key: number;
  x: number;
  y: number;
}

export interface TapRippleProps {
  /** 触发一次落点涟漪；参数是相对容器左上角的百分比坐标。 */
  onRipple?: (xPercent: number, yPercent: number) => void;
  className?: string;
}

/**
 * 容器内的一枚涟漪。用法：把 `ref` 挂到相对定位的容器上，
 * 交互时调用 `rippleAt(clientX, clientY)`。
 */
export function useTapRipple(): {
  taps: Tap[];
  rippleAt: (clientX: number, clientY: number) => void;
  /** 触发前需先拿到容器矩形（由调用方提供，因为只有它知道容器在哪）。 */
  containerRect: () => DOMRect | null;
  setContainer: (element: HTMLElement | null) => void;
  container: HTMLElement | null;
} {
  const [taps, setTaps] = useState<Tap[]>([]);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  let seq = 0;

  const containerRect = useCallback((): DOMRect | null => {
    return container === null ? null : container.getBoundingClientRect();
  }, [container]);

  const rippleAt = useCallback(
    (clientX: number, clientY: number): void => {
      const rect = containerRect();
      if (rect === null || rect.width === 0 || rect.height === 0) return;
      seq += 1;
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      const tap: Tap = { key: seq, x, y };
      setTaps((previous) => [...previous, tap]);
      // 播完即摘：动画时长 = --motion-tap-ripple-duration（700ms）
      window.setTimeout(() => {
        setTaps((previous) => previous.filter((item) => item.key !== tap.key));
      }, TAP_RIPPLE_MS);
    },
    [containerRect],
  );

  return { taps, rippleAt, containerRect, setContainer, container };
}

/** 与 `--motion-tap-ripple-duration` 同值；卸载定时用（CSS 变量在 JS 里读不到计算样式）。 */
const TAP_RIPPLE_MS = 700;

/** 渲染层：`taps` 由 `useTapRipple` 给出。每枚涟漪是纯装饰（读屏隐藏、不可点）。 */
export function TapRippleLayer({
  taps,
  className,
}: {
  taps: ReadonlyArray<Tap>;
  className?: string;
}) {
  return (
    <>
      {taps.map((tap) => (
        <span
          key={tap.key}
          aria-hidden="true"
          data-testid="tap-ripple"
          className={cn(
            'tap-ripple pointer-events-none absolute h-24 w-24 rounded-full',
            'border border-glass/30',
            'left-0 top-0 -translate-x-1/2 -translate-y-1/2',
            className,
          )}
          style={{ marginLeft: `${String(tap.x)}%`, marginTop: `${String(tap.y)}%` }}
        />
      ))}
    </>
  );
}
