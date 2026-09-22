# docs/figma — Figma 设计基线（T0.3 产物）

> **状态（2026-09-23）：本任务收尾。** 采集被 Figma API 限流（429）截断，缺口已显式记录（见 §8）。
> 已完成：文件级 outline（12 帧全量登记）、**5 帧** `design_context`（login-anonymous / home-river / bottle-detail / relay-recording / destination-modal）、**3 张**截图（`4-8`、`home-river`、`relay-recording`）、`styles`（0 条）、`components`（0 个）。
> 未采：**3 帧**（`4:675` / `4:966` / `4:1312`，被你/captain 会话共同的 429 阻塞，见 §8）+ **4 帧**移交 **t18（architect，依赖 t3）**（`4:1204` / `4:1426` / `4:1530` / `63:32`）。
> **裁决前提**（`docs/architecture.md` §12.1）：**视觉一律以 `DESIGN.md` 为准，Figma 仅作 IA / 文案 / 交互元素参考**。

## 1. 前置输入

| 输入 | 说明 | 状态 |
| --- | --- | --- |
| Figma 文件 | `Untitled`，fileKey `epsix0MBOq2Iv8cCASg9qK`，lastModified `2026-09-22T13:00:40Z` | **已收到** |
| 覆盖范围 | page `Page 2` (#3:2)，**12 个顶层 frame**（清单见 `docs/architecture.md` §12.3） | **已收到** |
| 共享授权 | 对账号 `BG0527 <2533995180@qq.com>` 可见 | **已确认**（`figma_get_file` 成功） |
| 连通性 | `figma_whoami` 通过；`api.figma.com` 已由 captain 固定 hosts 到可用 IP | **正常** |

## 2. 采集流程（已执行，末尾被限流截断）

1. `figma_get_file { fileKey }` ✅ 完成（1 page / 12 frames，全部登记）。
2. 逐帧 `figma_get_design_context { nodeId }` 取结构化投影 → 落盘 `frames/<node>--<slug>.md`。✅ **5/12**，其余见 §8。
3. 逐帧 `figma_get_screenshot { nodeId, outputPath }` → 截图落盘。✅ **3/12**，其余见 §8。
4. `figma_get_variables` → **403**（token 缺 `file_variables:read` scope）；`figma_get_styles` → **0 条**；`figma_get_components` → **0 个**。
5. 命名：`frames/<node 的 ':'→'-'>--<slug>.md|.png`；`variables/`、`components.json` 为原始产物。

> **执行偏离（captain 已批准）**：`design_context` 用 `includeScreenshot: false` 取值，截图另用 `figma_get_screenshot` 逐帧落盘 —— 因为 `design_context` 的截图只存在于会话内、无法落盘；信息量等价（每帧都有 .md + .png）。

## 3. 目录布局

```
docs/figma/
  README.md              本文件：状态 / 流程 / 红线 / 台账 / 环境陷阱 / 缺口
  CONFLICTS.md           差异清单（**已裁决记录**）+ 采纳清单 + 裁决记录 + 待复核
  MISSING.md             缺失页面 / 缺失状态 / 结构性缺口（含"未判定"栏）
  frames/                <node>--<slug>.md（IA + 文案 + 交互状态）+ .png
  variables/             design-tokens.json（403 未生成）/ styles.json（0 条）
  components.json        figma_get_components 原始结果（0 个）
```

## 4. 红线（纪律）

- **只读**：不改代码、不建组件、不动 Tailwind 配置（属 T3.1/t10）。
- **不猜**：frame 名、node id、色值、字号、间距、圆角一律可追溯到 MCP 返回或截图。
- **不自行裁决**：差异写进 `CONFLICTS.md` 并标注裁决状态；文案问题**只上报、不改写**。
- **不伪造 / 不外推**：未采集的帧在 `CONFLICTS.md` §6 与 `MISSING.md` §5 统一记为"未判定/待复核"，不得由 `DESIGN.md` 反推，也不得由同级帧外推。
- **不静默跳过**：任何调用失败必须进 §7 台账。

## 5. 已知风险与工具陷阱

| 风险 / 陷阱 | 观测 | 处置 |
| --- | --- | --- |
| `api.figma.com` 单 IP 黑洞 | captain 诊断：`65.9.168.94` TLS 握手卡死；已 hosts 固定 `65.9.168.58` | 不再出现 `fetch failed`；**我不动 hosts**，异常即上报 |
| **Figma API 限流 429** | `/v1/files/:key/nodes` 与 `/v1/images/:key` 在连续调用后返回 `429`；**captain 在自己的会话里对同一 node 也 429 → 限流是 token/IP 级，不是会话级** | 单次调用间隔 ≥60s；429 按 60s/180s/300s 退避 ≤3 次；仍失败记入待复核并上报，**绝不跳过、绝不外推** |
| 图片 CDN 下载失败 | 2 次 `downloading the rendered image failed: fetch failed`；`curl https://figma-alpha-api.s3.us-west-2.amazonaws.com/` → **403 / 1.08s（可达）** | 判断为限流伴生现象，非新死 IP；配额恢复后重试 |
| `file_variables:read` scope 缺失 | `figma_get_variables` → 403 | 不影响结论（以 `DESIGN.md` 为唯一 token 源）；如需，由 captain 给 MCP token 补 scope |
| **截图工具陷阱（实测）** | `figma_get_screenshot { nodeIds: '4:8,4:43', outputPath: <同一路径> }` → **只保留最后一张** | **一帧一路径**；批量渲染会静默丢图 |
| ~~投影不支持圆角/阴影/渐变~~ **（错误断言，已更正）** | 投影 `simplify.js` **确实输出** `radius`(:216) / `radii`(:217) / `effects[]`(:87-99,205-206) / `fills[].stops[]`(:66-67) / `opacity`(:213) / `strokeWeight`·`strokeAlign`·`constraints`·`layoutGrids`·`boundVariables`(:205-229)；**键名与 Figma 原名不同，且未设置则省略输出**。我先前没看到它们，是因为 `design_context` 的**文本渲染只打印 outline 子集**（`fill=`/`pad=`/`gap=`/`text=`） | 正确表述 = "**换取值路径**（更窄 node id + 检查结构化输出 / 设计者报数）"，**不是"取不到"**；不影响"视觉不复刻 Figma"的裁决。详见 `CONFLICTS.md` §1 |

## 6. 修订记录

| 日期 | 变更 | 触发 |
| --- | --- | --- |
| 本轮-A | 建立骨架模板（无任何 Figma 数据） | captain 授权：允许建骨架 + 待填模板，禁止设计推断 |
| 本轮-B | 收到 fileKey；完成 12 帧登记、5 帧 design_context、3 张截图、styles/components 各 1 次 | captain 提供 URL 并解除阻塞 |
| 本轮-C | `CONFLICTS.md` 改为"已裁决记录"；`MISSING.md` 改为"已核对 + 未判定"双栏；补 §5 风险与 §7 台账 | 用户终裁：视觉按 `DESIGN.md`，Figma 仅贡献 IA/文案 |
| 本轮-D | **更正方法论断言**（投影确实输出 `radius`/`radii`/`effects[]`/`stops[]`/`opacity`，读 `simplify.js` 核实）；记录截图同一路径陷阱；`CONFLICTS.md` §5 由"待确认"改为"裁决记录" | captain 复核指出我的断言错误 + 下达 C-14/15/16/17 与"设置页必须有"裁决 |
| 本轮-E | 收窄范围：只再采 3 帧；其余 4 帧移交 **t18（architect）**；本轮 3 帧因 429 未采，缺口记入 §8 | captain 调度裁决（避免两会话并发抢配额）+ 限流未恢复 |

## 7. 调用台账（含限流重试）

| # | 调用 | 结果 |
| --- | --- | --- |
| 1 | `figma_get_file` | ✅ 1 page / 12 frames |
| 2 | `figma_get_screenshot` nodeIds=[4:8,4:43] 同一 outputPath | ⚠️ **只留下最后一张**（4:43）；已用独立路径重渲染 4:8。**教训：截图一帧一路径** |
| 3 | `figma_get_variables` | ❌ 403 缺 scope |
| 4 | `figma_get_styles` | ✅ 0 条 |
| 5 | `figma_get_components` | ✅ 0 个 |
| 6–7 | `design_context` 4:8 / 4:43 | ✅ |
| 8–9 | `design_context` 4:223 / 4:374 | ✅ |
| 10 | `design_context` 4:478 | ✅（depth 截断 9 节点） |
| 11 | `design_context` 4:31（子节点） | ✅（当时"投影无 radius/effects"的结论**已被证伪并更正**） |
| 12 | `design_context` 4:675 + 4:1312（并发） | ❌ 429 |
| 13–15 | `design_context` 4:675（退避 45s / 150s / 240s） | ❌ 429 ×3 → 按纪律停止并上报（第一次阻塞回报） |
| 16 | `figma_get_screenshot` 4:8 | ✅ 落盘（限流前） |
| 17 | `figma_get_screenshot` 4:223 / 4:478（并发） | ❌ `fetch failed` ×2 |
| 18 | `figma_get_screenshot` 4:223 | ❌ 429 |
| 19 | `design_context` 4:675（间隔 60s 后首试） | ❌ 429 |
| 20 | `design_context` 4:675（退避 180s） | ❌ 429 |
| 21 | `design_context` 4:675（退避 300s） | ❌ 429 → 本轮重试额度用尽，收尾 |

## 8. 已知缺口（**显式记录，不假装采完**）

| 缺口 | 对象 | 归属 | 依据 |
| --- | --- | --- | --- |
| 4 帧未采 outline/截图 | `4:1204` tracking-reveal、`4:1426` report-modal、`4:1530` admin-dashboard、`63:32` certificate-panel | **t18（architect）** | captain 调度裁决 |
| 3 帧未采 outline/截图 | `4:675` public-sea、`4:966` public-sea-detail、`4:1312` profile-center | **待配额恢复**（建议并入 t18） | 本轮 60s/180s/300s 退避 + 首试共 4 次 `429`，captain 自测同 429 → token/IP 级限流 |
| 5 张截图未渲染 | `4:223`、`4:478`、`4:675`、`4:966`、`4:1312` | 同上 | 同一限流 |
| 3 个被 depth 截断的子节点文案 | `4:525`、`4:532`、`4:539` | 同上 | `design_context` depth 限制 |
| 圆角 / 阴影 / 渐变 stop 具体值 | 全站 | 非交付门槛 | 投影可取但文本渲染不打印（§5 更正）；已裁决视觉不复刻 Figma，故不影响结论 |

> 采集完成度：**12 帧中 5 帧有 outline（42%）、3 帧有截图（25%）**；但**12 帧全部在文件级 outline 中登记**，且系统级差异（颜色/字体/发光/玻璃/间距/触控/组件化）已由 5 帧取证 + 源码级工具核实支撑 —— 故 `CONFLICTS.md` 的 19 条结论仍成立，`MISSING.md` 的取证结论（无注册/选歌/投河确认/通知/徽章/设置帧、无任何状态帧）不受缺口影响。
