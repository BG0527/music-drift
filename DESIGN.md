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
  animatedProperties: [transform, opacity]
zIndex:
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
- **Spacing rhythm:** Balanced. Base unit: 0.5rem (8px).
- **Section vertical gaps:** clamp(4rem, 8vw, 8rem).
- **Hero layout:** Asymmetric composition.
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
