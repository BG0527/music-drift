import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/harness';
import { PublicComments } from './public-comments';

const BOTTLE_ID = '11111111-1111-4111-8111-111111111111';
const COMMENT_ID = '22222222-2222-4222-8222-222222222222';

describe('公海公开评论区', () => {
  it('匿名可读；登录用户可发布，作者可删且他人评论可举报', async () => {
    const { fetchMock } = renderWithProviders(<PublicComments bottleId={BOTTLE_ID} canComment />, {
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}/comments?limit=20`,
          respond: () => ({
            body: {
              items: [
                {
                  id: COMMENT_ID,
                  bottleId: BOTTLE_ID,
                  content: '海风听见了',
                  authorAccount: 'ocean-listener',
                  isMine: false,
                  createdAt: '2026-09-29T00:00:00.000Z',
                },
              ],
              nextCursor: null,
            },
          }),
        },
        {
          method: 'POST',
          path: `/api/bottles/${BOTTLE_ID}/comments`,
          respond: ({ body }) => ({
            status: 201,
            body: {
              id: '33333333-3333-4333-8333-333333333333',
              bottleId: BOTTLE_ID,
              content: (body as { content: string }).content,
              authorAccount: 'me',
              isMine: true,
              createdAt: '2026-09-29T00:01:00.000Z',
            },
          }),
        },
      ],
    });

    expect(await screen.findByText('海风听见了')).toBeInTheDocument();
    expect(screen.getByText('@ocean-listener')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '举报这条评论' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('写公开评论'), { target: { value: '  一起唱下去  ' } });
    fireEvent.click(screen.getByRole('button', { name: '发布评论' }));
    await waitFor(() => {
      expect(fetchMock.calls).toContainEqual(
        expect.objectContaining({
          method: 'POST',
          body: { content: '一起唱下去' },
        }),
      );
    });
  });

  it('删除失败不会静默；宿主提供 onReport 时不嵌套举报 Modal', async () => {
    const onReport = vi.fn();
    renderWithProviders(
      <PublicComments bottleId={BOTTLE_ID} canComment onReport={onReport} />,
      {
        handlers: [
          {
            path: `/api/bottles/${BOTTLE_ID}/comments?limit=20`,
            respond: () => ({
              body: {
                items: [
                  {
                    id: COMMENT_ID,
                    bottleId: BOTTLE_ID,
                    content: '我写的评论',
                    authorAccount: 'me',
                    isMine: true,
                    createdAt: '2026-09-29T00:00:00.000Z',
                  },
                  {
                    id: '33333333-3333-4333-8333-333333333333',
                    bottleId: BOTTLE_ID,
                    content: '别人的评论',
                    authorAccount: 'other',
                    isMine: false,
                    createdAt: '2026-09-29T00:01:00.000Z',
                  },
                ],
                nextCursor: null,
              },
            }),
          },
          {
            method: 'DELETE',
            path: `/api/comments/${COMMENT_ID}`,
            respond: () => ({
              status: 500,
              body: { error: { message: '暂时删不了，请稍后重试。', violations: [] } },
            }),
          },
        ],
      },
    );

    fireEvent.click(await screen.findByRole('button', { name: '删除这条评论' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('暂时删不了');
    fireEvent.click(screen.getByRole('button', { name: '举报这条评论' }));
    expect(onReport).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333');
    expect(screen.queryByRole('dialog', { name: /举报/ })).not.toBeInTheDocument();
  });
});
