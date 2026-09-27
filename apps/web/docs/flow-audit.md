# 全站动线审计（flow-audit）

> 只读审计 · 不改代码。以**审计当时各文件的当前内容**为准（页面正被并行返工，若 mtime 变化请以本文件记录的行段为线索重新核对）。
> 范围：`apps/web/src/pages/**`（路由真值 + 外壳 + 10 个页面）。诉求来源：用户抱怨「链路不流畅，例如投出第一棒进选歌页后被卡死、没有返回河道的键」。

---

## 0. 路由真值与全局出口

### 0.1 路由表（`src/pages/shell/routes.ts` L36-L50）

| 路径 | RouteName | 页面组件 | 备注 |
| --- | --- | --- | --- |
| `/login` | login | LoginPage | 全屏入口，**不套外壳**（`route-view.tsx` L24）→ 无全局导航 |
| `/` | home | RiverPage | 唯一 URL 规范化点：`canonicalHref` 把 `/` → `/river`（replaceState，routes.ts L62-L64） |
| `/new` | new | SongPickerPage | 选歌页（投出第一棒的入口） |
| `/river` | river | RiverPage | 河道（canonical 首页） |
| `/bottles/:id` | bottle | BottlePage | 瓶详情（录 / 投 / 三选一都在这页） |
| `/bottles/:id/log` | bottleLog | DriftLogPage | 漂流日志 |
| `/sea` | sea | SeaPage | 公海 |
| `/me` | profile | ProfilePage | 我的（requireLogin） |
| `/settings` | settings | SettingsPage | 设置（requireLogin） |
| `/admin` | admin | AdminPage | 审核台（requireLogin，管理员另判） |
| 其余 | notFound | NotFoundPage | 404 空态 |

一级导航 `NAV_ITEMS`（routes.ts L114-L119）：河道 `/river` · 公海 `/sea` · 我的 `/me` · 设置 `/settings`；管理员追加 审核台 `/admin`（L112）。
`activeNavKey`（L122-L141）：home/new/river/bottle/bottleLog 归「河道」，**admin 返回 null**（route-view L26 兜底成 `'river'` → 审核台高亮河道，属标色小瑕疵，非断链）。

### 0.2 全局出口（现状唯一的兜底）

- **DemoNav**（`shell/demo-nav.tsx`）：`fixed right-16 top-16` 的悬浮「导航」按钮，**默认收起**，展开才有 河道/公海/我的/设置(+审核台)。`app-shell.tsx` L68 在每个套壳页面都渲染它 —— 所以**任何套壳页都不是绝对死路**，但它是「折叠的 demo 导航」，不是语义化的返回键，用户发现成本高。
- **未登录闸门**（`app-shell.tsx` L100-L111）：requireLogin 页未登录时就地给「去登录 → `/login?next=<当前>`」，不静默跳走 ✓。
- 页内导航统一经 `Link`（`shell/router.tsx`）+ 外壳层 `useInternalLinkHandler` 拦截真锚点；`buildPath` 反拼路径（纪律：页面禁手拼字符串，sea-page L540 遵守）。

---

## 1. 全站动线图（谁通向谁 · 真实链接目标）

```text
                    ┌──────────────────────────────────────────────────────────┐
                    │  DemoNav（收起的悬浮「导航」，唯一全站兜底）：河道/公海/我的/设置(/审核台)  │
                    └──────────────────────────────────────────────────────────┘

/login ──(登录成功 navigate(next))──▶ 任意 ?next 页        login 已登录态:「直接去河道捞一个瓶子」L256 ──▶ /river
   ▲ guest 无站内出口（仅浏览器返回）
   │
/river（河道）  entry: `/` 规范化 · DemoNav · conflict 语义键 switchBottle/viewLog/sea
   ├─ header「我参与过的漂流瓶」L269 ──▶ /me（未登录 → /login?next=/me）L135
   ├─ 「投下」CAST 圆盘 L426-L447 ──(f0 动画)──▶ /new（未登录 → /login?next=/new）L133-L134
   ├─ 「捞一个」打捞按钮 L184-L217,L377 ──▶ /bottles/:id
   └─ footer「先去公海听听已经完成的作品」L487 ──▶ /sea
        ✕ 没有去 settings 的页内链（靠 DemoNav，一级页可接受）

/new（选歌 · SongPickerPage）
   ├─ entry: 河道 CAST · conflict 语义键 pickSong（conflict-notice.tsx L43-L44）
   └─ 唯一出口:「选这首，录第 1 段」Button L414-L432 ──▶ create ──▶ navigate(/bottles/:id)
   ✕ 全文件无 import Link —— 没有任何返回/登录/公海链接（含空态 L302-L310）★缺口 G1

/bottles/:id（瓶详情 BottlePage）
   ├─ 顶栏面包屑 L150-L161:「← 回河道」▶ /river ✓
   ├─ 不在你手上 L429-L437:「去河道捞一个」▶ /river ✓
   ├─ 放回海中 L356-L381: putBack 成功 ──▶ navigate(/river) ✓
   ├─ 录音 Modal L475-L499: RecordStep onUploaded ──▶ invalidate ──▶ 打开三选一 Modal
   ├─ 三选一 ResolutionModal onConfirm L513-L527: 只 setAnnouncement（投河/入海/回传），
   │    ✕ 成功后**不导航、无后续键** —— 用户停在瓶页只听到播报 ★缺口 G2
   └─ 底栏 L443-L472:「看这只瓶子的漂流日志」▶ /bottles/:id/log · 私密留言/举报（Modal）

/bottles/:id/log（漂流日志）
   └─ 面包屑 L151-L160:「← 回漂流瓶」▶ /bottles/:id ✓（到河道需两跳，可接受 · 观察项 G9）

/sea（公海）
   ├─ entry: 河道 footer · 我的-收藏空态（collections-panel L46）· conflict 语义键 sea · DemoNav
   ├─ 每条作品「听这支作品」L540 ──▶ /bottles/:id ✓（buildPath 拼路径）
   ├─ 空态 L479-L481:「去河道捞一个」▶ /river ✓
   ✕ **非空态**（列表区 L487-L516）页内无任何回河道/回一级的链 ★缺口 G3

/me（我的 ProfilePage，requireLogin）
   ├─ entry: 河道 header · DemoNav · 通知「去看看/去看一眼」L157/L193 ▶ /bottles/:id
   ├─ MyBottles: 瓶行 ▶ /bottles/:id、日志 ▶ /bottles/:id/log（my-bottles.tsx L237-L240）；
   │    空态「去河道捞一个」▶ /river（my-bottles.tsx L111）✓
   ├─ 收藏/徽章 Modal: 收藏空态 ▶ /sea（collections-panel L46）；徽章 ▶ 日志（badges-panel L70）
   ✕ 非空态下页头/页脚无任何横向链（去河道/公海只能靠 DemoNav 或先点进一个瓶）★缺口 G7

/settings（设置，requireLogin）
   ├─ entry: DemoNav
   └─ 出口: 登出成功 navigate(/login) L238-L245；署名/关于为 Modal
   ✕ 全文无一处站内 Link —— 上下文返回键缺失（一级页，靠 DemoNav 兜底）★缺口 G6

/admin（审核台，requireLogin + isAdmin）
   ├─ 非管理员态 L68-L84:「回首页」▶ `/`（canonical→/river）✓
   ✕ 管理员成功视图 L86-L193（header/tabs/footer）无任何站内 Link，唯一出口=DemoNav ★缺口 G4

/login（全屏，不套外壳 ⇒ 无 DemoNav）
   ├─ 登录/注册成功: navigate(safeNextPath(next)) L91 ✓
   ├─ 已登录态 L247-L260:「直接去河道捞一个瓶子」▶ /river ✓
   ✕ 未登录态只有表单：访客（被 `/login?next=/new` 带进来又不想登录）**无站内出口**，只能浏览器返回 ★缺口 G5

/（404 NotFoundPage）
   └─ 「回首页」▶ `/` ✓ · 「去河道捞一个漂流瓶」▶ /river ✓ · 「去公海听完成的作品」▶ /sea ✓ —— 三出口，健康
```

---

## 2. 缺口清单（进得去出不来 / 只能浏览器返回 / 断链）

建议出口统一语汇（照 record-v1 / `bottle-page.tsx` L150-L157 的既有写法）：**coral（或 text-glass）文字链 + `ArrowLeft` 图标 + 下划线/最小点击区 `min-h-11`**，放各页 header 左上，文案「← 返回河道」。禁止新造颜色与图标（Lucide 已有 `ArrowLeft`）。

### G1 ★P0 — 选歌页 `/new` 没有任何返回出口（用户抱怨的「投出第一棒进选歌页后被卡死」）

- **页面**：SongPickerPage（`src/pages/song-picker-page.tsx`）
- **位置**：header `L255-L290`（只有标题+计数，无面包屑）；全文件无 `import { Link }`（L33-L40 imports 段可证）；唯一出口按钮 `L414-L432`；空态 `L302-L310`、未登录底注 `L449-L453` 同样零链接。
- **缺什么**：从河道 CAST 进来后，页内没有任何「返回河道 / 去公海 / 去登录」的键；想反悔只能浏览器返回，或先发现右上角折叠的 DemoNav「导航」按钮再展开。
- **建议出口**：
  1. header 左上加面包屑：`← 返回河道` → `/river`（coral 文字链 + ArrowLeft，落点河道，样式照 bottle 页「回河道」）；
  2. 空态（曲库没准备好）补同款「← 返回河道」，避免空库时零出口；
  3. 未登录底注 L449-L453 直接带 `去登录 → /login?next=/new` 文字链（别等 401 才由 ConflictNotice 给，见 G8）。

### G2 ★P0 — 瓶页三选一「投河/入海/回传」成功后只播报、无下一步键（主循环在最高潮处断掉）

- **页面**：BottlePage（`src/pages/bottle-page.tsx`）
- **位置**：`ResolutionModal onConfirm` `L513-L527` —— 成功后仅 `setAnnouncement('已投河…/已入海…/已回传…')`，**不 navigate、不渲染任何链接**；录音 Modal onUploaded `L490-L496` 直接串到该弹窗。
- **缺什么**：「已入海：这件作品现在所有人都能听到」却**没有「去公海听」的键**；「已投河」没有「回河道」的键。用户投完第一棒后停在瓶页，下一步（→公海→我的）全靠自己找路。
- **建议出口**：播报文案旁补一组后续动作文字链（coral + 箭头）：
  - `SEA` → `→ 去公海听这一版` 落点 `/sea`；
  - `RETURN`/投河 → `→ 回河道继续` 落点 `/river`；
  - 通用兜底 `→ 去我的看看` 落点 `/me`。三选一弹窗关闭后这些键应留在瓶页正文，不只活在 aria-live 播报里。

### G3 ★P1 — 公海 `/sea` 非空态无返回河道的键

- **页面**：SeaPage（`src/pages/sea-page.tsx`）
- **位置**：列表渲染区 `L487-L516` 与页头区；页内 `Link` 只有两处 —— 空态 `L479-L481`（去河道捞一个 ✓）与作品条目 `L540`（听这支作品 ▶ `/bottles/:id` ✓）。
- **缺什么**：**有作品时**整个页面没有回 `/river` 的链；从河道 footer「先去公海听听」进来后想回河道，只能浏览器返回或 DemoNav。
- **建议出口**：页头（zone 切换条旁）加 `← 返回河道` → `/river`；或页脚 `foot()` 里补一条「← 回河道投一棒 →」coral 文字链。

### G4 ★P1 — 审核台 `/admin` 管理员视图零站内出口

- **页面**：AdminPage（`src/pages/admin-page.tsx`）
- **位置**：成功视图 `L86-L193`（header L95-L105、tablist L108-L157、footer L183-L192）无一处 `Link`；只有**非管理员**拦截态 `L79-L81` 有「回首页」→ `/`。
- **缺什么**：管理员进去后页内无返回键；且 `activeNavKey('admin') = null` 导致 DemoNav 里高亮的是「河道」而非审核台（routes.ts L136-L137 + route-view L26），回路心智更混乱。
- **建议出口**：header（L95 附近）加 `← 回河道` → `/river`（TEXT_LINK_STRONG / coral + ArrowLeft）；顺带评估 admin 高亮归属（报告项，不代改）。

### G5 ★P1 — 登录页未登录态无站内出口（全屏壳，连 DemoNav 都没有）

- **页面**：LoginPage（`src/pages/login-page.tsx`）
- **位置**：`route-view.tsx` L24 —— login 不套 AppShell ⇒ 无 DemoNav；页内唯一 `Link` 在 `L256`（**仅 authed 分支**）；未登录分支 `L261-L263` 只有表单+占位。
- **缺什么**：访客被河道 CAST 以 `/login?next=/new` 带进来、又不想登录时，页面上没有任何站内去处，只能浏览器返回（移动 WebApp/新标签页里没有返回键）。
- **建议出口**：底栏加一条弱化文字链「先随便看看 → 河道」→ `/river`（或 `next` 反悔时回 `next`）。⚠️ 与「全屏入口：一屏一个任务」的设计注释（route-view L5）可能冲突 —— **属设计裁决项，报 captain，不自行实现**。

### G6 ★P2 — 设置页 `/settings` 无上下文返回键

- **页面**：SettingsPage（`src/pages/settings-page.tsx`）
- **位置**：全文无 `Link` import（L20-L27 imports 段）；出口只有登出 `L238-L245`（navigate `/login`）与署名 Modal。
- **缺什么**：一级页、DemoNav 可兜底，但页内零返回键；从 DemoNav 深进设置后想回上文（河道/我的）须再开一次 DemoNav。
- **建议出口**：header（L89-L97 的 h1 上方）加 `← 返回河道` → `/river`，语汇同 G1。

### G7 ★P2 — 我的 `/me` 非空态无横向出口链

- **页面**：ProfilePage（`src/pages/profile-page.tsx`）
- **位置**：header `L94-L100` 无链接；正文出口全部依赖「点进一个瓶」（L157、L193、MyBottles 行链接）；去河道/公海的链**只在空态**（my-bottles.tsx L111、collections-panel L46）。
- **缺什么**：有瓶子的老用户在「我的」页看不到任何去河道/公海的直达链，回主循环只能 DemoNav。
- **建议出口**：header 右上或页脚加 `去河道投一棒 →` → `/river`（可与 `← 返回河道` 二选一，保持语汇统一）。

### G8 ★P2 — 选歌页未登录底注只有说明、没有登录链（失败后才补救）

- **页面**：SongPickerPage（`src/pages/song-picker-page.tsx`）
- **位置**：底注 `L449-L453`（guest 文案「发起需要登录…」纯文本）；登录出口目前只能等 `create` 401 后由 ConflictNotice 的 `AUTH_REQUIRED` exits 兜底（conflict-notice.tsx L33-L34 生成 `/login?next=…`）。
- **缺什么**：把「必须先失败一次」当登录引导；顺手可修 G1 时一并加 `去登录 → /login?next=/new` 文字链。
- **建议出口**：底注尾部补 `去登录 →` coral 文字链（L449-L453 内）。

### G9 ○观察项 — 漂流日志无直达河道的捷径

- **页面**：DriftLogPage（`src/pages/drift-log-page.tsx` L151-L160）：只有 `← 回漂流瓶` → `/bottles/:id`，回河道需两跳（有中间页承接，**不算断链**）。
- **可选优化**：面包屑升级为 `← 回漂流瓶 · 回河道`，或在「回漂流瓶」旁加 `/river` 次级链。

### 汇总表

| # | 级别 | 页面 | 位置 | 缺什么出口 | 建议键（文案 → 落点） |
| --- | --- | --- | --- | --- | --- |
| G1 | P0 | 选歌 `/new` | song-picker-page.tsx L255-L290（无 Link import） | 返回河道（含空态） | `← 返回河道` → `/river` |
| G2 | P0 | 瓶页 `/bottles/:id` | bottle-page.tsx L513-L527 | 投后下一步 | `→ 去公海听` → `/sea`；`→ 回河道继续` → `/river` |
| G3 | P1 | 公海 `/sea` | sea-page.tsx L487-L516 | 非空态回河道 | `← 返回河道` → `/river` |
| G4 | P1 | 审核台 `/admin` | admin-page.tsx L86-L193 | 管理员视图出口 | `← 回河道` → `/river` |
| G5 | P1 | 登录 `/login` | login-page.tsx L261-L263（不套壳） | 访客站内出口 | `先随便看看 →` → `/river`（⚠️需裁决） |
| G6 | P2 | 设置 `/settings` | settings-page.tsx L89-L97 | 上下文返回键 | `← 返回河道` → `/river` |
| G7 | P2 | 我的 `/me` | profile-page.tsx L94-L100 | 非空态横向出口 | `去河道投一棒 →` → `/river` |
| G8 | P2 | 选歌 `/new` | song-picker-page.tsx L449-L453 | 底注登录链 | `去登录 →` → `/login?next=/new` |
| G9 | 观察 | 日志 `…/log` | drift-log-page.tsx L151-L160 | 直达河道捷径 | `回河道` → `/river`（可选） |

**缺口条数：9（P0×2 · P1×3 · P2×3 · 观察×1）**

---

## 3. 建议的统一动线（主循环：每步有进有出）

```text
河道 /river ──投──▶ 选歌 /new ──选──▶ 瓶页 /bottles/:id（录）──▶ 三选一（投/入海/回传）
   ▲                                        │                        │
   │        ①← 返回河道（G1 补）             │                        │
   │                                        ▼                        ▼
   └────────── ②← 回河道（已有 L150） ◀────┤              公海 /sea ──▶ 瓶页（听）
   ▲                                        │                │ ③← 返回河道（G3 补）
   │                                        │                ▼
   │              投后下一步键（G2 补） ─────┴──────▶ 我的 /me ──▶ 瓶/日志/收藏
   │                                                 │ ⑦ 去河道投一棒（G7 补）
   └─────────────────────────────────────────────────┘
设置 /settings ←⑥← 返回河道（G6 补）    审核台 /admin ←④← 回河道（G4 补）
登录 /login ──⑤ 访客出口（G5，需裁决）──▶ 河道     404 ──回首页/河道/公海（已健康）
```

**逐站进出规范（落地验收口径）：**

1. **每页 header 左上固定一个返回位**：一级页与二级页都给「← 返回河道」（二级页如日志可用「← 回上一级」），coral/glass 文字链 + ArrowLeft + `min-h-11`，样式以 `bottle-page.tsx` L150-L157 为模板全站复制。
2. **每个动作成功后给「下一步」**：投河/入海/回传成功 → 正文留键（G2），不让流程死在播报里。
3. **每个空态给「去处」**：选歌空态、公海空态、我的空态都必须至少一条文字链（选歌空态缺，公海/我的已有）。
4. **每个错误态给「出口」**：ConflictNotice 的语义键（login/switchBottle/viewLog/sea/backHome/pickSong）已覆盖，保持。
5. **DemoNav 降级为兜底**：补完 G1-G8 后，右上「导航」按钮不再承担任何「唯一出口」职责；登录页是否补访客出口（G5）报 captain 裁决。
6. **回路自检（建议补成测试）**：从 `/` 出发走 主循环 一圈，每一步 DOM 内都能找到下一步的 `<a href>`（含空态与错误态分支），全程不依赖浏览器返回键与 DemoNav。
