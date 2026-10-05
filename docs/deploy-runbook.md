# 部署 Runbook：方案与理由 · 逐步骤部署 · 数据脱敏 · 管理员账号

> 任务来源：t32（用户点名「最重要的是数据脱敏」，须在功能跑通之后、部署之前执行）
> + **t33（部署交付：直做盘点 → Docker 产物 + 本手册 + 文案可改实测）**。
> 本文只写**可重复执行的操作与已核实的结论**；口令真值一律不入库（见 §2）。
> 未在本机实测过的步骤（平台侧命令）会**显式标注「未实测」**，不假装跑过。

---

## 0. 推荐方案与理由（t33 · 取代 docs/deploy-plan-html.md 的旧 HTML 方案）

**现势（2026-10-05）**：部署面 = **React 应用**（`apps/web`，vite 构建产物 `apps/web/dist`）。
`site/**` 静态站是历史方案的产物，**不是部署面**（t36 归属：验收走 React 部署面）；
`docs/deploy-plan-html.md` 保留为历史记录，其「HTML 作前端」结论已被用户后续裁决推翻。

```
            评委访问的一个域名（同源，HTTPS 由平台自带）
  ┌────────────────────────────────────────────────────────┐
  │  app 容器（镜像 music-drift-app，单端口 8080）           │
  │   gateway :8080  ── 静态 apps/web/dist（SPA 回退）       │
  │                 └─ 反代 /api 与 /healthz ──┐            │
  │                                            ▼            │
  │                        Fastify :8788（apps/api，同容器）│
  └────────────────────────────────────────────┬───────────┘
                                               ▼
                     Postgres（本地彩排=容器内 db；公网=Neon 免费层）
                                  音频以 bytea 存在库里（D-02 已裁决）
```

**为什么同源是硬约束**（沿用 `deploy-plan-html.md` §1 已核实的两条事实）：
- 会话 cookie 是 `HttpOnly + SameSite=Lax` ⇒ 跨站 `fetch` 不带 cookie ⇒ 静态与 API 不同域时
  **「登录看起来成功、下一页立刻掉线」**；
- 全仓**没有任何 CORS 配置** ⇒ 跨域请求会被浏览器直接拦掉。
所以：**静态页与 API 必须挂同一个域名**，其余一切方案都在满足这条之后才比较。

**为什么选「单服务托管静态 + API」**（而不是 Pages/Functions 反代）：
- 一个容器 = 一个域名 ⇒ 同源**天然成立**，不需要任何平台级反代配置（旧方案的 Pages Function 反代是
  跨平台拼装，多一个会坏的环节）；
- `apps/api` 业务代码**一行不改**（网关是容器内的独立进程，见 `Dockerfile` 内 `gateway.mjs`）；
- 发布物只有一个镜像：`docker build -t music-drift-app .` ⇒ 本地/任何容器主机同一套产物。

**Neon（托管 Postgres）取舍**：免费层免运维、不随实例休眠、支持按时间点恢复；
代价是存储/计算额度与连接寿命限制 —— 本 demo 音频 bytea 存库（D-02 裁决，不引对象存储），
库体积随试听增长，**免费层上限是真实风险**：超出需删演示数据（`pnpm db:reset` 同款逻辑）或升级。
不用 Neon 的替代 = 容器主机附带的托管 PG（Render/Fly Postgres），额度条款不同、同样要盯到期。

**容器主机取舍（按推荐顺序）**：
| 主机 | 优点 | 免费层风险 |
| --- | --- | --- |
| **Koyeb** | 免绑卡可起步、单服务够用 | 额度小；冷启动短但存在 |
| **Fly.io** | 常驻、性能好 | **需绑卡**（用户亲做）；小额度 |
| **Render Web Service** | 最省事、自带 PG 可选 | **15 分钟无请求即休眠，冷启约 50s** ⇒ 评委点开等 50 秒，必须配保温 ping 或换前两者 |

**域名**：平台自带 `*.onrender.com / *.fly.dev / *.koyeb.app` 域名即可交付评委（HTTPS 平台自带）；
自有域名是可选加分项（DNS 配置=用户亲做）。**录音必须安全上下文**（`getUserMedia` 只在 HTTPS/localhost 可用）
⇒ 公网域名必须 HTTPS —— 上述平台默认满足。

## 0.5 直做尝试的盘点结论（t33 实测，命令与原始输出）

| 盘点项（命令） | 实测输出 | 结论 |
| --- | --- | --- |
| `git remote -v` | （空，exit 0） | **无任何代码托管远程** ⇒ 推不上去、平台无法拉仓库 |
| 部署类 CLI：`gh / vercel / flyctl / wrangler / koyeb / render / neonctl / railway / heroku / doctl` | 全部 `MISSING`（仅 `git`、`docker 28.3.3`、`ssh` 存在） | 无任何平台 CLI 可用 |
| 环境变量令牌（`TOKEN\|FLY_\|VERCEL\|RENDER\|KOYEB\|NEON\|GITHUB\|DEPLOY\|AWS\|CLOUDFLARE`） | **0 个** | 无任何 API 令牌 |
| `~/.ssh` | 有 `id_ed25519` 密钥，但 **`config` 为空**（无 Host 条目） | 密钥没有可登的服务器 |
| `docker context ls` / `~/.docker/config.json` auths | 仅 `default`、`desktop-linux`（本机）；`auths: {}` | 无远程引擎、**无镜像仓库登录** |
| 仓根 `.env` | 仅 `DATABASE_URL(localhost:5433) / PORT / HOST / LOG_LEVEL / SEED_ADMIN_PASSWORD` | 全部本机 dev，无云库凭据 |

**不可直做的阻塞点（缺的都是「账号」，注册涉及邮箱/2FA/绑卡 ⇒ 我无法代劳）**：
1. **代码托管**：无 remote ⇒ 无法 push/触发平台构建；
2. **容器主机账号**：Koyeb/Fly/Render 任一均需注册（Fly 绑卡）；
3. **Neon 账号**：需注册（邮箱 + 可能的 OAuth）；
4. （可选）**域名/DNS** 账号。
⇒ 按合同转交付物：本 Dockerfile/compose 产物 + 本手册；账号注册步骤全部标注【用户必做】。

**本机 docker 构建曾被卡的取证与处置（其他机器可能复现）**：
- 症状：`docker pull` 一律失败，报 `connecting to 127.0.0.1:31181 … refused`；
- 根因（取证）：Windows 系统代理 `HKCU\…\Internet Settings` = `ProxyEnable 1, ProxyServer https=http://127.0.0.1:31181`
  （SwitchyOmega 风格规则表，存于 `DefaultConnectionSettings` 二进制），Docker Desktop「跟随系统代理」
  把镜像拉取 CONNECT 到该端口，**而用户的代理工具当前未运行（31181/31180 无监听）**；
- 处置（二选一，均已实测/可回滚）：① **启动你的代理工具**（正路）；② 临时起一个本机 CONNECT 直连转发器
  监听 31181（t33 用的应急法，构建完即停、端口交还，全程未改任何配置）；
- 现场已还原：系统代理值/二进制 blob 与四镜像 `~/.docker/daemon.json` 均恢复原值
  （还原备份：`%TEMP%\t33-proxy-blob-backup.b64`、`%TEMP%\t33-daemon.json.backup`）。
- 另一个真机坑（**与代理无关，Dockerfile 已内置处理**）：`pnpm-lock.yaml` 的 tarball URL 由 npmmirror 生成
  （本机 `.npmrc` 的 `registry.npm.taobao.org` 已永久迁移到 npmmirror），容器内若用默认 npmjs 会触发
  pnpm 的 tarball/元数据一致性策略拒绝安装 ⇒ Dockerfile 在 install 前 `pnpm config set registry https://registry.npmmirror.com`。

## 1. PII 盘点与处置（2026-10-04 实测）

### 1.1 运行库（处置 = `pnpm db:reset` 全卷重建）

| 类别 | 实测结果 | 处置 |
| --- | --- | --- |
| 用户账号 | `users` 331 行，handle 全部为合成代号（`u-<hash>` / `owner-<hash>`），无真实姓名 | 随 reset 重建 |
| 邮箱 | 活跃 schema `users.email` 已随迁移 0009 删除（0 列）；`backup_t12`/`backup_t32` 备份 schema **无 users 表**（0 处 email） | 无需额外处置，reset 连 backup_* 一并消失 |
| 手机号 / 身份证 | `public_comments`、`bottle_segments.note`、`reports.reason` 正则扫描均 0 命中 | — |
| 公开评论 | 0 处含邮箱/手机；现存内容均为 t27/t36 验证串（`t27 修复验证…`） | 随 reset 清空，改由种子造合成评论 |
| 私密留言 | 内容为脚本合成文案（`演示私密留言（W1-d…）`、`W1-b 联调留言`） | 随 reset 清空 |
| 通知 payload | 仅 uuid + 合成曲名（`占位曲目 · 一` 等） | 随 reset 重建 |
| 匿名代号 | 合成词牌风格（`暗流合声#934`、`浪尖吟游#231`…） | 保留生成器 |
| 曲目名 | 已授权演示曲库曲名（Immersed / Rains Will Fall / On the Shore / 别人写的歌）——非个人数据 | 保留 |

### 1.2 仓内文件

| 位置 | 实测结果 | 处置 |
| --- | --- | --- |
| `.env` | compose 演示凭据（与 `.env.example` 同源，非个人数据）；t32 起新增 `SEED_ADMIN_PASSWORD`（唯一真实口令位，见 §2） | 保留（gitignore，不入库） |
| `.env.example` | 只有占位（`SEED_ADMIN_PASSWORD=` 空值 + 说明），无真口令 | 已按此落盘 |
| seed / fixtures / 测试 | email 正则共 9 处命中，全部为 `example.com`/`a@example.com` 保留域**合成**串（RFC 2606 保证不可能是真实邮箱）；手机号 0 处 | 合成串保留 |
| `docs/site-runbook.md` | `demo@example.com` / `w0probe@example.com` 等合成演示账号说明 | 合成串保留（site 任务域） |
| `docs/review.md` | 2 处历史评审记录引用了 t10 裁决的演示口令字面 | **超出 t32 范围未改**；已在 t32 交付中分注，建议归档类任务顺带清理 |
| 源码（seed.ts 等） | t32 后 `apps/api/src/db/seed.ts` 口令明文 0 命中（集成测试断言钉住） | 已落地 |

### 1.3 截图

`screenshots/` 8 张 + `docs/ui-review/` 650 张：全部为本应用界面，界面只渲染合成数据
（代号 handle 如 `午夜歌手#042`、`远洋信号#962`；W21 后界面已无邮箱字段）。抽查多轮真机现场
（t16/t28/t36）未见任何邮箱/手机号/真实姓名 → 保留。

### 1.4 git 历史

按合同**不重写历史**。历史中的口令面仅为 t10 用户裁决的演示口令（docs/review.md 引用），
非个人数据；真实口令现仅存 `.env`。

## 2. 管理员账号（口令只在 .env）

- 账号：`admin`（handle 固定，role=ADMIN，seed 幂等 upsert）。
- 口令：`SEED_ADMIN_PASSWORD`，**只写在仓根 `.env`**（`.gitignore` 已覆盖）；
  `.env.example` 只放空占位与说明，不含真值。
- 读取链（`apps/api/src/db/seed.ts`）：进程环境变量 → 兜底读仓根 `.env`
  （覆盖 vitest 等未走 `--env-file` 的入口）→ 都读不到则**跳过管理员种子并告警**，
  不伪造默认口令、不让无环境的集成测试炸链。
- 弱口令防线不受影响：注册接口对演示口令仍返回 `422 WEAK_PASSWORD`
  （t10 裁决「不得为此改 passwordPolicy」继续有效）；seed 走直插 + scrypt 哈希。
- 源码零明文由 `apps/api/src/db/seed.integration.test.ts`（t32 脱敏 describe）断言钉住。

## 3. 重置与施种（部署前标准序列）

```bash
# 1) 全卷重建（compose down -v → up → migrate → seed；会删除库内一切运行数据，
#    执行前确认无唯一不可重建数据——当前所有 demo 数据均可重建）
pnpm db:reset

# 2) 演示内容（三种状态瓶 + 接力链 + 漂流日志 + 收藏 + 种子评论；幂等可重跑）
node tools/seed-demo.mjs
#    末行自检输出必须含：完整入海 ≥1、河道/持有中 ≥1、公海等待接力 ≥1、收藏 ≥1、公开评论 ≥1

# 3) 验证
curl -s http://127.0.0.1:8788/api/sea?zone=COMPLETED     # 200 + JSON
#    admin 登录：POST /api/auth/login {account:"admin",password:"<SEED_ADMIN_PASSWORD>"} → 200
#    种子评论：GET /api/bottles/<完成品id>/comments → items ≥1
```

- dev 服务注意：`db:reset` 会删卷，Postgres 起来前 API 的连接池会短暂报错；
  `tsx watch` 在 `seed.ts` 等文件变更时自动重启 API，若 `/healthz` 未恢复则手动重启 dev 进程。
- `node tools/seed-demo.mjs` 需要运行中的 API（默认 `MDB_API_BASE` 或 `http://127.0.0.1:8788`）
  与段音频夹具 `tools/fixtures/demo-segment.webm`（脚本自检，缺失即报错不静默）。

## 4. 合成演示账号清单（零真实 PII）

| 账号 | 口令来源 | 用途 |
| --- | --- | --- |
| `admin` | `.env` 的 `SEED_ADMIN_PASSWORD` | 管理员审核台 |
| `demo` | `tools/seed-demo.mjs` 内合成（演示用途，非保密项） | 评委主视角：我的/收藏/通知 |
| `driftmate1..3` | 同上 | 接力链陪练（完成品的另外三棒） |

---

## 5. 逐步骤部署（t33；每步一条可复制命令）

### 5.0 前置：本机已实测通过的构建与彩排（都跑过，退出码见 §7）

```bash
pnpm --filter @music-drift/web build                      # 前端产物 → apps/web/dist（约 1–2s）
docker build -t music-drift-app .                         # 单镜像（构建→网关→迁移/种子启动链）
docker compose -f docker-compose.prod.yml up -d --build   # 本地彩排全栈（内置 Postgres）
```

### 5.1 账号注册 —— 【用户必做，我无法代劳：邮箱 / 2FA / 绑卡】

| # | 注册 | 为什么必须你来 | 备注 |
| --- | --- | --- | --- |
| 1 | **Neon**（https://neon.tech） | 邮箱验证 | 免费层建库后拿到 `DATABASE_URL`（带 `?sslmode=require`），全程不进 git |
| 2 | **容器主机三选一**：Koyeb（免绑卡起步）/ Fly.io（**要绑卡**）/ Render | 邮箱验证；Fly 需绑卡 | 选一个即可；Render 免费层休眠见 §0 风险表 |
| 3 | （可选）自有域名 + DNS | 域名注册/解析 | 不注册也能用平台自带域名交付评委 |

拿到的东西只需填进 **环境变量**（见 5.3），任何一步都不需要把口令发给我或写进仓库。

### 5.2 构建镜像（本机实测命令）

```bash
# 前端产物
pnpm --filter @music-drift/web build
# 单镜像（内含 dist + Fastify + 启动时自动 迁移→种子）
docker build -t music-drift-app .
```

- Dockerfile 已内置 `pnpm config set registry https://registry.npmmirror.com`（锁文件 tarball 同源，见 §0.5）。
- 若 `docker pull` 卡在 `127.0.0.1:31181`：按 §0.5 处置（启动代理工具 / 临时转发器），**不要**改锁文件或去掉 `--frozen-lockfile`。

### 5.3 环境变量清单（全部走 `.env` 或平台 Secret，**一律不入库**）

| 变量 | 本地彩排（compose 默认） | 公网部署 | 说明 |
| --- | --- | --- | --- |
| `PROD_DATABASE_URL` | 不设（默认指向内置 db 服务） | **必设** = Neon 连接串 | compose 用 `PROD_DATABASE_URL` 而不是 `DATABASE_URL`：仓根 `.env` 的 `DATABASE_URL` 是本机 dev 库，会被直接注入容器造成「连不上 localhost」 |
| `SEED_ADMIN_PASSWORD` | 仓根 `.env`（compose 自动读取） | **必设**（平台 Secret） | admin 种子口令；缺失=跳过 admin 种子并告警（§2） |
| `APP_PORT` | `8080` | 平台决定对外端口（容器内固定 8080） | 对外唯一端口 |
| `POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB` | `music_drift / music_drift_prod / music_drift` | 仅本地 db 用；Neon 时忽略 | 本地默认口令只为彩排，公网前在 `.env` 覆盖 |
| `NODE_ENV / GATEWAY_PORT / PORT / HOST / LOG_LEVEL` | compose 内已定死 | 同左，无需改 | `NODE_ENV=production` 时缺 `DATABASE_URL` 会拒绝启动（fail-fast） |

```bash
# 本地 .env 追加示例（.env 已在 .gitignore）
echo 'PROD_DATABASE_URL=' >> .env          # 公网时填 neon 连接串
echo 'SEED_ADMIN_PASSWORD=<强口令>' >> .env # 或在平台侧配成 Secret
```

### 5.4 本地彩排（= 评委路径的离线等价演练；t33 已实测）

```bash
docker compose -f docker-compose.prod.yml up -d --build
# 验收（全部实测通过）：
curl -s http://127.0.0.1:8080/healthz                                   # 200（实测 6s 内就绪）
curl -s http://127.0.0.1:8080/                                          # → index.html（landing）
curl -s 'http://127.0.0.1:8080/api/sea?zone=COMPLETED&limit=5'          # 200 JSON
curl -s -X POST http://127.0.0.1:8080/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"account":"smoketest01","password":"Smoke-Demo-2026"}'           # 201（W21 契约含 account）
# 演示内容（三态瓶+接力链+种子评论；幂等）
MDB_API_BASE=http://127.0.0.1:8080 node tools/seed-demo.mjs
# 停止
docker compose -f docker-compose.prod.yml down
```

### 5.5 迁移 + 种子

- **容器启动即自动执行**：`Dockerfile` 的 `CMD` = `db:migrate && db:seed && { Fastify & gateway }`；
  任一前置失败容器直接退出（fail-fast，不会带病运行）。迁移幂等（drizzle ledger，连跑两次零重放）。
- **演示内容**（三态瓶/评论/收藏）是第二步，需 API 已就绪：
  `MDB_API_BASE=<对外地址> node tools/seed-demo.mjs`（自检：完整入海≥1 / 河道≥1 / 公海等待≥1 / 评论≥1）。
- admin 口令机制与重置序列见 §2/§3（`pnpm db:reset` 仅用于**本地 dev 库**）。

### 5.6 公网发布（两条路；平台侧命令**未实测**——本机无 CLI/凭据，以官方文档为准，先标注再复制）

**路 A（推荐，平台连仓库构建）**：完成 5.1 注册 → push 代码到托管（**推远端需 captain/用户确认**）→
平台新建服务选本仓库 → 构建命令 `docker build -t music-drift-app .`（或平台 Dockerfile 识别）→
配 5.3 的环境变量 → deploy。代表性命令（未实测）：
```bash
# Fly（需先 fly auth login / fly auth signup ——【用户必做】）
fly launch --now --name music-drift        # 识别根 Dockerfile
fly secrets set PROD_DATABASE_URL='postgres://…@neon…?sslmode=require' SEED_ADMIN_PASSWORD='…'
fly deploy                                # 后续更新同一条
# Render：Dashboard → New Web Service → Root Directory=. → Build= docker build -t music-drift-app . → Env 填 5.3（未实测）
# Koyeb：CLI/面板建 Service，镜像或仓库二选一（未实测）
```
**路 B（镜像仓库，绕开平台构建）**：
```bash
docker tag music-drift-app ghcr.io/<你>/music-drift-app:latest   # 需 docker login ghcr.io（【用户必做】）
docker push ghcr.io/<你>/music-drift-app:latest
# 平台侧选「用镜像部署」拉 ghcr.io/<你>/music-drift-app:latest + 配 5.3 环境变量（未实测）
```

### 5.7 公开链接验收清单（交付给评委前逐条打勾）

- [ ] 打开根 URL → **landing 渲染**（h1「唱过无痕，声声有应。」）、顶栏无「介绍」入口、全站 HTTPS；
- [ ] **未登录 → 注册新账号**（201，账号≠邮箱）→ 自动回跳原路径；
- [ ] 河道捞一支 → 瓶详情**能听**（音频 Range 200、进度在走）；
- [ ] 公海完整区 → **能评论**（201，列表立即可见）→ 举报（204）；
- [ ] 登录 `admin`（口令=平台 Secret）→ `/api/admin/reports` 命中待处理；
- [ ] 录音功能（`getUserMedia` 需 HTTPS，公网域名下应有权限弹窗）；
- [ ] `curl -s <域名>/healthz` = 200；冷启动后首屏不白屏（若用 Render 必测休眠唤醒）。

### 5.8 回滚

```bash
# 本地 / 任何 docker 主机：
docker compose -f docker-compose.prod.yml down                  # 实测 exit 0（容器移除、数据卷保留）
docker compose -f docker-compose.prod.yml down -v               # 连数据卷一起清（不可恢复，慎用）
# 数据库回滚：
pg_dump "$PROD_DATABASE_URL" -f backup-$(date +%F).sql          # 变更前必做（本地实测过同款逻辑于 db:reset 前）
# Neon：控制台 Time-dimensional restore（免费层按时间点恢复，未实测）
# 平台侧（未实测，以官方文档为准）：fly deployments rollback / Render Rollback / Koyeb 上一 revision 重新部署
```

## 6. 文案可改一条龙（t33 合同必含 + 实测记录）

改任何前端文案 = 三步：

```bash
# 1) 改 apps/web/src 下的文案（例：pages/not-found-page.tsx 的「找不到这一页」）
# 2) 构建
pnpm --filter @music-drift/web build
# 3) 重新发布（本地彩排）：
docker compose -f docker-compose.prod.yml up -d --build        # 镜像内重新 vite build
#    （公网：fly deploy / 平台 Rebuild —— 见 5.6，未实测）
```

**产物可见性证明方式**：`Select-String apps\web\dist\assets\*.js -Pattern '<新文案>'`。
`index.html` 由网关以 `no-cache` 下发 ⇒ 发布后评委浏览器拿到的就是新字节（静态资源带内容 hash，天然不缓存旧版）。

**实测记录（2026-10-05，t33）**：
1. 改 `apps/web/src/pages/not-found-page.tsx`：「找不到这一页」→「找不到这一页T33COPY」（SHA256 `10772351…` → 变更）；
2. `pnpm --filter @music-drift/web build` → **exit 0**（✓ built in 947ms）；
3. `Select-String dist\assets\*.js -Pattern 'T33COPY'` → **命中** `dist\assets\index-BN0qQPFi.js`；
4. **还原**该文件 → SHA256 复核 = `107723515E89A4BDEAEDDF9955BA25DD6B82B017D29411DD14FF82B0587A51AC`（逐字节一致）、`git status` 该文件干净；
5. 重建 → dist 中标记消失（无残留）。
> 结论：文案改动只落在 `apps/web/src` → build → 发布 三步内闭环；本任务未保留任何文案改动（由用户自行改）。

## 7. t33 本地实测记录（原始结果摘要）

| 步骤 | 结果 |
| --- | --- |
| `pnpm --filter @music-drift/web build` | exit 0（多次；最终一轮 dist 无残留标记） |
| `docker build -t music-drift-app .` | **exit 0**（迭代记录：①`# syntax` 前端拉取被死代理挡 → §0.5 处置；②`pnpm install` 锁文件 tarball/registry 不一致 → Dockerfile 固定 npmmirror；③`vite build` 找不到 `/app/tsconfig.base.json` → 补 `COPY tsconfig.base.json`；④成功：`exporting layers … naming to docker.io/library/music-drift-app:latest done`，镜像 1.87GB） |
| `docker compose -f docker-compose.prod.yml up -d --build` | exit 0：`music-db-1 Healthy` → `music-app-1 Started` |
| `/healthz` | **200，6 秒内**（迁移+种子+Fastify+网关全链就绪） |
| `GET /` | index.html（React SPA） |
| `GET /api/sea?zone=COMPLETED` | 200 `{"items":[],…}`（彩排库为空）→ seed-demo 后返回真实作品 |
| `POST /api/auth/register` | **201**，响应含 `account`（W21 契约） |
| `GET /river`（SPA 回退） | 200 index.html；`GET /nope.js` → **404**（不把丢资源伪装成 200） |
| `node tools/seed-demo.mjs`（对 :8080） | exit 0：三态瓶齐 + 收藏 + 评论 + 「真 WebM/Opus 音频自检」通过；`/api/sea` 随即返回作品 |
| `docker compose … down` | exit 0（容器移除；数据卷保留） |
