import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { USER_A } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { AdminPage } from '../admin-page';

function sessionWith(role: 'USER' | 'ADMIN') {
  return {
    user: { id: USER_A, handle: '管理员', email: 'a@example.com', role },
    expiresAt: '2026-10-23T00:00:00.000Z',
  };
}

/**
 * 审核台的权限口径：**服务端判定**，页面只做"别把队列渲染给非管理员"。
 * 这两条都要有：前端不渲染 + 服务端 403（后者在 api 集成测试里）。
 */
describe('审核台页面', () => {
  it('普通用户：不渲染队列、**也不打队列接口**，只给权限说明', async () => {
    const { fetchMock } = renderWithProviders(<AdminPage />, {
      route: '/admin',
      handlers: [{ path: '/api/auth/me', respond: () => ({ body: sessionWith('USER') }) }],
    });

    expect(await screen.findByText(/只对管理员开放/)).toBeInTheDocument();
    expect(fetchMock.calls.some((call) => call.url.includes('/api/admin/reports'))).toBe(false);
  });

  it('管理员：渲染待处理队列，并可通过历史视图拿到恢复入口', async () => {
    renderWithProviders(<AdminPage />, {
      route: '/admin',
      handlers: [
        { path: '/api/auth/me', respond: () => ({ body: sessionWith('ADMIN') }) },
        {
          path: /\/api\/admin\/reports/,
          respond: () => ({
            body: [
              {
                id: '22222222-2222-4222-8222-222222222222',
                targetType: 'SEGMENT',
                targetId: '11111111-1111-4111-8111-111111111111',
                reason: '这一段像是噪音',
                status: 'PENDING',
                action: null,
                createdAt: '2026-09-23T02:00:00.000Z',
                reviewedAt: null,
              },
            ],
          }),
        },
      ],
    });

    expect(await screen.findByRole('heading', { name: '审核台' })).toBeInTheDocument();
    expect(await screen.findByText('这一段像是噪音')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删段' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '历史裁决' })).toBeInTheDocument();
  });
});

/**
 * 审核台的装置是「**水线切开待处理 / 历史裁决 + 真印章**」
 * （record-v1，`docs/impl-plan-record-v1.md` §5.1）：
 * 待处理**浮在水线之上**、已裁决的历史**沉在水线之下**，历史每一行盖一枚印章。
 *
 * 机器判据（`one-screen-check.mjs`）的路由表里没有 `/admin`，所以装置是否还活着
 * 只能由这里钉住。与 `deep-surface-cta.test.ts` 同一手法：断言结构，不假装断言像素。
 */
describe('审核台 · 水线切开（浮上来的待处理 / 沉下去的历史裁决）', () => {
  const PENDING_REPORT = {
    id: '22222222-2222-4222-8222-222222222222',
    targetType: 'SEGMENT',
    targetId: '11111111-1111-4111-8111-111111111111',
    reason: '这一段像是噪音',
    status: 'PENDING',
    action: null,
    createdAt: '2026-09-23T02:00:00.000Z',
    reviewedAt: null,
  };

  const REVIEWED_REPORT = {
    id: '33333333-3333-4333-8333-333333333333',
    targetType: 'SEGMENT',
    targetId: '11111111-1111-4111-8111-111111111111',
    reason: '被误斩的申诉',
    status: 'REVIEWED',
    action: 'REMOVE_SEGMENT',
    createdAt: '2026-09-23T02:00:00.000Z',
    reviewedAt: '2026-09-23T03:00:00.000Z',
  };

  function adminHandlers() {
    return [
      { path: '/api/auth/me', respond: () => ({ body: sessionWith('ADMIN') }) },
      {
        path: /\/api\/admin\/reports/,
        respond: ({ url }: { url: string }) => ({
          body: url.includes('REVIEWED') ? [REVIEWED_REPORT] : [PENDING_REPORT],
        }),
      },
    ];
  }

  const follows = (a: Element, b: Element): boolean =>
    (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

  it('待处理浮在水线之上（水线是「待处理 / 历史」的分界，不是页脚装饰）', async () => {
    const { container } = renderWithProviders(<AdminPage />, {
      route: '/admin',
      handlers: adminHandlers(),
    });
    expect(await screen.findByText('这一段像是噪音')).toBeInTheDocument();

    const waterline = container.querySelector('[data-device="waterline"]');
    const pending = container.querySelector('[data-device="pending-above"]');
    expect(waterline, '缺水线').not.toBeNull();
    expect(pending, '缺待处理块').not.toBeNull();
    expect(follows(pending as Element, waterline as Element), '待处理没有浮在水线之上').toBe(true);
    // 水线两侧在讲什么，由**页脚那句话 + 两个 tab**说清（不另造标签）
    expect(
      screen.getByText('自动斩杀把可疑的段先拿下来；这里是可以推翻它的地方。'),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '待处理' })).toHaveAttribute('aria-selected', 'true');
  });

  it('切到历史裁决：裁决沉到水线之下，且每行盖一枚印章', async () => {
    const { container } = renderWithProviders(<AdminPage />, {
      route: '/admin',
      handlers: adminHandlers(),
    });
    expect(await screen.findByText('这一段像是噪音')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '历史裁决' }));

    // 历史视图要等**裁决数据落地**再看：列表整体走 AsyncBoundary，先渲染的是骨架
    const stamp = await waitFor(() => {
      const node = container.querySelector('[data-device="stamp"]');
      expect(node, '缺印章').not.toBeNull();
      return node;
    });
    const waterline = container.querySelector('[data-device="waterline"]');
    const below = container.querySelector('[data-device="history-below"]');
    expect(waterline).not.toBeNull();
    expect(below).not.toBeNull();
    expect(follows(waterline as Element, below as Element), '历史裁决没有沉在水线之下').toBe(true);
    expect(
      screen.getByText('自动斩杀把可疑的段先拿下来；这里是可以推翻它的地方。'),
    ).toBeInTheDocument();

    // 真印章：结论以印章形态出现（旋转 + coral 描边），不是一个绿色对勾
    expect(stamp).toHaveTextContent('已删段');
  });
});

/**
 * 审核台 · **逐值复核**（`docs/impl-plan-record-v1.md` §5.5：精确值以同名 `.html` 为准；
 * 设计稿 = `docs/ui-review/design-explore/s2-admin-record.html`）。
 * 样式值用源码级断言（jsdom 无渲染），导语逐字与真实计数用 DOM 断言；整改前这些断言会红。
 */
describe('审核台 · 逐值对齐 s2-admin-record.html', () => {
  const source = (): string =>
    readFileSync(join(process.cwd(), 'src', 'pages', 'admin-page.tsx'), 'utf8').replace(
      /\s+/g,
      ' ',
    );

  const PENDING_REPORT = {
    id: '22222222-2222-4222-8222-222222222222',
    targetType: 'SEGMENT',
    targetId: '11111111-1111-4111-8111-111111111111',
    reason: '这一段像是噪音',
    status: 'PENDING',
    action: null,
    createdAt: '2026-09-23T02:00:00.000Z',
    reviewedAt: null,
  };

  const REVIEWED_REPORT = {
    id: '33333333-3333-4333-8333-333333333333',
    targetType: 'SEGMENT',
    targetId: '11111111-1111-4111-8111-111111111111',
    reason: '被误斩的申诉',
    status: 'REVIEWED',
    action: 'REMOVE_SEGMENT',
    createdAt: '2026-09-23T02:00:00.000Z',
    reviewedAt: '2026-09-23T03:00:00.000Z',
  };

  function valueHandlers() {
    return [
      { path: '/api/auth/me', respond: () => ({ body: sessionWith('ADMIN') }) },
      {
        path: /\/api\/admin\/reports/,
        respond: ({ url }: { url: string }) => ({
          body: url.includes('REVIEWED') ? [REVIEWED_REPORT] : [PENDING_REPORT],
        }),
      },
    ];
  }

  it('导语逐字与设计稿一致（源码注记不进可见文案）且 14.5px/1.85、宽 820px', async () => {
    const src = source();
    expect(src, '源码注记不进可见文案').not.toContain('（CONTEXT §8）');
    expect(src, '导语 14.5px/1.85').toContain('text-[0.90625rem] leading-[1.85]');
    expect(src, '导语宽 820px').toContain('max-w-[820px]');

    renderWithProviders(<AdminPage />, { route: '/admin', handlers: valueHandlers() });
    expect(
      await screen.findByText(
        '人工审核是最终决定权：可以驳回、删段、删瓶下架、封禁作者。自动斩杀只负责「把可疑的段先拿下来」，误斩可以在历史里用「恢复这一段」还回去。',
      ),
    ).toBeInTheDocument();
  });

  it('元信息 paper/.5（设计稿 .cat）；h1 桌面 56px（与设计稿一致，记为一致值）', () => {
    const src = source();
    expect(src, '.cat = rgba(243,249,250,.5) = paper/50').toContain(
      "const META = 'text-[0.6875rem] tracking-[0.24em] text-paper/50'",
    );
    expect(src, 'h1 56px').toContain('md:text-[3.5rem]');
  });

  it('页脚两条：导语 + 真实计数「待处理 N · 历史 M」（都来自 useAdminReports，不造假）', async () => {
    const src = source();
    expect(src, '待处理计数来自真接口').toContain("useAdminReports('PENDING'");
    expect(src, '历史计数来自真接口').toContain("useAdminReports('REVIEWED'");
    expect(src, '关键块有 data-anchor').toContain('data-anchor="admin-queue"');

    const { container } = renderWithProviders(<AdminPage />, {
      route: '/admin',
      handlers: valueHandlers(),
    });
    expect(await screen.findByText('待处理 1 · 历史 1')).toBeInTheDocument();
    expect(container.querySelector('[data-anchor="admin-queue"]')).not.toBeNull();
  });
});
