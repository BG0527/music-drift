# drift-log-page 块清单（稿：docs/ui-review/design-explore/p-driftlog-record.html · record-v1）

> 逐块照抄稿；唯一翻译＝固定 px → 流体（vw/clamp 等比例换算，视觉比例不变）。
> 页面自带 `<main>`；侧边栏已删（不出现）。

## 0. 全局/页面壳

- token（:root）：`--ink:#050f14` `--paper:#f3f9fa` `--muted:#a9c7cf` `--glass:#7fd1d9` `--coral:#d4553a` `--warm:#f6d79a` `--line:rgba(243,249,250,.13)`
- 背景三层（稿中 `.platter/.glint/.waterlight`）：
  - platter：`repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px)` + `radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)`
  - glint：`mix-blend-mode:screen`，`linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)`
  - waterlight：`left:-8%; top:-4%; width:118%; height:290px; mix-blend-mode:screen`，`linear-gradient(186deg, rgba(203,238,246,.10) 0%, rgba(203,238,246,.042) 32%, transparent 70%)`
- 字体：正文 `'LXGW WenKai',serif`；数字 `.mono` = `Quattrocento,serif` + `tabular-nums`
- `.cat`：`font-size:11px; letter-spacing:.24em; color:rgba(243,249,250,.5)`（Quattrocento,'LXGW WenKai'）
- `<main>`：`position:relative; z-index:2; height:900px; padding:64px 76px 0`（px→流体，比例照稿）

## 1. 页头 header

- `.crumb`：`display:inline-flex; align-items:center; gap:7px; height:28px; padding:0 12px; border:1px solid rgba(243,249,250,.16); border-radius:2px; font-size:12.5px; color:var(--muted)`
  - 内 svg：`width="8" height="12" viewBox="0 0 8 12"`，`<path d="M6.4 1.2 1.8 6l4.6 4.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`
  - 文案逐字：`回漂流瓶`
- `.cat`（`margin-top:16px`）文案逐字：`SIDE A · 刻痕`
- `h1`：`margin-top:14px; font-size:56px（+，流体化）; font-weight:700; line-height:1; letter-spacing:.02em`；文案逐字：`漂流日志`
- `.sub`：`margin-top:14px; font-size:15px; line-height:1.85; color:var(--muted); max-width:730px`；文案逐字：`这里只记核心操作：发起、接唱、捞取、投河、回传、入海。操作者只显示匿名代号。`

## 2. 右上统计 `.hright`

- `position:absolute; right:76px; top:64px; text-align:right`
- `.song`：`margin-top:8px; font-size:19px; font-weight:700`；文案逐字：`占位曲目 · 一`（实现用真实曲名，缺省保持稿文案结构）
- `.n`：`margin-top:10px; font-family:Quattrocento; font-size:30px; line-height:1; color:var(--glass)`；内容＝刻痕数（真实数据条数）
- `.cap`：`margin-top:2px`；文案逐字：`道刻痕`；上方 `.cat` 文案逐字：`曲名`

## 3. 刻痕语法表 `.key`（图例，7 项，逐字文案+逐值 svg）

- 容器：`margin-top:22px; display:flex; align-items:flex-start; gap:19px`
- 每 figure：`display:flex; flex-direction:column; gap:7px`；figcaption：`font-size:12px; color:var(--muted); letter-spacing:.03em`
- 每 svg：`width="44" height="30" viewBox="0 0 44 30" fill="none"`，公共竖基准 `<path d="M6 8v14" stroke="rgba(243,249,250,.24)"/>`；切口线均 `stroke-linecap="round"`：
  1. `发起`：`<path d="M6 15h26" stroke="rgba(127,209,217,.95)" stroke-width="2.4"/>`
  2. `接唱`：`<path d="M6 15h18" stroke="rgba(243,249,250,.85)" stroke-width="1.8"/>`
  3. `投河`：`<path d="M6 15h14" stroke="rgba(127,209,217,.62)" stroke-width="1.8"/>`
  4. `捞取`：`<path d="M6 15h11" stroke="rgba(169,199,207,.62)" stroke-width="1.8"/>`
  5. `回传`：`<path d="M6 15h21" stroke="rgba(246,215,154,.9)" stroke-width="1.8"/>`
  6. `完成`：两条 `<path d="M6 13.5h20"/>` + `<path d="M6 16.5h20"/>`，`stroke="rgba(243,249,250,1)" stroke-width="1.6"`
  7. `入海`：`<path d="M6 15h30" stroke="rgba(212,85,58,1)" stroke-width="2.4"/>`
- 行为：图例**只列发生过的操作**（按真实数据过滤，顺序按稿序）。

## 4. 主体 `.body`：`position:relative; height:562px; margin-top:24px`

### 4a. 刻痕盘 `.lathe`（半沉螺旋，逐值照抄）

- `position:absolute; left:0; top:0`；svg `width="480" height="540" viewBox="0 0 480 540" fill="none"`
- `<defs>`：
  - `linearGradient id="wet" x1=0 y1=0 x2=1 y2=0`：stop0 `#cbeef6` opacity `.34`；stop `.45` `#cbeef6` `.13`；stop1 `#cbeef6` `0`
  - `radialGradient id="spill" cx=".32" cy=".22" r=".92"`：stop0 `#7fd1d9` `.46`；stop `.55` `#7fd1d9` `.22`；stop1 `#7fd1d9` `.11`
- `<g transform="translate(8 4)">`：
  - 湿痕：`<path d="M433.5 395.6 A282 282 0 0 1 69.0 493.3" stroke="url(#wet)" stroke-width="9" stroke-linecap="round"/>`
  - `g fill="none" stroke-linecap="round"` 内 12 条弧（序＝#01…#11，其中完成占两条）：
    1. `M210.5 191.8 A52 52 0 0 1 228.3 200.5` stroke `rgba(127,209,217,.95)` w2.4
    2. `M251.9 190.8 A75 75 0 0 1 271.9 245.9` stroke `rgba(243,249,250,.85)` w1.8
    3. `M292.5 264.1 A98 98 0 0 1 268.7 308.8` stroke `rgba(127,209,217,.62)` w1.8
    4. `M269.8 338.6 A121 121 0 0 1 220.1 360.8` stroke `rgba(169,199,207,.62)` w1.8
    5. `M199.5 386.0 A144 144 0 0 1 95.2 343.8` stroke `rgba(243,249,250,.85)` w1.8
    6. `M60.2 337.8 A167 167 0 0 1 30.6 256.6` stroke `rgba(127,209,217,.62)` w1.8
    7. `M7.7 225.4 A190 190 0 0 1 34.1 144.1` stroke `rgba(169,199,207,.62)` w1.8
    8. `M36.2 102.2 A213 213 0 0 1 185.9 29.3` stroke `rgba(243,249,250,.85)` w1.8
    9. `M225.8 7.8 A236 236 0 0 1 394.9 113.5` stroke `rgba(246,215,154,.9)` w1.8
    10. `M435.4 140.8 A259 259 0 0 1 435.4 343.2` stroke `rgba(243,249,250,1)` w1.6
    11. `M439.6 139.0 A263.5 263.5 0 0 1 439.6 345.0` stroke `rgba(243,249,250,1)` w1.6
    12. `M433.5 395.6 A282 282 0 0 1 69.0 493.3` stroke `rgba(212,85,58,1)` w2.4（入海）
  - 中心点：`<circle cx="197" cy="242" r="2.6" fill="rgba(127,209,217,.5)"/>`
  - 编号文字 `g font-family="Quattrocento,serif" font-size="10" fill="rgba(243,249,250,.5)"`，每条 `dy="0.34em" text-anchor="middle"`：
    `#01(214.1,206.9)` `#02(255.3,220.8)` `#03(272.0,281.9)` `#04(240.9,340.7)` `#05(147.9,363.5)` `#06(52.3,294.7)` `#07(28.7,187.3)` `#08(109.3,62.2)` `#09(315.2,52.9)` `#10(443.0,242.0)` `#11(270.0,530.0)`
  - 盘边一汪水（spill）：
    - `M62 484 C58 473 80 467 102 469 C126 471 152 474 155 484 C158 495 130 502 104 501 C80 500 66 494 62 484 Z` fill `url(#spill)` stroke `rgba(203,238,246,.26)`
    - 高光 `M70 479 C86 471 112 469 136 473` stroke `rgba(228,247,252,.42)` w1.4
    - 暗纹 `M80 492 C98 498 128 499 148 494` stroke `rgba(203,238,246,.20)`
    - 溅点 `<ellipse cx="166" cy="492" rx="6" ry="3" fill="rgba(127,209,217,.28)"/>`
  - 瓶子 `g transform="translate(101 487) rotate(-26) scale(.8)"`：
    - `rect x=-3.6 y=-20 w7.2 h5 rx2` fill `rgba(246,215,154,.5)`
    - `path d="M-1.8-14.4v4.2M1.8-14.4v4.2"` stroke `rgba(203,238,246,.5)` w1.1
    - `rect x=-7 y=-10.2 w14 h22 rx4` fill `rgba(127,209,217,.1)` stroke `rgba(203,238,246,.58)` w1.2
    - `rect x=-4 y=-6.6 w8 h14 rx2` fill `rgba(246,215,154,.2)` stroke `rgba(246,215,154,.45)` w1

### 4b. 时间线 `.roll`

- 容器：`position:absolute; left:564px; right:0; top:4px; bottom:0`
- `ol { list-style:none; border-top:1px solid var(--line) }`
- `li`：`display:grid; grid-template-columns:52px 1fr 126px 150px; align-items:baseline; padding:11px 0; border-bottom:1px solid rgba(243,249,250,.07)`
- `li.last`：`border-bottom-color:var(--line)`；`position:relative`；`::before{content:''; position:absolute; left:-14px; top:10px; bottom:10px; width:2px; background:var(--coral)}`
- 单元：
  - `.seq`：Quattrocento `font-size:11px; letter-spacing:.08em; color:rgba(243,249,250,.5)`，文案 `#01`…`#NN`
  - `.op`：`font-size:17px; line-height:1.4; padding-right:18px`
  - `.who`：`font-size:14px; color:var(--muted)`
  - `.at`：Quattrocento `font-size:12px; color:rgba(243,249,250,.5); text-align:right`
- 行结构：`<ol>` 语义保留；每行 4 个 span；真实数据（useBottleEvents）+ 匿名代号（who）；末行 `class="last"`。
- 文案模板（op 逐字，按操作类型）：
  - `发起：选定了这首歌`
  - `接唱：有人录下了一段`
  - `投河：交给河道，等待下一位`
  - `捞取：有人从河道里把它拿走了`
  - `回传：交回上游的传递者`
  - `完成：最后一段录好了，作品完整`
  - `入海：成为公海里的公共作品`
  - 时间格式逐字：`2026/9/19 20:14` 形（`YYYY/M/D HH:mm`）

## 5. 行为保留（非视觉）

- `<ol>` 列表语义；数据来自 `useBottleEvents` 真数据；`who` 匿名代号；图例只列发生过的操作。
