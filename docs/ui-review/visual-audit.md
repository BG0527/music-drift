# 视觉一致性复核 · t33（逐页对照 `DESIGN.md`，区分合规 vs 需用户批准）

> 方式：**只读**。素材 = `docs/ui-review/after/*-1440.png`（12 张）+ `docs/ui-review/after-375/*-375.png`（12 张）+ `docs/ui-review/evidence/*.txt`（守卫证据）。
> 结论方式：**像素测量**（PIL 采样/色块剖面，非目测）+ **源码核对**（只读 grep，给行号）。所有数字可复现，脚本见 §7。
> ⚠️ **数据来源**：截图来自守卫脚本的 **hermetic 自建库**（seed 占位曲）⇒ "占位曲目 · 一"、`layoutunmdp…@example.com` 等都是**测试数据，不是视觉缺陷**（captain 已踩过此坑，本审计不再计入）。
> 标签口径：**合规** = 修回 `DESIGN.md` 即可，不需用户批准；**需批准** = 偏离 Figma/`DESIGN.md`，或与用户既有裁决冲突，只能由 captain 上报。
>
> **证据时效**：截图 mtime 13:22；源码核对于 13:5x 完成。`apps/web/src/pages/**`、`features/**` 当前**仍在被 frontend-flow 改动**（`git status` 可见多个 M）⇒ **行号可能随其编辑漂移**；本审计的结论绑定**引用的代码文本**（如 `gap-[32px]`、`bg-deep-current p-6 text-wave-white`），复核时请以文本为准、行号为辅。

---

## 0. 先读这段：三个必答问题的答案

| #      | 问题                                                                                   | 结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Q1** | 首页 hero 的对比与层次是否达到"招牌区"强度？`frontend-design` 的 boldness 现在用在哪？ | **未达到，且原因可量化**：hero 面板占 1440 视口 **43% 面积**（1083×516px），但**面板内 96.08% 的像素是单一 `deep-current`**；唯一交互件（CTA 圆，107px）只占 1.58%，且它与面板底的对比仅 **2.05:1 < `DESIGN.md` L197/L403 要求的 3:1**；四个涟漪环合计仅 ~0.14% 像素、对比 1.43–4.09:1。→ **boldness 目前用在"面积"上，没用在"对比"上**（`frontend-design`：_"Spend your boldness in one place. Let one element be the memorable thing…"_ 的反面：面积最大者恰是最顺色者）。375 同病：面板 42% 面积、CTA 仍 2.05:1。                                                                                                                                                                                                                                                    |
| **Q2** | 公海列表只有 1 支数据时的空荡/失衡，按 `DESIGN.md` 怎么处理？（注意禁 3 等宽列）       | **属于"构成/密度"问题，不是空态缺失**（该页 `emptyWhen={list.length===0}` + `EmptyState` 已就位）。实测：卡片 340×310px = 内容区宽的 **29%**、面积 **10%**；**右侧空白 776px（67%）**、**下方空白 491px（55%）**。可用的**合规**手段：① 列表容器收敛到可读行宽（§L204/L230 的 72ch/<80ch 精神）+ 右侧补一个次要栏；② 用 **两栏不对称网格**（L252 允许"varied card sizes / 非 3 等宽"）。**但**：该页 Figma 帧（`4:675`）**从未采集**（t3 缺口），无法核对 Figma 原排布 ⇒ 见 **B3，建议你裁决**。375 侧同页正常（卡片 100% 宽、内容到底）⇒ 问题**只在桌面**。                                                                                                                                                                                                            |
| **Q3** | 全站是否存在 `frontend-design` 点名的"生成页特征"？                                    | **存在 2 项，第 3 项经核实是误报**：<br>① **中点元信息 `A · B · C`**：源码 **20 处**含 `·`（如 `segment-player.tsx:123` "第 N 段 · 代号"、`accompaniment-player.tsx:73`、`mix-export-panel.tsx:51/185`）——正是该 skill 列的第 5 条 tell；且 `bottle-page.tsx:160` 有注释明确"不用 `·` 串联"⇒**同一产品内策略不一致**。<br>② **SaaS 卡片包**：全站卡片几乎只有两种宽度（93–94% 与 29%）、同一个 12px 圆角 + 同一枚 `0 2px 12px rgba(0,0,0,.06)` → 命中该 skill 第 4 条 tell（_"content chopped into identical rounded cards, one border-radius on everything regardless of hierarchy, the same soft grey shadow under each"_）。<br>③ `#01/#02/#03`（`bottles-…log`）**不是 tell**：该 skill 明说编号只在"内容确实是序列"时使用，而漂流日志就是**时间线** ⇒ 合规，勿改。 |

---

## 1. 合规项（修回 `DESIGN.md` 即可，不需用户批准）

| ID     | 条款（行号 + 原文）                                                                                                                                                                                                                                                                | 截图/位置                                                                                                                          | 期望 vs 实际（量化）                                                                                                                                           | 依据 skill                                                                                                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **V1** | L197「所有承载文字的颜色 ≥4.5:1（…）；**非文本 UI 边界与图标 ≥3:1**」；L403 同                                                                                                                                                                                                     | `after/home-1440.png`（CTA 圆心约 720×540）· `after-375/home-375.png`                                                              | 期望 CTA 与相邻底面 ≥3:1；**实测 peacock `rgb(15,109,128)` vs `deep-current` `rgb(11,58,74)` = 2.05:1**（1440 与 375 同值，说明是同一 class 组合）             | `afrexai-ui-design-system` Phase 7「3:1 minimum — **UI components, icons**」                                                                                                                           |
| **V2** | **L283**「\| L4 deep \| deep-current / trench \| 沉浸式区块（Hero、成品试听）\|」+ **L267**「Water contours, tide lines, river-channel guides, **ripples**, drift-bottle silhouettes, glass-water surfaces, subtle gradients, luminous depth cues, delicate restrained animation」 | `after/home-1440.png`、`after-375/home-375.png`、`after/river-1440.png`                                                            | 期望沉浸区有纵深；**实测面板内 96.08%（1440）/86.59%（375）像素为单一底色**；涟漪环合计 0.14% 像素、对比 1.43:1 / 1.78:1 / 3.17:1 / 4.09:1（最后一个才过 3:1） | `frontend-design`「Use non-user-triggered motion sparingly and deliberately…」不适用；此处用 `afrexai-ui-design-system` Phase 3 Shadow&Elevation「Level 0: flat (no shadow)」的对立面：L4 需可感知深度 |
| **V3** | L250「**Section vertical gaps:** `clamp(4rem, 8vw, 8rem)`」                                                                                                                                                                                                                        | 源码：`pages/home-page.tsx:35` `gap-[32px]`、`shell/app-shell.tsx:33` `gap-[32px]`、`river-page.tsx:38` `gap-[20px] md:gap-[32px]` | 1440 下该条款 = **115.2px**；**实测 32px ⇒ 偏小 3.6×**。且 token `--section-gap`（`theme.css:108`）**全仓 0 处使用**（grep 仅命中声明行）                      | `afrexai-ui-design-system` Phase 8「Whitespace 15% — Breathing room between sections? **Not cramped?**」                                                                                               |
| **V4** | L252「Feature sections: **Asymmetric grid with varied card sizes**」                                                                                                                                                                                                               | `after/sea-1440.png`（29%）、`after/me-1440.png`（93%）、`after/new-1440.png`（94%）、`after/nope-does-not-exist-1440.png`（93%）  | 期望卡片尺寸有变化以形成层次；**实测全站仅两档宽度**（93–94% 与 29%），且 3 个页面用满宽单卡片（`me` 卡片占内容区面积 77%、`new` 45%）                         | `afrexai-ui-design-system` Phase 8「Consistency 15%」+「Visual hierarchy 20%」；`frontend-design`「Visual structure is information」                                                                   |
| **V5** | L328「Skeletons: Shimmer animation matching component dimensions. **No circular spinners**」                                                                                                                                                                                       | 源码：`pages/drift-log-page.tsx:21-22`、`pages/sea-detail-page.tsx:45-46`                                                          | **合规（正向确认）**：骨架屏已按目标尺寸使用、全仓无 `animate-spin`                                                                                            | `css-animation-creator` Workflow 5/6（transform/opacity + reduced-motion）                                                                                                                             |
| **V6** | L291「深底上承载文字只允许 `wave-white` 与 `on-dark-muted`；`sea-glass` 只用于图标/装饰」                                                                                                                                                                                          | 源码：`pages/sea-detail-page.tsx:114/116/126`                                                                                      | **合规（正向确认）**：`bg-deep-current … text-wave-white` + `text-on-dark-muted`；全仓 grep `text-sea-glass`/`text-lagoon` = **0 命中**                        | —                                                                                                                                                                                                      |
| **V7** | L204「max 72ch per line」/ L230「每行 <80ch 为硬上限」                                                                                                                                                                                                                             | `design-system/theme.css:187-190`                                                                                                  | **合规（正向确认）**：全局 `p, li { max-width: 72ch }`                                                                                                         | `afrexai-ui-design-system` Phase 3「max_width: "65ch" # Optimal line length for readability (45-75ch range)」                                                                                          |
| **V8** | L325「**Cards:** Moderately rounded (0.75rem)… Surface background… Subtle shadow… 1px border」                                                                                                                                                                                     | 源码统计：`rounded-base` 36 · `rounded-xl` 4 · `rounded-2xl` 4 · `pill` 20 · `full` 17 · `md` 1                                    | **合规（正向确认）**：卡片语义 36 处用 12px（=0.75rem）；`2xl`(24px) 4 处集中在 hero/沉浸面板（**L308**「`rounded-2xl`｜24px｜全屏容器 / Hero 区块」明确允许） | `afrexai-ui-design-system` Phase 3「Consistency rule: Pick 2-3 radius values and stick to them」                                                                                                       |

> V1/V2/V3/V4 四项**互相独立**，但 V1+V2 是同一个元素上的两层问题（对比 + 纵深），建议一并改。

## 2. 需用户批准项（偏离 Figma/DESIGN.md，或与用户既有裁决冲突）

| ID     | 冲突内容                                                          | 证据                                                                                                                                               | 为什么不能自行实施                                                                              | 候选解法（供裁决，我不实施）                                                                                                                                              |
| ------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1** | **L250 大间距 vs 用户 §46.3「一屏装下、禁止下滑」**               | V3 实测 gap 32px（若按 L250 = 115.2px，1440 一屏会装不下首页 hero + 心情区 + …）                                                                   | 两边都是"已批准的契约"：L250 来自 `DESIGN.md`，§46.3 来自用户裁决 ⇒ 必须由用户选择              | ① 保留紧凑节奏，**amend `DESIGN.md`** L250 为"H5 一屏语境：section gap 取 32–40px"（改契约）；② 只在**有余量的页面**（sea 下方空 55%、404 空 55%）恢复 L250，其余保持紧凑 |
| **B2** | **L251「Hero layout: Asymmetric composition」 vs 实际居中同心圆** | `home-1440`：面板 1083×516 内 CTA 居中；源码 `home-page.tsx:58` `items-center justify-center`；该骨架**来自 Figma `home-river`**（t3 采纳清单 #4） | 改骨架=偏离 Figma；改措辞=改契约 ⇒ 二者都需批准                                                 | ① 保留居中（Figma 优先），把 L251 措辞限定为"Hero 的内容层非对称（标题左对齐 / 主交互居中）"；② 真按 L251 改成左右非对称构图（偏离 Figma）                                |
| **B3** | **公海列表排布（Q2）**                                            | 该页 Figma 帧 `4:675` **未采集**（t3 缺口，429 限流）⇒ 无 Figma 基线可比                                                                           | 现有单列骨架是否"贴 Figma"**无法验证**；换两栏属结构变更                                        | ① 收敛列表行宽 + 右侧次要栏（信息量不变，视觉收敛）；② 两栏不对称网格（1.6:1）；③ 维持现状，仅在大屏把卡片加宽到 720px 上限                                               |
| **B4** | **`frontend-design` 点名的两项"生成页特征"整改（Q3① ②）**         | §0 Q3 的证据                                                                                                                                       | 会改**文案**（去掉 `·` 串联）与**视觉语言**（卡片层次/圆角/阴影分档）——超出"修回 DESIGN.md"范围 | ① 中点元信息改为并列短语/分行（`bottle-page.tsx:160` 已有先例可推广）；② 卡片分三档（主/次/容器）用不同 radius+shadow，而非全站同一档                                     |
| **B5** | **桌面左右内边距 48px vs L243 的 1.5rem(24px)**                   | 源码 `shell/app-shell.tsx:33` `px-[24px] md:px-[48px]`；Figma 帧本身是 40/48 padding（t3 `CONFLICTS.md` C-12 已记录）                              | 对齐 L243 会偏离 Figma 骨架                                                                     | ① 维持 48（Figma 优先）；② 回 24（L243 优先）。低优先，建议与 B1 一起裁决                                                                                                 |

## 3. 逐页核对（1440 一轮 / 375 一轮）

> 除下列行外，其余核对项（V5–V8）在所有页面均为**合规**；本表只列**逐页差异**，避免"全绿表格"掩盖问题。

### 3.1 1440（12 张）

| 截图                            | 页面/状态                      | 差异（条款 → 期望 vs 实际）                                                                                                                     | 标签                                 |
| ------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `home-1440.png`                 | 首页                           | **V1**（CTA 2.05:1 < 3:1）· **V2**（96.08% 单色）· **V3**（gap 32px vs 115.2px）· **B2**（居中 vs L251 非对称）                                 | 合规 ×3 + 需批准 ×1                  |
| `river-1440.png`                | 河道                           | **V2**（两个深水面板合计 1083×516 = 内容区 54% 面积，且与首页 hero 用同一视觉语言 ⇒ `frontend-design` "boldness 只能用一次"被用了两次）· **V3** | 合规（V2 的"重复"部分见 §5-Q1 备注） |
| `sea-1440.png`                  | 公海（1 支数据）               | **Q2/B3**（卡片 29% 宽 / 10% 面积 / 右空 67% / 下空 55%）· **V4**（单档卡片尺寸）                                                               | 需批准（B3）                         |
| `sea-6fffe005-1440.png`         | 公海详情                       | 头部深色面板合规（V6）；**V3**（与下方列表间距 32px）                                                                                           | 合规                                 |
| `new-1440.png`                  | 选歌                           | **V4**（卡片 94% 宽、下空 41%）                                                                                                                 | 合规                                 |
| `me-1440.png`                   | 我的                           | **V4** 反面样本：卡片 93% 宽 / 占内容区 **77% 面积** ⇒ 这是"空间用满"的参照页                                                                   | 合规（无差异，记为参照）             |
| `bottles-401d010d-1440.png`     | 瓶详情·持有（已录完/选择去向） | **V3**（左列唱段链与右侧面板间 gap 32px）                                                                                                       | 合规                                 |
| `bottles-bcf41013-1440.png`     | 瓶详情·非持有（可接唱）        | 同上                                                                                                                                            | 合规                                 |
| `bottles-c46fe213-1440.png`     | 瓶详情·持有（录制中）          | 同上                                                                                                                                            | 合规                                 |
| `bottles-bcf41013-log-1440.png` | 漂流日志                       | **V4**（事件列仅 688px = 59% 宽，右空 38%、下空 54%）· `#01/#02/#03` 编号**合规**（时间线序列）                                                 | 合规                                 |
| `nope-does-not-exist-1440.png`  | 404                            | 卡片 93%×296px、下空 495px（55%）；L329 三要素（图标/说明/动作）齐全 ⇒ **非违规**，仅提示可加宽利用                                             | 合规（低优先）                       |
| `settings-1440.png`             | 设置                           | 卡片覆盖 y143–599 = 视口 51%；伴奏署名与"关于"已在页内（§46.3 之后将改为弹窗）                                                                  | 合规                                 |

### 3.2 375（12 张）

| 截图                           | 页面/状态             | 差异                                                                | 标签                  |
| ------------------------------ | --------------------- | ------------------------------------------------------------------- | --------------------- |
| `home-375.png`                 | 首页                  | **V1**（CTA 2.05:1）· **V2**（86.59% 单色；面板占视口面积 42%）     | 合规                  |
| `river-375.png`                | 河道                  | 两个深水面板纵向堆叠（各 87% 宽）——同一"招牌语言"在移动端也出现两次 | 合规（同 §5-Q1 备注） |
| `sea-375.png`                  | 公海（1 支）          | 卡片 100% 宽、内容到底 ⇒ **桌面问题在移动端不存在**                 | 合规（对照样本）      |
| `sea-d97d4432-375.png`         | 公海详情              | 无差异                                                              | 合规                  |
| `new-375.png`                  | 选歌                  | 三首歌纵向排列，无空荡                                              | 合规（对照样本）      |
| `me-375.png`                   | 我的                  | 无差异                                                              | 合规                  |
| `bottles-33dcd7ff-375.png`     | 瓶详情·持有（已录完） | 无差异                                                              | 合规                  |
| `bottles-3bcfef3d-375.png`     | 瓶详情·非持有         | 无差异                                                              | 合规                  |
| `bottles-88d36ed3-375.png`     | 瓶详情·持有（录制中） | 无差异                                                              | 合规                  |
| `bottles-3bcfef3d-log-375.png` | 漂流日志              | 无差异                                                              | 合规                  |
| `nope-does-not-exist-375.png`  | 404                   | 无差异                                                              | 合规                  |
| `settings-375.png`             | 设置                  | 无差异（署名 + 关于 0.2.0-s1 在位）                                 | 合规                  |

## 4. 功能性缺陷（与视觉分离，便于分别路由）

**本节为空 —— 这是结论，不是遗漏。** 本轮在截图可验证的范围内逐页核对了：破图/缺图、文本截断与重叠、按钮无反馈态、横向溢出、404 与空态的存在性、骨架屏存在性；
**未发现可被我独立确证的新功能缺陷**。已知的三条用户反馈（播放完成后再点应重播、发起者无法操作自己发起的瓶、录完需可试听）**已由用户/其他任务跟踪，本审计不重复计数**。

## 5. 三个必答问题的展开（含 `frontend-design` 的"boldness 只能用一次"）

**Q1 详答**：`frontend-design` 原文 —— _"Spend your boldness in one place. Let one element be the memorable thing, keep everything around it quiet and disciplined…"_。
现在"boldness"的落点是**面积**：`deep-current` 面板在首页占 43%、在河道页两个面板合计 54%，而**面板内部的对比分配**是 96% 平底 + 1.58% CTA(2.05:1) + 0.14% 涟漪。
⇒ 结论：**boldness 同时用在两个大块上（首页 hero + 河道双卡），而在块内又被稀释到几乎不可见** —— 既不是"一处集中"，也不是"周围安静"。合规修法（V1/V2）就能显著改善；是否需要"只保留一处深水"（把河道两卡改为一深一浅）属 **B 类**需批准。

**Q2 详答**：见 §0。补充：`DESIGN.md` L329 的 Empty States 条款已在 `sea-page.tsx` 落地（`emptyWhen` + `EmptyState`），所以**不要**把 1 支数据的空荡当作空态缺失来修；应修的是**桌面构成**（B3）。
另注意 L252/L421 只禁"**3 等宽列**"，两栏不对称或"列表 + 次要栏"都在允许范围内。

**Q3 详答**：见 §0。补充可复核计数：源码含 `·` 的行 **20 处**；`bottle-page.tsx:160` 已按该 skill 改成并列短语（先例存在，推广成本低）。
**误报声明**：`#01/#02/#03` 编号、`tide-pool` 小标签、`pill` chip 都**不是** tell（分别属时间线序列、状态标注、标签语义），本审计不计入整改。

## 6. 证据不足 / 无法判定（诚实边界）

1. **微交互与动效**：静态截图**无法判定** duration/easing/reduced-motion 是否生效。要判定需录屏或真机 —— 依 `css-animation-creator` Workflow 7「Verify on low-end devices and confirm no layout thrash before shipping.」与 Workflow 6「Honor reduced-motion preferences for every animation.」。
   已可确认的只有静态面：`theme.css` 的 motion 契约与 `motion.css` 的 reduced-motion 块存在（t10/t13 已验证）。
2. **Figma 基线缺失**：公海列表/详情/追踪揭晓等帧（`4:675`/`4:966`/`4:1204`）在 t3 因 429 **从未采集** ⇒ B3 这类"是否贴近 Figma"的判断**没有基线**，只能按 `DESIGN.md` + 用户偏好裁决。
3. **真实数据下的表现**：全部截图是 seed 占位数据（1 首歌 / 1 支瓶）⇒ "多数据时"的密度、分页、长文本换行未验证，本轮结论**不外推到多数据场景**。
4. 我**没有**对"好看/不好看"下任何结论；上表每条都能由行号 + 截图 + 数字复核。

## 7. 复现方式（只读）

```bash
# 1) 像素测量（对比度 / 色块占比 / 卡片与容器尺寸）
python - <<'PY'   # 见本文件 §1、§0 的数字；核心：np.abs(img-rgb).max(axis=2)<=tol 掩码 + bbox 剖面
PY
# 2) 源码核对（行号级）
grep -n "gap-\[32px\]" apps/web/src/pages/home-page.tsx
grep -rn "text-sea-glass\|text-lagoon" apps/web/src --include="*.tsx"      # 期望 0
grep -rn "· " apps/web/src/pages apps/web/src/features --include="*.tsx"  # 中点元信息 20 处
grep -rn "rounded-\(base\|xl\|2xl\|pill\|full\)" apps/web/src/pages apps/web/src/features --include="*.tsx"
# 3) 守卫证据（一屏 12/12 与两条反向控制）
cat docs/ui-review/evidence/{1-desktop-1440,2-mobile-375,3-negative-1440,4-negative-375}.txt
```

## 8. 用到的 skill 条款（原文，逐条对应上面的判断）

- **`frontend-design`**
  - _"Spend your boldness in one place. Let one element be the memorable thing, keep everything around it quiet and disciplined, and cut any decoration that does not serve the brief."_ → §0-Q1、§5-Q1。
  - 生成页特征清单第 4 条：_"the SaaS-card kit: content chopped into identical rounded cards, one border-radius on everything regardless of hierarchy, the same soft grey shadow (rgba(0,0,0,.1)) under each, and gradient washes as decoration"_ → §0-Q3②、B4。
  - 第 5 条：_"meta strings joined with middle dots ('A · B · C')"_ → §0-Q3①、B4。
  - _"Many generic designs use numbered markers (01 / 02 / 03), but that's only appropriate if the content actually is a sequence — like a stepped process or a timeline."_ → §0-Q3③ **误报判定依据**。
  - _"Build to a quality floor without announcing it: responsive down to mobile, visible keyboard focus, reduced motion respected…"_ → §6 边界声明。
- **`afrexai-ui-design-system`**
  - Phase 7：_"3:1 minimum | UI components, icons | AA"_ → V1。
  - Phase 3 Shadow & Elevation：_"Level 0: flat (no shadow)"_ 的层级观 → V2（L4 需可感知深度）。
  - Phase 8 评分表：_"| Whitespace | 15% | Breathing room between sections? Not cramped? Not wastefully sparse? |"_、_"| Consistency | 15% | Same spacing, colors, radius, typography throughout? |"_ → V3、V4。
  - Phase 3 间距表（_"Use a 4px base unit (0.25rem)"_，`2: "0.5rem" # 8px`…）→ 与 `DESIGN.md` L244 的 8px 节奏同构（已在 §48 回退中落地）。
  - Phase 3：_"max_width: '65ch' # Optimal line length for readability (45-75ch range)"_ → V7。
  - Phase 3：_"Consistency rule: Pick 2-3 radius values and stick to them."_ → V8。
- **`css-animation-creator`**
  - Workflow 5：_"Constrain animated properties to `transform` and `opacity` for GPU acceleration. Apply `references/performance.md`."_
  - Workflow 6：_"Honor reduced-motion preferences for every animation. Apply `references/accessibility.md`."_
  - Workflow 7：_"Verify on low-end devices and confirm no layout thrash before shipping."_ → §6 第 1 条（静态截图不能替代这三条的验证）。

## 9. 建议的裁决顺序（供 captain 排期）

1. **先批 V1（CTA 对比 2.05:1）** —— 单点、低风险、直接改善"招牌区"观感，且纯合规。
2. 再定 **B1（L250 vs 一屏）** —— 它决定 V3 怎么改，并可能触发 `DESIGN.md` 的一次 amend。
3. 再定 **B3（公海桌面构成）** —— 需要 Figma 缺帧的事实一起告知用户。
4. **B2 / B4 / B5** 可打包给用户一次性裁决（都属"契约措辞 vs 现有骨架"的选择题）。
5. V2/V4 在 1–3 落定后一并实施（都靠 `design-system` 的 token/组件调整，不需新依赖）。
