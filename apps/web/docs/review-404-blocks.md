# 404 页面块清单（来源：docs/ui-review/design-explore/p-404-record.html · 265 行）

逐块映射 HTML → 将落成的 React 结构；含逐字文案、字号/字距/透明度/渐变值、svg 参数、三出口链接文案。画布 1440×900。

## 0. 设计 token（:root）

| token | 值 |
| --- | --- |
| --ink | `#050f14` |
| --paper | `#f3f9fa` |
| --muted | `#a9c7cf` |
| --glass | `#7fd1d9` |
| --coral | `#d4553a` |
| --warm | `#f6d79a` |
| --line | `rgba(243,249,250,.13)` |

字体：正文 `'LXGW WenKai', serif`（lxgw-wenkai-webfont regular+bold）；`.mono/.cat/.status` 用 `Quattrocento, serif` + `font-variant-numeric: tabular-nums`（fontsource quattrocento 400/700）。

## 1. 块清单：HTML → React 结构

根结构（两层）：

```tsx
<div className="clip">   {/* position:absolute; inset:0; overflow:hidden */}
  {/* 背景层 ×N + <RecordArt />(svg) + 光泽层 */}
</div>
<div className="wrap">   {/* z-index:2, 文案层 */}
  …文本与链接…
</div>
```

| # | HTML 块 | 将落成的 React 结构 | 关键值 |
| --- | --- | --- | --- |
| 1 | `.platter` | `<div className="platter" />` 唱片纹路底 | `repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px)` + `radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)` |
| 2 | `.groove` | `<div className="groove" />` 沟槽里灌水的亮水线 | 高 365px；`repeating-radial-gradient(circle at 1500px 1400px, rgba(216,243,246,.1) 0 1px, transparent 1px 15px)`；mask `radial-gradient(1150px 820px at 1180px 180px, rgba(255,255,255,.95), rgba(255,255,255,.3) 72%)` |
| 3 | `.water` | `<div className="water" />` 整片水的竖向渐变 | 高 365px；`linear-gradient(180deg, rgba(127,209,217,.07) 0%, rgba(127,209,217,.12) 44%, rgba(160,226,236,.2) 78%, rgba(189,238,246,.26) 100%)` |
| 4 | `.flows span` ×4 | `<div className="flows">{FLOWS.map(…)}</div>` 水面短波 | 每条高 1px，默认 `rgba(203,238,246,.16)`；内联：`588,302,w206,rgba(203,238,246,.22)`；`872,326,w300,.24`；`180,330,w230`（默认色）；`1216,312,w200,.2` |
| 5 | `.edge` + `.lip` | `<div className="edge" /><div className="lip" />` 伤口压暗 + 断口前攒光 | edge：top344 h22，`linear-gradient(180deg, transparent, rgba(2,8,11,.72))`；lip：top312 h42，`linear-gradient(180deg, rgba(203,238,246,0), rgba(203,238,246,.14) 62%, rgba(203,238,246,.28))` |
| 6 | `svg.art` | `<RecordArt className="art" />`（内联 SVG，见 §3） | width/height 1440×900，`viewBox="0 0 1440 900"`，`fill="none"`，`aria-hidden="true"` |
| 7 | `.surface` + `.lintel` | `<div className="surface" /><div className="lintel" />` 全宽亮水线 | surface：top355 h2，`linear-gradient(90deg, rgba(203,238,246,.3) 0%, rgba(203,238,246,.16) 30%, rgba(203,238,246,.42) 58%, rgba(207,240,247,.62) 84%, rgba(203,238,246,.32) 100%)`；lintel：top357 h1，`rgba(2,8,11,.6)` |
| 8 | `.ghost` | `<div className="ghost" />` 干河床沟槽残影 | top365 h160；同 groove 的 repeating-radial（色 `rgba(216,243,246,.09)`）；mask `linear-gradient(180deg, rgba(255,255,255,.7), rgba(255,255,255,.08) 62%, rgba(255,255,255,0))` |
| 9 | `.bed` | `<div className="bed" />` 暖色干床 | top365 h430；`linear-gradient(180deg, rgba(246,215,154,.075), rgba(246,215,154,.025) 40%, rgba(5,15,20,0) 72%)` |
| 10 | `.tidewater` + `.crack` ×8 | `<span className="tidewater" />` + `{CRACKS.map(…)}` 干裂水位痕/裂缝 | tidewater：top452 h1，`linear-gradient(90deg, transparent 0%, rgba(246,215,154,.18) 20%, rgba(246,215,154,.1) 58%, transparent 96%)`；crack：h1 `rgba(216,243,246,.2)`，内联 left/top/width/rotate：`(902,506,214,-1.6deg)` `(1064,544,236,1.4deg)` `(938,596,160,-1deg)` `(1156,638,196,1.1deg)` `(868,434,170,-1.2deg)` `(1240,472,150,1.3deg)` `(112,748,196,-1.1deg)` `(396,776,154,1.2deg)` |
| 11 | `.drips span/i` | `<div className="drips">{DRIPS.map(…)}</div>` 断口往下漏的细流+水珠 | span：w1px，`linear-gradient(180deg, rgba(203,238,246,.5), rgba(203,238,246,0))`；i：3×3 圆点 `rgba(203,238,246,.34)`。数据 `(x,y,h)→droplet(x-1,y+h+6)`：`(196,360,62)●(195,428)`；`(430,362,44)●(429,412)`；`(566,360,78)●(565,444)`；`(706,362,50)●(705,418)`；`(832,362,36)`无珠；`(1012,362,68)●(1011,436)`；`(1252,364,48)●(1251,418)` |
| 12 | `.glint` | `<div className="glint" />` 斜向反光 | `mix-blend-mode:screen`；`linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)` |
| 13 | `.tl`（cat） | `<span className="cat tl">` 分类角标 | left76 top64；`.cat`：11px / `letter-spacing:.24em` / `rgba(243,249,250,.5)` |
| 14 | `.status` | `<span className="status">404</span>` | right76 top58；34px / lh1 / `rgba(169,199,207,.85)` |
| 15 | `h1.torn` | `<h1 className="torn"><span className="up">…</span><span className="dn" aria-hidden>…</span></h1>` 标题被划伤切断 | left76 top337 w820 h62；span 62px/700/lh1 nowrap；`.up` `clip-path:inset(0 0 45.5% 0)` `translateX(7px)`；`.dn` `clip-path:inset(61% 0 0 0)` `translateX(-5px)` `rgba(243,249,250,.84)` |
| 16 | `.hurt` | `<p className="hurt">` | left904 top364；15.5px / `letter-spacing:.12em` / `var(--muted)` |
| 17 | `.skip`（cat） | `<span className="cat skip">` | right76 top407；同 .cat 规格 |
| 18 | `.drift` | `<p className="drift">` 漂走的瓶子底下一句话 | left1096 top186；12.5px / `letter-spacing:.06em` / muted |
| 19 | `.sub` | `<p className="sub">` | left76 top460 w540；15.5px / lh1.9 / muted |
| 20 | `.back` | `<a className="back" href="/">回首页</a>` 出口 1 | left76 top558；17px / paper / `border-bottom:1px solid var(--coral)` / `padding-bottom:5px` |
| 21 | `.rule` | `<span className="rule" />` | left76 top626 w684 h1 / `var(--line)` |
| 22 | `.alt` | `<p className="alt">` | left76 top650；14.5px / muted |
| 23 | `.links nav` | `<nav className="links" aria-label="换个入口">` + `.pair`(i+span竖线+link) ×2 — 出口 2、3 | left76 top684；flex gap44；a：15px / `var(--glass)` / `text-decoration:underline; text-underline-offset:5px`；i：1×12px `rgba(127,209,217,.45)`；pair gap9 |

## 2. 逐字文案（一字不改）

- 页面 title：`404 · 断流（唱片语言）`
- 角标 `.tl`：`SIDE ? · 跳针`
- 状态：`404`
- 标题（两层同文，下层 aria-hidden）：`找不到这一页`
- `.hurt`：`这条水路不存在`
- `.skip`：`跳针`
- `.drift`：`瓶子已经被别人接走`
- `.sub`：`这个地址可能是旧的，或者瓶子已经被别人接走、链接失效了。`
- `.alt`：`也可以换个入口继续：`
- nav aria-label：`换个入口`

**三出口链接文案**：

1. `回首页`（`.back`，出口 1）
2. `去河道捞一个漂流瓶`（nav 出口 2）
3. `去公海听完成的作品`（nav 出口 3）

## 3. svg 参数（svg.art 全量）

### defs

- `<clipPath id="wet">`（torn/wet 裁切）：`<rect x="0" y="0" width="1440" height="356" />` —— 所有水面沟槽/长波组都挂 `clip-path="url(#wet)"`。
- 瓶身渐变 `linearGradient id="glass"`：`x1=1300 y1=262 x2=1300 y2=302 gradientUnits="userSpaceOnUse"`；stop0 `#cbeef6` opacity `.34`；stop1 `#7fd1d9` opacity `.14`。

### 划痕渐变（划伤本体三条 path，同一走向，y 错开）

1. 暗芯：`d="M 0 369 C 160 365, 320 372, 470 367 C 620 362, 760 371, 878 367"`，stroke `rgba(2,8,11,.85)`，stroke-width **11**
2. 亮刃：`d="M 0 366 C 160 363, 320 370, 470 365 C 620 360, 760 369, 878 365"`，stroke `rgba(228,249,252,.34)`，stroke-width **1.3**
3. 余光：`d="M 0 376 C 160 373, 320 380, 470 375 C 620 370, 760 379, 878 374"`，stroke `rgba(228,249,252,.07)`，stroke-width **1**

### 水面沟槽圆（`<g clip-path="url(#wet)" stroke-width="1.3">`，圆心全 `cx=1500 cy=1400`）

| r | stroke | dasharray | dashoffset |
| --- | --- | --- | --- |
| 1130 | rgba(203,238,246,.26) | 88 210 | 12 |
| 1175 | .30 | 60 240 | 128 |
| 1220 | .24 | 96 160 | 44 |
| 1265 | .22 | 120 300 | 260 |
| 1310 | .24 | 168 240 | 96 |
| 1355 | .20 | 210 190 | 330 |
| 1400 | .22 | 64 220 | 180 |
| 1445 | .18 | 104 170 | 58 |
| 1490 | .20 | 84 250 | 412 |
| 1535 | .16 | 116 180 | 236 |
| 1580 | .15 | 68 200 | 520 |
| 1640 | .14 | 124 210 | 88 |
| 1700 | .12 | 92 190 | 298 |
| 1770 | .11 | 76 170 | 176 |

（色列均为 `rgba(203,238,246,α)`）

### 水面长波 3 条 path（clip=wet）

1. `M 40 118 C 300 100, 560 138, 820 118 C 1060 100, 1300 134, 1440 120`，stroke `rgba(203,238,246,.24)`，dasharray `260 150`
2. `M 0 232 C 260 212, 520 252, 800 230 C 1050 210, 1290 246, 1440 232`，stroke `rgba(246,215,154,.22)`，dasharray `190 240`
3. `M 0 306 C 280 288, 560 326, 840 304 C 1080 286, 1320 320, 1440 308`，stroke `rgba(203,238,246,.26)`，dasharray `330 190`

### 豁口（torn gap，跳针卡住处）

- 主体多边形：`M 878 365 L 892 348 … L 1200 367 L 1200 393 … L 878 376 Z`，fill `rgba(2,8,11,.9)`，stroke `rgba(228,249,252,.16)`
- 毛刺 4 条：`(884,355)-(818,327)` α.14；`(902,349)-(872,307)` α.11；`(1206,369)-(1262,347)` α.14；`(1204,389)-(1276,399)` α.10（色 `rgba(228,249,252,…)`）
- 内亮痕 2 条：`(946,357)-(962,351)` `rgba(203,238,246,.35)`；`(1120,351)-(1138,355)` `.30`
- 下游错格：`M 1200 387 L 1440 391` stroke `rgba(228,249,252,.24)` w1.2；刻度 9 根 `x=1216…1424 步长26`（y≈391→399/400），stroke `rgba(228,249,252,.2)`

### 唱针

- 臂：`M 1390 936 L 1166 391`，stroke `rgba(228,249,252,.26)` w **2.4**
- 针头 rect：`x=1148 y=377 w=34 h=9 rx=2 transform="rotate(-30 1165 381)"`，fill `rgba(228,249,252,.14)` stroke `rgba(228,249,252,.38)`
- 针尖：`M 1164 387 L 1170 397` stroke `rgba(203,238,246,.6)` w1.6
- 支点圆：`cx=1355 cy=866 r=9` stroke `rgba(228,249,252,.3)`；内圆 `r=3.5` fill `rgba(3,17,23,.95)` stroke 同色

### 瓶子尾迹 dasharray（漂走的瓶子身后）

- 主尾迹：`M 840 344 C 990 338, 1130 320, 1292 300`，stroke `rgba(203,238,246,.26)`，**dasharray 7 9**
- 次尾迹：`M 906 356 C 1040 348, 1170 330, 1300 314`，stroke `rgba(203,238,246,.13)`，**dasharray 5 12**
- 涟漪椭圆：`(1176,304) rx48 ry11` α.30；`(1176,304) rx84 ry20` α.15；`(1078,320) rx32 ry8` α.18（stroke `rgba(203,238,246,…)`)
- 瓶组：`<g transform="rotate(-13 1362 282)">`：瓶身 `M 1306 262 L 1382 262 L 1382 272 L 1408 272 L 1408 292 L 1382 292 L 1382 302 L 1306 302 Z` fill `url(#glass)` stroke `rgba(228,247,252,.86)`；内线 `x=1316 y268-296` α.56、`x=1348` α.28；木塞 rect `1406,269,6×26,rx1` fill `rgba(228,247,252,.62)`；信件 rect `1412,271,13×22,rx2` fill `rgba(246,215,154,.5)` stroke `rgba(246,215,154,.72)`
- 指示线：`M 1244 216 L 1300 254` stroke `rgba(203,238,246,.32)`

## 4. 三出口文案速查

`回首页` / `去河道捞一个漂流瓶` / `去公海听完成的作品`
