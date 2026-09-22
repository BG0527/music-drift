/**
 * 请求级内核上下文（t9）：路由**唯一**的 `DomainContext` 构造入口。
 *
 * 两条硬约束，各有理由：
 * 1. **时间来自注入时钟**（`createSystemClock` 或测试假时钟）—— API 层禁止 `Date.now()`（eslint 守卫）；
 * 2. **ID 必须是 UUID** —— 内核用 `ctx.ids.next()` 生成段/留言 id，而这些 id 直接进
 *    `bottle_segments.id` / `messages.id`（uuid 列）。用自增风格 id（如 `seg-1`）会在写入时报
 *    `invalid input syntax for type uuid` —— 这是集成测试真实抓到过的问题，故在唯一入口固定为 UUID。
 */
import { createDomainContext, type Clock, type DomainContext } from '@music-drift/shared/domain';
import { randomUUID } from 'node:crypto';

export function createRequestContext(clock: Clock): DomainContext {
  return createDomainContext({ clock, ids: { next: () => randomUUID() } });
}
