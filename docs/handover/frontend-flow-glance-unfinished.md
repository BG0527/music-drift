# t41 交接（frontend-flow）— 河道页合并 / 公海页码分页 / 漂流日志精简

> **为什么先写这个文件**：本会话我已经**四次**在"报告发出之前"掉线（工作落盘了、回执没发）。
> 所以按 captain 的指令：**每完成一项就回写本文件**，不留到最后。
> 任务：t41（attempt 2 / attempt_id `5e8f2e59-7102-4371-863a-4550bd4d4853`）
> 用户原话（第十三轮）：
> ① 两个河道页合并，主体用 `/river` 的样式 + 首页的心情标签（带动画、无实质功能）；
> ② 公海作品要 1/2/3 页码式分页；③ 漂流日志太冗余，只留核心操作、不要赞踩记录。

---

## 0. 状态总览（每完成一项就更新这里）

| 项 | 状态 | 证据 |
| --- | --- | --- |
| ① 河道页合并 + 心情标签（带动画） | **已完成** | §1.1 |
| ② 公海页码式分页 | **已完成** | §2.1 |
| ③ 漂流日志精简 | **已完成** | §3.1 |
| 三条门 + 两次守卫 | **全绿** | §5 |

---

## 1. ① 河道页合并（设计决策先落盘，再动手）

**重定向方向：`/` → `/river`（canonical 是 `/river`）**，实现为 `history.replaceState`（**replace 不加历史条目**，所以从登录页进来按「返回」不会在两页之间弹）。
理由：
1. **URL 语义**：这一页就叫「河道」，`/river` 说得清；`/` 是从前的落地页残留，语义为空。
2. **零链接改动**：侧栏 `NAV_ITEMS` 的「河道」本来就指 `/river`（`shell/routes.ts:107`），
   漂流瓶页的「回河道」、各空态的出口也全是 `/river` ⇒ 选 `/river` 为 canonical 不会留下任何过期链接。
3. **登录后落地仍成立**：`next=/` 会立刻被换成 `/river`，用户看到的是同一个页面。
4. 侧栏「河道」入口**保持指向 `/river`**（不变），`activeNavKey('home' | 'river')` 仍都归属「河道」高亮。

**改动清单（计划）**
- `shell/routes.ts`：保留 `home` 匹配（否则 `/` 会掉进 404）但标注「仅用于重定向」；`buildPath('home')` 不动。
- `shell/router.tsx`：在历史变化后，若 `matchRoute` 得到 `home` ⇒ `replaceState('/river')`。
- `route-view.tsx`：不再渲染 `HomePage`（改渲染 `RiverPage`）——两路同一页。
- **删除** `pages/home-page.tsx` 与 `pages/home-page.test.tsx`（被取代的机制要删，不留在库里当第二份真相）。
- **新增** `features/bottle/mood-chips.tsx`（把首页那 5 个心情标签搬过来，独立可测）。

### 1.1 ① 的落地结果（已完成，证据）
- **canonical = `/river`**，`/` ⇒ `replaceState('/river')`（`shell/router.tsx`）；`route-view.tsx` 里 `home` 也渲染 `RiverPage`；
  `shell/routes.ts` 保留 `home` 匹配只为不让 `/` 掉 404（已加注释说明它是旧入口）。
- **侧栏「河道」入口不变**（`NAV_ITEMS` 本就指 `/river`）；`activeNavKey` 仍把 `home`/`river` 都归「河道」高亮。
- **删除** `pages/home-page.tsx` + `pages/__tests__/home-page.test.tsx`（被取代的机制不留第二份）；
  `pages/__tests__/deep-surface-cta.test.ts` 摘掉 home 用例（该 CTA 的等价断言在 river 两个面板上仍在）。
- **新增** `features/bottle/mood-chips.tsx`（5 个标签、点击切换、`aria-pressed`、token 化过渡、如实文案）+
  `mood-chips.test.tsx`（**5 passed**）。
- **新增** `pages/__tests__/river-merge.test.tsx`（**4 passed**：`/river` 两面板+标签；`/` 同页且无「今日海面」；
  `/` 被规范化成 `/river`；侧栏指 `/river`）。**先红后绿**：改前 3 例红
  （`Unable to find role="link" and name "捞一个漂流瓶"` / `expected '/' to be '/river'`）。
- **守卫**：1440 `9-t41-desktop-1440.txt` **exit 0（12/12）**、375 `10-t41-mobile-375.txt` **exit 0（12/12）**；
  守卫里 `/` 的锚点从 `home-pick` 改成河道的 `river-draw`/`river-drop`（锚点随页面一起搬，不留悬空锚点）。
- **测试**：`vitest run src/features/bottle src/pages` 全绿；全仓唯一红在 `features/audio/recorder-panel.test.tsx`
  （audio-engineer 的 t40「静音检测」在途，**不在我的域**）。

**心情标签的动效（motion-web §1 feedback / §2 token / §3 只动 transform·opacity）**
- 目的 = **feedback**（点一下要有回应），**不是筛选**；
- 只动 `transform`/`opacity`；时长/缓动**引用契约 token**（`var(--motion-hover-duration)` 200ms / `var(--motion-entry-easing)` ease-out / 选中放大 `var(--motion-hover-scale)` 1.03），**不写内联数值**；
- 文案必须**如实说明只作展示**（不能暗示真的在筛选）：`心情标签这一版只作展示，不参与筛选`；
- reduced-motion 由 `design-system/motion.css` 的 `@media (prefers-reduced-motion: reduce)` 全局兜底（`transition: none`）。
- 可断言契约（motion-web §8）：① 选中态用 `aria-pressed` 表达；② 过渡的时长/缓动**类名里必须出现 `var(--motion-` 字样**（= 引用 token 而不是内联值），这条用测试钉住。

---

## 2. ② 公海页码式分页（实现路径决策，动手前先写下）

后端是 **cursor/keyset**（t24），**不新增第二套分页语义**：
- **不造 offset、不改后端、不请求 `total`**；
- 前端把「页码」映射到**已经走过的游标链**上：`useSeaPages` 已经用 `useInfiniteQuery` 保存了
  `pages[]`（每页带 `nextCursor`），所以「第 N 页」= 沿 `nextCursor` 依次 `fetchNextPage()` 到第 N 页为止，
  点回前面的页 = 直接渲染缓存里的那一页（不再请求）。
- 页码数量 = `已取页数 + (hasNextPage ? 1 : 0)`，所以 UI 是「1 2 3 …」而不是假想的总页数；
  `nextCursor === null` 时不会凭空多出下一页（延续我之前那条「禁止假分页」的纪律）。
- 若用户后面坚持要「共 N 页」，那需要后端给 `total` —— **那一步我先回报 captain 派后端**，不自己造。

---

### 2.1 ② 的落地结果（已完成，证据）
- `pages/sea-page.tsx`：**「加载更多」换成页码 `1 / 2 / 3`**（`nav[aria-label="分页"]`，每个页码是一个按钮
  `aria-label="第 N 页"` + `aria-current="page"`）。
- **没有第二套分页语义**：页码 = **游标链上的索引**。点第 N 页时 ——
  已取到的页**直接用 `useInfiniteQuery` 的缓存**（不再发请求）；没取到的交给一个 effect
  **逐页 `fetchNextPage()` 推进游标**直到够用或 `hasNextPage === false`。
  页码数 = `已取页数 + (hasNextPage ? 1 : 0)` ⇒ **不请求 `total`、不造 offset**，
  `nextCursor === null` 时不会凭空多出一页。
- 每页**只显示这一页**的作品（不再是追加）；页码按钮的 hover 缩放仍引用契约 token
  （`var(--motion-hover-duration)` / `var(--motion-entry-easing)` / `var(--motion-hover-scale)`）。
- 测试：`sea-page.test.tsx` **8 passed**（新增 4 例，**先红后绿**：4 例红 —— `Unable to find role="button" and name "第 1 页"/"第 2 页"`）：
  单页时只有 `1`、不请求第二页；`nextCursor` 非 null 时出现 `1/2` 且**没有**「加载更多」；点第 2 页带 cursor 且**只显示第二页**；回到第 1 页**不再发请求**。

## 3. ③ 漂流日志精简（过滤位置决策）

**选择：前端过滤**（`features/bottle/drift-events.ts` 的映射层），理由：
1. **不动契约**：日志接口返回的是**事件流**（服务端真相），"给用户看什么"是**展示策略**；
   在后端过滤等于把展示策略烧进契约，改一次口径就要改契约 + 前后端同步。
2. 日志页是**同一 origin 的按需加载**（一屏几十条），省下的流量与"少一次契约变更"相比不划算。
3. 服务端仍保留完整事件流供审核/日志页的「技术细节」出口使用（真要时可加折叠），**不丢信息**。
保留：发起 / 投河 / 回传 / 入海 / 完成（+ 斩浪带来的缺口这类影响作品完整性的记录另评估）；
**去掉**：点赞 / 点踩（VOTE_CAST）等互动流水。

---

### 3.1 ③ 的落地结果（已完成，证据）
- 过滤落在 `features/bottle/drift-events.ts` 的**映射层**：新增 `CORE_EVENT_TYPES` 白名单
  = 发起 / 接唱 / 投河 / 捞取 / 放回 / 回传 / 入海（**用户说的是"核心操作"，"比如"是举例**，所以把
  「捞取 / 放回」这类用户操作也留着，只剔除互动流水与系统细节）；
- **剔除**：`VOTE_CAST`（用户明说不要赞踩）、`SEGMENT_CUT` / `BOTTLE_DAMAGED` / `BOTTLE_GAP_OPENED` /
  `BOTTLE_REWOUND`（系统行为细节 ⇒ 状态在瓶子页的段位链与状态标上讲）；
- **额外发现并修掉一处泄露**：`MESSAGE_ATTACHED` 原本会显示「留下了一条私密留言」，
  但 CONTEXT §5.1 规定**中间传递者不知道留言存在** ⇒ 日志里出现这行本身就是泄露，**已剔除**；
- **「完成」**：作品完整时，**最后一次接唱**标成「完成：最后一段录好了，作品完整」（由 `actorSourceOf` 带上 `isComplete` 判定，不是前端推算段数）；
- 页面文案改为「这里只记核心操作：发起、接唱、捞取、投河、回传、入海。」
- 测试：`drift-events.test.ts` **9 passed**（新增 5 例，**先红后绿**：4 例红）、`drift-log-page.test.tsx` **2 passed**
  （事件集里加了两条**该被过滤**的事件，断言它们真的不出现）。

## 4. 证据（随进度补）
- 守卫（①②③ 全部改完后各跑一次，均 exit 0）：`docs/ui-review/evidence/9-t41-desktop-1440.txt`（1440 **12/12**）、
  `docs/ui-review/evidence/10-t41-mobile-375.txt`（375 **12/12**）
- 三条门：见 §5（真实退出码）
- 一次真实跨界干扰（如实记录）：375 守卫中途报 `apps/api/src/store/notifications.ts:92 Unexpected "{"` ——
  **别人在途编辑 `apps/api/**`**（不在我的域），约 1 分钟后重跑即 **exit 0**，未做任何规避。

---

## 5. 三条门 + 守卫（真实退出码，全部实跑）
- `pnpm -r test` → **exit 0**（shared 22 文件/242 例、api 19/180、web 64 文件/**554 passed** | 1 skipped）
- `pnpm -r typecheck` → **exit 0**（0 条 error TS）
- `pnpm lint` → **exit 0**（0 problem；中途 2 条 `react-hooks/set-state-in-effect` + 1 条 react-refresh 警告已修，见下）
- 守卫：1440 → `evidence/9-t41-desktop-1440.txt` **exit 0，12/12**；375 → `evidence/10-t41-mobile-375.txt` **exit 0，12/12**
- 输出落盘：`docs/ui-review/evidence/11-t41-gates.txt`；截图 `docs/ui-review/after-t41-sea-1440.png`（页码 1 / 2 + 「第 1 页 · 后面还有更多」，无「加载更多」）

### 收尾时修掉的三处 lint（都是我这轮引入的）
1. `router.tsx` 在 effect 里 `setHref`（`react-hooks/set-state-in-effect`）⇒ 改成**匹配前规范化**：
   纯函数 `canonicalHref`（放在 `shell/routes.ts`）+ 初始化时一次性 `replaceState`（幂等）；
2. `sea-page.tsx` 的分页 effect 里同步 `setPage` ⇒ 改成**点击事件里**逐页推进游标
   （每轮看 `fetchNextPage()` 的返回结果，页数没涨就停 —— 不空转），effect 整个删掉；
3. `mood-chips.tsx` 同时导出常量与组件（react-refresh 警告）⇒ 常量不再导出，测试改为断言**字面量**标签
   （顺带让"文案被改掉"这件事真的会红）。
另外按 afrexai 条款把页码按钮给到 **44×44 触控目标**。

### 顺手修的一处：别人的契约变更打红了我的旧测试
`PrivateMessageSchema` 新增**必填** `targetSegmentIndex`（t42 方向：留言写给"第 N 段的作者"）⇒
我的 `private-messages.test.tsx` fixture 少了这个字段，面板只剩错误提示（2 例红）。
处理：fixture 补字段 + 面板**渲染出目标段号**（「给第 N 段的作者」）并加断言 —— 契约要求的字段不在界面上被默默丢掉。
