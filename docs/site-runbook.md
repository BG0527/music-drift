# HTML 静态站运行手册（site/ + tools/site-server.mjs）

> 归属：W0 初版（2026-09-23）；W3（2026-09-26）在此之上补：**演示账号种子**（`tools/seed-demo.mjs`）、
> **端到端走查**（`tools/walkthrough.mjs`）、**评委走查清单**、**两处可测性信号**（`site/app/page.js` 的 `pageReady`、
> `site/app/dom.js` 的 `stateNode/stateKind`）。
> W8（2026-09-27）把**段音频从合成容器换成真 WebM/Opus**：新增 `tools/record-fixture.mjs`（录 fixture）与
> `tools/verify-demo-audio.mjs`（试听真的出声的体检），修复口径见 §2.6.1 / §2.6.2 / §8。
> 施工图与硬约束见 `docs/deploy-plan-html.md` §7；本文件只写**怎么起、怎么验、坏了怎么查**。

## 1. 拓扑（一句话）

```
浏览器 ──► http://localhost:5173 ─┬─ 静态：site/*.html + /app/*.js + /node_modules/**(本地字体)
                                  └─ 同源反代：/api/* 与 /healthz ──► http://127.0.0.1:8788（apps/api）
                                                                       └─► Postgres localhost:5433
```

**必须经 5173 访问**，不要直接开 `:8788`，也不要用 `file://`：

- 会话 cookie 是 `HttpOnly + SameSite=Lax`、后端**没有任何 CORS**（本轮不改后端）⇒ 只有同源（5173）才带得上 cookie；
- 页面里 4 行本地字体 `@import url('/node_modules/.pnpm/...')` 只有经这个服务器（它把 `/node_modules/*` 映射到仓库根）才解析得到，`file://` 下字体会静默回退。

端口：站点 `5173`（可 `--port=`）、API `8788`（可 `--api-port=`；原端口回环被本机外部工具占用，用户裁决迁移）、Postgres `5433`（docker-compose）。

## 2. 一键起全栈（确切命令序列）

在仓库根 `D:\Develop\projects\music` 下**依次**执行；每个终端一行，`# 期望输出` 是判断标准。

### 2.1 起库

```powershell
docker compose up -d --wait
# 期望：容器 music-drift-postgres 起来且 healthy（`--wait` 会等到 healthcheck 通过）
docker ps --format "{{.Names}} {{.Status}} {{.Ports}}"
# 期望：music-drift-postgres  Up ... (healthy)  0.0.0.0:5433->5432/tcp
```

### 2.2 备环境变量（只做一次）

```powershell
Test-Path .env
# 期望：True；若 False：Copy-Item .env.example .env
# .env 里应有：DATABASE_URL=postgres://music_drift:music_drift_dev@localhost:5433/music_drift
```

### 2.3 迁移 + 造演示数据

```powershell
pnpm --filter @music-drift/api db:migrate
# 期望：$ tsx ... src/db/migrate.ts
#       migrations applied

pnpm --filter @music-drift/api db:seed
# 期望：$ tsx ... src/db/seed.ts
#       seed ok: 3 songs / 12 segments / admin=admin
```

> 重复跑 `db:seed` 是幂等的（同一份演示数据）；要推倒重来：`docker compose down -v` 再走 2.1 → 2.3。

### 2.4 起 API（占一个终端，前台跑）

```powershell
pnpm --filter @music-drift/api dev
# 期望：$ tsx watch --env-file-if-exists=../../.env src/server.ts
#       {"level":30,...,"msg":"Server listening at http://127.0.0.1:8788"}
# 若出现 "[api] 未配置 DATABASE_URL：/api/auth/* ... 未挂载" ⇒ 回到 2.2
```

### 2.5 起站点（再占一个终端，前台跑）

```powershell
node tools/site-server.mjs --port=5173
# 期望：
#   站点在 http://localhost:5173
#     静态根目录：D:\Develop\projects\music\site
#     本地字体：/node_modules/* → D:\Develop\projects\music
#     同源反代：/api/* 与 /healthz → http://127.0.0.1:8788
```

浏览器打开 `http://localhost:5173/`（会 302 到 `/river.html`）。右下角有**默认收起**的「站点导航」按钮，展开可跳 11 页。

### 2.6 造演示账号（W3；**评委进场前必须跑一次**）

```powershell
node tools/seed-demo.mjs
# 期望：
#   段音频：…\tools\fixtures\demo-segment.webm（321022 字节，真 WebM/Opus）
#   账号：demo（已存在）；陪练：driftmate1(existing)、driftmate2(existing)、driftmate3(existing)
#   音频自检：演示账号的 5 段全部是可解码的真 WebM/Opus
#
#   演示账号：demo / demo@example.com / SeaDrift2026
#     「我的」页内容：参与过 5 支（完整入海 4 · 河道/持有中 1） · 收藏 1 · 徽章 4 · 通知 4（未读 1）
#     本次没有新增任何数据（幂等：状态已满足）
```

- 它只走**公开 API**（施种路径不写 SQL），把「我的」页需要的三块内容补齐：参与过的瓶子（含"已入海完整"与"还在河道"各一支）、
  收藏、徽章、**未读通知**；口令就打印在上面的输出里（本手册 §7 也写了一份）。
- 上面的数字**以库里现状为准**（`参与过 N 支` 会随走查消费未读通知而增长：每消费掉一条未读，它就会补一支
  "完整入海"的作品；格式与字段不变）。
- **幂等**：再跑一次「本次没有新增任何数据」。
- 为什么需要陪练账号：一个瓶子要 4 段，而内核禁止同一人在同一瓶子里唱两次
  （`CANNOT_RECORD_TWICE_IN_BOTTLE`），所以"完整入海的作品"至少需要 4 个不同的人。
- 唯一会"长数据"的情况：**未读通知被走查消费掉之后**再跑（后端没有"标记未读"的端点）——
  那时它会再造一支"演示账号参与、最终完整入海"的瓶子来补回未读。连跑两次不会触发（状态已满足）。

#### 2.6.1 段音频是**真音频**（W8 起；评委点「试听」必须出声）

- 上传的段字节来自 **`tools/fixtures/demo-segment.webm`**：无头 Chromium 的**假麦克风 + 真 `MediaRecorder`**
  录的 **WebM/Opus**（20.0 秒墙钟，19.92 秒媒体时长，321022 字节，
  sha256 `13a301877bc4070caa84b73056d3a968388896ee49d2d280bbc73e8c872a9220`）。浏览器解码器打得开，
  `<audio>.currentTime` 会真的前进。
- **为什么不用"合成容器"**：W3 曾在 Node 里拼"EBML 魔数 `1A 45 DF A3` + 伪随机字节"——它能过服务端的
  容器嗅探与时长校验，但 Chromium 报 `DEMUXER_ERROR_COULD_NOT_OPEN: FFmpegDemuxer: open context failed`，
  也就是说**点评委点「试听」一片静音**。这条路已经删掉：fixture 缺失时 seed **直接报错**，不退回合成字节。
- fixture 是**二进制交付物**，随仓库走（不入 `.gitignore`；`.tmp-*` 才是临时产物）。重建/重录：
  ```powershell
  node tools/record-fixture.mjs            # 已存在则跳过（幂等）；--force 重录；--seconds=N 改时长
  ```
  它录完会**当场自证**（同一个页面里用 `<audio>` 播 1.2 秒，`currentTime` 必须前进、`error` 必须为空），
  自证不过就**不落地**。
- seed 末尾会对演示账号自己的每一段做**形态自检**（真 WebM 必有 DocType `webm` + CodecID `A_OPUS`）：
  发现旧合成段就报错，并把"换成真音频"的三步打在屏幕上（见 2.6.2）。

#### 2.6.2 库里遗留的合成段怎么清理（只清 seed 范围，可重跑）

W3 时代施进去的合成段（公海里那批作品 + 演示账号的瓶子）**不会自己变真**——公开 API 没有"替换段"端点，
所以要直接改数据（SQL，bytea 替换；**不删行、不动别人的探针数据**）：

```powershell
node tools/record-fixture.mjs                                                              # 1) 真音频
docker cp tools/fixtures/demo-segment.webm music-drift-postgres:/tmp/mdb-demo-segment.webm # 2) 送进库容器
node tools/seed-demo.mjs --print-repair-sql | docker exec -i music-drift-postgres psql -U music_drift -d music_drift -f -   # 3) 替换
# 期望：synthetic_segments = 0（第一次跑是 17）、UPDATE 17、COMMIT；**再跑一次必须 UPDATE 0（幂等）**
```

- 定位三重条件（缺一不可，写在 `repairSyntheticAudioSql()` 里）：① 瓶子由 seed 账号 `demo`/`driftmate1..3` 发起；
  ② 段字节数 ∈ {4096, 8192}（旧合成体的体量）；③ 字节里没有 DocType `webm`。
- 其它 agent 的探针段（`aamud*`/`ccmud*`/`smoke*`/`layoutmud*` 造的同类合成容器）**不在**这条 SQL 的范围里，
  按纪律不代改；需要一起清就把 `u.handle IN (…)` 放宽——那是**captain 的裁决**，不是随手改。
- 全库体检（可复跑，含 Chromium 真解码）：
  ```powershell
  node tools/verify-demo-audio.mjs          # 自己起站点服务器（5188）并在结束时杀掉
  # 期望结尾：结论：0 项不达标（他人探针段会以 WARN 列出，不是本次范围的缺陷）
  ```


### 2.7 一键端到端走查（W3）

```powershell
node tools/walkthrough.mjs            # 默认自己起站点服务器（--port=5188）；退出码 0 = 全部断言通过
# 期望结尾：
#   结论：0 项不达标
```

它按评委会走的顺序跑：预置演示账号 → 登录/注册 → 选歌 → 接唱（真 `MediaRecorder`，录满预设自动停）→
瓶子详情（试听 / 投票 / 留言）→ 三选一去向 → 河道捞取（换接棒账号）→ 接唱 → 真留言 → 漂流日志 →
公海 → 瓶子详情 → 我的（演示账号的收藏/徽章/通知都必须 > 0）→ 通知「标记已读」，每一步都打印 PASS/FAIL。
它会**留下两个探针账号**（`w3walk<时间戳>` / `w3relay<时间戳>`），清理口径见 §8。

## 3. 四条冒烟检查（复制即跑）

```powershell
# ① 静态站
curl.exe -s -o NUL -w "%{http_code}`n" http://127.0.0.1:5173/river.html
# 期望：200

# ② 同源反代通（API 起着才有 200）
curl.exe -s -i http://127.0.0.1:5173/healthz
# 期望：HTTP/1.1 200 OK + {"status":"ok","service":"api","contractVersion":"0.2.0-s1"}

# ③ 注册（自带 Set-Cookie；注意契约里注册是 201、登录是 200）
curl.exe -s -i -c .tmp-w0-cookies.txt -X POST http://127.0.0.1:5173/api/auth/register `
  -H "content-type: application/json" `
  -d '{"handle":"w0probe","email":"w0probe@example.com","password":"Bottle2026"}'
# 期望：HTTP/1.1 201 Created
#       set-cookie: mdb_session=...; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Expires=...
#       {"user":{"id":"...","handle":"w0probe","email":"w0probe@example.com","role":"USER"},"expiresAt":"..."}

# ④ 带 cookie 取会话
curl.exe -s -b .tmp-w0-cookies.txt http://127.0.0.1:5173/api/auth/me
# 期望：{"user":{...同上...},"expiresAt":"..."}   （不带 cookie 则是 401 UNAUTHENTICATED）

# ⑤ 登出 / 再登录（可选）
curl.exe -s -o NUL -w "%{http_code}`n" -b .tmp-w0-cookies.txt -c .tmp-w0-cookies.txt -X POST http://127.0.0.1:5173/api/auth/logout
# 期望：204
curl.exe -s -i -c .tmp-w0-cookies.txt -X POST http://127.0.0.1:5173/api/auth/login `
  -H "content-type: application/json" -d '{"email":"w0probe@example.com","password":"Bottle2026"}' | Select-Object -First 4
# 期望：HTTP/1.1 200 OK + set-cookie: mdb_session=...
```

`.tmp-w0-cookies.txt` 已被 `.gitignore` 的 `.tmp-*` 覆盖，不入库；验完删掉即可。

口令规则（`apps/api/src/auth/passwordPolicy.ts`）：**≥8 位且同时含字母和数字**，且不能包含用户名/邮箱片段；否则 422 `WEAK_PASSWORD`。

## 4. 常见错与处置

| 症状 | 原因 | 处置 |
| --- | --- | --- |
| `curl` 返回 `000` / `ECONNREFUSED`，站点打不开 | 站点服务器没起 | 起 2.5；确认没别的东西占 5173（`Get-NetTCPConnection -State Listen -LocalPort 5173`） |
| 页面能开但字体变回系统衬线 | 请求没走 `site-server`（例如 `file://` 或别的静态服务器） | 一律经 `http://localhost:5173/` |
| `/healthz` 经反代返回 **503** + `x-site-upstream: down`，body 里写着"后端 API 未启动" | API 没起或崩了 | 起 2.4；看 API 终端日志 |
| API 日志：`未配置 DATABASE_URL：/api/auth/* 与 /api/segments/:id/audio 未挂载` | `.env` 缺失/没有 `DATABASE_URL` | `Copy-Item .env.example .env`（2.2），重启 API |
| `db:migrate` / `db:seed` 报连不上 `localhost:5433` | 库没起，或 5433 被别的 Postgres 占 | `docker compose up -d --wait`；`docker ps` 看 healthy；`Test-NetConnection 127.0.0.1 -Port 5433` |
| `db:seed` 报唯一键冲突 | 库里已有同批演示数据 | 正常幂等应不报；若报错：`docker compose down -v` 后重跑 2.1→2.3 |
| 注册返回 **409** `EMAIL_TAKEN` / `HANDLE_TAKEN` | 该 handle/邮箱已注册 | 换一个（或用 ⑤ 的登录） |
| 注册返回 **422** `WEAK_PASSWORD` | 口令不含字母+数字或 <8 位 | 换 `Bottle2026` 这类 |
| 登录"成功"但下一页又变未登录 | 静态页与 API 不同源（分别开了两个端口/域名） | 只从 5173 进；不要改后端 `SameSite`（本轮禁改后端） |
| `[site] 端口 5173 已被占用` | 上一次的服务器还在跑 | `node tools/site-server.mjs --port=5174` 或先杀占用进程 |
| 录音按钮点了没反应 | `getUserMedia` 只在 `https://` 或 `localhost` 可用 | 用 `http://localhost:5173`（不要用局域网 IP） |
| 首页空白十几秒 | 后端冷启动（免费容器休眠） | 前端应显示"正在唤醒服务"（`showWaking()`）；本地一般不会有 |
| `seed-demo` 报「账号 demo 已存在但登录失败」 | 该账号的口令被改过（或不是本脚本建的） | 按报错里给的 SQL 删掉它再跑；或换 handle/email |
| `seed-demo` 报「曲库里没有已切分的曲目」 | 没跑 `db:seed`（或占位曲被清） | 跑 2.3 的 `pnpm --filter @music-drift/api db:seed` |
| `seed-demo` 报连不上 / `fetch failed` | API 没起（它默认打 `http://127.0.0.1:8788`） | 起 2.4；或 `--base=http://127.0.0.1:5173`（经站点同源反代） |
| `walkthrough` 报「找不到 playwright（npx 缓存里没有）」 | 本机从没跑过 playwright | 跑一次 `npx playwright --version` 让它落到 `_npx` 缓存（**不要**装成项目依赖） |
| `walkthrough` 报「站点服务器没起来」/ 端口占用 | 5188 被别的进程占着 | 换端口 `--port=5189`（它会自己起服务器；已在跑则复用） |
| `walkthrough` 打出 `WARN 录音降级为（旧）合成容器` | 该环境给不出假麦克风/`MediaRecorder` | W8 起这条"降级"上传的是**内置真音频 fixture**（不再有哑音频）；文案里的"合成容器"是 W7 待改的旧措辞 |
| `seed-demo` 报「找不到段音频 fixture」/「不是可解码的 WebM/Opus」 | `tools/fixtures/demo-segment.webm` 缺失或被换成了假音频 | `node tools/record-fixture.mjs`（或 `--force` 重录）；详见 §2.6.1 |
| `seed-demo` 报「演示账号的 N/M 段不是可解码音频」 | 库里还留着 W3 时代的合成段 | 按 §2.6.2 的三步替换（幂等，可重跑） |
| `verify-demo-audio` 报 `DEMUXER_ERROR_COULD_NOT_OPEN` / `currentTime 0 → 0` | 该段是合成容器（或 fixture 被换成了假音频） | 先修数据（§2.6.2），再确认 fixture 的 sha256 与 §2.6.1 一致 |
| `verify-demo-audio` 的 `WARN 不在本次修复范围…` | 别的探针账号造的合成段（`aamud*`/`ccmud*` 等） | **不是本次范围的缺陷**；要一起清走 captain 裁决（放宽 §2.6.2 的 handle 白名单） |
| `walkthrough` 的「我的」断言未读=0 | 上一次走查把未读消费掉了 | 正常：先跑 `node tools/seed-demo.mjs`（会自动补一支完整入海的作品造出未读） |
| `probe-fit` 偶发 `✗ … 没有 #fit-stage` | **采样竞态**：`/me.html`、`/admin.html` 未登录会跳登录页，350ms 那一刻可能正好落在"新文档已建、脚本还没跑"的窗口里 | 不是内容被裁（同一轮里 `被裁内容` 恒为 0）；重跑一次即可。判据是 `被裁内容=0` |

## 5. 共享层契约速查（W1 只看这一节）

共享层在 `site/app/`，**只有 captain 能改**；W1 各 agent 只改自己那一个 `page-<名>.js`。

| 文件 | 你能用的东西 | 说明 |
| --- | --- | --- |
| `api.js` | `get(path, opts)` / `post(path, body, opts)` / `del(path, opts)` / `request(method, path, opts)` / `ApiError` / `loginUrl()` / `redirectToLogin()` / `sanitizeNextPath()` / `currentPathWithSearch()` | 成功返回解析后的 JSON（204 → `null`）；失败**抛** `ApiError`。`opts`：`{ query, headers, signal, redirectOn401 }`。`err.status` / `err.code` / `err.violations` / `err.message`（中文文案）/ `err.isServiceDown` |
| `dom.js` | `q` `qa` `on` `show` `hide` `setVisible` `bind` `bindMany` `el` `toText` `ensureBaseStyles` `showState` `showLoading` `showEmpty` `showError` `showWaking` `clearState` `showRequestFailure` **`stateNode` `stateKind`** | **只用 textContent**；`bind('bottle.title', v)` 填所有 `[data-bind="bottle.title"]` 并返回命中数；`el(tag, {class,text,dataset,on,...}, children)` 是唯一建元素出口，不碰 `innerHTML`。**`stateNode({target})` / `stateKind({target})`（W3 新增，只加不减）**＝状态条的可测性查询口：返回此刻在 DOM 里的状态节点 / 状态名（`loading`｜`empty`｜`error`｜`waking`），没有状态时 `null`。为什么需要它：全局状态条在非错误态会按 `STATE_AUTO_HIDE_MS` 淡出并**从 DOM 移除**，测试用选择器去抓必然抢跑或扑空 |
| `session.js` | `currentUser({refresh})` / `requireUser({redirect})` / `login(email,pwd)` / `register(handle,email,pwd)` / `logout()` / `cachedUser()` / `invalidateSession()` / `nextTarget(fallback)` | `currentUser()` 只给 user 或 `null`（401）；网络/5xx **抛** `ApiError`。`requireUser()` 未登录时自动跳 `/login.html?next=当前页` |
| `top-nav.js` | `mountDemoNav()` / `TOP_NAV` | 幂等；`page.js` 已自动挂载，一般不用手动调 |
| `page.js` | `definePage({name, owner, endpoints, note, init})` | 注入样式 + 挂站点导航 + console 打本页端点 + `DOMContentLoaded` 后自动跑一次 `init()`。**接线完成信号（W3 新增）**：`init()` 全部 await 完之后写 `document.documentElement.dataset.pageReady = name` 与 `window.__pageReady = name`；`init()` 抛错则写 `dataset.pageError = name` 且**不**置 ready（原来的未捕获 rejection 语义不变） |
| `assets/base.css` | `.top-nav*` `.app-state*` 与 `[hidden]` | **只服务共享层**；设计稿的七色 token/字体/构图一律没动 |

典型页面写法（W1）：

```js
import { get } from './api.js';
import { bind, bindMany, el, q, showEmpty, showError, showRequestFailure, showLoading, clearState } from './dom.js';
import { definePage } from './page.js';

async function render() {
  showLoading('正在加载公海…');
  try {
    const page = await get('/api/sea', { query: { limit: 20 } });
    if (page.items.length === 0) { showEmpty('公海还没有作品。'); return; }
    clearState();
    bindMany({ 'sea.count': page.items.length });
    const list = q('#sea-list');
    for (const item of page.items) list.append(el('li', { text: item.title }));
  } catch (error) {
    showRequestFailure(error, { onRetry: render });   // 冷启动 → 正在唤醒；其余 → 出错
  }
}

export const { init } = definePage({ name: 'sea', owner: 'W1-c', endpoints: ['GET /api/sea'], init: render });
```

数据挂点约定：在 HTML 里给文本节点加 `data-bind="<页名>.<字段>"`（字段名**以 `packages/shared/src/contracts/*.ts` 为准**）；每页只能新增 `<meta name="viewport">`、那一个 `<script type="module">` 与 `data-bind`——**不得改动既有构图与视觉值**。

## 6. 收工检查

```powershell
git status --porcelain -- site tools/site-server.mjs docs/site-runbook.md   # 只应看到你负责的路径
node --check tools/site-server.mjs                                          # 语法自检
node --check tools/seed-demo.mjs                                            # W3
node --check tools/walkthrough.mjs                                          # W3
node --check tools/record-fixture.mjs                                       # W8（录真音频 fixture）
node --check tools/verify-demo-audio.mjs                                    # W8（演示音频体检）
node tools/record-fixture.mjs                                               # W8：确认真音频 fixture 在位（幂等）
node tools/verify-demo-audio.mjs                                            # W8：试听真的出声（自己起/收站点服务器）
node tools/site-guard.mjs                                                   # 静态站守卫（期望「✓ 全部通过」）
node tools/probe-fit.mjs                                                    # 一屏适配（先起一个站点服务器；期望「被裁内容=0」）
```

## 7. 评委走查清单（W3）

**先用哪个账号**：`demo` / `demo@example.com` / `SeaDrift2026`（由 `node tools/seed-demo.mjs` 造出来）。
它是**普通用户**（不是管理员）；它名下已经有一支"完整入海"的作品、一支"还在河道"的瓶子、1 件收藏、≥1 枚徽章、≥1 条未读通知。

进场前提：§2 的 2.1 → 2.5 都起来了，且 2.6 跑过一次。

> **站点重构进行中（W8 记录，2026-09-27 00:19 实测）**：`site/bottle.html` 已被删（作品详情并入
> `/bottle.html?id=…`），但 `site/app/page-me.js`（收藏/作品两行的跳转）与 `site/app/top-nav.js`（「公海详情」）
> 仍指向 `/bottle.html` ⇒ 这两条入口现在会落到 404 页；`tools/probe-fit.mjs` 的 `PAGES` 也还含
> `sea-detail`（会报"没有就绪信号"）。同刻 `tools/site-guard.mjs` 报 `site/app/page-login.js 含 emoji`，
> 且登录页把「账号」当 handle 提交 ⇒ `probe-fit`/`walkthrough` 用邮箱登录会收到 401 `INVALID_CREDENTIALS`
> （API 直连邮箱登录是 200）。**这些都不在 W8（段音频）范围**，归对应 owner 修。

| # | 怎么走 | 应该看到什么（判据） |
| --- | --- | --- |
| 0 | 浏览器打开 `http://localhost:5173/` | 自动到 `/river.html`；右下角（站点导航展开前）没有多余浮层 |
| 1 | 点右上角「站点导航」→「登录 / 注册」 | 登录页；**注册** tab 三项（账号/用户名/密码）、**登录** tab 两项 |
| 2 | 切到「登录」，填 `demo@example.com` + `SeaDrift2026`，点「登录并进入」 | 进河道页；登录页底部那句话变成"你已经登录为「demo」" |
| 3 | 「站点导航」→「我的漂流瓶」（`/me.html`） | **三块都不是空态**：<br>· 我参与过的漂流瓶 **≥2 格**（至少一格写"已入海 · 完整作品"、至少一格写"漂流中"或"已被接住"）<br>· 消息区 **≥1 条**，其中至少一条带「**未读**」小标与「标记已读」<br>· 我的收藏 **≥1 行**（可点「听《…》」）、我的徽章 **≥1 行**（"漂流参与者"） |
| 4 | 在「我的」点那条**未读**通知右边的「标记已读」 | **不跳页**：该条的「未读」小标消失、时间戳变成"已读 YYYY/M/D HH:MM"；刷新页面后仍是已读 |
| 5 | 点收藏那行的「听《…》」→ `/bottle.html` | 曲名、A1–A4 段链、`收藏` 是「已收藏」态；底部可试听 |
| 6 | 站点导航 →「公海」（`/sea.html`） | 已完成区有作品（卡片有曲名、"已录 4 / 4 段"、「听这支作品」） |
| 7 | 站点导航 →「河道」（`/river.html`）→ 点中间的「撒网」 | 若河道里有瓶子：跳到 `/bottle.html?id=…` 且"瓶塞 · 有人持有"；若空河道：给出服务端文案的空态（不是红字错误） |
| 8 | 任意瓶子页：点瓶身上的「听」、点赞/点踩、`私密留言`、`继续投河`/`回传`/`入海`、左上角`回河道`、`看这只瓶子的漂流日志` | 每个动作都有即时反馈（状态条/就地文案），不出现"点了没反应" |
| 9 | 站点导航 →「设置」「审核台」「404」 | 设置页显示真账号与版本；审核台按角色显示（demo 是普通用户，处理按钮应禁用/不可用）；404 页正常 |
| 10 | 想自己完整跑一遍（不用手点） | `node tools/walkthrough.mjs` → 结尾 `结论：0 项不达标` |

**退出登录**：设置页的「退出登录」；之后回到 `http://localhost:5173/` 会以未登录身份进河道（会被引导去登录页）。

## 8. 演示账号与探针数据的清理口径（W3）

`node tools/seed-demo.mjs` 造的**是交付物**（评委要用），不要删：

| 账号 | 用途 | 口令 |
| --- | --- | --- |
| `demo` / `demo@example.com` | **评委用这个登录** | `SeaDrift2026` |
| `driftmate1/2/3` / `driftmateN@example.com` | 陪练：一支 4 段的作品需要 4 个不同的人 | `SeaDrift2026` |

**W8 的口径**（段音频）：库里**只清 seed 范围的合成段**（`demo`/`driftmate*` 名下的 17 段，见 §2.6.2），
**不删任何行、不删任何瓶子**——只把 `bottle_segments.audio` 的 bytea 换成真 fixture；`demo` 与它的演示数据照旧保留。
别的 agent 的探针账号（`aamud*`/`ccmud*`/`smoke*`/`layoutmud*`/`w3walk*`…）名下的合成段**一律不动**
（即使它们是公海里的哑作品）——那需要 captain 裁决后放宽 §2.6.2 的 handle 白名单。

`node tools/walkthrough.mjs` 每次跑会**临时造**两个账号（`w3walk<时间戳>` / `w3relay<时间戳>`）与它们经手的两支瓶子。
它们是探针数据，随时可以清（**只删这两类，别动 `demo`/`driftmate*`**）：

```powershell
# 先看一眼要删谁
docker exec music-drift-postgres psql -U music_drift -d music_drift -c "select handle from users where handle like 'w3walk%' or handle like 'w3relay%'"
# 删账号（瓶子/段/票/留言等随外键级联；先删瓶子更稳）
docker exec music-drift-postgres psql -U music_drift -d music_drift -c "delete from bottles where initiator_id in (select id from users where handle like 'w3walk%' or handle like 'w3relay%')"
docker exec music-drift-postgres psql -U music_drift -d music_drift -c "delete from users where handle like 'w3walk%' or handle like 'w3relay%'"
```

> 口径：**走查自己造的数据自己清**（W1-c 的教训：多个 agent 并发写同一个演示库，公海/河道的条数与首项会随时间变化 ⇒
> 任何"条数/首项"的断言都必须是同刻快照）。`seed-demo` 的陪练账号与 `demo` 的瓶子**不清**（它们是演示内容本身）。
>
> **W3 交工时的实际残留（如实记录）**：两个 `w3walk*` 账号与它们的两支瓶子已删干净；
> 两个 `w3relay*` 账号**留着了** —— 它们的痕迹落在两支**共享测试瓶**上（`w1bmain` 的 `8211cc64…`、`d0d4634b…`），
> 而那两支瓶子上有 12 行属于别的 agent（`w1bthree`/`w4a3`）的 `holdings` 记录把 `parent_id` 指向我的接棒账号，
> 且 `w4a3` 当时仍在用它们探针 ⇒ 删账号就要改别人的行（且会被持续阻塞）。口径：**不代改别人的行**，
> 残留就是"两个账号 + 在某支共享瓶里多一段"。要收干净，等那两支瓶子不再被使用后跑：
> `delete from events where actor_id in (select id::text from users where handle like 'w3relay%');`
> `delete from bottle_segments where owner_id in (select id from users where handle like 'w3relay%');`
> `delete from votes where user_id in (...); delete from messages where from_user_id in (...);`
> `delete from listen_progress where user_id in (...); delete from holdings where holder_id in (...);`
> `update holdings set parent_id = null where released_at is not null and parent_id in (...);`
> 之后才能 `delete from users where handle like 'w3relay%'`。

> 另外：`probe-fit` 偶发 `✗ … 没有 #fit-stage` 是**采样竞态**（未登录的 `/me.html`、`/admin.html` 会跳登录页，
> 350ms 那一刻可能正好落在"新文档已建、脚本还没跑"的窗口里）——**不是内容被裁**；判据看 `被裁内容=0`。
