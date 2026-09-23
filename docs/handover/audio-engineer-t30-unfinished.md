# 交接：audio-engineer · t30（用户第十一轮 #1 / #3 / #4 前端 + F2 清理）

> **停机时刻**：2026-09-24 13:56（用户令 14:00 停机；captain 13:54 下达立即停机）。
> **未提交**（按 captain 令：由 captain 统一 commit）。工作区就是我停下的状态。
> **当前自洽性**：`apps/web/src/features/audio` **228 用例全绿 / 17 文件**；该目录 `eslint` exit 0、`prettier --check` exit 0、`tsc` **0 错误**。

---

## 0.0 与 HEAD 的关系（**重要**：captain 13:53 的存档提交已含我的大部分改动）

- HEAD = `1ef0647`「chore(checkpoint): 14:00 停机存档…」（13:53:19）。实测该提交里：
  - `listen-reporter.ts` 含 `checkMeasuredDuration|durationReport` 的次数 = **0**（F2 已删干净）；
  - `use-recorder.ts` 含 `presetMissing` 6 处、`recorder-panel.tsx` 含 `preset-missing` —— **fail-closed 与 `#4` UI 也已在里面**。
- **仍未提交**（13:53 之后我又改的）：`recorder-panel.test.tsx`、`use-recorder.test.ts`（fail-closed + `#4` 的新用例与断言更新）。
  这两个文件就是"最终绿"的那一版测试：`pnpm --filter @music-drift/web exec vitest run src/features/audio` = **17 文件 / 228 用例全绿**。
- ⚠️ **`1ef0647` 的提交信息里"已知包级红: … measuredDurationMs(t28 残留,t30)"已经过期**：那条链路在**同一个提交里**就已经删掉了
  （依据：上面第 2 条实测）。下一次 checkpoint 请按 `features/audio` 0 红重写这句。

## 0. 一句话状态

| 项                                                            | 状态                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `#1` 播放完成后再点=重播 / 未播完再点=暂停 + 可见反馈         | ✅ 完成（含真实浏览器端到端证据）                                         |
| `#3` 录制后试听（本地产物、不依赖上传）                       | ✅ 完成（含真实浏览器端到端证据）                                         |
| `#4` 录制端固定时长 UI（本段 N 秒 / 录满自动停 / 提前停提示） | ✅ 组件层完成；**页面未接线**（见 §4，一行改动，属 frontend-flow 域）     |
| 清理 t28/F2 作废产物（`measuredDurationMs` 链路）             | ✅ 已删干净（`features/audio` 里 0 残留；全仓 typecheck 在我目录内 0 红） |
| fail-closed 对齐（不再"无预设回退 30 秒"）                    | ✅ 已完成（hook + UI 双层拦住，连麦克风都不开）                           |
| 额外发现并修掉：`/listen` 浮点导致真实浏览器 **400**          | ✅ 已修 + 真实浏览器复测 21/21 全 200                                     |

---

## 1. `#1` 播放/重播/暂停（完成）

**改的文件**：`apps/web/src/features/audio/use-segment-player.ts`、`segment-player.tsx`（+ 两个测试文件）。

- 显式状态机 `idle | playing | paused | ended`，判定优先级：`ended`（`ended` 事件置 `atEndRef`）> `paused` > `idle`；
- `toggle()`：`playing` → 暂停；**`ended` → `currentTime = 0` + `tracker.markSeek()` + 播放**；其余 → 播放/继续；
- UI 三重反馈：按钮文案+图标（播放/暂停/继续播放/**重新播放**）、`aria-live="polite"` 状态文字
  （还没播放/正在播放/已暂停（再点继续播放）/本段已播完，点击「重新播放」从头再听一遍）、
  状态文字上 DS 的 `enter-fade`（`key={playbackState}` 让状态一变就重播一次淡入；只动 opacity，reduced-motion 由 DS 全局关闭）；
- 测试：`use-segment-player.test.ts` + `segment-player.test.tsx` 共 8 条状态机/文案用例。

**真实浏览器证据（一次性探针，未入库）**：录 20 秒 → 真上传 → 真投河 → 非持有者视角播放真实 webm（`duration 20.04`）：
点播放 `paused=false, currentTime 0.735` → 再点 `paused=true` 且文案「已暂停」→ 播到结尾 `currentTime 20.04 / duration 20.04` 且文案「本段已播完」→ 点「重新播放」→ `currentTime 0.986` 且 `paused=false`（**从头真的在播**）。

## 2. `#3` 录制后试听（完成）

**改的文件**：`use-recorder.ts`、`recorder-panel.tsx`、`recorder-environment.ts`（+ 测试、+ 新 `recorder-environment.test.ts`）。

- 录完立刻准备试听：本地 Blob → `URL.createObjectURL` → 游离 `new Audio()`（**不经服务端、不依赖上传成功**）；
- 按钮文案与状态文字与 `#1` **同一套语义**（试听本段/暂停试听/继续试听/重听本段）；
- **两个端口都拿到才暴露 `previewUrl`**：拿不到（宿主不支持/策略禁用）就安静地不给按钮 —— 绝不给"点了没反应"的按钮；
  变异证明：临时移除 `createPreviewElement` → `recorder-environment.test.ts` 转红；
- 生命周期：重录/卸载/换录都 `pause()` + `revokeObjectURL()`；
- 试听状态文字带 `enter-fade`。

**真实浏览器证据（同上探针）**：录 4 秒 → 点「试听本段」→ `paused=false, currentTime 0.92, duration 3.84`（**真的在放**）→ 暂停 → 听完 → 文案「听完」+ 按钮变「重听本段」→ 点击后 `currentTime 0.78` 且 `paused=false`。

## 3. `#4` 录制端固定时长 UI（组件完成 / 页面未接线）

**改的文件**：`use-recorder.ts`（`presetDurationMs` / `presetToleranceMs` / `presetMissing` / `blockedReason`）、`recorder-panel.tsx`。

- 有本段时长：「本段 20.6 秒（与这段伴奏等长，允许 ±2.0 秒）」，计时分母显示 `20.6`，**不再出现**"15–30 秒"；
- 录制中：「录制中 00:05 / 20.6」+「还差 15.6 秒录满本段（允许 ±2.0 秒）」；
- **录满自动停**：`autoStopMs = presetDurationMs`；到点后状态「已录 00:20 / 20.6」，「用这一段」可用；
- 提前停超出 ±2 秒：warning 用共享函数原文（含"本段固定时长 / 相差 X 秒 / 允许 ±2.0 秒"），「用这一段」禁用；
- 判定与上传客户端、服务端读**同一个函数 + 同一个容差**（`checkRecordingDurationAgainstPreset` + `SEGMENT_PRESET_TOLERANCE_MS`）。

**⚠️ 页面未接线（一行，属 frontend-flow 域，我未越界改）**：
`features/bottle/record-step.tsx` → `RecorderPanel` 需要传

```tsx
presetDurationMs={song.segments.find((s) => s.index === segmentIndex)?.durationMs ?? null}
```

数据源已存在（`GET /api/songs` 的 `SongSegmentSchema.durationMs`），**不需要新契约字段**。
未接线时面板是**禁用录制 + 说明原因**（fail-closed，见 §5），不会静默按 30 秒录。

## 4. fail-closed 对齐（完成）

- `use-recorder.ts`：删除"无预设回退 `SEGMENT_MAX_MS`（30 秒）"这条**行为**；`presetMissing` 为真时
  `start()` 直接返回（**连 `getUserMedia` 都不调用**，不让用户看到"正在录音"却注定 422），并给 `blockedReason`；
- 时长判定不再有"15–30 区间"这套第二分母（`checkRecordingDuration` 已从该文件移除引用）；
- `recorder-panel.tsx`：`presetMissing` → 「开始录制」**禁用** + warning 说明（"这一段还没有登记固定时长（曲库数据缺失）…换一首歌，或者稍后再来。"），
  并用 `aria-describedby` 把说明挂到按钮上（不用 `role="status"`，避免与"时长不合格/上传进度"两处状态区冲突）；
- 测试：hook 3 条 + panel 1 条（含"完全不占用麦克风"与"aria-describedby 指向说明"）。

## 5. t28 / F2 作废清理（完成）

**删了哪些**（`apps/web/src/features/audio/`，均无残留）：

| 删除项                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listen-reporter.ts`：`checkMeasuredDuration`、`MEASURED_DURATION_BOUNDS`、`MeasuredDurationContext`、`MeasuredDurationReport`、`MeasuredDurationDirection`、`state.durationReport`、`maybeReportMeasuredDuration`、`durationReported` 标志、`readDirection`、传输层的 `reportMeasuredDuration`、选项 `declaredDurationMs` |
| `use-segment-listen.ts`：`fetchListenTransport` 里的 `POST /api/segments/:id/duration`、初始 state 的 `durationReport`                                                                                                                                                                                                     |
| `use-segment-player.ts`：`measuredDurationMs`（结果 + 快照）、`readMeasuredDurationMs`、`loadedmetadata` / `durationchange` 监听                                                                                                                                                                                           |
| `segment-player.tsx`：`SegmentListenSnapshot` 的 `measuredDurationMs` / `declaredDurationMs`                                                                                                                                                                                                                               |
| 26 条只服务于上述能力的用例                                                                                                                                                                                                                                                                                                |
| `docs/audio.md` §9 改写为「F2 已作废 + 删除清单 + 保留清单」（§10 新增 t30 记录）                                                                                                                                                                                                                                          |

**保留了哪些、为什么**：`state.serverDurationMs` / `serverRatio` 与 `/listen` 响应解析（服务"本地门槛即时反馈"，与 F2 无关）；
`ListenProgressSnapshot`（只剩 `coveredMs`，覆盖率上报是 t20/t21 的防自欺通道）。
**读 `element.duration` 的能力一并删掉**（结论：没有独立价值 —— 不参与覆盖率判定，也没有任何上报出口）。

**typecheck 现状（重要，architect 的 t31 在等）**：`pnpm -r typecheck` 目前仍 **exit 2**，但红点**不在**我的目录：
`grep -c 'features/audio' → 0`；剩余红点在 frontend-flow 在途文件（`features/api/mutations.ts` 的 `Collection` 未导出、
`features/bottle/relay-timeline.tsx` 的 Icon size `14` 等，13:43–13:44 仍在写）。**F2 这条已不是红点。**

## 6. 顺带修掉：`/listen` 真实浏览器 400（**这条与 t30 无关但是真缺陷**）

- 现象：真 Chromium 跑完整链路，`POST /api/segments/:id/listen` **21 次全部 400**，响应体
  `{error:{message:"请求内容不合法，请检查后重试。",violations:[]}}`（violations 还是空的，光看响应体查不出原因）；
- 根因：`coveredMs` 来自 `currentTime * 1000`（浮点），契约 `SubmitListenProgressRequestSchema` 是 `z.number().int().nonnegative()`；
  后果不是"少报一点"，而是**覆盖率永远推不上去 ⇒ 点踩门槛永远不满足**；
- 为什么单测没抓住：假传输层 `Math.floor` 掉了浮点 —— 修复后新增用例**直接拿真实契约 schema 校验实际请求体**；
- 修法：`observe()` 里唯一一处归一化点**向下取整**（宁少报不多报）；
- 复测：真实浏览器 **21 次 /listen 全部 200**，且 `POST /api/segments/:id/duration` **一次都没再被调用**（F2 清理的可见证据）。

## 7. 下一步（等用户「继续」后）

1. **交接 frontend-flow**：#4 的一行接线（§3），否则录制页处于"禁用录制"状态；接线后建议我再跑一次真实浏览器探针（把 §1/§2 的证据在"有预设"的新路径下重放一遍）；
2. 把 §1/§2 的一次性浏览器探针**是否入库**请 captain 裁决（现在它在仓库外的 `D:/music-rec-probe/probe.mjs`，用 Playwright npx 缓存 + 一次性库；
   AGENTS.md §7 规定 E2E 工具属待裁决项，所以我没入库）；
3. `docs/audio.md` §10.3 的"联调待办"在接线后改成"已验证"（**不要把现在写成已验证**）；
4. t30 收尾提交由 captain 统一做。

## 8. 证据命令（可复现）

```bash
pnpm --filter @music-drift/web exec vitest run src/features/audio   # 17 文件 / 228 用例全绿
pnpm exec eslint apps/web/src/features/audio                        # exit 0
pnpm exec prettier --check apps/web/src/features/audio               # exit 0
pnpm -r typecheck                                                   # 当前 exit 2，红点全在 frontend-flow 在途文件（features/audio 0 红）
node D:/music-rec-probe/probe.mjs                                   # 一次性真实浏览器探针（仓库外）：ALL PASS
```
