---
version: "record-v1"
name: "Record Drift"
description: "桌面为主要场景的 Web 应用（移动端可用性适配）的唱片主题设计 token：沟槽 / 标签盘 / 水面 / 漂流瓶。用于『音乐漂流瓶』匿名接力音乐共创社区。Tokens only — no component code."
colors:
  # ── 基底与文字（record-v1 公共层）────────────────────────────────────
  ink: "#050F14"
  paper: "#F3F9FA"
  muted: "#A9C7CF"
  # ── 三种光：冷光 / 唯一强调色 / 暖光 ─────────────────────────────────
  glass: "#7FD1D9"
  coral: "#D4553A"
  warm: "#F6D79A"
  # ── 水光冷色族（11 页实测的高频手写值，本版收成具名 token）──────────
  # 用法一律是「基色 + alpha 派生」：沟槽/水线 rgba(line,.055~.13)、掠光
  # rgba(water-deep,.028~.065)、冷边 rgba(water-mid,.7)、遮罩 rgba(water-void,.78)。
  water-light: "#EAFCFF"
  water-mid: "#CBEEF6"
  water-deep: "#E4F7FC"
  water-void: "#031117"
  water-bed: "#0A303C"
  water-body: "#12414F"
  water-surface: "#1D5F70"
  line: "#D8F3F6"
  # ── 语义四件套（深底重算；色相全部取自上面的语言色，不引入新色相）──
  # danger 是 coral 的**提亮档**（75% coral + 25% paper），因为 coral 原文压在
  # 自己的 12% 淡底上只有 4.33:1，不到正文 4.5:1 下限。详见 §Semantic & Status。
  success: "#7FD1D9"
  warning: "#F6D79A"
  danger: "#DC7E6A"
  info: "#A9C7CF"
  success-tint: "#14262C"
  success-border: "#427077"
  warning-tint: "#222724"
  warning-border: "#716950"
  danger-tint: "#1E1719"
  danger-border: "#AB4732"
  info-tint: "#19252A"
  info-border: "#576B72"
  # ── 过渡别名（**迁移期专用**；旧名 re-point 到新值，S8 整批删除）──────
  # 语义同角色映射：wave-white（页面底）→ ink、abyss（正文）→ paper、
  # sea-glass（冷光）→ glass、coral-deep（危险文字）→ coral …
  # 这些名字在新语言里**会撒谎**（wave-white 现在是近黑、abyss 是近白），
  # 完整对照与高危清单见 §Colors · 迁移别名。
  wave-white: "#050F14"
  foam: "#EAFCFF"
  tide-pool: "#031117"
  mist: "#D8F3F6"
  driftline: "#CBEEF6"
  deep-current: "#12414F"
  trench: "#0A303C"
  night-ink: "#031117"
  peacock: "#D4553A"
  peacock-deep: "#1D5F70"
  peacock-active: "#D4553A"
  lagoon: "#CBEEF6"
  sea-glass: "#7FD1D9"
  abyss: "#F3F9FA"
  slate-current: "#A9C7CF"
  on-dark-muted: "#A9C7CF"
  coral-deep: "#D4553A"
gradients:
  # 规则：**只允许由既有 colors 组合**，不得借"加渐变"发明新颜色。
  # 河道剖面的水体：水面 → 中层 → 河底（越往下越深）。
  # 三个 stop 的名字沿用过渡别名（机器守卫把这三个名字钉在渐变里），
  # 它们现在分别指向 water-surface / water-body / water-bed：
  #   #1D5F70 → #12414F → #0A303C（明度 0.096 > 0.045 > 0.025，单调变深）。
  river: "linear-gradient(180deg, {colors.peacock-deep} 0%, {colors.deep-current} 44%, {colors.trench} 100%)"
typography:
  hero:
    fontFamily: Quattrocento
    fontSize: 56px
    fontWeight: 700
    letterSpacing: "-0.02em"
  h1:
    fontFamily: Quattrocento
    fontSize: 26px
    fontWeight: 700
  h2:
    fontFamily: Quattrocento
    fontSize: 19px
    fontWeight: 700
  body-md:
    fontFamily: Quattrocento
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  body-cjk:
    fontFamily: '"LXGW WenKai", "LXGW WenKai Screen", Quattrocento, "Songti SC", "Noto Serif SC", serif'
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.6
  ui-label:
    fontFamily: 'Quattrocento, "LXGW WenKai", ui-serif, system-ui'
    fontSize: 13px
    fontWeight: 500
    letterSpacing: "0.01em"
  meta:
    fontFamily: 'Quattrocento, "LXGW WenKai", serif'
    fontSize: 11px
    fontWeight: 400
    letterSpacing: "0.24em"
  mono:
    fontFamily: '"JetBrains Mono", ui-monospace, monospace'
    fontSize: 14px
    fontWeight: 400
rounded:
  none: 0
  sm: 1px
  md: 2px
  base: 2px
  lg: 4px
  xl: 4px
  "2xl": 6px
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
  # 漂流瓶沿河道通过（河道剖面的主角装饰）。与 drift 的区别：drift 动的是**整面水纹**
  # （幅度小、周期 24s），passage 动的是**一只瓶子**（幅度大、周期更长）。
  # 判据仍是"低速度"而不是"低幅度"：46s 走 320px ≈ 7px/s，比水纹还慢 ⇒ 不争夺注意力。
  passageDuration: 46000ms  # 一个来回（配 alternate）
  passageShift: 160px       # 单程位移幅度（±160px）
  # ── 第 4 轮 #8（静态站动效，W17）补的两条 ────────────────────────────────
  # 补这两条不是因为"想加动效"，而是落地时**确实缺这两个值**：缺了就只能在
  # CSS/JS 里内联一个新数字，那正是 §动效纪律禁止的事。
  reducedMotionEntryDuration: 150ms  # reduced-motion 下的入场：**只 opacity 淡入、不动位移**。
                                     # 值不是我定的 —— 它是 §Accessibility 与「零装饰动效规则」第 4 条
                                     # 早先写下的裁定（"入场降级为 150ms opacity 淡入"），这里只是把它
                                     # 从散文变成 token，好让代码引用名字而不是数字。
  castRippleDuration: 1200ms  # 投/捞落点的「事件涟漪」（§Elevation 的 ① 事件涟漪）**总时长**，
                              # 同时就是跳转前的等待：用户裁决「播完（~1.2s）再跳转」。
                              # 这是全站**唯一**允许用动效延后跳转的地方。
                              # 落地与取证：`site/patches/river.css` + `site/app/page-river.js`
                              # （探针 `.tmp-w17/probe-motion.mjs` 断言"三圈末圈 end = 这个数"）。
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
  # ── 河道剖面（本轮）──────────────────────────────────────────────────
  currentLineAlpha: 0.42   # 河道主流线的强度。主流线的形状是**声波包络**（音乐母题），位置在水里（河道母题）
  lightShaftAlpha: 0.05    # 水下光柱强度。极淡是**故意的**：它只说"这里更深"，不照亮正文、不与内容争亮度
  surfaceLineAlpha: 0.7    # 水线（岸与水体的分界）强度。全页唯一一条横线，故可以比别的装饰更实
  # ── record-v1 装置（S2；母题装置库见 §Elevation & Depth）──────────────────
  # 纪律：**所有**强度/周期只在这里定义，theme.css 暴露为 --motif-*，
  # 样式层（water.css）与组件层只许引用变量 —— 不许内联 alpha / px（守卫：__tests__/water-motif.test.tsx）。
  platterAlpha: 0.055      # 盘面（platter）同心沟槽的强度：rgba(line,.055)，周期见 textureLineGap
  glintAlpha: 0.065        # 掠光（glint）峰值强度：rgba(water-deep,.065)（契约正文的范围 .028~.065 取上界）
  hairlineMix: 13%         # 1px 细线 / 沟槽底：rgba(line,.13)，用于 border-hairline 与 .groove-bed
  grooveLitAlpha: 0.9      # 被点亮的沟槽（groove = 河道）强度。它**承担信息**（= 已录段位），故近乎全亮
  rippleRingAlpha: 0.32    # 涟漪（ripple）环强度。同心扁椭圆，断弧可编码缺口（事件涟漪只播一次）
  ringAlpha: 0.42          # 圆盘外环第 1 圈的强度（承重的边界装置，合成后对 ink 必须 ≥3:1）
  ringFalloff: 0.5         # 每往外一圈的强度衰减 ⇒ .42 / .21 / .105
  ringInset: 13px          # 外环第 1 圈相对盘身的偏移（圆的语法 §Shapes：外环最多 3 圈）
  ringStep: 16px           # 每圈递增偏移 ⇒ 13 / 29 / 45（与语言契约 §1.5 逐条一致）
  discCoreAlpha: 0.78      # 盘身（径向内层 water-bed → water-void）的强度。盘身**不填彩色**
  discEdgeCoolAlpha: 0.7   # 盘缘冷光：rgba(water-mid,.7)（"捞取"一侧）
  discEdgeWarmAlpha: 0.66  # 盘缘暖光：rgba(warm,.66)（"投下"一侧）
zIndex:
  underlay: -1   # 装饰层：在宿主背景**之上**、内容**之下**（宿主必须 isolate，否则会被背景盖住）
  base: 0
  sticky: 100
  overlay: 200
  modal: 300
  toast: 500
components:
  # record-v1：唯一的强调色是 coral，**实心 coral 填充上的文字一律用 ink**（双向 4.76:1）。
  button-primary:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.ink}"
    padding: 12px
    borderRadius: "{rounded.base}"
    fontWeight: 600
  button-ghost:
    backgroundColor: transparent
    borderColor: "{colors.muted}"
    borderWidth: 1px
    textColor: "{colors.coral}"
    padding: 12px
    borderRadius: "{rounded.base}"
  card:
    backgroundColor: "{colors.ink}"
    borderColor: "{colors.line}"
    borderWidth: 1px
    borderRadius: "{rounded.base}"
    shadow: none   # record-v1：不用阴影造层次，用亮度差与 1px 细线
  input:
    backgroundColor: "{colors.water-void}"
    borderColor: "{colors.muted}"
    borderWidth: 1px
    textColor: "{colors.paper}"
    borderRadius: "{rounded.md}"
    focusRing: "2px {colors.coral} offset 2px"
---

## Overview

Record Drift is the visual system for a desktop-primary web app with mobile usability: an anonymous relay music community where one person drops a song into a bottle, someone downstream picks it up, records the next segment, and lets it drift on.

The product has four themes — **海洋 (ocean) · 河道 (river channel) · 漂流瓶 (drift bottle) · 音乐 (music)** — and the visual language of this version is **a vinyl record lying in water**. The record is the *carrier of music*, not the product itself:

- **一条沟槽 = 一条河道**（the groove is the channel the relay travels along）
- **一枚标签盘 = 一支作品**（the label is one work's identity）
- **唱针 = 播放头**（the stylus is the playhead）
- **印章 = 裁决**（the stamp is a moderation verdict）

The iron rule of this version (from the 11-page design contract): **母题必须承担信息，不能只做背景** — every device must encode something, and no page may be "a generic dark dashboard". Each page carries at most two devices, and adjacent pages must not repeat the same one.

- Density: 4/10 — Spacious (information carried by lines and light, not by boxes)

- Variance: 8/10 — Expressive

- Motion: 3/10 — Quiet (decoration does not move; see §Elevation & Depth)

- **Style:** Deep-water, Grooved, Quiet

- **Keywords:** vinyl record, groove, river channel, waterline, drift bottle, anonymous relay, music collaboration, hand-to-hand

- **Era:** Contemporary — 当代唱片与水

- **Light/Dark:** ✗ No light / ✓ Dark only（本版**只有深底**，不提供主题切换，也没有 light variant）

## Colors

底色一律是 `ink`；文字只有两档（`paper` / `muted`）；彩色只有三种光（`glass` / `warm` / `coral`）。语义名 · 值 · 用途 · 实测对比度（WCAG 2.1，底色 = 页面底 `ink` #050F14，除注明外）。

**基底与文字**

- **ink** (#050F14) — 盘面底 / 页面基底 / 卡片底。**禁纯黑 #000000**（纯黑会让沟槽纹理与水面光带失去层次）。
- **paper** (#F3F9FA) — 正文与标题（对 ink **18.20:1**）。
- **muted** (#A9C7CF) — 次要文字、元信息、说明、时间戳、placeholder（对 ink **10.84:1**）。**这是文字的暗端下限**：不得再引入比它更暗的文字色。

**三种光**

- **glass** (#7FD1D9) — **冷光**：链接、已达成、冷边（环形外环、冷色描边）。对 ink **11.08:1**。
- **coral** (#D4553A) — **唯一强调色**：标签盘、印章、当前项、危险态填充、主 CTA。
  - 作文字 / 线压在 ink 上 = **4.76:1** ✓（旧值 #C7452C 只有 3.98:1，被用户裁决替换）。
  - 作**实心填充**时，其上的文字**一律用 `ink`** = **4.76:1** ✓；压纸白字只有 3.83:1 ✗ —— 所以「`ink` ↔ `coral`」这一对**双向都达标**，一个 token 就解掉了填充与文字互相拉扯的矛盾。
  - **12–16% 的 coral 淡底不算填充**：那种底上的文字照旧用 coral 的提亮档 `danger`。
- **warm** (#F6D79A) — **暖光**：等待态、「投下」一侧、暖边（`rgba(warm,.66)`）。对 ink **13.92:1**。

**水光冷色族**（11 页实测高频手写值，本版收成 token；**只准以「基色 + alpha」派生，不得写死新的 hex**）

| token | 值 | 在画面里是什么 | 典型派生 |
| --- | --- | --- | --- |
| `water-light` | #EAFCFF | 最亮的水光（字形高光、承板） | `rgba(234,252,255,·)` |
| `water-mid` | #CBEEF6 | 冷边光（环、冷描边） | `rgba(203,238,246,.7)` |
| `water-deep` | #E4F7FC | 掠光（glint）与细线 | `rgba(228,247,252,.028~.065)` |
| `line` | #D8F3F6 | 沟槽线 / 水线基色 | `rgba(216,243,246,.055~.13)` |
| `water-bed` | #0A303C | 盘面内层（水体基层） | 盘面径向填充的亮端 |
| `water-body` | #12414F | 水体（沉浸式区块底） | 河道剖面中层 |
| `water-surface` | #1D5F70 | 水面（剖面顶层） | 河道剖面第一段 |
| `water-void` | #031117 | 沟槽底 / Modal 遮罩 | `rgba(3,17,23,.78)` |

- `water-bed / water-body / water-surface` 是**有层次的深水**（明度 0.025 < 0.045 < 0.096）：越往下越深。它们**只作面**，不承载文字（对 ink 只有 1.75:1）。
- 分隔线不新造颜色：细线取 `rgba(line, .13)` 或 `rgba(paper, .13)`；沟槽取 `rgba(line, .055)`。

**迁移别名（过渡期专用，S8 删除）**

旧契约（`ocean-v1`）的名字全部保留并 **re-point 到新值**，语义同角色映射。**它们会撒谎**——这是迁移期已知的代价，逐条记账：

| 旧名 | 旧角色 | 现在指向 | 是否撒谎 |
| --- | --- | --- | --- |
| `wave-white` | 页面底色 | `ink` #050F14 | **是**（"白"现在是近黑） |
| `abyss` | 正文 | `paper` #F3F9FA | **是**（"深渊"现在是近白） |
| `foam` / `tide-pool` | 卡片面 / 凹陷面 | `water-light` / `water-void` | **是**（卡片面现在是浅水光面） |
| `mist` / `driftline` | 装饰细线 / 交互边界 | `line` / `water-mid` | 否（仍是"线"） |
| `deep-current` / `trench` | 深水暗底 / 抬升层 | `water-body` / `water-bed` | 部分（"抬升"不再靠变亮） |
| `night-ink` | Modal 遮罩 | `water-void` | 否 |
| `peacock` / `peacock-active` | 品牌主色 / 按下态 | `coral` | **是**（"孔雀蓝"现在是珊瑚红） |
| `peacock-deep` | 主按钮 hover 底 | `water-surface` #1D5F70 | **是**（为了 `gradients.river` 的第一段仍是一幅水，见下） |
| `lagoon` / `sea-glass` | 装饰水色 / 冷光 | `water-mid` / `glass` | 否 |
| `slate-current` / `on-dark-muted` | 次要文字 | `muted` | 部分 |
| `coral-deep` | 危险文字 | `coral` | 部分（新语言只有一个强调色） |

- `gradients.river` 的三个 stop 名字由机器守卫钉死（`water-motif.test.tsx` 要求含 `peacock-deep` / `deep-current` / `trench`），因此**不允许**在这里改成新名；它们现在分别解析为 `water-surface` / `water-body` / `water-bed`，剖面因此是真正的水（越往下越深）。
- 迁移期**唯一已知的坏组合**：`bg-foam` + `text-abyss` = 浅水光面 + 近白文字 = **1.01:1**（不可读）。原因是 `pages/__tests__/deep-surface-cta.test.ts` 的 token 关系守卫要求 `foam` 与 `deep-current` 相差 ≥3:1、且 coral 固定为 #D4553A ⇒ `foam` 必须落在浅端。**S2/S3 起逐页消除**，不要在新代码里写这个组合。

规则：

- 文案可读性硬约束：**所有承载文字的颜色 ≥4.5:1**（≥24px 或 ≥19px bold 时 ≥3:1）；非文本 UI 边界与图标 ≥3:1。
- **不引入新色相**：整份色板只有「近黑 / 近白 / 冷青 / 暖沙 / 珊瑚」五个色相族。语义状态色也从这五族里取（见 §Semantic & Status Colors），**禁止**为了"成功绿"再加一个绿色。
- 珊瑚点缀占画面 <10%；彩色只出现在边缘微光、当前项、印章与主 CTA 上，**盘身不填彩色**。

## Typography

- **Display / Hero:** Quattrocento — Weight 700, line-height 1, tracking tight
- **Body:** 霞鹜文楷 LXGW WenKai — 中文正文，line-height 1.85
- **Metadata:** Quattrocento — `11px` + `letter-spacing: .24em`（如 `SIDE B · 已入海`、`QC · 母版检验`）
- **Monospace:** JetBrains Mono — 码率、时长等技术值

字号阶梯（来自 11 页实测，**只有这些档**）：

| 档 | 值 | 用途 |
| --- | --- | --- |
| hero | 56–62px | 页面主标题（**例外**：河道标杆页允许 76–84px —— 既成的视觉层级，写明白而不是留着不一致） |
| h1 | 26px | 区块标题、作品名 |
| h2 | 19px | 卡片标题 |
| lead | 17px | 引导句 |
| body | 14.5–15.5px | 正文（中文 1.85 行高） |
| ui | 13px | 界面标签、按钮 |
| small | 12.5px | 次要说明 |
| meta | 11px / `.24em` | 元信息（封套/母版号/时间戳） |
| micro | 10px | 刻度、刻度旁的极小标注 |

中文排版要求：

- 页面正文块的目标档是 **14.5–15.5px / 1.85**（S2+ 逐块落地）；**`body` 基线本轮不动**（仍是 1rem/1.6）—— 一次性改全站纵向节奏会撞「一屏装下」门禁，而 S1 没有截图验证手段。中文**不使用负 letter-spacing**，字距恒为 normal。
- 副标题（`--muted`）**宽度 ≤ 820px**；中文正文目标 30–40 字/行。
- 中英混排的元信息用 `.meta` 栈（Quattrocento → 中文回落到文楷），**不要让中文落到系统衬线**（那等于偷偷引入第三种字体）。
- 中文标点用全角；中英之间保留 1/4 空，不靠硬编码空格。
- 示例句（可读性自检）：「把副歌留给下一个人。你只录 15–30 秒，剩下的交给漂流。」

字体自托管（**合规红线：禁止任何 CDN 引用**）：

- 中文正文：`lxgw-wenkai-webfont`（楷体的手写笔意 = 匿名手写接力）；拉丁 / 数字：`@fontsource/quattrocento`（航标 + 手迹的对照）。两者都是 **npm 包 → 本地 woff2 → `@font-face`**，`font-display: swap`。
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

## Layout

- **Grid:** CSS Grid primary. Max-width containment: 1280px centered with 1.5rem side padding.
  - **侧边距分档**：**移动 1.5rem（24px）**；**桌面 48px**（出处：`docs/ui-review/visual-audit.md` B5，Figma 帧实测 40/48）。
- **Spacing rhythm:** Balanced. Base unit: 0.5rem (8px).
  —— 这里的 Base unit 指**节奏步长**（间距只取 8px 派生档：4/8/12/16/24/32/48/64）。
  它**不是** Tailwind `--spacing` 的值：后者的语义是「**尺度值 1 的长度**」，本项目取框架默认 `0.25rem`（=4px），
  因此节奏档用**偶数**表达（`p-2` = 8px、`p-4` = 16px、`p-6` = 24px、`p-8` = 32px、`p-12` = 48px、`p-16` = 64px），
  4px = `p-1`，44px 触控底线 = `min-h-11`（`--touch-target-min: 44px`）。
  **禁止覆盖 `--spacing`** —— 覆盖会让**每一个**数字档 utility ×2（`min-h-11` 变 88px、侧栏 `w-64` 变 512px）。
- **Section vertical gaps:** clamp(4rem, 8vw, 8rem)。
  - **适用范围限定**：上式**仅适用于有纵向余量的场景**；**H5「一屏装下、禁止下滑」语境取 32–40px**。
- **Feature sections:** Asymmetric grid with varied card sizes. No 3-equal-columns.
- **Mobile collapse:** All multi-column layouts collapse below 768px. No horizontal overflow.
- **z-index contract:** base (0) / sticky-nav (100) / overlay (200) / modal (300) / toast (500).

响应式落地（设计稿是 1440×900 固定画布，真实前端必须重排）：

- 设计顺序：桌面主场景（1440px 评审稿、1280px 容器居中）→ 768px（折叠阈值）→ 375px（可用性适配验证）；窄屏下容器退化为 100% 宽 + 1.5rem 侧边距。
- **出血装饰必须包在 `overflow: hidden` 的容器里**，否则撑大 `scrollWidth` = 横向溢出（设计稿里叫 `.clip`）。
- 触控目标 ≥44px 见方，相邻可点目标间距 ≥8px；底部固定条预留 `env(safe-area-inset-bottom)`，纵向高度用 `min-h-[100dvh]`（**禁 `h-screen`**）。
- 单列优先：一次只让用户做一件事（选歌 → 录制 → 投瓶 → 取瓶 → 交接），接力路径以河道式纵向流呈现。
- **深底不是"深色模式"**：全站只有这一个主题，不提供切换、不按 `prefers-color-scheme` 反转。

## Composition

### 河道页（`/river`）· 河道剖面

用户指令：「必须高级符合人类审美地好看，因为这是参赛作品」；同一份指令要求**默认态不许出现漂流瓶**（"只有水在流"）。河道页因此**不用卡片**组织，改用一幅**剖面**：一条水线横贯内容区，岸在上、水在下，两个等权的泊位骑在这条河上。

```text
┌ 岸（ink + 沟槽质感）──────────────────────────────────────────────┐
│  暖流河道（hero 档标题）                        我参与过的漂流瓶   │
│  拾起那些搁浅在黑夜里的声线                                       │
├──────────────────────── 水 线（唯一横线 · line）───────────────────┤
│  水体（gradients.river：water-surface → water-body → water-bed）  │
│    ◎ 捞取（下游）                     投下 ◎（上游）              │
│    捞一个漂流瓶                        投下一支漂流瓶             │
│    ～～～～～～ 河道主流（= 声波包络）～～～～～～  瓶子的缺席可读  │
│    〔全部〕〔深夜〕〔通勤〕〔告白〕〔雨天〕  ← 浮标                │
└──────────────────────────────────────────────────────────────────┘
```

- **为什么不是两张卡**：同宽同高同圆角的两张卡片会把「捞」与「投」读成两个并列功能；剖面把它们读成**同一条河上的两个位置**（下游接住 / 上游放下）——这正是产品规则（单支路河道）的形状。
- **「等权」仍然成立**：两个泊位共用同一份尺寸定义，只有颜色与图标不同（`glass` / `coral`）。**禁止**只改其中一个。
- **流向由右向左**（上游在右）：`投下` 在右、`捞取` 在左，与阅读顺序一致；方向由航迹与瓶子漂移共同暗示，**不写文字解释**。
- **四个主题装在一幅画里**：海洋（水体渐变 + 光柱）、河道（水线 + 主流 + 上下游）、漂流瓶（漂过的瓶）、音乐（主流 = 声波包络）。
- **一屏**：本构图不为 900px 砍画面（用户本轮明确豁免该门禁）。门禁脚本本身没有被放宽：`apps/web/tools/one-screen-check.mjs` 的阈值一字未改。

## Elevation & Depth

Water contours, tide lines, river-channel guides, ripples, drift-bottle silhouettes, glass-water surfaces, subtle gradients, luminous depth cues。装饰只出现在区块边缘与状态切换处，**不进入内容区**。

- **不用阴影造层次**：层级由**亮度差 + 1px 细线**表达（这是本版与上一版最大的形态差异）。阴影只允许出现在浮层（Modal / Sheet / Toast）与浮动条上。
- **Physics:** Spring — stiffness 120, damping 20. Confident, weighted transitions.
- **Entry animations:** Fade + translate-Y (16px → 0) over 480ms ease-out. Staggered cascades for lists: 100ms between items.
- **Hover states:** Scale(1.03) + 亮度变化 over 200ms（不抬阴影）。
- **Page transitions:** Fade + slide (300ms).
- **Exit animations:** 一切退场（Modal / Toast / 页面）用 `exitDuration`（240ms）——**更短**因为人已经知道结果了。**进出必须配对**：有入场就必须有退场。
- **Ripples — 两个角色，不可混为一谈**:
  - **① 事件涟漪（event ripple）**：**标记状态变化与落点**（投/捞的落点、入海、接力交接）。**短暂、事件驱动、只播一次**。
  - **② 场景涟漪（scene ripple）**：常驻水面母题。**允许 `infinite` 常驻**，但只有在同时满足「**低幅度 + 低速度、不争夺注意力**」与「`reduced-motion` 下静止」时才成立；它**不进内容区**、不承载任何信息（`aria-hidden`）。
- **Toast 生命周期:** 成功 3000ms / 信息 5000ms 后自动退场（退场用 `exitDuration`）；**错误常驻到手动关闭**（`toastErrorPersistent`）——错误不许静默消失。

### 母题装置库（motif · 每页至多 2 个，必须承担信息）

| 装置 | 它在编码什么 | 归属 |
| --- | --- | --- |
| **platter（盘面）** | 世界的底：`repeating-radial-gradient` 的同心沟槽（周期见 `motif.textureLineGap`，`rgba(line,.055)`）+ 径向内层（`water-bed`） | 每页背景层（密度按页微调） |
| **glint（掠光）** | 世界的"上方"、瓶子来的方向（一条 101° 的斜向掠光，`rgba(water-deep,.028~.065)`，`mix-blend-mode: screen`） | 每页顶部或斜穿；河道页必用 |
| **groove（沟槽 = 河道）** | 段位进度与接力路径：一条沟槽 = 一条河道，被点亮的沟槽 = 已录段位 | 河道、公海大厅/详情、选歌、瓶子详情 |
| **waterline（水线）** | 分界与状态：岸/水之分、线上（别人看得到）/线下的匿名边界、浮上来（待处理）/沉下去（历史裁决） | 设置、审核台；河道剖面的唯一横线 |
| **ripple（涟漪）** | **刚刚发生过的事**（落下 / 捞起 / 入海）；同心扁椭圆，断弧可编码缺口 | 交互发生处 |
| **bottleMark（漂流瓶）** | 一支正在漂的作品：瓶身 + 木塞 + 里面的纸条/声波；水位 = 已录段数 | 河道（待捞）、瓶子详情（主角）、公海（已到岸） |

- 装置必须**承担信息**：只画一颗大圆 = 失败；一页里只有唱片元素、没有水或瓶 = 不合格。
- 漂过河道的**漂流瓶（passage drift）**是全站唯一一个「会走完一段路」的装饰——因为那一页就是河道。
- **浅底已不存在**：本版页面底恒为 `ink`，上一版「浅底装饰强度上限 `textureAlphaLight`」只在过渡别名仍在被引用时才有意义。
- 装饰三条硬约束（同时成立）：① 一律 `aria-hidden="true"` + `pointer-events-none` + **绝对定位**（零布局高度，因此不会破坏"一屏装下"）；② 只出现在**区块边缘**，不进入内容区、不压在正文之下；③ 含一条**低幅度常驻漂移**（water drift，参数取 `driftDuration` / `driftShift`，**只动 `transform`**、CSS 动画实现，因此被全局 `reduced-motion` 重置冻结为静止）。

### 零装饰动效规则（本版新增，硬规则）

1. **静止是默认**：母题层（platter / glint / groove / waterline / ripple 的静态形态 / bottleMark）**默认零动效**；页面不得为了让画面"活"而给装饰加入场、呼吸、闪烁。
2. **只允许两种例外**：① 上述**低幅度常驻漂移**（唯一允许的常驻动画）；② 事件涟漪（一次播完即停）。除它们之外，任何装饰动画 = 违规。
3. **动效只用于状态过渡**（进入 / 离开 / hover / 按下 / 加载 / 播报），且**只动 `transform` / `opacity`**；禁止动画 `width` / `height` / `top` / `left` / `margin` / `box-shadow` 的尺寸与位置。
4. `prefers-reduced-motion: reduce` 时：漂移、涟漪、交错全部冻结，入场降级为 150ms opacity 淡入。

- **Performance:** Only transform and opacity animated. No layout-triggering properties.

深度层级（形态语言）:

| 层级 | 视觉表现 | 语义 |
| --- | --- | --- |
| L0 surface | `ink` 平底 + platter 沟槽 | 盘面：内容背景 |
| L1 raised | `ink` + 1px `rgba(line,.13)` 细线（**无阴影**） | 卡片 / 列表行 |
| L2 floating | `water-void` + 1px `rgba(line,.2)` + 阴影（仅浮动条/播放器） | 底部固定条 / 播放器 |
| L3 overlay | `rgba(water-void,.78)` + backdrop blur | Sheet / Modal 遮罩 |
| L4 deep | `water-body` / `water-bed`（剖面水体） | 沉浸式区块（剖面水体、成品试听） |

「水深」是本系统的深度隐喻：越"深"的层越沉、线越亮；**永不使用纯黑**。

深水区块约束:

- `water-body` / `water-bed` / `water-void` 只用于**沉浸式区块与浮层**；本设计**不提供主题切换与 dark variant**（页面底恒为 `ink`）。
- 深底上承载文字只允许 `paper`（18.20:1）与 `muted`（10.84:1）；`glass` 只用于图标、线、装饰与水波高光。
- 深底区块不做自动明暗反转；过渡只允许 opacity。

## Shapes

Base corner radius: 2px. See rounded tokens in front matter for the full scale.

Rounded tokens 全量（record-v1 圆角纪律：**圆角 ≤4px**，除 `pill` 与 `full`）:

| Token | 值 | 用途 |
| --- | --- | --- |
| `rounded-none` | 0 | 全宽分隔条、贴边面板 |
| `rounded-sm` | 1px | 刻度、1px 细线端点 |
| `rounded-md` | 2px | 输入框、下拉、时长徽标 |
| `rounded-base` | **2px** | **基准**：按钮、卡片、列表行 |
| `rounded-lg` | 4px | 面板、内袋 |
| `rounded-xl` | 4px | 浮动条、播放器容器 |
| `rounded-2xl` | 6px | 全屏容器（**上限**） |
| `rounded-pill` | 999px | 胶囊标签（慎用：只有"必须可滚动的一排"才用） |
| `rounded-full` | 50% | 圆盘、标签盘、纯图标圆形按钮（§圆的语法） |

形态规则:

- 圆角只允许来自上表，**禁止任意值**（如 11px、23px）。
- **「圆的语法」是唯一的例外**：`border-radius: 50%` 与**半圆**（半径 = 高度/2，例如唱片封套的开口指孔）**允许**；禁止的是无理由的"胶囊/药丸"大圆角。
- 漂流瓶母题用内联 SVG 表达（瓶身 + 瓶塞 + 水面光），**不用圆角堆叠去"画"瓶子**。
- 水波 / 沟槽 / 掠光装饰用 SVG path、`repeating-radial-gradient` 或 canvas 绘制，纯装饰层 `aria-hidden="true"`，**不参与布局高度计算**。
- 掩膜（`mask-image`）一律写白（`#fff` / `rgba(255,255,255,α)`）：mask 只读 alpha，写 `rgba(0,0,0,α)` 等价但会撞"禁纯黑"检索。

## Components

Token 绑定（只把抽象词落到唱片语义色，不改下列规范）:
`accent → coral`｜`surface → ink`｜`page → ink`｜`muted / border → muted / line`｜`deep section → water-body`｜`danger → danger`

- **Primary Button:** 2px 圆角，`coral` 实心填充 + **`ink` 文字**（4.76:1）。Hover: 亮度差 + scale(1.03)（**不加外发光**）。Active: `translateY(-1px)`。Font weight 600。
- **Secondary / Ghost Button:** 1px `muted` 描边，文字 `coral`；Hover: 细线提亮，不填充。
- **Cards:** 2px 圆角，`ink` 底 + 1px `rgba(line,.13)` 细线，**无阴影**。
- **Inputs:** label 在输入框上方；1px `muted` 描边，底 `water-void`，文字 `paper`。Focus ring: 2px `coral` + offset 2px。错误文字在下方（`danger`）。**不用浮动 label**。
- **Navigation:** `ink` 底 + 顶部 1px 细线；当前项用 `coral` 指示（1px 竖线 + 字重 500）。
- **Skeletons:** shimmer 条（`shimmerDuration`），**禁用 spinner**。
- **Empty States:** 瓶子 + 说明 + 一个行动按钮（空态是中性色，不是错误色）。

组件 token 明细:

| 组件 | 底 | 文字 | 描边 / 阴影 | 圆角 | 内边距 |
| --- | --- | --- | --- | --- | --- |
| `button-primary` | coral | ink | 无（禁外发光） | 2px | 12px |
| `button-primary:hover` | coral（亮度 +6%） | ink | 细线提亮 + `translateY(-1px)` 无阴影 | 2px | 12px |
| `button-primary:active` | coral | ink | 无 + `translateY(-1px)` | 2px | 12px |
| `button-ghost` | transparent | coral | 1px muted | 2px | 12px |
| `card` | ink | paper / muted | 1px `rgba(line,.13)`，无阴影 | 2px | 16px |
| `input` | water-void | paper | 1px muted；focus 2px coral offset 2px | 2px | 12px |
| `nav` | ink | muted / active coral | 1px muted 上边线 | 4px（顶部） | 8px 12px |
| `skeleton` | water-void + glass 22% shimmer | — | 无 | 与目标组件同值 | 与目标组件同值 |
| `empty-state` | transparent | paper + muted | 无 | — | 24px |

业务组件形态（仅形态约定，不写代码）:

- **作品行（封套背）**：`ink` 底 + 1px 细线 + 右侧 4 格段位刻度（已录 = `glass`，缺口 = 干槽）；曲名 `paper` 19px，元信息 `muted` 11px / `.24em`。
- **段链（4 段）**：横向沟槽，已唱段点亮（`coral` 或 `glass`），缺口显示「这一段还没有人唱」；母版号（`MDB-0001-A`）用 `mono`。
- **录制 / 波形区**：`water-void` 底 + 沟槽质感；波形条 `glass`；已录进度 `water-deep`。
- **播放条**：底部固定 `rounded-xl`，`water-void` 底 + L2 阴影；标题 `paper`、进度槽 `rgba(line,.13)`、已播进度 `coral`。
- **接力冲突提示（409）**：`danger` 文字 + `coral` 图标，说明"这一段已被别人接走"，给出「换一段继续」「放回海里」两个动作，**绝不静默失败**。

## Interaction States

每个交互元素必须定义下列状态的**视觉差异**（颜色 + 形态，不只靠颜色）:

| 状态 | 填充 | 文字 | 描边 / 其他 | 时长 |
| --- | --- | --- | --- | --- |
| default | coral | **ink** | — | — |
| hover | coral | ink | scale(1.03) + 细线提亮 | 200ms |
| active / pressed | coral | ink | translateY(-1px) | 立即 |
| focus-visible | coral | ink | **2px coral ring, offset 2px**（对 ink 4.76:1 ≥ 3:1） | 立即 |
| disabled | `rgba(line,.08)` | muted（不复用低透明度以外的差别） | 无；`cursor: not-allowed`；`aria-disabled="true"` | — |
| loading | 保持当前底色 | 文字保留 + shimmer 条（禁 spinner） | 宽度不跳变（预留占位） | shimmer 1.4s |

- disabled 不受 4.5:1 约束（WCAG 1.4.3 豁免），但必须与 enabled 有形态差异，且不得作为唯一的"不可用"提示。
- 键盘焦点永远可见：移除默认 outline 时必须给 2px coral ring；`:focus` 与 `:focus-visible` 都要覆盖。
- 列表项 hover 同样 scale(1.03)（不做位移式 hover，会触发重排）。
- **状态过渡只允许 `transform` / `opacity`**；颜色变化允许（不触发重排），但禁止动画 `width/height/top/left/margin/box-shadow`。

## Semantic & Status Colors

语义四件套（**色相全部取自本语言已有色**，不引入新色相；每个语义色都给"文字/图标色 + tint 底 + 描边 + 用途"）。tint = 语义色 **12% 覆盖在 `ink` 上**；border = 语义色 **α 覆盖在 `ink` 上**（α 取到 ≥3:1 的最小档）。

| 语义 | 文字 / 图标 | Tint 底 | 描边 | 用途（示例） | 文字对比度 | 非文本（描边） |
| --- | --- | --- | --- | --- | --- | --- |
| success | `success` #7FD1D9（= glass 冷光） | #14262C | #427077 | 投瓶成功、接力完成、成品已生成、「已达成」 | **11.08:1**（tint 上 8.95:1） | 3.52:1 |
| warning | `warning` #F6D79A（= warm 暖光） | #222724 | #716950 | 录制时长接近上限、剩余段位不足、等待态 | **13.92:1**（10.92:1） | 3.54:1 |
| danger | `danger` #DC7E6A（coral 提亮档） | #1E1719 | #AB4732 | 录制/上传失败、账号错误、审核驳回 | **6.67:1**（6.07:1） | 3.39:1 |
| info | `info` #A9C7CF（= muted 中性） | #19252A | #576B72 | 接力进行中、有人取走你的瓶子、系统提示 | **10.84:1**（8.78:1） | 3.46:1 |

- 旧契约（浅底）的 tint 全部作废：**深底上的 tint 是"极暗的一层水"，描边才是发光的那条线**；tint 各自对 `ink` 的对比度 1.10–1.28:1（够分辨，不喧哗）。
- **为什么 `danger` 不是 `coral` 原文**：`coral` #D4553A 压在它自己的 12% 淡底上只有 **4.33:1**（<4.5）；因此危险**文字**用 coral 的提亮档 `#DC7E6A`（75% coral + 25% paper，明度派生，不引入新色相），而危险**填充**仍然用 `coral`（其上文字用 `ink`，4.76:1）。这与旧契约「填充用 coral、文字用 coral-deep」是同一个手法的镜像。
- **为什么 success 与 info 同族**：本语言只有五个色相族（近黑 / 近白 / 冷青 / 暖沙 / 珊瑚），"成功绿"属于**新色相**，被 §Colors 的规则禁止。因此成功 = 冷光（`glass`，语言里「已达成」本来就归它）、提示 = 中性（`muted`）。**代价**：success 与 info 的色相接近 —— 所以**每个语义色必须同时提供非颜色信号（图标 + 文案）**，禁止只靠颜色区分状态。
- 状态色只用于反馈，不用于装饰点缀；珊瑚强调只在 CTA、当前项与危险态出现。

## Error States

错误分层与视觉/文案契约:

1. **字段级错误（输入框下方）**：文字 `danger`（6.67:1）+ Lucide `alert-circle` 14px；边框切 `coral`；`aria-invalid="true"` + `aria-describedby` 指向错误文本。文案必须给出修正动作，禁止只写"输入有误"。
   - 示例：「用户名需 3–20 个字符，仅限字母、数字和下划线。」
2. **表单级错误（提交失败）**：tint 底 #1E1719 + `coral` 图标 + `danger` 标题，下方给出重试动作；不整页跳转。
3. **业务冲突错误（409 接力冲突）**：见 Components 的接力冲突提示；必须解释"这段已被接走"并给出两个出口动作，不许静默失败或只弹 toast。
4. **网络 / 上传失败**：已录内容保留在内存，提供「重试上传」与「本地回放确认」；用 warning（不是 danger），因为数据未丢。
5. **权限错误（麦克风被拒）**：danger 态说明 + 分平台修复指引（Chrome / Safari 的授权入口），不使用系统 alert。
6. **空态 ≠ 错误态**：无内容用空态（中性色 + 图标 + 说明 + 行动按钮），失败才用错误色。
7. 技术约束：错误提示不改变元素尺寸（预留 min-height），不产生横向滚动，就近出现在对应元素旁（不集中堆到页面顶部）。

## Accessibility

WCAG 2.1 AA 为下限:

- **对比度**：正文与 UI 文字 ≥4.5:1；≥24px（或 ≥19px bold）标题 ≥3:1；图标、输入框描边、focus ring 等非文本 UI ≥3:1。深底色板上实测最低承载文字对比度 **4.76:1**（`coral` 作文字 / 线，也等于 `coral` 填充上的 `ink` 文字）；语义色的文字与其 tint 组合最低 **6.07:1**（danger on danger-tint），全部达标。
- **焦点**：全站键盘可达；focus ring 2px `coral` + offset 2px，任何情况下不被 `overflow: hidden` 裁掉。
- **动效**：尊重 `prefers-reduced-motion: reduce` —— 关闭水流漂移、涟漪扩散与列表交错，入场动画降级为 150ms opacity 淡入；spring 120/20 在此模式下直接吸附终值。
- **触控**：可点目标 ≥44×44px；底部固定条与列表行用 padding 撑满可点区，不靠伪元素外扩。
- **语义结构**：一页一个 `<h1>`；时间轴用有序列表；接力状态用 `aria-live="polite"` 播报（"接力成功，等待下一位"）；装饰性沟槽/涟漪 `aria-hidden="true"`。
- **表单**：label 与控件显式关联；错误用 `aria-invalid` + `aria-describedby`；纯图标按钮必须带 `aria-label`。
- **媒体**：录制/播放控件支持键盘操作与文字状态（"录制中 00:12 / 30"），不依赖波形颜色表达进度。
- **语言**：`<html lang="zh-CN">`；中英混排中的拉丁专名（歌名等）用 `lang="en"` 局部标注。
- **动效不可作为唯一反馈**：状态变化必须同时有文案或图标。

## Do's and Don'ts

- No emojis in UI — use icon system only (Lucide)

- No pure black (#000000) — 底用 `ink` / `water-void`（近黑），纯黑会让沟槽与掠光失去层次

- No oversaturated accent colors — 彩色只出现在边缘微光、当前项、印章与主 CTA

- **No 圆角 > 4px**（`pill` / `full` / 半圆除外）；禁止"胶囊/药丸"式无理由大圆角

- **No 用阴影造层次** — 层级用亮度差与 1px 细线；阴影只给浮层与浮动条

- **No `coral` 实心填充上的浅色文字** — 一律 `ink`（双向 4.76:1）

- No 3-column equal-width feature layouts — use zig-zag or asymmetric grid

- No `h-screen` — use `min-h-[100dvh]`

- No AI copywriting clichés: "Elevate", "Seamless", "Unleash", "Next-Gen"；也禁「赋能 / 一键 / 极致体验 / 打造 / 颠覆 / 重新定义 / 无限可能」

- No broken external image links — 一律内联 SVG（外链图在离线 demo 里就是破图）

- No generic lorem ipsum in demos

- No 用「·」把一长串元信息串起来（唱片标签处最多一个）

- Do **沟槽 = 河道**（groove as channel）作为进度与路径的基本语法

- Do **水线（waterline）**作为分界：岸/水、线上/线下、浮上来/沉下去

- Do **涟漪（ripples）**标记状态变化与落点

- Do **漂流瓶母题（bottleMark）**—— 内联 SVG，唯一可被"追踪"的具象元素

- Do **每页至少一个「水 / 河 / 瓶」装置，且它必须承担信息**（不是背景纹理、不是贴纸）

- Do Elegant typography（文楷 + Quattrocento 的"手迹 + 航标"对照）

- Don't 让唱片/沟槽元素占掉超过半页的视觉权重 —— 唱片只是"音乐"这一支的**载体**

- Don't 用圆角堆叠"画"瓶子，或让装饰进入内容区遮挡文字

- Don't 使用 jsDelivr、fonts.googleapis 或任何 CDN 字体（离线 demo 必须 npm 自托管 woff2）

- Don't 在迁移期把 `bg-foam` 与 `text-abyss` 写在一起（1.01:1，见 §Colors · 迁移别名）

## Use Case

桌面为主要场景的 Web 应用（1440px 为主场景，1280px 容器居中；768px 折叠多列；移动端做可用性适配，H5 可用）。场景：匿名接力音乐共创社区「音乐漂流瓶」——登录/注册 → 选歌 → 录制 15–30 秒片段 → 投瓶入海 → 他人取瓶接力 → 成品试听 → 漂流日志 → 审核台。共 11 个页面：河道（标杆）、选一首歌、瓶子详情、登录/注册、公海大厅、公海作品详情、漂流日志、我的、审核台、设置、404。

模板元数据里原文的 "Landing pages, SaaS" 已作废：本系统的全部 token 按桌面主场景（1440px 评审）约束，**同时**保证移动端可用性四条硬底线——无横向溢出、触控目标 ≥44px、录音可用（含权限被拒降级）、关键闭环在 375px 可完成；桌面与移动共用同一套 token，不引入第二套主题。
