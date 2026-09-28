import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BOTTLE_ID, USER_A, USER_B, bottleDetail } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { BottlePage } from '../bottle-page';

/**
 * t17 深度复刻返工：`/bottles/:id` 与 `site/bottle.html` 逐块对齐（用户打回「还是很丑」）。
 *
 * 参考的构图分三层（`site/patches/bottle.css` 头注）：
 * 1. **场景层** `.bp-scene`：水面上下环境层 + 瓶身剖面 SVG（`svg.scene`，1440×900，水面 y=430）；
 * 2. **标注层**（挂在剖面刻度上）：`.heroLab` / `.segNum` / `.segLab` / `.cap` / `.gapBox` /
 *    `.selMark` / `.callout` / `.corkLab` + 上部 `.bp-timeline` 时间轴；
 * 3. **仪器层**（下层仪器，--uv 落位）：标题区 / `.listenCol`（试听与投票 + 放回）/
 *    `.destCol`（三条水路）/ `.bottomRule` + `.bottom`。
 *
 * 本文件钉住**结构与坐标系**（jsdom 无布局 ⇒ 真机几何由 `docs/ui-review/t17-probe.mjs`
 * 在与参考同数据状态下对照，那份对照表是验收证据）。
 */
function cssSource(): string {
  return readFileSync(join(process.cwd(), 'src', 'pages', 'bottle-page.css'), 'utf8');
}

const songsHandler = { path: '/api/songs', respond: () => ({ body: [] }) };
const SESSION_B = {
  user: { id: USER_B, handle: '接棒的人', email: 'b@example.com', role: 'USER' },
  expiresAt: '2026-10-23T00:00:00.000Z',
};
const sessionHandler = { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) };

/** 他人持有、已录第 1 段（缺口 [2,3,4]）：观看者 B 看得到剖面、缺口簇（不可录）与两条水路。 */
function handlersOneOfFour() {
  return [
    sessionHandler,
    {
      path: `/api/bottles/${BOTTLE_ID}`,
      respond: () => ({
        body: bottleDetail({
          isHolder: false,
          holderId: USER_A,
          availableResolutions: ['RIVER', 'SEA'],
          missingSegmentIndexes: [2, 3, 4],
        }),
      }),
    },
    songsHandler,
  ];
}

describe('瓶身详情：三层场景（参考 bottle.html 结构）', () => {
  it('场景层在位：环境层 .bp-scene + 剖面 SVG（svg.scene，aria-hidden 装饰）', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: handlersOneOfFour(),
    });
    await screen.findByText(/漂流瓶详情/);
    expect(document.querySelector('.bp-scene'), '缺环境场景层').not.toBeNull();
    const scene = document.querySelector('[data-testid="bottle-body"] svg.scene');
    expect(scene, '缺瓶身剖面 SVG').not.toBeNull();
    expect(scene!.getAttribute('aria-hidden')).toBe('true');
  });

  it('标注层在位：heroLab + 每列 segNum/segLab/cap + callout + corkLab', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: handlersOneOfFour(),
    });
    await screen.findByText(/漂流瓶详情/);
    expect(document.querySelector('[data-testid="bottle-water-level"].heroLab')).not.toBeNull();
    expect(document.querySelectorAll('.segNum')).toHaveLength(4);
    expect(document.querySelectorAll('.segLab')).toHaveLength(4);
    expect(document.querySelector('.cap .code')).not.toBeNull();
    expect(document.querySelector('.callout'), '缺「河道水面」图注').not.toBeNull();
    expect(document.querySelector('.corkLab'), '缺「瓶塞」图注').not.toBeNull();
  });

  it('缺口簇常驻：不可录的观看者也看得到缺口槽 + 「第 N 段还空着」+ 说明（不藏、无假 CTA）', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: handlersOneOfFour(),
    });
    await screen.findByText(/漂流瓶详情/);
    const box = document.querySelector('.gapBox');
    expect(box, '缺口簇被藏起来了（参考是常驻的）').not.toBeNull();
    expect(box!.querySelector('.gapSlot')).not.toBeNull();
    expect(box!.textContent).toContain('缺口');
    expect(box!.textContent).toContain('第 2 段还空着');
    expect(box!.textContent).toContain('录不了');
    expect(screen.queryByRole('button', { name: '录第 2 段' })).not.toBeInTheDocument();
  });
});

describe('瓶身详情：仪器层（试听与投票 / 选择去向 / 底栏）', () => {
  it('试听与投票 = 参考的 transport 构图：唱片播放键 .play + 水道进度 .bar + 时长 .timecode', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: handlersOneOfFour(),
    });
    const play = await screen.findByRole('button', { name: /^播放第 \d+ 段$/ });
    expect(play.closest('.transport'), '播放键不在 .transport 里').not.toBeNull();
    expect(document.querySelector('.transport .bar'), '缺水道进度条 .bar').not.toBeNull();
    expect(document.querySelector('.transport .timecode'), '缺时长 .timecode').not.toBeNull();
    expect(document.querySelector('.listenCol .votes'), '缺投票行 .votes').not.toBeNull();
    expect(document.querySelector('.listenCol .votesNote'), '缺门槛说明 .votesNote').not.toBeNull();
    expect(document.querySelector('.listenCol .putBack'), '缺放回行 .putBack').not.toBeNull();
  });

  it('选择去向 = 参考的 .destCol + .destRow 行块（服务端给几条画几条）', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: handlersOneOfFour(),
    });
    await screen.findByText(/漂流瓶详情/);
    const col = document.querySelector('.destCol');
    expect(col, '缺 .destCol').not.toBeNull();
    expect(col!.querySelectorAll('.destRow')).toHaveLength(2);
    expect(col!.querySelector('.destRow .t')?.textContent).toBe('继续投河');
  });

  it('底栏 = 参考的 .bottomRule + .bottom（漂流日志 / 记账 / 私密留言 / 举报）', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: handlersOneOfFour(),
    });
    await screen.findByText(/漂流瓶详情/);
    expect(document.querySelector('.bottomRule'), '缺底栏分隔线').not.toBeNull();
    const bottom = document.querySelector('.bottom');
    expect(bottom, '缺底栏').not.toBeNull();
    expect(bottom!.textContent).toContain('看这只瓶子的漂流日志');
    expect(
      within(bottom as HTMLElement).getByRole('button', { name: /私密留言/ }),
    ).toBeInTheDocument();
    expect(within(bottom as HTMLElement).getByRole('button', { name: /举报/ })).toBeInTheDocument();
  });
});

/**
 * 坐标系（`site/patches/bottle.css` 逐值）：场景与标注用 `--u = max(100vw/1440, 100dvh/900)`（cover），
 * 下层仪器用 `--uv = min(...)`（contain），顶栏让位 `--nav-reserve`；矮窗（≤800px）压间距不动字号。
 * 真机坐标由 `docs/ui-review/t17-probe.mjs` 对照（与参考页同数据状态）。
 */
describe('瓶身详情：坐标系照抄 patches/bottle.css（源码钉住）', () => {
  it('--u / --uv / --nav-reserve 三件套齐全', () => {
    const css = cssSource();
    expect(css).toMatch(/--u:\s*max\(calc\(100vw \/ 1440\),\s*calc\(100dvh \/ 900\)\)/);
    expect(css).toMatch(/--uv:\s*min\(calc\(100vw \/ 1440\),\s*calc\(100dvh \/ 900\)\)/);
    expect(css).toMatch(/--nav-reserve/);
  });

  it('标注层纵向锚点按 --u（heroLab 272 / 格顶 320 / 段名 +36=356 / 段位卡 +138=458 / gapBox 402）', () => {
    const css = cssSource();
    expect(css).toMatch(/\.heroLab\s*\{[^}]*272\s*\*\s*var\(--u\)/);
    expect(css, '段位格顶 = 参考 320·u').toMatch(/\.bp-cell\s*\{[^}]*320\s*\*\s*var\(--u\)/);
    expect(css, '段名 = 参考 356·u（格顶 +36·u）').toMatch(/\.segLab\s*\{[^}]*36\s*\*\s*var\(--u\)/);
    expect(css, '段位卡 = 参考 458·u（格顶 +138·u）').toMatch(/\.cap\s*\{[^}]*138\s*\*\s*var\(--u\)/);
    expect(css).toMatch(/\.gapBox\s*\{[^}]*402\s*\*\s*var\(--u\)/);
  });

  it('下层仪器按 --uv 落位（两栏带 top 630、各占参考宽度；底栏 bottom 48/19）', () => {
    const css = cssSource();
    expect(css).toMatch(/\.bp-cols\s*\{[^}]*630\s*\*\s*var\(--uv\)/);
    expect(css).toMatch(/\.listenCol\s*\{[^}]*width:\s*42\.639%/);
    expect(css).toMatch(/\.destCol\s*\{[^}]*width:\s*44\.722%/);
    expect(css).toMatch(/\.bottomRule\s*\{[^}]*bottom:\s*calc\(48\s*\*\s*var\(--uv\)\)/);
    expect(css).toMatch(/\.bottom\s*\{[^}]*bottom:\s*calc\(19\s*\*\s*var\(--uv\)\)/);
  });

  it('矮窗（≤800px）只压间距不动字号（参考 @media max-height:800px 那一段）', () => {
    expect(cssSource()).toMatch(/@media\s*\(max-height:\s*800px\)/);
  });

  it('时间轴为说明行留出间距，1024×720 使用紧凑坐标且仍保持左基线', () => {
    const css = cssSource();
    expect(css).toMatch(/\.bp-timeline\s*\{[^}]*228\s*\*\s*var\(--u\)/);
    expect(css).toMatch(/\.bp-timeline\s*\{[^}]*left:\s*5\.278%/);
    expect(css).toMatch(
      /@media\s*\(min-width:\s*1024px\)\s*and\s*\(max-width:\s*1199px\)\s*and\s*\(max-height:\s*800px\)[\s\S]*?\.bp-timeline\s*\{[^}]*top:\s*198px/,
    );
  });
});
