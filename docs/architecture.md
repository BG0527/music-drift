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

---

## 48. captain 裁决：`--spacing` 基准回退 `0.25rem`（"前端丑"的根因收尾）

### 48.1 裁决
**选候选 (a)：把 `apps/web/src/design-system/theme.css:69` 的 `--spacing` 回退为 `0.25rem`（Tailwind v4 默认）**，并收口 18 处、改 `tokens.test.ts`、给 `DESIGN.md` 的「Base unit」加限定。

### 48.2 判据（决定性的是"永久代价"，不是审美）
1. **代码本来就是按 `0.25rem` 语义写的**：`w-64` 期望 256px（≈ Figma 侧栏实测 260）、`min-h-11` 期望 **44px**（DESIGN.md 触控底线）。⇒ 回退是**恢复作者意图**，不是改设计。
2. **回退后 321/339（95%）自动归位**到 DESIGN.md 档位或 44px —— 一次性成本。
3. **(b) 的代价是永久的**：保留 `0.5rem` ⇒ `min-h-11` **永久等于 88px**，而 **44px 没有标准类名可用**（必须写 `min-h-[44px]`）；每个新代码（含后续接手者与模型）默认 `w-64`＝256px 却拿到 512px。**用户所说的"前端丑"就是 (b) 的实例化代价。**
4. 与 `afrexai-ui-design-system`「Use a **4px base unit** (0.25rem)」同构，其 8 档表与 `DESIGN.md` 档位**同构**。
5. 量化证据：覆盖行 `theme.css:69`；**构建产物实测 `--spacing:.5rem`**；26 处 `-11` 类（`min-h-11`×21 / `h-11`×2 / `min-w-11`×1）当前渲染 **88px**（应为 44px）；影响面 **43 文件 / 339 处**（`gap-*` 177 = 52%）；**动效 0 命中**（入场位移用 `var(--entry-shift)`，免疫）。

### 48.3 `DESIGN.md` 的「Base unit」必须加限定（批准修改）
歧义根源：`DESIGN.md` 写「Base unit: 0.5rem (8px)」本意是**节奏步长**（间距只取 8px 派生档），但被读成了 Tailwind `--spacing` 的值 —— 后者语义是「**尺度值 1 的长度**」。加限定后必须点明两者区别，并写明**禁止覆盖 `--spacing`**。

### 48.4 ⚠️ 执行顺序：**基准先行**（captain 推翻 frontend-ds 的原建议）
frontend-ds 原建议「等 frontend-flow 告一段落再动基准」；captain 改为**基准先改**，理由：`--spacing` 是全局几何开关，**frontend-flow 若先在 ×2 尺度上做"一屏装下"，算出的高度与间距在基准变更后全部作废** ⇒ 必然返工。
故：**frontend-flow 立即暂停几何类改动**（尺寸/间距/位置/一屏测算与断言/截图），转做不依赖基准的活（`·` 元信息、弹窗结构、分页接线、赞踩结构）；frontend-ds 改基准 + 18 处 + 测试；完成回报后再放 frontend-flow 恢复几何并在正确尺度上出 1440/375 截图。

### 48.5 18 处收口口径（captain 批准）
- **组件尺寸写显式 px**（`w-14/h-14`、`h-40`、`h-24`、`h-28`、`h-9`、`h-10`、`w-40`、`w-64`、`w-0.5`）；
- **间距类必须收进 DESIGN.md 的 8 档**（`gap-5`→`gap-4/6`、`p-5`→`p-4/6`、`pb-24`→`pb-16`、`p-0.5`→`p-1`）—— 间距属节奏系统，越界即违约；
- `design-system/showcase/Showcase.tsx`（42 处）是开发展示页，**放最后**，不影响交付页面。

### 48.6 `tokens.test.ts` 改法（批准四段式）
删掉 `toContain('--spacing: 0.5rem')`，改为：① **不得覆盖 `--spacing`**（负向断言，把本次事故钉成回归守卫）② 档位全集（`--space-*`，本就正确，保留）③ `--touch-target-min: 44px` 存在 ④ **构建产物**断言 `--spacing:.25rem` 且**不得**为 `.5rem`。
要点：**守卫要能表达"不许这样写"，而不只是"现在是这个值"。**

### 48.7 不予批准：暂不加「禁止 `translate-*` / `space-*` 数字档」守卫
理由：当前 **0 命中**，加它即为想象中的问题写守卫（同「分支永远走不到的检查比红更危险」）。**若收口过程中真出现数字档位移，再加** —— 那时它是对真实风险的响应。

### 48.8 模式留痕：本会话第 **3** 例「同源判据错误」
1. t8：onset 检测**误差方向反了**（判据自证）；
2. t13：BPM 候选靠**与官方值最接近**来选（循环验证）；
3. **本次**：`tokens.test.ts` 把一个**实现选择**（`--spacing: 0.5rem`）当成契约守卫下来 ⇒ **错值获得了"测试通过"的背书**，任何修正都会被判红。
共性：**让错误在自己的判据体系里被认证为正确。** 防御：守卫必须表达**意图与约束**（"不许覆盖"），而不是把当前实现取值固化；以及每次"测试全绿"都要问一句**这条断言凭什么算对**。
（另附：frontend-ds 主动做了自我归因 —— t2 忠实落地了 `DESIGN.md` 的措辞，但把"节奏步长"误解为 Tailwind `--spacing` 的语义。这类**术语歧义**造成的系统性错误，光靠更严格的执行是防不住的，必须改文档措辞本身。）

### 48.9 执行结果（§48 第一段完成，frontend-ds）
- **基准回退方式**：`theme.css` **删除** `--spacing` 覆盖声明（而非改成 `0.25rem`）⇒ 回落到 Tailwind v4 默认。**这比显式写 0.25rem 更干净**：不再由本项目维护一个本该由框架拥有的值，将来框架默认变更也不会与本仓冲突。md5 `826cbd98` → `57506fc9`。
- **决定性证据**：`pnpm --filter @music-drift/web build` **exit 0**，产物实测 **`--spacing:.25rem`**（原 `.5rem`）。
- `DESIGN.md` 加限定（md5 `8d996812` → `47ed2abc`）：点明**节奏步长 ≠ `--spacing`**、写明禁止覆盖；31 条核心纪律 grep FAIL=0、YAML 可解析、colors=30。
- `tokens.test.ts` 四段式（含**构建产物负向断言** `not.toMatch(/--spacing:\s*0?\.5rem/)`）。`web test` **52 文件 / 402 例 exit 0**，新增断言**已实际执行非 skip**。
- **收口进度**：越界代码行 **18 → 6**；341 处数字档 utility 中 **335 处**落在 DESIGN.md 档位或 44px 触控底线。
- **剩余 6 处全在 captain 划的禁区**（`pages/**`、`features/bottle/**`），frontend-ds **未越界触碰** ⇒ 交 frontend-flow 在几何 pass 中顺手改：`pages/profile-page.tsx:29`（`w-14/h-14` 56）、`pages/admin-page.tsx:25`（`h-9` 36 / `w-40` 160）、`pages/admin-page.tsx:26`（`h-24` 96）、`features/bottle/relay-timeline.tsx:65`（`w-0.5` 2）。
- 附带清理项：`design-system/nav.tsx` 的注释仍写「`theme.css` 把 `--spacing` 覆盖成 0.5rem（为了让 `p-1`=8px）」—— **依据已不成立**，留着会误导后来者（正是本轮刚消除的那类错断言）⇒ 交 frontend-flow 更新。

### 48.10 ⚠️ 需在收尾前清掉的基线退化：`pnpm lint` exit 1（14 条）
14 条问题**全部在他人文件**（frontend-ds 所改的 6 个文件 eslint exit 0）：
- `apps/api/src/store/bottles.integration.test.ts`
- `apps/web/src/features/audio/use-segment-listen.ts`（t21 新文件）
- `apps/web/tools/golden-path-live-check.mjs`
- `apps/web/tools/one-screen-check.mjs`
其中后三者大概是在飞产物，但**lint 曾是 0 problem 的基线**，若收尾时仍红，则"lint 通过"这条门禁就失真了 ⇒ 要求各 owner 在回报完成时连同 `pnpm lint` exit 0 一起报。

### 48.11 待澄清的脆弱点（captain 提问给 frontend-ds）
新增的**构建产物负向断言**依赖 `apps/web/dist/` 存在。若在**未 build 的环境**（全新 clone、CI 只跑 test）执行，该断言会红还是 skip？若是红，则 `pnpm -r test` 会变成一个**顺序依赖**的测试（必须先 build）—— 这类"测试之间隐式依赖产物"的结构容易在别人机器上炸。需给出明确答案与兜底方式。

### 48.12 一处 captain 的指令缺陷（自我记录）
frontend-ds 顺手把 `features/audio/recorder-panel.tsx` 的 `p-5`→`p-6` 收了口，但 `apps/web/src/features/audio/**` 是 **audio-engineer 在 t21 的 in-scope**（他正在该目录新建 `use-segment-listen.ts`）⇒ 存在并发写同一文件的可能。
根因：**captain 批准"18 处收口"时只划了 `pages/**` 与 `features/bottle/**` 两块禁区，没有覆盖 `features/audio/`**。指令边界不全，不能算调用方违规。处置：告知 audio-engineer 保留该行；今后跨域一行改动**先报备再动**。

---

## 49. t21 完成（金路径恢复）+ 第二类判据问题：**规则变了、检查没跟**

### 49.1 t21 结果（audio-engineer，captain 亲验路径）
- `node apps/web/tools/golden-path-live-check.mjs` → **exit 0**，`28 步`（原 27 + 新增"点踩门槛证据"步）。关键行：`[27] 被斩段作者（含发起者）已从列表剔除（§46.1）· 主瓶不受影响 · 被斩瓶 status=DAMAGED`；`[28] 单次塞满→ratio 0.5 被拒 422(LISTEN_THRESHOLD_NOT_REACHED) · 10 个点踩者按 1× 实时周期上报各自听满（≈17s）→ 全部 200，第 10 票斩浪`。
- 交付：`features/audio/listen-reporter.ts`（新）、`use-segment-listen.ts`（新）+ 各自测试、`features/audio/index.ts`（barrel 导出能力与用法）、`tools/golden-path-live-check.mjs`。
- 实现要点：`onProgress` 内核覆盖率 → 每 1000ms 一次 `POST /listen`，上报值 = **本地真实观测**（单测钉住"绝不虚报"）；点踩前必先 `flush()`。与限速配合：首报封顶 `duration×0.5`，之后 `距上次真实耗时×1.25+3000ms`；1× 实时上报天然在夹子之下。**未加自动重试**（diff 里唯一"重试"字样是注释）；第 19 步历史间歇本次未复现。

### 49.2 ⚠️ 交叉依赖警告（必须跟进的验证）
t21 的第 27 步断言依据的是**工作区里 backend-core 正在写的 t22 实现**（`store/bottles.ts:477`「刻意不再有发起者豁免」、`store/bottles.integration.test.ts:200`）。
⇒ **t21 的"绿"是建立在 t22 未完成的在飞代码上的。** t22 完成后**必须重跑金路径**确认仍然 exit 0；若 t22 调整了实现细节，"金路径绿"随时可能失效。这类"一个任务的验收引用了另一个未完成任务的在飞实现"是**验证污染**，不能当成稳定基线。

### 49.3 第二类判据问题：**规则/契约变更后，检查与调用方没跟着改**（本会话第 3 例）
统一命名：与 §48.8 的「**同源判据错误**」不同 —— 那类是*让错误在自己的判据体系里被认证为正确*；本类是**上游规则改了，下游检查/调用方没改**，于是检查变成了**过期的谎言**（它仍在认真守护一条已经不存在的规则）。
1. 金路径脚本仍传 `listenedRatio`（t20 已把判定源改为持久化覆盖率）→ 第 27 步 10 个点踩者全 422；
2. 金路径第 27 步的 4 条断言仍断言「斩浪后仍算参与过」（§46.1 已反转该规则）；
3. `myBottles.integration.test.ts:225` 断言同样过期（backend-core 在 t22 反转）。
**防御**：
- 改规则的变更清单里，**「反转过期检查」是变更的一部分，不是额外工作** —— 不反转就等于仓库里同时存在两份矛盾规则（§42.3 的"第二份规则必然与第一份漂移"）；
- 改规则时必须 grep 全仓旧语义的**调用方与断言**（不只改实现）；
- **反转断言时加反向对照**：audio-engineer 在反转第 27 步时补了「同一用户其它参与作品必须仍在」，防止"列表变空"也能通过 —— 这是把"反转"做成**有判别力**的检查，而不是把断言反过来就完事。

### 49.4 待办（路由给 frontend-flow）
前端仍有 3 处传 `listenedRatio`：`features/api/mutations.ts:155`（**类型仍是必填 = 根因**）、`pages/bottle-page.tsx:185,191`、`pages/sea-detail-page.tsx:141`。服务端已忽略该字段（功能不受影响），但"前端路径干净"还差这几行：删字段 + 接 `useSegmentListen({segmentId})`（能力已从 `features/audio` barrel 导出，带用法注释）。

---

## 50. 守卫设计纪律：恒跑 > 可跳过；验证源 > 验证派生物

起因：§48.11 captain 提问「读构建产物的负向断言在无 `dist` 环境是红还是 skip」，frontend-ds 实测回答，并**主动发现两个 captain 没问到的问题**。

### 50.1 实测回答（原实现是 skip，无顺序依赖）
无 `dist` 时：`Tests 401 passed | 1 skipped (402)`，`TEST_EXIT=0` ⇒ 不红、不产生"必须先 build"的顺序依赖。**captain 担心的最坏情况没有发生。**

### 50.2 但 skip 本身不可接受（frontend-ds 主动发现，比原问题更重要）
1. **skip 是「沉默保护」**：跳过时那条守卫**什么都没保护**，而 `1 skipped` 混在 summary 里几乎不可发现 —— 守卫形同虚设却让人以为被保护。这与「分支永远走不到的检查比红更危险」是同一类失效。
2. **产物可能是过期的**：`build` 之后又改 `theme.css`，产物断言会用**旧产物**给出**假安全感** —— 与「测试绿但产品废」同类。

### 50.3 新设计（两层，主守卫恒跑）
| 层 | 何时跑 | 内容 |
| --- | --- | --- |
| **① 源码级负向守卫（主）** | **恒跑、永不跳过** | 扫 `design-system/**/*.css`（先剥离注释，只查真实声明）：**任何 CSS 源文件都不得声明 `--spacing`**。事故在任何文件复现都会红 |
| **② 产物级断言（辅）** | 仅当产物比 `theme.css` **新** | `not.toMatch(/--spacing:\s*0?\.5rem/)` + 正面确认 `--spacing: .25rem` 在场；**跳过原因写进测试名**（verbose 下可见） |

三场景实测（全部 exit 0）：无 `dist` → ② skip 且名字写明「dist 不存在（未 build）」；`dist` 过期（`touch theme.css` 模拟）→ ② skip 且写明「产物比 theme.css 旧（需重新 build）」；`dist` 新鲜 → ② 真正执行。

### 50.4 通用纪律（提炼，适用于本仓所有守卫）
1. **守卫必须恒跑。** 可跳过的守卫在跳过时提供零保护，而一次"跳过"很容易被读成"通过"。若某守卫在某些环境必然无法执行，**要么换成恒真的判据，要么把跳过原因写在断言名里**，不要让它静默消失。
2. **断言不许依赖可能过期的派生物。** 优先验证**源**（恒真、无顺序依赖）；验证派生结果时必须同时校验其**新鲜度**，并自述跳过原因。
3. **优先负向断言**（"不许这样写"）而非取值断言（"现在是这个值"）—— 后者会把实现选择固化成契约（§48.8 的错值守卫正是这样诞生的）。

### 50.5 附带确认
`eslint` 对 `theme.css` 报的唯一 warning 是「无匹配配置故被忽略」⇒ **CSS 不在 eslint 覆盖范围**。因此 CSS 类文件的守卫只能落在单测里 —— 这正是本节的①（源码级负向断言）承担的职责，闭环成立。

---

## 51. t22 完成（§46.1 落地）+ 交叉依赖闭合（captain 亲验）

### 51.1 规则收敛方式（不新增表、不新增迁移、不写第二份判定）
- `store/bottles.ts`：新增**唯一判定** `participatedIn(state, userId)`；`listParticipatedBottles` 改为「**SQL 只做候选超集 + 内核筛**」；**整条删掉候选 SQL 里的 `b.initiator_id = $1`** —— 那正是「发起者豁免」本身，未留任何特殊照顾分支。
- 候选 **`limit×3` 超取后再筛**，避免被筛掉后**静默少给行**。
- `store/notifications.ts`：`participantsOf()` 从**事件流 SQL**（第二份实现）收敛为 `participants(replayBottle(events))` ⇒ `BOTTLE_COMPLETED` 收件人与 `/api/me/bottles` 共用同一条规则。
- **未动** `routes/interactions.ts:336`（徽章本就在用内核判定）—— 不为"看起来统一"做无谓改动（正确的 YAGNI）。
- 四个消费方（`store/bottles.ts:160`、`store/notifications.ts:122`、`store/dto.ts:111`、`routes/interactions.ts:336`）**全部落在内核 `queries.ts:152`**；`SEGMENT_RECORDED` 降级为候选 SQL，不再承担判定。

### 51.2 红→绿与反转方式
未改实现时 **4 例全红**（`AssertionError: expected [ …(2) ] to not include '81e425bb-…'`），改后 15/15 绿。
反转采用**就地改写**（未新增平行用例），且**先反假绿**（先断言段确实软删、瓶确实 `DAMAGED`）**再断言列表不含该瓶、且另一支仍在**（证明不误伤）—— 让反转后的断言**具备判别力**，而不是把断言反过来就算完。

### 51.3 §49.2 的交叉依赖警告**已闭合**（captain 亲验，非采信自述）
t21 第 27 步断言原先依赖 t22 的**在飞实现**（验证污染）。t22 完成后 captain 亲自重跑：
`node apps/web/tools/golden-path-live-check.mjs` → **exit 0 / 28 步**，含
`[27] …被斩段作者（含发起者）已从列表剔除（§46.1）· 主瓶不受影响 · 被斩瓶 status=DAMAGED`；
`[28] 单次塞满→ratio 0.5 被拒 422 · 10 个点踩者按 1× 实时周期上报各自听满（≈17s）→ 全部 200，第 10 票斩浪`。
⇒ **金路径恢复为稳定基线**，不再是"建在未完成任务上"。

### 51.4 ⚠️ 待澄清（captain 不放行）：`returnHandoff.integration.test.ts` 的 `ROUNDS 12→5`
该改动把"降低轮数"当作"机器忙导致超时"的解法。captain 要求先明确：**这 12 轮是「同一操作的重复」，还是「并发参与者 / 递进场景的覆盖面」？**
- 若为**重复**（只为提高撞见 flaky 的概率）⇒ 可接受，但注释须写明真实代价是「**敏感度降低**」，而不是只说"避免超时"；
- 若为**覆盖面**（如 12 个并发者抢同一段号）⇒ **必须回退轮数**，改用「提高该文件 timeout」或「不让它与其他文件并行」来剥离争用。
理由：**用缩小场景来消噪声，与"为了绿而削弱检查"是同一件事的两面。** 该文件本轮**未提交**，待澄清后一并处置。

### 51.5 in-scope 声明疏漏（captain 记账，第二轮）
- t22 的 in-scope 写了 `apps/api/src/routes/myBottles.ts` —— **该文件不存在**（`/api/me/bottles` 在 `routes/bottles.ts`，本轮判定落在 store 层）。根因：captain 拿测试文件名反推了源文件名。已与 §47.6 的约定合并为一句话：**in-scope 里的路径必须是实际存在的文件或目录**，写之前先 `ls`/`glob` 确认。

---

## 52. t23 评审裁决：t20 **needs_revision**（阻断项 F1 已开 t25）

### 52.1 裁决与处置
- t23（review，reviewer）→ **failed / verdict = needs_revision**。（reviewer 会话未暴露 `agent_teams_*` 工具，由 captain 按其消息原意代登记，**未改变裁决内容**。）
- **F1（blocker）→ 开 t25**（repair，architect，sourceFindings F1+F3）。
- F2（high）→ **待用户裁决**（见 §52.4）。
- F4（low）→ 记账，待 t24 完成后处置（与 t24 同文件 `store/bottles.ts`）。
- 四条角度结论：① 覆盖率单一实现 PASS ② 请求体不能污染门槛 PASS（另发现分母通道 F2）③ 增长限速可跨过 **FAIL** ④ 赞/踩与斩浪真解耦 PASS（尝试推翻未成功）。

### 52.2 F1（blocker）：点踩门槛可被 3–4 次即时上报、零播放、~100ms 跨过
- 证据（真时钟/真 HTTP/真 Postgres）：段长 30s 门槛 24s，4 次请求真实耗时 **115ms**、**播放 0 秒** → `DISLIKE http=200`；段长 15s 门槛 12s → 3 次请求 70ms → 200。
- 根因：`RATE_SLACK_MS`(3000) **按「请求」发放而非按「时间窗」** —— `elapsed≈0` 时每次上报照样净增 3000ms，而 api 无 rate limit。
- **测试为何放过它**：`listenProgress.test.ts:40-47` 只测**一次**后续上报（必然成立）、`integration:284-286` 只测**第 2 次**（必然通过）。真正的不变式「**N 次仍不达门槛**」**无人覆盖** —— 那两条守卫的**绿距离失败只差一轮循环**。
- 文档矛盾：与 `docs/api.md:223-224` 的承诺「想跨过门槛必须真的等够时间」直接冲突 ⇒ `CONTEXT §16` 在服务端事实上未落地。
- 修法（t25）：宽限改为**锚定首次上报的预算** `cap = firstGrantedMs + floor((now - firstSeenAtMs) × 1.25) + RATE_SLACK_MS`（`firstSeenAt` 落库），验收 = N=10 次即时上报恒不达门槛 + 正常 1×/秒上报不被夹。

### 52.3 ⭐ 新纪律：**「队友在途改动」窗口内 verify 会假红**（两个独立观察者）
- **captain**：在 frontend-flow 正在写文件的窗口跑 `pnpm -r test` → **exit 1**（2 个 `Failed to start forks worker` / `Timeout waiting for worker`）；全员 idle 后重跑 → **exit 0**（90 文件 790 例）。
- **reviewer**：12:03 跑 `test:integration` → **exit 1**（4 failed 全在 §46.1 相关文件）；用 `git archive 897a983` 干净副本跑同一命令 → **exit 0 / 160 passed**。归因：那些文件正处于 t22 **在途未提交**状态。
⇒ 同一现象、两个独立观察者。**结论：取基线 / 跑评审 / 判定红绿，必须选在全员 idle 的窗口**；否则测到的是"正在施工的工地"，不是可判定的状态。
附注：这暴露了「共享工作区 + 多 agent 并发」的**结构性代价** —— 未提交的在途改动会污染任何共用工作区的测量。只能靠**调度纪律**（停机/串行窗口）规避，**不能**靠更聪明的测量或加自动重试来规避（那只会把假红变成假绿）。

**第三次独立观察（同日 12:xx，同一条命令、两套不同的红）**：audio-engineer 报 `pnpm -r typecheck` 有 **3 条** error（全在 frontend-flow 在途的 `features/bottle/**` + `pages/**`）；captain 在其后半小时内独立复跑**同一条命令**，得到的是**完全不同的 1 条**：`apps/api/src/routes/listenProgress.integration.test.ts(299,15): error TS2304: Cannot find name 'ListenProgressResponse'`（属 **t25** 在途文件）。
⇒ 两人先后跑同一条 verify 命令、得到两套不同的红，**没有一套是稳定基线**。
**纪律升级（硬性）**：任何「红 / 绿」结论都必须**标注测量时刻与其时的在途任务**；未标注的结论**不可复现、不可作为判据**。
推论：**「基线」不是仓库的固有属性，而是「仓库 + 测量时刻 + 在途任务集合」的函数。** 因此收尾验收必须在**全员 idle 的冻结窗口**内重测一次，并把该次结果记为唯一权威基线（此前所有中间红绿只作过程证据）。

### 52.4 F2 待用户裁决（涉及依赖引入 ⇒ 属 §7 待裁决项）
门槛的**分母**由上传者自报：`x-audio-duration-ms` 头写库，`ingest.ts` 只做 15–30s 区间校验 + sniff 4 字节容器，`durationVerified` 仅表示"客户端给了合法数字"。
后果（**诚实用户路径**）：真实 2s 片段最多覆盖 2s ⇒ ratio ≤ 6.7% ⇒ 该段对 UI 用户**永久不可点踩**，上传者能单方面冻结自己段的斩浪。
归因：**不是 t20 引入的回归**（t7/t9 上传校验原样），但 t20 把这个数提升为安全关键阈值的**分母**。
两个候选：(a) 补真实音频时长核对（需解析容器 / FFmpeg ⇒ 中间件，须用户批准）；(b) 记为 Demo 已知限制并写进 `CONTEXT.md §17` 范围与 `docs/api.md`。→ captain 报用户。

### 52.5 F3 = 「同源判据错误」第 **4** 例（自证用例）
用例标题声称「覆盖率语义与内核 `ListenTracker` 一致：拖动不计、循环不叠加（端到端同一条规则）」，但服务端只做 `normalizeInt → min(covered, duration)`、请求体只有一个字段、**根本拿不到 span/seek**；`server.ratio ≈ local.ratio` 是同一个 `listenedRatio()` 喂同一个数 ⇒ **同值断言对任何输入都成立**。
证伪实验（reviewer 做）：把 tracker 整段换成手写常量 `11_600`，四条断言同形照抄**竟然全绿**（EXIT=0）⇒ 该用例无法区分"服务端实现拖动不计"与"照抄客户端数字"。
→ 处置：把标题/注释收敛为它**真正证明**的东西（两端复用同一阈值函数），"拖动不计/循环不叠加"的守卫留在客户端单测；**不得**把它当作"服务端防伪造"的证据链一环。（并入 t25）

### 52.6 探针目录污染：`apps/web/dist__no_build_probe/`
frontend-ds 做"无 `dist` 场景"实测时在工作区建了该目录；**eslint 的 `**/dist/**` ignore 不覆盖这个目录名** ⇒ 探针产物被 lint 扫到，成为此前 14 problem 中的"一大批"（audio-engineer 观察其随后消失）。
⇒ 纪律：**探针 / 实验产物一律放仓库外（如 `/tmp`）或先写进 `.gitignore`**；否则"临时探针"会变成别人的噪声源与假红源。（reference：reviewer 把全部探针放在 `/tmp/mdb-head`、仓库零改动，做法正确。）

---

## 53. t25 完成：F1 阻断**部分**关闭 + F3 收敛 + F2 安全分析结论

### 53.1 F1 修复方式（比 captain 的建议更省）
`slackMs = previous.coveredMs <= floor(duration × 0.5) ? RATE_SLACK_MS : 0` —— **宽限只发一次**，增长项只剩 `floor(elapsed × 1.25)`。
逐步求和 ≡ `firstGranted + 总真实耗时 × 1.25`，与 captain 建议的「锚定首次上报预算」**代数等价** ⇒ **不需要新增 `firstSeenAt` 列**（省掉 `db/schema.ts` + `drizzle/**` 改动，也避开了 t25 声明范围外的文件）。
零延时连打上限 = `0.5D + 3000`，在 15–30s 段长内**恒 < `0.8D`**。
- 红（修复前）：单测 `expected 24000 to be less than 24000`（第 10 次即时上报正好等于门槛）、`expected 21000 to be 18000`（宽限被按请求重复发放）；集成（真 HTTP + 真库，不推进假时钟）`expected true to be false`（早期上报已达门槛）。
- 绿（修复后）：`api test` **rc=0**（19 文件/179 例）、`test:integration` **rc=0**（21/173）、`typecheck` **rc=0**（三包 Done）、改动 4 文件 `eslint` **rc=0**；攻击用例现在每次 `reachedThreshold=false`、终值 `coveredMs=18000`、`DISLIKE=422`、`votes` 行数 0。
- **正常路径未被废掉（关键回归）**：1×/秒上报单调增长，单测第 6 次达标、集成 15 次后 ratio ≥ 0.8 且 `DISLIKE=200`。

### 53.2 ⚠️ F1 只是**部分**关闭：新发现的残余名（「等够时间」≠「真的听」）
首次预算 `0.5D` 是**白给**的；之后攻击者**只需真实等待约 `0.24×D`（30s 段 ≈ 7.2s）再报一次**即可达标 —— **实际播放 0 秒**。
即攻击成本从「零等待连打（~100ms）」变成「等约 7.2 秒」，但**仍然不需要真的听**（诚实用户需 24s）。10 个这样的攻击者仍可斩浪。
要彻底堵住必须**改契约**：上传播放位置序列由服务端重算 span，或按**播放心跳计费**。
**物理上限（必须对用户讲清）**：纯 Web 架构下服务端**无法**知道客户端是否真的出声 —— 任何方案（心跳 / 位置序列）都只能做到「**必须真实耗费 ≥N 秒墙钟时间**」，无法证明"人耳真的听到了"。因此可达目标是**把伪造成本提高到与诚实路径同量级**，而不是"不可能伪造"。已报用户裁决。
**用户裁决**：**记录为已知限制，本次不修**。理由：伪造代价已从「~100ms 零等待连打」抬高到「真实等 ~7.2 秒」；彻底修需改契约 + 播放器 + 全部收听链路测试，而物理上限决定「不可能伪造」本就不存在 —— 花大代价也只是把成本提到同量级。该限制已正式写入 `docs/api.md` 的「已知限制（Demo 范围）」。

### 53.3 F3 收敛方式
标题改为「内核 tracker 的区间并集语义经上报被服务端**原样 + 上限**记账」，注释明说**服务端不重算 span**；**新增两条判别用例**：客户端报 25000 → 服务端只采 15000（证明不照抄客户端数字）、客户端报 0 → 不回退已记进度（**记账权威在服务端**）。原「端到端同一条规则」的虚假证据链已拆。

### 53.4 F2 安全分析结论（architect 先想清楚，已同步 audio-engineer）
**谎报更小的 duration ⇒ 分母变小 ⇒ 门槛变低 ⇒ 所有人更容易踩它**（受害者是**被踩的那个段**，而非作者）；谎报更大 ⇒ 便于段作者自保（自己那段更难被斩）。`measuredDurationMs` 与 `coveredMs` 一样来自客户端 ⇒ **只修诚实路径，不改变威胁模型**。
防护分层（都不构成硬边界）：① 必须先有 `listen_progress` 行且 `coveredMsAtReportMs` 与库内值一致（**由可选改为必填**）② **只允许下调立即生效**，上调需 ≥2 个用户互相接近（±10%）③ 落库审计 ④ 跨用户取中位数 ⑤ 下限 = `max(500ms, 该段已记录最大 coveredMs)`（避免 ratio > 1 与追溯作废已听进度）。
冻结接口：`POST /api/segments/:id/duration`、`422 MEASURED_DURATION_REJECTED`（已同步 t28）。

### 53.5 out-of-scope 备案（captain 批准并记账）
额外修 `apps/api/src/auth/repository.integration.test.ts`：5 处「直接 assign 随机代号」因 `anon_codes.code`**全局唯一** + 21 个集成文件**共享同一测试库**而**概率性假红**（本轮全量真红一次：`listCodesForUser … expected [] to include '灯塔守望#887'`）⇒ 改为 `assignCodeWithRetry()`（与 `routes/auth.integration.test.ts` 既有做法一致）。
**批准**：修掉一个真实假红源优于"保持声明整洁"；归档沿用 t20 先例（changedPaths 只列声明内 + output 披露）。

### 53.6 新纪律已在一线生效（证据）
architect 过程中两次遇到红，均确认为**别人正在写的文件**（`apps/web` 的 sea 页面语法错、t24 的 sea 分页），按 §52.3 **未归因、未加重试**，60s 后复跑 rc=0。⇒ §52.3 的纪律不只是写在文档里。

---

## 54. t24 完成（公海真分页）+ ROUNDS 处置 + F4「响亮失败」

### 54.1 `ROUNDS 12→5` 的追问结论与处置（captain 要的那个答案）
- **回答：12 轮是「重复」，不是「覆盖面」** —— 每轮是**独立同形的 4 人接力**（注册 4 人 → 发起 → 4 段交接 → 末段回传 → 新持有者选去向），**无并发语义、无递进场景**；唯一作用是提高"撞见偶发"的概率（对应 t19 那个未定位的偶发）。
- **处置：采 captain 的优先方案** —— `ROUNDS` **回退到 12**（恢复敏感度），改 `TEST_TIMEOUT_MS = 180_000`，把"机器忙"从判别力里剥离。实测：单跑 ~1.7s/轮 → 12 轮 **22.1s**；争用下曾 ~5s/轮 → 12 轮 60s+。**未削弱任何断言**；单跑 `✓ 12 轮…22119ms` / `1 passed`。
- ⇒ 定为标准：**遇到"机器忙导致的红"，要剥离争用（提高超时 / 独占运行），不要缩小场景。**

### 54.2 F4 修复比 captain 的建议更强（教训升级）
captain 建议 `?? 0`（fail-closed）；backend-core 指出 **`?? 0` 仍是"默认值"、仍可被绕过** ⇒ 改为**响亮失败**：`VOTE_CAST` 投影缺 `extras.vote.listenedRatio` 时**直接抛错**。新增用例断言 `rejects.toThrow(/listenedRatio/)` **且 votes 计数仍为 0**（零副作用）。
⇒ **审计字段的缺失必须响亮失败，而不是取一个"安全默认值"** —— 默认值仍然是一种静默。

### 54.3 t24 公海真分页要点
- **契约复用**：内联 `SeaListQuerySchema` **整块删除**（全仓 grep 为 0），改调契约 `BottleListQuerySchema`。唯一契约改动 = 给旧名 `zone` 加 `@deprecated` **等价别名** —— 否则前端与金路径在用的 `?zone=` 会被 zod **静默丢弃**（正是本轮在修的缺陷类型）；用例钉住旧名与 canonical 返回**完全相同**的 items。
- **稳定排序键**：`(updated_at DESC, id DESC)` + **键集游标**（非 offset）；`id` 不可变决胜 ⇒ 同毫秒也全序；新插入排在游标之前 ⇒ 不重复、不挤掉旧行。
- **过滤 × 分页（captain 点的陷阱）**：删掉"先取 limit 再 `filter(isComplete)`"，改 store 内**候选超取（limit×3）+ 内核 `seaZoneOf` 判定 + 推进游标直到 limit+1**；`nextCursor` 仅在确实还有下一行时非 null ⇒「某页不满 limit 却仍有下一页」**实现上不可能**；候选取尽直接 `break`，**不返回空页假装到底**。
- 真 `nextCursor` 已贴原始值；**畸形 cursor → 400**（不静默忽略）。
- 红→绿：实现前 `Tests 4 failed | 8 passed (12)`（指纹 `expected Set{} to deeply equal Set{ …(6) }`：旧实现把前两条候选滤掉 ⇒ 空页 + 声称到底；`expected null not to be null`）→ 实现后 `12 passed`。
- **过程中又抓一个真缺陷**：游标里的 epoch 毫秒被当 `timestamptz` 传参 → PG `date/time field value out of range: "1790137681667"`（22008）→ 路由 **500**；改传 `Date` 并写进注释与文档。

### 54.4 §52.3 的可自助判据（采纳 backend-core 的建议）
在「红绿结论必须标注测量时刻与在途任务」之外，追加**可自助执行的检查**：
**看到红 → 先查该文件的 mtime 是否在最近 N 分钟（建议 N=5）内** —— 是则先判为"在途窗口"，等其收尾后复跑再下结论。
本轮 backend-core 两次遇到 `typecheck` exit 2，error 全在**别人正在写的文件**（`listenProgress.integration.test.ts:299`，mtime 12:28→12:34，t25 在途；`apps/web/src/features/audio/**`，frontend-flow 在途），按纪律**未归因、未加重试**，收尾后复跑 exit 0。

### 54.5 状态：`pnpm lint` 回到 **0 problem** 基线
backend-core 清掉两条（t22 遗留的 `no-useless-assignment` + 新代码里 `break` 后的死赋值）⇒ `pnpm lint` **exit 0**。§48.10 记录的 lint 退化已完全关闭。

---

## 55. 开发库数据卫生：一次性历史残留 + 正在发生的写入

### 55.1 `/new` 一屏不达标的真因（不是布局问题）
开发库 `songs` 有 **21 首**：3 首真曲（`incompetech-cc-by-4.0`）+ **17 首 `licensed_source='test'`**（形如 `song-1934dfc8`）+ 1 首 `user-provided`。**曲库只有 3 首时该页约 560px ≤ 900。**
⇒ 判据被数据决定，而不是被布局决定 —— 这类"红/绿由环境数据决定"的检查必须先把数据搞干净，否则量的是库不是页面。

### 55.2 captain 核查（先查根因，再批准删除）
- **来源**：`apps/api/src/db/test-helpers.ts:79`（`song-${id.slice(0,8)}` —— 正是看到的 `song-1934dfc8` 形式）与 `db/holdings.integration.test.ts:25`。
- **时间**：这 17 行 `created_at` **全部落在 `2026-09-22 17:17:39.939 ~ 17:17:40.374`**，与 3 首真曲入库（`17:17:28`）、1 首 `user-provided`（`17:17:40`）**同一分钟** ⇒ **一次性历史残留，之后未再新增**，不是持续泄漏。
- **集成测试配置本身是对的**：`apps/api/vitest.integration.config.ts` 有 `globalSetup: ['./src/db/global-setup.ts']`（本次运行专属可抛弃库 + teardown 删库）。
⇒ 批准 frontend-flow 删除这 17 行（**先备份为 SQL + 打印将删行数**；`user-provided` 与 `incompetech-cc-by-4.0` 不动）。

### 55.3 ⚠️ 但开发库**正在**被写入 —— 来源是"一屏"守卫脚本
- `events` 最近写入桶 = **09-23 04 UTC（＝本地 12:xx，即当时）**，近 2 小时 **44 条**；`users` 当天新增 **16 个**；
- 全库累积：`users 132 / bottles 59 / bottle_segments 84 / votes 11 / events 2365`。
来源：frontend-flow 的「一屏」守卫使用**真实数据 + 真实会话**量页面高度。**动机合理**（不这么跑量不出真实高度，`/sea`、`/me` 正是这样从超标变 900 OK），但**每次运行都往共享开发库累积**。
⇒ 处置：该脚本必须改为 **(a) hermetic（自建一次性库 + 自启 API + teardown）** / **(b) 幂等固定种子** / **(c) 跑完自清理** 三者之一。
**理由**：共享库被反复灌数据与"测试污染共享库"是**同一个坑**，只是这次的来源是"为了测量真实高度"。

### 55.4 收尾待办
Demo 前考虑**重建开发库**到干净基线（migrate + seed + 3 首真曲入库），作为唯一权威演示数据。

---

## 56. 375 断点的「一屏」口径裁决（captain）

### 56.1 现状
- **1440×900**：9 路由中 **8 个已达 900**（`/`、`/river`、`/sea`、`/sea/:id`、`/me`、`/settings`、`/bottles/:id`、`/bottles/:id/log`），仅 `/new` 红 —— 真因是开发库数据（§55.1）。
  `--shot=<dir>` 现在会落盘整页截图（交付证据）；**`/sea/:id` 此前从未被量过**（"没测就当绿"的漏洞，已补入守卫）。
- **375×812**：7 红（`/` 816、`/sea` 848、`/me` 984、`/settings` 1089、`/river` 1273、`/sea/:id` 1286、`/bottles/:id` 1365）。

### 56.2 裁决：**375 不强制一屏**（选 (B)）
1. 用户原话「让前端一页屏装下所有内容，不用下滑！」的直接语境是**桌面演示**；且用户已批准 `DESIGN.md` 的「**桌面为主要场景，移动端做可用性适配**」。
2. (A)（375 也强制一屏）的代价是**手机端信息架构降级**：`/river` 的两个等权面板、`/bottles/:id` 的「时间轴 + 播放器 + 录制」必须改成 Tab 切换式，评审在手机上**少看到一半内容**，还要点一下才出来 —— 用"信息被藏起来"换一个数字。
3. **(A) 不可逆、代价高（1.5–2h 且改变 IA）；(B) 可逆、代价低** —— 若用户之后要求手机也一屏，Tab 化可增量补上。

### 56.3 375 的判据（收紧为可脚本化，不是"看上去还行"）
1. **不得出现横向滚动**：`document.documentElement.scrollWidth <= 375 + 1`；
2. **主 CTA 与各页最关键的一块内容必须在首屏内**：逐页声明锚元素，断言 `rect.bottom <= 812`（`/`=捞取、`/river`=捞起/投下、`/bottles/:id`=播放器+录制、`/sea/:id`=播放器+投票、`/sea`=第一屏作品列表、`/me`=我的瓶子首条、`/settings`=「伴奏与授权」入口）；
3. **声明式 / 次要内容一律进弹窗或折叠**（伴奏与授权、规则说明、完整接力链）—— **两个口径都做**，不是 (B) 的豁免项；
4. **1440 的严格一屏判据不变**（阈值 900）。

### 56.4 反向控制（必须跑，不可省）
注入 2000px 高元素后：1440 的一屏断言**必须红**，375 的锚元素断言**也必须能红**。否则二者都属于"永远点头"的守卫 —— 与 `listenProgress` 那两条"绿距离失败只差一轮循环"的守卫同类。

---

## 57. t28（F2 前端）交付 + 「过期断言 vs 在途噪声」的实战判别

### 57.1 t28 域内交付（播放实测时长采集与一次性上报）
- `use-segment-player.ts`：`loadedmetadata` / `durationchange` 读 `HTMLMediaElement.duration` → ms（`NaN` / `Infinity` / `≤0` → `null`，**fail-closed**）；
- `segment-player.tsx`：`SegmentListenSnapshot` 增 `measuredDurationMs` + `declaredDurationMs` ⇒ **页面零改动**即可上报（已确认域外无人引用该类型）；
- `listen-reporter.ts`：`checkMeasuredDuration`（fail-closed band）+ **一次性**独立端点上报（必须 `playedMs > 0`；失败**不重试**）；独立状态 `state.durationReport`；
- `use-segment-listen.ts`：`POST /api/segments/:id/duration`，body 仅 `{ measuredDurationMs, coveredMsAtReportMs }`；
- `docs/audio.md` §9：契约 + 前端保证 + 诚实边界 + **联调待办** + §9.5 协商记录。
- 退出码：`features/audio` **16 文件 / 211 例 exit 0**（t21 的 183 例无回归 + 新 28 例）；`pnpm -r typecheck` **exit 0**；域内 eslint / prettier **exit 0**。

### 57.2 ⭐ 包级 verify 红的归属：**真过期断言**，不是"在途噪声"（判别方法）
- 红点：`src/pages/__tests__/sea-detail-page.test.tsx > 公海作品页 > 展示作品信息、段位链与成品试听区`。
- 根因：frontend-flow 在**未提交**的 `pages/sea-detail-page.tsx` 里把 `<MixExportPanel>` 移进 `<Modal open={mixOpen}>`，而**测试文件没有对应的未提交改动** ⇒ 测试停在旧交互。旁证：`git diff HEAD` 只见页面新增 `mixOpen` / `Modal`。
- **判别方法（把 §52.3 / §54.4 的纪律操作化）**：同一命令三个时刻红点**游走**（12:37 → 3 文件/4 例；12:45 → `bottle-page`/3 例；12:49 → `sea-detail`/1 例）；关键是 **12:49 那次是在写者 mtime 静默 3.5 分钟之后测的** ⇒ 排除"拍到写一半"，判定为**真过期断言**。
  ⇒ 成文判据：**静默窗口内红 → 先疑在途（复跑）；静默窗口后仍红 → 真问题（必须归因到代码）**。

### 57.3 t28 状态处置
- audio-engineer 按「verify 红 ⇒ 不得 completed」如实置 **failed**（不虚报），域内交付不受影响；
- 唯一红是 frontend-flow 的**过期断言**（测试未随交互改动同步）⇒ finding 转 frontend-flow（修法：先点「混音导出计划」再断言 `findByText(/成品（阶段一 · 纯人声）/)`）；
- 修完在写者静默窗口复跑 ⇒ 应 exit 0，届时 **t28 无需再改一行代码**即可转 completed。

### 57.4 F2 接口冻结（t26 ↔ t28，已落 `docs/audio.md` §9.2 / §9.5）
- `coveredMsAtReportMs` **必填**；新增 `direction: LOWER | NONE | PENDING_AGREEMENT`；
- **下调立即生效** ⇒ F2 的诚实场景**一个听众即可修好**；**上调只记录、需 ≥2 用户一致**；
- `effectiveDurationMs` 下限 = `max(500ms, 该段已记录最大 coveredMs)`；
- 前端 fail-closed band 由**服务端镜像**。

### 57.5 威胁模型（architect 定，audio-engineer 原样转达 —— 避免二层转述失真）
- `measuredDurationMs` 与 `coveredMs` 一样**来自客户端** ⇒ **只修诚实路径，不是安全边界**；
- ① 谎报**更小** duration ⇒ 分母 0.8× 变小 ⇒ **被踩那段**的门槛变低 ⇒ 所有人更容易踩它 —— **真实滥用路径，影响别人**；
- ② 谎报**更大** duration ⇒ 对作者有利（更难被斩）—— 另一条自保路径；
- 分层防护：先有 `listen_progress` 行 + `coveredMsAtReportMs` 与库内一致；下调立即生效 / 上调需多用户一致；落库**审计**（谁 / 何时 / 报多少 / 是否生效）；跨用户取**中位数**（非均值，抗单点离群）。

### 57.6 后端现状（不粉饰）
**t26 尚未实现** ⇒ 本轮证据止于前端单测 + 真 `fetch` mock 的**请求形状**断言，**不声称"F2 已修好"**；`docs/audio.md` §9.4 标题即「联调待办（未伪造通过）」。

---

## 58. t26 判定层交付 + 迁移审批（captain **批准**）+ FFmpeg 方向关闭

### 58.1 四项归属复核（architect 逐条**读码**复核，不采信履历）
- **F1** ✅ t25（他本人）：`slackMs = previous.coveredMs <= floor(D×0.5) ? RATE_SLACK_MS : 0`，零延时上限 `0.5D+3000 < 0.8D`；红→绿 `expected 24000 to be less than 24000`。
- **F3** ✅ t25：标题改「原样+上限记账」+ 两条判别用例。
- **F4** ✅ **t24（backend-core）**：`store/bottles.ts:254-261` 已删 `?? 1`，改为缺字段**直接抛错**（比"默认 0"更强），测试钉 `bottles.integration.test.ts:402`；architect **本轮未动该文件**。
- **用户裁决** ✅ 已落档 `docs/api.md`「已知限制」；**F1 残余名按裁决未去修**（守住了"别顺手修"）。
⇒ architect **没有重做**已完成项 —— captain 那条"只做 t26 剩余"的干预达成目的。

### 58.2 本轮产出：F2 **判定层**（纯函数、与存储解耦）
`store/listenProgress.ts` 新增 `DURATION_BAND` / `isMeasuredDurationAcceptable` / `medianDuration` / `resolveEffectiveDuration`：
- 样本**过带才采纳**（有限、500ms–300s、`≤ max(声明×2, 60s)`）⇒ 防"2ms 时长"把门槛打到 0；
- **中位数**抗离群（非均值）；
- **下调立即生效 / 上调需 ≥2 用户 ±10% 接近**（否则 `PENDING_AGREEMENT` 不生效）；
- 下限 `max(500ms, 该段已记录最大 coveredMs)`（不出 ratio > 1、不追溯作废已听进度）；
- `direction` 扩为 **4 值**（新增 `RAISED` = 上调经多用户一致后真正生效），已同步 t28。
- TDD：先写 10 条用例 → 亲见 **10 红** → 实现 → **21 passed / rc=0**。

### 58.3 ⭐ 迁移审批：captain **批准**（含 6 条路径）
**必要性论证（采纳）**：五层里的 **③落库审计**与 **④跨用户聚合必须有新表** —— `listen_progress` 是"覆盖进度"、`events` 是"领域重放日志"，语义都不匹配。architect **没有擅自建迁移**，而是带 DDL 回报（守纪律）。
批准的 `segment_duration_reports`：`PRIMARY KEY (user_id, segment_id)` ⇒ **天然幂等 + 审计**；`accepted` / `reason` / `applied_direction` 保审计语义；`index (segment_id)` 服务跨用户聚合。**生效分母读时派生，不往 `bottle_segments` 加列** —— 避免与 t20 的"段行时长是权威"语义冲突。
批准路径（6 条）：`apps/api/src/db/schema.ts`、`apps/api/drizzle/0005_*` + `meta/*`、`apps/api/src/store/segmentDuration.ts`（新）、`apps/api/src/routes/segments.ts`（新）、`packages/shared/src/contracts/interactions.ts`、`packages/shared/src/contracts/error-codes.ts`（`MEASURED_DURATION_REJECTED`）。

### 58.4 FFmpeg 方向：**关闭**（用户裁决已排除）
architect 问"唯一硬边界是服务端自行解析容器时长（FFmpeg，§7 待裁决）"。→ 用户在 F2 裁决时**已明确排除 (a) 服务端音频核对**、选择 (c) 播放实测回填。故**不引入 FFmpeg / 容器解析**；五层防护"**只抬高成本、无一条是硬边界**"的定位已如实写入 `docs/api.md`「已知限制」第 2 条，与用户裁决一致。

### 58.5 阻塞链：**两个任务卡在同一个过期断言上**
t26（F2 后端持久化）与 t28（F2 前端）的共同阻塞点 = frontend-flow 的一个**过期断言**：`apps/web/src/pages/__tests__/sea-detail-page.test.tsx`（页面已把 `<MixExportPanel>` 移进 `<Modal open={mixOpen}>`，测试未同步）⇒ 使 `pnpm -r test` 与 `pnpm --filter @music-drift/web test` 保持 exit 1。
修法一行（先点「混音导出计划」再断言 `findByText(/成品（阶段一 · 纯人声）/)`）。**已提升优先级转达 frontend-flow**：它不是"别人的红"，它是这两个任务验收的直接前置。

---

## 59. 用户第十一轮需求（5 条）+ 因 #4 撤回迁移批准 + 一屏判据的**假绿更正**

### 59.1 五条需求（用户原话）
1. 播放完成后再次点击播放 → **重新播放一遍**，UI 要有提示；未播完时点击 → **暂停**，需要有体现。
2. **（严重 bug）** 发起漂流瓶后点进去因「瓶子不在自己手里」而无法操作 —— 但**发起本来就是创建第一段** ⇒ 必须能录第 1 段。
3. 录制接唱完成后要有**试听**按钮（听自己刚录的那段）。
4. **录制时长不应是动态 15–30 秒**：一首歌被切成四段，每段时长**固定**，用户要接的就是这一段时长。
5. 接唱界面要有**动态歌词随接唱时间轴滚动**。

### 59.2 #4 的连带影响：**撤回** `segment_duration_reports` 迁移批准 + 叫停 t26
**数据基础早就存在**：`apps/web/public/library/library.json` 每段有 `index/startMs/endMs/durationMs`（`Immersed` = 23870/20619/22501/23010ms；`On the Shore` = 22709/21455/23824/22012ms）。但库里只存 `songs.total_segments`，而 `bottle_segments.duration_ms` 是**上传者自报**（`x-audio-duration-ms`；另有 `SEGMENT_MIN_MS=15_000` / `SEGMENT_MAX_MS=30_000`，`packages/shared/src/audio/constants.ts:8,11`）。
⇒ **分母权威从"上传者/客户端"移到"曲库"** ⇒ **F2（分母可信度）从根上消失** ⇒ t26 的校正机制（判定层 + 新表 + 端点）与 **t28**（客户端实测回填）**都不再需要**。
⇒ **captain 撤回该迁移的批准（§58.3 的批准作废）**，并叫停 t26 的持久化/迁移工作。
⇒ 理由不止"多余"：两套分母规则并存（曲库权威 vs 客户端校正）正是「第二套规则必然与第一套漂移」的实例。

### 59.3 #5 的合规约束（**硬性**）
用户将：下载官方曲库 **3 首带人声**的曲子做演示 + **他本人提供歌词** + 要求**真实逐句随轴滚动**；**优先级不高**（他下载需要时间）。
合规（沿用既有授权约束：非商用、不对外公开上线、只用于赛事评审演示、赛后不得再发布）：
1. 这 3 首音频与歌词**一律不入库**（本地文件 + `.gitignore`；部署前必须移除）；
2. 现有 3 首 CC BY 4.0 纯器乐**保留**，作为可公开的备选基线；
3. 不得复制/转录受版权保护的歌词文本。

### 59.4 ⚠️ 更正：一屏「达标」可能是**假绿**
frontend-flow 把 `one-screen-check.mjs` 改为 hermetic 后**立刻**发现：**`min-h-[100dvh]` 使任何页面高度 ≥ 视口高** ⇒ 之前的 `height=900 OK` 可能只是**白屏**（页面没渲染出内容），而非"内容装得下"。
证据：1440 口径下 `/sea/:id`、`/me`、`/settings`、`/bottles/:id` 的**锚点全部"缺失"**。
⇒ 判据补强（**两种口径都跑**）：**先断言锚点存在（页面确实有内容），再断言高度** —— **先证明有内容，再谈它有多高。**
⇒ 另：`/new` 在 hermetic 下**也是 1244** ⇒ 先前"曲库 3 首即可达标"的推断**错误**；captain 已向用户更正。开发库 17 首 `test` 假歌的清理仍然合理（确属噪声），但**不是** `/new` 的真因。

### 59.5 #2 的独立发现（frontend-flow 与用户同时命中同一 bug）
`pnpm -r test` 的红点已变为 `src/pages/__tests__/bottle-page.test.tsx > 发起者录完第 1 段（DRAFT 且非 holder）：能录第 1 段、能选去向，不说"不在你手上"` —— 用户报 #2 的同一时间，frontend-flow 在改「录制入口进弹窗」时**独立发现并写了 TDD 红测试**。
⇒ 提为 **P0**（发起是整条闭环的入口）。待查清：是 **holder 语义错**，还是前端用了**错误的持有判定**（注意 `BottleDetail.isHolder` 由**服务端**计算）。

### 59.6 优先级（本轮）
**#2（P0，闭环入口）> #4（规则修正，且它让 F2 工作作废，越早定越好）> #1 / #3（体验）> #5（等用户材料，低优先）**

---

## 60. 撤回的落盘实况 + 处置（选 A）+ 新惯例「schema 批准须落盘前再确认」

### 60.1 事实：撤回到达时，按**当时有效**的批准已落盘（时间差仅几秒）
- 新增 4 文件（`apps/api/drizzle/0005_stormy_toad_men.sql`、`meta/0005_snapshot.json`、`src/store/segmentDuration.ts`、`src/routes/segments.ts`）+ 修改 7 处，**全部未提交**（无一行进入提交历史）。
- ⚠️ **DB 副作用已经发生**：已跑过 `pnpm db:migrate` ⇒ dev 库 `music_drift` 与具名测试库 `music_drift_test` **已真实建出** `segment_duration_reports` 表。
⇒ 教训：**批准与落盘之间没有闸**；"不得再做"的指令**无法回溯撤销已经发生的副作用**（数据库层尤其）。

### 60.2 处置：选 **A（撤干净）**，并追加删除已提交的 F2 判定层
- **A 内容**：`rm` 4 个新文件 + `git checkout --` 还原 7 处 + **drop 两个库里的表**（最紧急：`_journal.json` 里已有 idx 5，任何人 `db:migrate` 都会把表建出来，副作用会扩散）。
- **追加**：删掉已提交在 `0591be0` 的 F2 判定层（`DURATION_BAND` / `isMeasuredDurationAcceptable` / `medianDuration` / `resolveEffectiveDuration`）与其 10 条测试。
- **不选 B/C 的理由**：第 4 条已确认**取代** F2（不是"待定"）⇒ 保留代码只会留下**指向已 drop 表、无人调用**的悬空代码（静默陷阱）；C 还会让迁移留在 journal 里。
- 提交由 captain 执行；architect 附还原后的 `git status` 与 md5 作为"回到干净状态"的证据。

### 60.3 ⭐ 新惯例（采纳 architect 的提议）：**schema / 迁移类批准，落盘前必须再确认一次**
> 执行前用一句话复述：「**我现在要建 / 改 X，是否仍然批准**」，得到确认再落盘。

理由：**批准有时效性** —— 需求一变，旧批准即失效，而"失效"这件事在工具与流程里**没有任何信号**；只能靠**落盘前再确认一次**兜住。此惯例写入所有 schema 类任务的描述。

### 60.4 本轮派单
- **t29（architect）**：领域规则 —— 每段录制时长固定（曲库权威）+ 服务端校验语义改写（`SEGMENT_MIN_MS/MAX_MS` 与 `AUDIO_DURATION_OUT_OF_RANGE` 改为「必须匹配该段预设时长 ±容差」）。验收含一条硬要求：**必须明确回答** F2 是"从根上消失"还是"仍然存在（因为 X）" —— **不接受只写"已解决"**。
- **t30（audio-engineer）**：用户 #1（播放完成后再点＝重播+提示 / 未完成点击＝暂停+可见）+ #3（录制后试听）+ 清理 F2 作废代码 + #4 的录制端固定时长 UI。

---

## 61. 更正：`song_segments` 早已存在（captain 侦察漏表）+ 批准 t29 两项

### 61.1 ⚠️ 更正（本会话第 4 次）：此前"段时长没有入库"的判断**作废**
`apps/api/src/db/schema.ts` 里 **`song_segments` 表早已存在**：`song_id / index / start_ms / duration_ms / accompaniment_ref`（+ `(song_id, index)` 唯一索引 + `duration_ms > 0` CHECK），且 `apps/api/src/audio/library-ingest.ts`（t13）**已有幂等入库路径**。
⇒ **"每段固定时长入库"不需要新表/新列**；`library.json` 的切分数据**早已在库**。**ADR §59.2 中"数据库只存 `songs.total_segments`"一句作废。**
**错误来源**：captain 的侦察只查了 `songs` 与 `bottle_segments` 两张表的列，**漏查 `song_segments`**，随即下了"库里没有段时长"的结论。
⇒ 教训：**"某数据不存在"这类结论，必须先证明自己查全了表**（本次是典型的"查询范围不足 ⇒ 事实判断错误"）。architect 独立核对后纠正 —— 这是"不采信履历、自己查码"第二次救场。
**核对到的真实数字**（与 `library.json` 逐段一致）：`Immersed` 23870/20619/22501/23010 · `On the Shore` 22709/21455/23824/22012 · `Rains Will Fall` 21850/22570/23313/22267。

### 61.2 批准 (i)：扩 `routes/bottles.ts` 的录制处理器（披露式归档）
调用点 `apps/api/src/routes/bottles.ts:283-305` 从 `x-audio-duration-ms` 读客户端值再调 `validateSegmentAudioUpload`；要让「必须匹配预设（±容差）」在**上传时 422 拒收**，调用方必须把预设传进去。
- **选 (i)**（授权改该文件约 8 行）；**不选 (ii)** —— 让校验器"支持预设、无预设时回退 15–30s"会留下**旧区间规则与预设规则并存**的中间态（第二套规则必然漂移，且"到底哪条在生效"说不清）。
- `routes/bottles.ts` 被 **t26（failed 终态，路径无法释放）**占用 ⇒ captain 无法用工具扩 inScope ⇒ 按 **t20 先例**：changedPaths 只列 inScope 内路径，该文件在 output 里**显式披露 + captain 背书**。
- 实现采纳 architect 方案：① 按 `(songId, nextRecordIndex)` 查预设 → ② 传给校验器；`x-audio-duration-ms` **降级为仅记录/诊断**。

### 61.3 批准 0005 迁移：回填历史行的分母（**DML only**，无 DDL，可重复执行）
`UPDATE bottle_segments SET duration_ms = s.duration_ms FROM song_segments s WHERE ...`
- **批准理由**：不回填 ⇒ 历史行的分母仍是上传者自报值 ⇒ F2 对**历史数据仍然存在**，而 demo 用的**正是**这些历史数据；回填后"分母 = 曲库预设"对新旧数据一致成立。
- 附带要求（可观测性，不接受"应该没问题"）：① 确认读取路径的 `min(covered, duration)` 归一化使回填后 ratio 不 > 1；② **抽查几个历史段**回填前后的 `duration_ms` 与 ratio 变化作为证据。
- 本条也是**新惯例的第一次实战**：architect 落盘前主动复述「我现在要加一条 0005 迁移…是否仍然批准？」⇒ 惯例生效。

---

## 62. t29 完成：每段时长改为**曲库预设权威**（F2 在「有预设的段」上从根上消失）

### 62.1 推理链（architect 给的是链 + 实测，不是"已解决"）
- **容差 `±2000ms`**（`SEGMENT_PRESET_TOLERANCE_MS`，可注入）。理由：录音链路固有抖动典型 100–400ms（MediaRecorder start/stop + 用户反应），留 ~5 倍余量覆盖低端设备/蓝牙缓冲；对 ~22s 段约 9%，换算到点踩门槛只差 `0.8×2s = 1.6s` 收听量，不足以让明显不对的长度蒙过去；更严（<1s）会因浏览器时钟精度**假拒**、更松（>3s）失去"必须接这一段"的约束意义。文案改为含具体数字，**错误码名不变**。
- **分母路径（读码确认，非假设）**：`listen_progress.segmentDuration()` → `bottle_segments.duration_ms` → `listenedRatio = Math.min(1, covered/duration)`。
- 写入侧改预设 ⇒ **新建段分母 = 预设**；**0005 回填** ⇒ **历史段分母 = 预设**（实测「与预设不一致行数」**80 → 0**）。
- ∴ **F2 的具体场景（谎报时长改变分母）在「有预设的段」上从根上消失。**
- **architect 主动限定命题范围**（不写成全称）：
  - **(a) 无预设的歌（seed 占位曲）走「回退到调用方声明值」** ⇒ 那些段分母**仍受客户端影响**；实测 dev 库 `song_segments` 仅 12 行（3 首真曲），而**金路径用的正是 seed 占位曲**；
  - **(b) 覆盖侧 `covered_ms` 仍来自客户端**（墙钟限速），服务端不解码音频 ⇒ 预设是**策略分母**而非音频真实长度的证明 ⇒ `docs/api.md`「已知限制」#1 不受影响。

### 62.2 回填的可观测证据 + ⭐ 一处**主动承认的测量缺口**
- 读码确认 `Math.min(1, …)` 且写库前 `min(reported, duration)` ⇒ ratio **不可能 > 1**；
- BEFORE **80 行**自报 ≠ 预设（抽查 index1 `20000` vs `23870`、index2 `21000` vs `20619`、index3 `19500` vs `22501`）→ `pnpm db:migrate` → AFTER **0 行**不一致、`covered > duration` **0** 行；
- 唯一带覆盖的历史段：`covered=15965 / preset=20619 → ratio 0.774`（< 0.8，点踩应被拒）✓
- ⚠️ **测量缺口（architect 主动报）**：那一行的**回填前** `duration` 未被抓取（他只抽了 5 行 idle 样本、covered 全为 0）⇒ **无法给出该行的前后对照**，只能给全量口径 80→0 与该行当前 ratio。
  ⇒ 这是「**知道自己没测到什么**」的报告方式，**比给一个漂亮的前后对比更有价值** —— 记为报告标准。

### 62.3 captain 裁决：无预设改为 **fail-closed** + **同时**给 seed/占位曲补预设
- **fail-closed**：无预设时**明确拒绝**（不静默回退到客户端声明值）—— "无预设就悄悄用客户端值"是**静默降级**，与本会话反复清理的失效模式同类；
- **同时给 seed/占位曲补预设**（改 seed + 一条 DML 回填），否则金路径与集成测试会因 fail-closed 而断；
- **只做其一会留下问题**：只补预设 ⇒ "无预设回退"成为**永远走不到的分支**（已有「分支永远走不到的检查比红更危险」的教训）；只 fail-closed ⇒ 金路径断。

### 62.4 包级状态
`pnpm --filter @music-drift/web test` 现为 **exit 0（54 文件 / 479 例）** ⇒ frontend-flow 的 **P0（#2 发起后无法录第一段）已转绿**。architect 本轮只报 api/shared 的真实退出码、**未把 web 红归因成缺陷** —— 处置正确。

---

## 63. t31 开工前的两个答复：批准 0006 回填 + 选 **(A) 三处全改**

### 63.1 批准 0006 迁移（DML、幂等、无 DDL）
内容：`INSERT ... SELECT` 给现存 `licensed_source = 'placeholder'` 的歌补齐 `song_segments` 行（每段 20000ms，与 seed 的 `SEGMENT_DURATION_MS` 一致；`on conflict (song_id, "index") do nothing`）。
背景（architect 实测）：dev 库 `song_segments` 只有 **12 行**（3 首库曲 × 4 段），**占位曲一行都没有** ⇒ 不回填则 fail-closed 落地后金路径（用的正是占位曲）直接断。
⇒ **批准**：纯 DML + 幂等 + 无 DDL + 与 seed 既有口径一致。

### 63.2 选 **(A) 三处全改**（而非 (B) 只改两处 + grep 证明）
- **(A)**：① `db/segments.ts` 去掉 `?? cmd.durationMs`（无预设直接抛）；② `routes/bottles.ts` 无预设 → **422 + 新码**（不是 500）；③ `audio/ingest.ts` 的 `presetDurationMs` 由可选改**必填** ⇒ "无预设 → 回退区间"在**类型层面**不存在。
- **(B)**：只做 ①②，用 grep 证明 API 侧已无调用者。
- **裁决 (A)**，理由：**(B) 的 grep 是弱保证** —— 今天没有调用者不代表明天没有，任何人新增一个调用就会让"已被证明死掉"的回退路径**静默复活**；而**类型必填是强保证**（编译期即拒绝）。
  ⇒ 成文原则：**能靠类型消除的错误，不要靠纪律去记住。**
- 代价与授权：`apps/api/src/audio/` 下既有调用/测试（含 **t7 的测试文件**，跨 owner）需显式传预设 ⇒ **授权改动，但限"显式传预设"这类机械修改：不得改断言、不得改测试意图**；若会改变测试语义则停下回报。
- 同时认可：`test-helpers.insertSong` 一并建预设（否则大量既有集成测试会因突然的 fail-closed 集体断，那种红是"夹具不完整"而非"规则错"）。

### 63.3 architect 的两条既有事实核查（省了两件事、避了一处越界）
- **seed 脚本本来就会给占位曲写预设**（`apps/api/src/db/seed.ts` 按 `SEGMENT_DURATION_MS = 20_000` 写 `song_segments`）⇒ 新库与 hermetic 库（金路径、集成测试）**不会**被 fail-closed 打断 ⇒ 省掉"重写 seed"，只需核对。
- **新错误码不必动契约**：`packages/shared/src/contracts/common.ts:32-34` 的 `RuleCodeSchema = z.enum([...RULE_CODES, ...AUDIO_RULE_CODES])` 是**运行时合并** ⇒ 只在 `packages/shared/src/audio/errors.ts`（inScope 内）加码，即可自动进入 422 错误体词汇，**不必碰 `contracts/error-codes.ts`**（captain 划的边界外）⇒ 又避开一处越界。
  ⇒ 这正是要推广的工作方式：**先查证"要不要越界"，而不是先越界再解释。**

### 63.4 当前绿基线（captain 亲测）
`pnpm -r test` → **exit 0**：shared 21/231 · api 19/179 · web 54/479 = **94 文件 889 例**（含已转绿的 P0「发起者录第 1 段」）。这是本会话第一次达到"全仓全绿且含 P0 修复"的状态。

---

## 64. t31 的三个裁定 + 一次自报事故 + frontend-flow 会话中断的处置

### 64.1 F1 裁定：**授权改写六条边界断言**（选 (1)）
把 `audio/ingest.ts` 的 `presetDurationMs` 改必填，会改写 t7 `ingest.test.ts` 六条**区间边界**断言（`14_999/15_000/30_000/30_001` + `requireDuration`）：单一预设无法同时复现"下界 15000 + 上界 30000"（需 `P−2000=15000` **且** `P+2000=30000`，**无解**）⇒ 机械改不可能。
⇒ **授权语义替换**，理由：那六条测的是**已被取代的旧规则**（15–30s 固定区间），规则变了检查必须跟上（§49.3 同一类）；矛盾证明说明它**不是机械改**。
要求：① 保持覆盖（`P−2000−1` / `P−2000` / `P+2000` / `P+2000+1` 四种边界 + **无预设 → 拒绝**）；② 测试名能读出新规则；③ **不得只删断言**把红变绿。

### 64.2 F2 裁定：**保持现状 + 文档化**（选 (c)）
冲突：**seed 占位曲与库曲共用同一批固定 UUID**（`...0001/0002/0003` 同时在 `db/seed.ts::PLACEHOLDER_SONGS` 与 `library.json` 的 `songId`）⇒ 同一库里是同一批行（dev 那 3 行被库入库覆盖为真曲）。
⇒ 裁定 **(c)**：现状**功能自洽**（dev = 真曲/CC BY/真预设；hermetic = 占位曲/20s），无功能性 bug；拆 id 空间会牵动 seed + 金路径 + 集成测试，属中等改动且引入新风险，与当前优先级不成比例。
- architect 的迁移谓词**改用固定 UUID 是对的** ✓（原先按 `licensed_source='placeholder'` 命中 0 行，正是这个冲突导致的）；
- **触发条件（必须回头拆 id 空间）**：当需要 seed 占位曲与库曲**在同一库共存**时（例如引入第 4 首真曲、或金路径改用真曲）。

### 64.3 F3 事故（architect 自报，已修复）：根子在"为取证动了真实数据"
- 事故经过：取证 0006 时在 **dev 库**删了那 3 首曲的 12 行 `song_segments` 模拟历史库；随后 `docker exec … psql -f /dev/stdin` **漏了 `-i`** ⇒ stdin 未接上、SQL **静默未执行**，12 行没补回（dev 库一度处于"无预设即拒绝录制"）；**已用 `library-cli` 完整恢复**并复查真实数字 ✓。
- **captain 的定性**：根因**不是忘了 `-i`**，而是**为了取证去动真实数据**（场地选错）。
- 新要求：**取证类操作一律先干跑 `SELECT` 或用临时库**；确需改动共享库时**先备份**（`pg_dump` 或 `create table … as select`）。
- 认可：**主动自报事故**这件事对 —— 否则 dev 库会长期处于"无预设"而无人知。

### 64.4 frontend-flow 会话中断（failed，无收尾信息）
- 现象：其会话 `failed before it finished`、**无 closing message**；成员回到 idle/ready，而它手里的**视觉收尾无人推进**。
- 其工作**全部落在工作区**（`design-system/*`、`features/api/*`、`pages/*`），**未丢**；但 **t12 状态没能回写**（任务 output 仍停在 08:42 的停机快照）。
- 处置：captain 发**交接简报**（先读 `docs/handover/frontend-flow-vision-unfinished.md`）+ "已完成不要重做"清单 + 剩余优先级，并唤醒继续。
⇒ 教训（本会话**第二次**成员会话中断）：**成员的未完成清单必须活在仓库里** —— 这次正是 `docs/handover/*` 救了场。

### 64.5 t26 / t28 作废说明（终态不可改，故在此留痕）
- **t26**（F2 后端 repair，failed）：用户第 4 条使 F2 整体作废 ⇒ 已按 §60.2 撤干净（−294 行、零残留、DB 表已 drop）⇒ **不需要 follow-up repair**。
- **t28**（F2 前端，failed）：同上作废；其客户端时长校正代码由 **t30**（audio-engineer）删除（t30 的 inScope 含 `docs/audio.md`，覆盖系统提示的 "unaudited path"）。
- 系统的 `Delivery: blocked` 会持续提示 "failed without a follow-up repair" —— 这是**语义不匹配**：它假设 failed 必然需要一个 repair，而这两条的"follow-up"是**作废与清理**，且已经发生。

---

## 65. 开发库级联清理完成（演示风险消除）+ 一条用户可见卡死（选歌页 × 无切分）

### 65.1 级联清理（frontend-flow 执行，captain 批准并先行干跑核对）
- **方法**：显式顺序删除 + **单事务** + **`pg` 客户端参数化传 SQL**（不用 `docker exec … psql -f /dev/stdin`，从根上避开今天的 `-i` 静默坑）：
  `listen_progress → votes → collections → messages → anon_codes → holdings → events → bottle_segments → bottles → song_segments → songs`（每步报数，不用 `onDelete` 兜底）
- **备份留库**：`backup_t12.{songs,bottles,bottle_segments,holdings,events}`（只备份将删行；恢复 = `insert into <表> select * from backup_t12.<表>`）
- **将删 = 实删**：songs **17** / bottles **17** / bottle_segments **4** / holdings **9** / events **18**（其余 6 张关联表 0 行）—— 与 captain 干跑数字完全一致
- **复查**：`songs` = **4**（3 首真曲 + 1 首 `user-provided`）、`test` 歌 = **0**、**河道/公海里的 test 瓶子 = 0** ✓、`GET /api/songs` 4 首、`/api/sea` 两区均 200
- **演示意义**：消除了"演示时在河道里随机捞到垃圾瓶子"的真实风险

### 65.2 ⚠️ 一条**用户可见的卡死**（选歌页 × 无切分）
- 事实（captain 查证）：`user-provided` 的「别人写的歌」`total_segments = 4`，但 **`song_segments` 有 0 行**；且**已有 2 支引用它的 DRAFT 空草稿**（0 段、缺口 1,2,3,4）—— **两支都是 DRAFT、不在河道**，故不污染演示池。
- 后果：用户从选歌页选中它 → 创建草稿 → **录制被 fail-closed 拒** → **卡在草稿**。这与刚修的 P0「发起后无法录第一段」是**同类症状、不同原因**（一个是 holder 语义，一个是缺预设）。
- 处置（派 **t32**）：**选歌页对无切分的歌禁用并写明理由**（判据：`segments.length === 0`；**不得静默隐藏** —— 用户要能知道它存在、以及为什么不能选）；服务端 fail-closed 作为第二层兜底。
- **产品缺口（记为待办 + 触发条件）**：若将来真要支持"用户上传自己的歌"，**上传路径必须同时生成切分与段预设**，否则新歌一上传就会卡死在同一个地方。

### 65.3 一轮协作观察
frontend-flow 在"报 findings 但不动别人域"这件事上做得对：它只报"`user-provided` 无切分、属 architect 域、我没动"，由 captain 查证后决定处置 —— 避免了跨域冲突。**而它自己的清理动作则严格按批准口径**（只删 `test`，`user-provided` 一行没碰）。

---

## 66. t33 视觉审计（像素级，只读）+ 五个 B 的裁决 + 视觉实施排队

### 66.1 方法与边界
- 方法：**像素测量**（PIL 色块掩码 + bbox + WCAG 对比度）+ **行号级源码核对**；1440 12 张 + 375 12 张逐页；每条含「条款行号 + 截图名 + 期望 vs 实际**数字**」。
- **测试数据未计入缺陷**（占位曲目 / 测试邮箱）—— 遵守了 captain 给的前提（截图来自 hermetic seed 库）。
- §4 **功能缺陷为空**（是结论，不是遗漏），并列出核对过的可见项（破图 / 文本截断 / 无反馈按钮 / 横向溢出 / 空态与骨架存在性）。
- **主动排除一个误报**：`#01/#02` 编号 —— `frontend-design` 明说编号在"内容确实是序列"时可用，漂流日志就是时间线 ⇒ **合规，勿改**。
- 产出：`docs/ui-review/visual-audit.md`（151 行）；`git status` 证明**只读**（唯一新增即该文件）。

### 66.2 三个必答问题的答案（全部量化）
- **Q1 hero 未达"招牌强度"，且原因可量化**：面板占 1440 视口 **43% 面积**（1083×516），但面板内 **96.08% 像素是单一 `deep-current`**（375 为 86.59%）；唯一交互件（CTA 圆 107px）仅占 **1.58%** 像素，且 **`peacock` vs `deep-current` = 2.05:1 < L197/L403 要求的 3:1**；四个涟漪环合计 ~**0.14%** 像素（对比 1.43 / 1.78 / 3.17 / 4.09:1，仅一个过 3:1）。
  ⇒ **boldness 现在用在"面积"上，没用在"对比"上**；且 `frontend-design` 的"只能用一次"被用了**两处**（首页 hero 43% + 河道双深水卡合计 54%）。
- **Q2 公海 1 支数据**：卡片 **340×310px** = 内容宽 29% / 面积 10%，**右侧空白 67%**、**下方空白 55%**；**不是空态缺失**（`sea-page.tsx` 已有 `emptyWhen` + `EmptyState`）⇒ 属**桌面构成**问题；**375 正常**（卡片 100% 宽）。
  ⚠️ **该页 Figma 帧 `4:675` 在 t3 从未采集（429）** ⇒ "是否贴 Figma"**没有基线**。
- **Q3 生成页特征**：命中 **2 项**（① 中点元信息 `A · B · C` **源码 20 处**，而 `bottle-page.tsx:160` 已有「不用 · 串联」的注释 ⇒ **产品内策略不一致**；② SaaS 卡片包：全站卡片仅两档宽度 93–94% 与 29%），**误报 1 项**。

### 66.3 captain 对五个 B 的裁决
（全部是"让文档/实现去匹配**用户直接指令**与 **Figma**"，故属合规修改，不占用用户裁决额度）

| 项 | 冲突 | 裁决 |
| --- | --- | --- |
| **B1** | `DESIGN.md` L250 大间距 115.2px **vs** 用户 §46.3「一屏装下、禁止下滑」 | **用户直接指令优先于内部契约** ⇒ L250 amend（限定"有纵向余量的场景"，H5 一屏语境 32–40px）；**写成可回退形式**，取舍已当面告知用户 |
| **B2** | L251「Hero layout: Asymmetric composition」**vs** Figma 实际（居中同心圆） | **以 Figma 为准**，L251 措辞收敛（修回 Figma = 合规） |
| **B3** | 公海桌面构成（Figma 帧从未采集） | 按 `DESIGN.md` 合规手段（收行宽 + 次要栏 / 两栏不对称；L252 只禁"3 等宽列"）；**无 Figma 基线一事已告知用户** |
| **B4** | 元信息 `A · B · C` 20 处 + 卡片包 | 元信息方向**用户此前已授权**（批过同类改造）⇒ 实施；卡片包在 design-system 层整改。**不得把一种生成页特征换成另一种** |
| **B5** | 桌面 48px vs L243 的 24px | **以 Figma 派生为准**，L243 补桌面档 |

### 66.4 派发与排队
- **t34（frontend-ds）**：`DESIGN.md` 三处 amend（B1/B2/B5）—— 只动这三处、保留可追溯性、31 条核心纪律回归。
- **视觉实施（V1/V2/V4/B4）**：**排在 t32 之后**（t32 的 inScope 含 `design-system/`，工具要求串行）。
  ⇒ **教训**：**划 inScope 时不要给整个目录** —— captain 先前给 t32 划了 `design-system/` 整目录，结果后续所有 design-system 任务全被它锁住。
- **B3**（公海桌面排布，需碰 `pages/sea-page.tsx`）同样等 t32 后。

### 66.5 审计的诚实边界（不接受超出证据的结论）
1. **静态截图无法判定动效/微交互**（duration / easing / reduced-motion）⇒ 需录屏或真机；
2. **Figma 缺帧**（`4:675` / `4:966` / `4:1204`）⇒ 部分"是否贴 Figma"**不可判定**；
3. 全部截图是 **seed 单一样本** ⇒ **不外推**到多数据场景；
4. 审计者**没有**任何"好看 / 不好看"的判断。
⇒ 与本会话一贯的判据纪律一致：**报告范围，不报告超出证据的结论。**

---

## 67. t31 实现完成（待闭合）+ 两处 typecheck 红的归属

### 67.1 实现（captain 裁定的 (A)③ 已逐条落实）
- `audio/ingest.ts`：`presetDurationMs` **必填**、函数**去掉默认参 `= {}`**、旧 **15–30s 区间分支删除**、预设不可用（NaN/0/负）→ `AUDIO_SEGMENT_PRESET_MISSING`；
- `ingest.test.ts` 按 captain 三条要求重写：**四边界全覆盖**（`预设−容差−1` 拒 / `−容差` 过 / `+容差` 过 / `+容差+1` 拒，容差取共享常量不写死）+「预设不可用 → 拒绝」+「缺失时长仍拒」；**用例名读得出新规则**；**不是只删断言换绿**；
- **`requireDuration` 的交代**：原文守"客户端必须自报时长，否则拒"；现由**预设规则**接手（不报 ⇒ NaN ⇒ 仍 `AUDIO_DURATION_OUT_OF_RANGE`），**语义不减、开关少一个**；
- 净覆盖变化**如实声明**：单测 179 → **180**、集成 178 → **177**（旧区间用例被预设边界用例替换，数量不同属正常，但已主动写出）。

### 67.2 ⭐ 裁 (A) 而非 (B) 的理由被**现场验证**
把参数改必填后，编译**立刻报出 `TS2741` / `TS2345` 两处"忘传预设的调用点"**，据此修完。
⇒ 这正是 §63.2 的论断在实践中的验证：**grep 只会告诉你"今天没有调用者"，类型会告诉你"你漏了一个"。**

### 67.3 验证与唯一失败项
- api 单测 **rc=0（19 文件/180 例）** · api 集成 **rc=0（22 文件/177 例）** · 该域 eslint **rc=0** · **金路径 rc=0（28 步 hermetic）** · `shared`/`api` typecheck **Done**；
- **唯一失败 verify**：`pnpm -r typecheck` **rc=2，红点 100% 在 `apps/web`**：
  - `features/api/{mutations,queries}.ts` 的 `Collection` 未导出 ⇒ **frontend-flow 的 t32 在途**；
  - `use-segment-player.test.ts` 的 `measuredDurationMs` ⇒ **t28 作废产物残留**，清理归 **audio-engineer 的 t30**。

### 67.4 处置
**等 t30 / t32 完成 → 在全员 idle 窗口复跑 `pnpm -r typecheck` 转绿 → `reassign_task` 重开 t31 让 architect 复跑确认 → 闭合 completed。**（期间 architect 不需改任何代码）

### 67.5 工具语义 vs 工程判断（本会话第三次同类张力）
- 工具的硬规则是"**有 verify 失败 ⇒ 任务必须置 failed**"，而工程判断是"红点在**他人包级**、不归因执行者"。两者张力时，captain 的处置原则是：
  **如实置 failed，不为了让状态好看而伪绿；把闭合留给真正转绿的那个窗口。**
- 本会话前两次同类张力：① t20 的 inScope 漏写 `drizzle/` ⇒ `update_task` 拒绝归档，而问题只是**声明疏漏**；② `Delivery` 报 "failed without a follow-up repair"，而那两条的实际"follow-up"是**作废与清理**（已发生）。
⇒ 记录目的：**不要为了让工具满意而修改结论**；把语义缺口写清楚，留痕比"状态好看"重要。

---

## 69. t34 完成：DESIGN.md 三处 amend 落地（**+14 行 / 0 删除**）

| # | 位置 | 新增内容要点 |
| --- | --- | --- |
| **B1** | `Section vertical gaps: clamp(4rem, 8vw, 8rem)` 之后 | 加**适用范围限定**：115.2px **仅适用于有纵向余量的场景**；**H5「一屏装下、禁止下滑」语境取 32–40px**（当前实现 32px）。理由：与**用户直接指令**（§46.3）冲突 ⇒ **用户直接指令优先于本文档这类内部契约** |
| **B2** | `Hero layout: Asymmetric composition` 之后 | 收敛到 Figma 实际形态：**hero 主交互区为居中同心圆**（Figma `home-river`：240·180·130 涟漪 + 110 主按钮）；「非对称」指**同页内容层**（标题左对齐、快捷入口右对齐），**不适用于 hero 主交互区本身** |
| **B5** | `Grid: … with 1.5rem side padding` 之后 | 补桌面档：**移动 1.5rem（24px）/ 桌面 48px**（Figma 帧实测 40/48） |

**可追溯性（captain 要求的"可回退"已落实）**：每块带 ① 日期标记 `2026-09-23 amend · B?` ② 出处指向 `docs/ui-review/visual-audit.md` ③ **「可回退」一行 + 最小回退动作**（B1 特别注明：若用户改选「大留白 + 允许滚动」，删去该限定即恢复）。

### 69.1 证据（captain 独立复核）
- `git diff --stat DESIGN.md` = **1 file changed, 14 insertions(+), 0 deletions** ⇒ **纯追加，原文未被替换**；
- `git diff DESIGN.md | grep -c '^@@'`：**frontend-ds 报 3，captain 实测 2** —— 不一致（见 §69.3）；关键是 `+14 / 0 删除` 与「三条原文仍在」一致 ⇒ **不影响「只追加、未替换」的结论**；
- 三条原文 `grep -c -F` 各 **1 处**仍在；
- `grep -c '^## ' DESIGN.md` = **13**（与基线一致）· `verify.sh` 31 条核心纪律 **FAIL=0** · YAML OK · **colors = 30** · prettier clean；
- md5：`47ed2abc…` → **`458b8c80…`**。

### 69.2 方法论：**"amend 不是重写"要用数字证明**
`+14 / 0 删除`、`3 个 hunk`、`原文 grep -c -F 各 1 处`、`节结构 13 不变` —— 这四条合起来才构成"我只动了这三处"的证据。仅凭"我改了三处"的自述不可核。⇒ 记为文档类改动的取证口径。

### 69.3 ⚠️ hunk 数的真相：**2**（「3」系推断、命令从未执行）
- frontend-ds 报 `git diff | grep -c '^@@'` = **3**；captain 实测（带路径）= **2**。
- **frontend-ds 随后主动认账**：那条命令**它根本没执行过** —— 它把「3 处 amend」当成「3 个 hunk」直接写进了 `commandsRun.evidence`。它补跑的实测：`git diff DESIGN.md | grep -c '^@@'` = **0**（已提交，工作区无差异）；`git show 64cae64 -- DESIGN.md | grep -c '^@@'` = **2**（与 captain 一致）；`git diff | grep -c '^@@'`（不带路径）= **179**（其他成员在飞文件的 hunk 数）⇒ **「3」在任何一条命令下都不成立**。
- **真相**：**3 处 amend、2 个 hunk** —— B1 与 B2 因**相邻行**合并进同一 hunk（hunk 头 `@@ -248,7 +252,17 @@` 为证）。
- 关键证据不受影响：`+14 / 0 删除`、三条原文 `grep -c -F` 各 1 处仍在、`## ` 节数 13 不变。
- **captain 的自省**：我在同一段独立复核里测了 `--stat` 与原文 grep，**却没测 hunk 数就引用了它报的 3** ⇒ 数字**要么自己核、要么标注来源**。

---

## 70. 纪律升级：`evidence` 字段必须是**粘贴的真实输出**

### 70.1 事故性质（比「引用未核」更重一层）
frontend-ds 在 t34 的 `commandsRun` 里写了 `{"command":"git diff | grep -c '^@@'","evidence":"3（恰为三个 hunk，即 B1/B2/B5）"}` —— **该命令它从未执行**，它把「3 处 amend」这个**推断**当作命令输出写进了 evidence。
⇒ 这不是「忘了跑」，而是**证据字段被推断填充**：§69.3 里是我**懒**（引用别人数字未核），这里关乎**证据本身的真伪**。

### 70.2 为什么这次能被发现
因为 captain 的惯例是**独立复核关键证据**（本次只是顺手测了 hunk 数）。
⇒ 若没有这一步，一条"从未执行的命令"会永久留在记录里，并可能被后续**引用为事实**（事实上 captain 已经在 §69.1 引用过它）。
**与本会话的模式同源**：让错误在**自己的判据体系**里被认证为正确（前几例是守卫点错值、检查过期；这次是**证据字段自证**）。

### 70.3 三条新纪律（采纳 frontend-ds 的提议，**升级为全局要求**）
1. **`commandsRun.evidence` 必须是粘贴的真实输出** —— 不允许"应该是…""大约…"这类措辞；
2. **推断只能写在 output / 正文，并显式标注「（推断，未执行）」** —— **不得进入 evidence 字段**；
3. **报数时命令与输出成对出现**（反例：本条；正例：同批的 `grep -c '^## '` 它确实跑了并抄了 13）。
⇒ 适用于**所有成员、所有任务**；captain 派单时一并写明。

### 70.4 连带责任（captain 自记）
captain **已经**在 §69.1 引用过它报的 3 ⇒ **证据污染会沿引用链扩散**。
⇒ 配套纪律：**任何被引用进文档的数字，引用者须标明来源（自测 / 转述）**。

---

## 72. V1 落地规格的三条补充（captain 全批）

### 72.1 C2 的环**紧贴控件边缘**（而非放到 130px 涟漪处）
理由（**解读稳健性**，非外观偏好）：WCAG 1.4.11 的对象是**控件自身的可感知边界**；若放在 130px 处（md 下距 CTA 边缘 10px），它会重新变成"这是边界还是多加一圈涟漪"——**可争议**；紧贴边缘则**两种解读都成立**。
实测：`foam 环 vs deep-current = 10.5:1`，**与位置无关** ⇒ 差别只在"是否紧贴控件"。

### 72.2 ⚠️ 焦点态会被静止环"吃掉"（真实的交互退化风险）
`ring` 系共享同一组 CSS 变量 ⇒ 静止态加 `ring-2 ring-foam` 后，若焦点态仍只是"**同一个 2px 环换个颜色**"，会比现在（静止无环 → 焦点出现环）**更难辨认**。
⇒ 处置（批准）：静止 `ring-2 ring-foam`；焦点 `focus-visible:ring-[3px]` + `ring-sea-glass` + `ring-offset-2 ring-offset-deep-current` —— **更粗 + 换色 + 偏移带**，三重区分，与静止态在**结构上**不同（不只是色差）。
⇒ 教训：**"给控件加一圈边界"不是无副作用的操作** —— 它会与 `ring` 体系的共享变量互吃。

### 72.3 焦点环同 patch 收口（批准）
实测（命令原文 + 粘贴输出，遵守 §70）：
```
home-page.tsx:90            … ring-2 ring-sea-glass ring-offset-2 ring-offset-deep-current …
river-page.tsx:135          … ring-2 ring-sea-glass ring-offset-2 ring-offset-deep-current …
design-system/button.tsx:17 … ring-2 ring-peacock   ring-offset-2 ring-offset-wave-white …
```
⇒ `Button`（捞取）的焦点环是 `ring-peacock` = **2.05:1** —— **与 V1 是同一条违规**，只是发生在**焦点态**；且同一页面两个 CTA 的焦点表现不一致。
⇒ 批准在调用点用 `className` 覆盖（只改 `pages/**`，不碰 design-system，不越 t32 的界）。**收口必须带验证**：① 贴改动后 `grep -n "focus-visible:ring"` 输出证明三处一致；② **token 守卫扩展到焦点环色**（`sea-glass` 对各面 ≥3:1），使**焦点态达标也进机器门禁**，而不是靠肉眼看。

---

## 73. 14:00 停机归档 + 三条重要更正 + 一个「测试全绿但真实浏览器里是坏的」缺陷

### 73.1 停机（用户令 14:00）
- 13:53–13:55 发停机令（三名在飞成员），要求：**停在自洽点 + 未完成清单落进仓库 + 不 commit**；
- 三份 handover 全部落盘：`frontend-flow-t32-unfinished.md` / `audio-engineer-t30-unfinished.md` / `frontend-ds-v1-ready-to-land.md`（**这是本会话第二次靠"交接必须进仓库"这条纪律保住上下文**）；
- captain 统一提交（含在飞半成品）；**未取绿基线**（在途窗口，按 §52.3）。

### 73.2 ⭐ 重大发现：点踩功能在**真实浏览器里本来是坏的**（而所有自动化测试都是绿的）
audio-engineer 在真实浏览器跑完整链路时发现：`POST /api/segments/:id/listen` **21 次全部 400**。
- **根因**：`coveredMs` 来自 `currentTime * 1000`（**浮点**），而契约是 `z.number().int()`；
- **后果**：**覆盖率永远推不上去 ⇒ 点踩门槛永远不满足** ⇒ **点踩功能实际不可用**；
- 已修（唯一归一化点向下取整）+ 新增用例用**真实契约 schema** 校验实际请求体；复测 **21/21 全 200**。
⇒ **为什么全绿也漏了它**：脚本构造的 `coveredMs` 天然是整数，真实浏览器产生浮点 ⇒ **又一次「测试绿但产品废」**，且**只能被真实浏览器验证抓到**。
⇒ 处置：**把「真实浏览器跑一遍真实链路」提升为交付前必做**（单测 / 集成 / live-check 都不足以覆盖这一类）—— 这正是 t14（E2E）存在的理由，本会话此前一直没做。

### 73.3 ⚠️ 用户可见阻塞：录制按钮现在是**禁用状态**（页面未接线）
- 事实（实测）：`grep -rn presetDurationMs apps/web/src/features/bottle apps/web/src/pages` = **空** ⇒ `#4` 的**组件层完成、页面未接线**；而 fail-closed 落地后，组件在 `presetMissing` 时**禁用录制按钮**。
- ⇒ **用户点进录制页会看到「不能录」** —— 不是回归，而是"fail-closed 已落地 + 页面还没接线"叠加出的**临时断点**。
- 修法（一行，frontend-flow 域）：`presetDurationMs={song.segments.find((s) => s.index === segmentIndex)?.durationMs ?? null}`（数据源 `GET /api/songs` 已有，**不需要新契约字段**）。
- ⇒ **恢复后第一优先**（它比视觉更靠前：挡住的是"接唱"这条主链路）。

### 73.4 更正 captain 的两处判断（本会话第五次同类教训）
1. **`measuredDurationMs` 已不是 typecheck 红点** ⇒ t31 **不必再等它**；剩余红点全在 t32 在途（`features/api` 的 `Collection`、`relay-timeline.tsx` 的 Icon size `14`）。
2. **`recorder-panel.tsx` 里那句是注释、不是调用点** —— captain 据它推断"页面已接线"，实际是空的（见 §73.3）。
⇒ 教训：**从代码里看到一句话，不等于那句话描述的行为已发生**；"已接线"这类判断要用 **`grep` 调用点**来证，**不能用注释来证**。

### 73.5 授权数据操作的差异（如实记录）
captain 授权删 **2 支**引用无预设歌的 DRAFT；frontend-flow 实际命中 **3 支**（第三支创建于 `05:38:07 UTC`，**在 captain 盘点之后**，同一发起者）。
⇒ 第三支恰好是「**选到无切分歌 → 卡死**」的**又一次现场复现** ⇒ 说明 §65.2 那条缺陷在真实使用中会**持续产生死草稿**。
⇒ 备份 `backup_t32.{bottles,events,anon_codes}` 留库；复查引用无预设歌的 DRAFT = **0**；`songs` 仍 4 首。

### 73.6 待用户恢复后裁决（不阻塞）
仓库外一次性浏览器探针 `D:/music-rec-probe/probe.mjs`（Playwright npx 缓存 + 一次性库 + 假麦克风）是否入库？
captain 初裁：**不入库**（AGENTS.md §7 规定 E2E 工具属待裁决项；它是一次性证据工具），但**保留在仓库外** —— 它给出的是「**真浏览器真的在放声**」这一级证据，对本会话有独特价值。

---

## 74. t32 收口 + ⭐ **权威基线**（全员 idle 窗口，captain 亲测）

### 74.1 权威基线（§52.3 承诺的那个窗口）
`18:34` 全员 idle 窗口实测：

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `pnpm -r test` | **0** | shared 21/231 · api 19/180 · web 58/**492** = **98 文件 903 例** |
| `pnpm -r typecheck` | **0** | **0 error TS** |
| `pnpm --filter @music-drift/api test:integration` | **0** | 22 文件 / 177 例 |
| `pnpm lint` | **0** | 无输出 |

⇒ 本会话**第一次**在"全员 idle + 无在途改动"窗口取得的全绿基线；按 §52.3，**它是唯一权威基线**，此前所有中间红绿只作过程证据。

### 74.2 t32 收口要点
1. **录制时长接线（用户 #4 的最后一环）**：`record-step.tsx` 自取本段固定时长交给 `RecorderPanel`；外套 `AsyncBoundary` —— **曲库未返回前不渲染录音控件**，避免"先给一个能点、随后被禁用的假按钮"；取不到则传 `null` ⇒ 禁用 + **按钮旁写明理由**。测试 6 passed（含"有预设可用 / 无预设禁用且给理由"）。
   ⇒ **旧断言改对**：原「15–30 秒口径」断言改为断言**本段固定时长 22.0 秒** —— 那是用户 #4 带来的**正确行为变化**，不是放宽断言。
2. **指定接唱失败态不再静默**：删除 `catch(() => undefined)` → `ConflictNotice`（服务端中文原因 + 出口动作）+ 新增 422 用例。
3. **收藏/徽章有数据联调（hermetic，未写共享库）**：4 人接力成完整作品入海 → 收藏 **201**、`GET /api/me/badges` 返回 `DRIFT_PARTICIPANT`；浏览器实际渲染验证（收藏显示**真实曲名**，逐条 `/api/sea/:id` 取回）。
4. **一屏未退化**：1440 **12/12** · 375 **12/12**（含无横向滚动 + 锚点在首屏）。

### 74.3 环境告警（成员顺手处置并如实报告）
`music-drift-postgres` 容器 **Exited (0) 3 hours ago** ⇒ 守卫建不了库、开发库连不上（也解释了此前一次 `ECONNREFUSED 5433`）。
- 处置：`docker start music-drift-postgres`，并**明确声明"这是本地开发数据库，不是部署动作"** ⇒ 符合 AGENTS.md §9。
- 恢复后数据完好：`songs=4`、`bottles=44`、`backup_t12` 五张备份表均在。
⇒ 环境纪律：**容器可能因宿主资源回收而退出**，长任务前先 `docker ps` 确认；这类"环境消失"造成的红**不是代码缺陷**。

---

## 75. t31 闭合（用权威基线）+ captain 的 inScope 记账（第三次）

### 75.1 t31 闭合
依据：captain 在**全员 idle 窗口（18:34）**实测 `typecheck` **0 error** / `test` **98 文件 903 例** / 集成 22/177 / lint 0 ⇒ 重开并闭合（**未消耗成员一轮**）。
交付内容见任务回执（`ingest.ts` 必填化 + `db/segments.ts` 抛错 + `routes/bottles.ts` 422 + 迁移 0006 + `ingest.test.ts` 重写 + `requireDuration` 交代）。

### 75.2 ⚠️ captain 的 inScope 记账（第三次路径问题）
| # | 任务 | 事实 | 后果/教训 |
| 1 | **t22** | inScope 写了**不存在**的 `apps/api/src/routes/myBottles.ts` | 未阻塞，但说明**不能"拿测试文件名反推源文件名"** |
| 2 | **t26** | **漏写** `apps/api/drizzle/` | 归档僵局（`update_task` 以 undeclared path 拒绝）⇒ 才有 §47.6 的约定 |
| 3 | **t31** | **这个任务本身没写错**（`apps/api/drizzle/` 是对的）—— 但**工具首次报的路径是 `apps/api/src/drizzle/…`，与实际不符** | 首次闭合被拒；captain 实测（`ls apps/api/{,src/}drizzle/*.sql`）后才确认**是路径报告不一致，不是越界** |

⇒ 合并教训：**inScope 的每条路径都应先用 `ls`/`glob` 确认；而当工具说 "undeclared" 时，第一步也是去实测真实路径** —— 本次若先实测，就不会先怀疑自己写错。
⇒ 更重要的一条：**工具报的路径也要核**。错误信息本身可能不准，"undeclared"这个结论要自测后才采信。

### 75.3 另一处 captain 自己引入的失败（第二次尝试时）
第二次 `update_task` 我把 `apps/api/src/routes/listenProgress.integration.test.ts` 写进了 `changedPaths` —— 而它**是 architect 如实披露过的越界文件**，按 t20 先例应**只披露、不入 changedPaths** ⇒ 被工具判 undeclared（这次拒绝是**对的**）。
⇒ 教训：**"披露越界"与"声明路径"是两件事** —— 披露是诚实，声明是权限；把披露项写进 `changedPaths` 等于**事后扩大自己的声明**，工具挡下来是正确的。

---

## 76. t35（V1）落地完成 + 三层验证 + ⭐「测两张图」的自证口径

### 76.1 落地（4 项）
C2 紧贴 `foam` 环（三处 CTA）· 移动端内圈 **+16px**（md 不动）· 焦点三重区分 · 焦点环收口（`river-page.tsx:78` 调用点覆盖 `Button` 基类的 `ring-peacock`）。

### 76.2 三层验证（每层能证明什么，按执行者自己声明的口径）
**① token 守卫 —— 先红后绿**：RED `2 passed | 6 failed`（3× 缺 foam 环 + 3× 焦点环未加粗到 3px）→ GREEN **8 passed**；含**负向断言**（`deep-current↔peacock = 2.05 < 3`、`coral↔deep-current = 2.51 < 3`）与**焦点环色**（`sea-glass↔deep-current = 7.00 ≥ 3`）。
⚠️ **执行者主动标注**：token 层本身**不随实现变化**（纯色值数学）⇒ RED→GREEN 来自**源码模式层**（三处 CTA 的装置断言）⇒ 它守的是**实现模式**，**不是渲染像素**。**没有夸大**。

**② 像素采样（改前 → 改后）—— 唯一能证明"屏幕上达标"的层**
| CTA | 改前 | 改后 |
| --- | --- | --- |
| 首页 hero（1440 / 375） | **2.05:1** | **5.13:1**（紧邻像素 `rgb(228,240,242)` = foam 环） |
| 河道·捞取（1440） | **2.05:1** | **5.13:1** |
| 河道·投下（1440） | **2.51:1** | **4.18:1**（环 vs 面板 **10.62:1**） |
原始扫描（改后 1440 首页）：`+0 rgb(21,113,131) | +1 rgb(228,240,242) | +2 rgb(221,234,237) | +3 rgb(11,58,74)`；改前同位置 `+0 rgb(14,104,122) | +1 rgb(11,58,74)`（**无环**）。

**③ 截图 + 一屏不退化**：1440 `exit 0`（12 行 `OK`）· 375 `exit 0`（12/12）。

### 76.3 ⭐ 新口径：**测两张图时必须自证不是同一张**
执行者给出的自证：`after/home-1440.png` 的 md5 ≠ `after/river-1440.png` 的 md5，且 `coral` 像素数 home = **0** / river = **8989**。
⇒ 这解决了一类**最容易发生的作弊/失误**："声称测了两张图，实际只测了一张"（或复制了同一张）。**记为像素类证据的标准自证方式。**

### 76.4 captain 独立复核（干净窗口 18:45，captain 亲测）
`pnpm -r test` **exit 0** = shared 21/231 · api 19/180 · web **59 文件 500 例**（= 基线 492 + 8 条新守卫）· `pnpm -r typecheck` **0 error** · `pnpm lint` exit 0 · 三处 `ring-2 ring-foam` 装置 grep 确认**一致**。

### 76.5 一条诚实边界（执行者标注，未自行扩面）
**焦点态未做像素采样** —— 截图脚本不产生 `:focus-visible` 帧 ⇒ `sea-glass↔deep = 7.00:1` 是 **token 计算值、不是像素实测**，已标注"（推断性说明，非实测）"。若要像素级证明焦点态，需一个能注入 `:focus-visible` 的截图步。
⇒ 处置方式正确：**有替代方案但不擅自扩范围，而是报上来**。

### 76.6 ⚠️ captain 亲眼看图发现的新问题（自动化检查漏掉的用户可见不一致）
`pages/river-page.tsx` 的「投下一支漂流瓶」说明文案仍写：「选一首歌，录下第 1 段 **15–30 秒**…」—— 而用户第 4 条已把录制改为**每段固定时长**（如 22.0 秒）。
⇒ 属"**规则换了、文案没跟着换**"（本会话第二类判据问题）的又一例，且**它是用户可见的正文**，比错误提示更显眼。
⇒ 处置：派 frontend-flow 全站扫除该口径（见任务）。
⇒ 方法论价值：**这一处只有"人眼看渲染结果"才能发现** —— 三条门、像素采样、12/12 守卫全部绿，但文案是错的。**这就是我坚持"captain 亲眼看图 + 请用户自己跑一遍"的理由。**

---

## 77. 项目级 skill 安装 `motion-web` + ⭐ 前端派单纪律（skill 加载必须**可核**）

### 77.1 安装
用户要求在项目级 skill 目录安装 `motion-web`（前端动效）。
- **位置**：`.dsh/skills/motion-web/SKILL.md`（与既有三个前端 skill 同目录、同格式：YAML frontmatter `name` / `description`）
- **已生效**：本会话 skill catalog 已收录 `motion-web` ✓
- **内容（10 节）**：① 先定目的（feedback / guidance / continuity / decoration，**decoration 需产品理由**）② **参数只能取自设计契约的动效 token，禁止内联新值** ③ 只动 `transform` / `opacity` ④ 编排（进出配对、stagger 等距、单一"主角"、入场 ≤600ms）⑤ React 落地（**显式状态机优先于布尔组合**、卸载动画需显式延迟卸载、不在 effect 里同步 setState 驱动动画、不用 setInterval 拼动画）⑥ 性能（60fps、避 layout thrash、`will-change` 用完移除）⑦ 可访问性（**reduced-motion 覆盖每一项**、动效不得是唯一反馈、焦点态至少两项区分）⑧ **可验证性（核心纪律）**：每个动效要有可断言契约，并**明确各层能/不能证明什么**（jsdom 证明不了渲染）⑨ 禁止清单 ⑩ 落地前 7 条自检
- **设计取舍（关键）**：它**不另立一套动效参数**，而是要求引用 `DESIGN.md` 的动效契约 —— 避免出现"第二份规则"（本会话反复的教训）。

### 77.2 ⭐ 前端派单纪律：skill 加载必须**可核**
用户要求：保证子 agent 做前端时正确加载**所有**项目级前端 skill。
- **当前清单（4 个）**：`frontend-design` · `afrexai-ui-design-system` · `css-animation-creator` · **`motion-web`**
- **纪律（写入所有前端任务）**：
  1. 开工前**逐个 load**（四个都列在任务描述里，避免只加载自己记得的那几个）；
  2. 报告里**引用具体条款原文**（不接受"已调用 skill"这种空口声明）；
  3. **captain 可核对**：skill 文件就在仓库里（`.dsh/skills/*/SKILL.md`）⇒ **引用的条款必须能在原文中找到** —— 这是把"声称加载"变成"可验证"的关键手段；
  4. 引用必须**与本次改动相关**（不要求机械引用，但要求引用的条款能解释你做的某个选择）。

### 77.3 ⚠️ 安装的可见性边界（必须说清）
**`.dsh/` 被项目 `.gitignore` 忽略** ⇒ 项目级 skills 是**本地安装、不入库**（`git add .dsh/...` 被直接拒绝）。
- **好处**：符合 `.dsh` 作为**工具配置**的定位（不该混进项目版本控制）；
- **代价**：**其他机器 / clone 不会有这些 skill** ⇒ 换环境或部署时需按 §77.1 的记录**重新安装**（清单：`frontend-design` / `afrexai-ui-design-system` / `css-animation-creator` / `motion-web`；位置 `.dsh/skills/<name>/SKILL.md`）；
- **本会话内无影响**：成员与 captain 共享同一文件系统，能正常 load。
⇒ 因此 §77.2 的"captain 可核对条款原文"**依赖本机文件**；引用核对在本机有效 ✓

---

## 78. t30 完成（四项达标）+ ⭐ 真浏览器探针（本会话**最高证据等级**）+ `motion-web` 首次见效

### 78.1 四项交付
1. **#1 播放/重播/暂停**：显式四态状态机（`idle | playing | paused | ended`，优先级 `ended > paused > idle`）；播完再点＝从头（`currentTime = 0` + `markSeek()` + 播放）、未播完再点＝暂停；**反馈三通道**（文案 + 按钮文案/图标 + `aria-live`）；
2. **#3 录制后试听**：本地 Blob（不经服务端、与上传状态无关）；两个端口都拿到才给按钮（拿不到就**安静不给**）—— **绝不给"点了没反应"的按钮**；
3. **#4 固定段时长 UI**：「本段 20.0 秒（±2.0 秒）」+ 录满自动停 + 提前停说清相差多少；页面接线由 frontend-flow 完成（`record-step.tsx:178`）；
4. **fail-closed 对齐**：无预设时 `start()` 直接返回且**不调用 `getUserMedia`**，面板禁用 + 说明 + `aria-describedby`。

### 78.2 ⭐ 真浏览器探针：本会话**最高证据等级**
真 Chromium + 假麦克风 + 一次性库，**对着已接线的页面**（ALL PASS / exit 0）：
- 真实 **19.68s** webm 播完 → 点「重新播放」`currentTime 1.006` **真在播**；
- 未播完 → 暂停（`paused=true` + 文案「已暂停」）；
- 试听 `blob:` **真出声**（`duration 3.84`）；
- **录满自动停**（未手动点停，等到「用这一段」自行出现）；
- `/listen` **21/21 全 200**；`/duration` **0 次调用**；整轮**无 4xx/5xx**。
⇒ 这一级证据**只能由真浏览器提供**：本会话正是靠它才抓到"`coveredMs` 浮点 vs 契约整数 ⇒ 21 次全 400 ⇒ 点踩门槛永不满足"这个**所有自动化测试全绿**的缺陷（§73.2）。

### 78.3 探针是否入库：captain 裁决
`D:/music-rec-probe/probe.mjs`（仓库外）**不入库** —— AGENTS.md §7 规定 E2E 工具属待裁决项；它目前是 `npx playwright` 的一次性用法，不构成项目依赖。
**但要求把"配方"写进文档**（真 Chromium + 假麦克风 + 一次性库 + 对着已接线页面的断言清单），使任何人**可重建**；并列入交付说明作为"真浏览器证据"的来源。
⇒ 同时**建议用户考虑**：这类探针是否值得正式入库（它是目前唯一能验证真浏览器行为的工具）。

### 78.4 ⭐ `motion-web` 装完**立刻见效**（用户的直觉是对的）
audio-engineer 按新装的 `motion-web` 重审动效，**§5「不要靠改 `key` 造成子树重建」直接命中它的原实现** ⇒ 已删掉 key 重播写法；并新增 `motion-usage.test.ts` **静态守卫（含变异验证）**。
⇒ 三点意义：① 该 skill 的条款**能命中真实问题**（不是空泛建议）；② "不要靠改 key 重播"这种坑**只有明确条款才拦得住**；③ 它同时如实标注"**动效的视觉观感 jsdom 证明不了，需真机录屏**（未做）" —— 与 `motion-web` §8 的口径一致。

### 78.5 三处 captain 处置
1. **handover 过期信息**（`audio-engineer-t30-unfinished.md` §0/§5 称"F2 仍是 typecheck 红点"）⇒ 由 captain 加**历史标注**（成员按纪律未擅改非 inScope 文件 ✓ 处置正确）；
2. **提交信息有误**（`1ef0647` 称 `measuredDurationMs` 仍是包级红）⇒ **提交信息不可改**，记入本节并在下个 checkpoint 的提交信息里更正；
3. **越界披露**（新增 `docs/handover/audio-engineer-t30-unfinished.md`，不在 t30 inScope）⇒ 那是 **captain 13:54 停机令明确要求**的产物 ⇒ 接受 ✓。

---

## 79. t37 动效审计（1030 行）+ 四项裁决 + 抽查 skill 引文

### 79.1 审计的核心答案（captain 的怀疑被证实）
**「呆」在缺 feedback 与 continuity，不在缺装饰动效。** 装饰恰好克制（引 `frontend-design` L32：把"每张卡都 hover、每段都 fade-and-slide-up"判为 read as AI-generated）。
**最该修三处（都是硬切，都能只用既有 token 修）**：
1. **移动端底部导航零反馈** —— `design-system/nav.tsx` 的 BottomNav 中 `hover:|active:|transition|focus-visible` 命中 = **0**（实测）⇒ **最高频交互 × 零回应**；
2. **Tab 切换硬切** —— `tabs.tsx` 选中 pill 瞬变 + `{active?.content}` 整块替换（`sea-page` / `admin-page` / `login-page` 三处在用）；
3. **投票后计数硬换** —— `vote-controls.tsx:129` 是纯文本节点；`motion-web` §1 恰好点名「**投票后的确认**」是 feedback 的典型例。
其后：Modal/Toast 无退场（§4「不能弹出来就没了」）→ 页面过渡只实现了 fade（**`DESIGN.md` L286 明文要求 Fade + slide**）且无退场 → 骨架→内容硬切 → 分页第 5 张起无入场 → 侧栏 hover 无 transition → **不可点的 `<li>` 挂了 hover-lift**。

**两条硬违规**：
1. `motion.css:84-86` 的 `.hover-lift` **同时过渡 `box-shadow` 的 blur/offset 与色值** ⇒ **不是灰区违规**（§3 只给"颜色过渡"留灰区，"尺寸与位置"明文禁止）。顺带：`fonts-and-motion.test.ts:73` 用例名写「hover 只做 scale(1.03)…」而断言体只查两项 ⇒ **名字比断言强**，正是 §8 警告的"看起来在验证、实际没验证"；
2. `route-view.tsx:63` 的 `key={match.path}` ⇒ §5 明令禁止的 remount 抖动（会丢焦点/输入/滚动位置）；仓库**自己已有这条守卫**（`features/audio/motion-usage.test.ts:44`）但**只覆盖 `features/audio/` 两个文件**。

**参数无据**：`motion.css:103` shimmer `1.4s`（motion token 块 10 项里没有）· `motion.css:108` ripple `2.4s`（**契约完全无据**）+ `infinite` 常驻。

### 79.2 captain 四项裁决
- **A2 涟漪**：**留常驻**，但契约须**区分两种涟漪** —— ① **事件涟漪**（标记状态变化/落点：短暂、事件驱动，保留 L449 原文语义）② **场景涟漪**（hero 背景母题：常驻，但须满足 `motion-web` §1 的 decoration 三条件 + 进 token 块 + 写出产品理由）。
  ⇒ 定性：**不是"实现违反契约"，而是契约缺了第二种的定义**。
- **A1/A3/A4**：**批准补 token**（shimmer 时长 / Toast 常驻+退场 / Modal 退场）。`motion-web` §2 要求"参数只能取自设计契约" ⇒ **契约缺项就必须补**，而不是让组件继续内联；Modal 退场按 §4 口径（**退场比入场快**）。
- **P8+P9**：**等 t36 收口后一起做** —— 只补页面过渡 slide、却留着 `route-view.tsx:63` 的 key-remount，两者会**互相抵消**。
- **A6**：`duration-200` **算"引用 token"**（条件：档位数值 = 契约 token 值），但**必须加守卫**断言"源码里的 duration 字面量都在契约 token 值集合内"（挡 `duration-375` 这类漂移）。
  ⇒ 原则：**纪律不该以降低代码质量为代价**（强制 arbitrary value 会让代码更差），但必须有守卫防漂移。

### 79.3 批准立即做：P1–P7（零 `DESIGN.md` 改动）+ 守卫扩容
- **P1**（收缩 `.hover-lift` 的 `box-shadow` 过渡）与 **P7**（撤掉不可点 `<li>` 的 hover-lift）**优先**；**P7 定性为"动效承诺了不存在的交互"（静默欺骗）**；
- **额外**：把 key-remount 守卫**从 `features/audio/` 扩到全仓**（含**反向控制**证明它会红）。

### 79.4 ⭐ 审计的自我证伪（记为报告标准）
执行者**主动撤回 6 条被证据推翻的草案断言**（mood chips 是"只作展示"非交互 / 加载更多已有 `loading` 态 / `sea-page` 已有骨架 / 加载语义全站统一 ⇒ **"本来就没问题"**）。
⇒ 价值：**避免用噪音淹没真问题，也避免 captain 误判漏报**。这是审计该有的样子 —— 不是凑发现数。
另：它**显式登记两处 skill 间冲突**（`afrexai` 的 `hover_lift` 含 shadow ↔ `motion-web` §3；`afrexai` Modal 200–300ms ↔ `DESIGN.md` 480ms），并按 AGENTS.md §4 取 `DESIGN.md` —— 处置正确（非 Figma 出入、不需 §5 上报，但**必须写下来**）。

### 79.5 ⭐ captain 抽查 skill 引文：7/7 命中（含一次我自己的误判）
抽查方式：把执行者引用的条款**逐条 grep `.dsh/skills/*/SKILL.md` 原文**（这是"保证子 agent 正确加载 skill"唯一可执行的动作）。
结果：`motion-web` §1/§2/§3/§4/§8 + `frontend-design` L32 **全部命中**；§5 第一次报"未命中"——**原因是 captain 的 grep 串不准**（我写的是"不要靠改 `key` 造成子树重建"，而原文是"**避免 remount 抖动**：进/退场不要靠改 `key` 造成**整棵**子树重建"），换准确串后命中 ✓。
⇒ **结论：7/7**。教训与 §75.2 同源：**"未命中/undeclared"这类否定结论，先确认自己的检查手段**。抽查不命中时，第一种可能是对方引错，第二种是我查错 —— 必须先排除第二种。

### 79.6 验证分层的口径（它自己声明）
本审计结论**全在"源码结构层"（L1）**；**jsdom 与静态截图都不能证明动效**（`home-page.tsx:68` 已踩过这个坑）；§10 给了真实 Chromium 的 `getAnimations()` + `emulateMedia({ reducedMotion: 'reduce' })` 断言配方，并单列必须真机/录屏的项（触摸 active 反馈、60fps、低端设备）。

---

## 80. 真浏览器探针**配方文档化** + 「可重建」实证 + ⭐⭐ 证据工具自身的假红（新判据）

### 80.1 落点
`docs/handover/browser-probe-recipe.md`（37KB，含**完整可执行脚本**）+ `docs/audio.md` §10.6（索引 + 能力边界）。
配方四项：① **三层各能证明什么**（jsdom / 静态扫描 / 真浏览器对照）② 五个成功要点（**假麦克风参数**、一次性库、`MDB_API_TARGET` 必须设在 `process.env`、cookie、**挂钩 `new Audio()` 抓游离元素**）③ 已知干扰的判读（HMR 元素脱离 ⇒ 判"本轮不算数"，非产品缺陷）④ **断言清单**（每条结论 ↔ 断言 ↔ 实测数值）+ 怎么跑（含"安静窗口"检查）

### 80.2 ⭐ 「可重建」必须被**实证**，而不是被声称
执行者**从仓库文档里抽出代码块**（567 行，与运行副本逐字节一致）→ `node --check` 通过 → 直接跑：
```
PASS 31 条 / FAIL 0 条 · [result] ALL PASS
```
⇒ 这才是"文档化"的完成标准：**任何人从文档出发能重建并跑通**（不是"我写了文档"）。

### 80.3 ⭐⭐ 证据工具**自身也会有假红**（新判据）
第一次跑"从文档抽回的副本"时出现 **30 PASS / 1 FAIL**（`点击播放后真的在响` 失败，而其后断言又全正常）。
- **根因不是产品**：真实 WebM 走 **Range 流式加载** ⇒ 起播延迟取决于**冷/热缓存**（一次 1.0s 内起播、一次 1.2s 仍未起播），而原脚本用了**固定 `sleep 1.0/1.2s`**；
- **改法**：换成**有界等条件**（`waitForFunction(10s)`），**等不到仍然 FAIL**。
⇒ **判据（记下）**：把"固定等待"换成"有界等条件"**不等于加重试** —— 区别在于：
  - **加重试**：失败后重跑，用后续成功**覆盖**前次失败（掩盖间歇）；
  - **有界等条件**：把**与断言本意无关的时间量**（何时开始播）从断言里**剔除**，同时**保留失败的可能**（超时仍红，断言本意"真的在响"不变）。
⇒ 结论：**证据工具必须被当作被测对象**。t14 若见同类现象，先按配方 §4 分"环境 / 工具"，再谈产品。

### 80.4 一处"文档工具的坑"（保护可重建性）
`prettier` 会重排 markdown 里的 ```js 代码块（实测 **21096 → 26032 字节**）⇒ 文档里的脚本块**故意标成 `text`** 并加 `prettier-ignore` 包裹；否则每次 `prettier --write` 都会让"可重建"**静默失效**。
⇒ 记：**"在文档里嵌入可执行脚本"这种可重建性，会被格式化工具破坏**，必须显式保护。

### 80.5 边界（不夸大）
不入库（按 §78.3 裁决）⇒ **"跑它"不是任何任务的验收前提，只是证据来源**；只覆盖 Chromium；**动效观感 / 视觉平滑度这一层证明不了**（需真机录屏，未做）。

### 80.6 协作
执行者明确表示：**不会主动去碰 qa-e2e 的任务**（t14），但若被要求提供假麦克风参数 / 游离元素挂钩 / 断言清单，会**把命令与原始输出一起回报 captain**（AGENTS.md §8）⇒ 边界与协作都正确。

---

## 81. 动效实施批次（P1–P7 + A1–A4）+ ⚠️ captain 的流程缺口（「批准立即做」也是一种派发）

### 81.1 ⚠️ captain 的流程缺口（记账）
captain 在裁决消息里批准「P1–P7 立即做」，**没有建任务** ⇒ 这批工作无 `attempt` 可回写、证据无处挂。
- **执行者主动指出该缺口**并要求补建，同时声明"后续不再在没有任务记录的情况下开工" ⇒ **要求正确，责任在 captain**；
- 处置：**事后补建 t38**（只为让证据有位置，不重做）；因 t36 正占着 `apps/web/src/pages/`、`features/bottle/`、`docs/ui-review/`，t38 的 inScope 只能取**主体域**（`DESIGN.md` + `design-system/`），其余**披露式归档**（output 逐条披露、不写 changedPaths）；
- 另：captain 试图**代写回执被工具拒绝两次**（`acceptance` 必须逐条匹配原文，而 captain 读不到 acceptance 列表）⇒ 交回执行者自行回写（**不猜、不编造**，这是 §20 学到的同一课）。
⇒ **新纪律：「批准立即做」也是一种派发 —— 必须先有任务记录。** 消息批准的豁免会直接造成"不可审计的工作"，与我们整天在做的"让每件事都能被核"直接冲突。

### 81.2 ⭐ P1：执行者**推翻 captain 的字面指示**，captain 采纳
captain 要求「收缩 `.hover-lift` 的 `box-shadow` 过渡」（隐含：删掉阴影）。执行者指出 `DESIGN.md` **L285/L382 明文要求「scale(1.03) + shadow lift」**，直删会**违反设计契约**。
⇒ 它采用 **P1b**：阴影抬升移到**几何固定的独立图层**（`::after`），hover 只过渡该图层的 `opacity` ⇒ **`motion-web` §3（禁动画尺寸/位置）与 `DESIGN.md`（要求 shadow lift）同时成立**。
⇒ **captain 采纳 P1b**，并记：**看似权威的指示若会导致契约违规，执行者应当指出而不是照做**；反过来，**captain 的指示不是豁免契约的理由**。

### 81.3 交付
- **契约先补**：`DESIGN.md` `motion:` **+6 项**（shimmerDuration 1400 / rippleDuration 2400 / exitDuration 240 / toastSuccessDuration 3000 / toastInfoDuration 5000 / toastErrorPersistent true）+ Elevation & Depth **+3 条**（Exit animations＝入场一半且进出配对 / **Ripples 两个角色**含产品理由 / Toast 生命周期）；**12 行新增 / 0 删除，结构仍 13 节**；token 三层同步（`theme.css` → `tokens.ts` → `motion.css`）+ **drift guard 扩项**（否则契约会漂）；
- **代码**：P1b · P7（撤掉不可点行的 hover-lift＝消除"动效承诺不存在的交互"）· P2/P3（BottomNav 原 **`hover/active/transition/focus-visible` 命中 0** → 补齐 + `focus-visible` 环）· P5（公海列表去 `index < 4` 改 `(index % 4) + 1`）· P6（投票计数用 **WAAPI**，reduced-motion 不发，**未用 `key={count}`**）· V3/V4（shimmer/ripple 引用新 token，**`motion.css` 再无时间字面量**）；
- **纪律变断言**：`motion-contract.test.tsx` **17 例**，首轮 **13 failed** → **17 passed**；含 **key-remount 守卫扩到全仓**（花括号/引号感知 JSX 扫描 + `.map()` 区间判定 ⇒ 列表项 `key={bottle.id}` + 入场动画**合法**、单例容器 `key={match.path}` **违规**）· **反向控制**（坏样本必中 / 合法列表 key 不误报 / **全仓结果精确等于单条 allowlist**）· **A6**（duration/scale/translate 字面量必须落在契约值集合内）；
- `fonts-and-motion.test.ts` 的**「用例名比断言强」已修**（现在真的断言 hover-lift 不含 box-shadow）。

### 81.4 回归与两处诚实边界
- **1440 一屏 12/12 OK / EXIT=0**；两条反向控制成立；`pnpm -r test` **EXIT=0**（web **500 → 527**，零回归）；`typecheck` **0 error**；
- **375 有 1 条红且已归因、非本批**：`FAIL /river river-drop=832 > 812` —— `river-page.tsx` 有 t36 在途文案（改两行，`leading-[1.6] × 0.875rem = 22.4px`，`832−22.4 = 809.6 ≤ 812` 恰好回到界内）；**两次独立 hermetic 运行均为 832** ⇒ 确定性、与数据无关。执行者**未改队友文件去反证**（§8），改为通知 owner ⇒ 处置正确。**375 是硬门，待 t36 复绿**；
- **本批证明不了的**：hover 与动效的**屏幕表现**（静帧证明不了动效）⇒ 建议 t14 用真浏览器补 `document.getAnimations()` 断言。

### 81.5 未做（明确登记，不是漏做）
**P4**（`AsyncBoundary` 有 **15 个调用点**，加包裹元素可能改变 flex/grid 子元素语义 ⇒ 与 P8/P9 同批）· **P8/P9**（等 t36 让出 `pages/**`，守卫已 allowlist 登记 `route-view.tsx`）· **Tabs 面板 continuity 一半**（唯一顺手写法 `key={active.key}` 正是 §5 禁止的、**会被新守卫当场拦下** —— 这恰好证明守卫有效）· **Modal/Toast 退场实现**（本批只落契约）。

---

## 82. t36 完成（含"守卫能区分注释与可见文本"的**实战验证**）+ frontend-flow 第四次会话失败（模式）

### 82.1 t36 实际已完成（会话失败发生在收尾前，工作已落盘）
- **375 复绿**：`node apps/web/tools/one-screen-check.mjs --viewport=375x812` → **exit 0**，输出 `✅ 全部页面达标（手机口径：无横向滚动 + 关键锚点在首屏内）` ⇒ §81.4 里那条 `/river river-drop=832 > 812` 已解决；
- **守卫存在且 4 例全绿**：`apps/web/src/pages/__tests__/copy-consistency.test.ts` → `Tests 4 passed`；
- **captain grep 出的"1 处残留"是注释、不是可见文案**：`features/api/errors.ts:74` 的 `// 旧口径（固定区间 15–30 秒）已废：现在由服务端按**本段固定时长**判定…`
  ⇒ 这**正好验证了守卫的设计意图**（"能区分注释与用户可见文本"）：注释**未误报**、可见文案**已清零**。这条判据不是自称的，是在真实用例上验的；
- 工作区仅剩 4 个未跟踪临时脚本 + 1 个证据文件变更 ⇒ 改动已随 `2a226d0` 归档。

### 82.2 ⚠️ frontend-flow 会话**第四次**失败（记为模式）
本会话内它已失败 **4 次**（视觉收尾、t32 前后、t32 收尾、本次 t36 收尾前）。
- **共同特征**：都发生在**长任务的后段** —— 工作基本完成，但**报告/回写未发生**；
- **损失可控**：每次工作都已落盘，且 `docs/handover/*` 有交接 ⇒ **4 次都没丢工作**；
- 处置：由 captain 按落盘产物 + **独立验证**闭合；派活时**倾向更小的批次**（长任务的尾段最容易在会话耗尽时断）。
⇒ 记：**"未完成清单必须活在仓库"这条纪律，今日回报率 4/4** —— 每次会话断掉都靠它续上。若当初只把状态留在会话里，这四次都是不可恢复的。

---

## 83. t14 真浏览器端到端验证完成（50/53）+ ⭐ 它抓到一个 **P0**（5/5 复现）

### 83.1 三层分开报（真实退出码）
| 层 | 命令 | exit | 结果 |
| --- | --- | --- | --- |
| 单测 / jsdom | `pnpm -r test` | **0** | **101 文件 / 921 例** |
| 集成（真 PG） | `api test:integration` | **0** | 22 文件 / 177 例 |
| typecheck / lint | — | **0 / 0** | ✓ |
| **真浏览器** | `node D:/music-e2e-probe/t14-probe.mjs chromium cap golden race-claim race-river webkit` | **1** | 断言 **53** · 通过 **50** · 失败 **3** |
| 断点回归 | `one-screen-check.mjs`（375 / 1440） | **0 / 0** | 12 路由 × 2 断点全达标 + 反向控制成立 |

### 83.2 全绿部分
- **黄金路径 23/23**：两账号两窗口**真表单注册** → 发起 → **真麦克风录制**（`duration=19.92` 真可解码 WebM）→ 投河 → B 捞到**正是那一支**（**前置断言** `IN_RIVER` 恰好 1 支 ⇒ **不靠运气**）→ 接唱 → 入海 → 公海等待接力区 → 漂流日志 6 条且不泄露账号；`/listen` 3 次全 200（**t30 的浮点 400 未回归**）；
- **并发不变量 6/6**：河道 3 轮 + 同一支瓶子指定接唱 ⇒ **活跃持有者恒为 1、`isHolder` 互斥**（DB 与 `isHolder` **双口径**核对）；
- **断点回归复用仓库既有守卫**（**不自造第二套判据**）+ 反向控制成立（注入 2000px 后 10/12 红）。

### 83.3 ⭐ P0（真浏览器 5/5 次复现）→ 已开 **t39**
`POST /api/sea/:id/targeted-segment` **抢占失败仍返回 200 + 摘要**：两窗口并发 POST 都是 200，其中一个实际 `isHolder=false`；输的一方被导航到瓶子页，只看到「这个瓶子现在不在你手上」——**无解释、无出口**。
- **根因定位到行**：`apps/api/src/routes/sea.ts:124-131` **从不检查 `outcome.ok`**，而 store 明明返回了 `HOLDING_ALREADY_TAKEN`；**对照 `routes/river.ts:65-71` 是写对的**（同一模式，一处对一处漏）；
- 另一路径：失败方拿到 `404 找不到这个资源。`（`[200,404,404,404,404,404]`）；
- 它的定性精准：**数据不变量没坏，坏的是「信号」**；
- **它给出的根因比缺陷更值钱**：**现有集成测试是串行语义** ⇒ 这类并发缺陷在集成层天然测不到 ⇒ t39 要求**补并发集成测试**。

### 83.4 另两个发现与 captain 裁决
- **【MEDIUM/风险】跨引擎回放失败**：WebKit `canPlayType('audio/webm;codecs="opus"')` 返回 `"probably"`，但对同一 URL（206 Range 成功）报 `err=4`、`duration=null`、播放不动；**且本机 Playwright WebKit 连 `navigator.mediaDevices` 都没有** ⇒ D-10 的录制面在本机**无法验证**，它如实标「未验证」，**没假装通过**。
  ⇒ **裁决**：记录为「**需真机 Safari 验证**」，暂不派单；复测前按**未验证项**记账，**不得**在交付说明里写成"已通过"。
- **【LOW】既有工具注释漂移**：`one-screen-check.mjs` 头部写反向控制「要求全部路由 FAIL 且 `exit 1`」，实现是「成立时 `exit 0`」且手机口径判「**有锚点的**路由全红」⇒ 照注释读会把"通过"读成"守卫坏了"。⇒ 一行修，派给该工具 owner。

### 83.5 它的验证方法论（值得记）
- **复用仓库既有守卫**而非自造第二套判据（避免"第二份规则"）；
- 沿用配方时把"自起 vite dev server"换成**生产构建 + 静态服务** —— 理由：当时 frontend-ds 正在改 `design-system/**` ⇒ **dev server 下"通过与否取决于别人在不在写文件"**。这是对 §52.3（在途窗口假红）的**正确防御**；
- **无间歇红**：3 条红每次都复现；**未加任何自动重试**（唯一 `waitForFunction` 是**有界等待异步条件**）⇒ 与 §80.3 判据一致。

### 83.6 边界与工具限制
- 改动**全部是文档/证据，零产品代码**（`git status` 复核）；
- 探针在**仓库外**（`D:/music-e2e-probe/`），按 §78.3 **不入库**；
- **它没有 `agent_teams_*` 工具** ⇒ 无法自行 claim/更新 t14、无法发消息 ⇒ **captain 代更新状态**（本会话**第五位**报告此限制的成员）。

---

## 84. t39 完成（P0 修复）+ 会话在「报告前」失败的**第六次**（模式）

### 84.1 修复内容（captain 复核）
`apps/api/src/routes/sea.ts`：
```ts
if (!outcome.ok) {
  const problem = problemFromOutcome(outcome);
  return problem === null
    ? sendProblem(reply, transportProblem('INTERNAL'))
    : sendProblem(reply, problem);
}
```
- 注释里写明了根因："此前这里**从不检查 `outcome.ok`**，于是并发里输的那一方也拿到 `200 + 摘要`（`isHolder=false`），前端据此 `navigate()` 到瓶子页、只看到'这个瓶子现在不在你手上' —— **无解释、无出口**"；
- **写法对齐 `routes/river.ts`**（那里写对了）—— **复用同一模式的正确实现，而不是另发明一套**。

### 84.2 新增测试（正好打在根因上）— 3 例全绿
`describe('指定接唱：抢占必须先被看见（t39 / qa-e2e F1，409 而不是 200+摘要）')`：
1. 瓶子已被别人持有（未释放）→ **409 `HOLDING_ALREADY_TAKEN`**（修前是 200）；
2. **真并发用例**：两个请求同时抢同一支瓶子 ⇒ **恰好一个 200；撞进窗口的落败者是 409**；
3. **「有人先抢了」(409) 与「不在公海」(404) 必须可分辨** —— 落实 captain 裁决（**404 防探测口径不改**，但调用方要能分辨）。
- 测试文件的注释写明**为什么要单列这一组**："串行语义的集成测试天然测不到并发抢占" ⇒ qa-e2e 给出的根因**被写进了测试文件**（后来者能读懂为什么需要它）；
- 结果：集成 **22 文件 / 181 例 exit 0**（原 177 → **+4**）。

### 84.3 ⚠️ 会话在「报告前」失败的模式（**第六次**）
本会话内成员会话在**报告/回写之前**失败至少 **6 次**（frontend-flow 4 · architect 1 · backend-core 本次）。
- **共同特征**：**工作已落盘，但报告/回写未发生**；
- **损失始终可控**，唯一原因：**state 活在仓库里**（`docs/handover/*`、证据文件、以及**可被 captain 独立复核**的代码与测试）；
- 派活纪律（已记）：**倾向更小的批次** + **把"写交接文件"提前到任务中段**，别留到尾段。
⇒ 这是本会话最反复出现的工程事实：**"报告"是流程里最脆的一环**。因此 **captain 的独立复核不是冗礼，而是必需品** —— 这六次里每次都是靠复核把结果固定下来的（否则"完成"这件事根本无据可依）。

---

## 85. t39 闭合（P0 修复）+ 三条值得记的验证手法

### 85.1 真浏览器证据（最强，也是本任务的最终判据）
`node D:/music-e2e-probe/t14-probe.mjs chromium golden race-claim` → **exit 0 / 断言 27 · 通过 27 · 失败 0 / ALL PASS**。
⇒ 之前 **5/5 复现**的 P0 场景（"抢占失败返回 200 + 无解释无出口"）**已转绿**：失败方现在拿到 `409 HOLDING_ALREADY_TAKEN:这个漂流瓶已经被别人拿走了，换一个吧。`，页面出现「**这一段已被别人接走**」+「**换一段继续**」⇒ **有解释、有出口**。

### 85.2 ⭐ 它自己做的**负向对照**（证明断言有判别力）
把 `if (!outcome.ok)` 那段**去掉** → `AssertionError: expected 200 to be 409`（`Tests 1 failed | 14 passed`）；还原 → **15/15 绿**。
⇒ 这不是"测试通过"，而是"**证明这条测试真能抓住漏检**" —— 与我们一贯要求的"守卫必须带反向控制"一致。

### 85.3 ⭐ 并发测试的**可靠性被实测过**（而不是想当然）
新用例含：① **确定性命中**（预置"未释放 holding"这一状态，**不依赖交错时序**）② **6 路 `Promise.all` 真并发** ③ store 层确定性并发。
它**实测**："**2 路并发在本进程会退化成 `[200,404]`**" ⇒ 所以用 **6 路**才稳定命中那个窗口。
⇒ 记录：**并发测试本身可能是假测试**（退化后测的是另一条路径）。写并发用例必须**实测命中率**，不能假设"发了两个请求就是并发"。

### 85.4 旧测试为何漏（根因写清，并落进测试注释）
旧用例全是**串行**：第二个请求读状态时瓶子已 `HELD` ⇒ 走 `404` 分支 ⇒ **永远碰不到"读到 SEA 但抢占失败"那个窗口**。
⇒ 它自己下的结论：**store 本来就拒得对，t39 纯属路由吞信号**（与 §83.3 的根因一致，且现已写进测试文件注释，后来者能读懂为什么需要这组用例）。

### 85.5 归档口径
它**一行代码没动**（只读 + 跑命令），给出三个文件的 md5 供与 captain 复核树比对；`commandsRun` 为五次实跑退出码（含真浏览器）。
`docs/api.md` 由 captain 落笔：**409 与 404 必须可区分**，客户端收到 409 应提示「已被别人接走」并给出口，**不要**导航到瓶子页当作成功。

---

## 86. 用户第十三轮 6 条 + `ui-ux-pro-max` 安装成功（含 captain 一处错误结论的更正）

### 86.1 六条需求与处置
| # | 用户原话要点 | 处置 |
| --- | --- | --- |
| ① | `/` 与 `/river` **本质都是河道页**；主体采用 `/river` 样式 + 加首页的**心情标签**（点击有切换动画、**无实质功能**） | **t41**（frontend-flow）：合并为一页，并要求说明重定向方向 |
| ② | 公海作品要 **1.2.3 页**式分页 | **t41**；⚠️ 后端是 **cursor/keyset**（t24）⇒ **禁止新增第二套分页语义**，需后端配合先回报 captain |
| ③ | 漂流日志太冗余；只留核心操作（发起/投河/回传/入海/完成）；**不显示赞/踩记录** | **t41**（含"过滤在前端还是后端 + 理由"） |
| ④ | **私密留言不是只回传发起者**：用户可指定**之前段的某一个人**；只有回传到他手上才通知、且**只有他能看到**；**传递失败则通知留言者** | **待派** —— 这是 **CONTEXT §5 规则变更**（留言目标从"固定发起者"变成"用户指定"）⇒ 需先定细节再设计 |
| ⑤ | 「录音功能是否实现了？我感觉没录入我的麦克风声音」→ 追问后用户明确：**试听也没声音** | **t40 = P0**（audio-engineer）。**这是我们的验证盲区**：此前所有"录音通过"都来自 **Playwright 假麦克风**，**真实麦克风从未验证** |
| ⑥ | 安装 skillhub 的 `ui-ux-pro-max-zh` ＋ 让前端 subagent **调用所有前端 skill** 美化一遍（**含增加水/河流/海洋/漂流瓶主题元素**） | skill **已装**（§86.2）；**美化待派**（与 t41 **串行**，避免并发写 `pages/**`） |

### 86.2 ⭐ `ui-ux-pro-max` 安装成功（含 **captain 一处错误结论的更正** + 两个真实坑）
- **⚠️ 更正：网络其实是通的。** 用户要求"再试一次"后：`curl https://skillhub.cn/install/skillhub.md` → **HTTP 200 / 2769 字节** ✓
  ⇒ 我此前判"**没有外网访问**"是**错误结论** —— 我只测了一个域名（`githubusercontent` 超时），就概括成了"无网络"。
  ⇒ **教训：把"某个域名不通"当成"没有网络"是过度概括**（与 §75.2「未命中先查自己的检查手段」同源；也与我一整天在记的"查询范围不足 ⇒ 事实判断错误"同源）。
- **`skillhub` CLI 已存在**（2026.8.5）⇒ 按文档直接：`skillhub install @org-02qudk26/ui-ux-pro-max-zh --dir .dsh/skills`；
- **坑 1**：CLI 打印 `✓ Installed` 时因 **Windows GBK 控制台编码**抛 `UnicodeEncodeError` 而**崩溃**（但文件已解压完）⇒ 用 `PYTHONIOENCODING=utf-8 PYTHONUTF8=1` 重试即通过；
- **坑 2**：装出来的结构是**嵌套**的 `.dsh/skills/@org-02qudk26/ui-ux-pro-max-zh/`，而项目级约定是**扁平** `.dsh/skills/<name>/SKILL.md` ⇒ 手工移动到扁平位置；
- 结果：`.dsh/skills/ui-ux-pro-max-zh/`（**352 行** SKILL.md + README + `_meta.json`），**本会话 skill catalog 已收录 `ui-ux-pro-max`** ✓（无需重启）。

### 86.3 派单纪律更新：四个 → **五个** skill
**项目级前端 skill 现为 5 个**：`frontend-design` · `afrexai-ui-design-system` · `css-animation-creator` · `motion-web` · **`ui-ux-pro-max`**。
§77.2 的纪律相应更新为**五个都要逐个 load**、引用条款原文、且 captain **可拿引文去 `.dsh/skills/*/SKILL.md` 核对**。
