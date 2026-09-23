# t14 端到端验证报告（qa-e2e · 2026-09-24）

> 任务：t14「端到端验证：黄金路径 + 多浏览器接力 + 并发抢占」（plan.md 切片 6，S4）
> 结论：**黄金路径与并发不变量全绿；发现 2 个真实缺陷（1 个 P0/HIGH 静默失败，1 个跨引擎回放风险）**。
> 原始输出：`docs/e2e/t14-browser-run.log`（53 条断言 · 通过 50 · 失败 3）；一次性探针在**仓库外** `D:/music-e2e-probe/`。

---

## 0. 三层分开报（每层各自的真实退出码）

| 层 | 命令 | 退出码 | 真实输出 |
| --- | --- | --- | --- |
| 单测 / jsdom | `pnpm -r test` | **0** | `packages/shared: Test Files 21 passed (21) / Tests 231 passed (231)`；`apps/api: Test Files 19 passed (19) / Tests 180 passed (180)`；`apps/web: Test Files 61 passed (61) / Tests 510 passed (510)` ⇒ **101 文件 / 921 例** |
| 类型检查 | `pnpm -r typecheck` | **0** | `packages/shared typecheck: Done` / `apps/api typecheck: Done` / `apps/web typecheck: Done` |
| 静态检查 | `pnpm lint` | **0** | `$ eslint .`（无输出 = 0 problem） |
| 集成（真 Postgres） | `pnpm --filter @music-drift/api test:integration` | **0** | `Test Files 22 passed (22) / Tests 177 passed (177)` |
| **真浏览器（本报告）** | `node D:/music-e2e-probe/t14-probe.mjs chromium cap golden race-claim race-river webkit` | **1** | `[summary] 断言 53 条 · 通过 50 · 失败 3` · `[result] FAILED: 3` |

**这四行绿的两层证明不了真浏览器里的行为** —— 本会话已经有过一次教训（`/listen` 的 `coveredMs` 浮点 400：
单测、集成、28 步脚本级自检全绿，但真浏览器里 21 次上报全部 400，点踩功能实际不可用）。下面第 4 节就是
**这一层单独抓到的第二个同类缺陷**。

---

## 1. 真浏览器怎么跑的（复用既有配方，不重造）

完全复用 `docs/handover/browser-probe-recipe.md` 的五个要点：
① 真 Chromium/WebKit + 假麦克风（`--use-fake-device-for-media-stream` + `grantPermissions(['microphone'])`）；
② 一次性库（`live-check.ts create/drop/sweep`）；③ 一次性 API；④ `mdb_session` cookie 注入；
⑤ 挂钩 `window.Audio` 构造器抓游离的 `<audio>`。

**一处有意偏离（并说明理由）**：配方用「自起 vite dev server + 安静窗口纪律」对付 HMR，
本探针改为 **`vite build` → 仓库外 `D:/music-e2e-probe/dist` → 自建静态服务 + `/api` 反代**。理由：
派单时 `frontend-ds` 正在改 `apps/web/src/design-system/**`（`find -newermt '-6 minutes'` 持续有命中），
dev server 下"通过与否取决于别人此刻在不在写文件"。静态构建把 HMR 这个变量**整条去掉**，
顺带多证明一件 dev server 证明不了的事：**打出来的产物本身可用**（`vite build` exit 0）。
构建输出写在**仓库外**，保持"脚本只读仓库"这条纪律（`git status` 复核：未改任何仓库源码）。

---

## 2. 黄金路径（两账号 × 两窗口 × 真表单 × 真录制）—— 全绿

`INFO [setup] 本次运行使用的曲目 —— 占位曲目 · 一（4 段）`（每段固定 20.0 秒）

```text
PASS  [golden] A 在真表单里注册成功并跳回首页（注册即登录）  —— /
PASS  [golden] A 在选歌页拿到可发起的曲目  —— 可选曲目 3 首
INFO  [golden] A 发起  —— bottleId=d6cf66e0-0c54-4c62-92d3-0d53ffe89dca
INFO  [golden] A 录制面板的固定时长  —— 本段 20.0 秒（与这段伴奏等长，允许 ±2.0 秒）。 录满会自动停止…
PASS  [golden] A 录满自动停（不点「停止录制」，等「用这一段」自行出现）  —— true
PASS  [golden] A 投河后页面明确播报结果（不是静默成功）  —— 已投河：等下一位陌生人捞到它。
PASS  [golden] 前置条件：A 投河后河道里只有这一支瓶子（B 必然捞到它，不是靠运气）  —— IN_RIVER 共 1 支：d6cf66e0…
PASS  [golden] B 从河道捞到的正是 A 投的那一支（两账号两窗口接力成立）  —— B 捞到 d6cf66e0… / A 投出 d6cf66e0…
PASS  [golden] B 拿到真实音频元素（src 指向 /api/ 的段音频）  —— index=0
PASS  [golden] B 能解码 A 用真麦克风录的 WebM（duration 有限且 ≈20 秒）  —— 560ms 后 {"duration":19.92,"readyState":4,"err":null}
PASS  [golden] B 点播放后真的在响（paused=false 且 currentTime 持续前进）  —— 1.2s: {"paused":false,"currentTime":0.518037} → 2.7s: {"paused":false,"currentTime":2.094055}
PASS  [golden] B 录满自动停  —— true
PASS  [golden] B 入海后瓶子状态真的到了 SEA（真库核对，不只看页面文案）  —— status=SEA
PASS  [golden] 公海大厅有「等待接力」（未完成区）分区入口
PASS  [golden] B 在公海「等待接力」区看到这支未完成作品  —— 匹配卡片 1 个
PASS  [golden] 漂流日志页列出接力事件（≥2 条：投河 + 接唱 + 入海）  —— 事件条数 6
PASS  [golden] 漂流日志只露匿名代号（不泄账号）  —— 含 handleA=false 含 handleB=false
PASS  [golden] A 的「我的」页认领到这支瓶子  —— 页面长度 314
PASS  [golden] 黄金路径整轮无"非预期" 4xx/5xx  —— 共 32 条 API 响应；其中预期内 2 条
PASS  [golden] 覆盖率上报 /listen 真的被接受（t30 修的浮点 400 没有回归）  —— 3 次，状态 200
PASS  [golden] 黄金路径无页面级 JS 异常  ——
```

覆盖了 t14 要求的全部环节：注册/登录 → 发起 → 投河 → 另一账号捞取 → 接唱 → 选去向 → 公海 → 漂流日志，
**且两窗口是真表单、真假麦克风录制（`duration=19.92` 是真实可解码 WebM），不是脚本塞的假字节**。

**一个必须讲清的口径**：`401 GET /api/auth/me ×2` 是**契约行为**，不是缺陷 ——
`apps/web/src/features/api/queries.ts` 的 `useMeQuery` 显式把该 401 映射成 `null`（= 未登录），
登录闸门就靠它渲染。所以断言写成"**非预期** 4xx 为 0 + 唯一的 4xx 必须是 `/api/auth/me`"，
而不是把 4xx 一律放过（那会把 t30 那种 400 一起放过）或一律算红（那是假红）。

---

## 3. 并发抢占 —— 产品不变量全绿（6/6）

**不变量成立**（这是 §3 的核心，也是派单点名要验的）：

| 场景 | 结果 |
| --- | --- |
| 河道 `draw`（河道恰好 1 支，两人同刻） | 3/3 轮：**恰好 1 人拿到**；活跃持有者 1 人；空手方 **409 `HOLDING_ALREADY_TAKEN`** |
| 指定接唱 `targeted-segment`（同一支瓶子，两窗口同刻点击） | **活跃持有者恰好 1 人**、`isHolder` 互斥（C=true D=false） |
| 同刻两个 `draw`（HTTP 对照实验） | 1×200 + 1×409 `HOLDING_ALREADY_TAKEN`；活跃持有者 1 人 |

```text
PASS  [race-river] 第 1/3 轮 两人同刻捞取、河道只有一支 → 只有一人拿到它  —— X=/bottles/036e90ca…（拿到=true） Y=/river（拿到=false）
INFO  [race-river] 第 1/3 轮 输的一方的响应  —— 409 POST /api/river/draw code=HOLDING_ALREADY_TAKEN
PASS  [race-river] 第 1/3 轮 空手的一方看到"已被别人拿走"的解释，而不是静默失败/通用报错
PASS  [race-river] 第 1/3 轮 空手的一方拿到 409 + 稳定码 HOLDING_ALREADY_TAKEN（前端据此渲染冲突视图）
PASS  [race-river] 第 1/3 轮 真库核对：活跃持有者恰好 1 人
```

**`river/draw` 这条是标杆**：唯一持有者由 DB 部分唯一索引裁决，失败方拿到稳定码 + 可见文案
（「这一段已被别人接走 / 这个漂流瓶已经被别人拿走了，换一个吧。」+ 两个出口动作）。
**下面第 4 节说的是同一个语义在另一个端点上没做到。**

先记一条我自己的错（留痕，避免下次重犯）：第一轮我把空手方的期望写成
「河道里暂时没有可以捞的瓶子」并判红 —— 那**是我的断言错了**：候选集查询与抢占不是同一个原子操作，
DB 唯一索引才是裁决者，所以并发失败的正确文案是 `HOLDING_ALREADY_TAKEN` 那套（`docs/api.md` §2.4 写得很清楚）。

---

## 4. 【P0/HIGH】`POST /api/sea/:id/targeted-segment` 抢占失败时返回 **200 + 摘要** ⇒ 前端静默失败

### 4.1 现象（真浏览器，4/4 次复现）

两个窗口同时点「我来接这一段」。最终这一轮：

```text
INFO  [race-claim] 窗口 C（rcmue1w0289rb4 / ed59d2f7-…）终态  —— url=/bottles/d6cf66e0…
   … +1136ms 200 POST /api/sea/d6cf66e0…/targeted-segment
        respBody={"id":"d6cf66e0…","seaZone":null,"isHolder":null,"status":"HELD","error":null}
   … +1167ms 404 GET /api/sea/d6cf66e0…
INFO  [race-claim] 窗口 D（rdmue1w0a7cc38 / cc9093ea-…）终态  —— url=/bottles/d6cf66e0…
   … +1141ms 200 POST /api/sea/d6cf66e0…/targeted-segment
        respBody={"id":"d6cf66e0…","seaZone":null,"isHolder":null,"status":"HELD","error":null}
INFO  [race-claim] 服务端视角  —— C: status=HELD isHolder=true holderId=ed59d2f7-…
                              D: status=HELD isHolder=false holderId=ed59d2f7-…
                              DB 活跃持有者=[{"holder_id":"ed59d2f7-…","handle":"rcmue1w0289rb4"}]
INFO  [race-claim] 窗口 D 页面文字尾部  —— …第 2 段：赞 0，踩 0 你的这一步
                              这个瓶子现在不在你手上（同一条河道同一时刻只有一个人拿着它）。去河道捞一个…
FAIL  [race-claim] 输的一方看到可见解释（不是"点了没反应"）
```

**读出来的三条事实**：
1. **两个窗口都收到 HTTP 200**（`respBody` 是同一支瓶子的摘要）；D 的摘要 `status=HELD` 说明这份摘要是
   **赢家已经写完之后**读的 —— 也就是说"抢失败"这件事对客户端**完全没有信号**。
2. `TargetedSegmentButton` 在 `.then()` 里 `navigate(\`/bottles/${id}\`)`（组件注释：
   「成功后**直接导航**」）⇒ **输的一方被导航走了**，落在瓶子页，只看到
   「这个瓶子现在不在你手上」—— 既没有解释为什么，也没有出口动作。
3. **数据不变量没坏**：活跃持有者恰好 1 人、`isHolder` 互斥（这两条断言都是 PASS）。
   坏的是**信号**，不是数据。

### 4.2 根因（代码，已定位）

`apps/api/src/routes/sea.ts:124-131`：拿到 `takeTargetedSegment` 的结果后**从不检查 `outcome.ok`**，
直接 `reply.send(toBottleSummary(...))`：

```ts
const outcome = await options.store.takeTargetedSegment({ … });
if (outcome === null) { return sendProblem(reply, transportProblem('NOT_FOUND')); }
const row = await options.store.findBottle(params.data.id);
const next = await options.store.loadState(params.data.id);
return reply.send(toBottleSummary(row, next, await songTitleOf(row.songId)));   // ← 不看 outcome.ok
```

**同一个 store 的另一个消费者做对了**（`apps/api/src/routes/river.ts:65-71`）：

```ts
if (!drawn.ok) {
  const problem = problemFromOutcome(drawn);
  return problem === null ? reply.send({ bottle: null }) : sendProblem(reply, problem);   // ← 409 HOLDING_ALREADY_TAKEN
}
```

而 `store.takeTargetedSegment` 在冲突时返回的**正是** `HOLDING_ALREADY_TAKEN`
（`store/bottles.ts:686-695`）。也就是说：**store 判对了、码也给了，路由把它丢了。**

### 4.3 另一条独立复现（HTTP，确定性）：失败方拿到的是 **404「找不到这个资源。」**

追这条时另写了定点实验（只起一次性库 + API，`node D:/music-e2e-probe/claim-race.mjs`，`[result] ALL PASS`），
把并发/串行两种交错都摊开：

```text
[exp-1] 两个不同用户同刻 claim 同一支公海未完成作品
    u1 POST: 200 code=null msg=null
    u2 POST: 404 code=null msg=找不到这个资源。
    抢后 holdings=[…{"holder_id":"830c0aca-…","origin":"DRAW","released_at":null}]
    抢后 bottle={"status":"HELD","current_holder_id":"830c0aca-…"}

[exp-4] 6 个用户同刻 claim（放大并发窗口）
    6 个响应的状态码：[200,404,404,404,404,404]
    活跃持有者 1 人
    每人视角（收到的状态码 vs 服务端认定的持有者）：
      [{"i":0,"status":200,"isHolder":true},{"i":1,"status":404,"isHolder":false}, …]

[exp-3] 对照组：两个用户同刻 POST /api/river/draw
    d1 draw: 200
    d2 draw: 409 code=HOLDING_ALREADY_TAKEN msg=这个漂流瓶已经被别人拿走了，换一个吧。
```

**所以这个端点在竞争失败时给的是"200 或 404"，**两者的共同点是**都不是** `docs/api.md` §2.4/§2.5
写的 `409 HOLDING_ALREADY_TAKEN`：
- 读状态**早**（还没看到赢家提交）⇒ 守卫通过、抢占失败、但路由回 **200**（§4.1 的静默失败）；
- 读状态**晚**（赢家已提交、瓶子已变 `HELD`）⇒ 守卫在 `seaZoneOf(state) === null` 处短路 ⇒ **404「找不到这个资源。」**
  —— 对用户说的是"这东西不存在"，而事实上它**存在、只是刚被别人接走**。

### 4.4 影响与建议（**不自行修改，交 captain/backend-core 定夺**）

- 影响面：公海未完成区「我来接这一段」在**并发**下会静默失败（用户被导航到一个说自己"不在你手上"的页面）。
  单用户串行点击时表现为 404「找不到这个资源。」（误导，但不致命）。
  数据不变量未破坏（不会出现两个持有者）。
- 违背的既有契约：`docs/api.md` §2.4「并发 `draw`/`claim` 时只有一个成功，其余返回 409 `HOLDING_ALREADY_TAKEN`」；
  以及该组件自己的文档口径「失败**必须可见**：被拒时给出服务端的中文原因与出口动作 —— 静默 `catch`
  等于'点了没反应'」。
- 建议（一行级）：在 `sea.ts` 的 claim 分支补 `if (!outcome.ok) { return sendProblem(reply, problemFromOutcome(outcome)); }`，
  与 `river.ts` 对齐；并补一条**并发**集成测试（现有集成测试是串行语义，所以没抓到）。
- 需要人裁决的部分：404 那一条要不要也改成 409（涉及「不在公海 → 404，避免探测」这条既有决策），
  属于契约口径变更 ⇒ **不自行决定**，上报 captain。

---

## 5. 【MEDIUM/风险】多浏览器（WebKit）：能验的验了，**录制面无法验证**，且发现跨引擎回放失败

### 5.1 事实（实测，不是推断）

```text
INFO  [cap] WebKit 运行时能力实测  —— {"secure":true,"hasMediaDevices":false,"hasGUM":false,"hasMediaRecorder":false,…}
PASS  [webkit] WebKit：河道页正常渲染（第二引擎不白屏）  —— 页面长度 276
PASS  [webkit] WebKit：浏览器不支持录音时页面明确说明（"这个环境暂时无法录音"），而不是给一个点了没反应的按钮
PASS  [webkit] WebKit：不支持时「开始录制」禁用（fail-closed，不是"点了才知道"）  —— 按钮存在且 disabled=true
INFO  [webkit] WebKit `canPlayType` 实测（空串 = 明确不支持）  —— {"webmOpus":"probably","webm":"probably","mp4Aac":"probably","ogg":""}
INFO  [webkit] WebKit 音频元素 src  —— /api/segments/086ef358-…/audio
FAIL  [webkit] WebKit：能解码 Chromium 录制的 WebM/Opus（D-10 的 Safari 播放风险面）
      —— {"duration":null,"readyState":0,"err":4} · 回放页请求=… 206 GET /api/segments/086ef358-…/audio
FAIL  [webkit] WebKit：点播放后真的在走（两段采样显示 currentTime 持续前进）
      —— 1.5s: {"paused":true,"currentTime":0} → 3.0s: {"paused":true,"currentTime":0}
```

三条结论：

1. **`D-10「Chromium + WebKit 双必须」的录制面，在本机无法验证 —— 如实标注，不假装通过。**
   本机 Playwright 1.63 的 WebKit 构建**连 `navigator.mediaDevices` 都没有**（安全上下文 `true` 也照样没有），
   所以不是"参数没配对"，是这个构建没有媒体采集能力。要真验"Safari 能不能录"，
   需要 macOS 上的真 Safari（或 Safari Technology Preview）—— 本机没有，**未验证**。
2. **能验的 fail-closed 行为是对的（PASS）**：录音不可用时页面明确说
   「这个环境暂时无法录音。这个浏览器没有提供麦克风接口（`navigator.mediaDevices.getUserMedia`）。
   请改用较新版本的 Chrome、Edge 或 Safari 再试。」且「开始录制」`disabled=true`。
   这符合项目自己的纪律（不给一个点了没反应的按钮）。
3. **跨引擎回放：WebKit 自报"能放"，实际放不了。** `canPlayType('audio/webm;codecs="opus"')` 返回
   **`"probably"`**，但同一浏览器里对同一个 URL（`206` Range 请求成功取回字节）的 `<audio>` 报
   **`err=4`（`MEDIA_ERR_SRC_NOT_SUPPORTED`）**、`duration=null`、点播放 `currentTime` 不动。
   **影响面**：社区里 Chromium 系（webm/opus）录的段，Safari 系用户可能**听不到**（这正是 D-10 担心的面）。
   **谨慎口径**：这是**本机 Playwright WebKit 构建**的实测；真机 Safari 是否同样失败**未验证**
   （可能是这个 Windows 端口缺 Opus 解码器）。**建议**：由 captain 决定是否派单在真机 Safari 上复测；
   在复测之前**不要把这条写成"产品缺陷已确认"**。

### 5.2 我自己踩的一个坑（留痕）

第一版把回放夹具选成了"已经被某人持有（HELD）"的瓶子 ⇒ 陌生人在那支瓶子上**看不到任何可播段**
（CONTEXT §9.1：漂流中只能听到自己这一棒之前的部分）⇒ 我一度把它当成"WebKit 解码失败"。
**那是夹具错了，产品行为是对的。** 现在夹具改成"公海上的作品 + Chromium 真麦克风录的 321974 字节真实音频"，
并且断言里带上了"回放页实际发出的请求"，用来区分"解码失败"与"根本没请求"。

---

## 6. 前端四个项目级 skill 条款核对（逐条引原文）

按纪律逐个 load，并只用**与本层（真浏览器）相关**的条款：

| skill | 条款原文（引用） | 本层能证明什么 / 抓到什么 |
| --- | --- | --- |
| `motion-web` | §8「**只有真实浏览器**（含录屏或性能采样）能证明"屏幕上的表现"」；「若某层无法验证，**明确写出来**（"此项需真机/录屏"），不要含糊过去」 | 本报告第 5 节就是这条纪律的执行：WebKit 录制面**明确写"未验证"**，不写"通过" |
| `motion-web` | §7「**动效不得是唯一反馈**：状态变化要同时有**文字 / 结构变化 / `aria-live` 播报**。只用颜色或只用动效，对视障与色觉障碍用户等于没有反馈」；§9「❌ 动效作为唯一反馈（无文字、无 `aria-live`）」 | **第 4 节那条缺陷正是这条的反面**：抢失败时既无文字、也无 `aria-live`、也无出口动作 —— 失败对用户**不存在** |
| `motion-web` | §8「**静态扫描**能证明"只用了允许的属性/引用了 token"，**不能**证明流畅度」；§9「❌ 把"看起来顺"当作验证结论」 | 我没有对动效下"顺不顺"的结论；本层只断言状态机与真实音频行为，**视觉平滑度仍未验证**（需录屏/性能采样） |
| `css-animation-creator` | Workflow 5「Constrain animated properties to `transform` and `opacity` for GPU acceleration.」；6「Honor reduced-motion preferences for every animation.」 | 这两条是**静态可断言**的（仓库已有 `motion-usage.test.ts` 静态扫描钉住），本层不重复；本层未观测到因动效导致的交互阻塞（点击→响应 ≤ 1.2s，见第 4.1 时间戳） |
| `frontend-design` | 「**Errors don't apologize, and they are never vague about what happened.**」「Explain what went wrong and how to fix it, in the interface's voice」 | **第 4 节缺陷的直接判据**：失败方只看到「这个瓶子现在不在你手上」，**既没说什么错了、也没说怎么办** —— 正属于 "vague about what happened" |
| `frontend-design` | 「Treat failure and emptiness as moments for direction, not mood.」 | 同上：并发失败既没有方向（出口动作），也没有解释 |
| `afrexai-ui-design-system` | Phase 8 评分表 Interaction design 10%「Hover/active/focus/loading states defined? **Feedback for actions?**」；Quick checklist「**Error states are helpful (not just "Error")**」 | 第 4 节 = "feedback for actions" 缺失；第 4.3 节的 404「找不到这个资源。」= 不 helpful 的错误态 |
| `afrexai-ui-design-system` | Phase 7 Understandable「Error messages identify the field and **suggest correction**」 | 同上 |
| `afrexai-ui-design-system` | Phase 6 `breakpoints`（sm 640 / md 768 / lg 1024 / xl 1280） | **本层未验证移动端断点**（t14 原始范围含"移动端断点回归"，本次只跑了 1440×900；375px 由 `docs/ui-review` 的截图证据覆盖）⇒ **明确列为未完成项**，见第 7 节 |

> 说明：`motion-web` §6 的「若动画与音频/媒体同步，**以媒体时间为准**」在黄金路径里被间接验证
> （`/listen` 上报 3 次全 200、`duration=19.92`、`currentTime` 两段采样持续前进）；
> 但**动效观感/流畅度**这一层**仍未验证**（无录屏、无性能采样）。

---

## 7. 未完成 / 未验证（不含糊）

| 项 | 状态 | 原因 |
| --- | --- | --- |
| **移动端断点回归（375px 等）** | **未执行** | t14 原始范围包含它；本次真浏览器只跑了 1440×900。仓库另有 `apps/web/tools/one-screen-check.mjs`（几何量测）与 `docs/ui-review` 截图证据覆盖 375/1440 —— 但**不是本探针跑的**，我不把它算成本次的证据 |
| **WebKit 真录制** | **未验证** | 本机 Playwright WebKit 构建无 `navigator.mediaDevices`（第 5.1 节）。需真机 Safari |
| **动效观感 / 流畅度** | **未验证** | 需真机录屏或性能采样；本层只证明状态机与真实音频行为 |
| **Firefox 引擎** | **未执行** | 本机未安装；`WebKit + Chromium` 已满足"至少两个引擎"，未扩到第三个 |
| **t12 次级特性（留言 / 斩浪 / 举报 / 收藏 / 徽章 / 通知 / 管理员台）** | **未纳入本次真浏览器** | 其 UI 任务 t12 状态为 `failed`（见 team.json），不在 t14 的黄金路径范围；斩浪/举报的**服务端**规则有集成测试与 28 步脚本覆盖 |
| **间歇红** | **无** | 本次未观察到间歇失败；第 4、5 节的 3 条红**每次都复现**（race-claim 4/4 次浏览器运行、webkit 回放 2/2 次） |

**没有加任何自动重试**：探针里没有"失败就重试"的代码；唯一的 `waitForFunction` 是**有界等待一个异步条件**
（等媒体元数据加载完），超时就判红并报出等了多久 —— 这是观测异步状态机的正确方式，不是掩盖失败。
另外，本轮为把"点了没反应"这类断言改准，改过两处**我自己的**断言口径，两处都在报告里留了痕与理由
（第 3 节末尾的 `NO_BOTTLE_AVAILABLE` → `HOLDING_ALREADY_TAKEN`；第 5.2 节的夹具选错）。
**没有为了变绿而放松任何一条产品断言** —— 第 4、5 节的 3 条红就是证据：它们红着，被保留下来了。

---

## 8. 复现方式（别人可以自己跑一遍）

```bash
# 前置：本机 PostgreSQL 容器在 5433（docker-compose up -d），Node ≥22.12
# 一次性探针在仓库外；只读仓库、不改仓库
node D:/music-e2e-probe/t14-probe.mjs chromium cap golden race-claim race-river webkit
#   engine : chromium | webkit
#   phase  : cap golden race-claim race-river webkit（默认全部）
#   T14_SERVE=dev 可退回 vite dev server（会重新引入 HMR 干扰，仅在需要时用）
#   [result] ALL PASS + 退出码 0 = 全通过；有 FAIL 时退出码 1，并在末尾汇总失败项

# 并发抢占的定点 HTTP 实验（只起一次性库 + API，快）
node D:/music-e2e-probe/claim-race.mjs
```

探针会自己建一次性库、自起 API、`vite build` 到仓库外并起静态服务，**跑完删库**
（`[teardown] 删库 music_drift_test_… → 已删除`）。**不要对着 8787 的 dev 库跑**：那里有别人的数据，
"通过与否取决于运气"（t19 Finding 1b 的老账）。

---

## 9. 给 captain 的三件事（需要裁决 / 派单）

1. **【P0/HIGH】第 4 节：`POST /api/sea/:id/targeted-segment` 抢占失败返回 200 + 摘要，前端静默失败。**
   store 判对了、码也给了，是**路由丢了 `outcome.ok`**（`sea.ts:124-131`，对照 `river.ts:65-71` 的正确写法）。
   我**未改任何产品代码**（超出 t14 范围，且这是 backend-core 的域）。请派单修 + 补**并发**集成测试。
2. **【需裁决】第 4.3 节的 404 口径**：竞争失败时读状态晚的一方拿到 `404 找不到这个资源。`。
   改成 409 会碰到既有的「不在公海 → 404（避免探测）」决策 ⇒ 属于契约口径变更，**请裁决**，我不自行决定。
3. **【需派单/需环境】第 5 节的 WebKit**：本机 Playwright WebKit 无媒体采集能力（录制面**未验证**），
   且**跨引擎回放实测失败**（`canPlayType` 说 `probably`，实际 `err=4`）。是否派单到真机 Safari 复测，
   以及在复测前这条按"M 级风险"还是"待确认"记账，请定。

**另外**：本次会话我**没有** `agent_teams_*` 工具（本会话可用工具只有 bash / 文件编辑 / skill），
因此无法 `claim/in_progress/complete` 更新 t14 的任务状态，也无法用 `agent_teams_send_message` 回报 ——
任务状态需要 captain 代为更新；本报告与 `docs/e2e/t14-browser-run.log` 即为交付物。
