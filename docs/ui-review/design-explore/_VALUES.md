# 设计定稿精确取值表（_VALUES.md）

> **来源与口径**：本文件的值**逐条抄自同目录同名 `.html`**（`docs/impl-plan-record-v1.md` §5.5：「精确值一律从同名 `.html` 抄」）。
> PNG 只用于判断整体印象，**不作为取值来源**。本文只搬运设计稿里已有的值，**没有推演、没有补值**：抽不到的字段写「（本页未用）」。
> 不可从 HTML 得到的三件事（响应式重排、语义/无障碍、token 映射）**不在本文范围**内，见 §5.5 第 3 条。

- **11 页定稿名单**（与 `_AUDIT.md` §6、`_SCORECARD.md` 一致；不在 `_guard.mjs` 的 `ARCHIVE` 集合里）：
  1. `f4-groove.html` → `/river` —— 河道（标杆页）
  2. `p-songpicker-record.html` → `/new` —— 选一首歌
  3. `p-bottle-record.html` → `/bottles/:id` —— 瓶子详情（录制／试听／去向）
  4. `p-login-record.html` → `/login` —— 登录 / 注册
  5. `p-sea-hall.html` → `/sea` —— 公海大厅
  6. `p-sea-detail-record.html` → `/sea/:id` —— 公海作品详情
  7. `p-driftlog-record.html` → `/bottles/:id/log` —— 漂流日志
  8. `p-profile-record.html` → `/me` —— 我的
  9. `s2-admin-record.html` → `/admin` —— 审核台
  10. `p-settings-record.html` → `/settings` —— 设置
  11. `p-404-record.html` → 未匹配路径 → notFound —— 404
- **色板基准**：`DESIGN.md`。「解析」列给出该值对应的 token 名；`（+N 别名）` 表示该 hex 在 `DESIGN.md` 里登记了多个名字（本文件只给首个 + 别名个数）。
- **排版表**只列「有名字的选择器」上出现的 `font-size` / `letter-spacing` / `line-height` / `font-weight` 四项（`*` 通配符规则不列）。
- **颜色表**逐规则块解析：`--x` 变量展开成 `--x ⇒ 解析结果`；`未收进契约` = 该值在 `DESIGN.md` 色板里找不到对应 token（含 SVG `<defs>` 的 `stop-color`，汇总见附录 A）。
- **几何表**只取 `.clip` / `.page` 的**顶层绝对定位块**（`left/right/top/bottom/inset` 原样给出）；层级更深的块折叠成清单。`f4-groove.html` 无 `.clip`/`.page`，退化为 `body` 顶层（表中已标注）。
- 文案清单按**文档顺序**（＝阅读顺序；绝对定位装置的用字可能不在同一坐标轴上），逐字未改（含 `U+3000` 全角空格）。`⟨br⟩` = 源码里的 `<br />`。

## 1. 河道（标杆页） · `f4-groove.html` → `/river`
- **它是什么**：河道主页面：唱片质感的地面 + 被点亮的沟槽＝河道 + 两个错落圆泊位（空泊位＝可捞的瓶位）
- **画布**：`html,body` = 1440×900（`overflow:hidden`）；页面底色 `--ink`

### 1.2 排版（选择器 → 值）
| 选择器 | font-size | letter-spacing | line-height | font-weight |
| --- | --- | --- | --- | --- |
| `h1` | 84px | — | 1 | 700 |
| `.sub` | 15.5px | — | 1.9 | — |
| `.cat` | 11px | .24em | — | — |
| `.note` | 13px | — | 1.85 | — |
| `.note b` | — | — | — | 400 |
| `.rpm` | 26px | — | — | — |
| `.port .core` | 20px | .12em | — | 700 |
| `.port .core span` | 10px | .28em | — | 400 |
| `.port .cap` | 12.5px | — | 1.75 | — |
| `.port .cap b` | 15px | — | — | — |
| `.tag` | 12px | .1em | — | — |
| `footer .go` | 13px | .06em | — | — |
| `[inline] div.cat` | — | .06em | 2 | — |

### 1.3 颜色（选择器 → 值 · 契约状态）
| 选择器 | 属性 | 声明原文 | 解析（hex/rgba → 契约 token） |
| --- | --- | --- | --- |
| `:root` | `--ink` | `#050f14` | #050f14 = ink（+1 别名） |
| `:root` | `--paper` | `#f3f9fa` | #f3f9fa = paper（+1 别名） |
| `:root` | `--muted` | `#a9c7cf` | #a9c7cf = muted（+3 别名） |
| `:root` | `--glass` | `#7fd1d9` | #7fd1d9 = glass（+2 别名） |
| `:root` | `--coral` | `#c7452c` | #c7452c = 未收进契约 |
| `:root` | `--line` | `rgba(243,249,250,.16)` | rgba(243,249,250,0.16) = paper（+1 别名） @ 16% |
| `body` | `background` | `var(--ink)` | --ink ⇒ #050f14 = ink（+1 别名） |
| `body` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.platter` | `background` | `radial-gradient(circle at 1420px 960px,
            rgba(2,9,13,0) 0 1276px, rgba(2,9,13,.52) 1285px, rgba(2,9,13,0) 1366px),
          rgba(127,209,217,.022)` | rgba(2,9,13,0) = 未收进契约（基色 #02090d）；rgba(2,9,13,0.52) = 未收进契约（基色 #02090d）；rgba(127,209,217,0.022) = glass（+2 别名） @ 2.2% |
| `.body` | `background` | `radial-gradient(circle at 1420px 960px,
          rgba(127,209,217,.055) 0 1210px, rgba(127,209,217,0) 1330px)` | rgba(127,209,217,0.055) = glass（+2 别名） @ 5.5%；rgba(127,209,217,0) = glass（+2 别名） @ 0% |
| `.field` | `-webkit-mask-image` | `radial-gradient(circle at 1420px 960px,
          transparent 0 930px, #fff 990px, #fff 1258px, transparent 1300px)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；transparent（透明，非色值） |
| `.field` | `mask-image` | `radial-gradient(circle at 1420px 960px,
          transparent 0 930px, #fff 990px, #fff 1258px, transparent 1300px)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；transparent（透明，非色值） |
| `.field i` | `background` | `repeating-radial-gradient(circle at 1420px 960px,
          rgba(214,241,247,.03) 0 1px, rgba(214,241,247,0) 1px 4.4px)` | rgba(214,241,247,0.03) = 未收进契约（基色 #d6f1f7）；rgba(214,241,247,0) = 未收进契约（基色 #d6f1f7） |
| `.field i` | `-webkit-mask-image` | `radial-gradient(circle at 0 0, transparent 0 340px, #fff 820px)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；transparent（透明，非色值） |
| `.field i` | `mask-image` | `radial-gradient(circle at 0 0, transparent 0 340px, #fff 820px)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；transparent（透明，非色值） |
| `.center` | `background` | `repeating-radial-gradient(circle at 1420px 960px,
          rgba(216,243,246,.07) 0 1.25px, rgba(216,243,246,0) 1.25px 11px)` | rgba(216,243,246,0.07) = line（+1 别名） @ 7%；rgba(216,243,246,0) = line（+1 别名） @ 0% |
| `.center` | `-webkit-mask-image` | `radial-gradient(circle at 1420px 960px,
          transparent 0 340px, #fff 400px, #fff 790px, transparent 880px)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；transparent（透明，非色值） |
| `.center` | `mask-image` | `radial-gradient(circle at 1420px 960px,
          transparent 0 340px, #fff 400px, #fff 790px, transparent 880px)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；transparent（透明，非色值） |
| `.light` | `background` | `radial-gradient(circle at 1420px 960px,
            rgba(210,240,246,0) 980px, rgba(210,240,246,.034) 1060px, rgba(210,240,246,0) 1140px),
          linear-gradient(101deg,
            rgba(206,238,245,0) 26%, rgba(206,238,245,.03) 40%, rgba(228,247,252,.058) 50%,
            rgba(206,238,245,.05) 53%, rgba(206,238,245,.012) 55%,
            rgba(206,238,245,.006) 62%, rgba(206,238,245,0) 74%)` | rgba(210,240,246,0) = 未收进契约（基色 #d2f0f6）；rgba(210,240,246,0.034) = 未收进契约（基色 #d2f0f6）；rgba(206,238,245,0) = 未收进契约（基色 #ceeef5）；rgba(206,238,245,0.03) = 未收进契约（基色 #ceeef5）；rgba(228,247,252,0.058) = water-deep @ 5.8%；rgba(206,238,245,0.05) = 未收进契约（基色 #ceeef5）；rgba(206,238,245,0.012) = 未收进契约（基色 #ceeef5）；rgba(206,238,245,0.006) = 未收进契约（基色 #ceeef5） |
| `.light` | `-webkit-mask-image` | `radial-gradient(circle at 1420px 960px, #fff 0 1258px, transparent 1300px)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；transparent（透明，非色值） |
| `.light` | `mask-image` | `radial-gradient(circle at 1420px 960px, #fff 0 1258px, transparent 1300px)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；transparent（透明，非色值） |
| `.sub` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.cat` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.note` | `color` | `rgba(243,249,250,.72)` | rgba(243,249,250,0.72) = paper（+1 别名） @ 72% |
| `.note b` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.rpm` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.port .r1` | `border` | `1.5px solid rgba(228,249,252,.42)` | rgba(228,249,252,0.42) = 未收进契约（基色 #e4f9fc） |
| `.port .r2` | `border` | `1px solid rgba(228,249,252,.2)` | rgba(228,249,252,0.2) = 未收进契约（基色 #e4f9fc） |
| `.port .r3` | `border` | `1px solid rgba(228,249,252,.1)` | rgba(228,249,252,0.1) = 未收进契约（基色 #e4f9fc） |
| `.port .core` | `color` | `#f3f9fa` | #f3f9fa = paper（+1 别名） |
| `.port .core` | `background` | `radial-gradient(76% 76% at 34% 26%, rgba(10,48,60,.5), rgba(3,17,23,.78))` | rgba(10,48,60,0.5) = water-bed（+1 别名） @ 50%；rgba(3,17,23,0.78) = water-void（+2 别名） @ 78% |
| `.port .core` | `text-shadow` | `0 1px 12px rgba(3,16,22,.95)` | rgba(3,16,22,0.95) = 未收进契约（基色 #031016） |
| `.draw .core` | `border` | `1px solid rgba(203,238,246,.7)` | rgba(203,238,246,0.7) = water-mid（+2 别名） @ 70% |
| `.draw .core` | `box-shadow` | `0 0 52px rgba(178,232,244,.3), inset 0 0 28px rgba(160,226,240,.2)` | rgba(178,232,244,0.3) = 未收进契约（基色 #b2e8f4）；rgba(160,226,240,0.2) = 未收进契约（基色 #a0e2f0） |
| `.cast .core` | `border` | `1px solid rgba(246,215,154,.66)` | rgba(246,215,154,0.66) = warm（+1 别名） @ 66% |
| `.cast .core` | `box-shadow` | `0 0 52px rgba(246,215,154,.26), inset 0 0 28px rgba(246,215,154,.16)` | rgba(246,215,154,0.26) = warm（+1 别名） @ 26%；rgba(246,215,154,0.16) = warm（+1 别名） @ 16% |
| `.port .cap` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.port .cap` | `text-shadow` | `0 1px 8px rgba(2,10,14,.95)` | rgba(2,10,14,0.95) = 未收进契约（基色 #020a0e） |
| `.port .cap b` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.tag` | `background` | `transparent` | transparent（透明，非色值） |
| `.tag` | `border` | `1px solid var(--line)` | --line ⇒ rgba(243,249,250,0.16) = paper（+1 别名） @ 16% |
| `.tag` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.tag[aria-pressed='true']` | `border-color` | `rgba(127,209,217,.6)` | rgba(127,209,217,0.6) = glass（+2 别名） @ 60% |
| `.tag[aria-pressed='true']` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `footer .go` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |

### 1.4 圆角
| 选择器 | border-radius | 用在哪 |
| --- | --- | --- |
| `.port i` | `50%` | `position:absolute; border-radius:50%; pointer-events:none` |
| `.port .core` | `50%` | `position:relative; width:100%; height:100%; border-radius:50%; display:grid; place-items:center; gap:3px; font` |

### 1.5 渐变（stop 串原样）
**CSS 渐变声明**：
- `.platter` · `background`：`radial-gradient(circle at 1420px 960px,
            rgba(2,9,13,0) 0 1276px, rgba(2,9,13,.52) 1285px, rgba(2,9,13,0) 1366px),
          rgba(127,209,217,.022)`
- `.body` · `background`：`radial-gradient(circle at 1420px 960px,
          rgba(127,209,217,.055) 0 1210px, rgba(127,209,217,0) 1330px)`
- `.field` · `-webkit-mask-image`：`radial-gradient(circle at 1420px 960px,
          transparent 0 930px, #fff 990px, #fff 1258px, transparent 1300px)`
- `.field` · `mask-image`：`radial-gradient(circle at 1420px 960px,
          transparent 0 930px, #fff 990px, #fff 1258px, transparent 1300px)`
- `.field i` · `background`：`repeating-radial-gradient(circle at 1420px 960px,
          rgba(214,241,247,.03) 0 1px, rgba(214,241,247,0) 1px 4.4px)`
- `.field i` · `-webkit-mask-image`：`radial-gradient(circle at 0 0, transparent 0 340px, #fff 820px)`
- `.field i` · `mask-image`：`radial-gradient(circle at 0 0, transparent 0 340px, #fff 820px)`
- `.center` · `background`：`repeating-radial-gradient(circle at 1420px 960px,
          rgba(216,243,246,.07) 0 1.25px, rgba(216,243,246,0) 1.25px 11px)`
- `.center` · `-webkit-mask-image`：`radial-gradient(circle at 1420px 960px,
          transparent 0 340px, #fff 400px, #fff 790px, transparent 880px)`
- `.center` · `mask-image`：`radial-gradient(circle at 1420px 960px,
          transparent 0 340px, #fff 400px, #fff 790px, transparent 880px)`
- `.light` · `background`：`radial-gradient(circle at 1420px 960px,
            rgba(210,240,246,0) 980px, rgba(210,240,246,.034) 1060px, rgba(210,240,246,0) 1140px),
          linear-gradient(101deg,
            rgba(206,238,245,0) 26%, rgba(206,238,245,.03) 40%, rgba(228,247,252,.058) 50%,
            rgba(206,238,245,.05) 53%, rgba(206,238,245,.012) 55%,
            rgba(206,238,245,.006) 62%, rgba(206,238,245,0) 74%)`
- `.light` · `-webkit-mask-image`：`radial-gradient(circle at 1420px 960px, #fff 0 1258px, transparent 1300px)`
- `.light` · `mask-image`：`radial-gradient(circle at 1420px 960px, #fff 0 1258px, transparent 1300px)`
- `.port .core` · `background`：`radial-gradient(76% 76% at 34% 26%, rgba(10,48,60,.5), rgba(3,17,23,.78))`
**SVG `<defs>` 里的渐变（svg[1]，非 CSS 写法，stop 原样）**：
- `<radialGradient#sheen> id="sheen" cx=".99" cy="1" r=".42" · stops: `offset="0" stop-color="#7fd1d9" stop-opacity=".06"` / `offset=".4" stop-color="#7fd1d9" stop-opacity="0"``
- `<radialGradient#label> id="label" cx=".5" cy=".5" r=".5" · stops: `offset="0" stop-color="#c7452c" stop-opacity=".19"` / `offset=".97" stop-color="#c7452c" stop-opacity=".19"` / `offset="1" stop-color="#c7452c" stop-opacity="0"``
- `<linearGradient#rim> id="rim" gradientUnits="userSpaceOnUse" x1="0" y1="800" x2="0" y2="330" · stops: `offset="0" stop-color="#e6f8fb" stop-opacity=".5"` / `offset=".5" stop-color="#e6f8fb" stop-opacity=".17"` / `offset="1" stop-color="#e6f8fb" stop-opacity="0"``

### 1.6 主块几何（`.clip` / `.page` 下顶层绝对定位块）
- 容器：本页**没有** `.clip` / `.page` 容器，顶层块直接挂在 `body` 下（下表宿主写 `body`）。
| 宿主 | 块 | 定位 | width | height | transform | z-index |
| --- | --- | --- | --- | --- | --- | --- |
| `body`（本页无 `.clip` / `.page`） | `div.platter` | `position:absolute; inset:0` | — | — | — | — |
| `body`（本页无 `.clip` / `.page`） | `div.body` | `position:absolute; inset:0` | — | — | — | — |
| `body`（本页无 `.clip` / `.page`） | `div.center` | `position:absolute; inset:0` | — | — | — | — |
| `body`（本页无 `.clip` / `.page`） | `div.field` | `position:absolute; inset:0` | — | — | — | — |
| `body`（本页无 `.clip` / `.page`） | `div.light` | `position:absolute; inset:0` | — | — | — | — |
| `body`（本页无 `.clip` / `.page`） | `svg.canvas` | `position:absolute; inset:0` | 1440px | 900px | — | — |
| `body`（本页无 `.clip` / `.page`） | `div.ov` | `position:absolute; left:76px; top:96px` | 520px | — | — | — |
| `body`（本页无 `.clip` / `.page`） | `div.ov` | `position:absolute; left:1150px; top:112px` | 266px | — | — | — |
| `body`（本页无 `.clip` / `.page`） | `div.port` | `position:absolute; left:60px; top:400px` | 190px | 190px | — | 3 |
| `body`（本页无 `.clip` / `.page`） | `div.port` | `position:absolute; left:380px; top:580px` | 150px | 150px | — | 3 |
| `body`（本页无 `.clip` / `.page`） | `footer` | `position:absolute; left:76px; right:76px; bottom:30px` | — | — | — | 5 |
- 更深处（不在上表里）的绝对定位块共 **9** 个：
  - `html › body › div.field › i`：`position:absolute; inset:0`
  - `html › body › div.port › i.r1`：`position:absolute; inset:-13px`
  - `html › body › div.port › i.r2`：`position:absolute; inset:-29px`
  - `html › body › div.port › i.r3`：`position:absolute; inset:-45px`
  - `html › body › div.port › span.cap`：`position:absolute; left:230px; top:40px; width:240px`
  - `html › body › div.port › i.r1`：`position:absolute; inset:-13px`
  - `html › body › div.port › i.r2`：`position:absolute; inset:-29px`
  - `html › body › div.port › i.r3`：`position:absolute; inset:-45px`
  - `html › body › div.port › span.cap`：`position:absolute; left:-180px; top:165px; width:300px`

### 1.7 SVG / 图形
- **svg[1]** `svg.canvas` viewBox=`0 0 1440 900` width=1440px height=900px
  - `svg.canvas › rect`：`width="1440"` `height="900"` `fill="url(#sheen)"`
  - `svg.canvas › circle`：`cx="1420"` `cy="960"` `r="268"` `fill="url(#label)"`
  - `svg.canvas › circle`：`cx="1420"` `cy="960"` `r="262"` `fill="none"` `stroke="rgba(199,69,44,.52)"` `stroke-width="1.6"` · stroke="rgba(199,69,44,.52)" = 未收进契约（基色 #c7452c）
  - `svg.canvas › circle`：`cx="1420"` `cy="960"` `r="275"` `fill="none"` `stroke="rgba(243,249,250,.2)"` `stroke-width="1"` · stroke="rgba(243,249,250,.2)" = paper（+1 别名） @ 20%
  - `svg.canvas › circle`：`cx="1420"` `cy="960"` `r="336"` `fill="none"` `stroke="rgba(214,241,247,.13)"` `stroke-width="1"` · stroke="rgba(214,241,247,.13)" = 未收进契约（基色 #d6f1f7）
  - `svg.canvas › circle`：`cx="1420"` `cy="960"` `r="1276"` `fill="none"` `stroke="url(#rim)"` `stroke-width="2"`
  - `svg.canvas › circle`：`cx="1420"` `cy="960"` `r="1268"` `fill="none"` `stroke="rgba(214,241,247,.14)"` `stroke-width="1"` · stroke="rgba(214,241,247,.14)" = 未收进契约（基色 #d6f1f7）
  - `svg.canvas › circle`：`cx="1420"` `cy="960"` `r="900"` `fill="none"` `stroke="rgba(42,157,177,.2)"` `stroke-width="26"` · stroke="rgba(42,157,177,.2)" = 未收进契约（基色 #2a9db1）
  - `svg.canvas › circle`：`cx="1420"` `cy="960"` `r="900"` `fill="none"` `stroke="rgba(159,230,237,.42)"` `stroke-width="7"` · stroke="rgba(159,230,237,.42)" = 未收进契约（基色 #9fe6ed）
  - `svg.canvas › circle`：`cx="1420"` `cy="960"` `r="887"` `fill="none"` `stroke="rgba(216,243,246,.5)"` `stroke-width="1.4"` · stroke="rgba(216,243,246,.5)" = line（+1 别名） @ 50%
  - `svg.canvas › circle`：`cx="1420"` `cy="960"` `r="913"` `fill="none"` `stroke="rgba(216,243,246,.44)"` `stroke-width="1.4"` · stroke="rgba(216,243,246,.44)" = line（+1 别名） @ 44%
  - `svg.canvas › circle`：`cx="1420"` `cy="960"` `r="900"` `fill="none"` `stroke="rgba(243,249,250,.42)"` `stroke-width="2"` `stroke-dasharray="16 30"` `stroke-linecap="round"` · stroke="rgba(243,249,250,.42)" = paper（+1 别名） @ 42%
  - `svg.canvas › circle`：`cx="1420"` `cy="960"` `r="906"` `fill="none"` `stroke="rgba(243,249,250,.2)"` `stroke-width="1.6"` `stroke-dasharray="10 40"` `stroke-linecap="round"` · stroke="rgba(243,249,250,.2)" = paper（+1 别名） @ 20%
  - `svg.canvas › g`：`fill="none"` `stroke="#e6f7fb"` `stroke-linecap="butt"` · 色：#e6f7fb = 未收进契约
  - `svg.canvas › g › circle`：`cx="1420"` `cy="960"` `r="1180"` `stroke-opacity=".17"` `stroke-width="1.1"` `stroke-dasharray="126 9999"` `stroke-dashoffset="-4120"`
  - `svg.canvas › g › circle`：`cx="1420"` `cy="960"` `r="1214"` `stroke-opacity=".12"` `stroke-width="1"` `stroke-dasharray="92 9999"` `stroke-dashoffset="-4460"`
  - `svg.canvas › g › circle`：`cx="1420"` `cy="960"` `r="1128"` `stroke-opacity=".14"` `stroke-width="1.2"` `stroke-dasharray="158 9999"` `stroke-dashoffset="-3700"`
  - `svg.canvas › g › circle`：`cx="1420"` `cy="960"` `r="1246"` `stroke-opacity=".1"` `stroke-width="1"` `stroke-dasharray="70 9999"` `stroke-dashoffset="-4830"`
  - `svg.canvas › g`：`fill="#eafcff"` · 色：#eafcff = water-light（+1 别名）
  - `svg.canvas › g › circle`：`cx="556"` `cy="700"` `r="1.5"` `opacity=".26"`
  - `svg.canvas › g › circle`：`cx="578"` `cy="712"` `r="1.1"` `opacity=".2"`
  - `svg.canvas › g › circle`：`cx="540"` `cy="716"` `r="1.2"` `opacity=".22"`
  - `svg.canvas › g › circle`：`cx="592"` `cy="698"` `r="1"` `opacity=".16"`
  - `svg.canvas › g`：`opacity=".8"`
  - `svg.canvas › g › path`：`d="M1296 700 Q 1366 640 1442 674"` `fill="none"` `stroke="rgba(199,69,44,.55)"` `stroke-width="2"` `stroke-linecap="round"` · stroke="rgba(199,69,44,.55)" = 未收进契约（基色 #c7452c）
  - `svg.canvas › g › path`：`d="M1442 674 l -6 -15 l -15 6"` `fill="none"` `stroke="rgba(199,69,44,.55)"` `stroke-width="2"` `stroke-linecap="round"` · stroke="rgba(199,69,44,.55)" = 未收进契约（基色 #c7452c）
  - `svg.canvas › g › text`：`x="1146"` `y="712"` `fill="rgba(199,69,44,.62)"` `font-family="ui-monospace, Consolas, monospace"` `font-size="10"` `letter-spacing="1.6"` · fill="rgba(199,69,44,.62)" = 未收进契约（基色 #c7452c） · text="顺槽 · 33⅓"

- **全页 transform（含 rotate 角度）**：
  - （本页未用）

### 1.8 文案（逐字，文档顺序；`⟨br⟩` = 源码 `<br />`）
001. `body › svg.canvas › g › text` → "顺槽 · 33⅓"
002. `html › body › div.ov › div.cat` → "音乐共创 · 匿名接力 · 0001"
003. `html › body › div.ov › h1` → "暖流河道"
004. `html › body › div.ov › p.sub` → "一条沟槽就是一条河。⟨br⟩唱一段，让它顺水去找下一个陌生人。"
005. `html › body › div.ov › div.rpm` → "33⅓"
006. `html › body › div.ov › div.cat` → "RPM · 匿名接力"
007. `html › body › div.ov › div.cat` → "唱一段，投进河里，让陌生人接棒⟨br⟩四段齐了入海，成为公共作品"
008. `html › body › div.port › span.core` → "捞取"
009. `body › div.port › span.core › span` → "DRAW"
010. `body › div.port › span.cap › b` → "捞一个漂流瓶"
011. `html › body › div.port › span.cap` → "捞到别人的半句，接下一句。捞到即持有：同一时刻只有你拿着它。"
012. `html › body › div.port › span.core` → "投下"
013. `body › div.port › span.core › span` → "CAST"
014. `body › div.port › span.cap › b` → "投下一支漂流瓶"
015. `html › body › div.port › span.cap` → "选一首歌，录下第 1 段，投进河道，等一个陌生人接棒。"
016. `html › body › footer › button.tag` → "全部"
017. `html › body › footer › button.tag` → "深夜"
018. `html › body › footer › button.tag` → "通勤"
019. `html › body › footer › button.tag` → "告白"
020. `html › body › footer › button.tag` → "雨天"
021. `html › body › footer › a.go` → "先去公海听听已经完成的作品"

### 1.9 本页的「装置」
> 被点亮的沟槽＝河道本体；两个错落圆泊位＝待捞的瓶位


## 2. 选一首歌 · `p-songpicker-record.html` → `/new`
- **它是什么**：新建瓶子的第一步：从曲库选一首歌，并看它被切成了几段
- **画布**：`html,body` = 1440×900（`overflow:hidden`）；页面底色 `--ink`

### 2.2 排版（选择器 → 值）
| 选择器 | font-size | letter-spacing | line-height | font-weight |
| --- | --- | --- | --- | --- |
| `.cat` | 11px | .24em | — | — |
| `h1` | 56px | — | 1 | 700 |
| `.sub` | 15.5px | — | 1.75 | — |
| `.n` | 26px | — | 1 | — |
| `.tab` | — | — | 16px | — |
| `input` | 15px | — | — | — |
| `.st` | 12.5px | — | 1.6 | — |
| `.song` | 17px | — | 1.2 | 700 |
| `.meta` | 11.5px | — | — | — |
| `.act` | 12.5px | — | — | — |
| `.note` | 12.5px | — | 1.5 | — |
| `.foot` | 12.5px | — | — | — |

### 2.3 颜色（选择器 → 值 · 契约状态）
| 选择器 | 属性 | 声明原文 | 解析（hex/rgba → 契约 token） |
| --- | --- | --- | --- |
| `:root` | `--ink` | `#050f14` | #050f14 = ink（+1 别名） |
| `:root` | `--paper` | `#f3f9fa` | #f3f9fa = paper（+1 别名） |
| `:root` | `--muted` | `#a9c7cf` | #a9c7cf = muted（+3 别名） |
| `:root` | `--glass` | `#7fd1d9` | #7fd1d9 = glass（+2 别名） |
| `:root` | `--coral` | `#d4553a` | #d4553a = coral（+3 别名） |
| `:root` | `--warm` | `#f6d79a` | #f6d79a = warm（+1 别名） |
| `:root` | `--line` | `rgba(243,249,250,.13)` | rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `body` | `background` | `var(--ink)` | --ink ⇒ #050f14 = ink（+1 别名） |
| `body` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.cat` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.platter` | `background` | `repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)` | rgba(216,243,246,0.055) = line（+1 别名） @ 5.5%；rgba(127,209,217,0.05) = glass（+2 别名） @ 5%；transparent（透明，非色值） |
| `.glint` | `background` | `linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)` | rgba(228,247,252,0.045) = water-deep @ 4.5%；rgba(228,247,252,0.065) = water-deep @ 6.5%；rgba(228,247,252,0.028) = water-deep @ 2.8%；transparent（透明，非色值） |
| `.deep` | `background` | `linear-gradient(180deg, rgba(3,17,23,0) 0%, rgba(3,17,23,.3) 70%, rgba(3,17,23,.52) 100%)` | rgba(3,17,23,0) = water-void（+2 别名） @ 0%；rgba(3,17,23,0.3) = water-void（+2 别名） @ 30%；rgba(3,17,23,0.52) = water-void（+2 别名） @ 52% |
| `.sub` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.n` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.plate` | `border` | `1px solid var(--line)` | --line ⇒ rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `.plate` | `background` | `rgba(243,249,250,.035)` | rgba(243,249,250,0.035) = paper（+1 别名） @ 3.5% |
| `.tab` | `border` | `1px solid var(--line)` | --line ⇒ rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `.tab` | `background` | `rgba(243,249,250,.07)` | rgba(243,249,250,0.07) = paper（+1 别名） @ 7% |
| `input` | `border-bottom` | `1px solid rgba(243,249,250,.24)` | rgba(243,249,250,0.24) = paper（+1 别名） @ 24% |
| `input` | `background` | `transparent` | transparent（透明，非色值） |
| `input` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `input::placeholder` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `input:focus` | `border-bottom-color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.states` | `border` | `1px dashed rgba(243,249,250,.16)` | rgba(243,249,250,0.16) = paper（+1 别名） @ 16% |
| `.st` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.slot` | `background-image` | `linear-gradient(180deg, rgba(243,249,250,.11), rgba(243,249,250,0) 76%),
          linear-gradient(180deg, rgba(243,249,250,.11), rgba(243,249,250,0) 76%),
          linear-gradient(180deg, rgba(243,249,250,.045), rgba(3,17,23,0) 86%)` | rgba(243,249,250,0.11) = paper（+1 别名） @ 11%；rgba(243,249,250,0) = paper（+1 别名） @ 0%；rgba(243,249,250,0.045) = paper（+1 别名） @ 4.5%；rgba(3,17,23,0) = water-void（+2 别名） @ 0% |
| `.edge` | `background` | `linear-gradient(90deg, rgba(243,249,250,.34), rgba(243,249,250,.05)) 0 0 / 100% 1px no-repeat,
          linear-gradient(180deg, rgba(243,249,250,.075), rgba(243,249,250,0))` | rgba(243,249,250,0.34) = paper（+1 别名） @ 34%；rgba(243,249,250,0.05) = paper（+1 别名） @ 5%；rgba(243,249,250,0.075) = paper（+1 别名） @ 7.5%；rgba(243,249,250,0) = paper（+1 别名） @ 0% |
| `.meta` | `color` | `rgba(169,199,207,.92)` | rgba(169,199,207,0.92) = muted（+3 别名） @ 92% |
| `.sep` | `background` | `rgba(243,249,250,.18)` | rgba(243,249,250,0.18) = paper（+1 别名） @ 18% |
| `.act` | `border` | `1px solid rgba(243,249,250,.24)` | rgba(243,249,250,0.24) = paper（+1 别名） @ 24% |
| `.act` | `background` | `rgba(243,249,250,.03)` | rgba(243,249,250,0.03) = paper（+1 别名） @ 3% |
| `.act` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.act[disabled]` | `border-color` | `rgba(243,249,250,.14)` | rgba(243,249,250,0.14) = paper（+1 别名） @ 14% |
| `.act[disabled]` | `color` | `rgba(169,199,207,.7)` | rgba(169,199,207,0.7) = muted（+3 别名） @ 70% |
| `.bay:hover .act:not([disabled])` | `border-color` | `rgba(127,209,217,.55)` | rgba(127,209,217,0.55) = glass（+2 别名） @ 55% |
| `.bay:hover .act:not([disabled])` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.note` | `color` | `var(--warm)` | --warm ⇒ #f6d79a = warm（+1 别名） |
| `.foot` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |

### 2.4 圆角
| 选择器 | border-radius | 用在哪 |
| --- | --- | --- |
| `.plate` | `2px` | `position:absolute; left:76px; top:236px; width:844px; height:44px; z-index:2; display:flex; align-items:center` |
| `.tab` | `2px 2px 0 0` | `position:absolute; left:18px; top:-16px; height:17px; padding:0 12px; line-height:16px; border:1px solid var(-` |
| `.states` | `2px` | `position:absolute; left:76px; top:292px; width:844px; z-index:2; padding:9px 14px; border:1px dashed rgba(243,` |
| `.act` | `2px` | `position:absolute; left:12px; top:84px; display:inline-flex; align-items:center; gap:7px; height:32px; padding` |
- SVG 的 `rx`/`ry`：`svg[1] svg.art › g › g › ellipse rx="72"`、`svg[1] svg.art › g › g › ellipse ry="30"`、`svg[1] svg.art › g › g › ellipse rx="113"`、`svg[1] svg.art › g › g › ellipse ry="84.8"`

### 2.5 渐变（stop 串原样）
**CSS 渐变声明**：
- `.platter` · `background`：`repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)`
- `.glint` · `background`：`linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)`
- `.deep` · `background`：`linear-gradient(180deg, rgba(3,17,23,0) 0%, rgba(3,17,23,.3) 70%, rgba(3,17,23,.52) 100%)`
- `.slot` · `background-image`：`linear-gradient(180deg, rgba(243,249,250,.11), rgba(243,249,250,0) 76%),
          linear-gradient(180deg, rgba(243,249,250,.11), rgba(243,249,250,0) 76%),
          linear-gradient(180deg, rgba(243,249,250,.045), rgba(3,17,23,0) 86%)`
- `.edge` · `background`：`linear-gradient(90deg, rgba(243,249,250,.34), rgba(243,249,250,.05)) 0 0 / 100% 1px no-repeat,
          linear-gradient(180deg, rgba(243,249,250,.075), rgba(243,249,250,0))`
**SVG `<defs>` 里的渐变（svg[1]，非 CSS 写法，stop 原样）**：
- `<radialGradient#lacquer> id="lacquer" cx="34%" cy="26%" r="76%" · stops: `offset="0" stop-color="#0a303c" stop-opacity=".6"` / `offset="1" stop-color="#031117" stop-opacity=".84"``
- `<radialGradient#blank> id="blank" cx="36%" cy="28%" r="76%" · stops: `offset="0" stop-color="#16404d" stop-opacity=".56"` / `offset="1" stop-color="#031117" stop-opacity=".8"``
- `<linearGradient#wallOut> id="wallOut" x1="0" y1="0" x2="1" y2="0" · stops: `offset="0" stop-color="#031117" stop-opacity=".46"` / `offset=".17" stop-color="#cbeef6" stop-opacity=".11"` / `offset=".46" stop-color="#cbeef6" stop-opacity=".19"` / `offset=".78" stop-color="#7fd1d9" stop-opacity=".06"` / `offset="1" stop-color="#031117" stop-opacity=".46"``
- `<linearGradient#rimTop> id="rimTop" x1="0" y1="0" x2="0" y2="1" · stops: `offset="0" stop-color="#dff3f7" stop-opacity=".14"` / `offset="1" stop-color="#7fd1d9" stop-opacity=".06"``
- `<linearGradient#dishInner> id="dishInner" x1="0" y1="0" x2="0" y2="1" · stops: `offset="0" stop-color="#031117" stop-opacity=".68"` / `offset=".55" stop-color="#08222b" stop-opacity=".5"` / `offset="1" stop-color="#0f4251" stop-opacity=".38"``
- `<radialGradient#dishFloor> id="dishFloor" cx="46%" cy="38%" r="78%" · stops: `offset="0" stop-color="#0f4251" stop-opacity=".48"` / `offset="1" stop-color="#031117" stop-opacity=".7"``
- `<radialGradient#dryLight> id="dryLight" cx="46%" cy="40%" r="66%" · stops: `offset="0" stop-color="#cbeef6" stop-opacity=".11"` / `offset="1" stop-color="#cbeef6" stop-opacity="0"``
- `<linearGradient#waterBody> id="waterBody" x1="0" y1="-74" x2="0" y2="160" gradientUnits="userSpaceOnUse" · stops: `offset="0" stop-color="#a8e4ec" stop-opacity=".24"` / `offset=".2" stop-color="#7fd1d9" stop-opacity=".2"` / `offset=".6" stop-color="#1d5f70" stop-opacity=".25"` / `offset="1" stop-color="#0a3a48" stop-opacity=".36"``

### 2.6 主块几何（`.clip` / `.page` 下顶层绝对定位块）
- 容器：`.clip`：box-sizing:border-box; margin:0; padding:0; position:absolute; inset:0; overflow:hidden
| 宿主 | 块 | 定位 | width | height | transform | z-index |
| --- | --- | --- | --- | --- | --- | --- |
| .clip | `div.platter` | `position:absolute; inset:0` | — | — | — | — |
| .clip | `svg.art` | `position:absolute; inset:0` | 1440 | 900 | — | — |
| .clip | `div.deep` | `position:absolute; left:0; right:0; bottom:0` | — | 200px | — | — |
| .clip | `div.glint` | `position:absolute; inset:0` | — | — | — | — |
- 更深处（不在上表里）的绝对定位块共 **44** 个：
  - `html › body › div.clip`：`position:absolute; inset:0`
  - `html › body › header`：`position:absolute; left:76px; top:56px`
  - `html › body › div.tally`：`position:absolute; right:76px; top:56px`
  - `html › body › div.plate`：`position:absolute; left:76px; top:236px; width:844px; height:44px`
  - `html › body › div.plate › span.tab`：`position:absolute; left:18px; top:-16px; height:17px`
  - `html › body › div.states`：`position:absolute; left:76px; top:292px; width:844px`
  - `html › body › ul.rack`：`position:absolute; inset:0`
  - `html › body › ul.rack › li.bay`：`position:absolute; left:76px; top:366px; width:246px; height:430px`
  - `html › body › ul.rack › li.bay › span.slot`：`position:absolute; left:0; top:0; width:100%; height:100%`
  - `html › body › ul.rack › li.bay › span.edge`：`position:absolute; left:0; top:0; width:100%; height:58px`
  - `html › body › ul.rack › li.bay › p.song`：`position:absolute; left:12px; top:11px`
  - `html › body › ul.rack › li.bay › p.meta`：`position:absolute; left:12px; top:38px`
  - …（其余 32 个同为装置内的分件，规则同上：`position:absolute` + 锚点）

### 2.7 SVG / 图形
- **svg[1]** `svg.art` viewBox=`0 0 1440 900` width=1440 height=900
  - `svg.art › g`：`transform="translate(199 640)"`
  - `svg.art › g › use`：`href="#dish"`
  - `svg.art › g › g`：`clip-path="url(#mouth)"`
  - `svg.art › g › g › g`：`transform="translate(0 29)"`
  - `svg.art › g › g › g › use`：`href="#master"`
  - `svg.art › g › g › g`：`transform="translate(0 33)"` `opacity=".5"`
  - `svg.art › g › g › g › use`：`href="#rings"`
  - `svg.art › g › g › use`：`href="#pool"`
  - `svg.art › g › g › g`：`transform="translate(0 29)"`
  - `svg.art › g › g › g › use`：`href="#rings"`
  - `svg.art › g › g › g › use`：`href="#seg1"`
  - `svg.art › g`：`transform="translate(459.5 651)"`
  - `svg.art › g › use`：`href="#dish"`
  - `svg.art › g › g`：`clip-path="url(#mouth)"`
  - `svg.art › g › g › ellipse`：`cy="26"` `rx="72"` `ry="30"` `fill="url(#dryLight)"`
  - `svg.art › g › g › ellipse`：`cy="20"` `rx="113"` `ry="84.8"` `fill="none"` `stroke="rgba(228,247,252,.22)"` `stroke-dasharray="3 7"` · stroke="rgba(228,247,252,.22)" = water-deep @ 22%
  - `svg.art › g › g › g`：`transform="translate(0 29)"`
  - `svg.art › g › g › g › use`：`href="#masterBlank"`
  - `svg.art › g`：`transform="translate(720 637)"`
  - `svg.art › g › use`：`href="#dish"`
  - `svg.art › g › g`：`clip-path="url(#mouth)"`
  - `svg.art › g › g › g`：`transform="translate(0 29)"`
  - `svg.art › g › g › g › use`：`href="#master"`
  - `svg.art › g › g › g`：`transform="translate(0 33)"` `opacity=".5"`
  - `svg.art › g › g › g › use`：`href="#rings"`
  - `svg.art › g › g › use`：`href="#pool"`
  - `svg.art › g › g › g`：`transform="translate(0 29)"`
  - `svg.art › g › g › g › use`：`href="#rings"`
  - `svg.art › g › g › g › use`：`href="#seg1"`
  - `svg.art › g`：`transform="translate(980.5 654)"`
  - `svg.art › g › use`：`href="#dish"`
  - `svg.art › g › g`：`clip-path="url(#mouth)"`
  - `svg.art › g › g › g`：`transform="translate(0 29)"`
  - `svg.art › g › g › g › use`：`href="#master"`
  - `svg.art › g › g › g`：`transform="translate(0 33)"` `opacity=".5"`
  - `svg.art › g › g › g › use`：`href="#rings"`
  - `svg.art › g › g › use`：`href="#pool"`
  - `svg.art › g › g › g`：`transform="translate(0 29)"`
  - `svg.art › g › g › g › use`：`href="#rings"`
  - `svg.art › g › g › g › use`：`href="#seg1"`
  - `svg.art › g`：`transform="translate(1241 645)"`
  - `svg.art › g › use`：`href="#dish"`
  - `svg.art › g › g`：`clip-path="url(#mouth)"`
  - `svg.art › g › g › g`：`transform="translate(0 29)"`
  - `svg.art › g › g › g › use`：`href="#master"`
  - `svg.art › g › g › g`：`transform="translate(0 33)"` `opacity=".5"`
  - `svg.art › g › g › g › use`：`href="#rings"`
  - `svg.art › g › g › use`：`href="#pool"`
  - `svg.art › g › g › g`：`transform="translate(0 29)"`
  - `svg.art › g › g › g › use`：`href="#rings"`
  - `svg.art › g › g › g › use`：`href="#seg1"`
- **svg[2]** `svg` viewBox=`0 0 24 24` width=14 height=14
  - `svg › path`：`d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"`
  - `svg › path`：`d="M19 10v2a7 7 0 0 1-14 0v-2"`
  - `svg › path`：`d="M12 19v3"`
- **svg[3]** `svg` viewBox=`0 0 24 24` width=14 height=14
  - `svg › path`：`d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"`
  - `svg › path`：`d="M19 10v2a7 7 0 0 1-14 0v-2"`
  - `svg › path`：`d="M12 19v3"`
- **svg[4]** `svg` viewBox=`0 0 24 24` width=14 height=14
  - `svg › path`：`d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"`
  - `svg › path`：`d="M19 10v2a7 7 0 0 1-14 0v-2"`
  - `svg › path`：`d="M12 19v3"`
- **svg[5]** `svg` viewBox=`0 0 24 24` width=14 height=14
  - `svg › path`：`d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"`
  - `svg › path`：`d="M19 10v2a7 7 0 0 1-14 0v-2"`
  - `svg › path`：`d="M12 19v3"`

- **全页 transform（含 rotate 角度）**：
  - （本页未用）

### 2.8 文案（逐字，文档顺序；`⟨br⟩` = 源码 `<br />`）
001. `html › body › header › p.cat` → "SIDE A · 未刻"
002. `html › body › header › h1` → "选一首歌，投出第一棒"
003. `html › body › header › p.sub` → "这里每首歌都被切成固定段位（同一位置永远属于同一段，斩浪也不会把后面的段前移）。你录第 1 段，之后交给河道里的陌生人。"
004. `body › div.tally › div › span.n` → "4"
005. `body › div.tally › div › span.cat` → "已切分"
006. `body › div.tally › div › span.n` → "1"
007. `body › div.tally › div › span.cat` → "未切分"
008. `html › body › div.plate › span.tab` → "找 歌"
009. `#root › html › body › div.plate › input` → "placeholder="按曲名过滤""
010. `html › body › div.plate › span.count` → "曲库共 5 首"
011. `body › div.states › p.st › span.cat` → "无匹配"
012. `body › div.states › p.st › span` → "曲库里没有名字含「蓝」的歌，换个词试试。"
013. `body › div.states › p.st › span.cat` → "空 态"
014. `body › div.states › p.st › span` → "曲库还没准备好——这一版还没有可选的歌。曲库接入后，这里会出现可以分成 4 段的曲目。"
015. `body › ul.rack › li.bay › p.song` → "占位曲目 · 一"
016. `body › ul.rack › li.bay › p.meta` → "4 段 每段约 24 秒"
017. `body › ul.rack › li.bay › p.meta` → "来源 incompetech-cc-by-4.0"
018. `body › ul.rack › li.bay › button.act` → "选这首，录第 1 段"
019. `body › ul.rack › li.bay › p.song` → "占位曲目 · 二"
020. `body › ul.rack › li.bay › p.meta` → "4 段"
021. `body › ul.rack › li.bay › p.meta` → "来源 incompetech-cc-by-4.0"
022. `body › ul.rack › li.bay › button.act` → "暂不可发起"
023. `body › ul.rack › li.bay › p.note` → "这首还没有切分，暂不能发起"
024. `body › ul.rack › li.bay › p.song` → "占位曲目 · 三"
025. `body › ul.rack › li.bay › p.meta` → "4 段 每段约 18 秒"
026. `body › ul.rack › li.bay › p.meta` → "来源 incompetech-cc-by-4.0"
027. `body › ul.rack › li.bay › button.act` → "选这首，录第 1 段"
028. `body › ul.rack › li.bay › p.song` → "占位曲目 · 四"
029. `body › ul.rack › li.bay › p.meta` → "4 段 每段约 27 秒"
030. `body › ul.rack › li.bay › p.meta` → "来源 incompetech-cc-by-4.0"
031. `body › ul.rack › li.bay › button.act` → "选这首，录第 1 段"
032. `body › ul.rack › li.bay › p.song` → "夜航"
033. `body › ul.rack › li.bay › p.meta` → "4 段 每段约 21 秒"
034. `body › ul.rack › li.bay › p.meta` → "来源 incompetech-cc-by-4.0"
035. `body › ul.rack › li.bay › button.act` → "选这首，录第 1 段"
036. `html › body › footer › p.foot` → "发起之后你会拿到这支瓶子的匿名代号；别人看到的是代号，不是你的账号。"

### 2.9 本页的「装置」
> 五口独立浅盆：盆内水位＝这首已切好的段位；干盆＝「还没有切分」


## 3. 瓶子详情（录制／试听／去向） · `p-bottle-record.html` → `/bottles/:id`
- **它是什么**：瓶子的操作页：录制、试听、4 段链、三选一去向
- **画布**：`html,body` = 1440×900（`overflow:hidden`）；页面底色 `--ink`

### 3.2 排版（选择器 → 值）
| 选择器 | font-size | letter-spacing | line-height | font-weight |
| --- | --- | --- | --- | --- |
| `.back` | 14px | — | — | — |
| `.pill` | 12.5px | .08em | — | — |
| `h1` | 56px | — | 1 | 700 |
| `.work` | 19px | — | — | 700 |
| `.metaRow` | 14px | — | — | — |
| `.note` | 14.5px | — | 1.6 | — |
| `.maker .k` | 11px | .24em | — | — |
| `.maker .v` | 14.5px | — | — | — |
| `.heroLab` | 11px | .18em | — | — |
| `.segNum` | 28px | — | — | — |
| `.segLab` | 11px | .24em | — | — |
| `.cap .code` | 14.5px | — | — | — |
| `.cap .line` | 12.5px | — | — | — |
| `.cap .listen` | 13px | — | — | — |
| `.gapKind` | 11px | .24em | — | — |
| `.gapHead` | 13.5px | — | — | — |
| `.cta` | 15px | — | — | — |
| `.gapNote` | 11px | — | 1.5 | — |
| `.callout` | 11px | .18em | — | — |
| `.corkLab` | 11px | .12em | — | — |
| `.col h2` | 17px | — | — | 700 |
| `.col h2 span` | 13.5px | — | — | 400 |
| `.destCol .sub` | 12.5px | — | — | — |
| `.voteBtn` | 14px | — | — | — |
| `.voteBtn .n` | 13px | — | — | — |
| `.votesNote` | 12.5px | — | — | — |
| `.ghost` | 14px | — | — | — |
| `.putBack span` | 12.5px | — | — | — |
| `.destRow .t` | 16px | — | — | 700 |
| `.destRow .d` | 12.5px | — | 1.4 | — |
| `.bottom` | 13px | — | — | — |

### 3.3 颜色（选择器 → 值 · 契约状态）
| 选择器 | 属性 | 声明原文 | 解析（hex/rgba → 契约 token） |
| --- | --- | --- | --- |
| `:root` | `--ink` | `#050f14` | #050f14 = ink（+1 别名） |
| `:root` | `--paper` | `#f3f9fa` | #f3f9fa = paper（+1 别名） |
| `:root` | `--muted` | `#a9c7cf` | #a9c7cf = muted（+3 别名） |
| `:root` | `--glass` | `#7fd1d9` | #7fd1d9 = glass（+2 别名） |
| `:root` | `--coral` | `#d4553a` | #d4553a = coral（+3 别名） |
| `:root` | `--warm` | `#f6d79a` | #f6d79a = warm（+1 别名） |
| `:root` | `--line` | `rgba(243,249,250,.13)` | rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `body` | `background` | `var(--ink)` | --ink ⇒ #050f14 = ink（+1 别名） |
| `body` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.platter` | `background` | `repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.02) 0 1.2px, rgba(216,243,246,0) 1.2px 15px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, rgba(127,209,217,0) 68%)` | rgba(216,243,246,0.02) = line（+1 别名） @ 2%；rgba(216,243,246,0) = line（+1 别名） @ 0%；rgba(127,209,217,0.05) = glass（+2 别名） @ 5%；rgba(127,209,217,0) = glass（+2 别名） @ 0% |
| `.air` | `background` | `radial-gradient(46% 62% at 16% 6%, rgba(203,238,246,.115), rgba(203,238,246,0) 70%),
          radial-gradient(70% 50% at 78% 0%, rgba(127,209,217,.075), rgba(127,209,217,0) 72%)` | rgba(203,238,246,0.115) = water-mid（+2 别名） @ 11.5%；rgba(203,238,246,0) = water-mid（+2 别名） @ 0%；rgba(127,209,217,0.075) = glass（+2 别名） @ 7.5%；rgba(127,209,217,0) = glass（+2 别名） @ 0% |
| `.deep` | `background` | `linear-gradient(180deg, rgba(127,209,217,.09) 0%, rgba(10,48,60,.34) 34%, rgba(5,15,20,.72) 100%)` | rgba(127,209,217,0.09) = glass（+2 别名） @ 9%；rgba(10,48,60,0.34) = water-bed（+1 别名） @ 34%；rgba(5,15,20,0.72) = ink（+1 别名） @ 72% |
| `.current` | `background` | `repeating-linear-gradient(180deg, rgba(216,243,246,.05) 0 1px, rgba(216,243,246,0) 1px 42px),
          linear-gradient(94deg, rgba(228,247,252,0) 40%, rgba(228,247,252,.035) 52%, rgba(228,247,252,0) 62%)` | rgba(216,243,246,0.05) = line（+1 别名） @ 5%；rgba(216,243,246,0) = line（+1 别名） @ 0%；rgba(228,247,252,0) = water-deep @ 0%；rgba(228,247,252,0.035) = water-deep @ 3.5% |
| `.glint` | `background` | `linear-gradient(101deg, rgba(228,247,252,0) 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, rgba(228,247,252,0) 72%)` | rgba(228,247,252,0) = water-deep @ 0%；rgba(228,247,252,0.045) = water-deep @ 4.5%；rgba(228,247,252,0.065) = water-deep @ 6.5%；rgba(228,247,252,0.028) = water-deep @ 2.8% |
| `.back` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.pill` | `color` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `.pill` | `border` | `1px solid rgba(212,85,58,.55)` | rgba(212,85,58,0.55) = coral（+3 别名） @ 55% |
| `.metaRow` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.note` | `color` | `var(--warm)` | --warm ⇒ #f6d79a = warm（+1 别名） |
| `.note i` | `background` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `.maker .k` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.seal` | `border` | `1px solid rgba(212,85,58,.62)` | rgba(212,85,58,0.62) = coral（+3 别名） @ 62% |
| `.seal` | `background` | `radial-gradient(76% 76% at 34% 26%, rgba(10,48,60,.5), rgba(3,17,23,.78))` | rgba(10,48,60,0.5) = water-bed（+1 别名） @ 50%；rgba(3,17,23,0.78) = water-void（+2 别名） @ 78% |
| `.seal i` | `border` | `1px solid rgba(243,249,250,.16)` | rgba(243,249,250,0.16) = paper（+1 别名） @ 16% |
| `.seal i b` | `background` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `.heroLab` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.segNum` | `color` | `rgba(243,249,250,.18)` | rgba(243,249,250,0.18) = paper（+1 别名） @ 18% |
| `.segLab` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.segLab.gap` | `color` | `var(--warm)` | --warm ⇒ #f6d79a = warm（+1 别名） |
| `.segLab.sel` | `color` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `.segNum.gap` | `color` | `rgba(246,215,154,.26)` | rgba(246,215,154,0.26) = warm（+1 别名） @ 26% |
| `.selMark` | `background` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `.cap .line` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.cap .listen` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.gapSlot` | `border` | `1px dashed rgba(246,215,154,.5)` | rgba(246,215,154,0.5) = warm（+1 别名） @ 50% |
| `.gapKind` | `color` | `var(--warm)` | --warm ⇒ #f6d79a = warm（+1 别名） |
| `.cta` | `background` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `.cta` | `color` | `var(--ink)` | --ink ⇒ #050f14 = ink（+1 别名） |
| `.gapNote` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.callout` | `color` | `rgba(169,199,207,.8)` | rgba(169,199,207,0.8) = muted（+3 别名） @ 80% |
| `.corkLab` | `color` | `rgba(246,215,154,.8)` | rgba(246,215,154,0.8) = warm（+1 别名） @ 80% |
| `.col h2 span` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.destCol .sub` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.play` | `border` | `1px solid rgba(127,209,217,.42)` | rgba(127,209,217,0.42) = glass（+2 别名） @ 42% |
| `.play` | `background` | `rgba(5,15,20,0)` | rgba(5,15,20,0) = ink（+1 别名） @ 0% |
| `.bar` | `border-top` | `1px solid rgba(243,249,250,.12)` | rgba(243,249,250,0.12) = paper（+1 别名） @ 12% |
| `.bar` | `border-bottom` | `1px solid rgba(243,249,250,.12)` | rgba(243,249,250,0.12) = paper（+1 别名） @ 12% |
| `.bar .fill` | `background` | `rgba(127,209,217,.16)` | rgba(127,209,217,0.16) = glass（+2 别名） @ 16% |
| `.bar .fill` | `border-top` | `1px solid rgba(203,238,246,.5)` | rgba(203,238,246,0.5) = water-mid（+2 别名） @ 50% |
| `.bar .head` | `background` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `.voteBtn` | `border` | `1px solid rgba(127,209,217,.42)` | rgba(127,209,217,0.42) = glass（+2 别名） @ 42% |
| `.voteBtn` | `background` | `rgba(5,15,20,0)` | rgba(5,15,20,0) = ink（+1 别名） @ 0% |
| `.voteBtn` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.voteBtn .n` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.votesNote` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.ghost` | `border` | `1px solid rgba(243,249,250,.2)` | rgba(243,249,250,0.2) = paper（+1 别名） @ 20% |
| `.ghost` | `background` | `rgba(5,15,20,0)` | rgba(5,15,20,0) = ink（+1 别名） @ 0% |
| `.ghost` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.putBack span` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.destRow` | `background` | `rgba(5,15,20,0)` | rgba(5,15,20,0) = ink（+1 别名） @ 0% |
| `.destRow .d` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.bottomRule` | `background` | `rgba(243,249,250,.1)` | rgba(243,249,250,0.1) = paper（+1 别名） @ 10% |
| `.bottom` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.botLink` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.journey` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |

### 3.4 圆角
| 选择器 | border-radius | 用在哪 |
| --- | --- | --- |
| `.pill` | `2px` | `font-size:12.5px; letter-spacing:.08em; color:var(--coral); border:1px solid rgba(212,85,58,.55); border-radiu` |
| `.seal` | `50%` | `flex:none; width:52px; height:52px; border-radius:50%; border:1px solid rgba(212,85,58,.62); background:radial` |
| `.seal i` | `50%` | `width:40px; height:40px; border-radius:50%; border:1px solid rgba(243,249,250,.16); display:grid; place-items:` |
| `.seal i b` | `50%` | `width:9px; height:9px; border-radius:50%; background:var(--coral)` |
| `.gapSlot` | `23px` | `width:110px; height:46px; margin:0 auto; border:1px dashed rgba(246,215,154,.5); border-radius:23px` |
| `.cta` | `2px` | `margin-top:5px; display:inline-flex; align-items:center; gap:8px; height:44px; padding:0 17px; border:0; borde` |
| `.play` | `50%` | `flex:none; width:52px; height:52px; padding:0; border-radius:50%; border:1px solid rgba(127,209,217,.42); back` |
| `.voteBtn` | `2px` | `display:inline-flex; align-items:center; gap:8px; height:38px; padding:0 15px; border:1px solid rgba(127,209,2` |
| `.ghost` | `2px` | `display:inline-flex; align-items:center; gap:8px; height:36px; padding:0 15px; border:1px solid rgba(243,249,2` |
- SVG 的 `rx`/`ry`：`svg[1] svg.scene › g › rect rx="23"`、`svg[1] svg.scene › g › rect rx="23"`、`svg[1] svg.scene › g › rect rx="23"`、`svg[1] svg.scene › g › rect rx="12"`

### 3.5 渐变（stop 串原样）
**CSS 渐变声明**：
- `.platter` · `background`：`repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.02) 0 1.2px, rgba(216,243,246,0) 1.2px 15px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, rgba(127,209,217,0) 68%)`
- `.air` · `background`：`radial-gradient(46% 62% at 16% 6%, rgba(203,238,246,.115), rgba(203,238,246,0) 70%),
          radial-gradient(70% 50% at 78% 0%, rgba(127,209,217,.075), rgba(127,209,217,0) 72%)`
- `.deep` · `background`：`linear-gradient(180deg, rgba(127,209,217,.09) 0%, rgba(10,48,60,.34) 34%, rgba(5,15,20,.72) 100%)`
- `.current` · `background`：`repeating-linear-gradient(180deg, rgba(216,243,246,.05) 0 1px, rgba(216,243,246,0) 1px 42px),
          linear-gradient(94deg, rgba(228,247,252,0) 40%, rgba(228,247,252,.035) 52%, rgba(228,247,252,0) 62%)`
- `.glint` · `background`：`linear-gradient(101deg, rgba(228,247,252,0) 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, rgba(228,247,252,0) 72%)`
- `.seal` · `background`：`radial-gradient(76% 76% at 34% 26%, rgba(10,48,60,.5), rgba(3,17,23,.78))`
**SVG `<defs>` 里的渐变（svg[1]，非 CSS 写法，stop 原样）**：
- `<linearGradient#gGlass> id="gGlass" x1="0" y1="300" x2="0" y2="600" gradientUnits="userSpaceOnUse" · stops: `offset="0" stop-color="#cbeef6" stop-opacity=".075"` / `offset=".42" stop-color="#0a303c" stop-opacity=".20"` / `offset="1" stop-color="#031117" stop-opacity=".52"``
- `<linearGradient#gWater> id="gWater" x1="0" y1="430" x2="0" y2="592" gradientUnits="userSpaceOnUse" · stops: `offset="0" stop-color="#7fd1d9" stop-opacity=".22"` / `offset="1" stop-color="#7fd1d9" stop-opacity=".06"``
- `<linearGradient#gPaper> id="gPaper" x1="0" y1="402" x2="0" y2="448" gradientUnits="userSpaceOnUse" · stops: `offset="0" stop-color="#f3f9fa" stop-opacity=".92"` / `offset=".55" stop-color="#dbeef2" stop-opacity=".8"` / `offset="1" stop-color="#a9c7cf" stop-opacity=".62"``
- `<linearGradient#gCork> id="gCork" x1="0" y1="-12" x2="0" y2="12" gradientUnits="userSpaceOnUse" · stops: `offset="0" stop-color="#f6d79a" stop-opacity=".5"` / `offset="1" stop-color="#8a6a34" stop-opacity=".62"``
- `<linearGradient#gSheen> id="gSheen" x1="0" y1="900" x2="1440" y2="0" gradientUnits="userSpaceOnUse" · stops: `offset=".28" stop-color="#e4f7fc" stop-opacity="0"` / `offset=".47" stop-color="#e4f7fc" stop-opacity=".07"` / `offset=".52" stop-color="#e4f7fc" stop-opacity=".1"` / `offset=".68" stop-color="#e4f7fc" stop-opacity="0"``

### 3.6 主块几何（`.clip` / `.page` 下顶层绝对定位块）
- 容器：`.clip`：box-sizing:border-box; margin:0; padding:0; position:absolute; inset:0; overflow:hidden
| 宿主 | 块 | 定位 | width | height | transform | z-index |
| --- | --- | --- | --- | --- | --- | --- |
| .clip | `div.platter` | `position:absolute; inset:0` | — | — | — | — |
| .clip | `div.air` | `position:absolute; left:-40px; right:-40px; top:-60px` | — | 560px | — | — |
| .clip | `div.glint` | `position:absolute; inset:0` | — | — | — | — |
| .clip | `div.deep` | `position:absolute; left:0; right:0; top:430px; bottom:0` | — | — | — | — |
| .clip | `div.current` | `position:absolute; left:0; right:0; top:430px; bottom:0` | — | — | — | — |
- 更深处（不在上表里）的绝对定位块共 **32** 个：
  - `html › body › div.clip`：`position:absolute; inset:0`
  - `html › body › svg.scene`：`position:absolute; left:0; top:0; width:1440px; height:900px`
  - `html › body › main`：`position:absolute; inset:0`
  - `html › body › main › nav.crumb`：`position:absolute; left:76px; top:30px; height:26px`
  - `html › body › main › h1`：`position:absolute; left:76px; top:60px`
  - `html › body › main › p.work`：`position:absolute; left:76px; top:126px`
  - `html › body › main › p.metaRow`：`position:absolute; left:76px; top:156px`
  - `html › body › main › p.note`：`position:absolute; left:76px; top:184px; width:800px`
  - `html › body › main › div.maker`：`position:absolute; right:76px; top:62px`
  - `html › body › main › p.heroLab`：`position:absolute; left:76px; top:272px`
  - `html › body › main › div.segNum`：`position:absolute; left:76px; top:320px; width:231px`
  - `html › body › main › div.segLab`：`position:absolute; left:76px; top:356px; width:231px`
  - …（其余 20 个同为装置内的分件，规则同上：`position:absolute` + 锚点）

### 3.7 SVG / 图形
- **svg[1]** `svg.scene` viewBox=`0 0 1440 900` width=1440px height=900px
  - `svg.scene › line`：`x1="0"` `y1="430"` `x2="1440"` `y2="430"` `stroke="#eafcff"` `stroke-opacity=".08"` `stroke-width="4"` · 色：#eafcff ×.08 = water-light（+1 别名） @ 8%
  - `svg.scene › line`：`x1="0"` `y1="430"` `x2="1440"` `y2="430"` `stroke="#eafcff"` `stroke-opacity=".3"` · 色：#eafcff ×.3 = water-light（+1 别名） @ 30%
  - `svg.scene › use`：`href="#bottleShape"` `fill="url(#gGlass)"` `stroke="#e4f7fc"` `stroke-opacity=".4"` · 色：#e4f7fc ×.4 = water-deep @ 40%
  - `svg.scene › g`：`clip-path="url(#cpBottle)"`
  - `svg.scene › g › path`：`d="M60 430 H769 Q840 468 862 592 H60 Z"` `fill="url(#gWater)"`
  - `svg.scene › g › rect`：`x="60"` `y="430"` `width="709"` `height="24"` `fill="#cbeef6"` `fill-opacity=".05"` · 色：#cbeef6 ×.05 = water-mid（+2 别名） @ 5%
  - `svg.scene › g › rect`：`x="90"` `y="406"` `width="820"` `height="6"` `fill="#cbeef6"` `fill-opacity=".045"` · 色：#cbeef6 ×.045 = water-mid（+2 别名） @ 4.5%
  - `svg.scene › g › rect`：`x="150"` `y="420"` `width="700"` `height="4"` `fill="#cbeef6"` `fill-opacity=".03"` · 色：#cbeef6 ×.03 = water-mid（+2 别名） @ 3%
  - `svg.scene › g › path`：`d="M769 430 Q840 468 862 592"` `fill="none"` `stroke="#eafcff"` `stroke-opacity=".5"` `stroke-width="1.2"` · 色：#eafcff ×.5 = water-light（+1 别名） @ 50%
  - `svg.scene › g › line`：`x1="60"` `y1="430"` `x2="769"` `y2="430"` `stroke="#eafcff"` `stroke-opacity=".4"` · 色：#eafcff ×.4 = water-light（+1 别名） @ 40%
  - `svg.scene › g › line`：`x1="307"` `y1="308"` `x2="307"` `y2="592"` `stroke="#f3f9fa"` `stroke-opacity=".13"` · 色：#f3f9fa ×.13 = paper（+1 别名） @ 13%
  - `svg.scene › g › line`：`x1="538"` `y1="308"` `x2="538"` `y2="592"` `stroke="#f3f9fa"` `stroke-opacity=".13"` · 色：#f3f9fa ×.13 = paper（+1 别名） @ 13%
  - `svg.scene › g › path`：`d="M110 552 q40 -7 80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0"` `fill="none"` `stroke="#eafcff"` `stroke-opacity=".09"` · 色：#eafcff ×.09 = water-light（+1 别名） @ 9%
  - `svg.scene › g › path`：`d="M200 578 q40 -6 80 0 t80 0 t80 0 t80 0 t80 0"` `fill="none"` `stroke="#eafcff"` `stroke-opacity=".06"` · 色：#eafcff ×.06 = water-light（+1 别名） @ 6%
  - `svg.scene › g › circle`：`cx="140"` `cy="536"` `r="2.5"` `fill="none"` `stroke="#eafcff"` `stroke-opacity=".3"` · 色：#eafcff ×.3 = water-light（+1 别名） @ 30%
  - `svg.scene › g › circle`：`cx="252"` `cy="512"` `r="2"` `fill="none"` `stroke="#eafcff"` `stroke-opacity=".24"` · 色：#eafcff ×.24 = water-light（+1 别名） @ 24%
  - `svg.scene › g › circle`：`cx="430"` `cy="566"` `r="3"` `fill="none"` `stroke="#eafcff"` `stroke-opacity=".26"` · 色：#eafcff ×.26 = water-light（+1 别名） @ 26%
  - `svg.scene › g › circle`：`cx="640"` `cy="542"` `r="2"` `fill="none"` `stroke="#eafcff"` `stroke-opacity=".24"` · 色：#eafcff ×.24 = water-light（+1 别名） @ 24%
  - `svg.scene › g › path`：`d="M0 0 H1440 V900 H0 Z"` `fill="url(#gSheen)"`
  - `svg.scene › g`：`fill="none"` `stroke="#e4f7fc"` `stroke-opacity=".13"` · 色：#e4f7fc ×.13 = water-deep @ 13%
  - `svg.scene › g › path`：`d="M239 310 H995 L1085 398 H1300"`
  - `svg.scene › g › path`：`d="M239 590 H995 L1085 502 H1300"`
  - `svg.scene › path`：`d="M226 309 A141 141 0 0 0 226 591"` `fill="none"` `stroke="#eafcff"` `stroke-opacity=".2"` `stroke-width="2"` · 色：#eafcff ×.2 = water-light（+1 别名） @ 20%
  - `svg.scene › rect`：`x="1088"` `y="390"` `width="9"` `height="120"` `fill="#e4f7fc"` `fill-opacity=".06"` · 色：#e4f7fc ×.06 = water-deep @ 6%
  - `svg.scene › line`：`x1="1092"` `y1="390"` `x2="1092"` `y2="510"` `stroke="#e4f7fc"` `stroke-opacity=".3"` · 色：#e4f7fc ×.3 = water-deep @ 30%
  - `svg.scene › rect`：`x="1310"` `y="382"` `width="30"` `height="136"` `fill="#e4f7fc"` `fill-opacity=".05"` · 色：#e4f7fc ×.05 = water-deep @ 5%
  - `svg.scene › line`：`x1="1312"` `y1="382"` `x2="1312"` `y2="518"` `stroke="#e4f7fc"` `stroke-opacity=".26"` · 色：#e4f7fc ×.26 = water-deep @ 26%
  - `svg.scene › line`：`x1="1338"` `y1="382"` `x2="1338"` `y2="518"` `stroke="#e4f7fc"` `stroke-opacity=".26"` · 色：#e4f7fc ×.26 = water-deep @ 26%
  - `svg.scene › path`：`d="M60 432 A16 16 0 0 0 60 428"` `fill="none"` `stroke="#eafcff"` `stroke-opacity=".3"` · 色：#eafcff ×.3 = water-light（+1 别名） @ 30%
  - `svg.scene › path`：`d="M40 434 A28 28 0 0 0 40 426"` `fill="none"` `stroke="#eafcff"` `stroke-opacity=".18"` · 色：#eafcff ×.18 = water-light（+1 别名） @ 18%
  - `svg.scene › g`：`stroke="#e4f7fc"` `stroke-opacity=".18"` · 色：#e4f7fc ×.18 = water-deep @ 18%
  - `svg.scene › g › line`：`x1="307"` `y1="312"` `x2="307"` `y2="328"`
  - `svg.scene › g › line`：`x1="538"` `y1="312"` `x2="538"` `y2="328"`
  - `svg.scene › g › line`：`x1="769"` `y1="312"` `x2="769"` `y2="328"`
  - `svg.scene › g`：
  - `svg.scene › g › rect`：`x="136"` `y="402"` `width="110"` `height="46"` `rx="23"` `fill="url(#gPaper)"` `stroke="#f3f9fa"` `stroke-opacity=".5"` · 色：#f3f9fa ×.5 = paper（+1 别名） @ 50%
  - `svg.scene › g › path`：`d="M158 404 A21 21 0 0 0 158 446"` `fill="none"` `stroke="#050f14"` `stroke-opacity=".34"` · 色：#050f14 ×.34 = ink（+1 别名） @ 34%
  - `svg.scene › g › path`：`d="M146 407 A18 18 0 0 0 146 443"` `fill="none"` `stroke="#050f14"` `stroke-opacity=".2"` · 色：#050f14 ×.2 = ink（+1 别名） @ 20%
  - `svg.scene › g › circle`：`cx="158"` `cy="425"` `r="4"` `fill="none"` `stroke="#050f14"` `stroke-opacity=".34"` · 色：#050f14 ×.34 = ink（+1 别名） @ 34%
  - `svg.scene › g`：
  - `svg.scene › g › rect`：`x="367"` `y="402"` `width="110"` `height="46"` `rx="23"` `fill="url(#gPaper)"` `stroke="#f3f9fa"` `stroke-opacity=".5"` · 色：#f3f9fa ×.5 = paper（+1 别名） @ 50%
  - `svg.scene › g › path`：`d="M389 404 A21 21 0 0 0 389 446"` `fill="none"` `stroke="#050f14"` `stroke-opacity=".34"` · 色：#050f14 ×.34 = ink（+1 别名） @ 34%
  - `svg.scene › g › path`：`d="M377 407 A18 18 0 0 0 377 443"` `fill="none"` `stroke="#050f14"` `stroke-opacity=".2"` · 色：#050f14 ×.2 = ink（+1 别名） @ 20%
  - `svg.scene › g › circle`：`cx="389"` `cy="425"` `r="4"` `fill="none"` `stroke="#050f14"` `stroke-opacity=".34"` · 色：#050f14 ×.34 = ink（+1 别名） @ 34%
  - `svg.scene › g`：
  - `svg.scene › g › rect`：`x="598"` `y="402"` `width="110"` `height="46"` `rx="23"` `fill="url(#gPaper)"` `stroke="#f3f9fa"` `stroke-opacity=".5"` · 色：#f3f9fa ×.5 = paper（+1 别名） @ 50%
  - `svg.scene › g › path`：`d="M620 404 A21 21 0 0 0 620 446"` `fill="none"` `stroke="#050f14"` `stroke-opacity=".34"` · 色：#050f14 ×.34 = ink（+1 别名） @ 34%
  - `svg.scene › g › path`：`d="M608 407 A18 18 0 0 0 608 443"` `fill="none"` `stroke="#050f14"` `stroke-opacity=".2"` · 色：#050f14 ×.2 = ink（+1 别名） @ 20%
  - `svg.scene › g › circle`：`cx="620"` `cy="425"` `r="4"` `fill="none"` `stroke="#050f14"` `stroke-opacity=".34"` · 色：#050f14 ×.34 = ink（+1 别名） @ 34%
  - `svg.scene › g`：`transform="translate(1392 428) rotate(-14)"`
  - `svg.scene › g › rect`：`x="-28"` `y="-12"` `width="56"` `height="24"` `rx="12"` `fill="url(#gCork)"` `stroke="#f6d79a"` `stroke-opacity=".5"` · 色：#f6d79a ×.5 = warm（+1 别名） @ 50%
  - `svg.scene › g › line`：`x1="-9"` `y1="-10"` `x2="-9"` `y2="10"` `stroke="#050f14"` `stroke-opacity=".2"` · 色：#050f14 ×.2 = ink（+1 别名） @ 20%
  - `svg.scene › g › line`：`x1="9"` `y1="-10"` `x2="9"` `y2="10"` `stroke="#050f14"` `stroke-opacity=".2"` · 色：#050f14 ×.2 = ink（+1 别名） @ 20%
  - `svg.scene › line`：`x1="1120"` `y1="336"` `x2="1120"` `y2="430"` `stroke="#a9c7cf"` `stroke-opacity=".34"` · 色：#a9c7cf ×.34 = muted（+3 别名） @ 34%
  - `svg.scene › circle`：`cx="133"` `cy="692"` `r="3"` `fill="none"` `stroke="#eafcff"` `stroke-opacity=".3"` · 色：#eafcff ×.3 = water-light（+1 别名） @ 30%
  - `svg.scene › circle`：`cx="203"` `cy="762"` `r="2"` `fill="none"` `stroke="#eafcff"` `stroke-opacity=".26"` · 色：#eafcff ×.26 = water-light（+1 别名） @ 26%
  - `svg.scene › circle`：`cx="306"` `cy="655"` `r="2.5"` `fill="none"` `stroke="#eafcff"` `stroke-opacity=".28"` · 色：#eafcff ×.28 = water-light（+1 别名） @ 28%
  - `svg.scene › circle`：`cx="1180"` `cy="618"` `r="2"` `fill="none"` `stroke="#eafcff"` `stroke-opacity=".24"` · 色：#eafcff ×.24 = water-light（+1 别名） @ 24%
  - `svg.scene › circle`：`cx="1332"` `cy="700"` `r="3"` `fill="none"` `stroke="#eafcff"` `stroke-opacity=".22"` · 色：#eafcff ×.22 = water-light（+1 别名） @ 22%
  - `svg.scene › circle`：`cx="430"` `cy="842"` `r="2"` `fill="none"` `stroke="#eafcff"` `stroke-opacity=".22"` · 色：#eafcff ×.22 = water-light（+1 别名） @ 22%
  - `svg.scene › line`：`x1="0"` `y1="700"` `x2="1440"` `y2="700"` `stroke="#eafcff"` `stroke-opacity=".05"` · 色：#eafcff ×.05 = water-light（+1 别名） @ 5%
  - `svg.scene › line`：`x1="0"` `y1="820"` `x2="1440"` `y2="820"` `stroke="#eafcff"` `stroke-opacity=".04"` · 色：#eafcff ×.04 = water-light（+1 别名） @ 4%
  - `svg.scene › path`：`d="M-20 648 q 240 -14 480 0 t 480 0 t 480 0"` `fill="none"` `stroke="#eafcff"` `stroke-opacity=".06"` · 色：#eafcff ×.06 = water-light（+1 别名） @ 6%
  - `svg.scene › path`：`d="M-20 742 q 300 -12 600 0 t 600 0"` `fill="none"` `stroke="#eafcff"` `stroke-opacity=".045"` · 色：#eafcff ×.045 = water-light（+1 别名） @ 4.5%
- **svg[2]** `svg` viewBox=`0 0 24 24` width=15px height=15px
  - `svg › path`：`d="M15 18l-6-6 6-6"`
- **svg[3]** `svg` viewBox=`0 0 24 24` width=16px height=16px
  - `svg › path`：`d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"`
  - `svg › path`：`d="M19 10v1a7 7 0 0 1-14 0v-1"`
  - `svg › line`：`x1="12"` `y1="19"` `x2="12"` `y2="22"`
- **svg[4]** `svg` viewBox=`0 0 34 34` width=34px height=34px
  - `svg › circle`：`cx="17"` `cy="17"` `r="16"` `stroke="#cbeef6"` `stroke-opacity=".45"` · 色：#cbeef6 ×.45 = water-mid（+2 别名） @ 45%
  - `svg › circle`：`cx="17"` `cy="17"` `r="11.5"` `stroke="#cbeef6"` `stroke-opacity=".2"` · 色：#cbeef6 ×.2 = water-mid（+2 别名） @ 20%
  - `svg › path`：`d="M14 12l9 5-9 5z"` `fill="#d4553a"` · 色：#d4553a = coral（+3 别名）
- **svg[5]** `svg` viewBox=`0 0 400 20` width=400px height=20px
  - `svg › path`：`d="M0 11 q14 -7 28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0"` `stroke="#cbeef6"` `stroke-opacity=".18"` · 色：#cbeef6 ×.18 = water-mid（+2 别名） @ 18%
- **svg[6]** `svg` viewBox=`0 0 24 24` width=15px height=15px
  - `svg › path`：`d="M7 10v12"`
  - `svg › path`：`d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"`
- **svg[7]** `svg` viewBox=`0 0 24 24` width=15px height=15px
  - `svg › path`：`d="M17 14V2"`
  - `svg › path`：`d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"`
- **svg[8]** `svg` viewBox=`0 0 24 24` width=15px height=15px
  - `svg › path`：`d="M3 12a9 9 0 1 0 3-6.7L3 8"`
  - `svg › path`：`d="M3 3v5h5"`
- **svg[9]** `svg` viewBox=`0 0 30 30` width=30px height=30px
  - `svg › path`：`d="M2 8c1 .9 2 1.6 3.6 1.6 3.4 0 3.4-2.6 6.8-2.6 3.5 0 3.3 2.6 6.8 2.6 1.7 0 2.6-.7 3.6-1.6"`
  - `svg › path`：`d="M2 15c1 .9 2 1.6 3.6 1.6 3.4 0 3.4-2.6 6.8-2.6 3.5 0 3.3 2.6 6.8 2.6 1.7 0 2.6-.7 3.6-1.6"`
  - `svg › path`：`d="M2 22c1 .9 2 1.6 3.6 1.6 3.4 0 3.4-2.6 6.8-2.6 3.5 0 3.3 2.6 6.8 2.6 1.7 0 2.6-.7 3.6-1.6"`
- **svg[10]** `svg` viewBox=`0 0 30 30` width=30px height=30px
  - `svg › path`：`d="M4 15a11 11 0 1 0 3.6-8.2L4 10"`
  - `svg › path`：`d="M3 4v6h6"`
- **svg[11]** `svg` viewBox=`0 0 30 30` width=30px height=30px
  - `svg › path`：`d="M2 15h11"`
  - `svg › path`：`d="M13 15 27 7"`
  - `svg › path`：`d="M13 15h14"`
  - `svg › path`：`d="M13 15l14 8"`
- **svg[12]** `svg` viewBox=`0 0 24 24` width=14px height=14px
  - `svg › path`：`d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"`
- **svg[13]** `svg` viewBox=`0 0 24 24` width=14px height=14px
  - `svg › path`：`d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"`
  - `svg › line`：`x1="4"` `y1="22"` `x2="4"` `y2="15"`

- **全页 transform（含 rotate 角度）**：
  - （本页未用）

### 3.8 文案（逐字，文档顺序；`⟨br⟩` = 源码 `<br />`）
001. `body › main › nav.crumb › a.back` → "回河道"
002. `body › main › nav.crumb › span.pill` → "有人持有"
003. `html › body › main › h1` → "漂流瓶详情"
004. `html › body › main › p.work` → "占位曲目"
005. `body › main › p.metaRow › span` → "已录 3 / 4 段"
006. `body › main › p.metaRow › span` → "作品还不完整：缺第 4 段"
007. `body › main › p.note › span` → "缺口是歌里固定的段位，不会被别人的段顶替。成品里这段时间会留成静音。"
008. `main › div.maker › div › div.k` → "发起者"
009. `main › div.maker › div › div.v` → "匿名歌手#042"
010. `html › body › main › p.heroLab` → "瓶身剖面 · 水只到第 3 段"
011. `html › body › main › div.segNum` → "1"
012. `html › body › main › div.segLab` → "第 1 段"
013. `body › main › div.cap › p.code` → "匿名歌手#042"
014. `main › div.cap › p.line › span` → "0:38"
015. `main › div.cap › p.line › span` → "赞 14"
016. `main › div.cap › p.line › span` → "踩 1"
017. `body › main › div.cap › a.listen` → "听"
018. `html › body › main › div.segNum` → "2"
019. `html › body › main › div.segLab` → "第 2 段"
020. `body › main › div.cap › p.code` → "匿名歌手#097"
021. `main › div.cap › p.line › span` → "0:44"
022. `main › div.cap › p.line › span` → "赞 9"
023. `main › div.cap › p.line › span` → "踩 0"
024. `body › main › div.cap › a.listen` → "听"
025. `html › body › main › div.segNum` → "3"
026. `html › body › main › div.segLab` → "第 3 段"
027. `body › main › div.cap › p.code` → "匿名歌手#118"
028. `main › div.cap › p.line › span` → "0:42"
029. `main › div.cap › p.line › span` → "赞 8"
030. `main › div.cap › p.line › span` → "踩 1"
031. `body › main › div.cap › a.listen` → "听"
032. `html › body › main › div.segNum` → "4"
033. `html › body › main › div.segLab` → "第 4 段"
034. `body › main › div.gapBox › p.gapKind` → "缺口"
035. `body › main › div.gapBox › p.gapHead` → "第 4 段由你开第一句"
036. `body › main › div.gapBox › button.cta` → "录第 4 段"
037. `body › main › div.gapBox › p.gapNote` → "这一段按该段的固定时长录，录完再选去向。不点开就不会占用你的麦克风。"
038. `html › body › main › p.callout` → "河道水面"
039. `html › body › main › p.corkLab` → "瓶塞 · 有人持有"
040. `body › main › div.listenCol › h2` → "试听与投票"
041. `main › div.listenCol › h2 › span` → "第 3 段　匿名歌手#118　在瓶身上点「听」换段"
042. `main › div.listenCol › div.transport › span.timecode` → "0:16 / 0:42"
043. `main › div.listenCol › div.votes › button.voteBtn` → "赞"
044. `div.listenCol › div.votes › button.voteBtn › span.n` → "8"
045. `main › div.listenCol › div.votes › button.voteBtn` → "踩"
046. `div.listenCol › div.votes › button.voteBtn › span.n` → "1"
047. `body › main › div.listenCol › p.votesNote` → "还没有听满这一段，继续听一会儿再点踩吧。"
048. `main › div.listenCol › div.putBack › button.ghost` → "放回海中，继续漂流"
049. `main › div.listenCol › div.putBack › span` → "还没想好要不要唱？放回去不会记录任何东西。"
050. `body › main › div.destCol › h2` → "选择去向"
051. `body › main › div.destCol › p.sub` → "接下来决定它去哪。发起者的第一棒没有「回传」，可选去向由服务端给。"
052. `div.destCol › button.destRow › span.txt › span.t` → "继续投河"
053. `div.destCol › button.destRow › span.txt › span.d` → "把当前版本重新投进河道，交给下一位陌生人接下一棒。"
054. `div.destCol › button.destRow › span.txt › span.t` → "回传"
055. `div.destCol › button.destRow › span.txt › span.d` → "沿父链把当前版本交回投给你的那个人，由他决定下一步。"
056. `div.destCol › button.destRow › span.txt › span.t` → "入海"
057. `div.destCol › button.destRow › span.txt › span.d` → "把当下的版本送进公海，成为所有人都能听到的公共作品。"
058. `body › main › div.bottom › a.journey` → "看这只瓶子的漂流日志"
059. `body › main › div.bottom › span` → "捞取 / 录音 / 投河 / 回传 / 入海 全部记在服务端。"
060. `main › div.bottom › span.r › a.botLink` → "私密留言"
061. `main › div.bottom › span.r › a.botLink` → "举报（进人工队列，不是自动删除）"

### 3.9 本页的「装置」
> 横躺的玻璃瓶：瓶内水位＝已录段数、干格＝缺口、漂着的瓶塞＝有人持有


## 4. 登录 / 注册 · `p-login-record.html` → `/login`
- **它是什么**：登录与注册两个模式挤在同一页（只有账号、密码两项）
- **画布**：`html,body` = 1440×900（`overflow:hidden`）；页面底色 `--ink`

### 4.2 排版（选择器 → 值）
| 选择器 | font-size | letter-spacing | line-height | font-weight |
| --- | --- | --- | --- | --- |
| `body` | 15px | — | 1.6 | — |
| `.lbl` | 11px | .24em | — | — |
| `h1` | 52px | .005em | 1.1 | 700 |
| `.lede` | 14.5px | — | 1.85 | — |
| `.tag b` | 11px | .12em | 1.45 | 400 |
| `.devnote` | 11.5px | — | 1.8 | — |
| `.mode` | 15px | .14em | — | 700 |
| `.tip` | 12.5px | — | 1.8 | — |
| `.field input` | 16px | — | — | — |
| `.msg` | 12px | — | 1.7 | — |
| `.msg .code` | — | .14em | — | — |
| `.hint` | 12px | — | 1.7 | — |
| `.hint .code` | — | .14em | — | — |
| `.act` | 15px | .05em | — | 700 |
| `.oath` | 13.5px | — | 1.9 | — |
| `.foot .said` | 13px | — | — | — |
| `.go` | 14px | — | — | — |

### 4.3 颜色（选择器 → 值 · 契约状态）
| 选择器 | 属性 | 声明原文 | 解析（hex/rgba → 契约 token） |
| --- | --- | --- | --- |
| `:root` | `--ink` | `#050f14` | #050f14 = ink（+1 别名） |
| `:root` | `--paper` | `#f3f9fa` | #f3f9fa = paper（+1 别名） |
| `:root` | `--muted` | `#a9c7cf` | #a9c7cf = muted（+3 别名） |
| `:root` | `--glass` | `#7fd1d9` | #7fd1d9 = glass（+2 别名） |
| `:root` | `--coral` | `#d4553a` | #d4553a = coral（+3 别名） |
| `:root` | `--warm` | `#f6d79a` | #f6d79a = warm（+1 别名） |
| `:root` | `--line` | `rgba(243,249,250,.13)` | rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `body` | `background` | `var(--ink)` | --ink ⇒ #050f14 = ink（+1 别名） |
| `body` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.lbl` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.platter` | `background` | `repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)` | rgba(216,243,246,0.055) = line（+1 别名） @ 5.5%；rgba(127,209,217,0.05) = glass（+2 别名） @ 5%；transparent（透明，非色值） |
| `.glint` | `background` | `linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)` | rgba(228,247,252,0.045) = water-deep @ 4.5%；rgba(228,247,252,0.065) = water-deep @ 6.5%；rgba(228,247,252,0.028) = water-deep @ 2.8%；transparent（透明，非色值） |
| `.surface` | `background` | `linear-gradient(164deg, rgba(203,238,246,.2) 0, rgba(203,238,246,.055) 19%, rgba(203,238,246,0) 43%)` | rgba(203,238,246,0.2) = water-mid（+2 别名） @ 20%；rgba(203,238,246,0.055) = water-mid（+2 别名） @ 5.5%；rgba(203,238,246,0) = water-mid（+2 别名） @ 0% |
| `.surface` | `-webkit-mask-image` | `linear-gradient(180deg, rgba(255,255,255,1), rgba(255,255,255,0))` | rgba(255,255,255,1) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.surface` | `mask-image` | `linear-gradient(180deg, rgba(255,255,255,1), rgba(255,255,255,0))` | rgba(255,255,255,1) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.lede` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.tag` | `border` | `1px solid rgba(243,249,250,.34)` | rgba(243,249,250,0.34) = paper（+1 别名） @ 34% |
| `.tag` | `background` | `linear-gradient(168deg, rgba(243,249,250,.11), rgba(243,249,250,.025))` | rgba(243,249,250,0.11) = paper（+1 别名） @ 11%；rgba(243,249,250,0.025) = paper（+1 别名） @ 2.5% |
| `.tag::before` | `border` | `1px solid rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.tag::before` | `background` | `var(--ink)` | --ink ⇒ #050f14 = ink（+1 别名） |
| `.tag b` | `color` | `rgba(243,249,250,.92)` | rgba(243,249,250,0.92) = paper（+1 别名） @ 92% |
| `.tag b` | `text-shadow` | `0 1px 0 rgba(5,15,20,.6)` | rgba(5,15,20,0.6) = ink（+1 别名） @ 60% |
| `.thread` | `background` | `linear-gradient(180deg, rgba(203,238,246,.47), rgba(203,238,246,.56) 34%, rgba(203,238,246,.49))` | rgba(203,238,246,0.47) = water-mid（+2 别名） @ 47%；rgba(203,238,246,0.56) = water-mid（+2 别名） @ 56%；rgba(203,238,246,0.49) = water-mid（+2 别名） @ 49% |
| `.devnote` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.mode` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.mode` | `background` | `transparent` | transparent（透明，非色值） |
| `.mode` | `border-bottom` | `1px solid rgba(243,249,250,.40)` | rgba(243,249,250,0.4) = paper（+1 别名） @ 40% |
| `.mode.on` | `color` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `.mode.on` | `border-bottom` | `2px solid var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `.tip` | `color` | `rgba(243,249,250,.54)` | rgba(243,249,250,0.54) = paper（+1 别名） @ 54% |
| `.field input` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.field input` | `background` | `transparent` | transparent（透明，非色值） |
| `.field input` | `border-bottom` | `1px solid rgba(243,249,250,.40)` | rgba(243,249,250,0.4) = paper（+1 别名） @ 40% |
| `.msg` | `color` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `.msg .code` | `color` | `rgba(243,249,250,.56)` | rgba(243,249,250,0.56) = paper（+1 别名） @ 56% |
| `.field.bad input` | `border-bottom-color` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `.hint` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.hint .code` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.act` | `color` | `var(--ink)` | --ink ⇒ #050f14 = ink（+1 别名） |
| `.act` | `background` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `.oath` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.foot` | `border-top` | `1px solid var(--line)` | --line ⇒ rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `.foot .said` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.go` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |

### 4.4 圆角
| 选择器 | border-radius | 用在哪 |
| --- | --- | --- |
| `.tag` | `2px` | `position:absolute; right:0; top:0; width:88px; height:88px; border-radius:2px; border:1px solid rgba(243,249,2` |
| `.tag::before` | `50%` | `content:''; position:absolute; left:50%; top:12px; width:7px; height:7px; margin-left:-3.5px; border:1px solid` |
| `.act` | `2px` | `align-self:flex-start; margin-top:36px; width:238px; height:50px; padding:0; font-family:inherit; font-size:15` |
- SVG 的 `rx`/`ry`：`svg[1] svg.mouth › ellipse rx="36"`、`svg[1] svg.mouth › ellipse ry="11"`、`svg[1] svg.mouth › ellipse rx="36"`、`svg[1] svg.mouth › ellipse ry="11"`

### 4.5 渐变（stop 串原样）
**CSS 渐变声明**：
- `.platter` · `background`：`repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)`
- `.glint` · `background`：`linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)`
- `.surface` · `background`：`linear-gradient(164deg, rgba(203,238,246,.2) 0, rgba(203,238,246,.055) 19%, rgba(203,238,246,0) 43%)`
- `.surface` · `-webkit-mask-image`：`linear-gradient(180deg, rgba(255,255,255,1), rgba(255,255,255,0))`
- `.surface` · `mask-image`：`linear-gradient(180deg, rgba(255,255,255,1), rgba(255,255,255,0))`
- `.tag` · `background`：`linear-gradient(168deg, rgba(243,249,250,.11), rgba(243,249,250,.025))`
- `.thread` · `background`：`linear-gradient(180deg, rgba(203,238,246,.47), rgba(203,238,246,.56) 34%, rgba(203,238,246,.49))`

### 4.6 主块几何（`.clip` / `.page` 下顶层绝对定位块）
- 容器：`.clip`：box-sizing:border-box; margin:0; padding:0; position:absolute; inset:0; overflow:hidden ／ `.page`：box-sizing:border-box; margin:0; padding:64px 96px 0; position:relative; z-index:2; width:1440px; height:900px; display:flex; flex-direction:column
| 宿主 | 块 | 定位 | width | height | transform | z-index |
| --- | --- | --- | --- | --- | --- | --- |
| .clip | `div.platter` | `position:absolute; inset:0` | — | — | — | — |
| .clip | `div.surface` | `position:absolute; inset:0` | — | — | — | — |
| .clip | `div.glint` | `position:absolute; inset:0` | — | — | — | — |
| .page | `p.colophon` | `position:absolute; left:1240px; top:88px` | — | — | — | — |
| .page | `div.device` | `position:absolute; right:96px; top:124px` | 364px | 698px | — | — |
| .page | `svg.mouth` | `position:absolute; left:1184px; top:872px` | 196 | 28 | — | — |
- 更深处（不在上表里）的绝对定位块共 **5** 个：
  - `html › body › div.clip`：`position:absolute; inset:0`
  - `html › body › div.page › div.device › div.tag`：`position:absolute; right:0; top:0; width:88px; height:88px`
  - `html › body › div.page › div.device › div.tag › b.meta`：`position:absolute; left:50%; top:30px; width:88px`
  - `html › body › div.page › div.device › div.thread`：`position:absolute; right:44px; top:208px; width:1px; height:464px`
  - `html › body › div.page › div.device › p.devnote`：`position:absolute; right:56px; top:224px; width:238px`

### 4.7 SVG / 图形
- **svg[1]** `svg.mouth` viewBox=`0 0 196 28` width=196 height=28
  - `svg.mouth › path`：`d="M96 20 L84 28"` `stroke="#cbeef6"` `stroke-opacity=".50"` · 色：#cbeef6 ×.50 = water-mid（+2 别名） @ 50%
  - `svg.mouth › path`：`d="M168 20 L180 28"` `stroke="#cbeef6"` `stroke-opacity=".46"` · 色：#cbeef6 ×.46 = water-mid（+2 别名） @ 46%
  - `svg.mouth › path`：`d="M92 24 L78 28"` `stroke="#cbeef6"` `stroke-opacity=".44"` · 色：#cbeef6 ×.44 = water-mid（+2 别名） @ 44%
  - `svg.mouth › path`：`d="M172 24 L186 28"` `stroke="#cbeef6"` `stroke-opacity=".42"` · 色：#cbeef6 ×.42 = water-mid（+2 别名） @ 42%
  - `svg.mouth › ellipse`：`cx="132"` `cy="20"` `rx="36"` `ry="11"` `fill="rgba(3,14,20,.6)"` · fill="rgba(3,14,20,.6)" = 未收进契约（基色 #030e14）
  - `svg.mouth › ellipse`：`cx="132"` `cy="20"` `rx="36"` `ry="11"` `stroke="#cbeef6"` `stroke-opacity=".40"` · 色：#cbeef6 ×.40 = water-mid（+2 别名） @ 40%
  - `svg.mouth › path`：`d="M96 20 A36 11 0 0 1 168 20"` `stroke="#cbeef6"` `stroke-opacity=".6"` · 色：#cbeef6 ×.6 = water-mid（+2 别名） @ 60%
  - `svg.mouth › path`：`d="M168 20 A36 11 0 0 1 96 20"` `stroke="#cbeef6"` `stroke-opacity=".3"` · 色：#cbeef6 ×.3 = water-mid（+2 别名） @ 30%
  - `svg.mouth › path`：`d="M132 22 L132 28"` `stroke="#cbeef6"` `stroke-opacity=".46"` · 色：#cbeef6 ×.46 = water-mid（+2 别名） @ 46%
  - `svg.mouth › circle`：`cx="132"` `cy="22"` `r="2.4"` `stroke="#cbeef6"` `stroke-opacity=".66"` · 色：#cbeef6 ×.66 = water-mid（+2 别名） @ 66%

- **全页 transform（含 rotate 角度）**：
  - （本页未用）

### 4.8 文案（逐字，文档顺序；`⟨br⟩` = 源码 `<br />`）
001. `html › body › div.page › p.colophon` → "SIDE A · 未登录"
002. `body › div.page › div.col › h1` → "每一段旋律，⟨br⟩都在寻找下一个声音"
003. `body › div.page › div.col › p.lede` → "这是一个由歌声、回音和宿命组成的角落。⟨br⟩你只录一段，剩下的交给漂流。"
004. `div.page › form.col › div.modes › button.mode` → "登录"
005. `div.page › form.col › div.modes › button.mode` → "注册"
006. `body › div.page › form.col › p.tip` → "登录和注册都只用这两项：账号、密码。"
007. `div.page › form.col › div.field › label.lbl` → "账号"
008. `body › div.page › form.col › div.field › input#handle` → ""
009. `form.col › div.field › p.msg#handle-err › span.code` → "HANDLE_TAKEN"
010. `div.page › form.col › div.field › p.msg#handle-err` → "　这个账号已被占用。"
011. `div.page › form.col › div.field › label.lbl` → "密码"
012. `body › div.page › form.col › div.field › input#password` → ""
013. `form.col › div.field › p.msg#password-err › span.code` → "WEAK_PASSWORD"
014. `div.page › form.col › div.field › p.msg#password-err` → "　口令强度不够。"
015. `form.col › div.field › p.hint#password-hint › span.code` → "密码规则"
016. `div.page › form.col › div.field › p.hint#password-hint` → "　至少 8 位，同时含字母和数字。"
017. `body › div.page › form.col › button.act` → "注册并进入"
018. `body › div.page › form.col › p.oath` → "不用真名，不用露脸，只要一段声音。同一个瓶子里，不同的人看到的是不同的匿名代号。"
019. `div.page › div.device › div.tag › b.meta` → "匿名代号"
020. `body › div.page › div.device › p.devnote` → "线上那枚代号，是别人在瓶里看到的全部；线那头串着的瓶，只有你认领得到。"
021. `div.page › div.foot › div.row › span.lbl` → "已登录态"
022. `div.page › div.foot › div.row › span.said` → "你已经登录为「你的代号」，不用再登录一次。"
023. `div.page › div.foot › div.row › a.go` → "直接去河道捞一个瓶子"

### 4.9 本页的「装置」
> 认领线：一枚匿名代号牌坠在线头，线的另一头只露一角瓶口（那只瓶只有你认领得到）


## 5. 公海大厅 · `p-sea-hall.html` → `/sea`
- **它是什么**：公海列表：所有已完成的作品，可捞取
- **画布**：`html,body` = 1440×900（`overflow:hidden`）；页面底色 `--ink`

### 5.2 排版（选择器 → 值）
| 选择器 | font-size | letter-spacing | line-height | font-weight |
| --- | --- | --- | --- | --- |
| `.meta` | 11px | .24em | — | — |
| `h1` | 60px | .01em | 1 | 700 |
| `.lede` | 15px | — | 1.9 | — |
| `.zones li` | 15px | .04em | — | — |
| `.zones li .n` | 12px | — | — | — |
| `.song` | 17px | — | 1.35 | — |
| `.rec` | 12.5px | — | 1.6 | — |
| `.rec b` | — | — | — | 400 |
| `.st` | 12.5px | — | 1.6 | — |
| `.tm` | 11.5px | — | 1.6 | — |
| `.listen` | 12.5px | — | — | — |
| `.pages a` | 12px | — | — | — |
| `.empty h2` | 19px | — | — | 700 |
| `.empty p` | 14px | — | 1.95 | — |
| `.empty a` | 13.5px | — | — | — |

### 5.3 颜色（选择器 → 值 · 契约状态）
| 选择器 | 属性 | 声明原文 | 解析（hex/rgba → 契约 token） |
| --- | --- | --- | --- |
| `:root` | `--ink` | `#050f14` | #050f14 = ink（+1 别名） |
| `:root` | `--paper` | `#f3f9fa` | #f3f9fa = paper（+1 别名） |
| `:root` | `--muted` | `#a9c7cf` | #a9c7cf = muted（+3 别名） |
| `:root` | `--glass` | `#7fd1d9` | #7fd1d9 = glass（+2 别名） |
| `:root` | `--coral` | `#d4553a` | #d4553a = coral（+3 别名） |
| `:root` | `--warm` | `#f6d79a` | #f6d79a = warm（+1 别名） |
| `:root` | `--line` | `rgba(243,249,250,.13)` | rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `body` | `background` | `var(--ink)` | --ink ⇒ #050f14 = ink（+1 别名） |
| `body` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.meta` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.sky` | `background` | `radial-gradient(118% 84% at 52% 106%, rgba(127,209,217,.078), rgba(127,209,217,0) 70%)` | rgba(127,209,217,0.078) = glass（+2 别名） @ 7.8%；rgba(127,209,217,0) = glass（+2 别名） @ 0% |
| `.beam` | `background` | `linear-gradient(101deg, rgba(203,238,246,0) 26%, rgba(203,238,246,.05) 46%,
          rgba(228,247,252,.075) 53%, rgba(203,238,246,.03) 66%, rgba(203,238,246,0) 80%)` | rgba(203,238,246,0) = water-mid（+2 别名） @ 0%；rgba(203,238,246,0.05) = water-mid（+2 别名） @ 5%；rgba(228,247,252,0.075) = water-deep @ 7.5%；rgba(203,238,246,0.03) = water-mid（+2 别名） @ 3% |
| `.platter` | `background` | `repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)` | rgba(216,243,246,0.055) = line（+1 别名） @ 5.5%；rgba(127,209,217,0.05) = glass（+2 别名） @ 5%；transparent（透明，非色值） |
| `.platter` | `-webkit-mask-image` | `linear-gradient(180deg, rgba(255,255,255,.38) 0 310px, #fff 406px)` | rgba(255,255,255,0.38) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；#ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.platter` | `mask-image` | `linear-gradient(180deg, rgba(255,255,255,.38) 0 310px, #fff 406px)` | rgba(255,255,255,0.38) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；#ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.glint` | `background` | `linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)` | rgba(228,247,252,0.045) = water-deep @ 4.5%；rgba(228,247,252,0.065) = water-deep @ 6.5%；rgba(228,247,252,0.028) = water-deep @ 2.8%；transparent（透明，非色值） |
| `.glint` | `-webkit-mask-image` | `linear-gradient(180deg, rgba(255,255,255,.38) 0 310px, #fff 406px)` | rgba(255,255,255,0.38) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；#ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.glint` | `mask-image` | `linear-gradient(180deg, rgba(255,255,255,.38) 0 310px, #fff 406px)` | rgba(255,255,255,0.38) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；#ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.shafts` | `background` | `repeating-linear-gradient(99deg, rgba(203,238,246,.062) 0 5px, transparent 5px 104px),
          repeating-linear-gradient(103deg, rgba(203,238,246,.028) 0 18px, transparent 18px 268px)` | rgba(203,238,246,0.062) = water-mid（+2 别名） @ 6.2%；rgba(203,238,246,0.028) = water-mid（+2 别名） @ 2.8%；transparent（透明，非色值） |
| `.shafts` | `-webkit-mask-image` | `linear-gradient(180deg, rgba(255,255,255,0) 0 358px, rgba(255,255,255,.9) 386px, rgba(255,255,255,.22) 100%)` | rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.9) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.22) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.shafts` | `mask-image` | `linear-gradient(180deg, rgba(255,255,255,0) 0 358px, rgba(255,255,255,.9) 386px, rgba(255,255,255,.22) 100%)` | rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.9) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.22) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.lit` | `background` | `linear-gradient(180deg, rgba(127,209,217,.085) 0%, rgba(127,209,217,0) 100%)` | rgba(127,209,217,0.085) = glass（+2 别名） @ 8.5%；rgba(127,209,217,0) = glass（+2 别名） @ 0% |
| `.abyss` | `background` | `linear-gradient(180deg, rgba(5,15,20,0) 0%, rgba(3,11,16,.36) 52%, rgba(2,8,12,.64) 100%)` | rgba(5,15,20,0) = ink（+1 别名） @ 0%；rgba(3,11,16,0.36) = 未收进契约（基色 #030b10）；rgba(2,8,12,0.64) = 未收进契约（基色 #02080c） |
| `.seabed` | `border-top` | `1px solid rgba(243,249,250,.13)` | rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `.seabed` | `background` | `radial-gradient(46% 130px at 50% 0%, rgba(127,209,217,.06), rgba(127,209,217,0) 74%),
          linear-gradient(180deg, rgba(243,249,250,.018), rgba(243,249,250,0) 240px)` | rgba(127,209,217,0.06) = glass（+2 别名） @ 6%；rgba(127,209,217,0) = glass（+2 别名） @ 0%；rgba(243,249,250,0.018) = paper（+1 别名） @ 1.8%；rgba(243,249,250,0) = paper（+1 别名） @ 0% |
| `.bub i` | `background` | `rgba(203,238,246,.3)` | rgba(203,238,246,0.3) = water-mid（+2 别名） @ 30% |
| `.sed i` | `background` | `rgba(243,249,250,.12)` | rgba(243,249,250,0.12) = paper（+1 别名） @ 12% |
| `.rule` | `background` | `rgba(243,249,250,.09)` | rgba(243,249,250,0.09) = paper（+1 别名） @ 9% |
| `.rule i` | `background` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `.lede` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.zones li` | `border-bottom` | `2px solid transparent` | transparent（透明，非色值） |
| `.zones li` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.zones li .n` | `color` | `rgba(243,249,250,.42)` | rgba(243,249,250,0.42) = paper（+1 别名） @ 42% |
| `.zones li[aria-selected='true']` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.zones li[aria-selected='true']` | `border-bottom-color` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `.zones li[aria-selected='true'] .n` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.glass` | `background` | `linear-gradient(100deg, rgba(203,238,246,.46) 0 2.6%, rgba(10,48,60,.5) 17%,
          rgba(3,17,23,.82) 62%, rgba(127,209,217,.3) 96%, rgba(203,238,246,.34) 100%)` | rgba(203,238,246,0.46) = water-mid（+2 别名） @ 46%；rgba(10,48,60,0.5) = water-bed（+1 别名） @ 50%；rgba(3,17,23,0.82) = water-void（+2 别名） @ 82%；rgba(127,209,217,0.3) = glass（+2 别名） @ 30%；rgba(203,238,246,0.34) = water-mid（+2 别名） @ 34% |
| `.note i` | `background` | `rgba(203,238,246,.38)` | rgba(203,238,246,0.38) = water-mid（+2 别名） @ 38% |
| `.sub` | `background` | `linear-gradient(180deg, rgba(4,20,26,.3), rgba(2,10,15,.62))` | rgba(4,20,26,0.3) = 未收进契约（基色 #04141a）；rgba(2,10,15,0.62) = 未收进契约（基色 #020a0f） |
| `.sub::before` | `background` | `rgba(203,238,246,.32)` | rgba(203,238,246,0.32) = water-mid（+2 别名） @ 32% |
| `.cork` | `background` | `linear-gradient(180deg, rgba(246,215,154,.44), rgba(246,215,154,.24))` | rgba(246,215,154,0.44) = warm（+1 别名） @ 44%；rgba(246,215,154,0.24) = warm（+1 别名） @ 24% |
| `.sounding` | `background` | `linear-gradient(180deg, rgba(243,249,250,.17), rgba(243,249,250,.05))` | rgba(243,249,250,0.17) = paper（+1 别名） @ 17%；rgba(243,249,250,0.05) = paper（+1 别名） @ 5% |
| `.sounding::after` | `background` | `rgba(243,249,250,.22)` | rgba(243,249,250,0.22) = paper（+1 别名） @ 22% |
| `.song` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.rec` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.rec b` | `color` | `rgba(243,249,250,.76)` | rgba(243,249,250,0.76) = paper（+1 别名） @ 76% |
| `.st.ok` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.st.gap` | `color` | `var(--warm)` | --warm ⇒ #f6d79a = warm（+1 别名） |
| `.tm` | `color` | `rgba(169,199,207,.72)` | rgba(169,199,207,0.72) = muted（+3 别名） @ 72% |
| `.listen` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.tail .dot` | `background` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `.pages a` | `border` | `1px solid rgba(243,249,250,.16)` | rgba(243,249,250,0.16) = paper（+1 别名） @ 16% |
| `.pages a` | `color` | `rgba(243,249,250,.66)` | rgba(243,249,250,0.66) = paper（+1 别名） @ 66% |
| `.pages a[aria-current='page']` | `border-color` | `rgba(212,85,58,.62)` | rgba(212,85,58,0.62) = coral（+3 别名） @ 62% |
| `.pages a[aria-current='page']` | `background` | `rgba(212,85,58,.16)` | rgba(212,85,58,0.16) = coral（+3 别名） @ 16% |
| `.pages a[aria-current='page']` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.lowtide::before` | `background` | `rgba(127,209,217,.34)` | rgba(127,209,217,0.34) = glass（+2 别名） @ 34% |
| `.lowtide::after` | `background` | `rgba(127,209,217,.5)` | rgba(127,209,217,0.5) = glass（+2 别名） @ 50% |
| `.lowtide i` | `background` | `rgba(243,249,250,.18)` | rgba(243,249,250,0.18) = paper（+1 别名） @ 18% |
| `.empty h2` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.empty p` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.empty a` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |

### 5.4 圆角
| 选择器 | border-radius | 用在哪 |
| --- | --- | --- |
| `.seabed` | `50%` | `position:absolute; left:-1880px; top:806px; width:5200px; height:900px; border-radius:50%; border-top:1px soli` |
| `.bub i` | `50%` | `position:absolute; border-radius:50%; background:rgba(203,238,246,.3)` |
| `.cork` | `2px` | `position:absolute; left:50%; top:0; width:28px; height:18px; margin-left:-14px; border-radius:2px; background:` |
| `.pages a` | `2px` | `display:flex; align-items:center; justify-content:center; width:26px; height:22px; border:1px solid rgba(243,2` |
- SVG 的 `rx`/`ry`：`svg[2] svg.rings › g › ellipse rx="106"`、`svg[2] svg.rings › g › ellipse ry="42"`、`svg[2] svg.rings › g › ellipse rx="106"`、`svg[2] svg.rings › g › ellipse ry="42"`、`svg[2] svg.rings › g › ellipse rx="106"`、`svg[2] svg.rings › g › ellipse ry="42"`、`svg[2] svg.rings › g › ellipse rx="106"`、`svg[2] svg.rings › g › ellipse ry="42"`、`svg[2] svg.rings › g › ellipse rx="106"`、`svg[2] svg.rings › g › ellipse ry="42"`、`svg[2] svg.rings › g › ellipse rx="106"`、`svg[2] svg.rings › g › ellipse ry="42"`、`svg[2] svg.rings › ellipse rx="76"`、`svg[2] svg.rings › ellipse ry="30"`、`svg[2] svg.rings › ellipse rx="76"`、`svg[2] svg.rings › ellipse ry="30"`、`svg[2] svg.rings › ellipse rx="76"`、`svg[2] svg.rings › ellipse ry="30"`、`svg[2] svg.rings › ellipse rx="76"`、`svg[2] svg.rings › ellipse ry="30"`、`svg[2] svg.rings › ellipse rx="76"`、`svg[2] svg.rings › ellipse ry="30"`、`svg[2] svg.rings › ellipse rx="76"`、`svg[2] svg.rings › ellipse ry="30"`

### 5.5 渐变（stop 串原样）
**CSS 渐变声明**：
- `.sky` · `background`：`radial-gradient(118% 84% at 52% 106%, rgba(127,209,217,.078), rgba(127,209,217,0) 70%)`
- `.beam` · `background`：`linear-gradient(101deg, rgba(203,238,246,0) 26%, rgba(203,238,246,.05) 46%,
          rgba(228,247,252,.075) 53%, rgba(203,238,246,.03) 66%, rgba(203,238,246,0) 80%)`
- `.platter` · `background`：`repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)`
- `.platter` · `-webkit-mask-image`：`linear-gradient(180deg, rgba(255,255,255,.38) 0 310px, #fff 406px)`
- `.platter` · `mask-image`：`linear-gradient(180deg, rgba(255,255,255,.38) 0 310px, #fff 406px)`
- `.glint` · `background`：`linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)`
- `.glint` · `-webkit-mask-image`：`linear-gradient(180deg, rgba(255,255,255,.38) 0 310px, #fff 406px)`
- `.glint` · `mask-image`：`linear-gradient(180deg, rgba(255,255,255,.38) 0 310px, #fff 406px)`
- `.shafts` · `background`：`repeating-linear-gradient(99deg, rgba(203,238,246,.062) 0 5px, transparent 5px 104px),
          repeating-linear-gradient(103deg, rgba(203,238,246,.028) 0 18px, transparent 18px 268px)`
- `.shafts` · `-webkit-mask-image`：`linear-gradient(180deg, rgba(255,255,255,0) 0 358px, rgba(255,255,255,.9) 386px, rgba(255,255,255,.22) 100%)`
- `.shafts` · `mask-image`：`linear-gradient(180deg, rgba(255,255,255,0) 0 358px, rgba(255,255,255,.9) 386px, rgba(255,255,255,.22) 100%)`
- `.lit` · `background`：`linear-gradient(180deg, rgba(127,209,217,.085) 0%, rgba(127,209,217,0) 100%)`
- `.abyss` · `background`：`linear-gradient(180deg, rgba(5,15,20,0) 0%, rgba(3,11,16,.36) 52%, rgba(2,8,12,.64) 100%)`
- `.seabed` · `background`：`radial-gradient(46% 130px at 50% 0%, rgba(127,209,217,.06), rgba(127,209,217,0) 74%),
          linear-gradient(180deg, rgba(243,249,250,.018), rgba(243,249,250,0) 240px)`
- `.glass` · `background`：`linear-gradient(100deg, rgba(203,238,246,.46) 0 2.6%, rgba(10,48,60,.5) 17%,
          rgba(3,17,23,.82) 62%, rgba(127,209,217,.3) 96%, rgba(203,238,246,.34) 100%)`
- `.sub` · `background`：`linear-gradient(180deg, rgba(4,20,26,.3), rgba(2,10,15,.62))`
- `.cork` · `background`：`linear-gradient(180deg, rgba(246,215,154,.44), rgba(246,215,154,.24))`
- `.sounding` · `background`：`linear-gradient(180deg, rgba(243,249,250,.17), rgba(243,249,250,.05))`
**SVG `<defs>` 里的渐变（svg[1]，非 CSS 写法，stop 原样）**：
- `<linearGradient#wl> id="wl" x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse" · stops: `offset="0" stop-color="rgb(228,247,252)" stop-opacity=".16"` / `offset=".2" stop-color="rgb(203,238,246)" stop-opacity=".58"` / `offset=".44" stop-color="rgb(228,247,252)" stop-opacity=".74"` / `offset=".7" stop-color="rgb(203,238,246)" stop-opacity=".34"` / `offset="1" stop-color="rgb(228,247,252)" stop-opacity=".11"``
**SVG `<defs>` 里的渐变（svg[2]，非 CSS 写法，stop 原样）**：
- `<linearGradient#rip> id="rip" x1="0" y1="0" x2="0" y2="1" · stops: `offset="0" stop-color="rgb(127,209,217)" stop-opacity=".3"` / `offset=".52" stop-color="rgb(127,209,217)" stop-opacity=".62"` / `offset="1" stop-color="rgb(127,209,217)" stop-opacity=".9"``
- `<linearGradient#rip2> id="rip2" x1="0" y1="0" x2="0" y2="1" · stops: `offset="0" stop-color="rgb(127,209,217)" stop-opacity=".09"` / `offset="1" stop-color="rgb(127,209,217)" stop-opacity=".3"``

### 5.6 主块几何（`.clip` / `.page` 下顶层绝对定位块）
- 容器：`.clip`：box-sizing:border-box; margin:0; padding:0; position:absolute; inset:0; overflow:hidden; z-index:0
| 宿主 | 块 | 定位 | width | height | transform | z-index |
| --- | --- | --- | --- | --- | --- | --- |
| .clip | `div.sky` | `position:absolute; left:0; right:0; top:0` | — | 366px | — | — |
| .clip | `div.beam` | `position:absolute; left:0; right:0; top:0` | — | 366px | — | — |
| .clip | `div.platter` | `position:absolute; inset:0` | — | — | — | — |
| .clip | `div.glint` | `position:absolute; inset:0` | — | — | — | — |
| .clip | `div.shafts` | `position:absolute; left:0; right:0; top:0; bottom:0` | — | — | — | — |
| .clip | `div.lit` | `position:absolute; left:0; right:0; top:366px` | — | 186px | — | — |
| .clip | `div.abyss` | `position:absolute; left:0; right:0; top:366px; bottom:0` | — | — | — | — |
| .clip | `div.seabed` | `position:absolute; left:-1880px; top:806px` | 5200px | 900px | — | — |
| .clip | `svg.surface` | `position:absolute; left:0; top:0` | 1440 | 900 | — | — |
| .clip | `svg.rings` | `position:absolute; left:0; top:0` | 1440 | 900 | — | — |
- 更深处（不在上表里）的绝对定位块共 **113** 个：
  - `html › body › div.clip`：`position:absolute; inset:0`
  - `html › body › div.clip › div.sed › i`：`position:absolute; left:150px; top:817px; width:34px; height:1px`
  - `html › body › div.clip › div.sed › i`：`position:absolute; left:330px; top:811px; width:22px; height:1px`
  - `html › body › div.clip › div.sed › i`：`position:absolute; left:468px; top:808px; width:44px; height:1px`
  - `html › body › div.clip › div.sed › i`：`position:absolute; left:742px; top:806px; width:26px; height:1px`
  - `html › body › div.clip › div.sed › i`：`position:absolute; left:946px; top:808px; width:38px; height:1px`
  - `html › body › div.clip › div.sed › i`：`position:absolute; left:1168px; top:812px; width:20px; height:1px`
  - `html › body › div.clip › div.sed › i`：`position:absolute; left:1284px; top:817px; width:30px; height:1px`
  - `html › body › div.clip › div.bub › i`：`position:absolute; left:250px; top:712px; width:3px; height:3px`
  - `html › body › div.clip › div.bub › i`：`position:absolute; left:263px; top:682px; width:2px; height:2px`
  - `html › body › div.clip › div.bub › i`：`position:absolute; left:433px; top:626px; width:2.5px; height:2.5px`
  - `html › body › div.clip › div.bub › i`：`position:absolute; left:560px; top:754px; width:2px; height:2px`
  - …（其余 101 个同为装置内的分件，规则同上：`position:absolute` + 锚点）

### 5.7 SVG / 图形
- **svg[1]** `svg.surface` viewBox=`0 0 1440 900` width=1440 height=900
  - `svg.surface › path`：`d="M-40 360.33 L0 361.94 L40 363.72 L80 365.62 L120 367.53 L160 369.37 L200 371.05 L240 372.51 L280 373.68 L320 374.5 L360 374.93 L400 374.96 L440 374.59 L480 373.83 L520 372.71 L560 371.29 L600 369.63 L640 367.81 L680 365.9 L720 364 L760 362.19 L800 360.56 L840 359.16 L880 358.08 L920 357.36 L960 357.02 L1000 357.09 L1040 357.57 L1080 358.42 L1120 359.62 L1160 361.1 L1200 362.81 L1240 364.66 L1280 366.57 L1320 368.46 L1360 370.23 L1400 371.82 L1440 373.14 L1480 374.14"` `stroke="url(#wl)"` `stroke-width="26"` `opacity=".09"`
  - `svg.surface › path`：`d="M300 374.66 L360 374.93 L400 374.96 L440 374.59 L480 373.83 L520 372.71 L560 371.29 L600 369.63 L640 367.81 L680 365.9 L720 364 L760 362.19 L800 360.56 L840 359.16 L880 358.08 L920 357.36 L960 357.02"` `stroke="url(#wl)"` `stroke-width="30"` `opacity=".08"`
  - `svg.surface › g`：`stroke="rgb(228,247,252)"` `stroke-width="1.4"` · stroke="rgb(228,247,252)" = water-deep
  - `svg.surface › g › path`：`d="M226 369.53 L268 370.86"` `opacity=".42"`
  - `svg.surface › g › path`：`d="M300 376.64 L338 377.24"` `opacity=".24"`
  - `svg.surface › g › path`：`d="M446 377 L486 376.18"` `opacity=".32"`
  - `svg.surface › g › path`：`d="M500 370.81 L540 369.53"` `opacity=".2"`
  - `svg.surface › g › path`：`d="M664 364.17 L706 362.16"` `opacity=".4"`
  - `svg.surface › g › path`：`d="M712 366.88 L748 365.22"` `opacity=".22"`
  - `svg.surface › g › path`：`d="M884 355.49 L918 354.88"` `opacity=".34"`
  - `svg.surface › g › path`：`d="M1086 361.08 L1128 362.4"` `opacity=".24"`
  - `svg.surface › g › path`：`d="M1150 358.21 L1192 359.96"` `opacity=".3"`
  - `svg.surface › g › path`：`d="M1310 370.5 L1344 372.04"` `opacity=".22"`
  - `svg.surface › path`：`d="M-40 360.33 L0 361.94 L40 363.72 L80 365.62 L120 367.53 L160 369.37 L200 371.05 L240 372.51 L280 373.68 L320 374.5 L360 374.93 L400 374.96 L440 374.59 L480 373.83 L520 372.71 L560 371.29 L600 369.63 L640 367.81 L680 365.9 L720 364 L760 362.19 L800 360.56 L840 359.16 L880 358.08 L920 357.36 L960 357.02 L1000 357.09 L1040 357.57 L1080 358.42 L1120 359.62 L1160 361.1 L1200 362.81 L1240 364.66 L1280 366.57 L1320 368.46 L1360 370.23 L1400 371.82 L1440 373.14 L1480 374.14"` `stroke="url(#wl)"` `stroke-width="1.1"`
- **svg[2]** `svg.rings` viewBox=`0 0 1440 900` width=1440 height=900
  - `svg.rings › g`：`stroke="url(#rip2)"` `stroke-width="1"` `stroke-dasharray="26 24 26 24"` `stroke-dashoffset="-12"`
  - `svg.rings › g › ellipse`：`cx="183.3"` `cy="378.4"` `rx="106"` `ry="42"` `pathLength="100"`
  - `svg.rings › g › ellipse`：`cx="398"` `cy="383"` `rx="106"` `ry="42"` `pathLength="100"`
  - `svg.rings › g › ellipse`：`cx="612.7"` `cy="377.1"` `rx="106"` `ry="42"` `pathLength="100"`
  - `svg.rings › g › ellipse`：`cx="827.3"` `cy="367.6"` `rx="106"` `ry="42"` `pathLength="100"`
  - `svg.rings › g › ellipse`：`cx="1042"` `cy="365.6"` `rx="106"` `ry="42"` `pathLength="100"`
  - `svg.rings › g › ellipse`：`cx="1256.7"` `cy="373.5"` `rx="106"` `ry="42"` `pathLength="100"`
  - `svg.rings › ellipse`：`cx="183.3"` `cy="374.4"` `rx="76"` `ry="30"` `pathLength="100"` `stroke="url(#rip)"` `stroke-width="1.5"` `stroke-dasharray="18 7"`
  - `svg.rings › ellipse`：`cx="398"` `cy="379"` `rx="76"` `ry="30"` `pathLength="100"` `stroke="url(#rip)"` `stroke-width="1.5"` `stroke-dasharray="18 7"`
  - `svg.rings › ellipse`：`cx="612.7"` `cy="373.1"` `rx="76"` `ry="30"` `pathLength="100"` `stroke="url(#rip)"` `stroke-width="1.5"` `stroke-dasharray="18 7"`
  - `svg.rings › ellipse`：`cx="827.3"` `cy="363.6"` `rx="76"` `ry="30"` `pathLength="100"` `stroke="url(#rip)"` `stroke-width="1.5"` `stroke-dasharray="18 7"`
  - `svg.rings › ellipse`：`cx="1042"` `cy="361.6"` `rx="76"` `ry="30"` `pathLength="100"` `stroke="url(#rip)"` `stroke-width="1.5"` `stroke-dasharray="18 7"`
  - `svg.rings › ellipse`：`cx="1256.7"` `cy="369.5"` `rx="76"` `ry="30"` `pathLength="100"` `stroke="url(#rip)"` `stroke-width="1.5"` `stroke-dasharray="18 7"`

- **全页 transform（含 rotate 角度）**：
  - `.bottle`：`rotate(var(--tilt))` / transform-origin:`50% 77.4%`

### 5.8 文案（逐字，文档顺序；`⟨br⟩` = 源码 `<br />`）
001. `body › main › div.topbar › p.meta` → "音乐漂流瓶 · MUSIC DRIFT"
002. `body › main › div.topbar › p.meta` → "CATALOGUE OF THE OPEN SEA"
003. `body › main › header.hero › h1` → "公海大厅"
004. `body › main › header.hero › p.lede` → "聆听那些经历漂流与合唱、完全绽放的终极乐章。作品一旦入海就不再漂流 —— 这里只能听，不能接。"
005. `body › main › div.zones › p.meta` → "分区 · SECTIONS"
006. `main › div.zones › ul › li` → "完整作品"
007. `div.zones › ul › li › span.mono` → "39"
008. `main › div.zones › ul › li` → "等待接力"
009. `div.zones › ul › li › span.mono` → "12"
010. `ul.fleet › li.col › div.entry › p.song` → "占位曲目 · 一"
011. `ul.fleet › li.col › div.entry › p.rec` → "已录"
012. `li.col › div.entry › p.rec › b.mono` → "4"
013. `ul.fleet › li.col › div.entry › p.rec` → "/"
014. `li.col › div.entry › p.rec › b.mono` → "4"
015. `ul.fleet › li.col › div.entry › p.rec` → "段"
016. `ul.fleet › li.col › div.entry › p.st` → "全部段位都有人唱过"
017. `ul.fleet › li.col › div.entry › p.tm` → "最近更新"
018. `li.col › div.entry › p.tm › span.mono` → "2026/9/23 20:38"
019. `ul.fleet › li.col › div.entry › a.listen` → "听这支作品"
020. `ul.fleet › li.col › div.entry › p.song` → "占位曲目 · 二"
021. `ul.fleet › li.col › div.entry › p.rec` → "已录"
022. `li.col › div.entry › p.rec › b.mono` → "4"
023. `ul.fleet › li.col › div.entry › p.rec` → "/"
024. `li.col › div.entry › p.rec › b.mono` → "4"
025. `ul.fleet › li.col › div.entry › p.rec` → "段"
026. `ul.fleet › li.col › div.entry › p.st` → "全部段位都有人唱过"
027. `ul.fleet › li.col › div.entry › p.tm` → "最近更新"
028. `li.col › div.entry › p.tm › span.mono` → "2026/9/22 11:04"
029. `ul.fleet › li.col › div.entry › a.listen` → "听这支作品"
030. `ul.fleet › li.col › div.entry › p.song` → "占位曲目 · 三"
031. `ul.fleet › li.col › div.entry › p.rec` → "已录"
032. `li.col › div.entry › p.rec › b.mono` → "4"
033. `ul.fleet › li.col › div.entry › p.rec` → "/"
034. `li.col › div.entry › p.rec › b.mono` → "4"
035. `ul.fleet › li.col › div.entry › p.rec` → "段"
036. `ul.fleet › li.col › div.entry › p.st` → "全部段位都有人唱过"
037. `ul.fleet › li.col › div.entry › p.tm` → "最近更新"
038. `li.col › div.entry › p.tm › span.mono` → "2026/9/21 08:47"
039. `ul.fleet › li.col › div.entry › a.listen` → "听这支作品"
040. `ul.fleet › li.col › div.entry › p.song` → "占位曲目 · 四"
041. `ul.fleet › li.col › div.entry › p.rec` → "已录"
042. `li.col › div.entry › p.rec › b.mono` → "4"
043. `ul.fleet › li.col › div.entry › p.rec` → "/"
044. `li.col › div.entry › p.rec › b.mono` → "4"
045. `ul.fleet › li.col › div.entry › p.rec` → "段"
046. `ul.fleet › li.col › div.entry › p.st` → "全部段位都有人唱过"
047. `ul.fleet › li.col › div.entry › p.tm` → "最近更新"
048. `li.col › div.entry › p.tm › span.mono` → "2026/9/19 22:12"
049. `ul.fleet › li.col › div.entry › a.listen` → "听这支作品"
050. `ul.fleet › li.col › div.entry › p.song` → "占位曲目 · 五"
051. `ul.fleet › li.col › div.entry › p.rec` → "已录"
052. `li.col › div.entry › p.rec › b.mono` → "4"
053. `ul.fleet › li.col › div.entry › p.rec` → "/"
054. `li.col › div.entry › p.rec › b.mono` → "4"
055. `ul.fleet › li.col › div.entry › p.rec` → "段"
056. `ul.fleet › li.col › div.entry › p.st` → "全部段位都有人唱过"
057. `ul.fleet › li.col › div.entry › p.tm` → "最近更新"
058. `li.col › div.entry › p.tm › span.mono` → "2026/9/18 14:30"
059. `ul.fleet › li.col › div.entry › a.listen` → "听这支作品"
060. `ul.fleet › li.col › div.entry › p.song` → "占位曲目 · 六"
061. `ul.fleet › li.col › div.entry › p.rec` → "已录"
062. `li.col › div.entry › p.rec › b.mono` → "4"
063. `ul.fleet › li.col › div.entry › p.rec` → "/"
064. `li.col › div.entry › p.rec › b.mono` → "4"
065. `ul.fleet › li.col › div.entry › p.rec` → "段"
066. `ul.fleet › li.col › div.entry › p.st` → "全部段位都有人唱过"
067. `ul.fleet › li.col › div.entry › p.tm` → "最近更新"
068. `li.col › div.entry › p.tm › span.mono` → "2026/9/17 19:55"
069. `ul.fleet › li.col › div.entry › a.listen` → "听这支作品"
070. `ul.fleet › li.col › div.entry › p.song` → "占位曲目 · 七"
071. `ul.fleet › li.col › div.entry › p.rec` → "已录"
072. `li.col › div.entry › p.rec › b.mono` → "4"
073. `ul.fleet › li.col › div.entry › p.rec` → "/"
074. `li.col › div.entry › p.rec › b.mono` → "4"
075. `ul.fleet › li.col › div.entry › p.rec` → "段"
076. `ul.fleet › li.col › div.entry › p.st` → "全部段位都有人唱过"
077. `ul.fleet › li.col › div.entry › p.tm` → "最近更新"
078. `li.col › div.entry › p.tm › span.mono` → "2026/9/16 10:02"
079. `ul.fleet › li.col › div.entry › a.listen` → "听这支作品"
080. `ul.fleet › li.col › div.entry › p.song` → "占位曲目 · 八"
081. `ul.fleet › li.col › div.entry › p.rec` → "已录"
082. `li.col › div.entry › p.rec › b.mono` → "3"
083. `ul.fleet › li.col › div.entry › p.rec` → "/"
084. `li.col › div.entry › p.rec › b.mono` → "4"
085. `ul.fleet › li.col › div.entry › p.rec` → "段"
086. `ul.fleet › li.col › div.entry › p.st` → "缺第 3 段（成品里这段时间是静音）"
087. `ul.fleet › li.col › div.entry › p.tm` → "最近更新"
088. `li.col › div.entry › p.tm › span.mono` → "2026/9/15 21:40"
089. `ul.fleet › li.col › div.entry › a.listen` → "听这支作品"
090. `ul.fleet › li.col › div.entry › p.song` → "占位曲目 · 九"
091. `ul.fleet › li.col › div.entry › p.rec` → "已录"
092. `li.col › div.entry › p.rec › b.mono` → "2"
093. `ul.fleet › li.col › div.entry › p.rec` → "/"
094. `li.col › div.entry › p.rec › b.mono` → "4"
095. `ul.fleet › li.col › div.entry › p.rec` → "段"
096. `ul.fleet › li.col › div.entry › p.st` → "缺第 2、3 段（成品里这段时间是静音）"
097. `ul.fleet › li.col › div.entry › p.tm` → "最近更新"
098. `li.col › div.entry › p.tm › span.mono` → "2026/9/14 09:18"
099. `ul.fleet › li.col › div.entry › a.listen` → "听这支作品"
100. `body › main › div.empty › h2` → "还没有完整的作品"
101. `body › main › div.empty › p` → "完整作品要等每个段位都有人唱过之后，由持有者送进公海。"
102. `body › main › div.empty › a` → "去河道捞一个"
103. `body › main › div.empty › h2` → "没有等待接力的作品"
104. `body › main › div.empty › p` → "这里的作品都还差几个段位，等着有人补上——补完才会进完整作品区。"
105. `body › main › div.empty › a` → "去河道捞一个"
106. `body › main › footer.foot › p.meta` → "完整作品 · 本页"
107. `main › footer.foot › p.meta › span.mono` → "6"
108. `body › main › footer.foot › p.meta` → "支"
109. `main › footer.foot › nav.pages › span.meta` → "PAGE"
110. `nav.pages › ol › li › a` → "1"
111. `nav.pages › ol › li › a` → "2"
112. `nav.pages › ol › li › a` → "3"
113. `main › footer.foot › nav.pages › span.meta` → "第 1 页 · 后面还有更多"

### 5.9 本页的「装置」
> 静海水线 + 六支到岸的瓶；瓶口涟漪内圈 4 段断弧＝4 个段位（断＝缺口）


## 6. 公海作品详情 · `p-sea-detail-record.html` → `/sea/:id`
- **它是什么**：公海单件作品：播放器 + 4 段链 + 参与者 + 入海时间
- **画布**：`html,body` = 1440×900（`overflow:hidden`）；页面底色 `--ink`

### 6.2 排版（选择器 → 值）
| 选择器 | font-size | letter-spacing | line-height | font-weight |
| --- | --- | --- | --- | --- |
| `.cat` | 11px | .24em | — | — |
| `.crumb` | 14px | — | — | — |
| `.state` | 12px | .1em | — | — |
| `h1` | 58px | — | 1 | 700 |
| `.stampno` | 26px | — | — | — |
| `.meta` | 15px | — | 22px | — |
| `.gapnote` | 15px | — | 1.85 | — |
| `.deck-h h2` | 17px | — | — | 700 |
| `.refl` | 12px | .22em | — | — |
| `.voidlabel` | 13.5px | .06em | — | — |
| `.marks .d` | 13px | — | — | — |
| `.col-h h2` | 17px | — | — | 700 |
| `.hint` | 13px | — | — | — |
| `li.row .mk` | 16px | .06em | — | — |
| `li.row .desc` | 15px | — | — | — |
| `li.row .desc span` | 13px | — | — | — |
| `li.row .dur` | 13px | — | — | — |
| `li.row .act` | 13px | — | — | — |
| `li.row[data-state='gap'] .desc em` | 13px | — | — | — |
| `ul.credits .code` | 15px | .04em | — | — |
| `ul.credits .at` | 13px | — | — | — |
| `.mixbox p` | 15px | — | 1.85 | — |
| `.now .line` | 17px | — | — | — |
| `.now .line b` | — | — | — | 700 |
| `.time` | 32px | .02em | — | — |
| `.time .of` | 16px | — | — | — |
| `.votes` | 13px | — | — | — |
| `.ctrl` | 14px | .06em | — | — |
| `.etch` | 10px | .3em | — | — |

### 6.3 颜色（选择器 → 值 · 契约状态）
| 选择器 | 属性 | 声明原文 | 解析（hex/rgba → 契约 token） |
| --- | --- | --- | --- |
| `:root` | `--ink` | `#050f14` | #050f14 = ink（+1 别名） |
| `:root` | `--paper` | `#f3f9fa` | #f3f9fa = paper（+1 别名） |
| `:root` | `--muted` | `#a9c7cf` | #a9c7cf = muted（+3 别名） |
| `:root` | `--glass` | `#7fd1d9` | #7fd1d9 = glass（+2 别名） |
| `:root` | `--coral` | `#d4553a` | #d4553a = coral（+3 别名） |
| `:root` | `--warm` | `#f6d79a` | #f6d79a = warm（+1 别名） |
| `:root` | `--line` | `rgba(243,249,250,.13)` | rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `body` | `background` | `var(--ink)` | --ink ⇒ #050f14 = ink（+1 别名） |
| `body` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.surface` | `background` | `repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(201,221,219,.05) 0 30%, transparent 68%)` | rgba(216,243,246,0.055) = line（+1 别名） @ 5.5%；rgba(201,221,219,0.05) = 未收进契约（基色 #c9dddb）；transparent（透明，非色值） |
| `.water` | `background` | `linear-gradient(180deg,
          rgba(10,52,66,.30) 0%, rgba(10,52,66,.16) 21%, rgba(8,38,50,.04) 33%,
          rgba(5,28,38,.34) 45%, rgba(3,14,20,.62) 100%)` | rgba(10,52,66,0.3) = 未收进契约（基色 #0a3442）；rgba(10,52,66,0.16) = 未收进契约（基色 #0a3442）；rgba(8,38,50,0.04) = 未收进契约（基色 #082632）；rgba(5,28,38,0.34) = 未收进契约（基色 #051c26）；rgba(3,14,20,0.62) = 未收进契约（基色 #030e14） |
| `.glint` | `background` | `linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)` | rgba(228,247,252,0.045) = water-deep @ 4.5%；rgba(228,247,252,0.065) = water-deep @ 6.5%；rgba(228,247,252,0.028) = water-deep @ 2.8%；transparent（透明，非色值） |
| `.shaft b` | `-webkit-mask-image` | `linear-gradient(90deg, rgba(255,255,255,0), #fff 34%, #fff 66%, rgba(255,255,255,0))` | rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；#ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.shaft b` | `mask-image` | `linear-gradient(90deg, rgba(255,255,255,0), #fff 34%, #fff 66%, rgba(255,255,255,0))` | rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；#ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.sh1` | `background` | `linear-gradient(180deg, rgba(228,247,252,.105), rgba(228,247,252,.05) 44%, rgba(228,247,252,0) 88%)` | rgba(228,247,252,0.105) = water-deep @ 10.5%；rgba(228,247,252,0.05) = water-deep @ 5%；rgba(228,247,252,0) = water-deep @ 0% |
| `.sh2` | `background` | `linear-gradient(180deg, rgba(228,247,252,.075), rgba(228,247,252,.028) 46%, rgba(228,247,252,0) 82%)` | rgba(228,247,252,0.075) = water-deep @ 7.5%；rgba(228,247,252,0.028) = water-deep @ 2.8%；rgba(228,247,252,0) = water-deep @ 0% |
| `.sh3` | `background` | `linear-gradient(180deg, rgba(228,247,252,.05), rgba(228,247,252,.018) 50%, rgba(228,247,252,0) 86%)` | rgba(228,247,252,0.05) = water-deep @ 5%；rgba(228,247,252,0.018) = water-deep @ 1.8%；rgba(228,247,252,0) = water-deep @ 0% |
| `.hit` | `background` | `radial-gradient(50% 50% at 50% 50%, rgba(127,209,217,.15), rgba(127,209,217,0) 72%)` | rgba(127,209,217,0.15) = glass（+2 别名） @ 15%；rgba(127,209,217,0) = glass（+2 别名） @ 0% |
| `.caustic` | `background` | `radial-gradient(50% 50% at 50% 50%, rgba(127,209,217,.10), rgba(127,209,217,0) 74%)` | rgba(127,209,217,0.1) = glass（+2 别名） @ 10%；rgba(127,209,217,0) = glass（+2 别名） @ 0% |
| `.bed` | `background-image` | `radial-gradient(rgba(169,199,207,.55) .5px, transparent .8px)` | rgba(169,199,207,0.55) = muted（+3 别名） @ 55%；transparent（透明，非色值） |
| `.bed` | `-webkit-mask-image` | `linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,.3) 40%, #fff)` | rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.3) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；#ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.bed` | `mask-image` | `linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,.3) 40%, #fff)` | rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.3) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；#ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.bedline` | `background` | `linear-gradient(90deg, transparent 3%, rgba(169,199,207,.18) 28%, rgba(169,199,207,.28) 68%, transparent 97%)` | rgba(169,199,207,0.18) = muted（+3 别名） @ 18%；rgba(169,199,207,0.28) = muted（+3 别名） @ 28%；transparent（透明，非色值） |
| `.bub` | `border` | `1px solid rgba(216,243,246,.26)` | rgba(216,243,246,0.26) = line（+1 别名） @ 26% |
| `.shore` | `-webkit-mask-image` | `linear-gradient(90deg, rgba(255,255,255,0) 0, rgba(255,255,255,.35) 5%, #fff 14%, #fff 100%),
          linear-gradient(180deg, #fff 0 40%, rgba(255,255,255,.92) 44%, rgba(255,255,255,.66) 54%, rgba(255,255,255,.13) 74%, rgba(255,255,255,0) 84%)` | rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.35) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；#ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.92) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.66) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.13) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.shore` | `mask-image` | `linear-gradient(90deg, rgba(255,255,255,0) 0, rgba(255,255,255,.35) 5%, #fff 14%, #fff 100%),
          linear-gradient(180deg, #fff 0 40%, rgba(255,255,255,.92) 44%, rgba(255,255,255,.66) 54%, rgba(255,255,255,.13) 74%, rgba(255,255,255,0) 84%)` | rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.35) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；#ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.92) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.66) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.13) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.shore` | `background` | `radial-gradient(64% 40% at 34% 33%, rgba(246,215,154,.1), rgba(246,215,154,0) 72%),
          linear-gradient(0deg, rgba(246,215,154,.2) 0, rgba(246,215,154,.32) 100%)` | rgba(246,215,154,0.1) = warm（+1 别名） @ 10%；rgba(246,215,154,0) = warm（+1 别名） @ 0%；rgba(246,215,154,0.2) = warm（+1 别名） @ 20%；rgba(246,215,154,0.32) = warm（+1 别名） @ 32% |
| `.shoreline` | `background` | `linear-gradient(90deg, rgba(216,243,246,0) 0%, rgba(216,243,246,.5) 12%,
          rgba(216,243,246,.72) 42%, rgba(216,243,246,.5) 72%, rgba(216,243,246,.22) 100%)` | rgba(216,243,246,0) = line（+1 别名） @ 0%；rgba(216,243,246,0.5) = line（+1 别名） @ 50%；rgba(216,243,246,0.72) = line（+1 别名） @ 72%；rgba(216,243,246,0.22) = line（+1 别名） @ 22% |
| `.wetsand` | `background-image` | `radial-gradient(58% 46% at 26% 42%, rgba(5,15,20,.2), rgba(5,15,20,0) 74%),
          radial-gradient(52% 78% at 78% 38%, rgba(5,15,20,.18), rgba(5,15,20,0) 76%),
          linear-gradient(90deg, rgba(246,215,154,.32), rgba(246,215,154,.42) 44%, rgba(246,215,154,.22))` | rgba(5,15,20,0.2) = ink（+1 别名） @ 20%；rgba(5,15,20,0) = ink（+1 别名） @ 0%；rgba(5,15,20,0.18) = ink（+1 别名） @ 18%；rgba(246,215,154,0.32) = warm（+1 别名） @ 32%；rgba(246,215,154,0.42) = warm（+1 别名） @ 42%；rgba(246,215,154,0.22) = warm（+1 别名） @ 22% |
| `.wetsand` | `-webkit-mask-image` | `linear-gradient(180deg, #fff, rgba(255,255,255,0) 92%)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.wetsand` | `mask-image` | `linear-gradient(180deg, #fff, rgba(255,255,255,0) 92%)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.sand1` | `background` | `linear-gradient(90deg, rgba(246,215,154,.26), rgba(246,215,154,.2) 46%, rgba(246,215,154,.09))` | rgba(246,215,154,0.26) = warm（+1 别名） @ 26%；rgba(246,215,154,0.2) = warm（+1 别名） @ 20%；rgba(246,215,154,0.09) = warm（+1 别名） @ 9% |
| `.sand2` | `background` | `linear-gradient(90deg, rgba(246,215,154,.16), rgba(246,215,154,.11))` | rgba(246,215,154,0.16) = warm（+1 别名） @ 16%；rgba(246,215,154,0.11) = warm（+1 别名） @ 11% |
| `.sdot` | `background-image` | `radial-gradient(rgba(246,215,154,.3) .5px, rgba(246,215,154,0) .9px),
          radial-gradient(rgba(246,215,154,.19) .5px, rgba(246,215,154,0) .9px),
          radial-gradient(rgba(246,215,154,.13) .5px, rgba(246,215,154,0) .9px)` | rgba(246,215,154,0.3) = warm（+1 别名） @ 30%；rgba(246,215,154,0) = warm（+1 别名） @ 0%；rgba(246,215,154,0.19) = warm（+1 别名） @ 19%；rgba(246,215,154,0.13) = warm（+1 别名） @ 13% |
| `.sdot` | `-webkit-mask-image` | `linear-gradient(90deg, rgba(255,255,255,0), #fff 30%), linear-gradient(180deg, #fff 0 42%, rgba(255,255,255,.24) 74%, rgba(255,255,255,0) 100%)` | rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；#ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.24) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.sdot` | `mask-image` | `linear-gradient(90deg, rgba(255,255,255,0), #fff 30%), linear-gradient(180deg, #fff 0 42%, rgba(255,255,255,.24) 74%, rgba(255,255,255,0) 100%)` | rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；#ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.24) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.strata` | `background` | `repeating-linear-gradient(177.6deg,
          rgba(240,204,142,.13) 0 2px,
          rgba(240,204,142,.06) 2px 9px,
          rgba(5,15,20,.22) 9px 14px,
          rgba(226,205,158,.05) 14px 25px)` | rgba(240,204,142,0.13) = 未收进契约（基色 #f0cc8e）；rgba(240,204,142,0.06) = 未收进契约（基色 #f0cc8e）；rgba(5,15,20,0.22) = ink（+1 别名） @ 22%；rgba(226,205,158,0.05) = 未收进契约（基色 #e2cd9e） |
| `.strata` | `-webkit-mask-image` | `linear-gradient(180deg, rgba(255,255,255,0) 53%, rgba(255,255,255,.55) 58%, #fff 64%, rgba(255,255,255,.4) 82%, rgba(255,255,255,0) 96%),
          linear-gradient(90deg, rgba(255,255,255,0) 0, #fff 26%)` | rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.55) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；#ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.4) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.strata` | `mask-image` | `linear-gradient(180deg, rgba(255,255,255,0) 53%, rgba(255,255,255,.55) 58%, #fff 64%, rgba(255,255,255,.4) 82%, rgba(255,255,255,0) 96%),
          linear-gradient(90deg, rgba(255,255,255,0) 0, #fff 26%)` | rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.55) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；#ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.4) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.stratatop` | `background` | `linear-gradient(90deg, rgba(5,15,20,.42), rgba(5,15,20,.3) 52%, rgba(5,15,20,.14))` | rgba(5,15,20,0.42) = ink（+1 别名） @ 42%；rgba(5,15,20,0.3) = ink（+1 别名） @ 30%；rgba(5,15,20,0.14) = ink（+1 别名） @ 14% |
| `.gravel` | `background-image` | `radial-gradient(rgba(246,215,154,.24) 1.2px, rgba(246,215,154,0) 2.2px),
          radial-gradient(rgba(246,215,154,.26) 1.4px, rgba(246,215,154,0) 2.4px)` | rgba(246,215,154,0.24) = warm（+1 别名） @ 24%；rgba(246,215,154,0) = warm（+1 别名） @ 0%；rgba(246,215,154,0.26) = warm（+1 别名） @ 26% |
| `.gravel` | `-webkit-mask-image` | `linear-gradient(90deg, rgba(255,255,255,0), #fff 30%), linear-gradient(180deg, rgba(255,255,255,0) 0 42%, #fff 46%, rgba(255,255,255,.3) 52%, rgba(255,255,255,0) 59%)` | rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；#ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.3) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.gravel` | `mask-image` | `linear-gradient(90deg, rgba(255,255,255,0), #fff 30%), linear-gradient(180deg, rgba(255,255,255,0) 0 42%, #fff 46%, rgba(255,255,255,.3) 52%, rgba(255,255,255,0) 59%)` | rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；#ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.3) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.cobble` | `border` | `1px solid rgba(5,15,20,.34)` | rgba(5,15,20,0.34) = ink（+1 别名） @ 34% |
| `.cobble` | `background` | `radial-gradient(50% 50% at 40% 32%, rgba(246,215,154,.4), rgba(150,176,180,.2) 78%)` | rgba(246,215,154,0.4) = warm（+1 别名） @ 40%；rgba(150,176,180,0.2) = 未收进契约（基色 #96b0b4） |
| `.cobble` | `box-shadow` | `0 1px 0 rgba(5,15,20,.3)` | rgba(5,15,20,0.3) = ink（+1 别名） @ 30% |
| `.cat` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.crumb a` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.state` | `color` | `var(--warm)` | --warm ⇒ #f6d79a = warm（+1 别名） |
| `.state` | `border` | `1px solid rgba(246,215,154,.32)` | rgba(246,215,154,0.32) = warm（+1 别名） @ 32% |
| `.state` | `background` | `rgba(246,215,154,.08)` | rgba(246,215,154,0.08) = warm（+1 别名） @ 8% |
| `.stampno` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.meta` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.meta .warm` | `color` | `var(--warm)` | --warm ⇒ #f6d79a = warm（+1 别名） |
| `.gapnote` | `border-left` | `2px solid rgba(246,215,154,.55)` | rgba(246,215,154,0.55) = warm（+1 别名） @ 55% |
| `.gapnote` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.deck-h h2` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.band` | `background-image` | `linear-gradient(90deg, rgba(243,249,250,.13) 0 76%, rgba(243,249,250,0) 88%),
          linear-gradient(90deg, rgba(243,249,250,.13) 0 76%, rgba(243,249,250,0) 88%)` | rgba(243,249,250,0.13) = paper（+1 别名） @ 13%；rgba(243,249,250,0) = paper（+1 别名） @ 0% |
| `.band::before` | `background` | `linear-gradient(180deg, rgba(5,15,20,.42), rgba(5,15,20,.05) 40%, rgba(5,15,20,.30))` | rgba(5,15,20,0.42) = ink（+1 别名） @ 42%；rgba(5,15,20,0.05) = ink（+1 别名） @ 5%；rgba(5,15,20,0.3) = ink（+1 别名） @ 30% |
| `.band::before` | `-webkit-mask-image` | `linear-gradient(90deg, #fff 0 76%, rgba(255,255,255,0) 88%)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.band::before` | `mask-image` | `linear-gradient(90deg, #fff 0 76%, rgba(255,255,255,0) 88%)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.sheen` | `background` | `radial-gradient(58% 100% at 46% 100%, rgba(127,209,217,.11), rgba(127,209,217,0) 74%)` | rgba(127,209,217,0.11) = glass（+2 别名） @ 11%；rgba(127,209,217,0) = glass（+2 别名） @ 0% |
| `.groove::after` | `background` | `linear-gradient(90deg, rgba(216,243,246,0) 0%, rgba(216,243,246,.15) 12%,
          rgba(216,243,246,.16) 82%, rgba(216,243,246,.05) 100%)` | rgba(216,243,246,0) = line（+1 别名） @ 0%；rgba(216,243,246,0.15) = line（+1 别名） @ 15%；rgba(216,243,246,0.16) = line（+1 别名） @ 16%；rgba(216,243,246,0.05) = line（+1 别名） @ 5% |
| `.seg.on` | `border-top` | `1px solid rgba(216,243,246,.38)` | rgba(216,243,246,0.38) = line（+1 别名） @ 38% |
| `.seg.on` | `border-bottom` | `1px solid rgba(216,243,246,.38)` | rgba(216,243,246,0.38) = line（+1 别名） @ 38% |
| `.seg.off` | `border-top` | `1px solid rgba(216,243,246,.15)` | rgba(216,243,246,0.15) = line（+1 别名） @ 15% |
| `.seg.off` | `border-bottom` | `1px solid rgba(216,243,246,.15)` | rgba(216,243,246,0.15) = line（+1 别名） @ 15% |
| `.core` | `background` | `repeating-linear-gradient(90deg, rgba(127,209,217,.78) 0 1px, rgba(127,209,217,.16) 1px 3.4px)` | rgba(127,209,217,0.78) = glass（+2 别名） @ 78%；rgba(127,209,217,0.16) = glass（+2 别名） @ 16% |
| `.seg.on .core` | `-webkit-mask-image` | `linear-gradient(90deg, rgba(255,255,255,.58), #fff 28%, rgba(255,255,255,.66) 60%, #fff 88%)` | rgba(255,255,255,0.58) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；#ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.66) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.seg.on .core` | `mask-image` | `linear-gradient(90deg, rgba(255,255,255,.58), #fff 28%, rgba(255,255,255,.66) 60%, #fff 88%)` | rgba(255,255,255,0.58) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；#ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.66) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.seg.off .core` | `background` | `repeating-linear-gradient(90deg, rgba(169,199,207,.17) 0 1px, rgba(169,199,207,.03) 1px 3.4px)` | rgba(169,199,207,0.17) = muted（+3 别名） @ 17%；rgba(169,199,207,0.03) = muted（+3 别名） @ 3% |
| `.dull` | `background` | `linear-gradient(90deg, rgba(5,15,20,0), rgba(5,15,20,.44) 8%, rgba(5,15,20,.64) 100%)` | rgba(5,15,20,0) = ink（+1 别名） @ 0%；rgba(5,15,20,0.44) = ink（+1 别名） @ 44%；rgba(5,15,20,0.64) = ink（+1 别名） @ 64% |
| `.refl` | `color` | `rgba(169,199,207,.62)` | rgba(169,199,207,0.62) = muted（+3 别名） @ 62% |
| `.refl` | `-webkit-mask-image` | `linear-gradient(0deg, #fff, rgba(255,255,255,.2) 62%, rgba(255,255,255,0) 96%)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.2) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.refl` | `mask-image` | `linear-gradient(0deg, #fff, rgba(255,255,255,.2) 62%, rgba(255,255,255,0) 96%)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.2) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.seg.off .refl` | `color` | `rgba(169,199,207,.4)` | rgba(169,199,207,0.4) = muted（+3 别名） @ 40% |
| `.seg.empty` | `border-top` | `1px dashed rgba(246,215,154,.7)` | rgba(246,215,154,0.7) = warm（+1 别名） @ 70% |
| `.seg.empty` | `border-bottom` | `1px dashed rgba(246,215,154,.7)` | rgba(246,215,154,0.7) = warm（+1 别名） @ 70% |
| `.seg.empty` | `-webkit-mask-image` | `linear-gradient(90deg, #fff 0 29%, rgba(255,255,255,0) 29% 71%, #fff 71% 100%)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.seg.empty` | `mask-image` | `linear-gradient(90deg, #fff 0 29%, rgba(255,255,255,0) 29% 71%, #fff 71% 100%)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.cut` | `background` | `rgba(246,215,154,.8)` | rgba(246,215,154,0.8) = warm（+1 别名） @ 80% |
| `.voidwash` | `background` | `rgba(246,215,154,.05)` | rgba(246,215,154,0.05) = warm（+1 别名） @ 5% |
| `.sep` | `background` | `rgba(243,249,250,.09)` | rgba(243,249,250,0.09) = paper（+1 别名） @ 9% |
| `.voidlabel` | `color` | `var(--warm)` | --warm ⇒ #f6d79a = warm（+1 别名） |
| `.marks .d` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.marks .d.warm` | `color` | `var(--warm)` | --warm ⇒ #f6d79a = warm（+1 别名） |
| `.flead` | `background` | `rgba(243,249,250,.20)` | rgba(243,249,250,0.2) = paper（+1 别名） @ 20% |
| `.bglow` | `background` | `radial-gradient(50% 50% at 50% 50%, rgba(246,215,154,.24), rgba(246,215,154,0) 78%)` | rgba(246,215,154,0.24) = warm（+1 别名） @ 24%；rgba(246,215,154,0) = warm（+1 别名） @ 0% |
| `.b-cork` | `border` | `1px solid rgba(246,215,154,.6)` | rgba(246,215,154,0.6) = warm（+1 别名） @ 60% |
| `.b-cork` | `background` | `linear-gradient(180deg, rgba(246,215,154,.72), rgba(246,215,154,.38))` | rgba(246,215,154,0.72) = warm（+1 别名） @ 72%；rgba(246,215,154,0.38) = warm（+1 别名） @ 38% |
| `.corkmark` | `background` | `radial-gradient(50% 50% at 50% 50%, rgba(5,15,20,.62), rgba(5,15,20,0) 74%)` | rgba(5,15,20,0.62) = ink（+1 别名） @ 62%；rgba(5,15,20,0) = ink（+1 别名） @ 0% |
| `.btmark` | `background` | `radial-gradient(50% 50% at 50% 50%, rgba(5,15,20,.56), rgba(5,15,20,.2) 56%, rgba(5,15,20,0) 84%)` | rgba(5,15,20,0.56) = ink（+1 别名） @ 56%；rgba(5,15,20,0.2) = ink（+1 别名） @ 20%；rgba(5,15,20,0) = ink（+1 别名） @ 0% |
| `.bpress` | `background` | `radial-gradient(50% 50% at 50% 50%, rgba(5,15,20,.62), rgba(5,15,20,.16) 60%, rgba(5,15,20,0) 82%)` | rgba(5,15,20,0.62) = ink（+1 别名） @ 62%；rgba(5,15,20,0.16) = ink（+1 别名） @ 16%；rgba(5,15,20,0) = ink（+1 别名） @ 0% |
| `.rip1` | `border` | `1px solid rgba(127,209,217,.28)` | rgba(127,209,217,0.28) = glass（+2 别名） @ 28% |
| `.rip2` | `border` | `1px solid rgba(127,209,217,.13)` | rgba(127,209,217,0.13) = glass（+2 别名） @ 13% |
| `.arm` | `background` | `linear-gradient(90deg, rgba(243,249,250,.26), rgba(243,249,250,.5))` | rgba(243,249,250,0.26) = paper（+1 别名） @ 26%；rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.pivot` | `border` | `1px solid rgba(228,249,252,.34)` | rgba(228,249,252,0.34) = 未收进契约（基色 #e4f9fc） |
| `.pivot::before` | `border` | `1px solid rgba(228,249,252,.22)` | rgba(228,249,252,0.22) = 未收进契约（基色 #e4f9fc） |
| `.pivot::after` | `background` | `rgba(127,209,217,.6)` | rgba(127,209,217,0.6) = glass（+2 别名） @ 60% |
| `.lift` | `background` | `rgba(243,249,250,.28)` | rgba(243,249,250,0.28) = paper（+1 别名） @ 28% |
| `.shell` | `background` | `linear-gradient(180deg,#12414f,#08202a)` | #12414f = water-body（+1 别名）；#08202a = 未收进契约 |
| `.shell` | `border` | `1px solid rgba(228,249,252,.34)` | rgba(228,249,252,0.34) = 未收进契约（基色 #e4f9fc） |
| `.stylus` | `border-left` | `4.5px solid transparent` | transparent（透明，非色值） |
| `.stylus` | `border-right` | `4.5px solid transparent` | transparent（透明，非色值） |
| `.stylus` | `border-top` | `14px solid rgba(243,249,250,.72)` | rgba(243,249,250,0.72) = paper（+1 别名） @ 72% |
| `.tip` | `background` | `radial-gradient(circle, rgba(212,85,58,.4), rgba(212,85,58,0) 68%)` | rgba(212,85,58,0.4) = coral（+3 别名） @ 40%；rgba(212,85,58,0) = coral（+3 别名） @ 0% |
| `.tip::after` | `background` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `.col-h h2` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.hint` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.hint.warm` | `color` | `var(--warm)` | --warm ⇒ #f6d79a = warm（+1 别名） |
| `li.row` | `border-bottom` | `1px solid rgba(243,249,250,.07)` | rgba(243,249,250,0.07) = paper（+1 别名） @ 7% |
| `li.row .mk` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `li.row .desc` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `li.row .desc span` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `li.row .dur` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `li.row .act` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `li.row[data-state='gap']` | `border-bottom` | `1px dashed rgba(246,215,154,.26)` | rgba(246,215,154,0.26) = warm（+1 别名） @ 26% |
| `li.row[data-state='gap'] .mk, li.row[data-state='gap'] .dur` | `color` | `var(--warm)` | --warm ⇒ #f6d79a = warm（+1 别名） |
| `li.row[data-state='gap'] .desc` | `color` | `var(--warm)` | --warm ⇒ #f6d79a = warm（+1 别名） |
| `li.row[data-state='gap'] .desc em` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `li.row[aria-current='true'] .mk` | `color` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `li.row[aria-current='true']::before` | `background` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `ul.credits .code` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `ul.credits .at` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.mixbox p` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.transport` | `border-top` | `1px solid var(--line)` | --line ⇒ rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `.tie` | `background` | `rgba(243,249,250,.09)` | rgba(243,249,250,0.09) = paper（+1 别名） @ 9% |
| `.now .line` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.now .line span` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.time` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.time .of` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.votes` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.votes i` | `background` | `rgba(243,249,250,.16)` | rgba(243,249,250,0.16) = paper（+1 别名） @ 16% |
| `.ctrl` | `border` | `1px solid rgba(127,209,217,.4)` | rgba(127,209,217,0.4) = glass（+2 别名） @ 40% |
| `.ctrl` | `background` | `transparent` | transparent（透明，非色值） |
| `.ctrl` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.etch` | `color` | `rgba(243,249,250,.34)` | rgba(243,249,250,0.34) = paper（+1 别名） @ 34% |

### 6.4 圆角
| 选择器 | border-radius | 用在哪 |
| --- | --- | --- |
| `.bub` | `50%` | `position:absolute; border-radius:50%; border:1px solid rgba(216,243,246,.26)` |
| `.cobble` | `50%` | `position:absolute; border-radius:50%; border:1px solid rgba(5,15,20,.34); background:radial-gradient(50% 50% a` |
| `.state` | `2px` | `font-family:'LXGW WenKai',serif; font-size:12px; letter-spacing:.1em; color:var(--warm); border:1px solid rgba` |
| `.bglow` | `50%` | `left:1252px; top:342px; width:142px; height:9px; border-radius:50%; transform:rotate(-4.2deg); background:radi` |
| `.b-cork` | `2px` | `left:1262px; top:357px; width:24px; height:16px; border-radius:2px; transform:rotate(-9deg); border:1px solid ` |
| `.corkmark` | `50%` | `left:1258px; top:372px; width:34px; height:9px; border-radius:50%; background:radial-gradient(50% 50% at 50% 5` |
| `.btmark` | `50%` | `left:1238px; top:331px; width:160px; height:28px; border-radius:50%; transform:rotate(-4.2deg); background:rad` |
| `.bpress` | `50%` | `left:1250px; top:340px; width:132px; height:9px; border-radius:50%; transform:rotate(-4.2deg); background:radi` |
| `.rip1` | `50%` | `left:696px; top:326px; width:48px; height:12px; border-radius:50%; border:1px solid rgba(127,209,217,.28)` |
| `.rip2` | `50%` | `left:682px; top:330px; width:76px; height:16px; border-radius:50%; border:1px solid rgba(127,209,217,.13)` |
| `.pivot` | `50%` | `position:absolute; left:1366px; top:161px; width:44px; height:44px; border-radius:50%; border:1px solid rgba(2` |
| `.pivot::before` | `50%` | `content:''; position:absolute; left:50%; top:50%; width:20px; height:20px; margin:-10px 0 0 -10px; border-radi` |
| `.pivot::after` | `50%` | `content:''; position:absolute; left:50%; top:50%; width:8px; height:8px; margin:-4px 0 0 -4px; border-radius:5` |
| `.shell` | `2px` | `position:absolute; left:702px; top:291px; width:36px; height:16px; border-radius:2px; background:linear-gradie` |
| `.tip` | `50%` | `position:absolute; left:710px; top:311px; width:20px; height:20px; border-radius:50%; background:radial-gradie` |
| `.tip::after` | `50%` | `content:''; position:absolute; left:50%; top:50%; width:6px; height:6px; margin:-3px 0 0 -3px; border-radius:5` |
| `.ctrl` | `2px` | `width:96px; height:44px; border:1px solid rgba(127,209,217,.4); border-radius:2px; background:transparent; col` |
- SVG 的 `rx`/`ry`：`svg[2] svg.bottle › rect rx="2"`

### 6.5 渐变（stop 串原样）
**CSS 渐变声明**：
- `.surface` · `background`：`repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(201,221,219,.05) 0 30%, transparent 68%)`
- `.water` · `background`：`linear-gradient(180deg,
          rgba(10,52,66,.30) 0%, rgba(10,52,66,.16) 21%, rgba(8,38,50,.04) 33%,
          rgba(5,28,38,.34) 45%, rgba(3,14,20,.62) 100%)`
- `.glint` · `background`：`linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)`
- `.shaft b` · `-webkit-mask-image`：`linear-gradient(90deg, rgba(255,255,255,0), #fff 34%, #fff 66%, rgba(255,255,255,0))`
- `.shaft b` · `mask-image`：`linear-gradient(90deg, rgba(255,255,255,0), #fff 34%, #fff 66%, rgba(255,255,255,0))`
- `.sh1` · `background`：`linear-gradient(180deg, rgba(228,247,252,.105), rgba(228,247,252,.05) 44%, rgba(228,247,252,0) 88%)`
- `.sh2` · `background`：`linear-gradient(180deg, rgba(228,247,252,.075), rgba(228,247,252,.028) 46%, rgba(228,247,252,0) 82%)`
- `.sh3` · `background`：`linear-gradient(180deg, rgba(228,247,252,.05), rgba(228,247,252,.018) 50%, rgba(228,247,252,0) 86%)`
- `.hit` · `background`：`radial-gradient(50% 50% at 50% 50%, rgba(127,209,217,.15), rgba(127,209,217,0) 72%)`
- `.caustic` · `background`：`radial-gradient(50% 50% at 50% 50%, rgba(127,209,217,.10), rgba(127,209,217,0) 74%)`
- `.bed` · `background-image`：`radial-gradient(rgba(169,199,207,.55) .5px, transparent .8px)`
- `.bed` · `-webkit-mask-image`：`linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,.3) 40%, #fff)`
- `.bed` · `mask-image`：`linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,.3) 40%, #fff)`
- `.bedline` · `background`：`linear-gradient(90deg, transparent 3%, rgba(169,199,207,.18) 28%, rgba(169,199,207,.28) 68%, transparent 97%)`
- `.shore` · `-webkit-mask-image`：`linear-gradient(90deg, rgba(255,255,255,0) 0, rgba(255,255,255,.35) 5%, #fff 14%, #fff 100%),
          linear-gradient(180deg, #fff 0 40%, rgba(255,255,255,.92) 44%, rgba(255,255,255,.66) 54%, rgba(255,255,255,.13) 74%, rgba(255,255,255,0) 84%)`
- `.shore` · `mask-image`：`linear-gradient(90deg, rgba(255,255,255,0) 0, rgba(255,255,255,.35) 5%, #fff 14%, #fff 100%),
          linear-gradient(180deg, #fff 0 40%, rgba(255,255,255,.92) 44%, rgba(255,255,255,.66) 54%, rgba(255,255,255,.13) 74%, rgba(255,255,255,0) 84%)`
- `.shore` · `background`：`radial-gradient(64% 40% at 34% 33%, rgba(246,215,154,.1), rgba(246,215,154,0) 72%),
          linear-gradient(0deg, rgba(246,215,154,.2) 0, rgba(246,215,154,.32) 100%)`
- `.shoreline` · `background`：`linear-gradient(90deg, rgba(216,243,246,0) 0%, rgba(216,243,246,.5) 12%,
          rgba(216,243,246,.72) 42%, rgba(216,243,246,.5) 72%, rgba(216,243,246,.22) 100%)`
- `.wetsand` · `background-image`：`radial-gradient(58% 46% at 26% 42%, rgba(5,15,20,.2), rgba(5,15,20,0) 74%),
          radial-gradient(52% 78% at 78% 38%, rgba(5,15,20,.18), rgba(5,15,20,0) 76%),
          linear-gradient(90deg, rgba(246,215,154,.32), rgba(246,215,154,.42) 44%, rgba(246,215,154,.22))`
- `.wetsand` · `-webkit-mask-image`：`linear-gradient(180deg, #fff, rgba(255,255,255,0) 92%)`
- `.wetsand` · `mask-image`：`linear-gradient(180deg, #fff, rgba(255,255,255,0) 92%)`
- `.sand1` · `background`：`linear-gradient(90deg, rgba(246,215,154,.26), rgba(246,215,154,.2) 46%, rgba(246,215,154,.09))`
- `.sand2` · `background`：`linear-gradient(90deg, rgba(246,215,154,.16), rgba(246,215,154,.11))`
- `.sdot` · `background-image`：`radial-gradient(rgba(246,215,154,.3) .5px, rgba(246,215,154,0) .9px),
          radial-gradient(rgba(246,215,154,.19) .5px, rgba(246,215,154,0) .9px),
          radial-gradient(rgba(246,215,154,.13) .5px, rgba(246,215,154,0) .9px)`
- `.sdot` · `-webkit-mask-image`：`linear-gradient(90deg, rgba(255,255,255,0), #fff 30%), linear-gradient(180deg, #fff 0 42%, rgba(255,255,255,.24) 74%, rgba(255,255,255,0) 100%)`
- `.sdot` · `mask-image`：`linear-gradient(90deg, rgba(255,255,255,0), #fff 30%), linear-gradient(180deg, #fff 0 42%, rgba(255,255,255,.24) 74%, rgba(255,255,255,0) 100%)`
- `.strata` · `background`：`repeating-linear-gradient(177.6deg,
          rgba(240,204,142,.13) 0 2px,
          rgba(240,204,142,.06) 2px 9px,
          rgba(5,15,20,.22) 9px 14px,
          rgba(226,205,158,.05) 14px 25px)`
- `.strata` · `-webkit-mask-image`：`linear-gradient(180deg, rgba(255,255,255,0) 53%, rgba(255,255,255,.55) 58%, #fff 64%, rgba(255,255,255,.4) 82%, rgba(255,255,255,0) 96%),
          linear-gradient(90deg, rgba(255,255,255,0) 0, #fff 26%)`
- `.strata` · `mask-image`：`linear-gradient(180deg, rgba(255,255,255,0) 53%, rgba(255,255,255,.55) 58%, #fff 64%, rgba(255,255,255,.4) 82%, rgba(255,255,255,0) 96%),
          linear-gradient(90deg, rgba(255,255,255,0) 0, #fff 26%)`
- `.stratatop` · `background`：`linear-gradient(90deg, rgba(5,15,20,.42), rgba(5,15,20,.3) 52%, rgba(5,15,20,.14))`
- `.gravel` · `background-image`：`radial-gradient(rgba(246,215,154,.24) 1.2px, rgba(246,215,154,0) 2.2px),
          radial-gradient(rgba(246,215,154,.26) 1.4px, rgba(246,215,154,0) 2.4px)`
- `.gravel` · `-webkit-mask-image`：`linear-gradient(90deg, rgba(255,255,255,0), #fff 30%), linear-gradient(180deg, rgba(255,255,255,0) 0 42%, #fff 46%, rgba(255,255,255,.3) 52%, rgba(255,255,255,0) 59%)`
- `.gravel` · `mask-image`：`linear-gradient(90deg, rgba(255,255,255,0), #fff 30%), linear-gradient(180deg, rgba(255,255,255,0) 0 42%, #fff 46%, rgba(255,255,255,.3) 52%, rgba(255,255,255,0) 59%)`
- `.cobble` · `background`：`radial-gradient(50% 50% at 40% 32%, rgba(246,215,154,.4), rgba(150,176,180,.2) 78%)`
- `.band` · `background-image`：`linear-gradient(90deg, rgba(243,249,250,.13) 0 76%, rgba(243,249,250,0) 88%),
          linear-gradient(90deg, rgba(243,249,250,.13) 0 76%, rgba(243,249,250,0) 88%)`
- `.band::before` · `background`：`linear-gradient(180deg, rgba(5,15,20,.42), rgba(5,15,20,.05) 40%, rgba(5,15,20,.30))`
- `.band::before` · `-webkit-mask-image`：`linear-gradient(90deg, #fff 0 76%, rgba(255,255,255,0) 88%)`
- `.band::before` · `mask-image`：`linear-gradient(90deg, #fff 0 76%, rgba(255,255,255,0) 88%)`
- `.sheen` · `background`：`radial-gradient(58% 100% at 46% 100%, rgba(127,209,217,.11), rgba(127,209,217,0) 74%)`
- `.groove::after` · `background`：`linear-gradient(90deg, rgba(216,243,246,0) 0%, rgba(216,243,246,.15) 12%,
          rgba(216,243,246,.16) 82%, rgba(216,243,246,.05) 100%)`
- `.core` · `background`：`repeating-linear-gradient(90deg, rgba(127,209,217,.78) 0 1px, rgba(127,209,217,.16) 1px 3.4px)`
- `.seg.on .core` · `-webkit-mask-image`：`linear-gradient(90deg, rgba(255,255,255,.58), #fff 28%, rgba(255,255,255,.66) 60%, #fff 88%)`
- `.seg.on .core` · `mask-image`：`linear-gradient(90deg, rgba(255,255,255,.58), #fff 28%, rgba(255,255,255,.66) 60%, #fff 88%)`
- `.seg.off .core` · `background`：`repeating-linear-gradient(90deg, rgba(169,199,207,.17) 0 1px, rgba(169,199,207,.03) 1px 3.4px)`
- `.dull` · `background`：`linear-gradient(90deg, rgba(5,15,20,0), rgba(5,15,20,.44) 8%, rgba(5,15,20,.64) 100%)`
- `.refl` · `-webkit-mask-image`：`linear-gradient(0deg, #fff, rgba(255,255,255,.2) 62%, rgba(255,255,255,0) 96%)`
- `.refl` · `mask-image`：`linear-gradient(0deg, #fff, rgba(255,255,255,.2) 62%, rgba(255,255,255,0) 96%)`
- `.seg.empty` · `-webkit-mask-image`：`linear-gradient(90deg, #fff 0 29%, rgba(255,255,255,0) 29% 71%, #fff 71% 100%)`
- `.seg.empty` · `mask-image`：`linear-gradient(90deg, #fff 0 29%, rgba(255,255,255,0) 29% 71%, #fff 71% 100%)`
- `.bglow` · `background`：`radial-gradient(50% 50% at 50% 50%, rgba(246,215,154,.24), rgba(246,215,154,0) 78%)`
- `.b-cork` · `background`：`linear-gradient(180deg, rgba(246,215,154,.72), rgba(246,215,154,.38))`
- `.corkmark` · `background`：`radial-gradient(50% 50% at 50% 50%, rgba(5,15,20,.62), rgba(5,15,20,0) 74%)`
- `.btmark` · `background`：`radial-gradient(50% 50% at 50% 50%, rgba(5,15,20,.56), rgba(5,15,20,.2) 56%, rgba(5,15,20,0) 84%)`
- `.bpress` · `background`：`radial-gradient(50% 50% at 50% 50%, rgba(5,15,20,.62), rgba(5,15,20,.16) 60%, rgba(5,15,20,0) 82%)`
- `.arm` · `background`：`linear-gradient(90deg, rgba(243,249,250,.26), rgba(243,249,250,.5))`
- `.shell` · `background`：`linear-gradient(180deg,#12414f,#08202a)`
- `.tip` · `background`：`radial-gradient(circle, rgba(212,85,58,.4), rgba(212,85,58,0) 68%)`
**SVG `<defs>` 里的渐变（svg[2]，非 CSS 写法，stop 原样）**：
- `<linearGradient#glass> id="glass" x1="0" y1="0" x2="0" y2="1" · stops: `offset="0" stop-color="#d8f3f6" stop-opacity=".5"` / `offset=".2" stop-color="#d8f3f6" stop-opacity=".2"` / `offset=".45" stop-color="#7fd1d9" stop-opacity=".11"` / `offset=".7" stop-color="#061820" stop-opacity=".78"` / `offset=".88" stop-color="#7fd1d9" stop-opacity=".14"` / `offset="1" stop-color="#061820" stop-opacity=".3"``

### 6.6 主块几何（`.clip` / `.page` 下顶层绝对定位块）
- 容器：`.clip`：box-sizing:border-box; margin:0; padding:0; position:absolute; inset:0; overflow:hidden
| 宿主 | 块 | 定位 | width | height | transform | z-index |
| --- | --- | --- | --- | --- | --- | --- |
| .clip | `div.surface` | `position:absolute; inset:0` | — | — | — | — |
| .clip | `div.water` | `position:absolute; inset:0` | — | — | — | — |
| .clip | `div.glint` | `position:absolute; inset:0` | — | — | — | — |
| .clip | `div.shaft` | `position:absolute; inset:0` | — | — | — | — |
| .clip | `div.bed` | `position:absolute; left:0; right:250px; bottom:0` | — | 240px | — | — |
| .clip | `i.bedline` | `position:absolute; left:-120px; right:-120px; bottom:152px` | — | 1px | rotate(-.8deg) | — |
| .clip | `div.shore` | `position:absolute; left:1184px; top:0` | 256px | 900px | — | — |
| .clip | `div.gravel` | `position:absolute; left:1184px; top:0` | 256px | 900px | — | — |
| .clip | `div.strata` | `position:absolute; left:1184px; top:0` | 256px | 900px | — | — |
| .clip | `i.stratatop` | `position:absolute; left:1184px; top:369px` | 256px | 2px | rotate(-2.75deg) | — |
| .clip | `i.shoreline` | `position:absolute; left:1184px; top:337px` | 256px | 1.5px | rotate(-2.75deg) | — |
| .clip | `i.wetsand` | `position:absolute; left:1184px; top:345px` | 256px | 18px | — | — |
| .clip | `i.sand1` | `position:absolute; left:1184px; top:352px` | 256px | 1px | rotate(-2.75deg) | — |
| .clip | `i.sand2` | `position:absolute; left:1184px; top:374px` | 256px | 1px | rotate(-2.75deg) | — |
| .clip | `i.sdot` | `position:absolute; left:1234px; top:330px` | 206px | 320px | — | — |
| .clip | `i.cobble` | `position:absolute; left:1300px; top:436px` | 12px | 7px | rotate(-9deg) | — |
| .clip | `i.cobble` | `position:absolute; left:1362px; top:418px` | 8px | 5px | rotate(7deg) | — |
| .clip | `i.cobble` | `position:absolute; left:1418px; top:452px` | 15px | 8px | rotate(-4deg) | — |
| .clip | `i.cobble` | `position:absolute; left:1276px; top:486px` | 7px | 5px | — | — |
| .clip | `i.cobble` | `position:absolute; left:1386px; top:494px` | 10px | 6px | rotate(12deg) | — |
| .clip | `i.bub` | `position:absolute; left:198px; top:804px` | 6px | 6px | — | — |
| .clip | `i.bub` | `position:absolute; left:224px; top:752px` | 4px | 4px | — | — |
| .clip | `i.bub` | `position:absolute; left:1052px; top:792px` | 7px | 7px | — | — |
| .clip | `i.bub` | `position:absolute; left:1080px; top:730px` | 4px | 4px | — | — |
| .clip | `i.bub` | `position:absolute; left:1100px; top:660px` | 3px | 3px | — | — |
| .clip | `i.bub` | `position:absolute; left:1146px; top:392px` | 5px | 5px | — | — |
- 更深处（不在上表里）的绝对定位块共 **48** 个：
  - `html › body › div.clip`：`position:absolute; inset:0`
  - `html › body › div.clip › div.shaft › b.sh1`：`position:absolute; left:150px; top:-260px; width:240px; height:1100px; transform:rotate(15deg); transform-origin:0 0`
  - `html › body › div.clip › div.shaft › b.sh2`：`position:absolute; left:420px; top:-300px; width:96px; height:1020px; transform:rotate(15deg); transform-origin:0 0`
  - `html › body › div.clip › div.shaft › b.sh3`：`position:absolute; left:820px; top:-300px; width:150px; height:1080px; transform:rotate(15deg); transform-origin:0 0`
  - `html › body › div.clip › div.shaft › b.hit`：`position:absolute; left:150px; top:290px; width:700px; height:88px; transform-origin:0 0`
  - `html › body › div.clip › div.shaft › b.caustic`：`position:absolute; left:120px; top:352px; width:600px; height:170px; transform-origin:0 0`
  - `html › body › main › section.deck › div.band › span.sheen`：`position:absolute; left:0; right:0; top:20px; height:36px`
  - `html › body › main › section.deck › div.band › div.groove`：`position:absolute; left:76px; right:288px; top:50%; height:13px`
  - `html › body › main › section.deck › div.band › div.groove › div.seg`：`position:absolute; left:0; top:0; width:269px; height:13px`
  - `html › body › main › section.deck › div.band › div.groove › div.seg › span.core`：`position:absolute; left:0; right:0; top:1px; bottom:1px`
  - `html › body › main › section.deck › div.band › div.groove › div.seg › i.refl`：`position:absolute; left:0; right:0; top:15px; transform:scaleY(-1)`
  - `html › body › main › section.deck › div.band › div.groove › div.seg`：`position:absolute; left:269px; top:0; width:269px; height:13px`
  - …（其余 36 个同为装置内的分件，规则同上：`position:absolute` + 锚点）

### 6.7 SVG / 图形
- **svg[1]** `svg` viewBox=`0 0 11 13` width=11 height=13
  - `svg › rect`：`x="0"` `y="0"` `width="4"` `height="13"` `fill="currentColor"`
  - `svg › rect`：`x="7"` `y="0"` `width="4"` `height="13"` `fill="currentColor"`
- **svg[2]** `svg.bottle` viewBox=`0 0 170 62` width=170px height=62px
  - `svg.bottle › path`：`d="M3 24 H13 V18 H32 L54 7 H146 C159 7 167 17 167 31 C167 45 159 55 146 55 H54 L32 44 H13 V38 H3 Z"` `fill="url(#glass)"` `stroke="#d8f3f6"` `stroke-opacity=".36"` `stroke-width="1"` · 色：#d8f3f6 ×.36 = line（+1 别名） @ 36%
  - `svg.bottle › path`：`d="M58 12 H144"` `stroke="#d8f3f6"` `stroke-opacity=".34"` `stroke-width="1"` · 色：#d8f3f6 ×.34 = line（+1 别名） @ 34%
  - `svg.bottle › path`：`d="M58 50 H142"` `stroke="#d8f3f6"` `stroke-opacity=".16"` `stroke-width="1"` · 色：#d8f3f6 ×.16 = line（+1 别名） @ 16%
  - `svg.bottle › path`：`d="M14 22 H30"` `stroke="#d8f3f6"` `stroke-opacity=".26"` `stroke-width="1"` · 色：#d8f3f6 ×.26 = line（+1 别名） @ 26%
  - `svg.bottle › rect`：`x="66"` `y="22"` `width="72"` `height="18"` `rx="2"` `fill="none"` `stroke="#f6d79a"` `stroke-opacity=".6"` `stroke-dasharray="3 4"` · 色：#f6d79a ×.6 = warm（+1 别名） @ 60%

- **全页 transform（含 rotate 角度）**：
  - `.sh1`：`rotate(15deg)`
  - `.sh2`：`rotate(15deg)`
  - `.sh3`：`rotate(15deg)`
  - `.bedline`：`rotate(-.8deg)`
  - `.shoreline`：`rotate(-2.75deg)` / transform-origin:`0 50%`
  - `.sand1`：`rotate(-2.75deg)` / transform-origin:`0 50%`
  - `.sand2`：`rotate(-2.75deg)` / transform-origin:`0 50%`
  - `.stratatop`：`rotate(-2.75deg)` / transform-origin:`0 50%`
  - `.c1`：`rotate(-9deg)`
  - `.c2`：`rotate(7deg)`
  - `.c3`：`rotate(-4deg)`
  - `.c5`：`rotate(12deg)`
  - `.refl`：`scaleY(-1)`
  - `.voidlabel`：`translateY(-50%)`
  - `.bottle`：`rotate(-4.2deg)` / transform-origin:`24% 50%`
  - `.bglow`：`rotate(-4.2deg)`
  - `.b-cork`：`rotate(-9deg)`
  - `.btmark`：`rotate(-4.2deg)`
  - `.bpress`：`rotate(-4.2deg)`
  - `.arm`：`rotate(-9.855deg)` / transform-origin:`0 50%`
  - `.lift`：`rotate(-9.855deg)` / transform-origin:`0 50%`

### 6.8 文案（逐字，文档顺序；`⟨br⟩` = 源码 `<br />`）
001. `body › main › nav.crumb › a` → "回公海大厅"
002. `body › main › nav.crumb › span.state` → "等待接力"
003. `main › header.hd › div › p.cat` → "SIDE A · 公海"
004. `main › header.hd › div › h1` → "占位曲目 · 四"
005. `main › header.hd › div.stamp › p.cat` → "母版号"
006. `main › header.hd › div.stamp › p.mono` → "MDB-0001-A"
007. `body › main › p.meta › span` → "已录 3 / 4 段"
008. `body › main › p.meta › span.warm` → "缺第 2 段"
009. `body › main › p.meta › span` → "入海时间"
010. `main › p.meta › span › span.mono` → "2026/9/23 20:38"
011. `html › body › main › p.gapnote` → "这支作品还有缺口。缺口是歌里固定的段位，成品里留成静音，不会被别人的段顶替。"
012. `main › section.deck › div.deck-h › h2#deck-h` → "试听与投票"
013. `main › section.deck › div.deck-h › span.hint` → "点左边任何一段换段"
014. `div.band › div.groove › div.seg › i.refl` → "潮汐-3F"
015. `div.band › div.groove › div.seg › i.refl` → "暗礁-91"
016. `div.band › div.groove › div.seg › i.refl` → "浮标-2C"
017. `section.deck › div.band › div.groove › p.voidlabel` → "这一段还没有人唱"
018. `section.deck › div.marks › div › span.cat` → "A1"
019. `section.deck › div.marks › div › span.d` → "00:42"
020. `section.deck › div.marks › div › span.cat` → "A2"
021. `section.deck › div.marks › div › span.d` → "静音"
022. `section.deck › div.marks › div › span.cat` → "A3"
023. `section.deck › div.marks › div › span.d` → "00:51"
024. `section.deck › div.marks › div › span.cat` → "A4"
025. `section.deck › div.marks › div › span.d` → "00:47"
026. `div.cols › div › div.col-h › h2` → "接力唱段链"
027. `div.cols › div › div.col-h › span.hint` → "缺第 2 段"
028. `div › ol.chain › li.row › span.mk` → "A1"
029. `div › ol.chain › li.row › span.desc` → "第 1 段"
030. `ol.chain › li.row › span.desc › span` → "潮汐-3F"
031. `div › ol.chain › li.row › span.dur` → "00:42"
032. `div › ol.chain › li.row › a.act` → "听"
033. `div › ol.chain › li.row › span.mk` → "A2"
034. `div › ol.chain › li.row › span.desc` → "这一段还没有人唱"
035. `ol.chain › li.row › span.desc › em` → "缺口在成品里是静音，不会被别人的段顶替。"
036. `div › ol.chain › li.row › span.dur` → "静音"
037. `div › ol.chain › li.row › span.mk` → "A3"
038. `div › ol.chain › li.row › span.desc` → "第 3 段"
039. `ol.chain › li.row › span.desc › span` → "暗礁-91"
040. `div › ol.chain › li.row › span.dur` → "00:51"
041. `div › ol.chain › li.row › a.act` → "正在听"
042. `div › ol.chain › li.row › span.mk` → "A4"
043. `div › ol.chain › li.row › span.desc` → "第 4 段"
044. `ol.chain › li.row › span.desc › span` → "浮标-2C"
045. `div › ol.chain › li.row › span.dur` → "00:47"
046. `div › ol.chain › li.row › a.act` → "听"
047. `div.cols › div › div.col-h › h2` → "参与者"
048. `div.cols › div › div.col-h › span.hint` → "匿名代号"
049. `div › ul.credits › li › span.code` → "潮汐-3F"
050. `div › ul.credits › li › span.at` → "第 1 段"
051. `div › ul.credits › li › span.code` → "暗礁-91"
052. `div › ul.credits › li › span.at` → "第 3 段"
053. `div › ul.credits › li › span.code` → "浮标-2C"
054. `div › ul.credits › li › span.at` → "第 4 段"
055. `div.cols › div › div.mixbox › h2` → "混音导出计划"
056. `div.cols › div › div.mixbox › p` → "四段按序拼成纯人声版本，缺口留成静音。"
057. `main › div.transport › div.now › p.cat` → "正在听"
058. `div.transport › div.now › p.line#now-playing › b` → "第 3 段"
059. `div.transport › div.now › p.line#now-playing › span` → "暗礁-91"
060. `main › div.transport › div.readout › p.time` → "00:20"
061. `div.transport › div.readout › p.time › span.of` → "/ 00:51"
062. `div.transport › div.readout › p.votes › span` → "赞 3"
063. `div.transport › div.readout › p.votes › span` → "踩 0"
064. `main › div.transport › div.readout › button.ctrl` → "暂停"
065. `body › main › div.float › p.cat` → "送它到岸的空瓶"
066. `html › body › footer › span.etch` → "MDB-0001-A"

### 6.9 本页的「装置」
> 拉直成横向沟槽的唱片：唱针位置＝播放位置、缺口＝被切断的空槽；右端岸 + 到岸的空瓶 + 倒影＝唱这一段的人


## 7. 漂流日志 · `p-driftlog-record.html` → `/bottles/:id/log`
- **它是什么**：一只瓶子的漂流时间线（源码是 `<ol>`）+ 匿名代号
- **画布**：`html,body` = 1440×900（`overflow:hidden`）；页面底色 `--ink`

### 7.2 排版（选择器 → 值）
| 选择器 | font-size | letter-spacing | line-height | font-weight |
| --- | --- | --- | --- | --- |
| `.cat` | 11px | .24em | — | — |
| `.crumb` | 12.5px | — | — | — |
| `h1` | 56px | .02em | 1 | 700 |
| `.sub` | 15px | — | 1.85 | — |
| `.hright .song` | 19px | — | — | 700 |
| `.hright .n` | 30px | — | 1 | — |
| `.key figcaption` | 12px | .03em | — | — |
| `.roll .seq` | 11px | .08em | — | — |
| `.roll .op` | 17px | — | 1.4 | — |
| `.roll .who` | 14px | — | — | — |
| `.roll .at` | 12px | — | — | — |

### 7.3 颜色（选择器 → 值 · 契约状态）
| 选择器 | 属性 | 声明原文 | 解析（hex/rgba → 契约 token） |
| --- | --- | --- | --- |
| `:root` | `--ink` | `#050f14` | #050f14 = ink（+1 别名） |
| `:root` | `--paper` | `#f3f9fa` | #f3f9fa = paper（+1 别名） |
| `:root` | `--muted` | `#a9c7cf` | #a9c7cf = muted（+3 别名） |
| `:root` | `--glass` | `#7fd1d9` | #7fd1d9 = glass（+2 别名） |
| `:root` | `--coral` | `#d4553a` | #d4553a = coral（+3 别名） |
| `:root` | `--warm` | `#f6d79a` | #f6d79a = warm（+1 别名） |
| `:root` | `--line` | `rgba(243,249,250,.13)` | rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `body` | `background` | `var(--ink)` | --ink ⇒ #050f14 = ink（+1 别名） |
| `body` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.platter` | `background` | `repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)` | rgba(216,243,246,0.055) = line（+1 别名） @ 5.5%；rgba(127,209,217,0.05) = glass（+2 别名） @ 5%；transparent（透明，非色值） |
| `.glint` | `background` | `linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)` | rgba(228,247,252,0.045) = water-deep @ 4.5%；rgba(228,247,252,0.065) = water-deep @ 6.5%；rgba(228,247,252,0.028) = water-deep @ 2.8%；transparent（透明，非色值） |
| `.cat` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.waterlight` | `background` | `linear-gradient(186deg, rgba(203,238,246,.10) 0%, rgba(203,238,246,.042) 32%, transparent 70%)` | rgba(203,238,246,0.1) = water-mid（+2 别名） @ 10%；rgba(203,238,246,0.042) = water-mid（+2 别名） @ 4.2%；transparent（透明，非色值） |
| `.crumb` | `border` | `1px solid rgba(243,249,250,.16)` | rgba(243,249,250,0.16) = paper（+1 别名） @ 16% |
| `.crumb` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.sub` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.hright .n` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.key figcaption` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.roll ol` | `border-top` | `1px solid var(--line)` | --line ⇒ rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `.roll li` | `border-bottom` | `1px solid rgba(243,249,250,.07)` | rgba(243,249,250,0.07) = paper（+1 别名） @ 7% |
| `.roll li.last` | `border-bottom-color` | `var(--line)` | --line ⇒ rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `.roll .seq` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.roll .who` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.roll .at` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.roll li.last::before` | `background` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |

### 7.4 圆角
| 选择器 | border-radius | 用在哪 |
| --- | --- | --- |
| `.crumb` | `2px` | `display:inline-flex; align-items:center; gap:7px; height:28px; padding:0 12px; border:1px solid rgba(243,249,2` |
- SVG 的 `rx`/`ry`：`svg[9] svg.lathe › g › ellipse rx="6"`、`svg[9] svg.lathe › g › ellipse ry="3"`、`svg[9] svg.lathe › g › g › rect rx="2"`、`svg[9] svg.lathe › g › g › rect rx="4"`、`svg[9] svg.lathe › g › g › rect rx="2"`

### 7.5 渐变（stop 串原样）
**CSS 渐变声明**：
- `.platter` · `background`：`repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)`
- `.glint` · `background`：`linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)`
- `.waterlight` · `background`：`linear-gradient(186deg, rgba(203,238,246,.10) 0%, rgba(203,238,246,.042) 32%, transparent 70%)`
**SVG `<defs>` 里的渐变（svg[9]，非 CSS 写法，stop 原样）**：
- `<linearGradient#wet> id="wet" x1="0" y1="0" x2="1" y2="0" · stops: `offset="0" stop-color="#cbeef6" stop-opacity=".34"` / `offset=".45" stop-color="#cbeef6" stop-opacity=".13"` / `offset="1" stop-color="#cbeef6" stop-opacity="0"``
- `<radialGradient#spill> id="spill" cx=".32" cy=".22" r=".92" · stops: `offset="0" stop-color="#7fd1d9" stop-opacity=".46"` / `offset=".55" stop-color="#7fd1d9" stop-opacity=".22"` / `offset="1" stop-color="#7fd1d9" stop-opacity=".11"``

### 7.6 主块几何（`.clip` / `.page` 下顶层绝对定位块）
- 容器：`.clip`：box-sizing:border-box; margin:0; padding:0; position:absolute; inset:0; overflow:hidden
| 宿主 | 块 | 定位 | width | height | transform | z-index |
| --- | --- | --- | --- | --- | --- | --- |
| .clip | `div.platter` | `position:absolute; inset:0` | — | — | — | — |
| .clip | `div.glint` | `position:absolute; inset:0` | — | — | — | — |
| .clip | `div.waterlight` | `position:absolute; left:-8%; top:-4%` | 118% | 290px | — | — |
- 更深处（不在上表里）的绝对定位块共 **4** 个：
  - `html › body › div.clip`：`position:absolute; inset:0`
  - `html › body › main › div.hright`：`position:absolute; right:76px; top:64px`
  - `html › body › main › div.body › svg.lathe`：`position:absolute; left:0; top:0`
  - `html › body › main › div.body › div.roll`：`position:absolute; left:564px; right:0; top:4px; bottom:0`

### 7.7 SVG / 图形
- **svg[1]** `svg` viewBox=`0 0 8 12` width=8 height=12
  - `svg › path`：`d="M6.4 1.2 1.8 6l4.6 4.8"` `fill="none"` `stroke="currentColor"` `stroke-width="1.4"` `stroke-linecap="round"` `stroke-linejoin="round"`
- **svg[2]** `svg` viewBox=`0 0 44 30` width=44 height=30
  - `svg › path`：`d="M6 8v14"` `stroke="rgba(243,249,250,.24)"` · stroke="rgba(243,249,250,.24)" = paper（+1 别名） @ 24%
  - `svg › path`：`d="M6 15h26"` `stroke="rgba(127,209,217,.95)"` `stroke-width="2.4"` `stroke-linecap="round"` · stroke="rgba(127,209,217,.95)" = glass（+2 别名） @ 95%
- **svg[3]** `svg` viewBox=`0 0 44 30` width=44 height=30
  - `svg › path`：`d="M6 8v14"` `stroke="rgba(243,249,250,.24)"` · stroke="rgba(243,249,250,.24)" = paper（+1 别名） @ 24%
  - `svg › path`：`d="M6 15h18"` `stroke="rgba(243,249,250,.85)"` `stroke-width="1.8"` `stroke-linecap="round"` · stroke="rgba(243,249,250,.85)" = paper（+1 别名） @ 85%
- **svg[4]** `svg` viewBox=`0 0 44 30` width=44 height=30
  - `svg › path`：`d="M6 8v14"` `stroke="rgba(243,249,250,.24)"` · stroke="rgba(243,249,250,.24)" = paper（+1 别名） @ 24%
  - `svg › path`：`d="M6 15h14"` `stroke="rgba(127,209,217,.62)"` `stroke-width="1.8"` `stroke-linecap="round"` · stroke="rgba(127,209,217,.62)" = glass（+2 别名） @ 62%
- **svg[5]** `svg` viewBox=`0 0 44 30` width=44 height=30
  - `svg › path`：`d="M6 8v14"` `stroke="rgba(243,249,250,.24)"` · stroke="rgba(243,249,250,.24)" = paper（+1 别名） @ 24%
  - `svg › path`：`d="M6 15h11"` `stroke="rgba(169,199,207,.62)"` `stroke-width="1.8"` `stroke-linecap="round"` · stroke="rgba(169,199,207,.62)" = muted（+3 别名） @ 62%
- **svg[6]** `svg` viewBox=`0 0 44 30` width=44 height=30
  - `svg › path`：`d="M6 8v14"` `stroke="rgba(243,249,250,.24)"` · stroke="rgba(243,249,250,.24)" = paper（+1 别名） @ 24%
  - `svg › path`：`d="M6 15h21"` `stroke="rgba(246,215,154,.9)"` `stroke-width="1.8"` `stroke-linecap="round"` · stroke="rgba(246,215,154,.9)" = warm（+1 别名） @ 90%
- **svg[7]** `svg` viewBox=`0 0 44 30` width=44 height=30
  - `svg › path`：`d="M6 8v14"` `stroke="rgba(243,249,250,.24)"` · stroke="rgba(243,249,250,.24)" = paper（+1 别名） @ 24%
  - `svg › path`：`d="M6 13.5h20"` `stroke="rgba(243,249,250,1)"` `stroke-width="1.6"` `stroke-linecap="round"` · stroke="rgba(243,249,250,1)" = paper（+1 别名） @ 100%
  - `svg › path`：`d="M6 16.5h20"` `stroke="rgba(243,249,250,1)"` `stroke-width="1.6"` `stroke-linecap="round"` · stroke="rgba(243,249,250,1)" = paper（+1 别名） @ 100%
- **svg[8]** `svg` viewBox=`0 0 44 30` width=44 height=30
  - `svg › path`：`d="M6 8v14"` `stroke="rgba(243,249,250,.24)"` · stroke="rgba(243,249,250,.24)" = paper（+1 别名） @ 24%
  - `svg › path`：`d="M6 15h30"` `stroke="rgba(212,85,58,1)"` `stroke-width="2.4"` `stroke-linecap="round"` · stroke="rgba(212,85,58,1)" = coral（+3 别名） @ 100%
- **svg[9]** `svg.lathe` viewBox=`0 0 480 540` width=480 height=540
  - `svg.lathe › g`：`transform="translate(8 4)"`
  - `svg.lathe › g › path`：`d="M433.5 395.6 A282 282 0 0 1 69.0 493.3"` `stroke="url(#wet)"` `stroke-width="9"` `stroke-linecap="round"`
  - `svg.lathe › g › g`：`fill="none"` `stroke-linecap="round"`
  - `svg.lathe › g › g › path`：`d="M210.5 191.8 A52 52 0 0 1 228.3 200.5"` `stroke="rgba(127,209,217,.95)"` `stroke-width="2.4"` · stroke="rgba(127,209,217,.95)" = glass（+2 别名） @ 95%
  - `svg.lathe › g › g › path`：`d="M251.9 190.8 A75 75 0 0 1 271.9 245.9"` `stroke="rgba(243,249,250,.85)"` `stroke-width="1.8"` · stroke="rgba(243,249,250,.85)" = paper（+1 别名） @ 85%
  - `svg.lathe › g › g › path`：`d="M292.5 264.1 A98 98 0 0 1 268.7 308.8"` `stroke="rgba(127,209,217,.62)"` `stroke-width="1.8"` · stroke="rgba(127,209,217,.62)" = glass（+2 别名） @ 62%
  - `svg.lathe › g › g › path`：`d="M269.8 338.6 A121 121 0 0 1 220.1 360.8"` `stroke="rgba(169,199,207,.62)"` `stroke-width="1.8"` · stroke="rgba(169,199,207,.62)" = muted（+3 别名） @ 62%
  - `svg.lathe › g › g › path`：`d="M199.5 386.0 A144 144 0 0 1 95.2 343.8"` `stroke="rgba(243,249,250,.85)"` `stroke-width="1.8"` · stroke="rgba(243,249,250,.85)" = paper（+1 别名） @ 85%
  - `svg.lathe › g › g › path`：`d="M60.2 337.8 A167 167 0 0 1 30.6 256.6"` `stroke="rgba(127,209,217,.62)"` `stroke-width="1.8"` · stroke="rgba(127,209,217,.62)" = glass（+2 别名） @ 62%
  - `svg.lathe › g › g › path`：`d="M7.7 225.4 A190 190 0 0 1 34.1 144.1"` `stroke="rgba(169,199,207,.62)"` `stroke-width="1.8"` · stroke="rgba(169,199,207,.62)" = muted（+3 别名） @ 62%
  - `svg.lathe › g › g › path`：`d="M36.2 102.2 A213 213 0 0 1 185.9 29.3"` `stroke="rgba(243,249,250,.85)"` `stroke-width="1.8"` · stroke="rgba(243,249,250,.85)" = paper（+1 别名） @ 85%
  - `svg.lathe › g › g › path`：`d="M225.8 7.8 A236 236 0 0 1 394.9 113.5"` `stroke="rgba(246,215,154,.9)"` `stroke-width="1.8"` · stroke="rgba(246,215,154,.9)" = warm（+1 别名） @ 90%
  - `svg.lathe › g › g › path`：`d="M435.4 140.8 A259 259 0 0 1 435.4 343.2"` `stroke="rgba(243,249,250,1)"` `stroke-width="1.6"` · stroke="rgba(243,249,250,1)" = paper（+1 别名） @ 100%
  - `svg.lathe › g › g › path`：`d="M439.6 139.0 A263.5 263.5 0 0 1 439.6 345.0"` `stroke="rgba(243,249,250,1)"` `stroke-width="1.6"` · stroke="rgba(243,249,250,1)" = paper（+1 别名） @ 100%
  - `svg.lathe › g › g › path`：`d="M433.5 395.6 A282 282 0 0 1 69.0 493.3"` `stroke="rgba(212,85,58,1)"` `stroke-width="2.4"` · stroke="rgba(212,85,58,1)" = coral（+3 别名） @ 100%
  - `svg.lathe › g › circle`：`cx="197"` `cy="242"` `r="2.6"` `fill="rgba(127,209,217,.5)"` · fill="rgba(127,209,217,.5)" = glass（+2 别名） @ 50%
  - `svg.lathe › g › g`：`font-family="Quattrocento,serif"` `font-size="10"` `fill="rgba(243,249,250,.5)"` · fill="rgba(243,249,250,.5)" = paper（+1 别名） @ 50%
  - `svg.lathe › g › g › text`：`x="214.1"` `y="206.9"` `dy="0.34em"` `text-anchor="middle"` · text="#01"
  - `svg.lathe › g › g › text`：`x="255.3"` `y="220.8"` `dy="0.34em"` `text-anchor="middle"` · text="#02"
  - `svg.lathe › g › g › text`：`x="272.0"` `y="281.9"` `dy="0.34em"` `text-anchor="middle"` · text="#03"
  - `svg.lathe › g › g › text`：`x="240.9"` `y="340.7"` `dy="0.34em"` `text-anchor="middle"` · text="#04"
  - `svg.lathe › g › g › text`：`x="147.9"` `y="363.5"` `dy="0.34em"` `text-anchor="middle"` · text="#05"
  - `svg.lathe › g › g › text`：`x="52.3"` `y="294.7"` `dy="0.34em"` `text-anchor="middle"` · text="#06"
  - `svg.lathe › g › g › text`：`x="28.7"` `y="187.3"` `dy="0.34em"` `text-anchor="middle"` · text="#07"
  - `svg.lathe › g › g › text`：`x="109.3"` `y="62.2"` `dy="0.34em"` `text-anchor="middle"` · text="#08"
  - `svg.lathe › g › g › text`：`x="315.2"` `y="52.9"` `dy="0.34em"` `text-anchor="middle"` · text="#09"
  - `svg.lathe › g › g › text`：`x="443.0"` `y="242.0"` `dy="0.34em"` `text-anchor="middle"` · text="#10"
  - `svg.lathe › g › g › text`：`x="270.0"` `y="530.0"` `dy="0.34em"` `text-anchor="middle"` · text="#11"
  - `svg.lathe › g › path`：`d="M62 484 C58 473 80 467 102 469 C126 471 152 474 155 484 C158 495 130 502 104 501 C80 500 66 494 62 484 Z"` `fill="url(#spill)"` `stroke="rgba(203,238,246,.26)"` · stroke="rgba(203,238,246,.26)" = water-mid（+2 别名） @ 26%
  - `svg.lathe › g › path`：`d="M70 479 C86 471 112 469 136 473"` `stroke="rgba(228,247,252,.42)"` `stroke-width="1.4"` · stroke="rgba(228,247,252,.42)" = water-deep @ 42%
  - `svg.lathe › g › path`：`d="M80 492 C98 498 128 499 148 494"` `stroke="rgba(203,238,246,.20)"` · stroke="rgba(203,238,246,.20)" = water-mid（+2 别名） @ 20%
  - `svg.lathe › g › ellipse`：`cx="166"` `cy="492"` `rx="6"` `ry="3"` `fill="rgba(127,209,217,.28)"` · fill="rgba(127,209,217,.28)" = glass（+2 别名） @ 28%
  - `svg.lathe › g › g`：`transform="translate(101 487) rotate(-26) scale(.8)"`
  - `svg.lathe › g › g › rect`：`x="-3.6"` `y="-20"` `width="7.2"` `height="5"` `rx="2"` `fill="rgba(246,215,154,.5)"` · fill="rgba(246,215,154,.5)" = warm（+1 别名） @ 50%
  - `svg.lathe › g › g › path`：`d="M-1.8-14.4v4.2M1.8-14.4v4.2"` `stroke="rgba(203,238,246,.5)"` `stroke-width="1.1"` · stroke="rgba(203,238,246,.5)" = water-mid（+2 别名） @ 50%
  - `svg.lathe › g › g › rect`：`x="-7"` `y="-10.2"` `width="14"` `height="22"` `rx="4"` `fill="rgba(127,209,217,.1)"` `stroke="rgba(203,238,246,.58)"` `stroke-width="1.2"` · fill="rgba(127,209,217,.1)" = glass（+2 别名） @ 10%、stroke="rgba(203,238,246,.58)" = water-mid（+2 别名） @ 58%
  - `svg.lathe › g › g › rect`：`x="-4"` `y="-6.6"` `width="8"` `height="14"` `rx="2"` `fill="rgba(246,215,154,.2)"` `stroke="rgba(246,215,154,.45)"` `stroke-width="1"` · fill="rgba(246,215,154,.2)" = warm（+1 别名） @ 20%、stroke="rgba(246,215,154,.45)" = warm（+1 别名） @ 45%

- **全页 transform（含 rotate 角度）**：
  - （本页未用）

### 7.8 文案（逐字，文档顺序；`⟨br⟩` = 源码 `<br />`）
001. `body › main › header › span.crumb` → "回漂流瓶"
002. `body › main › header › div.cat` → "SIDE A · 刻痕"
003. `body › main › header › h1` → "漂流日志"
004. `body › main › header › p.sub` → "这里只记核心操作：发起、接唱、捞取、投河、回传、入海。操作者只显示匿名代号。"
005. `body › main › div.hright › div.cat` → "曲名"
006. `body › main › div.hright › div.song` → "占位曲目 · 一"
007. `body › main › div.hright › div.n` → "11"
008. `body › main › div.hright › div.cat` → "道刻痕"
009. `main › div.key › figure › figcaption` → "发起"
010. `main › div.key › figure › figcaption` → "接唱"
011. `main › div.key › figure › figcaption` → "投河"
012. `main › div.key › figure › figcaption` → "捞取"
013. `main › div.key › figure › figcaption` → "回传"
014. `main › div.key › figure › figcaption` → "完成"
015. `main › div.key › figure › figcaption` → "入海"
016. `svg.lathe › g › g › text` → "#01"
017. `svg.lathe › g › g › text` → "#02"
018. `svg.lathe › g › g › text` → "#03"
019. `svg.lathe › g › g › text` → "#04"
020. `svg.lathe › g › g › text` → "#05"
021. `svg.lathe › g › g › text` → "#06"
022. `svg.lathe › g › g › text` → "#07"
023. `svg.lathe › g › g › text` → "#08"
024. `svg.lathe › g › g › text` → "#09"
025. `svg.lathe › g › g › text` → "#10"
026. `svg.lathe › g › g › text` → "#11"
027. `div.roll › ol › li › span.seq` → "#01"
028. `div.roll › ol › li › span.op` → "发起：选定了这首歌"
029. `div.roll › ol › li › span.who` → "潮汐-3F"
030. `div.roll › ol › li › span.at` → "2026/9/19 20:14"
031. `div.roll › ol › li › span.seq` → "#02"
032. `div.roll › ol › li › span.op` → "接唱：有人录下了一段"
033. `div.roll › ol › li › span.who` → "潮汐-3F"
034. `div.roll › ol › li › span.at` → "2026/9/19 20:52"
035. `div.roll › ol › li › span.seq` → "#03"
036. `div.roll › ol › li › span.op` → "投河：交给河道，等待下一位"
037. `div.roll › ol › li › span.who` → "潮汐-3F"
038. `div.roll › ol › li › span.at` → "2026/9/19 21:06"
039. `div.roll › ol › li › span.seq` → "#04"
040. `div.roll › ol › li › span.op` → "捞取：有人从河道里把它拿走了"
041. `div.roll › ol › li › span.who` → "浮标-2C"
042. `div.roll › ol › li › span.at` → "2026/9/20 09:31"
043. `div.roll › ol › li › span.seq` → "#05"
044. `div.roll › ol › li › span.op` → "接唱：有人录下了一段"
045. `div.roll › ol › li › span.who` → "浮标-2C"
046. `div.roll › ol › li › span.at` → "2026/9/20 10:07"
047. `div.roll › ol › li › span.seq` → "#06"
048. `div.roll › ol › li › span.op` → "投河：交给河道，等待下一位"
049. `div.roll › ol › li › span.who` → "浮标-2C"
050. `div.roll › ol › li › span.at` → "2026/9/20 10:20"
051. `div.roll › ol › li › span.seq` → "#07"
052. `div.roll › ol › li › span.op` → "捞取：有人从河道里把它拿走了"
053. `div.roll › ol › li › span.who` → "暗礁-91"
054. `div.roll › ol › li › span.at` → "2026/9/21 19:48"
055. `div.roll › ol › li › span.seq` → "#08"
056. `div.roll › ol › li › span.op` → "接唱：有人录下了一段"
057. `div.roll › ol › li › span.who` → "暗礁-91"
058. `div.roll › ol › li › span.at` → "2026/9/21 20:35"
059. `div.roll › ol › li › span.seq` → "#09"
060. `div.roll › ol › li › span.op` → "回传：交回上游的传递者"
061. `div.roll › ol › li › span.who` → "暗礁-91"
062. `div.roll › ol › li › span.at` → "2026/9/21 20:58"
063. `div.roll › ol › li › span.seq` → "#10"
064. `div.roll › ol › li › span.op` → "完成：最后一段录好了，作品完整"
065. `div.roll › ol › li › span.who` → "灯塔-5A"
066. `div.roll › ol › li › span.at` → "2026/9/22 09:03"
067. `div.roll › ol › li.last › span.seq` → "#11"
068. `div.roll › ol › li.last › span.op` → "入海：成为公海里的公共作品"
069. `div.roll › ol › li.last › span.who` → "系统"
070. `div.roll › ol › li.last › span.at` → "2026/9/22 09:04"

### 7.9 本页的「装置」
> 半沉螺旋刻痕：11 道刻痕＝11 条日志，只有最新一笔是湿的


## 8. 我的 · `p-profile-record.html` → `/me`
- **它是什么**：身份卡 + 参与过的瓶 + 徽章 + 消息
- **画布**：`html,body` = 1440×900（`overflow:hidden`）；页面底色 `--ink`

### 8.2 排版（选择器 → 值）
| 选择器 | font-size | letter-spacing | line-height | font-weight |
| --- | --- | --- | --- | --- |
| `.cat` | 11px | .24em | — | — |
| `h1` | 58px | .02em | 1 | 700 |
| `.sub` | 15px | — | 1.85 | — |
| `.chead h2` | 17px | — | — | 700 |
| `.csub` | 13px | — | 1.6 | — |
| `.no` | 10px | — | — | — |
| `.slot` | 10.5px | .1em | — | — |
| `.role` | 11.5px | .04em | — | — |
| `.t` | 17px | — | 1.3 | 700 |
| `.d` | 12.5px | — | 1.55 | — |
| `.st` | 12.5px | .04em | — | 700 |
| `.due` | 10.5px | .08em | — | — |
| `.lk` | 12.5px | — | — | — |
| `.who .handle` | 20px | — | 1.2 | 700 |
| `.who .mail` | 12px | — | — | — |
| `.who .stamp` | 12px | .06em | — | — |
| `.msgs h2` | 17px | — | — | 700 |
| `.msgs .msub` | 12.5px | — | 1.6 | — |
| `.mrow .lab` | 14.5px | — | — | 700 |
| `.mrow .pill` | 10.5px | .1em | — | — |
| `.mrow .read` | 11px | — | — | — |
| `.mrow .go` | 12.5px | — | — | — |
| `.mdet` | 12.5px | — | 1.55 | — |
| `.msgs li.hero .go` | — | — | — | 700 |
| `.pocket h3` | 16px | — | — | 700 |
| `.pocket p` | 12.5px | — | 1.65 | — |

### 8.3 颜色（选择器 → 值 · 契约状态）
| 选择器 | 属性 | 声明原文 | 解析（hex/rgba → 契约 token） |
| --- | --- | --- | --- |
| `:root` | `--ink` | `#050f14` | #050f14 = ink（+1 别名） |
| `:root` | `--paper` | `#f3f9fa` | #f3f9fa = paper（+1 别名） |
| `:root` | `--muted` | `#a9c7cf` | #a9c7cf = muted（+3 别名） |
| `:root` | `--glass` | `#7fd1d9` | #7fd1d9 = glass（+2 别名） |
| `:root` | `--coral` | `#d4553a` | #d4553a = coral（+3 别名） |
| `:root` | `--warm` | `#f6d79a` | #f6d79a = warm（+1 别名） |
| `:root` | `--line` | `rgba(243,249,250,.13)` | rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `body` | `background` | `var(--ink)` | --ink ⇒ #050f14 = ink（+1 别名） |
| `body` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.platter` | `background` | `repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)` | rgba(216,243,246,0.055) = line（+1 别名） @ 5.5%；rgba(127,209,217,0.05) = glass（+2 别名） @ 5%；transparent（透明，非色值） |
| `.glint` | `background` | `linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)` | rgba(228,247,252,0.045) = water-deep @ 4.5%；rgba(228,247,252,0.065) = water-deep @ 6.5%；rgba(228,247,252,0.028) = water-deep @ 2.8%；transparent（透明，非色值） |
| `.cat` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.waterlight` | `background` | `linear-gradient(186deg, rgba(203,238,246,.10) 0%, rgba(203,238,246,.042) 32%, transparent 70%)` | rgba(203,238,246,0.1) = water-mid（+2 别名） @ 10%；rgba(203,238,246,0.042) = water-mid（+2 别名） @ 4.2%；transparent（透明，非色值） |
| `.sub` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.csub` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.window` | `border` | `1px solid rgba(243,249,250,.16)` | rgba(243,249,250,0.16) = paper（+1 别名） @ 16% |
| `.window` | `background` | `rgba(3,17,23,.42)` | rgba(3,17,23,0.42) = water-void（+2 别名） @ 42% |
| `.window li` | `border-right` | `1px solid rgba(243,249,250,.1)` | rgba(243,249,250,0.1) = paper（+1 别名） @ 10% |
| `.sd` | `border-top` | `1px solid rgba(243,249,250,.16)` | rgba(243,249,250,0.16) = paper（+1 别名） @ 16% |
| `.sd.b1` | `background` | `linear-gradient(180deg, rgba(246,215,154,.10), rgba(243,249,250,.02))` | rgba(246,215,154,0.1) = warm（+1 别名） @ 10%；rgba(243,249,250,0.02) = paper（+1 别名） @ 2% |
| `.sd.b2` | `background` | `linear-gradient(180deg, rgba(246,215,154,.13), rgba(243,249,250,.035))` | rgba(246,215,154,0.13) = warm（+1 别名） @ 13%；rgba(243,249,250,0.035) = paper（+1 别名） @ 3.5% |
| `.sd.b3` | `background` | `linear-gradient(180deg, rgba(246,215,154,.17), rgba(243,249,250,.05))` | rgba(246,215,154,0.17) = warm（+1 别名） @ 17%；rgba(243,249,250,0.05) = paper（+1 别名） @ 5% |
| `.sd.b4` | `background` | `linear-gradient(180deg, rgba(246,215,154,.21), rgba(243,249,250,.065))` | rgba(246,215,154,0.21) = warm（+1 别名） @ 21%；rgba(243,249,250,0.065) = paper（+1 别名） @ 6.5% |
| `.sd::before` | `background` | `rgba(243,249,250,.09)` | rgba(243,249,250,0.09) = paper（+1 别名） @ 9% |
| `.sd.mine::after` | `background` | `rgba(212,85,58,.78)` | rgba(212,85,58,0.78) = coral（+3 别名） @ 78% |
| `.wt` | `background` | `linear-gradient(180deg, rgba(127,209,217,.20), rgba(127,209,217,.07))` | rgba(127,209,217,0.2) = glass（+2 别名） @ 20%；rgba(127,209,217,0.07) = glass（+2 别名） @ 7% |
| `.wt.b4` | `border-top` | `1px solid rgba(203,238,246,.20)` | rgba(203,238,246,0.2) = water-mid（+2 别名） @ 20% |
| `.wt::before` | `border` | `1px solid rgba(203,238,246,.6)` | rgba(203,238,246,0.6) = water-mid（+2 别名） @ 60% |
| `.wt::after` | `border` | `1px solid rgba(203,238,246,.46)` | rgba(203,238,246,0.46) = water-mid（+2 别名） @ 46% |
| `.cut` | `border-top` | `1px dashed rgba(212,85,58,.68)` | rgba(212,85,58,0.68) = coral（+3 别名） @ 68% |
| `.cut` | `background` | `rgba(212,85,58,.06)` | rgba(212,85,58,0.06) = coral（+3 别名） @ 6% |
| `.cut::before` | `background` | `rgba(212,85,58,.3)` | rgba(212,85,58,0.3) = coral（+3 别名） @ 30% |
| `.iface` | `border-top` | `1px solid rgba(203,238,246,.44)` | rgba(203,238,246,0.44) = water-mid（+2 别名） @ 44% |
| `.iface::before` | `border-top` | `1px solid rgba(203,238,246,.18)` | rgba(203,238,246,0.18) = water-mid（+2 别名） @ 18% |
| `.no` | `color` | `rgba(243,249,250,.55)` | rgba(243,249,250,0.55) = paper（+1 别名） @ 55% |
| `.no.ghost` | `color` | `rgba(203,238,246,.4)` | rgba(203,238,246,0.4) = water-mid（+2 别名） @ 40% |
| `.cut .no` | `color` | `rgba(212,85,58,.85)` | rgba(212,85,58,0.85) = coral（+3 别名） @ 85% |
| `.lay .shaft` | `background` | `linear-gradient(180deg, rgba(246,215,154,.38), rgba(246,215,154,.20) 52%, rgba(246,215,154,.09))` | rgba(246,215,154,0.38) = warm（+1 别名） @ 38%；rgba(246,215,154,0.2) = warm（+1 别名） @ 20%；rgba(246,215,154,0.09) = warm（+1 别名） @ 9% |
| `.lay .hoop` | `border` | `2px solid rgba(246,215,154,.9)` | rgba(246,215,154,0.9) = warm（+1 别名） @ 90% |
| `.lay .hoop::before` | `background` | `rgba(246,215,154,.14)` | rgba(246,215,154,0.14) = warm（+1 别名） @ 14% |
| `.veil` | `border-left` | `1px solid rgba(243,249,250,.13)` | rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `.veil` | `background` | `linear-gradient(90deg, rgba(3,17,23,.86), rgba(3,17,23,.93))` | rgba(3,17,23,0.86) = water-void（+2 别名） @ 86%；rgba(3,17,23,0.93) = water-void（+2 别名） @ 93% |
| `.slot` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.role` | `border` | `1px solid rgba(243,249,250,.22)` | rgba(243,249,250,0.22) = paper（+1 别名） @ 22% |
| `.role` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.role.mine` | `border-color` | `rgba(127,209,217,.42)` | rgba(127,209,217,0.42) = glass（+2 别名） @ 42% |
| `.role.mine` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.d` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.d.ok` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.d.warn` | `color` | `var(--warm)` | --warm ⇒ #f6d79a = warm（+1 别名） |
| `.st` | `background` | `var(--warm)` | --warm ⇒ #f6d79a = warm（+1 别名） |
| `.st` | `color` | `var(--ink)` | --ink ⇒ #050f14 = ink（+1 别名） |
| `.due` | `color` | `rgba(246,215,154,.76)` | rgba(246,215,154,0.76) = warm（+1 别名） @ 76% |
| `.lk` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.sleeve` | `border` | `1px solid rgba(243,249,250,.18)` | rgba(243,249,250,0.18) = paper（+1 别名） @ 18% |
| `.sleeve` | `background` | `linear-gradient(158deg, rgba(243,249,250,.085), rgba(243,249,250,.022) 62%, rgba(243,249,250,.055))` | rgba(243,249,250,0.085) = paper（+1 别名） @ 8.5%；rgba(243,249,250,0.022) = paper（+1 别名） @ 2.2%；rgba(243,249,250,0.055) = paper（+1 别名） @ 5.5% |
| `.hole` | `background` | `rgba(2,9,13,.92)` | rgba(2,9,13,0.92) = 未收进契约（基色 #02090d） |
| `.hole` | `border` | `2px solid rgba(243,249,250,.26)` | rgba(243,249,250,0.26) = paper（+1 别名） @ 26% |
| `.label` | `background` | `radial-gradient(76% 76% at 34% 26%, rgba(10,48,60,.5), rgba(3,17,23,.78))` | rgba(10,48,60,0.5) = water-bed（+1 别名） @ 50%；rgba(3,17,23,0.78) = water-void（+2 别名） @ 78% |
| `.label` | `border` | `1px solid rgba(228,249,252,.26)` | rgba(228,249,252,0.26) = 未收进契约（基色 #e4f9fc） |
| `.label .r1` | `border` | `1px solid rgba(228,249,252,.42)` | rgba(228,249,252,0.42) = 未收进契约（基色 #e4f9fc） |
| `.label .r2` | `border` | `1px solid rgba(228,249,252,.2)` | rgba(228,249,252,0.2) = 未收进契约（基色 #e4f9fc） |
| `.label .hub` | `background` | `var(--ink)` | --ink ⇒ #050f14 = ink（+1 别名） |
| `.label .hub` | `border` | `1px solid rgba(127,209,217,.42)` | rgba(127,209,217,0.42) = glass（+2 别名） @ 42% |
| `.who .mail` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.who .stamp` | `border` | `1px solid rgba(212,85,58,.62)` | rgba(212,85,58,0.62) = coral（+3 别名） @ 62% |
| `.who .stamp` | `background` | `rgba(212,85,58,.14)` | rgba(212,85,58,0.14) = coral（+3 别名） @ 14% |
| `.who .stamp` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.codeslot .field` | `border` | `1px solid rgba(243,249,250,.2)` | rgba(243,249,250,0.2) = paper（+1 别名） @ 20% |
| `.msgs .msub` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.msgs li` | `border-bottom` | `1px solid rgba(243,249,250,.07)` | rgba(243,249,250,0.07) = paper（+1 别名） @ 7% |
| `.mrow .pill` | `background` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.mrow .pill` | `color` | `var(--ink)` | --ink ⇒ #050f14 = ink（+1 别名） |
| `.mrow .read` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.mrow .go` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.mdet` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.msgs li.hero` | `border-left` | `2px solid rgba(246,215,154,.85)` | rgba(246,215,154,0.85) = warm（+1 别名） @ 85% |
| `.msgs li.hero` | `background` | `linear-gradient(90deg, rgba(246,215,154,.14), rgba(246,215,154,0) 80%)` | rgba(246,215,154,0.14) = warm（+1 别名） @ 14%；rgba(246,215,154,0) = warm（+1 别名） @ 0% |
| `.msgs li.hero .lab` | `color` | `var(--warm)` | --warm ⇒ #f6d79a = warm（+1 别名） |
| `.msgs li.hero .mdet` | `color` | `rgba(243,249,250,.82)` | rgba(243,249,250,0.82) = paper（+1 别名） @ 82% |
| `.msgs li.hero .pill` | `background` | `var(--warm)` | --warm ⇒ #f6d79a = warm（+1 别名） |
| `.msgs li.hero .pill` | `color` | `var(--ink)` | --ink ⇒ #050f14 = ink（+1 别名） |
| `.msgs li.hero .go` | `color` | `var(--warm)` | --warm ⇒ #f6d79a = warm（+1 别名） |
| `.pocket` | `border` | `1px solid var(--line)` | --line ⇒ rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `.pocket` | `background` | `rgba(243,249,250,.028)` | rgba(243,249,250,0.028) = paper（+1 别名） @ 2.8% |
| `.pocket::before` | `background` | `rgba(243,249,250,.2)` | rgba(243,249,250,0.2) = paper（+1 别名） @ 20% |
| `.pocket p` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |

### 8.4 圆角
| 选择器 | border-radius | 用在哪 |
| --- | --- | --- |
| `.window` | `2px` | `position:relative; margin-top:20px; height:260px; overflow:hidden; border:1px solid rgba(243,249,250,.16); bor` |
| `.wt::before` | `50%` | `content:''; position:absolute; left:12px; bottom:14px; width:5px; height:5px; border-radius:50%; border:1px so` |
| `.wt::after` | `50%` | `content:''; position:absolute; left:30px; bottom:34px; width:3px; height:3px; border-radius:50%; border:1px so` |
| `.iface` | `50%` | `position:absolute; left:1px; width:50px; height:10px; border-radius:50%; border-top:1px solid rgba(203,238,246` |
| `.iface::before` | `50%` | `content:''; position:absolute; left:4px; right:4px; top:4px; height:10px; border-radius:50%; border-top:1px so` |
| `.lay .hoop` | `50%` | `left:-1px; top:2px; width:52px; height:20px; border-radius:50%; z-index:4; border:2px solid rgba(246,215,154,.` |
| `.lay .hoop::before` | `50%` | `content:''; position:absolute; inset:2px; border-radius:50%; background:rgba(246,215,154,.14)` |
| `.role` | `2px` | `padding:2px 8px; border-radius:2px; font-size:11.5px; letter-spacing:.04em; border:1px solid rgba(243,249,250,` |
| `.st` | `2px` | `margin-top:8px; display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:2px; backgro` |
| `.sleeve` | `2px` | `position:absolute; right:26px; top:8px; width:470px; height:296px; border-radius:2px; border:1px solid rgba(24` |
| `.hole` | `50%` | `position:absolute; left:30px; top:38px; width:168px; height:168px; border-radius:50%; background:rgba(2,9,13,.` |
| `.label` | `50%` | `position:relative; width:104px; height:104px; border-radius:50%; background:radial-gradient(76% 76% at 34% 26%` |
| `.label .r1` | `50%` | `position:absolute; inset:-13px; border-radius:50%; border:1px solid rgba(228,249,252,.42)` |
| `.label .r2` | `50%` | `position:absolute; inset:-29px; border-radius:50%; border:1px solid rgba(228,249,252,.2)` |
| `.label .hub` | `50%` | `position:absolute; left:50%; top:50%; width:7px; height:7px; margin:-3.5px 0 0 -3.5px; border-radius:50%; back` |
| `.who .stamp` | `2px` | `display:inline-block; margin-top:12px; padding:4px 10px; border-radius:2px; border:1px solid rgba(212,85,58,.6` |
| `.codeslot .field` | `2px` | `margin-top:8px; height:30px; border:1px solid rgba(243,249,250,.2); border-radius:2px` |
| `.mrow .pill` | `2px` | `padding:2px 7px; border-radius:2px; background:var(--glass); color:var(--ink); font-size:10.5px; letter-spacin` |
| `.pocket` | `0 0 4px 4px` | `position:relative; flex:1; border:1px solid var(--line); border-top:0; border-radius:0 0 4px 4px; background:r` |
- SVG 的 `rx`/`ry`：`svg[1] svg.float › rect rx="2"`、`svg[1] svg.float › rect rx="4"`、`svg[1] svg.float › rect rx="2"`、`svg[2] svg › ellipse rx="5.4"`、`svg[2] svg › ellipse ry="3"`、`svg[2] svg › rect rx="0.9"`、`svg[3] svg.float › rect rx="2"`、`svg[3] svg.float › rect rx="4"`、`svg[3] svg.float › rect rx="2"`、`svg[4] svg.float › rect rx="2"`、`svg[4] svg.float › rect rx="4"`、`svg[4] svg.float › rect rx="2"`、`svg[5] svg › ellipse rx="7"`、`svg[5] svg › ellipse ry="3.9"`、`svg[5] svg › rect rx="1.2"`

### 8.5 渐变（stop 串原样）
**CSS 渐变声明**：
- `.platter` · `background`：`repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)`
- `.glint` · `background`：`linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)`
- `.waterlight` · `background`：`linear-gradient(186deg, rgba(203,238,246,.10) 0%, rgba(203,238,246,.042) 32%, transparent 70%)`
- `.sd.b1` · `background`：`linear-gradient(180deg, rgba(246,215,154,.10), rgba(243,249,250,.02))`
- `.sd.b2` · `background`：`linear-gradient(180deg, rgba(246,215,154,.13), rgba(243,249,250,.035))`
- `.sd.b3` · `background`：`linear-gradient(180deg, rgba(246,215,154,.17), rgba(243,249,250,.05))`
- `.sd.b4` · `background`：`linear-gradient(180deg, rgba(246,215,154,.21), rgba(243,249,250,.065))`
- `.wt` · `background`：`linear-gradient(180deg, rgba(127,209,217,.20), rgba(127,209,217,.07))`
- `.lay .shaft` · `background`：`linear-gradient(180deg, rgba(246,215,154,.38), rgba(246,215,154,.20) 52%, rgba(246,215,154,.09))`
- `.veil` · `background`：`linear-gradient(90deg, rgba(3,17,23,.86), rgba(3,17,23,.93))`
- `.sleeve` · `background`：`linear-gradient(158deg, rgba(243,249,250,.085), rgba(243,249,250,.022) 62%, rgba(243,249,250,.055))`
- `.label` · `background`：`radial-gradient(76% 76% at 34% 26%, rgba(10,48,60,.5), rgba(3,17,23,.78))`
- `.msgs li.hero` · `background`：`linear-gradient(90deg, rgba(246,215,154,.14), rgba(246,215,154,0) 80%)`

### 8.6 主块几何（`.clip` / `.page` 下顶层绝对定位块）
- 容器：`.clip`：box-sizing:border-box; margin:0; padding:0; position:absolute; inset:0; overflow:hidden
| 宿主 | 块 | 定位 | width | height | transform | z-index |
| --- | --- | --- | --- | --- | --- | --- |
| .clip | `div.platter` | `position:absolute; inset:0` | — | — | — | — |
| .clip | `div.glint` | `position:absolute; inset:0` | — | — | — | — |
| .clip | `div.waterlight` | `position:absolute; left:-8%; top:-4%` | 118% | 290px | — | — |
- 更深处（不在上表里）的绝对定位块共 **71** 个：
  - `html › body › div.clip`：`position:absolute; inset:0`
  - `html › body › main › div.bleed`：`position:absolute; inset:0`
  - `html › body › main › div.bleed › aside.sleeve`：`position:absolute; right:26px; top:8px; width:470px; height:296px`
  - `html › body › main › div.bleed › aside.sleeve › span.cat`：`position:absolute; left:30px; top:16px`
  - `html › body › main › div.bleed › aside.sleeve › div.hole`：`position:absolute; left:30px; top:38px; width:168px; height:168px`
  - `html › body › main › div.bleed › aside.sleeve › div.hole › div.label › i.r1`：`position:absolute; inset:-13px`
  - `html › body › main › div.bleed › aside.sleeve › div.hole › div.label › i.r2`：`position:absolute; inset:-29px`
  - `html › body › main › div.bleed › aside.sleeve › div.hole › div.label › i.hub`：`position:absolute; left:50%; top:50%; width:7px; height:7px`
  - `html › body › main › div.bleed › aside.sleeve › div.who`：`position:absolute; left:216px; top:74px`
  - `html › body › main › div.bleed › aside.sleeve › div.codeslot`：`position:absolute; left:30px; right:50px; top:224px`
  - `html › body › main › section.crate`：`position:absolute; left:76px; right:76px; top:250px`
  - `html › body › main › section.crate › div.window › ul › li › span.lay`：`position:absolute; left:1px; top:0; width:50px; height:260px`
  - …（其余 59 个同为装置内的分件，规则同上：`position:absolute` + 锚点）

### 8.7 SVG / 图形
- **svg[1]** `svg.float` viewBox=`0 0 22 34` width=16 height=26
  - `svg.float › rect`：`x="7.2"` `y="1.2"` `width="7.6"` `height="5"` `rx="2"` `fill="rgba(246,215,154,.62)"` · fill="rgba(246,215,154,.62)" = warm（+1 别名） @ 62%
  - `svg.float › path`：`d="M8.4 6.4v4.4M13.6 6.4v4.4"` `stroke="rgba(203,238,246,.62)"` `stroke-width="1.1"` · stroke="rgba(203,238,246,.62)" = water-mid（+2 别名） @ 62%
  - `svg.float › rect`：`x="4.2"` `y="10.8"` `width="13.6"` `height="21.4"` `rx="4"` `fill="rgba(127,209,217,.16)"` `stroke="rgba(203,238,246,.72)"` `stroke-width="1.2"` · fill="rgba(127,209,217,.16)" = glass（+2 别名） @ 16%、stroke="rgba(203,238,246,.72)" = water-mid（+2 别名） @ 72%
  - `svg.float › rect`：`x="7.4"` `y="14.6"` `width="7.2"` `height="13.6"` `rx="2"` `fill="rgba(246,215,154,.24)"` `stroke="rgba(246,215,154,.55)"` `stroke-width="1"` · fill="rgba(246,215,154,.24)" = warm（+1 别名） @ 24%、stroke="rgba(246,215,154,.55)" = warm（+1 别名） @ 55%
- **svg[2]** `svg` viewBox=`0 0 13 13` width=13 height=13
  - `svg › ellipse`：`cx="6.5"` `cy="8.2"` `rx="5.4"` `ry="3"` `stroke="rgba(5,15,20,.88)"` `stroke-width="1.3"` · stroke="rgba(5,15,20,.88)" = ink（+1 别名） @ 88%
  - `svg › rect`：`x="5.6"` `y="1.7"` `width="1.8"` `height="6.3"` `rx="0.9"` `fill="rgba(5,15,20,.88)"` · fill="rgba(5,15,20,.88)" = ink（+1 别名） @ 88%
- **svg[3]** `svg.float` viewBox=`0 0 22 34` width=18 height=28
  - `svg.float › rect`：`x="7.2"` `y="1.2"` `width="7.6"` `height="5"` `rx="2"` `fill="rgba(246,215,154,.62)"` · fill="rgba(246,215,154,.62)" = warm（+1 别名） @ 62%
  - `svg.float › path`：`d="M8.4 6.4v4.4M13.6 6.4v4.4"` `stroke="rgba(203,238,246,.62)"` `stroke-width="1.1"` · stroke="rgba(203,238,246,.62)" = water-mid（+2 别名） @ 62%
  - `svg.float › rect`：`x="4.2"` `y="10.8"` `width="13.6"` `height="21.4"` `rx="4"` `fill="rgba(127,209,217,.16)"` `stroke="rgba(203,238,246,.72)"` `stroke-width="1.2"` · fill="rgba(127,209,217,.16)" = glass（+2 别名） @ 16%、stroke="rgba(203,238,246,.72)" = water-mid（+2 别名） @ 72%
  - `svg.float › rect`：`x="7.4"` `y="14.6"` `width="7.2"` `height="13.6"` `rx="2"` `fill="rgba(246,215,154,.24)"` `stroke="rgba(246,215,154,.55)"` `stroke-width="1"` · fill="rgba(246,215,154,.24)" = warm（+1 别名） @ 24%、stroke="rgba(246,215,154,.55)" = warm（+1 别名） @ 55%
- **svg[4]** `svg.float` viewBox=`0 0 22 34` width=18 height=28
  - `svg.float › rect`：`x="7.2"` `y="1.2"` `width="7.6"` `height="5"` `rx="2"` `fill="rgba(246,215,154,.62)"` · fill="rgba(246,215,154,.62)" = warm（+1 别名） @ 62%
  - `svg.float › path`：`d="M8.4 6.4v4.4M13.6 6.4v4.4"` `stroke="rgba(203,238,246,.62)"` `stroke-width="1.1"` · stroke="rgba(203,238,246,.62)" = water-mid（+2 别名） @ 62%
  - `svg.float › rect`：`x="4.2"` `y="10.8"` `width="13.6"` `height="21.4"` `rx="4"` `fill="rgba(127,209,217,.16)"` `stroke="rgba(203,238,246,.72)"` `stroke-width="1.2"` · fill="rgba(127,209,217,.16)" = glass（+2 别名） @ 16%、stroke="rgba(203,238,246,.72)" = water-mid（+2 别名） @ 72%
  - `svg.float › rect`：`x="7.4"` `y="14.6"` `width="7.2"` `height="13.6"` `rx="2"` `fill="rgba(246,215,154,.24)"` `stroke="rgba(246,215,154,.55)"` `stroke-width="1"` · fill="rgba(246,215,154,.24)" = warm（+1 别名） @ 24%、stroke="rgba(246,215,154,.55)" = warm（+1 别名） @ 55%
- **svg[5]** `svg` viewBox=`0 0 17 17` width=17 height=17
  - `svg › ellipse`：`cx="8.5"` `cy="10.7"` `rx="7"` `ry="3.9"` `stroke="rgba(246,215,154,.88)"` `stroke-width="1.4"` · stroke="rgba(246,215,154,.88)" = warm（+1 别名） @ 88%
  - `svg › rect`：`x="7.3"` `y="2.2"` `width="2.4"` `height="8.2"` `rx="1.2"` `fill="rgba(246,215,154,.9)"` · fill="rgba(246,215,154,.9)" = warm（+1 别名） @ 90%
- **svg[6]** `svg` viewBox=`0 0 16 16` width=16 height=16
  - `svg › circle`：`cx="8"` `cy="8"` `r="6.2"` `stroke="rgba(127,209,217,.75)"` `stroke-width="1.3"` · stroke="rgba(127,209,217,.75)" = glass（+2 别名） @ 75%
  - `svg › circle`：`cx="8"` `cy="8"` `r="1.5"` `fill="rgba(127,209,217,.75)"` · fill="rgba(127,209,217,.75)" = glass（+2 别名） @ 75%
- **svg[7]** `svg` viewBox=`0 0 16 16` width=16 height=16
  - `svg › circle`：`cx="8"` `cy="8"` `r="6.2"` `stroke="rgba(127,209,217,.75)"` `stroke-width="1.3"` · stroke="rgba(127,209,217,.75)" = glass（+2 别名） @ 75%
  - `svg › path`：`d="M5 8.2 7.1 10.3 11.2 5.8"` `stroke="rgba(127,209,217,.95)"` `stroke-width="1.5"` `stroke-linecap="round"` `stroke-linejoin="round"` · stroke="rgba(127,209,217,.95)" = glass（+2 别名） @ 95%
- **svg[8]** `svg` viewBox=`0 0 16 16` width=16 height=16
  - `svg › path`：`d="M8 1.8 14.6 13.2H1.4Z"` `stroke="rgba(246,215,154,.8)"` `stroke-width="1.3"` `stroke-linejoin="round"` · stroke="rgba(246,215,154,.8)" = warm（+1 别名） @ 80%
  - `svg › path`：`d="M8 6.4v3.1"` `stroke="rgba(246,215,154,.9)"` `stroke-width="1.4"` `stroke-linecap="round"` · stroke="rgba(246,215,154,.9)" = warm（+1 别名） @ 90%

- **全页 transform（含 rotate 角度）**：
  - `.flask`：`rotate(-16deg)`

### 8.8 文案（逐字，文档顺序；`⟨br⟩` = 源码 `<br />`）
001. `body › main › header › div.cat` → "ACCOUNT · 认领"
002. `body › main › header › h1` → "我的"
003. `body › main › header › p.sub` → "账号只用来认领你自己的漂流瓶。别人在瓶子里看到的是匿名代号，看不到你的账号。"
004. `main › div.bleed › aside.sleeve › span.cat` → "内袋"
005. `div.bleed › aside.sleeve › div.who › p.handle` → "午夜的听众"
006. `div.bleed › aside.sleeve › div.who › p.mail` → "listener@example.com"
007. `div.bleed › aside.sleeve › div.who › span.stamp` → "管理员账号"
008. `div.bleed › aside.sleeve › div.codeslot › span.cat` → "匿名代号"
009. `main › section.crate › div.chead › h2` → "我参与过的漂流瓶"
010. `main › section.crate › div.chead › span.cat` → "共 5 支"
011. `body › main › section.crate › p.csub` → "我发起的、以及我唱过一段的瓶子都会在这里（按最近活跃排序，时间线来自服务端）。"
012. `li › span.lay › i.b1 › b.no` → "1"
013. `li › span.lay › i.b2 › b.no` → "2"
014. `li › span.lay › i.b3 › b.no` → "3"
015. `li › span.lay › i.b4 › b.no` → "4"
016. `li › div.txt › div.r1 › span.slot` → "01"
017. `li › div.txt › div.r1 › span.role` → "我发起的"
018. `ul › li › div.txt › p.t` → "占位曲目 · 一"
019. `ul › li › div.txt › p.d` → "已录 4 / 4 段"
020. `ul › li › div.txt › p.d` → "我唱的：第 1 段"
021. `ul › li › div.txt › p.st` → "等你操作"
022. `ul › li › div.txt › p.due` → "回传决策时限 48 小时"
023. `li › div.txt › p.lk › span` → "去看这个瓶子"
024. `li › div.txt › p.lk › span` → "漂流日志"
025. `li › span.lay › i.b1 › b.no` → "1"
026. `li › span.lay › i.b2 › b.no` → "2"
027. `li › span.lay › i.b3 › b.no` → "3"
028. `li › span.lay › i.b4 › b.no` → "4"
029. `li › div.txt › div.r1 › span.slot` → "02"
030. `li › div.txt › div.r1 › span.role` → "我接唱的"
031. `ul › li › div.txt › p.t` → "占位曲目 · 二"
032. `ul › li › div.txt › p.d` → "已录 3 / 4 段"
033. `ul › li › div.txt › p.d` → "我唱的：第 2 段"
034. `ul › li › div.txt › p.d` → "缺第 4 段"
035. `li › div.txt › p.lk › span` → "去看这个瓶子"
036. `li › div.txt › p.lk › span` → "漂流日志"
037. `li › span.lay › i.b1 › b.no` → "1"
038. `li › span.lay › i.b2 › b.no` → "2"
039. `li › span.lay › i.b3 › b.no` → "3"
040. `li › span.lay › i.b4 › b.no` → "4"
041. `li › div.txt › div.r1 › span.slot` → "03"
042. `li › div.txt › div.r1 › span.role` → "我接唱的"
043. `ul › li › div.txt › p.t` → "占位曲目 · 三"
044. `ul › li › div.txt › p.d` → "已录 2 / 4 段"
045. `ul › li › div.txt › p.d` → "我唱的：第 2 段"
046. `ul › li › div.txt › p.d` → "缺第 3、4 段"
047. `li › div.txt › p.lk › span` → "去看这个瓶子"
048. `li › div.txt › p.lk › span` → "漂流日志"
049. `li › span.lay › i.b1 › b.no` → "1"
050. `li › span.lay › i.b2 › b.no` → "2"
051. `li › span.lay › i.b3 › b.no` → "3"
052. `li › span.lay › i.b4 › b.no` → "4"
053. `li › div.txt › div.r1 › span.slot` → "04"
054. `li › div.txt › div.r1 › span.role` → "我接唱的"
055. `ul › li › div.txt › p.t` → "夜航"
056. `ul › li › div.txt › p.d` → "已录 4 / 4 段"
057. `ul › li › div.txt › p.d` → "我唱的：第 4 段"
058. `ul › li › div.txt › p.d` → "全部段位都有人唱过"
059. `li › div.txt › p.lk › span` → "去看这个瓶子"
060. `li › div.txt › p.lk › span` → "漂流日志"
061. `li › span.lay › i.b1 › b.no` → "1"
062. `li › span.lay › i.b2 › b.no` → "2"
063. `li › span.lay › i.b3 › b.no` → "3"
064. `li › span.lay › i.b4 › b.no` → "4"
065. `li › div.txt › div.r1 › span.slot` → "05"
066. `li › div.txt › div.r1 › span.role` → "我接唱的"
067. `ul › li › div.txt › p.t` → "占位曲目 · 四"
068. `ul › li › div.txt › p.d` → "已录 3 / 4 段"
069. `ul › li › div.txt › p.d` → "我唱的那一段被斩浪删除了（仍算参与过）"
070. `ul › li › div.txt › p.d` → "缺第 2 段"
071. `li › div.txt › p.lk › span` → "去看这个瓶子"
072. `li › div.txt › p.lk › span` → "漂流日志"
073. `main › div.bottom › section.msgs › h2` → "消息"
074. `main › div.bottom › section.msgs › p.msub` → "只显示你自己的消息（留言送达 / 未送达 · 作品进公海）；别人的消息读不到，权限在服务端判定。"
075. `ul › li.hero › div.mrow › span.lab` → "《占位曲目 · 一》回传到你手里了"
076. `ul › li.hero › div.mrow › span.pill` → "未读"
077. `ul › li.hero › div.mrow › span.go` → "去看看"
078. `section.msgs › ul › li.hero › p.mdet` → "完整版本已经沿父链回到发起者手里 —— 你只能把它送进公海。"
079. `ul › li › div.mrow › span.lab` → "收到一条私密留言"
080. `ul › li › div.mrow › span.pill` → "未读"
081. `ul › li › div.mrow › span.go` → "去看一眼"
082. `section.msgs › ul › li › p.mdet` → "《占位曲目 · 一》里有一条留给你的话，随完整版本一起送到你手里。"
083. `ul › li › div.mrow › span.lab` → "你参与的作品已完成"
084. `ul › li › div.mrow › span.read` → "已读"
085. `ul › li › div.mrow › span.go` → "去看一眼"
086. `section.msgs › ul › li › p.mdet` → "《夜航》已经补齐所有段位并进入公海，可以回听完整接力链。"
087. `ul › li › div.mrow › span.lab` → "你的留言未送达"
088. `ul › li › div.mrow › span.read` → "已读"
089. `ul › li › div.mrow › span.go` → "去看一眼"
090. `section.msgs › ul › li › p.mdet` → "《占位曲目 · 三》在中途进了公海，留言没能交到发起者手里。下次可以再录一段带上一句话。"
091. `div.bottom › div.pockets › section.pocket › h3` → "我的收藏"
092. `div.bottom › div.pockets › section.pocket › p` → "收藏只对已完成并进入公海的作品开放：听到想再听的，把它收起来。"
093. `div.bottom › div.pockets › section.pocket › h3` → "我的徽章"
094. `div.bottom › div.pockets › section.pocket › p` → "徽章是派生的（不落库）：服务端按你参与过的事件当场算出来，作品被撤下就跟着消失。"

### 8.9 本页的「装置」
> 内袋身份卡 + 每格一根沉积柱：4 层位＝4 段位（被斩＝层位还在、内容挖空）


## 9. 审核台 · `s2-admin-record.html` → `/admin`
- **它是什么**：管理员队列与裁决动作（源码里互斥的两个 Tab 被画进同一帧，靠水线分隔）
- **画布**：`html,body` = 1440×900（`overflow:hidden`）；页面底色 `--ink`

### 9.2 排版（选择器 → 值）
| 选择器 | font-size | letter-spacing | line-height | font-weight |
| --- | --- | --- | --- | --- |
| `.cat` | 11px | .24em | — | — |
| `header h1` | 56px | — | 1 | 700 |
| `header .sub` | 14.5px | — | 1.85 | — |
| `.view` | 15px | — | — | — |
| `.view b` | — | — | — | 700 |
| `.view .n` | 12.5px | — | — | — |
| `.card .no` | 13px | .06em | — | — |
| `.card .kind` | 10.5px | .14em | — | — |
| `.card .rep` | 15px | — | — | 700 |
| `.card .rep em` | 13.5px | — | — | 400 |
| `.card .when` | 11.5px | — | — | — |
| `.seal` | 12.5px | .17em | — | — |
| `.acts button` | 12.5px | — | — | — |
| `li.rec .rno` | 12.5px | .06em | — | — |
| `li.rec .robj` | 14.5px | — | — | 700 |
| `li.rec .robj em` | 13px | — | — | 400 |
| `li.rec .rtime` | 11.5px | — | — | — |
| `li.rec .back` | 12.5px | — | — | — |
| `footer .lead` | 13px | — | — | — |

### 9.3 颜色（选择器 → 值 · 契约状态）
| 选择器 | 属性 | 声明原文 | 解析（hex/rgba → 契约 token） |
| --- | --- | --- | --- |
| `:root` | `--ink` | `#050f14` | #050f14 = ink（+1 别名） |
| `:root` | `--paper` | `#f3f9fa` | #f3f9fa = paper（+1 别名） |
| `:root` | `--muted` | `#a9c7cf` | #a9c7cf = muted（+3 别名） |
| `:root` | `--glass` | `#7fd1d9` | #7fd1d9 = glass（+2 别名） |
| `:root` | `--coral` | `#d4553a` | #d4553a = coral（+3 别名） |
| `:root` | `--warm` | `#f6d79a` | #f6d79a = warm（+1 别名） |
| `:root` | `--line` | `rgba(243,249,250,.13)` | rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `body` | `background` | `var(--ink)` | --ink ⇒ #050f14 = ink（+1 别名） |
| `body` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.platter` | `background` | `repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)` | rgba(216,243,246,0.055) = line（+1 别名） @ 5.5%；rgba(127,209,217,0.05) = glass（+2 别名） @ 5%；transparent（透明，非色值） |
| `.platter.sub` | `background` | `repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.1) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.1) 0 30%, transparent 68%)` | rgba(216,243,246,0.1) = line（+1 别名） @ 10%；rgba(127,209,217,0.1) = glass（+2 别名） @ 10%；transparent（透明，非色值） |
| `.glint` | `background` | `linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)` | rgba(228,247,252,0.045) = water-deep @ 4.5%；rgba(228,247,252,0.065) = water-deep @ 6.5%；rgba(228,247,252,0.028) = water-deep @ 2.8%；transparent（透明，非色值） |
| `.shaft` | `background` | `linear-gradient(183deg, rgba(228,247,252,.16) 0%, rgba(228,247,252,.075) 52%, rgba(228,247,252,0) 84%)` | rgba(228,247,252,0.16) = water-deep @ 16%；rgba(228,247,252,0.075) = water-deep @ 7.5%；rgba(228,247,252,0) = water-deep @ 0% |
| `.caustic` | `background` | `linear-gradient(97deg, transparent 10%, rgba(200,240,250,.1) 20%, transparent 31%),
          linear-gradient(101deg, transparent 62%, rgba(200,240,250,.07) 76%, transparent 92%)` | rgba(200,240,250,0.1) = 未收进契约（基色 #c8f0fa）；rgba(200,240,250,0.07) = 未收进契约（基色 #c8f0fa）；transparent（透明，非色值） |
| `.deep` | `background` | `linear-gradient(180deg, rgba(3,17,23,0) 0%, rgba(3,17,23,.5) 52%, rgba(3,17,23,.9) 100%)` | rgba(3,17,23,0) = water-void（+2 别名） @ 0%；rgba(3,17,23,0.5) = water-void（+2 别名） @ 50%；rgba(3,17,23,0.9) = water-void（+2 别名） @ 90% |
| `.surface` | `background` | `linear-gradient(90deg, rgba(228,249,255,0) 0%, rgba(228,249,255,.34) 7%, rgba(228,249,255,.72) 34%, rgba(228,249,255,.66) 72%, rgba(228,249,255,.12) 100%)` | rgba(228,249,255,0) = 未收进契约（基色 #e4f9ff）；rgba(228,249,255,0.34) = 未收进契约（基色 #e4f9ff）；rgba(228,249,255,0.72) = 未收进契约（基色 #e4f9ff）；rgba(228,249,255,0.66) = 未收进契约（基色 #e4f9ff）；rgba(228,249,255,0.12) = 未收进契约（基色 #e4f9ff） |
| `.surface-haze` | `background` | `linear-gradient(90deg, rgba(190,238,248,0) 0%, rgba(190,238,248,.11) 22%, rgba(214,244,252,.24) 44%, rgba(190,238,248,.08) 78%, rgba(190,238,248,0) 100%)` | rgba(190,238,248,0) = 未收进契约（基色 #beeef8）；rgba(190,238,248,0.11) = 未收进契约（基色 #beeef8）；rgba(214,244,252,0.24) = 未收进契约（基色 #d6f4fc）；rgba(190,238,248,0.08) = 未收进契约（基色 #beeef8） |
| `.ripple` | `border` | `1px solid rgba(228,249,255,.42)` | rgba(228,249,255,0.42) = 未收进契约（基色 #e4f9ff） |
| `.touch` | `background` | `linear-gradient(90deg, rgba(228,249,255,0), rgba(228,249,255,.62), rgba(228,249,255,0))` | rgba(228,249,255,0) = 未收进契约（基色 #e4f9ff）；rgba(228,249,255,0.62) = 未收进契约（基色 #e4f9ff） |
| `.tether` | `background` | `repeating-linear-gradient(180deg, rgba(228,249,255,.44) 0 2px, transparent 2px 6px)` | rgba(228,249,255,0.44) = 未收进契约（基色 #e4f9ff）；transparent（透明，非色值） |
| `.refl` | `background` | `linear-gradient(180deg, rgba(228,249,255,.11), rgba(228,249,255,0))` | rgba(228,249,255,0.11) = 未收进契约（基色 #e4f9ff）；rgba(228,249,255,0) = 未收进契约（基色 #e4f9ff） |
| `.bottle .cork` | `background` | `rgba(243,249,250,.42)` | rgba(243,249,250,0.42) = paper（+1 别名） @ 42% |
| `.bottle .neck` | `border` | `1px solid rgba(203,238,246,.55)` | rgba(203,238,246,0.55) = water-mid（+2 别名） @ 55% |
| `.bottle .neck` | `background` | `rgba(10,48,60,.45)` | rgba(10,48,60,0.45) = water-bed（+1 别名） @ 45% |
| `.bottle .shoulder` | `border-left` | `1px solid rgba(203,238,246,.5)` | rgba(203,238,246,0.5) = water-mid（+2 别名） @ 50% |
| `.bottle .shoulder` | `border-right` | `1px solid rgba(203,238,246,.5)` | rgba(203,238,246,0.5) = water-mid（+2 别名） @ 50% |
| `.bottle .shoulder` | `background` | `rgba(10,48,60,.5)` | rgba(10,48,60,0.5) = water-bed（+1 别名） @ 50% |
| `.bottle .body` | `border` | `1px solid rgba(203,238,246,.62)` | rgba(203,238,246,0.62) = water-mid（+2 别名） @ 62% |
| `.bottle .body` | `background` | `linear-gradient(96deg, rgba(203,238,246,.16), rgba(10,48,60,.5) 42%, rgba(10,48,60,.34))` | rgba(203,238,246,0.16) = water-mid（+2 别名） @ 16%；rgba(10,48,60,0.5) = water-bed（+1 别名） @ 50%；rgba(10,48,60,0.34) = water-bed（+1 别名） @ 34% |
| `.bottle .cut` | `background` | `linear-gradient(180deg, rgba(3,17,23,.05), rgba(3,17,23,.3))` | rgba(3,17,23,0.05) = water-void（+2 别名） @ 5%；rgba(3,17,23,0.3) = water-void（+2 别名） @ 30% |
| `.bub` | `border` | `1px solid rgba(228,249,255,.52)` | rgba(228,249,255,0.52) = 未收进契约（基色 #e4f9ff） |
| `.bub` | `background` | `rgba(228,249,255,.05)` | rgba(228,249,255,0.05) = 未收进契约（基色 #e4f9ff） |
| `.bed` | `background` | `repeating-linear-gradient(90deg, rgba(169,199,207,.2) 0 3px, transparent 3px 13px)` | rgba(169,199,207,0.2) = muted（+3 别名） @ 20%；transparent（透明，非色值） |
| `.bed.two` | `background` | `repeating-linear-gradient(90deg, transparent 0 11px, rgba(169,199,207,.16) 11px 14px, transparent 14px 30px)` | rgba(169,199,207,0.16) = muted（+3 别名） @ 16%；transparent（透明，非色值） |
| `.cat` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `header .sub` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.view` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.view` | `border-bottom` | `2px solid transparent` | transparent（透明，非色值） |
| `.view[aria-selected='true']` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.view[aria-selected='true']` | `border-bottom-color` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `.card` | `border` | `1px solid rgba(243,249,250,.17)` | rgba(243,249,250,0.17) = paper（+1 别名） @ 17% |
| `.card` | `background` | `radial-gradient(76% 76% at 30% 22%, rgba(10,48,60,.54), rgba(3,17,23,.82))` | rgba(10,48,60,0.54) = water-bed（+1 别名） @ 54%；rgba(3,17,23,0.82) = water-void（+2 别名） @ 82% |
| `.card .flood` | `background` | `linear-gradient(180deg, rgba(6,26,34,.5), rgba(3,17,23,.72))` | rgba(6,26,34,0.5) = 未收进契约（基色 #061a22）；rgba(3,17,23,0.72) = water-void（+2 别名） @ 72% |
| `.card::before` | `background` | `repeating-linear-gradient(180deg, rgba(243,249,250,.26) 0 2px, transparent 2px 7px)` | rgba(243,249,250,0.26) = paper（+1 别名） @ 26%；transparent（透明，非色值） |
| `.card .no` | `color` | `rgba(169,199,207,.95)` | rgba(169,199,207,0.95) = muted（+3 别名） @ 95% |
| `.card .kind` | `color` | `rgba(169,199,207,.78)` | rgba(169,199,207,0.78) = muted（+3 别名） @ 78% |
| `.card .hair` | `background` | `rgba(243,249,250,.11)` | rgba(243,249,250,0.11) = paper（+1 别名） @ 11% |
| `.card .rep em` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.card .when` | `color` | `rgba(169,199,207,.86)` | rgba(169,199,207,0.86) = muted（+3 别名） @ 86% |
| `.seal` | `color` | `#e8967c` | #e8967c = 未收进契约 |
| `.seal` | `border` | `2px solid rgba(212,85,58,.72)` | rgba(212,85,58,0.72) = coral（+3 别名） @ 72% |
| `.seal` | `background` | `radial-gradient(62% 72% at 31% 34%, rgba(212,85,58,.15), rgba(212,85,58,0) 74%)` | rgba(212,85,58,0.15) = coral（+3 别名） @ 15%；rgba(212,85,58,0) = coral（+3 别名） @ 0% |
| `.seal::before` | `border` | `2px solid rgba(212,85,58,.5)` | rgba(212,85,58,0.5) = coral（+3 别名） @ 50% |
| `.seal::before` | `-webkit-mask-image` | `repeating-linear-gradient(74deg, #fff 0 5px, rgba(255,255,255,.04) 5px 7px, #fff 7px 17px)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.04) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.seal::before` | `mask-image` | `repeating-linear-gradient(74deg, #fff 0 5px, rgba(255,255,255,.04) 5px 7px, #fff 7px 17px)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.04) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.seal::after` | `color` | `rgba(212,85,58,.33)` | rgba(212,85,58,0.33) = coral（+3 别名） @ 33% |
| `.seal.due` | `color` | `#e8c07a` | #e8c07a = 未收进契约 |
| `.seal.due` | `border` | `1.5px dashed rgba(246,215,154,.66)` | rgba(246,215,154,0.66) = warm（+1 别名） @ 66% |
| `.acts button` | `background` | `transparent` | transparent（透明，非色值） |
| `.acts button` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.acts button` | `border` | `1px solid rgba(243,249,250,.26)` | rgba(243,249,250,0.26) = paper（+1 别名） @ 26% |
| `.acts button.cut` | `border-color` | `rgba(212,85,58,.62)` | rgba(212,85,58,0.62) = coral（+3 别名） @ 62% |
| `.acts button.cut` | `color` | `#f0b7a6` | #f0b7a6 = 未收进契约 |
| `.acts button.ban` | `border-color` | `rgba(212,85,58,.74)` | rgba(212,85,58,0.74) = coral（+3 别名） @ 74% |
| `.acts button.ban` | `color` | `#f0b7a6` | #f0b7a6 = 未收进契约 |
| `.acts button.ban` | `background` | `rgba(212,85,58,.12)` | rgba(212,85,58,0.12) = coral（+3 别名） @ 12% |
| `li.rec .rule` | `background` | `linear-gradient(90deg, rgba(243,249,250,.32), rgba(243,249,250,.05))` | rgba(243,249,250,0.32) = paper（+1 别名） @ 32%；rgba(243,249,250,0.05) = paper（+1 别名） @ 5% |
| `li.rec .rno` | `color` | `rgba(169,199,207,.9)` | rgba(169,199,207,0.9) = muted（+3 别名） @ 90% |
| `li.rec .robj em` | `color` | `rgba(169,199,207,.9)` | rgba(169,199,207,0.9) = muted（+3 别名） @ 90% |
| `li.rec .rtime` | `color` | `rgba(169,199,207,.78)` | rgba(169,199,207,0.78) = muted（+3 别名） @ 78% |
| `li.rec .back` | `background` | `transparent` | transparent（透明，非色值） |
| `li.rec .back` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `li.rec .back` | `border` | `1px solid rgba(203,238,246,.5)` | rgba(203,238,246,0.5) = water-mid（+2 别名） @ 50% |
| `footer .lead` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `[inline] i.ripple` | `style="left:714px; top:540px; width:226px; height:36px; border-color:rgba(228,249,255,.3)"` |  | rgba(228,249,255,0.3) = 未收进契约（基色 #e4f9ff） |
| `[inline] i.ripple` | `style="left:714px; top:540px; width:300px; height:46px; border-color:rgba(228,249,255,.16)"` |  | rgba(228,249,255,0.16) = 未收进契约（基色 #e4f9ff） |
| `[inline] i.ripple` | `style="left:1158px; top:540px; width:284px; height:42px; border-color:rgba(228,249,255,.22)"` |  | rgba(228,249,255,0.22) = 未收进契约（基色 #e4f9ff） |
| `[inline] i.ripple` | `style="left:1158px; top:540px; width:356px; height:54px; border-color:rgba(228,249,255,.1)"` |  | rgba(228,249,255,0.1) = 未收进契约（基色 #e4f9ff） |

### 9.4 圆角
| 选择器 | border-radius | 用在哪 |
| --- | --- | --- |
| `.ripple` | `50%` | `position:absolute; transform:translate(-50%,-50%); border-radius:50%; border:1px solid rgba(228,249,255,.42)` |
| `.bottle .cork` | `1px` | `position:absolute; left:9px; top:-6px; width:8px; height:6px; border-radius:1px; background:rgba(243,249,250,.` |
| `.bottle .neck` | `1px 1px 0 0` | `position:absolute; left:8px; top:0; width:10px; height:9px; border:1px solid rgba(203,238,246,.55); border-bot` |
| `.bottle .body` | `2px 2px 3px 3px` | `position:absolute; left:0; top:15px; width:26px; height:31px; border-radius:2px 2px 3px 3px; border:1px solid ` |
| `.bottle .cut` | `2px` | `position:absolute; left:-1px; top:18px; width:28px; height:30px; border-radius:2px; background:linear-gradient` |
| `.bub` | `50%` | `position:absolute; border-radius:50%; border:1px solid rgba(228,249,255,.52); background:rgba(228,249,255,.05)` |
| `.card` | `2px` | `position:absolute; padding:14px 16px; border-radius:2px; border:1px solid rgba(243,249,250,.17); background:ra` |
| `.card .flood` | `0 0 2px 2px` | `position:absolute; left:-1px; right:-1px; bottom:-1px; height:9px; border-radius:0 0 2px 2px; background:linea` |
| `.seal` | `2px` | `position:absolute; z-index:3; font-style:normal; text-align:center; border-radius:2px; font-size:12.5px; lette` |
| `.acts button` | `2px` | `font-family:inherit; font-size:12.5px; padding:7px 13px; cursor:pointer; white-space:nowrap; background:transp` |
| `li.rec .back` | `2px` | `justify-self:start; font-family:inherit; font-size:12.5px; padding:7px 13px; cursor:pointer; background:transp` |

### 9.5 渐变（stop 串原样）
**CSS 渐变声明**：
- `.platter` · `background`：`repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)`
- `.platter.sub` · `background`：`repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.1) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.1) 0 30%, transparent 68%)`
- `.glint` · `background`：`linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)`
- `.shaft` · `background`：`linear-gradient(183deg, rgba(228,247,252,.16) 0%, rgba(228,247,252,.075) 52%, rgba(228,247,252,0) 84%)`
- `.caustic` · `background`：`linear-gradient(97deg, transparent 10%, rgba(200,240,250,.1) 20%, transparent 31%),
          linear-gradient(101deg, transparent 62%, rgba(200,240,250,.07) 76%, transparent 92%)`
- `.deep` · `background`：`linear-gradient(180deg, rgba(3,17,23,0) 0%, rgba(3,17,23,.5) 52%, rgba(3,17,23,.9) 100%)`
- `.surface` · `background`：`linear-gradient(90deg, rgba(228,249,255,0) 0%, rgba(228,249,255,.34) 7%, rgba(228,249,255,.72) 34%, rgba(228,249,255,.66) 72%, rgba(228,249,255,.12) 100%)`
- `.surface-haze` · `background`：`linear-gradient(90deg, rgba(190,238,248,0) 0%, rgba(190,238,248,.11) 22%, rgba(214,244,252,.24) 44%, rgba(190,238,248,.08) 78%, rgba(190,238,248,0) 100%)`
- `.touch` · `background`：`linear-gradient(90deg, rgba(228,249,255,0), rgba(228,249,255,.62), rgba(228,249,255,0))`
- `.tether` · `background`：`repeating-linear-gradient(180deg, rgba(228,249,255,.44) 0 2px, transparent 2px 6px)`
- `.refl` · `background`：`linear-gradient(180deg, rgba(228,249,255,.11), rgba(228,249,255,0))`
- `.bottle .body` · `background`：`linear-gradient(96deg, rgba(203,238,246,.16), rgba(10,48,60,.5) 42%, rgba(10,48,60,.34))`
- `.bottle .cut` · `background`：`linear-gradient(180deg, rgba(3,17,23,.05), rgba(3,17,23,.3))`
- `.bed` · `background`：`repeating-linear-gradient(90deg, rgba(169,199,207,.2) 0 3px, transparent 3px 13px)`
- `.bed.two` · `background`：`repeating-linear-gradient(90deg, transparent 0 11px, rgba(169,199,207,.16) 11px 14px, transparent 14px 30px)`
- `.card` · `background`：`radial-gradient(76% 76% at 30% 22%, rgba(10,48,60,.54), rgba(3,17,23,.82))`
- `.card .flood` · `background`：`linear-gradient(180deg, rgba(6,26,34,.5), rgba(3,17,23,.72))`
- `.card::before` · `background`：`repeating-linear-gradient(180deg, rgba(243,249,250,.26) 0 2px, transparent 2px 7px)`
- `.seal` · `background`：`radial-gradient(62% 72% at 31% 34%, rgba(212,85,58,.15), rgba(212,85,58,0) 74%)`
- `.seal::before` · `-webkit-mask-image`：`repeating-linear-gradient(74deg, #fff 0 5px, rgba(255,255,255,.04) 5px 7px, #fff 7px 17px)`
- `.seal::before` · `mask-image`：`repeating-linear-gradient(74deg, #fff 0 5px, rgba(255,255,255,.04) 5px 7px, #fff 7px 17px)`
- `li.rec .rule` · `background`：`linear-gradient(90deg, rgba(243,249,250,.32), rgba(243,249,250,.05))`

### 9.6 主块几何（`.clip` / `.page` 下顶层绝对定位块）
- 容器：`.clip`：box-sizing:border-box; margin:0; padding:0; position:absolute; inset:0; overflow:hidden
| 宿主 | 块 | 定位 | width | height | transform | z-index |
| --- | --- | --- | --- | --- | --- | --- |
| .clip | `div.dry` | `position:absolute; left:0; right:0; top:0` | — | 540px | — | — |
| .clip | `div.wet` | `position:absolute; left:0; right:0; top:540px; bottom:0` | — | — | — | — |
| .clip | `div.glint` | `position:absolute; inset:0` | — | — | — | — |
| .clip | `div.shaft` | `position:absolute; left:30px; top:-40px` | 940px | 600px | — | — |
| .clip | `div.surface-haze` | `position:absolute; left:0; right:0; top:516px` | — | 46px | — | — |
| .clip | `i.tether` | `position:absolute; left:454px; top:518px` | 1px | 21px | — | — |
| .clip | `i.tether` | `position:absolute; left:902px; top:502px` | 1px | 37px | — | — |
| .clip | `i.refl` | `position:absolute; left:276px; top:541px` | 380px | 38px | translateX(-50%) | — |
| .clip | `i.refl` | `position:absolute; left:714px; top:541px` | 320px | 28px | translateX(-50%) | — |
| .clip | `i.refl` | `position:absolute; left:1158px; top:541px` | 264px | 22px | translateX(-50%) | — |
| .clip | `i.ripple` | `position:absolute; left:276px; top:540px` | 172px | 30px | translate(-50%,-50%) | — |
| .clip | `i.ripple` | `position:absolute; left:714px; top:540px` | 226px | 36px | translate(-50%,-50%) | — |
| .clip | `i.ripple` | `position:absolute; left:714px; top:540px` | 300px | 46px | translate(-50%,-50%) | — |
| .clip | `i.ripple` | `position:absolute; left:1158px; top:540px` | 284px | 42px | translate(-50%,-50%) | — |
| .clip | `i.ripple` | `position:absolute; left:1158px; top:540px` | 356px | 54px | translate(-50%,-50%) | — |
| .clip | `i.bottle` | `position:absolute; left:626px; top:521px` | 25px | 46px | rotate(4deg) | — |
| .clip | `i.touch` | `position:absolute; left:276px; top:539px` | 200px | 2px | translateX(-50%) | — |
| .clip | `i.touch` | `position:absolute; left:714px; top:539px` | 250px | 2px | translateX(-50%) | — |
| .clip | `i.touch` | `position:absolute; left:1158px; top:539px` | 230px | 2px | translateX(-50%) | — |
| .clip | `i.bub` | `position:absolute; left:520px; top:494px` | 5px | 5px | — | — |
| .clip | `i.bub` | `position:absolute; left:540px; top:514px` | 3px | 3px | — | — |
| .clip | `i.bub` | `position:absolute; left:852px; top:490px` | 6px | 6px | — | — |
| .clip | `i.bub` | `position:absolute; left:1322px; top:500px` | 4px | 4px | — | — |
| .clip | `i.bub` | `position:absolute; left:1306px; top:524px` | 3px | 3px | — | — |
| .clip | `i.bub` | `position:absolute; left:196px; top:600px` | 7px | 7px | — | — |
| .clip | `i.bub` | `position:absolute; left:238px; top:658px` | 5px | 5px | — | — |
| .clip | `i.bub` | `position:absolute; left:164px; top:718px` | 4px | 4px | — | — |
| .clip | `i.bub` | `position:absolute; left:640px; top:590px` | 6px | 6px | — | — |
| .clip | `i.bub` | `position:absolute; left:706px; top:648px` | 8px | 8px | — | — |
| .clip | `i.bub` | `position:absolute; left:630px; top:724px` | 5px | 5px | — | — |
| .clip | `i.bub` | `position:absolute; left:1124px; top:596px` | 5px | 5px | — | — |
| .clip | `i.bub` | `position:absolute; left:1180px; top:664px` | 7px | 7px | — | — |
| .clip | `i.bub` | `position:absolute; left:1096px; top:742px` | 4px | 4px | — | — |
| .clip | `i.bub` | `position:absolute; left:1352px; top:700px` | 6px | 6px | — | — |
| .clip | `i.bub` | `position:absolute; left:1290px; top:790px` | 4px | 4px | — | — |
| .clip | `i.bed` | `position:absolute; left:0; right:0; bottom:66px` | — | 1px | — | — |
| .clip | `i.bed` | `position:absolute; left:0; right:0; bottom:52px` | — | 1px | — | — |
- 更深处（不在上表里）的绝对定位块共 **37** 个：
  - `html › body › div.clip`：`position:absolute; inset:0`
  - `html › body › div.clip › div.dry › div.platter`：`position:absolute; inset:0`
  - `html › body › div.clip › div.wet › div.platter`：`position:absolute; top:-540px; inset:0`
  - `html › body › div.clip › div.wet › div.caustic`：`position:absolute; left:-40px; right:-40px; top:0; height:330px`
  - `html › body › div.clip › div.wet › div.deep`：`position:absolute; inset:0`
  - `html › body › div.clip › i.bottle › i.cork`：`position:absolute; left:9px; top:-6px; width:8px; height:6px`
  - `html › body › div.clip › i.bottle › i.neck`：`position:absolute; left:8px; top:0; width:10px; height:9px`
  - `html › body › div.clip › i.bottle › i.shoulder`：`position:absolute; left:2px; top:8px; width:22px; height:8px`
  - `html › body › div.clip › i.bottle › i.body`：`position:absolute; left:0; top:15px; width:26px; height:31px`
  - `html › body › div.clip › i.bottle › i.cut`：`position:absolute; left:-1px; top:18px; width:28px; height:30px`
  - `html › body › main › div.float › div.card`：`position:absolute; left:0; bottom:-8px; width:400px; height:160px; transform:rotate(-.4deg)`
  - `html › body › main › div.float › div.card › i.hair`：`position:absolute; left:16px; right:16px; top:58px; height:1px`
  - …（其余 25 个同为装置内的分件，规则同上：`position:absolute` + 锚点）

### 9.7 SVG / 图形
- （本页无 `<svg>`）

- **全页 transform（含 rotate 角度）**：
  - `.ripple`：`translate(-50%,-50%)`
  - `.touch`：`translateX(-50%)`
  - `.refl`：`translateX(-50%)`
  - `.seal::after`：`translate(1px,-1px)`
  - `[inline] i.bottle`：`rotate(4deg)`
  - `[inline] div.card`：`rotate(-.4deg)`
  - `[inline] i.seal`：`rotate(-2.4deg)`
  - `[inline] div.card`：`rotate(.35deg)`
  - `[inline] i.seal`：`rotate(-1.5deg)`
  - `[inline] div.card`：`rotate(-.3deg)`
  - `[inline] i.seal`：`rotate(-3deg)`
  - `[inline] i.seal`：`rotate(-3.2deg)`
  - `[inline] i.seal`：`rotate(2.4deg)`
  - `[inline] i.seal`：`rotate(-2.1deg)`

### 9.8 文案（逐字，文档顺序；`⟨br⟩` = 源码 `<br />`）
001. `body › main › header › div.cat` → "QC · 母版检验"
002. `body › main › header › h1` → "审核台"
003. `body › main › header › p.sub` → "人工审核是最终决定权：可以驳回、删段、删瓶下架、封禁作者。自动斩杀只负责「把可疑的段先拿下来」，误斩可以在历史里用「恢复这一段」还回去。"
004. `main › div.views › div.view › b` → "待处理"
005. `main › div.views › div.view › span.n` → "3"
006. `main › div.views › div.view › b` → "历史裁决"
007. `main › div.views › div.view › span.n` → "41"
008. `main › div.float › div.card › div.no` → "MDB-0001-A"
009. `main › div.float › div.card › div.kind` → "唱段 · 第 2 段"
010. `main › div.float › div.card › div.rep` → "举报：唱段"
011. `div.float › div.card › div.rep › em` → "第 2 段"
012. `main › div.float › div.card › div.when` → "举报于 2026/9/23 22:41"
013. `div.float › div.card › div.acts › button` → "驳回"
014. `div.float › div.card › div.acts › button.cut` → "删段"
015. `div.float › div.card › div.acts › button.ban` → "封禁作者"
016. `main › div.float › div.card › i.seal` → "待处理"
017. `main › div.float › div.card › div.no` → "MDB-0007-C"
018. `main › div.float › div.card › div.kind` → "瓶子"
019. `main › div.float › div.card › div.rep` → "举报：瓶子"
020. `div.float › div.card › div.rep › em` → "整支下架请求"
021. `main › div.float › div.card › div.when` → "举报于 2026/9/23 20:02"
022. `div.float › div.card › div.acts › button` → "驳回"
023. `div.float › div.card › div.acts › button.cut` → "删瓶下架"
024. `div.float › div.card › div.acts › button.ban` → "封禁作者"
025. `main › div.float › div.card › i.seal` → "待处理"
026. `main › div.float › div.card › div.no` → "MDB-0012-B"
027. `main › div.float › div.card › div.kind` → "留言"
028. `main › div.float › div.card › div.rep` → "举报：留言"
029. `div.float › div.card › div.rep › em` → "私密留言"
030. `main › div.float › div.card › div.when` → "举报于 2026/9/22 11:18"
031. `div.float › div.card › div.acts › button` → "驳回"
032. `div.float › div.card › div.acts › button.ban` → "封禁作者"
033. `main › div.float › div.card › i.seal` → "待处理"
034. `main › ul.sunk › li.rec › span.rno` → "MDB-0006-C"
035. `main › ul.sunk › li.rec › span.robj` → "举报：唱段"
036. `ul.sunk › li.rec › span.robj › em` → "第 3 段"
037. `main › ul.sunk › li.rec › span.rtime` → "举报于 2026/9/22 09:40"
038. `main › ul.sunk › li.rec › button.back` → "恢复这一段"
039. `main › ul.sunk › li.rec › i.seal` → "已删段"
040. `main › ul.sunk › li.rec › span.rno` → "MDB-0003-A"
041. `main › ul.sunk › li.rec › span.robj` → "举报：唱段"
042. `ul.sunk › li.rec › span.robj › em` → "第 1 段"
043. `main › ul.sunk › li.rec › span.rtime` → "举报于 2026/9/21 19:55"
044. `main › ul.sunk › li.rec › i.seal` → "已恢复唱段"
045. `main › ul.sunk › li.rec › span.rno` → "MDB-0005-B"
046. `main › ul.sunk › li.rec › span.robj` → "举报：留言"
047. `ul.sunk › li.rec › span.robj › em` → "私密留言"
048. `main › ul.sunk › li.rec › span.rtime` → "举报于 2026/9/20 14:07"
049. `main › ul.sunk › li.rec › i.seal` → "已驳回"
050. `html › body › footer › span.lead` → "自动斩杀把可疑的段先拿下来；这里是可以推翻它的地方。"
051. `html › body › footer › span.cat` → "待处理 3 · 历史 41"

### 9.9 本页的「装置」
> 水线切开：线上＝浮上来的待处理工单，线下＝沉底的历史裁决；印章有断墨／二次压印／各自旋转角


## 10. 设置 · `p-settings-record.html` → `/settings`
- **它是什么**：最小表单：匿名说明 + 账号信息 + 署名
- **画布**：`html,body` = 1440×900（`overflow:hidden`）；页面底色 `--ink`

### 10.2 排版（选择器 → 值）
| 选择器 | font-size | letter-spacing | line-height | font-weight |
| --- | --- | --- | --- | --- |
| `.slip` | 12.5px | .18em | 36px | — |
| `.refl .rslip` | 12.5px | .18em | 36px | — |
| `.cat` | 11px | .24em | — | — |
| `h1` | 58px | .01em | 1 | 700 |
| `.standfirst` | 14.5px | — | 1.85 | — |
| `h2` | 17px | — | 1.3 | 700 |
| `.row p` | 15.5px | — | 1.85 | — |
| `.num` | 14px | — | — | — |
| `.cap` | 11px | .2em | — | — |
| `.who` | 19px | — | — | 700 |
| `.alt .lbl` | 11px | .2em | — | — |
| `.alt .v` | 12.5px | — | — | — |
| `.act .note` | 12.5px | — | 1.75 | — |
| `.btn` | 13px | .04em | — | — |
| `.body` | 13.5px | — | 1.8 | — |
| `.ver .lbl` | 11px | .2em | — | — |
| `.ver .v` | 18px | .04em | — | — |
| `.env` | 12.5px | — | 1.75 | — |
| `.tiny` | 11px | .16em | — | — |

### 10.3 颜色（选择器 → 值 · 契约状态）
| 选择器 | 属性 | 声明原文 | 解析（hex/rgba → 契约 token） |
| --- | --- | --- | --- |
| `:root` | `--ink` | `#050f14` | #050f14 = ink（+1 别名） |
| `:root` | `--paper` | `#f3f9fa` | #f3f9fa = paper（+1 别名） |
| `:root` | `--muted` | `#a9c7cf` | #a9c7cf = muted（+3 别名） |
| `:root` | `--glass` | `#7fd1d9` | #7fd1d9 = glass（+2 别名） |
| `:root` | `--coral` | `#d4553a` | #d4553a = coral（+3 别名） |
| `:root` | `--warm` | `#f6d79a` | #f6d79a = warm（+1 别名） |
| `:root` | `--line` | `rgba(243,249,250,.13)` | rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `body` | `background` | `var(--ink)` | --ink ⇒ #050f14 = ink（+1 别名） |
| `body` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.platter` | `background` | `repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)` | rgba(216,243,246,0.055) = line（+1 别名） @ 5.5%；rgba(127,209,217,0.05) = glass（+2 别名） @ 5%；transparent（透明，非色值） |
| `.glint` | `background` | `linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)` | rgba(228,247,252,0.045) = water-deep @ 4.5%；rgba(228,247,252,0.065) = water-deep @ 6.5%；rgba(228,247,252,0.028) = water-deep @ 2.8%；transparent（透明，非色值） |
| `.air` | `background` | `linear-gradient(180deg, rgba(127,209,217,.085) 0%, rgba(127,209,217,.022) 58%, rgba(127,209,217,0) 100%)` | rgba(127,209,217,0.085) = glass（+2 别名） @ 8.5%；rgba(127,209,217,0.022) = glass（+2 别名） @ 2.2%；rgba(127,209,217,0) = glass（+2 别名） @ 0% |
| `.sea` | `background` | `linear-gradient(180deg, rgba(5,24,32,.5) 0%, rgba(4,16,22,.7) 52%, rgba(3,12,17,.8) 100%)` | rgba(5,24,32,0.5) = 未收进契约（基色 #051820）；rgba(4,16,22,0.7) = 未收进契约（基色 #041016）；rgba(3,12,17,0.8) = 未收进契约（基色 #030c11） |
| `.shaft` | `background` | `linear-gradient(99deg, transparent 20%, rgba(127,209,217,.05) 37%,
          rgba(127,209,217,.085) 44%, rgba(127,209,217,.035) 53%, transparent 70%)` | rgba(127,209,217,0.05) = glass（+2 别名） @ 5%；rgba(127,209,217,0.085) = glass（+2 别名） @ 8.5%；rgba(127,209,217,0.035) = glass（+2 别名） @ 3.5%；transparent（透明，非色值） |
| `.shaft` | `-webkit-mask-image` | `linear-gradient(180deg, #fff, rgba(255,255,255,0) 92%)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.shaft` | `mask-image` | `linear-gradient(180deg, #fff, rgba(255,255,255,0) 92%)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.grooves-wet` | `background` | `repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.085) 0 1.2px, transparent 1.2px 6.5px)` | rgba(216,243,246,0.085) = line（+1 别名） @ 8.5%；transparent（透明，非色值） |
| `.surf` | `background` | `linear-gradient(180deg, rgba(127,209,217,.09), rgba(127,209,217,0))` | rgba(127,209,217,0.09) = glass（+2 别名） @ 9%；rgba(127,209,217,0) = glass（+2 别名） @ 0% |
| `.leaf` | `border` | `1px solid rgba(243,249,250,.15)` | rgba(243,249,250,0.15) = paper（+1 别名） @ 15% |
| `.leaf-dry` | `background` | `linear-gradient(168deg, rgba(12,42,54,.9) 0%, rgba(8,31,42,.92) 60%, rgba(6,25,34,.93) 100%)` | rgba(12,42,54,0.9) = 未收进契约（基色 #0c2a36）；rgba(8,31,42,0.92) = 未收进契约（基色 #081f2a）；rgba(6,25,34,0.93) = 未收进契约（基色 #061922） |
| `.leaf-wet` | `background` | `linear-gradient(180deg, rgba(8,34,45,.32) 0%, rgba(6,26,35,.46) 58%, rgba(5,20,28,.56) 100%)` | rgba(8,34,45,0.32) = 未收进契约（基色 #08222d）；rgba(6,26,35,0.46) = 未收进契约（基色 #061a23）；rgba(5,20,28,0.56) = 未收进契约（基色 #05141c） |
| `.tide` | `background` | `linear-gradient(180deg, rgba(2,10,14,.5), rgba(2,10,14,0))` | rgba(2,10,14,0.5) = 未收进契约（基色 #020a0e）；rgba(2,10,14,0) = 未收进契约（基色 #020a0e） |
| `.film` | `background` | `linear-gradient(180deg, rgba(127,209,217,.07), rgba(127,209,217,.015) 55%, rgba(127,209,217,0))` | rgba(127,209,217,0.07) = glass（+2 别名） @ 7%；rgba(127,209,217,0.015) = glass（+2 别名） @ 1.5%；rgba(127,209,217,0) = glass（+2 别名） @ 0% |
| `.leaf-top` | `background` | `linear-gradient(90deg, transparent 3%, rgba(203,238,246,.32) 38%, rgba(243,249,250,.14) 82%, transparent 97%)` | rgba(203,238,246,0.32) = water-mid（+2 别名） @ 32%；rgba(243,249,250,0.14) = paper（+1 别名） @ 14%；transparent（透明，非色值） |
| `.dogear` | `background` | `rgba(203,238,246,.4)` | rgba(203,238,246,0.4) = water-mid（+2 别名） @ 40% |
| `.crease-shl` | `background` | `linear-gradient(90deg, rgba(3,12,17,0), rgba(3,12,17,.38))` | rgba(3,12,17,0) = 未收进契约（基色 #030c11）；rgba(3,12,17,0.38) = 未收进契约（基色 #030c11） |
| `.crease-shr` | `background` | `linear-gradient(90deg, rgba(203,238,246,.07), rgba(203,238,246,0))` | rgba(203,238,246,0.07) = water-mid（+2 别名） @ 7%；rgba(203,238,246,0) = water-mid（+2 别名） @ 0% |
| `.crease` | `background` | `linear-gradient(90deg, rgba(3,12,17,.62) 0 1px, rgba(228,247,252,.3) 1px 2px, rgba(3,12,17,.34) 2px 3px)` | rgba(3,12,17,0.62) = 未收进契约（基色 #030c11）；rgba(228,247,252,0.3) = water-deep @ 30%；rgba(3,12,17,0.34) = 未收进契约（基色 #030c11） |
| `.crease-soak` | `background` | `linear-gradient(90deg, rgba(3,12,17,0), rgba(2,10,14,.5), rgba(3,12,17,0))` | rgba(3,12,17,0) = 未收进契约（基色 #030c11）；rgba(2,10,14,0.5) = 未收进契约（基色 #020a0e） |
| `.wick` | `background` | `linear-gradient(0deg, rgba(127,209,217,.45), rgba(127,209,217,0))` | rgba(127,209,217,0.45) = glass（+2 别名） @ 45%；rgba(127,209,217,0) = glass（+2 别名） @ 0% |
| `.hole` | `background` | `radial-gradient(circle at 36% 32%, rgba(2,8,12,.97) 0 64%, rgba(127,209,217,.14) 100%)` | rgba(2,8,12,0.97) = 未收进契约（基色 #02080c）；rgba(127,209,217,0.14) = glass（+2 别名） @ 14% |
| `.hole` | `border` | `1px solid rgba(228,247,252,.34)` | rgba(228,247,252,0.34) = water-deep @ 34% |
| `.hole i` | `border-bottom` | `1px solid rgba(228,247,252,.42)` | rgba(228,247,252,0.42) = water-deep @ 42% |
| `.hole i` | `border-right` | `1px solid rgba(228,247,252,.24)` | rgba(228,247,252,0.24) = water-deep @ 24% |
| `.wline` | `background` | `linear-gradient(90deg, rgba(203,238,246,.52) 0 120px, rgba(203,238,246,.2) 120px 300px,
          rgba(203,238,246,.48) 336px 424px, rgba(203,238,246,.19) 460px 1040px,
          rgba(203,238,246,.36) 1080px 1400px, rgba(243,249,250,.16) 1400px 1440px)` | rgba(203,238,246,0.52) = water-mid（+2 别名） @ 52%；rgba(203,238,246,0.2) = water-mid（+2 别名） @ 20%；rgba(203,238,246,0.48) = water-mid（+2 别名） @ 48%；rgba(203,238,246,0.19) = water-mid（+2 别名） @ 19%；rgba(203,238,246,0.36) = water-mid（+2 别名） @ 36%；rgba(243,249,250,0.16) = paper（+1 别名） @ 16% |
| `.wline i` | `background` | `rgba(228,247,252,.32)` | rgba(228,247,252,0.32) = water-deep @ 32% |
| `.glass` | `background` | `linear-gradient(90deg, rgba(127,209,217,.34), rgba(127,209,217,.12) 26%,
          rgba(228,247,252,.4) 40%, rgba(127,209,217,.14) 54%, rgba(127,209,217,.3))` | rgba(127,209,217,0.34) = glass（+2 别名） @ 34%；rgba(127,209,217,0.12) = glass（+2 别名） @ 12%；rgba(228,247,252,0.4) = water-deep @ 40%；rgba(127,209,217,0.14) = glass（+2 别名） @ 14%；rgba(127,209,217,0.3) = glass（+2 别名） @ 30% |
| `.bot-body` | `border` | `1px solid rgba(216,243,246,.68)` | rgba(216,243,246,0.68) = line（+1 别名） @ 68% |
| `.bot-neck` | `border` | `1px solid rgba(216,243,246,.64)` | rgba(216,243,246,0.64) = line（+1 别名） @ 64% |
| `.bot-lip` | `background` | `rgba(216,243,246,.62)` | rgba(216,243,246,0.62) = line（+1 别名） @ 62% |
| `.bot-cork` | `background` | `rgba(246,215,154,.52)` | rgba(246,215,154,0.52) = warm（+1 别名） @ 52% |
| `.bot-cork` | `border` | `1px solid rgba(246,215,154,.72)` | rgba(246,215,154,0.72) = warm（+1 别名） @ 72% |
| `.bot-l1` | `background` | `linear-gradient(180deg, rgba(228,247,252,.82), rgba(228,247,252,.14))` | rgba(228,247,252,0.82) = water-deep @ 82%；rgba(228,247,252,0.14) = water-deep @ 14% |
| `.bot-l2` | `background` | `rgba(228,247,252,.34)` | rgba(228,247,252,0.34) = water-deep @ 34% |
| `.slip` | `background` | `rgba(246,215,154,.18)` | rgba(246,215,154,0.18) = warm（+1 别名） @ 18% |
| `.slip` | `border` | `1px solid rgba(246,215,154,.55)` | rgba(246,215,154,0.55) = warm（+1 别名） @ 55% |
| `.slip` | `color` | `rgba(246,215,154,.95)` | rgba(246,215,154,0.95) = warm（+1 别名） @ 95% |
| `.wave i` | `background` | `rgba(127,209,217,.55)` | rgba(127,209,217,0.55) = glass（+2 别名） @ 55% |
| `.contact` | `background` | `linear-gradient(180deg, rgba(203,238,246,.06), rgba(203,238,246,.46) 48%, rgba(203,238,246,0))` | rgba(203,238,246,0.06) = water-mid（+2 别名） @ 6%；rgba(203,238,246,0.46) = water-mid（+2 别名） @ 46%；rgba(203,238,246,0) = water-mid（+2 别名） @ 0% |
| `.rip` | `border` | `1px solid rgba(203,238,246,.32)` | rgba(203,238,246,0.32) = water-mid（+2 别名） @ 32% |
| `.rip.b` | `border-color` | `rgba(203,238,246,.2)` | rgba(203,238,246,0.2) = water-mid（+2 别名） @ 20% |
| `.refl` | `-webkit-mask-image` | `linear-gradient(180deg, #fff 0%, rgba(255,255,255,.62) 58%, rgba(255,255,255,.14) 100%)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.62) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.14) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.refl` | `mask-image` | `linear-gradient(180deg, #fff 0%, rgba(255,255,255,.62) 58%, rgba(255,255,255,.14) 100%)` | #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.62) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.14) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.refl .glass` | `background` | `linear-gradient(90deg, rgba(127,209,217,.2), rgba(127,209,217,.07) 30%,
        rgba(228,247,252,.24) 46%, rgba(127,209,217,.07) 62%, rgba(127,209,217,.17))` | rgba(127,209,217,0.2) = glass（+2 别名） @ 20%；rgba(127,209,217,0.07) = glass（+2 别名） @ 7%；rgba(228,247,252,0.24) = water-deep @ 24%；rgba(127,209,217,0.17) = glass（+2 别名） @ 17% |
| `.refl .rb` | `border` | `1px solid rgba(216,243,246,.28)` | rgba(216,243,246,0.28) = line（+1 别名） @ 28% |
| `.refl .rl` | `background` | `rgba(203,238,246,.16)` | rgba(203,238,246,0.16) = water-mid（+2 别名） @ 16% |
| `.refl .rc` | `background` | `rgba(246,215,154,.22)` | rgba(246,215,154,0.22) = warm（+1 别名） @ 22% |
| `.refl .rslip` | `background` | `rgba(246,215,154,.1)` | rgba(246,215,154,0.1) = warm（+1 别名） @ 10% |
| `.refl .rslip` | `border` | `1px solid rgba(246,215,154,.34)` | rgba(246,215,154,0.34) = warm（+1 别名） @ 34% |
| `.refl .rslip` | `color` | `rgba(246,215,154,.66)` | rgba(246,215,154,0.66) = warm（+1 别名） @ 66% |
| `.wav` | `background` | `linear-gradient(90deg, transparent, rgba(203,238,246,.3) 16%, rgba(203,238,246,.13) 64%, transparent)` | rgba(203,238,246,0.3) = water-mid（+2 别名） @ 30%；rgba(203,238,246,0.13) = water-mid（+2 别名） @ 13%；transparent（透明，非色值） |
| `.bub` | `background` | `rgba(203,238,246,.14)` | rgba(203,238,246,0.14) = water-mid（+2 别名） @ 14% |
| `.bub` | `border` | `1px solid rgba(203,238,246,.26)` | rgba(203,238,246,0.26) = water-mid（+2 别名） @ 26% |
| `.cat` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.standfirst` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.rule` | `background` | `var(--line)` | --line ⇒ rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `h2.block` | `border-bottom` | `1px solid var(--line)` | --line ⇒ rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `.row + .row` | `border-top` | `1px solid rgba(243,249,250,.08)` | rgba(243,249,250,0.08) = paper（+1 别名） @ 8% |
| `.row p` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.num` | `color` | `rgba(203,238,246,.5)` | rgba(203,238,246,0.5) = water-mid（+2 别名） @ 50% |
| `.num.deep` | `color` | `rgba(243,249,250,.36)` | rgba(243,249,250,0.36) = paper（+1 别名） @ 36% |
| `.cap.up` | `color` | `rgba(203,238,246,.62)` | rgba(203,238,246,0.62) = water-mid（+2 别名） @ 62% |
| `.cap.up::before` | `background` | `rgba(203,238,246,.5)` | rgba(203,238,246,0.5) = water-mid（+2 别名） @ 50% |
| `.cap.dn` | `color` | `rgba(169,199,207,.7)` | rgba(169,199,207,0.7) = muted（+3 别名） @ 70% |
| `.cap.dn::before` | `background` | `rgba(243,249,250,.28)` | rgba(243,249,250,0.28) = paper（+1 别名） @ 28% |
| `.tick` | `background` | `var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `.alt .lbl` | `color` | `rgba(243,249,250,.42)` | rgba(243,249,250,0.42) = paper（+1 别名） @ 42% |
| `.alt .v` | `color` | `rgba(243,249,250,.42)` | rgba(243,249,250,0.42) = paper（+1 别名） @ 42% |
| `.hr` | `background` | `var(--line)` | --line ⇒ rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `.act .note` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.btn` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.btn` | `background` | `transparent` | transparent（透明，非色值） |
| `.btn` | `border` | `1px solid rgba(243,249,250,.26)` | rgba(243,249,250,0.26) = paper（+1 别名） @ 26% |
| `.body` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.ver .lbl` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.env` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.tiny` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |

### 10.4 圆角
| 选择器 | border-radius | 用在哪 |
| --- | --- | --- |
| `.leaf` | `2px` | `position:absolute; left:104px; top:52px; width:1232px; height:796px; border-radius:2px; border:1px solid rgba(` |
| `.hole` | `50%` | `position:absolute; left:1160px; top:730px; width:34px; height:34px; border-radius:50%; background:radial-gradi` |
| `.hole i` | `50%` | `position:absolute; inset:2px; border-radius:50%; border-bottom:1px solid rgba(228,247,252,.42); border-right:1` |
| `.bot-body` | `2px 2px 4px 4px` | `left:1182px; top:416px; width:112px; height:104px; border-radius:2px 2px 4px 4px; border:1px solid rgba(216,24` |
| `.bot-neck` | `2px` | `left:1214px; top:356px; width:48px; height:44px; border-radius:2px; border:1px solid rgba(216,243,246,.64)` |
| `.bot-lip` | `2px` | `position:absolute; left:1212px; top:346px; width:52px; height:10px; border-radius:2px; background:rgba(216,243` |
| `.bot-cork` | `2px` | `position:absolute; left:1216px; top:332px; width:44px; height:14px; border-radius:2px; background:rgba(246,215` |
| `.slip` | `2px` | `position:absolute; left:1204px; top:440px; width:68px; height:36px; border-radius:2px; background:rgba(246,215` |
| `.rip` | `50%` | `position:absolute; border:1px solid rgba(203,238,246,.32); border-radius:50%` |
| `.refl .rb` | `2px` | `left:0; top:0; width:112px; height:104px; border-radius:2px; border:1px solid rgba(216,243,246,.28)` |
| `.refl .rn` | `2px` | `left:32px; top:120px; width:48px; height:44px; border-radius:2px` |
| `.refl .rl` | `2px` | `position:absolute; left:30px; top:164px; width:52px; height:10px; border-radius:2px; background:rgba(203,238,2` |
| `.refl .rc` | `2px` | `position:absolute; left:34px; top:174px; width:44px; height:14px; border-radius:2px; background:rgba(246,215,1` |
| `.refl .rslip` | `2px` | `position:absolute; left:22px; top:24px; width:68px; height:36px; border-radius:2px; background:rgba(246,215,15` |
| `.bub` | `50%` | `position:absolute; border-radius:50%; background:rgba(203,238,246,.14); border:1px solid rgba(203,238,246,.26)` |
| `.btn` | `2px` | `display:inline-block; padding:9px 17px; font-family:inherit; font-size:13px; color:var(--paper); background:tr` |

### 10.5 渐变（stop 串原样）
**CSS 渐变声明**：
- `.platter` · `background`：`repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)`
- `.glint` · `background`：`linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)`
- `.air` · `background`：`linear-gradient(180deg, rgba(127,209,217,.085) 0%, rgba(127,209,217,.022) 58%, rgba(127,209,217,0) 100%)`
- `.sea` · `background`：`linear-gradient(180deg, rgba(5,24,32,.5) 0%, rgba(4,16,22,.7) 52%, rgba(3,12,17,.8) 100%)`
- `.shaft` · `background`：`linear-gradient(99deg, transparent 20%, rgba(127,209,217,.05) 37%,
          rgba(127,209,217,.085) 44%, rgba(127,209,217,.035) 53%, transparent 70%)`
- `.shaft` · `-webkit-mask-image`：`linear-gradient(180deg, #fff, rgba(255,255,255,0) 92%)`
- `.shaft` · `mask-image`：`linear-gradient(180deg, #fff, rgba(255,255,255,0) 92%)`
- `.grooves-wet` · `background`：`repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.085) 0 1.2px, transparent 1.2px 6.5px)`
- `.surf` · `background`：`linear-gradient(180deg, rgba(127,209,217,.09), rgba(127,209,217,0))`
- `.leaf-dry` · `background`：`linear-gradient(168deg, rgba(12,42,54,.9) 0%, rgba(8,31,42,.92) 60%, rgba(6,25,34,.93) 100%)`
- `.leaf-wet` · `background`：`linear-gradient(180deg, rgba(8,34,45,.32) 0%, rgba(6,26,35,.46) 58%, rgba(5,20,28,.56) 100%)`
- `.tide` · `background`：`linear-gradient(180deg, rgba(2,10,14,.5), rgba(2,10,14,0))`
- `.film` · `background`：`linear-gradient(180deg, rgba(127,209,217,.07), rgba(127,209,217,.015) 55%, rgba(127,209,217,0))`
- `.leaf-top` · `background`：`linear-gradient(90deg, transparent 3%, rgba(203,238,246,.32) 38%, rgba(243,249,250,.14) 82%, transparent 97%)`
- `.crease-shl` · `background`：`linear-gradient(90deg, rgba(3,12,17,0), rgba(3,12,17,.38))`
- `.crease-shr` · `background`：`linear-gradient(90deg, rgba(203,238,246,.07), rgba(203,238,246,0))`
- `.crease` · `background`：`linear-gradient(90deg, rgba(3,12,17,.62) 0 1px, rgba(228,247,252,.3) 1px 2px, rgba(3,12,17,.34) 2px 3px)`
- `.crease-soak` · `background`：`linear-gradient(90deg, rgba(3,12,17,0), rgba(2,10,14,.5), rgba(3,12,17,0))`
- `.wick` · `background`：`linear-gradient(0deg, rgba(127,209,217,.45), rgba(127,209,217,0))`
- `.hole` · `background`：`radial-gradient(circle at 36% 32%, rgba(2,8,12,.97) 0 64%, rgba(127,209,217,.14) 100%)`
- `.wline` · `background`：`linear-gradient(90deg, rgba(203,238,246,.52) 0 120px, rgba(203,238,246,.2) 120px 300px,
          rgba(203,238,246,.48) 336px 424px, rgba(203,238,246,.19) 460px 1040px,
          rgba(203,238,246,.36) 1080px 1400px, rgba(243,249,250,.16) 1400px 1440px)`
- `.glass` · `background`：`linear-gradient(90deg, rgba(127,209,217,.34), rgba(127,209,217,.12) 26%,
          rgba(228,247,252,.4) 40%, rgba(127,209,217,.14) 54%, rgba(127,209,217,.3))`
- `.bot-l1` · `background`：`linear-gradient(180deg, rgba(228,247,252,.82), rgba(228,247,252,.14))`
- `.contact` · `background`：`linear-gradient(180deg, rgba(203,238,246,.06), rgba(203,238,246,.46) 48%, rgba(203,238,246,0))`
- `.refl` · `-webkit-mask-image`：`linear-gradient(180deg, #fff 0%, rgba(255,255,255,.62) 58%, rgba(255,255,255,.14) 100%)`
- `.refl` · `mask-image`：`linear-gradient(180deg, #fff 0%, rgba(255,255,255,.62) 58%, rgba(255,255,255,.14) 100%)`
- `.refl .glass` · `background`：`linear-gradient(90deg, rgba(127,209,217,.2), rgba(127,209,217,.07) 30%,
        rgba(228,247,252,.24) 46%, rgba(127,209,217,.07) 62%, rgba(127,209,217,.17))`
- `.wav` · `background`：`linear-gradient(90deg, transparent, rgba(203,238,246,.3) 16%, rgba(203,238,246,.13) 64%, transparent)`

### 10.6 主块几何（`.clip` / `.page` 下顶层绝对定位块）
- 容器：`.clip`：box-sizing:border-box; margin:0; padding:0; position:absolute; inset:0; overflow:hidden
| 宿主 | 块 | 定位 | width | height | transform | z-index |
| --- | --- | --- | --- | --- | --- | --- |
| .clip | `div.platter` | `position:absolute; inset:0` | — | — | — | — |
| .clip | `div.glint` | `position:absolute; inset:0` | — | — | — | — |
| .clip | `div.air` | `position:absolute; left:0; right:0; top:0` | — | 520px | — | — |
| .clip | `div.sea` | `position:absolute; left:0; right:0; top:520px; bottom:0` | — | — | — | — |
| .clip | `div.shaft` | `position:absolute; left:0; right:0; top:520px` | — | 380px | — | — |
| .clip | `div.grooves-wet` | `position:absolute; left:0; right:0; top:520px; bottom:0` | — | — | — | — |
| .clip | `div.surf` | `position:absolute; left:0; right:0; top:520px` | — | 30px | — | — |
| .clip | `div.leaf` | `position:absolute; left:104px; top:52px` | 1232px | 796px | — | — |
| .clip | `div.wline` | `position:absolute; left:0; right:0; top:520px` | — | 1px | — | — |
| .clip | `div.rip` | `position:absolute; left:1163px; top:513px` | 150px | 13px | — | — |
| .clip | `div.rip` | `position:absolute; left:1190px; top:516px` | 96px | 8px | — | — |
| .clip | `div.contact` | `position:absolute; left:1182px; top:516px` | 112px | 7px | — | — |
| .clip | `div.glass` | `position:absolute; left:1182px; top:400px` | 112px | 16px | — | — |
| .clip | `div.glass` | `position:absolute; left:1214px; top:356px` | 48px | 44px | — | — |
| .clip | `div.glass` | `position:absolute; left:1182px; top:416px` | 112px | 104px | — | — |
| .clip | `div.bot-lip` | `position:absolute; left:1212px; top:346px` | 52px | 10px | — | — |
| .clip | `div.bot-cork` | `position:absolute; left:1216px; top:332px` | 44px | 14px | — | — |
| .clip | `div.bot-l1` | `position:absolute; left:1191px; top:420px` | 3px | 96px | — | — |
| .clip | `div.bot-l2` | `position:absolute; left:1287px; top:420px` | 1px | 96px | — | — |
| .clip | `div.slip` | `position:absolute; left:1204px; top:440px` | 68px | 36px | rotate(-4deg) | — |
| .clip | `div.wave` | `position:absolute; left:1216px; top:264px` | 45px | 48px | — | — |
| .clip | `div.refl` | `position:absolute; left:1182px; top:520px` | 112px | 190px | — | — |
| .clip | `div.wav` | `position:absolute; left:1150px; top:540px` | 160px | 1px | — | — |
| .clip | `div.wav` | `position:absolute; left:1168px; top:566px` | 130px | 1px | — | — |
| .clip | `div.wav` | `position:absolute; left:1156px; top:598px` | 150px | 1px | — | — |
| .clip | `div.bub` | `position:absolute; left:1146px; top:636px` | 8px | 8px | — | — |
| .clip | `div.bub` | `position:absolute; left:1159px; top:603px` | 6px | 6px | — | — |
| .clip | `div.bub` | `position:absolute; left:1136px; top:670px` | 4px | 4px | — | — |
- 更深处（不在上表里）的绝对定位块共 **43** 个：
  - `html › body › div.clip`：`position:absolute; inset:0`
  - `html › body › div.clip › div.leaf › div.leaf-dry`：`position:absolute; left:0; top:0; width:1232px; height:468px`
  - `html › body › div.clip › div.leaf › div.leaf-wet`：`position:absolute; left:0; top:468px; width:1232px; height:328px`
  - `html › body › div.clip › div.leaf › div.tide`：`position:absolute; left:0; top:468px; width:1232px; height:12px`
  - `html › body › div.clip › div.leaf › div.film`：`position:absolute; left:0; top:468px; width:1232px; height:328px`
  - `html › body › div.clip › div.leaf › div.leaf-top`：`position:absolute; left:0; right:0; top:0; height:1px`
  - `html › body › div.clip › div.leaf › div.dogear`：`position:absolute; left:0; top:29px; width:41px; height:1px; transform:rotate(-45deg); transform-origin:0 0`
  - `html › body › div.clip › div.leaf › div.crease-shl`：`position:absolute; left:588px; top:0; width:28px; height:796px`
  - `html › body › div.clip › div.leaf › div.crease-shr`：`position:absolute; left:619px; top:0; width:28px; height:796px`
  - `html › body › div.clip › div.leaf › div.crease`：`position:absolute; left:616px; top:0; width:3px; height:796px`
  - `html › body › div.clip › div.leaf › div.crease-soak`：`position:absolute; left:615px; top:468px; width:5px; height:328px`
  - `html › body › div.clip › div.leaf › div.wick`：`position:absolute; left:614px; top:452px; width:6px; height:16px`
  - …（其余 31 个同为装置内的分件，规则同上：`position:absolute` + 锚点）

### 10.7 SVG / 图形
- （本页无 `<svg>`）

- **全页 transform（含 rotate 角度）**：
  - `.dogear`：`rotate(-45deg)` / transform-origin:`0 0`
  - `.slip`：`rotate(-4deg)`
  - `.refl .rslip`：`rotate(4deg)`

### 10.8 文案（逐字，文档顺序；`⟨br⟩` = 源码 `<br />`）
001. `html › body › div.clip › div.slip` → "代号"
002. `body › div.clip › div.refl › div.rslip` → "账号"
003. `body › main › section.l-dry › p.cat` → "内袋说明书 · INNER SLEEVE INSERT"
004. `body › main › section.l-dry › h1` → "设置"
005. `body › main › section.l-dry › p.standfirst` → "这一版只保留最小设置：看看匿名规则、退出登录、确认页面版本。"
006. `body › main › section.l-dry › h2.block` → "匿名的边界"
007. `section.l-dry › div.rows › div.row › span.num` → "一"
008. `section.l-dry › div.rows › div.row › p` → "每支瓶子一个独立代号（同一瓶里大家看到的是同一个）"
009. `section.l-dry › div.rows › div.row › span.num` → "二"
010. `section.l-dry › div.rows › div.row › p` → "别人拿不到你的账号，只能看到代号与你的声音"
011. `html › body › main › p.cap` → "水面之上 · 别人看得到的"
012. `html › body › main › p.cap` → "水面之下 · 只有你自己知道的"
013. `html › body › main › p.tiny` → "你的声音"
014. `html › body › main › p.tiny` → "倒影 · 账号与邮箱"
015. `section.l-wet › div.rows › div.row › span.num` → "三"
016. `section.l-wet › div.rows › div.row › p` → "账号只用于认领你自己的漂流瓶与漂流日志。"
017. `body › main › section.l-wet › h2.block` → "当前身份"
018. `body › main › section.l-wet › p.who` → "未登录"
019. `main › section.l-wet › p.alt › span.lbl` → "已登录态"
020. `main › section.l-wet › p.alt › span.v` → "已登录：代号（邮箱）"
021. `main › section.l-wet › div.act › button.btn` → "登出"
022. `main › section.l-wet › div.act › p.note` → "登出只清掉这台设备上的会话，别人不会因此看到你的瓶子。"
023. `body › main › section.r-dry › h2.block` → "伴奏与授权"
024. `body › main › section.r-dry › p.body` → "曲库伴奏为 CC BY 4.0 授权（署名义务），点开查看完整署名与许可条款。"
025. `body › main › section.r-dry › button.btn` → "查看署名与许可"
026. `body › main › section.r-dry › h2.block` → "关于"
027. `main › section.r-dry › p.ver › span.lbl` → "契约版本"
028. `main › section.r-dry › p.ver › span.v` → "0.2.0-s1"
029. `body › main › section.r-dry › p.env` → "录音只在 https 或 localhost 下可用（浏览器策略）；局域网 IP 访问时录不了音不是页面故障。"

### 10.9 本页的「装置」
> 内袋折页 + 水线切开「匿名的边界」（线上别人看得到／线下只有你知道）


## 11. 404 · `p-404-record.html` → 未匹配路径 → notFound
- **它是什么**：空状态页：路走不通
- **画布**：`html,body` = 1440×900（`overflow:hidden`）；页面底色 `--ink`

### 11.2 排版（选择器 → 值）
| 选择器 | font-size | letter-spacing | line-height | font-weight |
| --- | --- | --- | --- | --- |
| `.cat` | 11px | .24em | — | — |
| `.status` | 34px | — | 1 | — |
| `h1.torn span` | 62px | — | 1 | 700 |
| `.hurt` | 15.5px | .12em | — | — |
| `.sub` | 15.5px | — | 1.9 | — |
| `.back` | 17px | — | — | — |
| `.alt` | 14.5px | — | — | — |
| `.links a` | 15px | — | — | — |
| `.drift` | 12.5px | .06em | — | — |

### 11.3 颜色（选择器 → 值 · 契约状态）
| 选择器 | 属性 | 声明原文 | 解析（hex/rgba → 契约 token） |
| --- | --- | --- | --- |
| `:root` | `--ink` | `#050f14` | #050f14 = ink（+1 别名） |
| `:root` | `--paper` | `#f3f9fa` | #f3f9fa = paper（+1 别名） |
| `:root` | `--muted` | `#a9c7cf` | #a9c7cf = muted（+3 别名） |
| `:root` | `--glass` | `#7fd1d9` | #7fd1d9 = glass（+2 别名） |
| `:root` | `--coral` | `#d4553a` | #d4553a = coral（+3 别名） |
| `:root` | `--warm` | `#f6d79a` | #f6d79a = warm（+1 别名） |
| `:root` | `--line` | `rgba(243,249,250,.13)` | rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `body` | `background` | `var(--ink)` | --ink ⇒ #050f14 = ink（+1 别名） |
| `body` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.cat` | `color` | `rgba(243,249,250,.5)` | rgba(243,249,250,0.5) = paper（+1 别名） @ 50% |
| `.platter` | `background` | `repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)` | rgba(216,243,246,0.055) = line（+1 别名） @ 5.5%；rgba(127,209,217,0.05) = glass（+2 别名） @ 5%；transparent（透明，非色值） |
| `.glint` | `background` | `linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)` | rgba(228,247,252,0.045) = water-deep @ 4.5%；rgba(228,247,252,0.065) = water-deep @ 6.5%；rgba(228,247,252,0.028) = water-deep @ 2.8%；transparent（透明，非色值） |
| `.groove` | `background` | `repeating-radial-gradient(circle at 1500px 1400px, rgba(216,243,246,.1) 0 1px, transparent 1px 15px)` | rgba(216,243,246,0.1) = line（+1 别名） @ 10%；transparent（透明，非色值） |
| `.groove` | `-webkit-mask-image` | `radial-gradient(1150px 820px at 1180px 180px, rgba(255,255,255,.95), rgba(255,255,255,.3) 72%)` | rgba(255,255,255,0.95) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.3) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.groove` | `mask-image` | `radial-gradient(1150px 820px at 1180px 180px, rgba(255,255,255,.95), rgba(255,255,255,.3) 72%)` | rgba(255,255,255,0.95) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.3) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.water` | `background` | `linear-gradient(180deg, rgba(127,209,217,.07) 0%, rgba(127,209,217,.12) 44%,
          rgba(160,226,236,.2) 78%, rgba(189,238,246,.26) 100%)` | rgba(127,209,217,0.07) = glass（+2 别名） @ 7%；rgba(127,209,217,0.12) = glass（+2 别名） @ 12%；rgba(160,226,236,0.2) = 未收进契约（基色 #a0e2ec）；rgba(189,238,246,0.26) = 未收进契约（基色 #bdeef6） |
| `.flows span` | `background` | `rgba(203,238,246,.16)` | rgba(203,238,246,0.16) = water-mid（+2 别名） @ 16% |
| `.lip` | `background` | `linear-gradient(180deg, rgba(203,238,246,0), rgba(203,238,246,.14) 62%, rgba(203,238,246,.28))` | rgba(203,238,246,0) = water-mid（+2 别名） @ 0%；rgba(203,238,246,0.14) = water-mid（+2 别名） @ 14%；rgba(203,238,246,0.28) = water-mid（+2 别名） @ 28% |
| `.edge` | `background` | `linear-gradient(180deg, transparent, rgba(2,8,11,.72))` | rgba(2,8,11,0.72) = 未收进契约（基色 #02080b）；transparent（透明，非色值） |
| `.surface` | `background` | `linear-gradient(90deg, rgba(203,238,246,.3) 0%, rgba(203,238,246,.16) 30%,
          rgba(203,238,246,.42) 58%, rgba(207,240,247,.62) 84%, rgba(203,238,246,.32) 100%)` | rgba(203,238,246,0.3) = water-mid（+2 别名） @ 30%；rgba(203,238,246,0.16) = water-mid（+2 别名） @ 16%；rgba(203,238,246,0.42) = water-mid（+2 别名） @ 42%；rgba(207,240,247,0.62) = 未收进契约（基色 #cff0f7）；rgba(203,238,246,0.32) = water-mid（+2 别名） @ 32% |
| `.lintel` | `background` | `rgba(2,8,11,.6)` | rgba(2,8,11,0.6) = 未收进契约（基色 #02080b） |
| `.drips span` | `background` | `linear-gradient(180deg, rgba(203,238,246,.5), rgba(203,238,246,0))` | rgba(203,238,246,0.5) = water-mid（+2 别名） @ 50%；rgba(203,238,246,0) = water-mid（+2 别名） @ 0% |
| `.drips i` | `background` | `rgba(203,238,246,.34)` | rgba(203,238,246,0.34) = water-mid（+2 别名） @ 34% |
| `.ghost` | `background` | `repeating-radial-gradient(circle at 1500px 1400px, rgba(216,243,246,.09) 0 1px, transparent 1px 15px)` | rgba(216,243,246,0.09) = line（+1 别名） @ 9%；transparent（透明，非色值） |
| `.ghost` | `-webkit-mask-image` | `linear-gradient(180deg, rgba(255,255,255,.7), rgba(255,255,255,.08) 62%, rgba(255,255,255,0))` | rgba(255,255,255,0.7) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.08) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.ghost` | `mask-image` | `linear-gradient(180deg, rgba(255,255,255,.7), rgba(255,255,255,.08) 62%, rgba(255,255,255,0))` | rgba(255,255,255,0.7) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0.08) = #ffffff（mask 字面白，DESIGN §486 允许，非 token）；rgba(255,255,255,0) = #ffffff（mask 字面白，DESIGN §486 允许，非 token） |
| `.bed` | `background` | `linear-gradient(180deg, rgba(246,215,154,.075), rgba(246,215,154,.025) 40%, rgba(5,15,20,0) 72%)` | rgba(246,215,154,0.075) = warm（+1 别名） @ 7.5%；rgba(246,215,154,0.025) = warm（+1 别名） @ 2.5%；rgba(5,15,20,0) = ink（+1 别名） @ 0% |
| `.tidewater` | `background` | `linear-gradient(90deg, transparent 0%, rgba(246,215,154,.18) 20%, rgba(246,215,154,.1) 58%, transparent 96%)` | rgba(246,215,154,0.18) = warm（+1 别名） @ 18%；rgba(246,215,154,0.1) = warm（+1 别名） @ 10%；transparent（透明，非色值） |
| `.crack` | `background` | `rgba(216,243,246,.2)` | rgba(216,243,246,0.2) = line（+1 别名） @ 20% |
| `.status` | `color` | `rgba(169,199,207,.85)` | rgba(169,199,207,0.85) = muted（+3 别名） @ 85% |
| `h1.torn .dn` | `color` | `rgba(243,249,250,.84)` | rgba(243,249,250,0.84) = paper（+1 别名） @ 84% |
| `.hurt` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.sub` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.back` | `color` | `var(--paper)` | --paper ⇒ #f3f9fa = paper（+1 别名） |
| `.back` | `border-bottom` | `1px solid var(--coral)` | --coral ⇒ #d4553a = coral（+3 别名） |
| `.rule` | `background` | `var(--line)` | --line ⇒ rgba(243,249,250,0.13) = paper（+1 别名） @ 13% |
| `.alt` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `.links a` | `color` | `var(--glass)` | --glass ⇒ #7fd1d9 = glass（+2 别名） |
| `.links i` | `background` | `rgba(127,209,217,.45)` | rgba(127,209,217,0.45) = glass（+2 别名） @ 45% |
| `.drift` | `color` | `var(--muted)` | --muted ⇒ #a9c7cf = muted（+3 别名） |
| `[inline] span` | `style="left:588px; top:302px; width:206px; background:rgba(203,238,246,.22)"` |  | rgba(203,238,246,0.22) = water-mid（+2 别名） @ 22% |
| `[inline] span` | `style="left:872px; top:326px; width:300px; background:rgba(203,238,246,.24)"` |  | rgba(203,238,246,0.24) = water-mid（+2 别名） @ 24% |
| `[inline] span` | `style="left:1216px; top:312px; width:200px; background:rgba(203,238,246,.2)"` |  | rgba(203,238,246,0.2) = water-mid（+2 别名） @ 20% |

### 11.4 圆角
| 选择器 | border-radius | 用在哪 |
| --- | --- | --- |
| `.drips i` | `50%` | `position:absolute; width:3px; height:3px; border-radius:50%; background:rgba(203,238,246,.34)` |
- SVG 的 `rx`/`ry`：`svg[1] svg.art › rect rx="2"`、`svg[1] svg.art › ellipse rx="48"`、`svg[1] svg.art › ellipse ry="11"`、`svg[1] svg.art › ellipse rx="84"`、`svg[1] svg.art › ellipse ry="20"`、`svg[1] svg.art › ellipse rx="32"`、`svg[1] svg.art › ellipse ry="8"`、`svg[1] svg.art › g › rect rx="1"`、`svg[1] svg.art › g › rect rx="2"`

### 11.5 渐变（stop 串原样）
**CSS 渐变声明**：
- `.platter` · `background`：`repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px),
          radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)`
- `.glint` · `background`：`linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)`
- `.groove` · `background`：`repeating-radial-gradient(circle at 1500px 1400px, rgba(216,243,246,.1) 0 1px, transparent 1px 15px)`
- `.groove` · `-webkit-mask-image`：`radial-gradient(1150px 820px at 1180px 180px, rgba(255,255,255,.95), rgba(255,255,255,.3) 72%)`
- `.groove` · `mask-image`：`radial-gradient(1150px 820px at 1180px 180px, rgba(255,255,255,.95), rgba(255,255,255,.3) 72%)`
- `.water` · `background`：`linear-gradient(180deg, rgba(127,209,217,.07) 0%, rgba(127,209,217,.12) 44%,
          rgba(160,226,236,.2) 78%, rgba(189,238,246,.26) 100%)`
- `.lip` · `background`：`linear-gradient(180deg, rgba(203,238,246,0), rgba(203,238,246,.14) 62%, rgba(203,238,246,.28))`
- `.edge` · `background`：`linear-gradient(180deg, transparent, rgba(2,8,11,.72))`
- `.surface` · `background`：`linear-gradient(90deg, rgba(203,238,246,.3) 0%, rgba(203,238,246,.16) 30%,
          rgba(203,238,246,.42) 58%, rgba(207,240,247,.62) 84%, rgba(203,238,246,.32) 100%)`
- `.drips span` · `background`：`linear-gradient(180deg, rgba(203,238,246,.5), rgba(203,238,246,0))`
- `.ghost` · `background`：`repeating-radial-gradient(circle at 1500px 1400px, rgba(216,243,246,.09) 0 1px, transparent 1px 15px)`
- `.ghost` · `-webkit-mask-image`：`linear-gradient(180deg, rgba(255,255,255,.7), rgba(255,255,255,.08) 62%, rgba(255,255,255,0))`
- `.ghost` · `mask-image`：`linear-gradient(180deg, rgba(255,255,255,.7), rgba(255,255,255,.08) 62%, rgba(255,255,255,0))`
- `.bed` · `background`：`linear-gradient(180deg, rgba(246,215,154,.075), rgba(246,215,154,.025) 40%, rgba(5,15,20,0) 72%)`
- `.tidewater` · `background`：`linear-gradient(90deg, transparent 0%, rgba(246,215,154,.18) 20%, rgba(246,215,154,.1) 58%, transparent 96%)`
**SVG `<defs>` 里的渐变（svg[1]，非 CSS 写法，stop 原样）**：
- `<linearGradient#glass> id="glass" x1="1300" y1="262" x2="1300" y2="302" gradientUnits="userSpaceOnUse" · stops: `offset="0" stop-color="#cbeef6" stop-opacity=".34"` / `offset="1" stop-color="#7fd1d9" stop-opacity=".14"``

### 11.6 主块几何（`.clip` / `.page` 下顶层绝对定位块）
- 容器：`.clip`：box-sizing:border-box; margin:0; padding:0; position:absolute; inset:0; overflow:hidden
| 宿主 | 块 | 定位 | width | height | transform | z-index |
| --- | --- | --- | --- | --- | --- | --- |
| .clip | `div.platter` | `position:absolute; inset:0` | — | — | — | — |
| .clip | `div.groove` | `position:absolute; left:0; right:0; top:0` | — | 365px | — | — |
| .clip | `div.water` | `position:absolute; left:0; right:0; top:0` | — | 365px | — | — |
| .clip | `div.edge` | `position:absolute; left:0; right:0; top:344px` | — | 22px | — | — |
| .clip | `div.lip` | `position:absolute; left:0; right:0; top:312px` | — | 42px | — | — |
| .clip | `svg.art` | `position:absolute; inset:0` | 1440 | 900 | — | — |
| .clip | `div.surface` | `position:absolute; left:0; right:0; top:355px` | — | 2px | — | — |
| .clip | `div.lintel` | `position:absolute; left:0; right:0; top:357px` | — | 1px | — | — |
| .clip | `div.ghost` | `position:absolute; left:0; right:0; top:365px` | — | 160px | — | — |
| .clip | `div.bed` | `position:absolute; left:0; right:0; top:365px` | — | 430px | — | — |
| .clip | `span.tidewater` | `position:absolute; left:0; right:0; top:452px` | — | 1px | — | — |
| .clip | `div.crack` | `position:absolute; left:902px; top:506px` | 214px | 1px | rotate(-1.6deg) | — |
| .clip | `div.crack` | `position:absolute; left:1064px; top:544px` | 236px | 1px | rotate(1.4deg) | — |
| .clip | `div.crack` | `position:absolute; left:938px; top:596px` | 160px | 1px | rotate(-1deg) | — |
| .clip | `div.crack` | `position:absolute; left:1156px; top:638px` | 196px | 1px | rotate(1.1deg) | — |
| .clip | `div.crack` | `position:absolute; left:868px; top:434px` | 170px | 1px | rotate(-1.2deg) | — |
| .clip | `div.crack` | `position:absolute; left:1240px; top:472px` | 150px | 1px | rotate(1.3deg) | — |
| .clip | `div.crack` | `position:absolute; left:112px; top:748px` | 196px | 1px | rotate(-1.1deg) | — |
| .clip | `div.crack` | `position:absolute; left:396px; top:776px` | 154px | 1px | rotate(1.2deg) | — |
| .clip | `div.glint` | `position:absolute; inset:0` | — | — | — | — |
- 更深处（不在上表里）的绝对定位块共 **32** 个：
  - `html › body › div.clip`：`position:absolute; inset:0`
  - `html › body › div.clip › div.flows › span`：`position:absolute; left:588px; top:302px; width:206px; height:1px`
  - `html › body › div.clip › div.flows › span`：`position:absolute; left:872px; top:326px; width:300px; height:1px`
  - `html › body › div.clip › div.flows › span`：`position:absolute; left:180px; top:330px; width:230px; height:1px`
  - `html › body › div.clip › div.flows › span`：`position:absolute; left:1216px; top:312px; width:200px; height:1px`
  - `html › body › div.clip › div.drips › span`：`position:absolute; left:196px; top:360px; width:1px; height:62px`
  - `html › body › div.clip › div.drips › i`：`position:absolute; left:195px; top:428px; width:3px; height:3px`
  - `html › body › div.clip › div.drips › span`：`position:absolute; left:430px; top:362px; width:1px; height:44px`
  - `html › body › div.clip › div.drips › i`：`position:absolute; left:429px; top:412px; width:3px; height:3px`
  - `html › body › div.clip › div.drips › span`：`position:absolute; left:566px; top:360px; width:1px; height:78px`
  - `html › body › div.clip › div.drips › i`：`position:absolute; left:565px; top:444px; width:3px; height:3px`
  - `html › body › div.clip › div.drips › span`：`position:absolute; left:706px; top:362px; width:1px; height:50px`
  - …（其余 20 个同为装置内的分件，规则同上：`position:absolute` + 锚点）

### 11.7 SVG / 图形
- **svg[1]** `svg.art` viewBox=`0 0 1440 900` width=1440 height=900
  - `svg.art › g`：`clip-path="url(#wet)"` `stroke-width="1.3"`
  - `svg.art › g › circle`：`cx="1500"` `cy="1400"` `r="1130"` `stroke="rgba(203,238,246,.26)"` `stroke-dasharray="88 210"` `stroke-dashoffset="12"` · stroke="rgba(203,238,246,.26)" = water-mid（+2 别名） @ 26%
  - `svg.art › g › circle`：`cx="1500"` `cy="1400"` `r="1175"` `stroke="rgba(203,238,246,.3)"` `stroke-dasharray="60 240"` `stroke-dashoffset="128"` · stroke="rgba(203,238,246,.3)" = water-mid（+2 别名） @ 30%
  - `svg.art › g › circle`：`cx="1500"` `cy="1400"` `r="1220"` `stroke="rgba(203,238,246,.24)"` `stroke-dasharray="96 160"` `stroke-dashoffset="44"` · stroke="rgba(203,238,246,.24)" = water-mid（+2 别名） @ 24%
  - `svg.art › g › circle`：`cx="1500"` `cy="1400"` `r="1265"` `stroke="rgba(203,238,246,.22)"` `stroke-dasharray="120 300"` `stroke-dashoffset="260"` · stroke="rgba(203,238,246,.22)" = water-mid（+2 别名） @ 22%
  - `svg.art › g › circle`：`cx="1500"` `cy="1400"` `r="1310"` `stroke="rgba(203,238,246,.24)"` `stroke-dasharray="168 240"` `stroke-dashoffset="96"` · stroke="rgba(203,238,246,.24)" = water-mid（+2 别名） @ 24%
  - `svg.art › g › circle`：`cx="1500"` `cy="1400"` `r="1355"` `stroke="rgba(203,238,246,.2)"` `stroke-dasharray="210 190"` `stroke-dashoffset="330"` · stroke="rgba(203,238,246,.2)" = water-mid（+2 别名） @ 20%
  - `svg.art › g › circle`：`cx="1500"` `cy="1400"` `r="1400"` `stroke="rgba(203,238,246,.22)"` `stroke-dasharray="64 220"` `stroke-dashoffset="180"` · stroke="rgba(203,238,246,.22)" = water-mid（+2 别名） @ 22%
  - `svg.art › g › circle`：`cx="1500"` `cy="1400"` `r="1445"` `stroke="rgba(203,238,246,.18)"` `stroke-dasharray="104 170"` `stroke-dashoffset="58"` · stroke="rgba(203,238,246,.18)" = water-mid（+2 别名） @ 18%
  - `svg.art › g › circle`：`cx="1500"` `cy="1400"` `r="1490"` `stroke="rgba(203,238,246,.2)"` `stroke-dasharray="84 250"` `stroke-dashoffset="412"` · stroke="rgba(203,238,246,.2)" = water-mid（+2 别名） @ 20%
  - `svg.art › g › circle`：`cx="1500"` `cy="1400"` `r="1535"` `stroke="rgba(203,238,246,.16)"` `stroke-dasharray="116 180"` `stroke-dashoffset="236"` · stroke="rgba(203,238,246,.16)" = water-mid（+2 别名） @ 16%
  - `svg.art › g › circle`：`cx="1500"` `cy="1400"` `r="1580"` `stroke="rgba(203,238,246,.15)"` `stroke-dasharray="68 200"` `stroke-dashoffset="520"` · stroke="rgba(203,238,246,.15)" = water-mid（+2 别名） @ 15%
  - `svg.art › g › circle`：`cx="1500"` `cy="1400"` `r="1640"` `stroke="rgba(203,238,246,.14)"` `stroke-dasharray="124 210"` `stroke-dashoffset="88"` · stroke="rgba(203,238,246,.14)" = water-mid（+2 别名） @ 14%
  - `svg.art › g › circle`：`cx="1500"` `cy="1400"` `r="1700"` `stroke="rgba(203,238,246,.12)"` `stroke-dasharray="92 190"` `stroke-dashoffset="298"` · stroke="rgba(203,238,246,.12)" = water-mid（+2 别名） @ 12%
  - `svg.art › g › circle`：`cx="1500"` `cy="1400"` `r="1770"` `stroke="rgba(203,238,246,.11)"` `stroke-dasharray="76 170"` `stroke-dashoffset="176"` · stroke="rgba(203,238,246,.11)" = water-mid（+2 别名） @ 11%
  - `svg.art › g`：`clip-path="url(#wet)"`
  - `svg.art › g › path`：`d="M 40 118 C 300 100, 560 138, 820 118 C 1060 100, 1300 134, 1440 120"` `stroke="rgba(203,238,246,.24)"` `stroke-dasharray="260 150"` · stroke="rgba(203,238,246,.24)" = water-mid（+2 别名） @ 24%
  - `svg.art › g › path`：`d="M 0 232 C 260 212, 520 252, 800 230 C 1050 210, 1290 246, 1440 232"` `stroke="rgba(246,215,154,.22)"` `stroke-dasharray="190 240"` · stroke="rgba(246,215,154,.22)" = warm（+1 别名） @ 22%
  - `svg.art › g › path`：`d="M 0 306 C 280 288, 560 326, 840 304 C 1080 286, 1320 320, 1440 308"` `stroke="rgba(203,238,246,.26)"` `stroke-dasharray="330 190"` · stroke="rgba(203,238,246,.26)" = water-mid（+2 别名） @ 26%
  - `svg.art › path`：`d="M 0 369 C 160 365, 320 372, 470 367 C 620 362, 760 371, 878 367"` `stroke="rgba(2,8,11,.85)"` `stroke-width="11"` · stroke="rgba(2,8,11,.85)" = 未收进契约（基色 #02080b）
  - `svg.art › path`：`d="M 0 366 C 160 363, 320 370, 470 365 C 620 360, 760 369, 878 365"` `stroke="rgba(228,249,252,.34)"` `stroke-width="1.3"` · stroke="rgba(228,249,252,.34)" = 未收进契约（基色 #e4f9fc）
  - `svg.art › path`：`d="M 0 376 C 160 373, 320 380, 470 375 C 620 370, 760 379, 878 374"` `stroke="rgba(228,249,252,.07)"` `stroke-width="1"` · stroke="rgba(228,249,252,.07)" = 未收进契约（基色 #e4f9fc）
  - `svg.art › path`：`d="M 878 365 L 892 348 L 918 361 L 944 350 L 972 358 L 1004 345 L 1032 357 L 1064 347
                 L 1090 360 L 1122 348 L 1148 359 L 1176 351 L 1200 367
                 L 1200 393 L 1170 385 L 1140 396 L 1108 385 L 1078 398 L 1046 386 L 1014 397
                 L 982 385 L 950 396 L 920 384 L 892 391 L 878 376 Z"` `fill="rgba(2,8,11,.9)"` `stroke="rgba(228,249,252,.16)"` · fill="rgba(2,8,11,.9)" = 未收进契约（基色 #02080b）、stroke="rgba(228,249,252,.16)" = 未收进契约（基色 #e4f9fc）
  - `svg.art › path`：`d="M 884 355 L 818 327"` `stroke="rgba(228,249,252,.14)"` · stroke="rgba(228,249,252,.14)" = 未收进契约（基色 #e4f9fc）
  - `svg.art › path`：`d="M 902 349 L 872 307"` `stroke="rgba(228,249,252,.11)"` · stroke="rgba(228,249,252,.11)" = 未收进契约（基色 #e4f9fc）
  - `svg.art › path`：`d="M 1206 369 L 1262 347"` `stroke="rgba(228,249,252,.14)"` · stroke="rgba(228,249,252,.14)" = 未收进契约（基色 #e4f9fc）
  - `svg.art › path`：`d="M 1204 389 L 1276 399"` `stroke="rgba(228,249,252,.1)"` · stroke="rgba(228,249,252,.1)" = 未收进契约（基色 #e4f9fc）
  - `svg.art › path`：`d="M 946 357 L 962 351"` `stroke="rgba(203,238,246,.35)"` · stroke="rgba(203,238,246,.35)" = water-mid（+2 别名） @ 35%
  - `svg.art › path`：`d="M 1120 351 L 1138 355"` `stroke="rgba(203,238,246,.3)"` · stroke="rgba(203,238,246,.3)" = water-mid（+2 别名） @ 30%
  - `svg.art › path`：`d="M 1200 387 L 1440 391"` `stroke="rgba(228,249,252,.24)"` `stroke-width="1.2"` · stroke="rgba(228,249,252,.24)" = 未收进契约（基色 #e4f9fc）
  - `svg.art › g`：`stroke="rgba(228,249,252,.2)"` · stroke="rgba(228,249,252,.2)" = 未收进契约（基色 #e4f9fc）
  - `svg.art › g › path`：`d="M 1216 391 L 1216 399"`
  - `svg.art › g › path`：`d="M 1242 391 L 1242 399"`
  - `svg.art › g › path`：`d="M 1268 391 L 1268 399"`
  - `svg.art › g › path`：`d="M 1294 392 L 1294 400"`
  - `svg.art › g › path`：`d="M 1320 392 L 1320 400"`
  - `svg.art › g › path`：`d="M 1346 392 L 1346 400"`
  - `svg.art › g › path`：`d="M 1372 392 L 1372 400"`
  - `svg.art › g › path`：`d="M 1398 392 L 1398 400"`
  - `svg.art › g › path`：`d="M 1424 392 L 1424 400"`
  - `svg.art › path`：`d="M 1390 936 L 1166 391"` `stroke="rgba(228,249,252,.26)"` `stroke-width="2.4"` · stroke="rgba(228,249,252,.26)" = 未收进契约（基色 #e4f9fc）
  - `svg.art › rect`：`x="1148"` `y="377"` `width="34"` `height="9"` `rx="2"` `transform="rotate(-30 1165 381)"` `fill="rgba(228,249,252,.14)"` `stroke="rgba(228,249,252,.38)"` · fill="rgba(228,249,252,.14)" = 未收进契约（基色 #e4f9fc）、stroke="rgba(228,249,252,.38)" = 未收进契约（基色 #e4f9fc）
  - `svg.art › path`：`d="M 1164 387 L 1170 397"` `stroke="rgba(203,238,246,.6)"` `stroke-width="1.6"` · stroke="rgba(203,238,246,.6)" = water-mid（+2 别名） @ 60%
  - `svg.art › circle`：`cx="1355"` `cy="866"` `r="9"` `stroke="rgba(228,249,252,.3)"` · stroke="rgba(228,249,252,.3)" = 未收进契约（基色 #e4f9fc）
  - `svg.art › circle`：`cx="1355"` `cy="866"` `r="3.5"` `fill="rgba(3,17,23,.95)"` `stroke="rgba(228,249,252,.3)"` · fill="rgba(3,17,23,.95)" = water-void（+2 别名） @ 95%、stroke="rgba(228,249,252,.3)" = 未收进契约（基色 #e4f9fc）
  - `svg.art › path`：`d="M 840 344 C 990 338, 1130 320, 1292 300"` `stroke="rgba(203,238,246,.26)"` `stroke-dasharray="7 9"` · stroke="rgba(203,238,246,.26)" = water-mid（+2 别名） @ 26%
  - `svg.art › path`：`d="M 906 356 C 1040 348, 1170 330, 1300 314"` `stroke="rgba(203,238,246,.13)"` `stroke-dasharray="5 12"` · stroke="rgba(203,238,246,.13)" = water-mid（+2 别名） @ 13%
  - `svg.art › ellipse`：`cx="1176"` `cy="304"` `rx="48"` `ry="11"` `stroke="rgba(203,238,246,.3)"` · stroke="rgba(203,238,246,.3)" = water-mid（+2 别名） @ 30%
  - `svg.art › ellipse`：`cx="1176"` `cy="304"` `rx="84"` `ry="20"` `stroke="rgba(203,238,246,.15)"` · stroke="rgba(203,238,246,.15)" = water-mid（+2 别名） @ 15%
  - `svg.art › ellipse`：`cx="1078"` `cy="320"` `rx="32"` `ry="8"` `stroke="rgba(203,238,246,.18)"` · stroke="rgba(203,238,246,.18)" = water-mid（+2 别名） @ 18%
  - `svg.art › g`：`transform="rotate(-13 1362 282)"`
  - `svg.art › g › path`：`d="M 1306 262 L 1382 262 L 1382 272 L 1408 272 L 1408 292 L 1382 292 L 1382 302 L 1306 302 Z"` `fill="url(#glass)"` `stroke="rgba(228,247,252,.86)"` · stroke="rgba(228,247,252,.86)" = water-deep @ 86%
  - `svg.art › g › path`：`d="M 1316 268 L 1316 296"` `stroke="rgba(228,247,252,.56)"` · stroke="rgba(228,247,252,.56)" = water-deep @ 56%
  - `svg.art › g › path`：`d="M 1348 268 L 1348 296"` `stroke="rgba(228,247,252,.28)"` · stroke="rgba(228,247,252,.28)" = water-deep @ 28%
  - `svg.art › g › rect`：`x="1406"` `y="269"` `width="6"` `height="26"` `rx="1"` `fill="rgba(228,247,252,.62)"` · fill="rgba(228,247,252,.62)" = water-deep @ 62%
  - `svg.art › g › rect`：`x="1412"` `y="271"` `width="13"` `height="22"` `rx="2"` `fill="rgba(246,215,154,.5)"` `stroke="rgba(246,215,154,.72)"` · fill="rgba(246,215,154,.5)" = warm（+1 别名） @ 50%、stroke="rgba(246,215,154,.72)" = warm（+1 别名） @ 72%
  - `svg.art › path`：`d="M 1244 216 L 1300 254"` `stroke="rgba(203,238,246,.32)"` · stroke="rgba(203,238,246,.32)" = water-mid（+2 别名） @ 32%

- **全页 transform（含 rotate 角度）**：
  - `h1.torn .up`：`translateX(7px)`
  - `h1.torn .dn`：`translateX(-5px)`
  - `[inline] div.crack`：`rotate(-1.6deg)`
  - `[inline] div.crack`：`rotate(1.4deg)`
  - `[inline] div.crack`：`rotate(-1deg)`
  - `[inline] div.crack`：`rotate(1.1deg)`
  - `[inline] div.crack`：`rotate(-1.2deg)`
  - `[inline] div.crack`：`rotate(1.3deg)`
  - `[inline] div.crack`：`rotate(-1.1deg)`
  - `[inline] div.crack`：`rotate(1.2deg)`

### 11.8 文案（逐字，文档顺序；`⟨br⟩` = 源码 `<br />`）
001. `html › body › div.wrap › span.cat` → "SIDE ? · 跳针"
002. `html › body › div.wrap › span.status` → "404"
003. `body › div.wrap › h1.torn › span.up` → "找不到这一页"
004. `body › div.wrap › h1.torn › span.dn` → "找不到这一页"
005. `html › body › div.wrap › p.hurt` → "这条水路不存在"
006. `html › body › div.wrap › span.cat` → "跳针"
007. `html › body › div.wrap › p.drift` → "瓶子已经被别人接走"
008. `html › body › div.wrap › p.sub` → "这个地址可能是旧的，或者瓶子已经被别人接走、链接失效了。"
009. `html › body › div.wrap › a.back` → "回首页"
010. `html › body › div.wrap › p.alt` → "也可以换个入口继续："
011. `div.wrap › nav.links › span.pair › a` → "去河道捞一个漂流瓶"
012. `div.wrap › nav.links › span.pair › a` → "去公海听完成的作品"

### 11.9 本页的「装置」
> 划伤跳针：一道划痕横断标题，豁口里写「这条水路不存在」，另有断流与漂走的瓶

---

## 附录 A · 抽到但 `DESIGN.md` 里没有的颜色（需收进契约）

「最近 token」＝ RGB 欧氏距离最近的一个 `DESIGN.md` token；距离 ≤ 6 记为**近失配**（大概率是手写近似值，应并到该 token，而不是新增颜色）。含 SVG `<defs>` 的 `stop-color`。

| 值 | 页数 | 最近 token（RGB 距离） | 出现位置（页 · 选择器 · 属性） |
| --- | --- | --- | --- |
| `#e4f9fc` | 7 | **近失配**：#e4f7fc = water-deep（d=2.0） | f4-groove.html · .port .r1 · border；f4-groove.html · .port .r2 · border；f4-groove.html · .port .r3 · border；p-sea-detail-record.html · .pivot · border；p-sea-detail-record.html · .pivot::before · border；p-sea-detail-record.html · .shell · border；p-profile-record.html · .label · border；p-profile-record.html · .label .r1 · border；p-profile-record.html · .label .r2 · border；p-404-record.html svg[1] svg.art › path · stroke；…共 14 处 |
| `#e4f9ff` | 1 | **近失配**：#e4f7fc = water-deep（d=3.6） | s2-admin-record.html · .surface · background；s2-admin-record.html · .ripple · border；s2-admin-record.html · .touch · background；s2-admin-record.html · .tether · background；s2-admin-record.html · .refl · background；s2-admin-record.html · .bub · border；s2-admin-record.html · .bub · background；s2-admin-record.html · [inline] i.ripple · border-color |
| `#c7452c` | 5 | 远离全部 token：最近 #d4553a = coral（d=24.9） | f4-groove.html · :root · --coral；f4-groove.html svg[1] <radialGradient#label> · stop-color；f4-groove.html svg[1] svg.canvas › circle · stroke；f4-groove.html svg[1] svg.canvas › g › path · stroke；f4-groove.html svg[1] svg.canvas › g › text · fill |
| `#030c11` | 1 | **近失配**：#050f14 = ink（d=4.7） | p-settings-record.html · .sea · background；p-settings-record.html · .crease-shl · background；p-settings-record.html · .crease · background；p-settings-record.html · .crease-soak · background |
| `#02080b` | 2 | 远离全部 token：最近 #050f14 = ink（d=11.8） | p-404-record.html · .edge · background；p-404-record.html · .lintel · background；p-404-record.html svg[1] svg.art › path · stroke；p-404-record.html svg[1] svg.art › path · fill |
| `#020a0e` | 2 | 远离全部 token：最近 #050f14 = ink（d=8.4） | f4-groove.html · .port .cap · text-shadow；p-settings-record.html · .tide · background；p-settings-record.html · .crease-soak · background |
| `#02090d` | 2 | 远离全部 token：最近 #050f14 = ink（d=9.7） | f4-groove.html · .platter · background；p-profile-record.html · .hole · background |
| `#d6f1f7` | 2 | **近失配**：#d8f3f6 = line（d=3.0） | f4-groove.html · .field i · background；f4-groove.html svg[1] svg.canvas › circle · stroke |
| `#0f4251` | 2 | **近失配**：#12414f = water-body（d=3.7） | p-songpicker-record.html svg[1] <linearGradient#dishInner> · stop-color；p-songpicker-record.html svg[1] <radialGradient#dishFloor> · stop-color |
| `#030e14` | 2 | **近失配**：#050f14 = ink（d=2.2） | p-login-record.html svg[1] svg.mouth › ellipse · fill；p-sea-detail-record.html · .water · background |
| `#02080c` | 2 | 远离全部 token：最近 #050f14 = ink（d=11.0） | p-sea-hall.html · .abyss · background；p-settings-record.html · .hole · background |
| `#f0b7a6` | 1 | 远离全部 token：最近 #f6d79a = warm（d=34.7） | s2-admin-record.html · .acts button.cut · color；s2-admin-record.html · .acts button.ban · color |
| `#d2f0f6` | 1 | 远离全部 token：最近 #d8f3f6 = line（d=6.7） | f4-groove.html · .light · background |
| `#ceeef5` | 1 | **近失配**：#cbeef6 = water-mid（d=3.2） | f4-groove.html · .light · background |
| `#031016` | 1 | **近失配**：#031117 = water-void（d=1.4） | f4-groove.html · .port .core · text-shadow |
| `#b2e8f4` | 1 | 远离全部 token：最近 #cbeef6 = water-mid（d=25.8） | f4-groove.html · .draw .core · box-shadow |
| `#a0e2f0` | 1 | 远离全部 token：最近 #a9c7cf = muted（d=43.6） | f4-groove.html · .draw .core · box-shadow |
| `#e6f8fb` | 1 | **近失配**：#e4f7fc = water-deep（d=2.4） | f4-groove.html svg[1] <linearGradient#rim> · stop-color |
| `#2a9db1` | 1 | 远离全部 token：最近 #427077 = success-border（d=77.2） | f4-groove.html svg[1] svg.canvas › circle · stroke |
| `#9fe6ed` | 1 | 远离全部 token：最近 #7fd1d9 = glass（d=43.2） | f4-groove.html svg[1] svg.canvas › circle · stroke |
| `#e6f7fb` | 1 | **近失配**：#e4f7fc = water-deep（d=2.2） | f4-groove.html svg[1] svg.canvas › g · stroke |
| `#16404d` | 1 | **近失配**：#12414f = water-body（d=4.6） | p-songpicker-record.html svg[1] <radialGradient#blank> · stop-color |
| `#dff3f7` | 1 | 远离全部 token：最近 #d8f3f6 = line（d=7.1） | p-songpicker-record.html svg[1] <linearGradient#rimTop> · stop-color |
| `#08222b` | 1 | 远离全部 token：最近 #14262c = success-tint（d=12.7） | p-songpicker-record.html svg[1] <linearGradient#dishInner> · stop-color |
| `#a8e4ec` | 1 | 远离全部 token：最近 #cbeef6 = water-mid（d=37.7） | p-songpicker-record.html svg[1] <linearGradient#waterBody> · stop-color |
| `#0a3a48` | 1 | 远离全部 token：最近 #12414f = water-body（d=12.7） | p-songpicker-record.html svg[1] <linearGradient#waterBody> · stop-color |
| `#dbeef2` | 1 | 远离全部 token：最近 #d8f3f6 = line（d=7.1） | p-bottle-record.html svg[1] <linearGradient#gPaper> · stop-color |
| `#8a6a34` | 1 | 远离全部 token：最近 #716950 = warning-border（d=37.5） | p-bottle-record.html svg[1] <linearGradient#gCork> · stop-color |
| `#030b10` | 1 | **近失配**：#050f14 = ink（d=6.0） | p-sea-hall.html · .abyss · background |
| `#04141a` | 1 | **近失配**：#031117 = water-void（d=4.4） | p-sea-hall.html · .sub · background |
| `#020a0f` | 1 | 远离全部 token：最近 #050f14 = ink（d=7.7） | p-sea-hall.html · .sub · background |
| `#c9dddb` | 1 | 远离全部 token：最近 #cbeef6 = water-mid（d=32.0） | p-sea-detail-record.html · .surface · background |
| `#0a3442` | 1 | 远离全部 token：最近 #0a303c = water-bed（d=7.2） | p-sea-detail-record.html · .water · background |
| `#082632` | 1 | 远离全部 token：最近 #14262c = success-tint（d=13.4） | p-sea-detail-record.html · .water · background |
| `#051c26` | 1 | 远离全部 token：最近 #031117 = water-void（d=18.7） | p-sea-detail-record.html · .water · background |
| `#f0cc8e` | 1 | 远离全部 token：最近 #f6d79a = warm（d=17.3） | p-sea-detail-record.html · .strata · background |
| `#e2cd9e` | 1 | 远离全部 token：最近 #f6d79a = warm（d=22.7） | p-sea-detail-record.html · .strata · background |
| `#96b0b4` | 1 | 远离全部 token：最近 #a9c7cf = muted（d=40.2） | p-sea-detail-record.html · .cobble · background |
| `#08202a` | 1 | 远离全部 token：最近 #14262c = success-tint（d=13.6） | p-sea-detail-record.html · .shell · background |
| `#061820` | 1 | 远离全部 token：最近 #031117 = water-void（d=11.8） | p-sea-detail-record.html svg[2] <linearGradient#glass> · stop-color |
| `#c8f0fa` | 1 | **近失配**：#cbeef6 = water-mid（d=5.4） | s2-admin-record.html · .caustic · background |
| `#beeef8` | 1 | 远离全部 token：最近 #cbeef6 = water-mid（d=13.2） | s2-admin-record.html · .surface-haze · background |
| `#d6f4fc` | 1 | 远离全部 token：最近 #d8f3f6 = line（d=6.4） | s2-admin-record.html · .surface-haze · background |
| `#061a22` | 1 | 远离全部 token：最近 #031117 = water-void（d=14.5） | s2-admin-record.html · .card .flood · background |
| `#e8967c` | 1 | 远离全部 token：最近 #dc7e6a = danger（d=32.3） | s2-admin-record.html · .seal · color |
| `#e8c07a` | 1 | 远离全部 token：最近 #f6d79a = warm（d=41.8） | s2-admin-record.html · .seal.due · color |
| `#051820` | 1 | 远离全部 token：最近 #031117 = water-void（d=11.6） | p-settings-record.html · .sea · background |
| `#041016` | 1 | **近失配**：#031117 = water-void（d=1.7） | p-settings-record.html · .sea · background |
| `#0c2a36` | 1 | 远离全部 token：最近 #0a303c = water-bed（d=8.7） | p-settings-record.html · .leaf-dry · background |
| `#081f2a` | 1 | 远离全部 token：最近 #14262c = success-tint（d=14.0） | p-settings-record.html · .leaf-dry · background |
| `#061922` | 1 | 远离全部 token：最近 #031117 = water-void（d=13.9） | p-settings-record.html · .leaf-dry · background |
| `#08222d` | 1 | 远离全部 token：最近 #14262c = success-tint（d=12.7） | p-settings-record.html · .leaf-wet · background |
| `#061a23` | 1 | 远离全部 token：最近 #031117 = water-void（d=15.3） | p-settings-record.html · .leaf-wet · background |
| `#05141c` | 1 | 远离全部 token：最近 #031117 = water-void（d=6.2） | p-settings-record.html · .leaf-wet · background |
| `#a0e2ec` | 1 | 远离全部 token：最近 #a9c7cf = muted（d=40.6） | p-404-record.html · .water · background |
| `#bdeef6` | 1 | 远离全部 token：最近 #cbeef6 = water-mid（d=14.0） | p-404-record.html · .water · background |
| `#cff0f7` | 1 | **近失配**：#cbeef6 = water-mid（d=4.6） | p-404-record.html · .surface · background |

## 附录 B · 实测到的跨页差异（同一用途、不同值）

本清单只记录**实测差异**（值全部来自上面的逐页表格，未做任何归一化）；处置口径见交付汇报。

### B.1 各页 `:root` 变量定义（同名变量不同值 = 直接冲突）

| 页 | `:root` 自定义属性（原样） |
| --- | --- |
| `f4-groove.html` | ink=#050f14, paper=#f3f9fa, muted=#a9c7cf, glass=#7fd1d9, coral=#c7452c, line=rgba(243,249,250,.16) |
| `p-songpicker-record.html` | ink=#050f14, paper=#f3f9fa, muted=#a9c7cf, glass=#7fd1d9, coral=#d4553a, warm=#f6d79a, line=rgba(243,249,250,.13) |
| `p-bottle-record.html` | ink=#050f14, paper=#f3f9fa, muted=#a9c7cf, glass=#7fd1d9, coral=#d4553a, warm=#f6d79a, line=rgba(243,249,250,.13) |
| `p-login-record.html` | ink=#050f14, paper=#f3f9fa, muted=#a9c7cf, glass=#7fd1d9, coral=#d4553a, warm=#f6d79a, line=rgba(243,249,250,.13) |
| `p-sea-hall.html` | ink=#050f14, paper=#f3f9fa, muted=#a9c7cf, glass=#7fd1d9, coral=#d4553a, warm=#f6d79a, line=rgba(243,249,250,.13) |
| `p-sea-detail-record.html` | ink=#050f14, paper=#f3f9fa, muted=#a9c7cf, glass=#7fd1d9, coral=#d4553a, warm=#f6d79a, line=rgba(243,249,250,.13) |
| `p-driftlog-record.html` | ink=#050f14, paper=#f3f9fa, muted=#a9c7cf, glass=#7fd1d9, coral=#d4553a, warm=#f6d79a, line=rgba(243,249,250,.13) |
| `p-profile-record.html` | ink=#050f14, paper=#f3f9fa, muted=#a9c7cf, glass=#7fd1d9, coral=#d4553a, warm=#f6d79a, line=rgba(243,249,250,.13) |
| `s2-admin-record.html` | ink=#050f14, paper=#f3f9fa, muted=#a9c7cf, glass=#7fd1d9, coral=#d4553a, warm=#f6d79a, line=rgba(243,249,250,.13) |
| `p-settings-record.html` | ink=#050f14, paper=#f3f9fa, muted=#a9c7cf, glass=#7fd1d9, coral=#d4553a, warm=#f6d79a, line=rgba(243,249,250,.13) |
| `p-404-record.html` | ink=#050f14, paper=#f3f9fa, muted=#a9c7cf, glass=#7fd1d9, coral=#d4553a, warm=#f6d79a, line=rgba(243,249,250,.13) |

### B.2 各页 ≥20px 的字号（页面主标题尺度）

| 值 | 页 · 选择器 |
| --- | --- |
| **20px** | f4-groove .port .core → 20px；p-profile-record .who .handle → 20px |
| **26px** | f4-groove .rpm → 26px；p-songpicker-record .n → 26px；p-sea-detail-record .stampno → 26px |
| **28px** | p-bottle-record .segNum → 28px |
| **30px** | p-driftlog-record .hright .n → 30px |
| **32px** | p-sea-detail-record .time → 32px |
| **34px** | p-404-record .status → 34px |
| **52px** | p-login-record h1 → 52px |
| **56px** | p-songpicker-record h1 → 56px；p-bottle-record h1 → 56px；p-driftlog-record h1 → 56px；s2-admin-record header h1 → 56px |
| **58px** | p-sea-detail-record h1 → 58px；p-profile-record h1 → 58px；p-settings-record h1 → 58px |
| **60px** | p-sea-hall h1 → 60px |
| **62px** | p-404-record h1.torn span → 62px |
| **84px** | f4-groove h1 → 84px |

### B.3 全站 `border-radius` 值分布

| 值 | 用在哪（页:选择器） |
| --- | --- |
| `50%` | f4-groove:.port i；f4-groove:.port .core；p-bottle-record:.seal；p-bottle-record:.seal i；p-bottle-record:.seal i b；p-bottle-record:.play；p-login-record:.tag::before；p-sea-hall:.seabed；p-sea-hall:.bub i；p-sea-detail-record:.bub；p-sea-detail-record:.cobble；p-sea-detail-record:.bglow；p-sea-detail-record:.corkmark；p-sea-detail-record:.btmark；p-sea-detail-record:.bpress；p-sea-detail-record:.rip1；p-sea-detail-record:.rip2；p-sea-detail-record:.pivot；p-sea-detail-record:.pivot::before；p-sea-detail-record:.pivot::after；p-sea-detail-record:.tip；p-sea-detail-record:.tip::after；p-profile-record:.wt::before；p-profile-record:.wt::after；p-profile-record:.iface；p-profile-record:.iface::before；p-profile-record:.lay .hoop；p-profile-record:.lay .hoop::before；p-profile-record:.hole；p-profile-record:.label；p-profile-record:.label .r1；p-profile-record:.label .r2；p-profile-record:.label .hub；s2-admin-record:.ripple；s2-admin-record:.bub；p-settings-record:.hole；p-settings-record:.hole i；p-settings-record:.rip；p-settings-record:.bub；p-404-record:.drips i |
| `2px` | p-songpicker-record:.plate；p-songpicker-record:.states；p-songpicker-record:.act；p-bottle-record:.pill；p-bottle-record:.cta；p-bottle-record:.voteBtn；p-bottle-record:.ghost；p-login-record:.tag；p-login-record:.act；p-sea-hall:.cork；p-sea-hall:.pages a；p-sea-detail-record:.state；p-sea-detail-record:.b-cork；p-sea-detail-record:.shell；p-sea-detail-record:.ctrl；p-driftlog-record:.crumb；p-profile-record:.window；p-profile-record:.role；p-profile-record:.st；p-profile-record:.sleeve；p-profile-record:.who .stamp；p-profile-record:.codeslot .field；p-profile-record:.mrow .pill；s2-admin-record:.bottle .cut；s2-admin-record:.card；s2-admin-record:.seal；s2-admin-record:.acts button；s2-admin-record:li.rec .back；p-settings-record:.leaf；p-settings-record:.bot-neck；p-settings-record:.bot-lip；p-settings-record:.bot-cork；p-settings-record:.slip；p-settings-record:.refl .rb；p-settings-record:.refl .rn；p-settings-record:.refl .rl；p-settings-record:.refl .rc；p-settings-record:.refl .rslip；p-settings-record:.btn |
| `2px 2px 0 0` | p-songpicker-record:.tab |
| `23px` | p-bottle-record:.gapSlot |
| `0 0 4px 4px` | p-profile-record:.pocket |
| `1px` | s2-admin-record:.bottle .cork |
| `1px 1px 0 0` | s2-admin-record:.bottle .neck |
| `2px 2px 3px 3px` | s2-admin-record:.bottle .body |
| `0 0 2px 2px` | s2-admin-record:.card .flood |
| `2px 2px 4px 4px` | p-settings-record:.bot-body |

### B.4 全站「字号 / 字距」组合（同类小字标注用了不同档位）

| font-size / letter-spacing | 用在哪（页:选择器） |
| --- | --- |
| `11px / .24em` | f4-groove:.cat；p-songpicker-record:.cat；p-bottle-record:.maker .k；p-bottle-record:.segLab；p-bottle-record:.gapKind；p-login-record:.lbl；p-sea-hall:.meta；p-sea-detail-record:.cat；p-driftlog-record:.cat；p-profile-record:.cat；s2-admin-record:.cat；p-settings-record:.cat；p-404-record:.cat |
| `11px / .2em` | p-settings-record:.cap；p-settings-record:.alt .lbl；p-settings-record:.ver .lbl |
| `12px / .1em` | f4-groove:.tag；p-sea-detail-record:.state |
| `13px / .06em` | f4-groove:footer .go；s2-admin-record:.card .no |
| `11px / .18em` | p-bottle-record:.heroLab；p-bottle-record:.callout |
| `11px / .12em` | p-bottle-record:.corkLab；p-login-record:.tag b |
| `15px / .04em` | p-sea-hall:.zones li；p-sea-detail-record:ul.credits .code |
| `10.5px / .1em` | p-profile-record:.slot；p-profile-record:.mrow .pill |
| `12.5px / .06em` | s2-admin-record:li.rec .rno；p-404-record:.drift |
| `12.5px / .18em` | p-settings-record:.slip；p-settings-record:.refl .rslip |
| `20px / .12em` | f4-groove:.port .core |
| `10px / .28em` | f4-groove:.port .core span |
| `12.5px / .08em` | p-bottle-record:.pill |
| `52px / .005em` | p-login-record:h1 |
| `15px / .14em` | p-login-record:.mode |
| `15px / .05em` | p-login-record:.act |
| `60px / .01em` | p-sea-hall:h1 |
| `12px / .22em` | p-sea-detail-record:.refl |
| `13.5px / .06em` | p-sea-detail-record:.voidlabel |
| `16px / .06em` | p-sea-detail-record:li.row .mk |
| `32px / .02em` | p-sea-detail-record:.time |
| `14px / .06em` | p-sea-detail-record:.ctrl |
| `10px / .3em` | p-sea-detail-record:.etch |
| `56px / .02em` | p-driftlog-record:h1 |
| `12px / .03em` | p-driftlog-record:.key figcaption |
| `11px / .08em` | p-driftlog-record:.roll .seq |
| `58px / .02em` | p-profile-record:h1 |
| `11.5px / .04em` | p-profile-record:.role |
| `12.5px / .04em` | p-profile-record:.st |
| `10.5px / .08em` | p-profile-record:.due |
| `12px / .06em` | p-profile-record:.who .stamp |
| `10.5px / .14em` | s2-admin-record:.card .kind |
| `12.5px / .17em` | s2-admin-record:.seal |
| `58px / .01em` | p-settings-record:h1 |
| `13px / .04em` | p-settings-record:.btn |
| `18px / .04em` | p-settings-record:.ver .v |
| `11px / .16em` | p-settings-record:.tiny |
| `15.5px / .12em` | p-404-record:.hurt |