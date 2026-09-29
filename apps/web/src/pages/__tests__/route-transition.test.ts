/**
 * 换页过渡契约（W18.5 · B1）。
 *
 * 缺陷（对照 `DESIGN.md` §Elevation 的明文）：
 *   契约写的是「Page transitions: **Fade + slide (300ms)**」+「Exit animations: 一切退场
 *   （Modal / Toast / **页面**）用 `exitDuration` 240ms —— 退场比入场更快」，
 *   而实现只有**淡入**、没有退场、没有位移；旧页直接卸载（硬切），
 *   滚动位置在换页同一帧瞬跳到顶。
 *
 * 修法（去 key 重播 + 双阶段）：
 *   阶段 1（旧页退场 240ms）：`exit-fade`（只 opacity，时长 = `--motion-exit-duration`）
 *           同时把滚动位置平滑复位到顶（reduced-motion 下 instant）；
 *   阶段 2（新页入场 480ms）：`enter-rise`（opacity + `--motion-entry-shift` 上浮）
 *   两阶段之间靠 `motion.exitDuration` 计时切换，**不再改 key**（key 重播是 t37 登记的
 *   整树 remount 缺陷，`KEY_REMOUNT_ALLOWLIST` 里的 `pages/route-view.tsx` 是给它开后门，
 *   本轮正式关闭该后门）。
 *
 * 验证层声明（motion-web §8，不冒充）：本文件是**静态源码扫描**，能证明「两阶段的存在与
 * 顺序」「时长只引契约 token」「不再改 key」「退场比入场快」；**不能**证明屏幕上的观感。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
/** 本文件在 `src/pages/__tests__/` ⇒ 上溯两级是 `src`，再上一级才是 web 根。 */
const webRoot = join(here, '..', '..', '..');
const read = (rel: string): string => readFileSync(join(webRoot, rel), 'utf8');

const routeView = read('src/pages/route-view.tsx');
const router = read('src/pages/shell/router.tsx');
const motionContract = read('src/design-system/__tests__/motion-contract.test.tsx');

describe('B1-1 换页两阶段：旧页退场 → 新页上浮入场', () => {
  it('不再用 key 强制重播（那是整树 remount，t37 登记的缺陷）', () => {
    expect(routeView, '仍有 key={match.path}（每次换页整树重挂）').not.toMatch(/key=\{match\.path\}/);
  });

  it('退场用 exit-fade 且入场用 enter-rise（两个阶段都在）', () => {
    expect(routeView, '缺少退场阶段类 exit-fade').toMatch(/exit-fade/);
    expect(routeView, '缺少入场阶段类 enter-rise').toMatch(/enter-rise/);
  });

  it('两阶段的时序由退场时长驱动（退场结束才切到新页）', () => {
    // 退场时长必须来自契约：JS 侧用 `motion.exitDuration`（tokens.ts 的契约镜像，
    // 与 theme.css 的 `--motion-exit-duration` 同值，drift guard 在 tokens.test.ts），
    // 不写字面量。
    expect(routeView, '退场计时必须引 motion.exitDuration 契约镜像').toMatch(
      /motion\.exitDuration/,
    );
    expect(routeView, '不得自己 import 一个裸毫秒常量').not.toMatch(
      /setTimeout\([\s\S]{0,80}?\b\d{2,4}\b/,
    );
    expect(routeView, '不得写时间字面量').not.toMatch(/\d+(?:\.\d+)?ms\b/);
  });

  it('入场带位移（上浮），不是纯淡入（DESIGN：Fade + slide）', () => {
    // 位移量来自 --motion-entry-shift（由 motion.css 的 .enter-rise 消费），页面只引类名
    expect(routeView).toMatch(/enter-rise/);
    expect(routeView, '不得自己写 translateY 字面量').not.toMatch(/translateY\(/);
  });
});

describe('B1-2 滚动复位：退场阶段平滑回到顶，reduced-motion 下瞬时', () => {
  it('router 里的滚动复位走可平滚动（且尊重 reduced-motion）', () => {
    expect(router, '仍是瞬时跳顶（window.scrollTo({top:0}) 无 behavior）').toMatch(
      /scrollTo\(\{[\s\S]{0,120}?behavior/,
    );
  });

  it('滚动复位尊重 prefers-reduced-motion（reduce 下必须瞬时，不能平滑滚动）', () => {
    const src = `${routeView}\n${router}`;
    expect(src, '缺 prefersReducedMotion 判定（reduce 下不许平滑滚动）').toMatch(
      /prefersReducedMotion\(\)|prefers-reduced-motion/,
    );
  });
});

describe('B1-3 关闭 key 重播后门（守卫侧）', () => {
  it('KEY_REMOUNT_ALLOWLIST 已清空（route-view 不再是已知违例）', () => {
    const list =
      /const KEY_REMOUNT_ALLOWLIST = \[([^\]]*)\]/.exec(motionContract)?.[1] ?? '';
    expect(list, '找不到 KEY_REMOUNT_ALLOWLIST').not.toBe(undefined);
    expect(list.replace(/'/g, '').trim(), '后门未关闭：route-view 仍被允许改 key').not.toMatch(
      /route-view/,
    );
  });
});
