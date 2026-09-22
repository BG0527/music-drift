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
| D-01 | 数据库引擎                    | 自建 Postgres / Postgres + 对象存储 / Supabase 全家桶 / SQLite 单实例 | T1.2 及全部持久化工作 | captain + 用户        |
| D-02 | 音频存储位置                  | 库内 `bytea` / 对象存储 / Supabase Storage                            | T2.1 上传链路         | captain + 用户        |
| D-03 | 口令哈希与会话实现            | argon2id vs bcrypt；自建 session 表 vs 现成认证库                     | T1.3                  | captain               |
| D-04 | ORM / 查询层                  | 原生 SQL + 迁移脚本 / 轻量 query builder / 全量 ORM                   | T1.2（随 D-01）       | captain               |
| D-05 | 混音位置                      | 浏览器端 OfflineAudioContext / 服务端 ffmpeg                          | T2.2                  | captain（需实测证据） |
| D-06 | 部署平台                      | Render 静态站 + Web Service + 托管 PG / 本机 + cpolar 隧道            | T4.3（仅用户下令后）  | captain + 用户        |
| D-07 | 曲库来源与授权                | 用户提供音频（当前唯一合法路径）                                      | T3.4                  | 用户                  |
| D-08 | Figma 文件 URL 与冲突裁决流程 | 拿到 URL 后由 T0.3 出冲突清单                                         | T0.3 及全部前端视觉   | captain + 用户        |
| D-09 | 前端数据层方案                | TanStack Query（ADR-010 假设）是否作为唯一方案                        | T3.2                  | captain               |
| D-10 | E2E 浏览器矩阵                | Chromium only / + WebKit（Safari 录音差异）                           | T4.1                  | captain               |
| D-11 | 字体子集化策略                | 全量自托管 / 子集化（减小体积）                                       | T3.1                  | captain               |
| D-12 | API 文档形态                  | 手写 `docs/api.md` / 由 zod 生成 OpenAPI                              | T1.2、T2.3            | captain               |
| D-13 | 投河超时后的归宿              | 72h 无人接 → 自动入海 / 退回发起者                                    | T1.1（内核）          | captain + 用户        |
| D-14 | 断链后的处理                  | 直接标 `DAMAGED` 终态 / 退回最近有效节点继续漂流                      | T1.1（内核）          | captain + 用户        |

处理规则：裁决结果由 captain 写回本表（把"待裁决"改为"已裁决：结论 + 日期"）；worker 不自行改写结论。未裁决项一律按"接口先行、实现留空"处理（定义接口与类型，不写具体实现）。
