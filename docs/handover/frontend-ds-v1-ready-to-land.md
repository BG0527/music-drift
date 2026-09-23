# V1 ready-to-land 规格 · frontend-ds（t33 审计 V1）

> **状态：未落地。** 规格已由 captain 全部批准，**只等前置条件解除**（见 §7）。
> 来源：`docs/ui-review/visual-audit.md` 的 **V1**（hero CTA 对比 2.05:1 < `DESIGN.md` L197/L403 要求的 3:1）+ captain 的 C2 裁定（2026-09-23）。
> 本文件写于 14:00 停机前，目的：**规格不能只存在于消息里**（本日已有两次会话中断，靠仓库交接文件才没丢上下文）。

## 0. 落地前置（硬条件，未满足前不要动 `pages/**`）

| 前置 | 状态 |
| --- | --- |
| `t32` 结束（其 inScope **含 `apps/web/src/pages/`** ⇒ 与本规格路径重叠，工具判重复、必须串行） | **未结束** |
| 用户发「继续」（14:00 停机后） | **未发生** |
| `DESIGN.md` 未变更（守卫表依赖色值） | 基线 md5 **`458b8c80b745e520f264de2b6e995b7f`**；**若已变更 → 先按 §4 重算守卫表** |

## 1. 精确落点（3 处 CTA；均已核到元素级）

| # | 文件 | 承板候选元素（现有内圈涟漪） | CTA 元素 | CTA 填充（实测） | CTA vs 面板 |
| --- | --- | --- | --- | --- | --- |
| 1 | `apps/web/src/pages/home-page.tsx`（hero，内圈在 `:82` 附近） | `<span class="absolute h-[100px] w-[100px] rounded-full border border-sea-glass/40 md:h-[130px] md:w-[130px]">` | `:90` `<button aria-label="捞一个漂流瓶" class="… h-[88px] w-[88px] … bg-peacock md:h-[110px] md:w-[110px] …">` | `peacock` | **2.05:1** |
| 2 | `apps/web/src/pages/river-page.tsx`（捞取面板，内圈在 `:67` 附近） | `… border-sea-glass/40 h-[80px] w-[80px] md:h-[130px] md:w-[130px]` | `:73-80` `<Button variant="primary" aria-label="捞一个漂流瓶" className="relative z-10 h-[76px] w-[76px] rounded-full px-0 md:h-[110px] md:w-[110px]">` | 由 `Button` 基类给 = `peacock` | **2.05:1** |
| 3 | `apps/web/src/pages/river-page.tsx`（投下面板，内圈在 `:129` 附近） | `… border-coral/55 h-[80px] w-[80px] md:h-[130px] md:w-[130px]` | `:134-135` `<button class="… h-[76px] w-[76px] … bg-coral … md:h-[110px] md:w-[110px]">` | `coral` | **2.51:1** |

> ⚠️ 行号来自 13:5x 的核对；`pages/**` 正被并发编辑，**以类名字符串为准、行号为辅**。

## 2. 改法（C2：在**紧贴控件边缘**处加 `foam` 环 —— 不是放在 130px 涟漪处）

**为什么紧贴**（captain 采纳的理由）：WCAG 1.4.11 的对象是**控件自身的可感知边界**；若环放在 130px（md 距 CTA 边缘 **10px**），会重新变成"这是边界还是多加的一圈涟漪"——**可争议**；紧贴则两种解读都成立，**稳健**。实测 `foam vs deep-current = 10.5:1` 与位置无关，差别只在是否紧贴控件。

三处各自：
1. **home `:90`**：静止态加 `ring-2 ring-foam`。
2. **river 捞取 `:73-80`**：同样加 `ring-2 ring-foam`（`Button` 接受 `className` ⇒ 在**调用点**加，**不改 design-system**）。
3. **river 投下 `:134-135`**：同样加 `ring-2 ring-foam`。
（原内圈涟漪**不改颜色/尺寸**，除 §3 的移动端尺寸调整。）

## 3. 移动端尺寸调整（仅移动端；md 不动）

现状边距：md 三处都 **10px ✓**；移动端只有 **6px（首页）/ 2px（河道）** ⇒ `foam` 环会退化成贴边细线，**读不出承板**（"达标只存在于数字里"）。
⇒ 按批准调整为「CTA + 16px」：

| 位置 | CTA（移动） | 内圈现值 | **改为** |
| --- | --- | --- | --- |
| home hero | 88px | `h-[100px] w-[100px]` | **`h-[104px] w-[104px]`** |
| river 捞取 / 投下 | 76px | `h-[80px] w-[80px]`（两处） | **`h-[92px] w-[92px]`** |

**md 一律保持 130px 不动**（110 + 20 ✓）。

## 4. 焦点态写法（三重区分）与焦点环收口

**发现的问题**：`ring` 系共享同一组 CSS 变量 ⇒ 加了静止环之后，若焦点态仍是 `focus-visible:ring-2 ring-sea-glass`，焦点就变成"**同一个 2px 环换个颜色**"，比现在（静止无环 → 焦点出现环）**更难辨认**。

⇒ 焦点态必须**结构上**不同，不只是色差：
- **静止**：`ring-2 ring-foam`
- **焦点**：`focus-visible:ring-[3px] focus-visible:ring-sea-glass focus-visible:ring-offset-2 focus-visible:ring-offset-deep-current`（更粗 + 换色 + 偏移带）

**焦点环收口（同 patch）**：`design-system/button.tsx:17` 基类是 `ring-peacock`（= **2.05:1**，**与 V1 同一根因，只是发生在焦点态**）+ `ring-offset-wave-white`；而 home/river 投下的 inline CTA 用 `ring-sea-glass`（**7.00:1**）+ `ring-offset-deep-current` ⇒ 同页两 CTA 焦点表现**不一致**。
⇒ 在**调用点**（river 捞取）用 `className` 覆盖为与另两处一致：`focus-visible:ring-[3px] focus-visible:ring-sea-glass focus-visible:ring-offset-2 focus-visible:ring-offset-deep-current`。**只改 `pages/**`，不碰 design-system。**

## 5. 三层验证口径（并标明每层能/不能证明什么）

| 层 | 做什么 | **能证明** | **不能证明** |
| --- | --- | --- | --- |
| ① **token 关系守卫**（新文件放 `apps/web/src/pages/__tests__/`，只 import `design-system/tokens`，不改它） | 断言实际使用的面-控件对 ≥3:1；**含焦点环色**；并加**负向断言** | token 关系正确 + 把"为什么必须有承板"固化为**机器可读理由**（有人改色值会红） | **渲染像素**（jsdom 无渲染） |
| ② **像素采样脚本**（复用 `docs/ui-review/visual-audit.md` §7 的采样法） | 改前/改后对同一 CTA 圆取样 | **屏幕上真的达标**（唯一能证明渲染的层） | 全站覆盖（只测被采样点） |
| ③ **截图复验**（t14 出图后） | 按 §1 表格逐点核 | 人眼可核的外观与位置 | 精确对比度（需 ② 配合） |

**守卫表（值来自 `DESIGN.md` 色 token，实算）**
正向（必须 ≥3:1）：`foam↔deep-current` **10.50**（承板可辨）· `peacock↔foam` **5.13**（CTA vs 承板）· `coral↔foam` **4.18** · `sea-glass↔deep-current` **7.00**（焦点环 vs 面板）
负向（**必须 <3:1**，即"承板存在的原因"）：`deep-current↔peacock` **2.05** · `deep-current↔coral` **2.51**

**落地后另需交付（captain 追加要求）**：粘贴**改动后**的
`grep -n "focus-visible:ring" apps/web/src/pages/{home,river}-page.tsx`
输出，证明三处焦点环一致。

## 6. 纪律与已知细节（避免落地时踩）

- **不 commit**（captain 提交）；只改 `pages/**`，**不碰** `design-system/**`（t32 的界面）、`packages/**`、`DESIGN.md`、`CONTEXT.md`。
- **证据纪律（ADR §70）**：`commandsRun.evidence` 必须是**粘贴的真实输出**；任何推断写在正文并标「（推断，未执行）」；报数时命令与输出成对出现。
- **一个假警报，别被它带偏**：`wave-white 文字 vs foam = 1.09:1` 在本方案下**无关** —— 承板在 CTA **外侧**，按钮内文字仍压在 `peacock/coral` 填充上（`peacock + wave-white = 5.61:1 ✓`）。写在这是防止有人单独引用 1.09 去怀疑文字对比。
- **C2 会多一圈环**，属外观变化 ⇒ captain 已记录将**当面告知用户**（用户此前口径为"先同意看看效果"，可否决）。
- **回退**：删去三处 `ring-2 ring-foam`（及移动端尺寸改回 100/80）即回到现状；本方案不改任何 token，故不影响其他页面。

## 7. 落地步骤（前置解除后照做）

1. 确认 `t32` 已结束 + 用户已说「继续」；`git status` 确认 `pages/**` 无人正在写。
2. 按 §2/§3/§4 改 3 处（+ 移动端 2 个尺寸、焦点态写法、调用点 className 覆盖）。
3. 先写 ① 守卫（预期：**落地前它应红**，因为负向断言与正向断言在现状下互斥 —— 落地后全绿）；记录红→绿原始输出。
4. 跑 `pnpm --filter @music-drift/web test`、`pnpm -r typecheck`、`pnpm lint`、`vite build`，均附**真实退出码**。
5. 跑 ② 像素采样（改前/改后各一次），粘贴实测对比度。
6. 交付 §5 末尾要求的 `grep` 输出 + 变更文件清单；**不 commit**，回报 captain。
7. 若 `DESIGN.md` md5 ≠ `458b8c80b745e520f264de2b6e995b7f` ⇒ 先重算守卫表再落地。
