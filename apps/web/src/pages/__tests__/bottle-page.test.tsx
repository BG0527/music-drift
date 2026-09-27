import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  BOTTLE_ID,
  SEGMENT_1,
  SEGMENT_2,
  USER_A,
  USER_B,
  bottleDetail,
  bottleSummary,
} from '../../test/fixtures';
import { fakeRecorderEnvironment, renderWithProviders } from '../../test/harness';
import { song } from '../../test/fixtures';
import { BottlePage } from '../bottle-page';

/**
 * 曲库桩：录制面板的分母 = 曲库该段的固定时长（用户第 4 条），
 * 所以只要页面会渲染录制面板，就必须把 `/api/songs` 档上。
 */
const songsHandler = { path: '/api/songs', respond: () => ({ body: [song()] }) };

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
      handlers: [
        {
          path: `/api/bottles/${BOTTLE_ID}`,
          respond: () => ({
            // 未登录观看者拿到的就是这样的 DTO（`toBottleDetail`: viewerId null ⇒ isHolder false、去向为空）
            body: bottleDetail({ isHolder: false, holderId: USER_A, availableResolutions: [] }),
          }),
        },
      ],
    });
    expect(await screen.findByText(/需要先登录/)).toBeInTheDocument();
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
    expect(await screen.findByText(/还有 2 段现在看不到/)).toBeInTheDocument();
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
            respond: () => ({ body: bottleDetail({ isHolder: false, holderId: USER_B }) }),
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

    await screen.findByText('午夜歌手#042');
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
              holderId: null,
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
              holderId: null,
              // 第 1 段就是我录的（ownerId = 当前会话用户）⇒ 内核不许再录，只能选去向
              segments: [
                {
                  id: SEGMENT_1,
                  index: 1,
                  ownerId: USER_B,
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

    expect(await screen.findByRole('button', { name: /选择去向/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /录第 \d 段/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/现在不在你手上/)).not.toBeInTheDocument();
  });

  it('别人的瓶子（既不持有也无去向可选）：仍然说"不在你手上"，且不出现录制/去向入口', async () => {
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
              holderId: USER_A,
              availableResolutions: [],
            }),
          }),
        },
      ],
    });

    expect(await screen.findByText(/现在不在你手上/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /录第 \d 段/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /选择去向/ })).not.toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: '录第 2 段' })).not.toBeInTheDocument();
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
          respond: () => ({ body: bottleDetail({ isHolder: false, holderId: USER_B }) }),
        },
      ],
    });

    expect(await screen.findByText(/现在不在你手上/)).toBeInTheDocument();
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
            respond: () => ({ body: bottleDetail({ isHolder: false, holderId: USER_B }) }),
          },
        ],
      },
    );

    // 播放器挂载即上报（选中段 = 第 1 段，段内 0%）⇒ 唱针停在槽 1 起点
    const playhead = await screen.findByTestId('groove-playhead');
    expect(playhead.style.left).toBe('0%');

    // 驱动真实播放进度（服务端段长 20s；10s ⇒ 段内 50% ⇒ 槽 1 内一半 = 全轴 12.5%）
    element.currentTime = 10;
    for (const handler of listeners['timeupdate'] ?? []) handler();

    await waitFor(() => {
      expect(screen.getByTestId('groove-playhead').style.left).toBe('12.5%');
    });
  });

  it('一屏门禁（<1024）：时间轴用 flex order 给播放/录制区让位，lg: 恢复「时间轴在上」的桌面构图', async () => {
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
    const groove = document.querySelector('[data-anchor="groove-timeline"]');
    const play = document.querySelector('[data-anchor="bottle-play"]');
    expect(groove, '沟槽时间轴必须还在（装置不许删/藏）').not.toBeNull();
    expect(play, '播放区锚点必须在').not.toBeNull();

    // 桌面构图靠 DOM 顺序：时间轴仍排在播放区之前（lg 及以上渲染成设计稿的「时间轴在上」）
    expect(
      Boolean(groove!.compareDocumentPosition(play!) & Node.DOCUMENT_POSITION_FOLLOWING),
      'DOM 顺序：时间轴必须仍在播放区之前',
    ).toBe(true);

    // <1024 靠 flex order 把时间轴推到首屏之后（375 一屏门禁），lg: 归位
    const grooveClass = groove!.getAttribute('class') ?? '';
    expect(grooveClass, '时间轴要有窄屏 order-1').toContain('order-1');
    expect(grooveClass, '时间轴要 lg 归位').toContain('lg:order-none');

    // 页脚跟着时间轴一起下移（否则页脚会插到时间轴前面）
    const footer = screen.getByText('看这只瓶子的漂流日志').parentElement;
    const footerClass = footer?.getAttribute('class') ?? '';
    expect(footerClass, '页脚要有窄屏 order-2').toContain('order-2');
    expect(footerClass, '页脚要 lg 归位').toContain('lg:order-none');
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
          respond: () => ({ body: bottleDetail({ isHolder: false, holderId: USER_B }) }),
        },
      ],
    });

    const h1 = await screen.findByRole('heading', { level: 1 });
    expect(h1.className, 'h1 clamp 上限必须是 3.5rem').toContain('3.5rem');
    expect(h1.className, '不得再是压余量用的 2.75rem').not.toContain('2.75rem');
  });
});
