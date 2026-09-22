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
| @tanstack/react-query                         | T3.2     | 服务器状态管理（唯一数据层）            |
| lucide-react                                  | T3.1     | 唯一图标来源                            |
| lxgw-wenkai-webfont、@fontsource/quattrocento | T3.1     | 自托管字体（**禁 CDN**，jsDelivr 不通） |
| @playwright/test                              | T4.1     | E2E 与并发抢占验证                      |
| 口令哈希库（argon2id / bcrypt 实现）          | T1.3     | 需先按 D-03 裁决                        |
| ~~数据库驱动 / ORM / 迁移工具~~               | T1.2     | **已落地**：D-01/D-04 裁决为单一 Postgres + drizzle，见上表 |
| 音频存储 SDK（仅当选择对象存储时）            | T2.1     | 需先按 D-02 裁决                        |

- pnpm 11 安装脚本策略：`pnpm-workspace.yaml` → `allowBuilds: { esbuild: true }`（esbuild 是 vite/vitest 的原生二进制，必须放行）；其余依赖默认不允许执行安装脚本，新增放行需在汇报里说明理由。

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
