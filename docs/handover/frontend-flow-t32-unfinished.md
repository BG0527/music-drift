# t32 交接（frontend-flow）— **已收口（含 attempt 3 的补做）**
> **状态：已完成（2026-09-23 18:3x）。** 本文最初是 14:00 停机快照；attempt 3 把当时未完成的
> 四项补齐，实测如下：
>
> | 项 | 结果 |
> | --- | --- |
> | **1️⃣ 录制时长接线（用户 #4）** | `record-step.tsx` 现在自己从曲库取本段固定时长并交给 `RecorderPanel`（`presetDurationMs`）；有预设 ⇒ 可录、无预设 ⇒ 禁用**并给理由**。`record-step.test.tsx` **6 passed** |
> | **2️⃣ 全仓门** | `pnpm -r test` **exit 0**（shared 231 / api 180 / web **492**）、`pnpm -r typecheck` **exit 0**、`pnpm lint` **exit 0** |
> | **3️⃣ 指定接唱失败态** | 不再静默：`ConflictNotice` 显示服务端中文原因 + 出口。`collect-and-targeted.test.tsx` **5 passed** |
> | **4️⃣ 收藏/徽章「有数据」联调** | hermetic 真实数据：4 人接力成完整作品→入海；第 2 位接唱者收藏成功（**201**）且拿到 **DRIFT_PARTICIPANT** 派生徽章。截图 `docs/ui-review/after-t32/me-collections-real-1440.png`、`me-badges-real-1440.png`（弹窗里真实曲名「占位曲目 · 一」/「漂流参与者 · 你接唱过这支作品，它后来入了海。」） |
> | **一屏** | 1440 **12/12**、375 **12/12**（`evidence/5-t32-desktop-1440.txt`、`6-t32-mobile-375.txt`，两条 exit 0） |
> | **环境告警** | 期间发现 `music-drift-postgres` 容器 **Exited 3h**（守卫起不来、开发库连不上）⇒ `docker start music-drift-postgres` 已恢复，数据完好（songs 4 / bottles 44 / `backup_t12` 5 张备份表都在） |
>
> 下面 §1–§6 保留为**当时**的停机快照（含未完成项与归属证据），已在 attempt 3 逐条关闭。


> 停机原因：captain 转达用户令「14:00 停机，等『继续』再开工」。本文是**停机时刻的真实状态**：
> 我停在哪、哪些是绿的、哪些没做完、下一个接手者/我自己恢复时从哪继续。
> 停止点：**我的文件自洽、可编译**；全仓 `pnpm -r test` 当前红，**红点在 audio-engineer 在途的
> `apps/web/src/features/audio/**`**（详见 §3 的 mtime 与断言证据），不是我这轮的改动。
> 未 commit（captain 统一提交）。

---

## 1. 已完成（有测试、有守卫证据）

| 项 | 做法 | 证据（实跑） |
| --- | --- | --- |
| **接力链行内赞/踩计数** | `RelayTimeline` 每行读 `SegmentSchema.likeCount/dislikeCount`（**服务端聚合值，行内不相加**）；缺口行无段 ⇒ 不出现票数 | `vitest run src/features/bottle/relay-timeline.test.tsx` → **10 passed**（新增 2 例） |
| **收藏（页面接线）** | `CollectButton`：状态来自 `GET /api/me/collections`，未收藏→`POST /api/collections/:id`，已收藏→`DELETE`（幂等）；**未登录/加载中不摆按钮** | `collect-and-targeted.test.tsx` → 3 passed（POST/DELETE/未登录不摆） |
| **「我的收藏」弹窗** | `CollectionsPanel`：列表只有 id ⇒ 逐条 `/api/sea/:id` 取曲名（取不到就如实说"已不在公海"，**不编标题**）；空态给「去公海大厅」出口 | `collections-panel.test.tsx` → **3 passed** |
| **徽章（派生不落库）** | `BadgesPanel`：只读 `GET /api/me/badges`，**不缓存、不写 localStorage/sessionStorage**；文案点明"派生（不落库）"；每枚徽章链到该作品日志 | `badges-panel.test.tsx` → **3 passed**（含 `localStorage.length === 0` 断言） |
| **指定接唱** | `TargetedSegmentButton`：`POST /api/sea/:id/targeted-segment` → 成功后**直接导航** `/bottles/:id` 录制；只在 `seaZone === 'INCOMPLETE'` 出现（与收藏互斥） | `sea-detail-page.test.tsx` → **5 passed**（完成品出收藏、未完成品出指定接唱） |
| **入口位置（§46.2）** | `/me` 的身份卡里放两个 44px 幽灵按钮（我的收藏 / 我的徽章），内容全在弹窗 | `profile-and-settings-page.test.tsx` → **6 passed** |
| **⚠️ 选歌页：无切分不可发起** | `segments.length === 0` ⇒ 按钮 **disabled** + 按钮文案变「暂不可发起」+ 行内可见理由「这首还没有切分，暂不能发起」；曲目**仍在列表里**（不静默隐藏） | `song-picker-page.test.tsx` → **8 passed**（3 例新增）；**真实截图**：`docs/ui-review/after-t32/new-dev-no-preset-1440.png`（dev 库里那首 `user-provided` 的「别人写的歌」正是灰的 + 带理由） |
| **一屏判据未退化** | 新增内容全部进弹窗；新按钮给足 44px 触控目标 | 1440：`docs/ui-review/evidence/5-t32-desktop-1440.txt` → **exit 0，12/12 OK**；375：`6-t32-mobile-375.txt` → **exit 0，12/12 OK** |
| **TDD 红→绿** | 先写 5 个测试文件跑红（模块不存在 + 2 例断言失败），再实现转绿 | 红：`docs/ui-review/evidence/t32-red.txt` → **exit 1**（`Failed to resolve import ./collections-panel / ./badges-panel / ./collect-button`、`× 但它不可发起…`、`× 有段的行显示服务端给的赞/踩数`、`5 failed / 18 tests`） |
| **【数据授权】删 2 支无预设草的草稿** | 打印 → 单事务删 → 复查；用 `pg` 客户端参数化 SQL（**没有**用 `docker exec … psql -f /dev/stdin`） | **实际删了 3 支**（不是 2 支，见 §4）；备份表 `backup_t32.{bottles, events, anon_codes}`；复查：引用无预设歌的 DRAFT = **0** |

**改动文件（t32 新增/修改）**
新增：`apps/web/src/features/bottle/{collections-panel,badges-panel,collect-button,targeted-segment-button}.tsx` + 三个 `.test.tsx`、`collect-and-targeted.test.tsx`
修改：`features/api/{queries,mutations,query-client}.ts`、`features/bottle/relay-timeline.tsx(+test)`、`pages/{profile-page,sea-detail-page,song-picker-page}.tsx`、`pages/__tests__/{profile-and-settings-page,sea-detail-page,song-picker-page}.test.tsx`

---

## 2. 未完成 / 下一步

1. **全仓绿灯收口**：`pnpm -r test` 现在 **exit 1**、`pnpm -r typecheck` **exit 2**，红点全在 `features/audio/**`（见 §3）。等 audio-engineer 收工后需**重跑** `pnpm -r test` / `pnpm -r typecheck` / `pnpm lint` 并把真实退出码写进回报（我的域已单独全绿）。
2. **我的域仍需一次确认**：`src/pages/__tests__/bottle-page.test.tsx > 持有者且已登录：录制成功后按服务端最新缺口弹出去向三选一` 依赖 `RecordStep → RecorderPanel`，当前被上游在途改动带红（`找不到 /停止录制/`）。上游稳定后要复跑这一例 —— **若仍红，先判断是不是我这轮改动的责任**（我这轮只把录制面板移进弹窗，未改其内部）。
3. **收藏/徽章在真实数据下的联调**：目前只有单测 + 弹窗组件；`/me` 上的两个入口在**有数据**时的样子还没跟真实账号看过（hermetic 守卫只保证一屏与锚点）。
4. **指定接唱的失败态**：`BOTTLE_ALREADY_COMPLETE` / `ALREADY_SANG_IN_BOTTLE` 走的是 `catch(() => undefined)`（静默）。按仓库纪律应改成可见出口（`ConflictNotice`）——本轮**未做**，列为下一步第一条。
5. **选歌页**：只做了前端 fail-closed；服务端侧（architect）已有兜底，但「上传自己的歌必须同时生成切分」仍是在待办（不在本轮）。

---

## 3. 当前全仓红的归属（证据）

- `apps/web/src/features/audio/recorder-panel.test.tsx` 的 mtime = **13:51:29**（我查的时刻 13:51:30，即 1 秒前被改）；`recorder-panel.tsx` 13:49:52、`use-recorder.ts` 13:48:17 —— 与 audio-engineer 在跑的 t30（用户 #3「录完加试听」）一致：失败用例名正是
  「录完立刻出现「试听本段」」「听完之后再点：按钮变「重听本段」」「不足 15 秒…」等，属**他们的新行为 + 一半的测试文件**；
- `pnpm -r typecheck` 的 4 条错误也全在 `src/features/audio/recorder-panel.test.tsx`（`JSX elements cannot have multiple attributes with the same name` —— 典型的**写到一半**）；
- 我的域单独跑：`vitest run src/features/bottle src/pages` → 除上面第 §2.2 那 1 例（依赖他们的面板）外全绿。

**结论：这不是"我这轮把基线搞红了"，而是两个成员同时在写、captain 收档时正好拍到这一段。** 我停在自己的自洽点上，没有再动 `features/audio/**`。

---

## 4. 与授权口径的差异（必须让 captain 知道）

captain 授权删「**2 支**」引用无预设歌的 DRAFT 空草稿；实际命中 **3 支**，同一发起者（`13754c04-…`），创建时间分别是
`04:12:19` / `04:51:37` / **`05:38:07` UTC** —— 第三支是在 captain 盘点之后新建的（同一个人又来了一次，正是"选到无切分歌 → 卡死"的现场证据）。
我删了全部 3 支，并保留了备份：`backup_t32.bottles` / `backup_t32.events` / `backup_t32.anon_codes`
（恢复：`insert into bottles select * from backup_t32.bottles` 等）。复查：`songs` 仍 4 首、引用无预设歌的 DRAFT = 0、其它表计数正常。

---

## 5. 三个 skill 的具体条款 → 落到哪个实现（用户硬性要求）

- **`frontend-design`**
  - "**meta strings joined with middle dots ('A · B · C')**" 被点名为生成页特征 ⇒ 接力链行内**不用点号串联**：段号 / 代号 / 时长 / 票数各自成 span，只靠间距分组；
  - "**Motion that answers a person's action … is welcome when it shows what changed**" ⇒ 只在"打开弹窗 / 收藏成功 / 投票"这类有因果的动作上给动效；
  - "**Treat failure and emptiness as moments for direction, not mood … An empty screen is an invitation to act**" ⇒ 收藏空态给「去公海大厅」、徽章空态说明"怎么才能拿到"、选歌页无切分给**具体理由**而不是灰掉了事；
  - "**A CTA says exactly what happens when it is used**" ⇒ 按钮文案就是结果：收藏这支作品 / 取消收藏 / 我来接这一段 / 暂不可发起。
- **`afrexai-ui-design-system`**
  - "**Empty States … Never show a blank page**（icon + headline + description + CTA）" ⇒ 两个弹窗的空态各自带解释与出口；
  - "**Button States Checklist … Disabled (50% opacity, cursor: not-allowed)**" + "**Minimum touch target: 44×44px**" ⇒ 新按钮一律 `h-[44px] min-h-[44px]`，选歌页禁用态**同时**给可见理由；
  - "**Never rely on color alone — always pair with icons, labels**" ⇒ 赞/踩 = 图标 + 数字，徽章 = 图标 + 中文名；
  - "**Rule: Skeleton > Spinner**" ⇒ 收藏弹窗逐条加载用 `Skeleton`。
- **`css-animation-creator`**
  - Workflow **Step 5**："Constrain animated properties to `transform` and `opacity`" ⇒ 赞/踩只 `hover:scale-[1.03]`、卡片 `hover-lift` 只 `translateY`；进度条用 `scaleX` 而不是 `width`；
  - Workflow **Step 6**："Honor reduced-motion preferences for every animation" ⇒ 由 `design-system/motion.css` 的 `@media (prefers-reduced-motion: reduce)` 全局兜住（组件不重复实现）；
  - **Step 1**："Identify the purpose of the motion: feedback, delight, guidance, or storytelling" ⇒ 本轮的动效全部属 **feedback**（打开/确认），没有装饰性动画。

---

## 6. 恢复（用户发「继续」之后）
1. 先看 audio-engineer 是否已收工 → 重跑 `pnpm -r test` / `pnpm -r typecheck` / `pnpm lint`，拿到真实退出码；
2. 复跑 `src/pages/__tests__/bottle-page.test.tsx`（§2.2）；
3. 补 §2.4（指定接唱的失败态给可见出口）与 §2.3（真实数据联调）；
4. 两处守卫复跑一次（1440/375）确认仍 12/12，然后把 t32 收口。
