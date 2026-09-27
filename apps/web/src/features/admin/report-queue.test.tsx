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
    expect(stamp?.className, '印章要有 coral 淡底径向渐变（15% 不算填充）').toContain(
      'radial-gradient(62%_72%_at_31%_34%',
    );
    // 12–15% 的 coral 淡底上，文字用 coral 的提亮档 danger（6.67:1 ＞ coral 原文 4.76:1）
    expect(stamp?.className, '印章文字必须是 danger 提亮档').toContain('text-danger');
    expect(stamp, '印章里必须是裁决词').toHaveTextContent('已删段');
    // 稿 .seal::after：同字重影（错开 1px）由 data-s + CSS attr() 画出，读屏只读一遍
    expect(stamp, '重影取自 data-s').toHaveAttribute('data-s', '已删段');
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
 * 审核队列 · **逐块照抄 s2-admin-record.html**（工单卡 `.card` / 浮起错落 `.float` /
 * 历史行 `li.rec` / 印章 `.seal`）。精确值以同名 `.html` 为准（§5.5 口径）；
 * 固定 px → 流体是唯一翻译（宽 900 → max-w、行网格加断点前缀）。
 * 样式值用源码级断言（jsdom 无渲染）；整改前这些断言会红。
 */
describe('审核队列 · 逐块照抄 s2-admin-record.html', () => {
  const source = (): string =>
    readFileSync(
      join(process.cwd(), 'src', 'features', 'admin', 'report-queue.tsx'),
      'utf8',
    ).replace(/\s+/g, ' ');

  it('浮起容器照稿 .float：错落三档（bottom -8/22/38）+ 不等宽 + 手工微旋转（桌面档）', () => {
    const src = source();
    expect(src, '底对齐（bottom 错落的流体译法）').toContain('md:flex-row md:flex-wrap md:items-end');
    expect(src, '宽 400/428/416 ≈ 31/33/32%').toContain('md:basis-[31%]');
    expect(src, '宽第二档').toContain('md:basis-[33%]');
    expect(src, '宽第三档').toContain('md:basis-[32%]');
    expect(src, 'bottom -8px').toContain('md:mb-[-8px]');
    expect(src, 'bottom 22px').toContain('md:mb-[22px]');
    expect(src, 'bottom 38px').toContain('md:mb-[38px]');
    expect(src, '卡片旋转 -.4°').toContain('md:rotate-[-0.4deg]');
    expect(src, '卡片旋转 .35°').toContain('md:rotate-[0.35deg]');
    expect(src, '卡片旋转 -.3°').toContain('md:rotate-[-0.3deg]');
  });

  it('工单卡照稿 .card：14/16 内距、min-h 160、纸边 .17、径向深底、左缘断续导轨', () => {
    const src = source();
    expect(src, '内距 14/16').toContain('min-h-[160px] flex-col');
    expect(src, '内距值').toContain('px-4 py-[14px]');
    expect(src, '纸边 .17').toContain('border-paper/[0.17]');
    expect(src, '径向深底 76%/76% at 30%/22%').toContain(
      'radial-gradient(76%_76%_at_30%_22%',
    );
    expect(src, '左缘断续导轨（稿 ::before）w3 + .26 断线').toContain(
      'w-[3px] bg-[repeating-linear-gradient(180deg,rgba(243,249,250,0.26)_0_2px,transparent_2px_7px)]',
    );
    expect(src, '半身泡水的湿边（第一张）').toContain(
      'h-[9px] bg-[linear-gradient(180deg,rgba(6,26,34,0.5),rgba(3,17,23,0.72))]',
    );
  });

  it('卡内五块照稿：.no 13/.06、.kind 10.5/.14、.hair paper.11、.rep 15 粗 + glass em、.when 11.5', () => {
    const src = source();
    expect(src, '.no 13px + .06em + muted.95').toContain(
      'font-latin text-[0.8125rem] tracking-[0.06em] text-muted/95',
    );
    expect(src, '.kind 10.5px + .14em + muted.78 + mt5').toContain(
      'mt-[5px] text-[0.65625rem] tracking-[0.14em] text-muted/[0.78]',
    );
    expect(src, '.hair 1px paper.11').toContain('h-px bg-paper/[0.11]');
    expect(src, '.rep 15px 粗体').toContain('mt-[9px] text-[0.9375rem] font-bold');
    expect(src, '.rep em 13.5 常规 + glass + 左距 7').toContain(
      'ml-[7px] text-[0.84375rem] font-normal text-glass',
    );
    expect(src, '.when 11.5px Quattrocento + muted.86 + mt8').toContain(
      'mt-[8px] font-latin text-[0.71875rem] text-muted/[0.86]',
    );
    expect(src, '举报于逐字').toContain('举报于');
  });

  it('动作排照稿 .acts：12.5/7×13、纸边 .26；删档 coral.62、封禁 coral.74 + 淡底 .12', () => {
    const src = source();
    expect(src, '按钮 12.5px + 内距 7/13 + nowrap').toContain(
      'whitespace-nowrap rounded-base border px-[13px] py-[7px] text-[0.78125rem]',
    );
    expect(src, '驳回 = 纸边').toContain('border-paper/[0.26] bg-transparent text-paper');
    expect(src, '删段/删瓶 = coral .62 + danger 字').toContain(
      'border-coral/[0.62] bg-transparent text-danger',
    );
    expect(src, '封禁 = coral .74 + 淡底 .12 + danger 字').toContain(
      'border-coral/[0.74] bg-coral/[0.12] text-danger',
    );
  });

  it('待印位照稿 .seal.due：min-w 114、1.5px 虚线暖边 .66、内距 8×13、逐卡转角 -2.4/-1.5/-3', () => {
    const src = source();
    expect(src, 'min-w 114').toContain('min-w-[114px]');
    expect(src, '1.5px 虚线 + 暖边 .66').toContain(
      'border-[1.5px] border-dashed border-warm/[0.66]',
    );
    expect(src, '内距 8/13').toContain('px-[13px] py-[8px]');
    expect(src, '12.5px + 暖色等待态').toContain('text-[0.78125rem] tracking-[0.17em] text-warm');
    expect(src, '印位转角 -2.4°').toContain('rotate-[-2.4deg]');
    expect(src, '印位转角 -1.5°').toContain('rotate-[-1.5deg]');
    expect(src, '印位转角 -3°').toContain('rotate-[-3deg]');
  });

  it('历史列表照稿 ul.sunk / li.rec：max-w 900、mt34、四列网格（断点前缀）、18/24 内距', () => {
    const src = source();
    expect(src, '宽 900 → 流体 max-w').toContain('mt-[34px] w-full max-w-[900px]');
    expect(src, '窄屏折行网格').toContain('grid-cols-[auto_1fr]');
    expect(src, '稿四列 140/300/180/auto').toContain('lg:grid-cols-[140px_300px_180px_auto]');
    expect(src, '内距 18/24').toContain('pt-[18px] pb-[24px]');
    expect(src, '第 2 条 .92').toContain('opacity-[0.92]');
    expect(src, '第 3 条 .84').toContain('opacity-[0.84]');
    expect(src, '第 2 条 rno 缩进 10').toContain('pl-[10px]');
    expect(src, '第 3 条 rno 缩进 20').toContain('pl-[20px]');
  });

  it('历史行四块照稿：.rno 12.5/.06、.robj 14.5 粗 + muted em、.rtime 11.5、.back glass 描边', () => {
    const src = source();
    expect(src, '.rno 12.5px + .06em + muted.9').toContain(
      'font-latin text-[0.78125rem] tracking-[0.06em] text-muted/90',
    );
    expect(src, '.robj 14.5px 粗体').toContain('text-[0.90625rem] font-bold');
    expect(src, '.robj em 13 + muted.9 + 左距 7').toContain(
      'ml-[7px] text-[0.8125rem] font-normal text-muted/90',
    );
    expect(src, '.rtime 11.5 + muted.78').toContain('text-[0.71875rem] text-muted/[0.78]');
    expect(src, '.back 起点对齐 + glass 边 .5').toContain('justify-self-start');
    expect(src, '.back glass 描边').toContain('border-glass/50 bg-transparent text-glass');
  });

  it('行分界线照稿 .rule：paper .32→.05 渐变，三行宽 100/87(left8)/96(left26)', () => {
    const src = source();
    expect(src, '渐变取稿值').toContain(
      'bg-[linear-gradient(90deg,rgba(243,249,250,0.32),rgba(243,249,250,0.05))]',
    );
    expect(src, '第 1 行满宽').toContain('left-0 w-full');
    expect(src, '第 2 行 87% 起 8').toContain('left-[8px] w-[87%]');
    expect(src, '第 3 行 96% 起 26').toContain('left-[26px] w-[96%]');
  });

  it('真印章照稿 .seal：min-w 114、双框（.72 主框 + .5 断墨失焦框）、径向淡底 .15、重影 content:attr', () => {
    const src = source();
    expect(src, 'min-w 114').toContain('min-w-[114px]');
    expect(src, '主框 .72 + 内距 9/13').toContain('border-coral/[0.72]');
    expect(src, '内距 9/13').toContain('px-[13px] py-[9px]');
    expect(src, '径向淡底 .15 → 0').toContain('radial-gradient(62%_72%_at_31%_34%');
    expect(src, '断墨框 .5 + 失焦 .32px').toContain('blur-[0.32px] border-2 border-coral/[0.5]');
    expect(src, '断墨掩膜 74° 断线').toContain(
      '[mask-image:repeating-linear-gradient(74deg',
    );
    expect(src, '重影 = data-s + attr()').toContain('[content:attr(data-s)]');
    expect(src, '重影 coral .33 错 1px').toContain(
      '[&::after]:translate-x-[1px] [&::after]:-translate-y-[1px] [&::after]:text-coral/[0.33]',
    );
    expect(src, '印章落位 1：右 -4 下 -17').toContain('right-[-4px] bottom-[-17px]');
    expect(src, '印章落位 2：右 136 下 -20').toContain('right-[136px] bottom-[-20px]');
    expect(src, '印章落位 3：右 56 下 -15').toContain('right-[56px] bottom-[-15px]');
    expect(src, '盖章角 -3.2°').toContain('rotate-[-3.2deg]');
    expect(src, '盖章角 2.4°').toContain('rotate-[2.4deg]');
    expect(src, '盖章角 -2.1°').toContain('rotate-[-2.1deg]');
  });

  it('待处理卡 DOM：湿边只给贴水的第一张；每张右下角一枚虚线待印位', async () => {
    const { container } = renderWithProviders(<ReportQueue status="PENDING" />, {
      handlers: [
        {
          path: /\/api\/admin\/reports/,
          respond: () => ({
            body: [
              report(),
              report({
                id: '44444444-4444-4444-8444-444444444444',
                targetId: '55555555-5555-4555-8555-555555555555',
                reason: '第二条的理由',
              }),
            ],
          }),
        },
      ],
    });
    await screen.findByText('这一段听着像噪音');
    expect(container.querySelectorAll('[data-device="flood"]')).toHaveLength(1);
    // 每张卡右下角各一枚虚线待印位（稿 `.seal.due`）
    expect(screen.getAllByText('待处理')).toHaveLength(2);
  });
});

/**
 * 审核队列 · **逐值复核**（`docs/impl-plan-record-v1.md` §5.5：精确值以同名 `.html` 为准；
 * 设计稿 = `docs/ui-review/design-explore/s2-admin-record.html`）。
 * 样式值用源码级断言（jsdom 无渲染）。
 */
describe('审核队列 · 逐值对齐 s2-admin-record.html', () => {
  const source = (): string =>
    readFileSync(
      join(process.cwd(), 'src', 'features', 'admin', 'report-queue.tsx'),
      'utf8',
    ).replace(/\s+/g, ' ');

  it('待处理卡片：手工放置旋转 -.4/.35/-.3（登记组内，桌面档）；历史行越老越沉 1 → .92 → .84', () => {
    const src = source();
    for (const angle of ['md:rotate-[-0.4deg]', 'md:rotate-[0.35deg]', 'md:rotate-[-0.3deg]']) {
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
