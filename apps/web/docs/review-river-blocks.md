# 河道页块清单（f4-groove.html → React）

> 来源：`docs/ui-review/design-explore/f4-groove.html`（251 行，全文已读）。
> 本文只做「块 → 结构」的映射与差异预读，不含任何代码改动。

---

## 0. 全局 token（稿内 `:root`）

| token | 值 |
| --- | --- |
| `--ink` | `#050f14`（页面底色） |
| `--paper` | `#f3f9fa`（正文白） |
| `--muted` | `#a9c7cf`（次级字） |
| `--glass` | `#7fd1d9`（玻璃青，rpm/强调） |
| `--coral` | `#c7452c`（珊瑚，标签盘/转向） |
| `--line` | `rgba(243,249,250,.16)`（描边） |
| 画布 | 1440×900，`font-family:'LXGW WenKai',serif`；拉丁 `Quattrocento` |

---

## 1. 块清单：HTML 块 → 将落成的 React 结构

按稿中 DOM 出现顺序。行号指 f4-groove.html。

### B1 背景层组（L127–L131，见 §3 专节）
```html
<div class="platter"> <div class="body"> <div class="center"> <div class="field"><i></i></div> <div class="light">
```
→ React：一个 `aria-hidden` 的绝对定位背景容器（现页 `data-river-decor` / backdrop 槽位），内含 5 个子层 div（类名语义照搬：`platter / body / center / field>i / light`）。纯 CSS，无逻辑。

### B2 唱片表面 SVG（L132–L214）
```html
<svg class="canvas" viewBox="0 0 1440 900"> defs + 圆族 + 擦痕 + 尘点 + 转向箭头 </svg>
```
→ React：`<svg className="absolute inset-0 h-[900px] w-[1440px]" viewBox="0 0 1440 900" aria-hidden>`，参数见 §4。整块是装饰，无交互。

### B3 左上标题区 `.ov`（L217–L221）
```html
<div class="ov" style="left:76px; top:96px; width:520px">
  <div class="cat">…</div> <h1>暖流河道</h1> <p class="sub">…</p>
</div>
```
→ React：`<header>` 内左列（或独立 `<section>`）：
`<p class="cat">` + `<h1>` + `<p class="sub">`，绝对定位 76/96、宽 520 → React 侧建议改用流式布局但保留顺序与文案。

### B4 右上信息块 `.ov`（L224–L230）
```html
<div class="ov" style="left:1150px; top:112px; width:266px; text-align:right">
  <div class="rpm">33⅓</div> <div class="cat">RPM · 匿名接力</div>
  <div class="cat" style="…">两行说明</div>
</div>
```
→ React：header 右列：`<span class="rpm">33⅓</span>` + 两层 `.cat` 说明（右对齐）。

### B5 泊位 · 捞取 `.port.draw`（L233–L237）
```html
<div class="port draw ov" style="left:60px; top:400px; width:190px; height:190px" role="button" aria-label="捞一个漂流瓶">
  <i class="r1"></i><i class="r2"></i><i class="r3"></i>
  <span class="core">捞取<span>DRAW</span></span>
  <span class="cap" style="left:230px; top:40px; width:240px"><b>…</b>…</span>
</div>
```
→ React：`<button type="button" aria-label="捞一个漂流瓶">` 结构：
`三个 <i> 装饰环（aria-hidden） + <span class="core">捞取<em>DRAW</em></span> + <span class="cap"><b>标题</b>正文</span>`。cap 为按钮旁的说明块（非按钮本体内容，可拆 sibling）。

### B6 泊位 · 投下 `.port.cast`（L238–L242）
同 B5，`left:380 top:580 w/h:150`，`aria-label="投下一支漂流瓶"`，cap 在左下方（`left:-180 top:165 width:300`）。
→ React：与 B5 **同一组件**（`PortButton`，变体 `variant='draw'|'cast'`），尺寸/配色/cap 位置做 props。

### B7 页脚 `footer`（L244–L249）
```html
<footer> 5 个 .tag 按钮（全部/深夜/通勤/告白/雨天） + <a class="go">先去公海…</a> </footer>
```
→ React：`<footer>`：心情 chips 组（`aria-pressed` 单选组）+ 右侧 `<Link>`（`margin-left:auto`）。

---

## 2. 逐字文案（一字不差）

| 块 | 逐字文案 |
| --- | --- |
| B3 cat | `音乐共创 · 匿名接力 · 0001` |
| B3 h1 | `暖流河道` |
| B3 sub | `一条沟槽就是一条河。`↵`唱一段，让它顺水去找下一个陌生人。`（`<br/>` 两行） |
| B4 rpm | `33⅓` |
| B4 cat1 | `RPM · 匿名接力` |
| B4 cat2 | `唱一段，投进河里，让陌生人接棒`↵`四段齐了入海，成为公共作品` |
| B5 core | `捞取` + 小字 `DRAW` |
| B5 cap | b=`捞一个漂流瓶`；正文=`捞到别人的半句，接下一句。捞到即持有：同一时刻只有你拿着它。` |
| B6 core | `投下` + 小字 `CAST` |
| B6 cap | b=`投下一支漂流瓶`；正文=`选一首歌，录下第 1 段，投进河道，等一个陌生人接棒。` |
| B2 文字 | svg `<text>`=`顺槽 · 33⅓`（x1146 y712，monospace 10px，letter-spacing 1.6） |
| B7 tags | `全部`（pressed=true）、`深夜`、`通勤`、`告白`、`雨天` |
| B7 go | `先去公海听听已经完成的作品` |

---

## 3. 排版：字号 / 字距 / 色值 / 透明度

| 选择器 | 属性 |
| --- | --- |
| `h1` | 84px / 700 / line-height 1 / `--paper` |
| `.sub` | margin-top 14px / 15.5px / lh 1.9 / `--muted #a9c7cf` |
| `.cat` | Quattrocento / 11px / letter-spacing .24em / `rgba(243,249,250,.5)` |
| `.cat`（B4 第三行） | letter-spacing .06em / lh 2 / opacity .82 |
| `.note`（样式的类，正文未用） | 13px / lh 1.85 / `rgba(243,249,250,.72)`；`b` 用 `--glass`，font-weight 400 |
| `.rpm` | Quattrocento / 26px / `--glass #7fd1d9` |
| `.port .core` | 20px / 700 / letter-spacing .12em / `#f3f9fa`；text-shadow `0 1px 12px rgba(3,16,22,.95)` |
| `.port .core span`（DRAW/CAST） | 10px / letter-spacing .28em / opacity .7 / weight 400 |
| `.port .cap` | 宽 290（B5/B6 各自覆写 240/300）/ 12.5px / lh 1.75 / `--muted` / text-shadow `0 1px 8px rgba(2,10,14,.95)` |
| `.port .cap b` | block / `--paper` / 15px / margin-bottom 3px |
| `.tag` | 12px / padding 8px 15px / letter-spacing .1em / border `--line` / 色 `--muted`；`[aria-pressed=true]` → border `rgba(127,209,217,.6)`、色 `--paper` |
| `footer .go` | 13px / `--glass` / letter-spacing .06em |
| footer 定位 | left/right 76px、bottom 30px、gap 10px、z-index 5 |

---

## 4. svg 参数

### 4.1 定义（defs）
- `#sheen`：radialGradient cx .99 cy 1 r .42；stop0 `#7fd1d9` op .06 → stop .4 op 0。铺满 `<rect 1440×900>`。
- `#label`：radialGradient 平铺（cx/cy/r=.5）；stop0–.97 `#c7452c` op **.19**，stop1 op 0 → **平的纸标签**，不填渐变。
- `#rim`：linearGradient userSpaceOnUse x1=0 y1=800 → x2=0 y2=330；stop0 `#e6f8fb` op .5 → stop.5 op .17 → stop1 op 0（下半圈亮、上半圈隐）。

### 4.2 圆族（全部 cx=1420 cy=960，圆心在画布外右下）
| 用途 | r | 描边 |
| --- | --- | --- |
| 标签盘面 | 268 | fill `url(#label)`（珊瑚 .19 平铺） |
| 标签内圈（硬边） | 262 | none / `rgba(199,69,44,.52)` / w1.6 |
| 标签外纸白沿 | 275 | none / `rgba(243,249,250,.2)` / w1 |
| 录音区外界 lead-out | 336 | none / `rgba(214,241,247,.13)` / w1（262–336 = 无沟平滑留白） |
| 外缘 rim | 1276 | `url(#rim)` / w2 |
| 外缘倒角内线 | 1268 | `rgba(214,241,247,.14)` / w1（14px 内补一条，双线=车削边唇） |

### 4.3 河道（被点亮的沟槽 = 有宽度的水槽，r=900 一族）
| 层 | 参数 |
| --- | --- |
| 水体底槽 | r900 / `rgba(42,157,177,.2)` / w**26** |
| 水面亮线 | r900 / `rgba(159,230,237,.42)` / w**7** |
| 下岸 | r887 / `rgba(216,243,246,.5)` / w1.4 |
| 上岸 | r913 / `rgba(216,243,246,.44)` / w1.4 |
| 水流虚线 A | r900 / `rgba(243,249,250,.42)` / w2 / dasharray `16 30` / linecap round |
| 水流虚线 B | r906 / `rgba(243,249,250,.2)` / w1.6 / dasharray `10 40` / linecap round |

### 4.4 擦痕弧（顺槽方向短弧，`stroke-linecap=butt`，`#e6f7fb`）
| r | stroke-opacity | width | dasharray | dashoffset |
| --- | --- | --- | --- | --- |
| 1180 | .17 | 1.1 | `126 9999` | -4120 |
| 1214 | .12 | 1 | `92 9999` | -4460 |
| 1128 | .14 | 1.2 | `158 9999` | -3700 |
| 1246 | .1 | 1 | `70 9999` | -4830 |

### 4.5 尘点（4 颗聚一撮，`#eafcff`）
(556,700,r1.5,op.26)、(578,712,r1.1,op.2)、(540,716,r1.2,op.22)、(592,698,r1,op.16)。

### 4.6 转向箭头（group opacity .8）
- 主弧：`M1296 700 Q 1366 640 1442 674` stroke `rgba(199,69,44,.55)` w2 round。
- 箭头：`M1442 674 l -6 -15 l -15 6` 同色同宽。
- 文字 `顺槽 · 33⅓`：x1146 y712，fill `rgba(199,69,44,.62)`，`ui-monospace, Consolas, monospace`，10px，letter-spacing 1.6。

### 4.7 已删除项（稿中明注，勿再引入）
唱臂（读成火箭，用户裁决删）；detail2 整组（blur 环 + 14 尘屑 + 6 椭圆摩尔纹 + 波形调制，尤其以 (176,92) 为圆心的椭圆族）；星点 20 颗（星空读法根源）。

### 4.8 两枚错落圆盘泊位的几何
| 项 | 捞取 draw | 投下 cast |
| --- | --- | --- |
| 定位 | left 60 / top 400 | left 380 / top 580 |
| 盘体 | 190×190 | 150×150（**错落：小一档且更靠下**） |
| 环 r1 | inset **-13px** / 1.5px `rgba(228,249,252,.42)` | 同 |
| 环 r2 | inset **-29px** / 1px `rgba(228,249,252,.2)` | 同 |
| 环 r3 | inset **-45px** / 1px `rgba(228,249,252,.1)` | 同 |
| 盘面 | `radial-gradient(76% 76% at 34% 26%, rgba(10,48,60,.5), rgba(3,17,23,.78))`，深色半透、**不填彩色** | 同 |
| 边+辉光 | draw：border `rgba(203,238,246,.7)` 1px；shadow `0 0 52px rgba(178,232,244,.3)` + inset `0 0 28px rgba(160,226,240,.2)`（冷边） | cast：border `rgba(246,215,154,.66)`；shadow `0 0 52px rgba(246,215,154,.26)` + inset `0 0 28px rgba(246,215,154,.16)`（暖边） |
| 核心文字 | grid 居中、gap 3px、20px/700/ls .12em `#f3f9fa` | 同 |
| z-index | 3（高于 svg 与 ov 默认层） | 3 |
| cap 摘要 | b 15px `--paper`；宽 240，位于盘右 `left:230 top:40` | 宽 300，位于盘左下 `left:-180 top:165` |

---

## 5. 背景层（稿共 5 个 CSS 层，按遮罩半径分段；归组即「底 / 面 / 光」三段）

圆心统一 `(1420px, 960px)`（画布外右下），可见半径带 60–1714px。

**① 底（台面 + 盘身）**
1. `.platter` 台面：`radial-gradient(circle at 1420px 960px, transparent 0 1276px, rgba(2,9,13,.52) 1285px, transparent 1366px)`（贴外缘接触阴影）+ 底色 `rgba(127,209,217,.022)`（台面抬 2.2%）。
2. `.body` 盘身：`radial-gradient(... rgba(127,209,217,.055) 0 1210px, transparent 1330px)`（盘面比台面亮一档）。

**② 面（沟槽纹理，两档沟距）**
3. `.center` 录音区：`repeating-radial-gradient(... rgba(216,243,246,.07) 0 1.25px, transparent 1.25px **11px**)`；mask `transparent 0 340px / #fff 400px / #fff 790px / transparent 880px`（340–790 是唯一读得出同心的圈，约 35 条沟）。
4. `.field > i` 外圈沟槽：`repeating-radial-gradient(... rgba(214,241,247,.03) 0 1px, transparent 1px **4.4px**)`；外层 mask 半径 930–1258（`transparent 0 930 / #fff 990 / #fff 1258 / transparent 1300`），内层 `i` 再按左上角衰减 `radial-gradient(circle at 0 0, transparent 0 340px, #fff 820px)`（字角安静）。830–930 是**无沟 land**，河道 r900 恰落其中。

**③ 光（掠光）**
5. `.light`：`mix-blend-mode:screen`；两道背景——环光 `rgba(210,240,246, 0→.034@1060px→0@1140px)`（r980–1140）+ 线性灯带 `linear-gradient(101deg, 0@26%, .03@40%, **.058@50%**, .05@53%, .012@55%, .006@62%, 0@74%)`（53%–55% 陡降=灯管被盘面切断的硬边）；mask 圆 0–1258 不透明、1300 透明。

---

## 6. 现页面与稿的差异预读

对象：`apps/web/src/pages/river-page.tsx`（493 行；仅 grep 块级结构 + 少量定点读取，未整读）。

### 6.1 现页 top 级块结构（grep 结果）
| 行 | 块 |
| --- | --- |
| 239 | 根 `div.relative.isolate.-mx-6.flex.flex-col.gap-6`（包裹全部） |
| 243 | `div[aria-hidden]` 背景装饰层（z-0，正文 `relative z-10`） |
| 249 | `header`（左右两列 flex，L250 左列 / L261 右列） |
| 280 | `section.river-body`（水线以下整片水；L289 `data-river-decor` 装饰层、L302 场景层、L349 `md:grid-cols-2` 双泊位区、L351 捞取 section / L416 投下 section、L470 `h-48/h-16` 波形带、错误重试块） |
| 485 | 底部 `div`（`MoodChips` + `Link 去公海`，等价页脚，但**不是 `<footer>`**） |

### 6.2 对照稿块：多（现页有 / 稿无 → 拟删或待裁）
1. **右列「我参与过的漂流瓶」链接**（L269）——稿右上块没有此链接，只有 rpm + 两行说明。
2. **波形带 `div.h-[48px]/md:h-16`**（L470）——稿整页无此块。
3. **错误重试块**（`retryLabel="再捞一次"`，L479）——稿无失败态 UI（稿只有静态按钮）。
4. **sr-only h2**（L309 河道 / L356 / L421）——稿无（无障碍增项，应保留）。
5. **根级 flex 流式布局 + 背景 z 分层容器**（L239/243）——稿是 1440×900 绝对定位画布；实现时需把稿的绝对坐标翻译成流式/响应式。
6. `MoodChips` 内容未核对是否等于稿的 `全部/深夜/通勤/告白/雨天`（本次未整读，留待实现时对一遍）。

### 6.3 对照稿块：删/补（稿有 / 现页无 → 拟补；或文案不一致）
1. **副标题文案**：稿=`一条沟槽就是一条河。↵唱一段，让它顺水去找下一个陌生人。`（两行）；现页=`拾起那些搁浅在黑夜里的声线`（单行）→ **整条替换**。
2. **cat 编号**：稿=`音乐共创 · 匿名接力 · 0001`；现页=`音乐共创 · 匿名接力`（无 `· 0001`）→ 补编号。
3. **右上第二段说明**（稿两行：`唱一段，投进河里，让陌生人接棒↵四段齐了入海，成为公共作品`）——现页右列完全没有 → 补。
4. **`RPM · 匿名接力` 小字**：稿在 33⅓ 下方有两层 cat；现页只有 `RPM` 一行 → 补 `· 匿名接力` 或按稿分两行。
5. **整套唱片 SVG**（§4 全部参数：圆族/沟槽弧/擦痕/尘点/转向箭头 `顺槽 · 33⅓`/rim/label）——现页装饰是 `river-flowline / RippleRing / river-gather` 的水纹体系，几何完全不同 → 需**整体替换为稿几何**（或并存裁决，属视觉契约差异，按 AGENTS.md §5 上报）。
6. **泊位尺寸**：稿=**错落不等**（190×190 vs 150×150，top 400 vs 580）；现页头注释明确「两枚泊位**共用同一份尺寸** PORT_SIZE（等权守卫）」→ **结构冲突**，需裁决（错落 vs 等权二选一，影响测试守卫）。
7. **泊位文案不一致**：
   - 捞取 cap：稿=`捞到别人的半句，接下一句。捞到即持有：同一时刻只有你拿着它。`；现页=`捞取深海深处传来的匿名哼唱，接续她的下一句旋律。捞到即持有…`
   - 投下 cap：稿=`选一首歌，录下第 1 段，投进河道，等一个陌生人接棒。`；现页正文未逐字核对（L452 附近）→ 实现前逐字对齐。
   - 核心小字：稿有 `DRAW`/`CAST` 英文第二行 → 现页按钮区未见（grep 无 DRAW/CAST）→ 补。
8. **页脚结构**：稿=`<footer>` + `.tag` 按钮（aria-pressed 单选）+ go 链接；现页=`div` + `MoodChips` + `Link` → 标签文案与 `aria-pressed` 语义需对稿核实。
9. **字号基线**：现页 h1 `clamp(2.5rem,6vw,5.25rem)` 上限恰=84px ✔；sub `0.9375rem(15px) lh1.85` vs 稿 `15.5px lh1.9`（微差）；cat `0.6875rem=11px ls .24em` ✔；rpm 26px ✔。

### 6.4 一句话结论
现页骨架（header 双列 / river-body 双泊位 / 底部 chips+link）与稿的块序一致；主要差异集中在：**文案 3 处替换 + 右上说明缺失 + 唱片 SVG 整套缺位 + 泊位「错落 vs 等权」结构性冲突 + 现页多出波形带/重试块/我的漂流瓶链接**。其中泊位几何与 SVG 装饰属视觉契约差异，按 AGENTS.md §5 应上报 captain 裁决后再动代码。
