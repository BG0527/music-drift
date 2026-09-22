# 音乐漂流瓶（music-drift-bottle）

匿名接力音乐共创社区 —— TME 赛题 Demo。唱一段，投进河里，让陌生人接棒；最终作品汇入公海。

> 当前状态：**S0 完成**（规格冻结 + 纪律落盘 + monorepo 脚手架）。产品逻辑尚未实现。

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

## 目录结构

```text
apps/web              React 19 + Vite + TS（SPA，dev 端口 5173，/api 代理到 8787）
apps/api              Fastify + TS（dev 端口 8787）
packages/shared       zod 契约（src/contracts）+ 领域类型/内核（src/domain）
docs/architecture.md  架构决策记录（任务清单里的 design.md，含待裁决项清单）
plan.md               DAG 可读版（切片划分、依赖、阻塞点）
AGENTS.md             流程与纪律契约（开工前必读）
CONTEXT.md            产品规格（业务规则唯一来源）
DESIGN.md             视觉与 token 唯一来源
```

## 重要约束

- **录音**：`getUserMedia` 只在 `https://` 或 `localhost` 下可用。用局域网 IP（`http://192.168.x.x`）访问时录不了音，这是浏览器安全策略，不是 bug。
- **访问地址**：vite dev server 绑定 `localhost`（Windows 上解析为 `[::1]`），请用 `http://localhost:5173`，不要用 `127.0.0.1:5173`。
- **依赖**：版本只写在 `pnpm-workspace.yaml` 的 `catalog`，包内一律 `catalog:` 引用；新增依赖必须先登记进 `docs/architecture.md` 的依赖基线（见 `AGENTS.md` §7）。
- **不要在仓库根目录创建小写 `design.md`**：本文件系统大小写不敏感，它会覆盖视觉契约 `DESIGN.md`。架构决策记录在 `docs/architecture.md`。
- 密钥走环境变量，禁止入库；不推远端、不擅自部署。
