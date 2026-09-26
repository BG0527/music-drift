# 实施计划：把 record-v1 定稿实现为真实前端

> 用户裁决（2026-09-23）：**现在就把 11 页定稿实现为项目真实前端**；**先不改后端**；
> **现在就做响应式**（不再把 375 推后）；**授权重写 `DESIGN.md` 契约**（连带 theme.css / tokens.ts / motion.css / 守卫）。
>
> 本计划遵守 AGENTS.md：阶段③之后逐片走 红→绿→重构（阶段④）、每片停下等用户验收（§6）、
> 改守卫必须显式列出（§4/§5）。

## 0. 三条硬约束（先说清，否则会翻车）

1. **设计稿是 1440×900 固定画布、绝对定位；真实前端必须是响应式的。**
   所以这不是"翻译像素"，而是**保留语言与装置、重排布局**：375 不横向溢出、多列网格 768px 以下折单列、可点目标 ≥44px、**页面不得内联 hex**。
2. **契约是唯一真相，且被机器守卫。** `tokens.test.ts` 把 `DESIGN.md` 的 front matter `colors:` 当唯一真相
   （形状固定 `  名字: "#RRGGBB"`、要求 ≥30 条、含 `success-tint` 等键），并断言 **theme.css 不得出现色板外的 hex**。
3. **不能大爆炸换色板**：现有 12 个页面大量使用旧 token 类名（`text-abyss` / `bg-wave-white` / `text-slate-current` …）。
   一次性换名会让**整个 app 编译不过**。迁移策略见 §2。

## 1. 新契约（record-v1）要写什么

### 1.1 色板（≥30 条，保持 front matter 机器可读形状）
| 组 | token | 值（来自 11 页实测） |
| --- | --- | --- |
| 基底 | `ink` | `#050F14` |
| 文字 | `paper` / `muted` | `#F3F9FA` / `#A9C7CF` |
| 强调（唯一） | `coral` | `#D4553A` |
| 暖光 | `warm` | `#F6D79A` |
| 冷光 | `glass` | `#7FD1D9` |
| **水光冷色族**（实测高频手写值，本次收成 token） | `water-light` / `water-mid` / `water-deep` / `water-void` | `#EAFCFF` / `#CBEEF6` / `#E4F7FC` / `#031117` |
| 边界线 | `line` | `#D8F3F6`（岸线用）/ 及 `rgba` 派生规则写在正文 |
| 语义四件套 | `success` / `warning` / `danger` / `info` + 各自 `-tint` / `-border` | 深底适配（现有 tint 是浅色底用的，必须重算） |
| 过渡别名（迁移期） | 旧名保留并**re-point 到新值** | 见 §2 |

### 1.2 其余契约
- `rounded`：**基准 12px → 2px**（新语言：`0 / 1px / 2px / 4px / 999 / 50%`）。
- `typography`：保留字体（LXGW WenKai + Quattrocento）与既有命名档；字号按实测阶梯收敛（56/58 hero、17、15、12.5、11 + `.24em` 元信息）。
- `layout`：`containerMaxWidth 1280`（1440 − 2×76 ≈ 1288 ✓ 保留）、`mobileFloor 375`、`collapseBreakpoint 768`、`touchTargetMin 44`（**不变**）。
- `z-index` / `motion` / `spring`：**沿用现有值不动**（动效语言不是本次变更对象），只补一条新语言规则：
  **装饰零动效**（母题层不做动画），动效只用于状态过渡且只动 `transform`/`opacity`。
- 新增 `motif` 组：platter（盘面沟槽：周期/线宽/alpha）、glint（掠光）、waterline（水线）、ripple、bottleMark。

### 1.3 **必须显式列出的守卫改动**（用户要求逐条可见）
| # | 文件 | 改动 | 为什么必须改 |
| --- | --- | --- | --- |
| G1 | `design-system/__tests__/tokens.test.ts` | 「rounded 基准 12px」那条断言的期望值 → **基准 2px** 的新档位 | 新语言的圆角纪律就是 0/1/2/4/999/50%，12px 基准已不存在 |
| G2 | 同上 | 色板必需键（`success-tint`/`warning-tint`/…）**保留断言不变**，只换值 | 语义四件套仍需要，且在深底上要重算 |
| G3 | 同上 | `theme.css`「不得出现色板外 hex」断言**保持不变**（这是它的价值） | 迁移期别名必须指向色板内已有的值，不得新写 hex |
| G4 | `pages/__tests__/design-discipline.test.ts` | **不放宽任何一条**；375 规则现在生效 | 用户已裁决"现在就做响应式" |
| G5 | 各页既有测试（`bottle-page.test.tsx` 等 106 个文件） | 随对应页面切片更新（每片单独列出） | 页面重做后断言会变，属预期 |

## 2. 迁移策略：别名过渡（保证每片结束时代码都能编译）

1. **S1** 在色板里同时提供**新名**与**旧名别名**：旧名（`wave-white` / `abyss` / `slate-current` / `peacock` / `sea-glass` / `ocean` 系）
   **re-point 到新值**（语义同角色映射：`wave-white`→`ink` 底、`abyss`→`paper` 正文…）。此时 app **仍能编译**，但观感开始变。
2. 之后每片把该页的类名从旧名换成新名。
3. **S8** 删除全部别名，并给守卫加一条：**不得再出现旧名**（防止回潮）。

## 3. 切片（每片：红 → 绿 → 重构，然后停下等验收）

| 片 | 内容 | 主要文件 | 验证命令 |
| --- | --- | --- | --- |
| **S1** | 契约底座：DESIGN.md v2 + theme.css 重写（新色板 + 别名）+ tokens.ts 同步 + motion.css 对齐 + 守卫 G1 | `DESIGN.md`、`design-system/theme.css`、`tokens.ts`、`motion.css`、`__tests__/tokens.test.ts` | `pnpm --filter @music-drift/web test`、`pnpm -r typecheck`、`pnpm lint` |
| **S2** | 母题与组件层：`water.css`/`wave.tsx` 重做为 platter/glint/groove/waterline/ripple/bottleMark；`Button`（圆盘+外环）/`Card`/`Tabs`/`Input`/`EmptyState`/`Nav`/`Icon` 按新语言重做；`showcase` 更新 | `design-system/*`、`showcase/*` | 同上 + 打开 showcase 目视 |
| **S3** | **河道页**（标杆，含捞/投圆盘泊位、默认态无瓶、无段号） | `pages/river-page.tsx` + 其测试 | `pnpm --filter @music-drift/web test`、`node apps/web/tools/one-screen-check.mjs --viewport=1440x900`、375 检查 |
| **S4** | 瓶子详情（录制/接力/三选一/放回）+ 选一首歌 | `pages/bottle-page.tsx`、`song-picker-page.tsx` | 同上 |
| **S5** | 公海大厅 + 公海作品详情 | `pages/sea-page.tsx`、`sea-detail-page.tsx` | 同上 |
| **S6** | 我的（**含回传提示 + 「等待操作」状态**，后端未支持故前端降级）+ 设置 + 404 | `pages/profile-page.tsx`、`settings-page.tsx`、`not-found-page.tsx` | 同上 |
| **S7** | 登录/注册 + 审核台（含非管理员态） | `pages/login-page.tsx`、`admin-page.tsx` | 同上 |
| **S8** | 收尾：删废弃别名 + 守卫加"禁旧名" + 清 docs 稿 + 更新 ADR/CONTEXT 连带项（回传通知的实现依赖、登录两项的有意偏离） | 多文件 | `pnpm -r test`、`pnpm -r typecheck`、`pnpm lint` 全绿 + 用户验收 |

## 4. 需要用户后续裁决的连带项（现在不改，先记账）
1. **回传提示**需要后端新增通知类型（`BOTTLE_RETURNED`）与"待你操作"状态 —— 本轮前端只能按设计实现并**在前端降级**（无数据时不显示），**联调要等后端**。
2. **登录去掉邮箱**是对源码/接口的有意偏离（契约 §3 已记），实现时要么改后端契约、要么保留字段但不出现在本页 —— 本轮按"不出现在本页"实现。
3. 河道页设计师稿里的三项契约欠账（旧珊瑚 / 无 `.clip` / 缺 `--warm`）在真实实现里**自然消失**（会用新 token 与容器重写）。
