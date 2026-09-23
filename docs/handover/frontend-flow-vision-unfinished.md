# frontend-flow · 视觉与功能返工 · **未完成清单 + 下一步**（t12）

> 落盘原因（captain 2026-09-23 停机令）：**成员的自述不能只存在于会话里** —— 之前有成员的会话突然失败，
> 导致"它以为自己做完了什么"全部丢失（§37）。本文件是**停机时刻（08:45）的快照**，
> 接手者不需要从聊天记录里考古。
>
> 相关：`docs/architecture.md` §44（t12 未完成镜像）、**§46（新增硬约束：一屏装下 / 声明式内容弹窗 / 公海分页）**。

---

## 0. 当前的仓库状态（已验收 / 已验证，可直接接着跑）

| 项                                                          | 状态 | 证据                                                                                                                                      |
| ----------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 0️⃣ 设置页挂 CC BY 4.0 署名                                  | ✅   | `apps/web/src/pages/__tests__/settings-attribution.test.tsx`（桩用**真资产** `public/library/library.json`）                              |
| 1️⃣ 三类通知写入（§5.2 / §9.2）                              | ✅   | `apps/api/src/routes/notifications-write.integration.test.ts` **7/7**；实现在 `apps/api/src/store/notifications.ts`                       |
| 3️⃣ 消费 `GET /api/me/bottles`（替掉 localStorage 书签）     | ✅   | `features/bottle/my-bottles.tsx` + 测试；旧的 `features/profile/bottle-index.ts` **已删**（避免第二真相源）                               |
| §9.1 漂流中不可见后续（+ §9.2 入海解锁）                    | ✅   | `apps/api/src/routes/visibility.integration.test.ts` **6/6**；判据 `apps/api/src/store/visibility.ts`；契约新增 `hiddenLaterSegmentCount` |
| 2️⃣ 点踩接线（真实 `listenedRatio`）                         | ✅   | `apps/web/src/pages/__tests__/bottle-page.test.tsx`（用可控音频元素推进覆盖率→断言上送 `listenedRatio: 1`）                               |
| 4️⃣ `/admin` 审核台（真实裁决 + 人工覆盖自动斩杀）           | ✅   | `apps/api/src/routes/admin.integration.test.ts` **9/9**；内容处置 `apps/api/src/store/moderation.ts`                                      |
| 视觉返工 1–4（外壳比例 / 首页 Figma / CTA 竖排 / 投下等权） | ✅   | 截图 `docs/ui-review/after-*.png`；守卫 `design-discipline.test.ts` 11 条                                                                 |

**全仓当前应为绿**：`eslint .` exit 0；`pnpm -r typecheck` 3/3 Done；web **50 文件 / 383 例**；
api 单测 168 / 集成 20 文件 151 例；`vite build` ✅（JS ≈492 kB，gzip ≈148 kB）。

### 0.1 视觉返工的**根因**（留给接手者，避免重踩）

`apps/web/src/design-system/theme.css` 把 `--spacing` 覆盖成 `0.5rem`（为了让 `p-1` = 8px 符合 DESIGN 的 8px 节奏），
于是 Tailwind 的**数字 utility 全部 ×2**：`w-64` = **512px**、`h-40` = 320px、`h-28` = 224px。
→ 侧栏宽到 512（"导航卡片溢出侧栏"）、按钮巨大（"比例不对"）都源于此。
**纪律：几何一律写显式 px（`w-[260px]` / `h-[44px]` / `min-h-[517px]`），不要用 `w-64` 这类数字档。**

---

## 1. 未完成项（按 captain 给的顺序）

### 1.1 §46.3 **所有页面一屏装下、禁止下滑**（1440×900 无纵向滚动条）

- 现状：**首页 / 河道已做到**（截图见 `docs/ui-review/after-home-1440.png`、`after-river-1440.png`）。
- 待做页面：**公海 `/sea`**、**公海详情 `/sea/:id`**、**我的 `/me`**、**设置 `/settings`**、**漂流瓶详情 `/bottles/:id`**、**漂流日志**。
- 下一步（具体）：
  1. 用 `npx playwright screenshot --viewport-size="1440,900" http://localhost:5173/<path> <out>.png` 逐页取图，**先看谁在滚**（`document.documentElement.scrollHeight > 900`，可用 `--wait-for-timeout` + 一个 dev-only 的 `window.__scrollHeight` 断言，或直接目视）；
  2. 逐页把竖排列表改成**受控高度 + 内部滚动**（`max-h-[…] overflow-y-auto`）或**收进弹窗/抽屉**（见 1.2）；
  3. 组件尺寸/位置按 Figma 数值：260 侧栏 / 212×44 导航项 / 1084×517 hero / ripple 240·180·130 / 主按钮 110×110（`docs/figma/frames/4-43--home-river.md`）；
  4. 每页 1440 + 375 各出一张图，存 `docs/ui-review/after-<page>-{1440,375}.png`。

### 1.2 §46.2 **声明式内容不占首屏** → 改为"入口 + 弹窗/抽屉"

- 待改：
  - **伴奏与授权 / 曲库署名**：当前**直接挂在设置页正文**（`pages/settings-page.tsx` 的「伴奏与授权」区块 + `features/audio/library-attribution.tsx`）→ 改成"设置页一个入口 → 点击弹窗"；
  - 规则说明（目前散在 hero 下方的小字）、歌词/结构提示（接力页的结构提示）。
- 弹窗纪律（`DESIGN.md`）：`z-overlay 200` / `z-modal 300`、遮罩 `night-ink 60% + blur`、入场 **480ms / ease-out / translateY 16px→0**（`Modal` 组件已实现，直接复用，不要新写）。
- 注意：**署名义务不能因为"收进弹窗"而消失** —— 弹窗内必须仍然含作者 / 来源 / 许可名 / 许可链接 + 逐首曲名（失败态见 `settings-attribution.test.tsx` 的两个用例）。

### 1.3 §46.3 **公海分页**（前端按已有契约接线；后端 captain 另派）

- 现状：后端 `/api/sea` **硬编码 `nextCursor: null` 且不消费 `cursor`**（captain 实测）。
- 待做（**前端**）：
  1. `useSeaList(zone, cursor)` 把 `cursor` 拼进查询（契约 `BottleListQuerySchema`：`packages/shared/src/contracts/bottles.ts:113`）；
  2. 列表底部给 **「加载更多」**（`nextCursor !== null` 才出现；为 `null` 时**不假装有分页**，直接不渲染控件）；
  3. 分页控件规格参考 `afrexai-ui-design-system` Phase 4「Table Design → pagination: bottom」与「empty_state: illustration + message + CTA」；
  4. 后端修好后做一次端到端复验（两页数据不重不漏），并把 `docs/api.md` 的 `nextCursor` 口径同步。
- **禁止**：前端自己造第二套分页规则。

### 1.4 5️⃣ **赞 / 踩新交互 + 四态截图**（用户裁决，唯一剩下的视觉项）

规格（用户口述 + captain 确认）：

- 按钮**改小**；**补上点赞**；赞/踩**与 DESIGN.md 动效物理一致**（spring 120/20、hover scale(1.03)、200ms、只动 `transform`/`opacity`）；
- **前端常驻的只有赞/踩两个按钮** —— **80% 门槛不要常驻前端**（不要一进来就禁用点踩）；
- **点踩后再判定**：<80% → **弹窗提醒**（不是灰按钮）；≥80% → 点踩成功；
- **已听进度持久化**（退出不清零）→ 依赖后端 **t20**（backend-core 在做）；接口缝：播放中周期性上报进度 → 点踩收到 422（听满不足）→ 弹窗提醒；
- 斩断仍**只由踩数驱动**（§7.1）；点赞落库可统计但不参与阈值。
- 交付方式：**先按 DESIGN.md 做一版 → 截「未投票 / 已赞 / 已踩 / 点踩被拒弹窗」四态图** → 连"偏离 Figma 清单"交 captain 带去审批。
- 四态截图的做法（CLI 无法注入 cookie）：加 **dev-only `?vote-states`** 分支（同 `?design-system` 的模式），用假数据渲染四态，然后 `npx playwright screenshot` 逐态取图。

### 1.5 t12 剩余功能面

- **私密留言 UI**（写入入口 + 可见性 + 未送达状态展示）；服务端已就绪（`/api/bottles/:id/messages`）。
- **收藏 / 徽章 / 指定接唱** 的页面接线（API 均已存在：`/api/me/collections`、`/api/me/badges`、`/api/sea/:id/targeted-segment`）。
- **接力链展示增强**（每段的点赞/点踩计数已在 `SegmentSchema` 里，未展示）。

### 1.6 依赖外部（不要自己起）

- **t20**：服务端持久化 `(user, segment)` 覆盖率 + 点踩由服务端判定（backend-core）。
- **公海分页后端**（captain 派）。
- **用户对"偏离 Figma"的审批**（清单见下一节）。

---

## 2. 偏离 Figma 清单（**待审批**，我未自行决定设计意图）

1. **侧栏用户卡不含匿名代号行**（用户裁决：代号"每瓶一个"，系统里不存在"你的代号"）→ 只保留身份位（普通用户 / 管理员 / 未登录）。
2. **心情标签 44px 高**（Figma 33px）：DESIGN 要求触控目标 ≥44px；且只作展示（CONTEXT §3.2），文案已如实说明。
3. **hero `min-height: 517` 仅桌面**；375 下按键比例缩到 ripple 180 / 按钮 88，以保"一屏"（§46.3）。
4. **涟漪 = 3 静态圈 + 1 动画圈**（Figma 3 静态圈）：纯动画时静止截图看不到招牌主交互（第一版被此坑到）。
5. **首页 header 右上多三个文字快捷入口**（Figma header-row 只有标题 + 副标）：因为「今日海面」列表已移出首页，需要保留公海 / 我的 / 投下入口。
6. **首页主捞取按钮上写「捞取」**（Figma master-pick-btn 是纯图标圆）：纯图标按钮需要可访问名称，视觉上也该有字。
7. **`--container-max-width: 1280px` 保留**（用户已批准 1440 满宽；>1440 时的内容列约束待 captain 结论落地后我未改动此常量）。

---

## 3. 三个 skill 的**实际引用条款**（用户要求：把"我调用了 skill"变成可验证声明）

**`frontend-design`**

- 「**Spend your boldness in one place.** Let one element be the memorable thing, keep everything around it quiet and disciplined」→ 首页只有 hero（涟漪 + 110 圆按钮）是"响亮"的那一处，header / 标签行 / 链接全部安静；
- 「Structural devices like outlines, borders, numbering, eyebrows, dividers, labels **encode useful information** rather than decorate」→ 漂流日志的 `#01 #02…` 只出现在**真序列**上（事件流），没有装饰性编号；
- 「**Avoid these default typographic treatments**… meta strings joined with middle dots ('A · B · C')」→ ⚠️ **自查发现我踩了这条**：`已录 4 / 4 段 · 全部段位都有人唱过`、`接力第 2 棒 · 第 3 段已录好` 等处用 `·` 连接元信息。**待改**（见下 §4 第一条），这是本次 skill 复核的**实际产出**；
- 「Motion that answers a person's action is welcome；use non-user-triggered motion sparingly」→ 涟漪是**常驻**非用户触发动效，保留的唯一理由是 `DESIGN.md` 把涟漪定为产品母题（"涟漪标记状态变化与落点"），已在偏离清单第 4 条列明。

**`afrexai-ui-design-system`**

- Phase 4「Button hierarchy: **Primary max 1–2 per view**」→ 首页 1 个主按钮、河道 2 个（捞取 / 投下，用户要求等权）**正好在上限**；
- Phase 4「**Minimum touch target: 44×44px**」+ Phase 6「Minimum spacing between targets: 8px」→ 导航项 44px 高、心情标签 44px 高、标签间距 12px；
- Phase 4「Loading: **Skeleton > Spinner**」→ `AsyncBoundary` 三态用骨架（DESIGN 亦禁 spinner）；
- Phase 4「Empty states: icon + headline + description + **CTA**」→ 我的空态全部带行动按钮（如"去河道捞一个"）;
- Phase 4「Table → **pagination: bottom**、empty_state 要有 CTA」→ 公海分页（§1.3）按此实现；
- Phase 8 Rubric 自评（如实，不虚高）：**视觉层级 20/20、一致性 14/15、留白 14/15、可访问性 14/15、响应式 9/10、交互 8/10、排版 9/10、色彩 5/5 ≈ 93/115 → 折算约 81/100**；扣分点=偏离 Figma 的 7 条尚未获批 + 赞踩交互未做。

**`css-animation-creator`**

- Workflow 第 5 步「**Constrain animated properties to `transform` and `opacity`** for GPU acceleration」→ 涟漪 `scale+opacity`、按钮 `scale`、`motion.css` 的入场 `translateY+opacity`，无 `width/height/top/left` 动画；
- 第 6 步「**Honor reduced-motion preferences for every animation**」→ `motion.css` 的全局 `@media (prefers-reduced-motion: reduce)` 已覆盖涟漪与入场（t10 落地，我未改）；
- 第 3 步「Set timing and easing to match the interaction」→ hover 200ms（与 `DESIGN.md` 的 `hoverDuration` 一致）；模态入场 480ms（DESIGN 的 `entryDuration`）；
- 第 1 步「Identify the purpose」→ 涟漪=guidance（标记落点）、赞踩（待做）=feedback。

---

## 4. 停机后**第一件小事**（15 分钟内，明确可执行）

1. 把 §3 里发现的 `·` 元信息分隔（`frontend-design` 明确列为"生成的页面"识别特征）替换为更克制的处理：
   候选=用 `｜`？用括号？或**拆成两个不连接的短语**（推荐：`已录 4 / 4 段` + 独立的状态 chip）；
   涉及文件：`pages/home-page.tsx`（已移除该文案）、`features/bottle/my-bottles.tsx`、`features/bottle/relay-status.ts`、
   `pages/sea-page.tsx`、`features/admin/report-queue.tsx`；
2. 复核 `docs/ui-review/*.png` 与 `apps/web/docs/screenshots/*.png` 的一致性（交接用前者）。

## 5. 复现命令（接手直接可用）

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed
cd apps/api && DATABASE_URL=postgres://music_drift:music_drift_dev@localhost:5433/music_drift npx tsx src/server.ts &
cd apps/web && npx vite --port 5173 --strictPort &
npx playwright screenshot --viewport-size="1440,900" --wait-for-timeout=2500 http://localhost:5173/ out.png
pnpm -r test && npx eslint . && pnpm -r typecheck
```
