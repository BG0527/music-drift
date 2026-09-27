# 实施计划：把 record-v1 定稿实现为真实前端

> 用户裁决（2026-09-23）：**现在就把 11 页定稿实现为项目真实前端**；**先不改后端**；
> **现在就做响应式**（不再把 375 推后）；**授权重写 `DESIGN.md` 契约**（连带 theme.css / tokens.ts / motion.css / 守卫）。
>
> 本计划遵守 AGENTS.md：阶段③之后逐片走 红→绿→重构（阶段④）、每片停下等用户验收（§6）、
> 改守卫必须显式列出（§4/§5）。

## 0. 三条硬约束（先说清，否则会翻车）

1. **设计稿是 1440×900 固定画布、绝对定位；真实前端必须是响应式的。**
   所以这不是"翻译像素"，而是**保留语言与装置、重排布局**：375 不横向溢出、多列网格 768px 以下折单列、可点目标 ≥44px、**页面不得内联 hex**。
2. **契约是唯一真相，且被机器守卫。** `tokens.test.ts` 把 `DESIGN.md` 的 front matter `colors:` 当唯一真相
   （形状固定 `  名字: "#RRGGBB"`、要求 ≥30 条、含 `success-tint` 等键），并断言 **theme.css 不得出现色板外的 hex**。
3. **不能大爆炸换色板**：现有 12 个页面大量使用旧 token 类名（`text-abyss` / `bg-wave-white` / `text-slate-current` …）。
   一次性换名会让**整个 app 编译不过**。迁移策略见 §2。

## 1. 新契约（record-v1）要写什么

### 1.1 色板（≥30 条，保持 front matter 机器可读形状）
| 组 | token | 值（来自 11 页实测） |
| --- | --- | --- |
| 基底 | `ink` | `#050F14` |
| 文字 | `paper` / `muted` | `#F3F9FA` / `#A9C7CF` |
| 强调（唯一） | `coral` | `#D4553A` |
| 暖光 | `warm` | `#F6D79A` |
| 冷光 | `glass` | `#7FD1D9` |
| **水光冷色族**（实测高频手写值，本次收成 token） | `water-light` / `water-mid` / `water-deep` / `water-void` | `#EAFCFF` / `#CBEEF6` / `#E4F7FC` / `#031117` |
| 边界线 | `line` | `#D8F3F6`（岸线用）/ 及 `rgba` 派生规则写在正文 |
| 语义四件套 | `success` / `warning` / `danger` / `info` + 各自 `-tint` / `-border` | 深底适配（现有 tint 是浅色底用的，必须重算） |
| 过渡别名（迁移期） | 旧名保留并**re-point 到新值** | 见 §2 |

### 1.2 其余契约
- `rounded`：**基准 12px → 2px**（新语言：`0 / 1px / 2px / 4px / 999 / 50%`）。
- `typography`：保留字体（LXGW WenKai + Quattrocento）与既有命名档；字号按实测阶梯收敛（56/58 hero、17、15、12.5、11 + `.24em` 元信息）。
- `layout`：`containerMaxWidth 1280`（1440 − 2×76 ≈ 1288 ✓ 保留）、`mobileFloor 375`、`collapseBreakpoint 768`、`touchTargetMin 44`（**不变**）。
- `z-index` / `motion` / `spring`：**沿用现有值不动**（动效语言不是本次变更对象），只补一条新语言规则：
  **装饰零动效**（母题层不做动画），动效只用于状态过渡且只动 `transform`/`opacity`。
- 新增 `motif` 组：platter（盘面沟槽：周期/线宽/alpha）、glint（掠光）、waterline（水线）、ripple、bottleMark。

### 1.3 **必须显式列出的守卫改动**（用户要求逐条可见）
| # | 文件 | 改动 | 为什么必须改 |
| --- | --- | --- | --- |
| G1 | `design-system/__tests__/tokens.test.ts` | 「rounded 基准 12px」那条断言的期望值 → **基准 2px** 的新档位 | 新语言的圆角纪律就是 0/1/2/4/999/50%，12px 基准已不存在 |
| G2 | 同上 | 色板必需键（`success-tint`/`warning-tint`/…）**保留断言不变**，只换值 | 语义四件套仍需要，且在深底上要重算 |
| G3 | 同上 | `theme.css`「不得出现色板外 hex」断言**保持不变**（这是它的价值） | 迁移期别名必须指向色板内已有的值，不得新写 hex |
| G4 | `pages/__tests__/design-discipline.test.ts` | **不放宽任何一条**；375 规则现在生效 | 用户已裁决"现在就做响应式" |
| G5 | 各页既有测试（`bottle-page.test.tsx` 等 106 个文件） | 随对应页面切片更新（每片单独列出） | 页面重做后断言会变，属预期 |

## 2. 迁移策略：别名过渡（保证每片结束时代码都能编译）

1. **S1** 在色板里同时提供**新名**与**旧名别名**：旧名（`wave-white` / `abyss` / `slate-current` / `peacock` / `sea-glass` / `ocean` 系）
   **re-point 到新值**（语义同角色映射：`wave-white`→`ink` 底、`abyss`→`paper` 正文…）。此时 app **仍能编译**，但观感开始变。
2. 之后每片把该页的类名从旧名换成新名。
3. **S8** 删除全部别名，并给守卫加一条：**不得再出现旧名**（防止回潮）。

## 3. 切片（每片：红 → 绿 → 重构，然后停下等验收）

| 片 | 内容 | 主要文件 | 验证命令 |
| --- | --- | --- | --- |
| **S1** | 契约底座：DESIGN.md v2 + theme.css 重写（新色板 + 别名）+ tokens.ts 同步 + motion.css 对齐 + 守卫 G1 | `DESIGN.md`、`design-system/theme.css`、`tokens.ts`、`motion.css`、`__tests__/tokens.test.ts` | `pnpm --filter @music-drift/web test`、`pnpm -r typecheck`、`pnpm lint` |
| **S2** | 母题与组件层：`water.css`/`wave.tsx` 重做为 platter/glint/groove/waterline/ripple/bottleMark；`Button`（圆盘+外环）/`Card`/`Tabs`/`Input`/`EmptyState`/`Nav`/`Icon` 按新语言重做；`showcase` 更新 | `design-system/*`、`showcase/*` | 同上 + 打开 showcase 目视 |
| **S3** | **河道页**（标杆，含捞/投圆盘泊位、默认态无瓶、无段号） | `pages/river-page.tsx` + 其测试 | `pnpm --filter @music-drift/web test`、`node apps/web/tools/one-screen-check.mjs --viewport=1440x900`、375 检查 |
| **S4** | 瓶子详情（录制/接力/三选一/放回）+ 选一首歌 | `pages/bottle-page.tsx`、`song-picker-page.tsx` | 同上 |
| **S5** | 公海大厅 + 公海作品详情 | `pages/sea-page.tsx`、`sea-detail-page.tsx` | 同上 |
| **S6** | 我的（**含回传提示 + 「等待操作」状态**，后端未支持故前端降级）+ 设置 + 404 | `pages/profile-page.tsx`、`settings-page.tsx`、`not-found-page.tsx` | 同上 |
| **S7** | 登录/注册 + 审核台（含非管理员态） | `pages/login-page.tsx`、`admin-page.tsx` | 同上 |
| **S8** | 收尾：删废弃别名 + 守卫加"禁旧名" + 清 docs 稿 + 更新 ADR/CONTEXT 连带项（回传通知的实现依赖、登录两项的有意偏离） | 多文件 | `pnpm -r test`、`pnpm -r typecheck`、`pnpm lint` 全绿 + 用户验收 |

## 4. 需要用户后续裁决的连带项（现在不改，先记账）

> **已裁决（captain，2026-09-23）**：登录/注册的字段数取 **方案 C**。
> 事实：设计稿与契约 §3 要求「只用账号 · 密码两项」（用户裁决），但**冻结的后端**是
> `LoginRequestSchema = { email, password }`、`RegisterRequestSchema = { handle, email, password }`（`packages/shared/src/contracts/auth.ts`），
> 且 `apps/api/src/routes/auth.ts` 只按 email 查用户 ⇒ **两个可见字段填不满注册**。
> 三个候选与代价：A 账号=邮箱（注册必然 400，不可用）／B 账号=邮箱 + handle 取邮箱 @ 前段（可用，但**发明了"用户名=邮箱前缀"这条业务规则且用户可见**）／
> **C 登录两项 + 注册三项（用户名 + 邮箱 + 口令）（选用：零发明、零后端改动）**。
> ⇒ 实现要求：仅在注册 tab 多一个「用户名」字段；把偏离**显式写进代码注释**；映射集中在 `submit()` 一处便于后端将来支持"账号登录"时一处切换。
> 若将来后端支持账号登录/去掉 handle，可回到"两项"。
1. **回传提示**需要后端新增通知类型（`BOTTLE_RETURNED`）与"待你操作"状态 —— 本轮前端只能按设计实现并**在前端降级**（无数据时不显示），**联调要等后端**。
2. **登录去掉邮箱**是对源码/接口的有意偏离（契约 §3 已记），实现时要么改后端契约、要么保留字段但不出现在本页 —— 本轮按"不出现在本页"实现。
3. 河道页设计师稿里的三项契约欠账（旧珊瑚 / 无 `.clip` / 缺 `--warm`）在真实实现里**自然消失**（会用新 token 与容器重写）。

## 5. 每片的验收：实现 vs 设计稿（**装置必须存活**）

> 实现阶段最大的风险不是"做不出来"，而是**响应式重排把设计稿的记忆点做没了**。
> 所以每片除了"测试绿"，还必须证明**该页的装置还在、还读得出来**。

### 5.1 路由 ↔ 设计稿 ↔ 必须存活的装置（路由真值取自 `apps/web/src/pages/shell/routes.ts`）
| 路由 | 设计稿 | **必须存活的装置**（承担什么信息） |
| --- | --- | --- |
| `/river` | `f4-groove.png` | 被点亮的沟槽＝河道；两枚**错落圆盘泊位**（捞/投）；**默认态无瓶**（缺席可读） |
| `/new` | `p-songpicker-record.png` | **五口独立浅盆**：水位＝已切好的段位、**干盆＝"还没有切分"** |
| `/bottles/:id` | `p-bottle-record.png` | **横躺的玻璃瓶**：瓶内水位＝已录段数、干格＝缺口、漂着的瓶塞＝有人持有 |
| `/bottles/:id/log` | `p-driftlog-record.png` | **半沉螺旋刻痕**（每笔＝一条日志）+ **只有最新一笔是湿的** |
| `/sea` | `p-sea-hall.png` | **静海水线 + 到岸的瓶**；涟漪内圈 4 段断弧＝4 个段位 |
| `/sea/:id` | `p-sea-detail-record.png` | 沟槽＝时间轴（**唱针＝播放头**）+ 右端**岸与到岸的空瓶** + **倒影＝唱这一段的人** |
| `/me` | `p-profile-record.png` | 内袋身份卡 + **沉积柱**（4 层位＝4 段位）；**回传提示 + 「等你操作」**（回航泊位） |
| `/settings` | `p-settings-record.png` | **折页 + 水线切开"匿名的边界"**（线上别人看得到／线下只有你知道） |
| `/login` | `p-login-record.png` | **认领线**：代号牌 → 线 → 线那头只露一角瓶口 |
| `/admin` | `s2-admin-record.png` | **水线切开**浮上来的待处理／沉下去的历史裁决 + **真印章** |
| `notFound`（404） | `p-404-record.png` | **划伤跳针**：划痕横断标题、豁口写"这条水路不存在" |

### 5.2 每片的机器判据（全部要跑，缺一不可）
```bash
pnpm --filter @music-drift/web test      # 含该页的既有测试（改动要逐条列出）
pnpm -r typecheck && pnpm lint
node apps/web/tools/one-screen-check.mjs --viewport=1440x900 --shot=docs/ui-review/impl-1440
node apps/web/tools/one-screen-check.mjs --viewport=375x812  --shot=docs/ui-review/impl-375
```
- 桌面：整页高度 ≤ 视口高；**375：不得横向滚动 + 每页声明 `data-anchor` 的锚点必须在首屏内**（锚点缺失 = FAIL，不静默跳过）。
- ⚠️ `one-screen-check.mjs` 的**退出码口径是"反向控制是否成立"**（`--negative-control` 时 exit 0 = 守卫确实会红），不是"路由达标"—— 别把它的退出码读成通过与否，要看它打印的每路由结论。

### 5.3 captain 的额外一步（机器判不了的那一步）
每片实现完，captain 会把 `docs/ui-review/impl-1440/<route>.png` 与 `docs/ui-review/design-explore/<mockup>.png` **并排看**，逐条确认 5.1 表里的装置**还在、还能读**；
装置如果因为响应式重排而失效（例如"五口盆"被折成一列后水位映射读不出来），**这一片不算通过**，必须换一种在窄屏也成立的表达，或显式上报用户裁决。

### 5.4 每片完成后要更新的文件
- `docs/impl-plan-record-v1.md`：勾掉该片、记下与设计稿的**有意差异**（响应式重排导致的必然改动）。
- `docs/architecture.md`：本片的关键决策（例如某个装置在窄屏换了表达）。
- 若改了既有测试：**逐条列出**（原文 → 新文 → 为什么）。

### 5.5 设计稿的**精确值来源是 HTML，不是 PNG**（captain 修正，用户指出）

**用户指出**：每个页面都有对应的 `.html`（同目录、同名），读取它来复刻**更简单也更准**。
这是对的 —— captain 起初把任务书写成"用 `read_image` 看 PNG"，**PNG 是有损来源**（缩略 + 压缩），会丢精度。

**取值口径（之后的每份任务书都必须照此写）**：
1. **精确值一律从同名 `.html` 抄**：字号/字距/行高、颜色与透明度、圆角、渐变 stop、阴影、SVG 的路径与半径、以及**逐字文案**。
2. **PNG 只用于判断整体印象**：像不像、装置还在不在（§5.3 的并排复核）。
3. **HTML 给不了的三件事**（必须另找来源，不许拿 HTML 的 div 结构顶替）：
   - **响应式布局**：HTML 是 1440×900 绝对定位画布，重排是设计工作，不是抄；
   - **语义与无障碍**：用现有 React 实现里的 `button`/`label`/`aria`/焦点管理，不要照搬 div 堆叠；
   - **token 映射**：HTML 里是内联 hex/一次性透明度，必须映到 `DESIGN.md` 的 token（这正是 S1 收 `water-*` 一族的原因）。
4. **抄值不等于抄结构**：装置与视觉值要准；容器、栅格、折行必须是响应式的。

**对已在飞的 5 个 agent 的处理**：本会话 `send_message` 对 subagent 不可寻址，改不了它们的任务书 ⇒
它们交稿后 captain 会用 §5.5 的口径**逐值比对**（HTML 为基准）并把偏差打回；必要时用"精度对齐"补一轮。
第二波（公海两页、我的）**直接按 §5.5 派**。

## 6. 设计稿的 8 处内部不一致与**归一化裁决**（由 `_VALUES.md` 逐值抽取发现；待 S1b 落地）

> 来源：`docs/ui-review/design-explore/_VALUES.md`（sha256 `52ad12b1…434953`，3226 行，逐页抽出"选择器 → 精确值"）。
> 这些不一致**不影响观感判断**（所以人眼看图发现不了），但**会让实现到处是近似值** —— 必须归一化，否则 12 个页面会各自带一套近似色/近似字号。

| # | 实测不一致 | captain 裁决（归一化到哪个） |
| --- | --- | --- |
| 1 | **`--line` 全站不是契约的 line**：契约 `line=#D8F3F6`（`rgba(line,.055~.13)`），实际 10 页写 `rgba(243,249,250,.13)`（基色是 **paper**），f4 更写 `.16`（超出上界） | **统一用 `line`**：发丝线一律 `rgba(line, .055–.13)`。f4 已冻结 ⇒ 记为欠账（与它另三项同列） |
| 2 | **f4 的 `:root` 与其余 10 页两套**（旧珊瑚 `#c7452c`、`.16` 的 line、**缺 `--warm`**，页内又直接写 `rgba(246,215,154,.66)`） | f4 冻结不动，**欠账清单加一条"缺 --warm 且用字面暖值"**（原已记） |
| 3 | **h1 六个档位**：84 / 62 / 60 / 58 / 56 / **52（登录页）**；而 `_AUDIT` §6.2 写的带是"56–62、标杆 76–84" ⇒ **登录页 52 掉出带外** | **把带放宽为 52–62**（标杆 76–84 不变）。理由：页面已被用户验收为定稿，改数值会动已验收的观感；放宽带是更诚实的记录 |
| 4 | **同类小字标注两档字距**：`11px/.24em`（9 页 13 个选择器）vs `11px/.2em`（设置页 3 个） | **统一 `11px/.24em`**（绝对多数 + 契约 §1.6 已规定），设置页的三个归到 .24em |
| 5 | **同一种水光三套基色**：`#e4f9fc`(4 页) / `#e4f9ff`(审核台) / 契约 `#E4F7FC`；`line` 一族另有 4 个近似值 | **并入既有 token**：`#e4f9fc`/`#e4f9ff`/`#e6f7fb`/`#e6f8fb` → `water-deep`/`water-light`；`#d6f1f7`/`#d2f0f6`/`#d6f4fc`/`#cff0f7` → `line`；`#ceeef5`/`#c8f0fa`/`#a8e4ec`/`#dff3f7` → `water-mid` |
| 6 | **近黑碎片化**：5 页里十余个近黑（`#02080b`…`#051c26`）语义相同（沟槽底/水底/背光） | **归一成 4 档**：新增 `water-abyss #02080B`（最深）→ 既有 `water-void #031117` → `ink #050F14`（页面基底）→ `water-bed #0A303C`（水下底面）。中间值按最近归入。**这是本轮最大的一处漂移，必须收** |
| 7 | **圆角除 50%/2px 外还有 8 种写法**，含**角向圆角**（`0 0 4px 4px`、`2px 2px 0 0` 等）—— 契约对此**没有条文** | **补条文**：圆角只许由允许档位（0/1/2/4/6/999/50%）组合而成，**允许角向组合**（如 `0 0 4px 4px`）；`23px` 用在 46px 高的胶囊上＝**半圆豁免**（radius = height/2），照旧允许 |
| 8 | **`rotate` 只出现在审核台（14 条内联），8 个印章角各不相同**，契约无 token | **补条文**：旋转**只允许用于"手工放置"的物件**（印章、卡片），`|angle| ≤ 3.5°`，取值只能来自 `_VALUES.md` 已登记的那一组离散角；**新代码不许写任意角度** |

### 6.1 另外两笔（`_VALUES.md` 附录 A 的 57 个未收进契约的颜色）
- **近失配（ΔRGB ≤ 6）一律并档**，不新增 token（见上 #5/#6）。
- **确实需要新 token 的**（材料与语义，建议名）：`cork`（软木塞 `#8A6A34`）、`lacquer-paper`（母版纸面 `#DBEEF2`）、`seal-ink #E8967C` / `seal-due #E8C07A` / `danger-light #F0B7A6`、`shoal #F0CC8E` / `strata #E2CD9E` / `cobble #96B0B4`、`water-abyss #02080B`、`basin-inner #0F4251`。
- ⚠️ **需要用户知情的两点**：① `cork`（棕）与 `shoal/strata`（沙）是**语言契约"只有五个色相族、不许新增色相"之外的材料色** —— 但**定稿画面上确实用了它们**（软木塞、沙滩沉积），所以按"**材料色例外**"处理并写进契约，而不是假装没有；② 近黑归一到 4 档会**轻微压平**原来逐页不同的深度层次（这是为跨页一致性付的代价，用户已把"跨页和谐"排在"单页主题"之前）。

### 6.2 S1b 的边界与顺序（**不要现在开工**）
- **必须等 S2 落地后**才能动 `design-system/**`（S2 正在改 theme.css / tokens.ts，同时改会撞车）。
- S1b 只改：`DESIGN.md`、`apps/web/src/design-system/{theme.css,tokens.ts}`（若需色板新条目）与相关守卫；**不动页面**。
- 完成后守卫仍须全绿：色板 ≥30 条、`theme.css` 无契约外 hex、每个 token 同值暴露。

## 7. S3 河道页 —— captain 裁决与后续两片

### 7.1 一个必须先讲清的事实：**是契约写错了，不是实现偷懒**
- 设计定稿 `f4-groove`（用户选定 "D"，已冻结）里，河道 = **一条被点亮的弧**（同心沟槽的唱片质感，斜穿右半张）。
- 但 `DESIGN.md` 的 `## Composition` 现在写的是「**一条水线横贯内容区**，岸在上、水在下」—— **与定稿矛盾**。
- 实现者照契约做，于是标杆页的河道退化成**横向亮槽**（它自己把这列为"最大弱点①"，并说明是"从设计系统取、不许各自重画"的守卫逼出来的）。
- ⇒ **裁决：弧是对的，契约这句要改**（契约必须向已验收的定稿对齐，而不是反过来）。

### 7.2 三个提问的裁决
| 问题 | 裁决 | 理由 |
| --- | --- | --- |
| Q1 接受横槽，还是补同心弧变体？ | **补弧**（母题层新增同心/弧线 groove 变体），河道页改用它；**横槽保留**给"需要一条横贯水线"的页面 | 河道页是**标杆**，用户的首要排序是"好看 > 跨页和谐 > 单页主题"；把标杆的记忆点换成"更正但张力小一档"的横槽，是本末倒置 |
| Q2 泊位等权还是按稿的 190/150 不等？ | **等权照旧**（两个泊位共用同一份尺寸定义＝守卫的原意），但**尺寸要按定稿的桌面分量放大**（稿上是 190/150，不是 110；375 再降档） | 守卫里的"等权"明确是"**两个泊位共用同一份尺寸定义**"（防有人只改一处失衡），**从没规定 110px**；110 是把"等权"误读成了"固定小尺寸"，代价是两枚泊位失去了画面分量 |
| Q3 要不要那个珊瑚标签盘？ | **不画**（同意实现者的默认） | 装置必须承担信息；默认态没有作品，标签盘无处承载身份 ⇒ 画了就是纯装饰，违反契约 |

### 7.3 后续两片（顺序不能颠倒）
| 片 | 内容 | 前置 |
| --- | --- | --- |
| **S2b** | 母题层补**同心/弧线 groove** 变体；统一 `<SurfaceLine>` → `<Waterline>` 的命名（守卫现在仍 pin 旧名，导致实现者保留旧名）；改 `DESIGN.md ## Composition` 那两句（河道＝被点亮的弧，不是横贯水线） | **必须等 S2 落地**（同一批文件，撞车） |
| **S3b** | 河道页改用弧变体；泊位尺寸放大到定稿的桌面分量（仍等权） | 必须在 S2b 之后 |

### 7.4 另外记两笔（S3 交付带来的）
- ✅ **一个冲突自动消解**：`water-motif.test.tsx` 原来要求河道页必须有 `<DriftingBottle`，与用户"默认态无瓶"的裁决冲突；**S2 已把它改成禁止**并留了原文→新文与理由 ⇒ 实现者一字节没碰 design-system。
- ✅ **`apps/web/dist` 被 build 覆写**：已核 `git ls-files apps/web/dist` = 0、`.gitignore` 含 `dist/` ⇒ **无害**（构建产物不入库）。
- ⚠️ 并发期全量测试会红，且**红在别人正在改的文件上**（本例 4 条：login/404 的 design-discipline、record-v1 的 shadow-card、report-queue 的印章色）—— 这是并行的必然现象，**不是回归**；判定以"该片自己的守卫"+"收工后 captain 串行全量"为准。

## 8. 全量落地批次执行记录（2026-09-27，S4/S5/S6/S7 收尾 + 复核 + 联调）

> 用户裁决（本批开题 grill 九问）：① 公海详情**删除**、时间轴移植瓶子详情（沿 §17）；② 登录/注册**对齐 `{account,password}`**（去邮箱）；③ **全量**=剩余页+已做 8 页复核+联调；④ 375/1440 **双档硬门**；⑤ 端到端核心闭环联调；⑥ f0 捞/投分镜落地；⑦ 一屏硬门优先于密度（改构图不砍装置）；⑧ **一次交付**（覆盖 §6 分片停等）；⑨ 后端缺陷直接修。

### 8.1 交付构成（10 个并行子任务 + 整合者集成）
| 任务 | 内容 | 状态 |
| --- | --- | --- |
| A3 | 公海大厅 record-v1（静海水线+六瓶+涟漪 4 断弧；「听」跳 `/bottles/:id`） | ✅ 13/13 |
| B | 我的 record-v1（内袋身份卡+沉积柱+`awaitingMyAction` 回传提示三态） | ✅ 16/16 |
| C2 | **删公海详情**（路由/页面/测试归零）+ 沟槽时间轴+唱针移植瓶子详情（groove-timeline/playback 新建） | ✅ 128/128 |
| D | 登录/注册对齐 `{account,password}`（无邮箱框；请求体断言改写 9 处红→绿） | ✅ 14/14 |
| E | f0 捞/投三段分镜（enter→ripple→exit 状态机、播完再跳转 §103.3、reduced-motion 全静止） | ✅ 17/17 |
| R1 | 设置/404/审核台逐值复核（22 组值修正；审核台新增真实页脚计数） | ✅ 152/152 |
| R2c | 漂流日志逐值复核（9 组修正，刻痕语法表逐值照稿） | ✅ 5/5 |
| R3+S-min | 选歌逐值清单（70 条落盘 `apps/web/docs/review-songpicker.md`）+ 三处硬伤修复（沟槽半径梯 88.3/75/58.1/32.4、检索牌挂片「找 歌」、页脚线按 DESIGN 无条文删除） | ✅ 39/39 |
| P1 | `/me` 一屏压缩：两区分栏（列表窗 260px 内滚+内袋卡 470px / 通知+内袋口） | ✅ 双档 OK、101/101 |
| P2 | `/bottles/:id` 一屏压缩：<1024 以 `order` 把时间轴排到操作区后（lg 归位、装置不删）、gap/页头收紧 | ✅ 双档 OK、70/70 |

### 8.2 整合者修的 9 条守卫红（全部显式记录）
| # | 守卫 | 原断言 → 新处置 | 依据 |
| --- | --- | --- | --- |
| 1 | water-motif「公海作品页深底页头光带」 | **删除该 it** | sea-detail 页已按用户 §17 删除 |
| 2 | water-motif PAGES 含 `sea-detail-page.tsx` | **从名单移除** | 同上 |
| 3 | water-motif「作品详情深底页头 drift」（含 `darkSurfaceDrifts` 函数） | **删除 it + 未使用函数**（留注释） | 同上；防 TS6133 |
| 4-6 | water-motif 公海大厅 3 条（母题/整页水位线/空态瓶）+「≥3 页 drift」 | **sea-page.tsx 补回** `WaterSheen tone=light + WaterTexture drift + BottleMark×2 + TideLine`（不改守卫） | 母题是用户点名资产；页级静海线也更贴设计稿 |
| 7-8 | design-discipline 2 条（nowrap / min-h-11） | **sea-page 链接改走 `TEXT_LINK`**（常量更名 `SEA_TEXT_LINK`） | 不改守卫 |
| 9 | 死链 2 处 + 回传文案缺失 | `collections-panel` 与 `notification-labels` 的 `/sea/:id` → `/bottles/:id`（断言先红后绿）；**新增 `BOTTLE_RETURNED` case**（label「收到回传 · 等你操作」/warning/详情链接瓶子详情） | §17 删除后落点唯一化 |
| 附 | one-screen-check 路由表 | 移除 `/sea/:id` 行（`seed.seaId` 保留供 `/sea` 列表） | 同上 |

### 8.3 机器门禁（收工串行复跑，全部以本批最终字节为准）
- `pnpm -r test` **EXIT=0**：shared 250 / api 180 / **web 796 passed | 1 skipped**；
- `pnpm -r typecheck` **EXIT=0**；`pnpm lint` **EXIT=0**（0 error，10 条 no-console warning 全在站外 files）；
- `node apps/web/tools/one-screen-check.mjs --viewport=1440x900` → **✅ 全部页面达标（12 路由）exit 0**；
- 同 `--viewport=375x812` → **✅ 全部页面达标 exit 0**；
- `node apps/web/tools/golden-path-live-check.mjs`（hermetic）→ **✅ 28 步全过 exit 0**（真库+真 HTTP+真音频字节：注册→发起→录段→Range→投河→捞→接唱×3→回传→入海→公海→日志→代号→放回→409→斩浪门槛）。

### 8.4 有意差异与遗留（逐条可追溯）
1. **涟漪时长**：§103.3「约 1.2s」 vs f0 图例 2.4s 矛盾 ⇒ **用户裁决（2026-09-27）：先按 f0 2.4s 交付看效果**（点击到跳转 3.1s 总时长，现状即此）；两文档矛盾记为待修；收拢幅度 15% 缺契约 token 记账。
2. **bottle 页 h1**：**用户裁决→已修**：恢复 `3.5rem`(56px)（h1 带 52–62、与 drift-log 一致），一屏余量改由外层 `gap-3→gap-2` 补回；`bottle-page.test` 新增断言钉住（红→绿），双档门禁复跑全绿。
3. **印章语义色缺 token**（`seal-ink/seal-due/danger-light`，§6.1 已建议）：审核台现就近映射 danger/warm；**用户裁决：记账，下轮 S1b/frontend-ds 收编**（本轮不动 DESIGN.md，避让并行工作流）。
4. **口令 vs 密码**：**用户裁决→已统一**：`AUTH_ERROR_MESSAGES`（INVALID_CREDENTIALS/WEAK_PASSWORD）、web `errors.ts` 兜底、`docs/api.md` 码表两行全部改「密码」；shared 新增反潮断言（文案表不得含「口令」，红→绿）。`passwordPolicy.ts` 等**代码注释**里的「口令」属内部用语，不面向用户，保留。
5. `DESIGN.md` h2 阶梯 19px vs 设置稿 17px：按「HTML 为准」实现 17px，契约阶梯待 frontend-ds 记账（同 §6#3 方式）。6. `/me` 桌面通知 ≥2 条时下排可能再顶破 900（hermetic 种子只 1 条）→ 若真数据复现，加 `lg:max-h + overflow` 一行。
7. `/bottles` 桌面余量仅 12px；「还有 N 段看不到」提示渲染时约 +50px 会再红 → 联调留意。
8. 移动端 bottle 整页变高（时间轴/页脚 order 下移，1993px）——手机口径不测总高，取舍在案。
9. 被斩 vs 未唱在沉积柱不可分（契约 `missingSegmentIndexes` 合并两者）→ 契约加字段才可还原，记 architecture 待办。
10. 河道页 `river-motion.css` 收拢涟漪复用 ocean-ripple 反向 15% 幅度；退场 easing/瓶子行程距离均复用现有 token（缺专属 token 清单见 E 汇报）。
11. **浏览器级点击流未覆盖**（录音/上传按钮的真浏览器交互）：jsdom 测试 + 黄金路径 API 真链路 + one-screen 真浏览器渲染三层合起来作证据；纯浏览器 click-through e2e 不在本仓工具链内。

### 8.5 §5.3 并排看图复核结论（captain，2026-09-27；`docs/ui-review/impl-1440/*.png` vs 设计稿 PNG）
| 页 | 装置判定 | 说明 |
| --- | --- | --- |
| 公海大厅 | ✅ 存活 | 水线/到岸瓶/涟漪 4 断弧/两 Tab/游标分页俱在；**有意差异**：设计稿的整页连续静海线在响应式栅格里落成「顶部水带 WaterSheen + 每卡一段水线」（A3 自评已记录，连续线在可滚动多行栅格下无法成立于画布外） |
| 我的 | ✅ 存活 | 四块构图与稿对齐（列表窗+内袋卡 / 通知+内袋口）；沉积柱 4 层位、中心孔空白标签盘在图上可读 |
| 瓶子详情 | ✅ 存活 | 顶部沟槽时间轴+唱针（移植成功，即用户点名的"进度条"）+ 横躺瓶剖面并存、语义分工清晰；一屏内 |
| 选一首歌 | ✅ 存活 | 五口浅盆+水位、检索牌挂片「找 歌」、沟槽半径梯逐档值在图上成立 |
| 河道/设置/审核台/日志/登录/404 | ✅ | 分别由 S3/S3b 既往验收、R1/R2c 逐值复核（红→绿）与本轮双档门禁背书 |

## 9. 一比一返工批次（2026-09-27 第二轮用户裁决 → 执行记录）

> 用户裁决（覆盖 §8 的「响应式重排」解释）：**完全按照 .html 一比一复刻、删侧边栏、页面上方同主题导航栏（河道/公海/我的/设置）、全站动线打通、动效按 motion-web skill 持续优化、所有页面不滚动即可完整展示**。spec 已按此重录。

### 9.1 交付构成（subagent 并行 + 整合者亲手，全部红→绿）
- **10/10 页逐块照抄**：河道(f4)、公海(p-sea-hall)、我的(p-profile)、瓶子(p-bottle+沟槽时间轴)、选歌(p-songpicker)、漂流日志(p-driftlog)、设置(p-settings)、登录(p-login)、审核台(s2-admin)、404(p-404)；每页块清单落盘于 `apps/web/docs/review-*-blocks.md`（river 另有 `review-river-diff.md`）。
- **shell**：侧边栏/底栏删除 → 页面上方常显 top-nav（四入口+管理员审核台、fixed 零布局、全局含登录/404=G5）。
- **动线**：flow-audit.md 九缺口 G1–G8 全清（选歌返回键+登录链、瓶页成功下一步、公海回河道、审核台出口+activeNavKey、我的常显出口、设置出口、顶栏覆盖登录页）；返回键语汇统一「回河道」。
- **分页**：`total` 全栈（shared 可选字段 → api count → 前端 ceil 全显 + >7 折叠 + 无 total 回退）。
- **动效**：motion-plan.md 37 条，阶段1（设置/登录/我的+全局）+ 阶段2（其余 7 页+my-bottles stagger）落地；`motion-apply.test.tsx` 28 断言；阶段3（skill 直装进阶）4 次派发全灭于读入，未交付（top-nav 微动效另试）。
- **一比一终修（整合者亲手）**：河道双横线删除（flowline/SurfaceLine，稿全页无水平线）+ 泊位绝对坐标骑弧（draw 60,400 / cast 380,580、错落 180px、cap 下沉 40/165，md 画布 clamp(440,31.9vw,470)）；/me 1031→876 且 overflow-x:clip；瓶子 bottle-action 锚点+375 order 让位+桌面收紧；sea-list 锚点零高透传层；**等待接力点不进去真凶=全屏 ul.fleet 压住 zones tablist（树序 z-auto 命中）→ `.zones{z-index:1}` + 层叠钉子断言**。

### 9.2 本批守卫改动（全部显式，原文→新文见各测试注释）
| # | 守卫 | 改动 | 依据 |
| --- | --- | --- | --- |
| 1 | water-motif 公海四组件断言 | → 稿级结构（.clip/.surface/.rings/.fleet/.lowtide） | 逐块照抄 p-sea-hall |
| 2 | water-motif MOTIF_TAGS | 追加稿装置标记（clip/waterlight/backdrop/data-device/basin-graphic），旧五标签保留 | 照抄批次母题形态扩展 |
| 3 | water-motif 空态瓶 | 公海=lowtide、选歌=BottleMark 或空态行 | 稿空态本无瓶 |
| 4 | water-motif drift≥3 | 名单改真实用户 [river,settings]≥2；**回升路径=motion 应用阶段恢复 ≥3** | 稿是静态 mock，组件级漂移仅存两页 |
| 5 | water-motif 河道水线构件 | → f4 照抄结构（backdrop/data-device=river 六层） | 旧三组件按稿删除 |
| 6 | water-motif 泊位等权 | → 稿 190/150 不等大（fluidMax 断言） | 用户「一比一」覆盖旧解读 |
| 7 | river f0 flowline 断言 | 常驻漂移虚线删除、断言反向钉「无横线」；reduced-motion 清单同步 | 用户「河道中间多了一条」 |
| 8 | river 旧错落机制断言 | md:mt- → md:absolute+top-[180px] | 泊位骑弧重定位 |
| 9 | sea-page 层叠钉子（新增） | zones z > fleet z + 控制组点击→路由 | 等待接力命中修复防回潮 |
| 10 | App.test 顶栏、songpicker 空态/文案、login 照稿结构、settings 照稿结构等 | 随照抄裁决更新（各文件内注释有原文→新文） | 返工令 |

### 9.3 收口门禁（最终字节上的串行结果）
- `pnpm -r test` EXIT=0：shared **254** / api **180** / web **923 passed | 1 skipped**（70 文件）。
- `pnpm -r typecheck` EXIT=0；`pnpm lint` EXIT=0（0 error，警告全在站外 no-console）。
- `one-screen-check` **1440×900 ✅ 12/12 全部达标 exit 0**；**375×812 ✅ 全部达标 exit 0**。
- 看图复核：河道 vs f4-groove.png 并排——页中无横线、泊位骑弧错落一致；（§5.3 其余页见 docs/ui-review/impl-1440/ 截图）。

### 9.4 遗留/裁决项（本批新增）
1. 沟槽带桌面 92→64px（瓶子门禁向压缩，窄屏仍 92）——DESIGN 记账待裁。
2. motion-plan 阶段3（skill 直装进阶）与 Modal 退场/日志 hover-lift/审核行 stagger/选歌确认 4 条——方案条目改写或契约补退场类后补。
3. 一比一之下仍**保留的有意差异**：河道 WaterTexture/LightShafts/场景涟漪（非线状装饰，t47 drift 契约亦需 WaterTexture）、选歌触控 44px 扩边、印章色 token（§8.4-3 仍挂）。
4. subagent 派发层后期大面积静默死亡（读入超限+环境），河道/设置/登录/选歌/404 与全部终修由整合者亲手完成；报告类任务（A 阶段落盘协议）5/5 存活，已成标准拆法。