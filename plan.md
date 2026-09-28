# plan.md — 音乐漂流瓶 · 可读版 DAG

> 本文件是任务 DAG 的**可读版本**（源：团队任务清单 t1–t16，属于"实现计划"阶段的产物）。
> 纪律与流程见 `AGENTS.md`；架构决策见 `docs/architecture.md`（即任务清单里的 `design.md`，见文末说明）；产品规则见 `CONTEXT.md`；视觉契约见 `DESIGN.md`。
>
> ⚠️ 依赖关系为**按任务描述推断**（团队任务清单的 `dependencies` 字段目前为空）。如与 captain 的意图不符，以 captain 的裁决为准，worker 不自行改图。

---

## 1. 阶段（S0–S4）与切片划分

| 切片   | 阶段  | 内容                                                   | 任务                     | 验收口径（停下等用户验收）                                                                   |
| ------ | ----- | ------------------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------- |
| 切片 0 | S0    | 规格冻结 + 纪律落盘 + 脚手架；视觉契约重写；Figma 基线 | t1, t2, t3               | `pnpm -r test` / `pnpm -r typecheck` 全绿；三份纪律/决策文档可读；Figma 冲突清单已交 captain |
| 切片 1 | S1    | 领域内核 + 数据/契约 + 账号体系                        | t4, t5, t6               | 内核规则逐条有测试；迁移幂等且并发抢占可复现证明；两账号并行登录互不干扰                     |
| 切片 2 | S1    | 音频链路（录制 / 上传 / 播放 / 混音）                  | t7, t8（+ t13 待解阻塞） | Chrome 与 Safari 可录可播；80% 判定边界有单测；4 段 + 伴奏可导出成品                         |
| 切片 3 | S1    | 业务 API 全量                                          | t9                       | 每条规则至少一个 API 级测试；错误码表完整；409/422 语义可演示                                |
| 切片 4 | S2/S3 | 设计系统 + 黄金路径页面                                | t10, t11                 | 两个账号、两个浏览器窗口走完一次完整接力；375px / 1440px 无溢出                              |
| 切片 5 | S3    | 次级特性 + 管理员审核台                                | t12                      | 留言 / 斩浪 / 举报 / 收藏 / 徽章 / 通知 / 指定接唱各有可演示路径与测试                       |
| 切片 6 | S4    | E2E 验证 + 对抗式评审                                  | t14, t15                 | 黄金路径与并发用例全绿；`docs/review.md` 每条防滥用规则有结论                                |
| 切片 7 | S4    | 部署与公网冒烟                                         | t16                      | **仅在用户明确下令后开工**；公网链接 + HTTPS 录音实测通过                                    |

规则：切片内任务全绿 → captain 向用户汇报 → **停下等验收** → 验收通过才解锁下一切片（`AGENTS.md` §6）。

## 2. 任务清单（可读版 DAG）

| ID  | 阶段 | 标题                                                                      | Owner          | 依赖（推断）                      | 关键验收                                                                                   |
| --- | ---- | ------------------------------------------------------------------------- | -------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| t1  | T0.1 | S0 规格冻结 + 纪律落盘 + monorepo 脚手架                                  | architect      | —                                 | `pnpm -r test` / `pnpm -r typecheck` 通过；AGENTS.md / docs/architecture.md / plan.md 就位 |
| t2  | T0.2 | DESIGN.md 海洋主题 token 重写（保留全部核心纪律）                         | frontend-ds    | —                                 | 每项 token 有语义名 + 值 + 用途；对比度 ≥4.5:1；原文核心纪律逐条可对照                     |
| t3  | T0.3 | Figma 设计基线提取 + 冲突清单（只读）                                     | frontend-ds    | t2、**D-08（Figma URL）**         | `docs/figma/*` + `CONFLICTS.md` + `MISSING.md`；冲突全部上报，无自行决策                   |
| t4  | T1.1 | 领域内核：父链状态机 + 规则引擎（严格 TDD）                               | backend-core   | t1                                | 每条规则有测试名明确的用例；先红后绿证据；内核零 IO                                        |
| t5  | T1.2 | 数据模型、契约与并发控制方案                                              | backend-api    | t1、t4、**D-01 / D-04 裁决**      | 迁移可重复执行；并发唯一持有者可复现证明；契约在 web/api 两侧编译通过                      |
| t6  | T1.3 | 账号体系：注册 / 登录 / 会话 / 匿名代号                                   | backend-api    | t5                                | 两账号可并行登录互不干扰；代号唯一性与"同瓶不同码"有测试                                   |
| t7  | T2.1 | 录制、上传与播放链路                                                      | audio-engineer | t1、t6、**D-02 裁决**             | Chrome + Safari 可录可播；80% 判定边界（79.9% / 80%）有单测                                |
| t8  | T2.2 | 混音与成品导出（浏览器端优先）                                            | audio-engineer | t7、（伴奏来自 t13）              | 4 段人声 + 伴奏导出成品并可在线播放；对齐误差实测报告                                      |
| t9  | T2.3 | 业务 API（全部路由 + 权限 + 幂等 + 冲突语义）                             | backend-api    | t4、t5、t6                        | 每条规则至少一个 API 级测试；错误码表完整                                                  |
| t10 | T3.1 | 设计系统与布局骨架落地                                                    | frontend-ds    | t2、t3、**D-08 裁决**             | 逐条对照 `DESIGN.md` 自检表通过；无横向溢出；reduced-motion 生效                           |
| t11 | T3.2 | 黄金路径页面（登录 → 发起 → 投河 → 捞取 → 接唱 → 去向 → 公海 → 漂流日志） | frontend-flow  | t9、t10、t7（+t8 播放成品）       | 两个账号 × 两个浏览器窗口走完一次完整接力；375px / 1440px 无溢出                           |
| t12 | T3.3 | 次级特性与管理员审核台                                                    | frontend-flow  | t9、t10、t11                      | 每条 P1/P2 特性有可演示路径 + 自动化测试；权限服务端校验                                   |
| t13 | T3.4 | 伴奏曲库接入（等用户提供音频）                                            | audio-engineer | **D-07（用户提供音频与授权）**    | ≥3 首可选出、可分 4 段、伴奏可播放并与成品对齐                                             |
| t14 | T4.1 | 端到端验证：黄金路径 + 多浏览器接力 + 并发抢占                            | qa-e2e         | t11、t9、（t12 视范围）           | 黄金路径与并发用例全绿；报告含原始命令与输出                                               |
| t15 | T4.2 | 对抗式评审：按 `CONTEXT.md` §16 逐条证伪                                  | reviewer       | t14、t12                          | 每条规则有明确结论；blocker/high 问题可复现；`docs/review.md`                              |
| t16 | T4.3 | 部署与公网冒烟（仅用户下令后）                                            | architect      | t14、**D-06 裁决 + 用户部署指令** | 公网链接可用；HTTPS 下录音实测成功；冒烟清单全过                                           |

## 3. 依赖拓扑（简图）

```text
                 ┌─ t2 ──┬─ t3 ──┐
t1 ─┬─ t4 ── t5 ── t6 ───┼───────┼─ t10 ─┐
    │        │      │    │       │       ├─ t11 ─┬─ t12 ─┐
    │        │      └────┼─ t7 ──┴─ t8?  │       │        ├─ t14 ─ t15
    │        └─ t9 ◄─────┘   │           │       └────────┘        │
    └─────────────────────────┴─ t13(阻塞) └──────────────────────► t16(仅用户下令)
```

关键路径：`t1 → t4 → t5 → t9 → t11 → t14 → t15 → t16`（t7/t8 与 t10 是 t11 的前置输入）。
上游任一任务失败 → 下游**不得**开工，由 captain 决定返工或调整切片边界。

## 4. 阻塞点（必须先解决才能开工）

| 阻塞                             | 卡住谁                  | 需要谁                |
| -------------------------------- | ----------------------- | --------------------- |
| D-01 数据库引擎未裁决            | t5 及全部持久化工作     | captain + 用户        |
| D-02 音频存储方案未裁决          | t7（上传段）、t8        | captain + 用户        |
| D-04 ORM / 查询层未裁决          | t5、t9                  | captain               |
| D-05 混音位置（浏览器 / ffmpeg） | t8 的最终形态           | captain（需实测证据） |
| D-06 部署平台未裁决              | t16                     | captain + 用户        |
| D-07 曲库音频与授权未提供        | t13、t8 的伴奏对齐      | 用户                  |
| D-08 Figma 文件 URL 未提供       | t3、t10、t11 的视觉基线 | captain + 用户        |
| 用户验收未通过                   | 下一个切片整体          | 用户                  |

未裁决时的行为准则：**接口先行、实现留空**（定义类型与接口，不写具体实现，不装依赖）。

## 5. 变更流程

- `plan.md` 由 `architect` 维护；切片边界、任务增删、owner 变更由 captain 决定，worker 不自行改图。
- 任何任务范围变化 → 回到 superpowers 阶段 3 重排计划（`AGENTS.md` §1），并在本文件留变更记录。
- 裁决结果由 captain 写回 `docs/architecture.md` §10 的待裁决表；本文件的阻塞表随之同步。

变更记录：

| 日期       | 变更                                                      | 原因          |
| ---------- | --------------------------------------------------------- | ------------- |
| S0（本轮） | 建立本文件：S0–S4 切片划分、t1–t16 可读 DAG、依赖与阻塞表 | T0.1 产出要求 |
| 2026-09-28 | 新增第十七轮 W18–W22 五个 P0 切片计划 | 用户确认 `docs/architecture.md` §105 的需求与设计 |

## 7. 第十七轮实施计划（W18–W22）

> 本节覆盖用户在 2026-09-28 确认的新需求；若与上方历史 DAG 的功能范围冲突，以本节及 `docs/architecture.md` §105 为准。每个切片严格按“一个行为测试 Red → 最小实现 Green → 重构后再 Green”推进，切片完成后评审、提交并停下等待用户验收。

### 7.1 切片顺序与出口条件

| 切片 | 闭环 | 主要文件 | 出口证据 |
| --- | --- | --- | --- |
| W18 | 瓶子详情与录音 | `packages/shared/src/audio/*`、`packages/shared/src/contracts/{songs,bottles}.ts`、`apps/api/src/audio/*`、`apps/api/src/routes/bottles.ts`、`apps/web/src/features/audio/*`、`apps/web/src/features/bottle/record-step.tsx`、`apps/web/src/pages/bottle-page.*`、`site/{bottle.html,app/page-bottle.js,app/recorder.js}` | 录音→本地复核→上传→去向串行；重录/取消/上传失败可演示；完整混音与逐行逐字歌词由真实媒体时间驱动；详情页四档桌面视口无滚动、遮挡和横溢出 |
| W19 | 公海业务闭环 | `packages/shared/src/{contracts,domain}/*`、`apps/api/src/{db,store,routes}/*`、`apps/api/drizzle/0008_*.sql`、`apps/web/src/features/bottle/*`、`apps/web/src/pages/{sea,bottle}-page.*`、`site/{sea,bottle}.html`、`docs/api.md` | 公海等待作品可接唱；完成作品访客可听、登录用户可收藏；评论读写删报与管理员审核真实入库；私密留言按状态隐藏/恢复并在送达后仅向双方解匿名 |
| W20 | 我的与漂流日志 | `packages/shared/src/domain/badges*`、`apps/api/src/routes/*`、`apps/web/src/features/bottle/{badges-panel,my-bottles,collections-panel,notification-list}*`、`apps/web/src/pages/{profile,drift-log}-page.*`、`site/{profile,drift-log}.html` | 徽章契约/API/计算/UI 全部退役；收藏扩展占位；我的与日志复刻参考页并在四档桌面视口一屏无重叠 |
| W21 | 其余应用页与邮箱退役 | `packages/shared/src/contracts/*`、`apps/api/src/{db,routes}/*`、`apps/api/drizzle/0009_*.sql`、`apps/web/src/pages/{sea,song-picker,settings,login,admin,not-found}-page.*`、`site/*`、`tools/*`、`docs/api.md` | 账号密码是唯一认证形状，真实迁移删除邮箱列/索引；全部剩余页面复刻参考页；四档桌面视口一屏，窄/矮屏可滚且无横溢出 |
| W22 | Landing 连续河流 | `apps/web/src/pages/landing-page.tsx`、Landing 样式与测试、`DESIGN.md`（仅缺 token 时先回设计确认）、`site/index.html`（若为对应参考） | 8 个 `100dvh` 分屏；同一主角瓶随活动屏沿连续河流移动；只用 token 化 `transform`/`opacity`；reduced-motion 即时切换；桌面与窄屏无非设计性遮挡 |

### 7.2 W18 — 瓶子详情与录音闭环（当前下一切片）

1. **歌词契约 tracer bullet**
   - 先改/新增 `packages/shared/src/audio/library.test.ts`，断言三首原伴奏均有四段原创时间轴，行区间合法且覆盖对应段。
   - 运行：`pnpm --filter @music-drift/shared test -- library.test.ts`，保存缺字段/行为的 Red 原始输出。
   - 最小实现：扩展 `packages/shared/src/audio/library.ts` 与 `packages/shared/src/contracts/songs.ts`；不引入歌词或动画库。
2. **媒体时间驱动的 K 歌歌词**
   - 逐个为“当前行选择”“逐字填色比例”“上下行窗口”“reduced-motion”写失败测试，再分别实现 `apps/web/src/features/audio/karaoke-lyrics.tsx` 及测试。
   - 验证：`pnpm --filter @music-drift/web test -- karaoke-lyrics`。
3. **录音复核状态机**
   - 在 `apps/web/src/features/audio/recorder-panel.test.tsx` / `use-recorder.test.ts` 逐条覆盖试听、重录释放 URL、取消、确认上传、上传失败保留 Blob、上传成功才打开去向。
   - 最小修改 `recorder-panel.tsx`、`use-recorder.ts`、`record-step.tsx`；两个 Modal 永不共存。
   - 验证：`pnpm --filter @music-drift/web test -- recorder-panel use-recorder record-step`。
4. **完整试听权限与混音**
   - 先在 `packages/shared/src/audio/mix.test.ts`、API 集成测试中覆盖完成公海访客四段可听、未完成只含服务端可见段、缺口伴奏保留、后续隐藏段不可取。
   - 最小修改 `packages/shared/src/audio/mix.ts`、`apps/api/src/routes/bottles.ts` / `apps/api/src/audio/routes.ts`、前端 `mix-render.ts` 与详情播放器。
   - 验证：`pnpm --filter @music-drift/shared test -- mix.test.ts`、`pnpm --filter @music-drift/api test -- visibility audio`、`pnpm --filter @music-drift/web test -- mix-render bottle-page`。
5. **详情页复刻和一屏门禁**
   - 以 `site/bottle.html` 为结构基准，先更新 `apps/web/src/pages/__tests__/bottle-page-reference.test.tsx`、`one-screen-fit.test.ts` 见 Red，再改 `bottle-page.tsx` / `bottle-page.css`。
   - 用真实 API、真实音频路径在 `1024×720`、`1280×800`、`1440×900`、`1920×1080` 检查根高度、横向溢出、关键控件相交；窄/矮屏只要求可滚、16px 正文、44px 操作目标。
6. **W18 评审与验收**
   - 独立执行者完成实现后，由另一独立执行者做规格符合性与代码质量评审，结果写入 `docs/review.md`；Critical 必须回到对应 TDD 循环修复。
   - 全量命令：`pnpm -r test`、`pnpm -r typecheck`，再跑真实 Postgres/API/浏览器走查；把命令与原始输出摘要写入 `docs/review.md`。
   - 在本地 `main` 仅提交 W18 一次，然后停下等待用户验收，未验收不得开始 W19。

### 7.3 W19 — 公海闭环

1. 先用共享领域测试钉住公海等待作品的接唱资格、完成作品访客试听与收藏资格，再改领域规则和契约。
2. 评论按垂直切片推进：迁移/Schema → 创建 → 列表游标 → 作者软删 → 举报 → 管理员 `REMOVE_COMMENT`；每一步先有 API 集成 Red，再做最小后端与前端接线，并同步 `docs/api.md`。
3. 私密留言先测试服务端投影：公海完全不返回；离海恢复；`PENDING/UNDELIVERED` 匿名；`DELIVERED` 仅发送者和接收者互见账号名；任何响应均无邮箱。
4. 复刻 `site/sea.html` / `site/bottle.html` 的公海与详情区块，评论列表采用固定区域分页或内部滚动。
5. 运行定向测试、`pnpm -r test`、`pnpm -r typecheck` 和真实数据库/API/双账号浏览器闭环；评审写 `docs/review.md`，提交后停下等验收。

### 7.4 W20 — 我的与漂流日志

1. 先写“仓库公共出口、路由和页面均不存在徽章能力”的失败测试，再删除 `badges` 领域导出、API、前端 pocket/modal 与对应旧测试；不新增替代能力。
2. 先以参考页测试钉住“收藏占满原收藏+徽章区域、消息列不变”及日志信息层级，再修改 `profile-page.*`、`drift-log-page.tsx` 和对应 `site` 接线。
3. 四档桌面视口做一屏/相交/横溢出自动检查，动态列表只在自身容器滚动；窄/矮屏允许页面滚动。
4. 全量测试、类型检查、真实浏览器走查、独立评审、本地提交；随后停下等验收。

### 7.5 W21 — 其余应用页与邮箱退役

1. 先写契约和认证集成 Red：注册/登录仅接受 `{ account, password }`，响应无 `email`，旧 email 形状失败；再改共享契约与认证路由。
2. 先写迁移集成 Red，再增加下一号迁移删除 `users_email_uniq` 与 `users.email`；更新 schema、种子、环境检查、走查脚本、活跃文档。旧迁移保留审计历史。
3. 按页面逐一用参考结构测试 Red→Green：公海大厅、选歌、设置、登录、管理、404；不得在同一 Red 中批量实现多页。
4. 对每页跑四档桌面一屏门禁和窄/矮屏可用性；完成全量验证、真实联调、独立评审与本地提交，停下等验收。

### 7.6 W22 — Landing

1. 先用组件测试钉住 8 屏、单一持久主角瓶、活动索引到 8 个河流节点的映射、最后一屏入海以及 reduced-motion 行为。
2. 如现有 `DESIGN.md` 缺少所需河流/动效 token，先回设计确认并等待用户裁决；否则直接用既有 token 实现，不新增动画库。
3. 用 IntersectionObserver/滚动状态驱动活动屏；瓶子只动画 `transform` / `opacity`，不依赖 `setInterval`，其他瓶仅作低对比静态远景。
4. 验证每个分屏自身不溢出、整页只按屏滚动；完成全量测试、类型检查、真实浏览器动效与 reduced-motion 走查、独立评审、本地提交，停下等最终验收。

### 7.7 全轮共同限制

- 用户新增的三份 `.kgm.flac` 是不可浏览器解码的 KGM 容器且部分歌词有明确使用限制，仅保留为用户素材，不解密、不接入 Demo；Demo 使用原三首伴奏与新原创歌词。
- 不新增未登记的中间件、UI/动画/歌词库；前端美化只使用仓内 `.agents` 技能产出的设计判断与 `DESIGN.md` token。
- 不推远端、不部署；所有“完成”声明必须同时包含测试、类型检查、真实数据库、真实 API、真实浏览器和真实音频路径证据。

## 6. 关于 `design.md` 的落盘位置（重要）

任务清单要求产出 `design.md`（架构决策记录），但仓库根目录已存在视觉契约 `DESIGN.md`，而当前文件系统（Windows）**大小写不敏感** —— 二者是同一个文件。为不覆盖视觉契约，架构决策记录落在 **`docs/architecture.md`**，并在文件头声明它即任务所指的 `design.md`。
**禁止**在根目录创建小写 `design.md`。
