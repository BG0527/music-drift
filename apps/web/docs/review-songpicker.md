# song-picker-page.tsx vs 设计稿 p-songpicker-record.html 逐值比对

- 设计稿：`docs/ui-review/design-explore/p-songpicker-record.html`（357 行，固定 1440×900）
- 实现：`apps/web/src/pages/song-picker-page.tsx`（447 行）
- 方式：只读逐值比对，未改任何代码、未跑测试/检查、未读 PNG。
- 判定：**一致** / **偏差**（期望值 vs 现值 + 建议）/ **待核对**（需看本文件之外的 token 或全局组件才能定）。
- 汇总：共 70 条 —— 一致 26、**偏差 39**、待核对 5。

## A. 页头

| # | 项 | 设计稿期望值 | 实现现值 | 判定 | 建议 |
| --- | --- | --- | --- | --- | --- |
| A1 | 眉标 cat「SIDE A · 未刻」 | 11px / letter-spacing .24em / paper 50% | `text-[11px] tracking-[0.24em] text-paper/50` | 一致 | — |
| A2 | h1 | 56px / 700 / line-height 1 | `md:text-[3.5rem] md:leading-none font-bold`（3.5rem=56px） | 一致 | 小屏 32px 档是合理响应式扩展 |
| A3 | 眉标 → h1 间距 | 22px（`h1{margin-top:22px}`） | `gap-2` = 8px | 偏差 | 改 22px（或 `mt-[22px]`） |
| A4 | h1 → 副标间距 | 16px（`.sub{margin-top:16px}`） | `gap-2` = 8px | 偏差 | 改 16px |
| A5 | 副标 sub | 15.5px / 1.75 / max-width 820px / muted | `text-[0.96875rem] leading-[1.75] max-w-[820px] text-muted`（0.96875rem=15.5px） | 一致 | — |
| A6 | 副标文案逐字 | 「…前移）。你录第 1 段…」（无空格） | 源码「…前移）。 你录第…」渲染多半角空格 | 偏差 | 删掉 JSX 里「）。」后的空格 |
| A7 | 右侧计数组间距 | `gap:38px` | `gap-6` = 24px | 偏差 | 改 38px |
| A8 | 计数数字 | 26px / glass 色 | `text-[1.625rem] text-glass`（26px） | 一致 | — |
| A9 | 数字 → 标签间距 | `margin-top:8px` | `gap-1` = 4px | 偏差 | 改 8px |
| A10 | 数字在上、标签在下 | `.n` block 在前、`.cat` 在后 | `flex-col-reverse`（dd 上、dt 下） | 一致 | — |
| A11 | 计数来源与位置 | 写死 4/1，绝对定位于右上 (76,56) | 数据驱动、空库时隐藏，header flex 排布 | 一致 | 数据驱动是合理增强 |

## B. 检索牌（plate）

| # | 项 | 设计稿期望值 | 实现现值 | 判定 | 建议 |
| --- | --- | --- | --- | --- | --- |
| B1 | 牌子容器 | 844×44px / border-radius 2px / bg `rgba(243,249,250,.035)` / padding 0 16px | 无固定宽高 / `p-3`(12px) / `bg-paper/[0.035]` / `rounded-base` | 偏差 | 高度固定 44px、水平 padding 16px；bg ✓ |
| B2 | 「找 歌」挂片 tab | 悬于牌子上沿 (left 18 / top -16, 高 17px)，无下边框，11px/.24em cat 样式，文字「找 歌」（含空格） | 普通内联 `label`「找歌」（无空格），14px `text-muted`，无挂片形态 | 偏差 | 最显眼缺失：恢复挂片 + 11px/.24em + 「找 歌」 |
| B3 | 搜索框尺寸 | 320×30px | `flex-1 min-h-11`(44px) 自适应 | 偏差 | 高度 30px；宽可保留弹性但上限 ~320px |
| B4 | 搜索框边框/底色 | 仅底边框 1px `rgba(243,249,250,.24)`、透明底 | 四边框 `border-muted`、`bg-water-void` 实底 | 偏差 | 改为仅下边框 + 透明底 |
| B5 | 搜索框 focus | 底边变 glass、`outline:none` | `focus-visible:ring-2 ring-coral`（ring） | 偏差 | 按设计稿改底边变色（可保留可访问性 outline 策略但形态应是底线变色） |
| B6 | 搜索框其余属性 | 15px / placeholder=muted / `type=search` / aria-label「按曲名过滤曲库」 | 0.9375rem=15px / placeholder:muted / type=search / 同 aria-label | 一致 | — |
| B7 | 计数「曲库共 5 首」 | 11px + .24em cat 样式 | `text-[0.75rem]`(12px) `font-latin` 无 tracking；过滤时换成「匹配 x / y 首」 | 偏差 | 字号 11px + tracking .24em；匹配态文案可保留 |

## C. 状态区（无匹配 / 空态）

| # | 项 | 设计稿期望值 | 实现现值 | 判定 | 建议 |
| --- | --- | --- | --- | --- | --- |
| C1 | 无匹配 cat 标签 | 行首「无匹配」cat 标签（11px/.24em） | 无标签，整句一段 | 偏差 | 补 cat 标签 |
| C2 | 无匹配容器/字号 | dashed 边框、9px 14px padding、12.5px | `border-line/20` 实线、`px-4 py-[10px]`、15px | 偏差 | dashed 边 + 12.5px |
| C3 | 无匹配文案模板 | 「曲库里没有名字含「{词}」的歌，换个词试试。」 | 同一模板（`{keyword}` 插值） | 一致 | — |
| C4 | 空态形态 | 「空 态」cat 标签 + 单句 12.5px，dashed 块 | 标题「曲库还没准备好」+ 正文两行、BottleMark 图标、实线卡片、居中、无 cat 标签 | 偏差 | 至少补 cat 标签与 dashed/12.5px 口径；图标属实现扩展 |
| C5 | 空态文案内容 | 「曲库还没准备好——这一版还没有可选的歌。曲库接入后，这里会出现可以分成 4 段的曲目。」 | 同内容拆成标题 + 正文两句 | 一致 | — |

## D. 曲目行（bay）

| # | 项 | 设计稿期望值 | 实现现值 | 判定 | 建议 |
| --- | --- | --- | --- | --- | --- |
| D1 | 格/盆宽度 | bay 246px、盆外径 236px | `max-w-[260px]`、grid 自适应 | 偏差 | 盆上限改 236px（或 246px） |
| D2 | 歌名 | 17px / 700 / line-height 1.2 | `text-[1.0625rem]`(17px) `font-bold`，leading 未显式 | 一致 | 建议补 `leading-[1.2]` |
| D3 | 歌名上边距 | `top:11px` | `pt-4` = 16px | 偏差 | 改 11px |
| D4 | meta 字号/色 | 11.5px / `rgba(169,199,207,.92)` | `text-[0.71875rem]`(11.5px) `text-muted` | 一致 | 色差 α.92 vs token 1.0，可忽略 |
| D5 | meta 两行节奏 | m1 top38 / m2 top64（26px 节奏，绝对定位） | flex `gap-3` = 12px | 偏差 | 两行间距拉到 ~26px（或行高口径对齐） |
| D6 | 段数文案 | 「4 段」 | 「共 {n} 段」 | 偏差 | 去掉「共」或按设计稿统一 |
| D7 | 段/时长分隔线 | 1×10px、margin 0 9px、`rgba(243,249,250,.18)` | `w-px h-[10px] mx-[9px] bg-line/20` | 一致 | — |
| D8 | 时长列 | 「每段约 24 秒」；未切分行不显示时长 | 第一段 `durationMs` 取整渲染；`segments` 空时不渲染 | 一致 | — |
| D9 | 来源文案 | 「来源 incompetech-cc-by-4.0」（无冒号） | 「来源：{licensedSource}」（全角冒号） | 偏差 | 去掉冒号以逐字对齐 |
| D10 | 发起按钮高度 | 32px | `min-h-11` = 44px | 偏差 | 改 32px |
| D11 | 发起按钮形态 | 描边幽灵样式（border `rgba(243,249,250,.24)` + bg .03 + 12.5px + gap 7px） | `variant="primary"`（主按钮形态） | 偏差 | 改为描边次级形态；primary 实心与设计稿不符 |
| D12 | 发起按钮宽度/对齐 | 左对齐、内容自适应宽、padding 0 12px | `w-full justify-center px-4` | 偏差 | 改左对齐自适应宽（或说明改版理由） |
| D13 | 发起按钮字号 | 12.5px | `text-[0.8125rem]` = 13px | 偏差 | 改 12.5px |
| D14 | 麦克风图标 | 14×14、stroke-width 2 | `Icon size={16}` | 偏差 | 改 14 |
| D15 | 按钮 hover | hover 时边/字变 glass（`rgba(127,209,217,.55)`） | 依赖 Button 组件，本文件不可见 | 待核对 | 查 design-system Button |
| D16 | 禁用文案 | 「暂不可发起」 | 「暂不可发起」 | 一致 | — |
| D17 | 禁用样式 | dashed 边 `rgba(243,249,250,.14)` + 字 `rgba(169,199,207,.7)` | 随 Button `disabled`，本文件不可见 | 待核对 | 查 Button disabled 是否 dashed |
| D18 | 干盆理由 note 位置 | 按钮**下方**（left 14 / top 132 / width 218） | 按钮**上方**、无宽度约束 | 偏差 | 移到按钮下方并限宽 ~218px |
| D19 | note 字号/色/图标 | 12.5px / lh 1.5 / warm `#f6d79a`，**无图标** | 13px / lh1.5 / `text-warning` + AlertTriangle 16px | 偏差 | 12.5px；核对 warning 是否等于 `--warm:#f6d79a`；去图标 |
| D20 | 格顶边错落 | `.edge` top 依次 0/6/2/8/4px（刻意错落） | 全部 `top-0` | 偏差 | 恢复 0/6/2/8/4 错落 |
| D21 | 槽竖线亮度 | `rgba(243,249,250,.11)` → 76% 处消失 | `from-line/30`，`bottom-[24%]`（= 到 76%） | 偏差 | 30% → 11%；76% 高度 ✓ |
| D22 | 槽顶亮线 | 1px，`rgba(.34)→rgba(.05)` 横向 | `from-line/35 to-line/5` | 一致 | — |
| D23 | edge 渐变罩 | `.edge` 还有 58px 高的竖向渐变罩（.075→0） | 无此罩 | 偏差 | 补 58px 渐变罩 |

## E. 五口浅盆几何（SVG → CSS）

| # | 项 | 设计稿期望值 | 实现现值 | 判定 | 建议 |
| --- | --- | --- | --- | --- | --- |
| E1 | 盆整体框 | 236 : 206（118×2 + 壁 29） | `BOWL_BOX = aspect-[236/206]` | 一致 | — |
| E2 | 盆口比例 | 118 : 88.5 ≈ 4:3 | `BOWL_ASPECT = aspect-[4/3]` | 一致 | — |
| E3 | 盆口内缩 | mouth rx 113 / rim 118 → 每侧 2.1% | `MOUTH_INSET = 2.1` | 一致 | — |
| E4 | 盆壁下移 | 29/206 = 14.1% | `top-[14.1%]` | 一致 | — |
| E5 | 盆底下移 | 29/169.6 = 17.1% | `top-[17.1%]` | 一致 | — |
| E6 | 母版尺寸/位置 | 84/113 = 74.3%；中心 +17.1% → top 29.95% | `DISC_SCALE=74.3`、`DISC_TOP=29.95` | 一致 | — |
| E7 | 母版外圈描边 | `rgba(228,249,252,.38)` | `border-water-light/25` | 偏差 | 25% → 38% |
| E8 | 标签孔 | 3.7×2 / 84 → 8.8% | `h-[9%] w-[9%]` | 一致 | — |
| E9 | 满水水位 | 弧顶至盆底 149.6/169.6 = 88.2% | `FULL_WATER_PCT = 88.2` | 一致 | — |
| E10 | 水体色阶 | 4 stop：`#a8e4ec.24 → #7fd1d9.2 → #1d5f70.25 → #0a3a48.36` | 3 stop：`water-light/25 → glass/15 → water-surface/40` | 待核对 | 需对照 token 实值是否等价 |
| E11 | 水面弧形态 | 通宽椭圆弧：两端止于盆壁 (±113, y=20)、弧顶 y=-64.8 | `rounded-t-full` 体育场形（顶部中段平直、两端下弯） | 偏差 | 用椭圆弧（如 SVG border-radius `50% / …` 或 inset 阴影）让弧跨满通宽 |
| E12 | 沟槽半径梯 | 74.2/63/48.8/27.2 ÷ 84 = 88.3% / **75%** / **58.1%** / 32.4% | 线性插值 = 88.3% / **69.7%** / **51.0%** / 32.4% | 偏差 | 改用设计稿逐档值；中间两道沟内偏 5.3 与 7.1 个百分点 |
| E13 | 沟线色梯度 | 母版上 .17/.15/.13；水面上 .22/.14/.12/.11 | 统一 dim `line/[0.13]`、crisp `line/30` | 偏差 | 按圈位给梯度（至少分 2 档） |
| E14 | 未切沟槽 | dashed（5 7 / 4 6）虚线 | `border-dashed border-line/20` | 一致 | dash 节奏由浏览器定，可接受 |
| E15 | 第 1 段珊瑚弧 | 沿沟 1 的**椭圆弧**、stroke 2.2、`rgba(212,85,58,.9)`、跨度 ±16.7 = 22.5% | **直条**、`h-[3px]`、`bg-coral`、宽 22.5%、top 5.85%（设计弧约 6.9%） | 偏差 | 宽度 ✓；改弧形、2.2px、位置对到沟 1 |
| E16 | 干盆微光 | `dryLight` 椭圆 (72×30, α.11) 局部提亮 | 整片 `bg-water-mid/10` 铺满盆底区 | 偏差 | 改为局部椭圆微光 |
| E17 | 干盆水位虚线 | dashed 弧标出水位本该到的地方（y=20 处） | `basin-expected-waterline` 88.2% 处 dashed 上边 | 一致 | 语义一致 |
| E18 | 五盆垂直错落 | 盆中心 y = 640/651/637/654/645（±8px 错落） | 全部底对齐（`mt-auto`） | 偏差 | 恢复逐盆 ±4~8px 错落 |
| E19 | 盆在格内位置 | bay top 366、盆居格中下部 | 格内流式、盆贴底 | 偏差 | 属布局策略差异；如需忠实需固定格高 430px |

## F. 页脚

| # | 项 | 设计稿期望值 | 实现现值 | 判定 | 建议 |
| --- | --- | --- | --- | --- | --- |
| F1 | 页脚字号/对齐/位置 | 12.5px、右对齐、right 76 / bottom 22 | 13px、左对齐、流式底部 | 偏差 | 12.5px；右对齐可随布局保留但字号应改 |
| F2 | 页脚文案 | 「发起之后你会拿到这支瓶子的匿名代号；别人看到的是代号，不是你的账号。」 | authed 时逐字相同；未登录时另一句 | 一致 | 未登录句为合理扩展 |
| F3 | 页脚分隔线 | 无（设计稿页脚无任何线） | `border-t border-line/20 pt-4` | 偏差 | 与设计稿冲突（实现注释称 record-v1 用 1px 细线）；需裁决去留 |

## G. 页面级 / 待核对

| # | 项 | 设计稿期望值 | 实现现值 | 判定 | 建议 |
| --- | --- | --- | --- | --- | --- |
| G1 | 背景装置 | `platter` 同心细纹 + `glint` 斜光 + `deep` 底部 200px 渐变 | 本文件未见 | 待核对 | 查全局 layout/theme 是否承接 |
| G2 | 字体 | 正文 LXGW WenKai；`.cat/.n/.meta/.st/.foot` = Quattrocento + tabular-nums | `font-latin` 与全局字体（定义在别处） | 待核对 | 核对 `font-latin` 是否 Quattrocento + tabular-nums |
| G3 | 整页布局 | 固定 1440×900 绝对定位（header 76/56、plate top236、rack top366） | 响应式 flex/grid 流式（xl 五格） | 一致 | 流式是合理适配，视觉锚点位置允许偏移 |

## 最重要的 3 条偏差

1. **E12 沟槽半径梯线性插值**：第 2/3 段沟槽落在 69.7%/51.0%，设计稿是 75%/58.1% —— 沟槽是"段位"的载体，位置错即读数错。
2. **D11/D10/D12 发起按钮整体形态偏离**：设计稿是 32px 高、描边幽灵、左对齐自适应宽、12.5px + 14px 图标；现实现为 `variant="primary"` + 44px + 全宽居中 + 13px + 16px 图标。
3. **B2/B4/B5 检索牌**：挂片「找 歌」标签整体缺失，搜索框从"320×30 仅底边框、focus 底边变 glass"变成"四边框 44px 实底、focus coral ring"——这是首屏最显眼的一块。
