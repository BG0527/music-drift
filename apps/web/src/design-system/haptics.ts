/**
 * 触觉反馈（W18.5 · C2）。
 *
 * 为什么它不是"锦上添花"：落点涟漪是**视觉**反馈，而用户在按下按钮的那一瞬间
 * 往往还没看结果 —— 手指的触感是**最早到达**的反馈通道。投瓶、捞瓶、投票、
 * 确认这类"不可逆或一次性"的操作，给一次短促的震动能让操作更有实感。
 *
 * 三条纪律：
 *   1. **不发就不装**：桌面浏览器没有 `navigator.vibrate`，所以这里全程
 *      `typeof navigator.vibrate === 'function'` 守卫，桌面静默跳过。
 *   2. **不阻塞、不排队**：用最短的 pattern（单次），且不做任何 Promise 等待
 *      —— 震动是纯副作用，失败或被忽略都不影响操作结果。
 *   3. **尊重系统设置**：浏览器在系统开启"减弱触觉"时会自行忽略 `vibrate()`
 *      调用，我们不额外探测、也不提供自己的开关（用户裁决：全量无开关）。
 *
 * 验证层声明：本文件证明「有守卫、有最短 pattern、不 await」；
 * 证不了"真的震了"—— 那一层需要真机。
 */

/** 支持的振动模式：只给两种，避免做成"震动 DSL"。 */
export type HapticPattern = 'tap' | 'confirm';

/** 单次点击：短促一下（12ms）。低于 ~10ms 多数马达不响应，高于 ~20ms 开始像"敲"。 */
const TAP_MS = 12;
/** 成功确认：两下（10 / 间隔 40 / 18），读起来是"落下去了"而不是"又点了一次"。 */
const CONFIRM_MS: readonly number[] = [10, 40, 18];

function vibrate(pattern: HapticPattern): void {
  if (typeof navigator === 'undefined') return;
  const api = navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean };
  if (typeof api.vibrate !== 'function') return; // 桌面：静默跳过
  try {
    api.vibrate(pattern === 'tap' ? TAP_MS : [...CONFIRM_MS]);
  } catch {
    // 部分浏览器在无用户手势时抛错；触感是纯副作用，忽略即可
  }
}

/** 落点/按下：短促一下。与落点涟漪同时触发。 */
export function hapticTap(): void {
  vibrate('tap');
}

/** 操作成功：两下确认。用于投瓶成功、录音完成、去向已选这类"事情办完了"。 */
export function hapticConfirm(): void {
  vibrate('confirm');
}
