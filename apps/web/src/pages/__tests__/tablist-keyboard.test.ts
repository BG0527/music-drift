/**
 * tablist 键盘语统一（W18.5 · B5）。
 *
 * 缺陷：`role="tablist"` 这个角色自带一整套 ARIA 约定（APG Tabs Pattern），
 * 而仓库里三种写法并存：
 *   - `admin-page.tsx`：**规范样板** —— roving tabIndex（选中 0 / 其余 -1）、
 *     `aria-controls`、左右方向键切视图并把焦点带过去；
 *   - `sea-page.tsx`：两个 tab **都** `tabIndex={0}`（焦点不会随选中走）、
 *     无 `aria-controls`；方向键没有，只有 Enter/Space；
 *   - `login-page.tsx`：连 `tabIndex` 都没写（= 两者都可聚焦，违反 roving）、
 *     无 `aria-controls`、无方向键。
 *
 * 后果很具体：读屏用户在 sea / login 的 tab 上按左右键，**什么都不会发生**；
 * Tab 键会把焦点停在两个 tab 之间（而不是"进入 tab 组"）。
 *
 * 本守卫把三处统一到 admin 的写法，并额外要求：
 *   ① 恰好一个 tab `tabIndex={0}`、其余 `-1`（roving 的定义）；
 *   ② 方向键能切换（`onKeyDown` 处理 ArrowLeft/ArrowRight）；
 *   ③ 每个 tab 有 `aria-controls`，且指向一个真实存在的 panel id。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..', '..', '..');
const read = (rel: string): string => readFileSync(join(webRoot, rel), 'utf8');

/** 三个 tablist 宿主。 */
const TAB_HOSTS: ReadonlyArray<readonly [string, string]> = [
  ['pages/admin-page.tsx', read('src/pages/admin-page.tsx')],
  ['pages/sea-page.tsx', read('src/pages/sea-page.tsx')],
  ['pages/login-page.tsx', read('src/pages/login-page.tsx')],
];

describe('B5 tablist 键盘语：三处统一到 admin 的规范写法', () => {
  it.each(TAB_HOSTS)('%s 的 tab 有 roving tabIndex（选中 0、其余 -1）', (_name, src) => {
    // roving 的定义：tabIndex 必须由「是否选中」推导，而不是固定值。
    // 两种正确写法都接受：① `tabIndex={cond ? 0 : -1}`（三元）② `tabIndex={cond && 0}` 之类不行 ——
    // 必须是显式的 0 / -1 二选一，所以只认三元与 `===` 两种形态。
    expect(
      src,
      'tabIndex 没有随选中状态变化（roving 缺失）：应写成 `tabIndex={选中 ? 0 : -1}`',
    ).toMatch(/tabIndex=\{[^}]*\?\s*0\s*:\s*-1\}|tabIndex=\{[^}]*===\s*[^}]*\?\s*0\s*:\s*-1/);
  });

  it.each(TAB_HOSTS)('%s 的 tablist 处理左右方向键', (_name, src) => {
    expect(src, 'tablist 没有方向键处理（APG Tabs Pattern 的核心）').toMatch(
      /ArrowLeft|ArrowRight/,
    );
  });

  it.each(TAB_HOSTS)('%s 的 tab 有 aria-controls 指向真实 panel', (_name, src) => {
    expect(src, 'tab 缺 aria-controls').toMatch(/aria-controls=/);
    // aria-controls 的目标 id 必须在源码里真的存在（否则指向虚空）
    const ids = [...src.matchAll(/aria-controls=\{?[`"']?([A-Za-z0-9_${}.-]+)/g)].map((m) => m[1] ?? '');
    expect(ids.length, '没有解析到任何 aria-controls 目标').toBeGreaterThan(0);
    for (const id of ids) {
      if (id.includes('{')) continue; // 模板串：静态扫描无法判定，交给运行时测试
      expect(src, `aria-controls 指向的 id="${id}" 在页面里不存在`).toContain(`id="${id}"`);
    }
  });

  it('审核台保持既有规范写法（roving + 方向键 + aria-controls 一个都不许退化）', () => {
    const src = read('src/pages/admin-page.tsx');
    expect(src).toMatch(/tabIndex=\{view === 'PENDING' \? 0 : -1\}/);
    expect(src).toMatch(/aria-controls="admin-queue-panel"/);
    expect(src).toMatch(/id="admin-queue-panel"/);
    expect(src).toMatch(/tabRefs\.current\[next\]\?\.focus\(\)/);
  });

  it('登录页的 tablist 也有 panel（tab 与 form 的关联）', () => {
    const src = read('src/pages/login-page.tsx');
    // 登录/注册共用同一份 form（切换不丢输入）⇒ panel 角色与 aria-controls 要指向它
    expect(src, '登录页 tab 缺 aria-controls').toMatch(/aria-controls=/);
    expect(src, 'form 缺 id（aria-controls 无处可指）').toMatch(/id="[A-Za-z0-9_-]+"/);
  });
});
