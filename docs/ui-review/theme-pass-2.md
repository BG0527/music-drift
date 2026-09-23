# 主题化美化第二批（t44）：浅底母题 + 水感增强 + 漂流瓶母题 + ui-ux CLI 真跑

> 用户第 6 条：「让负责前端的 subagents 再调用所有的前端 skill 来美化前端页面一遍。美化包括但是一定不限于：前端多增加水、河流、海洋、漂流瓶等相关主题元素。」
> 第一批（t43 = commit `6157ebd`）只覆盖**深底**。本文件是第二批：把母题扩到**浅底页**、把偏「规整」的等距水位线改成真水感、补上用户点名的**漂流瓶**母题，并**真跑**新装的 `ui-ux` CLI 取证。
> **引文自检**：本文件下方每条引文我都用 `grep -F` 在本机核对过存在（12 条精确命中，1 条因破折号编码改用安全子串），captain 可原样复核。

---

## 1. ui-ux CLI：**真跑**的原始 stdout（不是"已使用"式声明）

### 1.1 `--help`（证明脚本真实可执行）

```
$ python3 .dsh/skills/ui-ux/scripts/search.py --help
usage: search.py [-h]
                 [--domain {style,color,chart,landing,product,ux,typography,icons,react,web}]
                 [--stack {html-tailwind,react,nextjs,astro,vue,nuxtjs,nuxt-ui,svelte,swiftui,react-native,flutter,shadcn,jetpack-compose}]
                 [--max-results MAX_RESULTS] [--json] [--design-system]
                 [--project-name PROJECT_NAME] [--format {ascii,markdown}]
                 [--persist] [--page PAGE] [--output-dir OUTPUT_DIR]
                 query

UI Pro Max Search
```

### 1.2 ⚠️ 两个必须先说的发现

1. **契约里给的 verify 命令 `python3 .dsh/skills/ui-ux/scripts/search.py --domain style --format json` 是跑不通的** —— `--format` 只接受 `ascii|markdown`，JSON 是**另一个开关 `--json`**。实测原始输出：
   ```
   $ python3 .dsh/skills/ui-ux/scripts/search.py --domain style --format json
   search.py: error: argument --format/-f: invalid choice: 'json' (choose from ascii, markdown)
   ```
   （另外它是**位置参数必填**的：`query` 不能省。）⇒ 我改用等价且合法的 `--json` 跑，原始输出见下。
2. **`--json` 在 Windows 控制台会崩**：`UnicodeEncodeError: 'gbk' codec can't encode character '\u26a0'`（CSV 里有 `⚠`/`⚡` 之类的符号）。
   实测输出：
   ```
   $ python3 .dsh/skills/ui-ux/scripts/search.py "ocean water calm maritime" --domain style --json
   Traceback (most recent call last):
     File ".../ui-ux/scripts/search.py", line 104, in <module>
       print(json.dumps(result, indent=2, ensure_ascii=False))
   UnicodeEncodeError: 'gbk' codec can't encode character '\u26a0' in position 645: illegal multibyte sequence
   ```
   解法：`PYTHONIOENCODING=utf-8`（下文所有输出都是在这个环境下取的）。

### 1.3 `--domain style`（原始 stdout，截取 json 主体）

```
$ PYTHONIOENCODING=utf-8 python3 .dsh/skills/ui-ux/scripts/search.py "ocean water calm maritime" --domain style --json
{
  "domain": "style",
  "query": "ocean water calm maritime",
  "file": "styles.csv",
  "count": 1,
  "results": [
    {
      "Style Category": "E-Ink / Paper",
      "Type": "General",
      "Keywords": "Paper-like, matte, high contrast, texture, reading, calm, slow tech, monochrome",
      "Primary Colors": "Off-White #FDFBF7, Paper White #F5F5F5, Ink Black #1A1A1A",
      "Effects & Animation": "No motion blur, distinct page turns, grain/noise texture, sharp transitions (no fade)",
      "Best For": "Reading apps, digital newspapers, minimal journals, distraction-free writing, slow-living brands",
      "Performance": "⚡ Excellent",
      "Accessibility": "✓ WCAG AAA",
      "Framework Compatibility": "Tailwind 10/10, CSS 10/10",
      "Complexity": "Low",
      "CSS/Technical Keywords": "background: #FDFBF7 (paper white), color: #1A1A1A, transition: none, ... texture overlay (noise)",
      "Design System Variables": "--paper-bg: #FDFBF7, --ink-color: #1A1A1A, ..."
    }
  ]
}
```

**怎么用（诚实说明）**：库里没有"海洋/水"这个风格条目，检索落到了 **E-Ink / Paper**。我**没有**照搬它的配色（off-white/ink black 与本项目海洋色板冲突 —— 按 AGENTS.md §4，`DESIGN.md` 是唯一风格契约，色板本轮**零改动**）。
我只取了它**可迁移的一点**：`"Effects & Animation": "...grain/noise texture..."` 与 `"CSS/Technical Keywords": "...texture overlay (noise)"` —— 即**"用纹理叠加表达材质"是成立的做法**，这与我要做的"水位线肌理"同源；同时它的 `"Complexity": "Low"` / `"Framework Compatibility": "Tailwind 10/10, CSS 10/10"` 也支持"用纯 CSS 渐变做纹理、不引图片/依赖"这条路。

### 1.4 `--domain ux`（原始 stdout，截取）

```
$ PYTHONIOENCODING=utf-8 python3 .dsh/skills/ui-ux/scripts/search.py "decoration texture contrast overlay readability" --domain ux --json
{
  "domain": "ux",
  "query": "decoration texture contrast overlay readability",
  "file": "ux-guidelines.csv",
  "count": 3,
  "results": [
    {
      "Category": "Typography",
      "Issue": "Contrast Readability",
      "Description": "Body text needs good contrast",
      "Do": "Use darker text on light backgrounds",
      "Don't": "Gray text on gray background",
      "Severity": "High"
    },
    {
      "Category": "Accessibility",
      "Issue": "Color Contrast",
      "Description": "Text must be readable against background",
      "Do": "Minimum 4.5:1 ratio for normal text",
      "Don't": "Low contrast text",
      "Severity": "High"
    },
    ...
  ]
}
```

**怎么用**：这一条直接决定了浅底装饰的**方向**（极淡 + 在内容之下），但**上限数值最后由实测决定**（见 §2）。它把「正文对比度」列为 **High** 严重级。

### 1.5 `--design-system --format markdown`（captain 要求的"能成功的那条"，服务本轮的强度上限决策）

```
$ PYTHONIOENCODING=utf-8 python .dsh/skills/ui-ux/scripts/search.py "music community ocean water calm collaborative" --design-system --project-name music-drift-bottle --format markdown
## Design System: music-drift-bottle

### Pattern
- **Name:** Community/Forum Landing
- **Conversion Focus:** Show active community (member count, posts today). Highlight benefits. Preview content. Easy onboarding.
- **CTA Placement:** Join button prominent + After member showcase
- **Color Strategy:** Warm, welcoming. Member photos add humanity. Topic badges in brand colors. Activity indicators green.
- **Sections:** 1. Hero (community value prop), 2. Popular topics/categories, 3. Active members showcase, 4. Join CTA

### Style
- **Name:** Vibrant & Block-based
- **Keywords:** Bold, energetic, playful, block layout, geometric shapes, high color contrast, duotone, modern, energetic
- **Performance:** ⚡ Good | **Accessibility:** ◐ Ensure WCAG

### Colors
| Role | Hex |
|------|-----|
| Primary | #7C3AED |
| Secondary | #A78BFA |
| CTA | #22C55E |
| Background | #FAF5FF |
| Text | #4C1D95 |
*Notes: Community purple + join green*

### Typography
- **Heading:** Righteous / **Body:** Poppins / Google Fonts: https://fonts.google.com/share?selection.family=Poppins:wght@300;400;500;600;700|Righteous

### Key Effects
Large sections (48px+ gaps), animated patterns, bold hover (color shift), scroll-snap, large type (32px+), 200-300ms

### Avoid (Anti-patterns)
- Flat design without depth
- Text-heavy pages

### Pre-Delivery Checklist
- [ ] No emojis as icons (use SVG: Heroicons/Lucide)
- [ ] cursor-pointer on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard nav
- [ ] prefers-reduced-motion respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
```

**采用 / 不采用（逐条，不隐藏冲突）**：

| 它的建议 | 处置 | 依据 |
| --- | --- | --- |
| **Pre-Delivery Checklist** 全部 7 条 | **采用为验收核对表** | 其中「Light mode: text contrast 4.5:1 minimum」正是本轮实测把关的那条；「No emojis as icons (use SVG)」「prefers-reduced-motion respected」「Responsive: 375/768/1024/1440」与本项目既有守卫一致 |
| `Key Effects` 里的 **200-300ms** | **采用**（与既有 `--motion-hover-duration: 200ms` / `--page-duration: 300ms` 同值，互为佐证） | `DESIGN.md` 已定，未改 |
| `Pattern: Community/Forum Landing`（含"Join button / member showcase"） | **不采用** | 本项目 IA 冻结（不动路由/信息架构），且"成员展示"与匿名接力社区的取向冲突 |
| `Style: Vibrant & Block-based`（bold/energetic/high contrast/duotone） | **不采用** | 与 `DESIGN.md` 的calm 海洋调性冲突 ⇒ 按 **AGENTS.md §4**（`DESIGN.md` 是唯一风格契约）取 `DESIGN.md` |
| `Colors: #7C3AED / #A78BFA / #22C55E（Community purple + join green）` | **不采用** | 本轮**色板零改动**（不动颜色 token）；且紫+绿与本项目海洋色相冲突 |
| `Typography: Righteous / Poppins`（含 Google Fonts **CDN** 链接） | **不采用** | 本项目字体**自托管**且明令**禁止 CDN**（`fonts.css` + 既有守卫） |

⇒ 结论：这条命令**真的产出了可用物**（7 条交付前检查表 + 200-300ms 佐证），但也给出了 3 组必须**显式否决**的建议（风格/配色/字体 CDN）。否决依据统一是 `AGENTS.md §4`：**`DESIGN.md` 是唯一风格契约**。

---

## 2. 浅底装饰强度上限（**先定后用**；数值由实测定，不由条文猜）

### 2.1 用户裁决改变了前提（记清楚，别退回旧口径）

第一批按 `ui-ux` 的「Glass card (light) | `bg-white/80` or higher opacity」把浅底上限定成 **0.04**。
**用户当场裁决：「再明显一点：水、河流、海洋、漂流瓶都要能一眼看出来」** ⇒ 可见性优先于内部 skill 的克制条款。
依据同 **AGENTS.md §4** 与 **t34-B1 的先例**（用户直接指令 §46.3 优先于内部契约）：**skill 条款不能让用户的显式要求失效。**

⇒ **本文件此后出现的"现行浅底上限"只有一个数字：`0.09`。** 文中的 `0.04` 一律是**历史**（已被用户裁决推翻），不构成约束。

### 2.2 新上限 = **`textureAlphaLight: 0.09`**（0.04 → 0.09，可见度 ×2.25）

推导过程（**先算、再实测、再定值**）：

1. **约束不变**：正文对比度是硬门（`ui-ux`: `Minimum 4.5:1 ratio for normal text`；`afrexai`: `| 4.5:1 minimum | Normal text (<18px) | AA |`）。
   浅底页正文色是 `slate-current #44646F`，底色 `wave-white #F3F9FA` ⇒ 无纹理时 **5.99:1**（像素实测，见 2.3）。
2. **水线的最坏情形是"两条线重叠"**：`.water-texture` 叠了两条不同线距的渐变（12px / 27px），周期内必然有重叠点，
   等效 alpha ≈ `1-(1-a)²`。按 token 解析合成（sea-glass / lagoon 压在 wave-white 上）：
   - `a = 0.12` ⇒ 等效 ≈ 0.23 ⇒ 合成 ≈ `#C6E4E9` ⇒ 正文对比 ≈ **4.75:1**（仍过线，但余量很薄）；
   - `a = 0.09` ⇒ 等效 ≈ 0.17 ⇒ 合成 ≈ `#D0E9ED` ⇒ 正文对比 ≈ **5.0:1**（有余量）。
3. **定 0.09**：用户要"更明显"（0.04 时几乎看不见），同时给 4.5 硬门留出余量。
   解析上 0.12 也能过线，但余量薄，且本轮**没有**为 0.12 做像素复核 ⇒ 取 0.09 更稳（见 §6 未做项：0.12 需实测后才可上调）。

### 2.3 实测对比度（PIL 像素测量，方法沿用 t33 `visual-audit.md`）

样本：`docs/ui-review/after-theme2-1440/sea-1440.png`（当前 artifact）。相对亮度按 WCAG 公式（sRGB 线性化 + 0.2126/0.7152/0.0722）。

| 被测对象 | 背景（实测像素） | 对比度 | 判定 |
| --- | --- | --- | --- |
| 页头正文 `slate-current #44646F` | 页面底色 `#F3F9FA`（水线之间的空隙，即正文实际所处的底） | **5.99:1** | ✅ ≥4.5 |
| 页头 `h1` `abyss #07202B` | 同上 `#F3F9FA` | **15.79:1** | ✅ ≥3（大字） |
| 正文 vs **水线合成最深候选** `#B4E3E8` | 水线像素 | **4.58:1** | ✅ ≥4.5（最坏情形仍达标） |
| 正文 vs `#C2D9DF` | 该色 423 次命中 | 4.33:1 | ⚠️ **但这不是水线** —— `#C2D9DF` 正是 `mist` 描边 token，命中来自**卡片/分区描边**，而描边下方没有正文 ⇒ 不构成正文对比问题 |

**测量方法上的一次自我更正（写下来，避免下一个人误读同一条数据）**：
我第一次取的采样带落在了**卡片描边**上，于是把 `#C2D9DF` 当成了"最深水线"，据此判断 `a=0.12` 违反 4.5:1（读数 4.29:1）——
**那个结论不可靠**（把 `mist` 描边误认成水线）。复核方式是把整行的**不同颜色数**打印出来（纯水纹带应是 1~数个颜色；有元素就会冒出 423 次命中的描边色）。
更正后的口径：**水线的合成色比 `mist` 浅**，最坏候选 `#B4E3E8` → 4.58:1 仍达标；因此 `a=0.09` 是"够可见 + 有余量"的值，而**不是**"0.12 违规所以降下来"。

## 3. 新增 token（`DESIGN.md` 的 `motif:` 块，**只加不删**，含理由）

| token | 值 | 理由 |
| --- | --- | --- |
| `textureLineGapAlt` | `27px` | **第二线距**。与既有 `12px` 并存 ⇒ 两条 repeating 渐变要 **108px** 才重复，相邻水线间距不再相等，打破"等距直线阵列"（本轮主验收项之一） |
| `textureFade` | `22%` | 水位线**左右渐隐 mask** 的边距 ⇒ 水线不再一条条顶到边（与上一条共同构成"水感"） |
| `textureAlphaLight` | **`0.09`** | **浅底强度上限**（**初版 0.04 已被用户裁决推翻**：「要一眼看出来」；0.04 只作历史出现。依据见 §2） |
| `wakeDash` | `7px` | 航迹虚线的实线段长 |
| `wakeGap` | `11px` | 航迹虚线的空隙长 |
| `wakeAlpha` | `0.45` | 航迹虚线强度 |

**⚠️ 关于「只加不删」的一条如实披露**：本批 `DESIGN.md` 的 diff 是 **+12 / −1**，那 **1 行删除**是
`sheenAlphaLight: 0.05` → `0.09` —— **值级 amend**（t43 已提交的那一行），不是删条目、不是删 token。
理由：用户裁决要求浅底可见性上调，而"浅底水面光带"这个 token 的强度就是被上调的对象。
若 captain 要求严格 0 删除，可改回 `0.05`（水线的可见性不受影响 —— 由本批新增的 `textureAlphaLight: 0.09` 承担），
但那样需重跑一次一屏回归以保证截图与 artifact 一致。**这条留痕写在这里，由 captain 定。**

三个新增**元素**（现行接入点以本节为准，别处不再出现"下一批"这种悬空措辞）（都不是装饰性底纹，而是母题）：
1. **水位线肌理升级**（改 `water-texture`）：双线距干涉纹 + 左右渐隐 mask。
2. **漂流瓶母题 BottleMark 落地**（用户点名，本批第一次上页面）：**公海大厅页头**（64px，骑潮线）与 **漂流日志页头**（52px，骑航迹线）各一枚，绝对定位、与标题同高；另在**公海空态**放一枚 72px。产品理由：**公海就是瓶子入海之后的去处**，页头该有"一只漂着的瓶子"。
3. **航迹虚线 WakeLine**：漂流瓶划过水面留下的**断续**水痕（与潮线的"实线渐隐"区分）；**每页头只留一条细线**（两线只差约 10px 会读成"双线"、显噪）：公海大厅留潮线（面），漂流日志留航迹（路径）。产品理由：接力本身是一条**路径**，航迹把"经过"画出来，而不是再加一层静态底纹。

---

## 4. 本批逐字引用的 skill 条款（captain 可 `grep -F` 复核）

| 引文（原文） | 文件 | 它决定了什么 |
| --- | --- | --- |
| `Build to a quality floor without announcing it` | `.dsh/skills/frontend-design/SKILL.md` | 浅底母题必须"做到但不喧哗"：**现行 0.09** 的纹理 + 一根 1px 潮线（0.04 是已被推翻的初版） |
| `fade-and-slide-up entrances on each section and hover transitions on every card are the generic default and read as AI-generated` | 同上 | **不加**装饰动效；本轮新增元素仍然**零动画**（静态纹理） |
| `decoration 默认不做` | `.dsh/skills/motion-web/SKILL.md` | 新增母题必须先有产品理由（已写进 `DESIGN.md`）且不得争夺注意力 |
| `**必须尊重 \`prefers-reduced-motion: reduce\`**` | 同上 | 因为零动画，天然满足；若将来加漂移必须走契约 |
| `| 4.5:1 minimum | Normal text (<18px) | AA |` | `.dsh/skills/afrexai-ui-design-system/SKILL.md` | 正文对比度是硬门 ⇒ 装饰只在内容之下 |
| `Analogous | Harmonious, warm/cool feel` | 同上 | 本项目用同类色（深 blue-green 家族）+ 中性底；装饰**不引入新色相**（色板零改动） |
| `Constrain animated properties to \`transform\` and \`opacity\` for GPU acceleration.` | `.dsh/skills/css-animation-creator/SKILL.md` | 纹理用 `background-image` + `mask`（绘制层），不动布局属性 |
| `Verify on low-end devices and confirm no layout thrash before shipping.` | 同上 | 由"绝对定位叠加层"结构性保证不触发布局（一屏回归是证据） |
| `使用 \`bg-white/80\` 或更高不透明度` | `.dsh/skills/ui-ux-pro-max-zh/SKILL.md` | 浅底上限依据之一（§2） |
| `使用 \`transition-colors duration-200\`` | 同上 | 200ms 档与既有契约一致（本轮没有动交互反馈） |
| `| Glass card (light) | \`bg-white/80\` or higher opacity | \`bg-white/10\` (too transparent) |` | `.dsh/skills/ui-ux/SKILL.md` | 浅底上限依据之二（§2） |
| `Minimum 4.5:1 ratio for normal text` | 同上 | 浅底加纹理的本质风险是"正文底下垫灰" ⇒ 现行上限 **0.09**（由像素实测定值，0.04 是已被推翻的初版） |
| `transform/opacity, not width/height` | 同上 | 与实际做法一致（只画背景/遮罩） |

---

## 5. 验收「等距直线阵列」已消除（机器可检）

`water-motif.test.tsx` 新增 3 条断言（`t44 水感增强`）：
- 两个线距 token **都在用**；
- `mask-image: linear-gradient` 存在且渐隐边距取 `var(--motif-texture-fade)`；
- **两个线距必须不相等**（相等 ⇒ 还是等距阵列，直接红）。

**反向控制（要求的"临时破坏→红→还原"原始输出）**：我把 `water.css` 临时改回"单线距 + 无 mask"，跑守卫：

```
--- 破坏后（应红）---
× water.css 存在，且只引用契约变量（不得内联 hex / rgb / rgba）
× 水位线用**双线距干涉纹**（两个不同线距都在用）
× 水位线用 **mask-image 左右渐隐**（水线不再顶到边）
AssertionError: water.css 未引用 --motif-texture-line-gap-alt: ... to contain '--motif-texture-line-gap-alt'
AssertionError: 缺少 mask-image 渐隐: ... to match /mask-image:\s*linear-gradient/
 Tests  3 failed | 15 passed (18)

--- 还原后 ---
 Tests  18 passed (18)
```

**诚实标注（TDD 顺序）**：本轮**新元素的代码先写、守卫后补**，因此"先红"不是自然发生的，而是由上这条**反向控制**补出来的红（破坏源码 ⇒ 新断言确实变红）。这一点我不粉饰；下一轮按"先写守卫再落代码"的顺序做。

---

## 6. 顺手修的既有 LOW：`one-screen-check.mjs` 头注与实现矛盾

**矛盾**：文件头写「要求**全部路由 FAIL** 且 `exit 1`」，用法示例写「`--negative-control` # 必须 exit 1」；
**实现**（文件末尾）是 `process.exit(provedRed ? 0 : 1)` —— 反向控制**成立时 exit 0**。

**已按实现改写注释**（并把口径写清楚）：
> `exit 0` = 成功证明了守卫**会红**（桌面：注入后全部路由 FAIL；手机：**有锚点**的路由全 FAIL）；
> `exit 1` = 反向控制**失败**（注入后仍有路由通过 ⇒ 这条守卫是"永远点头"的，判守卫自身不成立）。

**实测结论（本批跑的两条反向控制）**：
```
1440×900 --negative-control → ✅ 反向控制成立（整页高度断言）：注入 2000px 后 12/12 FAIL ⇒ 守卫不是永远点头   （exit 0）
375×812  --negative-control → ✅ 反向控制成立（锚点断言）：注入 2000px 后 10/12 FAIL ⇒ 守卫不是永远点头       （exit 0）
（另 2 条路由没有关键锚点，脚本显式列出、不静默跳过）
```
⇒ 头注现在与实现、与实测三者一致。

---

## 7. 原始输出（§70：不允许用"见某处"代替证据）

### 7.1 三条门命令（真实退出码 + 末几行）

```
$ pnpm -r test
packages/shared test:  Test Files  22 passed (22)
packages/shared test:       Tests  242 passed (242)
apps/api test:         Test Files  19 passed (19)
apps/api test:              Tests  180 passed (180)
apps/web test:         Test Files  65 passed (65)
apps/web test:              Tests  576 passed | 1 skipped (577)
TEST_EXIT=0

$ pnpm -r typecheck
apps/api typecheck: Done
apps/web typecheck: Done
TC_EXIT=0

$ pnpm lint
$ eslint .
LINT_EXIT=0
```

### 7.2 一屏守卫（真实浏览器，每次自建可抛弃环境）

```
$ node apps/web/tools/one-screen-check.mjs --viewport=1440x900 --shot=docs/ui-review/after-theme2-1440
OK   /                                    height=900  river-draw=666 river-drop=666
OK   /river                               height=900  river-draw=666 river-drop=666
OK   /sea                                 height=900  sea-list=507
OK   /new                                 height=900  new-catalog=444
OK   /sea/f4f25c78-…                      height=900  sea-play=522
OK   /me                                  height=900  me-bottles=541
OK   /settings                            height=900  settings-attribution=553
OK   /bottles/10418c7d-…                  height=900  bottle-play=668 bottle-action=668
OK   /bottles/db391fb4-…                  height=900  bottle-play=640 bottle-action=640
OK   /bottles/5e7713ef-…                  height=900  bottle-record=638
OK   /bottles/10418c7d-…/log              height=900
OK   /nope-does-not-exist                 height=900
✅ 全部页面达标（桌面口径：一屏装下）
EXIT=0

$ node apps/web/tools/one-screen-check.mjs --viewport=375x812 --shot=docs/ui-review/after-theme2-375
OK   /                                    height=1137 river-draw=474 river-drop=806
OK   /river                               height=1137 river-draw=474 river-drop=806
OK   /sea                                 height=812  sea-list=558
OK   /new                                 height=926  new-catalog=713
OK   /sea/139002e2-…                      height=1393 sea-play=554
OK   /me                                  height=1252 me-bottles=691
OK   /settings                            height=1089 settings-attribution=811
OK   /bottles/a813013c-…                  height=1443 bottle-play=770 bottle-action=770
OK   /bottles/d0cfe334-…                  height=1409 bottle-play=736 bottle-action=736
OK   /bottles/1c7913ad-…                  height=1425 bottle-record=762
OK   /bottles/a813013c-…/log              height=812
OK   /nope-does-not-exist                 height=812
✅ 全部页面达标（手机口径：无横向滚动 + 关键锚点在首屏内）
EXIT=0
```

> 截图落在 `docs/ui-review/after-theme2-1440/`、`after-theme2-375/`（各 12 张），**时间戳晚于代码改动**（captain 已独立核对过一轮；本批补 `BottleMark` 后又重跑刷新，旧截图已作废）。
> 反向控制（`--negative-control`）本批两条实测：桌面 `12/12 FAIL`、手机 `10/12 FAIL`，均 `✅ 反向控制成立` 且 `exit 0`。

### 7.3 守卫 19 例 + 反向控制（临时破坏 → 红 → 还原 → 绿）

```
$ pnpm --filter @music-drift/web exec vitest run src/design-system/__tests__/water-motif.test.tsx
（实现前）
× DESIGN.md 的 front matter 有 motif: 块，且 5 个 token 都在
× theme.css 把每个 motif token 暴露为 --motif-*
× water.css 存在，且只引用契约变量（不得内联 hex / rgb / rgba）
× index.css 引入了 water.css（否则类名不生效）
× WaterSheen / WaterTexture / TideLine：aria-hidden + pointer-events-none + 绝对定位
× 河道页的两个深水面板都加了水面光带与水纹
× 公海作品页的深底页头加了水面光带
 Tests  9 failed (9)

（t44 新元素扩到 19 例后）
$ … water-motif.test.tsx      →  Tests  19 passed (19)
$ … water-motif + motion-contract 合并  →  Test Files 2 passed (2)   Tests 36 passed (36)

（反向控制：把 water.css 临时改回"单线距 + 无 mask"）
× water.css 存在，且只引用契约变量（不得内联 hex / rgb / rgba）
× 水位线用**双线距干涉纹**（两个不同线距都在用）
× 水位线用 **mask-image 左右渐隐**（水线不再顶到边）
AssertionError: water.css 未引用 --motif-texture-line-gap-alt: … to contain '--motif-texture-line-gap-alt'
AssertionError: 缺少 mask-image 渐隐: … to match /mask-image:\s*linear-gradient/
 Tests  3 failed | 16 passed (19)

（还原后）
 Tests  19 passed (19)
```

**TDD 顺序的如实标注**：第一批（t43）与 t44 前半段是"代码先写、守卫后补"，"先红"是由反向控制补出来的；
**本批最后两处改动（漂流日志补 `BottleMark`、每页头只留一条细线）改成了先写断言**：先跑出
`× 漂流日志：页头瓶子 + 航迹` 与 `× 同一页头不得同时出现潮线与航迹` 两条红，再改实现 → 19 passed。
