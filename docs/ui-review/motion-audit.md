# 动效审计与增强提案（t37 · 只读）

> 任务：按 `motion-web` 的目的分类审计全站现有动效，回答「**哪些交互该有回应但其实是硬切**」，
> 并给出提案与分层验证方式。
>
> **本任务全程只读**：未修改任何代码、未修改 `DESIGN.md`。产出仅本文件。
> 审计基线：`DESIGN.md` md5 `458b8c80b745e520f264de2b6e995b7f`（t34 之后未变）。
> 素材：`apps/web/src/**` 静态扫描（命令与原始输出见 §12）、`DESIGN.md`（行号引用）、
> 四个项目级 skill 原文（`.dsh/skills/{frontend-design,afrexai-ui-design-system,css-animation-creator,motion-web}/SKILL.md`）。
>
> **报告纪律（AGENTS.md §10 全局纪律 §70）**：本文所有数字都来自 §12 里成对粘贴的「命令 + 原始输出」；
> 凡属推断一律显式标注「（推断，未执行）」；无一行的数字来自记忆或估计。

---

## 0. 结论摘要（先回答问题）

**captain 的问题**：本项目哪些「该有回应但其实是硬切」的交互？是不是「呆」在这里而不是缺装饰？

**结论：是。缺的不是装饰动效，是 feedback 与 continuity。**
按 `motion-web` §1 的目的四分类，本项目的缺口分布如下（详见 §3–§6）：

| 目的分类 | skill 的原话立场 | 本项目现状 |
| --- | --- | --- |
| **feedback**（回应动作） | §1 L22：「**feedback 与 continuity 是默认该有的**；缺了它们，界面会"没有回应感"」 | **大面积缺失**：底部导航零反馈、Tab 切换瞬变、投票计数硬换、侧栏 hover 无过渡 |
| **guidance**（指出接下来看哪） | §1 表：例「新内容入场」 | **部分缺失**：分页追加的第 5 张起没有入场（`index < 4`） |
| **continuity**（维持连续感） | §1 L22 同上；§1 表例「页面切换、模态进出」 | **大面积缺失**：页面切换只有 fade 无 slide 且无退场（`DESIGN.md` L286 明文要求 Fade + slide）、Modal/Toast 无退场、骨架→内容硬切 |
| **decoration**（纯装饰） | §1 L23：「**decoration 默认不做**」，需产品级理由 | **恰好克制，不建议增加**；唯一的常驻循环（涟漪）需要一次裁决，见 A2 |

**一句话**：让人「呆」的是**动作做完之后界面不动声色**（点底栏、切 Tab、投票、开关模态、换页），
不是「少了水波」。按 `frontend-design` L32 的原话，散落的装饰动效反而会「read as AI-generated」——
所以本审计的提案方向是**补回应与连续性**，而不是加特效。

同时必须记一笔**做对的地方**（§8 逐条自检里详列）：只动 `transform`/`opacity`（布局属性动画命中 0）、
无 `transition-all`（命中 0）、无任意时长值（命中 0，唯一命中是测试里的负向断言字符串）、
`prefers-reduced-motion` 有全局兜底 + 逐项降级且与 `DESIGN.md` L419 **逐字对应**、加载语义全站统一为骨架无 spinner。

---

## 1. 方法与可验证性口径（先说清能证明什么）

- **本审计全部结论都在「源码结构」层**：靠静态扫描证明「用了哪个类 / 引用了哪个 token / 有没有退场分支」。
  按 `motion-web` §8 的表格，这一层能证明的是「属性」与「时长/缓动」两行 —— 即「只用了允许的属性、引用了 token」，
  **不能证明流畅度，更不能证明「改完更顺」**。
- **静态截图不能证明动效**。本项目已有 48 张截图（`docs/ui-review/{after,after-375,after-v1,after-v1-375}/`），
  但一张静帧只能证明「某一刻的样子」；`home-page.tsx:68` 的注释已经踩过这个坑并写下来了：
  > 「只用 `RippleRing`（纯动画）时，涟漪会随动画淡出 —— 静止截图/静态环境下…」
  所以本审计**不把截图当作动效证据**。
- **jsdom 单测同样不能证明渲染**。仓库里已有一份动效守卫测试（`apps/web/src/features/audio/motion-usage.test.ts`，
  由 audio-engineer 写），它自己在注释里就把这件事说清楚了（§12 E18 原文）：
  > 「**不能证明**：屏幕上的流畅度/视觉表现 —— jsdom 没有布局与合成器（§8 明说"单元层无法证明渲染效果"）」
- 因此 §10 给出一套**分层验证配方**，并逐条标注「哪一层证明不了」。

---

## 2. 现有动效清单（逐页逐交互，全集）

扫描口径：`grep -rl "transition|animation|enter-rise|enter-fade|stagger|hover-lift|shimmer|ripple|scale-\[" apps/web/src --include=*.tsx --include=*.css`
→ 20 个文件（§12 E1）。逐条清单如下（「来源」列写明时长/缓动来自 token 还是字面量）：

| # | 位置（file:line） | 触发 | 动的属性 | 时长 / 缓动来源 | 目的分类（§1） | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `design-system/button.tsx:16,24,28` | hover / 按下 | transform(scale 1.03 / translateY -1px) + box-shadow + background-color | `duration-200 ease-out` 字面量档位；值等于 `--motion-hover-duration` | feedback | 合规（反馈存在）；数值写法见 V3 |
| 2 | `design-system/modal.tsx:45`（scrim） | 打开 | opacity（`enter-fade`） | `--page-duration`(300ms)+`--entry-easing` | continuity | **只进不出**（M2） |
| 3 | `design-system/modal.tsx:58`（dialog） | 打开 | opacity + translateY（`enter-rise`） | `--entry-duration`(480ms)+`--entry-easing` | continuity | **只进不出**（M2）；480ms 见 A4 |
| 4 | `design-system/toast.tsx:32` | 挂载 | opacity + translateY（`enter-rise`） | 同上 | feedback（反馈通道自身） | **无生命周期、无退场**（M3） |
| 5 | `design-system/motion.css:83-92` `.hover-lift` | hover | transform(scale) **+ box-shadow 几何** | 均引用 `--hover-duration` / `--hover-scale` | 名义 feedback，实为 decoration | **V1（§3 禁令）** |
| 6 | `features/bottle/my-bottles.tsx:83` | hover 行 | 同上 | 同上 | 无（`<li>` 不可点，见 M9 说明） | **V1 + 伪 affordance** |
| 7 | `pages/sea-page.tsx:156` | hover 卡片 | 同上 | 同上 | feedback | 合规（卡片可点）；写法见 V1 |
| 8 | `features/bottle/vote-controls.tsx:121` | hover / 按下 | transform | `duration-200 ease-out` 字面量 | feedback | 按钮合规；**计数无反馈**（M5） |
| 9 | `pages/sea-page.tsx:117` | 首批 4 张卡挂载 | opacity + translateY，`stagger-1..4` | `--entry-duration` / `--stagger-step` | guidance | 前 4 张合规；**第 5 张起无入场**（M6） |
| 10 | `pages/route-view.tsx:63` | 路由切换 | opacity（`enter-fade`）**仅此** | `--page-duration` | continuity | **缺 slide、缺退场、且靠改 key 重播**（V2 + M1） |
| 11 | `features/audio/segment-player.tsx:160` | 状态文字变化 | opacity（`enter-fade`） | `--page-duration` | feedback | 合规（已有 guard，§12 E18） |
| 12 | `features/audio/recorder-panel.tsx:337` | 四态文字变化 | opacity（`enter-fade`） | 同上 | feedback | 合规（t30 已配 `aria-live`） |
| 13 | `features/audio/segment-player.tsx:175` | 播放进度 | transform(scaleX) | `duration-200 ease-out` | feedback | 合规（transform 而非 width，正确） |
| 14 | `features/audio/accompaniment-player.tsx:89` | 播放进度 | transform(scaleX) | 同上 | feedback | 合规 |
| 15 | `pages/home-page.tsx:90` | hero 主按钮 hover/按下 | transform + background-color | `duration-200 ease-out` | feedback | 合规（t35 加了焦点环） |
| 16 | `pages/river-page.tsx:78,137` | 两个 CTA | 同 15 | 同上 | feedback | 合规 |
| 17 | `features/audio/mix-export-panel.tsx:137` | 导出按钮 hover | transform | `duration-200 ease-out` | feedback | 合规 |
| 18 | `design-system/motion.css:95-104` `.skeleton-shimmer` | 常驻（加载中） | background-position（`infinite`） | **字面量 `1.4s`**，`DESIGN.md` L378 有值但 motion token 块无该项 | feedback（加载中） | **V3（§2 内联数值）** |
| 19 | `design-system/motion.css:107-109` `.ripple-ring` | 常驻（无限循环） | opacity + scale（`infinite`） | **字面量 `2.4s`，契约完全无据** | decoration | **V4（§2 + §9）** |
| 20 | `design-system/nav.tsx:73-74`（SidebarNav） | hover | background-color **无 transition** | 无 | feedback | **颜色瞬变**（M7） |
| 21 | `design-system/nav.tsx`（BottomNav，`/function BottomNav/,/^}/` 内） | hover / 按下 / 聚焦 | **无任何动效类** | 无 | feedback | **零反馈**（M4，E7 命中 0） |
| 22 | `design-system/tabs.tsx:61-73` | 点 Tab | 选中 pill 瞬变 + `{active?.content}` 硬替换 | 仅 `hover:bg-info-tint`，无 transition | feedback + continuity | **硬切**（M8） |
| 23 | `pages/shell/async-boundary.tsx:50-66` | 骨架 → 内容 | **无** | 无 | continuity | **硬切**（M10） |

补充事实（避免误判，见 §12 E32–E35、E22）：

- **不是问题**：`home-page.tsx:114` 注释明确「mood-filters：5 个标签；Demo 只作展示（**不参与筛选**）」——
  非交互元素不需要 feedback，**不计入缺失**。
- **不是问题**：`sea-page.tsx:130` 的「加载更多作品」已传 `loading={sea.isFetchingNextPage}`，
  按钮自身有加载态（Button 的 hover/按下 + 加载样式），**不计入缺失**。
- **不是问题**：加载语义全站统一为骨架（`async-boundary.tsx` + 11 处调用点，§12 E34），
  无一处 spinner —— 满足 `DESIGN.md` L378「禁 spinner」与 §1 L24「同一动作全程同名」。
- `RippleRing` 实际渲染在 `home-page.tsx:84`、`river-page.tsx:69`（hero 同心圆）与 `showcase:153`（§12 E28）。

---

## 3. 违规（明确的禁令违反）

### V1 · `.hover-lift` 过渡了 `box-shadow` 的几何（违反 §3，中高）

```
apps/web/src/design-system/motion.css:84-86
    transition:
      transform var(--hover-duration) var(--entry-easing),
      box-shadow var(--hover-duration) var(--entry-easing);
:89-92  .hover-lift:hover { transform: scale(var(--hover-scale)); box-shadow: var(--shadow-lift); }
```

`--shadow-card: 0 2px 12px rgba(0,0,0,.06)` → `--shadow-lift: 0 4px 14px rgba(11,58,74,.18)`
（`theme.css:88-89`）**同时改了 blur 与 offset 与色值**，即过渡了 box-shadow 的**尺寸与位置**。

`motion-web` §3 原文（L39-40）：

> - 动画属性**只允许** `transform`（`translate`/`scale`/`rotate`）与 `opacity` —— 它们不触发布局与重绘。
> - **禁止**动画 `width` / `height` / `top` / `left` / `margin` / `padding` / `font-size` / **`box-shadow`** 的**尺寸与位置**
>   （`box-shadow` 的颜色过渡在多数浏览器可接受，但仍应谨慎并实测）。

即：**颜色**过渡是「可接受但需实测」的灰区，**尺寸/位置**过渡是被明文禁止的。当前实现不是颜色过渡。
`§9 禁止清单`第 2 条也把它算作「动画布局属性」一栏的对立面（虽然 `box-shadow` 不触发重排，属绘制开销而非布局开销，
但 skill 的措辞是「只允许 transform 与 opacity」，没有给它开口子）。

**同时**：既有守卫测试 `fonts-and-motion.test.ts:73` 的用例名是
`'hover 只做 scale(1.03) + 200ms，且不位移触发重排'`，但断言体只检查了
`scale(1.03)` 与 `--hover-duration: 200ms`（§12 E41 原文），**没有**断言 box-shadow 未被动画 ——
用例名比断言强，正好落在 §8 警告的形态上：

> **单元层**（jsdom）**无法**证明渲染效果……不要写"看起来在验证动效、实际什么也没验证"的断言

### V2 · 路由用改 `key` 驱动入场（违反 §5，高）

```
apps/web/src/pages/route-view.tsx:63
      <div key={match.path} className="enter-fade flex min-w-0 flex-col gap-6">
```

`motion-web` §5 原文（L54）：

> - **避免 remount 抖动**：进/退场不要靠改 `key` 造成整棵子树重建（会丢焦点、丢输入、丢滚动位置）。

`§9 禁止清单`亦列有「用 `setInterval` 拼动画、或在 effect 里同步 setState 驱动动画」同一纪律族。
仓库自己已经把这条规则落成了守卫（`features/audio/motion-usage.test.ts:44`：
`it('不得靠改 key 触发子树重建来"重播动画"（motion-web §5 明令禁止）')`），
但它只覆盖 `features/audio/` 两个文件，`pages/**` 里的同款写法没被覆盖。

### V3 · `.skeleton-shimmer` 的 `1.4s` 是内联数值（违反 §2，中）

```
apps/web/src/design-system/motion.css:103
    animation: ocean-shimmer 1.4s linear infinite;
```

`DESIGN.md` L378 的组件表里有「shimmer 1.4s」，但 `DESIGN.md` L92-102 的 `motion:` token 块**没有** shimmer 项
（§12 E31 原文：springStiffness / springDamping / entryShift / entryDuration / entryEasing / listStagger /
hoverScale / hoverDuration / pageTransition / animatedProperties —— 共 10 项，无 shimmer）。
`motion-web` §2 原文（L32-33）：

> - 需要契约里没有的参数 ⇒ **先补设计契约**，再在组件里引用。
> - 引用时**写 token 名**，不写它的当前数值（数值可调，语义稳定）。

所以这一条的**修法不是改代码，是先补契约**（见 A1）。注意它和 V1 不同：V3 是实现纪律问题，不是视觉问题。

### V4 · `.ripple-ring` 的 `2.4s` 契约完全无据，且是常驻无限循环（违反 §2 + §9，中高）

```
apps/web/src/design-system/motion.css:107-109
  .ripple-ring { animation: ocean-ripple 2.4s var(--entry-easing) infinite; }
```

- 时长 `2.4s`：**全库仅在 `motion.css` 出现一次**，`DESIGN.md` 的 motion token 块与组件表都没有涟漪时长
  （§12 E19：`DESIGN.md` 里 `2.4s` 零命中）⇒ §2「禁止内联新值」。
- `infinite`：`§9 禁止清单`明文「无产品理由的常驻/循环装饰动效」；
  `§1` 对 decoration 的三条要求里第 ② 条是「常驻动效**不得争夺注意力**（低幅度、低速度、可忽略）」。
- 但 **`DESIGN.md` 给了涟漪产品理由**（所以它不是「无产品理由」）：L142 把「涟漪 (ripples)」列为本系统的水主题母题之一；
  L261 记 Hero 主交互区为「240·180·130 涟漪 + 110 主按钮」；L449「Do 涟漪（ripples）标记状态变化与落点」。
- **张力点**：L449 把涟漪定义为**事件**（标记状态变化与落点），而实现是**常驻无限循环**（hero 三环一直在扩散）。
  这算「有理由但理由与形态不完全对齐」，属**需裁决**（A2），我不自行改。
- reduced-motion 侧是合规的：L419 要求「关闭…涟漪扩散」，`motion.css:117` 的全局 `animation: none !important` 覆盖了它。

### V5 · 数值字面量而非 token 名（违反 §2「引用时写 token 名」，低）

`scale-[1.03]` / `active:translate-y-[-1px]` / `duration-200 ease-out` 在 6 处组件里写字面量：

```
button.tsx:16,24,28 · vote-controls.tsx:121 · mix-export-panel.tsx:137 ·
home-page.tsx:90 · river-page.tsx:78,137 · segment-player.tsx:175 · accompaniment-player.tsx:89
```

值目前**恰好等于**契约（`--motion-hover-scale: 1.03`、`--motion-hover-duration: 200ms`），
所以**没有视觉风险**；违反的是引用方式 —— 契约调参后这些地方不会跟着变（「数值可调，语义稳定」正是为此）。
`§2` 末句还要求「若框架提供了等价档位，优先用**契约已定义的档位**而不是自定义 arbitrary value」，
说明官方倾向也是「用具名档位」而非裸数字。

---

## 4. 缺失（该有 feedback / continuity 却硬切）

判据：`motion-web` §1 L22「**feedback 与 continuity 是默认该有的**；缺了它们，界面会"没有回应感"」。

| # | 位置 | 缺什么 | 用户的直接体感 | 严重度 |
| --- | --- | --- | --- | --- |
| **M4** | `nav.tsx` BottomNav（移动端主交互） | 四个 `<a>` **零** hover/active/transition（E7 命中 0）；只有 `aria-current` + 颜色切换 | 点底栏：图标颜色瞬间变、页面瞬间换，**没有任何"收到了"的反馈**；`§1`「按下缩放」正属 feedback | 高 |
| **M8** | `tabs.tsx:61-73`（用于 `sea-page:40`、`admin-page:56`、`login-page:102`、`showcase:227`） | 选中 pill 瞬变；`{active?.content}` **整块硬替换**（`role="tabpanel"` 无任何过渡） | 切 Tab：内容"啪"地换成另一套，空间上失去连续性 —— `§1` 表把「列表项展开、模态进出」列在 continuity | 高 |
| **M5** | `vote-controls.tsx:129` `{count}` | 计数是纯文本节点，投票后**硬换数字** | 投票后除数字跳变外无确认；`§1` 表把「**投票后的确认**」列为 feedback 的典型例（原话） | 高 |
| **M2** | `modal.tsx:45,58` | **只进不出**：`if (!open) return null` 直接卸载，没有退场分支（E11 命中 0） | 关模态：面板凭空消失 | 高 |
| **M3** | `toast.tsx:32` | 组件无生命周期（E10 命中 0：无 `useEffect`/`setTimeout`/`onDismiss`），只有入场 | toast 出现后由调用方硬切消失 —— **反馈通道自身的消失没有退场** | 高 |
| **M1** | `route-view.tsx:63` | `DESIGN.md` L286「**Page transitions:** Fade + slide (300ms)」只实现了 fade；且**无退场** | 换页：只有一层淡入，没有位移方向感；返回时也没有"退回去"的感觉 | 高 |
| **M10** | `async-boundary.tsx:50-66` | 骨架 → 内容是三条 `return` 的不同子树，**无淡入** | 首屏：骨架条突然变成真内容（整站最常发生的"硬切"） | 中 |
| **M6** | `sea-page.tsx:117` `index < 4 ? ... : undefined` | 只有首批 4 张有 `enter-rise stagger-N`；分页追加的第 5 张起**无入场** | 点「加载更多」：新卡片凭空出现（`§1` 表把「新内容入场」列为 guidance 的典型例） | 中 |
| **M7** | `nav.tsx:73-74` SidebarNav | `hover:bg-wave-white/70` 但**无 `transition-*`** | 桌面侧栏 hover：底色瞬间切换（对比按钮有 200ms 过渡，手感不一致） | 中 |
| **M9** | `my-bottles.tsx:83` | `<li>` 整行有 `hover-lift`（放大 + 抬升），但**该行不可点**（可点的是行内的 `<Link>`） | hover 行会抬起来，暗示"能点"却点不动 → 动效**承诺了不存在的交互**；若按 §1 归类，这个动效连 decoration 的理由都不成立 | 中 |

**关于 M9 的性质**：它不是「少了个动效」，而是「多了个不该有的动效」。
`frontend-design` L32 恰好点了这一族问题（原文见 §9），而 `motion-web` §1 要求「每个动效必须能说清它**替代或补充了什么**」——
`<li>` 的 hover 抬起说不出它补充了什么（行不可点）。

---

## 5. 不一致（同一语义不同表现）

- **I1 · 「入场」有 3 种表现，且分配没有规律**：`.enter-rise`（480ms + 16px，卡片/模态）、
  `.enter-fade`（300ms，路由/状态文字）、`.motion-fade-in`（150ms，reduced-motion 下的等价物）。
  第三个是降级变体（合规，`DESIGN.md` L419 明文要求 150ms），**不算问题**；
  但前两个都用于「内容出现」这一语义，且 `sea-page` 的卡片用 rise、路由容器用 fade，
  `§9 禁止清单`有「同一个语义在不同页面用不同表现」。
- **I2 · 导航三处反馈不一致**：SidebarNav 有 hover 变色（无过渡）、Tabs 有 hover 变色（无过渡）、
  **BottomNav 完全没有**。三处都是「导航项」，反馈档次却差一档（`§9` 同一条）。
- **I3 · 「可点性」的暗示不一致**：`sea-page` 可点卡片有 `hover-lift`，`my-bottles` **不可点**的行也有 `hover-lift`，
  而 `button.tsx` 走的是 `hover:scale`（另一套）。同一个「可交互」语义，视觉语言不统一。
- **I4 · 契约措辞与实现不符（低）**：`DESIGN.md` L419 要求 reduced-motion 时「关闭**水波漂移**、涟漪扩散与列表交错」，
  但全库没有「水波漂移」动画（§12 E5 列出了 `motion.css` 全部 7 处 `animation:` 声明：rise / fade / shimmer / ripple / 降级 3 条）。
  推断：L419 是契约的前瞻性措辞，或指代 `RippleRing` 的扩散本身。**（推断，未执行验证）**——建议 captain 裁决时顺手对齐措辞。

## 6. 「用户会感到呆」的位置（按体感排序，本审计的核心交付）

排序依据：① 触发频率（每天/每次操作）② 动作与反馈之间的「空白时长」③ 是否有其他反馈通道兜底。

| 排序 | 位置 | 用户看到的具体现象 | 为什么这是「呆」 | 对应条目 |
| --- | --- | --- | --- | --- |
| 1 | **移动端底部导航**（`nav.tsx` BottomNav） | 手指按下 → 图标与文字**一点变化都没有**，然后页面整个换掉 | 最高频交互 × 零反馈；`§1` 把「按下缩放」列为 feedback 的第一例 | M4 |
| 2 | **Tab 切换**（公海 / 管理 / 登录） | 选中 pill 颜色瞬间跳，下方内容整块换成另一套 | pill 跳变 + 内容硬替换，**反馈与连续性双缺**；且 3 个页面都在用 | M8 |
| 3 | **投票后**（`vote-controls`） | 数字直接变成新值 | `§1` 原文点名「投票后的确认」是 feedback 典型例，我们恰好没有 | M5 |
| 4 | **关模态 / Toast 消失** | 面板与提示凭空不见 | `§4` L45「不能"弹出来就没了"」；toast 是**反馈通道本身**，它的消失最不该硬切 | M2 M3 |
| 5 | **换页** | 只有淡入，没有方向；返回时没有"退回去"感 | `DESIGN.md` L286 明文 Fade **+ slide**，slide 未实现；且无退场 | M1 V2 |
| 6 | **首屏骨架 → 内容** | 灰条突然变成真内容 | 整站最常发生的一次硬切（11 个调用点都走这条路径） | M10 |
| 7 | **点「加载更多作品」** | 新卡片凭空出现（第 5 张起没有 stagger） | `§1` 把「新内容入场」列为 guidance 典型例；且与首批 4 张不一致 | M6 |
| 8 | **桌面侧栏 hover** | 底色瞬间切换 | 同一个 app 里按钮是 200ms 过渡、侧栏是瞬变，手感不一致 | M7 |
| 9 | **hover 一个不可点的行**（我的瓶子列表） | 行会抬起来，但不响应点击 | 反向的「呆」：动效承诺了不存在的交互 | M9 V1 |

**反向确认（不要做的事）**：不要给 hero、卡片、水波**增加**装饰动效。
`frontend-design` L32 原文明确把「每一张卡都加 hover 过渡 + 每段都 fade-and-slide-up」判为
「the generic default and **read as AI-generated**」（原文见 §9）。本项目现在 `hover-lift` 只用在 2 处
（§12 E29：`my-bottles.tsx:83`、`sea-page.tsx:156`），**扩张它是错的，收缩它才对**（M9）。

---

## 7. 提案（每条标明「合规可改」或「需批准」）

分类口径：
**合规可改** = 不新增契约参数、不动 `DESIGN.md`、不改变产品语义，只用既有 token / 既有 DS 类 / `DESIGN.md` 既有明文要求。
**需批准** = 需要新增 token（= 改 `DESIGN.md`）、需要决定产品语义（常驻装饰留不留、Toast 活多久）、或改动面跨到别人正在编辑的文件。

> 本节结构：**7.1 / 7.2** 是提案本身（按分类二分）；**7.3** 把 §2 的现有实现按「行为族」归并后逐条回答 `motion-web` §10 的 7 个自检问题；
> **7.4** 对每个提案回答同一 7 个问题（§10 要求「答不上就别提交」）。

### 7.1 合规可改（建议作为下一个切片的最小集合）

| 编号 | 提案 | 目的分类 | 动的属性 | 参数来源 | 影响文件 |
| --- | --- | --- | --- | --- | --- |
| **P1** | `.hover-lift` 去掉 `box-shadow` 过渡，只保留 `transform: scale()` | 修 V1 | transform | 已引用 `--hover-duration`/`--hover-scale` | `design-system/motion.css:83-92` |
| **P1b** | （P1 的保留视觉版）若必须保留「抬升感」：把 `--shadow-lift` 放到一个固定定位的伪元素上，hover 时只过渡该层的 `opacity 0→1` | 修 V1 且不降级观感 | opacity | `--hover-duration` | 同上（实现成本更高，二选一） |
| **P2** | BottomNav 四项加 `active:` 反馈 + 颜色过渡（新增一个引用既有 token 的 DS 类，如 `.nav-item`，`transition: color/background-color var(--hover-duration) var(--entry-easing)`），并补齐与 SidebarNav 一致的 `focus-visible` 环 | feedback + 修 I2 | color / background-color（+ transform 可选 `scale(0.97)` 属按钮按下，但导航项建议只做色） | 复用 `--hover-duration` | `design-system/nav.tsx`（+ `motion.css` 加类） |
| **P3** | SidebarNav 与 Tabs 的 hover 补 `transition`（同一 DS 类，避免再开第二套手感） | 修 M7 / I2 | color | 复用 `--hover-duration` | `nav.tsx:74`、`tabs.tsx:73` |
| **P4** | `AsyncBoundary` 骨架→内容加一次性 `enter-fade`（**只动 opacity**，不引入位移，避免与页面入场叠加成双主角） | continuity（M10） | opacity | 复用 `--page-duration` | `pages/shell/async-boundary.tsx:50-66` |
| **P5** | 公海列表：把 `index < 4` 的限制去掉，追加项也给 `enter-rise stagger-N`（N 取 `index % 4`，保持等距小延迟，不产生长尾） | guidance（M6）+ 修 I1 | opacity + translateY | 复用 `--entry-duration`/`--stagger-step` | `pages/sea-page.tsx:117` |
| **P6** | `vote-controls` 计数变化加一次性 `enter-fade`（数字本身） | feedback（M5） | opacity | 复用 `--page-duration` | `features/bottle/vote-controls.tsx:129` |
| **P7** | 我的瓶子列表：从 `<li>` 上撤掉 `hover-lift`（不可点就不该抬起） | 修 M9 / V1 | transform + box-shadow | — | `features/bottle/my-bottles.tsx:83` |
| **P8** | 页面过渡补上 `DESIGN.md` L286 要求的 **slide**：容器加 `transform: translateX` 入场（方向与路由层级一致），并加**退场** | continuity（M1） | opacity + translateX | 复用 `--page-duration` | `pages/route-view.tsx:63`（**跨 frontend-flow 正在编辑的 `pages/**`，需协调排期**） |
| **P9** | 修 V2：去掉 `key={match.path}`，改为「同一容器 + 子内容切换」，让过渡由 CSS 状态驱动而不是靠重播动画 | 修 V2（§5 明令） | — | — | 同上 |

**关于 P8/P9 的边界说明**：`pages/**` 当前由 frontend-flow（t36）在编辑，我不动。
按 `motion-web` §5，P9 的收益不只是「合规」——它同时修掉「丢焦点、丢输入、丢滚动位置」三个真实缺陷，
所以 P8+P9 应作为**一个动作**做（拆开做会先经历一段「fade 变 slide 但仍在 remount」的中间态）。

**关于参数来源的诚实说明（P2/P3/P4/P6/P8 的 `transition` 时长）**：Tailwind 的 `duration-200` 是**档位工具类**，
不是 token 名。`motion-web` §2 末句给了倾向（「优先用契约已定义的档位而不是自定义 arbitrary value」），
所以我建议的做法是**在 `motion.css` 里定义引用 `var(--hover-duration)` 的 DS 类**（沿用现有 `.hover-lift`/`.enter-fade` 的既有模式），
而不是在组件里写 `duration-200`。这样 §2 的「写 token 名」是通过**类名层级**满足的。
**（此路径未做 Tailwind v4 主题命名空间验证 —— `--transition-duration-*` 能否生成具名 `duration-*` 工具类，我没有实测，标为推断。）**

### 7.2 需批准（涉及 `DESIGN.md` 参数或产品语义，我不自行决定）

| 编号 | 提案 | 为什么需要批准 | 候选方案 |
| --- | --- | --- | --- |
| **A1** | 把 shimmer 时长 token 化：`DESIGN.md` motion 块加 `shimmerDuration: 1.4s`，`theme.css`/`motion.css` 出 `--motion-shimmer-duration`，`motion.css:103` 改引用 | 改 `DESIGN.md` = 契约变更（`DESIGN.md` L378 有值但未 token 化，属「补登记」而非「改风格」） | (a) 只补 token（推荐，零视觉变化）；(b) 顺带调时长（需给理由） |
| **A2** | 涟漪的**形态与时长**：`2.4s` 无据 + `infinite` 常驻 | 需决定产品语义：涟漪是「常驻母题」还是「事件标记」。`DESIGN.md` L449 说它「标记状态变化与落点」（偏事件），而 hero 实现是常驻扩散 | (a) 保留常驻，但把 `2.4s` token 化并写明「低幅度常驻母题」的产品理由（对齐 §1 decoration 三条）；(b) 改为**事件驱动**：仅在状态变化时播一次（对齐 L449），hero 用静态同心圆；(c) 保留但降速降幅 |
| **A3** | Toast 生命周期与退场：需要在契约里定「常驻时长」与「退场」 | 属新产品参数；`DESIGN.md` 无 toast 时长/退场条款 | 参考 `afrexai` L490 的档位（success 3s / info 5s / error 常驻直到手动关闭）+ L492「fade-out」退场；退场缓动建议 `ease-in`（`afrexai` L461 把 `ease_in` 定义为「Elements leaving」，我们目前**没有** ease-in token，需新增） |
| **A4** | Modal 退场 + 入场时长复核 | 退场需要新时长 token（`DESIGN.md` 只有入场 480ms / 页面 300ms）；另外 `afrexai` L381 建议模态动画 200–300ms，与我们的 480ms 不同 | (a) 退场复用 `--page-duration`(300ms)（符合 §4「退场通常比入场更快」）；(b) 新增 `exitDuration` token；(c) 顺带把 Modal 入场从 480ms 调到 300ms —— **注意**：这条会改 `DESIGN.md` L284 的入场语义，需要明确裁决，不能顺手改 |
| **A5** | 是否收敛 `hover-lift` 的到场范围（I3） | 属视觉语言取舍 | (a) 只留可点卡片；(b) 统一到 `button.tsx` 的 `hover:scale` 一套；(c) 保持现状 |
| **A6** | V5（数值字面量 → token 名）的修法 | 需与既有 DS 约定对齐（是否允许 `duration-200` 这种档位写法） | (a) 全部改为引用 token 的 DS 类（最严）；(b) 保留 Tailwind 档位但在 `theme.css` 里把档位绑定到 token（可读性最好，需验证 Tailwind v4 命名空间） |

### 7.3 现有实现 × `motion-web` §10 七条自检（逐条核对）

把 §2 的 23 条按「行为族」归并后（同一族行为与参数相同），逐条回答 §10 的 7 个问题。
答「✗」的即本审计认定的问题，指向 §3/§4/§5 的条目。

| 行为族（§2 条目号） | ①目的 | ②参数来自哪个 token | ③只动 transform/opacity | ④退场配对 | ⑤reduced-motion 下 | ⑥其他反馈通道 | ⑦可断言契约 / 哪层证不了 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **按钮类反馈**（1,8,15,16,17） | feedback ✓ | `--hover-scale`/`--hover-duration` 的值，但**以字面量写**（V5） | ✓ transform（V1 只涉及 hover-lift） | 一次性反馈，无配对概念 | 全局兜底 → 瞬时 | ✓ 文字/结构 | 类名断言（L0）；观感需 L3 |
| **列表卡片入场**（9，首批 4 张） | guidance ✓ | `--entry-duration`/`--entry-easing`/`--stagger-step` ✓ | ✓ | 无（入场型） | `enter-rise` 被中性化 ✓ | ✓ 内容本体 | `animation-delay` 单调（L2-4）；节奏观感需 L3 |
| **分页追加项**（9，第 5 张起） | ✗ **无动效** | — | — | — | — | ✓ | 无（M6） |
| **路由入场**（10） | continuity 部分 ✗ | `--page-duration` ✓ | ✓ opacity | ✗ **无退场**（M1） | 全局兜底 ✓ | ✓ URL 变化 | `getAnimations()`（L2）；**焦点/滚动保留需 L2-5 + 真机**（V2） |
| **状态文字**（11,12） | feedback ✓ | `--page-duration` ✓ | ✓ opacity | 一次性 | 兜底 ✓ | ✓ `aria-live`（t30） | 已有 L0 守卫（E18） |
| **播放进度**（13,14） | feedback ✓ | `--hover-duration` 的值（字面量，V5） | ✓ transform(scaleX)，**没有**动 width ✓ | 一次性 | 兜底 ✓ | ✓ 时间文字 | 类名断言（L0） |
| **模态进出**（2,3） | continuity ✗（半个） | `--entry-duration`/`--page-duration` ✓ | ✓ | ✗ **无退场**（M2） | 兜底 ✓ | ✓ 焦点陷阱/标题 | 顺序断言（L2-3），**现在必然失败** |
| **Toast**（4） | feedback ✗（半个） | `--entry-duration` ✓ | ✓ | ✗ **无退场、无生命周期**（M3） | 兜底 ✓ | ✓ `aria-live`（需确认） | 同 L2-3 |
| **骨架 shimmer**（18） | feedback（加载中）✓ | ✗ **字面量 `1.4s`**（V3，契约有值未 token 化） | ✗ 动的是 `background-position`（**非 transform/opacity**），但它是**绘制属性**、不触发布局；§3 白名单严格读法下不通过 | 随加载结束消失（组件卸载） | 兜底 ✓ | ✓ `aria-busy` | 时长 token 断言（L0/L1） |
| **涟漪 ring**（19） | decoration（★需理由） | ✗ **`2.4s` 契约无据**（V4） | ✓ opacity+scale | 不适用（常驻） | 兜底 ✓（L419 要求） | ✓ `aria-hidden` | token 断言（L1）；「是否争夺注意力」**只能真机判**（A2） |
| **侧栏 hover**（20） | feedback ✗（无过渡） | ✗ 无 transition | ✓ 颜色（允许项，L383） | 一次性 | 不适用 | ✓ `aria-current` | 类名断言（L1） |
| **底部导航**（21） | ✗ **无动效** | — | — | — | — | ✓ `aria-current`+文字 | 无（M4） |
| **Tab 切换**（22） | feedback+continuity ✗ | ✗ 无 transition | ✓ 颜色 | ✗ 面板硬替换 | 不适用 | ✓ `aria-selected` | 无（M8） |
| **骨架→内容**（23） | continuity ✗ | — | — | — | — | ✓ `aria-busy` | 无（M10） |
| **卡片 hover-lift**（5,6,7） | ✗ decoration（6 连 affordance 都不成立） | ✓ 引用 token | ✗ **box-shadow 几何**（V1） | 一次性 | 兜底 ✓ | ✓ | 属性白名单断言（L1） |

**这一表的读法**：③ 一栏只要不是全 ✓，就说明 §3 白名单没有全站成立（V1 与 shimmer 各破一处）；
④ 一栏的 ✗ 全在「进出型」动效上（M1/M2/M3）；② 一栏的 ✗ 就是 V3/V4/V5。
**没有一条**在 ⑥ 上失败 —— 即全站**没有把动效当唯一反馈**，这是既有实现里最扎实的一条。

### 7.4 提案与 `motion-web` §10 七条自检（逐条）

对**每一个提案**都按这 7 条过一遍（答不上来的提案不提交）：

| # | 自检问题（§10 原文） | 本批提案的答案 |
| --- | --- | --- |
| 1 | 目的是 feedback / guidance / continuity / decoration 的哪一个？decoration 的话产品理由是什么？ | P1–P3、P6 = feedback；P4、P8、P9 = continuity；P5 = guidance。**本批无一条是 decoration**（正是 §0 结论） |
| 2 | 时长、缓动、位移**分别来自哪个契约 token**？ | `--hover-duration`(200ms)、`--page-duration`(300ms)、`--entry-duration`(480ms)、`--entry-shift`(16px)、`--stagger-step`(100ms)、`--entry-easing`(ease-out) —— 全部已存在于 `motion.css:7-16`。**唯一缺口**：退场缓动（`afrexai` 定义为 `ease_in`）与 shimmer/ripple/exit 时长 ⇒ 已单列为 A1/A2/A3/A4 |
| 3 | 只动 `transform`/`opacity` 吗？ | 是（P2/P3 动 `color`/`background-color` —— 按 `DESIGN.md` L383「颜色变化允许（不触发重排）」是允许项；P1 反而是**移除** box-shadow 动画） |
| 4 | 退场是什么？进出配对了吗？ | P8（页面退场）、A3（Toast 退场）、A4（Modal 退场）补齐配对；其余为「一次性反馈」型（无配对概念，§4 的配对要求针对进/出场） |
| 5 | `reduced-motion` 下它变成什么？ | 全部落进 `motion.css:113-118` 的全局兜底（`animation/transition: none`）；一次性反馈型在降级后即「即时状态变化」，符合 §7 L67「把动效降级为**瞬时状态变化**」 |
| 6 | 还有别的反馈通道吗（文字 / `aria-live` / 结构）？ | P2：`aria-current` 已有（结构）；P6：计数数字本身变（结构）；P4：`aria-busy` 已有；P8/P9：URL 变化。**尚无一条把动效当唯一反馈** |
| 7 | 可断言契约是什么？用什么验证？哪一层验证不了？ | 见 §10（逐项给了「能断言什么 / 用哪一层 / 哪层证明不了」） |

---

## 8. `motion-web` §9 禁止清单逐条核对

| 禁止项（§9 原文） | 现状 | 证据 |
| --- | --- | --- |
| ❌ 内联新的时长/缓动/位移数值（必须来自契约 token） | **命中 2 处** | `motion.css:103` `1.4s`（V3）、`motion.css:108` `2.4s`（V4）；另有 6 处档位字面量（V5，值等于契约） |
| ❌ 动画布局属性（`width`/`height`/`top`/`left`/`margin`/`padding`） | **未命中** | §12 E4：命中 `0` |
| ❌ 忽略 `prefers-reduced-motion` | **未命中**（做得好） | `motion.css:113-118` 全局兜底 + `:122-127` 入场中性化 + `:129-132` 150ms 降级；与 `DESIGN.md` L419 逐字对应；`tokens.ts:136-139` 还有 JS 侧 `prefersReducedMotion()` |
| ❌ 动效作为唯一反馈（无文字、无 `aria-live`） | **未命中** | 录音四态有 `aria-live`（t30）；`aria-busy` 在骨架；`aria-current` 在导航；投票数字本身是结构变化 |
| ❌ 无产品理由的常驻/循环装饰动效 | **部分命中** | `.ripple-ring`（V4）与 `.skeleton-shimmer` 都是 `infinite`。shimmer **有**明文产品理由（`DESIGN.md` L378「文字保留 + shimmer 条（禁 spinner）」）；ripple **有**母题理由（L142/L261）但与 L449 的「事件标记」定义有张力 ⇒ A2 |
| ❌ 同一个语义在不同页面用不同表现 | **命中 2 处** | I1（入场 rise/fade 无规律分配）、I2（导航三处反馈不一致） |
| ❌ 用 `setInterval` 拼动画、或在 effect 里同步 setState 驱动动画 | **未命中**（需精确表述） | §12 E39/E40：全库 `setInterval` 命中 6 处，**全部在 `features/audio/**`**（`listen-reporter.ts:149,237`、`use-recorder.ts:205,206,390,400`），用途是录音/上报计时器，**不是**动效驱动；`will-change` 全库 0 命中 |
| ❌ 把「看起来顺」当作验证结论 | **本审计未使用该口径** | §1 + §10：本文全部结论都在「源码结构」层，并逐项标注哪层证明不了 |
| ❌ 为了动效好看而增加阻塞交互的等待时间 | **未命中** | 所有动效都是 `animation`/`transition`，无 `await`/`setTimeout` 阻塞交互路径（`motion.css` 全文无 JS 时序，§12 E36） |

**额外发现（不属于 §9，但属 §8 纪律）**：`fonts-and-motion.test.ts:73` 的用例名比断言强
（名字说「只做 scale」、断言没查 box-shadow）⇒ 见 V1 末尾；`motion-usage.test.ts` 的守卫范围只覆盖
`features/audio/` 两个文件，`pages/**` 与 `design-system/**` 无同类守卫 ⇒ 建议把该守卫提为全库（合规可改，属测试）。

---

## 9. 四个 skill 的原文引用（逐条对应它支撑的判断）

> 引用均取自 `.dsh/skills/*/SKILL.md`，行号为该文件实际行号，可核对。

### 9.1 `motion-web`（本任务主 skill，`SKILL.md` 共 110 行）

| 引文（原文） | 行 | 它支撑的判断 |
| --- | --- | --- |
| 「**feedback 与 continuity 是默认该有的**；缺了它们，界面会"没有回应感"」 | L22 | **§0 核心结论** + M1–M10 全部缺失项 |
| 「**decoration 默认不做**。若产品确实需要一个常驻母题（例如本项目的"涟漪"作为海洋主题的标记），必须：① 有明确的产品理由并能写进设计文档；② 常驻动效**不得争夺注意力**（低幅度、低速度、可忽略）；③ 在 `reduced-motion` 下可静止。」 | L23 | A2 的裁决框架（涟漪三条逐条对照）；也是「不要加装饰动效」的依据 |
| 「**同一动作全程同名**：同一个语义（如"加载中"）在全站必须同一种表现，不能一个页面转圈、另一个页面骨架。」 | L24 | 正向：加载语义已统一为骨架（§12 E34）；反向：I1/I2 |
| 「需要契约里没有的参数 ⇒ **先补设计契约**，再在组件里引用。」 | L32 | **V3/A1**（shimmer 反了顺序：先写实现后补契约）与 **V4/A2** |
| 「引用时**写 token 名**，不写它的当前数值（数值可调，语义稳定）。」 | L33 | **V5**、A6 |
| 「动画属性**只允许** `transform`…与 `opacity`」/「**禁止**动画…**`box-shadow`** 的**尺寸与位置**（…颜色过渡在多数浏览器可接受，但仍应谨慎并实测）」 | L39-40 | **V1**（`.hover-lift` 过渡了 blur/offset，不是颜色过渡） |
| 「**进出必须配对**：有入场就有对应的退场；不能"弹出来就没了"。退场通常比入场**更快**」 | L45 | **M1/M2/M3** + P8/A3/A4 |
| 「一个交互里**只允许一个"主角"动效**」 | L47 | P4 只做 opacity（避免与页面入场叠加成双主角） |
| 「**超过约 600ms 的入场会让人觉得慢**」 | L48 | A4（Modal 480ms 未越线，但退场应更快）；A1/A2 时长上限约束 |
| 「**卸载动画**需要显式延迟卸载（先播退场，再移除节点）」 | L53 | **M2/M3** 的技术根因（`if (!open) return null` 直接卸载） |
| 「**避免 remount 抖动**：进/退场不要靠改 `key` 造成整棵子树重建（会丢焦点、丢输入、丢滚动位置）」 | L54 | **V2**（`route-view.tsx:63`）+ P9 |
| 「用 `requestAnimationFrame` 或 CSS transition 驱动，**不要用 setInterval 拼动画**」 | L56 | §8 禁止清单核对（未命中，6 处 `setInterval` 全在音频域） |
| 「**必须尊重 `prefers-reduced-motion: reduce`**：覆盖**每一个**动画（全局兜底 + 逐项确认）」 | L67 | 正向：`motion.css` 两件都做了 |
| 「**动效不得是唯一反馈**」 | L68 | §10 自检第 6 条 |
| 「**"看着挺顺"不是证据。**」 | L74 | **本审计 §1 的方法论前提**（全篇不用体感当结论） |
| 「**单元层**（jsdom）**无法**证明渲染效果…不要写"看起来在验证动效、实际什么也没验证"的断言」 | L85 | V1 末尾（守卫用例名比断言强）、§10 分层 |
| 「**只有真实浏览器**（含录屏或性能采样）能证明"屏幕上的表现"」 | L87 | §10 L3/L4 |
| 「❌ 无产品理由的常驻/循环装饰动效」/「❌ 同一个语义在不同页面用不同表现」 | L96/L97 | V4、I1、I2 |

### 9.2 `frontend-design`

| 引文（原文） | 行 | 它支撑的判断 |
| --- | --- | --- |
| 「Use non-user-triggered motion sparingly and deliberately, only to draw attention. A single orchestrated moment — one page-load sequence or one reveal — lands better than scattered effects; **fade-and-slide-up entrances on each section and hover transitions on every card are the generic default and read as AI-generated**. **Motion that answers a person's action (opening, expanding, confirming) is welcome when it shows what changed.**」 | L32 | **§6 反向确认**（不要加装饰动效；`hover-lift` 扩张是错的）+ **§0 结论**（该补的是「answers a person's action」这一类，即 feedback）。注意末句直接为 P2/P3/P6/M8 这类「回应动作」的动效背书 |
| 「Build to a quality floor without announcing it: responsive down to mobile, **visible keyboard focus, reduced motion respected**, visually accessible…」 | L59 | reduced-motion 与焦点可见是**地板**不是亮点 ⇒ P2 顺带补 BottomNav 的 `focus-visible` 属地板修复 |

### 9.3 `afrexai-ui-design-system`

| 引文（原文） | 行 | 它支撑的判断 |
| --- | --- | --- |
| 「instant: "0-100ms" # Button press, toggle, checkbox / fast: "100-200ms" # Hover, color change, small move / normal: "200-400ms" # Panel slide, fade, expand / slow: "400-700ms" # Page transition, complex animation」 | L452-457 | **P2/P3/P6 的参数合理区间**：hover/color 属 `fast`（我们 200ms ✓）；面板/内容切换属 `normal`；页面过渡属 `slow`（我们 300ms ✓，`DESIGN.md` L286） |
| 「ease_out: "cubic-bezier(0.16, 1, 0.3, 1)" # Elements entering (most common) / **ease_in: "cubic-bezier(0.55, 0, 1, 0.45)" # Elements leaving**」 | L460-461 | **退场需要一个 ease-in 类缓动**，而本项目没有 ⇒ A3/A4 的参数缺口（P 类提案全部只用到已有 `ease-out`，因此不阻塞） |
| 「enter: "opacity 0→1, translateY 8px→0, 300ms ease-out" / **exit: "opacity 1→0, 200ms ease-in"**」 | L465-466 | **A3/A4 的直接模板**：退场比入场更快（与 `motion-web` L45 一致，两个 skill 互相印证） |
| 「hover_lift: "translateY -2px, shadow-md, 150ms"」 | L469 | **注意：此处与 `motion-web` §3 冲突** —— afrexai 的 `hover_lift` 模式**含 shadow**。裁决：以 `motion-web` §3 + `DESIGN.md` L383（「过渡只允许 `transform` / `opacity`；颜色变化允许…但禁止动画 `width/height/top/left/margin`」）为准，即 **P1 成立**。这条冲突已在此显式记录，不隐藏 |
| 「**Animation**: fade + slight scale-up (200-300ms)」（Modal & Dialog Design） | L381 | **A4**：我们的 Modal 入场 480ms 比它慢；但 `DESIGN.md` L284 明文 480ms ⇒ 按 AGENTS.md §4「`DESIGN.md` 是唯一风格契约」，**以 `DESIGN.md` 为准**，不视为冲突任务（skill ≠ Figma 稿），仅作为 A4 的参考值记录 |
| 「duration: "success: 3s, info: 5s, error: persistent until dismissed" / animation: "slide-in from right, fade-out"」 | L490-492 | **A3**（Toast 生命周期档位与退场方向）。注意方向性：本项目 toast 位置由 `DESIGN.md` 未定，若采纳需一并定 |

### 9.4 `css-animation-creator`

| 引文（原文） | 行 | 它支撑的判断 |
| --- | --- | --- |
| 「Constrain animated properties to `transform` and `opacity` for GPU acceleration. Apply `references/performance.md`.」 | L29 | **V1**（box-shadow 不在允许清单内）与 P1 |
| 「Honor reduced-motion preferences for **every** animation. Apply `references/accessibility.md`.」 | L30 | 正向核对：`motion.css` 全局兜底覆盖每一个动画（`*` 选择器） |
| 「**Verify on low-end devices and confirm no layout thrash** before shipping.」 | L31 | **§10 L4**：低端设备验证是本审计**无法完成**、必须留到真机/性能采样的项 |
| 「`references/accessibility.md` — `prefers-reduced-motion` CSS, Tailwind motion-safe/reduce, React hook.」 | L42 | §10 的 reduced-motion 验证可借 `motion-safe:`/`motion-reduce:` 变体与 React hook（本项目已有 `tokens.ts:prefersReducedMotion()`） |

**skill 之间的冲突登记（显式，不隐藏）**：
1. `afrexai` L469 的 `hover_lift` 含 shadow ↔ `motion-web` §3 只允许 transform/opacity ⇒ 取 `motion-web`（更具体 + 与本任务指定 skill 一致 + `DESIGN.md` L383 同向）。
2. `afrexai` L381 的 Modal 200–300ms ↔ `DESIGN.md` L284 的 480ms ⇒ 取 `DESIGN.md`（AGENTS.md §4）。
两者都**不是** Figma 出入，因此不触发 AGENTS.md §5 的上报义务；但我按「不隐藏冲突」原则列在这里，供 captain 一并裁决（A4 已包含第 2 条）。

## 10. 各层验证方式（哪些证明得了、哪些证明不了、哪些必须真机/录屏）

按 `motion-web` §8 的分层纪律，把本审计的每条结论与每个提案钉到能证明它的那一层：

| 层 | 能证明什么 | **不能**证明什么 | 本审计/提案里跑在这一层的项 |
| --- | --- | --- | --- |
| **L0 jsdom 单测**（`vitest` + `fonts-and-motion.test.ts`、`motion-usage.test.ts`） | 类名是否存在、token 是否被引用、守卫模式（禁 `duration-[…]`、禁 key-remount） | **渲染效果、流畅度、视觉是否"顺"**（无布局、无合成器，§8 L85 明说） | V1 的守卫缺口（用例名 vs 断言）；P1/P7 的类名断言 |
| **L1 静态扫描**（本审计用的全部 grep） | 属性白名单（只 transform/opacity）、时长/缓动的引用来源、有无退场分支、有无 `infinite` | 流畅度、屏幕表现 | §2 清单、V1–V5、M1–M10、I1–I4 的**全部**结论 |
| **L2 真实 Chromium + Web Animations API**（`document.getAnimations()`，仓库已有 `npx playwright` 用法见 `apps/web/tools/one-screen-check.mjs`） | **过渡真的发生了**、时长/缓动等于契约值（`animation.effect.getTiming()`）、`reducedMotion: 'reduce'` 下动画数为 0 | 「看起来顺不顺、有没有掉帧」 | **新增的推荐层**（见下方断言清单）—— 比截图强得多，且不需要录屏 |
| **L3 录屏 / 性能采样**（真机或 CPU 降速） | 60fps、无掉帧、低端设备表现（`css-animation-creator` L31 明确要求） | 仍不能证明「是否好看」，只能证明「是否流畅」 | **必须真机的项**：P2 的触摸按下反馈、P8 页面过渡的观感、P5 追加 stagger 的节奏 |
| **L4 真机交互验证**（焦点/滚动/输入是否丢失） | `motion-web` §5 L54 点名的三个后果：**丢焦点、丢输入、丢滚动位置** | — | **V2/P9 的唯一硬证据层**（见下方断言清单，可在真实 Chromium 里自动断言） |

### 10.1 建议加入的 L2 断言（真实浏览器，不需要录屏）

这套断言能把 P2–P9 从「看着挺顺」提升为可回归的契约（`motion-web` §8 要求的「可断言契约」）：

1. **过渡真的发生**：`page.getAnimations().length > 0` 且 `effect.getTiming().duration` 等于 token 值
   （200ms / 300ms / 480ms）—— 用于 P2/P3/P4/P6。
2. **reduced-motion 降级生效**：`page.emulateMedia({ reducedMotion: 'reduce' })` 后，
   同一交互的 `getAnimations()` 中**不含** `infinite` 动画，且入场类被中性化（对应 `motion.css:113-132`）。
3. **退场确实发生在移除之前**（§8 表格「次数/顺序」行）：关 Modal / 关 Toast 后，
   先出现退场动画再 `detach` —— 这是 A3/A4 落地后的验收断言，**现在必然失败**（因为根本没有退场分支）。
4. **stagger 延迟存在且单调**（§8 表格同款）：读 `animation-delay` 序列，断言等距 100ms —— 用于 P5。
5. **P9 的三个真实缺陷可断言**：路由切换前后断言 `document.activeElement` 不变、`window.scrollY` 保留、
   受控输入框的 `value` 不丢。这三个断言**现在必然失败**（`key={match.path}` 会重建子树），
   修完才通过 —— 这正是 V2 的「红→绿」证据。

### 10.2 本审计证明不了的（如实列出，不含糊）

- **所有动效的观感**（顺不顺、快不快、晃不晃）：需要 L3 录屏/真机，本文一律不给观感结论。
- **触摸设备上的 `:active` 反馈**：`:active` 在桌面鼠标也存在，但触摸的「按下去有回应」体感只能在真机上看（P2）。
- **`infinite` 动画在长时间运行下的耗电/掉帧**：需 L3（`css-animation-creator` L31）。
- **`hover-lift` 去掉 shadow 后的观感损失**（P1 vs P1b 的取舍）：需真机对比。
- **A4 中 Modal 480ms 是否偏慢**：`motion-web` L48 的 600ms 是上界，480ms 不越界，但「主观是否偏慢」需真人看（需用户/真机）。

---

## 11. 未决 / 需 captain 或用户裁决

| # | 事项 | 类型 | 阻塞谁 |
| --- | --- | --- | --- |
| 1 | **A2 涟漪形态**：常驻母题 vs 事件标记（`2.4s` 的 token 化随形态一起定） | 产品语义 | 阻塞任何涉及 `RippleRing` 的动效改动 |
| 2 | **A3 Toast 生命周期**（常驻时长 + 退场 + 退场缓动 token） | 契约参数 | 阻塞 M3 的修复 |
| 3 | **A4 Modal 退场时长**（复用 300ms 还是新增 `exitDuration`）；顺带确认 480ms 是否维持 | 契约参数 | 阻塞 M2 的修复 |
| 4 | **A1 shimmer token 化**（`DESIGN.md` motion 块补一项） | 契约补登记 | 阻塞 V3 |
| 5 | **P8/P9 的排期与归属**：`pages/route-view.tsx` 属 `pages/**`，正被 frontend-flow（t36）编辑 | 协作边界 | 阻塞 M1/V2 |
| 6 | **退场缓动是否有 token**（`afrexai` L461 的 `ease_in`）：本项目无 | 契约参数 | 阻塞 A3/A4 的完整实现 |
| 7 | **I4 措辞对齐**：`DESIGN.md` L419「水波漂移」在全库无对应实现（**推断**：前瞻性措辞，未验证） | 文档措辞 | 不阻塞，建议顺手对齐 |
| 8 | **V1 的取舍**：P1（去掉 shadow，最小改动）还是 P1b（伪元素 opacity 交叉，保留抬升感） | 视觉取舍 | 不阻塞，但影响 2 个文件 |
| 9 | **A6 是否允许 Tailwind 档位写法**（`duration-200`）作为「引用 token 名」的等价物 | 纪律口径 | 阻塞 V5 的修法（**当前 6 处字面量都在用这个写法**） |

**无需裁决即可推进的部分**：P2–P7 全部只用既有 token（`--hover-duration` / `--page-duration` / `--entry-duration` / `--stagger-step`），
不动 `DESIGN.md`，可作为一个独立切片直接实施 —— **但仍需 captain 派单**（按 AGENTS.md §8，我只做分派给我的任务；
且 `pages/sea-page.tsx` 属 frontend-flow 正在编辑的范围）。

---

## 12. 证据附录（命令 + 原始输出，成对粘贴）

工作目录：`D:\Develop\projects\music`；`W=apps/web/src`。以下输出均为实际执行结果原文（仅去掉重复的空行）。

```
### E1 动效相关文件全集
$ grep -rl "transition\|animation\|enter-rise\|enter-fade\|stagger\|hover-lift\|shimmer\|ripple\|scale-\[" $W --include=*.tsx --include=*.css | sort
apps/web/src/design-system/__tests__/components.test.tsx
apps/web/src/design-system/button.tsx
apps/web/src/design-system/modal.tsx
apps/web/src/design-system/motion.css
apps/web/src/design-system/showcase/Showcase.tsx
apps/web/src/design-system/skeleton.tsx
apps/web/src/design-system/theme.css
apps/web/src/design-system/toast.tsx
apps/web/src/design-system/wave.tsx
apps/web/src/features/audio/accompaniment-player.tsx
apps/web/src/features/audio/mix-export-panel.tsx
apps/web/src/features/audio/recorder-panel.tsx
apps/web/src/features/audio/segment-player.test.tsx
apps/web/src/features/audio/segment-player.tsx
apps/web/src/features/bottle/my-bottles.tsx
apps/web/src/features/bottle/vote-controls.tsx
apps/web/src/pages/home-page.tsx
apps/web/src/pages/river-page.tsx
apps/web/src/pages/route-view.tsx
apps/web/src/pages/sea-page.tsx

### E2 禁止项: transition-all 命中数
$ grep -rn "transition-all" $W | wc -l
0
### E3 禁止项: 任意 duration 命中数
$ grep -rn "duration-\[" $W | wc -l
1
### E4 禁止项: 布局属性动画命中数
$ grep -rnE "(animate|transition)-(width|height|top|left|right|bottom|margin|padding)" $W | wc -l
0

### E5 motion.css 硬编码时长 / 全部 animation 声明
$ grep -n "1.4s\|2.4s\|animation:" $W/design-system/motion.css
61:    animation: ocean-rise var(--entry-duration) var(--entry-easing) both;
65:    animation: ocean-fade var(--page-duration) var(--entry-easing) both;
103:    animation: ocean-shimmer 1.4s linear infinite;
108:    animation: ocean-ripple 2.4s var(--entry-easing) infinite;
117:    animation: none !important;
124:    animation: none;
131:    animation: ocean-fade var(--reduced-duration) ease-out both;

### E6 prefers-reduced-motion 出现位置
$ grep -rn "prefers-reduced-motion" $W
apps/web/src/design-system/motion.css:5: * 纪律：只允许动画 transform 与 opacity；必须支持 prefers-reduced-motion。
apps/web/src/design-system/motion.css:113:@media (prefers-reduced-motion: reduce) {
apps/web/src/design-system/tokens.ts:138:  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
apps/web/src/design-system/__tests__/fonts-and-motion.test.ts:78:  it('提供 prefers-reduced-motion 降级块，并关闭动画与过渡', () => {
apps/web/src/design-system/__tests__/fonts-and-motion.test.ts:80:      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}\s*$/.exec(motionCss)?.[1] ??
apps/web/src/design-system/__tests__/fonts-and-motion.test.ts:82:    expect(block, 'missing prefers-reduced-motion block').not.toBe('');

### E7 BottomNav 反馈类 class 命中数（0 = 零反馈）
$ sed -n '/function BottomNav/,/^}/p' $W/design-system/nav.tsx | grep -cE "hover:|active:|transition|focus-visible"
0
### E8 nav.tsx 全部 hover/transition
$ grep -n "hover:\|transition-\|focus-visible" $W/design-system/nav.tsx
71:                  'focus-visible:ring-2 focus-visible:ring-peacock focus-visible:ring-offset-2 focus-visible:ring-offset-foam',
74:                    : 'text-slate-current font-normal hover:bg-wave-white/70',

### E9 route-view key-remount
$ grep -n "key={match.path}\|enter-fade" $W/pages/route-view.tsx
63:      <div key={match.path} className="enter-fade flex min-w-0 flex-col gap-6">

### E10 toast 生命周期代码命中数（0 = 无生命周期/无退场）
$ grep -c "setTimeout\|useEffect\|onDismiss\|onClose" $W/design-system/toast.tsx
0
### E11 modal 退场代码命中数（0 = 无退场分支）
$ grep -c "exiting\|closing\|onAnimationEnd\|transitionend\|setTimeout" $W/design-system/modal.tsx
0

### E12 duration-[ 命中位置（唯一命中是测试里的负向断言字符串）
$ grep -rn "duration-\[" $W
apps/web/src/features/audio/motion-usage.test.ts:29:  it('没有内联新的动效数值（禁止 duration-[…] / cubic-bezier / animate-[…] / 内联 transition）', () => {

### E13 wave.tsx / skeleton.tsx / showcase 动效
$ grep -n "animation\|transition\|animate\|enter-\|shimmer\|ripple\|scale" $W/design-system/wave.tsx $W/design-system/skeleton.tsx $W/design-system/showcase/Showcase.tsx
apps/web/src/design-system/wave.tsx:86:        'ripple-ring pointer-events-none absolute inset-0 rounded-full border border-lagoon/40',
apps/web/src/design-system/skeleton.tsx:11: * 骨架屏：**shimmer 动画，禁用 spinner**（DESIGN.md §Components）。
apps/web/src/design-system/skeleton.tsx:28:      <span data-testid="shimmer" className="skeleton-shimmer block h-full w-full" />
apps/web/src/design-system/showcase/Showcase.tsx:110:            note="主按钮 peacock / hover 8% darken + scale(1.03) / active -1px；加载态用 shimmer，禁用 spinner。"
apps/web/src/design-system/showcase/Showcase.tsx:177:            note="骨架屏 shimmer 与目标同尺寸；空态用中性色，不与错误态混淆。"
apps/web/src/design-system/showcase/Showcase.tsx:338:                    hover scale {motion.hoverScale} / {motion.hoverDuration}ms · 页面过渡{' '}
apps/web/src/design-system/showcase/Showcase.tsx:339:                    {motion.pageDuration}ms · 只动 {motion.animatedProperties.join(' + ')}

### E14 mix-export-panel 动效
$ grep -n "transition\|enter-\|animation\|animate" $W/features/audio/mix-export-panel.tsx
137:            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-base border-[1.5px] border-driftline px-6 text-[0.9375rem] font-semibold text-peacock transition-transform duration-200 ease-out hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-peacock focus-visible:ring-offset-2"

### E15 tokens.ts reduced-motion hook 上下文
$ sed -n '130,145p' $W/design-system/tokens.ts
/** 交错延迟计算：第 index 项（从 0 起）的动画延迟，单位 ms。 */
export function staggerDelay(index: number): number {
  return index * motion.stagger;
}

/** 用户是否要求减少动效；SSR / 无 matchMedia 时按「不减少」处理。 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

### E16 sea-page 分页追加 stagger 条件
$ grep -n "enter-rise\|stagger\|index < 4\|加载更多" $W/pages/sea-page.tsx
63:  // **真分页**：游标由服务端给，前端只做"追加"。「加载更多」只在
117:                className={index < 4 ? `enter-rise stagger-${String(index + 1)}` : undefined}
132:                加载更多作品

### E17 vote-controls 计数渲染
$ sed -n '118,133p' $W/features/bottle/vote-controls.tsx
        // 小尺寸：显式 px（不写 w-* / h-* 数字档，避免尺度耦合到 --spacing）
        className={cn(
          'h-[32px] min-h-[32px] gap-[6px] rounded-pill px-[12px] text-[0.8125rem]',
          'transition-transform duration-200 ease-out hover:scale-[1.03] active:translate-y-[-1px]',
          pressed ? 'border-peacock bg-info-tint text-peacock' : '',
        )}
        icon={<Icon name={icon} size={16} />}
        onClick={onClick}
      >
        <span className="whitespace-nowrap">{label}</span>
        <span className="whitespace-nowrap" style={{ fontFamily: 'var(--font-latin)' }}>
          {count}
        </span>
      </Button>
      {disabled && disabledReason !== undefined ? (
        // 禁用必须有**可见**的文字原因（DESIGN.md：禁用不能是唯一的不可用提示）

### E18 既有动效守卫测试（audio-engineer 写，头部注释原文）
$ cat -n apps/web/src/features/audio/motion-usage.test.ts   # 节选
     1	/**
     2	 * 动效使用的**可断言契约**（`motion-web` §8：动效必须可验证；"看着挺顺"不是证据）。
     4	 * ## 这一层能证明什么、不能证明什么（别自欺）
     6	 * - **能证明**（静态扫描源码，见 §8 表格的「属性」「时长/缓动」两行）：
     7	 *   ① 状态反馈只引用了设计系统的动效类（`enter-fade`），**没有内联新的时长/缓动数值**（§2 禁止内联新值）；
     8	 *   ② 没有用"改 `key` 逼动画重播"这种会造成子树重建的写法（§5 明令禁止）。
     9	 * - **不能证明**：屏幕上的流畅度/视觉表现 —— jsdom 没有布局与合成器（§8 明说"单元层无法证明渲染效果"）。
    10	 *   本文件的注释与 `docs/audio.md` §10.5 都如实标注了这一点；真机表现未验证。
    29	  it('没有内联新的动效数值（禁止 duration-[…] / cubic-bezier / animate-[…] / 内联 transition）', () => {
    44	  it('不得靠改 key 触发子树重建来"重播动画"（motion-web §5 明令禁止）', () => {

### E19 DESIGN.md 页面过渡/动效条款原文（行号）
$ grep -n "过渡\|涟漪\|480ms\|300ms\|交错\|100ms\|stiffness\|shimmer\|骨架" DESIGN.md
96:  entryDuration: 480ms
98:  listStagger: 100ms
101:  pageTransition: 300ms
142: ...涟漪 (ripples)、漂流瓶 (drift bottle)...（母题清单）
261:  - **收敛到 Figma 实际形态（2026-09-23 amend · B2）**：**Hero 主交互区为居中同心圆**（Figma `home-river` 骨架：240·180·130 涟漪 + 110 主按钮）；
283:- **Physics:** Spring — stiffness 120, damping 20. Confident, weighted transitions.
284:- **Entry animations:** Fade + translate-Y (16px → 0) over 480ms ease-out. Staggered cascades for lists: 100ms between items.
286:- **Page transitions:** Fade + slide (300ms).
306:- 深底区块不做自动明暗反转；离开区块回到 wave-white，过渡只允许 opacity。
329:- 漂流瓶母题用内联 SVG 表达（瓶身 + 瓶塞 + 涟漪），**不用圆角堆叠去"画"瓶子**。
356:| `skeleton` | tide-pool + lagoon 20% shimmer | — | 无 | 与目标组件同值 | 与目标组件同值 |
378:| loading | 保持当前底色 | 文字保留 + shimmer 条（禁 spinner） | 宽度不跳变（预留占位） | shimmer 1.4s |
383:- 过渡只允许 `transform` / `opacity`；颜色变化允许（不触发重排），但禁止动画 `width/height/top/left/margin`。
419:- **动效**：尊重 `prefers-reduced-motion: reduce` —— 关闭水波漂移、涟漪扩散与列表交错，入场动画降级为 150ms opacity 淡入；spring 120/20 在此模式下直接吸附终值。
421:- **语义结构**：一页一个 `<h1>`；时间轴用有序列表；接力状态用 `aria-live="polite"` 播报...；装饰性水波/涟漪 `aria-hidden="true"`。
449:- Do 涟漪（ripples）标记状态变化与落点

### E20 tabs 面板过渡（仅 hover 背景色，无 transition）
$ grep -n "transition\|enter-\|hover:\|role=\"tab\"" $W/design-system/tabs.tsx
61:              role="tab"
73:                  : 'border border-driftline bg-transparent text-peacock hover:bg-info-tint',

### E21 「加载更多」已有 loading 态（故不计入缺失）
$ sed -n '126,142p' $W/pages/sea-page.tsx
                variant="ghost"
                loading={sea.isFetchingNextPage}
                onClick={() => { void sea.fetchNextPage(); }}
              >
                加载更多作品
              </Button>
              <p className="text-[0.875rem] text-slate-current">
                已经看了 {list.length} 支，公海里还有更多。
              </p>
            </div>
          ) : (
            <p className="text-[0.875rem] text-slate-current">
              一共 {list.length} 支，这就是全部了。
            </p>
          )}

### E22 心情 chips 是「只作展示」（故不计入缺失）
$ grep -n "transition\|hover:\|mood\|chip\|aria-pressed" $W/pages/home-page.tsx | head -20
10: *   └── mood-filters 370×35 · gap 12 · padding 8/18   ← 5 个心情标签
90:            className="relative z-10 flex h-[88px] w-[88px] items-center justify-center rounded-full bg-peacock ring-2 ring-foam md:h-[110px] md:w-[110px] text-wave-white transition-transform duration-200 ease-out hover:scale-[1.03] hover:bg-peacock-deep focus-visible:ring-[3px] focus-visible:ring-sea-glass focus-visible:ring-offset-2 focus-visible:ring-offset-deep-current active:translate-y-[-1px]"
114:      {/* mood-filters：5 个标签；Demo 只作展示（不参与筛选） */}
115:      <section aria-labelledby="mood-heading" className="flex flex-col gap-[8px] md:gap-[12px]">
116:        <h2 id="mood-heading" className="sr-only">

### E23 ripple-ring 使用点
$ grep -rn "ripple-ring" $W
apps/web/src/design-system/motion.css:107:  .ripple-ring {
apps/web/src/design-system/wave.tsx:86:        'ripple-ring pointer-events-none absolute inset-0 rounded-full border border-lagoon/40',

### E24 wave.tsx:80-91（RippleRing 组件）
$ sed -n '70,110p' $W/design-system/wave.tsx   # 节选 80-91
/** 涟漪环：标记状态变化与落点；reduced-motion 下由 motion.css 关闭动画。 */
export function RippleRing({ className }: DecorProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'ripple-ring pointer-events-none absolute inset-0 rounded-full border border-lagoon/40',
        className,
      )}
    />
  );
}

### E25 tabs.tsx 结构 50-95（panel 硬替换）
$ sed -n '50,95p' $W/design-system/tabs.tsx
    <div className={cn('flex flex-col gap-4', className)}>
      <div role="tablist" className="flex flex-wrap gap-2">
        {items.map((item, index) => {
          const selected = item.key === active?.key;
          return (
            <button
              key={item.key}
              ref={(node) => { tabRefs.current[index] = node; }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.key}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(item.key)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                'min-h-11 rounded-pill px-4 text-[0.875rem] font-medium',
                'focus-visible:ring-2 focus-visible:ring-peacock focus-visible:ring-offset-2 focus-visible:ring-offset-wave-white',
                selected
                  ? 'bg-peacock text-wave-white'
                  : 'border border-driftline bg-transparent text-peacock hover:bg-info-tint',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={active === undefined ? undefined : `${baseId}-panel-${active.key}`}
        aria-labelledby={active === undefined ? undefined : `${baseId}-tab-${active.key}`}
        className="rounded-base border border-mist bg-wave-white p-4"
      >
        {active?.content ?? null}
      </div>
    </div>
  );
}

### E26 Tabs 使用点（3 个页面 + 1 处 showcase）
$ grep -rn "<Tabs\|<TabPanel\|TabList" $W --include=*.tsx | grep -v "__tests__"
apps/web/src/design-system/showcase/Showcase.tsx:227:                <Tabs
apps/web/src/pages/admin-page.tsx:56:      <Tabs
apps/web/src/pages/login-page.tsx:102:              <Tabs
apps/web/src/pages/sea-page.tsx:40:      <Tabs

### E27 BottomNav 全文（零反馈）
$ sed -n '/function BottomNav/,/^}/p' $W/design-system/nav.tsx
export function BottomNav({ items, current, className }: NavProps) {
  return (
    <nav
      aria-label="底部导航"
      className={cn(
        'fixed inset-x-0 bottom-0 z-sticky flex items-stretch justify-around border-t border-mist bg-foam',
        'pb-[env(safe-area-inset-bottom)] md:hidden',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.key === current;
        return (
          <a
            key={item.key}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-[0.75rem]',
              active ? 'font-medium text-peacock' : 'text-slate-current',
            )}
          >
            <Icon name={iconFor(item)} size={20} />
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

### E28 RippleRing 实际渲染点
$ grep -rn "RippleRing" $W --include=*.tsx
apps/web/src/design-system/showcase/Showcase.tsx:153:                    <RippleRing />
apps/web/src/pages/home-page.tsx:68:            只用 `RippleRing`（纯动画）时，涟漪会随动画淡出 —— 静止截图/静态环境下
apps/web/src/pages/home-page.tsx:84:          <RippleRing className="h-[180px] w-[180px] md:h-[240px] md:w-[240px]" />
apps/web/src/pages/river-page.tsx:69:            <RippleRing className="h-[140px] w-[140px] md:h-[240px] md:w-[240px]" />

### E29 hover-lift 使用点（仅 2 处）
$ grep -rn "hover-lift" $W --include=*.tsx
apps/web/src/features/bottle/my-bottles.tsx:83:    <li className="hover-lift flex flex-col gap-[6px] rounded-base border border-mist bg-foam px-4 py-[8px] shadow-card">
apps/web/src/pages/sea-page.tsx:156:    <Card className="hover-lift flex h-full flex-col gap-3">

### E30/E34 加载语义全站统一为骨架（无 spinner）
$ grep -rn "Skeleton\b" $W --include=*.tsx | grep -v "__tests__\|design-system/skeleton\|Showcase"
apps/web/src/features/bottle/badges-panel.tsx:46:          skeleton={<Skeleton height="3rem" width="100%" />}
apps/web/src/features/bottle/collections-panel.tsx:39:          skeleton={<Skeleton height="4rem" width="100%" />}
apps/web/src/features/bottle/collections-panel.tsx:78:        <Skeleton height="1.25rem" width="10rem" />
apps/web/src/pages/drift-log-page.tsx:21:        <Skeleton height="2.25rem" width="14rem" />
apps/web/src/pages/drift-log-page.tsx:22:        <Skeleton height="6rem" width="100%" />
apps/web/src/pages/sea-detail-page.tsx:47:        <Skeleton height="2.25rem" width="16rem" />
apps/web/src/pages/sea-detail-page.tsx:48:        <Skeleton height="8rem" width="100%" />
apps/web/src/pages/sea-page.tsx:79:          <Skeleton height="9rem" width="100%" />
apps/web/src/pages/sea-page.tsx:80:          <Skeleton height="9rem" width="100%" />
apps/web/src/pages/sea-page.tsx:81:          <Skeleton height="9rem" width="100%" />
apps/web/src/pages/shell/app-shell.tsx:120:        <Skeleton height="2.25rem" width="12rem" />
apps/web/src/pages/shell/app-shell.tsx:121:        <Skeleton height="8rem" width="100%" />
apps/web/src/pages/shell/async-boundary.tsx:36:      <Skeleton height="2.25rem" width="14rem" />
apps/web/src/pages/shell/async-boundary.tsx:37:      <Skeleton height="5rem" width="100%" />
apps/web/src/pages/shell/async-boundary.tsx:38:      <Skeleton height="5rem" width="100%" />
apps/web/src/pages/song-picker-page.tsx:51:            <Skeleton height="7rem" width="100%" />
apps/web/src/pages/song-picker-page.tsx:52:            <Skeleton height="7rem" width="100%" />

### E31 DESIGN.md 92-105 动效 token 清单原文（10 项，无 shimmer / 无 ripple / 无 exit）
$ sed -n '92,105p' DESIGN.md
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

### E32 my-bottles.tsx 78-95（li 本身不可点，可点的是行内 Link）
$ sed -n '78,95p' $W/features/bottle/my-bottles.tsx
      : `缺第 ${bottle.missingSegmentIndexes.join('、')} 段`;

  return (
    /* 两行结构（§46.3）：第一行"歌名 + 我的角色 + 出口"，第二行"进度 / 我唱的段 / 缺口"。
       原来全塞一行，窄一点就折成三行，4 条就把 /me 顶出 900。 */
    <li className="hover-lift flex flex-col gap-[6px] rounded-base border border-mist bg-foam px-4 py-[8px] shadow-card">
      <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[2px]">
        <Icon name="Music" size={18} />
        <span className="text-[1rem] font-semibold text-abyss">{bottle.songTitle}</span>
        ...
          <Link to={`/bottles/${bottle.id}`} className={TEXT_LINK}>
            <span className="whitespace-nowrap">去看这个瓶子</span>
          </Link>

### E33 sea-page 骨架（第 79-81 行）—— 加载语义一致，非缺失
$ grep -n "isPending\|isLoading\|骨架\|Skeleton\|加载中\|正在" $W/pages/sea-page.tsx
14:import { Button, Card, EmptyState, Icon, Skeleton, Tabs } from '../design-system';
71:        isPending: sea.isPending,
74:        data: sea.isPending ? undefined : items,
79:          <Skeleton height="9rem" width="100%" />
80:          <Skeleton height="9rem" width="100%" />
81:          <Skeleton height="9rem" width="100%" />

### E35 sea-page 36-70（Tabs 切换 zone，面板硬替换）
$ sed -n '36,70p' $W/pages/sea-page.tsx   # 节选
      <Tabs
        items={[
          { key: 'COMPLETED', label: '完整作品', content: <SeaZoneList zone="COMPLETED" /> },
          { key: 'INCOMPLETE', label: '等待接力', content: <SeaZoneList zone="INCOMPLETE" /> },
        ]}
        value={zone}
        onChange={(key) => { setZone(key === 'INCOMPLETE' ? 'INCOMPLETE' : 'COMPLETED'); }}
      />

### E36 motion.css 全文关键行（token 段 + hover-lift + shimmer + ripple + 降级）
$ cat -n $W/design-system/motion.css   # 节选
     7	:root {
     8	  --entry-shift: 16px;
     9	  --entry-duration: 480ms;
    10	  --entry-easing: ease-out;
    11	  --stagger-step: 100ms;
    12	  --hover-scale: 1.03;
    13	  --hover-duration: 200ms;
    14	  --page-duration: 300ms;
    15	  --reduced-duration: 150ms;
    16	}
    38	@keyframes ocean-shimmer {
    39	  from { background-position: -140% 0; }
    42	  to { background-position: 140% 0; }
    47	@keyframes ocean-ripple {
    48	  from { opacity: 0.55; transform: scale(0.92); }
    52	  to { opacity: 0; transform: scale(1.08); }
    83	  .hover-lift {
    84	    transition:
    85	      transform var(--hover-duration) var(--entry-easing),
    86	      box-shadow var(--hover-duration) var(--entry-easing);
    87	  }
    89	  .hover-lift:hover {
    90	    transform: scale(var(--hover-scale));
    91	    box-shadow: var(--shadow-lift);
    92	  }
   103	    animation: ocean-shimmer 1.4s linear infinite;
   108	    animation: ocean-ripple 2.4s var(--entry-easing) infinite;
   113	@media (prefers-reduced-motion: reduce) {
   117	    animation: none !important;
   118	    transition: none !important;
   129	  .motion-fade-in {
   131	    animation: ocean-fade var(--reduced-duration) ease-out both;

### E37 async-boundary.tsx 全文（骨架 → 内容：三条不同 return，无淡入）
$ cat -n $W/pages/shell/async-boundary.tsx   # 节选 43-67
    43	export function AsyncBoundary<T>({ query, skeleton, emptyWhen, empty, children }: AsyncBoundaryProps<T>) {
    50	  if (query.isPending) {
    51	    return <div aria-busy="true">{skeleton ?? <DefaultSkeleton />}</div>;
    52	  }
    53	  if (query.isError) {
    54	    return (
    55	      <ConflictNotice
    56	        error={query.error}
    57	        onRetry={() => { void query.refetch(); }}
    58	      />
    59	    );
    60	  }
    63	  const data = query.data;
    64	  if (data === undefined) return <DefaultSkeleton />;
    65	  if (emptyWhen !== undefined && emptyWhen(data)) return <>{empty}</>;
    66	  return <>{children(data)}</>;
    67	}

### E38 theme.css 阴影与 motion token（行号）
$ grep -n "focus-visible\|--motion-\|shadow" $W/design-system/theme.css | head -30
88:  --shadow-card: 0 2px 12px rgba(0, 0, 0, 0.06);
89:  --shadow-lift: 0 4px 14px rgba(11, 58, 74, 0.18);
90:  --shadow-floating: 0 8px 24px rgba(11, 58, 74, 0.12);
120:  --motion-spring-stiffness: 120;
121:  --motion-spring-damping: 20;
122:  --motion-entry-shift: 16px;
123:  --motion-entry-duration: 480ms;
124:  --motion-entry-easing: ease-out;
125:  --motion-stagger: 100ms;
126:  --motion-hover-scale: 1.03;
127:  --motion-hover-duration: 200ms;
128:  --motion-page-duration: 300ms;
129:  --motion-animated-properties: transform, opacity;
130:  --motion-reduced-duration: 150ms;
182:  :focus-visible {

### E39/E40 setInterval / will-change 全库（6 处全在音频域；will-change 0）
$ grep -rn "setInterval\|will-change" $W
apps/web/src/features/audio/listen-reporter.ts:149:  let timer: ReturnType<typeof setInterval> | null = null;
apps/web/src/features/audio/listen-reporter.ts:237:        timer = setInterval(tick, periodMs);
apps/web/src/features/audio/use-recorder.ts:205:  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
apps/web/src/features/audio/use-recorder.ts:206:  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
apps/web/src/features/audio/use-recorder.ts:390:      timerRef.current = setInterval(() => {
apps/web/src/features/audio/use-recorder.ts:400:        meterTimerRef.current = setInterval(() => {

### E41 fonts-and-motion.test.ts 动效段（用例名 vs 断言）
$ sed -n '62,90p' $W/design-system/__tests__/fonts-and-motion.test.ts
describe('动效物理参数与 reduced-motion 降级', () => {
  it('入场动画是 480ms ease-out + 16px 位移', () => {
    expect(motionCss).toMatch(/--entry-shift:\s*16px/);
    expect(motionCss).toMatch(/--entry-duration:\s*480ms/);
    expect(motionCss).toMatch(/--entry-easing:\s*ease-out/);
  });
  it('列表交错 100ms 作为可继承变量暴露', () => {
    expect(motionCss).toMatch(/--stagger-step:\s*100ms/);
  });
  it('hover 只做 scale(1.03) + 200ms，且不位移触发重排', () => {
    expect(motionCss).toMatch(/scale\(1\.03\)/);
    expect(motionCss).toMatch(/--hover-duration:\s*200ms/);
  });
  it('提供 prefers-reduced-motion 降级块，并关闭动画与过渡', () => {
    const block =
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}\s*$/.exec(motionCss)?.[1] ?? '';
    expect(block, 'missing prefers-reduced-motion block').not.toBe('');
    expect(block).toMatch(/animation-duration:\s*0\.01ms|animation:\s*none/);
    expect(block).toMatch(/transition-duration:\s*0\.01ms|transition:\s*none/);
    expect(block).toMatch(/opacity/);
  });
});

### E42 四个 skill 的动效条款所在行（原文见 §9 引用，可核对）
$ grep -n -i "transition\|animation\|duration\|easing\|micro-interaction\|cubic-bezier" .dsh/skills/afrexai-ui-design-system/SKILL.md | head -14
293:  hover: "transition shadow-sm → shadow-md on hover"
381:- **Animation**: fade + slight scale-up (200-300ms)
439:| Progress bar | Known duration | File upload, multi-step process |
449:### Micro-Interaction Patterns
452:animations:
457:  slow: "400-700ms"       # Page transition, complex animation
460:  ease_out: "cubic-bezier(0.16, 1, 0.3, 1)"     # Elements entering (most common)
461:  ease_in: "cubic-bezier(0.55, 0, 1, 0.45)"      # Elements leaving
462:  ease_in_out: "cubic-bezier(0.65, 0, 0.35, 1)"  # Elements moving
463:  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)"    # Bouncy/playful
482:- **Scroll-triggered animations**: fade-in on intersect, parallax for hero
490:  duration: "success: 3s, info: 5s, error: persistent until dismissed"
492:  animation: "slide-in from right, fade-out"

$ grep -n -i "motion\|animat\|transition" .dsh/skills/frontend-design/SKILL.md | head -10
17: ...the hero is the first thing viewers will see. Open with the most characteristic thing...
32: Use non-user-triggered motion sparingly and deliberately, only to draw attention. ...Motion that answers a person's action (opening, expanding, confirming) is welcome when it shows what changed.
59: Spend your boldness in one place. ... Build to a quality floor without announcing it: responsive down to mobile, visible keyboard focus, reduced motion respected, visually accessible, harmonious color palettes. ...

$ grep -n -i "transform.*opacity\|reduced-motion\|low-end\|layout thrash\|60fps" .dsh/skills/css-animation-creator/SKILL.md | head -10
29:5. Constrain animated properties to `transform` and `opacity` for GPU acceleration. Apply `references/performance.md`.
30:6. Honor reduced-motion preferences for every animation. Apply `references/accessibility.md`.
31:7. Verify on low-end devices and confirm no layout thrash before shipping.
42:- `references/accessibility.md` — `prefers-reduced-motion` CSS, Tailwind motion-safe/reduce, React hook.

$ grep -n "feedback 与 continuity 是默认该有的\|decoration 默认不做\|同一动作全程同名\|先补设计契约\|禁止内联新值\|进出必须配对\|超过约 600ms\|卸载动画\*\*需要显式延迟卸载\|避免 remount 抖动\|必须尊重\|动效不得是唯一反馈\|看着挺顺\|单元层\|只有真实浏览器" .dsh/skills/motion-web/SKILL.md
22:- **feedback 与 continuity 是默认该有的**；缺了它们，界面会"没有回应感"。
23:- **decoration 默认不做**。...
24:- **同一动作全程同名**：...
32:- 需要契约里没有的参数 ⇒ **先补设计契约**，再在组件里引用。
33:- 引用时**写 token 名**，不写它的当前数值（数值可调，语义稳定）。
45:- **进出必须配对**：...
48:- 序列化动效的总时长要控制：**超过约 600ms 的入场会让人觉得慢**；...
53:- **卸载动画**需要显式延迟卸载（先播退场，再移除节点），...
54:- **避免 remount 抖动**：进/退场不要靠改 `key` 造成整棵子树重建（会丢焦点、丢输入、丢滚动位置）。
67:- **必须尊重 `prefers-reduced-motion: reduce`**：覆盖**每一个**动画（全局兜底 + 逐项确认），...
68:- **动效不得是唯一反馈**：...
74:**"看着挺顺"不是证据。** ...
85:- **单元层**（jsdom）**无法**证明渲染效果（没有布局、没有合成器）...
87:- **只有真实浏览器**（含录屏或性能采样）能证明"屏幕上的表现"；
```

---

## 13. 一句话给下一位执行者

先做 §7.1 的 **P1–P7**（全部只用既有 token，不动 `DESIGN.md`），
其中 **P2（底部导航反馈）+ P8/P9（页面过渡 fade+slide 且不再 remount）** 是「不再呆」的最大两块；
`hover-lift` 要**收缩**（P1/P7）而不是扩张 —— 这是 `frontend-design` L32 明确警告的方向。
每条动效改完必须给 **§10.1 的 L2 断言**（真实 Chromium 里读 `getAnimations()`），
**不接受**「看着挺顺」或一张静帧截图作为证据（`motion-web` §8 L74）。


