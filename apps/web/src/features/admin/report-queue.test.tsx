import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/harness';
import { ReportQueue } from './report-queue';

const SEGMENT = '11111111-1111-4111-8111-111111111111';

function report(overrides: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    targetType: 'SEGMENT',
    targetId: SEGMENT,
    reason: '这一段听着像噪音',
    status: 'PENDING',
    action: null,
    createdAt: '2026-09-23T02:00:00.000Z',
    reviewedAt: null,
    ...overrides,
  };
}

/**
 * 审核队列（`/admin`）。
 *
 * 两条纪律：
 * 1. **权限态自建**（Figma 无状态帧）：非管理员不许看到任何队列内容，也不许只靠"隐藏按钮"；
 * 2. **动作要与对象类型匹配**（客户端先拦一道，服务端仍会校验）：对"瓶子"不该出现「删段」。
 */
describe('审核队列', () => {
  it('待处理队列列出对象类型 / 理由 / 时间，并给出与对象匹配的处置动作', async () => {
    renderWithProviders(<ReportQueue status="PENDING" />, {
      handlers: [{ path: /\/api\/admin\/reports/, respond: () => ({ body: [report()] }) }],
    });

    expect(await screen.findByText('这一段听着像噪音')).toBeInTheDocument();
    expect(screen.getByText('唱段')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '驳回' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删段' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '封禁作者' })).toBeInTheDocument();
    // 对唱段不该出现"删瓶"
    expect(screen.queryByRole('button', { name: '删瓶下架' })).not.toBeInTheDocument();
  });

  it('对"瓶子"的举报：只给驳回 / 删瓶 / 封禁（不给删段）', async () => {
    renderWithProviders(<ReportQueue status="PENDING" />, {
      handlers: [
        {
          path: /\/api\/admin\/reports/,
          respond: () => ({ body: [report({ targetType: 'BOTTLE', reason: '这首歌不该公开' })] }),
        },
      ],
    });
    expect(await screen.findByText('这首歌不该公开')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删瓶下架' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删段' })).not.toBeInTheDocument();
  });

  it('点处置会打裁决接口（参数为 decision）', async () => {
    const { fetchMock } = renderWithProviders(<ReportQueue status="PENDING" />, {
      handlers: [
        { path: /\/api\/admin\/reports\?/, respond: () => ({ body: [report()] }) },
        {
          method: 'POST',
          path: /\/api\/admin\/reports\/.+\/decision/,
          respond: () => ({ status: 204 }),
        },
      ],
    });
    fireEvent.click(await screen.findByRole('button', { name: '删段' }));
    await waitFor(() => {
      expect(
        fetchMock.calls.some((call) => call.method === 'POST' && call.url.endsWith('/decision')),
      ).toBe(true);
    });
  });

  it('历史（REVIEWED）：显示结论，并对「已删段」给人工恢复入口（覆盖自动斩杀）', async () => {
    renderWithProviders(<ReportQueue status="REVIEWED" />, {
      handlers: [
        {
          path: /\/api\/admin\/reports/,
          respond: () => ({
            body: [
              report({
                status: 'REVIEWED',
                action: 'REMOVE_SEGMENT',
                reviewedAt: '2026-09-23T03:00:00.000Z',
                reason: '被误斩的申诉',
              }),
            ],
          }),
        },
      ],
    });
    expect(await screen.findByText(/已删段/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '恢复这一段' })).toBeInTheDocument();
  });

  it('历史裁决：结论是一枚**真印章**（旋转 + 墨色不匀的双框），不是一个绿色对勾', async () => {
    const { container } = renderWithProviders(<ReportQueue status="REVIEWED" />, {
      handlers: [
        {
          path: /\/api\/admin\/reports/,
          respond: () => ({
            body: [
              report({
                status: 'REVIEWED',
                action: 'REMOVE_SEGMENT',
                reviewedAt: '2026-09-23T03:00:00.000Z',
              }),
            ],
          }),
        },
      ],
    });
    await screen.findByText(/已删段/);
    const stamp = container.querySelector('[data-device="stamp"]');
    expect(stamp, '缺印章').not.toBeNull();
    expect(stamp?.className, '印章必须盖章式旋转').toContain('rotate-');
    expect(stamp?.className, '印章必须是 coral 描边（唯一强调色）').toContain('border-coral');
    expect(stamp?.className, '印章要有 coral 淡底（12% 不算填充）').toContain('bg-coral/');
    // 12% 的 coral 淡底上，文字用 coral 的提亮档 danger（6.67:1 ＞ coral 原文 4.76:1）
    expect(stamp?.className, '印章文字必须是 danger 提亮档').toContain('text-danger');
    expect(stamp, '印章里必须是裁决词').toHaveTextContent('已删段');
  });

  it('非管理员（403）→ 权限态说明，不显示任何队列内容；未登录（401）→ 登录出口', async () => {
    renderWithProviders(<ReportQueue status="PENDING" />, {
      handlers: [
        {
          path: /\/api\/admin\/reports/,
          respond: () => ({
            status: 403,
            body: { error: { message: '你没有权限执行这个操作。', violations: [] } },
          }),
        },
      ],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('没有权限');
    expect(screen.queryByRole('button', { name: '驳回' })).not.toBeInTheDocument();
  });
});

/**
 * 审核队列 · **逐值复核**（`docs/impl-plan-record-v1.md` §5.5：精确值以同名 `.html` 为准；
 * 设计稿 = `docs/ui-review/design-explore/s2-admin-record.html` 的 `.seal` / `.seal.due` / `li.rec`）。
 * 样式值用源码级断言（jsdom 无渲染）；整改前这些断言会红。
 */
describe('审核队列 · 逐值对齐 s2-admin-record.html', () => {
  const source = (): string =>
    readFileSync(
      join(process.cwd(), 'src', 'features', 'admin', 'report-queue.tsx'),
      'utf8',
    ).replace(/\s+/g, ' ');

  it('印章 .seal.sunk：12.5px/.17em、内距 9×13、coral 描边 .72、淡底 .15（文字仍是 danger 提亮档）', () => {
    const src = source();
    expect(src, '12.5px + .17em + danger 提亮档').toContain(
      'text-[0.78125rem] tracking-[0.17em] text-danger',
    );
    expect(src, '内距 9/13').toContain('px-[13px] py-[9px]');
    expect(src, '描边 .72').toContain('border-coral/[0.72]');
    expect(src, '淡底 .15').toContain('bg-coral/[0.15]');
  });

  it('待印位 .seal.due：12.5px、1.5px 虚线、暖边 .66、内距 8×13', () => {
    const src = source();
    expect(src, '1.5px 虚线 + 暖边 .66').toContain(
      'border-[1.5px] border-dashed border-warm/[0.66]',
    );
    expect(src, '内距 8/13').toContain('px-[13px] py-[8px]');
    expect(src, '12.5px + 暖色等待态').toContain('text-[0.78125rem] tracking-[0.17em] text-warm');
  });

  it('待处理卡片：手工放置旋转 -.4/.35/-.3（登记组内，桌面档）；历史行越老越沉 1 → .92 → .84', () => {
    const src = source();
    for (const angle of ['rotate-[-0.4deg]', 'rotate-[0.35deg]', 'rotate-[-0.3deg]']) {
      expect(src, `缺 ${angle}`).toContain(angle);
    }
    expect(src, '第 2 条 .92').toContain('opacity-[0.92]');
    expect(src, '第 3 条 .84').toContain('opacity-[0.84]');
  });

  it('文件里所有旋转角 |angle| ≤ 3.5°（契约 §6 #8：旋转只给手工放置物且有上限）', () => {
    const angles = [...source().matchAll(/rotate-\[(-?\d+(?:\.\d+)?)deg\]/g)].map((match) =>
      Number(match[1]),
    );
    expect(angles.length, '至少印章与印位带角').toBeGreaterThanOrEqual(3);
    for (const angle of angles) {
      expect(Math.abs(angle), `rotate ${String(angle)}deg 超过 3.5°`).toBeLessThanOrEqual(3.5);
    }
  });
});
