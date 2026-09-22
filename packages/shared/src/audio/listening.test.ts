/**
 * 「听满 80% 才能点踩」的**测量层**单测（CONTEXT §7.3；门槛值本身来自内核 `DEFAULT_POLICY`）。
 *
 * 本文件钉住三件事：
 * 1. 语义是**覆盖率**（听过的区间并集），不是"累计播放时长"——否则循环重播一小段就能解锁点踩；
 * 2. 跳转（seek）不产生任何覆盖率——否则拖到 90% 就能点踩；
 * 3. 边界精确在 79.9% / 80%（含浮点误差容差）。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY } from '../domain/constants';
import { DEFAULT_MAX_STEP_MS, canDislike, createListenTracker, listenedRatio } from './listening';

const DURATION = 10_000;

/** 以固定步长喂一串播放位置（模拟 `timeupdate`，浏览器约每 250ms 一次）。 */
function play(
  tracker: ReturnType<typeof createListenTracker>,
  fromMs: number,
  toMs: number,
  stepMs = 250,
) {
  for (let at = fromMs; at <= toMs; at += stepMs) tracker.observe(at);
  return tracker.progress();
}

describe('listenedRatio / canDislike（纯函数）', () => {
  it('覆盖率按 0..1 截断，且不可信时长一律按 0（fail-closed，宁可点不了踩）', () => {
    expect(listenedRatio(0, DURATION)).toBe(0);
    expect(listenedRatio(DURATION, DURATION)).toBe(1);
    expect(listenedRatio(DURATION * 2, DURATION)).toBe(1);
    expect(listenedRatio(-100, DURATION)).toBe(0);
    expect(listenedRatio(5_000, 0)).toBe(0);
    expect(listenedRatio(5_000, Number.NaN)).toBe(0);
    expect(listenedRatio(Number.NaN, DURATION)).toBe(0);
  });

  it('门槛默认取内核策略值 0.8（不在这里另写一份魔数）', () => {
    expect(DEFAULT_POLICY.dislikeListenRatioThreshold).toBe(0.8);
    expect(canDislike(0.8)).toBe(true);
    expect(canDislike(0.8, DEFAULT_POLICY.dislikeListenRatioThreshold)).toBe(true);
    // 79.9% 是**不足**的边界：不给点踩
    expect(canDislike(0.799)).toBe(false);
    expect(canDislike(0.799_9)).toBe(false);
    expect(canDislike(Number.NaN)).toBe(false);
  });
});

describe('ListenTracker：覆盖率来自连续播放', () => {
  it('从 0 连续播到 8 秒 → 恰好 80%，可点踩（下边界）', () => {
    const tracker = createListenTracker({ durationMs: DURATION });

    const progress = play(tracker, 0, 8_000);

    expect(progress.coveredMs).toBe(8_000);
    expect(progress.ratio).toBe(0.8);
    expect(progress.dislikeUnlocked).toBe(true);
    expect(progress.spanCount).toBe(1);
  });

  it('连续播到 7.99 秒 → 79.9%，不可点踩（上边界）', () => {
    const tracker = createListenTracker({ durationMs: DURATION });

    const progress = play(tracker, 0, 7_990, 10);

    expect(progress.coveredMs).toBe(7_990);
    expect(progress.ratio).toBeCloseTo(0.799, 10);
    expect(progress.dislikeUnlocked).toBe(false);
  });

  it('连续播到片尾 → 覆盖率 100%，`markEnded` 补齐最后一个 tick 之后的尾差', () => {
    const tracker = createListenTracker({ durationMs: DURATION });

    // 停在 9750ms（浏览器最后一个 timeupdate 通常早于结尾一个 tick）
    play(tracker, 0, 9_750);
    const progress = tracker.markEnded();

    expect(progress.coveredMs).toBe(DURATION);
    expect(progress.ratio).toBe(1);
    expect(progress.dislikeUnlocked).toBe(true);
  });

  it('每次 tick 的实际间隔被计入（不用 tick 次数 × 固定步长）', () => {
    const tracker = createListenTracker({ durationMs: DURATION });

    tracker.observe(0);
    tracker.observe(600);
    const progress = tracker.observe(1_400);

    expect(progress.coveredMs).toBe(1_400);
  });

  it('重复上报同一位置不重复计数（timeupdate 可能连发）', () => {
    const tracker = createListenTracker({ durationMs: DURATION });

    // 播放器从 0 起播：首次观察到 1000ms 意味着 0–1000ms 真的播过了
    tracker.observe(1_000);
    tracker.observe(1_000);
    const progress = tracker.observe(1_000);

    expect(progress.coveredMs).toBe(1_000);
    expect(progress.playedMs).toBe(1_000);
    expect(progress.positionMs).toBe(1_000);
  });
});

describe('ListenTracker：反作弊（拖进度 / 循环重播都不解锁）', () => {
  it('拖动进度条到 90% 不产生覆盖率（大跳跃 = 跳转，不是播放）', () => {
    const tracker = createListenTracker({ durationMs: DURATION });

    tracker.observe(0);
    tracker.observe(9_000);
    const progress = tracker.markEnded();

    expect(progress.coveredMs).toBe(0);
    expect(progress.dislikeUnlocked).toBe(false);
  });

  it('跳到 90% 后把最后 1 秒听完 → 只认这 1 秒（10%，仍不可点踩）', () => {
    const tracker = createListenTracker({ durationMs: DURATION });

    tracker.observe(0);
    tracker.observe(9_000); // 跳转：不计
    play(tracker, 9_000, 9_750); // 跳转后真的在播
    const progress = tracker.markEnded();

    expect(progress.coveredMs).toBe(1_000);
    expect(progress.ratio).toBeCloseTo(0.1, 10);
    expect(progress.dislikeUnlocked).toBe(false);
  });

  it('循环重播同一小段：累计时长涨了，覆盖率不涨', () => {
    const tracker = createListenTracker({ durationMs: DURATION });
    for (let loop = 0; loop < 5; loop += 1) {
      play(tracker, 0, 3_000);
      tracker.markSeek(); // 回到开头（'seeking'）
    }

    const progress = tracker.progress();

    // 累计播放 15 秒，但只覆盖 3 秒
    expect(progress.playedMs).toBe(15_000);
    expect(progress.coveredMs).toBe(3_000);
    expect(progress.ratio).toBe(0.3);
    expect(progress.dislikeUnlocked).toBe(false);
  });

  it('回退后再往前播，只补新区间（不重复计已覆盖部分）', () => {
    const tracker = createListenTracker({ durationMs: DURATION });

    play(tracker, 0, 2_000);
    tracker.markSeek();
    play(tracker, 500, 4_000);
    const progress = tracker.progress();

    // 覆盖 = [0,2000] ∪ [2000,4000] = 4 秒（连续，合成 1 段）；累计播放 2 + 3.5 秒
    expect(progress.coveredMs).toBe(4_000);
    expect(progress.playedMs).toBe(5_500);
    expect(progress.spanCount).toBe(1);
  });

  it('两段互不相邻的收听 → 覆盖区间数为 2（spanCount 是覆盖区间个数）', () => {
    const tracker = createListenTracker({ durationMs: DURATION });

    play(tracker, 0, 1_000);
    tracker.markSeek();
    play(tracker, 5_000, 6_000);
    const progress = tracker.progress();

    expect(progress.coveredMs).toBe(2_000);
    expect(progress.spanCount).toBe(2);
  });

  it('跳转后继续播放的片段**是**有效覆盖（跳过去之后真的听了就算）', () => {
    const tracker = createListenTracker({ durationMs: DURATION });

    play(tracker, 0, 1_000);
    tracker.markSeek();
    play(tracker, 5_000, 9_000);
    const progress = tracker.progress();

    expect(progress.coveredMs).toBe(5_000);
    expect(progress.dislikeUnlocked).toBe(false); // 50% < 80%
    play(tracker, 9_000, 9_500);
    expect(tracker.progress().dislikeUnlocked).toBe(false);
  });

  it('间断的两段拼到 80% 即解锁（不要求一口气听完）', () => {
    const tracker = createListenTracker({ durationMs: DURATION });

    play(tracker, 0, 4_000);
    tracker.markSeek();
    play(tracker, 6_000, 10_000);
    const progress = tracker.progress();

    expect(progress.coveredMs).toBe(8_000);
    expect(progress.ratio).toBe(0.8);
    expect(progress.dislikeUnlocked).toBe(true);
  });

  it('位置乱序 / NaN / 负数不会制造覆盖率', () => {
    const tracker = createListenTracker({ durationMs: DURATION });

    tracker.observe(Number.NaN);
    tracker.observe(-500);
    tracker.observe(2_000);
    tracker.observe(Number.POSITIVE_INFINITY);
    const progress = tracker.progress();

    expect(progress.coveredMs).toBe(0);
    expect(progress.ratio).toBe(0);
    expect(progress.dislikeUnlocked).toBe(false);
  });

  it('未知时长（0 / NaN）时覆盖率恒为 0，永不因数据缺失而放行点踩', () => {
    const tracker = createListenTracker({ durationMs: 0 });

    play(tracker, 0, 5_000);
    const progress = tracker.markEnded();

    expect(progress.ratio).toBe(0);
    expect(progress.dislikeUnlocked).toBe(false);
  });
});

describe('ListenTracker：门槛与大跳跃容差可注入', () => {
  it('门槛来自内核策略值，且可被显式覆盖（便于策略翻案）', () => {
    expect(createListenTracker({ durationMs: DURATION }).threshold).toBe(
      DEFAULT_POLICY.dislikeListenRatioThreshold,
    );
    const strict = createListenTracker({ durationMs: DURATION, threshold: 0.5 });

    play(strict, 0, 5_000);

    expect(strict.progress().dislikeUnlocked).toBe(true);
  });

  it('大跳跃容差默认 1500ms（timeupdate 约 250ms 一次；超过 1.5s 的前进视为跳转）', () => {
    expect(DEFAULT_MAX_STEP_MS).toBe(1_500);

    const tight = createListenTracker({ durationMs: DURATION, maxStepMs: 300 });
    tight.observe(0);
    tight.observe(1_000);

    expect(tight.progress().coveredMs).toBe(0);
  });

  it('reset 清空一切观察（重录/换段后从零开始）', () => {
    const tracker = createListenTracker({ durationMs: DURATION });
    play(tracker, 0, 9_000);

    tracker.reset();
    const progress = tracker.progress();

    expect(progress.coveredMs).toBe(0);
    expect(progress.playedMs).toBe(0);
    expect(progress.spanCount).toBe(0);
    expect(progress.dislikeUnlocked).toBe(false);
  });
});
