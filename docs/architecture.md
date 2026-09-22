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
| @types/node                                                                     | 26.6.2                                              | api          | Node 类型            |

- **预批准但尚未安装**（由对应任务 owner 在落地时加入 catalog，**不得**提前安装）：

| 依赖                                          | 归属任务 | 用途 / 前置条件                         |
| --------------------------------------------- | -------- | --------------------------------------- |
| tailwindcss@4 + @tailwindcss/vite             | T3.1     | 把 `DESIGN.md` token 映射为 theme       |
| @tanstack/react-query                         | T3.2     | 服务器状态管理（唯一数据层）            |
| lucide-react                                  | T3.1     | 唯一图标来源                            |
| lxgw-wenkai-webfont、@fontsource/quattrocento | T3.1     | 自托管字体（**禁 CDN**，jsDelivr 不通） |
| @playwright/test                              | T4.1     | E2E 与并发抢占验证                      |
| 口令哈希库（argon2id / bcrypt 实现）          | T1.3     | 需先按 D-03 裁决                        |
| 数据库驱动 / ORM / 迁移工具                   | T1.2     | 需先按 D-01 / D-04 裁决                 |
| 音频存储 SDK（仅当选择对象存储时）            | T2.1     | 需先按 D-02 裁决                        |

- pnpm 11 安装脚本策略：`pnpm-workspace.yaml` → `allowBuilds: { esbuild: true }`（esbuild 是 vite/vitest 的原生二进制，必须放行）；其余依赖默认不允许执行安装脚本，新增放行需在汇报里说明理由。

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
