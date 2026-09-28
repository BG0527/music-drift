import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * t5 · 一屏收敛的机器判据（红 → 绿）。
 *
 * 背景：`docs/replica-gap.md` 实测 1280×800 下 7 条路由超屏（守卫基线 exit 1）：
 * /sea 900（`min-height:max(100dvh,900px)` 地板）、/new 803、/me 835、/settings 810、
 * /bottles/:id 873、/log 822 —— 除河道页外没有任何页面带「视口高 = 版式高」的约束。
 *
 * 判据照抄达标的河道页（`river-page.tsx:273`）：
 * 1. 每个页面根元素在 md+（≥768，覆盖守卫的桌面口径 ≥1024）钉死 `md:h-[100dvh]` + `md:overflow-hidden`
 *    ⇒ 文档高度恒等于视口高，主内容不产生纵向滚动条；
 * 2. 公海页不许再出现 900px 硬地板（`max(100dvh,900px)` 是 1280×800 下 900 的元凶）；
 * 3. 设置页漂流瓶必须是 `settings-page.css` 里的 site/patches/settings.css 复刻实现
 *    （--wl 水线坐标系 + 同构倒影 + 水下波纹/气泡），而不是自创样式。
 *
 * 红线：本文件先于实现提交 —— 上面三条在实现前应当全红。
 */

const PAGES_DIR = join(process.cwd(), 'src', 'pages');
const source = (name: string): string => readFileSync(join(PAGES_DIR, name), 'utf8');

/** 页面根元素（不含测试与 shell）：文件 → 必须携带一屏约束的标记。 */
const PAGE_ROOTS: ReadonlyArray<readonly [file: string, marker: string]> = [
  ['river-page.tsx', 'md:h-[100dvh]'],
  ['sea-page.tsx', 'md:h-[100dvh]'],
  ['profile-page.tsx', 'md:h-[100dvh]'],
  ['song-picker-page.tsx', 'md:h-[100dvh]'],
  ['bottle-page.tsx', 'md:h-[100dvh]'],
  ['drift-log-page.tsx', 'md:h-[100dvh]'],
  ['settings-page.tsx', 'md:h-[100dvh]'],
  ['login-page.tsx', 'md:h-[100dvh]'],
  ['admin-page.tsx', 'md:h-[100dvh]'],
  ['not-found-page.tsx', 'md:h-[100dvh]'],
];

describe('t5 · 一屏约束（每个页面根元素 md+ 钉死视口高）', () => {
  for (const [file, marker] of PAGE_ROOTS) {
    it(`${file} 根元素带 ${marker} + md:overflow-hidden`, () => {
      const src = source(file);
      expect(src, `${file} 缺 ${marker}`).toContain(marker);
      expect(src, `${file} 缺 md:overflow-hidden`).toContain('md:overflow-hidden');
    });
  }
});

describe('W18 · 真浏览器一屏门禁同时检查可见控件相交', () => {
  it('one-screen-check 采集 visualOverlaps 并把非空结果判失败', () => {
    const guard = readFileSync(join(process.cwd(), 'tools', 'one-screen-check.mjs'), 'utf8');
    expect(guard).toContain('visualOverlaps');
    expect(guard).toContain('NodeFilter.SHOW_TEXT');
    expect(guard).toContain('document.createRange()');
    expect(guard).toMatch(/visualOverlaps\.length\s*===\s*0/);
  });

  it('专门造出「持有 + 已录 2 段 + 待录第 3 段」的真实路由', () => {
    const guard = readFileSync(join(process.cwd(), 'tools', 'one-screen-check.mjs'), 'utf8');
    expect(guard).toContain('heldTwoSegmentsId');
    expect(guard).toContain("anchors: ['bottle-record', 'bottle-play', 'bottle-action']");
  });
});

describe('t5 · 公海页去掉 900 地板', () => {
  it('sea-page 不再出现 max(100dvh,900px)（1280×800 下它就是那 100px）', () => {
    expect(source('sea-page.tsx')).not.toContain('max(100dvh,900px)');
  });
});

/**
 * P0-②（docs/replica-gap.md §2.2）：`.p-record .msgs ul` 没有高度上限 ⇒ 消息随条数线性长高
 * （开发库存量数据实测 2987px、216 个元素越线）。修法 = 定高 + 内部滚动：
 * 列表是可滚动的次要内容，页面本体不因此长高。
 */
describe('t5 · /me 消息列表有上限（真实数据不再把页面顶出一屏）', () => {
  // t17 起这两条规则随参考坐标系一起搬进 profile-page.css（patches/me.css 同址）
  const profile = (): string => readFileSync(join(PAGES_DIR, 'profile-page.css'), 'utf8');

  it('.msgs ul 有 max-height', () => {
    expect(profile(), '缺 max-height ⇒ 列表无上限').toMatch(
      /\.p-record \.msgs ul\s*\{[^}]*max-height:/,
    );
  });

  it('.msgs ul 有 overflow-y:auto（超出部分在列表内部滚，不动页面高度）', () => {
    expect(profile(), '缺内部滚动 ⇒ 超出部分会顶高整页').toMatch(
      /\.p-record \.msgs ul\s*\{[^}]*overflow-y:\s*auto/,
    );
  });
});

describe('t5 · 设置页漂流瓶 = site/patches/settings.css 的复刻实现', () => {
  const css = (): string => readFileSync(join(PAGES_DIR, 'settings-page.css'), 'utf8');

  it('存在 settings-page.css 且页面 import 它', () => {
    expect(source('settings-page.tsx')).toContain("./settings-page.css");
    expect(css()).toContain('--wl');
  });

  it('坐标系与补丁一致：--u=100dvh/900、--ux=100vw/1440、--wl=520*--u、--bx=1182*--ux', () => {
    const text = css();
    expect(text).toContain('calc(100dvh / 900)');
    expect(text).toContain('calc(100vw / 1440)');
    expect(text).toContain('520');
    expect(text).toContain('1182');
  });

  it('瓶骑在水线上（接触水皮 contact 落在 --wl）且倒影 .refl 从 --wl 开始、与瓶同 x 同宽', () => {
    const text = css();
    expect(text, '倒影锚在水线').toMatch(/\.set-refl[^{]*\{[^}]*top:\s*var\(--wl\)/);
    expect(text, '倒影与瓶同左沿').toMatch(/\.set-refl[^{]*\{[^}]*left:\s*var\(--bx\)/);
  });

  it('水下装置补齐：波纹 .set-wav 与气泡 .set-bub', () => {
    const text = css();
    expect(text).toContain('.set-wav');
    expect(text).toContain('.set-bub');
  });

  it('纸件补齐：模切指孔 .set-hole 与折痕 .set-crease', () => {
    const text = css();
    expect(text).toContain('.set-hole');
    expect(text).toContain('.set-crease');
  });
});
