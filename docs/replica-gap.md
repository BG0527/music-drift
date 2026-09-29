# site/ 参考页 vs apps/web 复刻差距审计（t3）

> 只读审计 · 不改任何代码 · 产出物仅此文件
> 审计人：page-builder · 时间：本轮会话
> 参考侧：`site/*.html` + `site/patches/*.css` + `site/app/{page,fit,session}.js`
> 复刻侧：`apps/web/src/pages/*-page.tsx`（含 `river-motion.css`、`profile-page.css`）

---

## 0. 审计口径与方法（先说清楚证据怎么来的）

| # | 手段 | 命令 / 来源 | 说明 |
| --- | --- | --- | --- |
| M1 | 复刻一屏守卫（真实浏览器、一次性库、真实数据） | `node apps/web/tools/one-screen-check.mjs --viewport=1440x900` | 11 条路由，官方判据 |
| M2 | 同上，换成常见笔记本视口 | `… --viewport=1366x768` | 阈值=768 |
| M3 | 自建逐元素越线探针（dev 服务器 + demo 真实数据） | playwright 打 `http://localhost:5173`，量 `scrollHeight` 与「有直接文字/可交互、且 `bottom > 视口高`」的元素（判据照抄 `site/app/fit.js` 的 `contentBox` 口径） | 用来回答「**具体是哪一块**把页面顶出一屏」 |
| M4 | 参考站截图与量高 | `node tools/site-server.mjs --port=5199` + playwright 截图/量高（`site/app/session.js` 的登录闸门用 `page.route` mock `/api/auth/me` 绕过） | 1440×900 与 1366×768 两档 |
| M5 | 结构/组件 token 差集 | 提取参考页全部 `class="…"` token，在 `apps/web/src/**`（169 个 ts/tsx/css 全扫）里查缺 | 类名非 1:1，缺 token = **待确认点**，不直接等于缺组件 |
| M6 | 设置页关键构件坐标 | playwright `getBoundingClientRect` 量复刻 `/settings`，参考坐标取 `site/patches/settings.css` / `p-settings-record.html` 的画布值 | ② 的数值对照来源 |

**局限（明说）**：
- 参考侧 1366×768 的量高用了**空数据 mock**（参考站没有可复用的 API 数据），空态比真实数据短 ⇒ 参考侧 768 的数字偏乐观；
- 复刻侧 M1/M2 用一次性库（数据少），M3 用开发库存量数据 ⇒ 同一页两个高度（如 `/me`：858 vs 2987），**两个都真实**，差异来自数据量；
- `/admin` 需要管理员会话，本轮**未实测**（只做代码对比）；
- M5 的 token 差集只标「对不上」，逐个是重命名还是缺失，已在 §5 逐页注明确认状态。

---

## 1. 总览

### 1.1 两侧的一屏机制根本不同

| | 参考 `site/` | 复刻 `apps/web` |
| --- | --- | --- |
| 一屏机制 | 每页 `site/patches/<slug>.css`：`html,body{height:100dvh}` + **一切纵向尺寸 = `N * --u`（`--u = 100dvh/900`）或 `clamp(地板, N·--u, Npx)`** ⇒ 视口变矮，版式整体等比收缩 | 绝大多数块用**固定 px**（`py-3`/`gap-6`/`h-[260px]`/`text-[…]`），只在 1440×900 这一档被调到「恰好 900」 |
| 溢出去哪了 | `html,body{overflow:hidden}` ⇒ **永不滚动**（放不下就裁，靠 clamp 提前避免） | 文档流正常滚动 ⇒ **要下拉** |
| 顶栏让位 | 10 个补丁全部写 `max(设计值, var(--top-nav-h))` | 顶栏 `fixed top-[10px]` 零占位（`top-nav.tsx:29`），页面**不为它留带**（河道页例外：`md:top-[max(10.67%,54px)]`） |
| 逃生口 | `fit.js`（非补丁页整张画布等比缩放）/ `data-fit-off` | 无（只有河道页自带 `md:h-[100dvh] md:overflow-hidden`） |

### 1.2 逐页总表

| 页面 | 参考补丁的版式骨架 | 复刻版式 | 1440×900 | 1366×768（要下拉？） | 结构覆盖（M5 缺 token） | 差距等级 |
| --- | --- | --- | --- | --- | --- | --- |
| 河道 river | 绝对定位锚视口 `%` + `--u` 场景 | `md:absolute` 锚视口 + 一屏约束（**唯一达标页**） | 900 ✅ | 768 ✅（0 越线） | 与参考同构（删波形带/重试块/参与记录，属稿裁决） | ★ 基准 |
| 设置 settings | 折页 `leaf 104,52 1232×796` + 水线 `--wl=520·u` + 瓶骑线 | 两栏网格 + 流式水线 + 独立瓶 SVG + BottleMark 倒影 | 900 ✅ | **810 ❌**（登出按钮 732→776） | 65 → 缺 22（瓶/折页纸件几乎全缺） | **P0** |
| 公海 sea | 水线 `366·u`、六瓶骑线、`--u` 整体缩放 | `.sea-hall{min-height:max(100dvh,900px)}` + 纵向 px 原样 | 900 ✅ | **900 ❌**（+132；分页钮 844→866） | 40 → 缺 0（结构最全） | **P0** |
| 我的 me | flex 列 + `clamp` 三档空隙（720 有地板） | 定高 `.window 260px` + **无上限的 `.msgs` 列表** | 900 ✅ | **858 ❌ / 真实数据 2987 ❌**（216 个元素越线） | 54 → 缺 4（仅尺寸变体） | **P0** |
| 发布 new | 五只 `.bay` 绝对定位 + `--u` 整块缩放 | `grid xl:grid-cols-5` 响应式折行 + 固定 px 纵向 | 900 ✅ | **849 ❌**（卡下 figcaption 774→810、页脚注 829→849） | 23 → 缺 2（`bay`/`st2`） | P1 |
| 瓶子 bottle | 场景 `--u`(cover) + 下两栏 `--uv`(contain) + 时间轴 `scale(--k)` | 正常流 + `px/max()` 边距 | 900 ✅ | **854 ❌**（底栏三链 794→838、提示 805→826） | 57 → 缺 11（多为改名，`gapBox` 在） | P1 |
| 漂移日志 log | 两栏 flex + **右栏内部滚动**（`overflow-y:auto`） | 一列 flex，**列表无内部滚动** | 900 ✅ | **862 ❌**（但 0 个文字越线：超出的是装饰层） | 17 → 缺 0 | P2 |
| 登录 login | `--u=100dvh/900`，`main` 铺满 | `min-h-[100dvh]` + 固定块 | 900 ✅（0 越线） | **854 ❌**（右栏小注 778） | 32 → 缺 9 | P1 |
| 404 | 同登录（补丁流体） | flex 列 + 绝对装饰 | 900 ✅ | 768 ✅ | 29 → 缺 2 | P3 |
| 审核台 admin | `--u/--ux` + 水线 `540·u` | flex 列 + `mt-auto` 页脚 | 未实测 | 未实测（需管理员） | 46 → 缺 5（`refl/caustic/…` 瓶件存疑） | P2（待测） |

> 1440×900 全绿（M1 `exit 0`，11/11 `height=900`）是**贴着门禁调出来的**：没有任何余量，视口一矮就破（M2 7/11 红）。参考侧同一档也是 900，但它**在任意视口都收敛到视口高**（M4：1366×768 下 6/10 页 `scrollHeight=768`，河道目检视觉完整）。

---

## 2. ① 哪些页需要下拉 / 一屏放不下（具体位置与原因）

### 2.1 守卫原文（复刻侧）

`--viewport=1440x900` → `exit 0`：

```
OK   /  height=900 …      OK   /sea 900   OK /new 900   OK /me 900  OK /settings 900
OK   /bottles/*（3 态）900 · OK /log 900 · OK /nope 900
✅ 全部页面达标（桌面口径：一屏装下）
```

`--viewport=1366x768` → `exit 1`：

```
OK   /river            height=768
FAIL /sea              height=900   ← 整页高 900 > 768
FAIL /new              height=818
FAIL /me               height=858
FAIL /settings         height=810
FAIL /bottles/<id>     height=879 / 829（录第 1 段的草稿瓶 768 ✅）
FAIL /bottles/<id>/log height=862
❌ 7 个页面不达标
```

### 2.2 逐页「顶出一屏的具体位置 + 原因」（M3，1366×768，dev 真实数据）

| 路由 | 文档高 | 越线构件（`top → bottom`） | 原因（代码位置） |
| --- | --- | --- | --- |
| `/river` | 768 ✅ | 无 | 唯一有硬约束的页：`river-page.tsx:273` `md:h-[100dvh] md:overflow-hidden`，header/页脚/泊位 `md:absolute` 锚视口 |
| `/sea` | **900** | 页脚分页按钮 1–7（844→866）、`p.meta.tail`「完整作品 · 本页 N 支」（846→864） | `sea-page.tsx:78` `.sea-hall{min-height:max(100dvh,900px)}` —— **写死 900 地板**；且六瓶的水位 `COL_WYS = 370.4px…`（`sea-page.tsx:52`）纵向 px 原样、不随视口缩（参考 `patches/sea.css` 全部 `* var(--u)`） |
| `/new` | **849** | 五格卡下 `figcaption`「已切分 4/4 段」×4（774→810）、页脚说明 `p`（829→849） | 纵向节奏全是固定 px（页头 `mt-[22px]`、卡片区 `gap-4`、卡高固定）；参考 `patches/new.css` 用 `--u` 整块缩盆架 + `clamp` 收口，复刻改成 `grid xl:grid-cols-5` 后**高度不再随视口变** |
| `/me` | **858**（同页 dev 数据 **2987**） | 768 档：底部「我的收藏/我的徽章」卡；真实数据档：**216 个元素**越线，最深 `p.mdet` 到 2980（消息列表一条 ~46px，几十条直冲 3000） | ① `.p-record .msgs ul/li`（`profile-page.css:556+`）**没有高度上限也没有内部滚动**，列表随消息数线性长高；② 页面纵向空隙是固定 px（参考 `patches/me.css` 是 `clamp(地板, N·--u, Npx)` 三档空隙 + `--pad-msg-row`，720 档专门压过） |
| `/settings` | **810** | 登出按钮（732→776，越 8px） | 纵向是 `md:grid` 四行 + 固定 `gap-6/5`、`py-5`；参考整页 `leaf 796·--u` + 所有 `margin-top: clamp(…, N·--u, Npx)`（`patches/settings.css:374-453` 共 17 条节奏全 clamp），复刻**一条 clamp 都没有** |
| `/login` | **854** | 右栏小注「线上那枚代号…」（758→778） | `login-page.tsx:225` 只有 `min-h-[100dvh]`（下限不是上限），内部块固定 px；参考 `patches/login.css` `--u=100dvh/900` 纵向整体缩 |
| `/bottles/<id>` | **854** | 底栏「看这只瓶子的漂流日志 / 私密留言 / 举报」（794→838）、说明 span（805→826）、上一行「去河道捞一个」（742→786） | `bottle-page.tsx:102` `pt-[max(1.5rem,2.083vw)] pb-[max(1rem,1.111vw)]` 只做横向 vw 化，**纵向仍随内容累积**；参考 `patches/bottle.css` 下半两栏用 `--uv=min(100vw/1440,100dvh/900)`（contain）落位 + `html/body overflow:hidden` |
| `/bottles/<id>/log` | 862 | 0 个文字/交互越线（超出的 94px 是装饰层/容器） | 页面无一屏约束；建议目检确认是否真需要滚（很可能是**装饰层撑高**的假性超标） |
| `/nope…`(404) | 768 ✅ | 无 | — |
| `/login`（404 除外唯一未入守卫的公开页） | 见上表 | — | 守卫 `routesFor()` 不含 `/login`、`/admin` ⇒ **这两页从来没被一屏门禁量过**（`one-screen-check.mjs:349-366`） |
| `/admin` | 未测 | — | 需管理员会话；代码上是 `mt-auto` 页脚 + flex 列，理论上有 `min-h` 但无上限 |

### 2.3 参考侧同档对照（M4）

- 1440×900：10 页 `scrollHeight` 全部 = **900**（settings/me/admin 用会话 mock 后渲染本页）。
- 1366×768：`settings/sea/new/drift-log/login/admin/404` = **768**（不溢出）；`river 854 / me 847 / bottle 854` 报超——但参考所有补丁页 `html,body{overflow:hidden}` ⇒ **不产生滚动条**；
  - 目检（截图 `C:\Temp\replica-gap-ref768\river-768.png`）：河道**视觉完整**（页脚 chips 全在），超出的 86px 来自不可见装饰；
  - 目检 `me-768.png`：**「我的徽章」卡片在 768 处被裁**（参考自身也有矮窗风险）。
- 结论口径：参考的正确判据是 `tools/probe-fit.mjs` 的「被裁内容=0」（M4 无法替代它，因为需要真 API + 演示库）；**参考在 900 档是设计目标、768 档靠 clamp 收缩但并非零裁切**。

### 2.4 ① 的一句话结论

- **要下拉的（1366×768）**：`/sea`、`/new`、`/me`、`/settings`、`/login`、`/bottles/:id`、`/bottles/:id/log`（7 类路由）；`/river`、404、草稿瓶一屏达标。
- **最严重**：`/me` —— 消息列表无上限，开发库数据下 **2987px**（守卫用空库只量到 858，属于**数据量盲区**）。
- **根因不是"某一块太高"，而是机制缺失**：除河道页外，没有任何一页有「视口高 = 版式高」的约束；参考侧的 `--u = 100dvh/900` + `clamp` 节奏 + `overflow:hidden` 三件套，复刻侧一件都没有移植。

---

## 3. ② 设置页漂流瓶样式的复刻差异（非复刻、丑的具体点）

### 3.1 三根线没有对齐（最刺眼）

| 线 | 参考（1440×900） | 复刻（实测 M6） | 差 |
| --- | --- | --- | --- |
| 画出来的水线 `.wline` / `anonymous-waterline` | `y=520`（`--wl = 520·--u`，`patches/settings.css:23`） | **`y=410`**（流式网格第 2 行，随内容走） | 与背景分界差 **53px** |
| 背景干/湿分界 `.air/.sea` | `y=520`（同一根 `--wl`） | **`y=463`**（`top-[57.8%]` 的绝对层，`settings-page.tsx:81/86`） | 与画出的水线差 53px |
| 纸的干/湿分界 `.leaf-dry/.leaf-wet` | `52+468 = 520`（同一根 `--wl`，接缝 0px） | sheet `h 1..800` 的 `58.8%/41.2%` 分段（`settings-page.tsx:113/117`） | 第三套坐标 |
| 瓶子接触水皮 `.contact` | `y=516..523`（**骑在 520 上**） | `y=347..354`（在 410 线上方 56px、463 分界上方 109px） | 瓶**悬空**，没骑线 |

参考里「空气/水/纸/线/瓶/倒影」共用**一个 `--wl`**；复刻是**三套互不相干的坐标**（流式行、`57.8%` 绝对层、sheet 内百分比），截图上肉眼可见：图例「水面之上/之下」在 y≈401/441，暗色水底从 y≈463 才开始，瓶底停在 y≈359。

### 3.2 瓶子本体：不是同一个瓶子

| 构件 | 参考（`settings.html` 256-291 / 补丁 162-314） | 复刻（`settings-page.tsx:268-316`） |
| --- | --- | --- |
| 形态 | 7 个定位构件：`bot-shoulder/neck/body/lip/cork + bot-l1/l2` 两道高光，锚点 `left=1182·--ux`、尺寸 `112×--ux` 比例锁死 | 单个内联 SVG `viewBox 0 0 160 252`、`w-[160px]`（**比参考宽 43%**），位置在右栏 flow 内 |
| 落点 | `x 1182..1294`（纸右侧、贴水线） | `x 1247..1407, y 107..359`（贴视口右缘、整体在水线上方） |
| 纸条 `.slip`「代号」 | **在瓶身内部**（`left1204, top440, 68×36`，浮在瓶肚里） | 瓶**外面**一个 `border` 徽章（`settings-page.tsx:317`），在瓶下方右侧 |
| 声波 7 柱 `.wave` | 瓶上方独立块（`1216,264,45×48`） | SVG 内 `x57..99 / h6..38`（有，等价） |
| 接触水皮 + 两圈涟漪 | `y=516/520`（水线上） | 在 SVG 内 `y=347..354`（跟着瓶底，离水线 56px） |

### 3.3 倒影：换成了另一个图标（**最"非复刻"的一条**）

- 参考：`<div class="refl">` 里是**同构镜像的 6 件**（`rb/rs/rn/rl/rc` + `rslip「账号」`），`left=1182, top=520, 112×190` —— **正上方就是瓶、x 完全对齐、宽度完全一致**，读起来是"同一只瓶的水下部分"。
- 复刻：`<BottleMark size={64} tone="sea-glass" />` 翻转 + `opacity-40`（`settings-page.tsx:327-329`）——
  - 形状不同（BottleMark 是站点通用小标，软木塞大、瓶身比例与稿无关）；
  - **尺寸 64px vs 参考 112px**；
  - **x 不对齐**：倒影在右栏居中（≈x1040-1100），瓶在 x1247-1407，水平错开约 200px（截图肉眼可判）；
  - 与瓶之间断开约 96px（参考 0px）。

### 3.4 整块缺失的构件（M5 token 差集 + 代码确认）

| 参考构件 | 作用 | 复刻状态 |
| --- | --- | --- |
| `.hole` + `i`（34px 模切指孔，`1160,730`） | 纸右下的圆洞 | **无** |
| `.dogear`（41px 折角） | 纸左上翻角 | 换成 `clip-path: polygon(30px 0, …)` 切页角（`settings-page.tsx:106`）——切在**页面**左上角 (0,0)，不是纸角 (104,52) |
| `.crease-shl / .crease-shr`（各 28px 阴影带 + 1px 主折线，共 3 条） | 折痕的立体感 | **只剩 1 条 1px 线**（`fold`，x=720 位置对） |
| `.wick mid/lf/rt`（3 处灯芯渐变） | 折页边缘渗光 | **无** |
| `.wav` ×3（水下波纹线 1150/1168/1156, y540-598） | 倒影周围水纹 | **无** |
| `.bub` ×3（气泡 8/6/4px, y603-670） | 水下生气 | **无** |
| `.slip` 瓶内纸条 / `rslip` 倒影纸条 | 代号在瓶里、账号在倒影里 | 换成两枚外置徽章 |
| `.leaf-top` 纸顶亮边 / `.tide` 12px 湿前沿 | 纸的材质 | tide 有等价渐变（`settings-page.tsx:194`），leaf-top 未确认 |

### 3.5 排版/文字差

- **纸的留白**：参考纸 `x104..1336, y52..848`（四周留边、内容左起 152）；复刻纸贴满视口（`y1..800`、内容左起 **33**），顶栏（fixed 10-54）与纸顶几乎贴在一起，参考所有补丁都有 `max(设计值, --top-nav-h)` 让位带。
- **文案**：参考 `.who` 行 = 只显代号 `demo`，另有「角色 USER（普通用户）」行；复刻 `.who` 行 = `已登录：<handle>（<email>）`，无角色行（`settings-page.tsx:343-348`）。
- 底部 801..900 是裸背景（参考纸到 848、下留 52），复刻纸底 800 与页面底 900 之间空 100px 且纸边不可见。

### 3.6 结论

设置页是**差距最大的一页**：不是"细节不同"，而是**瓶子装置被降级成两段互不相干的贴图**（独立瓶 SVG + 通用 BottleMark 倒影），水线从"全页坐标基准"退化成"网格里的一行"。修法应直接照参考坐标系重建（见 §6 P0-2）。

---

## 4. ③ 河道页 = 达标基准：可复用手法

来源：`river-page.tsx` + `river-motion.css` + `site/patches/river.css`（同一套语言的两侧实现）。

1. **一屏硬约束写在根元素上**（最关键、最易复制）
   `river-page.tsx:273`：`<main class="… min-h-[100dvh] … md:h-[100dvh] md:overflow-hidden">`。
   `md+` 固定视口高 + 裁切 ⇒ **任何内容都别想把页面撑高**；`<md` 退回 `min-h` 流式单列（双档，不违反 375 不强制一屏的裁决）。

2. **正文块退出文档流，锚视口百分比**（对应参考 `river.css` 的 `!important` 落点）
   - `header`：`md:absolute md:inset-x-0 md:top-[max(10.67%,54px)]`（`54 = 顶栏 top10 + min-h-11` ⇒ **顶栏让位写进 max()**，与参考 `max(10.67%, var(--top-nav-h))` 同思路）；
   - `footer`：`md:absolute md:inset-x-0 md:bottom-[3.33%]`；
   - 两个泊位：`md:absolute md:left-[4.1667%] md:top-[44.444%]` / `md:left-[26.389%] md:top-[60%]`，说明文字再 `md:absolute md:left-[121%] md:top-[21%]` 挂在泊位上；
   - `section.river-body`：`md:absolute md:inset-0` ⇒ 泊位的 `%` 就是**视口 %**（`md:contents` 让子元素跳过中间盒，`river-page.tsx:491`）。

3. **装饰零高度**：背景五层 / 母题 / 涟漪一律 `absolute inset-0 z-0 pointer-events-none aria-hidden`（`river-page.tsx:280`），**不进文档流 ⇒ 对一屏零贡献**。全站守卫也按这条裁决（docs 里「装饰必须绝对定位或零高度」）。

4. **一套坐标系画到底**：backdrop 与泊位共用 cover 场景盒 `width:max(100%, 100dvh*1.6)`（`:289`），SVG `viewBox 0 0 1440 900` + `preserveAspectRatio="xMaxYMax slice"` ⇒ 任何视口下弧线和按钮逐像素咬合（注释里写明旧版两套坐标在宽屏脱节的教训）。

5. **尺寸全部 `clamp`，字号留 px**：泊位 `h-[clamp(88px,13.194vw,190px)]`、h1 `text-[clamp(2.5rem,6vw,5.25rem)]`（对应参考 `clamp(72px,5.83vw,112px)`）。**大屏不变胖、小窗不糊、可点区不缩没**。

6. **矮窗主动让位**：`river-motion.css:109` `@media (min-width:768px) and (max-height:844px){ .mood-note{display:none} }` —— DOM/文案保留、视觉收起（这正是 `/settings` 等页缺的"768 档从哪挤高度"的答案之一）。

7. **动效纪律**（任务④要直接复用）：
   - 只动 `transform/opacity`，keyframes 属性白名单；时长/缓动/位移**只引 `--motion-*` 契约变量**（`river-motion.css` 头注）；
   - 三段状态机 `enter → ripple → exit`，**播完再跳转**（`pendingNavRef`，`river-page.tsx:186-200`），`prefers-reducedMotion()` 时不起动画立即跳；
   - 同位 `aria-live` 文字状态（`drawStatus/castStatus`）⇒ 动效永远不是唯一反馈；
   - `reduced-motion` 下 CSS 逐项 `animation:none` 与全局兜底双保险；
   - 事件涟漪 `iteration:1`、退场比入场短（480/240 配对）。

8. **测试钉死**：`__tests__/river-page.test.tsx` 断言 `md:h-[100dvh]`、`md:overflow-hidden`、场景几何 `max(100%, calc(100dvh * 1.6))`、装置存活 —— 一屏约束**有机器守卫**，别的页没有。

9. **门禁覆盖**：`one-screen-check.mjs` 的 `/` 与 `/river` 都是 OK；但注意它**不含 `/login`、`/admin`**（见 §2.2）。

---

## 5. 逐页结构 / 排版 / 组件差距清单

> 「结构」= 块的有无与层级；「排版」= 落位/尺寸/节奏；「组件」= 装置与子构件。
> M5 数字 = 参考 class token 总数 → 在 `apps/web/src` 全扫仍找不到的个数（**待确认点**）。

### 5.1 河道（基准，仅记差异）
- 结构：同构；复刻按 `f4-groove` 稿删了「波形带 / 重试块 / 右上参与记录」（`river-page.tsx:19`，属裁决，不算缺口）。
- 排版：达标（§4）。与参考的数值完全同源（190/150 盘、`4.1667%/44.444%`、`bottom 3.33%`）。
- 组件：三件装置（沟槽河道 SVG 六层水槽、双泊位、默认态无瓶）齐；动效比参考更完整（f0 三段状态机）。
- 遗留：无 `<md` 档与 375 档未在本轮复核（守卫 375 口径只查锚点）。

### 5.2 设置（P0，详见 §3）
- 结构：65 token 缺 22 —— 瓶件 `bot-*`、倒影 `refl/rslip`、纸件 `dogear/crease-shl/shr/soak/wick/leaf-top/hole`、文字块 `l-dry/l-wet/r-dry/standfirst/tiny/lbl` 全部对不上（文本块属重排重组，**瓶/纸件属真缺失**）。
- 排版：三线不齐（§3.1）、纸不留边、无顶栏让位、无 clamp 节奏、768 档 810px。
- 组件：瓶装置降级（§3.2/3.3）。

### 5.3 公海 sea
- 结构：**40/40 全覆盖**（分区 tab、六瓶、sounding、空态、页脚分页都在）。
- 排版：`min-height:max(100dvh,900px)` 硬地板 ⇒ 768 档必溢 132px；六瓶水位 `COL_WYS` 与倾角 `COL_TILTS` **纵向 px 原样**，参考是 `366·--u` 整体缩放 ⇒ 矮窗下瓶子与水线的相对关系会失真（`sea-page.tsx:51-53` vs `patches/sea.css:24-28`）。
- 组件：`.sea-hall` 内嵌稿级 `<style>`（`sea-page.tsx:78+`）——样式与 Tailwind 并存，后续 token 化要注意。

### 5.4 我的 me / profile
- 结构：54 缺 4（`f133/f200/if130/if195`，仅尺寸变体）——骨架（header/crate/window/msgs/pocket×2/sleeve）齐。
- 排版：`.msgs` 列表**无上限无内滚**（`profile-page.css:556+`）⇒ 真实数据 2987px（§2.2）；参考同类内容靠 `clamp` 空隙 + `.window` 定高 + 行内距压到地板（`patches/me.css:26-40`）。
- 组件：`.window 260px + overflow:hidden` 与参考 `.window`（地板 206、随视口缩）同思路，但**高度不随视口缩**（复刻固定 260，参考 `clamp(206, …, 300)` 一类的动态值）。

### 5.5 发布 new / song-picker
- 结构：23 缺 2（`bay`、`st2`）。复刻把参考的**五只绝对定位浅盆**改成 `grid sm:2 lg:3 xl:5`（`song-picker-page.tsx:419`），盆宽 cap 260 —— 1440 五格能排开，但**列宽均分 + 折行**与参考「盆心 260.5px 等距、与盘面同心缩放」的构图不同源（参考 `patches/new.css:4-11` 明说"不改成 flex"）。
- 排版：768 档 849px，越线的是卡下说明与页脚注（§2.2）。
- 组件：盆的几何常量（盆口 4:3、母版 74.3%、水位 88.2%）是照稿 SVG 重算的，质量高；缺的是**盆架坐标系**。

### 5.6 瓶子 bottle
- 结构：57 缺 11（`gapHead/gapKind/gapNote/gapSlot/segNum/segLab/journey/timecode/voteBtn/selMark/botLink`）——`gapBox` 在（`bottle-page.tsx:303`），段号/时间轴/投票在 `features/bottle|audio` 组件里，**多数应为改名**，`journey/timecode`（参考的播放进度装置类名）**未确认**。
- 排版：纵向 `px/max()` 只 vw 化横向；768 档 854，越线的是底栏（§2.2）。参考用 `--uv`(contain) 单独管下半两栏 + 时间轴 `scale(--k)` 整块缩放。
- 组件：沟槽时间轴 + 唱针已移植（用户点名保留）；四格剖面/录制槽/三选一均在。

### 5.7 漂移日志 drift-log
- 结构：**17/17 全覆盖**。
- 排版：参考右栏**内部滚动**（`patches/drift-log.css:108 overflow-y:auto`）+ `main{height:100dvh}`；复刻无内部滚动、无高度约束 ⇒ 862px（超出部分经 M3 判定为装饰层，0 文字越线 ⇒ **可能只需裁装饰**，建议目检）。
- 组件：刻痕盘 SVG + 时间线齐。

### 5.8 登录 login
- 结构：32 缺 9（`devnote/f-handle/f-pass/modes/oath/thread/mouth/said/lbl`）——多为文案块类名重组；`devnote`（开发注记块）**未确认是否丢失**。
- 排版：768 档 854，右栏小注越线（§2.2）；无顶栏让位。
- 组件：瓶「只露一角」的裁切在（`login-page.test.tsx:236` 断言 `closest('.overflow-hidden')`）。

### 5.9 404
- 结构：29 缺 2（`lintel`、`tidewater`，均为装饰层名，**疑似改名**）。
- 排版：两档全过 ✅（`enter-fade flex flex-col gap-6 overflow-hidden` + 装饰绝对定位）。
- 组件：潮线/水滴/横贯光带在。

### 5.10 审核台 admin（未实测）
- 结构：46 缺 5（`caustic/neck/shoulder/refl/tether`）——`refl/neck/shoulder` 是**瓶倒影件**，与设置页同一类降级风险（**待确认**）。
- 排版：flex 列 + `mt-auto` 页脚 + `min-h`？（未量）；参考 `--u/--ux` + 水线 `540·u`。
- 建议：补一个管理员会话的 1440/1366 量高（守卫 `routesFor()` 需要加 `/admin`）。

---

## 6. 修复优先级建议（给下游实现任务，本轮不改代码）

| 级别 | 项 | 做法（照河道页/参考补丁） | 验证 |
| --- | --- | --- | --- |
| **P0-1** | 给 7 条超屏路由装一屏约束 | 每页根 `<main>` 抄 `river-page.tsx:273` 的 `md:h-[100dvh] md:overflow-hidden`（内容多的页在 md+ 用**内部滚动容器**收列表，参考 `drift-log.css:108` 先例） | `one-screen-check --viewport=1366x768` 从 7 红 → 0 红 |
| **P0-2** | 设置页瓶装置按参考坐标系重建 | 单一根 `--wl`（520/900 比例）同时驱动：背景分界、纸干湿分界、画出的水线、瓶接触点、倒影顶边；倒影用**同构镜像**（或至少同宽同 x 对齐），补 `hole/dogear/三线折痕/wav×3/bub×3` | 新增视觉断言：水线 y 与 `sheet-sea` top 相差 0、瓶 contact 与水线相差 ≤2px、倒影 x 与瓶 x 相等 |
| **P0-3** | `/me` 消息列表上限 | `.msgs ul` 定高 + `overflow-y:auto`（或参考的行内距 clamp 到地板） | 真实库存量下 `/me` `scrollHeight ≤ 视口高` |
| **P0-4** | `/sea` 去掉 900 地板 | `min-height:max(100dvh,900px)` → `min-h-[100dvh]` + 纵向尺寸 `--u` 化（六瓶水位同比例） | 1366×768 `height=768` |
| P1 | `/new`、`/login`、`/bottles/:id` 纵向 clamp 化 | 把固定 `py/gap/mt` 改成 `clamp(地板, N·100dvh/900, Npx)`（参考 `settings.css:374-453` 有 17 条现成写法） | 同上 |
| P1 | 顶栏让位 | 页面顶部内容 `max(设计值, 54px)`（河道页已这么写；设置页 h1 顶 51px 已与顶栏带 10-54 贴边） | 目检 + `页面墨迹 ∩ 顶栏矩形 = 0` |
| P2 | 守卫补盲 | `one-screen-check.mjs` 的 `routesFor()` 加 `/login`、`/admin`（管理员会话），并加一条**数据量反向控制**（多造 N 条消息，确保 `/me` 这类页能红） | 反向控制红 → 绿 |
| P2 | `/log` 862px 目检 | 判定是装饰撑高还是内容撑高，前者把装饰改 `absolute` | 1366×768 `height=768` |
| P3 | token 差集清零 | 把 §5 的「未确认」项逐个判定：改名（记录映射）/ 真缺失（补） | 重跑 M5 脚本 |

**建议的统一验收命令**（下游任务交付时附原文）：
```bash
node apps/web/tools/one-screen-check.mjs --viewport=1440x900     # 期望 exit 0
node apps/web/tools/one-screen-check.mjs --viewport=1366x768     # 现状 exit 1（7 红）→ 目标 exit 0
node apps/web/tools/one-screen-check.mjs --viewport=1440x900 --negative-control   # 期望反向控制成立
pnpm -r test && pnpm -r typecheck
```

---

## 7. 证据附录

- 守卫输出：见 §2.1 原文（1440 exit 0 / 1366 exit 1）。
- 逐元素越线清单（M3）与设置页坐标（M6）：见 §2.2 / §3.1。
- 截图（只读产物，放在仓库外，不污染工作区）：
  - 参考 1440×900：`C:\Temp\replica-gap-ref\*-ref.png`（`settings/me/admin` 为会话 mock 后的本页渲染）
  - 参考 1366×768：`C:\Temp\replica-gap-ref768\{river,me,bottle}-768.png`
  - 复刻 1440×900：`C:\Temp\replica-gap-replica\{home,river,sea,new,me,settings,bottles-*-log,nope}-1440.png`
- 参考站服务器：`node tools/site-server.mjs --port=5199`（后台任务，审计结束已停）。
- 本轮未改动任何仓库文件（唯一新增 = 本文件 `docs/replica-gap.md`）。
