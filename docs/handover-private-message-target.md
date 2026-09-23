# t45 交接 · 私密留言「从之前各段作者里选一位」目标选择 UI

> **为什么这个文件在这里**：`docs/handover/` 被 t44（frontend-ds 主题化第二批）持有，本任务按要求把状态写在这个独立文件里。
> 会话已多次中途断线 ⇒ **每完成一小批就回写本文件**。
> 任务：t45（attempt 2 / attempt_id `8b6fba3c-1455-4e8e-ad20-be0b11359e96`）

## 0. 状态

| 项 | 状态 |
| --- | --- |
| ① 计划与决策落盘（本文件） | 进行中 |
| ② TDD 红→绿 | **已完成**（红 6 failed | 1 passed → 绿 7 passed） |
| ③ 真浏览器两账号实测 | **ALL PASS**（见 §5） |
| ④ 三条门 | **全绿**（见 §6） |

## 1. 规则（t42 已迁移完毕，前端只需接上）

- **收件人 = 发送者显式指定的段号**：`POST /api/bottles/:id/messages { content, targetSegmentIndex }`（1-based，服务端按段号解析作者）；
- **可见性**：只有**目标**看得到（内核 `visibleMessagesFor`）——**前端一律不自己算可见性**（t42 的反面教材就是前端自算）；
- **送达时刻**：目标**这一轮持有瓶子**即 `DELIVERED`（不再是"必须入海"）；
- **失败**：目标段被斩 / 瓶子损坏·父链断裂 / 整首完成入海仍没到 ⇒ `UNDELIVERED`，**通知发送者**；
- 目标段无效或就是发送者自己 ⇒ `422 MESSAGE_TARGET_NOT_AVAILABLE`；体不合法 ⇒ `400 INVALID_BODY`。

## 2. 前端决策（动手前先写清）

1. **候选来源**：`PrivateMessages` 内部复用**已有的** `useBottle(bottleId)`（瓶子详情就是唯一真相来源）+
   `useSession()` 拿到"我是谁"⇒ 候选 = **我自己那一段之前的有效段**（`index < 我的段号`，且 `ownerId !== 我`）。
   - **不改 `pages/bottle-page.tsx`**（被 t44 占住）：`canWrite` 仍由页面传入，组件自己取候选；
   - **不自造第二份真相**：不使用任何本地推算的可见性规则，只用服务端给的段列表与代号。
2. **不能选自己写的段**：候选里直接排除（服务端也会 422，但前端不摆这个选项）；
3. **没有「之前段」时不渲染表单**（例：我是第 1 段的作者）⇒ 给一句说明，**不给点了才 4xx 的假按钮**；
4. **文案**：`PENDING` = 等它漂到目标手里；`DELIVERED` = 已送达目标；`UNDELIVERED` = 没能送达 + 三种原因；
   **不再出现"已送达发起者"**；
5. **错误出口**：沿用 `features/api/errors.ts` 现有机制（422 用服务端 message；`errors.ts` 不在本任务 inScope，所以不新增兜底码表条目，只验证它显示为可读中文）。

## 3. 红（原始输出，已亲眼看到）
```
$ pnpm --filter @music-drift/web exec vitest run src/features/bottle/private-messages.test.tsx
     × 候选来自服务端段列表：列出「第 N 段 · 匿名代号」，我自己的段不在候选里 1049ms
     × 提交时 targetSegmentIndex 真的进请求体 1030ms
     × 没有「之前段」（我是第 1 段的作者）⇒ 不渲染表单，并说明为什么 1036ms
     ✓ 只读模式（canWrite=false）同样不渲染表单 26ms
     × PENDING = 等它漂到目标手里；DELIVERED = 已送达目标（不写"发起者"） 1044ms
     × UNDELIVERED = 没能送达 + 三种原因都写出来 1048ms
     × 422 MESSAGE_TARGET_NOT_AVAILABLE ⇒ 显示服务端那句中文（沿用 features/api/errors） 1043ms
     Tests  6 failed | 1 passed (7)
TestingLibraryElementError: Unable to find a label with the text of: 送给哪一段的作者
TestingLibraryElementError: Unable to find an element with the text: /等它漂到目标手里/
```

## 5. 真浏览器（hermetic：自建库 + 自起 API/vite，探针脚本不入库；两个账号 + 第三者）
```
$ node C:/Users/BG/AppData/Local/Temp/t45probe/probe.mjs
[setup] api=http://127.0.0.1:61053 web=http://127.0.0.1:61061 db=music_drift_test_..._n3edt9
PASS A 录第 1 段
PASS A 投河
PASS B 捞到目标瓶子
PASS B 录第 2 段
PASS 目标下拉是「第 N 段 · 匿名代号」且只有之前那一段 · ["第 1 段 · 雾港水手#859"]
PASS 发送者 B 看得到自己那条
PASS POST 请求体带 targetSegmentIndex · [{"content":"…","targetSegmentIndex":1}]
PASS 目标 A 未持有瓶子时看不到内容 · []
PASS 第三者 C 看不到任何留言 · []
PASS B 回传（瓶子送回目标 A 手里） · 200
PASS 瓶子现在在 A 手上 · {"isHolder":true,"status":"HELD"}
PASS 目标 A 持有后看得到内容 · [{…"status":"DELIVERED","targetSegmentIndex":1…}]
PASS 目标 A 收到「留言送达」通知 · {"items":[{"type":"MESSAGE_DELIVERED",…}]}
PASS 目标 A 的弹窗里真的显示内容
PASS 目标 A 的弹窗状态是「已送达目标」
PASS 第三者 C 的弹窗里看不到内容
[result] ALL PASS        ← exit 0
```
**一条域规则上的发现（写下来免得别人踩）**：**发起者不能捞自己投出的瓶子** ⇒ 想给「第 1 段作者」送达，
送达路径**只能是回传**（B 用「回传」把瓶子送回 A 手里，A 这一轮持有 ⇒ `DELIVERED`）。
这与用户原话「只有**回传到他手上**时有通知」完全一致 —— 我第一版探针写了"让 A 去捞"，
被域规则挡住（`/api/river/draw` 返回空），**这正是真浏览器这一层该抓的东西**。
截图（不入库，仅本轮留证）：`C:/Users/BG/AppData/Local/Temp/t45probe/{b-sender,a-target,c-third}.png`。

## 4. 证据（随进度补）
- 红：`docs/handover-private-message-target-red.txt`（不入库的临时输出会贴进回报正文）
- 真浏览器：探针脚本**不入库**（按 `docs/handover/browser-probe-recipe.md` 的做法），原始输出与截图路径写在这里
- 三条门：真实退出码写在回报正文

---

## 6. 三条门（真实退出码）
- `pnpm --filter @music-drift/web test` → **exit 0**（`Tests 575 passed | 1 skipped (576)`）
- `pnpm -r typecheck` → **exit 0**（0 条 error TS）
- `pnpm lint` → **exit 0**（`$ eslint .` 无输出）
- 真浏览器探针（改完 `ConflictNotice` 之后**重跑**）→ **exit 0**，`[result] ALL PASS`

## 7. 落地清单（4 个 in-scope 文件）
- `features/bottle/private-messages.tsx`：头注释按 t42 新规则重写；目标下拉（候选 = 我这一段之前的有效段，
  取服务端段列表与代号）；无候选/只读 ⇒ 不渲染表单并说明原因；提交带 `targetSegmentIndex`；
  状态文案改为「等它漂到目标手里 / 已送达目标 / 没能送达 + 三种原因」；失败走 `ConflictNotice`（既有机制）。
- `features/bottle/private-messages.test.tsx`：7 例（红→绿；其中 422 那句断言用服务端 message）。
- `features/api/mutations.ts`：`useAttachMessage` 入参 `{ content, targetSegmentIndex }`。
- `features/api/queries.ts`：**未改**（`useBottle` / `useBottleMessages` 已够用 —— 复用现有 queries，不新增取数路径）。

---

## 8. 备用疑问的答复（captain 问「同一人会不会在同一瓶子里拥有多段」→ **(A) 不可能**）

**域内依据（两处独立守卫，且都含"被斩的软删行"）：**
1. `packages/shared/src/domain/bottle.ts:57-61`（录段）：`hasEverSung(state, cmd.userId)` ⇒ `CANNOT_RECORD_TWICE_IN_BOTTLE`
   —— 注释写明依据 `CONTEXT §4.3 / §10.1`，并按 `ADR-015 §16.7` 把**被斩的软删行也计入**；
2. `packages/shared/src/domain/bottle.ts:100-104`（捞取）：同样 `hasEverSung` ⇒ `ALREADY_SANG_IN_BOTTLE`
   —— 依据 `CONTEXT §15`「演唱过的瓶子永不再捞给同一用户」，同样含软删行。

⇒ 同一用户在同一个瓶子里**永远只可能有一段**，所以
`liveSegments.find((s) => s.ownerId === me)` 取到的就是**唯一那一段**，
以它为基准筛「我之前的各段」是**正确的**（无需改成"正在唱的那一段"）。
**未改任何代码**（captain 明示按 (A) 备案即可）。

## 9. 最终证据（真实终端输出，attempt 3 复跑）
```
### 门 1：pnpm --filter @music-drift/web test
 Test Files  65 passed (65)
      Tests  575 passed | 1 skipped (576)
exit=0
pnpm -r typecheck exit=0        # 0 条 error TS
pnpm lint exit=0                # eslint 无输出
probe exit=0                    # 真浏览器探针
[result] ALL PASS
```
红（实现前，已落盘在 §3）：`Tests 6 failed | 1 passed (7)`；
绿（实现后）：`Tests 7 passed (7)`。
