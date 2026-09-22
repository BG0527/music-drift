# t18 采集台账（architect）· 结论：**Figma API 全程 429，7 帧未采完，本任务阻塞回报**

- 采集会话：`architect`（t18，attempt 1），时间窗 **2026-09-23 00:40 → 01:03**（约 23 分钟）
- 前置依赖：t3 已 `completed`（frontend-ds 释放 Figma 配额），**本会话是唯一调用方**（无并发抢配额）
- 红线遵守：**未改** `CONFLICTS.md` / `MISSING.md` / `README.md`、**未动** hosts、**未写**产品代码、**未** commit/push、**未**外推任何未取证内容

## 1. 逐次调用台账（原始事实，无删减）

| # | 时刻 | 调用 | 端点 | 结果 |
| --- | --- | --- | --- | --- |
| 1 | 00:40 | `figma_get_design_context { nodeId: '4:675' }` | `/v1/files/:key/nodes` | ❌ **429** |
| 2 | 00:41 | 同上（间隔 65s 后首试） | 同上 | ❌ 429 |
| 3 | 00:42 | `figma_get_file { nodeIds: 10 个, depth: 2 }` | `/v1/files/:key` | ✅ 返回 8 个 FRAME（仅顶层，见 §3） |
| 4 | 00:45 | `figma_get_design_context { nodeId: '4:675' }`（退避 180s） | `/nodes` | ❌ 429 |
| 5 | 00:47 | `figma_get_file { nodeIds: '4:675', depth: 6 }` | `/v1/files/:key` | ✅ **成功：public-sea 完整 6 层树（含文案）** |
| 6 | 00:51 | `figma_get_design_context { nodeId: '4:675' }`（退避 300s，第 3 次重试） | `/nodes` | ❌ 429 → **nodes 端点重试额度用尽** |
| 7 | 00:53 | `figma_get_file { nodeIds: '4:675', depth: 8 }`（间隔 62s） | `/v1/files/:key` | ❌ **429（连 files 端点也被限流）** |
| 8 | 00:56 | 同上（退避 180s） | 同上 | ❌ 429 |
| 9 | 01:02 | 同上（退避 300s） | 同上 | ❌ 429 → **files 端点重试额度用尽** |

- 限流纪律执行情况：单次调用间隔 **≥60s**（#2=65s、#7=62s）✔；429 按 **60s / 180s / 300s** 退避、**≤3 次**重试 ✔（`nodes` 与 `files` 各一轮，共 4 次尝试/端点）；仍失败 → **记入本台账并回报 captain** ✔；**未跳过任何帧、未伪造、未外推** ✔。
- 与 t3 / captain 的历史观测一致：**限流是 token/IP 级**。t3 在同一 IP 上于 00:18 前已用尽配额（README §7 台账 #12–#21 全部 429），captain 自测同样 429。
- 补充观测：**`/v1/files/:key`（files）与 `/v1/files/:key/nodes`（nodes）是两个独立配额桶** —— 00:45–00:47 期间 files 端点可用而 nodes 始终 429；01:02 之后两桶同时 429。

## 2. 已采集 / 未采集（准确台账）

| frame | node | 优先级 | `.md` 产物 | 状态 |
| --- | --- | --- | --- | --- |
| public-sea | `4:675` | ①（T3.2 黄金路径） | `4-675--public-sea.md` | ⚠️ **部分采集**（depth 6；IA/导航/文案已落，卡片内部文案与排序控件标签未取全） |
| public-sea-detail | `4:966` | ② | — | ❌ **未采集**（429） |
| profile-center | `4:1312` | ③ | — | ❌ **未采集**（429） |
| tracking-reveal | `4:1204` | ④ | — | ❌ **未采集**（429） |
| report-modal | `4:1426` | ⑤ | — | ❌ **未采集**（429） |
| admin-dashboard | `4:1530` | ⑥ | — | ❌ **未采集**（429） |
| certificate-panel | `63:32` | ⑦ | — | ❌ **未采集**（429） |
| destination-modal 选择卡 | `4:525` / `4:532` / `4:539` | 补 depth 截断 | — | ❌ **未采集**（429） |

**完成度：7 帧中 0 帧完整、1 帧部分（14%）；3 个子节点 0 个补齐。**

## 3. 文件级 outline（本次唯一稳定拿到的结构证据，#3 调用原文）

```text
CANVAS "Page 2" #3:2
  FRAME "destination-modal" #4:478 1440×900  row    fill=GRADIENT_RADIAL
  FRAME "public-sea"        #4:675 1440×1100 row    fill=GRADIENT_RADIAL
  FRAME "public-sea-detail" #4:966 1440×1200 row    fill=GRADIENT_RADIAL
  FRAME "tracking-reveal"   #4:1204 1440×1100 row   fill=GRADIENT_RADIAL
  FRAME "profile-center"    #4:1312 1440×900  row   fill=GRADIENT_RADIAL
  FRAME "report-modal"      #4:1426 1440×900  row   fill=GRADIENT_RADIAL
  FRAME "admin-dashboard"   #4:1530 1440×900  column fill=GRADIENT_RADIAL
  FRAME "certificate-panel" #63:32 420×515    column gap=24
```

（与 `docs/architecture.md` §12.3 的 12 帧登记一致；此处仅复核 **7 个待采帧的存在性与尺寸**，未重复登记。）

## 4. ⚠️ 方法论更正（**我复核过源码，t3 的原断言是错的**）

t18 任务书指出、我也**独立复核**了 `dsh-figma-plugin/lib/simplify.js`（`~/.dsh/profiles/web/node_modules/dsh-figma-plugin/lib/simplify.js`）：

| 字段 | 源码行 | 来自 | 说明 |
| --- | --- | --- | --- |
| `radius` | **:216** | `node.cornerRadius` | 统一圆角 |
| `radii` | **:217** | `node.rectangleCornerRadii` | 四角独立圆角 |
| `effects[]` | **:87–99**（`projectEffect`）、**:205–206**（收集）、**:224**（挂载） | `node.effects` | 含 `type` / `color` / `offset` / `radius` / `spread`；`visible:false` 被过滤 |
| `fills[].stops[]` | **:66** | `paint.gradientStops` | 渐变 stop（含 `position` / `color`） |
| `opacity` | **:57**（paint）、**:213**（node） | `paint.opacity` / `node.opacity` | 仅当 `< 1` 时输出 |
| `strokeWeight` / `strokeAlign` / `constraints` / `boundVariables` / `layoutGrids` | **:220–229** | 同名节点属性 | 全部输出（`layoutGrids` 输出数量） |

**结论**：投影 **确实输出** 圆角 / 阴影模糊 / 渐变 stop / 透明度，**只是键名与 Figma 原名不同，且未设置时省略**。
`docs/figma/CONFLICTS.md` §1 与 `README.md` §5 中"投影从不输出这些字段"的表述是**错的**（README §5 本轮-D 已自行更正，CONFLICTS §1 以 frontend-ds 的更正为准），
正确表述应为「**换取值路径**」而非「工具不支持」。**此更正不影响**「视觉以 `DESIGN.md` 为准、Figma 只贡献 IA/文案」的既有裁决。

## 4.5 attempt 2（01:06 → 01:09）：**两桶仍 429，按 captain「探测优先」纪律立即停止**

| #   | 时刻                | 调用                                                     | 桶    | 结果 |
| --- | ------------------- | -------------------------------------------------------- | ----- | ---- |
| A2-1| 01:07               | `figma_get_design_context { nodeId: '4:675' }`            | nodes | ❌ 429 |
| A2-2| 01:08（间隔 62s）   | `figma_get_file { nodeIds: '4:966', depth: 9 }`           | files | ❌ 429 |

- 距 attempt 1 结束（01:05）仅 **1–3 分钟**，配额窗口**未恢复**：attempt 1 的 23 分钟 429 与本轮两次探测连续实测，两桶（nodes / files）**同时 429**。
- 依 captain 裁决（**探测优先**，取代退避阶梯）：**files 桶 1 次探测失败即停止**，本轮不再重试，避免烧掉稀缺额度 —— 已执行（本 attempt 仅 2 次探测调用，无任何重试阶梯）。
- 同时已按 captain 修订的采集策略待命（下一轮生效）：主路径 `figma_get_file { nodeIds, depth: 9 }`、**一次一帧**（规避 outline 400 行上限与 node 预算截断）、收到结果先查 `truncated` / `[children omitted, node budget]` / `[+N children, depth limit]` 标记，截断则按 node id 收窄子树重取而非加大 depth；`4:675` 按裁决**保持现状不重采**。
- 本轮新增帧产物：**0**（未采：`4:966` / `4:1312` / `4:1204` / `4:1426` / `4:1530` / `63:32` 与子节点 `4:525` / `4:532` / `4:539`）；**无一帧被跳过或外推**。

## 4.6 我的一处转述更正（captain 复核指出，我核了原文）

我在 attempt 1 的回报里写「`CONFLICTS.md` §1 仍带旧结论，建议 frontend-ds 一并更正」—— **该说法不成立**，属未经核验的下游影响建议：

- `docs/figma/CONFLICTS.md` **第 23–25 行**已写明「本文件早先断言『投影不输出 cornerRadius/effects/渐变 stop/opacity』**该断言是错的**，现更正如下」，并给出正确键名与源码行号；
- `docs/figma/README.md` §5 亦已是更正后表述（表格内含删除线标注「错误断言，已更正」）；
- 两处均由 `frontend-ds` 在 t3 收尾时完成，captain 已复核。

**教训（对我自己）**：`§4` 的源码级证据是我亲自读的，可信；但「谁还需要再改哪份文件」这类**涉及他人工作的建议我未核原文就发出**，与我一直坚持的核验标准不一致。今后对下游/他人的影响建议，先核原文再发。

## 5. 给下一次重试的可复用情报（省配额）

1. **`figma_get_file { nodeIds: '<node>', depth: N }` 是 `design_context` 的有效平替**：返回同一棵树，**含 `TEXT` 节点文案与字号**、`fill=`、`pad=`、`gap=`、尺寸、`layout` 方向，仅缺 `radius`/`effects[]`/`stops[]`/截图 —— 本帧 `4:675` 就是这样取到的（证据：`4-675--public-sea.md`）。
   - 实测 `depth: 6` 对 1440×1100 的卡片网格仍会截断卡片内部文案；建议 **`depth: 9`**，或对单卡子节点再单独调用。
   - 它走 **files 配额桶**，与 nodes 桶独立 —— 下一次重试应**先试 files 桶**（成本更低、更容易成功）。
2. **限流恢复窗口未知**：本次 23 分钟内两桶均未恢复。建议下一次重试**等 ≥60 分钟**或换一个可用 IP/Token 后再派发。
3. 若要在无配额时产出 IA 级内容，唯一合规路径是上面第 1 条（仍属 Figma 调用，仍需配额）；**不允许**用 `DESIGN.md` 或同级帧反推未采帧。
