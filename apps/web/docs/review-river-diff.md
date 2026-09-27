# 河道页 vs f4-groove 稿 · 线条与泊位 diff（只读比对，未改代码）

- 稿：`docs/ui-review/design-explore/f4-groove.html`（251 行，1440×900 静态画布）
- 现页：`apps/web/src/pages/river-page.tsx`（601 行）
- 稿的「河道区域」= r900 那条**弧形水槽**一族（稿 173–181 行）+ 唱片沟槽纹理；**稿全页没有任何横贯直线**（除 footer chips 的 border）。
- 比对基准：现页 backdrop SVG（river-page.tsx 338–345 行）与稿 173–181 行**逐参数一致**（26/7/887/913 + 两道虚线 16·30 / 10·40），六层水槽本身没问题；嫌疑全部落在水线以下 `river-body` section 的**额外装饰层**。

---

## ① 「中间多的一条」嫌疑清单（稿没有、现页有）

| # | 元素 / 类名 | 位置（行号） | 形态 | 稿中对应 | 判断 |
| --- | --- | --- | --- | --- | --- |
| 1 | `<span class="river-flowline passage-drift">` | river-page.tsx:425（`data-river-decor` 内，`top-[62px] md:top-[87px]`） | **横贯虚线**：高 2px，`repeating-linear-gradient(90deg)` 14px 实 / 24px 空，opacity .4，左右出血 ±passage-shift，46s 往返漂移（river-motion.css:17–27） | 无（稿河道区只有 r900 弧，无任何水平线） | **应删**（它是常驻横贯线，最像「中间多的一条」；f0 裁决若必须留则**应缩**到 arc 贴合/透明度近 0） |
| 2 | `<SurfaceLine className="top-0">` | river-page.tsx:417（section 顶） | **横贯实线**：`.surface-line` inset-x-0，两端渐隐，注释自称「全页唯一一条横向实线」（water.css:170；wave.tsx:215–223） | 无（稿没有岸/水水平分界，分界靠盘面明暗） | **应删**（次一号真凶；与 #1 叠在同一区域，两条平行横线最容易读成「多出来的一条」） |
| 3 | `<RippleRing>` ×2 | river-page.tsx:426–431（`bottom-[20px] left-[30%]` 160×56；`bottom-[12px] right-[24%]` 96×34，后者 `river-scene-delay` 错拍） | **椭圆涟漪环**（周期缩放的圆环，非直线） | 无 | **应删**（f0 场景装饰；若 f0 裁决保留则**应缩** alpha） |
| 4 | `<LightShafts>`（`.water-lights`） | river-page.tsx:420 | **多条 104° 斜向细条纹**（2px 亮 / 102px 空 repeating + 下渐隐 mask） | 无（稿的光只有 `.light` 一层掠光 + 环光，都在 backdrop） | **应缩**（降到近乎不可见）或删；它在水体里造出「一排斜线」 |
| 5 | `<WaterTexture drift>`（`.water-texture`） | river-page.tsx:419 | 水纹**重复纹理**（非单条线，drift 动画平移） | 无（稿的面纹理只有唱片沟槽 field/center，且被 radial mask 圈在盘上） | **应缩**（alpha 收到 0）或删 |
| 6 | `<WaterSheen>`（`.water-sheen`） | river-page.tsx:418 | 水面**渐变光带**（非线） | 无（稿只有 platter/body/light 三层，都在 backdrop） | **应缩**或删 |
| 7 | `<FlowVessel>` + `<Ripple>` gather 涟漪 | river-page.tsx:437–469（`top-[102px] md:top-[151px]`，仅 `flow !== null` 时挂载） | 瓶 + 收拢涟漪（一次性动效） | 无（静态稿） | **保留**（非常驻；f0 裁决 + 硬约束③只禁常驻瓶） |

> 备注：稿注释里反复点名的旧疾「一条穿过正文的边线」= rim 均匀外缘线，稿已用 y 渐隐修掉，现页 `river-rim`（316–320、332 行）已同样渐隐，**不是**本次嫌疑。

---

## ② 泊位对照表

### 稿（f4-groove.html 233–242，绝对定位）

| 泊位 | left | top | 尺寸 | 错落方向 | cap |
| --- | --- | --- | --- | --- | --- |
| `.port.draw` 捞取 | **60px** | **400px** | **190×190** | 基准（左、上、大） | `left:230px top:40px width:240`（盘**右侧**，比盘顶低 40px） |
| `.port.cast` 投下 | **380px** | **580px** | **150×150** | **右下**：x +320、y +180，小 40px 一档 | `left:-180px top:165px width:300`（盘**左侧伸出 180px**，且从盘顶下移 165px ⇒ cap 在盘**下方偏左**） |

外环：`.r1 inset:-13px` / `.r2 inset:-29px` / `.r3 inset:-45px`（稿 105–107）。

### 现页（river-page.tsx）

| 项 | 实现 | 行号 | 值 | 差异 |
| --- | --- | --- | --- | --- |
| 捞取尺寸 | `PORT_DRAW_SIZE` | 61 | `clamp(88px, 13.194vw, 190px)` × 同宽高，rounded-full | 上限 190 ✓；小屏缩到 88px（稿固定 190，**流式翻译，属允许差异**） |
| 投下尺寸 | `PORT_CAST_SIZE` | 62 | `clamp(72px, 10.417vw, 150px)` × 同宽高 | 上限 150 ✓；小屏 72px |
| 捞取容器 | `div data-port="draw"` | 481 | 在 `section data-anchor="river-draw"`（473）内，父 grid `md:grid-cols-2`（471） | **位置模型不同**：稿=绝对坐标骑在 r900 弧上；现页=两列 grid 文档流，**不保证骑在河道弧上** |
| 投下容器 | `div data-port="cast"` | 539 | `section … mt-4 flex flex-row-reverse md:mt-16`（534） | 错落幅度：稿 **垂直 +180px**；现页 **md:mt-16 = 64px**，方向同为「右下」但靠列宽实现，**错落被压小 116px** |
| 外环 | `<PortRings>` disc-ring/2/3 | 65–73，用于 482 / 540 | 位移由 `--motif-ring-*` 定（注释称 13/29/45） | ✓ 与稿 -13/-29/-45 对齐 |
| 捞取 cap | flex 列 | 514 | `md:w-[clamp(200px,16.667vw,240px)]`，与盘同行 `gap-4/md:gap-6` | 稿 `top:40px`（比盘顶低 40px）；现页 flex **与盘顶对齐**，无 40px 下沉 |
| 投下 cap | flex 列（row-reverse 在左） | 566 | `md:w-[clamp(240px,20.833vw,300px)]` | 稿 `top:165px`（cap 沉到盘下方）；现页 `items-start` **与盘顶对齐**，165px 下沉完全丢失 |
| 盘身/边 | `disc-core` + `disc-edge-cool/warm` + `ring-2 ring-foam` | 500–501 / 552–553，489 / 545 | 冷边 draw、暖边 cast，盘不填色 | ✓ 符合稿「盘身不填彩色」；`ring-2` 是现页焦点/边界装置，稿无（保留） |

**标注：最大差异 2 条**
1. **位置模型**：稿的两枚泊位是**绝对坐标骑在 r900 河道弧上**（60,400 / 380,580，垂直错 180px）；现页是 `md:grid-cols-2` 两列文档流 + `md:mt-16`（64px）——错落方向勉强一致，但**幅度少 116px，且完全脱离河道弧线**（稿注释「骑在那条被点亮的沟槽上」在现页不成立）。
2. **cap 垂直对齐**：稿两枚 cap 分别下沉 `top:40px` / `top:165px`（投下 cap 明显在盘下方）；现页 flex `items-start` 一律**与盘顶平齐**，两处下沉量全部丢失。

---

## ③ 其余结构差异速记（不动的部分只列一行）

- backdrop 五层（platter/body/center/field/light，285–293）+ 圆族 SVG（323–378）：与稿 §4/§5 逐参数一致 —— **不动**。
- 河道六层水槽 `data-device="river"`（338–345）：与稿 173–181 逐参数一致 —— **不动**。
- 擦痕弧 4 道 / 尘点 4 颗 / 转向箭头 + 「顺槽 · 33⅓」（348–378）：一致 —— **不动**。
- header B3/B4（383–411）：稿固定 `left:76 top:96` → 现页流式 flex；右上「参与记录」已删（稿无）✓。
- 泊位三圈外环 13/29/45：一致 —— **不动**。
- 错误出口：稿无重试块 → 现页只读 `role=alert`（582–590）+ 同位 aria-live（522/572）✓。
- footer（593–598）：稿 5 个 `.tag` chips（aria-pressed 单选）→ 现页 `MoodChips` 组件；`left/right 76` → `px-6/md:px-12`；公海链接用 `TEXT_LINK`。
- f0 分镜（vessel enter/ripple/exit，437–469）：稿是静态 mock，无对应 —— 按裁决保留。
- 交互态（hover scale / focus ring / disabled opacity，489–497）：稿无 —— 保留。
