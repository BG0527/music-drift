import { defineConfig } from "@neon/config/v1";

/**
 * Neon 基础设施声明：本项目只消费 Lakebase Postgres，不启用 Neon 的其它原语。
 *
 * 为什么这里只写 `auth: false`、其余不声明：
 * - `auth: false` —— music-drift 自带账号体系（`/api/auth/*` + HttpOnly 会话 cookie，
 *   见 CONTEXT §12），开 Neon Auth 会与自带会话抢同一批用户；
 * - `dataApi` **刻意不声明** —— production 分支现状是 enabled（`neon status` 实测），
 *   而 CLI 只在显式声明时才会改它。不声明 = 保留你既有的开启状态（`neon config plan`
 *   实测为 "No changes"），这正是「不改已有配置」的做法；顺带避开 dataApi 默认
 *   authProvider=neon 会强制要求开 Auth 的类型约束。
 * - Functions / Object Storage / AI Gateway 本项目一律不用，同样不声明。
 * 每个 Neon 项目天然自带 Postgres，所以这里无需声明任何服务。
 */
export default defineConfig({
  auth: false,
  // 分支策略：默认分支（production）用项目默认设置；临时分支 7 天自动过期。
  branch: (branch) => {
    if (branch.isDefault) return {};
    if (!branch.exists) return { ttl: "7d" };
    return {};
  },
});
