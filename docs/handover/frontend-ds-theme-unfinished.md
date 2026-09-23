# frontend-ds · t43 主题化美化：未完成清单与状态（每批落盘）

> 目的：本会话已多次「在报告前断」。此文件**每批更新**，保证任何时刻接手的人都能知道：做到哪、下一步是什么、怎么复现。
> 任务 `t43`（attempt 2, attempt_id `eabc1e30-0a5c-4660-925a-f83677af41ce`）。边界：只动 `apps/web/src/pages/**`、`apps/web/src/design-system/**`、`DESIGN.md`、`docs/ui-review/**`。
> 配套文档：`docs/ui-review/theme-pass.md`（5 个 skill 的引文与落地对照，给 captain 逐条核对用）。

## 铁律（本任务不得退回去的既有成果）
1. **一屏 1440 与 375 各 12/12**（含反向控制）⇒ **任何新装饰元素都必须是绝对定位或零高度**，绝不进入文档流。
2. 三处深底 CTA 对比度 ≥3:1（实测 5.13 / 4.18）、焦点环三处一致。
3. 动效只动 `transform` / `opacity`；参数只取契约 token；`reduced-motion` 下静止；`motion-contract` 17 例 + 全仓 key-remount 守卫**必须保持全绿**。
4. 不引入新依赖 / 图片库；优先 CSS 与内联 SVG。
5. `--spacing` 不得覆盖（ADR §48）；颜色 token 不得新增（本轮色板零改动）。

## 进度表

| 批次 | 内容 | 状态 |
| --- | --- | --- |
| B0 | 落盘本文件 + `ui-ux-pro-max` 已 load（另 4 个 skill 本会话已 load 并引用） | ✅ 完成 |
| B1 | `DESIGN.md` 补 `motif:`（5 项）+ `zIndex.underlay` + Elevation & Depth 条目；`theme.css` 暴露 `--motif-*` + `@utility z-underlay`；`tokens.ts` 加 `motif`；新增 `water.css`（3 个类）；`index.css` 引入；`wave.tsx` 加 `WaterSheen`/`WaterTexture`/`TideLine` + `index.ts` 导出 | ✅ 完成 |
| B2 | 页面接入：河道页**两个深水面板**（光带 + 水纹）、河道页**页头潮线**、公海作品页**深底页头**（光带 + 水纹 + 潮线） | ✅ 完成 |
| B3 | 守卫 `water-motif.test.tsx`（9 例，先红后绿）+ 三条 verify + 一屏 1440/375 回归 | ✅ 完成 |

## 回填区（每批做完必填）

- **B0**：`docs/handover/frontend-ds-theme-unfinished.md` 已落盘（本文件）；`ui-ux-pro-max` 已 load。
  **发现**：该 skill 是**纯文档版**（只有 `README.md`/`SKILL.md`/`_meta.json`，**无 `scripts/` 与 CSV**）⇒ 它 SKILL.md 里写的 `python3 …/scripts/search.py … --design-system` **无法执行**（实测 `can't open file … No such file or directory`）。已改用它的**静态条款**（优先级别、快速参考、专业规则表、交付前检查清单），并把这个缺口写进 `theme-pass.md` §1.5，**没有伪造 CLI 输出**。
- **B1**：`DESIGN.md` 新增（只加不删）：`motif:` 5 项 + `zIndex.underlay: -1` + Elevation & Depth 的「水域母题层」条目（含产品理由与三条硬约束）。`theme.css` +5 token + `@utility z-underlay`。`tokens.ts` +`motif` 对象。新文件 `design-system/water.css`（`.water-sheen` / `.water-sheen-light` / `.water-texture` / `.tide-line`，**零 hex / 零 rgb()**，只引用 `var(--motif-*)` 与 `var(--color-*)`）。`index.css` 引入 water.css。`wave.tsx` +3 组件（一律 `aria-hidden` + `pointer-events-none` + `absolute` + `z-underlay`）。
  **关键坑（已解决，别踩第二次）**：装饰要落在「宿主背景之上、内容之下」⇒ 宿主必须同时 `relative` + **`isolate`**，装饰层用 `z-index: -1`；少了 `isolate` 会掉到背景**之下**而完全看不见。
- **B2**：`river-page.tsx` 两个深水面板：className 加 `relative isolate overflow-hidden` + 插入 `<WaterSheen />` + `<WaterTexture />`；页头加 `relative isolate pb-[12px]` + `<TideLine />`。`sea-detail-page.tsx` 深底页头：`relative isolate overflow-hidden` + `<WaterSheen />` + `<WaterTexture />` + `<TideLine className="inset-x-6 bottom-0" />`。**未改**任何路由/区块/文案/字段（信息架构不动）。
- **B3**：`apps/web/src/design-system/__tests__/water-motif.test.tsx` **9 例**：契约先补（DESIGN.md motif 块 / theme.css 暴露 / water.css 无内联色 / index.css 引入）、装饰层纪律（aria-hidden + pointer-events-none + absolute）、页面确实接入。**首轮 9 failed → 实现后 9 passed**。
  三条 verify：`pnpm -r test`、`pnpm -r typecheck`、`pnpm lint` **全部 exit 0**。
  一屏回归（真实浏览器）：**1440×900 = 12/12 OK / EXIT=0**、**375×812 = 12/12 OK / EXIT=0**（截图 `docs/ui-review/after-theme-1440/`、`after-theme-375/`）。
  附带：375 的 `/river` 本轮 `river-drop=806 ≤ 812` **通过** —— t38 里归因给 t36 文案的那条红门已复绿。

## 已知风险 / 待用户验收的取舍

1. **水位线肌理的"水感"**：目前是等距直线（线距 12px、alpha 0.05），读起来偏"规整"。若用户觉得不够"水"，改进方案（任选）：① 给 `.water-texture` 加左右渐隐 `mask-image`；② 再叠一层不同线距的 gradient 做干涉纹。**两者都要新增一个类 token（`textureFade` / 第二线距），属契约变更 ⇒ 本轮没擅自加**，等 captain/用户定。
2. **浅底页面未加装饰**（公海列表页、漂流日志页）：`ui-ux-pro-max` 的规则要求"亮色模式玻璃卡片 ≥80% 不透明度"，浅底上加强装饰有压住正文的风险 ⇒ 本轮只在**深底**（对比度 10:1 级）与页头细线上动手。
3. **静帧截图证明不了动效**：本轮新增元素**全部零动画**，所以这条不影响本轮结论；但若后续加漂移，必须按 `motion-web` §1 + 契约走，并另做真机/录屏验证。

## 下一步（若要继续做）
- 等用户对"水位线肌理够不够水"给一句反馈，再决定是否加 `mask-image`（新增 1 个 token，走 amend）。
- 公海列表页 / 漂流日志页的主题元素（浅底方案需要先定"浅底装饰强度上限"）。
- `ui-ux-pro-max` 换装带 `scripts/` 的完整版，才能用它宣称的可搜索数据库。

---

# t44（第二批）状态 —— 浅底母题 + 水感增强 + 漂流瓶母题

任务 `t44`（attempt 2, attempt_id `bc68f56d-cddb-4419-ae48-478c0b5a3b56`）。配套证据文档：`docs/ui-review/theme-pass-2.md`。

## 进度表（t44）

| 批次 | 内容 | 状态 |
| --- | --- | --- |
| C0 | 真跑 `ui-ux` CLI 取证（`--help` / `--domain style --json` / `--domain ux --json` / `--design-system --format markdown`） | ✅ |
| C1 | 契约：`motif:` 补 6 项（双线距 27px / 渐隐 22% / 浅底强度 / wake 三段）+ 正文条目（漂流瓶母题、航迹、浅底上限） | ✅ |
| C2 | `water.css` 水感增强（双线距干涉纹 + `mask-image` 左右渐隐 + `.water-texture-light` + `.wake-line`）；`wave.tsx` 加 `WakeLine`、`WaterTexture` 支持 `tone="light"` | ✅ |
| C3 | 用户裁决后**可见性上调**：`sheenAlphaLight` / `textureAlphaLight` 0.05→0.09（0.04 为第一批值） | ✅ |
| C4 | `/sea` 整页改造（顶部可见水面带 + 全页水位线 + 页头 64px 漂流瓶 + 潮线 + 航迹 + **浪线** + 空态漂流瓶）；`/bottles/:id/log` 页头潮线 + 航迹 | ✅ |
| C5 | 守卫扩到 **18 例**（新元素 + 上限 ≤0.09 + 双线距必须不等 + mask 必须存在）；反向控制（破坏 `water.css`→红→还原→绿） | ✅ |
| C6 | 顺手修 `one-screen-check.mjs` 头注 ↔ 实现矛盾（exit 码口径） | ✅ |
| C7 | 一屏 1440/375 + 三条命令 | ✅ 1440 EXIT=0 / 375 EXIT=0 |
| C8 | **captain 三处修正**：① 全仓 5 处旧上限 0.04 → 统一 0.09（0.04 只作历史并标注被推翻）② 漂流日志页头补 `BottleMark`（原 `DESIGN.md` 说了但代码没有）③ `theme-pass-2.md` §7 改为**贴原始输出**（不再"见任务回写"） | ✅ |
| C9 | captain 观感反馈落地：**每页头只留一条细线**（公海留潮线、漂流日志留航迹），并写成守卫断言（「同一页头不得同时出现两线」）。理由：两线只差约 10px 会读成"双线"、显噪；语义上潮线=面、航迹=路径 | ✅ |
| C10 | 修正 C8 后**重跑并刷新截图**（旧截图失效） | ✅ 1440 12/12 EXIT=0 / 375 12/12 EXIT=0 |

## 关键事实（接手必读）

1. **用户裁决（本轮前提）**：水/河流/海洋/漂流瓶「都要能一眼看出来」⇒ 可见性优先于 `ui-ux` 的「亮色玻璃卡片 ≥80% 不透明度」克制条款（AGENTS.md §4 + t34-B1 先例）。**但正文 4.5:1 仍是硬门**，由像素实测把关。
1b. **captain 已裁定保留 `sheenAlphaLight: 0.09`**：「只加不删」管的是**条款/token 条目的存废**，不禁止**取值修订**；改回 0.05 会与用户裁决相冲 ⇒ **不再回退**。
1c. **现行浅底上限只有一个数字：`0.09`**（全仓已统一；`0.04` 只作历史并已标注「被用户裁决推翻」）。
2. **浅底上限 = `textureAlphaLight: 0.09`**（第一批 0.04 → 现在 0.09，可见度 ×2.25）。解析上 0.12 也可能过线（≈4.75:1），但**未做像素复核**，故没有采用；若要更明显，先实测再上调。
3. **实测（PIL，`after-theme2-1440/sea-1440.png`）**：正文 `slate-current` vs 底色 `#F3F9FA` = **5.99:1**；vs 最深水线候选 `#B4E3E8` = **4.58:1** ⇒ 均 ≥4.5。
   ⚠️ **陷阱**：`#C2D9DF` 是 `mist` **描边** token，不是水线（我一度误判并把 0.12 判为违规，已在 `theme-pass-2.md` §2.3 更正）。复核办法：打印整行的**不同颜色数**。
4. **`ui-ux` CLI 的两个坑**：① `--format` 只接受 `ascii|markdown`，**JSON 走 `--json`**（契约里那条 verify 命令是错的）；② Windows 控制台需 `PYTHONIOENCODING=utf-8`，否则 `⚠` 编码崩。
5. **`ui-ux-pro-max-zh` 仍是纯文档版**（无 `scripts/`），其 SKILL.md 里的 `search.py` 用法**跑不了**；带 CLI 的是新装的 `.dsh/skills/ui-ux/`。

## 下一步（未做，明确登记）
- 若用户仍觉得不够明显：**先实测**再把 `textureAlphaLight` 往 0.12 上调（不得跳过实测）。
- 公海分页区/我的/设置页可继续加母题；`features/bottle/**`（我的页空态）属别人在途，**不碰**。
- 若加水流漂移：必须走 `motion-web` §1 + `motion` 契约，并做真机/录屏验证。
