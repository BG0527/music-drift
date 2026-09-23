/**
 * 收听覆盖率上报器单测（t21）。
 *
 * ## 这一层要解决的问题
 *
 * t20 把点踩门槛改成"服务端持久化的覆盖率"后，客户端必须**边播边报**：
 * 服务端只信"第一次最多段长一半 + 之后按墙上时间 ×1.25+3s"的增长规则，
 * 所以"投票前一次性塞满"必然拿不到门槛（那正是防自欺的设计）。
 *
 * ## 钉住的语义
 *
 * 1. **只增不减**：重播/回退让本地覆盖率变小（其实不会，但接口上要防）时，上报值不回落；
 * 2. **按周期上报**：观察到的覆盖每跨过一个周期才发一次请求，且**没变化就不发**（不刷接口）；
 * 3. **投票前先 flush**：`castDislike()` 一定要把最新覆盖先报上去，否则服务端读到的还是旧值；
 * 4. **票体不含 `listenedRatio`**（t20 起该字段被忽略，带它等于自欺）；
 * 5. **服务端 422 `LISTEN_THRESHOLD_NOT_REACHED` 要如实暴露**（含服务端文案），**不自动重试**；
 * 6. `dispose()` 之后不再有任何请求（卸载后不许继续打接口）。
 */
import { describe, expect, it, vi } from 'vitest';
import { SubmitListenProgressRequestSchema } from '@music-drift/shared/contracts';
import {
  createListenReporter,
  type ListenReporterState,
  type ListenReportTransport,
} from './listen-reporter';

interface Call {
  kind: 'listen' | 'vote';
  segmentId: string;
  coveredMs?: number;
  body?: unknown;
}

/** 假传输层：记录调用，并模拟服务端的"首次封顶一半 + 按墙上时间限速"。 */
function fakeTransport(options: { threshold?: number; durationMs?: number } = {}) {
  const threshold = options.threshold ?? 0.8;
  const durationMs = options.durationMs ?? 20_000;
  const calls: Call[] = [];
  let covered = 0;
  let lastAt = 0;

  const transport: ListenReportTransport = {
    reportListen: async (segmentId, coveredMs) => {
      calls.push({ kind: 'listen', segmentId, coveredMs });
      const now = Date.now();
      const claimed = Math.max(0, Math.floor(coveredMs));
      const granted =
        covered === 0
          ? Math.min(claimed, Math.floor(durationMs * 0.5))
          : Math.min(claimed, covered + Math.floor((now - lastAt) * 1.25) + 3_000);
      covered = Math.max(covered, granted);
      lastAt = now;
      return {
        status: 200,
        body: { coveredMs: covered, durationMs, ratio: covered / durationMs, threshold },
      };
    },
    castVote: async (segmentId, body) => {
      calls.push({ kind: 'vote', segmentId, body });
      if (covered / durationMs >= threshold) {
        return { status: 200, body: { segmentId, value: 'DISLIKE', segmentCut: false } };
      }
      return {
        status: 422,
        body: {
          error: {
            message: `需要听满 ${String(Math.round(threshold * 100))}% 才能点踩。`,
            violations: [{ code: 'LISTEN_THRESHOLD_NOT_REACHED', message: '听满 80% 才能点踩。' }],
          },
        },
      };
    },
  };
  return { transport, calls, covered: () => covered };
}

function setup(options: { periodMs?: number; now?: () => number } = {}) {
  const fake = fakeTransport();
  const states: ListenReporterState[] = [];
  const reporter = createListenReporter({
    segmentId: 'seg-1',
    transport: fake.transport,
    periodMs: options.periodMs ?? 1_000,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  reporter.subscribe((state) => states.push(state));
  return { reporter, fake, states };
}

describe('createListenReporter：按周期上报（真实覆盖推进才发）', () => {
  it('观察推进但未到周期 → 一次请求都不发', async () => {
    vi.useFakeTimers();
    const { reporter, fake } = setup({ periodMs: 1_000 });

    reporter.observe({ coveredMs: 500 });
    await vi.advanceTimersByTimeAsync(500);

    expect(fake.calls).toHaveLength(0);
    reporter.dispose();
    vi.useRealTimers();
  });

  it('每跨一个周期发一次，且上报值 = 本地观测到的最大覆盖（只增不减）', async () => {
    vi.useFakeTimers();
    const { reporter, fake } = setup({ periodMs: 1_000 });

    reporter.observe({ coveredMs: 1_200 });
    await vi.advanceTimersByTimeAsync(1_000);
    reporter.observe({ coveredMs: 2_400 });
    await vi.advanceTimersByTimeAsync(1_000);
    // 回退（理论上不该发生）：不得让已上报的覆盖变小
    reporter.observe({ coveredMs: 1_000 });
    await vi.advanceTimersByTimeAsync(1_000);

    // 第三次 tick 时覆盖没有推进（观测回落后 pending 仍是 2400）→ 不发重复请求
    const listenCalls = fake.calls.filter((call) => call.kind === 'listen');
    expect(listenCalls.map((call) => call.coveredMs)).toEqual([1_200, 2_400]);
    reporter.dispose();
    vi.useRealTimers();
  });

  it('覆盖没变化 → 不发请求（不刷接口）', async () => {
    vi.useFakeTimers();
    const { reporter, fake } = setup({ periodMs: 500 });

    reporter.observe({ coveredMs: 800 });
    await vi.advanceTimersByTimeAsync(500);
    const after = fake.calls.length;
    await vi.advanceTimersByTimeAsync(2_000);

    expect(fake.calls.length).toBe(after);
    reporter.dispose();
    vi.useRealTimers();
  });

  it('dispose 之后不再发任何请求（卸载即停）', async () => {
    vi.useFakeTimers();
    const { reporter, fake } = setup({ periodMs: 500 });

    reporter.observe({ coveredMs: 900 });
    await vi.advanceTimersByTimeAsync(500);
    const before = fake.calls.length;
    reporter.dispose();
    reporter.observe({ coveredMs: 5_000 });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(fake.calls.length).toBe(before);
    vi.useRealTimers();
  });

  it('周期可配置（250ms 那种近似 timeupdate 的节奏）：播放持续推进时每个周期都有上报', async () => {
    vi.useFakeTimers();
    const { reporter, fake } = setup({ periodMs: 250 });

    // 模拟真实播放：每 250ms 覆盖推进 250ms
    for (let elapsed = 250; elapsed <= 1_000; elapsed += 250) {
      reporter.observe({ coveredMs: elapsed });
      await vi.advanceTimersByTimeAsync(250);
    }

    expect(fake.calls.filter((call) => call.kind === 'listen').length).toBeGreaterThanOrEqual(3);
    reporter.dispose();
    vi.useRealTimers();
  });
});

describe('createListenReporter：服务端状态（threshold / ratio 只认服务端）', () => {
  it('上报成功后把服务端确认的 coveredMs / ratio 同步进状态', async () => {
    vi.useFakeTimers();
    const { reporter, states } = setup({ periodMs: 1_000 });

    reporter.observe({ coveredMs: 12_000 });
    await vi.advanceTimersByTimeAsync(1_000);

    const last = states.at(-1)!;
    // 服务端首次只给一半（10s），不是客户端声称的 12s —— 客户端必须显示服务端的数
    expect(last.reportedCoveredMs).toBe(10_000);
    expect(last.serverRatio).toBeCloseTo(0.5, 6);
    expect(last.pendingCoveredMs).toBe(12_000);
    reporter.dispose();
    vi.useRealTimers();
  });

  it('客户端只报"本地真实观测到的覆盖"，绝不虚报（这是本轮纪律的核心）', async () => {
    vi.useFakeTimers();
    const { reporter, fake } = setup({ periodMs: 100 });

    // 本地只听了 3.2s：上报值就必须是 3.2s，不能因为"想点踩"就报 20s
    reporter.observe({ coveredMs: 3_200 });
    await vi.advanceTimersByTimeAsync(300);

    const listenCalls = fake.calls.filter((call) => call.kind === 'listen');
    expect(listenCalls.length).toBeGreaterThan(0);
    expect(listenCalls.every((call) => call.coveredMs === 3_200)).toBe(true);
    // 真实播放下 3.2s 只覆盖 16%，服务端也就只记到这么多
    expect(reporter.state().serverRatio ?? 0).toBeLessThan(0.8);
    reporter.dispose();
    vi.useRealTimers();
  });
});

describe('createListenReporter：点踩', () => {
  it('真实序列：首报封顶一半 → 真的等够时间 → 再报够门槛 → 投票成功；票体只有 value', async () => {
    vi.useFakeTimers();
    const { reporter, fake } = setup({ periodMs: 10_000 });

    // ① 首报：本地已覆盖 20s，但服务端首报只记一半（10s = 50%，**必然点不了踩**）
    reporter.observe({ coveredMs: 20_000 });
    const first = await reporter.castDislike();
    expect(first.ok).toBe(false);
    expect(first.code).toBe('LISTEN_THRESHOLD_NOT_REACHED');
    expect(fake.covered()).toBe(10_000);

    // ② 真的等 2.4s（限速：距上次 ×1.25 + 3s）后再报一次 → 这才够 80%
    await vi.advanceTimersByTimeAsync(2_400);
    const outcome = await reporter.castDislike();

    expect(outcome.ok).toBe(true);
    expect(fake.covered()).toBeGreaterThanOrEqual(16_000);
    expect(fake.calls.map((call) => call.kind)).toEqual(['listen', 'vote', 'listen', 'vote']);
    // 每次投票前都先 flush（票体只有 value；listenedRatio 出现即失败）
    const votes = fake.calls.filter((call) => call.kind === 'vote');
    expect(votes.every((call) => JSON.stringify(call.body) === '{"value":"DISLIKE"}')).toBe(true);
    reporter.dispose();
    vi.useRealTimers();
  });

  it('覆盖不够：返回 422 且把服务端文案与错误码如实暴露（不自动重试）', async () => {
    vi.useFakeTimers();
    const { reporter, fake } = setup({ periodMs: 10_000 });

    reporter.observe({ coveredMs: 2_000 });
    const outcome = await reporter.castDislike();

    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe(422);
    expect(outcome.code).toBe('LISTEN_THRESHOLD_NOT_REACHED');
    expect(outcome.message).toContain('80%');
    expect(reporter.state().thresholdNotReached).toBe(true);
    // 只发了一次 listen + 一次 vote，没有重试
    expect(fake.calls.map((call) => call.kind)).toEqual(['listen', 'vote']);
    reporter.dispose();
    vi.useRealTimers();
  });

  it('网络失败：如实报错，且不重试（重试由用户再点一次决定）', async () => {
    const calls: string[] = [];
    const reporter = createListenReporter({
      segmentId: 'seg-1',
      transport: {
        reportListen: async () => {
          calls.push('listen');
          return { status: 200, body: { coveredMs: 16_000, durationMs: 20_000, ratio: 0.8 } };
        },
        castVote: async () => {
          calls.push('vote');
          throw new Error('network down');
        },
      },
      periodMs: 10_000,
    });

    reporter.observe({ coveredMs: 16_000 });
    const outcome = await reporter.castDislike();

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain('网络');
    expect(calls).toEqual(['listen', 'vote']);
    reporter.dispose();
  });

  it('成功点踩后清掉"未达门槛"标记（用户补听后能再投）', async () => {
    vi.useFakeTimers();
    const { reporter } = setup({ periodMs: 10_000 });

    reporter.observe({ coveredMs: 1_000 });
    await reporter.castDislike();
    expect(reporter.state().thresholdNotReached).toBe(true);

    // 补听：**真的**听够时间（每 2s 推进 2s 覆盖）—— 想靠"跳值"是不行的，服务端会按墙上时间夹住
    for (let elapsed = 2_000; elapsed <= 18_000; elapsed += 2_000) {
      await vi.advanceTimersByTimeAsync(2_000);
      reporter.observe({ coveredMs: elapsed });
    }
    const ok = await reporter.castDislike();

    expect(ok.ok).toBe(true);
    expect(reporter.state().thresholdNotReached).toBe(false);
    reporter.dispose();
    vi.useRealTimers();
  });
});

describe('上报体必须过得了服务端契约（真实浏览器里踩到的 400）', () => {
  /*
   * 真实链路里发现的问题：播放位置来自 `currentTime * 1000`（**浮点**），
   * 原样发出去会被服务端的 `SubmitListenProgressRequestSchema`（`z.number().int()`）判为非法，
   * `POST /api/segments/:id/listen` 直接 400 —— 而且 `violations` 是空的，光看响应体查不出原因。
   * 后果不是"少报一点"，而是**覆盖率永远推不上去**：点踩门槛（0.8）永远不满足，
   * 用户点踩只会一直收到"还没听满"。本地单测全绿，因为假的传输层默默替我们把小数抹平了。
   *
   * 所以这里不再"自己规定"整数，而是**直接拿真实契约 schema 校验实际发出去的请求体**。
   */
  it('浮点覆盖量被取整后再上报（且仍是单调不减）', async () => {
    const { reporter, fake } = setup({ periodMs: 1_000 });

    reporter.observe({ coveredMs: 1_823.821_456 });
    const outcome = await reporter.flush();

    const call = fake.calls.find((item) => item.kind === 'listen');
    expect(call).toBeDefined();
    const parsed = SubmitListenProgressRequestSchema.safeParse({ coveredMs: call?.coveredMs });
    expect(parsed.success).toBe(true);
    expect(call?.coveredMs).toBe(1_823);
    expect(outcome.coveredMs).toBe(1_823);
    reporter.dispose();
  });

  it('取整不会把覆盖量抬上去（向下取整：宁少报不多报）', async () => {
    const { reporter, fake } = setup({ periodMs: 1_000 });

    reporter.observe({ coveredMs: 999.999_999 });
    await reporter.flush();

    const call = fake.calls.find((item) => item.kind === 'listen');
    expect(call?.coveredMs).toBe(999);
    reporter.dispose();
  });
});
