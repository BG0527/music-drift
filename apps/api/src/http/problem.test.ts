/**
 * 映射适配器测试（t9）：内核守卫 → HTTP 状态码/错误体，两条硬线可执行化。
 *
 * 硬线 1：`message` 必须是中文可读文案（码与文案分离，ADR-004）；
 * 硬线 2：响应体不得泄漏内部细节（SQL、堆栈、驱动错误码、表名）。
 */
import { RULE_CODES, type RuleCode, type RuleViolation } from '@music-drift/shared/domain';
import { ErrorResponseSchema } from '@music-drift/shared';
import { describe, expect, it } from 'vitest';
import { API_RULE_CODES } from '@music-drift/shared';
import {
  ALL_API_ERROR_CODES,
  TRANSPORT_ERROR_CODES,
  problemFromOutcome,
  problemFromViolations,
  internalProblem,
  transportProblem,
} from './problem';

/** 不允许出现在响应体里的内部细节模式（泄漏测试的靶子）。 */
const LEAK_PATTERNS = [
  'pg_',
  'SELECT',
  'select ',
  'insert into',
  'update ',
  'constraint',
  'duplicate key',
  'relation ',
  'column ',
  'at Object.',
  'at async',
  'ECONNREFUSED',
  'Error:',
  'stack',
  'password',
  'token',
  'scrypt',
];

function expectNoLeak(body: unknown): void {
  const serialized = JSON.stringify(body);
  for (const pattern of LEAK_PATTERNS) {
    expect(serialized, `响应体泄漏了内部细节：${pattern}`).not.toContain(pattern);
  }
}

function expectChineseMessage(message: string): void {
  expect(message.length).toBeGreaterThan(0);
  // 中文可读：至少含一个 CJK 字符，且不以 Error/失败栈形式开头。
  expect(/[一-鿿]/.test(message), `文案不是中文可读：${message}`).toBe(true);
  expect(message.startsWith('Error')).toBe(false);
}

describe('problem.ts：内核违规 → 409/422', () => {
  it('内核的每个稳定错误码都有状态码与中文文案（错误码表完整）', () => {
    for (const code of RULE_CODES) {
      const problem = problemFromViolations([{ code, message: `文案占位 ${code}` }]);
      expect(problem, `${code} 应产生错误响应`).not.toBe(null);
      if (problem === null) {
        continue;
      }
      expect([409, 422], `${code} 的状态码`).toContain(problem.status);
      expectChineseMessage(problem.body.error.message);
      expect(problem.body.error.violations[0]?.code).toBe(code);
      expect(ErrorResponseSchema.safeParse(problem.body).success).toBe(true);
      expectNoLeak(problem.body);
    }
  });

  it('冲突类走 409（并发抢占 / 非持有者 / 不在河道），规则类走 422', () => {
    expect(problemFromViolations([{ code: 'HOLDING_ALREADY_TAKEN', message: 'x' }])?.status).toBe(409);
    expect(problemFromViolations([{ code: 'NOT_HOLDER', message: 'x' }])?.status).toBe(409);
    expect(problemFromViolations([{ code: 'BOTTLE_NOT_IN_RIVER', message: 'x' }])?.status).toBe(409);
    expect(problemFromViolations([{ code: 'RESOLUTION_NOT_AVAILABLE', message: 'x' }])?.status).toBe(422);
    expect(problemFromViolations([{ code: 'CANNOT_RECORD_TWICE_IN_BOTTLE', message: 'x' }])?.status).toBe(422);
    expect(problemFromViolations([{ code: 'LISTEN_RATIO_TOO_LOW', message: 'x' }])?.status).toBe(422);
  });

  it('首个违规决定状态码，但全部违规都保留在 violations 里', () => {
    const violations: RuleViolation[] = [
      { code: 'HOLDING_ALREADY_TAKEN', message: '瓶子被抢走了' },
      { code: 'NOT_HOLDER', message: '你手上没有这个瓶子' },
    ];
    const problem = problemFromViolations(violations);

    expect(problem?.status).toBe(409);
    expect(problem?.body.error.violations).toEqual(violations);
    expect(problem?.body.error.message).toBe('瓶子被抢走了');
  });

  it('同端点上的其它词表（音频码）也走同一出口 → 422，不会因不在内核表里而崩', () => {
    const problem = problemFromViolations([{ code: 'AUDIO_DURATION_OUT_OF_RANGE', message: '这一段太短了。' }]);

    expect(problem?.status).toBe(422);
    expect(problem?.body.error.violations[0]?.code).toBe('AUDIO_DURATION_OUT_OF_RANGE');
    expect(ErrorResponseSchema.safeParse(problem?.body).success).toBe(true);
  });

  it('API 层功能码（收藏仅限已完成作品）也走同一出口 → 422 且被契约接受', () => {
    const problem = problemFromViolations([
      { code: 'COLLECTION_REQUIRES_FINISHED_WORK', message: '收藏只对已完成并进入公海的作品开放。' },
    ]);

    expect(API_RULE_CODES).toContain('COLLECTION_REQUIRES_FINISHED_WORK');
    expect(problem?.status).toBe(422);
    expect(ErrorResponseSchema.safeParse(problem?.body).success).toBe(true);
  });

  it('没有违规就没有错误响应（成功路径不需要映射）', () => {
    expect(problemFromViolations([])).toBe(null);
  });

  it('命令结果直接可用：被拒 → 错误响应；被接受 → null', () => {
    const rejected = problemFromOutcome({
      ok: false,
      state: {} as never,
      events: [],
      violations: [{ code: 'BOTTLE_DAMAGED', message: '作品已损坏' }],
    });
    expect(rejected?.status).toBe(422);

    const accepted = problemFromOutcome({ ok: true, state: {} as never, events: [], violations: [] });
    expect(accepted).toBe(null);
  });
});

describe('problem.ts：传输层码 → 401/403/404/500（内核不参与）', () => {
  it('会话/角色/资源存在性不是领域规则，由传输层提供且文案中文', () => {
    expect(transportProblem('UNAUTHENTICATED').status).toBe(401);
    expect(transportProblem('FORBIDDEN').status).toBe(403);
    expect(transportProblem('FORBIDDEN').body.error.message).toContain('权限');
    expect(transportProblem('NOT_FOUND').status).toBe(404);
    for (const code of TRANSPORT_ERROR_CODES) {
      const problem = transportProblem(code);
      expectChineseMessage(problem.body.error.message);
      expect(ErrorResponseSchema.safeParse(problem.body).success).toBe(true);
      expectNoLeak(problem.body);
    }
  });

  it('错误码表完整：内核码 + API 层功能码 + 传输层码都能查到状态码与文案', () => {
    expect(ALL_API_ERROR_CODES.length).toBe(
      RULE_CODES.length + API_RULE_CODES.length + TRANSPORT_ERROR_CODES.length,
    );
    expect(new Set(ALL_API_ERROR_CODES).size).toBe(ALL_API_ERROR_CODES.length);
  });
});

describe('problem.ts：硬线 2 —— 内部细节绝不进响应体', () => {
  it('500 是固定文案：不接受任何错误对象，结构上无法泄漏', () => {
    const problem = internalProblem();

    expect(problem.status).toBe(500);
    expectChineseMessage(problem.body.error.message);
    expectNoLeak(problem.body);
    expect(problem.body.error.violations).toEqual([]);
  });

  it('内核码文案来自内核文案表（不是把 code 当文案透出）', () => {
    const code: RuleCode = 'CANNOT_DRAW_OWN_BOTTLE';
    const problem = problemFromViolations([{ code, message: '不能接自己投出的瓶子。' }]);

    expect(problem?.body.error.message).toBe('不能接自己投出的瓶子。');
    expect(problem?.body.error.message).not.toContain(code);
  });
});
