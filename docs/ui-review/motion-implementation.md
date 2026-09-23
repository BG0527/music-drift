# 动效实施记录（P1–P7 + A1–A4 + 全仓守卫）

> 上游：`docs/ui-review/motion-audit.md`（t37，只读审计）+ captain 的四项裁决（A2 涟漪两种角色 / A1·A3·A4 补 token / A6 `duration-*` 算合规但要守卫 / P1–P7 批准立即做）。
> 本记录是**实施**记录，审计文档保持"只读产物"的原样，不在这里改。
> **纪律**：TDD 红→绿；`commandsRun` 只粘贴真实输出；未 commit（由 captain 统一提交）。

---

## 0. 一句话

按 captain 裁决落地了 **P1/P2/P3/P5/P6/P7 + A1/A2/A3/A4**，并把三条原本无人守的动效纪律（§3 属性白名单、§2 契约参数、§5 禁 key-remount）写成**全仓守卫**。
**P4（骨架→内容淡入）延后**，与 P8/P9 同一批做（理由见 §4）。**P8/P9 未动**（等 t36 收口，captain 已定）。

新增守卫文件 `apps/web/src/design-system/__tests__/motion-contract.test.tsx`：**17 例，首轮 13 例红 → 全绿**。

---

## 1. 落盘清单（文件 → 改了什么 → 契约来源）

| 文件 | 改动 | 契约 / skill 依据 |
| --- | --- | --- |
| `DESIGN.md`（front matter `motion:`） | +7 行：`shimmerDuration: 1400ms` / `rippleDuration: 2400ms` / `exitDuration: 240ms` / `toastSuccessDuration: 3000ms` / `toastInfoDuration: 5000ms` / `toastErrorPersistent: true` | A1/A2/A3/A4；`motion-web` §2「需要契约里没有的参数 ⇒ **先补设计契约**」 |
| `DESIGN.md`（Elevation & Depth） | +Exit animations 一条（退场 240ms = 入场一半，进出必须配对）；+**Ripples 两个角色**（① 事件涟漪：标记状态变化/落点、只播一次；② 场景涟漪：hero 常驻母题，须低幅度低速度 + reduced-motion 静止，**并写明产品理由**）；+Toast 生命周期一条 | captain A2 裁决原文；`motion-web` §1 decoration 三条件、§4「退场更快」 |
| `design-system/theme.css` | +`--motion-shimmer-duration` / `--motion-ripple-duration` / `--motion-exit-duration` | token 必须能被组件引用 |
| `design-system/tokens.ts` | `motion` 对象 +`shimmerDuration` / `rippleDuration` / `exitDuration` | JS 侧与 CSS 同源（`tokens.test.ts` 的 drift guard） |
| `design-system/motion.css` | ① `.hover-lift` **只过渡 transform**；② 新增 `.hover-lift::after` 阴影层（`box-shadow: var(--shadow-lift)` + `opacity` 交叉）；③ `shimmer` 改引用 `var(--shimmer-duration)`、`ripple` 改引用 `var(--ripple-duration)`；④ `:root` +3 个工作变量 | **V1/V3/V4**；`motion-web` §3（只允许 transform/opacity）、§2（引用 token 名） |
| `design-system/button.tsx` | 过渡去掉 `box-shadow`；主按钮改用 `.hover-lift`（不再 `hover:shadow-lift` + `hover:scale-[1.03]`） | **V1 的同一类违规**（审计 §2 第 1 条里就有 `+ box-shadow`）；`DESIGN.md` §Interaction States hover 行「scale(1.03) + shadow lift」 |
| `design-system/nav.tsx` | **BottomNav**：+`transition-colors duration-200 ease-out hover:bg-wave-white/70 active:bg-tide-pool` + `focus-visible` 环（原来**零反馈**，实测命中 0）；**SidebarNav**：+`transition-colors`（原来 hover 是瞬变） | **M4/M7**；`motion-web` §1「feedback 是默认该有的」、`frontend-design` L59（visible keyboard focus 是地板） |
| `design-system/tabs.tsx` | tab 按钮 +`transition-colors duration-200 ease-out` | **M8**（选中态原来瞬变） |
| `features/bottle/my-bottles.tsx` | `<li>` 撤掉 `hover-lift` | **M9**；`motion-web` §1（说不出"替代或补充了什么"的动效不该存在） |
| `pages/sea-page.tsx` | ① 卡片撤掉 `hover-lift`；② 列表项入场去掉 `index < 4` 门槛，改 `enter-rise stagger-${(index % 4) + 1}` | **M9 的补充更正**（见 §3）、**M6**（追加项凭空出现）；`motion-web` §1 guidance、§4「stagger 延迟相同且小、不要长尾」 |
| `features/bottle/vote-controls.tsx` | 计数变化用 **Web Animations API** 播一次性 opacity 反馈，时长取 `motion.pageDuration`，`prefersReducedMotion()` 为真时**不发**；**没有**用 `key={count}` | **M5**；`motion-web` §1（原文点名「投票后的确认」）、§3、§5（禁 key 重播）、§7（reduced-motion）、§2（引用 token） |
| `design-system/__tests__/motion-contract.test.tsx`（新） | 17 例：§3 属性白名单 / §2 参数来源 / §5 全仓 key-remount（含反向控制）/ §1 feedback 落位 | 「把纪律变成断言」（captain 点名要求） |
| `design-system/__tests__/tokens.test.ts` | 动效 token 逐条映射 +3；drift guard 配对 +3 | 新 token 必须进既有守卫，否则契约会漂 |
| `design-system/__tests__/fonts-and-motion.test.ts` | **修「用例名比断言强」**：原名「hover 只做 scale(1.03)…」只断言两个值；现在断言 `.hover-lift` 过渡只含 transform、**不含 box-shadow** | 审计 §3 V1 末尾；`motion-web` §8 L85（"看起来在验证、实际没验证"） |
| `design-system/__tests__/components.test.tsx` | Button 的 hover 断言随实现更新（`hover-lift` + 明确禁止 `hover:shadow-lift` / `transition-[…box-shadow]`） | 同上 |

---

## 2. TDD 红 → 绿（真实输出）

**红**（新守卫首次运行，实现尚未改）：

```
$ pnpm --filter @music-drift/web exec vitest run src/design-system/__tests__/motion-contract.test.tsx
 ❯ src/design-system/__tests__/motion-contract.test.tsx (17 tests | 13 failed)
   × .hover-lift 的过渡只含 transform，不含 box-shadow（box-shadow 的尺寸/位置是明文禁止）
     AssertionError: expected '\n    transition:\n      transform va…' not to match /box-shadow/
   × .hover-lift:hover 不得声明 box-shadow（抬升必须走独立图层的 opacity 交叉）
   × 阴影抬升由 ::after 的 opacity 交叉实现（只动 opacity，几何固定）
   × Button 的过渡属性不含 box-shadow
   ✓ 全仓没有 transition-all、也没有动画布局属性（width/height/top/left/margin/padding）
   × motion.css 的 animation/transition 声明里不得出现时间字面量（必须 var(--token)）
   × DESIGN.md 的 motion 块登记了 shimmer / ripple / exit 三项时长（审计 A1/A2/A4）
   × theme.css 把新登记的 token 暴露为 --motion-*
   ✓ 全仓 duration-<n> / scale-[…] / translate-y-[…] 字面量都在 DESIGN.md 契约值集合内
   ✓ 反向控制：检测器确实会红（坏样本命中、列表 key 不误报）
   ✓ 全仓扫描：违例只允许出现在已登记的位置（当前为 route-view，修复排在 P8/P9）
   × BottomNav：每项都有过渡 + 按下反馈 + 焦点环（移动端主交互不得零反馈）
   × SidebarNav：每项都有颜色过渡（对照 BottomNav，两处手感必须一致）
   × Tabs：每个 tab 都有颜色过渡（选中态切换不得瞬变）
   × hover-lift 只能挂在可交互宿主上（不可点的卡片/行挂它 = 承诺不存在的交互）
   × 公海列表的每一项都有入场（追加的第 5 项起不得凭空出现）
   × 投票计数变化有一次性反馈，且 reduced-motion 下不发动画（§7）
```

**绿**（实现后，同一命令）：

```
$ pnpm --filter @music-drift/web exec vitest run src/design-system/__tests__/motion-contract.test.tsx
 Test Files  1 passed (1)
      Tests  17 passed (17)
```

**回归门**：

```
$ pnpm --filter @music-drift/web typecheck
$ tsc --noEmit          → exit 0（0 error）

$ pnpm --filter @music-drift/web test
 Test Files  62 passed (62)
      Tests  526 passed | 1 skipped (527)
```

> 说明：守卫首轮那 4 个"本来就通过"的用例不是摆设 —— 其中两条是**反向控制**（见 §5），它们证明检测器不是"永远点头"。

---

## 3. 实施中对**自己审计**的两处更正（写下来，避免下一位被误导）

1. **`sea-page.tsx:159` 的卡片同样不可点**。审计 §2 第 7 行把它判为「合规（卡片可点）」，复核源码后确认：整块 `<Card>` 没有 `onClick`、也没有被 `<Link>` 包住，可点的只是卡内的「听这支作品」。⇒ 与 `my-bottles` 的 `<li>` 属同一类（动效承诺了不存在的交互），一并撤销。审计里那一行的判断**是错的**。
2. **P1 不能按字面"删掉阴影"**。`DESIGN.md` L285「Hover states: Scale(1.03) + **shadow lift** over 200ms」与 L382「列表项 hover 同样 scale(1.03) + **shadow lift**」**明文要求**阴影抬升。直接删阴影会违反设计契约 ⇒ 采用审计 §7.1 里并列的 **P1b**：阴影放到独立 `::after` 图层（几何固定），hover 时只过渡它的 `opacity`。这样 §3 与 `DESIGN.md` **同时**成立。
   若 captain 更希望"直接去掉阴影"（观感更素），一句话即可改回 —— 那会改动 `DESIGN.md` L285/L382 的措辞，属需批准项。

---

## 4. P4 为什么延后（不是漏做）

**P4 = `AsyncBoundary` 骨架→内容淡入（审计 M10）。** 延后理由：

1. `AsyncBoundary` 有 **15 个调用点**（`grep -rn "<AsyncBoundary"` 命中 15 处），要做淡入必须给 resolved 分支加一个**包裹元素**——它可能改变 `flex`/`grid` 父容器里子元素的布局语义（例如卡片的 `h-full` 依赖"自己是那个 flex/grid item"）。这不是"加个 class"的量级。
2. 它的父文件 `apps/web/src/pages/shell/**` 与 P8/P9 的 `pages/**` 属同一批在途工作（frontend-flow 的 t36 正在编辑 `pages/**`）。
3. 严重度对比：M10 是**中**；M1/M4/M5/M8 是**高**，已在本批落地。

⇒ 建议与 P8/P9 合并为**一个切片**做，用同一套一屏截图回归（1440 + 375）兜住布局。

---

## 5. 验证证据（命令 + 原始输出）

### 5.1 一屏回归（真实浏览器，1440）

```
$ node apps/web/tools/one-screen-check.mjs --viewport=1440x900 --shot=docs/ui-review/after-motion
viewport=1440x900 口径=desktop(整页高度) threshold=900 negativeControl=false hermetic
OK   /                                    height=900  home-pick=383
OK   /river                               height=900  river-draw=654 river-drop=654
OK   /sea                                 height=900  sea-list=445
OK   /new                                 height=900  new-catalog=444
OK   /sea/1c6fe071-…                      height=900  sea-play=522
OK   /me                                  height=900  me-bottles=541
OK   /settings                            height=900  settings-attribution=553
OK   /bottles/ff6143e2-…                  height=900  bottle-play=668 bottle-action=668
OK   /bottles/6ae0fe7a-…                  height=900  bottle-play=640 bottle-action=640
OK   /bottles/cd58da51-…                  height=900  bottle-record=638
OK   /bottles/ff6143e2-…/log              height=900
OK   /nope-does-not-exist                 height=900
✅ 全部页面达标（桌面口径：一屏装下）        EXIT=0
```

### 5.2 反向控制（证明一屏守卫不是"永远点头"）

```
$ node apps/web/tools/one-screen-check.mjs --viewport=1440x900 --negative-control
FAIL …（注入 2000px 后 12/12 FAIL）
✅ 反向控制成立（整页高度断言）：注入 2000px 后 12/12 FAIL ⇒ 守卫不是永远点头   EXIT=0

$ node apps/web/tools/one-screen-check.mjs --viewport=375x812 --negative-control
✅ 反向控制成立（锚点断言）：注入 2000px 后 10/12 FAIL ⇒ 守卫不是永远点头        EXIT=0
（另 2 条路由无关键锚点，脚本按设计显式列出，不静默跳过）
```

### 5.3 375 有一个红 —— **不是本批改动引起，归因已查清**

```
$ node apps/web/tools/one-screen-check.mjs --viewport=375x812 --shot=docs/ui-review/after-motion-375
FAIL /river  height=1052  river-draw=470 river-drop=832 ← 锚点 river-drop 下沿 832 > 812
❌ 1 个页面不达标                                                              EXIT=1
```

- **两次独立 hermetic 运行（库不同）结果完全一致（832）** ⇒ 不是抖动、与数据无关。
- 定位到 `apps/web/src/pages/river-page.tsx` 工作区里**别人的在途改动**（`git diff` 原文）：

```diff
-              选一首歌，录下第 1 段 15–30 秒，然后投进河道等一个陌生人接下一棒。
+              选一首歌，录下第 1 段——每段都有固定时长（录之前会告诉你这一段多长），
+              然后投进河道等一个陌生人接下一棒。
```

- 该段在 `river-drop` 锚点**同一个面板内**，`text-[0.875rem] leading-[1.6]` ⇒ 多一行 = **22.4px**；`832 − 22.4 = 809.6 ≤ 812` —— 恰好回到界内（差 2.4px）。
- **结论（推断，未做反证实验）**：这是 t36 文案改动把该面板顶高一行的结果，与本批动效改动无关（本批改动的文件里**没有一个**在 `/river` 的布局链上）。**我没有改队友的文件去反证**（AGENTS.md §8：别人负责的文件不代改）。
- 处置建议：由 t36 owner（frontend-flow）收紧该句或该面板纵向间距；**375 口径是硬门**，需要它复绿。

### 5.4 全仓测试（`pnpm -r test`）与类型检查

```
$ pnpm -r test
packages/shared   Test Files  21 passed (21)   Tests  231 passed (231)
apps/api          Test Files  19 passed (19)   Tests  180 passed (180)
apps/web          Test Files  62 passed (62)   Tests  526 passed | 1 skipped (527)
EXIT=0

$ pnpm -r typecheck
apps/api typecheck: Done
apps/web typecheck: Done        （0 error）
```

对照 captain 的权威基线（98 文件 / 903 例）：shared 231、api 180 与基线一致；web 由 500 → **527**（本批新增守卫 17 例 + 队友在途新增），**全绿、零回归**。

### 5.5 **本批无法证明的部分（如实列出）**

- **hover 与动效的屏幕表现**：一屏截图是**静帧**，证明不了 hover/过渡是否顺眼 —— 这是审计 §10 已声明的口径（`motion-web` §8：只有真实浏览器含录屏/性能采样能证明"屏幕上的表现"）。
- `.hover-lift::after` 阴影层：目前已验证**静止态无异常**（1440 首页截图核对：无溢出阴影、无底色错位），但**hover 抬起那一帧**没有录屏证据。
- V3/V4 修复后的 shimmer/ripple：静止态可见，**节奏观感**需真机。

建议一批做完后由 qa-e2e（t14）用真浏览器探针补 `document.getAnimations()` 断言（审计 §10.1 给了配方：过渡真的发生、时长等于 token、reduced-motion 下动画数为 0）。

---

## 6. 未做 / 遗留

- **P8/P9**（页面过渡 slide + 去掉 `key={match.path}`）：等 t36 收口，captain 已定一起做。守卫已把 `pages/route-view.tsx` 登记进 `KEY_REMOUNT_ALLOWLIST`（**只允许这一个条目**，任何新增都会立刻红）。
- **P4**：见 §4。
- **Tabs 面板的连续性（M8 的 continuity 一半）**：只做了 pill 的 feedback。面板切换的淡入**故意没做** —— 唯一顺手的写法 `key={active.key}` 正是 §5 禁止的 remount 重播，而它会被本批新增的守卫立刻拦下。要做就得走状态驱动（WAAPI 或状态机），留到与 P4 同批。
- **A3/A4 的"退场"本身**：本批只把**时长与生命周期写进契约**（token 落地）；Modal/Toast 的退场实现（需要显式延迟卸载，`motion-web` §5 L53）没有做 —— 那是组件级改动，建议与 P4 同批。
- **A6 的守卫**已落地（全仓 `duration-*` / `scale-[…]` / `translate-y-[…]` 必须落在 `DESIGN.md` 契约值集合内）。
- **未 commit**：按纪律交 captain 提交。
