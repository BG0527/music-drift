/**
 * 播放进度与唱针的「真平滑」契约（W18.5 · A5）。
 *
 * 问题（静态可证的缺陷）：进度数据来自媒体元素的 `timeupdate`，浏览器**每 ~250ms 才推一次**
 * （见 `use-accompaniment.ts:60` 的记录）。而落点此前是直接写 `width` / `left`，
 * 于是唱针与已播段每 250ms 跳一格（4Hz 阶跃），并且每次写 `width`/`left` 都触发一次重排。
 *
 * 修法（DESIGN §Elevation「只动 transform / opacity」）：
 *   已播段 = `transform: scaleX(比例)` + `transform-origin: left`；
 *   游标头 = `transform: translateX(px)`；
 *   唱针   = `transform: translateX(百分比)`（容器 `w-full`，百分比相对轨道宽）。
 *   再给这三者挂一条 **linear** 的 transform 过渡，时长 = 采样周期 ⇒ 相邻两次采样之间被插值，
 *   观感从「跳格」变成「滑行」。
 *
 * 验证层声明（motion-web §8，不冒充）：
 *   - 本文件是**静态源码扫描 + token 契约**：能证明「落点只经 transform 表达」「过渡时长
 *     来自契约 token 且等于媒体采样周期」「缓动是 linear（匀速，符合唱针物理直觉）」；
 *   - **不能**证明屏幕上真的顺滑 —— 那一层需要真机录屏或逐帧采样，本测试不假装已验证。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..', '..', '..');
const read = (rel: string): string => readFileSync(join(webRoot, rel), 'utf8');

const segmentPlayer = read('src/features/audio/segment-player.tsx');
const grooveTimeline = read('src/features/audio/groove-timeline.tsx');
const bottleCss = read('src/pages/bottle-page.css');
const themeCss = read('src/design-system/theme.css');
const designMd = readFileSync(join(webRoot, '..', '..', 'DESIGN.md'), 'utf8');

describe('A5-1 进度落点只经 transform 表达（不写 width/left）', () => {
  it('已播段用 scaleX，游标头用 translateX —— 不再直接写 width / left', () => {
    expect(segmentPlayer, '已播段仍直接写 width（每 250ms 触发一次重排）').not.toMatch(
      /className="fill"[^>]*\bwidth:/,
    );
    expect(segmentPlayer, '游标头仍直接写 left').not.toMatch(/className="head"[^>]*\bleft:/);
    expect(segmentPlayer, '已播段必须用 scaleX').toMatch(/className="fill"[^>]*scaleX\(/);
    expect(segmentPlayer, '游标头必须用 translateX').toMatch(/className="head"[^>]*translateX\(/);
  });

  it('唱针用 translateX 定位，容器铺满轨道宽度（百分比相对轨道而非自身）', () => {
    expect(grooveTimeline, '唱针仍在写 left 百分比（4Hz 阶跃 + 重排）').not.toMatch(
      /groove-playhead[\s\S]{0,200}style=\{\{\s*left:/,
    );
    expect(grooveTimeline, '唱针必须用 translateX(百分比)').toMatch(
      /style=\{\{ transform: `translateX\(\$\{String\(playheadPercent\)\}%\)` \}\}/,
    );
    expect(grooveTimeline, '唱针容器必须 w-full（translateX% 才有轨道宽可参照）').toMatch(
      /data-testid="groove-playhead"[\s\S]{0,160}w-full/,
    );
  });
});

describe('A5-2 平滑过渡：时长来自契约 token、缓动为 linear', () => {
  it('已播段与游标头声明 transform 过渡并以左端为 scaleX 原点', () => {
    const fill = /\.bar \.fill\s*\{[^}]*\}/.exec(bottleCss)?.[0] ?? '';
    expect(fill, '找不到 .bar .fill 规则').not.toBe('');
    expect(fill, '已播段必须 transform-origin: left（否则从中心缩放）').toMatch(
      /transform-origin:\s*(?:left|0)\b/,
    );
    expect(fill, '已播段必须有 transform 过渡').toMatch(
      /transition:[^;}]*var\(--motion-progress-duration\)/,
    );
    expect(fill, '已播段过渡的缓动必须是 token 化的 linear（匀速才像唱针）').toMatch(
      /var\(--motion-progress-easing\)/,
    );
    // 旧实现残留：宽度写死会与 scaleX 叠加成两套真相
    expect(fill, '已播段不得再靠 width 表达进度').not.toMatch(/(?<!max-)width:\s*0/);
  });

  it('唱针挂同样的 linear 过渡（与播放段同一套 token）', () => {
    expect(grooveTimeline, '唱针必须声明 transform 过渡').toMatch(
      /transition-transform[^\n]*var\(--motion-progress-duration\)[^\n]*var\(--motion-progress-easing\)|transition:\s*transform[^;}]*var\(--motion-progress-duration\)[^;}]*var\(--motion-progress-easing\)/,
    );
  });

  it('三处都不得出现 transition-all 或布局属性动画', () => {
    for (const [name, src] of [
      ['segment-player.tsx', segmentPlayer],
      ['groove-timeline.tsx', grooveTimeline],
      ['bottle-page.css', bottleCss],
    ] as const) {
      expect(src, `${name}: transition-all`).not.toMatch(/transition-all/);
      const decls = (src.match(/transition(?:-[a-z]+)?:[^;\n}]+/g) ?? []).join('\n');
      expect(decls, `${name}: 不得动画布局属性`).not.toMatch(
        /transition(?:-[a-z]+)?:[^;\n}]*\b(width|height|top|left|right|bottom|margin|padding|box-shadow)\s*:/,
      );
    }
  });
});

describe('A5-3 契约登记：时长/缓动 token 三处同源（DESIGN → theme.css → 页面引用）', () => {
  it('DESIGN.md 的 motion 块登记了 progressDuration 与 progressEasing', () => {
    const block = /motion:\n([\s\S]*?)\n  animatedProperties/.exec(designMd)?.[1] ?? '';
    expect(block, 'DESIGN.md motion 块未找到').not.toBe('');
    expect(block, 'DESIGN.md 缺 progressDuration').toMatch(/progressDuration:\s*250ms/);
    expect(block, 'DESIGN.md 缺 progressEasing（唱针必须匀速）').toMatch(
      /progressEasing:\s*"?linear"?/,
    );
  });

  it('theme.css 暴露同名 --motion-progress-* 变量', () => {
    expect(themeCss).toMatch(/--motion-progress-duration:\s*250ms/);
    expect(themeCss).toMatch(/--motion-progress-easing:\s*linear/);
  });

  it('250ms 不是随手写的数字：它必须等于媒体 timeupdate 的采样周期', () => {
    // 采样周期写在 use-accompaniment.ts 的注记里（约 250ms 一次）。
    // 过渡时长 < 采样周期 ⇒ 两次采样之间会「停顿」；> 采样周期 ⇒ 追不上。
    // 两者相等时观感连续，所以这个值是被外部事实钉住的，必须有据可查。
    const accompaniment = read('src/features/audio/use-accompaniment.ts');
    expect(accompaniment, '采样周期注记消失，本 token 的依据需要重新裁决').toMatch(/250ms/);
  });
});
