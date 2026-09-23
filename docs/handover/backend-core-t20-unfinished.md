# backend-core · t20 停机交接（2026-09-23 08:5x）

> 停机令（captain，用户排程）：**9:00 前收完 t20 当前增量并停下**；12:00 由用户回话再继续。
> 本文件是「仓库里的记忆」：会话会丢，这里不会。**未 commit**（captain 统一提交）。

## 一、t20 状态：**已完成**（验收项全绿，真实退出码）

| 验收项 | 状态 | 证据 |
| --- | --- | --- |
| 每 (user, segment) 覆盖率**服务端持久化**，跨请求/跨重启不丢 | ✅ | 表 `listen_progress`（PK `(user_id, segment_id)`，迁移 `apps/api/drizzle/0004_elite_cloak.sql`）；集成用例：上报后断言库里有该行，并用**新建的 app 实例**（同库同 cookie）点踩直接通过 |
| 覆盖率语义 = 内核 `ListenTracker`（并集 / 拖动不计 / 循环不叠加 / 时长不可信→0） | ✅ | 服务端不重算覆盖率：`listenedRatio` / `canDislike` 全部来自 `@music-drift/shared/audio`；集成用例用**真实 tracker** 跑一段含拖动+循环的位置序列，断言服务端 ratio 与本地 tracker 一致（`toBeCloseTo(...,10)`）；时长缺失 → ratio 0 + 门槛永不解锁 |
| 点踩门槛由服务端读持久化覆盖率判定；阈值取内核策略 | ✅ | 路由先让**内核**说话（保持 自踩→重复票→段已斩→听满 的判定顺序），只把 `LISTEN_RATIO_TOO_LOW` 换成 API 功能码 `LISTEN_THRESHOLD_NOT_REACHED`；阈值 = `DEFAULT_POLICY.dislikeListenRatioThreshold`（响应里回显，测试断言等于内核值） |
| 422 + 稳定码 + 中文可读原因 | ✅ | 真响应过 `ErrorResponseSchema.parse`；`code=LISTEN_THRESHOLD_NOT_REACHED`，`message` 含「80%」（百分比由策略生成）；被拒的票**零副作用**（votes 表计数 = 0） |
| 上报只是增量输入、只增不减、单次伪造跨不过门槛 | ✅ | 纯函数 `nextCoveredMs` 8 条单测 + 集成：先报大值再报小值 → 判定仍用最大值；`coveredMs=999999` 一次 → 只记段长一半（< 门槛）→ 422；紧接着再伪造也拿不到多少（按墙上时间限速）。**请求体里的 `listenedRatio` 完全不被采信**（伪造成 1 仍 422） |
| 点赞/点踩都落库、可分别统计；只有踩数驱动斩浪（§7.1） | ✅ | 集成：10 个赞 → `LIKE`=10、段仍在；同一批用户补 10 个踩 → `DISLIKE`=10 且第 10 个触发斩浪、段软删 |
| 契约扩展 + `docs/api.md` 同步；既有字段零破坏 | ✅ | `CastVoteRequest.listenedRatio` → **可选 + 废弃注释**（旧客户端继续可用）；`CastVoteResponse` 新增服务端 `listenedRatio`；新增 `SubmitListenProgressRequestSchema` / `ListenProgressResponseSchema`；`docs/api.md` §2.6 新增 t20 段 + 端点表 + 变更记录 |
| 命令基线 | ✅ | `pnpm --filter @music-drift/api test` **exit 0**（19 文件 / 176 例）；`pnpm --filter @music-drift/shared test` exit 0（21 / 231）；`pnpm -r typecheck` exit 0；`pnpm lint` exit 0；`pnpm --filter @music-drift/api test:integration` **exit 0**（21 文件 / 160 例） |

**新增/改动文件**：`apps/api/src/store/listenProgress.ts`(+`.test.ts`)、`apps/api/src/routes/listenProgress.integration.test.ts`、
`apps/api/src/routes/interactions.ts`（新端点 + 门槛改判）、`apps/api/src/db/schema.ts` + `drizzle/0004_elite_cloak.sql`、
`apps/api/src/db/test-helpers.ts`（`listenUntilThresholdBatch` 夹具）、`packages/shared/src/contracts/interactions.ts` + `error-codes.ts`、`docs/api.md`。
**被迫改的他人文件（只加夹具前置，不动断言）**：`apps/api/src/routes/admin.integration.test.ts`、`apps/api/src/routes/notifications-write.integration.test.ts`（t12 的两个文件，它们用「10 人点踩」造斩浪，判定改了以后必须先"听满"）；`apps/api/src/routes/returnHandoff.integration.test.ts`（我 t19 的文件）从"随机捞取"改成"按 id 指定接唱"—— 随机捞取在多文件共用的集成库里是**运气夹具**，全量跑时真的翻车过一次。

## 二、⚠️ 未完成 → 下一步（第一件就是它）

1. **`apps/web/tools/golden-path-live-check.mjs` 第 27 步现在会红（已实测复现，不是推测）**
   - 事实：`node apps/web/tools/golden-path-live-check.mjs` → **exit 1**，10 个点踩者全部 `✗ 点踩应为 200，实际 422`（它们只带了 `listenedRatio: 0.9`，而服务端现在读库里覆盖率）。
   - 归属：该文件在 `apps/web/tools/**`，**不在 t20 的 in-scope 列表**（t20 明确「不碰 apps/web/**」），所以我没有改。
   - 修法（照抄 `apps/api/src/db/test-helpers.ts` 的思路，约 10 行）：10 个投票者**批量**上报两次
     `POST /api/segments/:id/listen {coveredMs: 20000}`（首次只记 10s）→ **等 ~2.8s**（段长 20s 时的
     `((0.8-0.5)*20000-3000)/1.25 + 400`）→ 第二次上报（记满 20s = 100%）→ 再点踩即 200。
     10 人共用同一次等待，整步只慢 ~3 秒。
   - 这正是 ADR-019 意义上的"验证路径必须跟着契约改"：**契约变了，端到端检查的红是真实的**，不能靠"上次是绿的"糊过去。

2. **t12 前端接线（不在我边界）**：需要 (a) 播放中周期性 `POST /api/segments/:id/listen`；(b) 点踩 422 且
   `code === 'LISTEN_THRESHOLD_NOT_REACHED'` 时弹「需要听满 80%」提醒（文案里的百分比由服务端 message 给出）。
   注意**不要**再依赖请求体里的 `listenedRatio`（已被忽略）。

## 三、captain 排队的两条新需求（**未开工**，等 12:00 指令）

1. **§46.1 被斩浪者一律不算参与过（含发起者）**：触及 `/api/me/bottles` 参与判定、`BOTTLE_COMPLETED` 接收者集合、
   徽章计数、`CONTEXT.md` §16.7 措辞；要求**删掉现有"发起者豁免"判断**（不留两套判定）。
   注意：`apps/api/src/routes/myBottles.integration.test.ts` 现有用例断言的正是「被斩浪后**仍算**参与过」——
   换规则后这条断言必须**反转**（`role`/列表归属都要改），别再把它当回归基线。
2. **§46.2 公海列表真分页**：`/api/sea` 现在 `nextCursor` 硬编码 null、内联 schema 不消费 `cursor`
   （契约 `BottleListQuerySchema` 已声明）⇒ 第 4 类静默损失。要求 cursor 真消费 + 稳定排序键 + 末页 null，
   先写「第 2 页与第 1 页不重叠且覆盖完整」的红测试，并优先复用既有契约 schema。

## 四、上一轮遗留（不阻塞）

- **t19 的偶发未定位**：加诊断前 8 次里 1 次红（第 19 步 `C 入海` 返回错误信封，5 项连锁），此后 16 次未复现；
  脚本已内建自报告（失败时打印最近 8 次请求的响应体原文 + 服务端日志末 20 行），**未加自动重试**（会掩盖真 5xx）。
- `apps/web/docs/T3.2-manual-verification.md` 仍写「26 步」（t11 的文档，已由 captain 转派 frontend-flow）。
