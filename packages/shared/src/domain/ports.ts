/**
 * 依赖注入端口（ADR-005 不变式 4：内核中不存在隐式时间源）。
 *
 * 命令与守卫**只**通过 `DomainContext` 拿时间、ID 与策略；
 * 唯一允许出现 `Date.now()` 的地方是本文件的 `createSystemClock()`。
 */
import { DEFAULT_POLICY, type DomainPolicy } from './constants';

export interface Clock {
  now(): number;
}

/** 可推进的假时钟（测试用），避免任何真实时间依赖。 */
export interface ManualClock extends Clock {
  set(at: number): void;
  advance(ms: number): void;
}

export interface IdGenerator {
  next(): string;
}

/** 注入的随机源：[0, 1) 的均匀分布；内核自身永不调用 `Math.random`。 */
export type RandomSource = () => number;

export interface DomainContext {
  clock: Clock;
  ids: IdGenerator;
  policy: DomainPolicy;
}

export function createDomainContext(init: {
  clock: Clock;
  ids: IdGenerator;
  policy?: Partial<DomainPolicy> | undefined;
}): DomainContext {
  return {
    clock: init.clock,
    ids: init.ids,
    policy: { ...DEFAULT_POLICY, ...(init.policy ?? {}) },
  };
}

export function createManualClock(start = 0): ManualClock {
  let current = start;
  return {
    now: () => current,
    set: (at: number) => {
      current = at;
    },
    advance: (ms: number) => {
      current += ms;
    },
  };
}

export function createSequentialIds(prefix = 'id'): IdGenerator {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return `${prefix}-${counter}`;
    },
  };
}

/**
 * 生产环境时钟。内核命令**永远不**直接调用它；
 * 由 API 层组装 `createDomainContext({ clock: createSystemClock(), ... })` 注入下去。
 */
export function createSystemClock(): Clock {
  return { now: () => Date.now() };
}
