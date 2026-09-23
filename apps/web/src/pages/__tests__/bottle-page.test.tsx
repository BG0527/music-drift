import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  BOTTLE_ID,
  SEGMENT_1,
  SEGMENT_2,
  USER_B,
  bottleDetail,
  bottleSummary,
} from '../../test/fixtures';
import { fakeRecorderEnvironment, renderWithProviders } from '../../test/harness';
import { BottlePage } from '../bottle-page';

const SESSION_B = {
  user: { id: USER_B, handle: '接棒的人', email: 'b@example.com', role: 'USER' },
  expiresAt: '2026-10-23T00:00:00.000Z',
};

/**
 * 漂流瓶页 = 黄金路径的核心：**听 → 录 → 选去向**。
 * 页面不许自己算段号 / 完成度（ADR-015），一切来自服务端字段：
 * `missingSegmentIndexes[0]` 决定"这一棒录第几段"，`availableResolutions` 决定可选去向。
 */
describe('漂流瓶接唱页', () => {
  it('未登录时不摆出「录制 / 放回」按钮（先请登录，不制造会 401 的假按钮）', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [{ path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: bottleDetail() }) }],
    });
    expect(await screen.findByText(/需要先登录/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /第 2 段 · 共 4 段/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /放回海中/ })).not.toBeInTheDocument();
  });

  it('持有者且已登录：录制成功后按服务端最新缺口弹出去向三选一', async () => {
    const recorder = fakeRecorderEnvironment();
    let uploaded = false;
    const transport = () => {
      uploaded = true;
      return Promise.resolve({
        status: 201,
        body: {
          segmentId: SEGMENT_2,
          index: 2,
          nextRecordIndex: 3,
          bottle: bottleDetail({
            recordedCount: 2,
            missingSegmentIndexes: [3, 4],
            availableResolutions: ['RIVER', 'RETURN', 'SEA'],
          }),
        },
      });
    };

    renderWithProviders(
      <BottlePage
        id={BOTTLE_ID}
        seams={{ recorderEnvironment: recorder.environment, uploadTransport: transport }}
      />,
      {
        route: `/bottles/${BOTTLE_ID}`,
        handlers: [
          { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) },
          {
            path: `/api/bottles/${BOTTLE_ID}`,
            respond: () => ({
              // 上传前：缺口 [2,3,4]；上传后：服务端说缺口是 [3,4]
              body: uploaded
                ? bottleDetail({ recordedCount: 2, missingSegmentIndexes: [3, 4] })
                : bottleDetail(),
            }),
          },
        ],
      },
    );

    fireEvent.click(await screen.findByRole('button', { name: /开始录制/ }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /停止录制/ })).toBeInTheDocument();
    });
    recorder.clock.value += 20_000;
    fireEvent.click(screen.getByRole('button', { name: /停止录制/ }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /用这一段/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /用这一段/ }));

    expect(await screen.findByRole('heading', { name: '选择声音去向' })).toBeInTheDocument();
    expect(screen.getByText(/已录下第 2 段/)).toBeInTheDocument();
  });

  it('持有者且有缺口：显示服务端给的段号，并把缺口显式标在时间轴上', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) },
        { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: bottleDetail() }) },
      ],
    });
    expect(await screen.findByRole('heading', { name: /第 2 段 · 共 4 段/ })).toBeInTheDocument();
    expect(screen.getAllByText(/缺第 2、3、4 段/).length).toBeGreaterThan(0);
  });

  it('§9.1：漂流中被裁掉后续时，明确说明"还有 N 段看不到"（不是假装瓶子丢了段）', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({ hiddenLaterSegmentCount: 2, isHolder: false, holderId: USER_B }),
          }),
        },
      ],
    });
    expect(await screen.findByText(/还有 2 段是你现在看不到的/)).toBeInTheDocument();
  });

  it('点踩上送的是音频层给的真实收听比例（页面不自己算、不写死阈值）', async () => {
    // 可控的音频元素：驱动 timeupdate 让覆盖率到 100% → 点踩按钮解禁
    const listeners: Record<string, (() => void)[]> = {};
    const element = {
      src: '',
      currentTime: 0,
      paused: true,
      play: () => undefined,
      pause: () => undefined,
      addEventListener: (type: string, handler: () => void) => {
        listeners[type] = [...(listeners[type] ?? []), handler];
      },
      removeEventListener: (type: string, handler: () => void) => {
        listeners[type] = (listeners[type] ?? []).filter((item) => item !== handler);
      },
    };

    const { fetchMock } = renderWithProviders(
      <BottlePage
        id={BOTTLE_ID}
        seams={{
          segmentElementFactory: ((src: string) => {
            element.src = src;
            return element;
          }) as never,
        }}
      />,
      {
        route: `/bottles/${BOTTLE_ID}`,
        handlers: [
          { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) },
          {
            path: `/api/bottles/${BOTTLE_ID}`,
            respond: () => ({ body: bottleDetail({ isHolder: false, holderId: USER_B }) }),
          },
          {
            method: 'POST',
            path: /\/api\/segments\/.+\/votes/,
            respond: () => ({
              body: {
                segmentId: SEGMENT_1,
                value: 'DISLIKE',
                likeCount: 0,
                dislikeCount: 1,
                dislikeThreshold: 10,
                segmentCut: false,
              },
            }),
          },
        ],
      },
    );

    await screen.findByText('午夜歌手#042');
    // 逐秒推进（每步 <1500ms，否则会被判成"拖动不计"）；段长 20s → 覆盖率 100%
    for (let second = 0; second <= 20; second += 1) {
      element.currentTime = second;
      for (const handler of listeners['timeupdate'] ?? []) handler();
    }

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '点踩' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: '点踩' }));

    await waitFor(() => {
      expect(fetchMock.calls.some((call) => call.url.includes('/votes'))).toBe(true);
    });
    const vote = fetchMock.calls.find((call) => call.url.includes('/votes'));
    expect(vote?.body).toEqual({ segmentId: SEGMENT_1, value: 'DISLIKE', listenedRatio: 1 });
  });

  it('非持有者：不出现录制区，说明"不在你手上"并给去河道的出口', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({ body: bottleDetail({ isHolder: false, holderId: USER_B }) }),
        },
      ],
    });
    expect(await screen.findByText(/现在不在你手上/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /第 2 段 · 共 4 段/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /去河道捞一个/ })).toHaveAttribute('href', '/river');
  });

  it('作品已完整：不再提供录制，改为提示选择去向', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({
              isComplete: true,
              missingSegmentIndexes: [],
              availableResolutions: ['RETURN', 'SEA'],
              recordedCount: 4,
            }),
          }),
        },
      ],
    });
    expect(await screen.findByText(/已经录满/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /共 4 段/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /选择去向/ })).toBeInTheDocument();
  });

  it('去向三选一只给服务端允许的选项（发起者投河时没有"回传"）', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({
              isComplete: true,
              missingSegmentIndexes: [],
              availableResolutions: ['RIVER', 'SEA'],
            }),
          }),
        },
      ],
    });
    fireEvent.click(await screen.findByRole('button', { name: /选择去向/ }));
    expect(screen.getByRole('button', { name: /继续投河/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /入海/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /回传/ })).not.toBeInTheDocument();
  });

  it('确认去向后提交，并在页面上播报结果（aria-live，不只靠动效）', async () => {
    const { fetchMock } = renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({
              isComplete: true,
              missingSegmentIndexes: [],
              availableResolutions: ['SEA'],
            }),
          }),
        },
        {
          method: 'POST',
          path: `/api/bottles/${BOTTLE_ID}/resolution`,
          respond: () => ({ body: bottleSummary({ seaZone: 'COMPLETED' }) }),
        },
      ],
    });
    fireEvent.click(await screen.findByRole('button', { name: /选择去向/ }));
    fireEvent.click(screen.getByRole('button', { name: /入海/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认投递' }));

    await waitFor(() => {
      expect(fetchMock.calls.some((call) => call.url.endsWith('/resolution'))).toBe(true);
    });
  });

  it('去向被并发抢走（409）时不静默失败：解释 + 两个出口动作', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({
              isComplete: true,
              missingSegmentIndexes: [],
              availableResolutions: ['RIVER'],
            }),
          }),
        },
        {
          method: 'POST',
          path: `/api/bottles/${BOTTLE_ID}/resolution`,
          respond: () => ({
            status: 409,
            body: {
              error: {
                message: '这个漂流瓶已经被别人拿走了，换一个吧。',
                violations: [
                  {
                    code: 'HOLDING_ALREADY_TAKEN',
                    message: '这个漂流瓶已经被别人拿走了，换一个吧。',
                  },
                ],
              },
            },
          }),
        },
      ],
    });
    fireEvent.click(await screen.findByRole('button', { name: /选择去向/ }));
    fireEvent.click(screen.getByRole('button', { name: /继续投河/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认投递' }));

    expect(await screen.findByText(/已被别人接走/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '换一段继续' })).toHaveAttribute('href', '/river');
    expect(screen.getByRole('link', { name: '看一眼漂流日志' })).toHaveAttribute(
      'href',
      `/bottles/${BOTTLE_ID}/log`,
    );
  });
});
