# 主题化第三批（t46）：母题扩面 + 水缓缓流动

> 用户第十四轮回话：「**还要更明显：其他页面也加水与瓶子，并加水缓缓流动**」。
> 本批两件事：**（一）扩面**到 `/me`、`/settings`、`/new`、作品详情**内容区**、各页**空状态**；**（二）水流漂移**（走 `motion` 契约 + `reduced-motion` 静止）。
> 硬边界全程未破：装饰一律 `absolute` + 零布局高度（宿主 `relative` + `isolate`，装饰 `z-underlay`）；一屏 1440/375 各 12/12 `EXIT=0`；正文对比度 ≥4.5:1（实测）；不动路由/IA/文案；色板零改动；无新依赖/图片/字体；禁 emoji。

---

## 1. 「一页一项」对照表（每页放了什么 + 为什么是这一种）

| 页面 | 本批放的母题 | 为什么是这一种 |
| --- | --- | --- |
| `/river` 河道 | 深底两面板：**水面光带 + 水位线**；页头**潮线**（t44 已有，未改） | 河道是"入口水面"：两个面板是深水，光带给"从水面往下看"的纵深 |
| `/sea` 公海大厅 | **整面水位线（带漂移）** + 顶部 220px 水面带 + 页头**漂流瓶(64px)** + **潮线** + **浪线**；空态**漂流瓶(72px)** | 全站唯一叫「海」的页：整面水 + 一只漂着的瓶子；浪线是"海面"最直接的符号 |
| `/sea/:id` 作品详情 | 深底页头（光带 + 水纹 + 潮线，t44）+ **内容区整面水位线（带漂移）** | 内容是"在水下听"：深底页头 + 内容区缓流，读起来像一个水域而不是白纸 |
| `/bottles/:id/log` 漂流日志 | 页头**漂流瓶(52px)** + **航迹虚线** | 日志是"一段经过"：航迹（断续水痕）比潮线更贴语义 |
| `/me` 我的 | **整面水位线（带漂移）** + 页头**潮线** + **漂流瓶(52px)** | "我的瓶子"就该有一只瓶子；潮线作为页头与列表的边界 |
| `/settings` 设置 | **整面水位线（带漂移）** + 页头**潮线** + **漂流瓶(52px)** | 与 `/me` 同族（都是账号/个人域），保持手感一致 |
| `/new` 选歌 | **漂流瓶(36px)**（既有，本批核实并纳入守卫） + 空态母题 | 选歌是"投出第一棒"：瓶子出现的位置与"投瓶"动作对齐 |
| `/admin` 审核台 | **整面水位线** + 页头**潮线**（**不放瓶子**） | 审核台是工具页：给它"同一个水面之下"的归属感，但**不摆瓶子**（这里不是"我的瓶子"） |
| `404` | **搁浅的漂流瓶(64px)** + 潮线 | 空状态最需要母题：404 页是"这条水路不存在"，用一只搁浅的瓶子讲这件事 |

> 判据落到机器：`water-motif.test.tsx` 的 `t46 扩面` 组逐页断言「至少一处母题」；另断言
> **用整面水层（`WaterTexture`/`WaterSheen`）的页面宿主必须含 `isolate`** —— 少了它，`z-index:-1` 的装饰会掉到宿主背景**之下**而完全看不见（t43 踩过）。

---

## 2. 水缓缓流动（本批难点）

### 2.1 契约先行（`DESIGN.md` 的 `motion:` 块，含产品理由）

```
driftDuration: 24000ms   # 24s 一个来回的一半（配 alternate）—— 慢到不引人注意
driftShift: 10px         # 横向位移幅度（±10px）—— 小到只"感觉到"而不是"看到"
```
产品理由（已写进 `DESIGN.md`）：**这一版的主题就是「水」，而静止的水面看起来像贴图**；让水线以极慢、极小幅度横向流动（洋流），页面才"活着"。
三层同步：`DESIGN.md` `motion:` → `theme.css` `--motion-drift-duration` / `--motion-drift-shift` → `motion.css` `:root` 工作变量 `--drift-*`（并**纳入既有 drift guard**：`tokens.test.ts` 的配对表 +2）。

### 2.2 实现（只动 `transform`，且**必须是 CSS 动画**）

`water.css`：
```
@keyframes ocean-drift {  from { transform: translate3d(calc(var(--drift-shift) * -1), 0, 0); }
                          to   { transform: translate3d(var(--drift-shift), 0, 0); } }
.water-drift { animation: ocean-drift var(--drift-duration) ease-in-out infinite alternate;
               margin: calc(var(--drift-shift) * -1); }   /* 平移会露边 ⇒ 先按同一 token 出血（静态声明） */
```
`wave.tsx`：`WaterTexture` 增加 `drift?: boolean` 开关；`sea` / `profile` / `settings` / `sea-detail` 四页的整面水层开启。

**为什么"必须是 CSS 动画"**：`motion.css` 有一条通用重置
`*, *::before, *::after { animation: none !important }`（在 `@media (prefers-reduced-motion: reduce)` 内）——
**CSS 动画会被它冻住；JS/WAAPI 会绕过它**。所以守卫里除了"是 CSS 动画"，还断言 `water.css` **不得出现 `.animate(` / `requestAnimationFrame`**。

### 2.3 旧条文替换（不许两份规则并存）

`DESIGN.md`「水域母题层」硬约束③：
- 旧：**「③ 本层不含任何动画（静态纹理），因此 reduced-motion 下无需额外降级（若将来加漂移，…）」**
- 新：**「③ 含一条低幅度常驻漂移（water drift，t46 起生效）：参数取 `driftDuration`(24s)/`driftShift`(±10px)，只动 `transform`、由 CSS 动画实现（因此被全局 reduced-motion 重置冻结为静止）…」**

守卫断言 `designMd` **不含**「本层不含任何动画」且**含**「低幅度常驻漂移」。
（**过程留痕**：我第一次替换时在新条文里写了「t46 取代旧条文「本层不含任何动画」」—— 把旧句子又留在了契约里，**被自己的守卫抓红**，随后把该措辞彻底移出。这正是"两份规则并存"的典型形态。）

---

## 3. ⭐ TDD：先红后绿（两批各自的原始输出）

### 3.1 批次 A（扩面）

```
（第一次红：9 failed —— 但**这是我的守卫自身的 bug**，不是真实信号）
  × river-page / sea-page / sea-detail / drift-log / profile / settings / song-picker / admin / not-found 至少一处母题
根因：我在 python heredoc 里写 `\\b`，被吃成**控制字符**（退格）进了 TS 正则 ⇒ 正则要求"母题名后跟一个退格"。
修法：改成 includes 断言（无正则）。

（修好守卫后的红：4 failed —— 这次是真的信号）
  × profile-page.tsx 至少一处母题
  × settings-page.tsx 至少一处母题
  × admin-page.tsx 至少一处母题
  × not-found-page.tsx 至少一处母题
 Tests  4 failed | 26 passed (30)

（实现后）
 Tests  30 passed (30)
```

### 3.2 批次 B（漂移）

```
（先写守卫，亲眼看它红）
  × DESIGN.md 的 motion 块登记了漂移时长与位移
  × theme.css 暴露 --motion-drift-* 契约值
  × 漂移是 CSS 动画（受全局 reduced-motion 重置管辖），且只动 transform
  × 至少 3 个页面真的用了漂移（不是写了没人用）
  × 旧硬约束③已从 DESIGN.md 删除，且新条文在位
 Tests  5 failed | 32 passed (37)

（实现后）
 Tests  37 passed (37)
```

### 3.3 反向控制：reduced-motion 守卫**能真的区分**

```
（临时移除 motion.css 的全局 `animation: none !important`）
  × motion.css 的全局 reduced-motion 重置覆盖所有动画（漂移因此静止）
AssertionError: 缺通用 animation: none !important（漂移会漏网）
 Tests  1 failed | 36 passed (37)

（还原后）
 Tests  37 passed (37)
```
⇒ 这条守卫不是"永远点头"：它精确地在"漂移会漏网"时变红。

---

## 4. 对比度实测（PIL，采样前先打印整行颜色分布）

方法（吸取 t44 的教训：**先看分布，再选采样带**）：
在 `after-theme3-1440/sea-1440.png` 上逐行扫描 `x=620..1380`、`y=166..194`，打印每行的**不同颜色数**与最暗像素：

```
  y=166 颜色数=40 最暗#C2D8DF        ← 这一行是**浪线**（WaveDivider, text-lagoon/60）的边缘，不是水纹
  y=168/170/172/176/… 颜色数= 1 最暗#F3F9FA = token wave-white   ← 只有底色（水线之间）
  y=174 颜色数=29 最暗#E8F5F6        ← 水纹行
  y=186 颜色数=28 最暗#E8F5F6        ← 水纹行
  y=192 颜色数=41 最暗#E1F0F3        ← 水纹行（本页最深的水线合成）
```

| 被测 | 背景（实测像素） | 对比度 | 判定 |
| --- | --- | --- | --- |
| 正文 `slate-current #44646F` | **水线合成 `#E1F0F3`**（水纹行最暗） | **5.45:1** | ✅ ≥4.5 |
| 正文 | 底色 `#F3F9FA`（水线之间，正文实际所处） | **5.99:1** | ✅ ≥4.5 |
| 页头 `h1` `abyss #07202B` | 水线 `#E1F0F3` | **14.36:1** | ✅ ≥3（大字） |
| （对照）正文 | 浪线 `#C2D8DF` | 4.30:1 | ⚠️ **不是水纹**：该色来自 `WaveDivider`/`mist` 描边，正文不落在其上 ⇒ 不构成正文对比问题 |

**结论**：水线加深到 0.09 后，正文在**最坏情形（正好压在水线上）**仍为 **5.45:1 ≥ 4.5**；水线之间是 5.99:1。
`#C2D8DF` 那 4.30:1 的读数属于"浪线/描边"这条**另一类元素**，t44 曾把它误当水线，本批已用"整行颜色数"把它区分出来。

---

## 5. 三条门 + 一屏（原始输出）

```
$ pnpm -r test
packages/shared test:  Test Files  22 passed (22)      Tests  242 passed (242)
apps/api test:         Test Files  19 passed (19)      Tests  180 passed (180)
apps/web test:         Test Files  65 passed (65)      Tests  594 passed | 1 skipped (595)
TEST_EXIT=0

$ pnpm -r typecheck
apps/api typecheck: Done
apps/web typecheck: Done
TC_EXIT=0

$ pnpm lint
$ eslint .
LINT_EXIT=0

$ pnpm --filter @music-drift/web exec vitest run \
    src/design-system/__tests__/water-motif.test.tsx src/design-system/__tests__/motion-contract.test.tsx
 Test Files  2 passed (2)
      Tests  54 passed (54)          ← water-motif 37 + motion-contract 17
```

一屏（真实浏览器，自建可抛弃环境，截图写入 `after-theme3-1440/`、`after-theme3-375/`）：
```
1440×900：12/12 OK   ✅ 全部页面达标（桌面口径：一屏装下）      EXIT=0
375×812 ：12/12 OK   ✅ 全部页面达标（手机口径：无横向滚动…）   EXIT=0
```

**⚠️ 375 上我造成过一次红，并已修复（如实记录）**：
```
FAIL /settings  height=1101  settings-attribution=823 ← 锚点下沿 823 > 812
```
根因：我给 `/settings` 页头加了 `pb-[12px]`（+12px），而该页在 375 下**原本只剩 ~1px 余量**（改前实测 811）。
修法：去掉 `/settings` 页头的 `pb-[12px]`（潮线是绝对定位，贴页头下沿即可），并在该处留注释说明为什么这里不能加 padding。
修后重跑：**375 与 1440 均 12/12 `EXIT=0`**（本文档所有一屏数字都来自这次重跑）。
⇒ 遗留风险（登记）：`/settings` 在 375 下余量极小（≈1px），**任何再往该页加高度都会顶破硬门**；若要给它加内容，必须先压缩既有间距。

---

## 6. 本批的 skill 依据（沿用前两批已核对的条款）

- `motion-web` §1 decoration 三条件（有产品理由并能写进设计文档 / 不争夺注意力 / `reduced-motion` 下可静止）——本批漂移**逐条对照**：理由写进 `DESIGN.md`「静止的水面像贴图」；24s±10px 属"低幅度低速度"；reduced-motion 下被全局重置冻住。
- `motion-web` §3「动画属性**只允许** `transform` 与 `opacity`」——漂移只动 `transform`（守卫断言关键帧里不得出现 `width/height/top/left/margin/padding`；`.water-drift` 里的 `margin` 是**静态**声明、不在动画属性里）。
- `motion-web` §8「动效必须可验证」——本批把"CSS 动画 + 全局重置覆盖"写成了断言 + 反向控制。
- `css-animation-creator` 第 5/6 条（只用 transform/opacity；**每一条**动画都要尊重 reduced-motion）——同上。
- `ui-ux` / `afrexai` 的对比度条款（`Minimum 4.5:1 ratio for normal text`、`| 4.5:1 minimum | Normal text (<18px) | AA |`）——§4 的实测口径。

---

## 7. 未做 / 遗留（明确登记）

1. **深底页尚未开漂移**（河道两个深底面板、公海与详情的深底页头）：本批只让**浅底整面水层**流动；若也要动，用同一对 token 即可（但要另做一屏与对比度复核）。
2. **`/settings` 375 余量 ≈1px**：见 §5 的风险登记。
3. **用户说「别折腾」的项**：页头潮线与航迹的 ~10px 间距 —— 本批**没有碰**。
4. **静帧截图证明不了动效**：漂移是否"看着舒服"需要真机/录屏；本批的可断言部分（存在性、属性白名单、reduced-motion 覆盖、无 JS 驱动）已有守卫。
5. **工具坑（留给下一位）**：用 python heredoc 往 TS 里写含反斜杠的正则会**静默写坏**（`\b` 变退格、`\s` 报 warning）；本批两次红都源于此。**写守卫请用 `includes` 断言**，或改用 `write` 工具直接落文件。
