# design.md — 架构决策记录（ADR）

> **本文即任务清单中的 `design.md`（架构决策记录）。**
> 落盘路径为 `docs/architecture.md`，因为本仓库根目录已存在视觉契约 `DESIGN.md`（大写），
> 而当前文件系统（Windows）**大小写不敏感**：`design.md` 与 `DESIGN.md` 是同一个文件。
> 因此禁止在根目录创建/写入 `design.md`（会覆盖视觉契约，属高危操作）。
> 本文档由 `architect` 维护；架构级改动 = 先改这里 + 上报 captain，再动代码。
>
> 文档分工：
>
> - 产品规则 → `CONTEXT.md`（本文不复制）
> - 视觉与 token → `DESIGN.md`（大写）
> - 架构与工程决策 → 本文
> - 计划与 DAG → `plan.md`
> - 流程纪律 → `AGENTS.md`

状态：S0（脚手架 + 决策记录）。最后校验：`pnpm -r typecheck` / `pnpm -r test` / `pnpm -r dev` / `pnpm --filter @music-drift/web build`（证据见 §9）。

---

## 1. 系统全景（拓扑）

```text
浏览器 A（账号1, localhost:5173）┐
浏览器 B（账号2, localhost:5173）┼─► apps/web (React19 + Vite, 静态 SPA)
                                 │        │  /api/*（vite dev proxy）
                                 │        ▼
                                 └─► apps/api (Fastify, :8787)
                                          ├─ 领域内核（纯函数，无 IO）  ← packages/shared/src/domain
                                          ├─ 契约（zod schema）        ← packages/shared/src/contracts
                                          ├─ 持久化适配层 / ORM        ← 待裁决（ADR-006）
                                          └─ 音频上传/下发

音频：浏览器端录制（MediaRecorder）→ 上传 → 存储（方案待裁决，见 D-02）
混音：浏览器端 OfflineAudioContext 优先（ADR-009）
```

分层与依赖方向（**只允许向下依赖**）：

```text
apps/web ──► packages/shared（contracts + domain 类型）
apps/api ──► packages/shared（domain 内核 + contracts）
packages/shared/src/domain ──► 无任何 IO 依赖（时钟/ID/随机源全部注入）
```

## 2. ADR-001 仓库形态：pnpm workspace monorepo，TS-first

- 目录：`apps/web`、`apps/api`、`packages/shared`。
- `packages/shared` 通过 `exports` **直接导出 TS 源码**（无构建步骤）：`"exports": { ".": "./src/index.ts" }`。
  - 消费方 vite（web）、tsx（api 运行时）、vitest（测试）都能直接消费 TS 源，省掉 watch-build 链路。
  - 代价：`apps/api` 生产产物形态（编译 vs tsx 直跑）留到部署阶段决定（ADR-011 / D-06），**不在 S0 范围**。
- 包名统一 `@music-drift/*`；包间引用一律 `workspace:*`。

## 3. ADR-002 TypeScript 配置：strict 拉满

- `tsconfig.base.json` 开启：`strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noImplicitOverride`、`noFallthroughCasesInSwitch`、`noUnusedLocals/Parameters`、`noPropertyAccessFromIndexSignature`、`verbatimModuleSyntax`、`isolatedModules`、`noEmit`、`skipLibCheck`。
- 模块解析：`module: ESNext` + `moduleResolution: bundler`（与 vite/vitest/tsx 一致），三个包均 `"type": "module"`。
- `types` 显式声明（web: `vite/client`；api: `node`），禁止隐式全局类型来源。
- **版本决策：TypeScript 5.9.3，而非 7.x**。理由：`typescript-eslint@8.70` 的 peer 范围是 `>=4.8.4 <6.1.0`，升到 7 会失去类型感知 lint。复核条件：typescript-eslint 支持 7.x 后重新评估（届时先改本 ADR）。
- 每包 `typecheck = tsc --noEmit`，根 `pnpm -r typecheck`。

## 4. ADR-003 依赖策略：单一版本来源 + 白名单

- 版本**只**写在 `pnpm-workspace.yaml` 的 `catalog`；`package.json` 一律用 `catalog:` 引用，禁止在包内写具体版本或 `^`。
- 已安装基线（S0 已锁版本）：

| 依赖                                                                            | 版本                                                | 归属         | 用途                 |
| ------------------------------------------------------------------------------- | --------------------------------------------------- | ------------ | -------------------- |
| react / react-dom                                                               | 19.3.0                                              | web          | UI 运行时            |
| vite                                                                            | 8.3.0                                               | web          | dev server / 构建    |
| @vitejs/plugin-react                                                            | 6.1.1                                               | web          | React 编译           |
| vitest                                                                          | 5.0.1                                               | 全部         | 单元测试（TDD 载体） |
| jsdom                                                                           | 30.1.1                                              | web          | 测试环境             |
| @testing-library/react / dom / jest-dom                                         | 16.3.3 / 10.4.2 / 7.0.1                             | web          | 组件测试             |
| fastify                                                                         | 5.12.5                                              | api          | HTTP 层              |
| zod                                                                             | 4.6.5                                               | shared / api | 契约与校验           |
| tsx                                                                             | 4.23.15                                             | api          | dev 运行时           |
| typescript                                                                      | 5.9.3                                               | 全部         | 类型检查             |
| eslint / @eslint/js / typescript-eslint / globals / react-hooks / react-refresh | 10.11.0 / 10.0.1 / 8.70.1 / 17.12.0 / 7.1.1 / 0.5.7 | 全部         | 静态检查             |
| prettier / eslint-config-prettier                                               | 3.9.8 / 10.1.8                                      | 全部         | 格式化               |
| @types/node                                                                     | 26.6.2                                              | api / shared | Node 类型            |
| drizzle-orm                                                                     | 0.45.3                                              | api          | ORM / 查询层（D-04） |
| pg                                                                              | 8.23.0                                              | api          | Postgres 驱动（node-postgres） |
| drizzle-kit                                                                     | 0.31.11                                             | api          | 迁移生成与执行（devDep） |
| @types/pg                                                                       | 8.23.1                                              | api          | `pg` 类型（devDep） |

- **预批准但尚未安装**（由对应任务 owner 在落地时加入 catalog，**不得**提前安装）：

| 依赖                                          | 归属任务 | 用途 / 前置条件                         |
| --------------------------------------------- | -------- | --------------------------------------- |
| tailwindcss@4 + @tailwindcss/vite             | T3.1     | 把 `DESIGN.md` token 映射为 theme       |
| ~~@tanstack/react-query~~                    | T3.2     | **已安装 5.103.2**（见下方 t11 引入记录） |
| lucide-react                                  | T3.1     | 唯一图标来源                            |
| lxgw-wenkai-webfont、@fontsource/quattrocento | T3.1     | 自托管字体（**禁 CDN**，jsDelivr 不通） |
| @playwright/test                              | T4.1     | E2E 与并发抢占验证                      |
| 口令哈希库（argon2id / bcrypt 实现）          | T1.3     | 需先按 D-03 裁决                        |
| ~~数据库驱动 / ORM / 迁移工具~~               | T1.2     | **已落地**：D-01/D-04 裁决为单一 Postgres + drizzle，见上表 |
| 音频存储 SDK（仅当选择对象存储时）            | T2.1     | 需先按 D-02 裁决                        |

- pnpm 11 安装脚本策略：`pnpm-workspace.yaml` → `allowBuilds: { esbuild: true }`（esbuild 是 vite/vitest 的原生二进制，必须放行）；其余依赖默认不允许执行安装脚本，新增放行需在汇报里说明理由。

**t11（T3.2）依赖引入记录**（前端黄金路径页面）：

| 依赖 | 版本 | 归属 | 用途 |
| --- | --- | --- | --- |
| `@tanstack/react-query` | 5.103.2 | web（运行时） | 服务器状态管理（唯一数据层）：契约响应缓存、失效与并发冲突后的重取；`retry` 策略只重试网络/5xx，**4xx 立即上抛**（409/422 必须变成可读界面，不许静默重试掩盖） |

**不引入的替代方案及理由**：
- **手写 `useState` + `useEffect` 取数**：需要自己实现缓存、去重、失效、竞态丢弃；多账号/多窗口演示里「并发 409 后重新拉取」正是最容易写错的部分。
- **`swr` / `redux-toolkit`**：能力重叠；前者缺缓存失效的细粒度控制，后者的服务端状态模型正是 query 已在做的事，且体积更大。
- **`react-router`（未引入）**：P0 只有 11 条路径，路由表 + History 监听约 80 行即可（见 `apps/web/src/pages/shell/routes.ts`），不为此增加中间件；若后续需要嵌套路由再按 AGENTS §7 走引入流程。

**t5（T1.2）依赖引入记录**（D-01 方案 A：自建 Fastify + 单一 Postgres、音频存 `bytea`；D-04：drizzle）：

| 依赖 | 版本 | 归属 | 用途 |
| --- | --- | --- | --- |
| `drizzle-orm` | 0.45.3 | api（运行时） | schema 声明与查询层（D-04） |
| `pg` | 8.23.0 | api（运行时） | Postgres 驱动；**并发抢占用原生 SQL**（`INSERT … ON CONFLICT DO NOTHING RETURNING`），不经过 ORM 抽象 |
| `drizzle-kit` | 0.31.11 | api（devDep） | 生成/执行迁移（`drizzle-kit generate` / `migrate`） |
| `@types/pg` | 8.23.1 | api（devDep） | `pg` 的类型 |

**不引入的替代方案及理由**：
- **Prisma**：重型 codegen + 自有 engine 二进制；且并发抢占处按 D-04 明确要求写原生 SQL，用 Prisma 会同时承担抽象成本与绕开抽象的成本，双重开销。
- **原生 `pg` + 手写迁移 SQL**：放弃 D-04 已裁决的 drizzle-kit，迁移幂等/回滚要靠人肉保证，与「迁移可重复执行」的验收直接冲突。
- **Supabase / 对象存储 / Redis / 队列**：D-01、D-02 已明确禁止（零 BaaS、零对象存储、音频进库）。
- **`postgres`（postgres.js）**：与 `pg` 能力重叠，`pg` 是 drizzle 的 node-postgres 驱动主线且类型更成熟；不引入第二个驱动。

## 5. ADR-004 契约策略：zod schema 是唯一真相

- 所有请求/响应/领域结构在 `packages/shared/src/contracts/**` 用 zod schema 定义，类型用 `z.infer` 推导，**禁止**手写重复 interface。
- 契约版本常量 `CONTRACT_VERSION`（当前 `0.0.0-s0`）；不兼容变更必须同时提升版本号并在 `docs/api.md` 留变更记录。
- 运行期必须校验：api 出参用 `Schema.parse` 包裹（S0 已在 `/healthz` 示范），入参在路由层校验。
- 错误语义骨架（T1.2 / T1.3 / T2.3 落地）：
  - `409` = 并发或状态冲突（例如同一瓶子被并发抢占）；
  - `422` + 稳定错误码 = 规则违反（例如末段不可继续投河）；
  - `401` / `403` = 未登录 / 无权限；
  - 错误码是稳定字符串枚举，**码与文案分离**（码给程序判断，中文文案给用户）。
- `docs/api.md` 由 T1.2 建立、T1.3 与 T2.3 持续更新；是否由 zod 自动生成 OpenAPI 见 D-12。

## 6. ADR-005 领域内核与状态机草案（草案，T1.1 落地）

内核位置：`packages/shared/src/domain/**`。**无 IO**：不碰数据库、网络、`Date.now()`、`Math.random()`；一切外部输入（时钟、ID、随机源）依赖注入。这样规则可被纯单测覆盖，也把"换数据库"的成本限制在适配层（配合 ADR-006）。

状态集合（瓶子维度的宏观状态）：

| 状态       | 含义                                           | 出口                                                       |
| ---------- | ---------------------------------------------- | ---------------------------------------------------------- |
| `DRAFT`    | 发起者正在录第 1 段，尚未投河                  | 投河 → `IN_RIVER`                                          |
| `IN_RIVER` | 在河道等待随机捞取（含"放回海中"后的重新等待） | 被捞取 → `HELD`；72h 无人接 → 见 D-13                      |
| `HELD`     | 某用户持有并需做决定                           | 继续投河 → `IN_RIVER`；回传 → `HELD(parent)`；入海 → `SEA` |
| `SEA`      | 已入海（公海）                                 | 未完成时可被"指定接唱" → `HELD`；已完成即终态              |
| `DAMAGED`  | 中间段被斩导致链路断裂                         | 终态或退回最近有效节点，见 D-14                            |

触发事件（内核对外暴露的命令）：`createBottle`、`castToRiver`、`drawFromRiver`、`putBack`、`recordSegment`、`chooseResolution(RIVER|RETURN|SEA)`、`requestTargetedSegment`、`like`、`dislike`、`report`、`attachPrivateMessage`、`applyDecay(clock)`。

守卫（guard）命名规范：`can<Action>`，返回 `RuleViolation[]`（含稳定错误码），**不抛异常、不返回裸布尔**——API 层据此映射 409 / 422。规则内容**以 `CONTEXT.md` §3/§4/§7/§15/§16 为准**；本文只固定"规则怎么表达"，不重述"规则是什么"。

不变式（内核必须保证，测试逐条覆盖）：

1. 一个瓶子同一时刻至多一个持有者（并发抢占只允许一个成功）。
2. 段是独立实体（独立 ID），可被单独评价与举报。
3. 任何状态转移都可由事件序列重放（事件日志是权威历史，派生状态可重建）。
4. 所有时间判定走注入时钟，代码中不存在隐式时间源。

## 7. ADR-006 数据模型草案（T1.2 落地，引擎待裁决）

引擎**未定**（见 D-01），因此数据模型按"可移植的关系模型"描述，不绑定具体方言；领域内核（ADR-005）不感知存储，切换引擎只影响适配层与迁移脚本。

表草案（字段是意图描述，最终以 T1.2 的迁移脚本为准）：

| 表                | 关键字段                                                                             | 关键约束 / 意图                                                                              |
| ----------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `users`           | id, handle, email, password_hash, created_at                                         | handle / email 唯一                                                                          |
| `songs`           | id, title, total_segments, licensed_source                                           | 曲库授权来源可追溯（T3.4）                                                                   |
| `song_segments`   | id, song_id, index, start_ms, duration_ms, accompaniment_ref                         | `(song_id, index)` 唯一；分段元数据                                                          |
| `bottles`         | id, song_id, initiator_id, status, current_holder_id, created_at, updated_at         | `status` 对应 ADR-005 状态；持有者唯一性由 `holdings` 保证                                   |
| `bottle_segments` | id, bottle_id, owner_id, index, audio_ref, duration_ms, note, created_at, deleted_at | 段独立 ID；`deleted_at` 支撑斩浪后的"不留遗迹"                                               |
| `holdings`        | id, bottle_id, holder_id, acquired_at, released_at, version                          | **并发原语**：同一 bottle 同一时刻至多一条未释放行（唯一索引 + 事务/行锁）                   |
| `votes`           | id, target_type, target_id, user_id, value, listened_ratio, created_at               | `(target_type,target_id,user_id,value)` 唯一 = 一人一票；`listened_ratio` 支撑"听满 80%"门槛 |
| `reports`         | id, target_type, target_id, reporter_id, reason, status, reviewed_by, decision       | 人工审核队列与最终决定权                                                                     |
| `messages`        | id, bottle_id, from_user_id, to_user_id, content, delivery_status                    | 私密留言送达状态（送达 / 未送达）                                                            |
| `badges`          | id, user_id, bottle_id, kind, granted_at                                             | 大 / 小徽章                                                                                  |
| `events`          | id, bottle_id, actor_id, type, payload, occurred_at                                  | 漂流日志与状态重放的唯一来源                                                                 |
| `collections`     | id, user_id, bottle_id, created_at                                                   | `(user_id,bottle_id)` 唯一；对象仅限已完成公海作品                                           |
| `notifications`   | id, user_id, type, payload, read_at, created_at                                      | 站内通知；站外推送不在 S0–S1 范围                                                            |
| `sessions`        | id, user_id, token_hash, expires_at, created_at                                      | 会话保持（httpOnly cookie 的载体）                                                           |
| `anon_codes`      | id, user_id, bottle_id, code                                                         | 同用户在不同瓶子显示不同代号 ⇒ 唯一键 `(user_id, bottle_id)`                                 |

通用约定：

- 主键用 UUID / ULID（避免自增 ID 泄漏业务规模）；时间戳统一 UTC ISO8601。
- 软删除只用于 `bottle_segments`（斩浪），其余走硬删除 + 审计事件。
- 迁移脚本必须**幂等**（可重复执行），并提供种子数据（≥3 首歌 × 4 段占位）。

## 8. ADR-007 ~ ADR-011 其余决策（摘要）

- **ADR-007 音频存储**：位置**待裁决**（D-02）。接口先行：`AudioStore.put/get/stat`；上传前校验时长 15–30s 与格式（webm/opus 优先，Safari mp4 兜底）。
- **ADR-008 认证**：会话用 httpOnly + SameSite cookie（不引入无状态 JWT，便于登出与吊销）；口令哈希算法**待裁决**（D-03）。响应体与日志禁止出现口令 / 会话令牌。
- **ADR-009 音频链路**：录制用 `MediaRecorder`；混音优先浏览器端 `OfflineAudioContext`（4 段人声 + 伴奏对齐）。若实测对齐误差不可接受，**必须报 captain** 才可切服务端 ffmpeg（D-05）。
- **ADR-010 前端数据层**：服务器状态用 TanStack Query（T3.2），本地 UI 状态用 React 原生；乐观更新仅用于可回滚操作；`409` 必须转成用户可读中文文案，禁止静默失败。
- **ADR-011 测试策略**：Vitest 单测（shared = 领域内核；api = 路由集成 + 并发；web = 组件）；Playwright E2E 属 T4.1，覆盖黄金路径与并发抢占。S0 占位测试只证明链路可跑，**不是**产品行为的验收依据。

## 9. 本地开发拓扑与 S0 证据

| 命令                                   | 作用                             |
| -------------------------------------- | -------------------------------- |
| `pnpm install`                         | 按 catalog 安装                  |
| `pnpm -r dev`                          | 并行启动 web(:5173) + api(:8787) |
| `pnpm -r test`                         | 全量单测                         |
| `pnpm -r typecheck`                    | 全量类型检查                     |
| `pnpm lint` / `pnpm format`            | 静态检查 / 格式化                |
| `pnpm --filter @music-drift/web build` | web 生产构建（部署前置）         |

S0 实际执行证据（原始输出摘要）：

```text
pnpm -r typecheck   → shared / api / web 三包 tsc --noEmit 全部 Done
pnpm -r test        → shared 2 passed, api 1 passed, web 1 passed（3 包 4 测试全绿）
pnpm -r dev         → api: Server listening at http://127.0.0.1:8787
                      web: VITE v8.3.0 ready → http://localhost:5173/
                      curl /healthz → {"status":"ok","service":"api","contractVersion":"0.0.0-s0"}
pnpm --filter @music-drift/web build → built in 88ms（dist/index.html + assets/index-*.js）
pnpm lint           → 0 problems
pnpm format:check   → All matched files use Prettier code style!
```

已知约束：

- vite dev server 绑定 `localhost`，在 Windows 上解析为 `[::1]`；用 `http://127.0.0.1:5173` 会连不上 —— 统一用 `http://localhost:5173`。
- 录音（`getUserMedia`）只在 `https://` 或 `localhost` 下可用；局域网 IP / http 域名访问时录不了音（浏览器策略）。
- 根目录**不能**出现小写 `design.md`（见文首警告）。

## 10. 待裁决项清单（**谁都不能自行拍板**）

| ID   | 待裁决                        | 候选                                                                  | 阻塞                  | 收口                  |
| ---- | ----------------------------- | --------------------------------------------------------------------- | --------------------- | --------------------- |
| D-01 | ✅ 已裁决 | **已裁决：方案 A** — 自建 Fastify + **单一 Postgres（音频以 bytea 存库）**。零对象存储、零 BaaS、零 Redis。本地开发库 = **Docker Postgres**（docker compose，需先启动 Docker Desktop）；线上用托管 PG（Neon/Supabase/Render，随 D-06）。并发抢占用 SELECT ... FOR UPDATE。 | T1.2 及全部持久化工作 | 用户 2026-09-23 |
| D-02 | ✅ 已裁决 | **已裁决：库内 bytea**（随 D-01）。Fastify 提供带 HTTP Range 的流式播放端点；不引对象存储 SDK。规模核算：20s opus ≈ 60–120KB，一瓶 4 段 ≈ 400KB，100 瓶 ≈ 40MB。 | T2.1 上传链路 | 用户 2026-09-23 |
| D-03 | ✅ 已裁决 | node:crypto scrypt (N=2^15, r=8, p=1, 32B salt) + 自建 sessions 表：opaque 256-bit token，库内存 SHA-256 哈希，cookie httpOnly + SameSite=Lax（线上加 Secure）；不引认证库 | T1.3 | captain 2026-09-23 |
| D-04 | ✅ 已裁决 | drizzle-orm + drizzle-kit（dialect 随 D-01）；并发抢占处允许直接写原生 SQL，不为之引入 query builder 抽象 | T1.2（随 D-01） | captain 2026-09-23 |
| D-05 | ✅ 已裁决 | 浏览器端 OfflineAudioContext。客观验收：段落起拍对齐误差 ≤120ms；主观验收：4 段人声 + 伴奏导出后盲听无节拍错位。两项任一不达标才允许提案 ffmpeg（须附实测证据） | T2.2 | captain 2026-09-23 |
| D-06 | 部署平台                      | Render 静态站 + Web Service + 托管 PG / 本机 + cpolar 隧道            | T4.3（仅用户下令后）  | captain + 用户        |
| D-07 | 曲库来源与授权                | 用户提供音频（当前唯一合法路径）                                      | T3.4                  | 用户                  |
| D-08 | ✅ 已裁决 | **Figma 仅作 IA / 信息架构 / 文案参考，视觉一律以 DESIGN.md 为准**（用户 2026-09-23）。Figma 12 帧全为 1440 桌面稿、深色霓虹风格，与 DESIGN.md（浅色海洋 / 饱和≤80% / 禁外发光 / 霞鹜文楷）互斥；用户裁决不复刻其视觉。URL 与帧清单已交付 T0.3。 | T0.3、全部前端视觉 | 用户 2026-09-23 |
| D-09 | ✅ 已裁决 | TanStack Query 为唯一服务端状态层；不引全局 store（无 Redux/Zustand），局部 UI 状态用 React useState | T3.2 | captain 2026-09-23 |
| D-10 | ✅ 已裁决 | Chromium + WebKit 双必须。Safari 的 mp4 录音降级路径必须有自动化覆盖，不接受只测 Chromium | T4.1 | captain 2026-09-23 |
| D-11 | ✅ 已裁决 | 字体子集化：用 pyftsubset（本机 Python 3.13 可用，属构建期工具、不进运行时依赖）按实际字符集产出 woff2，font-display: swap；禁 CDN | T3.1 | captain 2026-09-23 |
| D-12 | ✅ 已裁决 | 手写 docs/api.md，内容由 zod 契约派生；不引 OpenAPI 生成工具（YAGNI）。契约不兼容变更必须同时提升 CONTRACT_VERSION 并更新该文档 | T1.2、T2.3 | captain 2026-09-23 |
| D-13 | ✅ 已裁决 | **已裁决：自动入海**。72h 无人在接唱 → 自动入海，进公海「未完成作品」区等待指定接唱（与「公海是唯一终点、发起者没有私藏权」一致）。内核须保留可注入策略参数，便于日后翻转。 | T1.1（内核） | 用户 2026-09-23 |
| D-14 | ✅ 已裁决 | **已裁决：退回最近有效节点继续漂流**（用户选定，非 captain 推荐项）。精确语义与父链重接规则见 ADR-013（captain 定义，待用户追认）。内核须保留 damagePolicy 参数。 | T1.1（内核） | 用户 2026-09-23 |

处理规则：裁决结果由 captain 写回本表（把"待裁决"改为"已裁决：结论 + 日期"）；worker 不自行改写结论。未裁决项一律按"接口先行、实现留空"处理（定义接口与类型，不写具体实现）。


## 11. ADR-013 断链回退语义（D-14 落地定义）

> 用户裁决 D-14 = 「退回最近有效节点继续漂流」。CONTEXT.md §7.4 原文只说「不再继续漂流，或退回最近有效节点」，
> 未定义"最近有效节点"与父链如何重接。以下是 captain 给出的可实施定义，**待用户追认**。

定义：

1. 段被斩（斩杀阈值达成）→ 该段从作品中移除，不保留遗迹（CONTEXT.md §7.4）。
2. 回退目标 = **被斩段的直接前驱段（parent segment）的接唱者**。若被斩段是第 1 段，回退目标 = 发起者。
3. 回退后该持有者**重新进入去向选择**（继续投河 / 回传 / 入海），状态回到 `HELD`。
4. 被斩段**之后**已存在的段保持有效（Demo 采用按段序接唱，不依赖严格的音频连续性），并**重接父链**：
   被斩段的子段，其 parent 改为回退目标。理由：父链必须保持单链可达，否则回传会走进死节点。
5. 若作品已 `SEA` 且其中有段被斩 → 从公海撤下，状态回退为漂流中（`HELD`），并由第 2 条确定持有者。
6. 若被斩后只剩发起者的第 1 段 → 回到发起者（`DRAFT`/`IN_RIVER`），由发起者重新决定投河。
7. 跨越被斩段的所有参与者仍保留参与记录，但**不获得小徽章**（小徽章只给最终版本中仍存在的段）。

不变式补强：任何时刻，作品的 segment 序列必须是一条从发起者出发的单链，且 `segments.length >= 1`。

## 12. 视觉基线与目标端（用户 2026-09-23 终裁，取代此前一切说法）

### 12.1 视觉：DESIGN.md 胜出，Figma 只贡献 IA 与文案

用户裁决：**Figma 仅作 IA / 信息架构 / 文案参考，视觉一律以 `DESIGN.md` 为准。**

- **不复刻** Figma 的深色霓虹视觉：底色、主色、饱和度、外发光、字体一律按 `DESIGN.md`。
  （Figma 实为近黑底 + 霓虹青 `≈#00E5D0` + 洋红热粉 `≈#FF3D8B` + 泛光 + 无衬线黑体；
  与 DESIGN.md 的恒浅底 `wave-white`、饱和 ≤80%、`No outer glows`、霞鹜文楷 直接冲突。）
- **采纳** Figma 的内容层：
  1. 信息架构与区块层级（侧边栏导航四入口：河道 / 公海 / 我的 / 设置）；
  2. 页面流转（见 12.3 帧清单）；
  3. **文案**（已确认高质量、无 AI 陈词，直接复用，例如「拾起那些搁浅在黑夜里的声线」「我把微风折叠进信封，寄给远方不知名的来客」「录音棚环境已就绪」）；
  4. 交互元素与状态（波形、输入音量、录音计时、心情标签组、证书面板）。
- 因此 `docs/figma/CONFLICTS.md` 的定位改变：**不再是"待用户 grill 的冲突清单"，而是"已裁决的记录"** ——
  逐条列出 Figma 与 DESIGN.md 的差异并统一标注「已裁决：DESIGN.md 胜出」。不再需要逐条向用户请示。
- 注意：DESIGN.md 的 `Light/Dark: ✓ Full / ✗ No` 与「深水暗底仅用于沉浸式区块，不是深色模式」约束**保持不变**。
  Figma 的整站深色**不得**作为采纳依据；但 `home-river` / `public-sea` 的深色氛围可作为「沉浸式区块」的选题参考。

### 12.2 目标端：桌面为主要场景 + 移动端可用性适配

用户终裁（**取代**先前的"移动与桌面等权重"）：

- **桌面 = 主要评审与设计场景**，IA 与布局参照 Figma 的 1440 帧。
- **移动端 = 可用性适配**，不追求移动稿级打磨。硬性底线必须满足：
  1. 无横向溢出；
  2. 触控目标 ≥44px；
  3. **录音在移动端可用**（`getUserMedia` + 权限被拒的降级引导）；
  4. 关键闭环（捞取 → 接唱 → 去向选择 → 试听）在 375px 可完成，不出现遮挡或不可点。
- Design.md 的断点纪律（768px 以下多列折叠为单列）**保留**。
- ⚠️ 需 `frontend-ds` 在 T3.1 amend `DESIGN.md` 的 Use Case 行：由「移动优先 H5 应用」改为
  「桌面为主要场景的 Web 应用，移动端做可用性适配（H5 可用）」；其余 token 与纪律不动。
- ⚠️ 需 `frontend-flow` 在 T3.2/T3.3 双端验证：1440（照 Figma IA）与 375（可用性底线）。

### 12.3 Figma 帧清单（fileKey `epsix0MBOq2Iv8cCASg9qK`，page `Page 2` #3:2）

| frame | node id | 尺寸 | 用途 |
| --- | --- | --- | --- |
| login-anonymous | #4:8 | 1440×900 | 登录（匿名） |
| home-river | #4:43 | 1440×900 | 暖流河道首页 |
| bottle-detail | #4:223 | 1440×900 | 瓶子详情 |
| relay-recording | #4:374 | 1440×900 | 接力录制 |
| destination-modal | #4:478 | 1440×900 | 去向三选一 |
| public-sea | #4:675 | 1440×1100 | 公海 |
| public-sea-detail | #4:966 | 1440×1200 | 公海详情 |
| tracking-reveal | #4:1204 | 1440×1100 | 追踪揭晓（§9.2） |
| profile-center | #4:1312 | 1440×900 | 个人中心 |
| report-modal | #4:1426 | 1440×900 | 举报（§8） |
| admin-dashboard | #4:1530 | 1440×900 | 管理员审核台（§8.3） |
| certificate-panel | #63:32 | 420×515 | 公海证书（§12.2） |

### 12.4 环境风险记录：api.figma.com 单 IP 黑洞

`api.figma.com` 解析到 4 个 CloudFront IP，其中 `65.9.168.94` 在本机被黑洞
（TCP 三次握手成功、**TLS 握手卡死**），Node/undici 优先选中它 → `figma_*` MCP 工具全部 `fetch failed`。
已在 `C:\Windows\System32\drivers\etc\hosts` 固定 `65.9.168.58 api.figma.com`（备份 `/tmp/hosts.bak.*`）。
**撤销方法**：删除 hosts 中该行。若日后 Figma 再次 `fetch failed`，先怀疑这个 IP 是否也失效，换其余三个之一。


## 13. ADR-014 领域内核落地状态与语义裁决（T1.1 / t4 收口）

`packages/shared/src/domain/` 已落地：29 个文件（15 模块 + 12 测试文件）、3419 行、93 个测试全绿。

### 13.1 已落地结构（t5 / t9 的唯一消费面）

- 命令与守卫：`createBottle` / `recordSegment` / `drawBottle` / `claimBottle` / `putBack` / `chooseResolution`
  + `can<Action>` 守卫，统一返回 `RuleViolation[]`（21 个稳定 `RuleCode` + 中文文案 + `409/422` 映射）。
- 状态转移唯一路径：`reduceBottle`（14 种 `DomainEvent`）+ `replayBottle`（事件重放等价，已测）。
- 端口（`ports.ts`）：`Clock` / `IdGenerator` / `RandomSource`；**全仓唯一 `Date.now()` 在 `createSystemClock()`**。
- 纯函数 | 拒绝语义：`CommandOutcome` 在被拒时 `state` 为原引用、`events` 为空 —— **零副作用可被断言**。
- `HoldingRegistry` 端口 + 进程内实现（t5 用 DB 唯一索引落实现）。

### 13.2 已落地的裁决

- **D-13 = `'SEA'`**（唯一出口常量 `DEFAULT_RIVER_TIMEOUT_OUTCOME`）；72h 无人接唱 → 自动入海。
- **D-14 = `'REWIND_TO_LAST_VALID'`**（唯一出口常量 `DEFAULT_DAMAGE_POLICY`）；ADR-013 的 7 条规则逐条有具名测试，
  另有不变式测试「单链 + 段号连续 + 至少 1 段」逐步断言。`TERMINAL` 作为备选策略保留且可注入。

### 13.3 captain 对 6 项待裁决的裁决（用户已授权的职责范围内）

| # | 议题 | 裁决 | 理由 |
| --- | --- | --- | --- |
| 1 | 作品被从公海撤下后，大徽章是否撤回 | **保持派生、不落库（徽章会随之消失）** | 免新表免同步；与 ADR-013「回退即未定稿」哲学一致。**但 t12 硬约束**：通知文案不得在作品可能被撤下时宣称"已获得徽章"，否则会出现「通知说得了、进去发现没有」的体验 bug |
| 2 | 段号复用（历史软删行与补位段共用段号） | **保持** | 段号语义是"作品中的位置"；被斩位置应由后补段占据（CONTEXT §7.4）。给历史行改号会造成漂移与审计困难 |
| 3 | `RETURN_TO_OWNER`（D-13 备选）走 `BOTTLE_REWOUND`、不发大徽章 | **同意** | 大徽章要求"回传完成"= 人工沿父链上移；系统超时退回不是"回传完成" |
| 4 | 48h 决策时限覆盖 `RETURN` 与 `REWIND`，`DRAW` 不覆盖 | **同意**（属对 CONTEXT §11.3 的合理扩展，已记录） | §11.3 只写了回传决策 48h；但 REWIND 后若无人决策会**永久卡死**，与 72h 规则要解决的是同一问题。`DRAW` 刚捞到就超时不合理 |
| 5 | 作者可给自己的段点赞（仅禁止自踩） | **保持**（显式记录为有意决定，非遗漏） | §7.3 只禁自踩，因为自踩会操纵斩杀阈值；点赞与斩杀解耦、不影响任何机制，自赞的危害仅为热度虚荣，不值得新增一条规则与测试。**记录在此以防日后被当 bug 修掉** |
| 6 | `@types/node` 进 `packages/shared` 的 devDeps | **同意保留** | 仅测试用（`noIoGuard` 读源码做零 IO 扫描），**不进运行时**；该测试是防止架构退化的高价值守卫。须在本文「依赖基线」登记用途与归属 |

### 13.4 t5 交接要点（backend-api 必读）

1. `bottle_segments` 需**部分唯一索引** `(bottle_id, index) WHERE deleted_at IS NULL`（被斩行软删除保留以做审计，补位段复用同段号）。
2. `holdings` 需**部分唯一约束** `(bottle_id) WHERE released_at IS NULL`，以此落实现 `HoldingRegistry` 端口。
3. `events` 表首条必须是 `BOTTLE_CREATED`（`replayBottle` 依赖）。
4. 时间戳统一走 `createSystemClock()`；**API 层禁止另写 `Date.now()`**。


## 14. 阶段化音频管线（用户 2026-09-23 裁决）

用户裁决：**曲库最后提供；当前实现「纯人声合成、无伴奏」，拿到曲库后再优化回带伴奏的决策。**

- **阶段一（现在）**：纯人声。成品 = 按段号顺序拼接各段人声，无伴奏轨道。
  验收：拼接顺序正确、无重复段、无缺段。
- **阶段二（用户交付曲库后）**：叠加伴奏，按**歌的固定段落时间轴**对齐。
  此时段号是时间轴的锚，§15 的缺口设计是阶段二能否成立的前提。
- 因此 `T2.2`「混音与成品导出」按阶段一实现；`T3.4`「伴奏曲库接入」保持阻塞等用户。
  **不允许**在阶段一用自制素材占位伴奏（用户明确要求）。

## 15. 斩浪缺口补位：对当前实现的 review 结论（待用户裁决）

用户 2026-09-23 指出：**斩浪的目的是防捣乱；斩浪后会出现「空白接唱区域」，必须被解决（即「退回」要解决的事）。**

### 15.1 captain review 结论：当前实现**没有**解决空白接唱区域

当前实现做的是**把空洞「压掉」而不是「补上」**：

| 证据 | 位置 | 行为 |
| --- | --- | --- |
| 斩浪后重排段号 | `domain/events.ts:262-269`（`index: position + 1`） | 剩余有效段被压缩成连续段号 |
| 新段永远追加末尾 | `domain/queries.ts:31`（`nextSegmentIndex = liveSegments().length + 1`） | 补位者不可能落在中间缺口 |
| 完成判定看数量 | `domain/queries.ts:29`（`isComplete = live.length >= totalSegments`） | 段号失真后仍会被判为「已完成」 |
| 断链事件只改持有者 | `domain/moderation.ts` `chainBreakEvent` | 只置 `HELD(前驱段作者)`，无任何缺口标记或补位入口 |

**具体后果**：`[A1, B2, C3, D4]` 斩掉 `B2` 后 →
`[A1, C2, D3]`（3 段，**C 的段号被从 3 改成 2**）→ 前驱者选投河 → 新人在 `nextSegmentIndex = 4` 追加 →
`[A1, C2, D3, E4]`。

1. **段号失真 / 公海撒谎**：E 被提示按「歌的第 4 段」录唱，于是成品出现**歌的第 4 段重复、第 2 段永久缺席**，但系统判定「4 段已完成」并允许入海。公海展示的是「4 段完整作品」，实际不完整。
2. **未来必爆（与 §14 阶段二直接冲突）**：段号是伴奏时间轴的锚。压缩段号后，C 录的是歌的第 3 段却被标为第 2 段 —— 阶段二接回伴奏时，C 的音频会被塞进歌第 2 段的时间槽，成品明显错位。**这是给最看重的那次演示埋的雷。**
3. **机制缺失**：没有任何路径能让人补唱缺口段。`BOTTLE_REWOUND` 只变更持有者与状态，不标记「缺口在第 N 段」、不给补位入口、不定义补位者该参考哪一段。

### 15.2 防捣乱闭环：实现正确，但零测试覆盖（必须补）

- ✅ `bottle.ts:57`（不能再录）与 `bottle.ts:101`（不能再捞）都检查 `state.segments`（**含软删行**），
  因此**被斩段作者永久不能再参与该瓶子** —— 捣乱者被斩后既不能复唱、也不能再捞回同一瓶子。闭环成立。
- ⚠️ **但没有任何测试钉住这条规则**。它当前正确只因为恰好用了 `state.segments` 而非 `liveSegments`；
  将来任何一次「清理软删行」的重构都会静默破坏防捣乱能力，而测试不会报警。**必须补测试。**

### 15.3 修复方向（待用户裁决后派发修复任务）

1. **段号 = 歌的固定位置（1..4），永不压缩。** 斩浪后该位置保留为**缺口**。
2. **缺口派生为一等公民**：`gaps = {1..4} \ liveIndexes`；完成判定改为「1..4 全部有有效段」。
3. **缺口开放补位**：补位者录制的是**缺口位置**，而非「末尾追加」。多个缺口按段号从小到大依次补。
4. **补位上下文**：需定义补位者可听到/看到什么（见待裁决 3）。
5. **补位后的去向**：补完仍有缺口 → 继续投河补下一个；补完 1..4 齐全 → 按「末段已录满」逻辑进入去向选择。
6. **混音时间轴**（阶段二）：按段号对齐到伴奏固定时间槽；有缺口时成品标注「缺第 N 段」。
7. 防捣乱测试补钉（§15.2）。


## 16. ADR-015 斩浪缺口补位（用户 2026-09-23 终裁，推翻 §15.1 的压缩式实现）

> 用户出发点：**斩浪的目的是防捣乱；斩浪后出现的「空白接唱区域」必须被补上，而不是被压掉。**
> 本节是冻结设计，`t4` 的压缩式实现与之冲突，已开修复任务。

### 16.1 段号语义（根本修正）

- `index` = **歌里的固定段落位置**（1..totalSegments），**永不压缩、永不重排**。
- 斩浪 = 该段 `deletedAt` 置位；**位置保留为空缺**。有效段允许不连续，这是合法状态而非异常。
- **删除** `events.ts` 中「按顺序补齐段号」的重排逻辑（原 `index: position + 1`）。
- 缺口派生：`gaps(state) = {1..totalSegments} \ {有效段的 index}`。
- **下一段要录的段号统一为「最小缺口段号」**：
  - 有缺口 → 最小缺口（补位）；
  - 无缺口 → 该值恰好等于 `live.length + 1`（因为 1..live.length 连续），所以**无需分支**。
  - 即 `nextRecordIndex(state) = min(gaps(state) ?? {live.length + 1})`。

### 16.2 完成判定（必须改）

- `isComplete(state) = gaps(state).length === 0`（**不再**是 `live.length >= totalSegments`）。
- 去向规则随之泛化：由「末段（index == total）不可继续投河」改为
  **「作品完整（isComplete）时不可继续投河」** —— 无缺口时两者等价，有缺口时新规则才是正确的。

### 16.3 斩浪后的状态流转（GAP_TRIGGER = 系统自动重新投河）

- 斩浪产生缺口后，**不再 `BOTTLE_REWOUND` 给前驱段作者**（废弃该路径与「责任转嫁」）。
- 系统直接把作品置回 `IN_RIVER`：`holder = null`，`status = 'IN_RIVER'`，
  且 `currentCasterId = 'SYSTEM'`（哨兵值，避免「不能接自己投出的瓶子」误伤；真实 userId 不可能等于它）。
- 若作品已 `SEA` 且被斩 → 从公海撤下（`seaAt = null`）并置回 `IN_RIVER`。
- 仅当**已无任何有效段可退**（作品被斩空）时才降级为 `DAMAGED`。
- 前驱者不被要求做任何决定；系统可另行发站内通知（t12 范围，非本 ADR 强制）。

### 16.4 允许带缺口入海（GAP_SEA = 可以入海，进未完成区）

- 有缺口时**允许入海**：`status = 'SEA'`，但 `isComplete = false` → 公海列表中归入
  **「未完成区」**，可被「指定接唱」（CONTEXT §6.2）补位，父节点 = 该作品最后一段的接唱者。
- 公海「已完成作品」列表只收 `isComplete === true`。
- 展示与混音不得把不完整作品呈现为完整（见 16.6）。

### 16.5 补位者的上下文（GAP_CONTEXT = 听前一段 + 告知后面已有人）

- 补位者听到**缺口的前一段**音频（若缺口为第 1 段则无前段；该情形即发起者重录第 1 段，回到 `DRAFT`）。
- **仅当**存在 `index > 缺口` 的有效段时，告知补位者「你后面已经有人接好了」——
  **只暴露「后面有人」这一状态，不暴露是谁、也不暴露内容**（与 CONTEXT §9.1 一致）。
- 补位者补完最小缺口后：
  - 仍有缺口 → 可继续投河（让下一棒补下一个缺口）或入海（未完成区）；
  - 已补齐 1..total → 作品完整，进入去向选择，此时按 16.2 不可继续投河。

### 16.6 混音与展示

- **阶段一（纯人声）**：按 `index` 升序拼接；**缺口必须被显式标注**（例如静音占位或输出附 `missingSegmentIndexes`），
  **严禁**静默拼出一个看似完整但错位/缺段的成品。
- **阶段二（叠加伴奏）**：按 `index` 映射到伴奏的固定时间槽；缺口对应时间槽留空或静音。
- 这正是 §15.1 问题 2 的修复：段号不再漂移，阶段二的时间轴对齐才成立。

### 16.7 防捣乱（保持，并补测试钉）

- 被斩段作者**永久**不得再参与该瓶子：既不能接唱（`bottle.ts:57`）也不能再捞到（`bottle.ts:101`）。
  两者都检查 `state.segments`（**含软删行**），实现正确 —— 但**必须补测试钉住**，
  因为一旦被重构为 `liveSegments`，防捣乱能力会静默失效。
- ⚠️ **不要与 §46.1 混淆（captain 补注）**：本条讲的是「被斩段作者**今后**不得再参与该瓶」（接唱 / 捞取），因此**故意**检查含软删行的 `state.segments` —— 这是防捣乱机制本身，**不是**「参与过」的历史判定。§46.1「被斩浪者（含发起者）不算参与过」是**另一维度**（历史计数 / 通知收件人 / 徽章），从**有效段**取。
  二者并行不冲突。**任何**为了"收敛参与过"而把本条改成 `liveSegments` 的改动，都会**静默删掉防捣乱能力**（被斩者重新可接唱、可捞到同一支瓶）。
- 另注：`apps/api/src/store/notifications.ts` 旧注释曾引用「ADR-015 §16.7（斩浪不抹掉参与关系）」—— 那是**误引**，本条从未规定过"参与关系"。

### 16.8 对其它任务的影响

- **t5（数据模型）**：`bottle_segments` 的 `(bottle_id, index) WHERE deleted_at IS NULL` 部分唯一索引**仍然正确**，
  且正是补位机制的基础（同一段号同时至多一个有效段）。**禁止**任何"段号压缩"的存储逻辑。
  另需支持「公海未完成区」查询（`status='SEA' AND 存在缺口`）。
- **t7/t9（上传与 API）**：录制入口必须传「本次录的是第几段」，由 `nextRecordIndex` 决定，不得由前端猜。
- **t8（混音）**：按 16.6 阶段一实现，输出带缺口标注。
- **t11（前端录制页）**：必须支持「补位第 N 段」的文案与上下文（前一段音频 + 后面已有人提示）。
- **t12（次级特性）**：公海未完成区、指定接唱补位、斩浪通知文案。


## 17. t17 收口：ADR-015 落地验证记录与下游接口变化（captain 维护）

`t17`（kind=repair，sourceTask t4）已完成。领域内核：**15 测试文件 / 114 测试全绿**（t4 基线 93）；typecheck 3 包 Done；lint 0 problems；零 IO 仅 `ports.ts:72` 授权行。

### 17.1 captain 独立验证（不采信成员自证）

| 核验项 | 方法 | 结果 |
| --- | --- | --- |
| 测试 | 自己跑 | 15 文件 / 114 全绿 |
| **段号压缩是否真删掉** | grep 重排逻辑 | **无残留**（本轮核心修复） |
| `damagePolicy`/`TERMINAL`/`DEFAULT_DAMAGE_POLICY`/`reopen`/`INITIATOR_DRAFT` | 逐个 grep | 全部清除；`damagePolicy` 仅剩 `moderation.ts:93` 一句"此处曾有过…已删除"的注释 |
| Q1 父链 | 读 `bottle.ts:125` | `parentId: resolveDrawParent(state)` 命令层解析，reducer 只搬运 |
| `gapOpenEvent` 单一出口 | 读实现 | 三支正确：斩空→`CHAIN_BROKEN_BY_CUT` / 锚被斩→`ANCHOR_SEGMENT_CUT` / 其余→`GAP_OPENED{gapIndex}` |
| 成员自发现的 registry 泄漏 | 读 `holding.ts:77-79` | `BOTTLE_GAP_OPENED` → `registry.release()` 真实存在，非声称 |
| §16.7 防捣乱测试钉（第 4 条 sourceFinding） | grep 测试名 | `gapReplacement.test.ts:282` 「被斩段作者永久不得再参与」+ `cutWave.test.ts:300-306` —— **已钉住** |
| **变异 M1**：`nextRecordIndex` 退回旧的"末尾追加" | captain 自做变异 | **14 个测试失败** ✓ 防护扎实 |
| **变异 M2**：`isComplete` 退回旧定义 `live.length >= totalSegments` | captain 自做变异 | ⚠️ **rc=0，114 个测试无一失败 → 覆盖漏洞，已派回补测** |

### 17.2 变异 M2：captain 的定性有误，已更正（依 backend-core 的反驳 + captain 穷举验证）

**captain 原结论（错）**：两个 `isComplete` 定义会在 `totalSegments != 4` 时不等价，因此是"扩展时静默回归"的洞。

**backend-core 的反驳（正确）**：在内核不变式「有效段号 S ⊆ {1..totalSegments} 且无重复」下，两定义**数学等价**：
`gaps = ∅ ⟺ S = {1..N} ⟺ |S| = N`，而 `S ⊆ {1..N}` 蕴含 `|S| ≤ N`，故 `|S| ≥ N ⟺ |S| = N`。

**captain 穷举验证（N=1..6，候选集合取自 1..8，含越界元素）**：

| N | 含越界元素的不一致数 | 不一致总数 |
| --- | --- | --- |
| 1 | 126 | 126 |
| 2 | 181 | 181 |
| 3 | 184 | 184 |
| 4 | 143 | 143 |
| 5 | 80 | 80 |
| 6 | 27 | 27 |

**不一致「全部且仅」发生在含越界段号的集合上；N 内集合零不一致。** → backend-core 的等价性论断成立，captain 的原定性错误。

**更正后的准确定性**：M2 暴露的**不是**"完成判定规则缺测试"（该规则原有 4 条测试），而是
**"对脏事件流的防御姿态缺测试"**。越界段号在**命令层不可达**
（`canRecordSegment` 在 `isComplete` 时拒绝、`nextRecordIndex ≤ N+1`），
**只能从事件流进入**（t5 的持久化日志、导入、未来 `totalSegments` 缩水）。
内核在 `replayBottle` 边界对此兜底判「未完成」而非「完整」，
正是 §15.1 问题 1 的原始痛点（公海把缺段作品当完整展示）在**输入边界**上的防线。

**M2 的修复已验收**：新增 `gaps.test.ts` 的一个 describe / 3 条测试（117 测试全绿）。
captain 自行重跑 M2 → **rc=1，`× 16.2（防御）：事件流带入越界段号时，1..N 未齐全就不算完成`**（修复前为 rc=0），还原后 117 全绿。
三条新测试同时钉住了 `totalSegments ≠ 4` 的扩展性（1..4 有效/5 为缺口 → 未完成；补齐 → 完成且 `versionOf` 给 5 段）。

### 17.3 下游接口变化（唯一消费点 = `packages/shared/src/domain/index.ts`）

**语义变更**：`index` 永不压缩｜`gaps(state)`｜`nextRecordIndex = 最小缺口`｜`isComplete = gaps 为空`｜`seaZoneOf → 'COMPLETED'|'INCOMPLETE'|null`｜`missingSegmentIndexes`｜`hasEverSung`（**含软删行**，防捣乱）｜`resolveDrawParent`（补位者父链 = 缺口前一段作者）。

**事件**：新增 `BOTTLE_GAP_OPENED { gapIndex }`（**无 `reopen`**）；`BOTTLE_DAMAGED.reason` 新增 `'ANCHOR_SEGMENT_CUT'`；**保留** `BOTTLE_REWOUND` 但只由 D-13 的 `RETURN_TO_OWNER` 使用。

**已删除**：`damagePolicy` / `DEFAULT_DAMAGE_POLICY` / `TERMINAL`。

### 17.4 给 t5 的 DB 不变量（本次新增，务必实现并测试）

- `(bottle_id, index) WHERE deleted_at IS NULL` 部分唯一索引 **不变且更关键**（补位段占据缺口段号的基础）。
- `currentCasterId` 必须允许哨兵 `'SYSTEM'`，**不加 users 外键**。
- **斩浪时必须释放 holding 行**（`released_at`）；`backend-core` 本轮已在内核修复同源缺口
  （原先 `syncHoldingRegistry` 不处理斩浪事件 → "状态机说无人持有、锁说有人持有" → 补位者 claim 被 409）。
  **t5 的 DB 实现必须保证同一不变量并写测试**，否则 t9 会出现"斩浪后陌生人捞不到瓶子"的难查缺陷。
- `total_segments` 必须作为列存储，**不得硬编码 4**。
- `events` 表要能存新增事件类型；首条必须是 `BOTTLE_CREATED`（`replayBottle` 依赖）。

### 17.5 t5 追加要求：事件写入/导入时校验段号范围

`backend-core` 指出并被 captain 采纳：**内核对越界段号只做兜底（判「未完成」），写入侧应主动校验。**

- t5 在**写入与导入**事件流时必须校验 `segment.index ∈ 1..total_segments`，越界即拒绝并报错
  （不要依赖内核兜底来掩盖脏数据）。
- `total_segments` 必须作为列存储，**不得硬编码 4**（CONTEXT §4.3：正式版为第 3–5 段中的最后一段）。
- 理由：内核的兜底是为了「不可信输入不导致公海撒谎」，不是为了让写入侧可以放任脏数据。


## 18. 曲库素材授权约束（用户 2026-09-23 提供赛事官方歌单，captain 实测整理）

用户提供的链接 `https://c6.y.qq.com/y.qq.com/...?__=UFgdsOYo9Glo` 解析结果为 **QQ 音乐歌单 ID 9778975366**，
标题「**腾讯音乐高校AI Hackathon参考歌单**」，**共 156 首**（captain 已取到前 30 首元数据）。
**这是赛事主办方提供的官方参考歌单，不是普通分享歌单。**

### 18.1 授权条款（歌单描述原文，逐字引用，不得改写）

> 仅用于腾讯音乐高校AI Hackathon赛事
> 如果在作品 Demo 中使用音乐素材的，本次比赛周期内，非商用、不对外公开上线，只用于赛事评审演示。赛事结束后，不可以再对外发布、上线使用该素材。也可以考虑使用公版免费歌曲。
> 如果涉及到使用专辑封面等素材，仅极少量引用用于评论、介绍原作，才有可能适用合理使用，但依然存在不确定性，不建议依赖使用。

### 18.2 由原文导出的硬约束

1. **非商用**。
2. **不对外公开上线** —— ⚠️ 与用户「部署上线到公网链接」的原始要求**直接冲突**，部署形态必须单独裁决（见 18.4）。
3. **仅用于赛事评审演示**；**赛事结束后不得再对外发布/上线使用**。
4. **专辑封面等素材不要依赖**（原文"不建议依赖使用"）。→ 选歌列表若涉及视觉，使用自绘/内联 SVG，不使用官方封面图。
5. 原文明确许可的退路：**「也可以考虑使用公版免费歌曲」** —— 这是主办方自己给出的合规替代方案。

### 18.3 两项技术障碍（captain 实测）

1. **歌单里没有伴奏。** captain 程序化检索「伴奏 / 无人声 / instrumental / off vocal / 纯音乐」关键词 → **零命中**；
   前 30 首（全 156 首）**全部是含原唱的正式发行曲**。
   → 而接力唱**必须**是伴奏或器乐：拿原曲做底会让原唱人声与用户人声重叠，直接毁掉核心体验
     （"我的声音会和谁的声音拼在一起"变成"三个人在唱"）。
2. **付费下载解决不了。** QQ 音乐付费下载产出的是加密格式（`.mflac` / `.mgg`），**不能直接作为 Web Audio 素材**。
   → 花钱也拿不到可用文件；且**任何绕过付费墙/DRM 的抓取行为一律禁止**（版权 + 违反平台协议 +
     本项目是 TME 赛题，用盗取 TME 曲库的方式参赛会直接毁掉作品可信度）。
3. **歌词同样受版权保护。** `CONTEXT.md` §3.2 要求"看到剩余歌词/段落提示"，但**官方歌单曲目的歌词属受版权保护文本**，
   赛事授权是否覆盖歌词并不明确。
   → 结论：显示歌词时**只对公版曲目使用其公有领域歌词**；对赛事歌单曲目**只显示结构性提示**（第 N 段 / 时长 / 节拍），
     不复制歌词正文。

### 18.4 部署形态必须与素材授权一致（待用户裁决）

| 选项 | 说明 |
| --- | --- |
| (i) 受控访问的评审链接 | 不公开索引、带访问口令/令牌、页面显著位置挂素材授权声明、赛后立即下线。最贴合"只用于赛事评审演示" |
| (ii) 公网部署但不打包任何赛事素材 | 素材仅在本地/评审时使用；线上只跑公版素材或纯人声 |
| (iii) 只本地验收 | 用户此前已表示"验收也在本地" |

### 18.5 素材选型优先级（captain 建议，待用户确认）

1. **公版 / CC0 器乐（首选）** —— 主办方明文许可，且**同时解决"伴奏"与"不公开上线"两个冲突**。
2. 用户自有或已获授权的原创作品。
3. 赛事官方歌单 —— 仅在取得**伴奏版本**且**部署形态按 18.4(i)** 的前提下使用；**只用于赛事评审演示，赛后必须下线**。

无论选哪条，`t13` 都必须交付「授权来源记录」（文件来源 + 授权条款原文 + 适用限制）。


## 19. 曲库分段规范（captain 定义，t13/t8 必须遵守）

用户 2026-09-23 裁决：**素材来源 = 公版 / CC0 器乐**（原文许可的退路），**部署形态 = 受控访问的评审链接**。

**一个重要的放宽**：本项目的用途是**非商用 + 受控访问 + 赛后下线**，
因此**不必死守「CC0 / 零署名」** —— **CC-BY（要求署名）等宽松许可同样可用**，
只要在「设置 / 关于」页与交付文档中给出署名与许可原文。这把可选曲池显著扩大。

### 19.1 选曲硬约束

| 约束 | 值 | 理由 |
| --- | --- | --- |
| 必须无人声 | **器乐 / 伴奏** | 否则原唱与用户人声重叠，毁掉核心体验（"我的声音会和谁的声音拼在一起"变成"几个人在唱"） |
| BPM 稳定且已知 | **70 ≤ BPM ≤ 120** | 见 §19.2，此区间可让分段自动满足 CONTEXT §14.1 |
| 不得变速 / 自由拍 | 无 rit./accel.、无自由散板 | 分段点须可计算 |
| 时长 | **≥ 32 小节** | 供 4 段 × 8 小节 |
| 授权 | 公版 / CC0 / CC-BY 等允许使用的宽松许可；**记录许可原文** | 可审计 |

### 19.2 分段规范（通用形式；§19 初版只给了充分条件，此处更正）

**唯一约束**：每段时长 ∈ [15, 30] 秒。总时长 = 4 × 段长，故自动落在 [60, 120] 秒 —— **总长不需要单独约束**。

```
一小节时长 barSec = (拍号分子 × 60) / BPM        # 4/4 → 240/BPM；3/4 → 180/BPM
段长 = barsPerSegment × barSec  必须 ∈ [15, 30]
可用小节数只需满足 barsPerSegment ∈ [15×(拍号分子×60/BPM)⁻¹ …, 30×…]，
该区间宽度 = 15×拍号分子/BPM，对任何 BPM < 拍号分子×15 都至少含一个整数。
```

**🚩 稳健做法（captain 实测后修正，优先于上面的拍号公式）**

captain 用 ffmpeg + numpy 自相关检测过三首的节拍与拍号，**结果不可信、不予采信**：
实测 BPM 相对官方值偏差 4.7% / 13.1% / 16.8%，且拍号判定与元数据描述互相矛盾
（把 `On the Shore` 判成 3/4，而官方描述里唯一的圆舞曲是 `Rains Will Fall`）。
**Incompetech 详情页只公布 Length 与 Tempo，不公布拍号**，无从校准检测器。

因此**不要用「拍号 × 小节数」反推分段点**（在拍号未知时，该做法会产生系统性偏移，
且误差跨 4 段累积）。改用**与拍号无关的稳健做法**：

1. 目标段长取 `T ≈ 22.5s`（区间 [15,30] 的中值），总长 `4T ≈ 90s`（自动落在 [60,120]）。
2. 目标边界 `0, T, 2T, 3T, 4T`，每个边界在 **±1.5s** 窗口内**吸附到最强起音（onset peak）**。
3. 记录每个边界处的**起音强度分位数**作为证据；若某边界窗口内没有显著起音，标记为待人工复核。
4. 这样分段点落在音乐的自然重音/分句处，**接缝听感正常**，且不需要知道拍号。
5. 段长仍须落在 [15,30]；吸附后若越界，收紧窗口重算。

（原「BPM ∈ [70,120] + 每段 8 小节自动满足区间」的说法只是**充分条件**，且依赖拍号已知，已降级为参考。）

**最终分段表由 `t13` 产出并经用户听感确认后定稿**；captain 的检测结果不作为定稿依据。

**⚠️ 必须按曲目实际拍号计算，不能一律假设 4/4。** 例如圆舞曲是 3/4：
若按 4/4 算会得到系统性偏长的段，且分割点会逐步滑离小节线（跨 4 段后误差累积可见）。

**已核验的候选（Incompetech / Kevin MacLeod，许可 = CC BY 4.0，需署名）**：

| 曲名 | BPM | 实测时长 | 拍号 | 每段小节 | 段长 | 总长 | 每段起拍(ms) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Immersed | 64 | 04:09 (249s) | 4/4（待下载后复核） | 6 | 22.50s | 90.00s | 0 / 22500 / 45000 / 67500 |
| Rains Will Fall | 85 | 03:42 (222s) | **3/4（圆舞曲，待复核）** | 10 | 21.18s | 84.71s | 0 / 21176 / 42353 / 63529 |
| On the Shore | 82 | 01:41 (101s) | 4/4（待下载后复核） | 6 | 17.56s | 70.24s | 0 / 17561 / 35122 / 52683 |

- 下载地址模式：`https://incompetech.com/music/royalty-free/mp3-royaltyfree/<filename>`（三首都已实测 HTTP 200 / 206 可下载）。
- 许可原文（站点 FAQ）：`Licensed under Creative Commons: By Attribution 4.0` + `https://creativecommons.org/licenses/by/4.0/`。
- **署名义务**：CC BY 4.0 要求在「设置 / 关于」页与交付文档中标注 Kevin MacLeod 及许可链接。
- **拍号与精确 BPM 必须在下载后实测复核**（本节数字来自官方 pieces.json 元数据，尚未经音频分析验证）。

### 19.3 每段必须落库的元数据（t8 阶段二的时间槽锚点）

```
segmentIndex      1..4   —— 歌里的固定位置
startMs / endMs         —— 相对曲目起点
startBar / barCount     —— 8
bpm                     —— 曲目 BPM
```

- **段号永不压缩**（ADR-015 §16.1）。缺口保留为空槽，不是把后面的段前移。
- 混音按 `segmentIndex` 映射到伴奏的固定时间槽；有缺口时输出 `missingSegmentIndexes`，**严禁静默拼出缺段/错位的成品**。
- 录音页面播放的伴奏必须**只播当前段的那 8 小节**（或从该段起拍开始播），以保证用户听到的与最终时间槽一致。

### 19.4 交付纪律

候选清单（≥3 首，含来源链接 + 许可原文 + 下载方式 + BPM + 分段表）**必须先经用户确认**，
用户确认前**不得下载入库、不得写代码**。入库后统一转码、响度归一，并把许可原文落进仓库。


## 20. t10 收口：设计系统落地验证、DESIGN.md 修订追认、遗留缺口

`t10` 完成。设计系统落 `apps/web/src/design-system/`（样式层 theme/fonts/motion/index.css、JS token 镜像 tokens.ts、10 类组件、水波装饰、Lucide 唯一入口 Icon、开发展示页、5 个测试文件）。
全量：**shared 117 + api 1 + web 67 = 185 测试全绿**。

### 20.1 captain 独立验证

| 核验项 | 方法 | 结果 |
| --- | --- | --- |
| 全量测试 | 自己跑 | 185 全绿，分布与声称一致 |
| **「测试绿但页面全白」是否真修好** | 自己构建 + 查产物 | 构建 CSS 中 `.flex{display:flex}` 等 utility **真实存在**；关键 utility 逐个命中 |
| 防回归守卫 | 查测试 | `contract-guard.test.ts` 有 `describe('Tailwind v4 接入契约（防止 utility 静默不生成）')` |
| 外链/CDN | 抓产物中的 URL | 唯一命中 `https://tailwindcss.com */`，是 Tailwind 输出的**注释**，非外部请求 → **0 真实外链** |
| 自托管字体 | 计数 | 198 处 `.woff2` + 198 处 `font-display:swap` |
| reduced-motion | 查产物 | 存在，含 `animation:none!important` |
| 动效数值 | 查产物 | `--motion-entry-duration:.48s`（480ms 归一化） |
| **DESIGN.md 改动范围** | `git diff ba5c295 -- DESIGN.md` | 13 插入 / 4 删除；**被删除的 token 行 = 0，新增 = 8** → **无任何既有 token 数值被动过** |
| 核心纪律回归 | 独立复跑 37 条 | **缺失 0 条**；colors token 22 → 30 |

### 20.2 DESIGN.md 越权改动：**内容追认，流程纠正**

`frontend-ds` 主动披露：除授权范围（Use Case 首行 + 8 个 tint/border token）外，另改了 3 处。
captain 裁决：**内容全部追认**。理由：这 3 处都是**用户 2026-09-23 终裁（桌面为主要场景 + 移动端可用性适配）的直接落地**；
若不改，`DESIGN.md` 会**自相矛盾**（Layout 仍写「375px 起手」、Use Case 末段仍写「不新增桌面专属布局模式」），
而 T3.2 照它实现必然出现"移动优先"与"桌面为主"两套读法。用户裁决本身已授权这一方向。

**但流程必须纠正**：`DESIGN.md` 是**唯一风格契约**，且**存在并发消费者**（`t11` 即将按它实现 11 个页面）。
对契约文档的改动必须**先报后改**，不能先斩后奏 —— 本案例恰好只有 t10 自己是消费者所以无损，
但若发生在 t11 进行中，会让已完成的页面实现失效。**今后对 `DESIGN.md` 的任何改动：先发 captain，等回复再改。**
（成员主动披露 + 给出 1 步回滚方案，这个做法本身是正确的。）

### 20.3 遗留缺口 1：等宽字体未落地（**captain 裁决：暂缓，已登记**）

`DESIGN.md` 的 Monospace 指定 `JetBrains Mono`，但**未引入任何 npm 字体来源**，仅声明 `--font-mono: "JetBrains Mono", <系统兜底>`。

**裁决：暂缓引入，但登记为已批准的待办。**
- 理由：目前**没有任何页面真正消费 mono**（T3.2 未开工，审核台在 T3.3）。引入字体包会带进一整套 woff2（自托管、不能走 CDN），
  属投机性工作（YAGNI）。`--font-mono` 已声明且能优雅降级到系统等宽字体，视觉可接受。
- 登记：**预批准依赖 `@fontsource/jetbrains-mono`**（自托管，无外部请求）。
  第一个真正需要等宽的页面（预期为 `t12` 审核台，或 T3.2 的代号/时间戳展示）负责：
  ① 在本文「依赖基线」登记用途；② 在 `pnpm-workspace.yaml` catalog 登记版本；③ 接入并用构建产物验证。

### 20.4 遗留缺口 2：缺少根级 `build` 脚本（**已并入 t16**）

- 现状：根 `package.json` 只有 `dev/test/typecheck/lint/format`，**没有 `build`**；`apps/api/package.json` 也只有 `dev/start/test/test:watch/typecheck`，**没有 `build`**。
  `apps/web` 可独立 `vite build`（已验证可用）。
- 影响：部署（`t16`）无法用一条根命令产出全部构建物；CI 与 Render 的构建命令无标准入口。
- 处置：**并入 `t16`**（部署任务负责定义并验证构建管线），不额外开任务。

### 20.5 给 t11 的交接要点（`frontend-ds` 已提供，captain 确认）

- 样式接入点已就位：`main.tsx` 已 `import './design-system/index.css'`；组件从 `design-system` barrel 引入。
- **图标必须走 `design-system` 的 `Icon` 并先在 `icon.tsx` 注册表登记**；页面**禁止**直接 `import` lucide
  （否则 `import * as lucide` 会让 JS 从 227KB 涨到 978KB —— 这是 t10 实测修掉的真实缺陷）。
- 桌面：`SidebarNav` + 主内容 `max-w-[var(--container-max-width)]`；移动：`BottomNav`（z-sticky + safe-area）；外壳用 `min-h-[100dvh]`，**禁用被禁的视口高度类名**。
- **状态缺口按 `DESIGN.md` 自建**：Figma 12 帧里**没有任何状态帧**（空态/错误/加载/骨架/权限被拒/hover/focus/disabled 全无）——
  组件与 token 均已备好。**不得以"Figma 里没有"为由跳过状态设计。**
- 视觉两条新裁决：选歌页**不使用官方专辑封面**（内联 SVG）；**不复制受版权歌词正文**，只显示结构性提示。


## 21. t17 派发单文本过期 + t18 采集主路径改判 + 一处 captain 更正

### 21.1 t17 派发单文本已过期（**不是行为缺陷**）

`architect` 独立发现：`t17` 的任务描述写「缺口为第 1 段时回到发起者 DRAFT」，
而 §16.5 用户的终裁（= `DAMAGED{ANCHOR_SEGMENT_CUT}`，无补位入口）与代码、测试完全自洽。

**确认：派发单文本过期，实现正确，无需返工。** 成因：`t17` 的描述在该任务**已 started 后无法编辑**
（running team 只允许改 pending never-started 任务），
而用户「GAP_1 = 作品判定为已损坏」的裁决是在 t17 开工后才下的 —— captain 只能通过消息通知执行者，无法回写任务文本。

**处置**：以本文 §16.5 与 §17 为准；`t17` 的任务描述仅作历史记录，**不得据其判断行为**。
`architect` 的处理正确（文档 > 过期派发摘要；terminal 任务不回写）。

### 21.2 t18 采集主路径改判：**改用 files 桶 + nodeIds 批量拉取**

`t18` 因 Figma API **token/IP 级 429 持续 23 分钟**置 failed（纪律执行到位：间隔 65s/62s、退避 60/180/300、每端点 ≤3 次、零跳过零外推）。

**captain 裁决：采纳 `architect` 的发现，主路径改为 `figma_get_file{ nodeIds, depth }`。** 理由：

1. **配额桶独立**：`files` 桶与 `nodes` 桶分开。`nodes`（`figma_get_design_context`）被打满时 `files` 仍可能可用。
2. **信息量恰好匹配需求**：用户已裁决「Figma 仅作 IA / 文案参考，视觉一律以 DESIGN.md 为准」。
   因此 **`radius` / `effects[]` / `stops[]` / `opacity` 本来就不需要**；
   而 `files` 桶**含 `TEXT` 文案**，正是我们要的 IA + 文案。截图降为可选（已有 3 张）。
3. **可批量**：`nodeIds` 支持逗号分隔 → **一次调用可拉多帧**，把原计划 9 次调用压缩到 2–3 次。
   `depth` 建议 ≈9（实测 `4:675` 在 depth 6 仍会截断卡片内部文案）。

**新的调用计划**（按优先级）：
- 第 1 次：`nodeIds=4:966,4:1312`（T3.2 黄金路径仍缺的 2 帧），depth ≈9。
- 第 2 次：`nodeIds=4:1204,4:1426,4:1530,63:32`（T3.3 的 4 帧），depth ≈9。
- 第 3 次（如可行）：子节点 `4:525,4:532,4:539`。

**探测优先纪律（取代原来的退避阶梯）**：先发**1 次探测调用**；成功则按 ≥65s 间隔继续；
**若 429 则立即停止并回报，不在本轮继续重试**（避免用退避阶梯把本就稀缺的额度烧掉）。

### 21.3 captain 更正 `architect` 的一条转述

`architect` 报告称「`CONFLICTS §1` 仍带旧结论，建议 frontend-ds 一并更正」。**此说法不正确**：
`docs/figma/CONFLICTS.md` 第 23–25 行**已经**自更正（明确写"该断言是错的"并给出正确键名与源码行号），
`README.md` §5 亦已更正。`frontend-ds` 在 t3 收尾时已完成两处改写，captain 已复核。

→ 结论：**两文件均已正确，无需再改。** 这条提醒记录在此，是为了避免下游误信"文档里还留着错误断言"而重复劳动。


## 22. 一次静默停滞事故与 captain 的调度教训（2026-09-23）

### 22.1 事实

`t5`（数据模型、契约与并发控制）是通往第一个可演示切片（T3.2）的**关键路径长杆**，却**静默停滞约 1.5 小时**：

- 任务清单状态：始终 `pending` / **attempt 0**（**从未被 claim**）；
- 成员状态：长期显示 `idle/running`；
- 工作区**零产物**：无 `docker-compose.yml`、无 `apps/api/drizzle.config.ts`、无 `apps/api/src/db/**`、无 schema、无 `docs/api.md`；
  `apps/api/src/` 下除 S0 脚手架外没有任何新文件。

### 22.2 处置

- captain 用**产物而非状态标签**判定卡死，将 `t5` 改派给 `backend-core`（空闲 + 是 DB 不变量交接要求的作者，交接损耗最低）。
- 向原 owner 发出**四点诊断请求**（是否执行过 / 卡在哪 / 是否有未落盘的成果 / 现在能否干活），
  并明确要求**停手、不要补 t5、不要做未分派的活**。
- `t6`（账号体系）与 `t9`（业务 API）是否一并改派，**取决于原 owner 的诊断回报**。

### 22.3 教训（写进 captain 的工作方式）

1. **状态标签会撒谎，产物不会。** `idle/running` 既可能表示"正在长回合执行"，也可能表示"会话空转"。
   → **captain 判断成员是否真在推进，必须查工作区产物**（文件是否存在、mtime、`git status`），不能只看状态标签。
2. **`pending` / attempt 0 是红旗。** 若成员状态显示在跑，而对应任务仍是 `pending` 且从未 claim，
   基本可断定调度没有落到该成员身上 —— 此时**等待无用，应主动 `reassign_task`**（该工具的作用正是"分配并唤醒"）。
3. **关键路径上的任务需要主动巡检**。本次事故无人报警：成员不喊、调度器不报、状态标签还显示在跑。
   → 今后**每个切片的关键路径任务**都要由 captain 在合理间隔内做一次**产物级巡检**。
4. **静默比失败更贵**。环境坏、工具缺失、拿不到任务 —— 任何一条说出来都能立即被处理；
   沉默 1.5 小时则同时浪费了关键路径时间与 captain 的调度决策依据。
   → 已在给该成员的指令中重申："不知道就说不知道，拿不到就说拿不到"。

### 22.4 待观察

`frontend-flow`（t11/t12）与 `audio-engineer`（t7/t8/t13）目前仍为 `unspawned`。
它们首次被派发后，captain 需按 22.3 第 3 条**做产物级巡检**，确认同一停滞模式没有在这两个成员上重演。


## 23. t18 降级裁决：Figma 剩余帧改为「可选、机会性」交付（captain 2026-09-23）

### 23.1 事实

Figma API 对**本 token** 在 nodes 与 files **两个桶同时 429**，持续未恢复：

| 时间 | 调用 | 结果 |
| --- | --- | --- |
| 01:07 | `figma_get_design_context{4:675}`（nodes 桶） | 429 |
| 01:08 | `figma_get_file{4:966, depth 9}`（files 桶） | 429 |
| 01:2x | **captain 亲自探测** `figma_get_file{depth 1}`（最省额度） | **429** |

`architect` 两轮共 **11 次调用零产出**。它执行了「探测优先」纪律（探测失败即停手、0 次重试），行为正确。

### 23.2 裁决

**t18-F1（blocker）—— 采纳 `architect` 的提议「captain 先探测验活，再唤醒成员」。**
- 不再按固定时间连派 `t18`（每轮都会固定烧掉探测额度）。
- **由 captain 在需要时做 1 次最低成本探测**（如 `figma_get_file{depth:1}`）；**仅当探测成功**才唤醒成员执行采集。
- 设**尝试上限**：若持续不可用，则永久按缺失处理（见 23.3），不再尝试。

**t18-F2（medium）—— 降级为「可选、机会性」交付，且它本来就不阻塞关键路径。**
- 依据：用户已裁决「Figma 仅作 IA/文案参考，视觉一律以 `DESIGN.md` 为准」；现有交付（5 帧完整 + `4:675` 含 4 项导航、4 档公海分区、10 条文案）**已覆盖黄金路径所需 IA**。
- 依赖核查：**`t11` 依赖 `t10/t7/t9`，不依赖 `t18`；`t12` 依赖 `t11`** → `t18` 不阻塞任何关键路径任务。剩余帧只精修 T3.3（P1/P2 页面）的 IA。
- 因此：**不为它等待、不为它重复唤醒**；后续仅在配额恢复且有空闲成员时机会性补齐。
- `t18` 任务本身保持 `failed` 状态作为记录（running team 不允许移除/编辑已启动任务），**不作为交付阻塞项**。

### 23.3 若配额持续不可用：按「已知缺口」处理，不阻塞交付

剩余未采帧清单（**无一跳过、无外推、无伪造**，台账见 `docs/figma/frames/00-t18-ledger.md` §4.5）：
`4:966` public-sea-detail / `4:1312` profile-center / `4:1204` tracking-reveal / `4:1426` report-modal /
`4:1530` admin-dashboard / `63:32` certificate-panel / 子节点 `4:525`、`4:532`、`4:539`。

这些页面的 IA 由 `frontend-flow` 依据 `DESIGN.md` + 已提取的 5 帧模式自建，
**并在交付说明中标注「该页 IA 无 Figma 稿，依据 DESIGN.md 与既有模式推导」**（诚实标注，不假装有稿）。

### 23.4 附：`architect` 的一次自我更正（captain 记录）

它主动认错并落盘台账 §4.6：其「`CONFLICTS §1` 仍带旧结论，建议 frontend-ds 更正」属**未核原文的下游影响建议**。
captain 已在 §21.3 更正。**它自己把这条记进台账并写明"涉及他人的影响建议，先核原文再发"——这个自省质量很高。**


## 24. 成员可用性处置：`backend-api` 移出关键路径（captain 2026-09-23）

### 24.1 事实与判定

| 证据 | 内容 |
| --- | --- |
| 产物 | 全程**零产物**（`t5` 无 `docker-compose`/drizzle 配置/schema/`docs/api.md`） |
| 任务状态 | `t5` 长期 `pending` / **attempt 0**（从未 claim） |
| 通信 | 对 captain 的直接诊断请求（**累计 5 条消息**）**无任何回复** |
| 成员状态 | 长期 `idle/running` —— 状态标签与事实不符 |

**判定：该成员会话不可用（静默停滞），移出关键路径。**

### 24.2 处置

- `t5` → 已改派 `backend-core`（**已在推进**：`docker-compose.yml`、`apps/api/drizzle.config.ts`、`apps/api/src/db/{client,global-setup,migrate,schema,holdings.integration.test}.ts`、`vitest.integration.config.ts`、`.env.example` 均已落盘，依赖已在 §依赖基线与 `pnpm-workspace.yaml` catalog 登记）。
- `t6`（账号体系）→ **改派 `architect`（零损失）**：`t6` 依赖 `t5`，后者未完成 ⇒ `t6` 必然尚未开工，改派不会丢失任何工作。`architect` 是最合适人选（它写了 Fastify 脚手架、ADR-004 的 zod 契约策略与 409/422 错误码语义）。
- `t9`（业务 API）→ **暂留 `backend-api` 作为观察样本**：若调度把它派下去而该成员仍无产出，captain 再改派（预计候选：`backend-core`，它是领域内核作者；或 `architect`，视 `t6` 进度）。**captain 需主动巡检，不得依赖成员报警。**

### 24.3 教训补充（与 §22.3 合并执行）

1. **`idle/running` 是不可信状态标签** —— 本次同一个标签在同一个成员上持续约 1.5 小时以上而无任何产物。
   判据只能是**产物级巡检**（文件存在性 + mtime + `git status`）。
2. **巡检要趁早**：`t5` 停滞被发现的唯一原因是 captain 主动查了文件；
   若按"等成员回报"的方式运行，会一直等到切片验收才暴露。
3. **改派前必须先判断"零损失"**：`t6` 之所以能安全改派，是因为其依赖未完成 ⇒ 不可能有半成品。
   对**依赖已满足、可能已有半成品**的任务改派前，必须先确认产物状态（避免丢掉成员上下文里未落盘的成果）。
4. **本次 §22.3 的规则立即产生了正收益**：改派后 captain 用产物巡检**当场确认** `t5` 真在推进（新增 10 个文件、5 分钟内多个 mtime），
   不需要再问成员 —— 这是"看产物不看标签"的直接价值。

### 24.4 待观察

- `t9`（`backend-api`）是否响应调度。
- `frontend-flow`（t11/t12）与 `audio-engineer`（t7/t8/t13）首次派发后的**产物级巡检**（§22.4）。


## 25. t5 收口：数据层落地验证、接口边界裁决、一处基线缺陷

`t5` 完成（attempt 8817b960）。Postgres 单库 + drizzle（声明式 schema + drizzle-kit 迁移）+ 原生 SQL 抢占。未 commit（captain 统一提交）。

### 25.1 captain 独立验证

| 核验项 | 结果 |
| --- | --- |
| 迁移产物 | `apps/api/drizzle/0000_old_zeigeist.sql`（drizzle `out: './drizzle'`，**不在** `src/db/migrations`） |
| **`events` 首条约束** | `events_first_event_check CHECK (seq > 1 or type = 'BOTTLE_CREATED')` —— **确实在迁移 SQL 第 60 行**，与声称逐字一致 |
| **`holdings` 抢占约束** | `holdings_active_bottle_uniq ON holdings (bottle_id) WHERE released_at is null`（L194） |
| **`bottle_segments` 补位约束** | `bottle_segments_active_index_uniq ON bottle_segments (bottle_id, index) WHERE deleted_at is null`（L186） |
| `total_segments` | 是**列**（L28/L135），带 CHECK；迁移共 17 条 CHECK，**未硬编码 4** |
| 集成测试 | `test:integration` → 4 文件 / 17 测试全过 |
| eslint 时间守卫 | `eslint.config.mjs:60,80` 真实存在，报错指向 `createSystemClock()`（ADR-005 不变式 4） |
| 依赖登记 | §4 两张表（已安装基线 + t5 引入记录 + **不引入的替代方案**：Prisma / 原生 pg+手写迁移 / Supabase / postgres.js） |

### 25.2 🚩 发现并派回的基线缺陷：`pnpm -r test` 退出码 1

- **现象**：`pnpm -r test` → exit=1；`apps/api` 的 4 个集成测试文件被判 failed（测试显示 skipped，但退出码非 0）。
- **根因**：`apps/api/vitest.config.ts` 的 `include: ['src/**/*.test.ts']` **把 `*.integration.test.ts` 一并收集**；
  无 `DATABASE_URL` 时这些文件在**收集期**抛错。另有次生错误 `TypeError: Cannot read properties of undefined (reading 'close')`（客户端未创建仍 close）。
- **为何是真缺陷**：**AGENTS.md §2 把 `pnpm -r test` 定为命令基线**，而它现在依赖"会话里恰好 export 了 DATABASE_URL"才绿；
  `.env` 是 gitignored 的 ⇒ 全新克隆 / CI / 任何其他成员跑都红。**"切片必须全绿"这道闸门会因环境变量而结构性失效。**
- **要求**：默认配置排除 `**/*.integration.test.ts`（`pnpm -r test` 在无 `.env`、无数据库时返回 0）；修掉次生 teardown 错误；加一条守卫防止 include 被放宽。

### 25.3 ⚠️ 报告口径纠正

成员报"单测 213"。captain 实测：**单测 196**（shared 128 + api 1 + web 67）+ **集成 17**；`213 = 196 + 17`。
→ **集测与单测性质不同（需 Docker + DATABASE_URL），不得合并计入"单测"**。今后报告须分开，且**必须附基线条命令的真实退出码**（退出码比测试数更有信息量）。

### 25.4 接口边界裁决：包根 = 契约层，`/domain` = 内核（**批准**）

成员改了 `packages/shared/src/domain/publicApi.test.ts`：包根不再 `export *` 领域内核。现 `exports` 为：

```json
{ ".": "./src/index.ts", "./contracts": "./src/contracts/index.ts", "./domain": "./src/domain/index.ts" }
```

**captain 裁决：批准。** 理由：① `export *` 双导出会产生 5 个同名类型歧义（Segment / Resolution / SeaZone / VoteValue / RuleViolation），改名更丑；
② §17.3 本就写明"唯一消费点 = `packages/shared/src/domain/index.ts`"；③ 契约层是前后端共享面、领域内核是后端纯逻辑，**分离正确**。

**下游必须遵守的 import 规则**：
- `@music-drift/shared`（包根）→ **只能拿契约层**（zod schema 与推导类型）；
- `@music-drift/shared/domain` → 领域内核（守卫、状态机、派生查询、`nextRecordIndex` 等）。
- **禁止**把两者合并回包根（已有边界测试钉住）。

### 25.5 成员自抓的 4 个真问题（captain 记录，含一条自证式守卫）

① seed 的段落 id 曾用 songId 前缀派生 → 三首歌段落 id 撞车 → 改 ordinal 派生；
② `insert ... values ($3,...,$3::text)` 跨 uuid/text 列复用参数 → `inconsistent types deduced` → 拆成两个参数；
③ **成员自己写的 eslint 守卫抓到了成员自己写的 `releasedAt ?? new Date()` 默认值** → 改为时间必须由调用方注入。
   → **这是"守卫价值"的最佳证明**：规则若只写在文档里，该默认值会活到线上并表现为"时间不可注入、结果不稳定"的假失败；
④ 集成测试原跑在开发库上、跨轮次累积脏数据 → 改为**可抛弃测试库**（global-setup 建库 + 清表 + 迁移）。


## 26. ADR-016 认证实现裁决（t6）：scrypt 参数、会话令牌、双错误词表

### 26.1 scrypt 参数（captain **实测验证**，`architect` 的论断正确）

- 参数：`node:crypto` 的 `scryptSync` / `randomBytes` / `timingSafeEqual`；**N=2^15, r=8, p=1, salt 32B, keylen 64B**。
- **`maxmem` 必须显式传入**（建议 64 MiB）。这个结论经 captain 在 Node 24 上**实测**：

| 事实 | 值 |
| --- | --- |
| `128 × N × r` | 33,554,432 B = **恰好 32.0 MiB** |
| Node 默认 `maxmem` | **32 MiB**（33,554,432 B）——**两者相等** |
| 按 Node 文档字面判据 `128*N*r > maxmem` | **False（应当不触发）** |
| **实测（不传 maxmem）** | **抛 `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`** |
| **实测（`maxmem: 64*1024*1024`）** | **成功** |

→ **反直觉但确凿：相等仍会抛。** 显式 `maxmem` 是**真必需**，不是"加保险"。
→ **要求**：把上述实测结论（含错误码与"相等却仍抛"这一点）写进代码注释；
   否则后人看到"32MiB 刚好等于默认值"会顺手删掉该参数，然后同一个坑再踩一次。

### 26.2 口令存储格式（**采纳**，属正确做法）

```
scrypt$32768$8$1$<saltB64url>$<keyB64url>
```

- **参数入库** → 将来可在线升级算法强度（旧行按旧参数校验，新行用新参数）；
- verify **按行内参数解析**；**畸形串返回 `false` 而非抛异常**（避免把存储损坏变成 500）。

### 26.3 会话令牌（**采纳**）

- 32B 随机 → base64url **明文 token 只出现在 `Set-Cookie`**；**库内只存 `SHA-256(hex)`**（`sessions.token_hash` 唯一索引）。
- 校验：hash → 查表 → `expires_at > clock.now()`；登出 = 删行（**幂等**，无 cookie 也返回 204）。
- cookie 名 `mdb_session`，`Path=/; HttpOnly; SameSite=Lax; Max-Age=TTL`；`Secure` **仅 `NODE_ENV=production`**。
- **手写 cookie 序列化/解析**，不引 `@fastify/cookie`（符合 §7「能 stdlib 就不引依赖」）。
- 时间一律注入 `createSystemClock()`。

**captain 追加要求**：
1. **TTL 必须是可注入的策略常量**，不得散落魔数；并测试**过期边界**（`now === expires_at` 视为过期）。
2. 手写 cookie **必须测**：属性齐全；`Secure` 只在 production 出现；**畸形 / 重复 cookie 不抛异常，按未登录处理**。
3. `INVALID_CREDENTIALS` **不区分**"账号不存在"与"密码错误" —— 正确（防用户枚举）。
   但 `EMAIL_TAKEN` / `HANDLE_TAKEN` 在注册接口上**必然可枚举**，这是注册 UX 的固有取舍，**作为已知取舍记录，不要求改**。
4. **登录无速率限制**：demo 阶段**接受**（不引中间件），但须在 `docs/api.md` 标注为已知未做项。

### 26.4 错误码词表：选 (A) 双词表（**captain 裁决**）

`architect` 提出二选一：
- **(A)** 在 `packages/shared/src/contracts/auth.ts` 内新增独立的 `AUTH_ERROR_CODES / AUTH_ERROR_MESSAGES / AUTH_ERROR_HTTP_STATUS / authHttpStatusOf`，
  envelope 与 `ErrorResponseSchema` **同形**（`{error:{message,violations[]}}`），仅 code 取自 auth 词表；
- **(B)** 把 contracts 的 code 枚举改为 `RULE_CODES ∪ AUTH_ERROR_CODES` 统一词表。

**裁决：(A)。** 理由：
1. **不动终态内核**（t4/t17）→ **零回归风险**；
2. auth 错误（凭证/会话/注册）与领域规则违反（游戏规则）是**不同类别**；合并成一个枚举会让所有领域错误码消费方无谓携带 6 个 auth 码；
3. 不进一步加深 `contracts → domain` 的耦合。

**代价与处置**：`docs/api.md` §1「`violations[].code` 与 `RULE_CODES` 完全一致」对 auth 路由不再字面成立。
→ **captain 明确授权 `architect` 自行补那一行**：`violations[].code ∈ RULE_CODES ∪ AUTH_ERROR_CODES`（auth 路由取后者），
   避免为一句话再多一轮往返。（其原话"文档是你的/t5 的，我不动" —— 边界意识正确，但此处已获授权。）

### 26.5 注入

`buildApp` 增加 `{ db?, clock? }` 注入；**不动** `packages/shared/src/domain/`；**不动** `apps/api/vitest.config.ts`（属 t5 收口）。


## 27. 并行 TDD 工作区下的「基线红」判据 + t7/t11 目录边界

### 27.1 `pnpm -r test` 返回非 0 的三种原因，必须区分（captain 2026-09-23）

`pnpm -r test` 是**仓库全量**命令；在多人并行的 TDD 工作区里它天然会在队友的红灯期间返回非 0。**这不是缺陷。**判据必须看**失败的是谁的文件、失败原因是什么**：

| 原因 | 是否缺陷 | 处置 |
| --- | --- | --- |
| 基线依赖环境变量（如缺 `DATABASE_URL`） | **是缺陷** | 修配置（t5 已修：默认 vitest 配置排除 `**/*.integration.test.ts`） |
| 队友在途的 tests-first 红灯（如 `Cannot find module './constants'`） | **不是缺陷** | 正常瞬时状态；等其实现落地即回绿 |
| 真实的实现/断言失败 | **是缺陷** | 派修复 |

**captain 实例记录**：同一次修复后，captain 先跑 `apps/api` 得 exit=1，一分钟后复跑即 7 文件 / 49 测试全绿 —— 与成员报告一致地印证了「瞬时红」的存在。
→ **t15（对抗式评审）与其他评审者不得把"队友在途红灯"当作交付缺陷**；须先确认该文件是否属于在途任务。

### 27.2 t7 / t11 目录边界（captain 裁决，防止两个会话互相踩）

captain 曾对 `audio-engineer` 下达「不碰 `apps/web/`」—— **该指令过窄**：`t7` 的交付明确包含「录制组件、上传 API 客户端、播放器组件」，按那句执行会砍掉一半交付。现按**目录硬切**更正：

| 归 `audio-engineer`（t7 / t8 / t13） | 归 `frontend-flow`（t11 / t12） |
| --- | --- |
| `packages/shared/src/audio/**`（纯逻辑，可脱离浏览器测） | `apps/web/src/pages/**` |
| **`apps/web/src/features/audio/**`**（录音/播放的 React 组件与 hooks，自包含） | `apps/web/src/features/{river,bottle,sea,profile}/**` |
| 后端上传与 **Range 播放端点**所在路由文件 | 页面组装、路由、导航 |
| 上述端点对应的 `packages/shared/src/contracts/` 文件 | — |

- `t11` 的页面 **import** `features/audio`，**不得修改**它；需要改经 captain 转达。
- 反之 `audio-engineer` **不得**动 `pages/**` 与其他 feature 目录。
- 双方**都必须复用** `apps/web/src/design-system/`（组件 + token + `Icon` 注册表）；缺 token 报 captain，**禁止内联硬编码**（AGENTS.md §4）。
- 图标**禁止**直接 `import` lucide（实测 JS 227KB → 978KB）。
- **Figma 12 帧没有任何状态帧** → 权限被拒 / 录音中 / 上传失败 / 加载等状态由实现者按 `DESIGN.md` 自建，**不得以"Figma 里没有"为由跳过**。


### 27.3 守卫设计规范（由 t9 的两道守卫评审导出，captain 裁决）

**规范 1：守卫必须同时断言正反两个方向。**
纯负向守卫（"不许出现 4xx 字面量"）可被**遗漏**满足：新路由一个错误码都不写也算"通过"，但它其实**无法正确报错**。
→ 必须补**正向不变式**（例："每个声明了错误路径的路由模块必须 import `problem.ts`"）。
> 本条由 `backend-core` 提出并被 captain 采纳，是整份方案里最有价值的设计。

**规范 2：守卫的作用域不得误伤合法用法。**
两道守卫在评审中各有一处作用域缺陷，均已收窄：

| 缺陷 | 误伤对象 | 收窄后 |
| --- | --- | --- |
| 禁掉路由里**所有** `reply.code(...)` / `.status(...)` | **t6 合法的 `204`（登出）**、将来合理的 `201`（创建瓶子） | 只在**参数为 4xx/5xx** 时禁止：`CallExpression[callee.property.name=/^(code\|status)$/][arguments.0.value=/^[45]/]`。守卫的目的是"**错误**映射必须走 `problem.ts`"，不是"路由不许设状态码" |
| 正向不变式要求**每个**路由模块 import `problem.ts` | `routes/health.ts`（S0 起即有、**无错误路径**）→ 会逼出一个无意义的 import | 建立**显式例外清单**并在守卫内注释例外理由；无错误路径的路由可例外，但须说明 |

> 坏守卫的典型症状：**它让人为了让检查通过而写废代码。**

**规范 3：把安全属性做成可执行的测试，而不是文档条款。**
例（t9 交付）：`problem.ts` 是**唯一**构造 `ErrorResponseSchema` 的地方 → 用"`apps/api/src` 内除 `problem.ts` 外不得出现 `409`/`422` 字面量"来**可执行地**保证；
并**故意制造 DB 故障**（外键违规 / 唯一约束冲突 / 连接失败）断言响应为 5xx + 固定中文文案，且**不含** `pg_` / `SELECT` / `insert into` / `constraint` / `duplicate key` / `at Object.`（堆栈）/ `ECONNREFUSED` / 白名单外表名。


## 28. 共享装配点并发覆盖事故（captain 计划缺陷）+ 串行编辑区规则

### 28.1 事故经过

`apps/api/src/app.ts` 是**多任务共享装配点**。`architect`（t6）写入账号路由后，被 `audio-engineer` 一侧的版本（只挂 `segmentAudio`）**整文件覆盖**
→ `architect` 的 **19 个路由集成用例全部 404**。

> **最要紧的一点（architect 指出）**：**若非它跑了集成用例，这个冲突会带病通过。**
> 静默 404 **连"红"都不是** —— 进程正常、单测正常、看起来一切正常。

**定性：这是 captain 的 DAG 计划缺陷**，不是任何成员的 bug：我让多个任务编辑同一个装配文件，却没有定义编辑纪律。

### 28.2 串行编辑区规则（立即生效）

`apps/api/src/app.ts` / `server.ts` / `env.ts` 定义为**串行编辑区**：

1. **只允许增量合并，绝对禁止整文件覆盖。**
2. 新增路由时必须**保留**已有路由族：`/healthz`、`/api/auth/*`、segmentAudio 系列，以及既有注入（时钟/选项/`secureCookies`）。
3. 编辑前先确认该文件**近期是否被改**；发现并发编辑，**先报 captain**。

### 28.3 永久守卫：路由注册守卫测试（t9 必须交付）

**不能靠"人记得要合并"。** 要求 t9 交付一条测试，断言**所有已知路由族同时挂载且可达**
（逐个请求断言 ≠404，或断言已注册路由集合包含全部族）。
→ 今后任何人整文件覆盖都会**立刻炸测试**，而不是静默 404 带病通过。

### 28.4 基线状态的第四类：**静默丢失（不红但坏）**

§27.1 的判据只有三类（环境依赖缺陷 / 在途红灯 / 真实失败）。
本事故补上**第四类**，也是最危险的一类：

| 状态 | 表现 | 可发现性 |
| --- | --- | --- |
| 静默丢失 | **不红**，进程与单测全绿，只是某个功能不可达（404 / 未挂载 / 未注册） | **只有覆盖性集成测试能发现** |

→ **推论**：「跑集成用例」不是可选项。单测通过**不能**证明装配正确；装配正确性只能由**覆盖全路由族/全注册点的集成测试**证明。
→ 这也是 §27.1 那条"基线红要区分原因"的**反向补丁**：**不红**同样需要区分原因。

### 28.5 `env.ts` 语义裁决

`architect` 将 `DATABASE_URL` 由必填改为**可空**，使 `server.ts` 的「无库也能启动 + 告警」分支可达 —— **裁决：保留**。
理由：本地必须能在**无数据库**时跑单测与 `/healthz`（与"修 vitest 基线"同一个理由）；必填写死会让该分支成为**死代码**。

**追加一条**：`NODE_ENV === 'production'` 且缺失 `DATABASE_URL` → **启动即 fail fast**。
理由：开发环境"降级 + 告警"是便利；**生产环境静默无库运行比起不来更糟**（会表现为大面积 5xx，而不是立刻暴露配置错误）。

**最终组合**：dev = 可空 + 告警覆盖 `/api/auth/*`；prod = 缺失即 fail fast。


### 28.6 诊断补充：用 **mtime** 区分「在途快照」与「真实语法/类型错误」

captain 实操中遇到一次极易误判的情形：

`pnpm -r typecheck` 报 `apps/api/src/store/bottles.integration.test.ts(81,1): error TS1005: '}' expected` ——
看起来是**语法错误**（比"缺模块"严重得多）。但该文件 **mtime 距检查时刻仅 6 秒**，且尾部完整闭合 ⇒
这是 `backend-core` 正在写 t9 的 `store/` 层时的**半截快照**，**不是缺陷**。

**操作规则**：判断基线红是否为在途状态，**最快且最可靠的证据是失败文件的 mtime**：

| 现象 | 判据 | 结论 |
| --- | --- | --- |
| 失败文件 mtime 距今 **数秒** | 正在写 | **在途快照**，不是缺陷（`TS1005` 这类"语法错误"尤易误判） |
| 失败文件 mtime 距今 **数分钟以上** | 已停笔 | 需按 §27.1 三类归因（环境依赖 / 在途红灯 / 真实失败） |
| 失败文件属于**已完成任务** | — | 真实缺陷，派修复 |

> 结论：**mtime 是"在途 vs 缺陷"的第一手证据**；在指责或派单之前先看它。


## 29. ADR-017 全局错误处理器与信息泄漏防线（全 app 行为约定）

### 29.1 漏洞（`backend-core` 在 t9 发现，影响**全 app**）

`buildApp` 原先**没有全局错误处理器** → Fastify 默认行为把 `error.message` **原样回显**给客户端。
用「必然抛错」的假 Db 注入真实故障后实测，响应体里出现了：

```
insert or update on table "votes" violates foreign key constraint
"votes_segment_id_bottle_segments_id_fk"     ← 表名 + 约束名
select * from bottle_segments where id = $1  ← SQL 片段
at Object.query (…/db/client.ts:59:28)       ← 堆栈
code: 23503 / ECONNREFUSED 127.0.0.1:5433    ← 驱动错误码 / 内网地址
```

**这不是某条路由的问题，而是全 app 的**（t6 auth、t7 audio 同样受影响）：任何未捕获异常都会泄漏
表名、约束名、SQL 片段、堆栈、驱动码与内网地址。

### 29.2 修复（`apps/api/src/app.ts:54-60`）

```ts
app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, 'unhandled request error');   // 原始错误只进日志
  const rawStatus = (error as { statusCode?: unknown }).statusCode;
  const status = typeof rawStatus === 'number' ? rawStatus : 500;
  const problem = status >= 400 && status < 500
    ? transportProblem('INVALID_BODY')      // 框架层 4xx：非法 JSON / 缺 content-type
    : internalProblem();                    // 5xx：固定文案，不接受错误对象
  reply.code(problem.status).send(problem.body);
});
```

- `internalProblem()` **签名不接受任何参数** ⇒ **结构上**无法把 SQL/堆栈塞进响应（§25 已验）。
- 未匹配路由仍保持 404。
- 负向对照（证明漏洞真实）：临时移除该处理器 → **2 个用例失败**（DB 故障与非法 JSON 两条都泄漏原始信息）；还原 → 4/4。

### 29.3 这是**全 app 的行为约定**，后续任务必须遵守

1. **禁止**在任何路由内绕过它自行构造 5xx 响应（零规则守卫已在守）。
2. **不要把"5xx 响应体是中文通用文案"当成 bug 去修** —— 这是预期行为，不是回归。
3. 原始错误只能进 `request.log.error`，**不得**进响应体。

### 29.4 配套守卫（均跑在默认 `pnpm test` 基线上，DB-free，毫秒级）

| 守卫 | 内容 | 负向对照 |
| --- | --- | --- |
| `routes/mounted.test.ts`（17 例） | 路由注册守卫：装「未匹配专用」`setNotFoundHandler` 返回 `{unmatched:true}`，逐族断言响应不含该标记 —— **区分「合法 404」与「路由没挂」** | 删一排装配 → 6 个具名用例失败 |
| `routes/guard.test.ts`（7 例） | 零规则守卫 **正反双向**：反例（路由/http 层除 `problem.ts` 外禁 4xx/5xx 直写与裸字面量，**扫描前剥离注释**）+ 正例（**声明了错误路径的路由必须 import `problem.ts`**） | ① 注入 `reply.code(409)` → 反例失败；② 删 problem 导入 → 正例失败并指名文件 |
| eslint 规则 | 路由目录禁 `.code/.status(4xx\|5xx)`（**放行 200/201/204**，见 §27.3）+ 禁路由内 `throw` | 与测试同源 |

**例外表是「条件化」的，不是拍脑袋的**：`no-error-path` 的文件必须**确实**不出现 `sendProblem/problemFrom*`；
`own-vocabulary` 的 `auth.ts` 必须**真的**调用 `authHttpStatusOf`。
> 这是 §27.3「守卫不得让人写废代码」的对称面：**豁免也必须能被证伪**。

### 29.5 防假绿设计（值得复用）

`http/leak.test.ts:67` 有一条**夹具自检**断言：

```ts
it('夹具本身确实包含泄漏源（否则本测试会假绿）', () => { ... })
```

泄漏测试最容易的失败方式是**空转**：夹具里根本没有泄漏材料 ⇒ "断言响应体不含泄漏模式"**必然通过** ⇒ 测试永远绿而漏洞仍在。
**先证明夹具里有泄漏源**，是可证伪性的最小实现。captain 对 t4 用的是变异测试，目的一致、手法更省。
→ **今后所有"断言某模式不存在"的测试，都应配一条夹具自检。**


## 30. t7（录制/上传/播放链路）收口 + ADR-018 错误词表与上传协议裁决

### 30.1 t7 交付与 captain 核验

| 交付 | captain 核验 |
| --- | --- |
| `packages/shared/src/audio/`（7 文件：constants/errors/recording/listening/index + 2 测试） | 在位 ✓ |
| `apps/api/src/audio/`（10 文件：range/sniff/ingest/repository/routes + 4 单测 + 真库集成） | 在位 ✓ |
| `apps/web/src/features/audio/`（4 组件 .tsx + 9 测试文件 + hooks/format/waveform） | 在位 ✓ |
| `docs/audio.md` | 18.7 KB ✓ |
| 集成套件 | **10 文件 / 84 例 exit 0** ✓ |

**Range 流式播放**（captain 认可的设计）：
- `Range` 解析为**纯函数**（三种结论 `full`/`partial`/`unsatisfiable`）→ 200 / 206+`Content-Range` / 416+`bytes */size`；
- 切片在 **SQL 里**完成（`substring(audio from $2 for $3)`）→ **不整段读进内存**；
- **语法非法的 Range 一律忽略返 200**，只有「合法但越界」才 416；
- **必须支持后缀请求 `bytes=-N`**（Safari 探测 moov 依赖它）；
- `Accept-Ranges: bytes` + `Cache-Control: private, no-store`；`HEAD` 同头无体；
- **不发 `multipart/byteranges`**：多段请求忽略 Range 整段下发（RFC 允许 "MAY ignore"，且省掉一个协议实现）。

**听满 80% 判定**（captain 认可的设计）：口径是**覆盖率（听过区间的并集）**，不是累计时长 ——
相邻 `timeupdate` 位移 > 1500ms 视为拖动、不计；循环重播不叠加；时长不可信（0/NaN/服务端缺失）覆盖率为 0（**fail-closed**）；
尾差只在连续播到片尾时补（避免"拖到 99% 再等 ended"白拿）。阈值取内核 `DEFAULT_POLICY.dislikeListenRatioThreshold`（全仓一份）。

### 30.2 t7 自建「装配守卫」并**自行做过变异验证**

`apps/api/src/audio/routes.test.ts` 内含装配守卫：**文本层**断言三个 `register*Routes` 调用同时存在（谁整文件覆盖立刻红）+ **行为层**断言非 404。
并**自做变异**：临时移除音频注册 → 守卫失败 → 还原 → 通过。注释里写明背景是 §28 那次真实事故。
→ 这是 §28.3 要求的「永久守卫」在**第四条路由族**上的又一次落地，且**由该族作者自己实现**。

### 30.3 🚩 t7 ↔ t9 **上传协议断层**（实测发现，P0 阻塞核心闭环）

`audio-engineer` **不是读代码推测，而是用真实 app + 真实库 + 真实会话 cookie 发 multipart 探针**：
```
POST /api/bottles/:id/segments  (multipart)  →  400 硬拒，db row = []（无插入）
```
它原本**推测**"会静默 201 并丢音频"，**实测推翻了该推测**（是硬 400）—— 这正是"实测优先于推断"的价值。

**根因**：客户端按 `docs/api.md` §2.4 发 **multipart**；而 t9 的段创建端点**只收 JSON**、全仓**无 multipart 解析器**
（`apps/api/src/routes/bottles.ts:195` 落库写的是 `audio: null`）。
→ **「音频能被别人听到」目前端到端跑不通**（t7 的播放端点/存储/守门人均已验证可用）。

### 30.4 ADR-018 裁决

**裁决 1：音频错误码并入 `RuleCodeSchema` —— 批准。**
`audio-engineer` 指出 §26.4 对 **auth** 码裁决了「独立词表」，但**理由不适用于音频码**：
- **auth 码**只出现在 `/api/auth/*`（**单一类别**的端点族）→ 独立词表可行；
- **音频码**出现在**同一个漂流瓶上传端点**上，而该端点**同时还要返回领域码**（`NOT_HOLDER` / `HOLDING_ALREADY_TAKEN`）
  → 若另立词表，客户端得「按失败类型猜该解析哪套 envelope」。

**判别原则（captain 记录，取代"是不是领域规则"这个粗判据）**：
> **决定因素是「该错误码是否与领域码出现在同一个端点上」，而不是「它是不是领域规则」。**
> 同一端点 → 同一词表（一端点一错误形状）；独立端点族 → 可独立词表。

**裁决 2：`RecordSegmentRequest.durationMs` 由可选改必填 —— 批准。**
服务端校验 15–30s 需要它；实现里已默认 `requireDuration: true`（缺失即 422）**但契约字段没改** ⇒
这是**契约与实现漂移**，必须消除。→ 改必填 **并提升 `CONTRACT_VERSION`**，同步 `docs/api.md` 与客户端。

**裁决 3：上传协议改用「原始二进制」而非 multipart —— 批准。**
- 理由：符合 AGENTS.md §7「能 stdlib 就不引依赖」。Fastify **内置** `addContentTypeParser`，**零新依赖**；
  multipart 需要引入 `@fastify/multipart`（+ busboy）。
- 形态：**body = 原始音频二进制**，`Content-Type` 即音频 MIME（不再需要单独字段），
  `durationMs` 走请求头或查询参数；服务端 `addContentTypeParser('audio/webm'|'audio/mp4', { parseAs: 'buffer' }, …)`。
- 代价：客户端 `upload.ts` 的 `buildSegmentUploadForm` 改为原始 body；契约与文档同步；`CONTRACT_VERSION` 提升。
- 上传上限 4 MB（t7 已定），缓冲解析可接受。

**裁决 4：`apps/api/src/app.ts` 的改动确认合规** —— t7 **增量合并**（保留 `/healthz`、`/api/auth/*`、t9 全部路由族与 clock 注入），未整文件覆盖 ✓，符合 §28.2。

### 30.5 未做与已知缺口（t7 自述，captain 接受）

1. **无真机验证**：会话内无浏览器，Chrome/Safari 的"可录可播"只到**代码与测试层**（Safari 路径 = `isTypeSupported` 只认 mp4 的环境注入 + mp4 容器白名单 + 后缀 Range 请求）。**真机验收归 t14 与用户。**
2. **服务端不解析容器时长**（Chrome 的 webm 常不写 `Duration`）→ 伪报时长只能靠诚实 + 体积上界；要堵住需服务端解码（新依赖）。**接受为已知缺口。**
3. 播放端点当前**匿名可读**（UUIDv4 不可枚举 + "捞到就能听"的产品语义）；账号级收紧归 t9/t12。
4. **设计系统缺口（记录，暂不处理）**：`theme.css` 没有 Latin 字体的 Tailwind utility；t7 用既有 `var(--font-latin)` 绕过。
   → 建议后续需要时由设计系统属主补一个 `font-latin` 类；**当前不阻塞，按 YAGNI 暂缓**。

### 30.6 又一次「守卫抓到自己作者」（第三次）

`backend-core` 在写 `routes/interactions.ts` 期间，**它自己写的零规则守卫当场失败**（`expected [ 'interactions.ts' ] to deeply equal []`）。
这是本会话第三次出现该模式（前两次：`architect` 的 `Date.now()` lint 规则抓到自己写的 `?? new Date()`；
`backend-core` 的错误码完整性测试抓到自己漏写的 `NOT_IMPLEMENTED` 文案）。

> **判据补充**：此类失败**不是缺陷**，而是守卫在**实时**阻止违规写法进入仓库。captain 判定基线红的原因时，须计入「**守卫正在拦自己的作者**」这一情形。


## 31. t9 第四增量：路由族全部装配 + 两项新记录

### 31.1 交付与 captain 核验

| 项 | 结果 |
| --- | --- |
| 路由族 | `sea`（列表/详情/**指定接唱**）· `interactions`（votes/messages/reports/notifications/badges）· `admin` 骨架（权限服务端校验 + 只读队列 + 决策端点 501） |
| `app.ts` 装配 | **9 个 `register*Routes`**，`sea`/`interactions`/`admin` 均在位（增量合并，未整文件覆盖） |
| 注册守卫 | captain 实测 **26 例 passed**（成员报"24 族"，**低估了自己**），仍 DB-free、跑默认基线 |
| api 单测 / 集成 | **15 文件 / 135 例 exit 0** ／ **10 文件 / 84 例 exit 0** |

### 31.2 「指定接唱」的实现范式（**采纳，记此以免后人以为少了一个命令**）

内核冻结且**没有** `requestTargetedSegment` 命令。实现**没有发明状态转移**，而是用**内核已有事件词汇**表达：

> **指定接唱 = `BOTTLE_DRAWN` from `SEA`**，父节点 = **该作品最后一段的接唱者**（正是 CONTEXT §6.2 原文），走原子抢占；
> 守卫码全取内核（`BOTTLE_ALREADY_COMPLETE` / `ALREADY_SANG_IN_BOTTLE`，经内核 `violation()` 生成）。

**范式（后续遇到"冻结的内核 + 新功能"都照此）**：**先看已有词汇能否表达，而不是先加命令。**

### 31.3 守卫现象的**四类**判据（前两类在 §30.6，此处补 B 型）

| 类型 | 现象 | 危害方向 | 已发生 |
| --- | --- | --- | --- |
| **A 型**：守卫**正确**拦住作者 | 作者确实写了违规写法 | 无（守卫生效） | 3 次 |
| **B 型**：守卫**错误指控合法用法** | 守卫条件过宽，误伤正常代码 | **制造假阳性 → 作者为了让检查通过而改写合法代码** | 1 次：`z.string().max(500)` 被判成裸状态码 |

**B 型正是 §27.3「坏守卫的典型症状：它让人为了让检查通过而写废代码」的实例。**

修法（采纳）：收窄为**赋值形态**判定 `BARE_STATUS = /(?:status|statusCode|code)\s*[:=]\s*[45]\d{2}/`，
**并补放行断言**（`z.string().min(1).max(500)`、`limit: z.coerce.number().max(100)` 必须判 `false`）。
> **用断言钉住"不许误伤"，比只改正则强** —— 否则下次有人收紧正则时会再次误伤。

### 31.4 错误码准入规则（captain 立，后续通用）

> 新增错误码的理由必须是「**客户端需要据此区分不同处置**」，而不是「我想给用户看一句不同的话」。
> 后者用**通用码 + 不同 message**，**不加码**。

首个适用案例：`collections`（CONTEXT §6.4「收藏仅限已完成公海作品」）—— 裁决新增 API 层码
`COLLECTION_REQUIRES_FINISHED_WORK` 并**并入 `problem.ts` 已使用的 `ALL_API_ERROR_CODES` 并集**
（保持"唯一错误出口"），同步 `docs/api.md` §1。

**为何**：独立端点（`/api/collections`）+ 功能级规则（非状态机转移）⇒ 依 ADR-018 可独立词表；
但**响应形状仍必须是 `ErrorResponseSchema`**，且码须被其 `violations[].code` 接受（否则 zod 会抛）。
**拒绝用 `NOT_FOUND`/`FORBIDDEN` 掩盖** —— 那正是 §31.1 所批评的「404 语义混用」。


## 32. captain 的一次误诊与更正（守卫现象的 A/B 型计数修正）

### 32.1 事实更正

在 §30.6 中，captain 把 `guard.test.ts` 的 2 条失败判定为 **A 型（守卫正确拦住作者在途的 `interactions.ts`）**，
并据此指示 `backend-core`「**不要去改守卫、不要降低断言 —— 去让 `interactions.ts` 走 `problem.ts`**」。

**该判定与指示都是错的。** `backend-core` 反驳后，captain 自行复核确认：

```
grep -cE '\.(code|status)\([45][0-9][0-9]' apps/api/src/routes/interactions.ts  →  0   （零个直写状态码）
grep -c "max(500)"          apps/api/src/routes/interactions.ts                   →  2
错误路径出口：sendProblem ×20 / transportProblem ×18 / problemFrom ×3
guard.test.ts 现状 → 8 例全绿
```

**真因是 B 型误报**：守卫正则把 `z.string().max(500)` 里的 `500` 判成了裸状态码。
→ **captain 的指示若被执行，会让人把一处正确实现改坏以迎合有缺陷的检查**，即 §27.3 所警告的
「坏守卫让人为了让检查通过而写废代码」。

### 32.2 计数修正

| 类型 | §31.3 原记 | **更正后** |
| --- | --- | --- |
| A 型（守卫正确拦住作者） | 3 次 | **2 次**（`Date.now()` 规则抓自己的 `?? new Date()`；错误码完整性测试抓漏写的 `NOT_IMPLEMENTED`） |
| B 型（守卫误指控合法用法） | 1 次 | **2 次**（`max(500)` 被判裸状态码；**以及 captain 误判的这一例本身就是把 B 型误读成 A 型**） |

### 32.3 失误机制与教训（captain 自己的）

**机制**：captain 看到断言消息 `expected [ 'interactions.ts' ] to deeply equal []`，**据此断定"文件里有违规"** ——
即**把「检测器的输出」当成了「事实」**。

**教训（与 §28.6 同源，但这次犯在 captain 身上）**：
> **被指控的文件本身必须读一眼。断言消息指名的文件不一定是过错方 —— 检测器自己可能就是错的。**
> 这与「mtime 是判断在途 vs 缺陷的第一手证据」是同一条纪律的两面：**先看一手证据，再下结论。**

**captain 此前反复强调「推断不算证据」并据以纠正成员；本轮该错误由 captain 自己犯下。**

### 32.4 流程改进：授权边界沿「内聚单元」划，不按文件数量划

captain 曾只授权 `backend-core` 改 `apps/web/src/features/audio/upload.ts` **一个文件**。
但 `UploadTransportRequest`（`upload.ts:23-25`）、其实现 `xhrTransport`（**同在 `upload.ts:327`**）、
其断言（`upload.test.ts`）构成**一个内聚单元**。边界从中间切过去 ⇒ **改了编译不过、不改则任务不完整** ⇒ 无谓的停手往返。

> **今后授权一个改动，按「模块 + 它的测试」给范围，而不是按文件个数。**
> 附：captain 已核实 `xhrTransport` 位于 `upload.ts` 内，**不在独立文件**；`index.ts` 仅 re-export 名字，预期无需改动。

### 32.5 边界附注

`mix-render.ts` / `use-mix-export.test.ts` 属 `audio-engineer` **正在进行**的 t8（混音）。
→ 若它们引用了传输形状，**必须停下报 captain，不得编辑**（并发编辑区，§28 同类事故已发生过一次）。


## 33. t9 第七增量：三条可复用规则 + 基线红判据补第五类

### 33.1 规则：新错误码族必须放「叶子模块」

**事故**：`API_RULE_CODES` 起初被写在 `contracts/interactions.ts` 里 → 与 `contracts/common.ts` 形成**循环依赖** →
**shared 测试数从 201 掉到 180**、`problem` 套件**直接 load 失败**。

**为何危险**：**循环依赖的表现是"测试数量静默减少"，而不是报错** —— 只看 `exit 0` 或"跑通了"会以为没问题。
测试数下降是**唯一的信号**，而没人会天天对比测试数。

**规则**：新增码族/常量时，**放在最底层、不 import 同层任何模块的文件里**（叶节点）。
本次落地为 `packages/shared/src/contracts/error-codes.ts`（captain 已核：`grep "^import"` 零命中）。

**相关**：`problem.test.ts:144` 断言 `ALL_API_ERROR_CODES.length === RULE_CODES + API_RULE_CODES + TRANSPORT_ERROR_CODES`
—— **把"只有一个错误词表"变成了可执行约束**，比写在文档里强。

### 33.2 规则：「每个文件前清表」不是普遍安全的隔离手段

**事故**：为修文件间污染而加的「每文件前清表」，把 t7 `audio.integration.test.ts` **在 `beforeAll` 里建的夹具**清掉了。
**症状**：该文件 **7 个用例 404**，而 **2 个「期望 404」的用例反而通过** ⇒ **假红与假绿同时出现**。

**为何最难查**：汇总数字（通过数/失败数）**完全看不出原因**，甚至可能"看起来更绿了"。
修复：撤掉 per-file 清表、保留 `fileParallelism:false`，并把路由级断言改为与具体夹具无关的形态。

**判据**：清表仅在「**所有 fixture 都建在晚于清表的钩子里**」时才安全。
**跨文件共享夹具一旦存在，它就会制造幻象** —— 凡引入全局清表，必须先证明该前提。

### 33.3 基线红判据补**第五类**：并发资源争用

集成测试库原为**全队共用的 `music_drift_test`**，globalSetup **每次运行都清表** ⇒
**两名成员同时跑 `test:integration` 会互相清数据** ⇒ 症状是「同一命令时而 exit 0 时而 exit 1」，且当次无任何用例断言失败。

**captain 裁决：技术层修复**（按 `DATABASE_URL_TEST` 派生唯一库名，globalSetup 建库 / teardown 删库，保留 env 覆盖能力，并清理陈旧残留）。
**否决规则层方案（限定单人跑）**：那是"靠人记住"的约束，一旦有人忘记或新成员不知情，就会复现此类幻象红。
**`fileParallelism:false` 保留** —— 那是**运行内**的文件隔离，与**跨进程共库**是两个不同问题。

**captain 补充更正**：此发现解释了一类「集成套件瞬时红」。此前 captain 把这类红归因于"队友在途写入"（那些有 mtime 证据、仍然成立），
但**集成套件**的红现在有了更可能的解释。→ **基线红判据（§27.1 / §28.4）现为五类**：

| # | 类型 | 是否缺陷 | 识别依据 |
| --- | --- | --- | --- |
| 1 | 基线依赖环境变量 | **是** | 无 `.env`/无库即红 |
| 2 | 队友在途的 tests-first 红灯 | 否 | 失败文件的 **mtime 距今数秒**；属在途任务 |
| 3 | 真实实现/断言失败 | **是** | 失败文件属**已完成**任务，或 mtime 已停笔数分钟 |
| 4 | **静默丢失**（不红但坏） | **是** | 只有**覆盖性集成测试**能发现（§28.4） |
| 5 | **并发资源争用**（共享测试库互相清表） | **是（基础设施）** | **同一命令重跑即绿**，且当次无断言失败 |

> 教训链：**检测器输出 ≠ 事实**（§32）→ **归因也可能错**（本条）。**证据要跟上每一步推断。**


## 34. t8（混音与成品导出，阶段一纯人声）收口

### 34.1 交付与 captain 核验

| 项 | 结果 |
| --- | --- |
| 产物 | `packages/shared/src/audio/{mix.ts,mix.test.ts}` · `apps/web/src/features/audio/{mix-render,use-mix-export,mix-export-panel}.ts*` · `docs/mix-report.md` |
| 全仓测试 | `pnpm -r test` exit 0：shared **201** / api **139** / web **206** |
| 阶段一无伴奏被钉住 | `mix.test.ts:89` `hasAccompaniment === false`；阶段二策略 `:253` 为 `true` |
| **策略可替换（任务书要求）** | `mix.ts:8` 注释明写「阶段二只换 `MixPlanner`，调用方一行不改」；`:112` `MixPlanner` 端口、`:126` `planMix(strategy,…)`、`:134` `planMonoSequentialMix` |
| **D-05 阈值落地** | `mix.ts:28-29` `MIX_ALIGNMENT_TOLERANCE_MS = 120`，注释标注"D-05 客观验收阈值" |

### 34.2 对齐误差实测（D-05 客观验收：段落起拍误差 ≤ 120ms）

4 段 × 22.5s @48kHz = **4,320,000 帧**（真实帧数，非估算）：

| 情形 | 实测 | 结论 |
| --- | --- | --- |
| 无延迟 | **0.000 ms** | 达标 |
| 模拟 40ms 解码延迟 | **40.000 ms** | 达标 |
| 模拟 150ms 延迟 | **150.000 ms** | **未达标**，且列出违规段 |

纯 JS 混音耗时 ~3ms。**→ 未触发 ffmpeg 回退条件（D-05 的"浏览器端优先"成立），未引入任何依赖或服务。**

### 34.3 ADR-015 的段号语义在音频侧落地

- **缺口保留原段号 + 静音占位**；占位时长来源优先级：`songSegments` 元数据 → 已录段中位数 → 22.5s，
  **来源记进 `durationSource`**（不是"猜一个数就完"，而是让这个数可审计）。
- **时间轴唯一真相是整数帧**；相邻段首尾相接（不留缝 / 不重叠 / 不漂移）⇒ 消掉一整类浮点累积误差隐患。
- 文件名与界面均标注「缺第 N 段」。

### 34.4 成员自查出的一个"静默"缺陷（captain 记录，值得复用）

**起拍探测原向"前后各 250ms"双向搜索** → 会把**前一段的尾音**误读成本段起拍
→ 把"晚 40ms"读成"**早 250ms**" —— **误差方向都反了**。

**为何这类 bug 最危险**：它**不会让测试失败**，只会让测量值看起来**更好**（甚至显示 0ms 达标），
从而**把 ffmpeg 回退判断引向错误结论**。已改为**只向前探测** + 回归测试。
> **判据**：任何"测量"类实现，其错误方向若趋向"更好看"，就必须有独立的不变量断言，而不能只靠阈值断言。

### 34.5 待证明项（captain 要求，未闭合前不视为完成）

成员诚实披露：**变异 M2（单独重编号缺口段号）存活**，并主张那是**等价程序**而非覆盖漏洞。
**captain 复核发现**：`mix.test.ts:51` 与 `:98` **确实**断言了输出 `clip.index` ⇒ 只有两种可能：
- **(i) 等价程序** ⇒ M2 不改变任何可观测输出（变异测试只能发现行为变化，存活正常）；
- **(ii) 覆盖漏洞** ⇒ M2 改变了 `clip.index`，但 `:98` 的用例集未覆盖被改路径。

**要求**：贴出 M2 的 diff 与「它改变了哪个可观测面」。若为 (i)，报告中须写成可证伪的一句：
**「M2 改变的可观测面：无」**；若为 (ii)，补用例覆盖。

**为何必须闭合**：**`clip.index` 在阶段二直接驱动伴奏时间槽**。阶段一它是信息性的（纯人声按帧顺序首尾相接），
故"改 index 输出不变"成立；**阶段二一旦用 index 映射时间槽，同样的改动就会让成品错位** ——
与 §15.1 问题 2（段号压缩破坏伴奏对齐）是**同一机制**。⇒ **必须在阶段二之前钉死。**

### 34.6 真机缺口（阶段边界，非 t8 缺陷）

- 40/150ms 是**注入的前导静音**，**不是**真实 Chrome/Safari 录音实测；
- `OfflineAudioContext.startRendering()` 的**实际样本落点**与 **AAC priming** 需 **t14 真机复测**（`decode`/`render` 均为注入端口，接口已就绪）；
- **主观盲听必须人耳**（属用户验收）。

⇒ 写入切片验收说明，作为已知边界。

### 34.7 一处观察（captain，未确证，列为观察项）

captain 曾抓到一次 `apps/web` **1 failed / 205 passed**，数分钟后复跑 **206/206 全绿**。**当时未抓到正被写入的文件，故不认定成因。**
**怀疑（未确证）**：对齐误差实测那组用例若断言**依赖墙上时间/渲染耗时**，会在负载下抖动。
→ **观察项**：若再出现，改为对**注入值**断言而非对耗时断言。

### 34.8 一处过期表述已更正

成员报告称「端到端导出仍受 t9 上传协议修复阻塞」—— **该协议已修好并端到端验收通过**（§31 之外，见 t9 第五增量）。
**真实缺口是「库里尚无任何真实录音」**（需真实浏览器完成首次录制），而非协议未修。已要求更正表述，避免误导下一个人。


## 35. t8 待证明项闭合 + 基线红第 5 类细化为两个子形态

### 35.1 t8 §34.5 的"待证明项"已闭合：M2 是**等价程序**（证明，非论证）

成员用**差分测量**取代了论证：
- **diff**：`planMonoSequentialMix` 缺口分支的 `index` → `clips.length + 1`（仅此一处）；
- **测法**：10 组输入（完整4段 / 缺2 / 缺2+3 / 5段缺2,3,4 / 只有第2段 / 乱序 / 空 / 重复段号 / 越界段号 / 非法时长），
  原版与 M2 版各跑一遍，dump `clips[{index,kind,startFrame,durationFrame,startMs,durationMs,durationSource}]` + `totalFrames` + `missingSegmentIndexes` + `isComplete` + `hasAccompaniment` + `warnings`；
- **结果**：`diff` 空（507 行 JSON）、**`cmp` 字节级相同**。

**结构性理由**（这才是"证明"与"论证"的分界）：规划层对 `1..totalSegments` **每个段号恰好产出一个 clip**，
故推入缺口那一刻**恒有** `clips.length + 1 === index` ⇒ **差异在结构上不可能存在**。
报告 §4.2 已写死可证伪陈述：**「M2 改变的可观测面：无」**。
⇒ `mix.test.ts:51` / `:98` 的 index 断言**未被绕过**；M2 存活属正常，**不是覆盖漏洞**。

### 35.2 为阶段二补的两条不变式（带红证据）

| 不变式 | 内容 | 目的 |
| --- | --- | --- |
| **A** | `clips[i].index === i + 1`（1..N 每号恰好一个 clip，缺口也占位） | 钉住"段号永不压缩" |
| **B** | **人声 clip 的段号 = 该音频源段的段号**（不是"第几个被拼进去的"） | 钉住**阶段二 `clip.index` → 伴奏时间槽**的正确性 |

**红证据**（证明它们真会咬，非装饰）：M1（压掉空洞）→ 6 条失败；**M5（按过滤后顺序重新编号，正是阶段二的危险改法）→ 4 条失败，含 A/B**；M4（忽略 `startFrame`）→ 9 条失败。
⇒ **§34.5 的风险已在阶段二之前关闭。**

### 35.3 captain 的一次归因被证伪（自记）

captain 曾据"一次 `apps/web` 1 failed → 复跑全绿"推测：**对齐实测用例可能依赖墙上时间**。
`audio-engineer` 全量 grep 自身测试后证伪：`performance.now()` **仅用于 `console.warn` 打印耗时，无任何耗时断言**；
`use-recorder.test.ts` 的 `elapsedMs ≥ 2500` 由**假定时器 + 注入时钟**驱动（确定性）；并附 `web/features/audio` **连跑 3 次 139/139** 的稳定性证据。

⇒ **captain 的假设不成立。** 这又一次印证 §32 的教训：**归因也要有证据，不然只是另一个猜测。**

### 35.4 基线红第 5 类细化为两个子形态（共同指纹：复跑即绿 + 无断言失败）

成员抓到的真实脆弱点：
```
Error: Test timed out in 5000ms.     ← 每文件**第一条**用例超时（不是断言失败）
× 整段请求 … 6916ms                  ← 同文件其余 11 条 35–177ms 全过
```
单文件跑 47/47（~0.6s）；紧接着全仓复跑 exit 0；失败时刻 mtime 02:09/02:10 **秒级新鲜 = 在途**。

**机理**：`app.ts` 现 import **11 个路由模块 + 2 个 store 模块** ⇒ **首个 import 它的测试文件**承担完整 transform/加载成本；
多人并发跑套件（CPU 争用）时**第一跳**顶破 vitest 默认 `testTimeout: 5000`。

**captain 核实**：`apps/api/vitest.config.ts` **未设** `testTimeout`（只有 `include`/`exclude`），吃默认 5s；
而 `apps/api/vitest.integration.config.ts:26-27` **已设 30s** ⇒ **两个配置不对称**，且不对称的正是易出问题的一侧。

**裁决（归 t9 收尾）**：把 `apps/api` 单测配置的 `testTimeout` 提到 **15s**（不动 `include`/`exclude`，守卫不受影响；上限不超集成配置的 30s）。
**否决规则层方案**（"约定不同时跑两套重套件"）—— 又是"靠人记住"；技术层修复足够吸收争用（与 §33.3 同一原则）。

→ **第 5 类基线红（并发资源争用）现含两个子形态**：

| 子形态 | 机理 | 指纹 |
| --- | --- | --- |
| 5a 共享测试库互相清表 | globalSetup 每次清全库 | 复跑即绿、无断言失败 |
| 5b CPU 争用 + 默认超时过紧 | 首测冷启动成本顶破默认超时 | **只有每文件第一条用例超时**、单跑全过、复跑即绿 |

> **共同指纹：复跑即绿 + 无断言失败。** 凡见此指纹，先怀疑 5 类，而不是怀疑刚改的代码。


## 36. t9（业务 API）收口 + 一条由 HIGH 缺陷导出的强制实践 + 三项裁决

### 36.1 交付与 captain 核验

| 项 | 结果 |
| --- | --- |
| api 单测（无 `.env`/无库） | exit 0，15 文件 / **139** 例 |
| 集成（真库） | exit 0，14 文件 / **120** 例 |
| **并发两次** `test:integration` | **两次都 exit 0**（各 120/120），**跑完残留 `music_drift_test*` = 0** |
| shared / typecheck / lint | 20 文件 **203** 例 / exit 0 / exit 0 |
| `testTimeout`/`hookTimeout` | `apps/api/vitest.config.ts:20-21` = **15_000**（未动 include/exclude，守卫仍绿，不超集成的 30s） |
| 过期注释 | `upload.ts` 头部「multipart」已改为**原始二进制（ADR-018）** |
| 测试库隔离 | `music_drift_test_<epoch>_<后缀>` 每运行独立 + **陈旧库自动清理**（`drop database if exists … with (force)`，仅清超龄的） |

**新增 +28 例**（`interactions` 20 / `sea` 8），覆盖 captain 指定的互动族用例：
点赞与斩杀**完全解耦**（10 个赞在旁边**照斩**，第 10 个踩触发 `SEGMENT_CUT`；锚被斩 → DAMAGED；斩后再投 422）、
一赞一踩并存（已接受行为）、<80% 422、作者自踩 422、重复投票 422（不静默覆盖）、
留言可见性（PENDING 时发起者与无关者都看不到）+ 逐跳回传 → `DELIVERED` / 中途入海 → `UNDELIVERED`（§5.2）、
举报非管理员 **403 且不泄露内容**、无 cookie 401、admin 501 且**状态未改**、
徽章**派生不落库**（库内确无 `badges` 表）、公海 `?zone=INCOMPLETE` 缺口 [2,3,4]、
指定接唱成功后 **holderId + 父链 = 最后一段作者**。

### 36.2 🚩 HIGH 缺陷：一个「类型检查、内核测试、既有路由测试全都照不到」的契约违反

`store/dto.ts` 的 `toBottleSummary` 把 `songTitle` **写死成 `''`** ⇒ `GET /api/sea*` 返回
**违反契约**（`BottleSummarySchema.songTitle` 是 `min(1)`）的响应 ⇒ 公海列表将**没有曲名**。
**而 typecheck、内核测试、既有路由测试全都照不到它。**

**发现手段**：在集成测试里对**真响应**做 `BottleSummarySchema.parse`。
**修复**：曲名必传（列表批量查、详情单查），并加负向对照（退回空串 → **3 例失败**）。

### 36.3 由该缺陷导出的**强制实践**（captain 裁决，覆盖裁决项 3）

> **所有集成测试必须对「真响应」做契约 `Schema.parse`，而不是只断言字段存在。**

**同时裁决：不启用全局运行时响应校验**（`setSerializerCompiler`）。
**理由**：在 demo 规模下运行时开销可忽略，**但它会把一次契约违反变成硬 500** ——
把"看起来不对"变成"整页崩"，与"demo 无差错"的目标相悖；而**测试侧 parse 更早、更安全地抓住同一类缺陷**（本缺陷正是它抓到的）。
**复审触发条件**：若真有一例契约违反**漏到运行期**（在测试之外被发现），届时再启用。

### 36.4 裁决项 1：`§5.2` 通知写路径 → **写入 t12 任务书**

`grep -rn "insert into notifications" apps packages` **只命中测试夹具** ⇒ 写路径全仓不存在。
t9 只做了通知的**读 / 标记已读**。captain 已把**三类写入**写进 **t12** 任务描述
（留言送达 → 通知接收者；**留言未送达 → 通知发送者**（§5.2）；作品入海 → 通知所有参与者（§9.2）），
并要求各自有真库集成测试断言"真的写了一行且收件人正确"。

### 36.5 裁决项 2：传输层错误**不**加 `code` → **维持现状**，并记录理由与复审触发条件

传输层错误（400/401/403/404/501）的 envelope **不带码**（`violations: []`），只能靠 HTTP 状态区分。

**维持现状的理由**：
1. 这 5 个状态本身**已经无歧义**地表达了原因（未登录 / 无权限 / 不存在 / 参数非法 / 未实现），加一个 `code` 是**重复信息**；
2. `message` 是给用户看的**中文文案**（ADR-004「码与文案分离」中"文案"那一侧），传输层不需要程序判断的码；
3. 加 `code` 需契约变更 + 提升 `CONTRACT_VERSION` + 通知双方，而收益仅是"少写一个 `switch(status)`"。

**⚠️ 已明确写入 `docs/api.md` §1/§2.8**，并要求前端**按 `response.status` 分支**（已在 t11 前置指令中告知）。
**复审触发条件**：若前端需要**程序化区分同一个 400 的不同原因**（而非只显示文案），届时加 `code` 并提升版本。

### 36.6 t11 已开工

`t11`（黄金路径页面）已由 `frontend-flow` claim。
captain 已下发六条前置指令（import 边界、传输层错误按状态分支、`features/audio` 组件直接复用不要重造、
设计系统 + 状态态必须自建、缺口必须显式展示、基线红第 5 类指纹），以**避免返工**。
**t11 完成即第一个可演示切片，届时停下交用户验收。**


## 37. 一次成员会话失败的处理（`audio-engineer` / t13）

### 37.1 事件

`audio-engineer` 的会话在 **t13（伴奏曲库接入）进行中失败**，**无结束报告**；任务卡在 `in_progress` / attempt 1。
它此前已完成并交付 `t7`、`t8`（均已 `completed`，产出完好）。

### 37.2 captain 诊断：把「遗留红」与「在途队友红」分开

全仓基线当时是红的（typecheck exit 2 / lint exit 1 / `pnpm -r test` exit 1）。逐项归因后：

| 红的位置 | 归因 | 判定 |
| --- | --- | --- |
| typecheck：`apps/api/src/audio/library-cli.ts:117` TS2345（`unknown` → `string`） | **死任务的遗留**（t13 的 WIP） | **真红，需修** |
| lint：`apps/web/src/features/api/client.ts` · `features/bottle/record-step.tsx` · `remembered-bottles.tsx` · `features/profile/bottle-index.ts` | `frontend-flow` 的 **t11 在途** | 第 2 类（在途红灯），非缺陷 |
| 单测：web 的 FAIL 全在 `App.test.tsx` / `pages/__tests__/` / `features/bottle/` / `pages/shell/` | 同上，**t11 在途** | 第 2 类，非缺陷 |
| `packages/shared` **231 passed** · `apps/api` **149 passed** | 绿 | — |

⇒ **大部分红是 t11 的正常在途 TDD（预期）；只有 1 处是死任务留下的真红。**
（若不做这一步归因，很容易误判为"t13 把仓库搞坏了"，从而误判处置力度。）

### 37.3 判据补充：如何区分「死任务遗留红」与「在途队友红」

我此前只给了"mtime 秒级新鲜 = 在途"（§28.6）。**会话失败会制造第三种情形**，需要三者结合：

| 判据 | 在途队友红 | **死任务遗留红** |
| --- | --- | --- |
| 任务状态 | `in_progress`（成员活着） | `in_progress`（**但成员会话已失败**） |
| mtime | **秒级新鲜、还在动** | **停住不动** |
| 后续报告 | 会有 | **不会有（永远等不到）** |

> **结论：mtime 不再动 + 成员会话已失败 ⇒ 不要等报告，直接处置。**
> 这也再次印证 §22.3：「等待无用，应主动 `reassign_task`」。

### 37.4 另一条由本事件导出的规则

> **会话失败时，"成员自述"不存在。** 其产出**默认视为「未验证」**，
> 由接管者以**自己跑出来的结果**为准。

依据：正常结束的成员会给出证据与自评（本次会话中多次出现"自评 6 条里 1 条 failed"这类诚实自述）；
**失败结束则连"它以为自己做完了什么"都不可知** —— 此时**盲信工作区里的代码等于零验证**。
→ captain 已明确告知接管者 `frontend-ds`：**凡前任留下的东西默认"未验证"**。

### 37.5 处置

- `t13` **改派给 `frontend-ds`**（attempt 2）—— 它是**唯一不持有未完成任务的成员**（`t2`/`t3`/`t10` 均已 completed）。
- 要求顺序：**审计前任产出 → 先修那处 TS2345（基线红优先）→ 再补齐 t13 要求**。
- 边界：署名**组件**归 `features/audio/`，**「设置/关于」页挂载归 t11/t12**（`frontend-flow`），**不得改 `pages/**`**。
- 未采取"整体回滚 t13 的 WIP"：其 API 测试**当前是绿的**（149 passed），说明 WIP **接近完成而非废墟**，回滚会白扔近似可用的资产。


## 38. ADR-019 测量类实现必须防止「自我印证」（第二次同源问题）

### 38.1 两次实例

| 次 | 位置 | 自欺机制 |
| --- | --- | --- |
| 1 | t8 起拍探测（双向 ±250ms） | 把**前一段尾音**读成本段起拍 ⇒ **误差方向反了**（"晚 40ms"读成"早 250ms"）⇒ 测量值看起来**更好**，甚至显示 0ms 达标 ⇒ 会把 ffmpeg 回退判断引向错误结论 |
| 2 | t13 BPM 选择 | `tools/library-analysis.py:356-357`：`near = min(candidates[:12], key=\|bpm − official_bpm\|)` ⇒ **期望值被当作选择输入**，随后又用它算偏差 ⇒ 报告出的偏差（−0.00% / −0.01% / +2.94%）**在结构上必然接近 0，不构成独立证据** |

**共同模式**：**测量实现可以"自我印证"到看起来正确。**
两者的可怕之处相同：**它们都不是"代码写错了"，而是"验证方式本身无效"** —— 后者比前者难发现得多，
且会让后续技术决策（是否引 ffmpeg / 拍号与分段表是否可信）建立在伪证据上。

### 38.2 通用判据（ADR-019）

> 任何**测量/评估类实现**必须满足以下四条，否则其输出不得作为决策依据：

1. **期望值只能是输出，不能是输入**。允许事后盲比对（不匹配是**发现**）；禁止用期望值参与选择。
2. **判定规则必须预注册**：规则先于结果存在。否则只是把"按 A 挑"换成"按 B 挑"，偏倚换位而非消失。
3. **必须报出边际**，让读者看到结论**有多决定性**，而不是只看到点估计。
4. **必须有已知答案的对照**（合成信号 / 变异测试）：例如造一个**故意含强二倍频**的已知 BPM 信号，断言恢复正确**且不偏好二倍**；再加一条"把偏好改成二倍则测试必须失败"。

**推论**：凡"测量结果异常地吻合期望"的场合，先**假设测量无效**并去查选择/过滤环节，
而不是先庆祝结论。

### 38.3 t13 审计结论（`frontend-ds` 接手后自查，captain 已复核）

- ✅ 前任 WIP 是**真货**：`tools/library-analysis.py`（26,982 字节；spectral-flux 起音包络 + tempogram + 40–250Hz 低频重音拍号 + BS.1770-4 门限 LUFS）；`apps/api` **149 passed**。
- ✅ **分段法与 §19.2 逐条一致且与拍号无关**：±1.5s 窗口吸附最强起音、越界收紧 1.5→1.0→0.5；每边界留 `onsetStrength/percentile/windowP90/significant`；三首内边界均在 **94.8–100 分位、5.9–13.5× 窗口 P90**，段长全在 [15,30]。**这部分方法无需改。**
- ❌ 上述 §38.1 第 2 行的选择偏倚（真实缺陷）。
- ⚠️ 连带：拍号（4/3/4）建立在该 BPM 网格上 ⇒ `Rains=3` 与官方"唯一圆舞曲"吻合**只是提示，不是独立证据**。
- ✅ 澄清非缺陷：`Rains` 的 `significanceGate=0.0` 属设计内（包络稀疏）；真正生效的是"≥1.2× 窗口 P90 且 ≥0.02"，实测 5.9–13.5 倍。

### 38.4 处置（captain 批准的方法计划 + 五条硬化）

**A** 速度选择改**纯音频**（按细调梳状得分选；倍/半速用**预注册**规则消歧；打印**两分支分数与边际**；官方偏差降为**输出项**）
→ **B** 拍号在该 BPM 上重算并**标注"以 A 为条件"**，边际小时**报边际而非单给结论**
→ **C** 分段用 A 的结果重跑并保留证据表，随后产出**给用户看的听感确认表**（每首 4 段起止秒 + 该边界 onset 分位 / P90 倍数 / 最终窗口宽度），**由 captain 带去让用户拍板，成员不自行定稿**。

五条硬化：① 预注册消歧规则；② 每首都报边际；③ 官方值仅作输出/盲比对，不匹配是发现而非调参理由；
④ 合成信号 + 变异负向对照；⑤ 确认表必须带证据列。

**另**：`tools/library-analysis.py` 是开发期工具（不进运行时依赖），**但它是分段表的来源凭据**，须随交付纳入仓库。

### 38.5 会话失败处理（呼应 §37）

`audio-engineer` 会话失败后，其 t13 WIP 由 `frontend-ds` **以"默认未验证"为前提独立审计** ——
结果证明 WIP 大体可用（仅 1 处 TS 错误 + 1 处方法缺陷），**未采取整体回滚**，资产得以保留。
→ 印证 §37.4：**失败会话的产出默认未验证，但"未验证"不等于"该删"；先审计，再决定保留/修补/回滚。**


## 39. t11（黄金路径页面）收口 = 第一个 P0 切片 + ADR-019 第三次实例

### 39.1 交付与 captain 核验

| 项 | 结果 |
| --- | --- |
| 产物 | 12 个页面 + 外壳（`route-view`、`shell/{routes,router,router-context,app-shell,async-boundary,link-styles}`）+ `features/api`（client 契约校验 / errors 错误→中文文案+出口动作 / queries / mutations）+ `features/{bottle,session,profile}` + `tools/golden-path-live-check.mjs` + `docs/T3.2-manual-verification.md`；62 新文件 / 6545 行 |
| 全仓测试 | **shared 231 / api 149 / web 353** 全绿（exit 0）；typecheck 0；lint 0 |
| 页面 | `apps/web/src/pages` 下 12 个页面 tsx 在位 |
| 成员自查修掉的 3 个真实缺陷 | ① 账号错误 envelope 解析丢码（`AUTH_ERROR_CODES` 不在领域词表 ⇒ `/api/auth/*` 的 409/422 **丢 code**，页面只能说"请先登录"）→ 同时尝试 `AuthErrorResponseSchema`；② `URL.createObjectURL` 不可用会**整页崩** → 本地回放容错；③ 未登录仍显示「录制/放回」按钮（点了必然 401）→ 改为 `authed` 才展示，并把"会话接口 5xx"与"确实没登录"**分开呈现** |

### 39.2 🚩 captain 复现发现的两个可复现性缺陷（**ADR-019 第三次实例**）

**1a. `apps/api` 的 `start`/`dev` 不加载 `.env`**
`db:migrate` 用了 `tsx --env-file-if-exists=../../.env`，而 `start`/`dev` **没有**。
⇒ 照 README 操作（复制 `.env.example` → migrate → 起服务）会落到 **dev 降级分支**：DB 相关路由族**全部不挂载**，
`GET /api/songs` 返回 **404**。**captain 首次复现即撞上**，且其启动日志已明确告警。

**1b. `golden-path-live-check.mjs` 非 hermetic**
captain 在环境正确后复现：**第 15 步断链** ——
`✗ C 应捞到同一支瓶子`（随机捞取返回了**别人的**瓶子），**其后 11 项失败全部同源于这一个原因**（后续步骤都在错误的瓶子上操作）。
根因：dev 库混有其他测试残留瓶子（脚本自己第 10/20/26 步也承认「河道可能有别人的瓶子」「共 7 件」）。

> **结论：该检查的通过与否取决于环境运气 ⟹ 它上一次"26 步全过"不构成可复现证据。**

**与 ADR-019 的关系**：这是同一模式的第三次实例，但形态是新的 ——
前两次是"**测量实现自我印证**"（误差方向趋向更好看 / 候选按期望值挑选），
这次是"**检查的通过取决于未被控制的先决条件**"。**补救同源**：先决条件必须显式且受控（hermetic），
否则一次幸运的通过会被误读为验证。

### 39.3 处置

- 已开 **`t19`**（repair，sourceTask t11，assignee `backend-core`）：
  - **Part 1（优先）** 1a 给 `start`/`dev` 加 `--env-file-if-exists=../../.env`；1b 让 live-check **复用 `apps/api/src/db/test-database.ts`** 的机制（派生 `music_drift_test_<epoch>_<后缀>` + 建库/清理/超龄回收）在自己的**可抛弃库**上跑，**要求连续两次全过**（当时 26 步；§41.5 追补第 27 步后为 **27 步**）；
  - **Part 2** 新增 `GET /api/me/bottles`（P0 缺口，见 39.4 裁决 1）；
  - **Part 3** `apps/web/vitest.config.ts` 的 `testTimeout` 提到 15s（§35.4 的 5b 指纹：`showcase.test.tsx` 单跑 3.3s、满载逼近默认 5s）。

### 39.4 三项裁决

1. **「我的漂流瓶」暂用本机 localStorage 书签**：**接受为临时态**（UI 文案已如实写明"换浏览器看不到"），
   但 `CONTEXT.md` §11.1「漂流日志：个人中心展示用户参与过的所有漂流瓶」是 **P0 特性** ⟹
   **已把 `GET /api/me/bottles` 写入 t19**，由 `t12` 消费以替换 localStorage。
2. **「点踩」按钮**：**暂保留说明气泡**（隐藏需改 `features/audio`，属他人文件）；
   **`t12` 必须接线真实投票**（P0：分段点踩 + 听满 80% 门槛）；`SegmentPlayer` 透出 `listenedRatio` 的小改动由 captain 协调属主。
3. **`docs/architecture.md` 依赖登记一行**：**合规，批准** —— 依据 AGENTS.md §7.3，由**引入方**登记依赖（名称+版本+用途+归属任务），无需转交 architect。

### 39.5 切片状态

**t11 = 第一个 P0 可演示切片，代码与自动化测试验收通过；端到端 live-check 与浏览器目视/真机录音待闭合。**
待闭合项：`t19` 的 Part 1（让 captain 能在干净环境复现 live-check 全过；当时 26 步，§41.5 后为 **27 步**）+ **用户/t14 的目视与真机录音**（清单在 `apps/web/docs/T3.2-manual-verification.md` §4）。


## 39bis. t19：验证路径本身也要可复现（ADR-019 第三次实例的处置）

§39.2 记录的两个缺陷，t19 已修完。这里留**可复核的口径**，避免以后又靠"我记得当时是绿的"：

| 缺陷 | 病根 | 修法（结构性，不是"记得"） |
| ---- | ---- | -------------------------- |
| `pnpm --filter @music-drift/api start` / `dev` 读不到根 `.env` | 只有 `db:migrate` / `db:seed` 带 `--env-file-if-exists=../../.env`；服务脚本没带 ⇒ 走"无 DB 降级"，DB 路由全不挂、`/api/songs` 404，**症状像代码坏了** | `start` / `dev` 补同一 flag；`apps/api/src/scripts.test.ts` 守卫（启动/连库脚本必须带 flag，纯测试脚本不许带） |
| `golden-path-live-check.mjs` 非 hermetic | 直接跑在 dev 库上，而"河道随机捞取"会捞到别人的瓶子 ⇒ 第 15 步断链、其后 11 项失败同源；**通过与否取决于环境运气**（同机同代码：实测 3 次里 1 次 exit 1、2 次 exit 0） | 脚本默认**自建可抛弃库**（复用 `db/test-database.ts` 的派生 + `global-setup.ts` 的建库/迁移 + `seed.ts`）并在**空闲端口**自起 API，跑完删库；`API_BASE` 显式给出才走"外部模式"（并在输出里标注"非验收证据"）。`apps/api/src/db/live-check.ts` 提供 `create` / `drop` / `sweep`，删库前过 `isDerivedTestDatabaseName` 前缀守卫（开发库/共享库**结构性**不可删） |

**由此固化的一条判据**：端到端检查的**输入**必须由检查自己掌控（自己的库、自己的种子、自己的进程）。
"跑在别人的环境上、结果碰巧是绿的"不构成证据；一旦它的分支永远走不到（例：第 26 步旧写法
"捞到就放回"会刷新冷却计数 ⇒ 80 次全是 200，从来复现不出 409），那比红更危险 —— 红至少会说话。

## 40. 切片验收门禁无法用「派发时机」实现（captain 计划缺陷）+ t11 文档更正

### 40.1 缺陷：`AGENTS.md` §6 的门禁被调度器绕过

**规则**（`AGENTS.md` §6）：「切片内所有任务绿灯 → 由 captain 向用户汇报并**停下等验收**。**验收前禁止开始下一个切片**。」

**实际发生**：`t11` 置 `completed` 后，captain 向用户发出验收请求并同时通知 `frontend-flow`「保持 idle、不要 claim `t12`」。
但**调度器在那一刻已经把 `t12` 派发并 claim 了**（`t12 claimed frontend-flow attempts=1`）——
captain 的"保持 idle"指令**在送达时即已过期**。

**定性：captain 的计划缺陷。** 我把门禁寄托在**派发时机**上，而**调度器只按依赖是否完成来决定派发**：
它看到 `t11 completed` 就认为 `t12` 就绪。

### 40.2 补救（通用）

> **门禁必须由 DAG 表达，而不是由"何时派发"表达。**

具体做法：下一片的任务应**依赖一个语义上的"用户验收"节点**，该节点**只由 captain 在拿到用户答复后才完成**；
在完成之前，下一片在结构上是"未就绪"，调度器自然不会派发。
（本会话尚无此任务类型，但机制上等价：把下一片设为依赖一个 captain 持有的占位任务，或干脆**在验收通过后才创建下一片任务**。）

**推论**：凡"需要在某个外部事件后才允许开始"的任务，都必须**显式建模成依赖**，
否则任何基于"我记得先别派"的约束都会在并发调度下失效 —— 这与本会话反复出现的
「**不靠人记住，要做成结构性不可能**」是同一条原则。

### 40.3 成员主动撤回自己交付物里的不实声明（captain 记录）

`frontend-flow` 在得知"26 步全过不构成可复现证据"后，**主动回头修改了自己的交付文档**
（`apps/web/docs/T3.2-manual-verification.md` §3 顶部加「可复现性更正」：脚本非 hermetic、
`DATABASE_URL` 是手工绕过 `start`/`dev` 不加载 `.env` 的临时手段、可复现结论以 t19 为准），
理由是「留着『✅ 26 步通过』会污染后续验收与 ADR-019 的口径」。

**captain 评价**：这是**正确的动作** —— 错误一旦留在仓库里就会成为长期记忆，
**口头认错不能替代把不实声明从交付物中撤除**。

**⚠️ 但 captain 复核发现更正不完整**：§3 已更正，而 **§1「一句话结论」仍写着「已跑通 26 步（见 §3）」** ——
**它指向的 §3 恰恰在否定这句话**。已要求其改正，并给出自查法：
> **更正一处断言后，全文搜一遍那句被否定的原话，确保没有第二处还在说它。**
（§1 恰恰是最容易被读到的结论段 —— **更正写在深处、结论留在明处，等于没更正**。）


## 41. 两项新判据 + t19/t13/t12-0 收口

### 41.1 判据：「断言太软的守卫只会点头」（`backend-core`，t19 自找的缺陷）

第一版 `dev` 脚本写成 `tsx --env-file-… watch src/server.ts` ⇒ **tsx 把 `watch` 当成入口模块** ⇒
`Cannot find module 'apps/api/watch'` ⇒ **`dev` 根本起不来**；而**它自己的守卫照样通过**
（守卫只断言"包含 `watch` / `src/server.ts` / flag 三个片段"）。

> **一条只检查"关键词都在"的守卫，与一条不存在的守卫，在"阻止错误命令"这件事上等价。**

**修法**：守卫改为**钉死完整命令**；负向对照（插回错误顺序 → 2 例红；还原 → 5 例绿）。

### 41.2 判据：「分支永远走不到的检查比红更危险」（`backend-core`，t19 发现的旧缺陷）

live-check 旧第 26 步「捞到就放回」会**刷新自己的冷却计数** ⇒ 80 次尝试全部返回 200 ⇒
**永远复现不出 409，却一直显示通过**。

> **红的检查会被人看；永不失败的检查会被当护栏供着。**

**修法**：改为「捞到即持有、不放回」⇒ 现在真的断言到 `409 NO_BOTTLE_AVAILABLE`。
**推论**：任何检查都要问一句 —— **它的失败分支在现网数据下是否可达？** 不可达则等于没有该检查。

### 41.3 t19 收口（captain 独立复核）

| 项 | 结果 |
| --- | --- |
| Part 1a `start`/`dev` 加载 `.env` | ✅ captain 复核：**不 export `DATABASE_URL`** 时 `/api/songs` = **200**，「未配置 DATABASE_URL」出现 **0 次**（此前 captain 复现为 404） |
| Part 1b live-check hermetic 化 | ✅ captain **亲自连跑两次**：均 **exit 0 / 全过**（当时 26 步；§41.5 追补第 27 步后为 **27 步**）；每次自建 `music_drift_test_<epoch>_<pid>_<rand>`（种子 3 首/12 段）并 `[teardown] 删库` |
| 残留测试库 | ✅ captain 独立查（`docker exec music-drift-postgres`）→ **0** |
| `pnpm lint` / `pnpm -r typecheck` | ✅ exit 0 / exit 0；此前 `frontend-flow` 观察到的 1 处 `no-useless-assignment` 已消失（属 t19 在途） |
| **官方值的独立性** | ✅ 选择路径**不读** `official_bpm`；偏差在测量后计算 |
| Part 2 `GET /api/me/bottles` | ✅ `MyBottleSchema` = `BottleSummarySchema` + `role` + `mySegmentIndexes`，**既有字段零改动、版本不提升**；语义：参与过 = 发起或唱过（**判据取 `events` 而非投影** —— 投影会被斩浪改写，事件流不会）；**被斩浪仍算参与过** |
| Part 3 web 超时 | ✅ 路径按**意图**落在合法位置（新建 `vitest.config.ts` 仅"继承 `vite.config.ts` + 覆盖超时"）；负向对照：testTimeout 改 1ms → **33 例红** ⇒ 配置真被加载 |
| `backend-core` 独立复现 captain 的结论 | ✅ 旧脚本对同一 dev 服务连跑 3 次 → **exit 1 / 0 / 0**，失败那次指纹正是「✗ C 应捞到同一支瓶子」+ 连锁失败（ADR-019 第三次实例的**独立复现**） |

**captain 追加裁决**：① **加第 27 步**（`/api/me/bottles` 端到端检查）并同步全文步数表述，覆盖 `role`/`mySegmentIndexes` 含"斩浪后仍算参与过"；
② 外部模式**保留但不作验收证据**（醒目横幅 + 非确定性步骤单列「未复现」不计 pass + 文档写死「验收证据只认 hermetic 模式」）——
理由：**能让"环境运气"影响结论的检查，不能写进验收口径**。

### 41.5 t19 追补已落地（step 27 + 外部模式三条约束）

| 裁决 | 落地 | 可复核口径 |
| --- | --- | --- |
| ① 加第 27 步 | ✅ live-check 现在 **27 步**：第 27 步 = `GET /api/me/bottles`，用 A/B/无关者三个会话分别断言 `role`（INITIATOR / SINGER / 看不到），并**真的造一次斩浪**（10 个不同用户点踩 → 锚被斩 → DAMAGED）后回头断言「**仍出现在日志里**、`role` 不变、`mySegmentIndexes` 变空」 | hermetic 连跑两次均 `exit 0`、结语 `27 步`；`apps/api/src/db/live-check.test.ts` 静态钉住"脚本里有这一步 + 覆盖 role/mySegmentIndexes/斩浪 + 全文无残留 26 步" |
| ② 外部模式不作验收证据 | ✅ 三条硬约束：**(a)** 跑任何检查**之前**先打醒目横幅「⚠ 外部模式 · 非验收证据」；**(b)** 非确定性步骤走 `unreproducible()` → 单列「未复现（数据不受控）」，**不计 pass**、也不硬判失败（硬判会随环境随机红，而**会随机变红的检查会被训练成被忽略的检查**）；**(c)** 脚本注释 + `docs/api.md` §2.9 写死「**验收证据只认 hermetic 模式**」 | `live-check.test.ts` 钉住横幅文本与其在 `runChecks()` 之前的顺序、`inconclusive` 计数存在、以及 hermetic 模式下「未复现」**必须升级为失败**（数据受控时没有借口） |
| 外部模式的**实测教训**（补记） | 演示时 `API_BASE=http://localhost:8787` 打到的是一个**早于本次改动启动的旧 dev 进程**：第 27 步 `GET /api/me/bottles` 直接 404（Fastify 默认信封），其余步骤照常"绿"。这比"数据脏"更隐蔽 —— **外部模式连"你测的是不是当前代码"都无法保证**，所以"验收证据只认 hermetic 模式"不是保守，是必须 |
| 步数表述同步 | ✅ 脚本头部/输出、`docs/api.md`（§2.9 + 变更记录）、`docs/architecture.md` §39bis/§41.3 全部改为 27 步；**历史引用**（§39.2/§39.3 引述 captain 当时那句"26 步全过不构成证据"、以及"第 26 步旧写法"）**刻意保留原文并就地标注当时口径** —— 改历史会让"为什么当初不算证据"这段推理失真 | 全仓 `grep -rn "26 步"` 只应命中历史引用（已标注）与 `apps/web/docs/T3.2-manual-verification.md`（t11 的文档，**不在 t19 边界内**，已上报 captain 转派） |

**又一条可复用判据**：**检查的"模式"必须自己声明证据效力**。同一份脚本在两种模式下产出的输出长得几乎一样，
差别只在"库是谁的" —— 因此横幅、结语免责、以及"未复现不计 pass"这三件事不是装饰，
而是让**读者不可能误用**这份输出的最小结构。

### 41.4 t13 A/B/C 收口（captain 复核 + 裁决）

**ADR-019 的修复已按五条硬化落地**，其中最关键的证据是**预注册的时序可被第三方复核**：
`docs/library-analysis.md` R-1…R-6 + mtime 时序（文档 02:57:20 → 规则两次修订 03:15:05 → **首次真实测量 03:22:36**）；
且**两次修订的动因是合成对照失败，而非"结果不符合期望"**。

**面对真正不可判定的情形，处理方式成为范式**：`log1p` 压缩抹平强弱拍能量差 ⇒「100 还是 200」**数据上不可判定**
（S-2 实测 r_finer≈0.70 落在僵持带）⇒ **不假装能判定**，而是**预注册一个与期望值无关的约定**（打拍带 [60,120)），
并**把"约定被触发"显式写进输出**（`conventionApplied`）。
> **面对不可判定：声明约定并公开它，而不是选一个"看起来对"的答案。**

**其自纠两处**：第一版选择器**只测向上方向**（永远发现不了"选定层级其实是细分"）→ 被**合成对照**逼出，改双向；
**S-2 曾"假通过"**（靠并列名次插入顺序侥幸命中）→ 自判"不能算通过"，补 R-4b 与变异开关（S-3 反转约定带 → 得 200 → 原断言失败 ⇒ 真有牙齿）。
> **推论：对抗自欺最有效的工具是「已知答案的对照」，而不是更仔细地读代码。**

**三段诚实框定（captain 接受）**：三首的包络 argmax 均落在 42–64 BPM（与官方 Tempo 差一个八度），
**偏差接近 0 是约定依赖、不是独立验证**；`On the Shore` 同八度内仍有 **+2.94%** 真实差异；
**没有为迎合官方值调过任何参数**。`Rains Will Fall` 判 **3/4**（边际 86.6%）与官方描述一致，标注为**旁证而非独立证据**。

**captain 裁决（字段准入）**：**不授权**把 `tempoDecision` 并入 `packages/shared` 契约 ——
按既有准入规则：**新增字段的理由必须是「有消费者要据此做不同的事」，而不是「这个数据有意思」**；
其审计价值已由 `docs/library-analysis.md`（预注册 + 时序证据）与 CLI 输出满足。
**复审触发条件**：若将来有 UI 需要展示节拍判定依据，届时再加。

### 41.5 t12 0️⃣ 收口（设置页 CC BY 4.0 署名）

✅ **署名不依赖该查询**：作者/来源/许可名/许可链接是**编译期常量**，元数据读不到时署名块**照旧渲染**、只缺逐首曲名。
> **授权义务不能因为一个 fetch 失败而消失。**

TDD 先红（2 例）后绿；桩用**真资产** `public/library/library.json`（顺带钉住它过 `LibraryMetadataSchema`）。
未碰 `features/audio/**`、未碰契约、未加封面。

**文档更正已修完**：§1 改为「已复现到第 14 步」，§3 表头标注「当时环境下的观察，不是通过证据」，
并按 captain 给的自查法**全文 grep** 确认无第二处仍主张通过。
> **判据：更正一处断言后，必须全文搜一遍那句被否定的原话 —— 更正写在深处、结论留在明处，等于没更正。**


## 42. t12 1️⃣ 收口：通知写入路径（含两处 captain 批准的自加口径）

### 42.1 位置选择（captain 认可，属结构性覆盖）

通知是**事件的投影**：写在 `applyOutcome` **同一事务**里，且在 `projectBottleRow` **之前**调用
（后者会把 PENDING 留言一次性改终态，通知必须在改之前读收件关系；captain 已核 `store/bottles.ts:304/307`）。
放在**投影层而非路由层** ⇒ **系统触发的入海（超时等）也自动覆盖**，不会漏。

> **判据：不靠"逐条路由记得写"，让遗漏在结构上不可能。**

### 42.2 三类 + 收件人

| 类型 | 收件人 |
| --- | --- |
| `MESSAGE_DELIVERED` | **发起者** |
| `MESSAGE_UNDELIVERED` | **发送者**（`CONTEXT.md` §5.2） |
| `BOTTLE_COMPLETED` | **仅有效段的参与者**（**不含被斩浪者**，发起者一视同仁）—— §46.1 用户裁决：被斩浪者一律不算参与过。判定收敛到内核 `participants(state)`（`packages/shared/src/domain/queries.ts:152`，本就是 `liveSegments`）；**禁止**在投影/通知层另写一份「参与者」SQL 规则 |

### 42.3 两处成员自加口径（**captain 均批准**，且认为优于字面实现）

1. **留言 PENDING 期间不发通知** —— 此时留言对发起者不可见（§5.1），提前通知＝**泄露未公开内容**。
   **这是隐私正确性，不是可选优化。**
2. **未完成作品进「等待接力」区不发 `BOTTLE_COMPLETED`** —— 说"已完成"是**撒谎**；
   且完整性用**内核**判定（事件流 + `replayBottle` + `isComplete`），**不在投影层数段数重写第二份"完成度"规则**。

> **判据：第二份规则必然与第一份漂移。**（与推翻"段号压缩"是同一个教训。）

### 42.4 顺带修掉 t9 的一处状态卡死

`BOTTLE_DAMAGED`（回传链断）原先**不终结** PENDING 留言 ⇒ 留言**永远停在 PENDING**，
而系统又要告诉发送者"未送达" ⇒ **两处真相互相矛盾**。已补：终结为 `UNDELIVERED` + 通知发送者。
> 这类"某分支没人走、状态就卡死"的缺陷靠单测难发现，只能靠**把每个终结路径都想一遍**。

### 42.5 成员自曝的批量编辑事故 + captain 给出的防护

python 批量文本替换**静默删掉** `NOTIFICATION_TYPES.BOTTLE_COMPLETED` 键 ⇒ 入海时 `null value in column "type"`（500）。

> **防护：批量文本替换之后，先跑 `pnpm -r typecheck`，再跑集成测试。**
> 理由：typecheck 是"符号消失/类型不匹配"**秒级**的守卫；集成测试要起库、慢几十倍。
> **先跑快的守卫，能让同类错误在 10 秒内暴露。**

### 42.6 证据

`notifications-write.integration.test.ts` **7/7**（真库 + `app.inject`）：三类写入各断言"真库里真写了一行 + 收件人正确"；
送达/未送达分支互斥；非参与者**拿不到任何通知**；**被斩者仍收到完成通知**（含"斩浪→系统置回河道→补位→补齐→入海"完整链路）；
payload 带内核算出的 `isComplete` 与 `songTitle`；真响应全部 `NotificationSchema.parse`。
api 单测 18 文件/168；集成 18 文件/**135**（t5/t7/t9 原有集成全绿 ⇒ **投影改动零回归**）；web 48 文件/**367**；typecheck 3/3；eslint 0。


## 43. t19 追补落地 + 四条由本轮导出的判据

### 43.1 第 27 步：`GET /api/me/bottles` 端到端检查（captain 已亲自复跑）

captain 独立执行 → **27/27，exit 0**；输出：
```
[27] 我的漂流日志（/api/me/bottles） — A=INITIATOR 段[1] · B=SINGER 段[2] · 无关者看不到 · 斩浪后仍列出且段号变空（status=DAMAGED）
✅ 黄金路径真实链路检查通过（27 步，4 个账号，真库 + 真 HTTP + 真音频字节）
   结论来源：hermetic 模式（自己的库 + 自己的种子 + 自己的进程）⟹ 可作验收证据。
```
覆盖 captain 点名要的两点：`role`（INITIATOR/SINGER）+ `mySegmentIndexes`，并**真的造一次斩浪**（10 个不同用户点踩第 1 段 → 锚被斩 → `DAMAGED` → 回头查日志断言"**仍列出、`role` 不变、`mySegmentIndexes` 变空**"）。

**脚本自报"证据等级"**（说明本次跑的是 hermetic 还是外部模式）是一个好设计 —— **让读者不必自己推断结论的可信度**。

### 43.2 判据：「同步表述」≠「改写历史」（**captain 更正自己的过头要求**）

captain 曾要求"别留下第二处还写 26 步"。成员指出并坚持：那句针对的是**仍在主张"通过"的断言**，
而**不是历史记录**（§39.2/§39.3 引述"当时声称 26 步全过"与"旧第 26 步捞到就放回"，是**推理链的一部分**）。

> **正确判据：同步"仍在主张通过"的表述；历史推理保持原样、就地标注。**
> **改写历史会让"为什么当初不算证据"这段推理失真。** 另：「第 26 步」这个**步号本身仍然正确**（新步插在其后，编号 27）。

captain 采纳该更正，并据此转派 `apps/web/docs/T3.2-manual-verification.md` 的同类修正。

### 43.3 判据：「静态断言只能证明『写了』，只有真跑能证明『跑得通』」

第 27 步的 6 条静态断言（脚本里必须有该步 / 覆盖 role·mySegmentIndexes·斩浪 / 全文不得残留"26 步" / 横幅在 `runChecks()` 之前 / `inconclusive` 独立计数 / hermetic 下"未复现"必须升级为失败 / `docs/api.md` 写死 hermetic 口径）→ **6 红 → 实现 → 14/14 绿**。

**但真跑之后才抓到两个静态断言抓不到的 bug**：
1. 10 个点踩者用了**同一个 `handle`**（`stamp` 只在进程启动时算一次）⇒ 第二次注册起全部 **409** ⇒ **连锁 30 项红**；
2. `API_BASE=`（**空串**）被当成"给了外部模式"（CI 里 `API_BASE=$UNSET_VAR` 很常见）⇒ 已改为空串等同未设置，回到 hermetic。

> **判据：能"写出来"的检查，与能"跑得通"的检查，是两件事；静态断言挡不住后者。**

### 43.4 判据：如何对待「无法复现的失败」——**加仪器、隔离嫌疑、不声称修复、不掩盖**

事实：加诊断**之前**，8 次里 1 次红 —— 第 19 步 `C 入海` 返回**错误信封**（`status=undefined · seaZone=undefined`），其后 5 项**连锁失败**（都是"作品没进公海"的后果）；此后 **16 次全绿**（含并发/负载），**未复现**。

成员做了三件事，captain 采纳为标准动作：
1. **加自报告诊断**：失败时打印最近 8 次请求的**响应体原文** + API 服务端日志末 20 行（**5xx 堆栈只在那里**）；
2. **把嫌疑接缝单独压测**（"D 回传 → 新持有者 C 立刻选去向"）：`returnHandoff.integration.test.ts`，同进程 12 轮完整 4 段接力全绿；
3. **不声称已修**（没有根因就没有修复）、**不加自动重试**（重试会把真 5xx 掩盖成绿）。

> **判据：不可复现 ≠ 噪声。正确做法是「加仪器 + 隔离嫌疑 + 不声称修复 + 不掩盖」；加重试是最坏的一种"处理"。**

**captain 登记为开放性风险**：该偶发**未闭合**，不得向用户声称流水线无瑕疵。
（据此，切片验收说明须列"已知未闭合项：第 19 步偶发，已加仪器，待再现"。）

### 43.5 外部模式的最强反例：它连"你测的是不是当前代码"都不保证

成员实测：对着一个**早于本次改动启动的 8787 旧服务**跑外部模式 ⇒ 第 27 步直接 **404**（`Route GET:/api/me/bottles not found`）。
> ⇒ **外部模式不仅受环境数据影响，还可能跑在旧代码上。**

**裁决已落地**：外部模式打印醒目横幅「**非验收证据**」+ 非确定性步骤单列「**未复现（数据不受控，不计入 pass）**」+ **hermetic 模式下同一处必须红**（数据受控时"复现不出来"只能是检查自身的问题）+ 文档写死「**验收证据只认 hermetic 模式**」。

### 43.6 附：当前 `pnpm -r test` 整体红的归因

来自 **t12 在途**（`apps/web/src` 25 处在途：新增 `my-bottles.*`/`notification-list.*`，删 `remembered-bottles.*`/`bottle-index.*`；剩余失败为 `home-page.test.tsx` 的 `Transform failed` 在写中间态）。
成员做了 **A/B 隔离**自证：临时移走 `vitest.config.ts`（回落 `vite.config.ts`）→ **12 文件失败**；装回 → **1 个**（在途文件），其余 364/364 全过。
⇒ **15s 超时配置是在压掉这类噪声，不是制造它。** 属 §27.1 第 2 类（在途红灯），非缺陷。


## 44. t12 3️⃣/4️⃣ 收口 + §9.1 真实缺口 + 两条新判据 + 「未完成清单必须落仓库」

### 44.1 3️⃣ `/api/me/bottles` 替换本机书签（完成）

`useMyBottles()`（契约**直接取包根** `MyBottleListSchema`，**未手写第二份类型**）+ `features/bottle/my-bottles.tsx`（角色 / 我唱的段号 / 缺口 / 两个入口，三态走 AsyncBoundary）。

**并且删掉了整套旧机制**：`features/profile/bottle-index.ts`、`remembered-bottles.*` 及其测试、三处 `rememberBottles(...)` 写入
（captain 核实文件已不存在）。首页改为：登录 → 服务端列表；未登录 → 登录引导。

> **判据：「替换一个机制时，要删掉旧机制，而不是让它继续存在。」**
> 理由：服务端口径已覆盖旧机制的全部价值（换浏览器也在 + 被斩仍算参与过），**留着就是第二个真相源，
> 而第二个真相源必然与第一个漂移**（与推翻"段号压缩"同一条教训）。

### 44.2 4️⃣ `/admin` 审核台（主体完成；含 captain 点名要的「不是半成品」）

- 契约：`ReportSchema` / `ReviewDecisionRequestSchema` / `ReportActionSchema` / `ReportStatusSchema`；
  `API_RULE_CODES` 增 `REPORT_ALREADY_REVIEWED`、`REVIEW_ACTION_NOT_APPLICABLE`（按准入规则成立：客户端需据此刷新队列/改选动作）。
- DB：迁移 `0002`（`users.banned_at`）、`0003`（`reports.action` 允许 `RESTORE_SEGMENT`）。
- 真实流转：`NONE` / `REMOVE_SEGMENT` / `RESTORE_SEGMENT` / `REMOVE_BOTTLE` / `BAN_USER`；`GET /api/admin/reports?status=`；
  **业务动作落事件流**（新模块 `store/moderation.ts`）。前端 `/admin`：**非管理员不渲染队列、也不打接口**。
- **captain 点名要求的那条已达成**：`admin.integration.test.ts:286` 标题即「被自动斩杀的段经管理员 `RESTORE_SEGMENT` 后**真的回到有效段**（不是只改举报状态）」，
  断言：旧行保持软删（**审计那一刀真发生过**）+ **同一段号**上出现新的有效段 + `octet_length(audio) > 0` + `missingSegmentIndexes` 不再含该段（captain 已核）。

证据：`admin.integration.test.ts` 9/9；api 集成 19 文件/145；api 单元 168；web 50 文件/377；`typecheck` 3/3；`eslint .` 0。

### 44.3 两条由测试逼出的新判据（captain 采纳）

**判据 A：「投影不是真相，事件流才是。」**
成员第一版用 `update bottle_segments set deleted_at` 做人工裁决 ⇒ 测试当场抓住：
**接口返回 200，但 `missingSegmentIndexes` 没变** —— **表面成功、规则没变**，是最难自查的一类假成功。
改为事件流驱动（`SEGMENT_CUT`）后正确。
> 这与 §41.3 的「`/api/me/bottles` 的『参与过』判据取 `events` 而非投影」是**同一原则的两次实例**。

**判据 B：「给状态机加新动作时，枚举/CHECK 约束本身就是规格的一部分。」**
`reports_action_check` 把 `RESTORE_SEGMENT` 拒了 ⇒ **"审核台只有删、没有恢复"在 DB 层就注定失败**（迁移 0003 修）。
> 约束里少一个值，会让一个功能**在数据库层静默不可能**，而应用层代码看起来完全正常。

### 44.4 🚩 `CONTEXT.md` §9.1 是**真实缺口**（尚未实现）

`/api/bottles/:id` 仍返回**全部有效段** ⇒ **漂流中的参与者能看到后面是谁唱的、唱成什么样**，
直接违背 §9.1 原话「**看不到后面是谁、唱成什么样**」。
**严重性**：评审只要点开一个漂流中的瓶子，就能看见产品违背自己的设计 —— 比"少一个按钮"严重。

**captain 裁决：把 §9.1 排到 t12 剩余项的第一位**（先于 2️⃣ 点踩接线）。
理由：**§9.1 是"行为错了"，2️⃣ 是"功能缺了"；先把错的改对，再加新的**；且成本更小。

**实现要求**：裁可见性必须**同时覆盖三条读取路径**，漏一条等于没裁 ——
`/api/bottles/:id`（详情）、**`/api/bottles/:id/events`（事件流带 `actorId`/`segmentId`，更易泄露"后面是谁"）**、以及任何返回段的投影查询；
并且要有**成对测试**：「漂流中看不到后续」+「入海后能看到全部」（§9.2 解锁完整接力链）。

### 44.5 判据：「成员的未完成清单必须落在仓库里，不能只存在于聊天」

成员主动写了一份"未完成清单（每项含落点与依赖）"并说"若上下文耗尽，这就是交接内容"。
**这提醒了一个真实缺口**：§37 已记录 —— `audio-engineer` **会话失败**时，连"它以为自己做完了什么"都没留下。

> **判据：成员的自述若只存在于聊天消息，就会随会话失败一起消失。未完成清单必须落进仓库。**

⇒ captain 已将该清单镜像到本节，并**要求成员在每次回报里继续携带**（captain 同步更新）。
**当前 t12 剩余项（captain 镜像，顺序已按 §44.4 调整）**：

| # | 项 | 落点 / 依赖 |
| --- | --- | --- |
| 1 | **§9.1 漂流中不可见后续**（真实缺口） | `/api/bottles/:id` + `/events` + 投影查询；成对测试 |
| 2 | **2️⃣ 点踩投票接线** | `SegmentPlayer.onProgress` → `SegmentListenSnapshot`；mutation + 409/422 文案分支 + 测试 |
| 3 | 私密留言 UI | 写入入口 + 可见性 + 未送达状态（通知写入已由 t12 1️⃣ 完成） |
| 4 | 收藏 / 徽章 / 指定接唱 页面接线 | API 均已存在 |
| 5 | 完整接力链展示增强 | 点赞/点踩计数 |


## 45. 用户四项裁决（2026-09-23）+ 视觉基线证据 + 一条可复用的 CSS 判据

### 45.1 裁决一：**被斩浪不算参与过**（反转既有决定）

用户裁决：**被斩浪者不算该瓶子的参与者**（此前批准的是"仍算参与过、`mySegmentIndexes` 变空"）。
**连锁影响**：`/api/me/bottles` 的参与判定、`BOTTLE_COMPLETED` 通知收件人、徽章判定、§16.7 表述。

**captain 补充界定（待用户可否决）**：**判定改为「被斩的接唱者不算参与过」**；
**但发起者即使第 1 段被斩（作品 → `DAMAGED`），仍算发起者、仍出现在自己的漂流日志里** ——
否则「我的瓶子漂到哪了」（§11.1）会把发起者的线断掉。

### 45.2 裁决二：**保持每瓶代号**（§12.1 不变）+ 个人中心去掉代号块

用户裁决：**保持现状**（每个瓶子一个不同代号，`anon_codes` 模型不变）；
**并且个人中心里不需要「你的匿名代号」的部分**。

> ⚠️ **由此暴露一个建模矛盾，captain 已上报**：Figma 的**侧栏用户卡**（`212×72`：40×40 头像 + **代号** + 等级）
> **预设了一个"稳定的个人代号"**。而按 §12.1（每瓶不同代号）+ 用户"个人中心不显示代号"的裁决，
> **系统里根本不存在"你的代号"这个东西** —— 侧栏卡上那一行无法填。
> → captain 的处理：**侧栏卡同时去掉代号行**（保留等级/身份位），并**列入需用户审批的"偏离 Figma"清单**。

### 45.3 裁决三：投下漂流瓶 = 与捞起**等权**

「投下漂流瓶」**已存在**（首页有「选一首歌，投出第一棒」次按钮）；
缺口是**分量不对等**。captain 计划：**河道页做成两个并列等权主区（捞起 / 投下）**，投下 → 选歌 → 录第 1 段 → 确认投河。

### 45.4 裁决四：视觉返工（用户定为最高优先）

**用户批准**：**按 Figma 的 1440 满宽**；`DESIGN.md` 的「`Max-width containment: 1280px centered`」**降级为"超宽屏（>1440）时的内容列上限"**
（这是一条**核心纪律的修改**，故必须经用户批准 —— 已批准）。

**Figma 布局契约（captain 从 `docs/figma/frames/4-43--home-river.md` 提取，硬约束）**：
```
sidebar 260×900 · column · gap 48 · padding 40/24
main-content 1180×871 · column · gap 32 · padding 40/48/250/48
  ├── header-row 1084×50                    （H 24/600 + 副标 14/400）
  ├── hero-fishing-zone 1084×517 · padding 48
  │   └── ripple-system 240×240（240/180/130 三层涟漪）+ master-pick-btn 110×110
  └── mood-filters 370×35 · gap 12 · padding 8/18（5 项，每项 64×33）
导航项 212×44；选中态＝填充底 + 字重 600 + 更亮文字色
```

### 45.5 新能力：captain 可自行截图（视觉验收的硬证据）

已安装 chromium（`npx playwright install chromium`，实测成功）。截图命令：
```
npx playwright screenshot --viewport-size="1440,900" --wait-for-timeout=4000 <url> out.png
```
**2026-09-23 实拍基线已归档**：`docs/ui-review/before-home-1440.png`、`before-home-375.png`（修复后的"after"图应与它们对照）。

### 45.6 captain 实拍确认的 4 个视觉缺陷

| # | 缺陷 | 根因（已定位） |
| --- | --- | --- |
| 1 | **375px 下主 CTA 文字竖排成一列**（一行一个字符） | `home-page.tsx:38-52`：按钮 `inline-flex`，**文字是裸文本节点** ⇒ 成为**匿名 flex item**，空间不足时**缩到 min-content（一行一字）** |
| 2 | 侧栏选中卡片**溢出侧栏列** | `design-system/sidebar-nav.tsx` 导航项未约束在 260 内 |
| 3 | **首页必须滚动** | Figma 的 `home-river` **只有三段**（＝一屏一动作）；我们多加了一整块「今日海面」列表（**该措辞源自 captain 在 DESIGN.md Use Case 里写的"首页（今日海面 / 我的瓶子）"**） |
| 4 | **Figma 招牌主交互被替换** | Figma 有**三层涟漪 + 110×110 主按钮 + 5 心情标签**；实现换成带边框的 CTA 卡片 |

> **可复用判据：「flex 容器里的裸文本节点会缩到 min-content（一行一字）。」**
> 凡"图标 + 文字"的按钮/hstack，**文字必须包在元素里并加 `whitespace-nowrap`**，或显式 `w-full`。

### 45.7 点踩/点赞的交互规格（用户口述）+ 一条新后端要求

用户要求：**点踩按钮过大**、**缺点赞**、**赞/踩后要有动画响应与变化**、**赞踩总数后端记录**、
**听过 80% 必须持久化（退出不清零）**、**80% 不常驻前端**（前端常驻的是赞/踩两个按钮）、
**点踩后再判定 80%：不满足→弹窗提醒；满足→点踩成功**。

**captain 的读法（已请用户确认）**：按 §7.1「点赞与斩杀完全解耦」⇒ **两种票都持久化，但驱动斩断的只有踩数**。

**新增后端要求**：**每 (user, segment) 的已听覆盖率要服务端持久化**（跨会话保留），
点踩时由**服务端**据此判定 80%（客户端上报只作增量输入，**判定权在服务端**）。

**交付方式（用户裁决）**：由实现方**先按 `DESIGN.md` 做一版**（守其纪律：圆角/动效物理/触控 ≥44px），
**再截"已赞/未赞/已踩/点踩被拒"等状态图给用户审批** —— 这是"偏离 Figma 需审批"流程的落地形态。


### 45.8 由裁决一/二/四派生的任务与排队项

| 项 | 归属 | 状态 |
| --- | --- | --- |
| **已听覆盖率服务端持久化 + 点踩 80% 由服务端判定 + 点赞落库** | `backend-core` | **`t20`**（implementation，已派发） |
| **视觉返工（外壳比例 / 首页按 Figma / CTA 竖排 bug / 投下等权 / 赞踩新交互）** | `frontend-flow` | 进行中（暂停 t12 其余功能项） |
| **裁决一「被斩浪不算参与过」的后端改动** | `backend-core` | ⏸ **排队**：该成员同一时刻只能持有一个未完成任务（现为 t20）。**需求已落 §45.1，不会丢**；t20 完成后派发 |
| **「§9.1 漂流中不可见后续」**（真实缺口） | `frontend-flow` | ⏸ 排队（视觉返工之后） |
| t12 其余功能项（2️⃣ 点踩接线 / 留言 UI / 收藏徽章指定接唱 / 接力链增强） | `frontend-flow` | ⏸ 排队（视觉验收通过后） |

### 45.9 「修回 Figma」与「偏离 Figma」的区分（本轮确立，供所有前端任务遵守）

用户规则：**前端排版按 Figma；任何修改必须他审批。**

> **判据：「修回 Figma」= 修 bug（合规，可直接做）；「偏离 Figma」= 设计修改（必须用户审批）。**

据此：
- **可直接做**：260 侧栏、212×44 导航项、不溢出、左对齐主内容、一屏不滚动、三层涟漪 + 110 主按钮 + 5 心情标签、CTA 竖排 bug、1440 满宽（已单独获批）；
- **须审批**：侧栏用户卡去掉代号行、首页移除「今日海面」列表、投下改等权、赞/踩新形态与动画（**以"四态截图 + 偏离清单"的形式送审**）。

---

## 46. 用户裁决（第九轮 · 停机前最后一次裁决，2026-09-23 08:41 记录）

### 46.1 被斩浪者一律不算参与过（**含发起者**）
用户原话：「连发起者也一并剔除」。
- 规则：被斩浪的段（`SEGMENT_CUT` / `DAMAGED{ANCHOR_SEGMENT_CUT}`）所属作者，**不论其是否为该瓶发起者**，该瓶一律不计入其「参与过」。
- 本条**推翻**上一轮 captain 提出的「发起者豁免」草案，以本条为准。
- 用户已知的代价：锚段被斩 → 瓶变 `DAMAGED`，该瓶也会从发起者自己的记录里消失。
- 影响面：`/api/me/bottles` 参与判定、`BOTTLE_COMPLETED` 接收者集合、徽章计数口径、`CONTEXT.md` §16.7 措辞。
- 状态：**排队**（backend-core 受「同时只能持有一个未完成任务」约束，当前 t20 未完成）。

### 46.2 公海列表必须真分页
用户原话：「公海的歌曲分页查询」。
- 现状缺陷（captain 本轮实测）：`apps/api/src/routes/sea.ts` 的 `/api/sea` 响应体**硬编码 `nextCursor: null`**，且该路由的内联 `SeaListQuerySchema` 只有 `zone`+`limit`、**不消费 `cursor`**；而 `packages/shared` 的 `BottleListQuerySchema` 已声明 `cursor`。
  → 第 4 类「静默损失」：契约声明了分页，实现永远只返回一页，且不报错。
- 要求：cursor 真消费 + 真 `nextCursor` + 前端分页控件；配合 46.3，一页内容必须能在**一屏**内呈现。

### 46.3 所有页面一屏装下，禁止下滑；声明式内容改弹窗
用户原话：「修改页面设计的组件大小、位置，让前端一页屏装下所有内容，不用下滑！（伴奏与授权这种声明式的内容可以在点击之后再弹出对应内容）」
- 范围：**所有页面**（首页 / 公海 / 我的 / 设置 / 瓶详情）；桌面优先（1440×900 为一等公民），375 做可用性适配。
- 声明式、非交互内容（伴奏与授权声明、曲库署名、规则说明、歌词/结构提示）**一律不占首屏**，改为点击后弹窗/抽屉，遵循 `DESIGN.md` 的 z-index 分层与 480ms 入场物理参数。
- 与 §45.5「拆掉首页『今日海面』列表」方向一致：首页腾出的空间给 Figma 的 ripple hero。

### 46.4 停机纪律（用户排程）
用户原话：「请你在9点记录下现在的工作状态并停止工作，在12点再继续开工」。
- 执行：写入状态快照目录 `docs/handover/`；成员完成**当前增量**后停机，不开始新任务；未完成清单必须落在**仓库**里，不能只存在于会话。
- 诚实边界（须向用户明说）：captain **没有定时器**，无法在 12:00 自行唤醒；恢复由用户在 12:00 回话触发。

### 46.5 三个前端 skill 为强制项
`frontend-design`、`afrexai-ui-design-system`、`css-animation-creator`（已确认位于项目 `.dsh/skills/`）。
- 前端视觉任务开工前必须逐个 load；
- 报告必须**引用具体用到的条款**（把「我调用了 skill」转成可验证声明），禁止只写「已调用 skill」。

---

## 47. 用户裁决（第十轮 · 12:00 复工）：6 条 Figma 偏离**全部批准**

用户原话：「6条裁决均先同意看看效果。现在12点了，继续任务。」

### 47.1 批准的 6 条（原偏离清单 ①–⑥）
1. 侧栏用户卡**不含匿名代号行**（因系统里"代号每瓶一个"，不存在"你的代号"这一实体）。
2. 心情标签 33px → **44px**（`DESIGN.md` 触控目标 ≥44px 优先于 Figma 数值）。
3. hero 的 `min-height: 517` **仅桌面**；375 下缩到 ripple 180 / 按钮 88，以保住「一屏」。
4. 涟漪 = **3 静态圈 + 1 动画圈**（Figma 为 3 静态圈；纯动画时静止截图看不到招牌主交互）。
5. 首页 header 右上**多三个文字快捷入口**（因「今日海面」列表已移出首页，需保留公海/我的/投下入口）。
6. 首页主捞取按钮上**写「捞取」二字**（Figma 为纯图标圆；纯图标按钮需要可访问名称）。

### 47.2 第 7 条不由用户裁决（captain 判定：**不是偏离**）
`--container-max-width: 1280px` 保留为 **>1440 时的内容列上限**——用户已批准 1440 满宽，此项属**遵守已批准口径**，且符合 `DESIGN.md` 的 <80ch 阅读宽度纪律。故不计入偏离清单。

### 47.3 ⚠️ 批准的性质：**「先同意看看效果」= 临时放行，非永久冻结**
用户措辞是「先同意看看效果」⇒ 这 6 条**可在看到实际效果后被用户撤回或调整**。因此：
- 不要把它们当成不可质疑的设计定论写进 `DESIGN.md`（避免第二份规则与 Figma 漂移）；
- 交付时必须**连带给出这 6 条的可见效果截图**，供用户判断是否接受。

### 47.4 12:00 复工派发（captain）
| 任务 | 承担者 | 内容 |
| --- | --- | --- |
| t21 | audio-engineer | 前端真实周期上报接线 + 恢复金路径 hermetic 自检（当前唯一红灯，端到端验收证据的唯一来源） |
| t22 | backend-core | §46.1 被斩浪者（含发起者）一律不算参与过 + **反转**既有矛盾断言 |
| t23 | reviewer | t20 质量门禁（对抗式复核；原被自动分配给 architect，因其自称"我写了 t20 核验回执"存在自证重叠，已改派 reviewer） |
| t12 续 | frontend-flow | §46.3 全页一屏 / §46.2 声明式内容弹窗 / `·` 元信息 / 公海分页 UI / 赞踩四态 UI |
| §46.2 后端 | backend-core（**排在 t22 之后**） | 公海真分页。串行原因：与 §46.1 都要改 `apps/api/src/store/bottles.ts`，并发写同一文件曾导致 19 个路由测试静默 404 |

### 47.5 一屏判据（captain 裁定，采纳 frontend-flow 提议并加条件）
`Math.max(document.documentElement.scrollHeight, body.scrollHeight) > 900` 视为不达标；且必须满足：
① 异步数据/图片**加载完成后**测量；② 375 用对应阈值；③ **必须给反向控制**（造一个超高一屏的页面，确认断言真的会红），否则这是"永远点头"的守卫。
**禁止**用 `overflow-hidden` 裁掉内容来达标（那是把可访问性问题藏起来）——装不下就改组件大小/位置，或把内容移进弹窗（§46.3）。

### 47.6 in-scope 约定（captain 流程改进 · 两轮归档僵局后定）
工具限制（已确认多次）：`edit_plan` 的 `update_task` **没有 inScope 字段**，且 running 团队下不允许 add/remove task ⇒ **任务的 in-scope 一旦创建就无法修改**。补漏只能走「changedPaths 只列声明内路径 + 未声明路径在 output 里显式披露 + captain 背书」的模式（t20 由 architect、t22 由 backend-core 验证可行）。

因此往后创建任务时：
1. **`apps/api/**` 类任务默认带上 `apps/api/drizzle/`**（新表迁移产物，t5 起一直入库；t20 正因漏它而卡归档）。
2. **「规则收敛 / 跨层一致性」类任务，in-scope 直接写到可能出现同规则副本的整个目录**（`apps/api/src/`、`packages/shared/src/`、`docs/`）—— 这类任务的本质就是**全仓找副本**，声明太窄必然卡住。t22（§46.1）就遇到了第二份「参与过」判定藏在 `store/notifications.ts` 里。
3. 声明过窄造成的补漏**不能靠扩大声明解决**（改不了），只能**如实披露**——宁可 output 里写清楚，也不假装一切都在声明内。
