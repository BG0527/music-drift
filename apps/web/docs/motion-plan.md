# 全站前端动效方案（motion-plan）

> 方法论依据：`motion-web` skill（已装载，逐条对应见 §4）。
> 现状审计依据：`grep apps/web/src`（transition/animate/enter-rise/stagger/keyframes/prefers-reduced-motion）、
> `src/design-system/motion.css`、`src/pages/river-motion.css`、`src/design-system/theme.css` 的 `--motion-*` 契约块、
> `src/pages/route-view.tsx`（页面切换装配）。
> **元素定位约定**：页面正被并行动效无关的逐块返工，本文一律用「块语义名」（如"捞取主按钮"），不写具体 class 选择器与行号。
> **token 约定**：参数列只写契约 token 名（`--motion-*` / `--motif-*`），不写数值；缺的 token 只进 §3 登记，不发明值。

---

## 0. 审计结论（现状）

**契约 token 全集**（`theme.css`，`tokens.ts` 同值，drift guard 守护）：

| token | 用途 |
| --- | --- |
| `--motion-entry-duration` / `--motion-entry-easing` / `--motion-entry-shift` | 入场时长 / 缓动 / 位移 |
| `--motion-exit-duration` | 退场时长（退场 < 入场） |
| `--motion-stagger` | 列表交错步长 |
| `--motion-hover-duration` / `--motion-hover-scale` | hover 反馈时长 / 缩放 |
| `--motion-page-duration` | 页面级淡入 |
| `--motion-shimmer-duration` / `--motion-ripple-duration` | 骨架掠光 / 涟漪周期 |
| `--motion-drift-duration` / `--motion-drift-shift` | 水流漂移（母题） |
| `--motion-passage-duration` / `--motion-passage-shift` | 河流穿行（母题 + f0 位移基准） |
| `--motion-reduced-duration` | reduced-motion 下仅存的淡入 |
| `--motion-spring-stiffness` / `--motion-spring-damping` | 链路 spring（预留） |
| `--motion-animated-properties` | `transform, opacity` 白名单 |
| `--motif-ripple-ring-alpha` 等 `--motif-*` | 装饰强度（涟漪等引用它） |

**现有动效资产**：
- `motion.css`：`enter-rise`（ocean-rise 入场）、`enter-fade`（ocean-fade）、`stagger-1..4`、`hover-lift`（transform + ::after 阴影 opacity 交叉）、`skeleton-shimmer`、`ripple-ring`；reduced-motion 全局兜底（`animation/transition: none !important`）+ `motion-fade-in` 保留 150ms 淡入。
- `river-motion.css`：f0 三段分镜（捞 `river-arrive→river-gather→river-lift`、投 `river-drop→river-gather→river-float`）、虚线漂移 `river-flowline`、涟漪错拍；**本方案不改动、不破坏其语义**，仅作为「进出配对」的全站范式引用。
- 页面级：`route-view` 换路由时容器 `enter-fade` + `key` 重触发（进场有、退场无）。
- 组件级：modal（`enter-fade` 遮罩 + `enter-rise` 面板）、toast（`enter-rise`）、大量 `transition-colors duration-200`（颜色过渡，非本方案白名单管辖但已有测试守护）、进度条 `transition-transform origin-left`、`vote-controls` 用 `element.animate` 做一次性 opacity 确认。
- 已有验证：`motion-contract.test.tsx`（无 transition-all / 无布局属性动画 / 无时间字面量 / key-remount 违规扫描）、`river-page.test.tsx`（keyframes 属性白名单 + token 引用 + reduced 块）、`motion-usage.test.ts`（禁内联数值）、`fonts-and-motion.test.ts`。

**缺口**：① 页面切换只有进场没有退场；② 10 个页面里 6 个（登录/选歌/日志/我的/设置/404）块级入场与列表 stagger 为零；③ 按下（active）反馈与错误指引动效无 token；④ 退场 stagger 档位无契约来源（见 §3）。

---

## 1. 每页动效清单

> 「目的」取值：feedback / guidance / continuity / decoration（skill §1）。
> 「现有/新增」标注该条是已实现还是本方案登记的新增项。

### 1.1 河道页（river-page，含 f0 分镜，6 条）

| # | 块语义名 | 目的 | 技法 | 参数 token | 时长/编排 | reduced-motion 降级 | 可验证断言 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 河面漂移虚线（常驻母题） | decoration（产品理由：漂流/海洋主题的水流母题，已登记 motion.css/river-motion.css） | `ocean-passage` 关键帧，只动 `transform` 平移 | `--motion-passage-duration` `--motion-passage-shift` | 常驻低速往返；两端出血防缺口 | 全局兜底 `animation:none` + river-motion.css 逐项 `animation:none` | 静态扫描：keyframes 属性 ⊆ {transform, opacity}；reduce 下 `animation:none` |
| 2 | 场景涟漪（双圈错拍） | decoration（同上，低幅度可忽略） | `ripple-ring` + 第二圈 `animation-delay` 错拍 | `--motif-ripple-ring-alpha` `--motion-ripple-duration` | 两圈相差一个涟漪周期 | 同上双保险静止 | 断言 delay 引用 token 而非字面量；reduce 下无常驻动画 |
| 3 | 捞取分镜（漂进→收拢→捞起） | continuity + guidance（f0：动作播完再跳转） | `river-arrive`（进）→ `river-gather`（feedback，播 1 次）→ `river-lift`（退） | 进 `--motion-entry-duration`；退 `--motion-exit-duration`；位移 `--motion-passage-shift`；缓动 `--motion-entry-easing` | 进 480 档 / 退 240 档（退 < 进）；总长超 600ms 前跳转由状态机保证 | reduce：不起动画、**立即跳转**（§103.3），`aria-live` 文字状态全程可读 | river-page.test.tsx 已有：keyframes 白名单、token 引用、reduce 块；补断言：reduce 下 `navigate` 不等动画结束 |
| 4 | 投放分镜（落下→收拢→顺流离开） | continuity + guidance | `river-drop`（进）→ `river-gather` → `river-float`（退，向左=河向） | 同 #3 | 同 #3 | 同 #3 | 同 #3；补断言：退场方向与河向一致（关键帧位移符号） |
| 5 | 卡带盘面 hover（拾起感） | feedback | `transition-transform` + `scale` | `--motion-hover-duration` `--motion-entry-easing`（现用）；缩放幅度用 `--motion-hover-scale` | 单次 hover，无编排 | reduce：全局 `transition:none`，hover 无位移 | 静态扫描：transition 属性 ⊆ {transform, opacity, color}；duration 引用 `var(--motion-*)` |
| 6 | 河道状态播报文字（aria-live 区） | guidance | `enter-fade`（仅 opacity） | `--motion-page-duration` `--motion-entry-easing` | 状态变化即淡入一次 | reduce：走 `motion-fade-in` 的 `--motion-reduced-duration` 淡入（内容不藏） | 断言：文字始终存在（动效非唯一反馈）；class 为 DS 动效类而非内联数值 |

### 1.2 海面页（sea-page，4 条）

| # | 块语义名 | 目的 | 技法 | 参数 token | 时长/编排 | reduced-motion 降级 | 可验证断言 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 漂流瓶卡列表入场（现有：`enter-rise stagger-{(index%4)+1}`） | guidance | `ocean-rise` + `stagger-N` 延迟 | `--motion-entry-duration` `--motion-entry-easing` `--motion-entry-shift` `--motion-stagger` | 每项 +1 个 stagger 步；取模封顶防长尾（>4 项不继续拉长） | reduce：全局兜底 + `.enter-rise` 重置为可见态（不藏内容） | motion-contract.test 已断言取模写法；补断言：stagger 延迟单调递增且 ≤ 4×`--motion-stagger` |
| 2 | 瓶卡 hover 抬升 | feedback | `hover-lift`（transform + ::after 阴影 opacity 交叉） | `--motion-hover-scale` `--motion-hover-duration` `--shadow-lift` | 单次 hover | reduce：`transition:none` | 静态扫描：阴影不直接过渡（走 ::after opacity），无 `transition-shadow` |
| 3 | 分区标题/筛选条（含 INCOMPLETE 等待态）状态切换 | 状态→feedback | 颜色/透明度过渡 + 状态文字 `enter-fade` | `--motion-hover-duration`（颜色过渡档）`--motion-page-duration`（状态文字） | 状态切换即触发，单主角 | reduce：瞬时切换，等待态文字仍可读 | 断言：等待态有文字标识（非纯动效）；transition 不含布局属性 |
| 4 | 空态/加载骨架 | guidance（"正在发生什么"） | `skeleton-shimmer`（禁 spinner，已有基线） | `--shimmer-duration` / 契约 `--motion-shimmer-duration` | 常驻循环直到数据到达 | reduce：全局 `animation:none` → 静态骨架底色，不闪 | 断言：无 `animate-spin`（已有 async-boundary 测试）；时长引用 token |

### 1.3 瓶详情页（bottle-page，7 条）

| # | 块语义名 | 目的 | 技法 | 参数 token | 时长/编排 | reduced-motion 降级 | 可验证断言 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 主 CTA（拾取入口） | feedback | `transition-colors` + 按下态（新增，见 §3 press token） | `--motion-hover-duration`（现有颜色过渡档）；按下缩放待 §3 | 单次点击，按下即响应 | reduce：瞬时变色，按压仍即时 | 静态扫描无内联 ms；按下反馈另有文字/aria 状态 |
| 2 | 次级按钮组（转发/返回等） | feedback | `transition-colors`，同语义同表现 | `--motion-hover-duration` | 同 #1 | 同 #1 | 同语义一致性断言：全站次级按钮 transition 类名一致 |
| 3 | 漂流时间轴节点 hover（features/bottle relay-timeline） | feedback | `transition-transform` + `scale(var(--motion-hover-scale))` | `--motion-hover-duration` `--motion-hover-scale` `--motion-entry-easing` | 单次 hover | reduce：无缩放 | 现有写法即 token 引用，静态扫描可证 |
| 4 | 心情标签选中（mood chips） | feedback | `transition-transform`（选中位移/缩放） | `--motion-hover-duration` `--motion-hover-scale` | 点击即反馈 | reduce：瞬时选中，选中态有文字/边框双通道 | mood-chips.test 已断言不 `transition-all/colors/width…`；补断言选中态含非动效标识 |
| 5 | 投票确认（vote-controls `element.animate` opacity 闪现） | feedback（一次性确认） | `element.animate` WAAPI，只动 opacity，播 1 次 | `--motion-hover-duration` 档（时长引用契约值） | 单次播放，与 `aria-live` 播报同步 | `prefersReducedMotion()` 时跳过播放（tokens.ts 已有 helper） | 断言：reduce 下不调用 `.animate`；动画 options 只含 opacity |
| 6 | 瓶内内容分块入场（文本/音频/投票区） | continuity | `enter-rise` 分块；多项时 `stagger-N` | `--motion-entry-duration` `--motion-stagger` `--motion-entry-easing` | 首屏一次，块间一个 stagger 步 | reduce：直接可见态 | 静态扫描 class 存在；无内联延迟数值 |
| 7 | 结果/裁定弹窗（resolution modal） | continuity | 遮罩 `enter-fade` + 面板 `enter-rise`（与 DS modal 同款，进出场配对见 §2） | `--motion-page-duration` `--motion-entry-duration` `--motion-exit-duration` | 进：遮罩先、面板后（同帧起也可）；出：见 §2 模态规则 | reduce：瞬时出现/消失 | 断言：关闭路径有退场（延迟卸载），非直接 unmount |

### 1.4 选歌页（song-picker-page，4 条）

| # | 块语义名 | 目的 | 技法 | 参数 token | 时长/编排 | reduced-motion 降级 | 可验证断言 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 歌曲列表入场 | guidance | `enter-rise` + `stagger-N`（取模封顶） | `--motion-entry-duration` `--motion-stagger` | 每项一个步长 | reduce：直接可见 | stagger 单调且封顶的静态断言 |
| 2 | 歌曲行 hover / 选中 | feedback | `transition-transform`（选中）+ `transition-colors`（hover） | `--motion-hover-duration` `--motion-hover-scale` | 单次 | 瞬时 | 无内联数值；选中态有文字/图标通道 |
| 3 | 选中确认（加入漂流） | feedback | 一次性 opacity/位移确认（同瓶详情投票范式） | `--motion-hover-duration` 档 + `--motion-exit-duration`（移出已选项时） | 单次播放 | reduce 跳过播放 | 与投票确认同范式：全站"确认"动效同名同表现 |
| 4 | 上传/解析状态文字 | guidance | `enter-fade` 状态文字（现有音频 features 同款） | `--motion-page-duration` `--motion-entry-easing` | 状态变化即淡入 | `--motion-reduced-duration` 淡入 | motion-usage.test 同款断言：只用 DS 类、无内联 |

### 1.5 漂流日志页（drift-log-page，3 条）

| # | 块语义名 | 目的 | 技法 | 参数 token | 时长/编排 | reduced-motion 降级 | 可验证断言 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 日志条目入场（时间轴） | guidance | `enter-rise` + `stagger-N` | `--motion-entry-duration` `--motion-stagger` | 逐条一个步长 | 直接可见 | stagger 单调断言 |
| 2 | 条目 hover 抬升 | feedback | `hover-lift` | `--motion-hover-scale` `--motion-hover-duration` | 单次 | 无位移 | 阴影走 ::after opacity，非直接过渡 |
| 3 | 空态/加载 | guidance | `skeleton-shimmer` / `enter-fade` 空态文字 | `--motion-shimmer-duration` / `--motion-page-duration` | 骨架循环至数据到达 | 静态骨架 | 无 spinner 断言 |

### 1.6 我的页（profile-page，3 条）

| # | 块语义名 | 目的 | 技法 | 参数 token | 时长/编排 | reduced-motion 降级 | 可验证断言 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 档案头（头像/统计）入场 | continuity | `enter-rise` | `--motion-entry-duration` `--motion-entry-easing` `--motion-entry-shift` | 页面入场一次 | 直接可见 | class 静态断言 |
| 2 | 统计卡/瓶列表 stagger | guidance | `stagger-N` | `--motion-stagger` | 每项一个步长 | 直接可见 | 单调且封顶 |
| 3 | 操作按钮 hover/按下 | feedback | `transition-colors` + press（§3 待 token） | `--motion-hover-duration` | 单次 | 瞬时 | 无内联数值 |

### 1.7 设置页（settings-page，3 条）

| # | 块语义名 | 目的 | 技法 | 参数 token | 时长/编排 | reduced-motion 降级 | 可验证断言 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 设置分组入场 | continuity | `enter-fade`（仅 opacity，表单页不做位移以免与焦点管理打架） | `--motion-page-duration` `--motion-entry-easing` | 页面入场一次 | `--motion-reduced-duration` 淡入 | class 静态断言 |
| 2 | 设置项分段切换（tabs） | feedback | `transition-colors`（DS tabs 现有） | `--motion-hover-duration` 档 | 单次 | 瞬时；选中态有文字/下划线结构通道 | tabs 断言已有（motion-contract：底栏/tab 必须有 transition-colors） |
| 3 | 保存/退出状态文字 | feedback | `enter-fade` + `aria-live` | `--motion-page-duration` | 状态变化即触发 | 淡入保留 | 断言：动效非唯一反馈（有文字 + aria-live） |

### 1.8 管理页（admin-page，3 条）

| # | 块语义名 | 目的 | 技法 | 参数 token | 时长/编排 | reduced-motion 降级 | 可验证断言 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 管理分区 tab（现有 `transition-colors`） | feedback | `transition-colors` | `--motion-hover-duration` 档 | 单次 | 瞬时 | 现有 admin 断言 |
| 2 | 数据表行入场 | guidance | `enter-rise` + `stagger-N`（**仅首屏可见行**，长列表控制同帧动画量，skill §6） | `--motion-entry-duration` `--motion-stagger` | 逐行一个步长，封顶 | 直接可见 | stagger 断言 + 同帧行数上限（编排规则见 §2） |
| 3 | 危险操作确认弹窗 | continuity | modal 进出配对（遮罩 `enter-fade` / 面板 `enter-rise` / 退场 `--motion-exit-duration`） | `--motion-page-duration` `--motion-entry-duration` `--motion-exit-duration` | 见 §2 模态规则 | 瞬时进出 | 关闭走延迟卸载断言 |

### 1.9 登录页（login-page，3 条）

| # | 块语义名 | 目的 | 技法 | 参数 token | 时长/编排 | reduced-motion 降级 | 可验证断言 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 登录卡入场（全屏入口） | continuity | `enter-rise` | `--motion-entry-duration` `--motion-entry-easing` | 页面入场一次，主角唯一 | 直接可见 | class 静态断言 |
| 2 | 提交按钮进行态 | feedback | 按钮态变化 + 状态文字 `enter-fade`（**禁 spinner**，沿用骨架基线） | `--motion-hover-duration` `--motion-page-duration` | 提交即反馈 | 瞬时 | 无 `animate-spin` 断言（已有） |
| 3 | 表单错误提示 | guidance（指向哪里错了） | 文字 + 边框态；若加"抖动指向"需 §3 新 token，**未补契约前只做文字/边框** | 现阶段不引用动效 token（无位移） | — | — | 断言：错误有 `aria-live` 文字通道 |

### 1.10 404 页（not-found-page，1 条）

| # | 块语义名 | 目的 | 技法 | 参数 token | 时长/编排 | reduced-motion 降级 | 可验证断言 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 页面内容入场 | continuity | `enter-fade` | `--motion-page-duration` `--motion-entry-easing` | 单次 | `--motion-reduced-duration` 淡入 | class 静态断言 |

**每页动效条数**：河道 6 · 海面 4 · 瓶详情 7 · 选歌 4 · 日志 3 · 我的 3 · 设置 3 · 管理 3 · 登录 3 · 404 1（合计 37）；另有全局/外壳 5 条见 §2.4。

---

## 2. 跨页编排

### 2.1 页面切换进出配对（现状：只进不出）

- **进（现有）**：`route-view` 路由容器 `enter-fade`，参数 `--motion-page-duration` + `--motion-entry-easing`；`key` 保证每次换页重触发（注：这是**路由级 remount**，是页面切换的预期语义，不违反"不要靠改 key 触发进退场"——那条针对的是同一交互内的元素进出）。
- **出（新增原则）**：路由切换的退场**不做**页面级淡出。理由：delayed unmount 会阻塞导航（skill §9 禁止为动效增加等待）；下页的进场即是连续性，404/错误回退场景以进出场配对替代。**例外**：模态与 toast 必须配对（见 §2.3），因为它们不导航。
- **参数**：进 `--motion-page-duration`；如实现退场（模态/浮层）用 `--motion-exit-duration`（更短——人已经知道结果了）。

### 2.2 列表 stagger 规则（全站统一）

1. 触发：列表**首次进入视口/首次挂载**时播一次，不在每次数据 diff 后重播。
2. 步长：`--motion-stagger`（唯一步长，禁止自定义 per-item 毫秒）。
3. 档位：`stagger-1..4`，下标**取模封顶**（`index % 4`）——超过 4 项不继续拉长尾部，保证总入场时长 ≤ `--motion-entry-duration` + 4×`--motion-stagger` < 600ms 感知阈值。
4. 延迟必须单调（第 i 项 ≥ 第 i-1 项），由 class 名机械生成，不手写。
5. 退场 stagger：列表项移除时若要逐项退场，复用 `--motion-stagger` 做延迟 + `--motion-exit-duration` 做时长（该组合需契约确认，见 §3-③）。
6. 长列表（管理表格）只对**首屏可见行**编排，同帧动画元素数量克制（skill §6）。

### 2.3 浮层进出配对（模态 / toast）

| 浮层 | 进 | 出 | 退场机制 |
| --- | --- | --- | --- |
| 模态 | 遮罩 `enter-fade`（`--motion-page-duration`）+ 面板 `enter-rise`（`--motion-entry-duration`） | 面板退场 `--motion-exit-duration` + 遮罩同长淡出 | 关闭时**延迟卸载**（先播退场再移除节点）；reduce 下立即卸载 |
| toast | `enter-rise`（现有） | `--motion-exit-duration` 淡出（新增，禁止播完直接消失） | dismiss 计时器与退场动画解耦：先触发退场、`animationend` 后卸载；reduce 下立即卸载 |

### 2.4 全局/外壳条目（5 条）

| # | 块语义名 | 目的 | 技法 | 参数 token | reduced-motion | 断言 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 路由容器入场 | continuity | `enter-fade`（现有） | `--motion-page-duration` | `--motion-reduced-duration` 淡入 | 换页 class 重触发断言 |
| 2 | 导航/底栏项 hover 与激活 | feedback | `transition-colors`（现有 nav） | `--motion-hover-duration` 档 | 瞬时；激活态有结构标识 | motion-contract 已断言底栏/tab 有 transition-colors |
| 3 | 主按钮 hover/按下 | feedback | `transition-[transform,background-color]`（现有）+ press（§3-①） | `--motion-hover-duration` `--motion-hover-scale` | 瞬时 | 无内联数值断言 |
| 4 | toast 进出 | continuity | 见 §2.3 | `--motion-entry-duration` `--motion-exit-duration` | 立即卸载 | 退场先于卸载断言 |
| 5 | 骨架 shimmer（全站加载语义） | guidance | `skeleton-shimmer`（现有；**全站同一表现**：加载=shimmer，禁某页改 spinner） | `--motion-shimmer-duration` | 静态骨架 | 无 animate-spin（已有） |

### 2.5 同语义同表现清单（skill §1 一致性）

- 「加载中」= `skeleton-shimmer`（唯一表现）。
- 「进入列表/区块」= `enter-rise` + 封顶 stagger（唯一表现）。
- 「状态文字变化」= `enter-fade`（唯一表现）。
- 「确认成功」= 一次性 opacity 确认（vote-controls 范式，唯一表现）。
- 「hover 抬起」= `hover-lift` / `scale(--motion-hover-scale)`（唯一表现）。

---

## 3. 缺 token 清单（只登记，不发明值）

| # | 缺的 token | 需求来源 | 现状绕行 | 处置 |
| --- | --- | --- | --- | --- |
| ① | 按下（press/active）缩放档，如 `--motion-press-scale` | 按钮/卡片按下反馈（§1.3-1、§1.6-3、§2.4-3）；skill §1 feedback 优先级最高 | 部分组件用 `active:translate-y-[-1px]` 内联位移（vote-controls），属灰色内联值 | 登记给 `frontend-ds` 补契约（DESIGN.md 动效段），**禁止组件先写数值**；补 token 前按钮按下只做颜色过渡 |
| ② | 错误指引抖动（如 `--motion-shake-duration` + `--motion-shake-shift`） | 登录/表单错误的 guidance 动效（§1.9-3） | 无（当前错误只做文字/边框，合规但缺指向性） | 登记待补；**未补前不得做抖动**（skill §2 禁止内联新位移） |
| ③ | 退场 stagger 的契约确认（退出场复用 `--motion-exit-duration` + `--motion-stagger` 是否即为契约意图；以及退场位移是否独立成 `--motion-exit-shift` 还是复用 `--motion-entry-shift` 反向） | 列表项退场编排（§2.2-5）、toast/模态退场位移 | f0 分镜里退场位移复用 `--motion-passage-shift`（页面特定）；全局退场位移无出处 | 登记为**待契约确认项**，交 `frontend-ds` 裁决；裁决前退场只做 opacity 淡出（已有 `--motion-exit-duration` 可用） |

**缺 token 数：3**（①②为缺失，③为待确认）。

---

## 4. 与 motion-web skill 条款逐条对应

| skill 条款 | 本方案对应 |
| --- | --- |
| §1 先定目的再选技法；feedback/continuity 默认该有，decoration 需产品理由 | §1 每条都标了「目的」；decoration 仅 2 条（漂移虚线、场景涟漪），均援引既有产品理由（海洋/漂流母题）且低幅度、可静止；§2.5 同语义同表现清单 |
| §2 参数只能来自设计契约，引用写 token 名 | 全文参数列只写 `--motion-*` / `--motif-*` token 名，无数值；缺的进 §3 登记不发明；现状审计确认已有 drift guard / motion-usage 测试防内联 |
| §3 只动 transform/opacity | 技法列全部为 transform/opacity（颜色过渡为既有合规项，由 motion-contract 测试守护）；§1.7-1 表单页刻意只用 opacity；will-change 无新增计划 |
| §4 进出配对、节奏成组、单主角、~600ms | f0 分镜作范式（进 480/退 240）；§2.1 页面切换"进不出"的理由化豁免；§2.2 stagger 封顶保证 <600ms；每页入场只编排一次 |
| §5 React 落地：状态机、延迟卸载、避免 remount 抖动 | §2.3 模态/toast 延迟卸载（`animationend` 后移除）；§2.1 说明路由 key remount 的语义边界；f0 状态机（reduce 立即跳转）不改 |
| §6 性能 60fps、克制同帧动画 | §2.2-6 管理表格只动首屏可见行；列表动画仅入场一次；不读布局驱动动画 |
| §7 reduced-motion 必须逐项确认、动效非唯一反馈 | 每页清单都有「reduced-motion 降级」列；双保险（全局兜底 + 页面逐项块）保持；§1.9-3、§1.7-3 显式要求 aria-live/文字通道 |
| §8 可验证性（核心纪律） | 每页清单都有「可验证断言」列，并标注验证层：静态扫描（属性白名单/token 引用/内联数值）由既有测试扩展；状态机行为（reduce 立即跳、退场先于卸载）需 jsdom 事件断言；流畅度/60fps 标注**需真机录屏**，本文不冒充已验证 |
| §9 禁止清单 | 逐条规避：无内联数值（§3 挡住 press/shake）、无布局属性动画、无 reduce 忽略、无纯动效反馈、装饰仅 2 条有理由、同语义同表现（§2.5）、无 setInterval、不拿"看着顺"当结论、页面切换不加导航等待（§2.1） |
| §10 落地前自检 7 问 | §1 清单每行即 7 问的答案：目的✓ / token✓ / 属性✓ / 退场（§2.3 + §1.3-7）✓ / reduce✓ / 反馈通道✓ / 断言与验证层✓ |

---

*本方案为登记性文档：不改任何现有代码；f0 分镜语义（river-motion.css）原样保留；§3 未裁决前相关动效不进入实现。*
