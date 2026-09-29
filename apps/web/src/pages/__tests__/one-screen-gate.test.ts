/**
 * 一屏/窄屏门禁的判据覆盖（W18.5 · B3）。
 *
 * 门禁盲区（本轮要补的两条，都是"真实缺陷曾经能溜过去"的直接原因）：
 *   1. **375 顶栏压内容**：门禁的 mobile 分支只查「锚点下沿 ≤ 812」+「无横向溢出」，
 *      **不查重叠**。而 fixed 顶栏（`top-10 + min-h-11`）压住页面首行时，
 *      锚点下沿完全可能是 200px（"在视口内"）—— 于是 5 个页面在 375 下被压住却全绿。
 *      判据缺口：`/sea` 375 的六列压叠、选歌/设置/瓶子/公海/日志的首行被压，都属于这一类。
 *   2. **`routesFor()` 不含 `/login` 与 `/admin`**：这两页从来没被量过，
 *      所以 `/admin` 的「非管理员分支没有 <main>/h1」这类问题不会被门禁发现。
 *
 * 本文件是**门禁脚本自身的契约**（静态扫描 `one-screen-check.mjs`）：
 *   - mobile 分支必须有「顶栏矩形 ∩ 首屏内容 = 0」的判据；
 *   - `routesFor()` 必须覆盖 `/login` 与 `/admin`；
 *   - 门禁仍必须保留反向控制能力（`--negative-control`），否则"全绿"可能只是"没在测"。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
/** 本文件在 `src/pages/__tests__/` ⇒ 上溯三级到 web 根。 */
const webRoot = join(here, '..', '..', '..');
const gate = readFileSync(join(webRoot, 'tools', 'one-screen-check.mjs'), 'utf8');

describe('B3-1 窄屏（<1024）门禁查顶栏重叠，不再只查高度与横向', () => {
  it('measure() 量了顶栏矩形（top-nav）', () => {
    expect(gate, '门禁没有量顶栏矩形').toMatch(/top-nav|topNav/);
  });

  it('存在「顶栏与首屏内容相交」的判据', () => {
    expect(gate, '门禁没有顶栏重叠判据').toMatch(/navOverlaps|navIntersection|顶栏/);
  });

  it('该判据对 mobile 生效（不是只写不判）', () => {
    // 判据必须真的把重叠算成 problem，且明确限定在 mobile（桌面另有一整套高度判据）
    expect(gate, 'mobile 分支只查横向/锚点，没有把顶栏重叠算成 problem').toMatch(
      /if \(mobile[^)]*\)[\s\S]{0,200}?problems\.push\(/,
    );
    expect(gate, '重叠判据没有用 navOverlaps').toMatch(/problems\.push\([^)]*navOverlaps/);
  });
});

describe('B3-2 routesFor() 覆盖 /login 与 /admin（此前从未被量过）', () => {
  const routesBlock = /function routesFor\(seed\)\s*\{[\s\S]*?\n\}/.exec(gate)?.[0] ?? '';

  it('/login 在门禁路由表里', () => {
    expect(routesBlock, "routesFor() 缺 '/login'").toMatch(/path:\s*'\/login'/);
  });

  it('/admin 在门禁路由表里', () => {
    expect(routesBlock, "routesFor() 缺 '/admin'").toMatch(/path:\s*'\/admin'/);
  });

  it('两页各自带锚点（无锚点 = 什么都没量）', () => {
    const login = /path:\s*'\/login',\s*anchors:\s*\[([^\]]*)\]/.exec(routesBlock)?.[1] ?? '';
    const admin = /path:\s*'\/admin',\s*anchors:\s*\[([^\]]*)\]/.exec(routesBlock)?.[1] ?? '';
    expect(login.trim(), '/login 没有锚点').not.toBe('');
    expect(admin.trim(), '/admin 没有锚点').not.toBe('');
  });
});

describe('B3-3 门禁必须保留反向控制（否则"全绿"可能只是"没在测"）', () => {
  it('--negative-control 仍在：注入超高元素后必须整片红', () => {
    expect(gate, '门禁失去了反向控制能力').toMatch(/negativeControl/);
    expect(gate, '反向控制没有插到 body 最前面（那样只会把内容往下推而不影响已有断言）').toMatch(
      /document\.body\.prepend/,
    );
  });

  it('反向控制下 mobile 的判据也会红（不只是桌面）', () => {
    expect(gate).toMatch(/provedRed\s*=/);
  });
});
