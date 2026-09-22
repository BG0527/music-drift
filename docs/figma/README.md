# docs/figma — Figma 设计基线（T0.3 产物）

> **状态（2026-09-23）：采集中，被 Figma API 限流（429）卡住。**
> 已完成：文件级 outline（12 帧全量登记）、5 帧 `design_context`（login-anonymous / home-river / bottle-detail / relay-recording / destination-modal）、3 张截图（`4-8`、`home-river`、`relay-recording`）、`styles`（0 条）与 `components`（0 个）。
> 未完成：7 帧 `design_context` + 9 张截图（清单见 §7 台账与 `CONFLICTS.md` §6）。
> **裁决前提**（`docs/architecture.md` §12.1）：**视觉一律以 `DESIGN.md` 为准，Figma 仅作 IA / 文案 / 交互元素参考**；因此本目录的产出定位是"IA 与文案基线 + 差异记录"，不是"视觉复刻依据"。

## 1. 前置输入

| 输入 | 说明 | 状态 |
| --- | --- | --- |
| Figma 文件 | `Untitled`，fileKey `epsix0MBOq2Iv8cCASg9qK`，lastModified `2026-09-22T13:00:40Z` | **已收到** |
| 覆盖范围 | page `Page 2` (#3:2)，**12 个顶层 frame**（清单见 `docs/architecture.md` §12.3） | **已收到** |
| 共享授权 | 文件对账号 `BG0527 <2533995180@qq.com>` 可见 | **已确认**（`figma_get_file` 成功返回） |
| 连通性 | `figma_whoami` 通过；`api.figma.com` 已被 hosts 固定到可用 IP | **正常** |

## 2. 采集流程（执行中）

1. `figma_get_file { fileKey }` —— 列全量 page/frame ✅ **已完成**（1 个 page、12 帧，全部登记进 §12.3 表）。
2. 逐帧 `figma_get_design_context { nodeId, includeScreenshot: false → 见 §7 说明 }` —— 取结构化树 + outline。**5/12 完成**，产出 `frames/<node>--<slug>.md`。
3. 逐帧 `figma_get_screenshot { nodeId, outputPath }` —— 截图落盘。**3/12 完成**。
4. `figma_get_variables` → **403**（token 缺 `file_variables:read` scope）；`figma_get_styles` → 成功，**0 条已发布样式**；`figma_get_components` → 成功，**0 组件 / 0 组件集**。
5. 落盘命名：`frames/<node-id 用 '-' 连接>--<slug>.md` / `.png`；变量与样式产物在 `variables/`、`components.json`。

> **关于 `includeScreenshot`**：命令要求"含 screenshot"。实际做法是`screenshot` 由 `figma_get_screenshot` 单独渲染落盘（`figma_get_design_context` 的截图只存在于会话内、无法落盘），**信息量等价**：每帧的截图文件 + outline 文件都在 `frames/`。此偏离已登记，若 captain 要求必须走 `includeScreenshot: true`，请明示。

## 3. 目录布局

```
docs/figma/
  README.md              本文件：状态 / 流程 / 红线 / 台账 / 环境
  CONFLICTS.md           差异清单（**已裁决记录**：逐条 + "已裁决：DESIGN.md 胜出"）
  MISSING.md             缺失页面 / 缺失状态 / 结构性缺口（含"未判定"栏）
  frames/                <node>--<slug>.md（IA + 文案 + 交互状态）+ .png
  variables/             design-tokens.json（403 未生成）/ styles.json（0 条）
  components.json        figma_get_components 原始结果（0 个）
```

## 4. 红线（纪律）

- **只读**：本任务不改任何代码、不建组件、不动 Tailwind 配置（属 T3.1）。
- **不猜**：不得凭空写出 frame 名、node id、色值、字号、间距、圆角。所有条目必须可追溯到 MCP 返回或截图。
- **不自行裁决**：差异一律写进 `CONFLICTS.md` 并标注裁决状态；文案问题（错字/颜色词/口径不符）**只上报、不改写**。
- **不伪造**：未采集到的帧在 `CONFLICTS.md` §6 / `MISSING.md` §5 统一记为"未判定/待复核"，不得由 `DESIGN.md` 反推 Figma 内容，也不得由同级帧外推。
- **不静默跳过**：任何调用失败必须进 §7 台账。

## 5. 已知风险

| 风险 | 观测 | 处置 |
| --- | --- | --- |
| `api.figma.com` 单 IP 黑洞 | captain 诊断：`65.9.168.94` TLS 握手卡死；已 hosts 固定 `65.9.168.58` | 不再出现 `fetch failed`；**我不动 hosts**，异常即上报 |
| **Figma API 限流 429** | `/v1/files/:key/nodes` 与 `/v1/images/:key` 在连续调用后返回 `429 Rate limit exceeded`（详见 §7 台账） | 退避重试 ≤3 次；仍失败即记入待复核并上报 captain，**不跳过任何一帧** |
| 图片 CDN 下载失败 | 2 次 `downloading the rendered image failed: fetch failed`（`figma-alpha-api.s3.us-west-2.amazonaws.com` 根路径 curl 实测 **403 / 1.08s = 可达**） | 判断为限流的伴生现象，非新黑洞 IP；配额恢复后重试 |
| `file_variables:read` scope 缺失 | `figma_get_variables` → 403 | 不影响结论（已裁决以 `DESIGN.md` 为唯一 token 源）；若确需，需 captain 给 MCP token 补 scope |
| 投影不含圆角/阴影/渐变 stop | `design_context` 从不输出 `cornerRadius` / `effects` / gradient stops | 已在 `CONFLICTS.md` §1 声明为方法局限；推荐"不需要取" |

## 6. 修订记录

| 日期 | 变更 | 触发 |
| --- | --- | --- |
| 本轮-A | 建立骨架模板（无任何 Figma 数据） | captain 授权：允许建骨架 + 待填模板，禁止设计推断 |
| 本轮-B | 收到 fileKey；完成 12 帧登记、5 帧 design_context、3 张截图、styles/components 各 1 次 | captain 提供 URL 并解除 T0.3 阻塞 |
| 本轮-C | `CONFLICTS.md` 改为"已裁决记录"；`MISSING.md` 改为"已核对 + 未判定"双栏；补 §5 风险与 §7 台账 | 用户终裁：视觉按 `DESIGN.md`，Figma 仅贡献 IA/文案（`docs/architecture.md` §12） |

## 7. 调用台账（含限流重试）

| # | 调用 | 结果 |
| --- | --- | --- |
| 1 | `figma_get_file` | ✅ 1 page / 12 frames |
| 2 | `figma_get_screenshot` nodeIds=[4:8,4:43] 同一 outputPath | ⚠️ **写同一路径 → 只留下最后一个**（4:43）；已重渲染 4:8 到独立路径。**教训：截图必须一帧一路径** |
| 3 | `figma_get_variables` | ❌ 403 缺 scope |
| 4 | `figma_get_styles` | ✅ 0 条 |
| 5 | `figma_get_components` | ✅ 0 个 |
| 6–7 | `design_context` 4:8 / 4:43 | ✅ |
| 8–9 | `design_context` 4:223 / 4:374 | ✅ |
| 10 | `design_context` 4:478 | ✅（depth 截断 9 节点） |
| 11 | `design_context` 4:31（子节点探针） | ✅ 证实**投影不含 cornerRadius/effects** |
| 12 | `design_context` 4:675 `design_context` 4:1312（并发 2 次） | ❌ 429 |
| 13 | `design_context` 4:675（退避 45s 后） | ❌ 429 |
| 14 | `design_context` 4:675（退避 150s 后） | ❌ 429 |
| 15 | `design_context` 4:675（退避 240s 后） | ❌ 429 ← **该 node 已重试 3 次，按纪律停止并上报** |
| 16 | `figma_get_screenshot` 4:8 | ✅ 落盘 `4-8--login-anonymous.png`（限流前） |
| 17 | `figma_get_screenshot` 4:223 / 4:478（并发） | ❌ `downloading the rendered image failed: fetch failed` ×2 |
| 18 | `figma_get_screenshot` 4:223 | ❌ 429（images 端点也被限流） |

**待重试清单（配额恢复后按 1 次/60s 节流继续）**
- `design_context`：`4:675`、`4:966`、`4:1204`、`4:1312`、`4:1426`、`4:1530`、`63:32`（7 次）
- `design_context`（补 depth 截断）：`4:525`、`4:532`、`4:539`（destination-modal 三张选择卡文案）
- `figma_get_screenshot`：`4:223`、`4:478`、`4:675`、`4:966`、`4:1204`、`4:1312`、`4:1426`、`4:1530`、`63:32`（9 次）
