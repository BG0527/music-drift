import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BOTTLE_ID, USER_A, bottleSummary } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { ProfilePage } from '../profile-page';
import { SettingsPage } from '../settings-page';

const SESSION = {
  user: { id: USER_A, handle: '午夜歌手', account: '午夜歌手', role: 'USER' },
  expiresAt: '2026-10-23T00:00:00.000Z',
};

function authedHandlers() {
  return [
    { path: '/api/auth/me', respond: () => ({ body: SESSION }) },
    {
      path: '/api/me/anonymous-codes',
      respond: () => ({ body: [{ bottleId: BOTTLE_ID, code: '午夜歌手#042' }] }),
    },
  ];
}

describe('个人中心', () => {
  it('显示账号身份，但**不显示任何匿名代号**（用户裁决：系统里不存在"你的代号"）', async () => {
    renderWithProviders(<ProfilePage />, { route: '/me', handlers: authedHandlers() });
    expect(await screen.findByText('午夜歌手')).toBeInTheDocument();
    expect(screen.queryByText('a@example.com')).not.toBeInTheDocument();
    // 代号是"每瓶一个"（CONTEXT §12.1），个人中心不该出现这一块
    expect(screen.queryByText('你的匿名代号')).not.toBeInTheDocument();
    expect(screen.queryByText('午夜歌手#042')).not.toBeInTheDocument();
  });

  it('「通知」区块把三类写入的消息呈现成可读文案（未送达 / 已完成）', async () => {
    const bottleId = '8f1d6c2e-0f1a-4a1e-9f2b-aaaaaaaaaaaa';
    renderWithProviders(<ProfilePage />, {
      route: '/me',
      handlers: [
        ...authedHandlers(),
        {
          path: /\/api\/notifications/,
          respond: () => ({
            body: {
              items: [
                {
                  id: '11111111-1111-4111-8111-111111111111',
                  type: 'MESSAGE_UNDELIVERED',
                  payload: { bottleId, messageId: '22222222-2222-4222-8222-222222222222' },
                  readAt: null,
                  createdAt: '2026-09-23T02:00:00.000Z',
                },
                {
                  id: '33333333-3333-4333-8333-333333333333',
                  type: 'BOTTLE_COMPLETED',
                  payload: { bottleId, songTitle: '深海鲸落', isComplete: true },
                  readAt: '2026-09-23T03:00:00.000Z',
                  createdAt: '2026-09-23T03:00:00.000Z',
                },
              ],
              nextCursor: null,
            },
          }),
        },
      ],
    });
    expect(await screen.findByText('你的留言未送达')).toBeInTheDocument();
    expect(screen.getByText(/深海鲸落/)).toBeInTheDocument();
    expect(screen.getByText('未读')).toBeInTheDocument();
    expect(screen.getByText('已读')).toBeInTheDocument();
  });

  it('「我参与过的漂流瓶」来自服务端（不再有"本机记录"这种说法）', async () => {
    renderWithProviders(<ProfilePage />, {
      route: '/me',
      handlers: [
        ...authedHandlers(),
        {
          path: /\/api\/me\/bottles/,
          respond: () => ({
            body: {
              items: [
                {
                  ...bottleSummary({ status: 'IN_RIVER', seaZone: null, isComplete: false }),
                  role: 'SINGER',
                  mySegmentIndexes: [2],
                },
              ],
              nextCursor: null,
            },
          }),
        },
      ],
    });

    expect(await screen.findByText('我参与过的漂流瓶')).toBeInTheDocument();
    // 标题先渲染、数据后到：行内容必须用 findBy* 等（同步 getBy* 会撞上骨架态）
    expect(await screen.findByText('我接唱的')).toBeInTheDocument();
    expect(screen.getByText('深海鲸落')).toBeInTheDocument();
    // 换了服务端口径之后，不能再出现"本机记录 / 换浏览器看不到"这类临时态说法
    expect(screen.queryByText(/本机记录/)).not.toBeInTheDocument();
    expect(screen.queryByText(/这台设备参与过的瓶子/)).not.toBeInTheDocument();
  });

  /**
   * 构图（p-profile-record.html 实测：列表窗在 `top:250` 的上排、消息在 `top:596` 的下排）：
   * **窗口在上、消息在下**。移动端单列沿用同一 DOM 顺序 —— 若通知排在列表窗之前，
   * 375 下 `me-bottles` 锚点会被通知区顶出首屏（one-screen 手机口径必红）。
   */
  it('构图：列表窗（我参与过的漂流瓶）排在「通知」之前——窗口在上、消息在下', async () => {
    const { container } = renderWithProviders(<ProfilePage />, {
      route: '/me',
      handlers: [
        ...authedHandlers(),
        { path: /\/api\/notifications/, respond: () => ({ body: { items: [], nextCursor: null } }) },
        { path: /\/api\/me\/bottles/, respond: () => ({ body: { items: [], nextCursor: null } }) },
      ],
    });

    expect(await screen.findByText('我参与过的漂流瓶')).toBeInTheDocument();
    const bottles = container.querySelector('[data-anchor="me-bottles"]');
    const notifications = container.querySelector('#notifications-heading');
    expect(bottles, '缺列表窗锚点 me-bottles').not.toBeNull();
    expect(notifications, '缺通知区标题').not.toBeNull();
    const follows =
      bottles !== null && notifications !== null
        ? bottles.compareDocumentPosition(notifications) & Node.DOCUMENT_POSITION_FOLLOWING
        : 0;
    expect(follows, '通知排在列表窗之前 ⇒ 375 下 me-bottles 锚点被顶出首屏').toBeTruthy();
  });
});

/**
 * t17 深度复刻（用户打回后按参考对齐）：页头**不再有第二条导航**（`site/me.html` 只有
 * cat/h1/sub 三件），横向出口由两处承担 ——
 * ① 空态：窗内两个出口（参考 `showEmpty(target=windowBox)` 的位置）；
 * ② 非空态：每张卡片自己的「去看这个瓶子 / 漂流日志」；河道/公海两枚常显入口在**顶栏**
 *    （`top-nav`「入口常显（无收起态）」，app-shell 测试钉住）—— 同样是"任何状态下都在"。
 */
describe('我的：横向出口（参考结构：页头无第二导航，出口常显）', () => {
  it('非空态（有瓶子）：每张卡片带「去看这个瓶子 / 漂流日志」出口（页头不再挂导航）', async () => {
    const { container } = renderWithProviders(<ProfilePage />, {
      route: '/me',
      handlers: [
        ...authedHandlers(),
        {
          path: /\/api\/notifications/,
          respond: () => ({ body: { items: [], nextCursor: null } }),
        },
        {
          path: /\/api\/me\/bottles/,
          respond: () => ({
            body: {
              items: [
                {
                  ...bottleSummary({ status: 'IN_RIVER', seaZone: null, isComplete: false }),
                  role: 'SINGER',
                  mySegmentIndexes: [2],
                },
              ],
              nextCursor: null,
            },
          }),
        },
      ],
    });

    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '去看这个瓶子' })).toHaveAttribute(
      'href',
      `/bottles/${BOTTLE_ID}`,
    );
    expect(screen.getByRole('link', { name: '漂流日志' })).toHaveAttribute(
      'href',
      `/bottles/${BOTTLE_ID}/log`,
    );
    // 参考页头没有第二条导航
    expect(container.querySelector('header nav')).toBeNull();
  });

  it('空态：出口落在窗内（去河道捞一个 / 自己发起一支），页头仍无导航', async () => {
    const { container } = renderWithProviders(<ProfilePage />, {
      route: '/me',
      handlers: [
        ...authedHandlers(),
        {
          path: /\/api\/notifications/,
          respond: () => ({ body: { items: [], nextCursor: null } }),
        },
        { path: /\/api\/me\/bottles/, respond: () => ({ body: { items: [], nextCursor: null } }) },
      ],
    });

    const text = await screen.findByText(/你还没有参与过任何漂流瓶/);
    const win = text.closest('.window');
    expect(win, '空态出口必须在窗内（参考 showEmpty target=windowBox）').not.toBeNull();
    expect(screen.getByRole('link', { name: '去河道捞一个' })).toHaveAttribute('href', '/river');
    expect(screen.getByRole('link', { name: '自己发起一支' })).toHaveAttribute('href', '/new');
    expect(container.querySelector('header nav')).toBeNull();
  });
});

describe('设置页（Figma 无此帧，captain 裁决必须补最简版）', () => {
  it('准确说明社交身份边界，不再宣传绝对匿名或邮箱', async () => {
    renderWithProviders(<SettingsPage />, { route: '/settings', handlers: authedHandlers() });
    await screen.findByRole('heading', { name: '设置' });
    expect(screen.queryAllByText(/邮箱/)).toHaveLength(0);
    expect(screen.getByText(/公开评论显示账号/)).toBeInTheDocument();
    expect(screen.getByText(/私密留言送达后/)).toBeInTheDocument();
  });
  it('展示匿名原则、契约版本与登出入口', async () => {
    renderWithProviders(<SettingsPage />, { route: '/settings', handlers: authedHandlers() });
    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '匿名的边界' })).toBeInTheDocument();
    expect(screen.getByText(/契约版本/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /登出/ })).toBeInTheDocument();
  });

  it('登出后回到登录页（并且不再显示身份）', async () => {
    const { fetchMock } = renderWithProviders(<SettingsPage />, {
      route: '/settings',
      handlers: [
        ...authedHandlers(),
        { method: 'POST', path: '/api/auth/logout', respond: () => ({ status: 204 }) },
      ],
    });
    fireEvent.click(await screen.findByRole('button', { name: /登出/ }));
    await waitFor(() => {
      expect(fetchMock.calls.some((call) => call.url === '/api/auth/logout')).toBe(true);
    });
    await waitFor(() => {
      expect(window.location.pathname).toBe('/login');
    });
  });
});

/**
 * 收藏 / 徽章的入口在「我的」里（§46.2：属于声明式/次要内容 ⇒ 入口 + 弹窗，不摊在首屏）。
 */
describe('我的：收藏入口', () => {
  it('收藏入口打开对应面板，退役徽章入口不出现', async () => {
    renderWithProviders(<ProfilePage />, {
      handlers: [
        ...authedHandlers(),
        { path: '/api/me/collections', respond: () => ({ body: [] }) },
        { path: '/api/me/badges', respond: () => ({ body: [] }) },
        { path: '/api/me/notifications', respond: () => ({ body: { items: [], nextCursor: null } }) },
        { path: '/api/me/bottles', respond: () => ({ body: { items: [], nextCursor: null } }) },
      ],
    });

    // 稿里 pocket 的 h3 与弹窗标题同名（照稿保留）⇒ 标题断言必须限定在 dialog 内，避免撞名
    fireEvent.click(await screen.findByRole('button', { name: '我的收藏' }));
    const collections = await screen.findByRole('dialog');
    expect(within(collections).getByRole('heading', { name: '我的收藏' })).toBeInTheDocument();

    // Modal 会把背景设为 inert；真实用户必须先关闭当前弹窗，不能穿透遮罩点击下一个入口。
    fireEvent.click(within(collections).getByRole('button', { name: '关闭' }));
    await waitFor(() => {
      expect(collections).not.toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: '我的徽章' })).not.toBeInTheDocument();
  });
});

/**
 * 装置断言（docs/impl-plan-record-v1.md §5.1 `/me` 行）：**内袋身份卡**。
 * 内袋 = 从柜里抽出来的唱片内套：中心孔是纸被挖掉的一块，透出来的标签盘**还没印字** ——
 * 这张唱片上不存在「你的代号」（用户裁决），所以卡上只放账号信息（handle / 邮箱 / 角色）。
 */
describe('我的：内袋身份卡（record-v1 装置）', () => {
  it('身份卡在 data-anchor=me-identity 上：账号三件套在卡内，且卡上没有「匿名代号」这一行', async () => {
    const { container } = renderWithProviders(<ProfilePage />, {
      route: '/me',
      handlers: [
        ...authedHandlers(),
        { path: /\/api\/notifications/, respond: () => ({ body: { items: [], nextCursor: null } }) },
        { path: /\/api\/me\/bottles/, respond: () => ({ body: { items: [], nextCursor: null } }) },
      ],
    });

    // 会话从 /api/auth/me 异步到达：先等到 handle 出现，再断言卡内容（否则读到的是加载态）
    expect(await screen.findByText('午夜歌手')).toBeInTheDocument();
    const sleeve = container.querySelector('[data-anchor="me-identity"]');
    expect(sleeve, '内袋身份卡（data-anchor=me-identity）必须在').not.toBeNull();
    expect(sleeve?.textContent).toContain('内袋');
    expect(sleeve?.textContent).toContain('午夜歌手');
    expect(sleeve?.textContent).not.toContain('a@example.com');
    // 参考 page-me.js：角色徽「管理员账号」只在真是管理员时出现，普通用户不打（稿里那枚是演示数据）
    expect(sleeve?.textContent).not.toContain('普通用户');
    expect(sleeve?.querySelector('.who .stamp')).toBeNull();
    // 用户裁决：不显示匿名代号 —— 卡上没有这一行；整页也没有**恰为**「匿名代号」的行
    //（副标题里解释"别人看到的是匿名代号"是合法文案，所以用整串匹配而不是正则子串）
    expect(sleeve?.textContent).not.toContain('匿名代号');
    expect(screen.queryByText('匿名代号')).not.toBeInTheDocument();
  });
});

/**
 * 返工令：把 profile-page **逐块照抄** `docs/ui-review/design-explore/p-profile-record.html`。
 * 这组是「按稿改红」的结构断言 —— 块名、层级、顺序、逐字文案都以稿 DOM 为准。
 */
describe('我的：p-profile-record.html 逐块照稿（返工）', () => {
  function structureHandlers() {
    return [
      ...authedHandlers(),
      {
        path: /\/api\/notifications/,
        respond: () => ({
          body: {
            items: [
              {
                id: '44444444-4444-4444-8444-444444444444',
                type: 'MESSAGE_DELIVERED',
                payload: { bottleId: BOTTLE_ID, songTitle: '深海鲸落' },
                readAt: null,
                createdAt: '2026-09-23T02:00:00.000Z',
              },
            ],
            nextCursor: null,
          },
        }),
      },
      {
        path: /\/api\/me\/bottles/,
        respond: () => ({
          body: {
            items: [
              {
                ...bottleSummary({
                  status: 'IN_RIVER',
                  seaZone: null,
                  isComplete: false,
                  recordedCount: 1,
                  missingSegmentIndexes: [2, 3, 4],
                }),
                role: 'INITIATOR',
                mySegmentIndexes: [1],
              },
              {
                ...bottleSummary({ id: '9f1d6c2e-0f1a-4a1e-9f2b-bbbbbbbbbbbb' }),
                role: 'SINGER',
                mySegmentIndexes: [2],
              },
            ],
            nextCursor: null,
          },
        }),
      },
    ];
  }

  it('页面自带 <main>：.waterlight 背景层 + header 逐字（eyebrow / h1 / lede），块顺序照稿', async () => {
    const { container } = renderWithProviders(<ProfilePage />, {
      route: '/me',
      handlers: structureHandlers(),
    });

    const main = container.querySelector('main.p-record');
    expect(main, '页面自带 <main class="p-record">（稿 main 的 padding 归页面自己）').not.toBeNull();
    expect(main?.querySelector('.waterlight'), '稿 .waterlight 背景层').not.toBeNull();

    const header = main?.querySelector('header');
    expect(header?.querySelector('.cat')?.textContent).toBe('ACCOUNT · 认领');
    expect(header?.querySelector('h1')?.textContent).toBe('我的');
    expect(header?.querySelector('.sub')?.textContent).toBe(
      '接唱时使用匿名代号；公开评论显示账号，私密留言送达后仅向双方显示账号。',
    );

    // 稿 DOM 顺序：waterlight → header → .bleed(内袋) → .crate(柜) → .bottom
    expect(main, '缺 .bleed 内袋出血层').not.toBeNull();
    expect(main?.querySelector('.bleed .sleeve'), '稿 .bleed > .sleeve').not.toBeNull();
    expect(main?.querySelector('.crate'), '稿 .crate 沉积柜').not.toBeNull();
    expect(main?.querySelector('.bottom'), '稿 .bottom 下区').not.toBeNull();
    const children = [...(main?.children ?? [])];
    const at = (selector: string) => children.indexOf(main!.querySelector(selector)!);
    expect(at('.waterlight')).toBeLessThan(at('header'));
    expect(at('.bleed')).toBeLessThan(at('.crate'));
    expect(at('.crate')).toBeLessThan(at('.bottom'));
  });

  it('稿 .sleeve 内袋卡：.stop/.hole>.label(r1,r2,hub)/.who(handle,mail,stamp)；无 .codeslot', async () => {
    const { container } = renderWithProviders(<ProfilePage />, {
      route: '/me',
      handlers: structureHandlers(),
    });

    expect(await screen.findByText('午夜歌手')).toBeInTheDocument();
    const sleeve = container.querySelector('.sleeve');
    expect(sleeve?.querySelector('.stop')?.textContent).toBe('内袋');
    const label = sleeve?.querySelector('.hole > .label');
    expect(label, '稿 .hole > .label').not.toBeNull();
    expect(label?.querySelector(':scope > i.r1')).not.toBeNull();
    expect(label?.querySelector(':scope > i.r2')).not.toBeNull();
    expect(label?.querySelector(':scope > i.hub')).not.toBeNull();
    expect(sleeve?.querySelector('.who .handle')?.textContent).toBe('午夜歌手');
    expect(sleeve?.querySelector('.who .mail')).toBeNull();
    // 参考 page-me.js：stamp 只在 ADMIN 出现（普通用户为 null，稿里那枚是演示数据）
    expect(sleeve?.querySelector('.who .stamp')).toBeNull();
    // 用户裁决：匿名代号行不出现 —— 稿的 .codeslot 不移植
    expect(sleeve?.querySelector('.codeslot')).toBeNull();
  });

  it('稿 .crate：.chead(共 N 支=真数据) + .csub + .window 行结构（lay/veil/r1/slot/role/t/d/lk）', async () => {
    const { container } = renderWithProviders(<ProfilePage />, {
      route: '/me',
      handlers: structureHandlers(),
    });

    // 计数位只填真数据：2 条 → 共 2 支（加载中不填假数）
    expect(await screen.findByText('共 2 支')).toBeInTheDocument();
    const crate = container.querySelector('.crate');
    expect(crate?.querySelector('.chead h2')?.textContent).toBe('我参与过的漂流瓶');
    expect(crate?.querySelector('.csub')?.textContent).toBe(
      '我发起的、以及我唱过一段的瓶子都会在这里（按最近活跃排序，时间线来自服务端）。',
    );

    const win = crate?.querySelector('.window');
    expect(win, '稿 .window 列表窗').not.toBeNull();
    const rows = win?.querySelectorAll('ul > li') ?? [];
    expect(rows).toHaveLength(2);
    const first = rows[0]!;
    expect(first.querySelector('.lay'), '行左沉积柱 .lay').not.toBeNull();
    expect(first.querySelectorAll('.lay i[data-segment]')).toHaveLength(4);
    expect(first.querySelector('.lay .b1')).not.toBeNull();
    expect(first.querySelector('.lay .b2')).not.toBeNull();
    expect(first.querySelector('.lay .b3')).not.toBeNull();
    expect(first.querySelector('.lay .b4')).not.toBeNull();
    expect(first.querySelector('.veil'), '稿 .veil 暗渐变幕').not.toBeNull();
    const txt = first.querySelector('.txt');
    expect(txt?.querySelector('.r1 .slot')?.textContent).toBe('01');
    expect(txt?.querySelector('.r1 .role')?.textContent).toBe('我发起的');
    expect(txt?.querySelector('.r1 .role.mine'), '发起者角色牌挂 .mine').not.toBeNull();
    expect(txt?.querySelector('.t')?.textContent).toBe('深海鲸落');
    expect((txt?.querySelectorAll('.d') ?? []).length).toBeGreaterThanOrEqual(2);
    const links = txt?.querySelectorAll('.lk a') ?? [];
    expect(links).toHaveLength(2);
    expect(links[0]?.textContent).toBe('去看这个瓶子');
    expect(links[1]?.textContent).toBe('漂流日志');
  });

  it('稿 .bottom：.msgs(h2 消息 + .msub + ul 里 .mrow/.lab/.pill/.go/.mdet) + .pockets 两个 .pocket', async () => {
    const { container } = renderWithProviders(<ProfilePage />, {
      route: '/me',
      handlers: structureHandlers(),
    });

    const bottom = container.querySelector('.bottom');
    const msgs = bottom?.querySelector('.msgs');
    expect(msgs?.querySelector('h2#notifications-heading')?.textContent).toBe('消息');
    expect(msgs?.querySelector('.msub')?.textContent).toBe(
      '只显示你自己的消息（留言送达 / 未送达 · 作品进公海）；别人的消息读不到，权限在服务端判定。',
    );

    // 标题先渲染、数据后到：行内容必须等通知到达（同步查询撞上骨架态）
    expect(await screen.findByText('收到一条私密留言')).toBeInTheDocument();
    const row = msgs?.querySelector('ul li:not(.hero)');
    expect(row, '通知行').not.toBeNull();
    expect(row?.querySelector('.mrow .lab')?.textContent).toBe('收到一条私密留言');
    expect(row?.querySelector('.mrow .pill')?.textContent).toBe('未读');
    expect(row?.querySelector('.mrow a.go')).toHaveAttribute('href', `/bottles/${BOTTLE_ID}`);
    expect(row?.querySelector('.mdet')?.textContent).toContain('留言已送达');

    const pockets = bottom?.querySelectorAll('.pockets > .pocket') ?? [];
    expect(pockets).toHaveLength(1);
    expect(pockets[0]?.querySelector('h3')?.textContent).toBe('我的收藏');
    expect(pockets[0]?.querySelector('p')?.textContent).toBe(
      '收藏只对已完成并进入公海的作品开放：听到想再听的，把它收起来。',
    );
    expect(pockets[0]?.querySelector('button')?.textContent).toBe('我的收藏');
  });
});

/**
 * 回传提示改挂稿的 `.msgs li.hero`（返工令：有 awaitingMyAction=true 才出现；三态行为必须保住）。
 * 行内「等你操作」暖牌仍在我参与过的瓶列表行里（稿 .window 行的 .st/.due），由 my-bottles 测试守。
 */
describe('回传提示：.msgs li.hero 三态（awaitingMyAction）', () => {
  function heroHandlers(awaiting: true | false | undefined) {
    const bottle = {
      ...bottleSummary({ status: 'IN_RIVER', seaZone: null, isComplete: false }),
      role: 'SINGER',
      mySegmentIndexes: [2],
      ...(awaiting === undefined ? {} : { awaitingMyAction: awaiting }),
    };
    return [
      ...authedHandlers(),
      { path: /\/api\/notifications/, respond: () => ({ body: { items: [], nextCursor: null } }) },
      { path: /\/api\/me\/bottles/, respond: () => ({ body: { items: [bottle], nextCursor: null } }) },
    ];
  }

  it('有一条 true → .msgs ul 首位出现 li.hero（稿文案：回传到你手里了）', async () => {
    const { container } = renderWithProviders(<ProfilePage />, {
      route: '/me',
      handlers: heroHandlers(true),
    });

    expect(await screen.findByText('《深海鲸落》回传到你手里了')).toBeInTheDocument();
    const hero = container.querySelector('.msgs ul li.hero');
    expect(hero, '回传提示必须是 .msgs 列表里的 li.hero').not.toBeNull();
    expect(hero?.textContent).toContain('完整版本已经沿父链回到发起者手里 —— 你只能把它送进公海。');
    expect(hero?.querySelector('.pill')?.textContent).toBe('未读');
    expect(hero?.querySelector('a.go')).toHaveAttribute('href', `/bottles/${BOTTLE_ID}`);
    expect(container.querySelector('.msgs ul')?.firstElementChild).toBe(hero);
  });

  it('字段缺失（契约 default(false)）→ hero 整块不出现', async () => {
    const { container } = renderWithProviders(<ProfilePage />, {
      route: '/me',
      handlers: heroHandlers(undefined),
    });

    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();
    expect(container.querySelector('.msgs ul li.hero')).toBeNull();
    expect(screen.queryByText(/回传到你手里了/)).not.toBeInTheDocument();
  });

  it('显式 false → 同样不出现（不靠"字段在不在"判断）', async () => {
    const { container } = renderWithProviders(<ProfilePage />, {
      route: '/me',
      handlers: heroHandlers(false),
    });

    expect(await screen.findByText('深海鲸落')).toBeInTheDocument();
    expect(container.querySelector('.msgs ul li.hero')).toBeNull();
    expect(screen.queryByText(/回传到你手里了/)).not.toBeInTheDocument();
  });
});

/**
 * one-screen 实测（/me）：1440 档 **横向溢出 scrollWidth=1584>1440**（根因：稿装饰层
 * `.waterlight` `left:-8% + width:118%` ⇒ 右沿 110% 视口 = 1584px）+ **整页高 1031>900**；
 * 375 档 **scrollWidth=413>375**（同一根因：-8%+118% ⇒ 412.5px）。修复点用源码钉住：
 * ① `.p-record` 水平裁剪出血（装饰不改形、裁在视口边）；
 * ② 超高只**收紧流体表达**（柜上段间距 / 列表窗高 / 下区内距走 clamp），四块构图不动。
 */
describe('我的：one-screen 门禁修复点（源码钉住）', () => {
  function pageSource(): string {
    // 源码读取用仓内已证模式（settings/river/admin 同款）：cwd = apps/web
    return readFileSync(join(process.cwd(), 'src', 'pages', 'profile-page.tsx'), 'utf8');
  }

  it('横向溢出：.p-record 设 overflow-x: clip（.waterlight 出血裁在视口边，1584/413 根因）', () => {
    expect(
      pageSource(),
      '缺 overflow-x:clip ⇒ 出血装饰仍把 scrollWidth 撑到 110% 视口',
    ).toMatch(/\.p-record\s*\{\s*overflow-x:\s*clip\s*\}/);
  });

  it('整页高：空隙走 --gap-* 三档直线（参考 W5-B），消息列定高内滚（真实库存量不撑破页面）', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'pages', 'profile-page.css'), 'utf8');
    expect(css, '缺 --gap-page 三档空隙').toMatch(/--gap-page:\s*clamp\(28px/);
    expect(css, '柜上间距必须走 --gap-crate（720↔900 直线，900 钉回定稿）').toMatch(
      /\.p-record \.crate\s*\{[^}]*margin-top:\s*var\(--gap-crate\)/,
    );
    expect(css, '消息列必须有高度上限（2987px 根因）').toMatch(
      /\.p-record \.msgs ul\s*\{[^}]*max-height:\s*clamp\(/,
    );
  });
});
