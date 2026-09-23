# docs/api.md — 音乐漂流瓶 API 契约（t5 建立，t9 落地补齐）

> **形状以 `packages/shared/src/contracts/**` 的 zod schema 为准**（ADR-004：zod 是唯一真相）。
> 本文件是**手写派生**文档（D-12 裁决：不引入 OpenAPI 生成工具），只描述调用约定与端点清单；
> 字段级别请直接读同名 schema，避免文档与代码双真相。
>
> 契约版本：`CONTRACT_VERSION = 0.2.0-s1`（**以代码为准**：本行曾停留在 `0.1.0-s1`，t9 对代码复核后改正，见「变更记录」t9 行）。
> 不兼容变更必须提升它，并在本文件「变更记录」留痕。
> 响应体统一带 `contractVersion` 的地方只有 `/healthz`；其余响应靠 schema 形状与版本号共同约束。

## 1. 通用约定

| 主题       | 约定                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 传输       | JSON（音频上传例外：**原始二进制 body**，`Content-Type` = 音频 MIME + `x-audio-duration-ms` 头，ADR-018 / §2.7）                                                                                                                                                                                                                                                                                                                                        |
| 时间       | ISO 8601 UTC 字符串（`z.iso.datetime()`）；事件流另给 `occurredAtMs`（epoch 毫秒）                                                                                                                                                                                                                                                                                                                                                                      |
| 主键       | UUID v4 字符串                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 认证       | `httpOnly` + `SameSite` cookie（ADR-008）；**不在响应体里回显口令/会话令牌**                                                                                                                                                                                                                                                                                                                                                                            |
| 分页       | 游标式：`limit`（1–100，默认 20）+ `cursor`，响应 `{ items, nextCursor }`                                                                                                                                                                                                                                                                                                                                                                               |
| 错误体     | `ErrorResponseSchema = { error: { message, violations[] } }`                                                                                                                                                                                                                                                                                                                                                                                            |
| 状态码     | `400` 结构错误｜`401` 未登录｜`403` 无权限｜`404` 资源不存在｜`409` 并发或状态冲突｜`422` 规则违反｜`501` 本切片未实现（完整表见 §2.8）                                                                                                                                                                                                                                                                                                                 |
| 错误码     | `violations[].code` ∈ **`RULE_CODES` ∪ `AUDIO_RULE_CODES` ∪ `API_RULE_CODES` ∪ `AUTH_ERROR_CODES`**（音频侧 5 个码见 §2.7；漂流瓶路由的 envelope 可同时表达领域码与音频码）：领域规则类取前者（`contracts/common.ts` 的 `RuleCodeSchema`），**账号类路由取后者**（`contracts/auth.ts` 的 `AuthErrorCodeSchema`）。两套都是稳定字符串码；`message` 是中文文案给人。分开的理由见 `docs/architecture.md` §26.4（不动终态内核 + auth 错误与游戏规则不同类） |
| 码与状态   | **只有领域/音频/API 规则码出现在 `violations[].code`**；传输层问题（400/401/403/404/501）`violations` 为空、**靠 HTTP 状态区分**（不发明第二套码）                                                                                                                                                                                                                                                                                                      |
| 时间戳来源 | 服务端一律 `createSystemClock()` 注入；**API 层禁止 `Date.now()` / `new Date()`**（eslint 已强制）                                                                                                                                                                                                                                                                                                                                                      |

### 1.1 三条必须遵守的领域语义（ADR-015，最容易踩）

1. **段号 = 歌里的固定段落位置，永不压缩。** 斩浪后该位置留空；作品是否完整看
   `missingSegmentIndexes.length === 0` / `isComplete`，**不看段数**（3 段 + 1 缺口 ≠ 完整）。
2. **录制请求体里没有 `index`。** 段号由服务端 `nextRecordIndex`（= 最小缺口段号）决定，
   响应 `RecordSegmentResponse.index` 告诉前端「本次录的是第几段」。前端不得自选段号。
3. **有缺口也可以入海。** 公海分「已完成区 / 未完成区」：`seaZone: 'COMPLETED' | 'INCOMPLETE'`，
   已完成区只收 `isComplete === true`；未完成区可被「指定接唱」补位。

## 2. 端点清单

### 2.1 健康检查（S0 已有）

| 方法 | 路径       | 请求 | 响应                   |
| ---- | ---------- | ---- | ---------------------- |
| GET  | `/healthz` | —    | `HealthResponseSchema` |

### 2.2 账号（t6 落地）

| 方法 | 路径                      | 请求                    | 响应                                                          |
| ---- | ------------------------- | ----------------------- | ------------------------------------------------------------- |
| POST | `/api/auth/register`      | `RegisterRequestSchema` | `201` + `SessionResponseSchema`（**Set-Cookie**，注册即登录） |
| POST | `/api/auth/login`         | `LoginRequestSchema`    | `200` + `SessionResponseSchema`（Set-Cookie）                 |
| POST | `/api/auth/logout`        | —                       | `204`（并清除 cookie；幂等，无 cookie 也 204）                |
| GET  | `/api/auth/me`            | —                       | `SessionResponseSchema`                                       |
| GET  | `/api/me/anonymous-codes` | —                       | `AnonymousCodeSchema[]`（同用户不同瓶不同代号）               |

**会话载体**：cookie `mdb_session`，`Path=/; HttpOnly; SameSite=Lax; Max-Age=<TTL>`（默认 30 天，**仅生产**加 `Secure`）。
库内只存 `sha256(token)`；明文 token 只出现在 `Set-Cookie`（响应体与日志永不出现）。

**账号错误码**（`AUTH_ERROR_CODES`，`AuthErrorResponseSchema`，envelope 与 `ErrorResponseSchema` 同形）：

| 码                    | 状态 | 触发                                                                                          |
| --------------------- | ---- | --------------------------------------------------------------------------------------------- |
| `EMAIL_TAKEN`         | 409  | 注册邮箱已存在（大小写不敏感）                                                                |
| `HANDLE_TAKEN`        | 409  | 注册用户名已存在                                                                              |
| `INVALID_CREDENTIALS` | 401  | 登录凭证错误（**不区分**账号不存在与口令错误，防账号枚举）                                    |
| `UNAUTHENTICATED`     | 401  | 未登录 / cookie 缺失或畸形                                                                    |
| `SESSION_EXPIRED`     | 401  | 会话过期（`now >= expires_at` 即失效，过期行在被访问时删除）                                  |
| `WEAK_PASSWORD`       | 422  | 口令强度不足（长度 8..128，且需同时含字母与数字，不含自己的 handle/邮箱名，不在弱口令黑名单） |

`422` 的请求体结构错误（例如邮箱格式非法）返回 `violations: []` + 中文 `message`（结构错误没有对应的 auth 码）。

**已知未做项（demo 范围内明确接受，不要当成漏掉的 bug）**：

1. **登录/注册无速率限制**（未引入限流中间件）—— 暴力破解防护属正式版范围；
2. `EMAIL_TAKEN` / `HANDLE_TAKEN` 在注册接口上**必然可枚举**（注册 UX 的固有取舍）；
3. 会话是**有状态**的（`sessions` 表），未做跨实例共享与主动踢下线列表。

### 2.3 曲库与分段

| 方法 | 路径         | 请求 | 响应                                               |
| ---- | ------------ | ---- | -------------------------------------------------- |
| GET  | `/api/songs` | —    | `SongSchema[]`（含 `totalSegments` 与 4 段元数据） |

### 2.4 漂流瓶主流程

| 方法 | 路径                          | 请求                                                                                            | 响应                          | 说明                                                              |
| ---- | ----------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| POST | `/api/bottles`                | `CreateBottleRequestSchema`                                                                     | `BottleDetailSchema`          | 发起（选歌）                                                      |
| POST | `/api/bottles/:id/segments`   | **原始二进制**（`Content-Type` = 音频 MIME，`x-audio-duration-ms` 必填，`x-segment-note` 可选） | `RecordSegmentResponseSchema` | **段号由服务端决定**；补位时 = 最小缺口段号                       |
| POST | `/api/bottles/:id/resolution` | `ChooseResolutionRequestSchema`（`RIVER`/`RETURN`/`SEA`）                                       | `BottleDetailSchema`          | 去向三选一；不是可选值即 `422 RESOLUTION_NOT_AVAILABLE`           |
| POST | `/api/bottles/:id/put-back`   | —                                                                                               | `PutBackResponseSchema`       | 未接唱直接放回；返回冷却次数（N=10）                              |
| GET  | `/api/bottles/:id`            | —                                                                                               | `BottleDetailSchema`          | 含 `availableResolutions` / `isHolder` / `replacementContext`     |
| GET  | `/api/bottles/:id/events`     | `BottleEventsQuerySchema`                                                                       | `BottleEventSchema[]`         | 事件流（按 `seq` 升序，客户端不要本地推算时间线）                 |
| GET  | `/api/me/bottles`             | `limit`（1–100，默认 20）                                                                       | `MyBottleListSchema`          | **我的漂流日志**（CONTEXT §11.1）：我参与过的瓶子，按最近活跃倒序 |

**「我的漂流日志」（`GET /api/me/bottles`，CONTEXT §11.1）**

- 「参与过」= **我发起的** 或 **我在该瓶唱过**（判据取 `events` 的 `SEGMENT_RECORDED` 主动方，事件是单一事实来源）。
- **参与过 ≠ 现在还有效**：我的那一段被斩浪（ADR-015 §16.7 软删）之后**仍然在列表里**，`role` 不变，
  只是 `mySegmentIndexes` 里不再有它（缺口由 `missingSegmentIndexes` 表达）。
- `role: 'INITIATOR' | 'SINGER'` 只有两种取值：发起者不可能再接唱自己的瓶子（内核 `hasEverSung` 拦着），
  因此**没有第三种状态**，前端不必为不存在的状态写分支。
- 未登录 `401`；只返回自己的；每行含 状态 / 段数 / `missingSegmentIndexes` / `updatedAt`（最近活跃）/ 曲名。
- 集成测试用 `MyBottleListSchema.parse` 校验**真响应**（`apps/api/src/routes/myBottles.integration.test.ts`）。

**捞取（河道只能随机，不提供搜索/指定）**

| 方法 | 路径              | 请求 | 响应                                                                   |
| ---- | ----------------- | ---- | ---------------------------------------------------------------------- |
| POST | `/api/river/draw` | —    | `DrawResponseSchema`（捞到即持有；无可捞时 `409 NO_BOTTLE_AVAILABLE`） |

**并发语义**：同一瓶子同一时刻只有一个持有者。并发 `draw` / `claim` 时只有一个成功，
其余返回 `409 HOLDING_ALREADY_TAKEN`（DB 侧由 `holdings` 的部分唯一索引保证，见下）。

### 2.5 公海

| 方法 | 路径                            | 请求            | 响应                  | 说明                                                                        |
| ---- | ------------------------------- | --------------- | --------------------- | --------------------------------------------------------------------------- |
| GET  | `/api/sea`                      | `zone=COMPLETED | INCOMPLETE`、`limit`  | `Page<BottleSummarySchema>`                                                 | **默认只看已完成区**（CONTEXT §6.1），未完成区须显式 `?zone=INCOMPLETE` |
| GET  | `/api/sea/:id`                  | —               | `BottleSummarySchema` | 不在公海的瓶子 → `404`（不是 403，避免探测）                                |
| POST | `/api/sea/:id/targeted-segment` | —               | `BottleSummarySchema` | 指定接唱未完成作品：抢占持有权；父节点 = 该作品**最后一段**的接唱者（§6.2） |

指定接唱的判定全部来自内核导出，路由不发明规则：已完成 → `422 BOTTLE_ALREADY_COMPLETE`（完成品只能听）；
在该瓶唱过（含被斩的软删段）→ `422 ALREADY_SANG_IN_BOTTLE`；不在公海 → `404`；未登录 → `401`。

### 2.6 互动

| 方法        | 路径                              | 请求                                      | 响应                                                     |
| ----------- | --------------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| POST        | `/api/segments/:id/listen`        | `SubmitListenProgressRequestSchema`（`coveredMs`）  | `ListenProgressResponseSchema`（服务端记账 + 门槛判定）  |
| POST        | `/api/segments/:id/votes`         | `CastVoteRequestSchema`                   | `CastVoteResponseSchema`                                 |
| POST        | `/api/bottles/:id/messages`       | `AttachPrivateMessageRequestSchema`       | `PrivateMessageSchema`                                   |
| GET         | `/api/bottles/:id/messages`       | —                                         | `PrivateMessageSchema[]`（只有发起者/发送者看得到）      |
| POST        | `/api/reports`                    | `CreateReportRequestSchema`               | `204`（进人工审核队列，PENDING）                         |
| GET         | `/api/notifications`              | `PageQuerySchema`                         | `Page<NotificationSchema>`（只含自己的）                 |
| POST        | `/api/notifications/:id/read`     | —                                         | `204`（幂等；别人的通知 → `404`，不泄露存在性）          |
| GET         | `/api/me/badges`                  | —                                         | `BadgeAwardSchema[]`（**派生现算、不落库**，ADR-014 #1） |
| GET         | `/api/me/collections`             | —                                         | `CollectionSchema[]`                                     |
| POST/DELETE | `/api/collections/:bottleId`      | —                                         | `CollectionSchema` / `204`（仅已完成公海作品；幂等）     |
| GET         | `/api/admin/reports`              | `?status=PENDING\|REVIEWED\|ALL`、`limit` | `ReportSchema[]`（**仅管理员**；非管理员 `403`）         |
| POST        | `/api/admin/reports/:id/decision` | `ReviewDecisionRequestSchema`             | `ReportSchema`（裁决后的举报行；审计留痕）               |

互动族的读写权限口径（t9 实测钉住）：

- **投票**：必须登录；作者不能踩自己的段（`422 CANNOT_DISLIKE_OWN_SEGMENT`）；点踩必须 `listenedRatio >= 0.8`
  （`422 LISTEN_RATIO_TOO_LOW`，服务端校验）；重复投票 `422 {DISLIKE,LIKE}_ALREADY_CAST`（不静默覆盖）；
  被斩的段再投 → `422 SEGMENT_ALREADY_CUT`。
- **留言**：只有**接唱者**能写（发起者 → `422 MESSAGE_SENDER_NOT_PARTICIPANT`）；空内容 `422 MESSAGE_CONTENT_EMPTY`；
  瓶子已入海/受损/回传链断 → `422 MESSAGE_BOTTLE_NOT_DRIFTING`（不留悬空 PENDING）。
  **可见性在服务端**：发送者看自己的（含未送达）、发起者只看 `DELIVERED`、中间传递者与无关者看不到任何留言（§5.1）。
- **通知/徽章**：都是「只读自己」，未登录一律 `401`。

**审核台：裁决流转（t12 落地，`CONTEXT.md` §8.3）**

`decision` 就是"要实施的结论"（驳回 = `NONE`）：

| `decision`        | 适用对象           | 效果                                                             | 备注             |
| ----------------- | ------------------ | ---------------------------------------------------------------- | ---------------- |
| `NONE`            | 瓶子/唱段/留言     | 驳回：不改内容，只把举报转为 `REVIEWED`                          | 审计留痕         |
| `REMOVE_SEGMENT`  | 唱段               | **事件流**追加 `SEGMENT_CUT` + 该段软删（行保留，可恢复/可审计） | 见下 ⚠️          |
| `RESTORE_SEGMENT` | 唱段               | **人工覆盖自动斩杀**：按同一段号把该段音频重新登记为有效段       | 见下 ⚠️          |
| `REMOVE_BOTTLE`   | 瓶子               | 从公海下架：`DAMAGED` + 释放持有（不物理删除）                   | 可申诉           |
| `BAN_USER`        | 任意（解出所有者） | 标记 `users.banned_at` + 清该用户全部会话                        | 封的是人不是内容 |

**状态码与语义**：

- `400` body 结构不合法（`decision` 不在词表内）｜`401` 未登录｜`403` 非管理员（**响应体不含队列内容**）｜`404` 举报不存在；
- `422 REVIEW_ACTION_NOT_APPLICABLE`：动作与对象类型不匹配（如对"瓶子"选「删段」）→ **举报保持 `PENDING`**（失败零副作用）；
- `422 REPORT_ALREADY_REVIEWED`：同一条举报**改主意**（与上次裁决不同）→ 客户端应刷新队列；
  相同裁决**幂等**（`200`），重复点击不产生第二次副作用。

⚠️ **两处必须知道的行为（t12 实测，不是"顺手"决定的）**：

1. **人工裁决必须落到事件流**：`missingSegmentIndexes` / `isComplete` 来自事件重放（ADR-005 不变式 3），
   只改 `bottle_segments.deleted_at` 的话**规则完全看不到**（表现为"接口成功、缺口没变"）。人工删段因此追加 `SEGMENT_CUT`。
2. **人工删段不自动"置回河道"**：内核在**自动斩杀**路径上会跟发 `BOTTLE_GAP_OPENED`（或 `BOTTLE_DAMAGED`：斩空 / 锚段被斩），
   但那个决策函数未导出；在仓储层重写它＝**第二份规则**。所以人工删段只让段失效，作品后续由既有流转
   （持有者选去向 / 管理员 `REMOVE_BOTTLE`）决定。**人工恢复**同理：内核无 un-cut 事件，采用
   「new segment id + 同一 index + 同一份音频字节」重新登记，旧行保持软删做审计
   （代价：恢复后的段 id 变了，旧 id 的播放链接与票数不继承）。

**§9.1 / §9.2 可见性（t12 落地）**

`CONTEXT.md` §9.1 是产品的核心承诺：**漂流中看不到后面是谁、唱成什么样**；§9.2：**入海后解锁完整接力链**。
两者是一对，判据集中在 `apps/api/src/store/visibility.ts`（详情与日志共用一份，避免两条路径漂移）：

| 观看者 \ 状态   | 漂流中（DRAFT / IN_RIVER / HELD）                  | 已入海（SEA） |
| --------------- | -------------------------------------------------- | ------------- |
| 持有者          | 全部有效段（他就是单支路的尾巴，后面本来没有内容） | 全部          |
| 唱过的人        | 到**自己的最高段号**为止（含自己；被斩过也算）     | 全部          |
| 陌生人 / 未登录 | **一段都看不到**（`segments: []`）                 | 全部          |

- 三条读取路径**同时**受同一判据约束：`GET /api/bottles/:id` 的 `segments`、`GET /api/bottles/:id/events`
  的漂流日志（事件里带 `actorId`，**更容易泄露「后面是谁」**，因此按「我的最后一次动作」为界裁剪），
  以及任何返回段的投影查询；
- `BottleDetailSchema` 新增 **`hiddenLaterSegmentCount`**：被裁掉的段数，供界面解释「不是丢了，是你看不到」
  （`0` = 未裁：持有者 / 已入海）；
- 进度类字段（`recordedCount` / `missingSegmentIndexes` / `isComplete`）**不裁**：它们描述结构与进度，
  不泄露「是谁 / 唱的什么」。

**通知：写入路径（t12 落地，`CONTEXT.md` §5.2 / §9.2）**

通知是**领域事件的投影**（与事件同一事务，写在 `apps/api/src/store/notifications.ts`），
不是某条路由的副作用 —— 因此**系统触发**的终局（超时自动入海等）也自动覆盖。

| `type`                | 何时写                                               | 收件人                                                    | `payload` 关键字段                                             |
| --------------------- | ---------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| `MESSAGE_DELIVERED`   | 全链回传后入海，留言由 PENDING 转 DELIVERED          | **发起者**（留言接收者）                                  | `bottleId`、`messageId`                                        |
| `MESSAGE_UNDELIVERED` | 中途入海 / 回传链断（作品损坏），留言永远送不到      | **发送者**（「你的留言未送达」§5.2）                      | `bottleId`、`messageId`                                        |
| `BOTTLE_COMPLETED`    | 作品**完整**并入海（完整性由内核 `isComplete` 判定） | **所有参与者**（发起者 + 每位唱过的人，含被斩浪者 §16.7） | `bottleId`、`songTitle`、`isComplete`、`missingSegmentIndexes` |

两条口径（都有真库集成测试钉住）：

1. **留言在 PENDING 期间不发通知** —— 留言此时对发起者不可见（§5.1），提前通知等于泄露未公开内容；
2. **未完成作品进公海（「等待接力」区）不发 `BOTTLE_COMPLETED`** —— 那时说"已完成"是撒谎；
   完整性由**内核**判定（读事件流 + `replayBottle` + `isComplete`），投影层不数段数、不重写规则。

`type` 在契约里是自由字符串（`NotificationSchema.type`），展示层必须对未知类型兜底，不得把码当文案。

**已听覆盖率：服务端持久化 + 点踩门槛由服务端判定（t20）**

- `POST /api/segments/:id/listen`：前端在播放过程中**周期性**上报 `coveredMs`（客户端 `ListenTracker`
  的"听过区间并集"）。**增量输入**，判定权在服务端；只带 `coveredMs` —— **时长以服务端段行为准**
  （`bottle_segments.duration_ms`，上传时校验写入；采信请求体里的时长等于允许伪造 100%）。
- 服务端**只增不减**地记账（表 `listen_progress(user_id, segment_id)`，跨会话/跨重启保留 ⇒"退出再回来不清零"）。
- **单次上报不能把覆盖率抬高**：首次上报最多记 `时长 × 0.5`，之后每次最多按
  `距上次上报的真实耗时 × 1.25 + 3s` 增长 ⇒ 想跨过门槛必须**真的等够时间**；正常周期上报（按 1× 实时速率）
  永远不会被夹。阈值取内核 `DEFAULT_POLICY.dislikeListenRatioThreshold`（不写死）。
- 点踩判定读**库里的覆盖率**：不足 → `422` + 稳定码 **`LISTEN_THRESHOLD_NOT_REACHED`**（中文原因带百分比，
  客户端据此弹「需要听满 80%」的提醒）；`CastVoteRequest.listenedRatio` **已废弃且被忽略**（保留为可选字段，仅为兼容旧客户端）。
- 覆盖率语义（区间并集、拖动不计、循环不叠加、时长不可信 → 0）**只有一份实现**：
  `packages/shared/src/audio/listening.ts`（客户端 `ListenTracker` 与服务端 `listenedRatio`/`canDislike`）。

**⚠️ 已接受的行为（captain 裁决 2026-09-23，勿当 bug 修）**
点赞与点踩是**两个独立的票**：同一用户可以对同一段**分别投一赞一踩**（唯一键 `(segment_id, user_id, value)`）。
点赞不抵消点踩、不提高斩杀阈值（CONTEXT §7.1）；点踩照常计入斩杀阈值，且必须听满 80%
（`listenedRatio >= 0.8`，服务端校验而非信前端）。若要改成「一人一段总共一票」，必须先改领域内核 → 返工单。

### 2.7 音频：分段播放与上传校验（t7 落地）

**播放端点（t7 已实现并有集成测试）**

| 方法     | 路径                      | 请求               | 响应                                                                                                        |
| -------- | ------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| GET/HEAD | `/api/segments/:id/audio` | `Range` 头（可选） | `200` 全量｜`206` + `Content-Range`｜`416` + `Content-Range: bytes */size`｜`404`（段不存在或该段没有音频） |

- 响应头：`Accept-Ranges: bytes`、`Content-Type` = 库里存的 `audio_mime`、`Cache-Control: private, no-store`。
- `Range` 语法非法（单位不对、`start > end`、多段）→ **忽略该头**返回 `200`（RFC 7233 "MAY ignore"）；合法但越界 → `416`。
  Safari 探测 moov 用的后缀请求（`bytes=-N`）有专门测试。
- 切片在 SQL 层完成（`substring(audio from $2 for $3)`，`bytea`），不把整段读进内存。
- **权限口径**：本 Demo 该端点匿名可读（`segmentId` 是 UUIDv4 不可枚举；"随机捞到就能听"是产品语义，CONTEXT §3.2）。
  账号级/持有者级收紧归 t9/t12（扩展点：注册路由前加 preHandler）。

**上传端点（路由归 t9；音频侧守门人已由 t7 提供）**

| 方法 | 路径                        | 请求                                                      | 响应                          |
| ---- | --------------------------- | --------------------------------------------------------- | ----------------------------- |
| POST | `/api/bottles/:id/segments` | multipart：`audio`（文件）+ `durationMs` + `note`（可选） | `RecordSegmentResponseSchema` |

服务端音频校验（`apps/api/src/audio/ingest.ts#validateSegmentAudioUpload`，与前端**共用同一套规则与中文文案**）：

| 顺序 | 检查                                                                  | 失败码                        |
| ---- | --------------------------------------------------------------------- | ----------------------------- |
| 1    | 有音频数据                                                            | `AUDIO_MISSING`               |
| 2    | MIME 白名单（`audio/webm` / `audio/mp4` / `audio/ogg` / `audio/wav`） | `AUDIO_FORMAT_UNSUPPORTED`    |
| 3    | 体积 ≤ 4 MB                                                           | `AUDIO_TOO_LARGE`             |
| 4    | 真实容器 = 声明容器（**魔数嗅探**，防"声明 webm 实传 mp4"）           | `AUDIO_CONTAINER_MISMATCH`    |
| 5    | 时长 15–30 秒（客户端上报值；默认必填，缺失即拒）                     | `AUDIO_DURATION_OUT_OF_RANGE` |

以上全部 `422`（`AUDIO_HTTP_STATUS`），一次报全、不逐条挤牙膏。

**音频错误码表（`AUDIO_RULE_CODES`，t7 新增，定义在 `packages/shared/src/audio/errors.ts`）**

| 码                            | 中文文案（面向用户）                                                      | HTTP |
| ----------------------------- | ------------------------------------------------------------------------- | ---- |
| `AUDIO_DURATION_OUT_OF_RANGE` | 每段录音需在 15–30 秒之间，请重新录制。                                   | 422  |
| `AUDIO_FORMAT_UNSUPPORTED`    | 这个音频格式不被支持（支持 webm / mp4 / ogg / wav），请用浏览器直接录制。 | 422  |
| `AUDIO_CONTAINER_MISMATCH`    | 音频文件内容与声明的格式不一致，请重新录制。                              | 422  |
| `AUDIO_TOO_LARGE`             | 录音文件超过体积上限，请重新录制。                                        | 422  |
| `AUDIO_MISSING`               | 没有收到音频数据，请重新录制。                                            | 422  |

> **与 §26.4（auth 用独立词表）的关系**：音频码与 auth 码不同——auth 错误只出现在 `/api/auth/*`（单一类别），
> 而音频码出现在**同一个漂流瓶上传端点**上，该端点还会返回领域码（`NOT_HOLDER` / `HOLDING_ALREADY_TAKEN`）。
> 若音频码另立词表，客户端就要按失败类型猜用哪套 envelope，因此这里把音频码并入 `RuleCodeSchema`
> （`contracts/common.ts`），使**一个端点只有一个错误形状**。此取舍已在 `docs/audio.md` §7 与 t7 回报中登记为待 captain 追认项。

⚠️ **残留风险（已记录，勿当 bug 修）**：服务端不解析容器时长（Chrome 的 webm 常不写 `Duration`），
"伪报时长"只能靠客户端诚实 + 体积上界约束。要真正堵住需服务端解码（属新依赖，须先按 AGENTS §7 登记）。

详见 `docs/audio.md`（容器协商、`https`/`localhost` 录音约束、80% 判定口径、页面接线示例）。

### 2.8 错误码总表（t9 落地后补齐）

**规则码 → 默认状态**（映射表在内核 `RULE_HTTP_STATUS`，路由用 `httpStatusOf`，**不自己判状态**）：

| 状态  | 码（`violations[].code`）                                                                                                                                                                                                                                                                                                                                                                                                                      | 语义                               |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `409` | `NOT_HOLDER`、`HOLDING_ALREADY_TAKEN`、`BOTTLE_NOT_IN_RIVER`、`NO_BOTTLE_AVAILABLE`                                                                                                                                                                                                                                                                                                                                                            | 并发/状态冲突（可重试）            |
| `422` | `NOT_INITIATOR`、`BOTTLE_DAMAGED`、`BOTTLE_ALREADY_COMPLETE`、`RESOLUTION_NOT_AVAILABLE`、`CANNOT_RECORD_TWICE_IN_BOTTLE`、`SEGMENT_NOT_FOUND`、`SEGMENT_ALREADY_CUT`、`CANNOT_DRAW_OWN_BOTTLE`、`ALREADY_SANG_IN_BOTTLE`、`DRAW_COOLDOWN_ACTIVE`、`DISLIKE_ALREADY_CAST`、`LIKE_ALREADY_CAST`、`CANNOT_DISLIKE_OWN_SEGMENT`、`LISTEN_RATIO_TOO_LOW`、`MESSAGE_SENDER_NOT_PARTICIPANT`、`MESSAGE_CONTENT_EMPTY`、`MESSAGE_BOTTLE_NOT_DRIFTING` | 规则违反（改了输入才能过）         |
| `422` | `API_RULE_CODES` = `COLLECTION_REQUIRES_FINISHED_WORK`                                                                                                                                                                                                                                                                                                                                                                                         | API 层功能码（客户端据此禁用按钮） |
| `422` | `AUDIO_RULE_CODES`（5 个，见 §2.7）与 `AUTH_ERROR_CODES`（6 个，见 §2.2）                                                                                                                                                                                                                                                                                                                                                                      | 音频/账号专用词表                  |

**传输层码 → 状态**（`apps/api/src/http/problem.ts` 的 `TRANSPORT_STATUS`，**envelope 里不带码**，靠状态区分）：

| 状态  | 码                | 何时                                                                          |
| ----- | ----------------- | ----------------------------------------------------------------------------- |
| `400` | `INVALID_BODY`    | body/query/params 结构不合法（zod 层拒绝；`violations: []`）                  |
| `401` | `UNAUTHENTICATED` | 无有效会话 cookie（含会话过期）                                               |
| `403` | `FORBIDDEN`       | 已登录但无权限（如非管理员读审核队列；**服务端判定**，前端藏按钮不算）        |
| `404` | `NOT_FOUND`       | 资源不存在 / 不属于当前视图（如不在公海的瓶子）                               |
| `501` | `NOT_IMPLEMENTED` | 本切片明确未实现（如审核决策端点，归属 t12）                                  |
| `500` | `INTERNAL`        | 未预期异常：**固定中文文案、不含任何内部信息**（表名/SQL/堆栈只进服务端日志） |

`ALL_API_ERROR_CODES = RULE_CODES ∪ AUDIO_RULE_CODES ∪ API_RULE_CODES ∪ TRANSPORT_ERROR_CODES` 的完整性由
`apps/api/src/http/problem.test.ts` 钉住（新增码不登记就会红）。

### 2.9 怎么复现（t9 验收口径）

```bash
docker compose up -d --wait                       # 集成测试需要 Postgres
pnpm --filter @music-drift/api test               # 单测（无需 DB）：路由挂载表、守卫、错误映射、契约
pnpm -r typecheck && pnpm lint                    # 类型与规范

# 集成：真库 + 真 cookie + 真字节（localStorage 无关，需要 DATABASE_URL）
export DATABASE_URL=postgres://music_drift:music_drift_dev@localhost:5433/music_drift
pnpm --filter @music-drift/api test:integration
```

- **端到端黄金路径**（真 HTTP + 真库 + 真音频字节，不需要浏览器）：

  ```bash
  node apps/web/tools/golden-path-live-check.mjs   # 27 步；自建可抛弃库 + 自空闲端口起 API，跑完删库
  ```

  **⚠️ 验收证据只认 hermetic 模式**（即上面这条命令，不带 `API_BASE`）。显式给 `API_BASE` 会走"外部模式"：
  跑在别人的库上、河道里有别人的瓶子 ⇒ 结论受环境运气影响，**不能写进验收口径**（脚本会在输出最前面
  打醒目横幅，并把非确定性步骤单列成「未复现（数据不受控）」、不计入 pass）。

- 集成测试每次跑在**独立库** `music_drift_test_<epoch>_<pid>_<rand>`（先迁再跑，结束后删除；>30 分钟的残留库会被清）。
- 路由族契约（每个模块都必须 `app.*` 注册 + 有错误路径时 import `problem.ts`）由 `src/routes/{mounted,guard}.test.ts` 静态强制。

## 3. 与持久化的对应（t5）

| 不变量                   | 落点                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 同瓶同时至多一个持有者   | `holdings` 部分唯一索引 `(bottle_id) WHERE released_at IS NULL` + 抢占 `INSERT … ON CONFLICT (bottle_id) WHERE released_at IS NULL DO NOTHING RETURNING id`   |
| **斩浪必须释放 holding** | `BOTTLE_GAP_OPENED` / `BOTTLE_DAMAGED` / `BOTTLE_WENT_TO_SEA` / `BOTTLE_CAST_TO_RIVER` / `BOTTLE_PUT_BACK` 对应 DB 操作都释放；否则「斩浪后陌生人捞不到瓶子」 |
| 补位段占据缺口段号       | `bottle_segments` 部分唯一索引 `(bottle_id, index) WHERE deleted_at IS NULL`                                                                                  |
| 段号范围                 | 写入侧校验 `index ∈ 1..bottles.total_segments`（`total_segments` 是列，不硬编码 4）                                                                           |
| 事件流可重放             | `events` 唯一 `(bottle_id, seq)`；`CHECK (seq > 1 OR type = 'BOTTLE_CREATED')`；`replayBottle` 依赖首条为 `BOTTLE_CREATED`                                    |
| 系统行为不是人           | `bottles.current_caster_id` / `events.actor_id` 用 `text` 且**不加 users 外键**（允许哨兵 `'SYSTEM'`）                                                        |
| 徽章                     | **不落库**（ADR-014 裁决 #1：派生判定）                                                                                                                       |

### 3.1 已知未做项（承接 t5 登记，t9 复核）

| 项                                     | 现状与归属                                                                                                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §5.2「C 会收到通知：你的留言未送达」   | **写路径尚不存在**：全仓无 `insert into notifications`（仅 t9 只读 API + 集成测试夹具）。归属 t12（plan.md 切片 5「通知」）。t9 已把留言的 `UNDELIVERED` 状态与可见性钉住（`interactions.integration.test.ts`） |
| 响应体是否有全局 schema 校验           | 目前只有**测试**用契约校验响应（`BottleSummarySchema.parse`）；运行时无 `setSerializerCompiler`/响应 schema。是否全局启用待 captain 裁决（成本：每响应一次校验）                                                |
| `GET /api/segments/:id/audio` 匿名可读 | t7 口径，见 §2.7；账号级收紧归 t12                                                                                                                                                                              |

## 4. 变更记录

| 版本       | 变更                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0.2.0-s1` | **t20 已听覆盖率服务端化**：新增 `POST /api/segments/:id/listen`（`SubmitListenProgressRequestSchema` / `ListenProgressResponseSchema`）与表 `listen_progress`（只增不减、跨会话保留）；点踩门槛改读持久化覆盖率（阈值取内核策略），不足返回 `422 LISTEN_THRESHOLD_NOT_REACHED`；`CastVoteRequest.listenedRatio` 废弃为可选且被忽略，`CastVoteResponse` 新增服务端 `listenedRatio`；集成测试对真响应做 `Schema.parse`。既有字段零破坏（新增字段 + 可选化） |
| `0.2.0-s1` | **t19 追补（captain 裁决）**：live-check 增加**第 27 步** `GET /api/me/bottles` 端到端检查（覆盖 `role` / `mySegmentIndexes`，含"斩浪后仍算参与过、段号变空"）；外部模式改为**不可能被误当验收证据**（开头醒目横幅 + 非确定性步骤单列「未复现（数据不受控）」不计 pass + 本文 §2.9 写死「验收证据只认 hermetic 模式」）；全文步数口径同步为 **27 步**                                                                                                                                                                                                                                                                                                                                                                                                  |
| `0.2.0-s1` | **t19 可复现性修复**：新增 **`GET /api/me/bottles`**（`MyBottleSchema` / `MyBottleListSchema`，漂流日志 P0，替换 t11 的 localStorage 书签；契约只**新增**类型，既有字段形状零改动）；`apps/api` 的 `start` / `dev` 补上 `--env-file-if-exists=../../.env`（此前照 README 复制 .env 后起服务会走「未配置 DATABASE_URL」降级、`/api/songs` 404）；`golden-path-live-check.mjs` 改为**自建可抛弃库 + 自起 API**（hermetic），旧的"对着 dev 服务跑"只能靠 `API_BASE` 显式开启                                                                                                                                                                                                                                                                              |
| `0.2.0-s1` | **t12 §9.1/§9.2 可见性**：`BottleDetailSchema` 新增 `hiddenLaterSegmentCount`；详情与漂流日志按「漂流中不可见后续」裁剪（持有者 / 唱过的人 / 陌生人三态），入海后全部解锁。**未改既有字段形状**，契约版本不变。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `0.2.0-s1` | **t12 审核台裁决流转**：`POST /api/admin/reports/:id/decision` 由 `501` 换成真实流转（`NONE` / `REMOVE_SEGMENT` / `RESTORE_SEGMENT` / `REMOVE_BOTTLE` / `BAN_USER`）；`GET /api/admin/reports` 增加 `?status=`；新增 `API_RULE_CODES`：`REPORT_ALREADY_REVIEWED`、`REVIEW_ACTION_NOT_APPLICABLE`；新增契约 `ReportSchema` / `ReviewDecisionRequestSchema` / `ReportActionSchema` / `ReportStatusSchema`；DB：`users.banned_at`（迁移 0002）+ `reports.action` 允许 `RESTORE_SEGMENT`（迁移 0003）。**未改任何既有字段形状**，契约版本不变。                                                                                                                                                                                                            |
| `0.2.0-s1` | **t12 通知写入路径**：新增「通知：写入路径」小节（三类 `type` + 收件人口径 + 两条不发通知的边界）；`BOTTLE_DAMAGED`（回传链断）也会把 PENDING 留言终结为 `UNDELIVERED` 并通知发送者（t9 的投影只覆盖了 `BOTTLE_WENT_TO_SEA`）。**未改任何 zod 字段形状**，契约版本不变。                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `0.2.0-s1` | **t9 业务 API 落地**：§2.5 补齐 `POST /api/sea/:id/targeted-segment` 并改正 `/api/sea` 查询字段（`zone`/`limit`）与详情形状（`BottleSummarySchema`，非公海 → `404`）；§2.6 补齐 `notifications/:id/read`、`/api/me/badges`、`/api/me/collections`、`/api/admin/*`（决策端点显式 `501`）；新增 §2.8 错误码总表（规则码 → 409/422、传输码 → 400/401/403/404/501）+ §2.9 复现命令；§2.4 的录制端点由 `multipart` 改为**原始二进制**（ADR-018）。**未改任何 zod 字段形状**（`durationMs` 必填系 t7 已登记项；契约版本常量在代码里已是 `0.2.0-s1`，与本文件头部对齐）。**修复**：`toBottleSummary` 的 `songTitle` 曾写死空串，`GET /api/sea*` 返回违反契约（`min(1)`）的响应 —— 现由调用方必传曲名，并在集成测试里用 `BottleSummarySchema.parse` 校验真响应 |
| `0.1.0-s1` | **t7 音频链路**：新增 §2.7（`GET /api/segments/:id/audio` 的 Range 语义、上传校验五步表、`AUDIO_RULE_CODES` 5 个码）；`RuleCodeSchema` 并入音频码（理由见 §2.7 引注，**待 captain 追认**）；`RecordSegmentRequest.durationMs` 服务端默认要求（契约字段仍为可选，**是否改为必填待裁决**）。既有字段形状零改动（契约版本号未提升）                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `0.1.0-s1` | **t6 落地账号体系**：`/api/auth/{register,login,logout,me}` + `/api/me/anonymous-codes`；新增 `AUTH_ERROR_CODES`（6 个稳定码，`AuthErrorResponseSchema` 与 `ErrorResponseSchema` 同形）；§1 错误码口径改为 `RULE_CODES ∪ AUTH_ERROR_CODES`（captain 裁决 A 方案，`docs/architecture.md` §26.4）；登记「登录无限流」「注册可枚举」「会话有状态」三条已知未做项                                                                                                                                                                                                                                                                                                                                                                                          |
| `0.1.0-s1` | t5 建立：账号 / 曲库 / 瓶中流程 / 公海 / 互动全套契约；`RecordSegmentRequest` 不含 `index`；新增 `missingSegmentIndexes`、`isComplete`、`seaZone`、`replacementContext`、`availableResolutions`；`RuleCodeSchema` 复用内核 `RULE_CODES`；契约版本常量从 `contracts/health.ts` 迁到 `contracts/common.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `0.0.0-s0` | S0 仅 `/healthz`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
