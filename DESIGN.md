---
version: "ocean-v1"
name: "Ocean Drift"
description: "桌面为主要场景的 Web 应用（移动端可用性适配）的海洋主题设计 token：水波 / 河道 / 浪线 / 漂流瓶。用于『音乐漂流瓶』匿名接力音乐共创社区。Tokens only — no component code."
colors:
  # —— 水面（浅色基线，原文 Ivory/Cream 的语义位）——
  wave-white: "#F3F9FA"
  foam: "#E4F0F2"
  tide-pool: "#D7E8EC"
  mist: "#C2D9DF"
  driftline: "#648C99"
  # —— 深水（沉浸式区块的暗底）——
  deep-current: "#0B3A4A"
  trench: "#123E52"
  night-ink: "#061A22"
  # —— 品牌主色（原文 Deep Teal 的语义位）——
  peacock: "#0F6D80"
  peacock-deep: "#0B4E5B"
  peacock-active: "#093E49"
  lagoon: "#2A9DB1"
  sea-glass: "#7FD1D9"
  # —— 文字 ——
  abyss: "#07202B"
  slate-current: "#44646F"
  on-dark-muted: "#A9C7CF"
  # —— 点缀与语义 ——
  coral: "#C7452C"
  coral-deep: "#9D4125"
  success: "#1F6B51"
  warning: "#875C12"
  info: "#0F6D80"
  danger: "#9D4125"
  # —— 语义 tint / border（机器可读；与正文「Semantic & Status Colors」一致）——
  success-tint: "#E7F2EE"
  success-border: "#BFDCCF"
  warning-tint: "#FAF1E0"
  warning-border: "#E8D3A6"
  danger-tint: "#FAEDE9"
  danger-border: "#EBC3B6"
  info-tint: "#E6F1F4"
  info-border: "#BFDCE3"
typography:
  hero:
    fontFamily: Quattrocento
    fontSize: clamp(2.5rem, 5vw, 4rem)
    fontWeight: 700
    letterSpacing: "-0.02em"
  h1:
    fontFamily: Quattrocento
    fontSize: 2.25rem
    fontWeight: 700
  h2:
    fontFamily: Quattrocento
    fontSize: 1.5rem
    fontWeight: 700
  body-md:
    fontFamily: Quattrocento
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.6
  body-cjk:
    fontFamily: '"LXGW WenKai", "LXGW WenKai Screen", Quattrocento, "Songti SC", "Noto Serif SC", serif'
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.6
  ui-label:
    fontFamily: 'Quattrocento, "LXGW WenKai", ui-serif, system-ui'
    fontSize: 0.875rem
    fontWeight: 500
    letterSpacing: "0.01em"
  mono:
    fontFamily: '"JetBrains Mono", ui-monospace, monospace'
    fontSize: 0.875rem
    fontWeight: 400
rounded:
  none: 0
  sm: 6px
  md: 8px
  base: 12px
  lg: 16px
  xl: 20px
  "2xl": 24px
  pill: 999px
  full: 50%
spacing:
  base: 0.5rem   # 8px
  scale: [4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px]
  containerMaxWidth: 1280px
  containerPaddingInline: 1.5rem
  sectionGap: clamp(4rem, 8vw, 8rem)
  touchTargetMin: 44px
motion:
  springStiffness: 120
  springDamping: 20
  entryShift: 16px
  entryDuration: 480ms
  entryEasing: ease-out
  listStagger: 100ms
  hoverScale: 1.03
  hoverDuration: 200ms
  pageTransition: 300ms
  shimmerDuration: 1400ms   # 骨架 shimmer（= §Interaction States loading 行的 1.4s）
  rippleDuration: 2400ms    # 涟漪扩散（事件涟漪与场景涟漪共用；两角色定义见 Elevation & Depth）
  exitDuration: 240ms       # 一切退场（Modal / Toast / 页面）：入场 480ms 的一半 —— 退场比入场快
  toastSuccessDuration: 3000ms
  toastInfoDuration: 5000ms
  toastErrorPersistent: true   # 错误不许自动消失，必须手动关闭（不许静默失败）
  # 水域母题层的水流漂移（t46，用户裁决「加水缓缓流动」）。产品理由：这一版的主题就是「水」，
    # 而静止的水面看起来像贴图；让水线以**极慢、极小幅度**横向流动（洋流），页面才"活着"。
    # 约束：只动 transform；低幅度低速度不争夺注意力；reduced-motion 下由全局重置冻结。
  driftDuration: 24000ms   # 24s 一个来回的一半（配 alternate）—— 慢到不引人注意
  driftShift: 10px         # 横向位移幅度（±10px）—— 小到只"感觉到"而不是"看到"
  animatedProperties: [transform, opacity]
# 水域母题层（2026-09-24 amend · t43）：只在这里定装饰的**强度**与**纹理周期**。
# 组件只能引用 --motif-*，禁止内联 alpha / px（守卫：__tests__/water-motif.test.tsx）。
motif:
  sheenAlphaDark: 0.1      # 深水暗底上的水面光带（deep-current / trench）
  sheenAlphaLight: 0.09    # 浅底水面光带（与 textureAlphaLight 同步，避免叠加压住正文）
  textureAlpha: 0.05       # 水位线肌理（横向细线）的强度
  textureLineGap: 12px     # 水位线的线距（repeating-linear-gradient 的周期）
  tideLineAlpha: 0.55      # 潮线（sea-glass → 透明 的渐隐细线）
  # ── t44 增强（水感 + 浅底可用）────────────────────────────────────────
  textureLineGapAlt: 27px  # 第二条线距：与 12px 形成干涉纹（108px 才重复）⇒ 不再是等距直线阵列
  textureFade: 22%         # 水位线左右渐隐的边距比例（mask）⇒ 水线不再顶到边
  textureAlphaLight: 0.09  # 浅底强度上限（旧值 0.04 已被用户裁决推翻）；0.12 解析最坏≈4.75:1 但未做像素复核，取 0.09 留余量
  wakeDash: 7px            # 航迹虚线的实线段长度
  wakeGap: 11px            # 航迹虚线的空隙长度
  wakeAlpha: 0.45          # 航迹虚线强度
zIndex:
  underlay: -1   # 装饰层：在宿主背景**之上**、内容**之下**（宿主必须 isolate，否则会被背景盖住）
  base: 0
  sticky: 100
  overlay: 200
  modal: 300
  toast: 500
components:
  button-primary:
    backgroundColor: "{colors.peacock}"
    textColor: "{colors.wave-white}"
    padding: 12px
    borderRadius: "{rounded.base}"
    fontWeight: 600
  button-ghost:
    backgroundColor: transparent
    borderColor: "{colors.driftline}"
    borderWidth: 1.5px
    textColor: "{colors.peacock}"
    padding: 12px
    borderRadius: "{rounded.base}"
  card:
    backgroundColor: "{colors.foam}"
    borderColor: "{colors.mist}"
    borderWidth: 1px
    borderRadius: "{rounded.base}"
    shadow: "0 2px 12px rgba(0,0,0,0.06)"
  input:
    backgroundColor: "{colors.wave-white}"
    borderColor: "{colors.driftline}"
    borderWidth: 1px
    textColor: "{colors.abyss}"
    borderRadius: "{rounded.md}"
    focusRing: "2px {colors.peacock} offset 2px"
---

## Overview

Ocean Drift is the visual system for a mobile-first H5 app: an anonymous relay music community where one person drops a song into a bottle, someone downstream picks it up, records the next segment, and lets it drift on. The water is the product's own structure — a channel that carries something from hand to hand.

The system keeps the discipline of a flowing line without the ornament tax: wave contours and channel guides tell you where the relay goes next, ripples mark where it landed, and the drift bottle is the one motif the eye is allowed to follow. Ornament earns its place by guiding the eye through the relay, not by competing with the recording controls. Where the original Art Nouveau accent was drawn from flowers and whiplash tendrils, this system draws from water: **水波 (wave contours)、河道 (channel guides)、浪线 (tide lines)、涟漪 (ripples)、漂流瓶 (drift bottle)**. No floral ornament, no stained glass, no whiplash curls.

- Density: 5/10 — Balanced

- Variance: 8/10 — Expressive

- Motion: 6/10 — Expressive

- **Style:** Tidal, Fluid, Quiet

- **Keywords:** ocean, tide, river channel, drift bottle, wave contour, ripple, flowing water, anonymous relay, music collaboration, hand-to-hand

- **Era:** Contemporary — 当代数字海洋

- **Light/Dark:** ✓ Full / ✗ No

## Colors

语义名 · 值 · 用途 · 实测对比度（WCAG 2.1，底色 wave-white #F3F9FA，除注明外）

**水面（浅色基线）**

- **wave-white** (#F3F9FA) — 页面底色 / 输入框底 / 反白文字色。全局 default surface。
- **foam** (#E4F0F2) — 卡片、抬升面板、列表行底。卡片背景 SSOT（不再使用橄榄绿 #808000）。
- **tide-pool** (#D7E8EC) — 凹陷面：标签 chip、进度槽、骨架屏底。
- **mist** (#C2D9DF) — 纯装饰细线、水波分隔（非文本、非交互边界，1.38:1）。
- **driftline** (#648C99) — 表单 / 卡片交互边界描边，对 wave-white 3.43:1、对 foam 3.14:1（满足非文本 UI 3:1）。

**深水（沉浸式区块暗底）**

- **deep-current** (#0B3A4A) — Hero / 试听页暗底；其上 wave-white 文字 11.49:1。
- **trench** (#123E52) — 暗底上的抬升层；wave-white 10.75:1、on-dark-muted 6.40:1、sea-glass 6.55:1。
- **night-ink** (#061A22) — Modal / Sheet 遮罩（不承载文字）。

**品牌主色**

- **peacock** (#0F6D80) — 主品牌色 / 主按钮底 / 链接 / focus ring。白字 5.97:1，作文字对 wave-white 5.61:1、对 foam 5.13:1。
- **peacock-deep** (#0B4E5B) — 主按钮 hover 底（等效 8% darken）。白字 9.31:1。
- **peacock-active** (#093E49) — 主按钮 active 底。白字 11.69:1。
- **lagoon** (#2A9DB1) — **仅装饰与水波动效填充**（水波渐变、图表面积），不承载文字（对深底 3.82:1 不达标，禁止用作文字色）。
- **sea-glass** (#7FD1D9) — 深底上的强调**图标 / 水波高光**（对 deep-current 7.00:1）。深底承载文字只允许 wave-white 与 on-dark-muted。

**文字**

- **abyss** (#07202B) — 正文与标题（对 wave-white 15.79:1、对 foam 14.43:1）。全站唯一"最深"色，替代纯黑。
- **slate-current** (#44646F) — 次要文字、说明、时间戳、placeholder（对 wave-white 5.99:1、对 foam 5.47:1、对 tide-pool 5.05:1）。
- **on-dark-muted** (#A9C7CF) — 深底上的次要文字（对 deep-current 6.84:1）。

**点缀与语义色**（详见「Semantic & Status Colors」）

- **coral** (#C7452C) — 珊瑚点缀：主 CTA 强调位（如「投瓶」）、危险态填充。白字 4.87:1。
- **coral-deep** (#9D4125) — 危险 / 错误**文字与图标**（对 wave-white 6.14:1）。

规则：

- 文案可读性硬约束：**所有承载文字的颜色 ≥4.5:1**（≥24px 或 ≥19px bold 时 ≥3:1）；非文本 UI 边界与图标 ≥3:1。
- **饱和度上限 80%**：整份色板实测最高 79%（peacock #0F6D80）。色相集中在 190°（水）/ 14°（珊瑚点缀）/ 150°（成功）/ 38°（警告）；点缀色只占画面 <10%。
- 原 Art Nouveau 色板中的 Olive Green #808000 已从 surface 位彻底移除。

## Typography

- **Display / Hero:** Quattrocento — Weight 700, tight tracking, used for headline impact
- **Body:** Quattrocento — Weight 400, 16px/1.6 line-height, max 72ch per line
- **UI Labels / Captions:** Quattrocento — 0.875rem, weight 500, slight letter-spacing
- **Monospace:** JetBrains Mono — Used for code, metadata, and technical values

中文主字体（本轮新增）:

- **中文正文字体：霞鹜文楷 LXGW WenKai** — 自托管 npm 包 `lxgw-wenkai-webfont`，`font-display: swap`。楷体的手写笔意对应"匿名手写接力"的产品气质，正文与界面文案统一用它。
- **拉丁 / 数字：Quattrocento** — 自托管 npm 包 `@fontsource/quattrocento`。数字、时长、秒数、拉丁用户名走 Quattrocento，与中文楷体形成"航标 + 手迹"的对照。
- 合规红线：**禁止任何 CDN 引用**（jsDelivr 不可达，离线 demo 不可依赖外网）。字体只允许 `npm` 包 → 本地 `woff2` → `@font-face` 自托管。
- Fallback 栈（必须按此顺序，无 webfont 时中文仍有可用衬线）:

```css
/* 中文正文（含中英混排） */
font-family: "LXGW WenKai", "LXGW WenKai Screen", Quattrocento,
  "Songti SC", "Noto Serif SC", "Source Han Serif SC", serif;
/* 拉丁 / 数字 / UI 标签 */
font-family: Quattrocento, "LXGW WenKai", ui-serif, system-ui, serif;
/* 等宽（技术值、时长、码率） */
font-family: "JetBrains Mono", ui-monospace, "SFMono-Regular", monospace;
```

中文排版要求（可读性示例）:

- 正文 1rem / 1.6 为唯一基线；中文不使用负 letter-spacing，字距恒为 normal。
- 中文标点使用全角；中英之间保留 1/4 空（用 `text-spacing` 或样式实现，不靠硬编码多余空格）。
- 标题可用 Quattrocento 700 + 中文楷体 700 混排。
- 每行 **<80ch 为硬上限**，中文正文目标 30–40 字/行（约等于 72ch 拉丁宽度）。
- 示例句（可读性自检）：「把副歌留给下一个人。你只录 15–30 秒，剩下的交给漂流。」

Scale:

- Hero: clamp(2.5rem, 5vw, 4rem)
- H1: 2.25rem
- H2: 1.5rem
- Body: 1rem / 1.6
- Small: 0.875rem

## Layout

- **Grid:** CSS Grid primary. Max-width containment: 1280px centered with 1.5rem side padding.
  - **侧边距分档（2026-09-23 amend · B5）**：**移动 1.5rem（24px）**；**桌面 48px**。
    · 依据：Figma 帧实测页面内边距 40/48（用户设计派生）；裁定「以 Figma 派生为准」，故本文档补桌面档以匹配设计。
    · 出处：`docs/ui-review/visual-audit.md` B5。
    · **可回退**：删去本分档，即回到「全断点统一 1.5rem」的原文口径。
- **Spacing rhythm:** Balanced. Base unit: 0.5rem (8px).
  —— 这里的 Base unit 指**节奏步长**（间距只取 8px 派生档：4/8/12/16/24/32/48/64）。
  它**不是** Tailwind `--spacing` 的值：后者的语义是「**尺度值 1 的长度**」，本项目取框架默认 `0.25rem`（=4px），
  因此节奏档用**偶数**表达（`p-2` = 8px、`p-4` = 16px、`p-6` = 24px、`p-8` = 32px、`p-12` = 48px、`p-16` = 64px），
  4px = `p-1`，44px 触控底线 = `min-h-11`（`--touch-target-min: 44px`）。
  **禁止覆盖 `--spacing`** —— 覆盖会让**每一个**数字档 utility ×2（`min-h-11` 变 88px、侧栏 `w-64` 变 512px）。
- **Section vertical gaps:** clamp(4rem, 8vw, 8rem).
  - **适用范围限定（2026-09-23 amend · B1）**：上式的 `clamp(4rem, 8vw, 8rem)`（1440 下 ≈ 115.2px）**仅适用于有纵向余量的场景**；
    **H5「一屏装下、禁止下滑」语境取 32–40px**（当前实现 32px）。
    · 理由：该式与**用户直接指令**「所有页面一屏装下、禁止下滑」（`docs/architecture.md` §46.3）冲突；**用户直接指令优先于本文档这类内部契约**。
    · 出处：`docs/ui-review/visual-audit.md` B1（实测页面 gap 32px，对照本文档 115.2px）。
    · **可回退**：若用户改选「大留白 + 允许滚动」，删去本限定即恢复原文口径（大留白生效）。
- **Hero layout:** Asymmetric composition.
  - **收敛到 Figma 实际形态（2026-09-23 amend · B2）**：**Hero 主交互区为居中同心圆**（Figma `home-river` 骨架：240·180·130 涟漪 + 110 主按钮）；
    「非对称」指的是**同页内容层**（标题左对齐、快捷入口右对齐），**不适用于 hero 主交互区本身**。
    · 理由：Figma 是**用户的设计**，文档应匹配设计 —— 修回 Figma 属合规，不需用户批准。
    · 出处：`docs/ui-review/visual-audit.md` B2。
    · **可回退**：删去本限定，即回到「hero 整体非对称构图」的原文口径。
- **Feature sections:** Asymmetric grid with varied card sizes. No 3-equal-columns.
- **Mobile collapse:** All multi-column layouts collapse below 768px. No horizontal overflow.
- **z-index contract:** base (0) / sticky-nav (100) / overlay (200) / modal (300) / toast (500).

移动优先落地（不改任何数值，只补齐 H5 语境）:

- 设计顺序：桌面主场景（1440px 评审稿、1280px 容器居中 + 1.5rem 侧边距）→ 768px（折叠阈值）→ 375px（可用性适配验证）；窄屏下容器退化为 100% 宽 + 1.5rem 侧边距。
- 间距只取 8px 派生档：4 / 8 / 12 / 16 / 24 / 32 / 48 / 64。
- 触控目标 ≥44px 见方（含 12px 内边距的按钮与列表行），相邻可点目标间距 ≥8px。
- 安全区：底部固定导航 / 播放条预留 `env(safe-area-inset-bottom)`，纵向高度用 `min-h-[100dvh]`。
- 单列优先：一次只让用户做一件事（选歌 → 录制 → 投瓶 → 取瓶 → 交接），接力路径以河道式纵向流呈现。
- 深水暗底（deep-current / trench）**不是深色模式**：见「Elevation & Depth · 深水暗底硬约束」，全站不提供主题切换与 dark variant。

## Elevation & Depth

Water contours, tide lines, river-channel guides, ripples, drift-bottle silhouettes, glass-water surfaces, subtle gradients, luminous depth cues, delicate restrained animation。装饰只出现在区块边缘与状态切换处，不进入内容区。

- **Physics:** Spring — stiffness 120, damping 20. Confident, weighted transitions.
- **Entry animations:** Fade + translate-Y (16px → 0) over 480ms ease-out. Staggered cascades for lists: 100ms between items.
- **Hover states:** Scale(1.03) + shadow lift over 200ms.
- **Page transitions:** Fade + slide (300ms).
- **Exit animations:** 一切退场（Modal / Toast / 页面）用 `exitDuration`（240ms）——**更短**因为人已经知道结果了。**进出必须配对**：有入场就必须有退场，不能"弹出来就没了"。
- **Ripples — 两个角色，不可混为一谈**（2026-09-24 amend，按 `motion-web` §1 的目的分类拆分）:
  - **① 事件涟漪（event ripple）**：**标记状态变化与落点**（时间轴节点、投/捞的落点、接力交接）。**短暂、事件驱动、只播一次**。
  - **② 场景涟漪（scene ripple）**：**hero 的常驻水面母题**（Figma `home-river` 的 240·180·130 同心圆）。**允许 `infinite` 常驻**，但只有在同时满足「**低幅度 + 低速度、不争夺注意力**」与「`reduced-motion` 下静止」时才成立；它**不进内容区**、不承载任何信息（`aria-hidden`）。
  - **产品理由（写进契约，不让它游走在契约之外）**：涟漪是本系统的水主题母题（见 Overview 的母题清单），hero 同心圆是用户设计稿的既定形态；两者共用 `rippleDuration`（2400ms）。
- **Toast 生命周期:** 成功 3000ms / 信息 5000ms 后自动退场（退场用 `exitDuration`）；**错误常驻到手动关闭**（`toastErrorPersistent`）——错误不许静默消失。
- **水域母题层（water motif，2026-09-24 amend · t43）**：三个**零布局高度**的装饰件，把「水面—河道—深海—漂流瓶」的世界观落到页面上：
  1. **水面光带（water sheen）**：深水暗底顶部的一层极淡渐变，暗示"从水面往下看"；强度 `sheenAlphaDark`（浅底用 `sheenAlphaLight`）。
  2. **水位线肌理（water texture）**：横向细线平铺（周期 `textureTile`，强度 `textureAlpha`），让大块暗底不再像空白模板（`frontend-design` L59：把质量地板做到不喧哗）。
  3. **潮线（tide line）**：`sea-glass → 透明` 的渐隐细线，替代区块之间的硬分隔线（母题见 Overview 的 tide lines）。
  - **产品理由**：这本就是一个关于"水面之上与深海之下"的产品；这三层让页面有**地点感**，而不是"任何 App 都能用的背景"。
  - **不许喧宾夺主（硬约束，三条同时成立）**：① 一律 `aria-hidden="true"` + `pointer-events-none` + **绝对定位**（零布局高度，因此不会破坏"一屏装下"）；② 只出现在**深水暗底与区块边缘**，不进入内容区、不压在正文之下 —— 浅底上若要用，强度必须降到 `sheenAlphaLight` 并实测文字对比度不退化；③ **含一条低幅度常驻漂移**（water drift，t46 起生效；t47 起**浅底整面水层与深底面板/深底页头的水层共用同一对参数**，不设"深底专用"值）：水面缓缓横向流动，参数取 `driftDuration`（24s）/ `driftShift`（±10px），**只动 `transform`**、由 CSS 动画实现（因此被全局 `reduced-motion` 重置冻结为静止）。`motion-web` §1 的 decoration 三条件逐条成立：① 产品理由＝「静止的水面像贴图」，已写在本条；② 低幅度低速度、不争夺注意力；③ `reduced-motion` 下静止。
- **漂流瓶母题（bottle motif，t44 补）**：用户点名的第三类母题。已有内联 SVG `BottleMark`（瓶身 + 瓶塞 + 一道水线 + 底部椭圆水影）本批**首次落到页面上**：公海大厅与漂流日志的页头右侧各一枚，骑在潮线上、与标题同高（绝对定位，零布局高度）。产品理由：**公海就是瓶子入海之后的去处**，页头出现"漂着的瓶子"是这个页面最该有的那一件事。
- **航迹虚线（wake line，t44 补）**：漂流瓶划过水面留下的**断续**水痕（与潮线的"实线渐隐"区分）。落在页头与内容之间，1px 高、绝对定位。产品理由：接力是**一条路径**（河道），航迹把这个"经过"的语义画出来，而不是再加一层静态底纹。
- **浅底装饰强度上限（t44 定，先定后用）**：浅底（wave-white）上**只允许** `textureAlphaLight`（**0.09**）级别的纹理/光带，且装饰一律在内容**之下**（`z-underlay`），不得压住正文。
  依据（两处，均来自 `ui-ux` SKILL.md）：① 「| Glass card (light) | `bg-white/80` or higher opacity | `bg-white/10` (too transparent) |」——承载正文的容器必须足够不透明；② 「- `color-contrast` — Minimum 4.5:1 ratio for normal text」——正文必须保持 4.5:1。两条合起来 ⇒ 浅底上"重装饰"没有空间，只能极淡且在内容之下。
- **Performance:** Only transform and opacity animated. No layout-triggering properties.

深度层级（形态语言）:

| 层级 | 视觉表现 | 语义 |
| --- | --- | --- |
| L0 surface | wave-white 平底 | 水面：内容背景 |
| L1 raised | foam + `0 2px 12px rgba(0,0,0,0.06)` + 1px mist 描边 | 卡片 / 列表行 |
| L2 floating | foam + 更大扩散阴影 + driftline 描边 | 底部固定条 / 播放器 |
| L3 overlay | night-ink 60% + backdrop blur | Sheet / Modal 遮罩 |
| L4 deep | deep-current / trench | 沉浸式区块（Hero、成品试听）|

「水深」是本系统的深度隐喻：越"深"的层阴影扩散越大、底色越暗，但**永不使用纯黑**。

深水暗底硬约束（仅此一种用法）:

- deep-current / trench / night-ink **仅用于沉浸式区块**（Hero、成品试听页、Modal/Sheet 遮罩），用来营造深海质感；**不是系统深色模式**。
- 本设计**不提供主题切换，不提供 dark variant**：页面底色恒为 wave-white，不按 `prefers-color-scheme` 切换主题。
- 深底上承载文字只允许 `wave-white`（11.49:1）与 `on-dark-muted`（6.84:1）；`sea-glass` 只用于图标、装饰与水波高光，不承载文字。
- 深底区块不做自动明暗反转；离开区块回到 wave-white，过渡只允许 opacity。

## Shapes

Base corner radius: 12px. See rounded tokens in front matter for the full scale.

Rounded tokens 全量（原文档引用了 front matter 的 rounded tokens，但那里并不存在 —— 本节补齐）:

| Token | 值 | 用途 |
| --- | --- | --- |
| `rounded-none` | 0 | 全宽分隔条、贴边面板 |
| `rounded-sm` | 6px | chip 内图标底、小标签 |
| `rounded-md` | 8px | 输入框、下拉、时长徽标 |
| `rounded-base` | **12px** | **基准**：按钮、卡片、列表行 |
| `rounded-lg` | 16px | Sheet 顶部、大卡片 |
| `rounded-xl` | 20px | 底部固定条、播放器容器 |
| `rounded-2xl` | 24px | 全屏容器 / Hero 区块 |
| `rounded-pill` | 999px | 胶囊标签、圆形徽标、头像环 |
| `rounded-full` | 50% | 头像、纯图标圆形按钮 |

形态规则:

- 圆角只允许来自上表，禁止任意值（如 11px）。
- 漂流瓶母题用内联 SVG 表达（瓶身 + 瓶塞 + 涟漪），**不用圆角堆叠去"画"瓶子**。
- 水波 / 河道装饰用 SVG path 或 canvas 绘制，纯装饰层 `aria-hidden="true"`，不参与布局高度计算。

## Components

Token 绑定（不改下列规范，只把抽象词落到海洋语义色）:
`accent → peacock`｜`surface → foam`｜`page → wave-white`｜`muted / border → mist / driftline`｜`deep section → deep-current`｜`danger → coral-deep`

- **Primary Button:** Moderately rounded (0.75rem) shape. Accent color fill. Hover: 8% darken + subtle lift shadow. Active: -1px translate tactile press. Font weight 600. No outer glows.
- **Secondary / Ghost Button:** Outline variant. 1.5px border in muted color. Text in primary color. Hover: subtle background fill.
- **Cards:** Moderately rounded (0.75rem) corners. Surface background. Subtle shadow (0 2px 12px rgba(0,0,0,0.06)). 1px border stroke.
- **Inputs:** Label above input. 1px border stroke. Focus ring: 2px accent color offset 2px. Error text below in semantic red. No floating labels.
- **Navigation:** Primary surface background. Active item: accent color indicator. Font weight 500 when active.
- **Skeletons:** Shimmer animation matching component dimensions. No circular spinners.
- **Empty States:** Icon-based composition with descriptive text and action button.

组件 token 明细:

| 组件 | 底 | 文字 | 描边 / 阴影 | 圆角 | 内边距 |
| --- | --- | --- | --- | --- | --- |
| `button-primary` | peacock | wave-white | 无（禁外发光） | 12px | 12px |
| `button-primary:hover` | peacock-deep | wave-white | `0 4px 14px rgba(11,58,74,0.18)` | 12px | 12px |
| `button-primary:active` | peacock-active | wave-white | 无 + translateY(-1px) | 12px | 12px |
| `button-ghost` | transparent | peacock | 1.5px driftline | 12px | 12px |
| `card` | foam | abyss / slate-current | 1px mist + `0 2px 12px rgba(0,0,0,0.06)` | 12px | 16px |
| `input` | wave-white | abyss | 1px driftline；focus 2px peacock offset 2px | 8px | 12px |
| `nav` | foam | slate-current / active peacock | 1px mist 上边线 | 20px（顶部） | 8px 12px |
| `skeleton` | tide-pool + lagoon 20% shimmer | — | 无 | 与目标组件同值 | 与目标组件同值 |
| `empty-state` | transparent | abyss + slate-current | 无 | — | 24px |

业务组件形态（P0 闭环，仅形态约定，不写代码）:

- **漂流瓶卡片**：foam 底 + 12px 圆角 + 1px mist 描边；左侧瓶形内联 SVG（peacock 描边、sea-glass 涟漪）；标题 abyss 1.5rem，次行 slate-current 0.875rem（已有段数 / 剩余可接段位）。
- **接力时间轴**：竖向河道线（2px mist，已完成段 peacock），节点为 12px 圆点（当前段 peacock + 一层 lagoon 20% 涟漪环），段位时长用 Quattrocento 数字。
- **录制 / 波形区**：deep-current 暗底卡片；波形条 lagoon；已录进度 sea-glass；未录区 trench。
- **播放条**：底部固定 `rounded-xl`，foam 底 + L2 阴影；标题 abyss、进度槽 tide-pool、已播进度 peacock。
- **接力冲突提示（409）**：coral-deep 文字 + coral 图标，说明"这一段已被别人接走"，给出「换一段继续」「放回海里」两个动作，绝不静默失败。

## Interaction States

每个交互元素必须定义下列状态的**视觉差异**（颜色 + 形态，不只靠颜色）:

| 状态 | 填充 | 文字 | 描边 / 其他 | 时长 |
| --- | --- | --- | --- | --- |
| default | peacock | wave-white | — | — |
| hover | peacock-deep | wave-white | scale(1.03) + shadow lift | 200ms |
| active / pressed | peacock-active | wave-white | translateY(-1px) | 立即 |
| focus-visible | peacock | wave-white | **2px peacock ring, offset 2px**（对 wave-white 5.61:1 ≥ 3:1） | 立即 |
| disabled | tide-pool | slate-current（不复用低透明度） | 无阴影；`cursor: not-allowed`；`aria-disabled="true"` | — |
| loading | 保持当前底色 | 文字保留 + shimmer 条（禁 spinner） | 宽度不跳变（预留占位） | shimmer 1.4s |

- disabled 不受 4.5:1 约束（WCAG 1.4.3 豁免），但必须与 enabled 有形态差异，且不得作为唯一的"不可用"提示。
- 键盘焦点永远可见：移除默认 outline 时必须给 2px peacock ring；`:focus` 与 `:focus-visible` 都要覆盖。
- 列表项 hover 同样 scale(1.03) + shadow lift / 200ms；不做位移式 hover（会触发重排）。
- 过渡只允许 `transform` / `opacity`；颜色变化允许（不触发重排），但禁止动画 `width/height/top/left/margin`。

## Semantic & Status Colors

原文档缺失，本节补齐（每个语义色都给"文字/图标色 + tint 底 + 描边 + 用途"）:

| 语义 | 文字 / 图标 | Tint 底 | 描边 | 用途（示例） | 文字对比度 |
| --- | --- | --- | --- | --- | --- |
| success | `tide-green` #1F6B51 | #E7F2EE | #BFDCCF | 投瓶成功、接力完成、成品已生成 | 6.02:1（tint 上 5.60:1） |
| warning | `lantern` #875C12 | #FAF1E0 | #E8D3A6 | 录制时长接近上限、剩余段位不足、成品未达标（<80%） | 5.53:1（5.24:1） |
| danger | `coral-deep` #9D4125（填充用 `coral` #C7452C） | #FAEDE9 | #EBC3B6 | 录制/上传失败、账号错误、审核驳回 | 6.14:1（5.71:1） |
| info | `peacock` #0F6D80 | #E6F1F4 | #BFDCE3 | 接力进行中、有人取走你的瓶子、系统提示 | 5.61:1（5.19:1） |

- 所有 tint 底上的语义文字实测 ≥5.19:1，达标。
- 每个语义色必须同时提供非颜色信号（图标 + 文案），禁止只靠颜色区分状态。
- 状态色只用于反馈，不用于装饰点缀；珊瑚点缀（coral）只在 CTA 强调与危险态出现。

## Error States

原文档缺失，本节补齐。错误分层与视觉/文案契约:

1. **字段级错误（输入框下方）**：文字 `coral-deep`（6.14:1）+ Lucide `alert-circle` 14px；边框切 `coral`；`aria-invalid="true"` + `aria-describedby` 指向错误文本。文案必须给出修正动作，禁止只写"输入有误"。
   - 示例：「用户名需 3–20 个字符，仅限字母、数字和下划线。」
2. **表单级错误（提交失败）**：tint 底 #FAEDE9 + coral 图标 + coral-deep 标题，下方给出重试动作；不整页跳转。
3. **业务冲突错误（409 接力冲突）**：见 Components 的接力冲突提示；必须解释"这段已被接走"并给出两个出口动作，不许静默失败或只弹 toast。
4. **网络 / 上传失败**：已录内容保留在内存，提供「重试上传」与「本地回放确认」；用 warning（不是 danger），因为数据未丢。
5. **权限错误（麦克风被拒）**：danger 态说明 + 分平台修复指引（Chrome / Safari 的授权入口），不使用系统 alert。
6. **空态 ≠ 错误态**：无内容用空态（中性色 + 图标 + 说明 + 行动按钮），失败才用错误色。
7. 技术约束：错误提示不改变元素尺寸（预留 min-height），不产生横向滚动，就近出现在对应元素旁（不集中堆到页面顶部）。

## Accessibility

原文档缺失，本节补齐（WCAG 2.1 AA 为下限）:

- **对比度**：正文与 UI 文字 ≥4.5:1；≥24px（或 ≥19px bold）标题 ≥3:1；图标、输入框描边、focus ring 等非文本 UI ≥3:1。色板实测最低承载文字对比度 **4.57:1**（`coral` 作强调文字时 on wave-white；`coral` 默认只作填充，正文/次要文字最低 5.05:1 = slate-current on tide-pool），全部达标。
- **焦点**：全站键盘可达；focus ring 2px peacock + offset 2px，任何情况下不被 `overflow: hidden` 裁掉。
- **动效**：尊重 `prefers-reduced-motion: reduce` —— 关闭水波漂移、涟漪扩散与列表交错，入场动画降级为 150ms opacity 淡入；spring 120/20 在此模式下直接吸附终值。
- **触控**：可点目标 ≥44×44px；底部固定条与列表行用 padding 撑满可点区，不靠伪元素外扩。
- **语义结构**：一页一个 `<h1>`；时间轴用有序列表；接力状态用 `aria-live="polite"` 播报（"接力成功，等待下一位"）；装饰性水波/涟漪 `aria-hidden="true"`。
- **表单**：label 与控件显式关联；错误用 `aria-invalid` + `aria-describedby`；纯图标按钮必须带 `aria-label`。
- **媒体**：录制/播放控件支持键盘操作与文字状态（"录制中 00:12 / 30"），不依赖波形颜色表达进度。
- **语言**：`<html lang="zh-CN">`；中英混排中的拉丁专名（歌名等）用 `lang="en"` 局部标注。
- **动效不可作为唯一反馈**：状态变化必须同时有文案或图标。

## Do's and Don'ts

- No emojis in UI — use icon system only (Lucide, Heroicons)

- No pure black (#000000) — use off-black or charcoal variants

- No oversaturated accent colors (saturation cap: 80%)

- No 3-column equal-width feature layouts — use zig-zag or asymmetric grid

- No `h-screen` — use `min-h-[100dvh]`

- No AI copywriting clichés: "Elevate", "Seamless", "Unleash", "Next-Gen"

- No broken external image links — use picsum.photos or inline SVG

- No generic lorem ipsum in demos

- Do 水波与浪线（wave contours）作为区块边界与导引

- Do 河道式导引线（channel guides）串起接力路径

- Do 涟漪（ripples）标记状态变化与落点

- Do 漂流瓶母题（drift bottle）—— 内联 SVG，唯一可被"追踪"的具象元素

- Do Elegant typography

- Do Nature-inspired illustrations（水、河道、瓶、潮汐，不做花卉）

- Don't 花卉 / whiplash 卷草 / stained glass 彩窗纹样（原文母题已作废）

- Don't 用圆角堆叠"画"瓶子，或让装饰进入内容区遮挡文字

- Don't 把深水暗底当作 dark mode —— 不提供主题切换与 dark variant

- Don't 使用 jsDelivr、fonts.googleapis 或任何 CDN 字体（离线 demo 必须 npm 自托管 woff2）

## Use Case

桌面为主要场景的 Web 应用（1440px 为主场景，1280px 容器居中 + 1.5rem 侧边距；768px 折叠多列；移动端做可用性适配，H5 可用）。场景：匿名接力音乐共创社区「音乐漂流瓶」——登录/注册 → 选歌 → 录制 15–30 秒片段 → 投瓶入海 → 他人取瓶接力 → 成品试听 → 漂流日志。核心页面：首页（今日海面 / 我的瓶子）、录制页、接力页、成品页、漂流日志、审核后台。

模板元数据里原文的 "Landing pages, SaaS" 已作废：本系统的全部 token 按桌面主场景（侧栏四入口 IA、1440px 评审）约束，**同时**保证移动端可用性四条硬底线——无横向溢出、触控目标 ≥44px、录音可用（含权限被拒降级）、关键闭环在 375px 可完成；桌面与移动共用同一套 token，不引入第二套主题。
