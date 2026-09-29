# 录音链路全面诊断报告（t20 · 用户报告「录音功能无法使用」）

> 只读诊断 · 未改任何代码 · 报告供 t21 直接执行修复
> 诊断人：page-builder · attempt 1（fbfe1560-2a57-4de5-bace-727b42fee3f5）
> 实测环境：本地 dev（vite `http://localhost:5173` + API `http://localhost:8788`，共享开发库），
> Playwright Chromium 真实浏览器；麦克风用 Chrome 假设备（`--use-fake-device-for-media-stream`）跑通路，
> 用「不给权限」的上下文跑拒绝路；测试账号为临时注册（`recdiag*/recdg*`，不污染既有演示数据）。

---

## 0. 结论摘要（按对用户的影响排序）

| # | 环节 | 判定 | 一句话根因 |
| --- | --- | --- | --- |
| **R1（主根因）** | ④ 详情页录音弹层 | **阻断级**：`开始录制` 按钮**看得见、点不动** | `Modal` 的 fixed 容器**没写 z-index**（`design-system/modal.tsx:48`），在 Chrome 里按 z=0 参与根层叠；瓶子详情页 `.bp-profile{position:absolute;z-index:1}`（`pages/bottle-page.css:414-419`）**整页铺开压在弹层之上** ⇒ 真实点击被 `ol.bp-cells` 吃掉，1280×800 与 1440×900 实测均复现 |
| **R2（次根因）** | ② 状态机·预设 fail-closed | **阻断级（特定数据）**：`开始录制` **禁用** | 曲目 `别人写的歌`（`licensed_source=user-provided`）`song_segments` **0 行** ⇒ `presetDurationMs=null` ⇒ 录音层按设计拒开（文案「固定时长还没登记」）。库里**已有 2 支引用它的 DRAFT 草稿**（architecture.md §65.2 已记档），打开这些草稿 = 必然卡死 |
| R3（非缺陷，须排查用户访问方式） | ① 权限层 | localhost **实测健康**；http/局域网 IP **按设计拦截** | 拒绝时有明确文案+可重试；若用户用 `http://192.168.x.x` 打开，`checkRecordingSupport` 直接判不可录（`shared/src/audio/recording.ts:170-177`），这是浏览器策略不是 bug |
| R4（非缺陷，易被当成坏了） | ② 状态机·早停 | 按设计 fail-closed | 手动提前停止（3.4s/20s）后「用这一段」禁用，并给出精确文案（见 §2）；**录满自动停 → 用这一段 → 上传全链路实测 201 成功**（前提是 R1 已绕过） |
| R5（健康） | ③ 保存与提交 | 实测通 | 假设备录满 20.0s → `POST /api/bottles/:id/segments → 201`，页面转「已录 1」 |

**给用户排查的最短路径**：先确认访问地址是 `http://localhost:5173`（或 https），再确认打开的瓶子不是「别人写的歌」的两支旧草稿；若两者都正常，症状就是 R1（当前代码下**所有**详情页录音弹层都点不动），等 t21 执行 §6 F1 即修复。

---

## 1. 环境与方法（复现用）

```bash
# 终端1：API（若未起）
# 终端2：
pnpm --filter @music-drift/web dev          # http://localhost:5173
```
诊断脚本（Playwright，三段实测）：
1. **通路 A（假麦克风）**：注册临时账号 → 选一首**有切分预设**的歌（占位曲目·一，4×20000ms）→ `POST /api/bottles` 建新瓶 → 打开 `/bottles/:id` → 点「录第 1 段」→ 逐状态点击与量测；
2. **通路 B（权限拒绝）**：同一套步骤，但不授予 microphone 权限（无 fake-ui）；
3. **通路 C（修复验证）**：在页面内注入 `div.enter-fade.fixed.inset-0{z-index:400}` **（仅会话内，不改仓库）**后重复通路 A。

证据文件（截图）：`C:\Temp\rec-diag-02-panel.png`（弹层被压、文字穿插）、`C:\Temp\rec-diag-04-earlystop.png`（早停文案）。

---

## 2. 逐环节：复现 / 实际 / 期望 / 根因

### ① 浏览器权限层 —— 实测健康（附一条必须排查的访问方式）

**复现**：通路 B：详情页 → 点「录第 1 段」→ 弹层内点「开始录制」（脚本绕过 R1 直接派发 click）。
**实际**：
- 弹出状态文案：**「麦克风 | 麦克风启动失败 | 麦克风与系统权限设置后重试；若反复失败，可换用较新版本的 Chrome 或 Safari」**；
- 「开始录制」按钮回到可点（`disabled=false`），可重试；控制台无未捕获异常。
**期望**：拒绝时给出可读原因 + 重试出口，不静默。→ **满足**。
**根因判定**：无缺陷。`use-recorder.ts:417-425` 把 `getUserMedia` 异常交给 `describeMicrophoneError`，UI 落在面板状态区。
**但要排查的分支**（用户如果这么说：「连弹窗都没出现」）：
- `checkRecordingSupport`（`packages/shared/src/audio/recording.ts:165-177`）：`secure = isSecureContext || 本地主机名`；不满足时**直接不进 requesting**，文案是
  「录音只在 https:// 或 localhost 下可用……（局域网 IP、http 域名都不行）」。
- 判定顺序：**先问用户打开的 URL**。`http://localhost:5173` → 走①正常分支；`http://192.168.*.*` 或 `http://域名` → 按设计不可录（浏览器策略，AGENTS.md §9 同款约束）。
- localhost 实测：support.ok=true（通路 A 中 start 成功进入 recording）。

### ② 录音状态机（use-recorder / recorder-panel）—— 逻辑健康，两个「看起来像坏了」的 fail-closed

**状态机事实（代码 + 实测）**：
- `presetDurationMs`（曲库该段固定时长）是**唯一分母**：`record-step.tsx:170-173` 从 `GET /api/songs` 的 `segments[index].durationMs` 取；取不到传 `null`。
- `null` ⇒ `start()` **连麦克风都不要**（`use-recorder.ts:176-181, 407`），面板渲染禁用按钮 + 原因（`recorder-panel.tsx:342-351`）。
- 录满自动停在**本段时长**（`use-recorder.ts:176, 468-472`），实测占位曲目 20.0s 自动停 ✓。
- 时长判定与服务端同一函数 `checkRecordingDurationAgainstPreset`（±2.0s，`use-recorder.ts:544-551`）。

**复现 2-1（预设缺失 → 禁用，R2）**：
1. 打开引用 `别人写的歌` 的草稿瓶（或任何该歌的瓶子；`POST /api/bottles {songId}` 该歌也能建出来）；
2. 点「录第 1 段」。
**实际**：「开始录制」`disabled=true` + 文案「**固定时长还没登记，所以现在不能录 —— 换一首歌，或者稍后再来**」（实测原文）。
**数据核对**：`GET /api/songs` 实测——占位曲目·一/二/三 `segments` 各 4 行 `durationMs=20000`；`别人写的歌` **`segments: []`**（`total_segments=4` 但 `song_segments` 0 行）。
**期望**：能录；**根因**：数据缺切分（非前端 bug）。与 `docs/architecture.md` §65.2 已记档事实完全一致：该歌是 `user-provided`、0 行预设、**已有 2 支引用它的 DRAFT 空草稿**；t32 已在选歌页禁用它（防新增），但**那 2 支旧草稿仍能打开、必卡**。

**复现 2-2（手动早停 → 用这一段禁用，R4）**：
1. 有预设的歌 → 开始录制 → **3 秒后点「停止录制」**。
**实际**：「用这一段」`disabled=true`，状态区原文：
> 「**这一段的固定时长是 20.0 秒，你录的是 3.4 秒（相差 16.6 秒，允许 ±2.0 秒），请重新录制**」
**期望/判定**：这是**有意的 fail-closed**（服务端同规则会拒 422，前端先拦），文案已写明原因与出路（重录/录满）。**不算缺陷**，但用户若习惯「按一下就停」会误判为坏——t21 可评估要不要在停止时就提示「至少录满 18 秒或直接等自动停」（可选，不属本报告 P0）。
**同族分支**：录满但**静音**时「用这一段」也禁用（`clip-level.ts:86-96`：「这一段没有录到声音（完全没有音频信号）」+ 指引）——有明确文案，判定规则见 t40。

### ③ 保存与提交链路 —— 实测通

**复现**（通路 A，绕过 R1 后）：录满 20.0s 自动停 → 「用这一段」可点 → 自动上传。
**实际**：
- `POST /api/bottles/<id>/segments → 201`（实测）；
- 页面状态转「已录 1」，详情刷新正常；控制台无 error。
**期望**：成功入库并前进一段。→ **满足**。
**旁证**：时长 20.0s 落在 20000±2000 容差内 ⇒ 客户端与服务端判定一致（`uploadSegmentAudio` 走 `features/audio`，ADR-018 的进度/重试路径未触发）。
**未覆盖**：422/网络失败的重试 UI（`record-step.tsx:194-220` 的「重试上传 + 本地回放」）本轮未造错，属代码审阅结论而非实测。

### ④ 详情页录音弹层的触发与交互 —— **主根因 R1（阻断级）**

**触发链（正常）**：详情页缺口格「录第 N 段」按钮（`bottle-page.tsx:326 setRecorderOpen(true)`）→ design-system `<Modal>` 打开，内含 `RecordStep → RecorderPanel`。入口按钮本身**可点**（两档视口实测 click 成功）。

**复现**：
1. 任意可录瓶子 → 点「录第 1 段」→ 弹层打开（`开始录制` 在 DOM 里、rect 在视口内：1280×800 时 `top:532,l:318`）；
2. **真实点击「开始录制」→ 30s 超时无反应**（Playwright actionability 超时，等价于用户点了没反应）；
3. 命中测试：`document.elementFromPoint(按钮中心)` 返回 **`OL.bp-cells`**，`isBtn=false`。

**实测数据**：
| 视口 | 命中结果 |
| --- | --- |
| 1280×800 | `{"btn":true,"isBtn":false,"top":"OL.bp-cells"}` |
| 1440×900 | `{"btn":true,"isBtn":false,"top":"OL.bp-cells"}` |

视觉证据（`rec-diag-02-panel.png`）：弹层文字与页面「这一段还没有人唱」四格、瓶身剖面**互相穿插**，遮罩没有压暗页面。

**根因（层叠上下文逐层实测）**：
- `Modal` 外层容器 `div.enter-fade.fixed.inset-0…`（`design-system/modal.tsx:48`）**computed z-index = `auto`**；
- Chrome 中 `position:fixed` 元素**自身创建层叠上下文**，但以 **z=0 级别**参与父级（根）层叠 ⇒ 它内部的 `z-overlay`(200)/`z-modal`(300) 全被**关在这个 z=0 的盒子里**；
- 瓶子页 `.bottle-page .bp-profile { position:absolute; inset:0; z-index:1 }`（`pages/bottle-page.css:414-419`，`@media (min-width:1024px)` 内）在根层叠里是 **z=1 > 弹层的 z=0** ⇒ **整个剖面层（含 `ol.bp-cells`，`bottle-page.css:446` `inset:0` 铺满视口）压在弹层之上**；
- 于是：视觉穿插 + 点击被 `bp-cells` 截获（`bp-profile` 本身 `pointer-events:none`，但 `> *` 恢复 `auto`，见 `:421-423`）。

**为什么以前没炸**：全仓只有 `modal.tsx:48` 一处 fixed 遮罩容器（grep `fixed inset-0` 仅此 1 处）；其他页面没有 z≥1 的兄弟层，z=0 的弹层照常在最上。瓶子页这套 `bp-*` 绝对定位剖面层（`relay-timeline.tsx:104` `className='bp-profile'`）引入 z=1 后才踩中 —— 与 t17 报告的「遮挡问题」同源。

**修复验证（在会话内注入，未改仓库）**：
```js
page.addStyleTag({ content: 'div.enter-fade.fixed.inset-0{z-index:400 !important;}' })
```
→ 命中测试 `isBtn=true` → **真实 actionability 点击成功**（开始/停止/用这一段全部可点）→ 录满自动停 → 上传 **201**。**根因判定成立，修法被预验证。**

---

## 3. 与其他事项的关系

- **t17（深度复刻返工，in_progress）**：`bp-*` 剖面层是这轮复刻产物，遮挡是它与旧 Modal 的层叠冲突。建议 t21 的 F1（Modal 侧）修复，**不要**让 t17 把 `.bp-profile` 降 z —— 剖面层 z=1 是它压住背景场景的必要层；冲突的正确归属是弹层容器（任何页面未来加 z≥1 层都会踩同一坑）。
- **t5（一屏收敛）无关**：弹层是 `position:fixed`，不受 `md:overflow-hidden` 裁切（截图可见弹层完整）。
- **R2 数据处置属架构/数据域**（非本报告可改）：见 F3。

---

## 4. 修复方案（供 t21 直接执行）

### F1（P0 · 一行修复 · 主根因 R1）
**文件**：`apps/web/src/design-system/modal.tsx:48`
**改法**：给外层 fixed 容器补 z-index（与内容同 token）：
```tsx
// 现：
<div className="enter-fade fixed inset-0 flex items-center justify-center p-6">
// 改：
<div className="enter-fade fixed inset-0 z-modal flex items-center justify-center p-6">
```
理由：外层进入 z=300 的根层叠级别，压过任何 z≤300 的页面层（本项目页面层最高 z=1）；内层 `z-overlay`/`z-modal` 语义不变（它们在外层的新上下文里继续分层）。
**回归测试**：`apps/web/src/design-system/__tests__/components.test.tsx` 已断言内层 `z-overlay/z-modal`（:395-405），**补一条**：弹层的 `fixed` 容器 className 含 `z-modal`（源码/DOM 断言均可）。
**验证**：重跑 §1 通路 A —— 未注入 CSS 时 `elementFromPoint` 必须命中按钮本身（`isBtn:true`），真实点击「开始录制」进入 recording。

### F2（P0 验证 · 不改码）
F1 落地后在 1280×800 与 1440×900 各跑一遍通路 A（脚本见 §1），确认：点击成功、录满自动停、`POST /segments → 201`。

### F3（P1 · 数据/架构域，需 captain 裁决，不属 web 代码）
- **选项 a**：给 `别人写的歌` 补 `song_segments`（4×20000ms 或按其音频真实切分）——需先确认该歌有没有真音频、能否切分；
- **选项 b**：删掉引用它的 2 支 DRAFT 空草稿（architecture §65.2 说明它们不在河道，删除不影响演示池）；
- **选项 c（现状兜底）**：保留，但接受「打开这两支草稿 = 录音被禁 + 文案解释」。
- 建议 **b 或 a**，由 captain 定；**不修也不断链**（前端已有明确文案），但用户若恰好打开这两支草稿，症状与「录音坏了」无法区分。

### F4（P2 · 可选 UX）
早停死路已有精确文案（§2 2-2），如要降低误判，可在「停止录制」按下时就提示目标时长（`recorder-panel.tsx:354-357` 附近）。**不建议**放宽时长校验（服务端同规则，放宽只会把 422 推后）。

### F5（文档 · 排查指引）
若用户走查后仍报「没弹权限窗」：先核对地址（`http://localhost:*` 或 https），文案与判定见 §2①（`recording.ts:170-177`）。

---

## 5. 证据清单

| 证据 | 内容 |
| --- | --- |
| 通路 A 日志 | `开始录制 disabled=false` → 真实点击**超时**（R1）→ 注入 z 后 `isBtn=true`、真实点击成功 → `停止按钮=1` → 自动停 ~20s → `用这一段 disabled=false` → `POST /segments -> 201` → 「已录 1」 |
| 命中测试 | 1280×800 与 1440×900 均 `{"isBtn":false,"top":"OL.bp-cells"}` |
| 层叠实测 | 弹层容器 computed `z:auto pos:fixed`；`.bp-profile computed `z:1 pos:absolute`；DOM 顺序 main 子节点 0..8（弹层在 8，剖面层在 4） |
| 通路 B | 拒绝文案「麦克风启动失败 / 麦克风与系统权限设置后重试…」，按钮可重试 |
| 早停 | 「固定时长是 20.0 秒，你录的是 3.4 秒（相差 16.6 秒，允许 ±2.0 秒），请重新录制」 |
| 数据 | `GET /api/songs`：`别人写的歌 segments:[]`；占位曲目 `4×20000`；architecture.md §65.2 交叉印证 |
| 截图 | `C:\Temp\rec-diag-02-panel.png`（穿插/无遮罩）、`rec-diag-04-earlystop.png`、`rec-diag-01/03` |

## 6. 遗留 / 待裁决

1. 用户实际访问 URL 未确认（决定 R3 是否参与）——**建议 captain 向用户问一句「地址是 localhost 还是局域网 IP」**。
2. F3 数据处置（a/b/c）需 captain/architect 裁决。
3. 422/网络失败的「重试上传」UI 本轮未实测造错（代码路径审阅存在且有测试覆盖 `record-step` 相关用例）。
