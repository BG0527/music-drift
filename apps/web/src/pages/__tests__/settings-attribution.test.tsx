import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION } from '@music-drift/shared';
import { LIBRARY_LICENSE, LIBRARY_METADATA_URL } from '@music-drift/shared/audio';
import { USER_A } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { SettingsPage } from '../settings-page';

/**
 * t12 第 0️⃣ 项：设置页挂 **CC BY 4.0 署名**（t13 的授权义务）。
 *
 * 两条纪律：
 * 1. 署名**不依赖接口**：作者 / 来源 / 许可名 / 许可链接是编译期常量，
 *    元数据读不到时**义务必须照旧渲染**（CC BY 4.0 的唯一义务就是署名）；
 * 2. 元数据用**真资产**（`public/library/library.json`）当桩，顺带证明这个文件过 `LibraryMetadataSchema`。
 */
const METADATA = JSON.parse(
  readFileSync(join(process.cwd(), 'public', 'library', 'library.json'), 'utf8'),
) as { tracks: Array<{ title: string }> };

const SESSION = {
  user: { id: USER_A, handle: '午夜歌手', account: '午夜歌手', role: 'USER' },
  expiresAt: '2026-10-23T00:00:00.000Z',
};

function handlers(respond: () => { status?: number; body?: unknown }) {
  return [
    { path: '/api/auth/me', respond: () => ({ body: SESSION }) },
    { path: '/api/me/anonymous-codes', respond: () => ({ body: [] }) },
    { path: LIBRARY_METADATA_URL, respond },
  ];
}

describe('设置页 · 伴奏署名（CC BY 4.0）', () => {
  it('元数据可读时逐首列出曲名，并给出作者 / 来源 / 许可链接', async () => {
    renderWithProviders(<SettingsPage />, {
      route: '/settings',
      handlers: handlers(() => ({ body: METADATA })),
    });

    // §46.2：声明式内容不占首屏 → 先点开入口，署名在弹窗里（义务不因收进弹窗而消失）
    fireEvent.click(await screen.findByRole('button', { name: '查看署名与许可' }));
    const heading = await screen.findByRole('heading', { name: '伴奏音乐署名（CC BY 4.0）' });
    expect(heading).toBeInTheDocument();

    // 逐首曲名（"指名道姓"到具体作品）
    for (const track of METADATA.tracks) {
      expect(await screen.findByText(new RegExp(track.title))).toBeInTheDocument();
    }

    // 署名三要素 + 许可链接（新窗口 + rel 安全属性由音频层组件保证）
    const section = heading.closest('section') ?? heading.parentElement;
    expect(section).not.toBeNull();
    // 署名三要素（作者 / 来源 / 许可名）在文本里恒在；逐曲名会重复出现作者，所以用 textContent 断言
    expect((section as HTMLElement).textContent).toContain('Kevin MacLeod');
    expect((section as HTMLElement).textContent).toContain('incompetech.com');
    expect((section as HTMLElement).textContent).toContain('Creative Commons Attribution 4.0');
    const licenseLink = within(section as HTMLElement).getByRole('link', {
      name: /查看许可条款/,
    });
    expect(licenseLink).toHaveAttribute('href', LIBRARY_LICENSE.licenseUrl);
    expect(licenseLink).toHaveAttribute('rel', 'license noreferrer');
    expect(licenseLink).toHaveAttribute('target', '_blank');
  });

  it('元数据读不到时**不隐藏署名义务**：作者 / 来源 / 许可链接仍在，并说明列表暂时读不到', async () => {
    renderWithProviders(<SettingsPage />, {
      route: '/settings',
      handlers: handlers(() => ({
        status: 500,
        body: { error: { message: '服务器出了点问题，请稍后再试。', violations: [] } },
      })),
    });

    fireEvent.click(await screen.findByRole('button', { name: '查看署名与许可' }));
    const heading = await screen.findByRole('heading', { name: '伴奏音乐署名（CC BY 4.0）' });
    const section = (heading.closest('section') ?? heading.parentElement) as HTMLElement;

    expect(section.textContent).toContain('Kevin MacLeod');
    expect(section.textContent).toContain('incompetech.com');
    expect(section.textContent).toContain('Creative Commons Attribution 4.0');
    expect(within(section).getByRole('link', { name: /查看许可条款/ })).toHaveAttribute(
      'href',
      LIBRARY_LICENSE.licenseUrl,
    );
    expect(within(section).getByText(/曲目列表暂时读不到/)).toBeInTheDocument();
  });
});

/**
 * 设置页的装置是「**折页 + 水线切开「匿名的边界」**」（record-v1，`docs/impl-plan-record-v1.md` §5.1）：
 * 折页给出两栏，一条水线横切整张纸 —— **线上的两条别人看得到、线下的那一条只有你知道**。
 *
 * 为什么这里要机器钉住：响应式重排最容易毁掉的就是这类"顺序承担语义"的装置
 * （把三条边界排成一列之后，"哪两条在水上"就读不出来了）。机器判据只能证明
 * 「375 无横向滚动 + `settings-attribution` 锚点进首屏」，证明不了水线两侧各是几条。
 */
describe('设置页 · 折页 + 水线切开「匿名的边界」', () => {
  async function renderSettings(): Promise<HTMLElement> {
    const { container } = renderWithProviders(<SettingsPage />, {
      route: '/settings',
      handlers: handlers(() => ({ body: METADATA })),
    });
    await screen.findByRole('heading', { name: '匿名的边界' });
    return container;
  }

  it('折页：两栏之间有折线，且折线只在桌面出现（375 折成一页）', async () => {
    const container = await renderSettings();
    const fold = container.querySelector('[data-device="fold"]');
    expect(fold, '缺折线').not.toBeNull();
    expect(fold?.className, '折线必须在 768px 以下收起').toContain('md:');
    expect(fold?.getAttribute('aria-hidden')).toBe('true');
  });

  it('水线把三条边界切开：线上两条「别人看得到」、线下一条「只有你自己知道」', async () => {
    const container = await renderSettings();
    const above = container.querySelector('[data-device="anonymous-above"]');
    const below = container.querySelector('[data-device="anonymous-below"]');
    const waterline = container.querySelector('[data-device="anonymous-waterline"]');

    expect(above, '水线之上缺一块').not.toBeNull();
    expect(below, '水线之下缺一块').not.toBeNull();
    expect(waterline, '缺水线本身').not.toBeNull();

    // 三条边界的**分布**：2 上 1 下 —— 这正是这一页的装置
    expect(above?.querySelectorAll('li')).toHaveLength(2);
    expect(below?.querySelectorAll('li')).toHaveLength(1);

    // 水线必须在两者**之间**（DOM 顺序 + 视觉顺序同一口径）
    const follows = (a: Element, b: Element): boolean =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(above as Element, waterline as Element), '水线不在线上内容之后').toBe(true);
    expect(follows(waterline as Element, below as Element), '水线不在线下内容之前').toBe(true);
  });

  it('线两侧各写清自己是什么（水线不是一根无字的分隔线）', async () => {
    await renderSettings();
    expect(screen.getByText('水面之上 · 别人看得到的')).toBeInTheDocument();
    expect(screen.getByText('水面之下 · 只有你自己知道的')).toBeInTheDocument();
  });

  it('三条边界的原文都在（不许为了排版删掉哪一条）', async () => {
    await renderSettings();
    expect(screen.getByText(/每支瓶子一个独立代号/)).toBeInTheDocument();
    expect(screen.getByText(/公开评论显示账号/)).toBeInTheDocument();
    expect(screen.getByText(/私密留言送达后/)).toBeInTheDocument();
  });
});

/**
 * 设置页 · **逐值复核**（`docs/impl-plan-record-v1.md` §5.5：精确值一律以同名 `.html` 为准）。
 * 设计稿 = `docs/ui-review/design-explore/p-settings-record.html`。
 * 样式值（字号 / 字距 / 透明度 / 宽度）用**源码级断言**钉住（jsdom 无渲染，看 class 串）；
 * 文案用 DOM 断言。整改前这些断言会红（Red → Green 的证据在交付汇报里）。
 */
describe('设置页 · 逐值对齐 p-settings-record.html', () => {
  const source = (): string =>
    readFileSync(join(process.cwd(), 'src', 'pages', 'settings-page.tsx'), 'utf8').replace(
      /\s+/g,
      ' ',
    );

  it('页头：h1 桌面 58px；导语 14.5px/1.85 且宽 500px；封面元信息 11px/.24em 且是 paper/.5', () => {
    const src = source();
    expect(src, 'h1 桌面档应是设计稿的 58px（不是 56px）').toContain('md:text-[3.625rem]');
    expect(src).not.toContain('md:text-[3.5rem]');
    expect(src, '导语 14.5px/1.85').toContain('text-[0.90625rem] leading-[1.85]');
    expect(src, '导语宽 500px').toContain('max-w-[500px]');
    expect(src, '.cat 是 rgba(243,249,250,.5) = paper/50，不是 muted/70').toContain(
      'text-[0.6875rem] tracking-[0.24em] text-paper/50',
    );
  });

  it('h2 = 17px/700/1.3 + h2.block 的 1px 下边框与 11px 内距（设计稿不是 19px/600）', () => {
    const src = source();
    expect(src, '17px/700/1.3').toContain('text-[1.0625rem] font-bold leading-[1.3]');
    expect(src, 'h2.block 的下边框').toContain('border-b border-line/13 pb-[11px]');
    expect(src, '旧 19px/600 应清掉').not.toContain('text-[1.1875rem] font-semibold');
    expect(src, '行分隔从 h2 边框走，ol 不再顶一条 border-t').not.toContain(
      'border-t border-line/13 pt-4',
    );
  });

  it('三条边界：桌面正文 15.5px；序号 14px（水上 water-mid/.5、水下 paper/.36）', () => {
    const src = source();
    expect(src, '桌面正文 15.5px').toContain('md:text-[0.96875rem]');
    expect(src, '序号 14px + 水上色').toContain('text-[0.875rem] text-water-mid/50');
    expect(src, '水下序号更深一档').toContain('text-[0.875rem] text-paper/[0.36]');
  });

  it('水线两侧图例：上行 water-mid/.62、短线 10px；下行 muted/.7（设计稿 .cap.up/.cap.dn）', () => {
    const src = source();
    expect(src, '.cap.up 色 = rgba(203,238,246,.62)').toContain('text-water-mid/[0.62]');
    expect(src, '.cap.up::before = water-mid/.5、宽 10px').toContain(
      'h-px w-[10px] bg-water-mid/50',
    );
    expect(src, '.cap.dn::before = paper/.28、宽 10px').toContain('h-px w-[10px] bg-paper/[0.28]');
    expect(src, '.cap.dn 色 = muted/.7').toContain('text-muted/70');
  });

  it('当前身份 = .who：19px/700 + coral 记号（2×19px、右距 11px）+ 设计稿的「已登录态」行', async () => {
    const src = source();
    expect(src, '.who 19px/700 paper').toContain('text-[1.1875rem] font-bold text-paper');
    expect(src, 'coral 记号 2×19px').toContain('h-[19px] w-0.5 bg-coral');
    expect(src, '记号右距 11px').toContain('mr-[11px]');

    renderWithProviders(<SettingsPage />, {
      route: '/settings',
      handlers: handlers(() => ({ body: METADATA })),
    });
    await screen.findByRole('heading', { name: '匿名的边界' });
    expect(screen.getByText('已登录态')).toBeInTheDocument();
    expect(screen.getByText('用账号认领你的接唱与收藏')).toBeInTheDocument();
    expect(screen.getByText('已登录态')).toHaveClass('text-paper/[0.42]');
  });

  it('契约版本是两段：标签 11px/.24em paper/.5 + 值 18px/.04em（不是合成一行）', async () => {
    const src = source();
    expect(src, '值 18px/.04em').toContain('text-[1.125rem] tracking-[0.04em]');

    renderWithProviders(<SettingsPage />, {
      route: '/settings',
      handlers: handlers(() => ({ body: METADATA })),
    });
    const label = await screen.findByText('契约版本');
    expect(label.textContent).not.toContain(CONTRACT_VERSION);
    expect(screen.getByText(CONTRACT_VERSION)).toBeInTheDocument();
  });

  it('伴奏说明 13.5px/1.8；环境说明与登出注 12.5px/1.75（设计稿 .body/.env/.note）', () => {
    const src = source();
    expect(src, '伴奏说明 13.5px/1.8').toContain('text-[0.84375rem] leading-[1.8]');
    const envAndNote = src.match(/text-\[0\.78125rem\] leading-\[1\.75\]/g) ?? [];
    expect(envAndNote.length, '环境说明 + 登出注各一处').toBeGreaterThanOrEqual(2);
  });

  it('折页纸面：干半 water-bed/90（58.8% 高）、湿半 water-bed/45 + 水膜 —— 湿的那半才透出沟槽', () => {
    const src = source();
    expect(src, '干半（设计稿 .leaf-dry ≈ .9 不透）').toContain('h-[58.8%] bg-water-bed/90');
    expect(src, '湿半（设计稿 .leaf-wet ≈ .32–.56 半透）').toContain('h-[41.2%] bg-water-bed/45');
    expect(src, '湿纸水膜 .film = glass/.07→0').toContain('from-glass/[0.07]');
    expect(src, '单层 25% 的旧纸面应清掉').not.toContain('bg-water-bed/25');
  });

  it('瓶上的代号签 12.5px/.18em 暖色；小注 11px/.16em paper/.5（设计稿两档字距）', () => {
    const src = source();
    expect(src, '代号/账号签的暖色底与描边').toContain('border border-warm/[0.55] bg-warm/[0.18]');
    const chips = src.match(/text-\[0\.78125rem\] tracking-\[0\.18em\] text-warm\/95/g) ?? [];
    expect(chips.length, '「代号」与「账号」各一枚').toBeGreaterThanOrEqual(2);
    const tinies = src.match(/text-\[0\.6875rem\] tracking-\[0\.16em\] text-paper\/50/g) ?? [];
    expect(tinies.length, '「你的声音」与「倒影 · 账号与邮箱」').toBeGreaterThanOrEqual(2);
  });

  it('关键块有 data-anchor（机器判据：settings-attribution 进 375 首屏）', () => {
    expect(source()).toContain('data-anchor="settings-attribution"');
  });
});

/**
 * 逐块照抄 p-settings-record.html 的结构断言（用户返工令）。
 * 值来源 = apps/web/docs/review-settings-blocks.md；每条对应稿里一个可指认的块。
 */
describe('设置页 · 照稿结构（review-settings-blocks）', () => {
  // 注：上面逐值 describe 的 source() 在其闭包内 —— 本 describe 自带同款读取器（折叠空白）
  const source = (): string =>
    readFileSync(join(process.cwd(), 'src', 'pages', 'settings-page.tsx'), 'utf8').replace(
      /\s+/g,
      ' ',
    );

  it('页面级背景层五件套在（稿 §1：air/sea/shaft/grooves-wet/surf，水线 y=520≈57.8%）', () => {
    const src = source();
    expect(src).toContain('data-device="sheet-air"');
    expect(src).toContain('data-device="sheet-sea"');
    expect(src).toContain('data-device="sheet-shaft"');
    expect(src).toContain('data-device="sheet-grooves"');
    expect(src).toContain('data-device="sheet-surf"');
  });

  it('导语后有 rule 分隔线（稿 §5.1：.rule mt26 1px）', () => {
    expect(source(), '缺 rule').toContain('mt-[26px] h-px bg-line/13');
  });

  it('登出区前有 hr（稿 §5.4：.hr mt18 1px）', () => {
    expect(source(), '缺 hr').toContain('mt-[18px] h-px bg-line/13');
  });

  it('h1 加 .01em 字距（稿 §5.1：58px/700/ls .01em）', () => {
    const src = source();
    expect(src).toContain('text-[3.625rem]');
    expect(src).toContain('tracking-[0.01em]');
  });

  it('瓶是稿的完整构件（§4：身/肩/颈/唇/塞 + 7 根声波 + 两圈涟漪）', () => {
    // 循环渲染的 data-part 源码里只有 1 处 ⇒ 用 DOM 计数（不靠源码文本计数）
    const { container } = renderWithProviders(<SettingsPage />, {
      route: '/settings',
      handlers: handlers(() => ({ body: METADATA })),
    });
    const bottle = container.querySelector('[data-device="sheet-bottle"]');
    expect(bottle, '缺瓶装置').not.toBeNull();
    expect(bottle?.querySelectorAll('[data-part="wave-bar"]').length, '声波 7 根').toBe(7);
    expect(
      (bottle?.querySelectorAll('[data-part="rip"]') ?? []).length,
      '涟漪 a/b 两圈',
    ).toBeGreaterThanOrEqual(2);
    expect(bottle?.querySelector('[data-part="bot-cork"]'), '软木塞').not.toBeNull();
    expect(bottle?.querySelector('[data-part="contact"]'), '接触亮水皮').not.toBeNull();
  });

  it('水线内嵌 6 条反光短划（稿 §3：wline 六 dash）', () => {
    const { container } = renderWithProviders(<SettingsPage />, {
      route: '/settings',
      handlers: handlers(() => ({ body: METADATA })),
    });
    expect(
      container.querySelectorAll('[data-part="wline-dash"]').length,
      '反光短划 6 条',
    ).toBe(6);
  });
});

describe('设置页 · SVG 属性合法性（t7：t6 发现的非法 rx 回归守卫）', () => {
  it('rect 的 rx 只允许单值（CSS 四角语法 "2 2 4 4" 是非法 SVG —— 控制台报错、圆角静默失效）', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'pages', 'settings-page.tsx'), 'utf8');
    expect(src, '出现含空白的非法多值 rx').not.toMatch(/rx="[^"]*\s[^"]*"/);
  });
});
