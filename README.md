# 音乐漂流瓶（music-drift-bottle）

匿名接力音乐共创社区 —— TME 赛题 Demo。唱一段，投进河里，让陌生人接棒；最终作品汇入公海。

> 当前状态：**S0/S1 进行中** —— 脚手架、纪律文档、领域内核、数据层/契约、账号体系已落地；音频与界面仍在推进。

## 快速开始

要求：Node `>=22.12.0`、pnpm `>=10`（仓库声明 `packageManager: pnpm@11.8.0`）。

```bash
pnpm install
pnpm -r dev        # web: http://localhost:5173   api: http://localhost:8787
pnpm -r test       # 全量单测
pnpm -r typecheck  # 全量类型检查
pnpm lint          # ESLint
pnpm format        # Prettier
```

健康检查：`curl http://localhost:8787/healthz`

## 本地起库与迁移（跑集成测试前必做）

单测**不需要数据库**；集成测试（`*.integration.test.ts`）需要真实 Postgres。因此：

```bash
pnpm db:up         # 起 Postgres 16 容器（docker compose up -d --wait，宿主端口 5433）
cp .env.example .env   # Windows PowerShell: Copy-Item .env.example .env（.env 已 gitignore）
pnpm db:migrate    # 建表（幂等，可重复执行）
pnpm db:seed       # 占位曲库（3 首 × 4 段，幂等）
pnpm test:integration   # 集成测试：先在可抛弃的 music_drift_test 库上建库/清表/迁移，再跑用例
```

其它相关命令：`pnpm db:down`（停容器，保留数据卷）、`pnpm db:reset`（**删卷重建** + 迁移 + 种子）。

> 没起库时 `pnpm dev` 仍能启动：`/healthz` 可用，而依赖数据库的路由（`/api/auth/*`、`/api/segments/:id/audio`）**不挂载并在启动日志里显式告警** —— 这是有意的（静默降级比启动失败更难查），不是 bug。

## 目录结构

```text
apps/web              React 19 + Vite + TS（SPA，dev 端口 5173，/api 代理到 8787）
apps/api              Fastify + TS（dev 端口 8787；src/auth 账号体系、src/audio 音频、src/db 数据层）
apps/web/src/features/audio   录音面板 / 播放条 / 点踩门槛 / 上传客户端（t7；页面只 import 不改）
packages/shared       zod 契约（src/contracts）+ 领域内核（src/domain，纯函数无 IO）+ 音频纯逻辑（src/audio）
docs/api.md           API 端点与错误语义（手写派生；契约形状以 contracts 的 zod schema 为准）
docs/audio.md         音频链路设计说明（录制/上传/播放、Range 语义、80% 判定口径、残留风险）
docs/architecture.md  架构决策记录（任务清单里的 design.md，含待裁决项清单）
plan.md               DAG 可读版（切片划分、依赖、阻塞点）
AGENTS.md             流程与纪律契约（开工前必读）
CONTEXT.md            产品规格（业务规则唯一来源）
DESIGN.md             视觉与 token 唯一来源
```

## 音频链路（录制 / 上传 / 播放）

设计说明见 **`docs/audio.md`**（含接线示例与残留风险）。三件最常用的事：

```bash
# 音频相关的测试（不需要浏览器与麦克风：浏览器能力通过端口注入）
pnpm --filter @music-drift/shared test        # 时长/格式规则 + 「听满 80%」覆盖率判定
pnpm --filter @music-drift/api test           # Range 解析 / 容器嗅探 / 上传校验 / 播放路由
pnpm --filter @music-drift/web test           # 录音 hook / 播放 hook / 上传客户端 / 4 个组件
pnpm db:up && pnpm --filter @music-drift/api test:integration   # bytea 入库 → HTTP Range 字节级比对
```

- 录制容器：`webm/opus` 优先，**Safari 走 `mp4` 兜底**；每段 15–30 秒，30 秒自动停。
- 播放：`GET /api/segments/:segmentId/audio` 支持 `Range`（`206` + `Content-Range`，越界 `416`），
  拖动进度条只取需要的字节；Safari 探测 moov 用的后缀请求（`bytes=-N`）也支持。
- 点踩门槛：**覆盖率**（听过的区间并集）≥ 80% 才可点踩；拖动进度条与循环重播都不算听。
  阈值来自内核 `DEFAULT_POLICY.dislikeListenRatioThreshold`，服务端会再校验一次。

## 重要约束

- **录音**：`getUserMedia` 只在 `https://` 或 `localhost` 下可用。用局域网 IP（`http://192.168.x.x`）访问时录不了音，这是浏览器安全策略，不是 bug。
- **访问地址**：vite dev server 绑定 `localhost`（Windows 上解析为 `[::1]`），请用 `http://localhost:5173`，不要用 `127.0.0.1:5173`。
- **依赖**：版本只写在 `pnpm-workspace.yaml` 的 `catalog`，包内一律 `catalog:` 引用；新增依赖必须先登记进 `docs/architecture.md` 的依赖基线（见 `AGENTS.md` §7）。
- **不要在仓库根目录创建小写 `design.md`**：本文件系统大小写不敏感，它会覆盖视觉契约 `DESIGN.md`。架构决策记录在 `docs/architecture.md`。
- 密钥走环境变量，禁止入库；不推远端、不擅自部署。
