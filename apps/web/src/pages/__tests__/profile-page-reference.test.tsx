import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BOTTLE_ID, USER_A, bottleSummary } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { ProfilePage } from '../profile-page';

/**
 * t17 深度复刻返工：`/me` 与 `site/me.html` + `site/patches/me.css` 逐块对齐（用户打回）。
 *
 * 参考（W5-B 流体补丁）的构图：
 * - `main` = flex 纵向列，顶内边距 `max(--gap-page, 顶栏高)`；页头只有 `.cat / h1 / .sub`；
 * - `.sleeve` 内袋右上（顶距 = 8·u + 顶栏让位，高度同步减掉同一条）；
 * - `.crate` 回文档流（`--gap-crate` 上下），`.window` **定高 260px**，
 *   卡片 `.window li { flex: 1 }` **横贯整窗**（Tailwind 的 `li { max-width: 72ch }` 会把它掐到 691px ⇒ 右半窗空掉）；
 * - `.bottom` = `margin-top: auto` 的两列网格（消息 | 收藏+徽章）；
 * - 空态：**消息行落在 `.window` 内**（参考 showEmpty({target: windowBox})），没有独立右卡。
 */
function cssSource(): string {
  return readFileSync(join(process.cwd(), 'src', 'pages', 'profile-page.css'), 'utf8');
}

const SESSION = {
  user: { id: USER_A, handle: '午夜歌手', account: '午夜歌手', role: 'USER' },
  expiresAt: '2026-10-23T00:00:00.000Z',
};

function handlers(options: { bottles?: unknown[]; role?: 'USER' | 'ADMIN' } = {}) {
  const bottles = options.bottles ?? [];
  const role = options.role ?? 'USER';
  return [
    {
      path: '/api/auth/me',
      respond: () => ({ body: { ...SESSION, user: { ...SESSION.user, role } } }),
    },
    {
      // 正则匹配：客户端可能带查询串，精确字符串会漏匹配 ⇒ 落到 404 兜底
      path: /\/api\/me\/bottles/,
      respond: () => ({ body: { items: bottles, nextCursor: null } }),
    },
    { path: /\/api\/notifications/, respond: () => ({ body: { items: [], nextCursor: null } }) },
    { path: /\/api\/me\/collections/, respond: () => ({ body: { items: [], nextCursor: null } }) },
    { path: /\/api\/me\/badges/, respond: () => ({ body: { items: [] } }) },
  ];
}

describe('我的：页头与内袋（参考 me.html 结构）', () => {
  it('收藏占据完整口袋区域，不再提供徽章功能', async () => {
    renderWithProviders(<ProfilePage />, { route: '/me', handlers: handlers() });
    await screen.findByText('午夜歌手');
    expect(screen.queryByRole('button', { name: '我的徽章' })).not.toBeInTheDocument();
    expect(document.querySelectorAll('.pockets .pocket')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '我的收藏' })).toBeInTheDocument();
  });
  it('页头只有 cat / h1 / sub —— 不再多出一条站内去路导航（参考没有这一块）', async () => {
    renderWithProviders(<ProfilePage />, { route: '/me', handlers: handlers() });
    await screen.findByText('午夜歌手');
    const header = document.querySelector('.p-record header');
    expect(header, '缺页头').not.toBeNull();
    expect(header!.querySelector('.cat')).not.toBeNull();
    expect(header!.querySelector('h1')).not.toBeNull();
    expect(header!.querySelector('.sub')).not.toBeNull();
    expect(
      document.querySelector('nav[aria-label="站内去路"]'),
      '参考页头没有第二条导航（顶栏已提供去路）',
    ).toBeNull();
  });

  it('内袋卡在位：.sleeve > .hole（标签盘）+ .who（handle/mail）；角色徽只给管理员', async () => {
    renderWithProviders(<ProfilePage />, { route: '/me', handlers: handlers() });
    await screen.findByText('午夜歌手');
    const sleeve = document.querySelector('.sleeve');
    expect(sleeve).not.toBeNull();
    expect(sleeve!.querySelector('.hole .label')).not.toBeNull();
    expect(sleeve!.querySelector('.who .handle')).not.toBeNull();
    expect(sleeve!.querySelector('.who .mail')).toBeNull();
    // 参考 page-me.js：普通用户不打角色徽（稿里「管理员账号」那枚是演示数据）
    expect(sleeve!.querySelector('.who .stamp')).toBeNull();
  });

  it('管理员会话：内袋出现「管理员账号」徽（参考 show/hide 同款）', async () => {
    renderWithProviders(<ProfilePage />, {
      route: '/me',
      handlers: handlers({ role: 'ADMIN' }),
    });
    await screen.findByText('午夜歌手');
    expect(document.querySelector('.sleeve .who .stamp')?.textContent).toBe('管理员账号');
  });
});

describe('我的：参与列表区（.crate / .window）', () => {
  it('有参与：卡片进 .window 且成列表（lay 沉积柱 / veil / txt 文字区齐）', async () => {
    renderWithProviders(<ProfilePage />, {
      route: '/me',
      handlers: handlers({
        bottles: [
          {
            ...bottleSummary({ id: BOTTLE_ID, status: 'IN_RIVER', seaZone: null, isComplete: false }),
            role: 'SINGER',
            mySegmentIndexes: [2],
          },
        ],
      }),
    });
    await screen.findByText('深海鲸落'); // 等列表真的落地（chead 一出来就断言会撞上骨架）
    const win = document.querySelector('.window');
    expect(win, '缺 .window 列表窗').not.toBeNull();
    const cell = win!.querySelector('li');
    expect(cell, 'window 里没有卡片 li').not.toBeNull();
    expect(cell!.querySelector('.lay')).not.toBeNull();
    expect(cell!.querySelector('.veil')).not.toBeNull();
    expect(cell!.querySelector('.txt')).not.toBeNull();
  });

  it('空态：空态消息落在 .window 内（参考 showEmpty target=windowBox），没有独立右卡', async () => {
    renderWithProviders(<ProfilePage />, { route: '/me', handlers: handlers() });
    const win = await screen.findByText(/你还没有参与过任何漂流瓶/);
    expect(win.closest('.window'), '空态消息必须在列表窗里（左半屏不留白）').not.toBeNull();
    expect(document.querySelector('[data-device="crate-empty"]'), '参考没有独立空态右卡').toBeNull();
    expect(document.querySelector('[data-device="crate-band"]')).toBeNull();
    expect(screen.getByRole('link', { name: '去河道捞一个' })).toBeInTheDocument();
  });
});

describe('我的：坐标系照抄 patches/me.css（源码钉住）', () => {
  it('1024 桌面身份卡让出列表和底部区域，窄矮屏允许流式滚动', () => {
    const css = cssSource();
    expect(css).toContain('@media (min-width: 1024px) and (min-height: 720px)');
    expect(css).toMatch(/\.p-record \.bleed\s*\{\s*position: absolute;\s*inset: 0;/);
    expect(css).toContain('@media (max-width: 1023px), (max-height: 719px)');
  });
  it('参与瓶子数量增加时在柜内横向滚动，卡片不挤成不可读细条', () => {
    expect(cssSource()).toMatch(/\.p-record \.window ul\s*\{[^}]*overflow-x:\s*auto/);
    expect(cssSource()).toMatch(/\.p-record \.window li\s*\{[^}]*flex:\s*1 0 280px/);
  });
  it('--ux / --u 双尺 + 三档空隙变量（gap-page / gap-crate / gap-bottom）与矮窗收口', () => {
    const css = cssSource();
    expect(css).toMatch(/--ux:\s*calc\(100vw \/ 1440\)/);
    expect(css).toMatch(/--u:\s*calc\(100dvh \/ 900\)/);
    expect(css).toMatch(/--gap-page:\s*clamp\(28px/);
    expect(css).toMatch(/--gap-crate:\s*calc\(clamp\(20px/);
    expect(css).toMatch(/--gap-bottom:\s*calc\(clamp\(8px/);
    expect(css).toMatch(/--pad-msg-row:\s*clamp\(1\.5px/);
    expect(css).toMatch(/--nav-squeeze/);
  });

  it('顶栏让位：main 顶内边距 max(设计值, 顶栏高)；内袋顶距带 nav-sleeve-drop', () => {
    const css = cssSource();
    expect(css).toMatch(/padding:\s*max\(var\(--gap-page\),\s*var\(--top-nav-h/);
    expect(css).toMatch(/--nav-sleeve-drop:\s*max\(0px/);
    expect(css).toMatch(/\.p-record \.sleeve\s*\{[\s\S]*?height:[\s\S]*?--nav-sleeve-drop/);
  });

  it('列表窗定高 260（参考定稿），卡片不被 Tailwind 的 li max-width:72ch 掐窄', () => {
    const css = cssSource();
    expect(css, 'window 高度必须回到参考的 260px').toMatch(
      /\.p-record \.window\s*\{[^}]*height:\s*260px/,
    );
    expect(css, '缺 max-width:none ⇒ 卡片被 72ch 掐到 691px、右半窗空掉').toMatch(
      /\.p-record \.window li\s*\{[^}]*max-width:\s*none/,
    );
  });

  it('h1 字号随 --ux（clamp 40..58）；底部两栏 margin-top:auto 的两列网格', () => {
    const css = cssSource();
    expect(css).toMatch(/\.p-record h1\s*\{[\s\S]*?font-size:\s*clamp\(40px,\s*calc\(58\s*\*\s*var\(--ux\)\),\s*58px\)/);
    expect(css).toMatch(/\.p-record \.bottom\s*\{[^}]*margin-top:\s*auto/);
    expect(css).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*1fr\)/);
  });

  it('内袋孔与口袋内距按 --u 收放（hole clamp 140..168 / pocket 上下内距随视口高）', () => {
    const css = cssSource();
    expect(css).toMatch(/\.p-record \.hole\s*\{[^}]*width:\s*clamp\(140px,\s*calc\(168\s*\*\s*var\(--u\)\)/);
    expect(css).toMatch(/\.p-record \.pocket\s*\{[^}]*padding:[\s\S]*?100dvh/);
  });
});
