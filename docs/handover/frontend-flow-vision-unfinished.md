# t12 前端交接（frontend-flow）— 视觉返工 · P0 修复 · 判据守卫

> 本文件是**仓库内的交接**（不只在聊天里）。上一版是 08:45 停机快照；这一版是**复工后本轮**的实况。
> 所有命令与退出码均为**实跑**结果，未做任何转述。

---

## 1. 本轮实际交付（都带测试 / 都带原始命令）

| 主题 | 内容 | 证据 |
| --- | --- | --- |
| **P0 发起后无法录第一段**（用户亲报） | 根因：`DRAFT` 瓶子的 `holder` 是 `null`（内核 `BOTTLE_CREATED` 不动 holder）⇒ `BottleDetail.isHolder` 对发起者也是 `false`，而页面只看 `isHolder`。改为**服务端观看者维度事实**：`isHolder \|\| (status==='DRAFT' && availableResolutions.length>0)`；并补「已经唱过就只给选择去向」（内核 `CANNOT_RECORD_TWICE_IN_BOTTLE`）。**未改 `apps/api/**`** | `pnpm --filter @music-drift/web exec vitest run src/pages/__tests__/bottle-page.test.tsx` → **13 passed**；浏览器侧由守卫 `/bottles/<刚发起>` 的 `bottle-record=603` 独立守住 |
| 投票接线（赞/踩 + 四态） | `VotableSegment`（每段一个实例，`useSegmentListen` 唯一接线点）+ `VoteControls`（赞/踩、已投不可重复、门槛不足**不禁用**只提示）；票体只发契约里的 `{value}`，不再发 `listenedRatio`；一段只有一个踩（`SegmentPlayer showDislike={false}`，由 audio-engineer 提供） | `vitest run src/features/bottle/votable-segment.test.tsx` → **10 passed** |
| 时间轴选段 + 一行一条 | `RelayTimeline` 增加 `selectedSegmentId`/`onSelectSegment`；行内 32px 图标按钮；页面上**同时只放一个播放器** | `vitest run src/features/bottle/relay-timeline.test.tsx` → **8 passed** |
| 公海真分页 | `/sea` 改用 `useSeaPages`（`cursor` 进 / `nextCursor` 出），`limit=6`；**`nextCursor === null` 时不渲染「加载更多」**（禁止假分页） | `vitest run src/pages/__tests__/sea-page.test.tsx` → **6 passed** |
| 声明式内容进弹窗（§46.2） | 混音导出计划、录制面板、伴奏与授权、私密留言 → 入口 + `Modal` | `sea-detail-page.test.tsx` 现在**先断言它不在首屏、再点开看到它**（3 passed） |
| **私密留言 UI**（t12 剩余项之一，本轮补齐） | `PrivateMessages`（只渲染服务端过滤后的结果、未送达解释后果、非接唱者不摆写入口）+ `useBottleMessages` / `useAttachMessage` | `vitest run src/features/bottle/private-messages.test.tsx` → **4 passed** |
| 一屏装下（§46.3） | 9 条路由 + 新增的 `/sea/:id`、`/bottles/<刚发起>` 全部达标（1440）；375 走裁决 (B) 口径 | 见 §2 / §3 |

**t12 仍未做（不要当已完成）**：收藏 / 徽章（派生不落库）/ 指定接唱 的页面接线、入海后完整接力链的赞踩计数展示。

---

## 2. `one-screen-check.mjs`：判据口径与三条防自欺机制

```bash
node apps/web/tools/one-screen-check.mjs --viewport=1440x900 --shot=docs/ui-review/after
node apps/web/tools/one-screen-check.mjs --viewport=375x812  --shot=docs/ui-review/after-375
node apps/web/tools/one-screen-check.mjs --viewport=1440x900 --negative-control   # 必须 exit 0（全 FAIL）
node apps/web/tools/one-screen-check.mjs --viewport=375x812  --negative-control   # 必须 exit 0
```

- **桌面（≥1024px）**：`max(documentElement.scrollHeight, body.scrollHeight) <= 视口高`；
- **手机（<1024px，captain 裁决 (B)）**：① 不横向滚动（`scrollWidth <= 宽+1`）② 每页声明的
  `data-anchor` 锚元素 `rect.bottom <= 视口高`（锚点缺失 = FAIL，不静默跳过）；
- **反向控制**：注入 2000px（`body.prepend`，整页下移）⇒ 1440 判据 **12/12 FAIL**、375 锚点
  **10/12 FAIL**（另 2 条路由没有关键锚点、手机口径本就按锚点判；脚本会**打印出来**，不假装它们红了）；
- **hermetic**：默认自建一次性库（`live-check:db create`）+ 自起 API + 自起 vite（proxy 走
  `MDB_API_TARGET`），跑完 `drop` + `sweep`。**不再往共享开发库写任何东西。**

### 三个"假绿"教训（都是这一版抓到的，值得记住）

1. **`min-h-[100dvh]` 让任何页面的高度都 ≥ 视口高** ⇒ 「height=900 OK」可能是**白屏**。
   现在**两种口径都断言锚点存在**：先证明页面有内容，再谈它有多高。
2. **只等 `networkidle` 不够**：会话/查询可能在 idle 之后才发出，量到的是**骨架**（骨架高度也正好
   等于视口高）。现在三步都做：等 `[aria-busy]` 消失 → 等锚点出现 → 等两帧稳定。
   加之前：同一份代码连跑 3 次里 1 次 12/12、另 2 次 3 条红；加之后：**连跑 3 次全绿**。
3. **会话前置检查**：浏览器侧 `GET /api/auth/me` 必须 200，否则直接判失败（未登录视图会把一切都判成 OK）。
4. 顺带修掉一个真缺陷：`/sea/:id` **之前根本没被守卫量过**（"没测就当绿"）。现已纳入。

---

## 3. 证据文件（都在仓库里）

- 守卫输出：`docs/ui-review/evidence/{1-desktop-1440,2-mobile-375,3-negative-1440,4-negative-375}.txt`
  （四条命令 exit 码：`0 / 0 / 0 / 0`）
- 截图：`docs/ui-review/after/*-1440.png`、`docs/ui-review/after-375/*-375.png`
  （`/`、`/river`、`/sea`、`/new`、`/sea/:id`、`/me`、`/settings`、
  `/bottles/:id`（非持有者 / 持有者 / 刚发起）、`/bottles/:id/log`、404）
- 全仓检查（本轮实跑）：`pnpm -r typecheck` → **exit 0**；`pnpm lint` → **exit 0**；
  `pnpm -r test` → **exit 0**（shared 231 / api 179 / web 485）

---

## 4. 待裁决 / 待接手

1. **开发库里 17 首 `licensed_source='test'` 假歌**（`song-xxxxxxxx`，`2026-09-22 17:17:39~40` 一次性残留）。
   每首都挂着 **1 支测试瓶子**（16 支 `IN_RIVER`、1 支 `HELD`）—— 它们会**出现在河道里被随机捞到**，
   影响演示质量。删歌必须连带删这些瓶子（+ 其事件），超出「只删 17 首曲目」的授权 ⇒ **等 captain 一句话**。
   （判据已不受影响：守卫已 hermetic。）
2. 用户新增 #1（播完再点=重播 + UI 体现）、#3（录完加试听）落在 `SegmentPlayer` / 录制流；
   `record-step.tsx` 是我的，需要时我可以接。
3. 375 不强制整页一屏（裁决 (B)）：手机上 `/river` 两个面板、`/bottles/:id` 播放器+动作区
   都是「主内容提前 + 面板变矮」，**没有隐藏任何内容**；若用户之后要手机也一屏，可增量改成 Tab 式。
4. 代码里**仍残留少量 Tailwind 数字档**（`gap-*`/`min-w-0` 等）：`--spacing` 覆盖已回滚到默认
   0.25rem，这些恰好就是 DESIGN 的 4/8/12/16/24 节奏，故**刻意保留**；受影响的只有"尺寸类"
   （`w-*`/`h-*`/`min-h-*`），那些已全部改成显式 px。

---

## 5. 本轮引用的技能条款（逐条对到实现）

- `frontend-design`：**禁止模板化元信息串**（`A · B · C`）→ 瓶子页元信息改成并列短语、
  `RelayTimeline` 把段号/代号/时长拆成独立 span；**动效克制且只动 transform/opacity** → 赞踩按钮只
  `scale/translate`；**声明式内容不堆首屏** → §46.2 的四处弹窗。
- `afrexai-ui-design-system`：**禁用态必须有可见原因** → `VoteControls` 已赞/已踩给可见文案（不是
  `title`）；字号层级与间距只用 DESIGN 的 8pt 节奏与既有 token（显式 px）。
- `css-animation-creator`：**只动 transform/opacity、200ms、ease-out** → 赞/踩
  `transition-transform duration-200 ease-out hover:scale-[1.03]`；进度条 `scaleX` 而非 `width`。
