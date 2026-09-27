# 选歌清单 · 块清单（p-songpicker-record.html → React）

来源：`docs/ui-review/design-explore/p-songpicker-record.html`（357 行，画布 1440×900，`<html>/<body>` 固定尺寸、`overflow:hidden`）。
标题（逐字）：`选一首歌 · 五只浅盆（水线只留在盆里）`。
本文只做「HTML 块 → React 结构」的映射与逐字/参数抄录，不含任何新增设计决策。

---

## 0. 全局 token 与字体（根上一次定义）

CSS 变量（`:root`，逐字）：

| token | 值 |
| --- | --- |
| `--ink` | `#050f14` |
| `--paper` | `#f3f9fa` |
| `--muted` | `#a9c7cf` |
| `--glass` | `#7fd1d9` |
| `--coral` | `#d4553a` |
| `--warm` | `#f6d79a` |
| `--line` | `rgba(243,249,250,.13)` |

字体（`@import`，走本地 node_modules 路径，React 侧等价于引入同名 fontsource/lxgw-wenkai 样式）：

- `LXGW WenKai` regular + bold（正文、h1、按钮、输入框）。
- `Quattrocento` 400 + 700 —— 只用于 `.cat / .n / .meta / .st / .foot`，并带 `font-variant-numeric: tabular-nums`。
- body：`font-family:'LXGW WenKai',serif; -webkit-font-smoothing:antialiased; background:var(--ink); color:var(--paper)`。
- 通用标签 `.cat`：`font-size:11px; letter-spacing:.24em; color:rgba(243,249,250,.5)`（Quattrocento 栈）。

---

## 1. 顶栏（header + tally）

**React 结构**

```tsx
<header className="sp-header">          {/* position:absolute; left:76px; top:56px; z-index:2 */}
  <p className="cat">SIDE A · 未刻</p>
  <h1>选一首歌，投出第一棒</h1>
  <p className="sub">…（逐字见下，源码中跨行，HTML 折叠为一段）</p>
</header>
<div className="sp-tally">              {/* position:absolute; right:76px; top:56px; z-index:2; display:flex; gap:38px; text-align:right */}
  <div><span className="n">4</span><span className="cat">已切分</span></div>
  <div><span className="n">1</span><span className="cat">未切分</span></div>
</div>
```

**逐字文案**

- `.cat`：`SIDE A · 未刻`
- `h1`：`选一首歌，投出第一棒`
- `.sub`（源码两行，折叠后为一句）：`这里每首歌都被切成固定段位（同一位置永远属于同一段，斩浪也不会把后面的段前移）。你录第 1 段，之后交给河道里的陌生人。`
- 计数：`4` / `已切分`，`1` / `未切分`

**字号 / 字距 / 色值**

| 选择器 | 参数 |
| --- | --- |
| `h1` | `margin-top:22px; font-size:56px; font-weight:700; line-height:1`（色 = `--paper`） |
| `.sub` | `margin-top:16px; max-width:820px; font-size:15.5px; line-height:1.75; color:var(--muted)` |
| `.cat` | `11px / letter-spacing:.24em / rgba(243,249,250,.5)`（Quattrocento + tabular-nums） |
| `.n` | `display:block; font-size:26px; line-height:1; color:var(--glass)` |
| `.tally .cat` | `display:block; margin-top:8px` |

---

## 2. 检索牌（plate）+ 挂片「找 歌」

**React 结构**

```tsx
<div className="sp-plate">
  <span className="tab cat">找 歌</span>
  {/* input 见第 3 块 */}
  <span className="count cat">曲库共 5 首</span>
</div>
```

**逐字文案**：`找 歌`（「找」「歌」之间有一个半角空格）、`曲库共 5 首`

**几何 / 色值**

- `.plate`：`position:absolute; left:76px; top:236px; width:844px; height:44px; z-index:2; display:flex; align-items:center; gap:16px; padding:0 16px; border:1px solid var(--line); border-radius:2px; background:rgba(243,249,250,.035)`
- `.tab`（挂片，骑在牌的上边框上）：`position:absolute; left:18px; top:-16px; height:17px; padding:0 12px; line-height:16px; border:1px solid var(--line); border-bottom:none; border-radius:2px 2px 0 0; background:rgba(243,249,250,.07)`；文字样式复用 `.cat`（11px / .24em / `.5`）
- `.count`：`margin-left:auto`，样式复用 `.cat`

---

## 3. 搜索框（input[type="search"]）

```tsx
<input type="search" placeholder="按曲名过滤" aria-label="按曲名过滤曲库"
       className="sp-input" />
```

逐字：placeholder `按曲名过滤`；aria-label `按曲名过滤曲库`。

参数：

- 本体：`width:320px; height:30px; border:none; border-bottom:1px solid rgba(243,249,250,.24); background:transparent; color:var(--paper); font-family:'LXGW WenKai',serif; font-size:15px`
- `::placeholder { color:var(--muted) }`
- `:focus { outline:none; border-bottom-color:var(--glass) }`

---

## 4. 状态区（states，无匹配 / 空态两行）

```tsx
<div className="sp-states">
  <p className="st"><span className="cat">无匹配</span><span>曲库里没有名字含「蓝」的歌，换个词试试。</span></p>
  <p className="st st2"><span className="cat">空 态</span><span>曲库还没准备好——这一版还没有可选的歌。曲库接入后，这里会出现可以分成 4 段的曲目。</span></p>
</div>
```

逐字文案（注意 `空 态` 中间有空格；`「蓝」` 用直角引号；`——` 是双破折号）：

1. 标签 `无匹配` → 正文 `曲库里没有名字含「蓝」的歌，换个词试试。`
2. 标签 `空 态` → 正文 `曲库还没准备好——这一版还没有可选的歌。曲库接入后，这里会出现可以分成 4 段的曲目。`

几何 / 字号 / 色值：

- `.states`：`position:absolute; left:76px; top:292px; width:844px; z-index:2; padding:9px 14px; border:1px dashed rgba(243,249,250,.16); border-radius:2px`
- `.st`：`display:flex; gap:14px; font-size:12.5px; line-height:1.6; color:var(--muted)`（Quattrocento + tabular-nums）
- `.st.st2 { margin-top:5px }`；`.st .cat { flex:none }`（标签即 11px/.24em/.5 的 `.cat`）

---

## 5. 五口浅盆 · 逐盆几何（rack / bay / svg `<g>` 平移）

### 5.1 格架（HTML 层）

```tsx
<ul className="sp-rack">            {/* position:absolute; inset:0; z-index:3; list-style:none */}
  {songs.map(s => <li className="sp-bay" style={{left: s.left}}> … </li>)}
</ul>
```

- `.bay`：`position:absolute; top:366px; width:246px; height:430px`
- 五格 `left`（逐字 style）：`76px` / `336.5px` / `597px` / `857.5px` / `1118px` —— 等距 **260.5px**
- `.slot`（格壁，三层背景，全部 `no-repeat`）：
  - `linear-gradient(180deg, rgba(243,249,250,.11), rgba(243,249,250,0) 76%)`，`background-size:1px 100%`，`position:0 0`（左壁）
  - 同上渐变，`background-size:1px 100%`，`position:100% 0`（右壁）
  - `linear-gradient(180deg, rgba(243,249,250,.045), rgba(3,17,23,0) 86%)`，`background-size:100% 100%`，`position:0 0`（格底沉色）
- `.edge`（格顶沿）：`position:absolute; left:0; top:<错落>; width:100%; height:58px`，背景两层：
  - 横线：`linear-gradient(90deg, rgba(243,249,250,.34), rgba(243,249,250,.05)) 0 0 / 100% 1px no-repeat`
  - 竖向淡出：`linear-gradient(180deg, rgba(243,249,250,.075), rgba(243,249,250,0))`
- `.edge` 的 `top` 错落（逐格 style）：**0 / 6 / 2 / 8 / 4 px**

### 5.2 盆（svg 层）—— 画布 `<svg class="art" width="1440" height="900" viewBox="0 0 1440 900" fill="none" aria-hidden="true">`

**整体包围盒 236:206**：盆口/盆沿 `rx=118` → 宽 **236**；`ry=88.5 ×2 = 177` + 壁高 **29** = **206**（高）。所有盆共用同一 `#dish` 定义。

逐盆 `transform="translate(x y)"`（x 与 HTML 格心对齐，y 做错落）：

| 盆 | translate | 相对 y 均值(645.4) 错落 | 状态 |
| --- | --- | --- | --- |
| 1 | `translate(199 640)` | ≈ −5px | 已切分（有水） |
| 2 | `translate(459.5 651)` | ≈ +6px | 干盆（未切分） |
| 3 | `translate(720 637)` | ≈ −8px | 已切分 |
| 4 | `translate(980.5 654)` | ≈ +9px | 已切分 |
| 5 | `translate(1241 645)` | ≈ 0 | 已切分 |

→ y 错落幅度 **±8px**（637…654）。

**`#dish`（盆体，局部坐标，盆心为原点）**

- 外壁：`<path d="M-118 0 A118 88.5 0 0 0 118 0 L118 29 A118 88.5 0 0 1 -118 29 Z" fill="url(#wallOut)" />`（壁高 29）
- 盆沿顶面：`<ellipse rx="118" ry="88.5" fill="url(#rimTop)" />`
- 盆口裁切：`<clipPath id="mouth"><ellipse rx="113" ry="84.8" /></clipPath>`（内口 226×169.6）
- 裁切内：盆口内壁 `ellipse rx=113 ry=84.8 fill=url(#dishInner)`；盆底 `ellipse cy=29 rx=113 ry=84.8 fill=url(#dishFloor) stroke=rgba(243,249,250,.14)`；盆底再叠同尺寸 `fill=none stroke=rgba(243,249,250,.14)`
- 内口线：`ellipse rx=113 ry=84.8 fill=none stroke=rgba(228,249,252,.18)`
- 盆沿外弧（近侧高光）：`<path d="M-118 0 A118 88.5 0 0 0 118 0" stroke="rgba(228,247,252,.3)" />`

**`#pool`（水体，只画在盆里）**

- 水体：`<path d="M-113 20 A113 84.8 0 0 1 113 20 L113 240 L-113 240 Z" fill="url(#waterBody)" />` —— 上边界＝贴远端盆壁的水线弧，两条竖边与下半被 `#mouth` 裁掉（水出不了盆）
- 主水线：`<path d="M-113 20 A113 84.8 0 0 1 113 20" stroke="rgba(228,247,252,.48)" />`
- 粗波纹：`<path d="M-102 6 Q-40 -14 58 -6" stroke="rgba(228,247,252,.07)" stroke-width="7" />`
- 细波纹：`<path d="M-96 -18 Q-36 -42 24 -34" stroke="rgba(203,238,246,.1)" />`、`<path d="M-74 52 Q-18 72 42 64" stroke="rgba(203,238,246,.06)" />`
- 气泡：`<circle cx="-92" cy="30" r="1.8" fill="rgba(228,247,252,.28)" />`、`<circle cx="-60" cy="50" r="1.4" fill="rgba(228,247,252,.22)" />`

**干盆特有（第 2 格，clip 口内）**

- 干光：`<ellipse cy="26" rx="72" ry="30" fill="url(#dryLight)" />`
- 水位虚线（水本该到的地方）：`<ellipse cy="20" rx="113" ry="84.8" fill="none" stroke="rgba(228,247,252,.22)" stroke-dasharray="3 7" />`

**盆内图层顺序**

- 已切分盆：`#dish` → `[clip #mouth] #master@(0,29)` → `#rings@(0,33) opacity=".5"` → `#pool` → `#rings@(0,29) + #seg1@(0,29)`
- 干盆：`#dish` → `[clip #mouth] dryLight` → `水位虚线@(0,20)` → `#masterBlank@(0,29)`

### 5.3 渐变 defs（逐 stop 抄录）

| id | 类型/定位 | stops |
| --- | --- | --- |
| `lacquer` | radial `cx=34% cy=26% r=76%` | `#0a303c @.6` → `#031117 @.84` |
| `blank` | radial `cx=36% cy=28% r=76%` | `#16404d @.56` → `#031117 @.8` |
| `wallOut` | linear 横向 | `#031117 @.46` → 17% `#cbeef6 @.11` → 46% `#cbeef6 @.19` → 78% `#7fd1d9 @.06` → `#031117 @.46` |
| `rimTop` | linear 纵向 | `#dff3f7 @.14` → `#7fd1d9 @.06` |
| `dishInner` | linear 纵向 | `#031117 @.68` → 55% `#08222b @.5` → `#0f4251 @.38` |
| `dishFloor` | radial `cx=46% cy=38% r=78%` | `#0f4251 @.48` → `#031117 @.7` |
| `dryLight` | radial `cx=46% cy=40% r=66%` | `#cbeef6 @.11` → `#cbeef6 @0` |
| `waterBody` | linear `userSpaceOnUse (0,-74)→(0,160)` | `#a8e4ec @.24` → 20% `#7fd1d9 @.2` → 60% `#1d5f70 @.25` → `#0a3a48 @.36` |

---

## 6. 沟槽半径梯（rings / master / seg1 / masterBlank）

母版盘 `rx=84 / ry=63`（宽 168）。沟槽圈半径梯（**相对 84 的百分比**）：

| 圈 | rx | ry | 占母版 rx | `#rings` 描边 | `#master` 内圈描边 |
| --- | --- | --- | --- | --- | --- |
| 外圈 | 84 | 63 | 100% | `rgba(228,249,252,.22)` | 盘体 `rgba(228,249,252,.38)` |
| 第 2 | 74.2 | 55.7 | **88.3%** | `rgba(243,249,250,.14)` | `rgba(243,249,250,.17)` |
| 第 3 | 63 | 47.3 | **75%** | `rgba(243,249,250,.12)` | `rgba(243,249,250,.15)` |
| 第 4 | 48.8 | 36.6 | **58.1%** | `rgba(243,249,250,.11)` | `rgba(243,249,250,.13)` |
| 第 5 | 27.2 | 20.4 | **32.4%** | `rgba(243,249,250,.1)` | `rgba(243,249,250,.13)`（fill `rgba(243,249,250,.02)`） |
| 孔 | 3.7 | 2.8 | — | — | fill `#031117`，stroke `rgba(228,249,252,.3)` |

其余细节：

- 母版高光弧：`<path d="M-71.2 33.4 A84 63 0 0 0 -69.6 -35.2" stroke="rgba(203,238,246,.48)" stroke-width="1.1" />`
- 第 1 段珊瑚弧 `#seg1`：`<path d="M-16.7 -54.3 A74.2 55.7 0 0 1 16.7 -54.3" stroke="rgba(212,85,58,.9)" stroke-width="2.2" />`（贴 88.3% 那圈）
- `#masterBlank`（未切分）：盘 `fill=url(#blank) stroke=rgba(228,249,252,.3)`；`rx=74.2/ry=55.7 stroke=rgba(243,249,250,.2) stroke-dasharray="5 7"`；`rx=27.2/ry=20.4 stroke=rgba(243,249,250,.13) stroke-dasharray="4 6"`；孔 `fill=#031117 stroke=rgba(228,249,252,.28)` —— **一道实沟都没有**
- 隔水折射层：`#rings` 复制一份 `translate(0 33) opacity=".5"`（比盘面低 4px，错位感）

---

## 7. 曲目行（bay 内容：歌名 / 元信息 / 按钮 / 干盆理由）

```tsx
<li className="sp-bay" style={{left:'76px'}}>
  <span className="slot" /><span className="edge" />
  <p className="song">占位曲目 · 一</p>
  <p className="meta m1">4 段<span className="sep" />每段约 24 秒</p>
  <p className="meta m2">来源 incompetech-cc-by-4.0</p>
  <button className="act" type="button">
    <MicIcon />选这首，录第 1 段
  </button>
  {/* 未切分行才渲染：<p className="note">这首还没有切分，暂不能发起</p>，且 button 加 disabled */}
</li>
```

**逐字文案（5 行）**

| 行 | song | m1 | m2 | 按钮 |
| --- | --- | --- | --- | --- |
| 1 | `占位曲目 · 一` | `4 段`＋sep＋`每段约 24 秒` | `来源 incompetech-cc-by-4.0` | `选这首，录第 1 段` |
| 2 | `占位曲目 · 二` | `4 段`（无「每段约…」） | `来源 incompetech-cc-by-4.0` | disabled `暂不可发起`；note `这首还没有切分，暂不能发起` |
| 3 | `占位曲目 · 三` | `4 段`＋sep＋`每段约 18 秒` | 同上 | `选这首，录第 1 段` |
| 4 | `占位曲目 · 四` | `4 段`＋sep＋`每段约 27 秒` | 同上 | `选这首，录第 1 段` |
| 5 | `夜航` | `4 段`＋sep＋`每段约 21 秒` | 同上 | `选这首，录第 1 段` |

（歌曲名与元信息之间的间隔是 `.sep` 竖线，不是空格。）

**字号 / 色值 / 几何**

| 选择器 | 参数 |
| --- | --- |
| `.song` | `position:absolute; left:12px; top:11px; font-size:17px; font-weight:700; line-height:1.2` |
| `.meta` | `position:absolute; left:12px; font-size:11.5px; color:rgba(169,199,207,.92)`（Quattrocento + tabular-nums） |
| `.m1` / `.m2` | `top:38px` / `top:64px` |
| `.sep` | `display:inline-block; width:1px; height:10px; margin:0 9px; background:rgba(243,249,250,.18); vertical-align:-1px` |
| `.act` | `position:absolute; left:12px; top:84px; display:inline-flex; align-items:center; gap:7px; height:32px; padding:0 12px; border-radius:2px; border:1px solid rgba(243,249,250,.24); background:rgba(243,249,250,.03); color:var(--paper); font-family:'LXGW WenKai',serif; font-size:12.5px` |
| `.act[disabled]` | `border-color:rgba(243,249,250,.14); border-style:dashed; color:rgba(169,199,207,.7)` |
| hover | `.bay:hover .act:not([disabled]) { border-color:rgba(127,209,217,.55); color:var(--glass) }` |
| `.note`（干盆理由，写在盆沿上方） | `position:absolute; left:14px; top:132px; width:218px; font-size:12.5px; line-height:1.5; color:var(--warm)` |

**麦克风图标（Lucide mic，内联 svg，逐参数）**：`width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"`，三条 path 逐字：

```
M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z
M19 10v2a7 7 0 0 1-14 0v-2
M12 19v3
```

（React 落地时用项目既有 Lucide 依赖的 `Mic` 组件，视觉参数须等价于上表。）

---

## 8. 背景三层（画布，非块但随页面落地）

- `.platter`：`position:absolute; inset:0`，背景两层：
  - `repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px)`
  - `radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)`
- `.deep`（底部沉入层，不留硬边）：`left:0; right:0; bottom:0; height:200px; background:linear-gradient(180deg, rgba(3,17,23,0) 0%, rgba(3,17,23,.3) 70%, rgba(3,17,23,.52) 100%)`
- `.glint`：`inset:0; mix-blend-mode:screen; background:linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)`
- 层序：`platter → svg.art → deep → glint`（`header/tally/plate/states` z2，`rack` z3）

---

## 9. 页脚

```tsx
<footer className="sp-footer"><p className="foot">发起之后你会拿到这支瓶子的匿名代号；别人看到的是代号，不是你的账号。</p></footer>
```

- `.foot`：`font-size:12.5px; color:var(--muted)`（Quattrocento + tabular-nums）
- `footer`：`position:absolute; right:76px; bottom:22px; z-index:2; text-align:right`

---

## 10. React 组件树总览

```tsx
<SongPickerPage>                 {/* 1440×900 clip，--ink 底 */}
  <BackdropLayers />             {/* platter + <DishArt/> svg + deep + glint */}
  <TopBar />                     {/* header: cat/h1/sub；tally: 4 已切分 / 1 未切分 */}
  <SearchPlate>                  {/* plate: tab「找 歌」+ input + count「曲库共 5 首」 */}
  <StateNotes />                 {/* states: 无匹配 / 空 态 两行，dashed 框 */}
  <ul className="sp-rack">
    {songs.map(s => <SongBay />)}{/* slot/edge(错落 0·6·2·8·4)/song/meta×2/act/(note) + 对应盆 svg */}
  </ul>
  <Footer />
</SongPickerPage>
```

数据映射：每首歌 = `{ left, edgeTop, dish:[x,y], split:boolean, title, segCount:'4 段', segSec?:'每段约 N 秒', source, actionable }`；`split=false` 时渲染干盆（`#masterBlank` + 水位虚线 + dryLight）、`disabled` 按钮与 `.note`。
