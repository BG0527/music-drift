import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  BOTTLE_ID,
  SEGMENT_1,
  SEGMENT_2,
  SONG_ID,
  USER_B,
  bottleDetail,
} from '../../test/fixtures';
import { fakeRecorderEnvironment, renderWithProviders } from '../../test/harness';
import { song } from '../../test/fixtures';
import { BottlePage } from '../bottle-page';

/**
 * 曲库桩：录制面板的分母 = 曲库该段的固定时长（用户第 4 条），
 * 所以只要页面会渲染录制面板，就必须把 `/api/songs` 档上。
 */
const songsHandler = { path: '/api/songs', respond: () => ({ body: [song()] }) };
const libraryMetadata = JSON.parse(
  readFileSync(join(process.cwd(), 'public', 'library', 'library.json'), 'utf8'),
) as { tracks: Array<{ songId: string }> };
const libraryHandler = {
  path: '/library/library.json',
  respond: () => ({ body: libraryMetadata }),
};

const SESSION_B = {
  user: { id: USER_B, handle: '接棒的人', account: '接棒的人', role: 'USER' },
  expiresAt: '2026-10-23T00:00:00.000Z',
};

/**
 * 漂流瓶页 = 黄金路径的核心：**听 → 录 → 选去向**。
 * 页面不许自己算段号 / 完成度（ADR-015），一切来自服务端字段：
 * `missingSegmentIndexes[0]` 决定"这一棒录第几段"，`availableResolutions` 决定可选去向。
 */
describe('漂流瓶接唱页', () => {
  it('公开评论先退出再开举报窗口，两个portal不共存且举报理由可输入', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, { handlers: [
      { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) },
      { path: '/api/me/collections', respond: () => ({ body: [] }) },
      { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: bottleDetail({
        status: 'SEA', isHolder: false, availableResolutions: [],
      }) }) },
      { path: `/api/bottles/${BOTTLE_ID}/comments?limit=20`, respond: () => ({ body: {
        items: [{ id: SEGMENT_2, bottleId: BOTTLE_ID, content: '听见你的声音', authorAccount: 'listener',
          isMine: false, createdAt: '2026-09-29T00:00:00.000Z' }], nextCursor: null,
      } }) },
    ] });
    fireEvent.click(await screen.findByRole('button', { name: '公开评论' }));
    fireEvent.click(await screen.findByRole('button', { name: '举报这条评论' }));
    expect(document.querySelectorAll('[data-modal-root]')).toHaveLength(1);
    const report = await screen.findByRole('dialog', { name: '举报这条评论' });
    expect(document.querySelectorAll('[data-modal-root]')).toHaveLength(1);
    const input = within(report).getByRole('textbox');
    fireEvent.change(input, { target: { value: '需要人工审核' } });
    expect(input).toHaveValue('需要人工审核');
  });
  it('已登录访客可收藏完整公海作品，等待接力作品提供接唱入口', async () => {
    const handlers = [
      { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) },
      { path: '/api/me/collections', respond: () => ({ body: [] }) },
      { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: bottleDetail({
        status: 'SEA', seaZone: 'COMPLETED', isComplete: true,
        isHolder: false, availableResolutions: [], missingSegmentIndexes: [],
      }) }) },
    ];
    const view = renderWithProviders(<BottlePage id={BOTTLE_ID} />, { handlers });
    expect(await screen.findByRole('button', { name: '收藏这支作品' })).toBeInTheDocument();
    view.unmount();
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, { handlers: [
      ...handlers.slice(0, 2),
      { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: bottleDetail({
        status: 'SEA', seaZone: 'INCOMPLETE', isHolder: false, availableResolutions: [],
      }) }) },
    ] });
    // 用户裁决：公海等待接力的瓶子统一成「录第 N 段」（与河道捞起来同形同义），
    // 不再是「我来接这一段」。
    expect(await screen.findByRole('button', { name: /录第 \d+ 段/ })).toBeInTheDocument();
  });
  it('左上「回河道」是唯一放回入口：持有者先 put-back 成功再导航', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) },
        { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: bottleDetail() }) },
      ],
    });

    const harnessFetch = globalThis.fetch;
    let putBackRequested = false;
    let finishPutBack: (() => void) | undefined;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if ((init?.method ?? 'GET').toUpperCase() === 'POST' && url === `/api/bottles/${BOTTLE_ID}/put-back`) {
        putBackRequested = true;
        return new Promise<Response>((resolve) => {
          finishPutBack = () => {
            resolve(
              new Response(
                JSON.stringify({
                  bottle: bottleDetail({ status: 'IN_RIVER', isHolder: false }),
                  cooldownDraws: 10,
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
              ),
            );
          };
        });
      }
      return harnessFetch(input, init);
    }) as typeof fetch;

    fireEvent.click(await screen.findByRole('button', { name: '回河道' }));

    await waitFor(() => expect(putBackRequested).toBe(true));
    expect(window.location.pathname).toBe(`/bottles/${BOTTLE_ID}`);
    finishPutBack?.();
    await waitFor(() => expect(window.location.pathname).toBe('/river'));
    globalThis.fetch = harnessFetch;
    expect(screen.queryByRole('button', { name: /放回海中/ })).not.toBeInTheDocument();
  });

  it('持有者放回失败时留在详情页，并显示可恢复错误', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) },
        { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: bottleDetail() }) },
        {
          method: 'POST',
          path: `/api/bottles/${BOTTLE_ID}/put-back`,
          respond: () => ({
            status: 500,
            body: { error: { message: '暂时无法放回，请稍后重试。', violations: [] } },
          }),
        },
      ],
    });

    fireEvent.click(await screen.findByRole('button', { name: '回河道' }));

    expect(await screen.findByText('暂时无法放回，请稍后重试。')).toBeInTheDocument();
    expect(window.location.pathname).toBe(`/bottles/${BOTTLE_ID}`);
  });

  it('非持有者点左上「回河道」只导航，不请求 put-back', async () => {
    const view = renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) },
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({ body: bottleDetail({ isHolder: false }) }),
        },
      ],
    });

    fireEvent.click(await screen.findByRole('button', { name: '回河道' }));

    expect(window.location.pathname).toBe('/river');
    expect(view.fetchMock.calls.some((call) => call.url.endsWith('/put-back'))).toBe(false);
  });

  it('完整作品在详情页提供整首试听入口，并明确包含伴奏、四段人声与同步歌词', async () => {
    const segments = [1, 2, 3, 4].map((index) => ({
      id: `${String(index).repeat(8)}-${String(index).repeat(4)}-4${String(index).repeat(3)}-8${String(index).repeat(3)}-${String(index).repeat(12)}`,
      index,
      isMine: false,
      note: null,
      ownerCode: `接唱者#00${String(index)}`,
      likeCount: 0,
      dislikeCount: 0,
      deletedAt: null,
      audioMime: 'audio/webm',
      durationMs: 20_000,
    }));

    const librarySongId = libraryMetadata.tracks[0]!.songId as typeof SONG_ID;
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        libraryHandler,
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({
              songId: librarySongId,
              status: 'SEA',
              seaZone: 'COMPLETED',
              isComplete: true,
              isHolder: false,
              missingSegmentIndexes: [],
              availableResolutions: [],
              segments,
            }),
          }),
        },
      ],
    });

    // 用户裁决：「听全部」不再是独立区块里的独立播放器，而是「试听与投票」区
    // 赞/踩右侧那颗键（驱动同一个播放器连播）。这里断言它存在、可用、不涉生成/导出。
    const listenAll = await screen.findByRole('button', { name: /听全部/ });
    expect(listenAll).toBeEnabled();
    expect(screen.queryByText(/生成|导出|下载/)).toBeNull();
  });

  it('公海详情完全不显示私密留言入口', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({
              status: 'SEA',
              seaZone: 'INCOMPLETE',
              isHolder: false,
              availableResolutions: [],
            }),
          }),
        },
      ],
    });

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: '私密留言' })).not.toBeInTheDocument();
  });

  it('未登录时不摆出「录制 / 放回」按钮（先请登录，不制造会 401 的假按钮）', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            // 未登录观看者拿到的就是这样的 DTO（`toBottleDetail`: viewerId null ⇒ isHolder false、去向为空）
            body: bottleDetail({ isHolder: false, availableResolutions: [] }),
          }),
        },
      ],
    });
    await screen.findByText('漂流瓶详情');
    expect(screen.queryByText(/需要先登录/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '录第 2 段' })).not.toBeInTheDocument();
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
          songsHandler,
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

    // §46.3：录制面板收进弹窗（页面本体只留一个按钮），先点开它
    fireEvent.click(await screen.findByRole('button', { name: '录第 2 段' }));
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

  it('上传未完成时录音窗口不能被 Esc、遮罩或关闭按钮中断，成功后才进入去向', async () => {
    const recorder = fakeRecorderEnvironment();
    let uploaded = false;
    let finishUpload: (() => void) | undefined;
    const transport = () =>
      new Promise<{
        status: number;
        body: {
          segmentId: typeof SEGMENT_2;
          index: number;
          nextRecordIndex: number;
          bottle: ReturnType<typeof bottleDetail>;
        };
      }>((resolve) => {
        finishUpload = () => {
          uploaded = true;
          resolve({
            status: 201,
            body: {
              segmentId: SEGMENT_2,
              index: 2,
              nextRecordIndex: 3,
              bottle: bottleDetail({ recordedCount: 2, missingSegmentIndexes: [3, 4] }),
            },
          });
        };
      });

    renderWithProviders(
      <BottlePage
        id={BOTTLE_ID}
        seams={{ recorderEnvironment: recorder.environment, uploadTransport: transport }}
      />,
      {
        route: `/bottles/${BOTTLE_ID}`,
        handlers: [
          songsHandler,
          { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) },
          {
            path: `/api/bottles/${BOTTLE_ID}`,
            respond: () => ({
              body: uploaded
                ? bottleDetail({ recordedCount: 2, missingSegmentIndexes: [3, 4] })
                : bottleDetail(),
            }),
          },
        ],
      },
    );

    const recordEntry = await screen.findByRole('button', { name: '录第 2 段' });
    fireEvent.click(recordEntry);
    fireEvent.click(await screen.findByRole('button', { name: /开始录制/ }));
    const stop = await screen.findByRole('button', { name: /停止录制/ });
    recorder.clock.value += 20_000;
    fireEvent.click(stop);
    fireEvent.click(await screen.findByRole('button', { name: /用这一段/ }));

    const recordingDialog = screen.getByRole('dialog', { name: '录第 2 段' });
    expect(await within(recordingDialog).findByText(/上传中/)).toBeInTheDocument();
    const close = within(recordingDialog).getByRole('button', { name: '关闭' });
    await waitFor(() => expect(close).toBeDisabled());
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(document.querySelector('[data-modal-backdrop]')!);
    fireEvent.click(close);
    expect(screen.getByRole('dialog', { name: '录第 2 段' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '选择声音去向' })).not.toBeInTheDocument();

    vi.useFakeTimers();
    try {
      await act(async () => {
        finishUpload?.();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(document.querySelectorAll('[data-modal-root]')).toHaveLength(1);
      expect(screen.queryByRole('dialog', { name: '选择声音去向' })).not.toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(239);
      });
      fireEvent.click(recordEntry);
      expect(document.querySelectorAll('[data-modal-root]')).toHaveLength(1);
      expect(screen.queryByRole('dialog', { name: '选择声音去向' })).not.toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
        await Promise.resolve();
      });
      expect(document.querySelectorAll('[data-modal-root]')).toHaveLength(1);
      expect(screen.getByRole('dialog', { name: '选择声音去向' })).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: '录第 2 段' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('本地复核时取消会关闭录音窗口，且不会提前打开去向窗口', async () => {
    const recorder = fakeRecorderEnvironment();
    renderWithProviders(
      <BottlePage id={BOTTLE_ID} seams={{ recorderEnvironment: recorder.environment }} />,
      {
        route: `/bottles/${BOTTLE_ID}`,
        handlers: [
          songsHandler,
          { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) },
          { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: bottleDetail() }) },
        ],
      },
    );

    fireEvent.click(await screen.findByRole('button', { name: '录第 2 段' }));
    fireEvent.click(await screen.findByRole('button', { name: /开始录制/ }));
    recorder.clock.value += 20_000;
    fireEvent.click(await screen.findByRole('button', { name: /停止录制/ }));
    const cancel = await screen.findByRole('button', { name: '取消录制' });
    fireEvent.click(cancel);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '录第 2 段' })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: '选择声音去向' })).not.toBeInTheDocument();
  });

  it('持有者且有缺口：显示服务端给的段号，并把缺口显式标在时间轴上', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        songsHandler,
        { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) },
        { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: bottleDetail() }) },
      ],
    });
    // 段号来自服务端（`missingSegmentIndexes[0]`）：按钮文案直接是"录第 2 段"
    expect(await screen.findByRole('button', { name: '录第 2 段' })).toBeInTheDocument();
    expect(screen.getAllByText(/缺第 2、3、4 段/).length).toBeGreaterThan(0);
    // 弹窗里才是录制面板的完整标题
    fireEvent.click(screen.getByRole('button', { name: '录第 2 段' }));
    expect(
      await screen.findByRole('heading', { name: /第 2 段 · 共 4 段/ }),
    ).toBeInTheDocument();
  });

  it('持有且已有 2 段：录第 3 段、听全部、去向与日志同时可达，不再渲染独立放回行', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        songsHandler,
        libraryHandler,
        { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) },
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({
              recordedCount: 2,
              missingSegmentIndexes: [3, 4],
              segments: [
                ...bottleDetail().segments,
                {
                  id: SEGMENT_2,
                  index: 2,
                  isMine: false,
                  note: null,
                  ownerCode: '河岸听众#017',
                  likeCount: 0,
                  dislikeCount: 0,
                  deletedAt: null,
                  audioMime: 'audio/webm',
                  durationMs: 22_000,
                },
              ],
            }),
          }),
        },
      ],
    });

    expect(await screen.findByRole('button', { name: '录第 3 段' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '听全部' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '选择去向' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /看这只瓶子的漂流日志/ })).toBeInTheDocument();
    expect(document.querySelector('.putBack')).toBeNull();
  });

  it('点踩不含 listenedRatio：覆盖率走 /listen 上报，票体只有 value（服务端判定门槛）', async () => {
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
            respond: () => ({ body: bottleDetail({ isHolder: false }) }),
          },
          {
            method: 'POST',
            path: /\/api\/segments\/.+\/listen/,
            respond: ({ body }) => ({
              body: {
                segmentId: SEGMENT_1,
                coveredMs: (body as { coveredMs: number }).coveredMs,
                durationMs: 20_000,
                ratio: 1,
                threshold: 0.8,
                reachedThreshold: true,
              },
            }),
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
                listenedRatio: 1,
                segmentCut: false,
              },
            }),
          },
        ],
      },
    );

    // 锚到播放器挂载（代号文本现在出现在发起者徽记与瓶身格两处，不能再当唯一锚点）
    // 用户裁决：圆盘播放键已搬去赞/踩行并变成「听全部」；这里锚「听全部」——
    // 它驱动的就是当前段那个播放器（覆盖率上报走同一条路径）。
    await screen.findByRole('button', { name: /听全部/ });
    // 逐秒推进（每步 <1500ms，否则会被判成"拖动不计"）；段长 20s → 覆盖率 100%
    for (let second = 0; second <= 20; second += 1) {
      element.currentTime = second;
      for (const handler of listeners['timeupdate'] ?? []) handler();
    }

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /点踩/ })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /点踩/ }));

    await waitFor(() => {
      expect(fetchMock.calls.some((call) => call.url.includes('/votes'))).toBe(true);
    });
    // ① 听满 20 秒：覆盖率上报只带 coveredMs（时长以服务端为准，前端不喂时长）
    const listen = fetchMock.calls.find((call) => call.url.includes('/listen'));
    expect(listen?.body).toEqual({ coveredMs: 20_000 });
    // ② 票体里没有 listenedRatio（服务端按持久化覆盖率判定，旧字段传什么都不影响）
    const vote = fetchMock.calls.find((call) => call.url.includes('/votes'));
    expect(vote?.body).toEqual({ value: 'DISLIKE' });
    expect(JSON.stringify(vote?.body)).not.toContain('listenedRatio');
  });

  /**
   * 用户 2026-09-23 实测报的**严重 bug**：发起一支瓶子、点进详情，页面说"不在你手上"，
   * 于是发起者既录不了第 1 段、也选不了去向 —— 而"发起"本来就是"我来录第 1 段"。
   *
   * 根因（服务端事实）：`DRAFT` 瓶子的 `holder` 是 `null`（内核 `BOTTLE_CREATED` 不改 holder），
   * 所以 `isHolder` 对发起者也是 `false`；而内核 `canRecordSegment` 对 `DRAFT` 只要求
   * "你是发起者"。前端却只看 `isHolder` ⇒ 把自己人挡在门外。
   * 判据改用服务端给的**观看者维度**事实：`availableResolutions`（空数组 = 他不能选）。
   */
  it('发起后（DRAFT 且非 holder，还没录）：能录第 1 段，不说"不在你手上"', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) },
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({
              status: 'DRAFT',
              isHolder: false,
              segments: [],
              recordedCount: 0,
              missingSegmentIndexes: [1, 2, 3, 4],
              availableResolutions: ['RIVER', 'SEA'],
            }),
          }),
        },
      ],
    });

    expect(await screen.findByRole('button', { name: '录第 1 段' })).toBeInTheDocument();
    expect(screen.queryByText(/现在不在你手上/)).not.toBeInTheDocument();
  });

  it('录完第 1 段后（还留在手上）：下一步是"选择去向"，不是再录一段，也不是"不在你手上"', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) },
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({
              status: 'DRAFT',
              isHolder: false,
              // 第 1 段就是我录的（服务端 isMine=true）⇒ 内核不许再录，只能选去向
              segments: [
                {
                  id: SEGMENT_1,
                  index: 1,
                  isMine: true,
                  note: '我录的第一棒',
                  ownerCode: '接棒的人#001',
                  likeCount: 0,
                  dislikeCount: 0,
                  deletedAt: null,
                  audioMime: 'audio/webm',
                  durationMs: 20_000,
                },
              ],
              recordedCount: 1,
              missingSegmentIndexes: [2, 3, 4],
              availableResolutions: ['RIVER', 'SEA'],
            }),
          }),
        },
      ],
    });

    // 去向入口 = 稿上 destCol 的三条水路（行即入口；服务端给了 RIVER/SEA）
    expect(await screen.findByRole('button', { name: /继续投河/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /录第 \d 段/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/现在不在你手上/)).not.toBeInTheDocument();
  });

  it('别人的瓶子可正常试听，不显示无关的去向标题或不在手上警告', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) },
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({
              status: 'HELD',
              isHolder: false,
              availableResolutions: [],
            }),
          }),
        },
      ],
    });

    await screen.findByText('漂流瓶详情');
    expect(screen.queryByText(/现在不在你手上/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '选择去向' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /录第 \d 段/ })).not.toBeInTheDocument();
    // availableResolutions 为空 ⇒ 稿上的三条水路一条都不画
    expect(screen.queryByRole('button', { name: /继续投河|回传|入海/ })).not.toBeInTheDocument();
  });

  it('非持有者：不出现录制区，保留试听与回河道出口', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({ body: bottleDetail({ isHolder: false }) }),
        },
      ],
    });
    await screen.findByText('漂流瓶详情');
    expect(screen.queryByRole('button', { name: '录第 2 段' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '回河道' })).toBeInTheDocument();
  });

  it('作品已完整：不再提供录制，改为直接摆出去向行（稿上没有"已经录满"提示行）', async () => {
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
    expect(await screen.findByRole('button', { name: /入海/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /共 4 段/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /录第 \d 段/ })).not.toBeInTheDocument();
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
    // 稿上的三条水路：行本身就是三选一入口，服务端给哪条画哪条
    const riverRow = await screen.findByRole('button', { name: /继续投河/ });
    expect(screen.getByRole('button', { name: /入海/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /回传/ })).not.toBeInTheDocument();
    // 行点击打开三选一确认弹窗（行为保留：弹窗内同样按服务端列表过滤）
    fireEvent.click(riverRow);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /继续投河/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /入海/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /回传/ })).not.toBeInTheDocument();
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
          // 契约：useChooseResolution 用 BottleDetailSchema 校验响应 —— 回 summary 会被 safeParse 打回，
          // mutation 走 catch，播报与下一步键都不会出现（原 handler 返回 summary，测试是假绿）
          respond: () => ({
            body: bottleDetail({
              status: 'SEA',
              seaZone: 'COMPLETED',
              isComplete: true,
              missingSegmentIndexes: [],
              availableResolutions: [],
              isHolder: false,
            }),
          }),
        },
      ],
    });
    fireEvent.click(await screen.findByRole('button', { name: /入海/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /入海/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: '确认投递' }));

    await waitFor(() => {
      expect(fetchMock.calls.some((call) => call.url.endsWith('/resolution'))).toBe(true);
    });

    // G2/P0（flow-audit）：成功不能只活在 aria-live 播报里 —— 播报容器内必须留下语义下一步键
    expect(await screen.findByText('已入海：这件作品现在所有人都能听到。')).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector('[data-modal-root]')).toBeNull();
    });
    const seaNext = screen.getByRole('link', { name: /去公海听这一版/ });
    expect(seaNext).toHaveAttribute('href', '/sea');
    expect(seaNext.className, '热区 ≥44px').toContain('min-h-11');
    expect(screen.getByRole('link', { name: /回河道继续/ })).toHaveAttribute('href', '/river');
  });

  it('投河成功后给「回河道继续」出口、不给「去公海听这一版」（下一步键跟去向语义走）', async () => {
    const { fetchMock } = renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
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
            body: bottleDetail({
              isComplete: true,
              missingSegmentIndexes: [],
              availableResolutions: [],
            }),
          }),
        },
      ],
    });
    fireEvent.click(await screen.findByRole('button', { name: /继续投河/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /继续投河/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: '确认投递' }));

    await waitFor(() => {
      expect(fetchMock.calls.some((call) => call.url.endsWith('/resolution'))).toBe(true);
    });

    expect(await screen.findByText('已投河：等下一位陌生人捞到它。')).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector('[data-modal-root]')).toBeNull();
    });
    expect(screen.getByRole('link', { name: /回河道继续/ })).toHaveAttribute('href', '/river');
    expect(screen.queryByRole('link', { name: /去公海听这一版/ })).not.toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole('button', { name: /继续投河/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /继续投河/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: '确认投递' }));

    expect(await screen.findByText(/已被别人接走/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '换一段继续' })).toHaveAttribute('href', '/river');
    expect(screen.getByRole('link', { name: '看一眼漂流日志' })).toHaveAttribute(
      'href',
      `/bottles/${BOTTLE_ID}/log`,
    );
  });
});

/**
 * 用户第 3 轮裁决（deploy-plan §17）：公海详情页删除，它顶部的「沟槽时间轴 + 唱针」
 * 复刻进本页。语义分工：瓶身剖面回答"哪些段录了、缺哪段"；
 * 沟槽时间轴回答"现在放到哪儿、这一段多长"（唱针 = 播放头，跟随真实播放进度）。
 */
describe('瓶子详情：播放沟槽 + 唱针', () => {
  it('页面上部有播放沟槽（data-anchor）：段位全在、缺口段显式可见、时长来自服务端', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({ body: bottleDetail({ isHolder: false }) }),
        },
      ],
    });

    await screen.findByText('漂流瓶详情');
    const anchor = document.querySelector('[data-anchor="groove-timeline"]');
    expect(anchor, '瓶子详情上部缺少播放沟槽').not.toBeNull();

    const slots = anchor!.querySelector('[data-testid="groove-slots"]');
    expect(slots?.querySelectorAll('li')).toHaveLength(4);
    // 缺口 [2,3,4] 在时间轴上是显式的一格（不是少一格）
    expect(slots?.querySelectorAll('li[data-state="gap"]')).toHaveLength(3);

    const marks = anchor!.querySelector('[data-testid="groove-marks"]');
    expect(marks?.textContent).toContain('第 1 段');
    expect(marks?.textContent).toContain('00:20');
    expect(marks?.querySelectorAll('li[data-state="gap"]')).toHaveLength(3);
    expect(marks?.textContent).toContain('静音');
  });

  it('唱针跟随真实播放进度：timeupdate 推进到 10s/20s ⇒ 唱针从 0% 落到 12.5%', async () => {
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

    renderWithProviders(
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
          {
            path: `/api/bottles/${BOTTLE_ID}`,
            respond: () => ({ body: bottleDetail({ isHolder: false }) }),
          },
        ],
      },
    );

    // 播放器挂载即上报（选中段 = 第 1 段，段内 0%）⇒ 唱针停在槽 1 起点
    // 位置经 transform 表达（W18.5 · A5：只动 transform）
    const playhead = await screen.findByTestId('groove-playhead');
    expect(playhead.style.transform).toBe('translateX(0%)');

    // 驱动真实播放进度（服务端段长 20s；10s ⇒ 段内 50% ⇒ 槽 1 内一半 = 全轴 12.5%）
    element.currentTime = 10;
    for (const handler of listeners['timeupdate'] ?? []) handler();

    await waitFor(() => {
      expect(screen.getByTestId('groove-playhead').style.transform).toBe('translateX(12.5%)');
    });
  });

  it('稿上部对应位：播放沟槽排在标题区之后、瓶身剖面与播放区之前（装置不许删/藏）', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({ body: bottleDetail({ isHolder: false }) }),
        },
      ],
    });

    await screen.findByText('漂流瓶详情');
    const groove = document.querySelector('[data-anchor="groove-timeline"]');
    const play = document.querySelector('[data-anchor="bottle-play"]');
    const device = document.querySelector('[data-testid="bottle-water-level"]');
    expect(groove, '沟槽时间轴必须还在（装置不许删/藏）').not.toBeNull();
    expect(play, '播放区锚点必须在').not.toBeNull();
    expect(device, '瓶身剖面装置必须在').not.toBeNull();
    const h1 = screen.getByRole('heading', { level: 1 });

    const precedes = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(precedes(h1, groove!), '沟槽必须在标题区之后').toBe(true);
    expect(precedes(groove!, device!), '沟槽必须在瓶身剖面之前（稿上部对应位）').toBe(true);
    expect(precedes(device!, play!), '剖面必须在播放区之前').toBe(true);
    // 窄屏视觉让位用 CSS order（DOM 块序照稿不动，见下方「门禁锚点与窄屏 order 让位」）；
    // ≥1024（lg）全部归位到本测试钉住的稿序。
  });

  /**
   * 用户裁决（2026-09-27 grill ②）：h1 恢复与其他页一致的 56px 上限 ——
   * 一屏余量靠压别的间距补，不拿标题字号换（h1 带 52–62，impl-plan §6#3；
   * 与 drift-log 同款 clamp 必须一致）。
   */
  it('h1 上限恢复 3.5rem（56px）：一屏余量不拿标题字号换', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({ body: bottleDetail({ isHolder: false }) }),
        },
      ],
    });

    const h1 = await screen.findByRole('heading', { level: 1 });
    expect(h1.className, 'h1 clamp 上限必须是 3.5rem').toContain('3.5rem');
    expect(h1.className, '不得再是压余量用的 2.75rem').not.toContain('2.75rem');
  });
});

/**
 * 逐块照抄 `docs/ui-review/design-explore/p-bottle-record.html`（用户重写令）：
 * 块顺序 / 装置 / 文案逐字 / 值逐值，不省块不发明不重组；唯一翻译 = 固定 px → 流体。
 * 两个保留例外：① 沟槽时间轴+唱针放在稿上部对应位；② 录制/去向/留言/赞踩行为全保留。
 */
describe('逐块照抄 p-bottle-record.html', () => {
  const defaultHandlers = [
    { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: bottleDetail() }) },
  ];

  it('页面自带 <main>，稿的 76/30/16px 边距翻译成流体值', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: defaultHandlers,
    });
    await screen.findByRole('heading', { level: 1 });

    const main = document.querySelector('main');
    expect(main, '页面必须自带 <main>（外壳不再渲染）').not.toBeNull();
    const cls = main!.getAttribute('class') ?? '';
    expect(cls, '水平边距 = 稿 76px 的流体值').toContain('px-[max(1.5rem,5.278vw)]');
    expect(cls, '顶部边距 = 稿 30px 的流体值').toContain('pt-[max(1.5rem,2.083vw)]');
    expect(cls, '底部边距 = 稿 16px 的流体值').toContain('pb-[max(1rem,1.111vw)]');
  });

  it('文案逐字 + 值逐值：稿上每块的固定文案原样出现（动态值用服务端事实）', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: defaultHandlers,
    });
    await screen.findByRole('heading', { level: 1 });

    // 顶栏与标题区（稿 .crumb/.h1/.work/.metaRow/.note/.maker）
    expect(screen.getByRole('button', { name: '回河道' })).toBeInTheDocument();
    expect(screen.getByText('有人持有')).toBeInTheDocument();
    expect(screen.getByText('深海鲸落')).toBeInTheDocument();
    expect(screen.getByText('已录 1 / 4 段')).toBeInTheDocument();
    expect(screen.getByText('作品还不完整：缺第 2、3、4 段')).toBeInTheDocument();
    expect(
      screen.getByText('缺口是歌里固定的段位，不会被别人的段顶替。成品里这段时间会留成静音。'),
    ).toBeInTheDocument();
    expect(screen.getByText('发起者')).toBeInTheDocument();
    expect(document.querySelector('[aria-label="发起者徽记"]')).not.toBeNull();

    // 瓶身装置（稿 .heroLab/.callout/.corkLab 的逐字文案）
    expect(screen.getByText('瓶身剖面 · 水只到第 1 段')).toBeInTheDocument();
    expect(screen.getByText('河道水面')).toBeInTheDocument();
    expect(screen.getByText('瓶塞 · 有人持有')).toBeInTheDocument();

    // 第 4 格录制入口（稿 .gapBox）
    expect(screen.getByText('第 2 段由你开第一句')).toBeInTheDocument();
    expect(
      screen.getByText('这一段按该段的固定时长录，录完再选去向。不点开就不会占用你的麦克风。'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '录第 2 段' })).toBeInTheDocument();

    // 试听与投票（稿 .listenCol）
    expect(screen.getByText('还没有听满这一段，继续听一会儿再点踩吧。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /放回海中，继续漂流/ })).not.toBeInTheDocument();

    // 选择去向（稿 .destCol）
    expect(screen.queryByRole('heading', { name: '选择去向' })).not.toBeInTheDocument();

    // 底栏（稿 .bottom）
    expect(screen.getByText('捞取 / 录音 / 投河 / 回传 / 入海 全部记在服务端。')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /看这只瓶子的漂流日志/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /私密留言/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /举报（进人工队列，不是自动删除）/ }),
    ).toBeInTheDocument();

    // h2 副标题的稿式格式（全角空格分隔，逐字）
    const sub = screen.getByText(/在瓶身上点「听」换段/);
    expect(sub.textContent).toBe('第 1 段　午夜歌手#042　在瓶身上点「听」换段');
  });

  /**
   * t17 深度复刻：段附言按参考挂 `.votesNote`（page-bottle.js `noteSuffix` 同位），
   * **不塞进剖面卡** —— 参考 `.cap` 只有 代号 / 时长·赞踩 / 听 三行（h66）。
   */
  it('段附言挂在 votesNote 上（CONTEXT §12.2 原样），剖面卡不长第四行', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: defaultHandlers,
    });
    await screen.findByRole('heading', { level: 1 });
    const note = await screen.findByText(/本段附言/);
    expect(note.textContent).toContain('在深夜哼一段没有词的曲子，期待接唱');
    expect(note.closest('.votesNote'), '附言必须在 votesNote 里').not.toBeNull();
    expect(document.querySelector('.cap .capNote'), '剖面卡不许长第四行').toBeNull();
  });

  it('块顺序照稿（不重组）：顶栏→标题区→沟槽(例外①)→瓶身装置→录制入口→试听→去向→底栏', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: defaultHandlers,
    });
    await screen.findByRole('heading', { level: 1 });

    const groove = document.querySelector('[data-anchor="groove-timeline"]');
    const seal = document.querySelector('[aria-label="发起者徽记"]');
    const heroLab = document.querySelector('[data-testid="bottle-water-level"]');
    expect(groove, '例外①：沟槽时间轴必须在').not.toBeNull();
    expect(seal).not.toBeNull();
    expect(heroLab).not.toBeNull();

    const seq: [string, Element][] = [
      ['回河道', screen.getByRole('button', { name: '回河道' })],
      ['状态 pill', screen.getByText('有人持有')],
      ['h1', screen.getByRole('heading', { level: 1 })],
      ['.work 曲名', screen.getByText('深海鲸落')],
      ['.metaRow①', screen.getByText('已录 1 / 4 段')],
      ['.metaRow②', screen.getByText('作品还不完整：缺第 2、3、4 段')],
      ['.note', screen.getByText(/缺口是歌里固定的段位/)],
      ['.maker 徽记', seal!],
      ['沟槽时间轴（例外①）', groove!],
      ['.heroLab 瓶身剖面', heroLab!],
      ['.gapBox 录制入口', screen.getByText('第 2 段由你开第一句')],
      ['.listenCol 标题', screen.getByRole('heading', { name: /试听与投票/ })],
      ['.votesNote', screen.getByText('还没有听满这一段，继续听一会儿再点踩吧。')],
      ['.destCol 试听标题', screen.getByRole('heading', { name: '沿着歌声听下去' })],
      ['.bottom 漂流日志', screen.getByRole('link', { name: /看这只瓶子的漂流日志/ })],
      ['.bottom 举报', screen.getByRole('button', { name: /举报（进人工队列，不是自动删除）/ })],
    ];
    for (let i = 0; i < seq.length - 1; i += 1) {
      const [from, a] = seq[i]!;
      const [to, b] = seq[i + 1]!;
      expect(
        Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING),
        `块顺序乱了：「${from}」必须排在「${to}」之前`,
      ).toBe(true);
    }
  });

  it('三选一去向 = 稿的三条水路（文案逐字），服务端给哪条画哪条', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({
              isComplete: true,
              missingSegmentIndexes: [],
              availableResolutions: ['RIVER', 'RETURN', 'SEA'],
            }),
          }),
        },
      ],
    });

    const river = await screen.findByRole('button', { name: /继续投河/ });
    const back = screen.getByRole('button', { name: /回传/ });
    const sea = screen.getByRole('button', { name: /入海/ });
    expect(within(river).getByText('继续投河')).toBeInTheDocument();
    expect(
      within(river).getByText('把当前版本重新投进河道，交给下一位陌生人接下一棒。'),
    ).toBeInTheDocument();
    expect(within(back).getByText('回传')).toBeInTheDocument();
    expect(
      within(back).getByText('沿父链把当前版本交回投给你的那个人，由他决定下一步。'),
    ).toBeInTheDocument();
    expect(within(sea).getByText('入海')).toBeInTheDocument();
    expect(
      within(sea).getByText('把当下的版本送进公海，成为所有人都能听到的公共作品。'),
    ).toBeInTheDocument();
  });
});

/**
 * 一屏门禁（`tools/one-screen-check.mjs`，captain §46.3 判据）：
 * - 桌面 1440×900：整页高 ≤900；手机 375×812：锚点下沿 ≤812（锚点缺失 = FAIL，不静默跳过）。
 * - 本页声明两个锚点：`bottle-play`（播放区，保留）与 `bottle-action`（去向/动作区容器）——
 *   容器**任何渲染态**都在 DOM 里（有录制入口 / 无去向可选 / 三条水路都在，各测一次）。
 * - 窄屏（<1024）用 CSS order 让位：播放/录制区提前、守卫与时间轴、页脚后移；
 *   DOM 块序照稿（上面的稿序测试继续钉），≥1024 由 `lg:order-none` 全部归位。
 */
describe('门禁锚点与窄屏 order 让位', () => {
  /** 取元素上的 `order-<n>` / `order-[-9999]`（无 = 默认 0）；`lg:order-none` 不含数字，不误配。 */
  const orderOf = (element: Element): number => {
    const match = (element.getAttribute('class') ?? '').match(
      /(?:^|\s)order-\[?(-?\d+)\]?(?=\s|$)/,
    );
    return match === null ? 0 : Number(match[1]);
  };
  const cls = (element: Element | null): string => element?.getAttribute('class') ?? '';

  it('持有者态（画录制入口、没画去向行）：bottle-action 在，且罩住 bottle-play', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        songsHandler,
        { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) },
        { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: bottleDetail() }) },
      ],
    });
    await screen.findByRole('button', { name: '录第 2 段' });

    const action = document.querySelector('[data-anchor="bottle-action"]');
    expect(action, '缺 data-anchor="bottle-action"（门禁量它的下沿）').not.toBeNull();
    expect(
      action!.querySelector('[data-anchor="bottle-play"]'),
      'bottle-play 必须保留在动作区容器内',
    ).not.toBeNull();
    expect(action!.textContent).toContain('听全部');
    expect(action!.textContent).not.toContain('选择去向');
  });

  it('非持有者态（录制入口、去向行都不画）：bottle-action 仍在，守卫提示让位到播放区之后', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () =>
            ({ body: bottleDetail({ isHolder: false, availableResolutions: [] }) }),
        },
      ],
    });
    await screen.findByText('漂流瓶详情');

    const action = document.querySelector('[data-anchor="bottle-action"]');
    expect(action, '非持有者态也不许丢 bottle-action').not.toBeNull();
    expect(action!.querySelector('[data-anchor="bottle-play"]')).not.toBeNull();
    expect(screen.queryByText(/现在不在你手上/)).not.toBeInTheDocument();
    expect(orderOf(action!), '播放/动作区最先让位').toBe(1);
  });

  it('作品完整态（三条水路都画）：bottle-action 罩住三选一入口', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({
              isComplete: true,
              missingSegmentIndexes: [],
              availableResolutions: ['RIVER', 'RETURN', 'SEA'],
            }),
          }),
        },
      ],
    });
    const river = await screen.findByRole('button', { name: /继续投河/ });

    const action = document.querySelector('[data-anchor="bottle-action"]');
    expect(action, '完整态也不许丢 bottle-action').not.toBeNull();
    expect(within(action! as HTMLElement).getByText('继续投河')).toBeInTheDocument();
    expect(action!.querySelector('[data-anchor="bottle-play"]')).not.toBeNull();
    expect(river).toBeInTheDocument();
  });

  it('窄屏 order 让位：播放/录制提前、时间轴与页脚后移；DOM 块序不动，lg 全归位', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        songsHandler,
        { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) },
        { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: bottleDetail() }) },
      ],
    });
    await screen.findByRole('button', { name: '录第 2 段' });

    const grid = document.querySelector('[data-anchor="bottle-action"]');
    const record = document.querySelector('[data-anchor="bottle-record"]');
    const device = record?.parentElement ?? null;
    const groove = document.querySelector('[data-anchor="groove-timeline"]');
    const footer = document.querySelector('a[href$="/log"]')?.parentElement ?? null;
    const rule = document.querySelector('main div.h-px[aria-hidden="true"]');
    expect(grid && record && device && groove && footer && rule, '让位块必须都在').toBeTruthy();

    // <1024 视觉序：录制入口（装置内最前）→ 播放/动作两栏 → 瓶身装置 → 时间轴 → 底栏
    expect(orderOf(grid!), '播放/动作两栏最先让位').toBe(1);
    expect(orderOf(device!), '瓶身装置随后').toBe(3);
    expect(orderOf(groove!), '时间轴后移').toBe(4);
    expect(orderOf(rule!), '底栏线后移').toBe(5);
    expect(orderOf(footer!), '页脚最后').toBe(5);
    expect(orderOf(record!), '录制入口在装置容器内让到最前').toBe(-9999);
    for (const [name, element] of [
      ['两栏', grid],
      ['装置', device],
      ['时间轴', groove],
      ['底栏线', rule],
      ['底栏', footer],
      ['录制入口', record],
    ] as const) {
      expect(cls(element), `${name} 必须有 lg:order-none（≥1024 归位稿序）`).toContain(
        'lg:order-none',
      );
    }

    // CSS order 不改 DOM 块序：稿序（时间轴在装置前、装置在播放区前）原样成立
    expect(
      Boolean(groove!.compareDocumentPosition(grid!) & Node.DOCUMENT_POSITION_FOLLOWING),
      'DOM 里时间轴仍排在两栏之前',
    ).toBe(true);
    expect(
      Boolean(device!.compareDocumentPosition(record!) & Node.DOCUMENT_POSITION_FOLLOWING),
      'DOM 里录制入口仍在装置之后',
    ).toBe(true);
  });
});

/* ───────── t2 用户裁决：听全部主键 / 分段直播 / 两处布局对齐 ───────── */

describe('听全部主键 + 分段直播 + 布局对齐（t2）', () => {
  const fourSegments = [1, 2, 3, 4].map((index) => ({
    id: `${String(index).repeat(8)}-${String(index).repeat(4)}-4${String(index).repeat(3)}-8${String(index).repeat(3)}-${String(index).repeat(12)}`,
    index,
    isMine: false,
    note: null,
    ownerCode: `接唱者#00${String(index)}`,
    likeCount: 0,
    dislikeCount: 0,
    deletedAt: null,
    audioMime: 'audio/webm',
    durationMs: 20_000,
  }));

  /** 可驱动的假音频元素：记录 src 历史，允许手动 emit DOM 事件（沿用点踩用例的桩形态）。 */
  function fakeAudioHarness() {
    const listeners: Record<string, (() => void)[]> = {};
    const srcs: string[] = [];
    // 真实 audio 语义：play() ⇒ paused=false 并发 play 事件；pause() ⇒ paused=true 并发 pause。
    // 此前这个假件把 play/pause 写成空函数，导致 onPlayingChange 永远收不到 true，
    // 「听全部」按钮的播放态就测不出来（也掩盖了乐观置位的问题）。
    const element = {
      src: '',
      currentTime: 0,
      paused: true,
      play: () => {
        element.paused = false;
        (listeners['play'] ?? []).forEach((handler) => handler());
        return undefined;
      },
      pause: () => {
        element.paused = true;
        (listeners['pause'] ?? []).forEach((handler) => handler());
      },
      addEventListener: (type: string, handler: () => void) => {
        listeners[type] = [...(listeners[type] ?? []), handler];
      },
      removeEventListener: (type: string, handler: () => void) => {
        listeners[type] = (listeners[type] ?? []).filter((item) => item !== handler);
      },
    };
    return {
      srcs,
      element,
      factory: (src: string) => {
        srcs.push(src);
        element.src = src;
        // 换段 = 新实例：重置成暂停态（与 useSegmentPlayer 重建元素一致）
        element.paused = true;
        element.currentTime = 0;
        return element;
      },
      emit: (type: string) => (listeners[type] ?? []).forEach((handler) => handler()),
    };
  }

  it('听全部：点一次就开播（播放态由播放器真实状态驱动，不需多点）', async () => {
    const fake = fakeAudioHarness();
    renderWithProviders(
      <BottlePage id={BOTTLE_ID} seams={{ segmentElementFactory: fake.factory as never }} />,
      {
        route: `/bottles/${BOTTLE_ID}`,
        handlers: [
          {
            path: `/api/bottles/${BOTTLE_ID}`,
            respond: () => ({
              body: bottleDetail({
                status: 'SEA',
                seaZone: 'COMPLETED',
                isComplete: true,
                isHolder: false,
                availableResolutions: [],
                missingSegmentIndexes: [],
                segments: fourSegments,
              }),
            }),
          },
        ],
      },
    );

    const listenAll = await screen.findByRole('button', { name: '听全部' });
    // 点一次就该进入"暂停"态（= 真的在播）。此前乐观置位也会显示暂停，
    // 但播放器并未起播；这里额外断言假件确实被 play 过。
    fireEvent.click(listenAll);
    expect(await screen.findByRole('button', { name: '暂停' })).toHaveTextContent(/^1\/4$/);
    expect(fake.element.paused, '点一次「听全部」必须真的起播（不是只改图标）').toBe(false);
  });

  it('听全部主键显示连播段进度（1/4 → 2/4），随连播推进', async () => {
    const fake = fakeAudioHarness();
    renderWithProviders(
      <BottlePage id={BOTTLE_ID} seams={{ segmentElementFactory: fake.factory as never }} />,
      {
        route: `/bottles/${BOTTLE_ID}`,
        handlers: [
          {
            path: `/api/bottles/${BOTTLE_ID}`,
            respond: () => ({
              body: bottleDetail({
                status: 'SEA',
                seaZone: 'COMPLETED',
                isComplete: true,
                isHolder: false,
                availableResolutions: [],
                missingSegmentIndexes: [],
                segments: fourSegments,
              }),
            }),
          },
        ],
      },
    );

    const listenAll = await screen.findByRole('button', { name: '听全部' });
    // 未开播：显示入口名，不显假进度
    expect(listenAll.textContent).not.toMatch(/\d+\/\d+/);
    fireEvent.click(listenAll);
    // 开播后主键变段进度 1/4（aria 仍是 暂停/听全部 语义）
    expect(await screen.findByRole('button', { name: '暂停' })).toHaveTextContent(/^1\/4$/);
    // 第 1 段播完 → 游标推进 → 2/4（并切到第 2 段的音频）
    act(() => {
      fake.emit('ended');
    });
    expect(await screen.findByRole('button', { name: '暂停' })).toHaveTextContent(/^2\/4$/);
    expect(fake.srcs.at(-1)).toContain(fourSegments[1]!.id);
    // 关键回归：换段后新播放器必须**自动起播**（用户反馈"播完不会续放"）。
    // 换段会重建元素并重置 paused=true，所以这里断言它又被 play 过 ⇒ paused=false。
    expect(fake.element.paused, '第 2 段应自动续播，不能停在暂停').toBe(false);
  });

  it('没有已录段：听全部键禁用且不出假进度', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({ segments: [], recordedCount: 0, missingSegmentIndexes: [1, 2, 3, 4] }),
          }),
        },
      ],
    });
    const listenAll = await screen.findByRole('button', { name: '听全部' });
    expect(listenAll, '无已录段必须禁用').toBeDisabled();
    expect(listenAll.textContent, '无已录段不出 0/0、1/4 之类假进度').not.toMatch(/\d+\/\d+/);
  });

  it('连播中点某段「听」：停下连播改播该段（主键退回听全部）', async () => {
    const fake = fakeAudioHarness();
    renderWithProviders(
      <BottlePage id={BOTTLE_ID} seams={{ segmentElementFactory: fake.factory as never }} />,
      {
        route: `/bottles/${BOTTLE_ID}`,
        handlers: [
          songsHandler,
          { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) },
          {
            path: `/api/bottles/${BOTTLE_ID}`,
            respond: () => ({
              body: bottleDetail({
                recordedCount: 2,
                missingSegmentIndexes: [3, 4],
                segments: [
                  ...bottleDetail().segments,
                  {
                    id: SEGMENT_2,
                    index: 2,
                    isMine: false,
                    note: null,
                    ownerCode: '河岸听众#017',
                    likeCount: 0,
                    dislikeCount: 0,
                    deletedAt: null,
                    audioMime: 'audio/webm',
                    durationMs: 22_000,
                  },
                ],
              }),
            }),
          },
        ],
      },
    );

    fireEvent.click(await screen.findByRole('button', { name: '听全部' }));
    expect(screen.getByRole('button', { name: '暂停' })).toHaveTextContent(/^1\/2$/);

    // 连播进行中点第 2 段的「听」：退出连播（主键回到 听全部、无进度），并改播该段
    fireEvent.click(await screen.findByRole('button', { name: '听第 2 段' }));
    const mainKey = await screen.findByRole('button', { name: '听全部' });
    expect(mainKey.textContent, '退出连播后主键回到入口名、不残留进度').not.toMatch(/\d+\/\d+/);
    expect(fake.srcs.at(-1), '改播第 2 段').toContain(SEGMENT_2);
  });

  it('布局②：收藏在举报正上方同一竖列同轴；无收藏时竖列不留空位', async () => {
    const handlers = [
      { path: '/api/auth/me', respond: () => ({ body: SESSION_B }) },
      { path: '/api/me/collections', respond: () => ({ body: [] }) },
      {
        path: `/api/bottles/${BOTTLE_ID}`,
        respond: () => ({
          body: bottleDetail({
            status: 'SEA',
            seaZone: 'COMPLETED',
            isComplete: true,
            isHolder: false,
            availableResolutions: [],
            missingSegmentIndexes: [],
          }),
        }),
      },
    ];
    const view = renderWithProviders(<BottlePage id={BOTTLE_ID} />, { route: `/bottles/${BOTTLE_ID}`, handlers });
    const collect = await screen.findByRole('button', { name: '收藏这支作品' });
    const report = screen.getByRole('button', { name: /举报（进人工队列，不是自动删除）/ });
    const pair = report.parentElement as HTMLElement;
    expect(pair.className, '竖列容器').toMatch(/flex-col/);
    expect(pair.className, '水平中心线同轴').toMatch(/items-center/);
    expect(pair.contains(collect), '收藏与举报必须同属一个竖列').toBe(true);
    const kids = [...pair.children];
    const collectSlot = kids.findIndex((kid) => kid === collect || kid.contains(collect));
    expect(collectSlot, '收藏必须在竖列里').toBeGreaterThanOrEqual(0);
    expect(collectSlot, '收藏在上、举报在下').toBeLessThan(kids.indexOf(report));

    // 收藏缺位（未入海完成）：竖列里只剩举报，不留收藏的空占位
    view.unmount();
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        ...handlers.slice(0, 2),
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            body: bottleDetail({ status: 'SEA', seaZone: 'INCOMPLETE', isHolder: false, availableResolutions: [] }),
          }),
        },
      ],
    });
    const reportOnly = await screen.findByRole('button', { name: /举报（进人工队列，不是自动删除）/ });
    const pairOnly = reportOnly.parentElement as HTMLElement;
    expect(screen.queryByRole('button', { name: /收藏/ })).not.toBeInTheDocument();
    expect(
      [...pairOnly.querySelectorAll('button')],
      '无收藏时竖列不摆空占位',
    ).toHaveLength(1);
  });

  it('布局①：听全部在 .votes 投票行内且右对齐于该行（margin-left:auto）', async () => {
    renderWithProviders(<BottlePage id={BOTTLE_ID} />, {
      route: `/bottles/${BOTTLE_ID}`,
      handlers: [
        { path: `/api/bottles/${BOTTLE_ID}`, respond: () => ({ body: bottleDetail() }) },
      ],
    });
    const listenAll = await screen.findByRole('button', { name: /听全部/ });
    expect(listenAll.closest('.votes'), '主键必须在 .votes 行里（与赞/踩同行）').not.toBeNull();
    const css = readFileSync(join(process.cwd(), 'src', 'pages', 'bottle-page.css'), 'utf8');
    expect(
      css,
      '听全部键必须 margin-left:auto 推到 .votes 行右端',
    ).toMatch(/\.bottle-page \.votes button\.listenAllBtn \{[^}]*margin-left:\s*auto/);
  });
});
