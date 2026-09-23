# `--spacing` 尺度裁决：影响面分析 + 方案（**只读分析，未改任何代码**）

> 触发：frontend-flow 定位「前端丑」真根因 —— `apps/web/src/design-system/theme.css:69` 把 `--spacing` 覆盖为 `0.5rem`，
> 而 Tailwind v4 默认是 `0.25rem` ⇒ **所有数字档 utility 的实际尺寸 ×2**。
> 本文件为**只读**产出：不改 `DESIGN.md`、不改 `theme.css`、不改任何源码（`--spacing` 一动全站几何瞬间位移，会与正在做视觉的 frontend-flow 并发冲突）。
> 结论供 captain 拍板；落地由我执行并与 frontend-flow **串行**。

## 0. 结论（TL;DR）

- **推荐候选 (a)：回退 `--spacing: 0.25rem`**，并把 18 处「回退后仍不在档位」的类按 frontend-flow 已定的「几何写显式 px」纪律收口。
- **理由不是审美偏好，而是证据**：本仓已有的 26 处 `-11` 类（`min-h-11`×21 / `h-11`×2 / `min-w-11`×1）**是照着 Tailwind 标准 44px 触控意图写的**，在当前基准下实际渲染 **88px**；`w-64`（侧栏）照 Tailwind 标准是 256px，实际渲染 **512px**（Figma 侧栏为 260px）。也就是说：**代码是按 0.25rem 的语义写的，基准把它整体放大了 2 倍** —— 这是"丑"，不是"设计选择"。
- 候选 (b)（保留 0.5rem + 文档化约定）**可行但代价是永久的**：`min-h-11` 这类行业共识类名会永久失真，44px 触控**没有标准类名可用**（需要 `min-h-[44px]` 任意值），且每次新增代码都要记住"数字要减半"。按本会话已立的准入规则（**收益必须大于长期负担**），(b) 不划算。
- 本分析**不动手**；落地顺序建议见 §7（必须与 frontend-flow 串行，不能并发）。

## 1. 事实核验（我实测，不是转述）

| 断言                           | 实测                                                                                                                                          | 证据                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `theme.css` 覆盖了 `--spacing` | ✅ `69: --spacing: 0.5rem;`                                                                                                                   | `grep -n "spacing" apps/web/src/design-system/theme.css`                                       |
| Tailwind v4 默认值是 `0.25rem` | ✅                                                                                                                                            | `node_modules/.pnpm/tailwindcss@*/node_modules/tailwindcss/theme.css:325: --spacing: 0.25rem;` |
| **构建产物确实是 `.5rem`**     | ✅ `--spacing:.5rem`                                                                                                                          | `grep -o -- "--spacing:[^;]*" apps/web/dist/assets/index-*.css`                                |
| 单测把错值当契约守卫           | ✅ `expect(themeCss).toContain('--spacing: 0.5rem')`（`__tests__/tokens.test.ts` 的「8px 节奏基准与派生档位全部映射」用例，当前文件第 96 行） | `sed -n '88,100p' apps/web/src/design-system/__tests__/tokens.test.ts`                         |

> 补充：该用例**同时**断言了 8 个档位字面量（`4px/8px/…/64px`）存在 —— 这部分是**对的**（它们来自 `--space-*` token），错的只有 `--spacing` 那一行。

## 2. 影响面普查（真实 grep，非估算）

扫描口径：`apps/web/src/**/*.{ts,tsx,css}`，匹配**带数字的 spacing 尺度 utility**（`w/h/min-w/min-h/max-w/max-h/size/inset*/top/right/bottom/left/p*/m*/gap*/space-*/translate-*` 后接数字，**排除**任意值 `[...]`、百分比、`auto/full/screen` 等关键字）。

| 指标                       | 数值                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 命中文件                   | **43 个**                                                                                                                                                                                               |
| 命中总次数                 | **339 处**                                                                                                                                                                                              |
| 按目录                     | `features` 134 · `pages` 109 · `design-system` 96                                                                                                                                                       |
| 按前缀 Top                 | `gap` 177（占 52%）· `px` 34 · `py` 28 · `h` 22 · `min-h` 21 · `w` 16 · `p` 14 · `min-w` 9 · 其余（mt/pb/inset/mb/inset-x/bottom/ml/top）合计 18                                                        |
| 受影响文件 Top 5           | `design-system/showcase/Showcase.tsx` 42 · `features/audio/recorder-panel.tsx` 22 · `features/audio/mix-export-panel.tsx` 20 · `features/bottle/relay-timeline.tsx` 16 · `pages/bottle-page.tsx` 16     |
| **动效是否受波及**         | **0 命中**：本仓没有任何 `translate-*` / `space-*` / `scroll-m*` 数字档；DESIGN.md 的 16px 入场位移用的是 `var(--entry-shift)`，**免疫**                                                                |
| 任意值 `[Npx]`（不受影响） | **143 次 / 5 文件**（`design-system/button.tsx`、`design-system/nav.tsx`、`pages/home-page.tsx`、`pages/river-page.tsx`、`pages/shell/app-shell.tsx`）—— 说明 frontend-flow 的「几何写显式 px」已在路上 |

**几何类全量（当前 = N×8px → 回退后 = N×4px）**：

| 类                                                      | 次数   | 当前      | 回退后     | 备注                                  |
| ------------------------------------------------------- | ------ | --------- | ---------- | ------------------------------------- |
| `min-h-11`                                              | 21     | 88px      | **44px**   | 触控底线，回退后正好达标              |
| `h-11` / `min-w-11`                                     | 2 / 1  | 88px      | **44px**   | 同上                                  |
| `h-40`                                                  | 2      | 320px     | 160px      | 非档位（组件尺寸）                    |
| `w-64`                                                  | 1      | 512px     | **256px**  | 侧栏；Figma 实测 260px ⇒ 0.25rem 语义 |
| `w-14` / `h-14`                                         | 3 / 2  | 112px     | 56px       | 非档位（尺寸）                        |
| `h-24` / `h-28`                                         | 1 / 1  | 192/224px | 96/112px   | 非档位（尺寸）                        |
| `h-16`                                                  | 1      | 128px     | **64px**   | 回退后正好是节奏档上限                |
| `h-9` / `h-10`                                          | 1 / 1  | 72/80px   | 36/40px    | 非档位（尺寸）                        |
| `h-2` `w-3` `h-3` `w-1` `w-2` `w-4` `h-4` `h-6` `top-1` | 各 1–6 | 8–48px    | **4–24px** | 回退后**全部落在节奏档**              |
| `w-0.5` / `p-0.5`                                       | 1 / 1  | 4px       | 2px        | 两基准都不是档位                      |
| `min-w-0` / `inset-0` / `bottom-0` / `inset-x-0`        | 13     | 0         | 0          | 与基准无关                            |

## 3. 意图分类：哪些「本意就是 8px 档」，哪些是「碰巧被 ×2」

分类不靠猜，靠**类名在 Tailwind 惯例下的语义**与**已知设计基准（DESIGN.md / Figma 帧）**的对照：

| 分类                                                                  | 判定依据（证据）                                                                                                                                        | 数量                   | 回退后的效果                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------- |
| **① 本意就是节奏档（被 ×2 破坏）**                                    | `gap-1/2/3/4/6`、`p-4/6`、`px-3/4/6`、`py-1/3`、`h-2/3/4/6`、`w-1/2/3/4` …：这些 N 在 0.25rem 下**恰好等于 DESIGN.md 的 8px 派生档**（4/8/12/16/24/32） | **321 处中的绝大多数** | 尺寸减半 → 回到 DESIGN.md 规定值                    |
| **② 按行业标准语义写的、被 ×2 后失真**                                | `min-h-11`/`h-11`/`min-w-11`（Tailwind 惯例 = 44px = DESIGN.md 触控底线）、`w-64`（惯例 256px ≈ Figma 侧栏 260px）                                      | **26 + 1 处**          | 44px/256px → 与设计基准一致                         |
| **③ 碰巧被 ×2、但两基准下都不在档位（组件尺寸）**                     | `w-14/h-14`(56) `h-40`(160) `w-40`(160) `h-24`(96) `h-28`(112) `h-9`(36) `h-10`(40) `w-0.5`(2)                                                          | **14 处**              | 需按「几何写显式 px」收口（见 §5）                  |
| **④ 间距类但两基准下都越界（违反 DESIGN.md「间距只取 8px 派生档」）** | `gap-5`(20) `p-5`(20) `p-0.5`(2) `pb-24`(96)                                                                                                            | **4 处**               | 必须改回档位（16 或 24 / 4 或 0 / 96→64 或显式 px） |

**关键量化**：回退后 **321/339 处（95%）落在 DESIGN.md 档位或 44px 触控底线**；余 **18 处**需要人工收口（③14 + ④4）。
而当前 0.5rem 基准下，**只有 281 处"看起来"落在档位**，且这些落点与类名语义**系统性错位**（`gap-3` 渲染成 24px 而不是 12px）—— 这正是"整体过松、什么都不对齐"的可测来源。

## 4. 两个候选的完整对照

### 候选 (a)：回退 `--spacing: 0.25rem` + 收口 + 改测试

| 维度         | 内容                                                                                                                                                                                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 影响面       | **43 文件 / 339 处的渲染尺寸全部减半**；其中 321 处因此**回到设计档位**；18 处需收口                                                                                                                                                                      |
| 必须改的文件 | `theme.css:69`（删除覆盖或改为 `0.25rem`）、`__tests__/tokens.test.ts` 的 `--spacing` 断言（见 §6）、③④ 共 18 处所在文件（`design-system/{nav,button,modal,skeleton,card,empty-state,toast,tabs}.tsx`、`features/audio/*`、`pages/*` — 具体清单脚本可出） |
| 迁移成本     | 中：机械改动少（1 行基准 + 18 处收口 + 2 处测试），**大头是视觉复验**（1440/375 逐页截图对照，属 frontend-flow 在做的事）                                                                                                                                 |
| 风险         | **布局二次位移**：凡"按当前 320px/512px 眼睛调过"的地方回退后会明显变小 → 必须整轮复验，不能只看首页。**与 frontend-flow 视觉改造并发会互相掩盖回归** ⇒ 必须串行                                                                                          |
| 长期收益     | 类名恢复行业共识（`min-h-11` = 44px）；DESIGN.md 8px 节奏**无损表达**；任意值 hack 不再增长                                                                                                                                                               |

### 候选 (b)：保留 `0.5rem`，把「数字档 = N×8px」文档化为项目约定

| 维度         | 内容                                                                                                                                                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 影响面       | 现有渲染**零变化**；零迁移成本                                                                                                                                                                                                                                                                                            |
| 必须改的文件 | `theme.css` 注释、`tokens.test.ts` 改成守卫"约定"、`DESIGN.md` 增补一段尺度约定（**改动 DESIGN.md 需 captain 批**）                                                                                                                                                                                                       |
| 长期代价     | ① 44px 触控**没有标准类可用**（`min-h-11`→88px；须写 `min-h-[44px]`），而 DESIGN.md 把 ≥44px 定为移动端硬底线；② 每个新写代码的人/模型都会默认 `w-64`=256px 而实际得到 512px —— **本次"前端丑"就是这条代价的实例**；③ `gap-*` 占 52%，是最高频工具类，全部处于"名字与数值错位"状态；④ 任意值 px 会持续增长（现已 143 处） |
| 风险         | 与 Tailwind 官方文档、示例、AI 训练语料**全局相悖**，属"每处使用都要现场翻译"的认知税                                                                                                                                                                                                                                     |

**综合**：(a) 的成本是**一次性的**且可被视觉复验覆盖；(b) 的成本是**永久的**且已经证明会产出真实缺陷。除非有"现在绝对不能动几何"的排程约束，否则 **(a) 更划算**。

## 5. 关键问题回答

### 5.1 DESIGN.md 的 8px 节奏在 `0.25rem` 基准下能否无损表达？

**能，且是唯一能保持类名语义一致的方案。** DESIGN.md §Layout 规定「间距只取 8px 派生档：4 / 8 / 12 / 16 / 24 / 32 / 48 / 64」：

| DESIGN.md 档         | **0.25rem 基准（推荐）** | 0.5rem 基准（当前）          |
| -------------------- | ------------------------ | ---------------------------- |
| 4px                  | `p-1`                    | `p-0.5`                      |
| 8px                  | `p-2`                    | `p-1`                        |
| 12px                 | `p-3`                    | `p-1.5`                      |
| 16px                 | `p-4`                    | `p-2`                        |
| 24px                 | `p-6`                    | `p-3`                        |
| 32px                 | `p-8`                    | `p-4`                        |
| 48px                 | `p-12`                   | `p-6`                        |
| 64px                 | `p-16`                   | `p-8`                        |
| **44px（触控底线）** | `min-h-11`（标准类）     | **无标准类**（5.5 档不存在） |

对不上档位的只有：`20px / 40px / 56px / 96px / 112px / 160px / 2px` 等在**两个基准下都不在档位**的值 —— 这些不是"基准问题"，而是"用了非档位尺寸"，应按 frontend-flow 的「几何写显式 px」纪律写 `w-[56px]` 之类，或收敛到最近档位（例：`pb-24`=96px → `pb-16`=64px 或显式 `pb-[96px]`）。

### 5.2 我 t2 重写 DESIGN.md 时的原始意图是什么？错在哪？

- **原始意图**：忠实落地 DESIGN.md 原文「**Base unit: 0.5rem (8px)**」—— 即"节奏步长是 8px"。这个意图**没错**，DESIGN.md 至今仍这么写。
- **失误**：我把「节奏步长」误解并**覆盖到了 Tailwind 的 `--spacing` 变量上**。在 Tailwind v4 里，`--spacing` 的语义是**"尺度值 1 的长度"**（`p-1`、`gap-1` 的长度），不是"设计的最小节奏步长"。两者含义不同：
  - 设计意图"步长 8px" → 在 0.25rem 基准下用**偶数档**表达（`p-2`/`gap-2` = 8px）；
  - 我做的"把尺度 1 设为 8px" → 让**每一个类名**都×2，包括本应 44px 的 `min-h-11`。
- **次要失误**：`tokens.test.ts` 把这次实现选择当成契约守卫下来（`toContain('--spacing: 0.5rem')`），使错误值获得"测试通过"的背书 —— **这是判据层面的错误**，比实现错误更难发现（本会话已有两次同源教训：期望值当输入、判据自证）。
- **可选的文档修正**（需 captain 批，本单不动）：DESIGN.md 的「Base unit: 0.5rem (8px)」可加一句限定 ——「8px 是**节奏步长**；代码侧基准（Tailwind `--spacing`）保持框架默认 0.25rem，节奏档用偶数表达」。这样后来者不会再走我这条歧路。

## 6. 对 `tokens.test.ts` 的处置建议（无论选哪个候选都要改）

**现状**：`it('8px 节奏基准与派生档位全部映射')` 里 `expect(themeCss).toContain('--spacing: 0.5rem')` —— **它守卫的是一个错误值，而不是意图**。

**改法（候选 (a) 下）**：

```ts
it('8px 节奏基准：框架基准保持 0.25rem，节奏档用偶数表达', () => {
  // ① 不得覆盖 Tailwind 的尺度基准 —— 覆盖会让每个数字档 ×2（min-h-11 = 88px 而非 44px）
  const spacingOverride = /--spacing:\s*([^;]+);/.exec(themeCss)?.[1]?.trim();
  expect(spacingOverride, 'theme.css 不得覆盖 --spacing').toBeUndefined();

  // ② 真正要守卫的是「档位全集」——它由 --space-* token 表达，与基准确认无关
  for (const step of ['4px', '8px', '12px', '16px', '24px', '32px', '48px', '64px']) {
    expect(themeCss, `缺少间距档 ${step}`).toContain(step);
  }

  // ③ 触控底线必须是 44px 且用标准类表达（min-h-11 的语义只有在 0.25rem 下成立）
  expect(themeCss).toContain('--touch-target-min: 44px');
});

it('数字档 utility 的语义 = N×4px（防止基准被再次覆盖）', () => {
  const built = readFileSync(resolve(webRoot, 'dist/assets', builtCss), 'utf8'); // 或断言源码
  expect(built).toMatch(/--spacing:\s*0?\.25rem|--spacing:calc/);
  expect(built).not.toMatch(/--spacing:\s*0?\.5rem/);
});
```

要点（**为什么这样改**）：

1. **守卫意图，不守卫数值**：契约是"节奏档全集"+"触控 44px"，不是"某个变量等于某字面量"。
2. **加一条"防再次覆盖"的负向断言**：把本次事故变成可回归的守卫（这是本会话唯一能把"判据错误"钉死的手段）。
3. **若 captain 选 (b)**：则把 ① 改成断言 `--spacing: 0.5rem` **并附一行注释说明"数字档 = N×8px"**，同时**必须**新增 §6 的 ③（44px 用任意值表达）+ 一条"所有触控类必须写 `min-h-[44px]`"的守卫 —— 否则 44px 底线在代码里无从表达。

## 7. 落地顺序建议（**必须串行**）

1. captain 拍板候选。
2. **等 frontend-flow 的视觉改造告一段落**（或由他暂停）→ 我改 `--spacing` + 18 处收口 + 测试；
3. 我跑 `pnpm -r test` / `typecheck` / `lint` + `pnpm --filter @music-drift/web build`，并**核对构建产物** `--spacing:.25rem`；
4. frontend-flow 做 1440/375 截图复验（`docs/ui-review/` 已有 before 图可对照）；
5. 我按 captain 预告的「视觉一致性复核」独立对照 DESIGN.md（不与实现者同一人）。

**为什么不能并发**：`--spacing` 是全局几何开关，与"他在改几何"叠加会使回归无法归因（谁的改动导致变大/变小将不可分辨）。

## 8. 用到的 skill 条款（原文引用）

按 §46.5 要求，本轮视觉/动效/尺度判断逐条引原文：

**`afrexai-ui-design-system`**

1. 「### Spacing System — Use a **4px base unit** (0.25rem):」其后表格：`1: "0.25rem"   # 4px — tight gaps`、`2: "0.5rem"    # 8px — between related items`、`3: "0.75rem"   # 12px — form field padding`、`4: "1rem"      # 16px — card padding, standard gap`、`6: "1.5rem"    # 24px — section padding`、`8: "2rem"      # 32px — between sections`、`12: "3rem"     # 48px — large section gaps`、`16: "4rem"     # 64px — hero padding`。
   → **这份表格与 DESIGN.md 的 8 档完全同构，且明确以 0.25rem 为基准** —— 是 §5.1 映射表的直接依据。
2. Phase 9 CSS Architecture rules：「- "No magic numbers — use spacing/size tokens"」→ 支持"18 处非档位值收口为 token 或显式 px"的处理方向。
3. Phase 8 评分表：「| Whitespace | 15% | Breathing room between sections? Not cramped? **Not wastefully sparse?** |」与「| Consistency | 15% | **Same spacing, colors, radius, typography throughout?** Component reuse? |」→ 当前 ×2 基准直接命中这两条扣分项（"过松"+"间距不一致"）。
4. Phase 4 Button Hierarchy：「**Minimum touch target: 44×44px** (even if button looks smaller visually)」→ 支持"44px 必须有可读、可守的类名表达"，即候选 (a) 的 `min-h-11`。

**`css-animation-creator`**

1. Workflow 第 5 条：「Constrain animated properties to `transform` and `opacity` for GPU acceleration. Apply `references/performance.md`.」
2. Workflow 第 6 条：「Honor reduced-motion preferences for every animation. Apply `references/accessibility.md`.」
3. Workflow 第 7 条：「Verify on low-end devices and confirm no layout thrash before shipping.」
   → 与本案的关系：**spacing 尺度会波及 `translate-*` / `space-*` 这类"用尺度表达的动效位移"**；实测本仓该类用法 **0 命中**，DESIGN.md 的 16px 入场位移写在 `var(--entry-shift)` 里因此免疫。建议在 §6 的守卫里加一条负向断言：**不得新增 `translate-*` / `space-*` 数字档**（避免将来基准变化时位移被静默放大，违反第 5 条的 transform-only 纪律）。

**`frontend-design`**

1. 「When writing the code, be careful of structuring your CSS selector specificities. It's easy to generate CSS classes that cancel each other out (especially with a type-based selector like .section and an element-based selector like .cta). This can happen often with padding/margin between sections.」→ 尺度基准统一是"padding/margin 不互相抵消"的前提。
2. 「Build to a quality floor without announcing it: responsive down to mobile, visible keyboard focus, reduced motion respected, visually accessible, harmonious color palettes.」→ 尺度统一属"质量地板"，不应靠"眼调"维持。
3. 「Work in two passes. First, brainstorm a short design plan based on the client's design brief: create a compact token system with color, type, layout, and principles.」→ 支持"token 为源、类名语义稳定"的方向。

## 9. 待 captain 裁决

1. **选 (a) 还是 (b)**（我推荐 (a)，理由见 §0/§4）。
2. 若选 (a)：是否允许我**同时**把 §5.1 的「DESIGN.md Base unit 表述补一句限定」写成一个小 amend（**需你批**，我不会自行改 DESIGN.md）。
3. 落地时机：由你决定何时让 frontend-flow 暂停几何改动，我按 §7 串行执行。
4. 18 处非档位值（③ 组件尺寸 14 处 + ④ 间距越界 4 处）：统一按「显式 px」处理，还是收最近档位？我倾向**组件尺寸写显式 px、间距类收档位**（`gap-5`→`gap-4`/`gap-6`、`p-5`→`p-4`/`p-6`、`pb-24`→`pb-16`、`p-0.5`→`p-1`）。
