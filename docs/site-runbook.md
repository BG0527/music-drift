# HTML 静态站运行手册（site/ + tools/site-server.mjs）

> 归属：W0 初版（2026-09-23）；W3 由 captain 在此之上补「登录→选歌→录音→投河→捞起→接唱→投票→回传入海→我的→公海」的完整走查脚本。
> 施工图与硬约束见 `docs/deploy-plan-html.md` §7；本文件只写**怎么起、怎么验、坏了怎么查**。

## 1. 拓扑（一句话）

```
浏览器 ──► http://localhost:5173 ─┬─ 静态：site/*.html + /app/*.js + /node_modules/**(本地字体)
                                  └─ 同源反代：/api/* 与 /healthz ──► http://127.0.0.1:8787（apps/api）
                                                                       └─► Postgres localhost:5433
```

**必须经 5173 访问**，不要直接开 `:8787`，也不要用 `file://`：

- 会话 cookie 是 `HttpOnly + SameSite=Lax`、后端**没有任何 CORS**（本轮不改后端）⇒ 只有同源（5173）才带得上 cookie；
- 页面里 4 行本地字体 `@import url('/node_modules/.pnpm/...')` 只有经这个服务器（它把 `/node_modules/*` 映射到仓库根）才解析得到，`file://` 下字体会静默回退。

端口：站点 `5173`（可 `--port=`）、API `8787`（可 `--api-port=`）、Postgres `5433`（docker-compose）。

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
#       seed ok: 3 songs / 12 segments
```

> 重复跑 `db:seed` 是幂等的（同一份演示数据）；要推倒重来：`docker compose down -v` 再走 2.1 → 2.3。

### 2.4 起 API（占一个终端，前台跑）

```powershell
pnpm --filter @music-drift/api dev
# 期望：$ tsx watch --env-file-if-exists=../../.env src/server.ts
#       {"level":30,...,"msg":"Server listening at http://127.0.0.1:8787"}
# 若出现 "[api] 未配置 DATABASE_URL：/api/auth/* ... 未挂载" ⇒ 回到 2.2
```

### 2.5 起站点（再占一个终端，前台跑）

```powershell
node tools/site-server.mjs --port=5173
# 期望：
#   站点在 http://localhost:5173
#     静态根目录：D:\Develop\projects\music\site
#     本地字体：/node_modules/* → D:\Develop\projects\music
#     同源反代：/api/* 与 /healthz → http://127.0.0.1:8787
```

浏览器打开 `http://localhost:5173/`（会 302 到 `/river.html`）。右下角有**默认收起**的「演示导航」按钮，展开可跳 11 页。

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

## 5. 共享层契约速查（W1 只看这一节）

共享层在 `site/app/`，**只有 captain 能改**；W1 各 agent 只改自己那一个 `page-<名>.js`。

| 文件 | 你能用的东西 | 说明 |
| --- | --- | --- |
| `api.js` | `get(path, opts)` / `post(path, body, opts)` / `del(path, opts)` / `request(method, path, opts)` / `ApiError` / `loginUrl()` / `redirectToLogin()` / `sanitizeNextPath()` / `currentPathWithSearch()` | 成功返回解析后的 JSON（204 → `null`）；失败**抛** `ApiError`。`opts`：`{ query, headers, signal, redirectOn401 }`。`err.status` / `err.code` / `err.violations` / `err.message`（中文文案）/ `err.isServiceDown` |
| `dom.js` | `q` `qa` `on` `show` `hide` `setVisible` `bind` `bindMany` `el` `toText` `ensureBaseStyles` `showState` `showLoading` `showEmpty` `showError` `showWaking` `clearState` `showRequestFailure` | **只用 textContent**；`bind('bottle.title', v)` 填所有 `[data-bind="bottle.title"]` 并返回命中数；`el(tag, {class,text,dataset,on,...}, children)` 是唯一建元素出口，不碰 `innerHTML` |
| `session.js` | `currentUser({refresh})` / `requireUser({redirect})` / `login(email,pwd)` / `register(handle,email,pwd)` / `logout()` / `cachedUser()` / `invalidateSession()` / `nextTarget(fallback)` | `currentUser()` 只给 user 或 `null`（401）；网络/5xx **抛** `ApiError`。`requireUser()` 未登录时自动跳 `/login.html?next=当前页` |
| `demo-nav.js` | `mountDemoNav()` / `DEMO_PAGES` | 幂等；`page.js` 已自动挂载，一般不用手动调 |
| `page.js` | `definePage({name, owner, endpoints, note, init})` | 注入样式 + 挂演示导航 + console 打本页端点 + `DOMContentLoaded` 后自动跑一次 `init()` |
| `assets/base.css` | `.demo-nav*` `.app-state*` 与 `[hidden]` | **只服务共享层**；设计稿的七色 token/字体/构图一律没动 |

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
```
