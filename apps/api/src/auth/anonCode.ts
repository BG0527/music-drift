/**
 * 匿名代号生成（CONTEXT §12.1 / t6）。
 *
 * 规则：形如「午夜歌手#042」，**全局唯一** 且 **同一用户在不同瓶子里必须不同**
 * （否则任何人可以用一个代号把他的所有作品串起来，匿名性直接失效）。
 *
 * 唯一性的两层：
 * 1. **本模块**：先排除「本用户已持有的代号」——负责体验与减少冲突；
 * 2. **DB 唯一索引** `anon_codes.code` —— 最终防线，并发下唯一可靠的一道（`repository.assignAnonCode`）。
 *
 * 随机源从外部注入（`RandomSource`），内核/模块自身永不调用 `Math.random`（ADR-005 不变式 4）。
 */
import type { RandomSource } from '@music-drift/shared/domain';

/** 代号词表：海洋/漂流意象，**不含 `#` 与空白**（否则代号自身产生歧义）。 */
export const ANON_CODE_TITLES = [
  '午夜歌手',
  '潮汐信使',
  '深海旅人',
  '雾港水手',
  '拾贝少年',
  '灯塔守望',
  '浪尖吟游',
  '月下渔火',
  '暗流合声',
  '星河摆渡',
  '海风收音',
  '浅滩回声',
  '远洋信号',
  '沉船歌者',
] as const;

/** 同一次分配内的重试上限：池子 ≈ 14 × 999，连撞 5 次说明随机源有问题，直接失败更诚实。 */
export const ANON_CODE_MAX_ATTEMPTS = 5;

export class AnonCodeExhaustedError extends Error {
  constructor(message = '无法生成唯一的匿名代号，请稍后重试。') {
    super(message);
    this.name = 'AnonCodeExhaustedError';
  }
}

/** `${词}${#}${三位数字}`，如 `午夜歌手#042`。 */
export function generateAnonCode(random: RandomSource): string {
  const titleIndex = Math.min(
    Math.floor(random() * ANON_CODE_TITLES.length),
    ANON_CODE_TITLES.length - 1,
  );
  const title = ANON_CODE_TITLES[titleIndex] ?? ANON_CODE_TITLES[0];
  const serial = Math.min(Math.floor(random() * 999) + 1, 999);
  return `${title}#${String(serial).padStart(3, '0')}`;
}

export interface PickUniqueAnonCodeOptions {
  random: RandomSource;
  /** 判定候选是否已被占用（实现方通常查「本用户已持有的代号」+ 全局唯一索引兜底）。 */
  isCodeTaken: (candidate: string) => boolean;
  maxAttempts?: number | undefined;
}

export function pickUniqueAnonCode(options: PickUniqueAnonCodeOptions): string {
  const maxAttempts = options.maxAttempts ?? ANON_CODE_MAX_ATTEMPTS;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = generateAnonCode(options.random);
    if (!options.isCodeTaken(candidate)) {
      return candidate;
    }
  }
  throw new AnonCodeExhaustedError();
}
