# 设置页块清单（p-settings-record.html → React 结构）

来源：`docs/ui-review/design-explore/p-settings-record.html`（336 行，一次性读完）。
页面标题：`设置 · 内袋里的说明书折页，半页浸在水线里`。
画布：`html,body` 1440×900，`overflow:hidden`，背景 `--ink:#050f14`，正文色 `--paper:#f3f9fa`，字体 `'LXGW WenKai',serif`；数字/代号用 `Quattrocento`（`.mono` 带 `tabular-nums`，`.meta` = Quattrocento + LXGW 回退）。

## 0. Token（:root）

| token | 值 |
| --- | --- |
| `--ink` | `#050f14` |
| `--paper` | `#f3f9fa` |
| `--muted` | `#a9c7cf` |
| `--glass` | `#7fd1d9` |
| `--coral` | `#d4553a` |
| `--warm` | `#f6d79a` |
| `--line` | `rgba(243,249,250,.13)` |

## 1. 背景层（`.clip` 内，非文字层）

React 结构建议：`<div className="clip">` 内按序渲染以下纯装饰 div（无交互，`aria-hidden`）。

| HTML 块 | 作用 | 关键值 |
| --- | --- | --- |
| `.platter` | 唱片盘面 | 两层 radial：`circle at 1420px 960px`，沟槽 `rgba(216,243,246,.055) 0 1.2px / 透明 6.5px`；盘心辉光 `rgba(127,209,217,.05) 0-30% → 透明 68%` |
| `.glint` | 盘面斜向反光 | `mix-blend-mode:screen`；`linear-gradient(101deg, transparent 28%, .045 45%, .065 50%, .028 55%, transparent 72%)`（`rgba(228,247,252,…)`） |
| `.air` | 水线以上空气 | `top:0; height:520px`；`rgba(127,209,217,.085 → .022(58%) → 0)` |
| `.sea` | 水线以下水体 | `top:520px; bottom:0`；`rgba(5,24,32,.5) → rgba(4,16,22,.7) 52% → rgba(3,12,17,.8)` |
| `.shaft` | 进水光柱 | `top:520px; height:380px`；99deg 渐变，峰值 `rgba(127,209,217,.085)@44%`；mask `#fff → 0 @92%` |
| `.grooves-wet` | 水下透出的沟槽 | `top:520px; bottom:0`；`rgba(216,243,246,.085) 0 1.2px / 6.5px`，同盘心 1420,960 |
| `.surf` | 水线正下水皮 | `top:520px; height:30px`；`rgba(127,209,217,.09) → 0` |

**关键坐标**：水线 y=520（整页唯一水平基准）；盘心 (1420, 960)。

## 2. `.leaf` 折页（一张纸，两半）

React 建议：`<div className="leaf">` 容器 + 内部装饰层 + 三个内容 `<section>`（l-dry / l-wet / r-dry 在 `<main>` 中，绝对定位覆盖其上，z-index:3）。

容器 `.leaf`：
- 位置尺寸：`left:104px; top:52px; width:1232px; height:796px`
- `border-radius:2px`；`border:1px solid rgba(243,249,250,.15)`
- 角切：`clip-path: polygon(30px 0, 100% 0, 100% 100%, 0 100%, 0 30px)` —— **左上角切 30px**

### 2.1 两半

| 块 | 尺寸 | 背景 |
| --- | --- | --- |
| `.leaf-dry`（干的上半） | `0,0 1232×468` | `linear-gradient(168deg, rgba(12,42,54,.9) 0%, rgba(8,31,42,.92) 60%, rgba(6,25,34,.93) 100%)` |
| `.leaf-wet`（湿的下半，透出沟槽） | `0,468 1232×328` | `180deg, rgba(8,34,45,.32) → rgba(6,26,35,.46) 58% → rgba(5,20,28,.56)` |

**分割线在纸内 y=468（= 页面 y=520 水线）；干 468 / 湿 328，合计 796。页面级比例 520/900≈57.8%（用户口径 58.8%/41.2% 指水线上下分割，落地以 468/328 精确值为准）。**

### 2.2 纸面装饰（全部 aria-hidden）

| 块 | 位置/尺寸 | 值 |
| --- | --- | --- |
| `.tide` 水渍前沿 | `0,468 1232×12` | `180deg rgba(2,10,14,.5) → 0` |
| `.film` 湿纸膜 | `0,468 1232×328` | `rgba(127,209,217,.07) → .015(55%) → 0` |
| `.leaf-top` 顶缘亮线 | `0,0 1232×1` | 90deg：`transparent 3% → rgba(203,238,246,.32) 38% → rgba(243,249,250,.14) 82% → transparent 97%` |
| `.dogear` 撕角 | `left:0; top:29px; 41×1` | `rgba(203,238,246,.4)`，`rotate(-45deg)`，origin `0 0` |
| `.crease-shl` 折缝左阴影 | `left:588; 28×796` | `90deg rgba(3,12,17,0) → rgba(3,12,17,.38)` |
| `.crease-shr` 折缝右受光 | `left:619; 28×796` | `90deg rgba(203,238,246,.07) → 0` |
| `.crease` 折缝亮线 | `left:616; 3×796` | 3 段硬停：`rgba(3,12,17,.62) 0-1px / rgba(228,247,252,.3) 1-2px / rgba(3,12,17,.34) 2-3px` |
| `.crease-soak` 湿区折缝泡胀 | `left:615; top:468; 5×328` | `rgba(3,12,17,0) → rgba(2,10,14,.5) → 0` |
| `.wick.mid` 毛细（折缝上爬） | `left:614; top:452; 6×16` | `0deg rgba(127,209,217,.45) → 0` |
| `.wick.lf` 左缘咬水 | `left:0; top:456; 3×12` | 同上 |
| `.wick.rt` 右缘咬水 | `left:1229; top:456; 3×12` | 同上 |
| `.hole` die-cut 指孔 | `left:1160; top:730; 34×34; border-radius:50%` | `radial-gradient(circle at 36% 32%, rgba(2,8,12,.97) 0 64%, rgba(127,209,217,.14) 100%)`；`border:1px solid rgba(228,247,252,.34)` |
| `.hole i` 孔内高光 | `inset:2px` 圆 | `border-bottom:1px rgba(228,247,252,.42)`；`border-right:1px rgba(228,247,252,.24)` |

折缝 x=616（纸宽 1232 的近似中线），内容列锚点：`.l-dry/.l-wet` `left:152px; width:528px`，`.r-dry` `left:760px; width:380px`。

## 3. 水线本体 `.wline`

- `left:0; right:0; top:520px; height:1px`
- 90deg 分段渐变（断口/反光）：`rgba(203,238,246,.52) 0–120px | .2 120–300 | .48 336–424 | .19 460–1040 | .36 1080–1400 | rgba(243,249,250,.16) 1400–1440`
- 内嵌反光短划 `.wline i`：`height:1px; background:rgba(228,247,252,.32)`，6 条：
  | left | top | width |
  | --- | --- | --- |
  | 148 | -1 | 30 |
  | 402 | 1 | 14 |
  | 640 | -1 | 44 |
  | 872 | 1 | 10 |
  | 1010 | -1 | 24 |
  | 1300 | 1 | 18 |

### 水面波纹 `.wav`（3 条，倒影被切段）

- 通用：`height:1px`；`90deg transparent → rgba(203,238,246,.3) 16% → .13 64% → transparent`
- ① `left:1150 top:540 w:160`；② `left:1168 top:566 w:130`；③ `left:1156 top:598 w:150`

### 气泡 `.bub`（3 个）

`border-radius:50%`；`background:rgba(203,238,246,.14)`；`border:1px solid rgba(203,238,246,.26)`。
① `1146,636 8×8`；② `1159,603 6×6`；③ `1136,670 4×4`。

## 4. 水面上的瓶子（别人看得到的）+ 水下倒影

| 块 | 位置/尺寸 | 关键值 |
| --- | --- | --- |
| `.bot-body` | `1182,416 112×104` | radius `2px 2px 4px 4px`；border `1px rgba(216,243,246,.68)`；玻璃渐变 `90deg rgba(127,209,217,.34) → .12 26% → rgba(228,247,252,.4) 40% → .14 54% → .3` |
| `.bot-shoulder` | `1182,400 112×16` | `clip-path: polygon(32px 0, 80px 0, 112px 16px, 0 16px)` |
| `.bot-neck` | `1214,356 48×44` | radius 2px；border `rgba(216,243,246,.64)` |
| `.bot-lip` | `1212,346 52×10` | `rgba(216,243,246,.62)` |
| `.bot-cork` | `1216,332 44×14` | `rgba(246,215,154,.52)` + border `.72` |
| `.bot-l1` | `1191,420 3×96` | `180deg rgba(228,247,252,.82) → .14` |
| `.bot-l2` | `1287,420 1×96` | `rgba(228,247,252,.34)` |
| `.slip` 纸条「代号」 | `1204,440 68×36` | `rgba(246,215,154,.18)` + border `.55`；`rotate(-4deg)`；font `12.5px / letter-spacing .18em / line-height 36px / center / rgba(246,215,154,.95)` |
| `.wave` 声波 | `1216,264 45×48` | 7 根 `width:3px` `rgba(127,209,217,.55)`，heights：`10,22,38,16,30,12,6`（left 0,7,14,21,28,35,42） |
| `.contact` 接触亮水皮 | `1182,516 112×7` | `180deg .06 → .46@48% → 0`（`rgba(203,238,246,…)`） |
| `.rip.a` 涟漪 | `1163,513 150×13` | `border:1px rgba(203,238,246,.32)` 圆 |
| `.rip.b` 涟漪 | `1190,516 96×8` | border `rgba(203,238,246,.2)` |
| `.refl` 倒影容器 | `1182,520 112×190` | mask `180deg #fff 0% → .62@58% → .14 100%` |
| `.refl .rb/.rs/.rn/.rl/.rc` | 112×104 / 112×16 / 48×44 / 52×10 / 44×14 | 镜像版玻璃；`.rs` clip `polygon(0 0, 112px 0, 80px 16px, 32px 16px)`；`.rl rgba(203,238,246,.16)`；`.rc rgba(246,215,154,.22)` |
| `.refl .rslip`「账号」 | `22,24 68×36`（相对 refl） | `rgba(246,215,154,.1)` + border `.34`；`rotate(4deg)`；`12.5px / .18em / 36px / rgba(246,215,154,.66)` |

## 5. 文字层 `<main>`（`z-index:3`）

### 5.1 左上干区 `.l-dry`（`left:152 top:92 width:528`）

React：`<section className="l-dry">` → cat / h1 / standfirst / rule / h2.block / rows。

| 块 | 逐字文案 | 排版 |
| --- | --- | --- |
| `.cat` | `内袋说明书 · INNER SLEEVE INSERT` | `11px; letter-spacing:.24em; color:rgba(243,249,250,.5)` |
| `h1` | `设置` | `margin-top:12px; 58px; weight 700; line-height:1; letter-spacing:.01em` |
| `.standfirst` | `这一版只保留最小设置：看看匿名规则、退出登录、确认页面版本。` | `margin-top:16px; width:500px; 14.5px; lh 1.85; color:var(--muted)` |
| `.rule` | — | `margin-top:26px; height:1px; var(--line)` |
| `h2.block` | `匿名的边界` | `17px; 700; lh 1.3; padding-bottom:11px; border-bottom 1px var(--line)` |
| `.rows` | — | `margin-top:14px`；`.row` grid `40px 1fr`，`padding:17px 0`；`.row + .row` 顶边 `1px rgba(243,249,250,.08)`；`.row p` `15.5px; lh 1.85; var(--paper)`；`.num` `14px; rgba(203,238,246,.5)` |

**三条边界（原文必须逐字保留）：**

1. 一 — `每支瓶子一个独立代号（同一瓶里大家看到的是同一个）`（`.num`＝`一`）
2. 二 — `别人拿不到你的账号，只能看到代号与你的声音`（`.num`＝`二`）
3. 三 — `账号只用于认领你自己的漂流瓶与漂流日志。`（`.num deep`＝`三`，`.num.deep { color:rgba(243,249,250,.36) }`，位于 `.l-wet`）

### 5.2 水线图例（2 条，绝对定位于 `<main>`）

| 块 | 文案 | 样式 |
| --- | --- | --- |
| `.cap.up` | `水面之上 · 别人看得到的` | `left:152; top:488; 11px; letter-spacing:.2em; color:rgba(203,238,246,.62)`；`::before` 短线 `left:-16 top:6 10×1`，`rgba(203,238,246,.5)` |
| `.cap.dn` | `水面之下 · 只有你自己知道的` | `left:152; top:540; 11px; .2em; color:rgba(169,199,207,.7)`；`::before` `rgba(243,249,250,.28)` |

### 5.3 图版小注 `.tiny`（2 条）

`11px; letter-spacing:.16em; color:rgba(243,249,250,.5)`：

- `你的声音` @ `left:1213 top:238`
- `倒影 · 账号与邮箱` @ `left:1182 top:718`

### 5.4 左下湿区 `.l-wet`（`left:152 top:552 width:528`，节奏收紧）

收紧规则：`.rows margin-top:0`；`.row padding:12px 0`；`h2.after margin-top:24px`；`.who margin-top:14px`；`.alt margin-top:8px`；`.hr margin-top:18px`；`.act margin-top:14px`。

| 块 | 逐字文案 | 样式 |
| --- | --- | --- |
| `.rows` 1 行 | 边界三（见上） | 同 `.row`，序号用 `.num.deep` |
| `h2.block.after` | `当前身份` | 17px/700/lh1.3；padding-bottom 11px；border-bottom var(--line)；margin-top 24px |
| `.who` | `未登录`（前缀 `<i class="tick">`） | `margin-top:14px; flex; 19px; weight 700`；`.tick` `2×19; background:var(--coral); margin-right:11px` |
| `.alt` | lbl=`已登录态`，v=`已登录：代号（邮箱）` | `margin-top:8px; flex gap:12px`；lbl `11px/.2em/rgba(243,249,250,.42)`；v `12.5px/rgba(243,249,250,.42)` |
| `.hr` | — | `margin-top:18px; 1px; var(--line)` |
| `.act` | 按钮 `登出` + note | grid `auto 1fr; gap:22px; margin-top:14px` |
| `.btn` | `登出` | `padding:9px 17px; 13px; color:var(--paper); bg transparent; border 1px rgba(243,249,250,.26); radius 2px; letter-spacing:.04em; white-space:nowrap` |
| `.act .note` | `登出只清掉这台设备上的会话，别人不会因此看到你的瓶子。` | `12.5px; lh 1.75; color:var(--muted)` |

### 5.5 右上干区 `.r-dry`（`left:760 top:92 width:380`）

| 块 | 逐字文案 | 样式 |
| --- | --- | --- |
| `h2.block` | `伴奏与授权` | 17px/700/lh1.3；padding-bottom 11px；border-bottom var(--line) |
| `.body` | `曲库伴奏为 CC BY 4.0 授权（署名义务），点开查看完整署名与许可条款。` | `margin-top:12px; 13.5px; lh 1.8; var(--muted); text-wrap:pretty` |
| `.btn` | `查看署名与许可` | 同 `.btn`；`margin-top:14px`（`.r-dry .btn`） |
| `h2.block.after` | `关于` | `margin-top:30px`（`.h2.after`），其余同 h2.block |
| `.ver`（契约版本行） | lbl=`契约版本`，v=`0.2.0-s1` | `margin-top:14px; flex baseline; gap:14px`；lbl `11px/.2em/rgba(243,249,250,.5)`；v `18px; letter-spacing:.04em; class="mono"`（Quattrocento tabular-nums） |
| `.env` | `录音只在 https 或 localhost 下可用（浏览器策略）；局域网 IP 访问时录不了音不是页面故障。` | `margin-top:14px; 12.5px; lh 1.75; var(--muted); text-wrap:pretty` |

## 6. React 结构总览（建议）

```tsx
<div className="settings-stage clip">        {/* 1440×900, aria-hidden 装饰层 */}
  {/* platter / glint / air / sea / shaft / grooves-wet / surf */}
  {/* leaf: leaf-dry, leaf-wet, tide, film, leaf-top, dogear,
          crease-shl, crease-shr, crease, crease-soak,
          wick{mid,lf,rt}, hole>i */}
  {/* wline + 6×i 反光；rip a/b；contact；瓶身 8 块 + slip「代号」；
      wave 7 条；refl（rb/rs/rn/rl/rc + rslip「账号」）；wav×3；bub×3 */}
</div>
<main>
  <section className="l-dry">  {/* 眉标 / h1 / 导语 / rule / 匿名的边界 / 边界一二 */} </section>
  <p className="cap up">水面之上 · 别人看得到的</p>
  <p className="cap dn">水面之下 · 只有你自己知道的</p>
  <p className="tiny">你的声音</p>
  <p className="tiny">倒影 · 账号与邮箱</p>
  <section className="l-wet"> {/* 边界三 / 当前身份 / 未登录 / 已登录态行 / hr / 登出+note */} </section>
  <section className="r-dry"> {/* 伴奏与授权 / CC BY 4.0 / 查看署名与许可 / 关于 / 契约版本 0.2.0-s1 / env 提示 */} </section>
</main>
```

## 7. 关键值速查（最易抄错）

1. 画布/纸张：`1440×900`；`.leaf = 1232×796 @ (104,52)`；角切 `clip-path: 30px`（左上）；水线 `y=520`；纸内干湿分割 `y=468`（干 468 / 湿 328）。
2. 三条边界原文：`每支瓶子一个独立代号（同一瓶里大家看到的是同一个）` / `别人拿不到你的账号，只能看到代号与你的声音` / `账号只用于认领你自己的漂流瓶与漂流日志。`
3. 文字字号栈：`11px(.16–.24em 字距) 小注` → `14.5px 导语` → `15.5px 边界正文` → `17px h2` → `18px 契约版本` → `19px 身份` → `58px h1`；主透明度档：`.5 / .42 / .36 / .32 / .26 / .13`（rgba 243,249,250 基）。
