# Figma 缺失页面 / 缺失状态清单（MISSING）

> **状态：已核对（桌面 IA 层面完整）。** 依据 `figma_get_file` 的**全量 outline**（fileKey `epsix0MBOq2Iv8cCASg9qK`，仅 1 个 page `Page 2` #3:2，顶层 frame **恰好 12 个**，已逐一登记）+ 已成功采集的 5 帧 `design_context`。
> **可信度边界**：文件级 outline 覆盖全部 12 帧 → "某类页面/状态是否作为独立 frame 存在"是**已取证结论**；"某帧内部是否包含某功能"（如 profile-center 是否含漂流日志、public-sea 是否含我的收藏）**属于未判定**，因为 7 帧的 design_context 尚未取到（限流，见 `CONFLICTS.md` §6）。

## 1. 判定规则

| 判定 | 依据 | 后续动作 |
| --- | --- | --- |
| 存在 | 有对应顶层 frame，且已落 `frames/*.md` | 在 `CONFLICTS.md` 记录差异 |
| 部分存在 | 有页面 frame，但**无状态帧**（空态/错误/加载/权限） | 记缺口粒度，按 `DESIGN.md` §Interaction States / §Error States 自建 |
| 不存在 | 全量 outline 中无对应 frame | 上报 captain，由用户决定：补设计 / 以 `DESIGN.md` 为准自绘 / 降级 |
| 未判定 | 帧存在但内容未采集完成 | 列入待复核，**不填结论** |

## 2. 一、二级页面（对照 P0 闭环）

| # | 页面 / 流程（原文措辞 + 出处） | 判定 | 依据 |
| --- | --- | --- | --- |
| 1 | 登录（匿名）—— plan.md t11「登录」、CONTEXT.md §12 | **存在（部分）** | frame `login-anonymous` #4:8，已采集；**缺错误态**（代号生成失败/网络失败） |
| 2 | 注册 —— `CONTEXT.md` §17 账号体系（plan.md t6 账号注册/登录） | **不存在** | 全量 outline 只有 `login-anonymous`；无注册帧 |
| 3 | 首页「暖流河道」—— plan.md t11、CONTEXT.md §15 捞取规则 | **存在（部分）** | frame `home-river` #4:43，已采集；缺空态/捞取中/失败态 |
| 4 | 选歌 —— plan.md t13「可选歌 → 4 次分割 → 伴奏播放」 | **不存在** | 全量 outline 无选歌帧；Demo 段位/伴奏选择无设计 |
| 5 | 发起 / 投河确认 —— plan.md t11 流程串「发起 → 投河」 | **不存在** | 无"投瓶/投河"确认帧（`destination-modal` 是**接力完成后**的去向选择，不是发起确认） |
| 6 | 漂流瓶详情 / 接力唱段链 —— plan.md t11「捞取 → 接唱」 | **存在（部分）** | frame `bottle-detail` #4:223，已采集；缺"已被他人接走（409 冲突）"帧 |
| 7 | 接唱录制 —— plan.md t11「接唱」、CONTEXT.md §17「接唱录制，Demo 固定 4 段」 | **存在（部分）** | frame `relay-recording` #4:374，已采集；**缺麦克风权限被拒降级帧**（§12.2 移动端硬底线之一），缺未开始/暂停/超长越界态 |
| 8 | 去向三选一（继续投河/回传/入海）—— plan.md t11「去向」、CONTEXT.md §3.3 | **存在（部分）** | frame `destination-modal` #4:478，已采集；缺「确认」按钮 disabled 态（未选去向时） |
| 9 | 公海 —— plan.md t11「公海」、CONTEXT.md §6 公海机制 | **帧存在，内容未采集** | frame `public-sea` #4:675；**未判定**（限流） |
| 10 | 公海详情 —— CONTEXT.md §6.2/§6.3 | **帧存在，内容未采集** | frame `public-sea-detail` #4:966；**未判定** |
| 11 | 指定接唱未完成作品 / 听已完成作品 / 听我的收藏 —— CONTEXT.md §6.1–§6.4、§17 | **未判定** | 无独立帧；是否由 `public-sea` / `public-sea-detail` 内 tab 承载需采集后判定 |
| 12 | 追踪揭晓 —— CONTEXT.md §9.1/§9.2 | **帧存在，内容未采集** | frame `tracking-reveal` #4:1204；**未判定** |
| 13 | 个人中心（我的）—— plan.md t11「我的」侧栏项 | **帧存在，内容未采集** | frame `profile-center` #4:1312；**未判定** |
| 14 | 漂流日志 —— plan.md t11 流程串、CONTEXT.md §17「漂流日志、接力提醒」 | **未判定** | 无独立帧；**是否由 `profile-center` 承载需采集后判定**（captain 初判"profile-center 是否覆盖由你判定"） |
| 15 | 私密留言（含「未送达」）—— CONTEXT.md §5、§17 | **未判定** | 无独立帧；可能在 `bottle-detail`/`tracking-reveal`/`report-modal` 流程内，需采集后判定（已采集的 `bottle-detail` **未见留言模块**） |
| 16 | 点赞 / 点踩 / 斩杀展示 —— CONTEXT.md §7、§17「分段点赞点踩」「Demo 斩杀阈值仅用踩数」 | **不存在（独立帧）/ 未判定（内嵌）** | 无独立帧；已采集 5 帧内**未见点赞点踩控件**；其余帧未判定 |
| 17 | 举报（全链路入口 + 处理状态）—— CONTEXT.md §8、§17 | **帧存在，内容未采集** | frame `report-modal` #4:1426；**未判定** |
| 18 | 管理员人工审核台 —— plan.md t12「次级特性与管理员审核台」、CONTEXT.md §8.3 | **帧存在，内容未采集** | frame `admin-dashboard` #4:1530；**未判定** |
| 19 | 通知 / 接力提醒 —— CONTEXT.md §17 | **不存在** | 全量 outline 无通知帧；`DESIGN.md` 的 toast/z-index 契约已备，但无设计输入 |
| 20 | 徽章系统 / 留存 —— CONTEXT.md §10、§11 | **不存在** | 无徽章帧（`profile-center` 内是否含徽章未判定） |
| 21 | 公海证书面板 —— §12.3 表注「公海证书」 | **帧存在（已有 node），内容未采集** | frame `certificate-panel` #63:32（420×515）；**未判定** |
| 22 | 设置 —— `home-river` 侧栏第 4 项 | **不存在 → 已裁决补做** | 侧栏有「设置」入口，但**全量 12 帧无任何设置页 frame**＝死链风险。**captain 裁决：必须有最简设置页**（匿名账号/登出/关于），不追求设计稿；已写进 T10/T11 范围 |

## 3. 缺失状态帧（横切缺口，**已验证：全量 12 帧中不存在任何状态变体帧**）

| 状态 | 缺失范围 | 依据 | 处置 |
| --- | --- | --- | --- |
| 空态（无瓶可捞 / 无公海作品 / 无日志） | 全站 | file outline 无任何 `*-empty` 帧；已采集 5 帧亦无 | 按 `DESIGN.md` §Components「Empty States」自建 |
| 错误态（含接力冲突 409） | 全站 | 同上；`bottle-detail` 已采集确认为单一正常态 | 按 `DESIGN.md` §Error States 自建（409 必须解释 + 给两个出口动作） |
| 加载/骨架 | 全站 | 同上 | 按 `DESIGN.md`「Skeletons: Shimmer… No circular spinners」自建 |
| 麦克风权限被拒降级引导 | 录制流程 | `relay-recording` 只画了"录音中"一态 | §12.2 移动端硬底线：必须自建（桌面/移动都要） |
| hover / focus-visible / disabled | 全部交互元素 | 全量 outline 无交互状态帧 | 按 `DESIGN.md` §Interaction States 定义 |
| 表单校验错误（登录代号、举报理由等） | 登录/举报 | 同上 | 按 `DESIGN.md` §Error States 第 1 条自建 |

## 4. 结构性缺口（设计资产层面）

| 缺口 | 依据 | 影响 |
| --- | --- | --- |
| **无组件库** | `figma_get_components` → 0 组件 / 0 组件集 | T3.1 组件库只能以 `DESIGN.md` §Components 为实现源；不得声称"对齐 Figma 组件" |
| **无已发布样式** | `figma_get_styles` → 0 条（paint/text/effect/grid） | 无 Figma 样式表可映射；token 源 = `DESIGN.md` |
| **无变量表** | `figma_get_variables` → 403（缺 `file_variables:read` scope） | 同上；如后续需要，需给 MCP token 补 scope（**属 captain 决策**） |
| **无设计规范页** | 全量 outline 只有 12 个页面帧，无 design-system / spec 帧 | 间距/圆角/字号的意图只能从帧反推 → 因此 `DESIGN.md` 作为唯一规格更关键 |
| **侧栏逐帧复制** | `sidebar` 在 8 帧中重复出现同构结构 | 改动需手工同步；进一步印证"以代码组件库为准" |

## 5. 待复核（限流导致，**不填结论**）

### 5.1 移交 t18（architect）
| 帧 | node | 待判定内容 |
| --- | --- | --- |
| tracking-reveal | `#4:1204` | §9 追踪揭晓形态、是否含私密留言未送达状态 |
| report-modal | `#4:1426` | 举报对象选择与理由表单结构 |
| admin-dashboard | `#4:1530` | 审核队列结构（§8.3） |
| certificate-panel | `#63:32` | 证书内容与分享入口 |

### 5.2 本轮被 429 阻塞（未采集，非漏采；captain 自测同样 429 → token/IP 级限流）
| 帧 | node | 待判定内容 |
| --- | --- | --- |
| public-sea | `#4:675` | 三入口（指定接唱未完成作品 / 听已完成作品 / 听我的收藏）如何承载、是否有私密留言入口 |
| public-sea-detail | `#4:966` | 详情结构、是否有点赞点踩 |
| profile-center | `#4:1312` | **是否承载漂流日志**、是否含徽章/等级体系 |

> 建议：配额恢复后把这 3 帧并入 t18 一并采集（同一支队伍、同一节流纪律），避免再次出现两次并发抢配额。
