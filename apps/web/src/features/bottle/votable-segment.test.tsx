/**
 * `VotableSegment` 单测：**一段的投票行为契约**（用户裁决：赞/踩 + 四态 + 小按钮）。
 *
 * 这里钉住的是四条"错了会让投票静默失效"的规则：
 * 1. **一段只有一个"踩"控件**：踩是"听满才可用"的动作，可用性判定归 `SegmentPlayer`；
 *    本组件不许再画第二个踩按钮（画了就会出现"点了没反应"的假按钮）；
 * 2. **票体不含 `listenedRatio`**：听多少由 `useSegmentListen` 上报、服务端判定（t20 起该字段被忽略）；
 * 3. **点踩先上报覆盖率再投票**：顺序反了服务端按旧覆盖率判 422；
 * 4. **服务端说没听满 → 把原因交出去**（页面弹提醒），既不禁用按钮、也不静默。
 *
 * 另外：内核 `canCastVote` 对"已投过的同一票"返回 `LIKE_ALREADY_CAST` / `DISLIKE_ALREADY_CAST`，
 * 所以"已赞/已踩"态下不再重复发请求（不做不可能成功的往返）。
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VotableSegment, type VotableSegmentItem } from './votable-segment';
import { renderWithProviders, type FetchHandler } from '../../test/harness';
import type { ListenReportTransport } from '../audio';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 契约里的 id 是 UUID（`UuidSchema`）：响应体不过校验就不是"服务端回传"了。 */
const SEGMENT_ID = '11111111-1111-4111-8111-111111111111';
const VOTE_PATH = `/api/segments/${SEGMENT_ID}/votes`;

/** 可控音频元素：与 `segment-player.test.tsx` 同一套（只喂进度，不发出真实声音）。 */
class FakeAudio {
  src: string;
  currentTime = 0;
  paused = true;
  play = vi.fn(async () => {
    this.paused = false;
    this.emit('play');
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.emit('pause');
  });
  private listeners = new Map<string, Set<() => void>>();

  constructor(src = '') {
    this.src = src;
  }

  addEventListener(type: string, handler: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(handler);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, handler: () => void): void {
    this.listeners.get(type)?.delete(handler);
  }

  emit(type: string): void {
    this.listeners.get(type)?.forEach((handler) => handler());
  }

  /** 播到第 N 秒（按 0.25s 步进，模拟 timeupdate；跳变会被判成 seek 而不计覆盖）。 */
  playThroughTo(seconds: number): void {
    for (let at = 0; at <= seconds + 1e-9; at += 0.25) {
      this.currentTime = Number(at.toFixed(3));
      this.emit('timeupdate');
    }
  }
}

const SEGMENT: VotableSegmentItem = {
  id: SEGMENT_ID,
  index: 2,
  ownerCode: '雾中松',
  durationMs: 20_000,
  likeCount: 3,
  dislikeCount: 1,
};

interface TransportCalls {
  calls: Array<{ kind: 'listen' | 'vote'; body: Record<string, unknown> }>;
  transport: ListenReportTransport;
}

function fakeTransport(overrides: Partial<ListenReportTransport> = {}): TransportCalls {
  const calls: TransportCalls['calls'] = [];
  const transport: ListenReportTransport = {
    reportListen: async (segmentId, coveredMs) => {
      calls.push({ kind: 'listen', body: { segmentId, coveredMs } });
      return {
        status: 200,
        body: {
          segmentId,
          coveredMs,
          durationMs: 20_000,
          ratio: coveredMs / 20_000,
          threshold: 0.8,
          reachedThreshold: coveredMs / 20_000 >= 0.8,
        },
      };
    },
    castVote: async (segmentId, body) => {
      calls.push({ kind: 'vote', body: { segmentId, ...(body as Record<string, unknown>) } });
      return {
        status: 201,
        body: {
          segmentId,
          value: 'DISLIKE',
          likeCount: 3,
          dislikeCount: 2,
          dislikeThreshold: 10,
          listenedRatio: 1,
          segmentCut: false,
        },
      };
    },
    ...overrides,
  };
  return { calls, transport };
}

function voteHandler(overrides: { status?: number; body?: unknown } = {}): FetchHandler {
  return {
    method: 'POST',
    path: VOTE_PATH,
    respond: () => ({
      status: overrides.status ?? 201,
      body:
        overrides.body ?? {
          segmentId: SEGMENT_ID,
          value: 'LIKE',
          likeCount: 4,
          dislikeCount: 1,
          dislikeThreshold: 10,
          listenedRatio: 0,
          segmentCut: false,
        },
    }),
  };
}

function setup(
  options: {
    segment?: Partial<VotableSegmentItem>;
    myVote?: 'LIKE' | 'DISLIKE' | null;
    isOwnSegment?: boolean;
    transport?: ListenReportTransport;
    handlers?: readonly FetchHandler[];
  } = {},
) {
  const element = new FakeAudio();
  const onVoted = vi.fn();
  const onListenShort = vi.fn();
  const onFailed = vi.fn();
  const view = renderWithProviders(
    <VotableSegment
      segment={{ ...SEGMENT, ...options.segment }}
      src={`/api/segments/${SEGMENT_ID}/audio`}
      bottleId="bottle-1"
      isOwnSegment={options.isOwnSegment ?? false}
      myVote={options.myVote ?? null}
      onVoted={onVoted}
      onListenShort={onListenShort}
      onFailed={onFailed}
      {...(options.transport === undefined ? {} : { transport: options.transport })}
      createElement={() => element}
    />,
    { ...(options.handlers === undefined ? {} : { handlers: options.handlers }) },
  );
  return { element, onVoted, onListenShort, onFailed, fetchMock: view.fetchMock };
}

/** 听到满（80% 门槛以上）：`act` 里推进，否则点击时读到的还是"未达门槛"的旧渲染。 */
function listenThrough(element: FakeAudio): void {
  act(() => {
    element.playThroughTo(20);
  });
}

describe('VotableSegment：控件唯一性', () => {
  it('一段只有一个"踩"控件：播放器自带的那个已收起，踩数由这一对读数承担', () => {
    setup();

    // 多个踩 = 假按钮（点了没反应），所以这里必须是 1
    expect(screen.getAllByRole('button', { name: /点踩/ })).toHaveLength(1);
    // 这一对里有踩的计数，但只有这一处
    expect(screen.getByRole('button', { name: '给第 2 段点踩' })).toHaveTextContent('1');
  });

  it('每段的投票按钮带段号（纯图标按钮必须可命名）', () => {
    setup();

    expect(screen.getByRole('button', { name: '给第 2 段点赞' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '给第 2 段点踩' })).toBeInTheDocument();
  });
});

describe('VotableSegment：点赞', () => {
  it('点赞不需要听满：请求体只有 segmentId 与 value，不含 listenedRatio', async () => {
    const { fetchMock } = setup({ handlers: [voteHandler()] });

    fireEvent.click(screen.getByRole('button', { name: '给第 2 段点赞' }));

    await waitFor(() => {
      expect(fetchMock.calls.some((call) => call.url === VOTE_PATH)).toBe(true);
    });
    const vote = fetchMock.calls.find((call) => call.url === VOTE_PATH);
    // 段号在 URL 里，body 只发契约要求的 value（不带 listenedRatio）
    expect(vote?.body).toEqual({ value: 'LIKE' });
  });

  it('投票成功后回报"我投了什么"（页面据此显示已赞/已踩）', async () => {
    const { onVoted } = setup({ handlers: [voteHandler()] });

    fireEvent.click(screen.getByRole('button', { name: '给第 2 段点赞' }));

    await waitFor(() => {
      expect(onVoted).toHaveBeenCalledWith(SEGMENT_ID, 'LIKE');
    });
  });

  it('已赞态：按钮 aria-pressed=true、可见原因，且不再重复发请求（内核会 LIKE_ALREADY_CAST）', () => {
    const { fetchMock } = setup({ myVote: 'LIKE', handlers: [voteHandler()] });

    const like = screen.getByRole('button', { name: '给第 2 段点赞' });
    expect(like).toHaveAttribute('aria-pressed', 'true');
    expect(like).toBeDisabled();
    // DESIGN.md：禁用不能是唯一的不可用提示 → 必须有可见文字原因
    expect(screen.getByText('你已经赞过这一段')).toBeInTheDocument();
    fireEvent.click(like);
    expect(fetchMock.calls.some((call) => call.url === VOTE_PATH)).toBe(false);
  });
});

describe('VotableSegment：点踩（走收听覆盖率上报）', () => {
  it('先上报覆盖率再投票，票体不含 listenedRatio', async () => {
    const { calls, transport } = fakeTransport();
    const { element } = setup({ transport });

    listenThrough(element);
    fireEvent.click(screen.getByRole('button', { name: '给第 2 段点踩' }));

    await waitFor(() => {
      expect(calls.some((call) => call.kind === 'vote')).toBe(true);
    });
    const kinds = calls.map((call) => call.kind);
    expect(kinds.indexOf('listen')).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf('listen')).toBeLessThan(kinds.indexOf('vote'));
    expect(calls.find((call) => call.kind === 'vote')?.body).toEqual({
      segmentId: SEGMENT_ID,
      value: 'DISLIKE',
    });
  });

  it('踩成功后回报"我投了什么"（含被斩浪的那一次）', async () => {
    const { transport } = fakeTransport();
    const { element, onVoted } = setup({ transport });

    listenThrough(element);
    fireEvent.click(screen.getByRole('button', { name: '给第 2 段点踩' }));

    await waitFor(() => {
      expect(onVoted).toHaveBeenCalledWith(SEGMENT_ID, 'DISLIKE');
    });
  });

  it('服务端说没听满（422）：把原因交出去弹提醒，按钮不禁用、也不静默', async () => {
    // 服务端真实形状（`problemFromViolations`）：错误码在 `error.violations[0].code`
    const message = '需要听满 80% 才能点踩（服务端记录的已听覆盖率 50%，请继续聆听后再试）。';
    const { transport } = fakeTransport({
      castVote: async () => ({
        status: 422,
        body: {
          error: {
            message,
            violations: [{ code: 'LISTEN_THRESHOLD_NOT_REACHED', message }],
          },
        },
      }),
    });
    const { element, onListenShort, onVoted } = setup({ transport });

    listenThrough(element);
    fireEvent.click(screen.getByRole('button', { name: '给第 2 段点踩' }));

    await waitFor(() => {
      expect(onListenShort).toHaveBeenCalledWith(message);
    });
    expect(onVoted).not.toHaveBeenCalled();
  });

  it('其它失败（网络层没有 code）→ 走 onFailed，不冒充"没听满"', async () => {
    const { transport } = fakeTransport({
      castVote: async () => ({ status: 0, body: null }),
    });
    const { element, onFailed, onListenShort } = setup({ transport });

    listenThrough(element);
    fireEvent.click(screen.getByRole('button', { name: '给第 2 段点踩' }));

    await waitFor(() => {
      expect(onFailed).toHaveBeenCalled();
    });
    expect(onListenShort).not.toHaveBeenCalled();
  });

  it('422 但不是"没听满"的码 → 走 onFailed（只把门槛那一类当提醒）', async () => {
    const { transport } = fakeTransport({
      castVote: async () => ({
        status: 422,
        body: {
          error: {
            message: '这条规则不允许这么做。',
            violations: [{ code: 'SEGMENT_ALREADY_CUT', message: '这一段已经被斩浪删除。' }],
          },
        },
      }),
    });
    const { element, onFailed, onListenShort } = setup({ transport });

    listenThrough(element);
    fireEvent.click(screen.getByRole('button', { name: '给第 2 段点踩' }));

    await waitFor(() => {
      expect(onFailed).toHaveBeenCalled();
    });
    expect(onListenShort).not.toHaveBeenCalled();
  });
});
