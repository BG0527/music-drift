/**
 * `@music-drift/shared` 的**根入口 = 契约层**（ADR-004：zod 是前后端唯一接口）。
 *
 * 领域内核**不从这里导出**：它有自己的稳定子路径 `@music-drift/shared/domain`
 * （见 `docs/architecture.md` §17.3「唯一消费点 = packages/shared/src/domain/index.ts」）。
 * 分开的理由有二：
 * 1. 领域类型（`Segment` / `Resolution` / `SeaZone` / `VoteValue` / `RuleViolation`）与契约里
 *    同名但语义不同（前者是内核内部结构，后者是网络 DTO），同层导出会产生名字歧义；
 * 2. 前端只该拿到 DTO，不该拿到内核命令与守卫。
 */
export * from './contracts';
