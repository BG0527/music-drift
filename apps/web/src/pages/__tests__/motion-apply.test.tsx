/**
 * 动效落地断言（motion-apply）—— 把 `docs/motion-plan.md` 的落点变成静态可断言的契约：
 * §1.6 我的页 / §1.7 设置页 / §1.9 登录页 / §2.1+§2.4 路由容器与全局外壳。
 *
 * 验证层声明（motion-web §8，不冒充）：本文件是**静态源码扫描**，能证明
 * 「动效类存在 / 只引契约 token 无内联时长·缓动 / reduced-motion 全局兜底可达 /
 *  动效非唯一反馈（文字 + aria-live 通道）」；
 * **不能**证明屏幕上的流畅度与观感 —— 那一层需真机录屏，本测试不假装已验证。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// vitest 的 cwd = apps/web（与 motion-contract.test.tsx 同口径）
const PAGES_DIR = join(process.cwd(), 'src', 'pages');
const DS_DIR = join(process.cwd(), 'src', 'design-system');
const read = (path: string): string => readFileSync(path, 'utf8');

const routeView = read(join(PAGES_DIR, 'route-view.tsx'));
const settingsPage = read(join(PAGES_DIR, 'settings-page.tsx'));
const loginPage = read(join(PAGES_DIR, 'login-page.tsx'));
const profilePage = read(join(PAGES_DIR, 'profile-page.tsx'));
const motionCss = read(join(DS_DIR, 'motion.css'));
const themeCss = read(join(DS_DIR, 'theme.css'));

const PAGES: ReadonlyArray<readonly [string, string]> = [
  ['route-view', routeView],
  ['settings-page', settingsPage],
  ['login-page', loginPage],
  ['profile-page', profilePage],
];

// ── 阶段 2：河道 / 公海 / 瓶详情 / 漂流日志 / 审核台 / 选歌 / 404 / 我的（瓶列表） ──
const riverPage = read(join(PAGES_DIR, 'river-page.tsx'));
const seaPage = read(join(PAGES_DIR, 'sea-page.tsx'));
const bottlePage = read(join(PAGES_DIR, 'bottle-page.tsx'));
const driftLogPage = read(join(PAGES_DIR, 'drift-log-page.tsx'));
const adminPage = read(join(PAGES_DIR, 'admin-page.tsx'));
const songPickerPage = read(join(PAGES_DIR, 'song-picker-page.tsx'));
const notFoundPage = read(join(PAGES_DIR, 'not-found-page.tsx'));
const myBottles = read(join(process.cwd(), 'src', 'features', 'bottle', 'my-bottles.tsx'));

const PAGES2: ReadonlyArray<readonly [string, string]> = [
  ['river-page', riverPage],
  ['sea-page', seaPage],
  ['bottle-page', bottlePage],
  ['drift-log-page', driftLogPage],
  ['admin-page', adminPage],
  ['song-picker-page', songPickerPage],
  ['not-found-page', notFoundPage],
  ['my-bottles', myBottles],
];

describe('① 每页动效类存在（方案 §1.6 / §1.7 / §1.9 / §2.4-1）', () => {
  it('route-view：路由容器 enter-fade + key 换页重触发（§2.4-1，进出场配对见 §2.1 豁免）', () => {
    expect(routeView).toMatch(/className="enter-fade/);
    expect(routeView).toContain('key={match.path}');
  });

  it('settings：设置分组 enter-fade 入场（§1.7-1，仅 opacity，不做位移）+ 状态文字 enter-fade（§1.7-3）', () => {
    expect(settingsPage).toMatch(/<section[^>]*enter-fade/);
    expect(settingsPage.match(/enter-fade/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('login：登录卡 enter-rise 入场（§1.9-1 主角唯一）+ 进行态状态文字 enter-fade（§1.9-2）', () => {
    expect(loginPage).toMatch(/<form[^>]*enter-rise/);
    expect(loginPage).toMatch(/<p[^>]*role="status"[^>]*enter-fade[^>]*>/);
  });

  it('profile：档案头 enter-rise（§1.6-1）+ 消息列表 enter-rise + stagger 单调且封顶（§1.6-2）', () => {
    expect(profilePage).toMatch(/<header[^>]*enter-rise/);
    // 首项（回传 hero）固定 stagger-1；其后逐项 +1 步长、Math.min 封顶 4 ——
    // 单调（第 i 项 ≥ 第 i-1 项）与封顶（≤4 步，总入场 <600ms 感知阈值）由构造保证。
    expect(profilePage).toContain('enter-rise stagger-1');
    expect(profilePage).toMatch(/stagger-\$\{Math\.min\(index \+ 1, 4\)\}/);
  });
});

describe('② 源码扫描：无内联时长/缓动（方案 §2 / skill §2、§9）', () => {
  it('四个文件均无时间字面量、cubic-bezier、内联 duration/delay 档、内联缓动、transition-all', () => {
    for (const [name, src] of PAGES) {
      expect(src, `${name}: 时间字面量（如 300ms）`).not.toMatch(/\d+(?:\.\d+)?ms\b/);
      expect(src, `${name}: 手写缓动曲线`).not.toMatch(/cubic-bezier/);
      expect(src, `${name}: 内联时长档 duration-300/delay-200`).not.toMatch(
        /\b(?:duration|delay)-\d+(?:\.\d+)?\b/,
      );
      expect(src, `${name}: 内联缓动档 ease-out 等（token 用 ease-[var(--motion-entry-easing)]）`).not.toMatch(
        /\bease-(?:linear|in|out|in-out)\b/,
      );
      expect(src, `${name}: transition-all 明文禁止`).not.toMatch(/\btransition-all\b/);
    }
  });

  it('四页无 animate-spin / 无自造 animate-*（全站加载=shimmer，禁 spinner，§1.9-2 / §2.4-5）', () => {
    for (const [name, src] of PAGES) {
      expect(src, `${name}: 不得出现 animate-*`).not.toMatch(/\banimate-/);
    }
  });
});

describe('③ reduced-motion 全局兜底可达（方案 §1 降级列 / skill §7）', () => {
  it('motion.css 存在 prefers-reduced-motion 媒体块，全局关闭动画与过渡', () => {
    expect(motionCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    const block =
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}\s*$/.exec(motionCss)?.[1] ?? '';
    expect(block, 'missing prefers-reduced-motion block').not.toBe('');
    expect(block).toContain('animation: none !important');
    expect(block).toContain('transition: none !important');
  });

  it('reduce 下 enter-rise / enter-fade 复位为直接可见（不是把内容藏起来）', () => {
    expect(motionCss).toMatch(/\.enter-rise,\s*\.enter-fade\s*\{[^}]*opacity:\s*1/);
    expect(motionCss).toMatch(/\.enter-rise,\s*\.enter-fade\s*\{[^}]*transform:\s*none/);
  });
});

describe('④ token 引用（方案 §2 / skill §2：参数只来自契约）', () => {
  it('页面动效参数只经共享类名落地：出现的动效类全部在契约白名单内', () => {
    const WHITELIST = /\b(?:enter-rise|enter-fade|stagger-[1-4]|motion-fade-in|hover-lift|skeleton-shimmer|ripple-ring)\b/g;
    for (const [name, src] of PAGES) {
      const classes = src.match(WHITELIST) ?? [];
      expect(classes.length, `${name}: 至少一个契约动效类`).toBeGreaterThan(0);
      // 兜一层：不得出现白名单外的 enter-*/stagger-* 自造类
      // （lookbehind 排除 `--motion-*` 这类 var 引用：注释/参数里提 token 名是合规的）
      const allMotionish = src.match(/(?<![-\w])(?:enter|stagger|motion)-[a-z0-9-]+/g) ?? [];
      for (const cls of allMotionish) {
        expect(
          WHITELIST.test(cls),
          `${name}: 类 ${cls} 不在契约白名单（参数必须来自 token，不自造）`,
        ).toBe(true);
        WHITELIST.lastIndex = 0;
      }
    }
  });

  it('共享类的定义在 motion.css 且参数是 var(--token)，无时间字面量', () => {
    for (const cls of ['enter-rise', 'enter-fade', 'stagger-1', 'stagger-4']) {
      const block = new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`).exec(motionCss)?.[0] ?? '';
      expect(block, `missing .${cls}`).not.toBe('');
      expect(block, `.${cls} 必须引用 var(--token)`).toMatch(/var\(--/);
      expect(block, `.${cls} 不得写时间字面量`).not.toMatch(/\d+(?:\.\d+)?m?s\b/);
    }
  });

  it('方案登记的 --motion-* token 已在 theme.css 定义（引用方不发明值）', () => {
    for (const token of [
      '--motion-entry-duration',
      '--motion-entry-easing',
      '--motion-entry-shift',
      '--motion-page-duration',
      '--motion-stagger',
      '--motion-hover-duration',
      '--motion-exit-duration',
      '--motion-reduced-duration',
    ]) {
      expect(themeCss, `theme.css 缺 ${token}`).toContain(`${token}:`);
    }
  });
});

describe('⑤ 动效非唯一反馈（skill §7：文字/aria-live 结构通道）', () => {
  it('login：提交进行态有 role="status" + aria-live 文字（§1.9-2），错误有 role="alert" 文字（§1.9-3，未补 shake token 前只做文字）', () => {
    expect(loginPage).toMatch(/role="status"[\s\S]{0,80}aria-live="polite"/);
    expect(loginPage).toContain('role="alert"');
  });

  it('settings：退出进行态有 role="status" + aria-live 文字（§1.7-3）', () => {
    expect(settingsPage).toMatch(/role="status"[\s\S]{0,80}aria-live="polite"/);
  });
});

// ══════════════════ 阶段 2 ══════════════════

describe('⑥ 阶段2 每页动效类存在（方案 §1.1 / §1.2 / §1.3 / §1.4 / §1.5 / §1.6-2 / §1.8 / §1.10）', () => {
  it('river：aria-live 状态文字带 enter-fade（§1.1-6，DS 动效类非内联）+ f0 reduce 守卫（prefersReducedMotion 即可立即跳转，§1.1-3/4）', () => {
    expect(riverPage).toMatch(/<p role="status" aria-live="polite" className="enter-fade /);
    expect(riverPage.match(/role="status"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(riverPage.match(/prefersReducedMotion\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('sea：列表入场既有 stagger 封顶 ≤4（§1.2-1）+ 瓶卡交互宿主 hover-lift（§1.2-2）+ 分区 tab 颜色过渡（§1.2-3）', () => {
    // 既有取模写法保留（motion-contract 同款断言），封顶在 4 档内：不出现 stagger-5+
    expect(seaPage).toMatch(/stagger-\$\{String\(\(index % 4\) \+ 1\)\}/);
    expect(seaPage).not.toMatch(/stagger-[5-9]/);
    // hover-lift 只能挂可交互宿主（motion-contract §hover-lift 宿主约束）→ 落在卡内「听这支作品」Link
    expect(seaPage).toMatch(/<Link[^>]*hover-lift/);
    expect(seaPage).not.toMatch(/transition-shadow|transition-\[[^\]]*box-shadow/);
    // 分区 tab（筛选条）选中态切换走颜色过渡，参数来自 token；等待态有文字标识（非纯动效）
    expect(seaPage).toMatch(/\.sea-hall \.zones li\{[^}]*transition:color var\(--motion-hover-duration\)/);
    expect(seaPage).toContain('等待接力');
  });

  it('bottle：内容分块 enter-rise + stagger-1..3 单调封顶（§1.3-6）+ 三选一播报文字通道（§1.3-5 同步播报）', () => {
    expect(bottlePage).toMatch(/enter-rise stagger-1/);
    expect(bottlePage).toMatch(/enter-rise stagger-2/);
    expect(bottlePage).toMatch(/enter-rise stagger-3/);
    expect(bottlePage).not.toMatch(/stagger-[4-9]/);
    expect(bottlePage).toContain('role="status"');
  });

  it('drift-log：时间轴条目 enter-rise + stagger 单调封顶（§1.5-1）+ 骨架加载、无 spinner（§1.5-3）', () => {
    expect(driftLogPage).toMatch(/enter-rise stagger-\$\{Math\.min\(index \+ 1, 4\)\}/);
    expect(driftLogPage).toContain('Skeleton');
    expect(driftLogPage).not.toMatch(/\banimate-/);
  });

  it('admin：分区 tab 既有 transition-colors（§1.8-1）+ 队列面板 enter-rise（§1.8-2 页面层落点）', () => {
    expect(adminPage).toMatch(/transition-colors duration-200 ease-out/);
    expect(adminPage).toMatch(/data-anchor="admin-queue"[\s\S]{0,160}className="enter-rise"/);
    expect(adminPage).not.toMatch(/stagger-[5-9]/);
  });

  it('song-picker：歌曲列表 enter-rise + stagger 单调封顶（§1.4-1）+ 状态区文字 enter-fade（§1.4-4）', () => {
    expect(songPickerPage).toMatch(
      /<li key=\{song\.id\} className=\{`flex enter-rise stagger-\$\{Math\.min\(songIndex \+ 1, 4\)\}`\}/,
    );
    expect(songPickerPage.match(/data-device="sp-states"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(songPickerPage).toMatch(/className="enter-fade rounded-base border border-dashed/);
  });

  it('404：页面内容入场 enter-fade（§1.10-1，DS 类非内联数值）', () => {
    expect(notFoundPage).toMatch(
      // t5 一屏收敛后根类追加 `md:h-[100dvh] md:overflow-hidden`（one-screen-fit 契约）；
      // enter-fade 契约类与其余构成本条断言的原意，一个都没动。
      /<div className="enter-fade relative isolate flex flex-col gap-6 overflow-hidden md:h-\[100dvh\] md:overflow-hidden">/,
    );
  });

  it('我的-瓶列表：每格 enter-rise + stagger 单调封顶（§1.6-2）', () => {
    expect(myBottles).toMatch(
      /<li className=\{`enter-rise stagger-\$\{Math\.min\(index \+ 1, 4\)\}`\}>/,
    );
  });
});

describe('⑦ 阶段2 源码扫描：无发明值（方案 §2 / §3 / skill §2、§9 红线）', () => {
  it('8 个阶段2 文件均无时间字面量、手写缓动、transition-all、animate-*、布局属性过渡', () => {
    for (const [name, src] of PAGES2) {
      expect(src, `${name}: 时间字面量（如 300ms）`).not.toMatch(/\d+(?:\.\d+)?ms\b/);
      expect(src, `${name}: 手写缓动曲线`).not.toMatch(/cubic-bezier/);
      expect(src, `${name}: transition-all 明文禁止`).not.toMatch(/\btransition-all\b/);
      expect(src, `${name}: 自造 animate-*`).not.toMatch(/\banimate-/);
      expect(src, `${name}: 过渡布局属性`).not.toMatch(
        /transition[^;\n}]*(?:width|height|margin|padding|top|left|right|bottom)\s*:/,
      );
    }
  });

  it('sea 分区 tab 的过渡参数只引用 --motion-* token（不写死 ms/缓动）', () => {
    const zoneTransition = /\.sea-hall \.zones li\{[^}]*transition:color[^}]*\}/.exec(seaPage)?.[0] ?? '';
    expect(zoneTransition, 'missing zones transition').toContain('var(--motion-hover-duration)');
    expect(zoneTransition).not.toMatch(/\d+(?:\.\d+)?m?s\b/);
    expect(zoneTransition).not.toMatch(/cubic-bezier|ease-(?:linear|in|out|in-out)/);
  });
});

describe('⑧ 阶段2 reduced-motion：新动效全部骑在全局兜底可达的白名单类上（方案 §1 降级列 / skill §7）', () => {
  it('8 个文件出现的动效类全部在契约白名单内（不自造 enter-*/stagger-*；reduce 复位见 ③）', () => {
    const WHITELIST = /\b(?:enter-rise|enter-fade|stagger-[1-4]|motion-fade-in|hover-lift|skeleton-shimmer|ripple-ring)\b/g;
    for (const [name, src] of PAGES2) {
      const allMotionish = src.match(/(?<![-\w])(?:enter|stagger|motion)-[a-z0-9-]+/g) ?? [];
      for (const cls of allMotionish) {
        // Tailwind 内建媒体变体（非自造类）：只在用户允许动效时生效，与 reduce 兜底同向
        if (cls === 'motion-safe' || cls === 'motion-reduce') continue;
        expect(
          WHITELIST.test(cls),
          `${name}: 类 ${cls} 不在契约白名单（参数必须来自 token，不自造）`,
        ).toBe(true);
        WHITELIST.lastIndex = 0;
      }
    }
  });

  it('river-motion.css：f0 分镜有逐项 reduce 静止（双保险，§1.1-1/2 降级列；keyframes 白名单由 river-page.test 覆盖）', () => {
    const riverMotionCss = read(join(PAGES_DIR, 'river-motion.css'));
    expect(riverMotionCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(riverMotionCss).toMatch(/animation:\s*none/);
    // 逐项 animation:none 必须 ≥2（漂移虚线 + 涟漪两组常驻母题都可静止）
    expect(riverMotionCss.match(/animation:\s*none/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe('⑨ 阶段2 动效非唯一反馈（skill §7：文字/aria-live 结构通道）', () => {
  it('river：河道状态播报是 aria-live 文字（动效淡入非唯一反馈，§1.1-6）', () => {
    expect(riverPage).toMatch(/<p role="status" aria-live="polite"/);
  });

  it('sea：INCOMPLETE 等待态有文字标识（§1.2-3，非纯动效）', () => {
    expect(seaPage).toContain('等待接力');
    expect(seaPage).toMatch(/<p className="st gap">/);
  });

  it('song-picker：空态/无匹配状态区是成文状态文字（§1.4-4，动效只做淡入）', () => {
    expect(songPickerPage).toMatch(/data-device="sp-states"[\s\S]{0,400}无匹配|空 态/);
  });
});
