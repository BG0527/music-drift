/**
 * 匿名代号分配服务：把「生成层」与「DB 唯一索引」串成一条可靠路径（供 t9 的捞取/指定接唱调用）。
 *
 * 三层保障，缺一层都会漏：
 * 1. 先查本用户已持有的代号 → 复用（幂等：同瓶重复分配不会换代号）；
 * 2. 生成时排除本用户已持有的候选 → 保证「同瓶不同码」；
 * 3. 落库时撞全局唯一索引 → 记下这个候选并换一个重试（并发下唯一可靠的一道）。
 */
import { randomInt } from 'node:crypto';
import type { RandomSource } from '@music-drift/shared/domain';
import { ANON_CODE_MAX_ATTEMPTS, AnonCodeExhaustedError, pickUniqueAnonCode } from './anonCode.js';
import type { AuthRepository } from './repository.js';

/**
 * 生产随机源：用 `crypto` 而不是 `Math.random` —— 代号可预测意味着别人能提前算出某个代号并占用。
 * 返回 [0, 1) 均匀分布，与领域内核的 `RandomSource` 契约一致（内核自己不取随机，靠注入）。
 */
export function createSystemRandom(): RandomSource {
  const RANGE = 2 ** 30;
  return () => randomInt(0, RANGE) / RANGE;
}

export interface AnonCodeAssignment {
  code: string;
  /** false = 复用已有代号（幂等路径）。 */
  created: boolean;
}

export interface AnonCodeService {
  assign(input: { userId: string; bottleId: string }): Promise<AnonCodeAssignment>;
}

export interface AnonCodeServiceDeps {
  repo: AuthRepository;
  random?: RandomSource | undefined;
  maxAttempts?: number | undefined;
}

export function createAnonCodeService(deps: AnonCodeServiceDeps): AnonCodeService {
  const random = deps.random ?? createSystemRandom();
  const maxAttempts = deps.maxAttempts ?? ANON_CODE_MAX_ATTEMPTS;

  return {
    async assign({
      userId,
      bottleId,
    }: {
      userId: string;
      bottleId: string;
    }): Promise<AnonCodeAssignment> {
      const existing = await deps.repo.listAnonCodes(userId);
      const already = existing.find((row) => row.bottleId === bottleId);
      if (already !== undefined) {
        return { code: already.code, created: false };
      }

      const takenByUser = new Set(existing.map((row) => row.code));
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const candidate = pickUniqueAnonCode({
          random,
          isCodeTaken: (code) => takenByUser.has(code),
          maxAttempts,
        });
        const result = await deps.repo.assignAnonCode({ userId, bottleId, code: candidate });
        if (result.ok) {
          return { code: result.code, created: result.created };
        }
        // 只可能是全局唯一索引撞车（其余冲突在 repository 里已上抛）：记下候选，换一个再来。
        takenByUser.add(candidate);
      }
      throw new AnonCodeExhaustedError();
    },
  };
}
