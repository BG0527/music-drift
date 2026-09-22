/**
 * 领域内核公共入口（T1.1 / backend-core）。
 *
 * 纪律（`docs/architecture.md` ADR-005）：
 * - **零 IO**：不碰数据库、网络、文件系统；不读 `Date.now()`、不用 `Math.random()`；
 *   时钟 / ID 生成器 / 随机源一律由 `DomainContext` 注入；
 * - 守卫统一 `can<Action>(state, cmd) => RuleViolation[]`（不抛异常、不返回裸布尔），
 *   错误码 → HTTP 状态的默认映射见 `httpStatusOf`（409 冲突 / 422 规则违反）；
 * - 命令统一 `(state, cmd, ctx) => CommandOutcome`：被拒绝时 `state` 为原引用、`events` 为空，
 *   即「拒绝 = 零副作用」；成功时状态由事件折叠得到，因此 `replayBottle` 必然等价。
 *
 * 规则来源：`CONTEXT.md` §3 / §4 / §5 / §7 / §10.1 / §11.3 / §15 / §16。
 */
export * from './constants';
export * from './errors';
export * from './types';
export * from './ports';
export * from './queries';
export * from './events';
export * from './outcome';
export * from './resolution';
export * from './bottle';
export * from './holding';
export * from './river';
export * from './moderation';
export * from './messages';
export * from './timeouts';
export * from './badges';
