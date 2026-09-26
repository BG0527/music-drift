# HTML 作为前端的部署方案（免费 · 可让评委验收）

> 用户需求（2026-09-23）：**不再把定稿重写成 React，直接用 HTML 作前端上线**；要一份前后端技术栈方案；
> **免费部署**、能让评委验收；**解决掉所有潜在隐患**；**部署只在用户明确下令时才执行**。
>
> 本文件是方案，不是执行记录。**目前没有部署任何东西。**
> 相关裁决：`docs/architecture.md` D-01/D-02（已裁决：自建 Fastify + 单一 Postgres，音频以 bytea 存库，零对象存储/零 BaaS/零 Redis）、
> **D-06 部署平台（待裁决 —— 本文件给出候选，等你选）**。

---

## 0. 一句话结论

**可以，但必须同源。** 推荐拓扑：

```
        一个域名（同源，HTTPS 免费）
  ┌──────────────────────────────────────────────┐
  │  Cloudflare Pages（免费，无限带宽）           │
  │   /            → 11 个 HTML 页面 + 静态资源   │
  │   /api/*       → Pages Function 反向代理 ─┐   │
  └───────────────────────────────────────────┼───┘
                                              ▼
                         Fastify（apps/api，Docker）跑在免费容器主机
                                              │
                                              ▼
                                 托管 Postgres（Neon 免费层）
                                  音频 bytea 就存在这个库里
```

- 前端静态：**Cloudflare Pages**（免费、全球 CDN、HTTPS、**自带 Functions 可做同源反代**）
- 后端：**Fly.io / Render Web Service / Koyeb** 之一（Docker 起 Fastify）
- 数据库：**Neon**（免费 Postgres）或 Render 托管 PG
- 音频：**存库（bytea）**，不引对象存储 —— 这是 D-02 已裁决的，省钱省事

---

## 1. 决定性的技术事实（先看这条，它定死了架构）

| 事实（已核实源码） | 后果 |
| --- | --- |
| `apps/api/src/auth/session.ts` 的会话 cookie 是 **`HttpOnly + SameSite=Lax + Path=/`**（生产加 `Secure`） | **`SameSite=Lax` 下，跨站 `fetch` 不会带 cookie** ⇒ 静态页与 API 不同域时，**登录会"看起来成功"、下一页立刻掉线** |
| 全仓**没有任何 CORS 配置**（无 `cors` 插件、无 `Access-Control-Allow-*`） | 跨域请求会被浏览器直接拦掉；**且这属于后端改动，而本轮"先不改后端"** |
| 用户约束：**先不改后端** | ⇒ 只能让前端去适配后端 ⇒ **必须同源** |

> **结论：静态页与 API 必须挂同一个域名。** 这一条是全部方案的前提；后面所有选项都在满足它的前提下比较。
>
> 顺带一个好消息：`SameSite=Lax` 同时**挡住跨站 POST 带 cookie** ⇒ CSRF 基本被浏览器兜住了（评审时若被问到，这是可以直说的）。

---

## 2. 候选栈对比（都在"同源"前提下）

| 方案 | 前端 | 后端 | 数据库 | 同源怎么实现 | 免费层现实 | 冷启动 | 适合评委？ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **A（推荐）** | Cloudflare Pages | Fly.io（Docker）或 Koyeb | Neon | **Pages Functions 反代 `/api/*`** | Pages 无限带宽；Fly 需绑卡但有小额度；Neon 免费 | Fly 可常驻 1 台；Neon ~1s 唤醒 | ✅ 最好 |
| B | Render Static Site | Render Web Service | Render PG | ❌ 静态站与 Web Service 是**不同子域** ⇒ 不同源。绕过办法：把静态站也搬到 Web Service 里由 Fastify 一起发（改后端 ✗） | 全免费 | **休眠 ~15 分钟后冷启 50s** | ⚠️ 需预热 |
| C | Cloudflare Pages | Cloudflare Tunnel 到你本机 | 本机 PG | Pages Functions 反代到隧道 | 免费 | 你的电脑得开着 | ❌ 评委访问时你得在线 |
| D | Cloudflare Workers（改造成 Worker） | — | Neon + Hyperdrive | 天生同源 | 免费 | 无 | ❌ 要**重写后端**（Fastify→Worker），违反"不改后端" |

> **D-06 的候选原本是"Render 静态站 + Web Service + 托管 PG / 本机 + cpolar 隧道"。按上面的同源硬约束：
> Render 的静态站与 Web Service 天然不同源，会把会话打掉；cpolar 隧道则要求你的电脑在线。**
> ⇒ 我建议把 D-06 改成 **方案 A**。

---

## 3. HTML 作为前端的固有缺点（你问的核心）

按"影响验收"的严重度排：

### 🔴 致命 / 必须先解决

| # | 缺点 | 具体后果 | 解决 |
| --- | --- | --- | --- |
| 1 | **稿子里一行 JS 都没有**（`_guard.mjs` 明令禁 `<script>`） | 表单不能提交、投票不能点、录音不能录、捞/投不能跳转 ⇒ **上线后是一个纯图片站** | 加一层**免构建的原生 ESM**（`/app/*.js`）做数据与交互。这是本轮真正的工作量 |
| 2 | **页面里是硬编码假数据**（"占位曲目 · 一""已录 3/4 段""2026/9/23 20:38"） | 评委看到的是**假数据**；若不接后端 = 只能看不能用；若接后端 = 每个文本节点都要能被 JS 替换，而现在**没有任何 `data-*` 挂点** | 逐页加挂点（`data-bind="bottle.title"`），JS 按契约渲染；**并在页面上明确标注"演示数据"直到接通** |
| 3 | **会话是 `SameSite=Lax` + 无 CORS** | 不同源 ⇒ 登录立刻掉线（见 §1） | 同源反代（方案 A） |
| 4 | **免费后端的休眠** | Render 免费 Web Service 15 分钟无请求即休眠，**下次冷启约 50 秒** ⇒ 评委点开等 50 秒＝灾难 | ① 选可常驻的主机；② 免费 cron 每 10 分钟 ping `/healthz` 保温；③ 前端首屏加"正在唤醒服务"状态（不能白屏） |
| 5 | **数据得有人造** | 空站无法验收 | 写 **seed 脚本**（几支作品、若干段、留言、公海里若干件），并在 README 写明一键重建 |

### 🟠 产品能力上的硬缺口

| # | 缺点 | 后果 | 解决 |
| --- | --- | --- | --- |
| 6 | **多页 = 整页跳转** | 每次跳转整页重载：会话闪烁、**音频播放中断**、无客户端缓存 | 接受它（MPA 的固有代价）；把播放器状态放进 `sessionStorage`，或干脆不跨页续播 |
| 7 | **没有组件复用** | 11 个 HTML 各自一份 CSS/结构 ⇒ 改一处要改 11 处，很快漂移 | 抽出 `/assets/*.css`（公共层）与 `/app/*.js`（公共逻辑），页面只留本页差异 |
| 8 | **没有状态管理** | 登录后侧栏显示代号、未读数、当前页高亮……全要手写 | 一个 200 行以内的 `session.js` + `nav.js`，别引框架 |
| 9 | **没有路由** | 深链接、刷新、返回键的行为要自己保证 | 用真实的多文件路径（`/river.html` 等）；平台开启 clean URL 或直接保留 `.html` |

### 🟡 质量 / 纪律债

| # | 缺点 | 后果 | 解决 |
| --- | --- | --- | --- |
| 10 | **固定 1440×900 绝对定位，不响应式** | 评委用 13" 笔记本 / 平板打开 ⇒ 横向滚动或挤成一团；375 下基本不可用 | 至少做"**不横向溢出 + 关键块可见**"的下限：加 `meta viewport` + 一个全局缩放兜底 + 主内容列 `max-width`；**不要假装它是响应式的** |
| 11 | **可访问性差**：全是 `div`，无 `button`/`label`/`aria`，绝对定位的 Tab 顺序是乱的 | 键盘/读屏用户无法使用；若评委按 a11y 打分直接失分 | 交互元素改成语义标签、补 `aria-label`、给 Tab 顺序加 `tabindex`；**这是低成本高收益**的一项 |
| 12 | **绕过全部仓库守卫** | `tokens.test.ts`/`design-discipline.test.ts` 管的是 React 源码；HTML 站内联 hex、禁 emoji 之类**没人管** | 给静态站单独写一个**轻量守卫**（禁 emoji/纯黑/外链、必须有 viewport、必须有 `data-bind` 契约、必须有署名） |
| 13 | **契约漂移无人拦** | API 契约在 `packages/shared`（zod）。手写 JS 不引用它 ⇒ 字段/枚举改名后**运行时静默坏掉** | 加**契约冒烟测试**：用真实响应过一遍 zod schema（在 CI 或本地一条命令） |
| 14 | **XSS 风险** | 匿名代号/曲名/留言都是用户输入；vanilla JS 一用 `innerHTML` 就可能被偷会话 | **一律 `textContent`**；把这条写成静态守卫（禁 `innerHTML`） |

### 🔵 运维 / 合规

| # | 缺点 | 后果 | 解决 |
| --- | --- | --- | --- |
| 15 | 免费层条款变动 | Render 免费 PG **90 天到期**；Neon 有存储上限；Fly 需绑卡 | 选 Neon（不休眠、无到期）或接受备份/重建流程；把 `DATABASE_URL` 当可替换 |
| 16 | 缓存/版本漂移 | 无构建 = 无指纹；评委可能拿到旧 JS/CSS | 资源路径带版本查询（`?v=日期`）+ 平台层 `Cache-Control` |
| 17 | 音频版权署名 | `incompetech-cc-by-4.0` 必须保留 | 稿子里已有，上线前逐页复核一遍（守卫里加一条） |
| 18 | 数据库被清 = 演示数据没了 | 评委中途打开是空站 | seed 脚本 + 每日备份（`pg_dump` 到一个免费位置） |

---

## 4. 上线前必须做的事（清单）

**A. 目录与产物**
1. 新建发布目录（建议 `site/` 或 `apps/web-static/`），从 `docs/ui-review/design-explore/*.html` **复制** 11 页过去 ——
   **设计稿目录保持原样**（它是设计阶段的证据，`_guard.mjs` 等工具依赖它，混用会破坏"设计稿 vs 线上产物"的分界）。
2. 抽公共层：`/assets/base.css`（七色变量、字体 `@import`、公共排版）、`/app/session.js`、`/app/api.js`、`/app/nav.js`。
3. 每页加：`<meta name="viewport">`、`<script type="module" src="/app/page-xxx.js">`、`data-bind` 挂点。

**B. 数据层（免构建，原生 ESM）**
4. `api.js`：`fetch('/api/...', { credentials: 'same-origin' })` + 统一错误处理（401 → 跳登录）。
5. `page-*.js`：为每页实现"取数 → 填 `data-bind` → 绑事件"。**文本一律 `textContent`**。
6. 首屏加"正在唤醒服务 / 加载中 / 空 / 出错"四种态（评委一定会遇到冷启动）。

**C. 后端与部署（**等你下令才做**）**
7. 给 `apps/api` 写 `Dockerfile`（现在没有）。
8. Cloudflare Pages 项目 + `functions/api/[[path]].js` 反代到 API 主机（同源关键）。
9. Neon 建库 → 跑迁移 → 跑 seed。
10. 环境变量（`DATABASE_URL`、会话密钥等）**只配在平台侧**，不入库。

**D. 验证（部署前必须全绿）**
11. `pnpm -r test` / `typecheck` / `lint`（后端与既有前端不受影响）。
12. **契约冒烟**：对真实 API 跑一遍 zod 校验。
13. 静态站守卫：无 emoji/纯黑/外链、有 viewport、有署名、无 `innerHTML`、`data-bind` 与契约字段名一致。
14. 真机走查：13" 笔记本 + 平板 + 手机各开一次；键盘 Tab 走一遍；录音授权走一遍（**必须 HTTPS**——免费平台都是）。
15. 冷启动演练：静置 20 分钟后再打开，看是否出现"正在唤醒"而不是白屏。

---

## 5. 需要你裁决的三项

| # | 待裁决 | 我的建议 |
| --- | --- | --- |
| 1 | **D-06 部署平台** | 改为 **方案 A**（Cloudflare Pages + Fly/Koyeb + Neon）。理由：只有它能免费做到**同源**（Pages Functions 反代），而 Render 的静态站与 Web Service 天然不同源，会把会话打掉 |
| 2 | **是否加 JS 数据层** | **必须加**（否则上线的是纯图片站）。范围建议：先做"**能验收**"的最小闭环 —— 登录/注册、河道列表、瓶子详情、投票、录音上传、公海列表；其余页面先只读 |
| 3 | **响应式做到哪一档** | 建议只做"**不横向溢出 + 关键块在首屏**"的下限（375 可用不求好看），把力气花在桌面 1440 的观感上 —— 因为评委大概率用桌面看 |

---

## 6. 不做的事（明确边界）

- **不改后端**（`apps/api`、`packages/shared` 一行不动）—— 所以"跨域 cookie"只能靠同源部署解决，不能靠改 `SameSite`。
- **不引新依赖**（AGENTS §7：中间件/存储/部署平台是待裁决项）—— 本方案只用平台能力与原生 ESM，不装任何前端框架。
- **不部署**（等你说）。部署时也只动平台侧配置与新增的 `site/` 目录，不碰 `apps/web`（React 版留着，将来要回去做也不亏）。

---

## 7. 已裁决与施工图（2026-09-23）

### 7.1 用户裁决
- **只做 web 端，暂时不做响应式** ⇒ 静态站按 **1440×900 桌面**交付；**375 不进本产物的验收线**（`meta viewport` 仍加，只为避免被缩成豆腐块）。
- **11 页全部接真数据**（含审核台的处理动作、设置的保存、漂流日志）。
- **平台先不定**：本阶段只交付**本地前后端联调产物**；D-06 留待联调通过后再选。
- **部署只在用户明确下令时执行** —— 本阶段不部署、不改后端（`apps/api`、`packages/shared` 一行不动）。

### 7.2 本地栈可行性（已核）
- Docker `28.3.3` ✓；本地 PG 已在 **5433** 监听 ✓；`.env` 就位 ✓；
- `apps/api` 已有 `db:migrate` / `db:seed` / `live-check` ✓ —— **演示数据不用从零写**；
- API 未启动（8787 未监听）⇒ 联调时起即可。

### 7.3 页面 ↔ 端点映射（施工图；路由真值取自 `apps/api/src/routes/*.ts`，共 25 个端点 / 16 张表）
| 设计稿 | 站点路径 | 用到的端点 |
| --- | --- | --- |
| `p-login-record` | `/login.html` | `POST /api/auth/login`、`POST /api/auth/register`、`POST /api/auth/logout`、`GET /api/auth/me` |
| `f4-groove` | `/river.html` | `POST /api/river/draw`（捞）；投河入口跳 `/new.html` |
| `p-songpicker-record` | `/new.html` | `GET /api/songs`；选曲后录第 1 段并**发起**（`POST /api/bottles`） |
| `p-bottle-record` | `/bottle.html` | `GET /api/bottles/:id`、`POST /api/bottles/:id/segments`、`POST /api/segments/:id/listen`、`POST /api/segments/:id/votes`、`GET/POST /api/bottles/:id/messages`、`POST /api/bottles/:id/resolution`、`POST /api/bottles/:id/put-back`、`POST /api/reports` |
| `p-driftlog-record` | `/drift-log.html` | `GET /api/bottles/:id/events` |
| `p-sea-hall` | `/sea.html` | `GET /api/sea` |
| `p-sea-detail-record` | `/sea-detail.html` | `GET /api/sea/:id`、`POST /api/sea/:id/targeted-segment`、`POST /api/collections/:bottleId` |
| `p-profile-record` | `/me.html` | `GET /api/me/bottles`、`GET /api/notifications`、`POST /api/notifications/:id/read`、`GET /api/me/collections`、`GET /api/me/badges`、`GET /api/me/anonymous-codes` |
| `p-settings-record` | `/settings.html` | `GET /api/auth/me`、`POST /api/auth/logout` |
| `s2-admin-record` | `/admin.html` | `GET /api/admin/reports`、`POST /api/admin/reports/:id/decision` |
| `p-404-record` | `/404.html` | —（纯静态） |

> ⚠️ **演示导航是新增元素**：11 张稿子是**独立页**（只有页内返回链接），没有全站导航 ⇒ 评委无法在页间移动。
> 因此加一个**默认收起**的「演示导航」（角落一个小触发器，展开列出 11 页），**不改动任何页面的构图**，并在页脚标注它是演示辅助。

### 7.4 波次与文件归属（避免撞车）
| 波 | 谁 | 独占文件 | 交付 |
| --- | --- | --- | --- |
| **W0** | 一个 agent | `site/**`（骨架）、`tools/site-server.mjs`、`site/app/*.js`（**共享层，之后只有 captain 能改**）、`docs/site-runbook.md` | 11 页复制到位 + 共享 JS 层 + 无依赖静态服务器（含 `/api` 同源反代）+ 登录链路能跑通 |
| **W1-a** | 一个 agent | `site/river.html`、`site/new.html`、`site/app/page-*.js`（这两个） | 捞/投/选曲/发起 接真数据 |
| **W1-b** | 一个 agent | `site/bottle.html`、`site/drift-log.html` + 各自 page js | 段链/试听/投票/留言/三选一/放回/事件流 接真数据 |
| **W1-c** | 一个 agent | `site/sea.html`、`site/sea-detail.html`、`site/me.html` + 各自 page js | 公海列表/详情/收藏/通知/徽章/我的瓶子 |
| **W1-d** | 一个 agent | `site/login.html`、`site/settings.html`、`site/admin.html`、`site/404.html` + 各自 page js | 登录注册/设置/审核台处理动作 |
| **W2** | captain + 一个 agent | `tools/site-guard.mjs`、契约冒烟 | 静态站守卫（禁 emoji/纯黑/外链/`innerHTML`、必须有 viewport 与 CC-BY 署名、`data-bind` 必须命中契约字段）+ 真实响应过 zod |
| **W3** | captain | `docs/site-runbook.md` | 一键起全栈 + 走查脚本（登录→选歌→录音→投河→捞起→接唱→投票→回传入海→我的→公海） |

### 7.5 W0 的硬约束（发给执行者）
- **不许改 `docs/ui-review/design-explore/**`**（设计稿是证据）；只把 11 页**复制**到 `site/`。
- **不许改后端**（`apps/api`、`packages/shared` 一行不动）；不改 React 版（`apps/web`）。
- **不许装依赖**：静态服务器用 `node:http` + `fetch` 手写反代（AGENTS §7 禁止擅自引中间件）。
- **渲染一律 `textContent`**（禁 `innerHTML`）—— 匿名代号/曲名/留言都是用户输入。
- 每页只**增加**：`<meta viewport>`、`<script type="module" src="/app/page-xxx.js">`、`data-bind` 挂点；**不得改动既有构图与视觉值**（本阶段不做视觉重排）。

---

## 8. 发布方式修正（按用户指正）

**用户指正**：「`docs/ui-review/design-explore` 里面已经有 html 网页」—— 对的，那些 `.html` **就是源**，不该另起一套。

### 8.1 为什么不能把那个目录直接当站点根（实测事实）
| 实测 | 后果 |
| --- | --- |
| 该目录共 **20 个 `.html`**（11 张定稿 + 9 张归档/候选）、**24 张 `.png`** | 评委能打开被淘汰的候选页与候选图 |
| 同目录还有**内部文档**：`_AUDIT.md`(14KB)、`_LANGUAGE.md`(19KB)、`_VALUES.md`(320KB)、`_SCORECARD.md`、`_PERSONALITY.md`、`_DEDUP.md` | **内部评审记录与设计笔记会暴露在公网** |
| 11 页里 `<script>` 数量 = **0** | 必须加 JS 才能接真数据，而加 JS 就动了"设计期冻结"的文件 |
| 但页面的 **class 名是语义化的**（`.maker`/`.seal`/`.segNum`/`.segLab`/`.note`，部分还带 `role="img" aria-label`） | ⇒ **JS 可以不改 HTML 结构就绑上元素** |

### 8.2 修正后的发布方式（替换 §7.4 里 W0 的"复制 + 逐页加挂点"）
```
docs/ui-review/design-explore/*.html   ← 源（冻结，字节不改；设计期守卫继续有效）
        │  node tools/sync-site.mjs   （可反复重跑）
        ▼
site/*.html    ← 发布副本：只注入 <meta viewport> + <script type="module" src="/app/page-x.js">
site/app/page-*.js   ← ★ 所有接线都住在这里：靠页面已有 class 名定位、填充、绑事件
```
1. **HTML 结构永不重构**；接线一律在 JS 里（`textContent` 赋值、克隆既有节点作模板、插入真实数据）。
2. 于是**接线者不可能顺手把设计改坏**（他改不到 HTML），**视觉保真度天然最高**。
3. `tools/sync-site.mjs` 可随时重跑：源改了（正常不该改）就重新同步；`site/` 是生成物。
4. **只有 11 张定稿进 `site/`**，归档候选与内部文档一律不进 —— 站点根再无泄漏面。

### 8.3 对 W1 的影响（四个接线 agent 的约束随之改变）
- W1 的 agent **只许写 `site/app/page-<自己那几页>.js`**；**不许改 `site/*.html`**（改了会被下次 sync 覆盖，且会破坏"HTML 是源"）。
- 若某页**确实**需要新增元素（例如动态列表容器），用 JS 在运行时创建/克隆，不要写进 HTML。
- 每页的现有文案是**演示数据**：JS 接上真数据后要能整体替换；**未接上的部分必须在页面上标明是演示数据**（不能让人误以为是真的）。

### 8.4 与 W0 的关系（诚实记录）
W0（`0bc60f4e`）在本次指正**之前**已按 §7.5 开工（其任务书要求"复制到 site/ 并给每页加 viewport 与 script 与 `data-bind` 挂点"）。
本会话 `send_message` 对 subagent 不可寻址 ⇒ **改不了它的任务书**。处理：它交稿后，captain 按 §8.2 收口 ——
把"逐页加挂点"退化为"只注入两行"，并补上 `tools/sync-site.mjs`；`data-bind` 是否保留由 captain 决定（保留也无害：它只是 JS 的定位约定）。

---

## 9. W1-d 裁决（captain，2026-09-23）

### 9.1 「接真后原稿文案会说假话」⇒ 允许的**运行期文案偏离清单**（其余文案一字不改）
HTML 是源、不许改 ⇒ 只能运行时替换文本。**这四处是"不换就会说谎"，故批准**（并由 W1-d 记录在代码注释里）：
| 位置 | 原稿 | 运行期 | 为什么必须换 |
| --- | --- | --- | --- |
| `.act` 主按钮 | 固定「注册并进入」 | 登录 tab =「登录并进入」 | 登录 tab 上写「注册并进入」是错的 |
| `.tip` 提示行 | 固定两项说明 | 按 tab 切换（注册=三项） | 方案 C 下注册确实三项 |
| `.colophon` | 固定「SIDE A · 未登录」 | 按会话显示未登录/已登录 | 已登录时写"未登录"是错的 |
| `.foot .said` | 「你已经登录为「你的代号」」+ `href="#"` | 未登录时不这么说；死链改 `/river.html` | 未登录时说"你已经登录"是错的；`#` 是死链 |
**口径**：这四处之外，任何页面文案都不得改。若将来评审要求"逐字一致"，把本表交出去即可解释差异来源。

### 9.2 审核台「恢复这一段」在冻结后端上做不到 ⇒ 处置
**事实（W1-d 实测）**：`apps/api/src/routes/admin.ts` 对 `REVIEWED` 的举报只接受**同一结论**（幂等 200），**改判一律 422 `REPORT_ALREADY_REVIEWED`**；而 `RESTORE_SEGMENT` 只能挂在对**唱段**的 **PENDING** 举报上。设计稿把「恢复这一段」画在**历史行**上 ⇒ 这条路在冻结后端上不可能成功。
**裁决**：历史行的那枚按钮**保留可见但禁用**，并在其后给一句解释（「已裁决的举报不能改判；要恢复这一段，请就同一段新开一条举报」）。
理由：让评委"点下去弹红字"会读成坏掉；直接藏掉会读成"少画了"。禁用 + 解释是唯一既诚实又不显得坏的表达。
**遗留**：要真正支持"恢复已删段位"，需要后端加一条「撤销裁决／直接恢复某段」的路由（本轮禁改后端），或前端引导管理员就同一段新开举报再选恢复（零后端改动，但属产品决策）。

### 9.3 共享层两处碰撞（W1-d 截图发现，captain 认领）
| 现象 | 处置 |
| --- | --- |
| 右下角「演示导航」浮钮压住审核台页脚右侧的「待处理 3 · 历史 1」 | 触发器**移到右上角**（页脚在底部，右上与页脚不冲突） |
| 左下角全局状态条压住审核台页脚左侧那句 lead | 状态条**移到底部居中**、并且**只在该有状态时出现**（无状态时完全不渲染） |
两处都在 captain 独占的共享层（`demo-nav.js` / `dom.js`），不影响任何 W1 的 `page-*.js`。改完必须用 `tools/probe-fit.mjs` + 截图复验 11 页无碰撞。

### 9.4 另记两条
- `violations[]` **没有 `field` 字段**（后端只给 `code`/`message`）⇒ 字段级归位靠三层映射（`field` 若有优先 → 稳定码映射 → 422 文案里点名的字段名），集中在 `fieldKeyFor()`，W1-d 已实现并注释。
- W1-d 为造可验证数据**只改了库里的数据**（把测试账号设为 ADMIN、造举报与一条自洽的 MESSAGE 举报），并留了可重跑的复位脚本 `.tmp-w1d/reset-reports.sql`；未改任何代码 ✓ 允许。

---

## 10. W1-b 裁决（captain，2026-09-23）

### 10.1 端点映射补登（§7.3 漏了三处，实测用到）
| 端点 | 谁在用 | 用途 |
| --- | --- | --- |
| `GET /api/songs` | 瓶子详情 / 选歌 | 取**该段的曲库预设时长**（前端不许写死 20 秒） |
| `GET /api/segments/:id/audio` | 瓶子详情 | 试听（支持 Range） |
| `GET /api/bottles/:id` | 漂流日志 | 曲名 + `actorId → 匿名代号` 映射（`/events` 只给 actorId） |

### 10.2 裁决
| 事项 | 裁决 | 理由 |
| --- | --- | --- |
| 留言/举报**浮层**是运行时新增 DOM（冻结 HTML 里没有任何输入控件） | **批准** | 两个端点真实存在；不许新增浮层的话这两个功能只能退化成"点了报服务端错误"。浮层用的是 DESIGN.md 明文遮罩值 `rgba(water-void,.78)` + `z-index:300`，未自造视觉 |
| `Segment.note`（附言）从 `.cap` 行移到「试听与投票」说明行 | **批准** | 定稿 `.cap` 行是单行 `0:20 赞 N 踩 N`，放第 4 项会折行破版；信息没丢 |
| 日志刻号一律画在弧内侧（定稿里 #11 在弧外 15px） | **批准** | 真实条数可变，固定"最后一个在外侧"在 1 条时就会怪；统一内侧是更稳的规则 |
| `GET /events` 会带出 `VOTE_CAST`/`MESSAGE_ATTACHED`，而日志页文案写"只记核心操作" | **维持实现者的处理**：只刻 11 类漂流/斩浪事件，并在页面上按**实数**标注「另有 N 条段级互动（投票 / 留言）不进刻痕」 | 既不假装没这些事件，也不让刻痕被互动噪声淹没；**若将来产品要显示投票，需要有单独裁决** |

### 10.3 执行者报的两处**后端与契约不一致**（本轮禁改后端 ⇒ 记录待办）
1. `ACCEPTED_AUDIO_MIME_TYPES` 收了 `audio/wav` / `audio/ogg`，但 `app.ts` 只给 `audio/webm` / `audio/mp4` 注册了 body 解析器 ⇒ **传 wav 直接 400 `INVALID_BODY`**（不是业务错，是传输层拒收）。⇒ 要么补齐解析器，要么把 wav/ogg 从"可接受"名单里去掉（二选一，需后端裁决）。
2. 同上第 4 行的产品口径（`/events` 含互动事件 vs 页面文案"只记核心操作"）。

### 10.4 执行者自报的未覆盖分支（保留为残留风险）
`SEGMENT_CUT` / `BOTTLE_GAP_OPENED` / `BOTTLE_DAMAGED` / `BOTTLE_REWOUND`（需 10 次踩才触发斩浪）、`回传` / `入海` 的**持有者路径**、`放回`（持有者 origin=RETURN 时 422）—— 均已实现但**无 e2e 证据**。

### 10.5 需要收口的技术债（captain 派活）
| 债 | 现状 | 收口 |
| --- | --- | --- |
| **二进制上传通道重复** | `page-bottle.js` 在页内直接用了一次 `fetch`（因为 captain 的 `postAudio` 在它开工之后才出现）；`page-new.js` 也抄了一份 | 两页都改用共享层 `api.postAudio`（共享层已带 401 统一处理，页内自写 fetch 会绕过它） |
| **录音规则被抄成常量** | MIME 协商、`getUserMedia` 失败文案、预设时长倒数，这些规则在 `packages/shared/src/audio/recording.ts` 里是**纯函数**，但浏览器 import 不了 TS ⇒ 两页各抄一份 | 抽 `site/app/recorder.js`（共享层），两页共用；常量集中一处并注明"来源＝packages/shared/src/audio/recording.ts" |