/**
 * 私密留言 UI 单测（CONTEXT §5 / §5.2）。
 *
 * 三条必须钉住的规则：
 * 1. **可见性由服务端决定**：组件只渲染 `GET /api/bottles/:id/messages` 给它的东西
 *    （内核 `visibleMessagesFor`：发起者只看已送达、发送者看自己的、中间传递者啥也看不到）——
 *    前端不许自己筛，也不许"猜"自己能看到什么；
 * 2. **写入口只给接唱者**（内核 `canAttachPrivateMessage`：发起者不能给自己留言、
 *    入海/损坏/回传链断裂之后就写不了）→ 不给就**不渲染**表单（不摆会 4xx 的假控件）；
 * 3. **未送达要说清楚**（§5.2）：不能只标个状态码，要说明"没能送到发起者手里"。
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PrivateMessages } from './private-messages';
import { renderWithProviders } from '../../test/harness';

const BOTTLE_ID = '11111111-1111-4111-8111-111111111111';

function message(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    bottleId: BOTTLE_ID,
    content: '你写的这首歌我听过很多次。',
    status: 'PENDING',
    createdAt: '2026-09-23T02:00:00.000Z',
    ...overrides,
  };
}

function setup(options: { canWrite?: boolean; items?: unknown[]; handlers?: never } = {}) {
  const view = renderWithProviders(
    <PrivateMessages
      open
      bottleId={BOTTLE_ID}
      canWrite={options.canWrite ?? true}
      onClose={() => undefined}
    />,
    {
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}/messages`,
          respond: () => ({ body: options.items ?? [] }),
        },
      ],
    },
  );
  return view;
}

describe('私密留言', () => {
  it('只渲染服务端给的那几条（可见性不在这里重算）', async () => {
    setup({ items: [message(), message({ id: '33333333-3333-4333-8333-333333333333' })] });

    expect(await screen.findAllByText('你写的这首歌我听过很多次。')).toHaveLength(2);
  });

  it('未送达要解释清楚（不是只标个状态）', async () => {
    setup({ items: [message({ status: 'UNDELIVERED' })] });

    // 标状态 + 说明后果，两处都要有（只标状态码不算"说清楚"）
    expect(await screen.findByText('没能送达')).toBeInTheDocument();
    expect(screen.getByText(/回传链断了/)).toBeInTheDocument();
  });

  it('接唱者能写：送出时 body 只有 content（其余由服务端定）', async () => {
    const { fetchMock } = renderWithProviders(
      <PrivateMessages open bottleId={BOTTLE_ID} canWrite onClose={() => undefined} />,
      {
        handlers: [
          {
            path: `/api/bottles/${BOTTLE_ID}/messages`,
            respond: (context) =>
              context.init.method === 'POST' ? { status: 201, body: message() } : { body: [] },
          },
        ],
      },
    );

    const box = await screen.findByLabelText('写一句给发起者');
    fireEvent.change(box, { target: { value: '谢谢你唱了这首歌。' } });
    fireEvent.click(screen.getByRole('button', { name: '送出留言' }));

    await waitFor(() => {
      const posted = fetchMock.calls.find((call) => call.method === 'POST');
      expect(posted?.body).toEqual({ content: '谢谢你唱了这首歌。' });
    });
  });

  it('不是接唱者就没有写入口（内核会拒，前端不摆假控件）', async () => {
    setup({ canWrite: false, items: [] });

    expect(await screen.findByText(/看不到任何留言|还没有留言/)).toBeInTheDocument();
    expect(screen.queryByLabelText('写一句给发起者')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '送出留言' })).not.toBeInTheDocument();
  });
});
