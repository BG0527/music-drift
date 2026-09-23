/**
 * 私密留言 UI 单测（CONTEXT §5 / §5.2；用户第 4 条 + t42 后端口径）。
 *
 * 规则（t42 起）：**收件人由发送者按段号指定** —— `POST …/messages { content, targetSegmentIndex }`；
 * 只有**目标**看得到内容；目标**这一轮持有瓶子**即送达；三种失败（目标段被斩 / 瓶子损坏·父链断裂 /
 * 整首完成入海仍没到）都标 `UNDELIVERED` 并通知**发送者**。
 *
 * 六条断言对应六件容易做错的事：候选来自服务端段列表 / 不能选自己 / 无"之前段"不给表单 /
 * targetSegmentIndex 真进请求体 / 状态是"送达目标"口径 / 未送达说清三种原因。
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PrivateMessages } from './private-messages';
import { renderWithProviders } from '../../test/harness';
import { USER_A, USER_B, bottleDetail } from '../../test/fixtures';

const BOTTLE_ID = '11111111-1111-4111-8111-111111111111';
const ME = USER_B;

const segment = (index: number, ownerId: string, ownerCode: string) => ({
  id: `11111111-0000-4000-8000-00000000000${String(index)}`,
  index,
  ownerId,
  note: null,
  ownerCode,
  likeCount: 0,
  dislikeCount: 0,
  deletedAt: null,
  audioMime: 'audio/webm',
  durationMs: 20_000,
});

/** 我（USER_B）= 第 2 段的作者；之前各段 = 第 1 段（USER_A「午夜歌手#042」）。 */
const SEGMENTS = [segment(1, USER_A, '午夜歌手#042'), segment(2, ME, '接棒的人#002')];

function message(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    bottleId: BOTTLE_ID,
    content: '你写的这首歌我听过很多次。',
    status: 'PENDING',
    targetSegmentIndex: 1,
    createdAt: '2026-09-23T02:00:00.000Z',
    ...overrides,
  };
}

function setup(options: { canWrite?: boolean; items?: unknown[]; segments?: unknown[] } = {}) {
  return renderWithProviders(
    <PrivateMessages
      open
      bottleId={BOTTLE_ID}
      canWrite={options.canWrite ?? true}
      onClose={() => undefined}
    />,
    {
      handlers: [
        {
          path: '/api/auth/me',
          respond: () => ({
            body: {
              user: { id: ME, handle: '接棒的人', email: 'b@example.com', role: 'USER' },
              expiresAt: '2026-10-23T00:00:00.000Z',
            },
          }),
        },
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({
              segments: (options.segments ?? SEGMENTS) as ReturnType<typeof bottleDetail>['segments'],
            }),
          }),
        },
        { path: `/api/bottles/${BOTTLE_ID}/messages`, respond: () => ({ body: options.items ?? [] }) },
        {
          method: 'POST',
          path: `/api/bottles/${BOTTLE_ID}/messages`,
          respond: () => ({ status: 201, body: message() }),
        },
      ],
    },
  );
}

describe('私密留言：目标选择（从之前各段的作者里选一位）', () => {
  it('候选来自服务端段列表：列出「第 N 段 · 匿名代号」，我自己的段不在候选里', async () => {
    setup();

    const select = await screen.findByLabelText('送给哪一段的作者');
    expect(select).toHaveTextContent('第 1 段');
    expect(select).toHaveTextContent('午夜歌手#042');
    expect(select).not.toHaveTextContent('第 2 段');
  });

  it('提交时 targetSegmentIndex 真的进请求体', async () => {
    const { fetchMock } = setup();

    fireEvent.change(await screen.findByLabelText('送给哪一段的作者'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('写一句给这一段的作者'), {
      target: { value: '谢谢你唱了这一段。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '送出留言' }));

    await waitFor(() => {
      const posted = fetchMock.calls.find((call) => call.method === 'POST');
      expect(posted?.body).toEqual({ content: '谢谢你唱了这一段。', targetSegmentIndex: 1 });
    });
  });

  it('没有「之前段」（我是第 1 段的作者）⇒ 不渲染表单，并说明为什么', async () => {
    setup({ segments: [segment(1, ME, '我#001')] });

    expect(await screen.findByText(/没有可选的收件人/)).toBeInTheDocument();
    expect(screen.queryByLabelText('送给哪一段的作者')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '送出留言' })).not.toBeInTheDocument();
  });

  it('只读模式（canWrite=false）同样不渲染表单', async () => {
    setup({ canWrite: false });

    await waitFor(() => {
      expect(screen.queryByLabelText('送给哪一段的作者')).not.toBeInTheDocument();
    });
  });
});

describe('私密留言：状态口径（送达目标）', () => {
  it('PENDING = 等它漂到目标手里；DELIVERED = 已送达目标（不写"发起者"）', async () => {
    setup({
      items: [
        message({ status: 'PENDING' }),
        message({ id: '33333333-3333-4333-8333-333333333333', status: 'DELIVERED' }),
      ],
    });

    expect(await screen.findByText(/等它漂到目标手里/)).toBeInTheDocument();
    expect(screen.getByText(/已送达目标/)).toBeInTheDocument();
    expect(screen.queryByText(/发起者/)).not.toBeInTheDocument();
  });

  it('UNDELIVERED = 没能送达 + 三种原因都写出来', async () => {
    setup({ items: [message({ status: 'UNDELIVERED' })] });

    // 标签是精确的「没能送达」；原因段落里那句话也含"没能送达"，所以这里不能用模糊匹配
    expect(await screen.findByText('没能送达')).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/斩/);
    expect(text).toMatch(/断裂/);
    expect(text).toMatch(/入海/);
  });
});

describe('私密留言：被服务端拒绝时给可读中文', () => {
  it('422 MESSAGE_TARGET_NOT_AVAILABLE ⇒ 显示服务端那句中文（沿用 features/api/errors）', async () => {
    const reason = '这一段的作者不在可送达范围内（它被斩浪删除，或者这段就是你自己写的）。';
    renderWithProviders(
      <PrivateMessages open bottleId={BOTTLE_ID} canWrite onClose={() => undefined} />,
      {
        handlers: [
          {
            path: '/api/auth/me',
            respond: () => ({
              body: {
                user: { id: ME, handle: '接棒的人', email: 'b@example.com', role: 'USER' },
                expiresAt: '2026-10-23T00:00:00.000Z',
              },
            }),
          },
          { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: bottleDetail({ segments: SEGMENTS as never }) }) },
          { path: `/api/bottles/${BOTTLE_ID}/messages`, respond: () => ({ body: [] }) },
          {
            method: 'POST',
            path: `/api/bottles/${BOTTLE_ID}/messages`,
            respond: () => ({
              status: 422,
              body: {
                error: {
                  message: reason,
                  violations: [{ code: 'MESSAGE_TARGET_NOT_AVAILABLE', message: reason }],
                },
              },
            }),
          },
        ],
      },
    );

    fireEvent.change(await screen.findByLabelText('送给哪一段的作者'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('写一句给这一段的作者'), { target: { value: '在吗' } });
    fireEvent.click(screen.getByRole('button', { name: '送出留言' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(reason);
  });
});
