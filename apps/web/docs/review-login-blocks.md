# 登录页块清单（来源：docs/ui-review/design-explore/p-login-record.html，全 176 行一次读完）

> 逐字文案全录；色值/透明度/字号/字距按记录稿原样抄录，未加工。
> 页面尺寸 1440×900；`body` 背景 `var(--ink)`=`#050f14`，文字 `var(--paper)`=`#f3f9fa`，字体 `'LXGW WenKai',serif`，`font-size:15px`，`line-height:1.6`。
> token：`--ink:#050f14`、`--paper:#f3f9fa`、`--muted:#a9c7cf`、`--glass:#7fd1d9`、`--coral:#d4553a`、`--warm:#f6d79a`、`--line:rgba(243,249,250,.13)`。

## 字段结构结论（先看这条）

**记录稿里只有「账号 + 密码」两个字段，没有邮箱框。** 图注逐字为：
`登录和注册都只用这两项：账号、密码。`
（注：记录稿呈现的是**注册态**——`注册` tab 带 `.on`，主按钮文案为 `注册并进入`，密码框 `autocomplete="new-password"`。）

---

## 0. 封套（页面外壳 / 背景层）

| HTML 块 | React 结构 | 关键样式（原样） |
| --- | --- | --- |
| `<div class="clip">` 内三块背景 | `<div className="clip">` 包 `<Platter/><Surface/><Glint/>`（或纯 CSS 背景层） | `.clip{position:absolute;inset:0;overflow:hidden}` |
| `.platter` | 静态背景层，无交互 | `repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px)` + `radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)` |
| `.glint` | 静态背景层 | `mix-blend-mode:screen`；`linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)` |
| `.surface` | 静态背景层 | `mix-blend-mode:screen`；`linear-gradient(164deg, rgba(203,238,246,.2) 0, rgba(203,238,246,.055) 19%, rgba(203,238,246,0) 43%)`；mask `linear-gradient(180deg, rgba(255,255,255,1), rgba(255,255,255,0))` |
| `<div class="page">` | 页面根容器 `<main className="page">` | `width:1440px;height:900px;padding:64px 96px 0;display:flex;flex-direction:column;z-index:2` |

## 1. 顶部落款（colophon）

- HTML：`<p class="colophon lbl meta">SIDE A · 未登录</p>`
- React：`<p className="colophon lbl meta">SIDE A · 未登录</p>`（定位 `position:absolute;left:1240px;top:88px`）
- 字体类：`.lbl{font-size:11px;letter-spacing:.24em;color:rgba(243,249,250,.5)}`；`.meta{font-family:Quattrocento,'LXGW WenKai',serif}`

## 2. 标题 + 导语

- `<div class="col">` → `<div className="col">`（`width:560px`）
- H1 逐字：`每一段旋律，<br />都在寻找下一个声音`
  - `font-size:52px;font-weight:700;line-height:1.1;letter-spacing:.005em`，颜色 `var(--paper)`（继承）
- 导语 `.lede` 逐字：`这是一个由歌声、回音和宿命组成的角落。<br />你只录一段，剩下的交给漂流。`
  - `width:500px;margin-top:16px;font-size:14.5px;line-height:1.85;color:var(--muted)`（`#a9c7cf`）

## 3. 认领线装置（右侧，`aria-hidden="true"`）

`<div class="device" aria-hidden="true">` → `<div className="device" aria-hidden="true">`，
定位 `position:absolute;right:96px;top:124px;width:364px;height:698px`。

| 块 | React | 逐字文案 | 样式 |
| --- | --- | --- | --- |
| `.tag` 代号牌 | `<div className="tag">` + 伪元素打孔 + `<b className="meta">匿名代号</b>` | `匿名代号` | `88×88px;border-radius:2px;border:1px solid rgba(243,249,250,.34);background:linear-gradient(168deg, rgba(243,249,250,.11), rgba(243,249,250,.025))`；打孔 `::before` 7×7px 圆 `border:1px solid rgba(243,249,250,.5);border-radius:50%;background:var(--ink)`，`left:50%;top:12px`；`b` 字号 `font-size:11px;font-weight:400;line-height:1.45;letter-spacing:.12em;text-align:center;color:rgba(243,249,250,.92);text-shadow:0 1px 0 rgba(5,15,20,.6)`，`top:30px` |
| `.thread` 认领线 | `<div className="thread" />` | — | `right:44px;top:208px;width:1px;height:464px;background:linear-gradient(180deg, rgba(203,238,246,.47), rgba(203,238,246,.56) 34%, rgba(203,238,246,.49))`（注释注明原 `.06/.44/.22` 最低 1.19:1 已弃，现值 ≥3.5:1） |
| `.devnote` 装置注 | `<p className="devnote">` | `线上那枚代号，是别人在瓶里看到的全部；线那头串着的瓶，只有你认领得到。` | `right:56px;top:224px;width:238px;text-align:right;font-size:11.5px;line-height:1.8;color:var(--muted)` |

## 4. 表单（tabs → 图注 → 字段行 → 按钮 → 誓词）

`<form class="col form">` → `<form className="col form">`，`display:flex;flex-direction:column;margin-top:56px`。

### 4.1 tabs（modes）

- 结构：`<div className="modes">` 包两个 `<button type="button">`，`display:flex;gap:26px`
- 按钮 1 逐字：`登录`（class `mode`，**未激活**）
- 按钮 2 逐字：`注册`（class `mode on`，**激活态**）
- `.mode`：`padding:0 0 8px;font-size:15px;font-weight:700;letter-spacing:.14em;color:var(--muted);background:transparent;border:0;border-bottom:1px solid rgba(243,249,250,.40);cursor:pointer`
- `.mode.on`：`color:var(--coral)`(`#d4553a`);`border-bottom:2px solid var(--coral)`

### 4.2 图注（tip）

- 逐字：`登录和注册都只用这两项：账号、密码。`
- `.tip`：`max-width:452px;margin-top:20px;font-size:12.5px;line-height:1.8;color:rgba(243,249,250,.54)`（注释：`.46` 实测 4.45:1 不足，提到 `.54` → 5.0:1 以上）

### 4.3 字段行 1：账号（记录稿处于 `.bad` 错误态）

```jsx
<div className="field f-handle bad">
  <label className="lbl meta" htmlFor="handle">账号</label>
  <input id="handle" name="handle" type="text" autoComplete="username"
         aria-invalid="true" aria-describedby="handle-err" />
  <p className="msg" id="handle-err" role="alert">
    <span className="code meta">HANDLE_TAKEN</span>　这个账号已被占用。
  </p>
</div>
```

- 标签逐字：`账号`（`.lbl`：11px / `letter-spacing:.24em` / `rgba(243,249,250,.5)`；`.meta`：Quattrocento 混排）
- 报错逐字：`HANDLE_TAKEN` + 全角空格 + `这个账号已被占用。`（`.msg{margin-top:8px;font-size:12px;line-height:1.7;color:var(--coral)}`；`.msg .code{letter-spacing:.14em;color:rgba(243,249,250,.56)}`）
- 输入框：`width:440px;height:32px;margin-top:8px;padding:0 1px 6px;font-size:16px;color:var(--paper);background:transparent;border:0;border-bottom:1px solid rgba(243,249,250,.40)`
- 间距：`.f-handle{margin-top:32px}`；`.field.bad input{border-bottom-color:var(--coral)}`

### 4.4 字段行 2：密码（`.bad .strong` 双态）

```jsx
<div className="field f-pass bad strong">
  <label className="lbl meta" htmlFor="password">密码</label>
  <input id="password" name="password" type="password" autoComplete="new-password"
         aria-invalid="true" aria-describedby="password-err password-hint" />
  <p className="msg" id="password-err" role="alert">
    <span className="code meta">WEAK_PASSWORD</span>　口令强度不够。
  </p>
  <p className="hint" id="password-hint">
    <span className="code meta">密码规则</span>　至少 8 位，同时含字母和数字。
  </p>
</div>
```

- 标签逐字：`密码`；报错逐字：`WEAK_PASSWORD` + 全角空格 + `口令强度不够。`
- 提示逐字：`密码规则` + 全角空格 + `至少 8 位，同时含字母和数字。`
  （`.hint{margin-top:6px;font-size:12px;line-height:1.7;color:var(--muted)}`；`.hint .code{letter-spacing:.14em;color:rgba(243,249,250,.5)}`）
- 间距：`.f-pass{margin-top:26px}`；`.field.strong input{border-bottom-width:2px}`（错误态 `border-bottom-color:var(--coral)`）

**没有邮箱字段**：全文只出现 `handle`（账号）与 `password`（密码）两个 input。

### 4.5 主按钮（act）

- 逐字：`注册并进入`
- `<button className="act" type="button">注册并进入</button>`
- 样式：`align-self:flex-start;margin-top:36px;width:238px;height:50px;font-size:15px;font-weight:700;letter-spacing:.05em;color:var(--ink);background:var(--coral);border:0;border-radius:2px;cursor:pointer`

### 4.6 誓词（oath）

- 逐字：`不用真名，不用露脸，只要一段声音。同一个瓶子里，不同的人看到的是不同的匿名代号。`
- 样式：`margin-top:40px;width:452px;font-size:13.5px;line-height:1.9;color:var(--muted)`

## 5. 瓶口 svg（`.mouth`，`aria-hidden="true"`）

`<svg class="mouth" width="196" height="28" viewBox="0 0 196 28" fill="none" aria-hidden="true">`，定位 `position:absolute;left:1184px;top:872px`。全部描边色 `#cbeef6`：

| 元素 | d/参数 | 描边透明度 | 注释角色 |
| --- | --- | --- | --- |
| path | `M96 20 L84 28` | `.50` | 瓶肩（左外） |
| path | `M168 20 L180 28` | `.46` | 瓶肩（右外） |
| path | `M92 24 L78 28` | `.44` | 瓶肩（左内） |
| path | `M172 24 L186 28` | `.42` | 瓶肩（右内） |
| ellipse | `cx=132 cy=20 rx=36 ry=11`，`fill="rgba(3,14,20,.6)"` | — | 暗开口填充 |
| ellipse | 同上几何 | `stroke-opacity=".40"` | 口沿底描边 |
| path | `M96 20 A36 11 0 0 1 168 20` | `.6` | 近唇弧（叠后约 .58 亮） |
| path | `M168 20 A36 11 0 0 1 96 20` | `.3` | 远唇弧（叠后约 .76 暗） |
| path | `M132 22 L132 28` | `.46` | 口里的线头 |
| circle | `cx=132 cy=22 r=2.4` | `.66` | 结 |

源码注释逐字要点：非文本图形 ≥3:1，每条描边对盘面最亮条纹 `rgba(22,37,42)` 不低于 3.4:1——瓶肩 .50/.46、内壁 .44/.42、口沿底描边 .40（单独 ≥3.2:1，与两段唇弧叠成 近唇 .58 / 远唇 .76）、线头 .46、结 .66；暗开口不靠填充，靠冷光轮廓被读成"洞"。

## 6. 页脚（foot）

- 结构：`<div className="foot">` → `<div className="row">` 内三个子块
- `.foot`：`margin-top:auto;padding-bottom:12px;border-top:1px solid var(--line)`（`--line:rgba(243,249,250,.13)`）
- `.row`：`max-width:1100px;display:flex;align-items:baseline;gap:20px;padding-top:14px`
- 标签逐字：`已登录态`（`.lbl meta`，11px / .24em / `rgba(243,249,250,.5)`）
- 说明逐字：`你已经登录为「你的代号」，不用再登录一次。`（`.said{font-size:13px;color:var(--muted)}`）
- 链接逐字：`直接去河道捞一个瓶子`（`.go{margin-left:auto;font-size:14px;color:var(--glass)`=`#7fd1d9`;`text-decoration:underline;text-underline-offset:5px}`，href 为 `#`）

## 7. 全局字体引用（head @import，落地时需对应字体资源）

- `lxgw-wenkai-webfont@1.7.0` 的 `lxgwwenkai-regular.css` 与 `lxgwwenkai-bold.css`
- `@fontsource/quattrocento@5.3.0` 的 `400.css` 与 `700.css`
- `.mono`：`font-family:Quattrocento,serif;font-variant-numeric:tabular-nums`（记录稿正文未见使用 `.mono` 实例）

## 8. 逐字文案总表（无遗漏）

1. `SIDE A · 未登录`
2. `每一段旋律，` / `都在寻找下一个声音`
3. `这是一个由歌声、回音和宿命组成的角落。` / `你只录一段，剩下的交给漂流。`
4. `登录`、`注册`（tabs）
5. `登录和注册都只用这两项：账号、密码。`
6. `账号`、`HANDLE_TAKEN　这个账号已被占用。`
7. `密码`、`WEAK_PASSWORD　口令强度不够。`、`密码规则　至少 8 位，同时含字母和数字。`
8. `注册并进入`
9. `不用真名，不用露脸，只要一段声音。同一个瓶子里，不同的人看到的是不同的匿名代号。`
10. `匿名代号`（代号牌）
11. `线上那枚代号，是别人在瓶里看到的全部；线那头串着的瓶，只有你认领得到。`
12. `已登录态`、`你已经登录为「你的代号」，不用再登录一次。`、`直接去河道捞一个瓶子`

> 说明：文中 `　` 为全角空格（U+3000），与记录稿一致。
