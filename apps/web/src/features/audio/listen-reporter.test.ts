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
import {
  createListenReporter,
  type ListenReporterState,
  type ListenReportTransport,
} from './listen-reporter';

interface Call {
  kind: 'listen' | 'vote' | 'duration';
  segmentId: string;
  coveredMs?: number;
  measuredDurationMs?: number;
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
    reportMeasuredDuration: async (segmentId, measuredDurationMs, context) => {
      calls.push({ kind: 'duration', segmentId, measuredDurationMs, body: context });
      return {
        status: 200,
        body: {
          declaredDurationMs: durationMs,
          measuredDurationMs,
          effectiveDurationMs: measuredDurationMs,
          corrected: true,
          direction: measuredDurationMs < durationMs ? 'LOWER' : 'NONE',
          sampleCount: 1,
        },
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

describe('createListenReporter：实测时长上报（t28 / F2）', () => {
  /*
   * 目的：修"诚实用户路径"——上传者声明 30s、真实只有 2s 时，分母错了 ⇒ 诚实听众永远够不到 80%。
   * 客户端在**真实播放后**读 `HTMLMediaElement.duration` 报一次，供后端校正分母。
   * 边界（必须 fail-closed，绝不污染分母）：NaN / Infinity / 0 / 负数 / <500ms / >5min /
   * 比声明值离谱地长 → **一个请求都不发**。
   */
  const play = { coveredMs: 2_000, playedMs: 2_000, declaredDurationMs: 20_000 };

  it('真实播放后报一次实测时长（带 coveredMs 供服务端做一致性校验）', async () => {
    vi.useFakeTimers();
    const { reporter, fake } = setup({ periodMs: 60_000 });

    reporter.observe({ ...play, measuredDurationMs: 2_000 });
    await vi.advanceTimersByTimeAsync(0);

    const durationCalls = fake.calls.filter((call) => call.kind === 'duration');
    expect(durationCalls).toHaveLength(1);
    expect(durationCalls[0]?.measuredDurationMs).toBe(2_000);
    expect(durationCalls[0]?.body).toEqual({
      declaredDurationMs: 20_000,
      coveredMsAtReportMs: 2_000,
    });
    expect(reporter.state().durationReport?.status).toBe('reported');
    expect(reporter.state().durationReport?.effectiveDurationMs).toBe(2_000);
    // t26 冻结形状：direction 表示本次测量是否真的生效（下调立即生效；上调只记录待多用户一致）
    expect(reporter.state().durationReport?.direction).toBe('LOWER');
    reporter.dispose();
    vi.useRealTimers();
  });

  it('t26 冻结枚举扩为 4 值：RAISED（多用户一致后上调真正生效）也必须如实透出', async () => {
    vi.useFakeTimers();
    const fake = fakeTransport();
    const transport = {
      ...fake.transport,
      reportMeasuredDuration: async () => ({
        status: 200,
        body: {
          declaredDurationMs: 20_000,
          measuredDurationMs: 30_000,
          effectiveDurationMs: 30_000,
          corrected: true,
          direction: 'RAISED',
          sampleCount: 2,
        },
      }),
    };
    const reporter = createListenReporter({ segmentId: 'seg-1', transport, periodMs: 60_000 });

    reporter.observe({
      coveredMs: 2_000,
      playedMs: 2_000,
      measuredDurationMs: 30_000,
      declaredDurationMs: 20_000,
    });
    await vi.advanceTimersByTimeAsync(0);

    // 白名单漏了 'RAISED' 的话，这里会变成 undefined —— 信息被静默丢掉
    expect(reporter.state().durationReport?.direction).toBe('RAISED');
    expect(reporter.state().durationReport?.effectiveDurationMs).toBe(30_000);
    expect(reporter.state().durationReport?.corrected).toBe(true);
    reporter.dispose();
    vi.useRealTimers();
  });

  it('未知 direction 值不透出（白名单之外一律 null，不把服务端的未来字段当成已知语义）', async () => {
    vi.useFakeTimers();
    const fake = fakeTransport();
    const transport = {
      ...fake.transport,
      reportMeasuredDuration: async () => ({
        status: 200,
        body: { effectiveDurationMs: 20_000, corrected: false, direction: 'SOMETHING_NEW' },
      }),
    };
    const reporter = createListenReporter({ segmentId: 'seg-1', transport, periodMs: 60_000 });

    reporter.observe({ coveredMs: 2_000, playedMs: 2_000, measuredDurationMs: 20_000 });
    await vi.advanceTimersByTimeAsync(0);

    expect(reporter.state().durationReport?.status).toBe('reported');
    expect(reporter.state().durationReport?.direction).toBeUndefined();
    reporter.dispose();
    vi.useRealTimers();
  });

  it('上调方向（实测比声明长）→ 服务端只记录不生效：direction=PENDING_AGREEMENT 如实透出', async () => {
    vi.useFakeTimers();
    const fake = fakeTransport();
    const transport = {
      ...fake.transport,
      reportMeasuredDuration: async () => ({
        status: 200,
        body: {
          declaredDurationMs: 20_000,
          measuredDurationMs: 30_000,
          effectiveDurationMs: 20_000,
          corrected: false,
          direction: 'PENDING_AGREEMENT',
          sampleCount: 1,
        },
      }),
    };
    const reporter = createListenReporter({ segmentId: 'seg-1', transport, periodMs: 60_000 });

    reporter.observe({
      coveredMs: 2_000,
      playedMs: 2_000,
      measuredDurationMs: 30_000,
      declaredDurationMs: 20_000,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(reporter.state().durationReport?.direction).toBe('PENDING_AGREEMENT');
    expect(reporter.state().durationReport?.corrected).toBe(false);
    reporter.dispose();
    vi.useRealTimers();
  });

  it('一次性：反复 observe（值相同或不同）也只报一次', async () => {
    vi.useFakeTimers();
    const { reporter, fake } = setup({ periodMs: 60_000 });

    reporter.observe({ ...play, measuredDurationMs: 2_000 });
    await vi.advanceTimersByTimeAsync(0);
    reporter.observe({ ...play, measuredDurationMs: 2_100 });
    reporter.observe({ ...play, measuredDurationMs: 1_900 });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(fake.calls.filter((call) => call.kind === 'duration')).toHaveLength(1);
    reporter.dispose();
    vi.useRealTimers();
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['0', 0],
    ['负数', -1],
    ['过短（499ms）', 499],
    ['过长（超过 5 分钟）', 300_001],
    ['比声明值离谱（20s 声明 → 200s）', 200_000],
  ])('异常值 fail-closed：%s → 一个请求都不发', async (_label, measured) => {
    vi.useFakeTimers();
    const { reporter, fake } = setup({ periodMs: 60_000 });

    reporter.observe({ ...play, measuredDurationMs: measured });
    await vi.advanceTimersByTimeAsync(0);

    expect(fake.calls.filter((call) => call.kind === 'duration')).toHaveLength(0);
    expect(reporter.state().durationReport?.status).toBe('skipped');
    // 且**不污染分母**：覆盖率那一路照常，duration 字段不参与任何判定
    expect(reporter.state().serverRatio).toBeNull();
    reporter.dispose();
    vi.useRealTimers();
  });

  it('没有真实播放过（playedMs=0）就不报：实测值必须来自真实播放，不是元数据自报', async () => {
    vi.useFakeTimers();
    const { reporter, fake } = setup({ periodMs: 60_000 });

    reporter.observe({ coveredMs: 0, playedMs: 0, measuredDurationMs: 2_000 });
    await vi.advanceTimersByTimeAsync(0);

    expect(fake.calls.filter((call) => call.kind === 'duration')).toHaveLength(0);
    reporter.dispose();
    vi.useRealTimers();
  });

  it('duration 缺失（还没 loadedmetadata）→ 不上报；随后有了再报（不是永久放弃）', async () => {
    vi.useFakeTimers();
    const { reporter, fake } = setup({ periodMs: 60_000 });

    reporter.observe({ ...play, measuredDurationMs: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.calls.filter((call) => call.kind === 'duration')).toHaveLength(0);

    reporter.observe({ ...play, measuredDurationMs: 2_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.calls.filter((call) => call.kind === 'duration')).toHaveLength(1);
    reporter.dispose();
    vi.useRealTimers();
  });

  it('与服务端约定一致：15s 段实测 15s 也照报（没改正也照样是一次有效测量）', async () => {
    vi.useFakeTimers();
    const { reporter, fake } = setup({ periodMs: 60_000 });

    reporter.observe({ ...play, measuredDurationMs: 20_000 });
    await vi.advanceTimersByTimeAsync(0);

    expect(fake.calls.filter((call) => call.kind === 'duration')).toHaveLength(1);
    reporter.dispose();
    vi.useRealTimers();
  });

  it('时长上报失败不影响覆盖上报（互不遮蔽）', async () => {
    vi.useFakeTimers();
    const fake = fakeTransport();
    const calls = fake.calls;
    const transport = {
      ...fake.transport,
      reportMeasuredDuration: async () => {
        throw new Error('duration endpoint down');
      },
    };
    const reporter = createListenReporter({ segmentId: 'seg-1', transport, periodMs: 1_000 });

    reporter.observe({ coveredMs: 1_000, playedMs: 1_000, measuredDurationMs: 2_000 });
    await vi.advanceTimersByTimeAsync(1_000);
    reporter.observe({ coveredMs: 2_000, playedMs: 2_000, measuredDurationMs: 2_000 });
    await vi.advanceTimersByTimeAsync(1_000);

    // 覆盖上报照常继续（周期性的那两个请求在）
    expect(calls.filter((call) => call.kind === 'listen').length).toBeGreaterThanOrEqual(2);
    // 时长上报如实记为失败，且不再重试（一次性）
    expect(reporter.state().durationReport?.status).toBe('failed');
    expect(reporter.state().durationReport?.message).toContain('duration endpoint down');
    // **互不遮蔽**：时长通道的失败不占用覆盖率通道的 lastError（覆盖率成功了就该是 null）
    expect(reporter.state().lastError).toBeNull();
    // 时长这一点只发过一次（失败也不重试）
    expect(reporter.state().durationReport?.measuredDurationMs).toBe(2_000);
    reporter.dispose();
    vi.useRealTimers();
  });

  it('传输层没提供时长能力时（旧传输层）→ 状态为 unavailable，不影响其它功能', async () => {
    vi.useFakeTimers();
    const transport = {
      reportListen: async () => ({
        status: 200,
        body: { coveredMs: 1_000, durationMs: 20_000, ratio: 0.05, threshold: 0.8 },
      }),
      castVote: async () => ({ status: 200, body: { segmentCut: false } }),
    };
    const reporter = createListenReporter({ segmentId: 'seg-1', transport, periodMs: 60_000 });

    reporter.observe({ coveredMs: 1_000, playedMs: 1_000, measuredDurationMs: 2_000 });
    await vi.advanceTimersByTimeAsync(0);

    expect(reporter.state().durationReport?.status).toBe('unavailable');
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
