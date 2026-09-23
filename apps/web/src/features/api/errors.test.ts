import { describe, expect, it } from 'vitest';
import { describeApiError } from './errors';

/**
 * 错误文案是**产品语义**，不是装饰：`docs/api.md` §1/§2.8 规定传输层错误没有 code，
 * 只能按 HTTP 状态分支；业务规则违反才有稳定码。这里把两者收敛成一份可读文案 + 出口动作。
 */
describe('错误 → 用户可读文案', () => {
  it('401 一律要求重新登录，并给出登录出口（不区分 message 措辞）', () => {
    const view = describeApiError({ status: 401 });
    expect(view.kind).toBe('AUTH_REQUIRED');
    expect(view.needsLogin).toBe(true);
    expect(view.exits.map((exit) => exit.key)).toContain('login');
    expect(view.title).toContain('登录');
  });

  it('403 / 404 / 400 按状态区分，不依赖 body 里的 code', () => {
    expect(describeApiError({ status: 403 }).kind).toBe('FORBIDDEN');
    expect(describeApiError({ status: 404 }).kind).toBe('NOT_FOUND');
    expect(describeApiError({ status: 400 }).kind).toBe('INVALID_REQUEST');
    // 传输层 envelope 的 violations 是空的 → code 必须是 null，而不是编造一个
    expect(describeApiError({ status: 404, code: null }).code).toBeNull();
  });

  it('409 接力冲突：标题说清「被接走」，并给两个出口动作（不做静默失败）', () => {
    const view = describeApiError({
      status: 409,
      code: 'HOLDING_ALREADY_TAKEN',
      message: '这个漂流瓶已经被别人拿走了，换一个吧。',
    });
    expect(view.kind).toBe('CONFLICT');
    expect(view.title).toContain('接走');
    expect(view.exits.map((exit) => exit.label)).toEqual(['换一段继续', '看一眼漂流日志']);
    expect(view.canRetry).toBe(false);
  });

  it('409 河道空：给「再捞一次」与「去公海」两个出口', () => {
    const view = describeApiError({ status: 409, code: 'NO_BOTTLE_AVAILABLE' });
    expect(view.kind).toBe('EMPTY_RIVER');
    expect(view.exits.map((exit) => exit.key)).toEqual(['retry', 'sea']);
    expect(view.detail).toContain('没有');
  });

  it('422 规则违反：原文透出服务端中文文案（它已经给了修正动作）', () => {
    const view = describeApiError({
      status: 422,
      code: 'LISTEN_RATIO_TOO_LOW',
      message: '听满 80% 才能点踩。',
    });
    expect(view.kind).toBe('RULE_VIOLATION');
    expect(view.detail).toBe('听满 80% 才能点踩。');
  });

  it('422 没有文案时按码兜底，且不把码当文案给用户看', () => {
    const view = describeApiError({ status: 422, code: 'BOTTLE_DAMAGED' });
    expect(view.detail).toContain('损坏');
    expect(view.detail).not.toContain('BOTTLE_DAMAGED');
  });

  it('5xx / 网络中断可重试，且明确「录音还在本机」（DESIGN.md 错误态第 4 条）', () => {
    const server = describeApiError({ status: 503 });
    expect(server.kind).toBe('SERVER');
    expect(server.canRetry).toBe(true);
    expect(server.detail).toContain('本机');

    const offline = describeApiError({ status: null });
    expect(offline.kind).toBe('NETWORK');
    expect(offline.canRetry).toBe(true);
  });

  it('契约不符是客户端能识别的独立类别（服务端返回了不符合 zod 的数据）', () => {
    const view = describeApiError({ status: 200, code: 'CONTRACT_VIOLATION' });
    expect(view.kind).toBe('CONTRACT');
    expect(view.canRetry).toBe(false);
  });

  it('未知状态码走兜底分支，不抛出、不白屏', () => {
    const view = describeApiError({ status: 418 });
    expect(view.kind).toBe('UNKNOWN');
    expect(view.title.length).toBeGreaterThan(0);
    expect(view.detail.length).toBeGreaterThan(0);
  });
});

/**
 * 音频规则文案与服务端收敛（t36）。
 *
 * 服务端现在会给**带数字**的叙述：“这一段的固定时长是 22.5 秒，你录的是 15.0 秒（相差 7.5 秒）”。
 * 两个音频码都必须**优先展示服务端 message**；前端静态文案只能是中性兜底，
 * 不得写参数（否则就是“规则换了、文案没换”的第二份规则）。
 */
describe('音频规则文案：服务端 message 优先', () => {
  const serverMessage =
    '这一段的固定时长是 22.5 秒，你录的是 15.0 秒（相差 7.5 秒，允许 ±2.0 秒）。';

  it('AUDIO_DURATION_OUT_OF_RANGE：直接用服务端那句带数字的话', () => {
    const view = describeApiError({
      status: 422,
      code: 'AUDIO_DURATION_OUT_OF_RANGE',
      message: serverMessage,
    });
    expect(view.code).toBe('AUDIO_DURATION_OUT_OF_RANGE');
    expect(view.detail).toBe(serverMessage);
  });

  it('AUDIO_SEGMENT_PRESET_MISSING：同样用服务端 message', () => {
    const view = describeApiError({
      status: 422,
      code: 'AUDIO_SEGMENT_PRESET_MISSING',
      message: serverMessage,
    });
    expect(view.detail).toBe(serverMessage);
  });

  it('服务端 message 缺失时的兜底不得写出旧口径参数（不成为第二份规则）', () => {
    for (const code of ['AUDIO_DURATION_OUT_OF_RANGE', 'AUDIO_SEGMENT_PRESET_MISSING']) {
      const view = describeApiError({ status: 422, code, message: null });
      expect(view.detail).not.toMatch(/15\s*(–|-|~)\s*30/);
      expect(view.detail).not.toContain('15–30');
      expect(view.detail.length).toBeGreaterThan(0);
    }
  });
});
