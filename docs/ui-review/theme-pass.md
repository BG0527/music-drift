# 主题化美化一轮（t43）：5 个前端 skill 的引用与落地

> 用户第十三轮第 ⑥ 条：装 `ui-ux-pro-max-zh` 并「调用所有的前端 skill 来美化前端页面一遍」，美化「包括但是一定不限于：前端多增加水、河流、海洋、漂流瓶等相关主题元素」。
> 本文件是**给 captain 逐条核对 skill 引文**用的：每个引文都标了 `.dsh/skills/*/SKILL.md` 的**行号**。
> 硬边界（本轮全程遵守）：**不动信息架构、不破一屏、不降对比度、不引入新依赖/图片**。

---

## 1. 五个 skill 的引用 → 它驱动了哪个决定

### 1.1 `motion-web`（动效纪律）

| 引文（原文，行号为 `SKILL.md` 实际行号） | 行 | 它决定了什么 |
| --- | --- | --- |
| 「**decoration 默认不做**。若产品确实需要一个常驻母题（例如本项目的"涟漪"作为海洋主题的标记），必须：① 有明确的产品理由并能写进设计文档；② 常驻动效**不得争夺注意力**（低幅度、低速度、可忽略）；③ 在 `reduced-motion` 下可静止。」 | L23 | 本轮新增的三个装饰层**一条都不带动画**（纯静态绘制）⇒ 天然满足 ②③；产品理由写进 `DESIGN.md` 的「水域母题层」小节 ⇒ 满足 ① |
| 「**feedback 与 continuity 是默认该有的**；缺了它们，界面会"没有回应感"。」 | L22 | 反过来说明：**装饰不是本轮的重点，回应感才是**（那部分已在 t38 批次做完）⇒ 本轮只补"地点感"，不碰交互反馈 |
| 「动画属性**只允许** `transform` 与 `opacity`」 | L39 | 三个装饰层连 `transform` 都不用：只画 `background-image` + `opacity`（叠加层的 `opacity` 是静态值，不是过渡） |
| 「❌ 无产品理由的常驻/循环装饰动效」 | L96 | 见 L23 的处理：**没有循环、没有无限动画**；涟漪的常驻形态另有 `DESIGN.md` 的「Ripples 两个角色」定义 |

### 1.2 `frontend-design`（排版与「不像模板」）

| 引文（原文） | 行 | 它决定了什么 |
| --- | --- | --- |
| 「Spend your boldness in one place. Let one element be the memorable thing, keep everything around it quiet and disciplined, and cut any decoration that does not serve the brief. **Build to a quality floor without announcing it**…」 | L59 | 三个装饰层全部走"低幅度、低速度、可忽略"：水深底上的水面光带 alpha `0.1`、水位线肌理 `0.05`、潮线 `0.55`（一根 1px 线）——**把地板做扎实而不喧哗**，不新增"抢眼"的视觉重心 |
| 「**fade-and-slide-up entrances on each section and hover transitions on every card are the generic default and read as AI-generated**. Motion that answers a person's action…is welcome」 | L32 | 明确**不加**"每个区块都淡入"这类装饰动效；本轮新增元素是**静态纹理**，不制造"人人都有"的入场动画 |

### 1.3 `afrexai-ui-design-system`（调色与风格体系）

| 引文（原文） | 行 | 它决定了什么 |
| --- | --- | --- |
| 「Monochromatic / Complementary / **Analogous**（Harmonious, warm/cool feel）…」色彩策略表 | L123-L128 | 本项目是**Analogous（同类色）+ Neutral 底**：深底 `deep-current`/`trench` + 浅底 `wave-white`/`foam`，装饰件只在这两族里取色，**不引入新色相** |
| 「#### Color Accessibility Rules … \| 4.5:1 minimum \| Normal text (<18px) \| AA \| … \| 3:1 minimum \| UI components, icons \| AA \|」 | L174-L178 | 装饰层不许压正文：新装饰一律落在**宿主背景之上、内容之下**（`z-underlay` + `isolate`），因此不改任何文字的对比度；三处深底 CTA 的 ≥3:1 不受影响（见 §4 证据） |
| 「**Semantic colors (DON'T skip these)**」 | L148 | 各语义色（success/warning/danger/info）本轮**未动**——装饰不得挤占语义色的语义 |

### 1.4 `css-animation-creator`（CSS 技法：纹理、渐变光）

| 引文（原文） | 行 | 它决定了什么 |
| --- | --- | --- |
| 「4. Author the animation. **Pull ready-made keyframes and patterns from the reference files** below rather than writing from scratch.」 | L28 | 提醒优先复用既有模式 ⇒ 复用了设计系统已有的 `@layer components` 组织方式与 `color-mix()` 取色写法，而不是新造一套 |
| 「5. Constrain animated properties to `transform` and `opacity` for GPU acceleration.」 | L29 | 纹理/光带用 `background-image`（绘制层）实现，**不动布局属性**；唯一的动效属性是静态 `opacity` |
| 「6. **Honor reduced-motion preferences for every animation.**」/「7. Verify on low-end devices and confirm no layout thrash before shipping.」 | L30-L31 | 因为本轮**零动画**，`reduced-motion` 无需降级（已在 `water.css` 头注写明）；"no layout thrash" 由「绝对定位叠加层」结构性保证 |
| 「`references/accessibility.md` — `prefers-reduced-motion` CSS, Tailwind motion-safe/reduce, React hook.」 | L42 | 记录了后续若要给纹理加漂移时的现成方案（届时必须走 `motion` 契约） |

### 1.5 `ui-ux-pro-max`（新装，本轮首次使用）

| 引文（原文） | 位置 | 它决定了什么 |
| --- | --- | --- |
| 「不用 emoji 图标 \| 使用 SVG 图标（Heroicons、Lucide、Simple Icons）」「`no-emoji-icons` - 使用 SVG 图标，而非 emoji」 | 快速参考 §7 / 专业规则表 | 新增装饰**全部是 CSS 渐变**，没有 emoji、没有图片；既有图标继续走 Lucide |
| 「**稳定的悬停状态** \| 悬停时用颜色/透明度过渡 \| 使用导致布局位移的缩放变换」 | 专业 UI 通用规则表·交互与光标 | **与 `DESIGN.md` L285「Hover states: Scale(1.03) + shadow lift」冲突** ⇒ 按 AGENTS.md §4「`DESIGN.md` 是唯一风格契约」取 `DESIGN.md`，冲突已登记在 §5 |
| 「**平滑过渡** \| 使用 `transition-colors duration-200` \| 状态瞬时切换或过慢（>500ms）」 | 同上 | 与本项目既有 200ms hover 档一致（`--motion-hover-duration: 200ms`）⇒ 佐证现有契约取值合理 |
| 「`transform-performance` - 使用 transform/opacity，而非 width/height」「`reduced-motion` - 检查 prefers-reduced-motion」 | 快速参考 §3/§6 | 与本轮"零动画 + 不改布局属性"一致 |
| 「交付前检查清单 … 在 375px、768px、1024px、1440px 响应式 \| 移动端无横向滚动」 | 交付前检查清单·布局 | 直接对应本轮的**一屏回归**（1440 与 375 各 12/12，见 §4） |
| 「**亮色模式玻璃卡片** \| 使用 `bg-white/80` 或更高不透明度 \| 使用 `bg-white/10`（过于透明）」 | 专业规则表·亮/暗对比 | 决定了浅底（`wave-white`）上**不放**强装饰：只允许 `sheenAlphaLight = 0.05`，且本轮实际上只把它用在深底上 |

> **⚠️ 诚实标注（工具缺口，不是我的推断）**：`ui-ux-pro-max` 的 `SKILL.md` 用整整一节讲「使用下方 CLI 工具搜索特定领域」并给出 `python3 …/scripts/search.py "<keyword>" --design-system` 的用法，但**本机安装里没有 `scripts/` 目录**。实测：
> ```
> $ find .dsh/skills/ui-ux-pro-max-zh -type f
> .dsh/skills/ui-ux-pro-max-zh/README.md
> .dsh/skills/ui-ux-pro-max-zh/SKILL.md
> .dsh/skills/ui-ux-pro-max-zh/_meta.json
> $ python .dsh/skills/ui-ux-pro-max-zh/scripts/search.py "..." --design-system
> can't open file '…/scripts/search.py': [Errno 2] No such file or directory
> ```
> ⇒ 它是**纯文档版**（363 行，无数据库/无脚本）。我引用的是它的**静态条款**（上表），**没有伪造 CLI 输出**。若要真正使用"可搜索数据库"，需要装带 `scripts/` 与 CSV 的完整包。

---

## 2. 新增的主题元素（3 个，都是「零布局高度」的叠加层）

| # | 元素 | 它是什么 | 产品理由（为什么是这个产品的母题） | 文件 |
| --- | --- | --- | --- | --- |
| ① | **水面光带 WaterSheen** | 宿主顶部向下淡出的极淡渐变（深底 alpha `0.1` / 浅底 `0.05`） | 产品讲的是"水面之上与深海之下"；光带让深水面板有**从水面往下看**的纵深，替代一条硬边框 | `water.css` `.water-sheen` / `.water-sheen-light`；`wave.tsx` `WaterSheen` |
| ② | **水位线肌理 WaterTexture** | 横向细线平铺（线距 `12px`，alpha `0.05`），纯 CSS `repeating-linear-gradient` | 公海/河道是"水面"；肌理让大块暗底不再像**空白模板**（`frontend-design` L59 的质量地板） | `water.css` `.water-texture`；`wave.tsx` `WaterTexture` |
| ③ | **潮线 TideLine** | 贴宿主下沿的 `sea-glass → 透明` 渐隐细线（1px，alpha `0.55`） | `DESIGN.md` Overview 的母题清单里本就有 **tide lines（浪线）**；潮线替代区块之间的硬分隔线 | `water.css` `.tide-line`；`wave.tsx` `TideLine` |

**同时满足 acceptance 的四条**：
1. **有产品理由**：见上表「产品理由」列，且已写进 `DESIGN.md`（不只写在代码注释里）。
2. **不喧宾夺主**：alpha ≤0.1；`aria-hidden="true"`；`pointer-events-none`；**完全无动画**（`motion-web` §1 decoration 三条件逐条对照：不争夺注意力 ✓ / 低幅度低速度 ✓ / reduced-motion 下静止 ✓ 因为本来就是静止的）。
3. **不改信息架构**：没有增删任何路由/区块/字段，只往既有容器里插了叠加层。
4. **不破坏一屏**：三者都是 `absolute` + `z-underlay`，**不进入文档流**（零布局高度）；实测 1440 与 375 各 **12/12 OK**（§4）。

**层级的关键实现（容易踩的坑，记下来）**：装饰要落在「宿主背景**之上**、内容**之下**」，必须同时具备
`relative`（定位基准）+ **`isolate`**（`isolation: isolate`）+ 装饰层 `z-underlay`（`z-index: -1`）。
少了 `isolate`，负 z-index 会落到宿主背景**之下**而完全看不见 —— 这也是为什么 `DESIGN.md` 的 `zIndex` 契约本轮补了 `underlay: -1` 这一档。

---

## 3. 契约先补（amend 纪律：只加不删、留痕）

| 契约位置 | 新增 | 留痕 |
| --- | --- | --- |
| `DESIGN.md` front matter `motif:` | `sheenAlphaDark: 0.1` / `sheenAlphaLight: 0.05` / `textureAlpha: 0.05` / `textureLineGap: 12px` / `tideLineAlpha: 0.55` | 带 `# 2026-09-24 amend · t43` 注释与逐项用途 |
| `DESIGN.md` front matter `zIndex:` | `underlay: -1` | 注释写明"宿主必须 isolate，否则会被背景盖住" |
| `DESIGN.md` Elevation & Depth | 「水域母题层（water motif）」一条：三个元素 + 产品理由 + **不许喧宾夺主的三条硬约束** | 明确"若将来加漂移，必须走 `motion-web` §1 并引用 `motion` 契约" |
| `theme.css` | `--motif-sheen-alpha-dark/light`、`--motif-texture-alpha`、`--motif-texture-line-gap`、`--motif-tide-line-alpha` + `@utility z-underlay` | 段落注释写明"契约在 DESIGN.md 的 motif 块" |
| `tokens.ts` | `export const motif = {…}` | JS 侧同源（守卫断言 theme.css 暴露同名 token） |
| 代码引用 | 组件与 `water.css` **只**引用 `var(--motif-*)` / `var(--color-*)` | 守卫拒收内联 `hex` / `rgb()` / `rgba()` |

**只加不删的证据**：`git diff --numstat DESIGN.md apps/web/src/design-system/theme.css` 的删除列均为 0（见 §4）。

---

## 4. 验证（命令 + 原始输出）

**守卫先红后绿**（新文件 `apps/web/src/design-system/__tests__/water-motif.test.tsx`，9 例）：

```
首轮（实现前）：Tests  9 failed (9)
  × DESIGN.md 的 front matter 有 motif: 块，且 5 个 token 都在
  × theme.css 把每个 motif token 暴露为 --motif-*
  × water.css 存在，且只引用契约变量（不得内联 hex / rgb / rgba）
  × index.css 引入了 water.css（否则类名不生效）
  × WaterSheen / WaterTexture / TideLine：aria-hidden + pointer-events-none + 绝对定位
  × 河道页的两个深水面板都加了水面光带与水纹
  × 公海作品页的深底页头加了水面光带

实现后：Tests  9 passed (9)
```

**三条 verify 命令**：`pnpm -r test` / `pnpm -r typecheck` / `pnpm lint` **全部 exit 0**（原始输出见任务回写）。

**一屏回归（真实浏览器，唯一能证明"没破一屏"的层）**：
```
1440×900：12/12 OK   EXIT=0     （截图 docs/ui-review/after-theme-1440/）
375×812 ：12/12 OK   EXIT=0     （截图 docs/ui-review/after-theme-375/）
```
> 附带好消息：375 的 `/river` 本轮实测 `river-drop=806 ≤ 812` **通过** —— t38 里我归因给 t36 文案的那条红门（832）已经复绿。

**对比度未退化**：装饰层一律在内容之下（`z-underlay`），不改文字背景 ⇒ 三处深底 CTA 的 ≥3:1 不受影响；且本轮**未改任何颜色 token**（`git diff` 里色板零改动）。

---

## 5. skill 之间的冲突登记（不隐藏）

| 冲突 | 两边说法 | 处置 |
| --- | --- | --- |
| hover 是否允许缩放 | `ui-ux-pro-max`：「勿使用导致布局位移的缩放变换」 ↔ `DESIGN.md` L285：「Hover states: Scale(1.03) + shadow lift over 200ms」 | 按 **AGENTS.md §4**：`DESIGN.md` 是唯一风格契约 ⇒ 保留 `scale(1.03)`。另注：`scale` 是 `transform`，**不触发重排**（`motion-web` §3 明确允许），与该规则担心的"布局位移"不是同一件事 —— 判断保留成立 |
| 装饰动效的默认值 | `frontend-design` L32 警告"每段淡入/每卡 hover 读起来像 AI 生成" ↔ 用户明确要求"多增加主题元素" | 折中：**加静态母题、不加装饰动效** —— 两个要求同时满足（见 §1.2） |

---

## 6. 本轮之后仍可做（未做，明确登记）

1. **纹理的"水感"可以更足**：目前水位线是等距直线（读起来偏"规整"）。可选改进：给 `.water-texture` 加左右渐隐 `mask-image`，或叠一层不同线距的 gradient 做干涉纹 —— 需要新增一个 `textureFade` 类 token（属契约变更，故本轮未擅自加）。
2. **水流漂移动效**：若要加，必须走 `motion-web` §1 decoration 三条件并引用 `motion` 契约（`css-animation-creator` L42 有现成的 reduced-motion 方案）。
3. **`ui-ux-pro-max` 的完整版**：装带 `scripts/` + CSV 的包才能用它宣称的"可搜索数据库"。
4. **公海/漂流日志页的主题元素**：本轮只落在河道（2 个深水面板 + 页头潮线）与公海作品页深底页头；公海列表页与漂流日志页仍是浅底，未加装饰（浅底上加强装饰会碰 `ui-ux-pro-max` 的"玻璃卡片需 ≥80% 不透明度"约束，宜谨慎）。
