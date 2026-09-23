/**
 * 动效使用的**可断言契约**（`motion-web` §8：动效必须可验证；"看着挺顺"不是证据）。
 *
 * ## 这一层能证明什么、不能证明什么（别自欺）
 *
 * - **能证明**（静态扫描源码，见 §8 表格的「属性」「时长/缓动」两行）：
 *   ① 状态反馈只引用了设计系统的动效类（`enter-fade`），**没有内联新的时长/缓动数值**（§2 禁止内联新值）；
 *   ② 没有用"改 `key` 逼动画重播"这种会造成子树重建的写法（§5 明令禁止）。
 * - **不能证明**：屏幕上的流畅度/视觉表现 —— jsdom 没有布局与合成器（§8 明说"单元层无法证明渲染效果"）。
 *   本文件的注释与 `docs/audio.md` §10.5 都如实标注了这一点；真机表现未验证。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

const SEGMENT_PLAYER = read('./segment-player.tsx');
const RECORDER_PANEL = read('./recorder-panel.tsx');

describe('动效契约（motion-web §2/§5/§8）：只用契约 token、不内联新值、不靠 key 重建', () => {
  it('状态文字只引用 DS 的动效类 enter-fade（时长/缓动来自 motion.css 的 token）', () => {
    // 两个状态文字都带 enter-fade（DS 提供的入场动效：只动 opacity / 300ms ease-out）
    expect(SEGMENT_PLAYER).toMatch(/className="enter-fade text-\[0\.875rem\]/);
    expect(RECORDER_PANEL).toMatch(/className="enter-fade text-\[0\.875rem\]/);
  });

  it('没有内联新的动效数值（禁止 duration-[…] / cubic-bezier / animate-[…] / 内联 transition）', () => {
    for (const [name, source] of [
      ['segment-player.tsx', SEGMENT_PLAYER],
      ['recorder-panel.tsx', RECORDER_PANEL],
    ] as const) {
      expect(source, `${name} 不得内联任意动效值`).not.toMatch(
        /duration-\[|cubic-bezier|animate-\[|transition-\[/,
      );
      // 禁止动画布局属性（§3）：本目录里不得出现这几类工具类
      expect(source, `${name} 不得动画布局属性`).not.toMatch(
        /\b(?:transition|animate)-(?:all|width|height|top|left|margins?|paddings?|shadow)\b/,
      );
    }
  });

  it('不得靠改 key 触发子树重建来"重播动画"（motion-web §5 明令禁止）', () => {
    expect(SEGMENT_PLAYER).not.toMatch(/key=\{player\.playbackState\}/);
    expect(RECORDER_PANEL).not.toMatch(/key=\{recorder\.previewState\}/);
  });
});
