# W18 Code Review · 瓶子详情与录音闭环

日期：2026-09-28

## 范围

- 录音复核：试听、重录、取消、确认后上传，上传成功后再选去向。
- 录音伴奏与同步 K 歌歌词。
- 伴奏 + 固定四段时间槽的完整作品试听。
- 段音频权限与详情可见性一致。
- 瓶子详情在 1024×720、1280×800、1440×900、1920×1080 一屏展示且无相交。

## TDD 证据摘要

| 行为 | Red | Green |
| --- | --- | --- |
| 麦克风授权迟到 | 请求中卸载后 `stopTrack` 期望 1、实际 0 | 会话代数守卫使迟到 stream 立即停止，不创建 `MediaRecorder` |
| 上传失败后重录 | 点击“重录”后“重试上传”仍存在 | 清 pending/failure/local URL 并 revoke，旧入口消失 |
| 超长人声截断 | `source.start` 的 duration 为 `undefined` | `start(when, 0, slotDuration)` 固定在本段槽位 |
| 锁定段完整性 | `missing=[]` 且有 locked 时误报 `isComplete=true` | 改为 false，并显示“暂未解锁 / 可试听” |
| 真实布局相交 | 1024×720 检出页头、缺口、附言与状态条相交 | 四档全路由 `visualOverlaps=[]` |

## 独立评审与修复

首次独立评审：0 Critical、4 Major、1 Minor。四个 Major 分别为授权迟到后台录音、失败后重录残留、超长人声越段、布局伪门禁；Minor 为锁定段误报完整。以上均已增加回归测试并修复。

第二次独立复审发现 1 个 Major：旧 `visualOverlaps` 只量叶元素，漏掉 `h2` 自身文本，导致 1024×720 新鲜瓶子的“录第 1 段”覆盖“试听与投票”却假绿。修复证据：

1. 静态测试先因缺少 `NodeFilter.SHOW_TEXT` / `document.createRange()` 失败；
2. 改为 `TreeWalker + Range.getClientRects()` 后，真实浏览器门禁正确 Red：`button:录第 ↔ h2:试听与投票`；
3. 1024 紧凑档下移下层仪器后，同一路由及四档全路由 Green；新鲜瓶子截图人工确认无覆盖。

最终独立复审：**0 Critical、0 Major，可进入 W18 用户验收**。复审者独立重跑 1024×720 真浏览器门禁、`one-screen-fit` 19 条测试与 Web typecheck，均通过。

非阻塞 Minor 风险：自动门禁量取可见文本片段；没有可见文字的纯图标控件仍靠四档截图人工检查。最新截图未发现此类相交。

## 真浏览器验收

命令模板：

```text
node apps/web/tools/one-screen-check.mjs --viewport=<宽>x<高> --shot=docs/ui-review/w18-verified-<宽>x<高>
```

结果：四档均为“全部页面达标（桌面口径：一屏装下）”。门禁同时检查根高度、横向溢出、首屏锚点与瓶子页每个可见文本片段的真实矩形相交；截图已人工抽查。

## 最终验证

```text
pnpm -r test
shared: 22 files / 261 passed
api:    19 files / 181 passed
web:    79 files / 1050 passed / 1 skipped

pnpm -r typecheck
shared / api / web: tsc --noEmit passed

pnpm --filter @music-drift/api test:integration -- \
  src/audio/audio.integration.test.ts \
  src/routes/visibility.integration.test.ts
2 files / 16 passed

git diff --check
exit 0（仅 CRLF 转 LF 提示，无 whitespace error）
```

## 2026-09-29 连续交付 W18 follow-up–W22（进行中）

用户已覆盖逐切片验收暂停；本节记录实现证据，不表示全轮已通过。旧 W18 几何门禁漏掉了裁切内容：真实 1024×720 截图 `docs/ui-review/w20-stress-1024/me-1024.png` 显示身份卡挤占空间，消息/收藏落到视口外。现要求检查关键控件可见性、播放中状态和长列表，而非仅文档高度。

### W20 / W21 主线程红绿证据

```text
pnpm --filter @music-drift/web exec vitest run src/pages/__tests__/profile-page-reference.test.tsx
Red: 1 failed | 10 passed（发现“我的徽章”按钮仍存在）
Green: 11 passed（删除入口与徽章面板；收藏占完整口袋）
邮箱展示 Red: .who .mail expected null，实际 a@example.com
Green: profile-page-reference + profile-and-settings: 30 passed

pnpm --filter @music-drift/web exec vitest run src/pages/__tests__/drift-log-page.test.tsx -t '长日志'
Red: tabindex expected 0 / received null
Green: drift-log-page: 6 passed
one-screen-fit 长日志样式门禁 Red: ENOENT drift-log-page.css
Green: one-screen-fit + drift-log-page: 28 passed

pnpm --filter @music-drift/web exec vitest run src/pages/__tests__/profile-and-settings-page.test.tsx -t '准确说明'
Red: 邮箱文案 expected length 0 / received 2
Green: 1 passed | 19 skipped

pnpm --filter @music-drift/web exec vitest run src/features/bottle/notification-labels.test.ts
Red: 留言送达/未送达文案错误限定“发起者”
Green: 7 passed（接收者、送达双方身份，以及终止原因更正）

pnpm --filter @music-drift/web exec vitest run src/pages/__tests__/retired-reference-features.test.ts
Red: app/page-me.js still /api/me/badges / user.email
Green: 1 passed（同步参考我的/设置 HTML 与接线）

pnpm --filter @music-drift/web exec vitest run src/pages/__tests__/settings-attribution.test.tsx src/pages/__tests__/profile-and-settings-page.test.tsx src/pages/__tests__/profile-page-reference.test.tsx src/pages/__tests__/drift-log-page.test.tsx src/features/bottle/notification-labels.test.ts src/pages/__tests__/retired-reference-features.test.ts
Test Files 6 passed (6)
Tests 70 passed (70)
```

删除的旧徽章 UI 与测试可从 Git 恢复；不删除用户素材、既有截图或无关脏文件。数据库邮箱列退役由新迁移处理（用户已明确授权），历史迁移保留。

## 2026-09-29 验收返修（用户裁决覆盖旧音频揭晓规则）

本节覆盖上文“锁定段 / 暂未解锁”的旧结论。用户最终裁决：任何观看者均可试听瓶中当前全部已录段；“解锁”只指私密留言送达后，且只向该留言的发送者与接收者揭晓双方账号名。

### 返修范围

- 删除 `LOCKED`、`hiddenLaterSegmentCount` 与“暂未解锁”音频语义；所有观看者可逐段试听并一键按段号连续播放。
- 公共详情不返回 `ownerId / holderId / currentCasterId`；只返回瓶级匿名代号及当前观看者相对字段 `isMine / isHolder`。
- 公共日志展示全部核心事件，操作者只显示稳定的瓶级匿名代号；私密留言、投票和内部事件采用白名单隔离。
- 私密留言只能投递给发送者有效段之前的有效段；送达前匿名，送达后仅通信双方互见账号名；公海接口与页面隐藏留言但保留数据。
- 删除独立“放回海中”入口；持有者点击左上“回河道”时先完成服务端 put-back，成功后导航。
- Modal 使用 body portal、焦点闭环和背景 `inert`；录音上传成功后等待旧 portal 240ms 真实卸载，再打开去向窗口。

### TDD 与缺陷闭环摘要

| 行为 | Red | Green |
| --- | --- | --- |
| 所有人试听 | mix 仍要求 `hiddenLaterSegmentCount` 并抛错 | 只区分 `RECORDED / UNRECORDED`，逐段与顺序播放器通过 |
| 公共 DTO 匿名 | 原始详情仍含稳定用户 UUID | 删除真实 ID，API 集成断言键名不存在 |
| 漂流日志 | 未唱就回河道的两名操作者都退化为“匿名歌手” | 所有可见核心事件 actor 获得稳定且可区分瓶级代号 |
| 顺序播放 | 测试删除 `play()` 仍可通过；reject 后假播报 | 真实断言每段 `play()`，失败停止并可重试，下一段 resolve 前显示“准备中” |
| 私密留言目标 | 第 1 段可伪造请求投给后序段 | 服务端强制 `target.index < sender.index` 且发送者段有效 |
| 公海留言 | 公海仍可读，未完成入海被提前判未送达 | 公海 API 返回空且页面无入口；未完成作品保留 `PENDING`，离海恢复 |
| Modal 图层 | portal 前仍受祖先层叠上下文影响 | portal 挂到 body，z-index 复用 DESIGN token |
| Modal 切换 | 录音退场 240ms 内可出现双 portal | `onExited` + 双门禁阶段机保证任意时刻 portal ≤ 1 |
| 回河道时序 | 即时响应测试无法证明成功前不导航 | deferred 响应证明成功前留页，500 失败留页并显示错误 |

### 独立评审

交叉评审累计发现并修复：1 Critical（公共详情泄露稳定 UUID）、13 Major（音频/日志权限、留言边界、公海隐藏、Modal 可达性与竞态、river draw 匿名码、黄金路径旧契约等）及 4 Minor。每轮修复均由未实现该切片的执行者复审；最终结论：**0 Critical、0 Major、0 Minor**。

### 最终证据

```text
pnpm -r test
shared: 22 files / 263 passed
api:    19 files / 181 passed
web:    81 files / 1070 passed / 1 skipped

pnpm -r typecheck
shared / api / web: tsc --noEmit passed

pnpm --filter @music-drift/api test:integration
24 files / 213 passed

node apps/web/tools/golden-path-live-check.mjs
28/28 步通过；4 个账号、一次性真库、真 HTTP、真音频字节；临时数据库已删除

四档一屏门禁
1024×720 / 1280×800 / 1440×900 / 1920×1080 均为“全部页面达标”

git diff --check
exit 0（仅 CRLF 转 LF 提示，无 whitespace error）
```

## 2026-09-29 三需求最终统一验收（t7 · landing-revert-bottle-ux）

> 任务 t7（kind=verification，attempt dd879fe3-9ef1-4bce-81b5-df9c905a504e）：对三条需求 + 用户插手的 t8 动画恢复做最终统一验收。验收时点 2026-09-29 22:51–23:15；仓内另有一并发会话持续提交，所有证据均标注时点与归属。

### 一、全量测试与类型检查（命令 + 原始输出摘要）

```text
pnpm -r typecheck
packages/shared typecheck: Done ／ apps/api typecheck: Done ／ apps/web typecheck: Done（tsc --noEmit 无任何输出）
exit 0

pnpm -r --no-bail test（三包完整快照 23:12；裸 pnpm -r test 因 api 先失败即中止，exit 1 同口径）
packages/shared  Test Files 22 passed (22) · Tests 258 passed (258) · Done
apps/api         Test Files 1 failed | 18 passed (19) · Tests 1 failed | 180 passed (181)
                   FAIL src/routes/mounted.test.ts > 路由注册守卫：所有已知路由族必须同时挂载（防静默 404） > badges 已挂载且被匹配：GET /api/me/badges
apps/web         Test Files 6 failed | 82 passed (88) · Tests 20 failed | 1271 passed | 1 skipped (1292)
                   FAIL client.test ×1、login-page ×3、river-merge ×1、app-shell ×3、river-page ×3、admin-page ×9
整体 exit 1

pnpm --filter @music-drift/web test -- landing-page bottle-page collect-and-targeted votable-segment interaction-states
Test Files 6 passed (6) · Tests 217 passed (217) · exit 0
（landing-page 28 / bottle-page 47 / bottle-page-reference 13 / collect-and-targeted 7 / votable-segment 10 / interaction-states 112）

pnpm --filter @music-drift/web typecheck → tsc --noEmit 无输出，exit 0
```

结论：typecheck 全绿；测试非全绿，但失败全部落在与三需求无关的既有红（豁免条款），逐条根因与归属见第二节；三需求定向套件 217/217 全绿。红套件集合在 22:51 / 23:04 / 23:12 三轮复跑中完全一致（6 套件 20 红）。

### 二、既有失败清单与归属（豁免条款逐条列出）

| # | 失败 | 数量 | 根因（机器证据） | 归属 |
| --- | --- | --- | --- | --- |
| 1 | apps/api `mounted.test` badges | 1 | a19a4ea（09-29 14:23 并发会话「W19–W22 在途基线快照」）删除 `GET /api/me/badges`（`interactions.integration.test` 同步改为断言 404），而 `mounted.test.ts`（最后改动 09-23）仍要求该路由挂载，HEAD 上两测试互相矛盾；`git log -S 'me/badges' -- apps/api` 仅命中 a19a4ea 与 404117b | 并发会话 W19–W22 徽章/邮箱退役；团队零 apps/api 写入（status/diff 无任何 apps/api 条目） |
| 2 | web `client.test`「AUTH_ERROR_CODES 不在领域词表里」 | 1 | a19a4ea 把 shared `AUTH_ERROR_CODES` 的 `EMAIL_TAKEN` 换成 `HANDLE_TAKEN`（69ae004 及更早为 EMAIL_TAKEN，现 auth.ts L93 = HANDLE_TAKEN），`client.test.tsx`（09-23 起未改）仍断言 `apiError.code === 'EMAIL_TAKEN'` → 实收 null | 同上：契约退役未同步旧测试 |
| 3 | `login-page` ×3、`river-page` ×3、`river-merge` ×1、`app-shell` ×3、`admin-page` ×9 | 19 | 四套件登录态夹具仍为 `{ handle, email }` 无 `account`（login-page.test:8、river-page.test:45、app-shell.test:271、admin-page.test:11），a19a4ea 的严格 AuthUserSchema（account 必填、email 不再是身份）解析失败 → 测试全成访客/非管理员（admin 渲染「审核台只对管理员开放」、river「投下」href=`/login?next=%2Fnew`、登录回跳失败并弹「页面和服务器对不上」）；被测源码最后改动 = B4(16:40)/B6(17:09)/C2(18:06)/C4(18:12) 均为并发会话批次 | 并发会话 W19–W22 契约退役 + A/B/C 批次，与三需求零交集 |
| 4 | `design-discipline`（仅 22:51 观测一次） | 1（已消失） | 当时并发会话正在写 `song-picker-page.tsx`（mtime 22:58:24，在途 min-h-6 链接触发）；单独复跑 11/11 绿，23:12 全量已不在红名单 | 并发会话在途态瞬时红，非既有缺陷 |

零交集证明（机器检查）：
- 对 7 个红测试文件 grep 团队改动模块（`landing-page|bottle-page|sequential-segment|targeted-segment|collect-and-targeted|one-screen-check|song-picker`）：0 处 import 命中（仅 admin 注释提及 one-screen-check 字样、design 的 SOURCES 清单含 bottle-page.tsx 字样，均非依赖）。
- t11 于 22:00 独立全量已记录同一批 6 个红套件（client/login/river-merge/app-shell/river/admin）并两重归因（零 features/audio 引用 + 源码 mtime 早于开工），t12 评审独立复核同意；t7 三轮复跑集合与之完全一致。
- 三需求套件（landing / bottle-page / collect / votable / interaction-states / design-discipline）全绿。

### 三、范围核对

`git status --short`（23:10 冻结快照）共 7 条，逐条归属：

| 条目 | 归属任务 | 对照 inScope |
| --- | --- | --- |
| D `features/audio/sequential-segment-player.tsx` | t11（按 t5-f1 删除） | t2 inScope ✓ |
| D `features/audio/sequential-segment-player.test.tsx` | t11 | t2 inScope ✓ |
| M `features/bottle/collect-and-targeted.test.tsx` | t3 | t3 inScope ✓ |
| M `features/bottle/targeted-segment-button.tsx` | t3 | t3 inScope ✓ |
| M `pages/__tests__/bottle-page.test.tsx` | t2 / t3 / t13 | t2、t3 inScope ✓ |
| M `pages/bottle-page.css` | t2 / t11 | t2 inScope ✓ |
| M `tools/one-screen-check.mjs` | t10 | t10 inScope ✓ |

- 团队写入并集 = 各任务 changedPaths 之并集 ⊆ t1∪t2∪t3∪t8∪t10∪t11∪t13 声明的 inScope 并集；**越界写入 = 0**。
- `git diff --stat`（同一时点）：`7 files changed, 274 insertions(+), 340 deletions(-)`，与上表 7 条一一对应；`git diff --cached --stat` 为空（无暂存）。
- 中途出现过的 `M song-picker-page.tsx` / `M song-picker-page.test.tsx` 为并发会话在途（22:58 写入、23:10 前以提交 1cc4dde「/new 超一屏时静默裁掉内容」入库）：团队无任何任务声明该文件、无成员报告写入，已从 status 消失 —— 对方工作，非我方越界。
- 会话期间入 HEAD 的提交归属：5597a00 / b80e9f3 / 058f120 的 landing 部分 = t1/t8 范围内容（并发第三方提交，t8/t9 已核验收编）；92357e2 / 75b8674 / 990af93 / de5f75f / d15962b / 5ec5ac1 / 1cc4dde = 并发会话瓶详情、音频与页面批次；瓶页共写文件的双方归属已由 t5/t12 分清。

### 四、三条需求逐条证据（命令 + 原始输出摘要 + 关键断言出处）

**需求① Landing 回退到 9/28 版 + 漂流瓶/河道动画 + 末屏入海 CTA（t1 恢复 → t8 按用户裁决改为底部河道左→右逐屏）**

- 命令：`pnpm --filter @music-drift/web test -- landing-page` → `Test Files 1 passed (1) · Tests 28 passed (28)`，exit 0。
- 关键断言出处（`landing-page.test.tsx`）：
  - describe「底部河流与主瓶横向漂移（用户裁决：推翻 9/29 的「自上而下」方案）」：「河道是横贯底部的一条河 + 右端有海口；主瓶在河道之上」「每翻一页 data-journey 递增（驱动主瓶向右走一格）；末页最右（入河）」「主瓶横向位移由 CSS 按 data-journey 驱动：只动 transform/opacity、x 单调递增」「css 头注释 = a19a4ea 原文（动画来源可追溯、无编码损坏）」「实测层级：河道装饰层不压内容」。
  - describe「末屏「投出你的第一瓶」CTA 入海意向」：「CTA 区呈现入海/公海语义（data-cta-into-sea），链接仍指 /login?next=%2Friver」。
  - 9/28 文案恢复：「h2 顺序 = … → 投出你的第一瓶」「恰 8 屏（开场 + 七段）」；整页翻页 6 用例（滚轮/防抖/边界/方向键/圆点/只动 transform）；红线用例「无 emoji / AI 陈词 / lorem / 内联 hex / h-screen」。
- 独立评审：t4 pass（恢复真实性：dsh 会话 870 行 read 快照逐行 diff、「投出你的第一瓶」105 处命中、codex rollout 旁证）；t9 pass（动画来源 = `git show a19a4ea` 移植非重画：RiverJourney 2410 字符三方逐字节一致、x 序列 -39→+40vw、海口 scale 0.72→1）。

**需求② 详情页：主键=听全部（删独立听全部）/ 每段「听」=分段直播 / 试听与投票移「踩」同行右侧 / 收藏移「举报」正上方**

- 命令：`pnpm --filter @music-drift/web test -- landing-page bottle-page collect-and-targeted votable-segment interaction-states` 中 bottle-page.test 47 + reference 13 + votable-segment 10 全绿，exit 0。
- 关键断言出处（`bottle-page.test.tsx` describe「听全部主键 + 分段直播 + 布局对齐（t2）」）：
  - 「听全部：点一次就开播（播放态由播放器真实状态驱动，不需多点）」
  - 「听全部主键显示连播段进度（1/4 → 2/4），随连播推进」
  - 「没有已录段：听全部键禁用且不出假进度」
  - 「连播中点某段「听」：停下连播改播该段（主键退回听全部）」
  - 「布局①：听全部在 .votes 投票行内且右对齐于该行（margin-left:auto）」
  - 「布局②：收藏在举报正上方同一竖列同轴；无收藏时竖列不留空位」
- 评审链：t5 needs_revision（旧组件死代码/孤测试/死样式 3 findings）→ t11 repair（组件与测试双删、index.ts 导出移除、css 5 条死规则删除）→ t12 pass（findings 逐条核销、行为/布局/门禁/范围四维复验）。

**需求③ 公海「等待接力」捞起入口统一为「录第 x 段」（替换「我来接这一段」）**

- 命令：`pnpm --filter @music-drift/web test -- collect-and-targeted` → `Tests 7 passed (7)`，exit 0。
- 关键断言出处：
  - `collect-and-targeted.test.tsx`：「与河道缺口同形：录第 N 段 + cta 共用外观 + Mic；POST 接管成功后按默认出口进瓶详情」（classList token + `svg.lucide-mic` 断言）；「源码不再保留「我来接这一段」旧措辞（统一成录第 N 段）」（node:fs 源码级负断言）；「服务端 422（已完成）：显示中文原因，且给回公海的出口」。
  - `bottle-page.test.tsx`：「公海接唱：点「录第 N 段」走 POST 接管，成功后不跳页、直接开本页录制弹层」；「复现用户路径：已登录 + 公海未完成 + 本人未唱过 + 有缺口 ⇒ 缺口格就是 cta「录第 N 段」，全页无旧文案」。
- 独立评审：t6 pass（形态统一、接管契约零改动 —— `git diff HEAD -- packages/shared apps/api` 为空、失败可见性保留、旧措辞生产源码 0 残留、范围恰 3 文件）。

### 五、TDD 红→绿时间线（实现/修复任务逐个）

| 任务 | 先红（原始输出摘要） | 后绿（原始输出摘要） | 备注 |
| --- | --- | --- | --- |
| t1 Landing 恢复 + 入海 | 新 3 用例：`3 failed \| 22 passed` | `25 passed`；typecheck exit 0 | t4 已注明执行期红跑不可复现的口径限制 |
| t2 详情页四项 | 6 新用例先红：bottle 41 中 5 红 + player 8 中 1 红 | bottle-page 55/55、sequential-segment-player 9/9、typecheck 0 | 组件随后按 t5 findings 删除，现页面级 47+13 绿 |
| t3 录段入口统一 | collect 红 2（`expected 'bp-record-cta' to contain 'whitespace-nowrap'`；源码仍含旧措辞） | collect 7/7、bottle-page 56/56、typecheck 0 | t6 复验 |
| t8 动画恢复（用户插手） | 19:31 旧纵向断言对横向实现 `2 failed \| 23 passed`；19:57 新增缺口断言 `2 failed \| 26 passed`（头注释 € 损坏、轨道 position static） | 20:12 landing `28 passed (28)` exit 0、typecheck 0 | 两轮独立红→绿，t9 复核 |
| t10 工具适配（tools 无单测框架） | 红 = 工具实跑失败：两播放场景 30s 超时 + 首跑文字相交 FAIL 实拍 | 四档 `node apps/web/tools/one-screen-check.mjs` exit 0/0/0/0（default 连续两轮），无超时 | 合同 verify = 工具运行，以工具自身实跑为测试 |
| t11 删除型修复（kind=repair） | 红 = t5 findings 取证（组件/孤测试/死样式在仓且生产零引用） | typecheck 0、bottle-page 56/56、votable 10/10、collect 7/7、C5 112/112、`test -- sequential-segment-player` 空集 exit 0 | 纯删除无新增行为，故无新增字面红测试；由 t12 逐条核销 findings 构成修复闭环 |
| t13 场景考古（implementation，零代码改动） | 合同明许「现状已绿→记录证据转考古」分支：3 新用例首轮即绿（该路径已被 92357e2 + t3 预满足，无可红点） | bottle-page 59/59、typecheck 0 | 合同分支豁免，考古结论与逐分支证据已入 output |

t4/t5/t6/t9/t12 为评审任务（不写产品代码），不适用实现 TDD；t5 → t11 → t12 构成「红（findings）→ 修复 → 绿（复核 pass）」的评审闭环。

### 六、结论

1. `pnpm -r typecheck` 全绿（exit 0，三包 tsc --noEmit 均无输出）。
2. `pnpm -r test` exit 1，但失败全部为与三需求无关的既有红（第二节逐条根因与归属：并发会话 W19–W22 契约退役未同步的旧测试 + api 徽章下线未同步 mounted.test），三需求定向套件 217/217 全绿 —— 满足「仅剩与本任务无关的既有失败并明确列出归属」豁免条款。
3. 范围：团队 7 条工作树改动全部落在 t1/t2/t3/t8/t10/t11/t13 声明的 inScope 并集内，越界 0；并发会话文件（song-picker 等）零写入；`git diff --stat` 7 files +274/−340 与之逐条对应。
4. 三需求 + t8 动画恢复均有独立评审 pass（t4/t6/t9/t12）与可复现命令 + 测试名证据。
5. TDD 红→绿链完整（第五节逐任务表；t10/t11/t13 的证据形态按各自合同如实标注）。
6. 遗留归属项（不阻塞本验收，建议同步并发会话修复）：api `mounted.test` badges 1 红；web 6 套件 20 红（client/login/river-merge/app-shell/river/admin）。

## 2026-09-30 第二批最终统一验收（t26 · landing-revert-bottle-ux）

> 任务 t26（kind=verification，attempt 9e6a25b3-0c3f-49b5-a427-9d023c5c26c3）：对用户 2026-09-30 四条需求做最终统一验收 —— ① 详情页两态布局统一+试听区下移+删文案（t20，评审 t25 pass）；② 录制弹窗四档桌面一屏（t21）；③ 全站美化零守卫回退（t22）；④ 听全部单击即播+失败可见（t15，评审 t23 pass）。验收时点 2026-09-30 10:55–11:00；仓内仍有并发会话提交，证据均标注时点与归属。

### 一、全量测试与类型检查（命令 + 原始输出摘要）

```text
pnpm -r typecheck（10:57）
packages/shared typecheck: Done ／ apps/api typecheck: Done ／ apps/web typecheck: Done
exit 0（三包 tsc --noEmit 零输出）

pnpm -r --no-bail test（10:55）
packages/shared  Test Files 22 passed (22) · Tests 258 passed (258) · Done
apps/api         Test Files 1 failed | 18 passed (19) · Tests 1 failed | 180 passed (181)
                   FAIL mounted.test > badges 已挂载且被匹配：GET /api/me/badges（t7 既有豁免）
apps/web         Test Files 7 failed | 81 passed (88) · Tests 21 failed | 1291 passed | 1 skipped (1313)
                   FAIL client×1、app-shell×3、admin×9、login×3、river-merge×1、river×3（= 20，t7 既有豁免集同一批）
                   FAIL bottle-page.test > 持有者且已登录：录制成功后按服务端最新缺口弹出去向三选一 ×1（负载 flake，见第二节）
整体 exit 1

定向复跑（全部 exit 0）：
test -- bottle-page → Test Files 2 passed (2) · Tests 64 passed (64)（隔离两轮，flake 消失）
test -- segment-player use-segment-player → Tests 51 passed (51)
test -- record-step recorder accompaniment → Test Files 6 passed (6) · Tests 89 passed (89)
vitest run design-discipline + interaction-states + motion-contract + tokens + sea-page
  → Test Files 5 passed (5) · Tests 189 passed | 1 skipped (190)
node one-screen-check --viewport=1440x900 → 16 路由全 OK「✅ 全部页面达标」exit 0
```

结论：typecheck 全绿；全量测试仅剩与本批无关的既有失败（豁免口径与 t7 判定完全一致），四条需求的定向套件全绿。

### 二、既有失败清单与归属（与 t7 判定口径一致）

| # | 失败 | 数量 | 归属（根因见 t7 报告第二节，此处复验未变） |
| --- | --- | --- | --- |
| 1 | api `mounted.test` badges | 1 | a19a4ea（并发会话 W19–W22 基线）删 /api/me/badges 未同步 mounted.test；10:55 复跑仍同一条 |
| 2 | web 6 套件（client/login/river-merge/app-shell/river/admin） | 20 | 同 t7：a19a4ea 严格 AuthUserSchema/AUTH_ERROR_CODES 契约退役未同步旧夹具；10:55 复跑失败清单与 t7 三轮完全一致（零增减） |
| 3 | bottle-page.test「录制成功后去向三选一」 | 1 | t7 已立案的全量并行负载超时型 flake（t7 期两轮全量红、隔离 ×2 绿）；本批复现同款：10:55 全量红 → 10:56 隔离 64/64 绿，与本批 t15/t20 改动无关联（该用例属 t2/t13 链路，本批未触其语义） |

### 三、范围核对

`git status --short`（10:58）共 22 条，逐条归属（`git diff --stat` = 22 files, 1205 insertions(+), 393 deletions(-)；`--cached` 为空）：

| 归属任务 | 条目 | 对照 inScope |
| --- | --- | --- |
| t15 | M segment-player.tsx / segment-player.test.tsx / use-segment-player.ts / use-segment-player.test.ts | t15 声明 4 文件 ✓ |
| t21 | M record-step.tsx / recorder-panel.tsx / design-system/modal.tsx / design-system/__tests__/components.test.tsx（+ 其两测试文件与 t16 共写） | t21 声明 6 文件 ✓ |
| t16 | M record-step.test.tsx / recorder-panel.test.tsx | t16 声明 inScope ✓ |
| t22 | M sea-page.tsx / pages/__tests__/sea-page.test.tsx | t22 声明 inScope 通配 ✓ |
| t20/t14/t13 累积 | M pages/__tests__/bottle-page.test.tsx（+300，含 t20 两条改写断言） | t20 声明 2 文件之一 ✓ |
| t10 / t20 门禁适配 | M tools/one-screen-check.mjs（+38） | t10 inScope + t20 amendments ledger 登记 ✓ |
| 第一批已验收遗留（t7 口径） | D sequential-segment-player.tsx/.test（t11）、M collect-and-targeted.test + targeted-segment-button（t3）、M bottle-page.css（t2/t11 hunk，与 19173db 零交集） | t1/t2/t3/t11 inScope ✓ |
| t17 | M song-picker-page.tsx / song-picker-page.test.tsx | t17 inScope ✓ |
| 本任务 | M docs/review.md（t7 报告 + 本章节） | t7/t26 inScope ✓ |

- **本批（t15/t20/t16/t21/t22/t10）写入 ∪ ⊆ 各自声明 inScope 并集，越界 0**；当前工作树无并发会话未提交文件（其工作均已入 HEAD）。
- **并发提交零回滚**：19173db / 05b94a9 / 1cc4dde / 5ec5ac1 / 75b8674 / d15962b / de5f75f / 990af93 均在 HEAD 完整保留；`bottle-page.tsx` 与 HEAD 一致（不在 status）；工作树 `bottle-page.css` diff 仅第一批声明 hunk（t2 布局① margin-left:auto + t11 五条死规则删除），不触 19173db 的 46 行改动；`sea-page.tsx` diff 仅 t22 的 5 行焦点/按压规则。

### 四、四条需求逐条证据（命令 + 原始输出摘要 + 关键断言出处）

**需求① 详情页两态统一 + 试听区下移 + 删「沿着歌声听下去」（t20，评审 t25 pass）**

- 命令：`node apps/web/tools/one-screen-check.mjs --viewport=1440x900` → 16 路由全 OK exit 0，真机实拍两态同值 **bottle-play=764 / bottle-action=830**（试听态与待去向态同骨架同值，与 t20/t25 声称逐值一致；记录态 bottle-record=583）；最紧档 1024×720 = 619/628≤720（t25 独立复跑在案）。
- 关键断言出处（`bottle-page.test.tsx`）：「右列只留进度条：那段标题与说明已删除，且左列标题下移 32px、进度条与赞踩同轴」（L1802，内含 destCol 对「沿着歌声听下去」「按段号顺序连着听」「只听那一段」的**零命中负断言**）；「几何对齐（桌面）：同轴改由『标题下移 32px + 投递位 48px』实现，.votes 回到 14px」（L1912，53px 复活双正则钉死）；「进度条组（.bar+.timecode）经 portal 落在右列 destCol 的投递位内，且全页只有一份 transport」（L1854）。
- 复跑：`test -- bottle-page` → **64/64 exit 0**（10:56，隔离两轮）。

**需求② 录制弹窗四档桌面一屏（t21）**

- 真机终验证据：`%TEMP%\t21-final3.log` → **`[result] ALL PASS`（39 断言）**——四档（1024/1280/1440/1920）× 三态（idle 555 / recording 630 / reviewing 559–667）全部 scrollHeight≤clientHeight 且关键控件 boundingBox 在视口内；最坏态（双告警同屏）注入等价盒重测 1024 644≤688、1920 644≤1048 全 PASS；375×812 overflow-y=auto、dialog 在视口内；无 JS 错误。截图 16 张：`%TEMP%\t21-shots\`（四档×三态 + 1024/1920 review-worst，目录实存 16 文件核验 ✓）；基线对照 `%TEMP%\t21-baseline.log` 14 FAIL（修前）。
- 行为不回退（复跑）：`test -- record-step recorder accompaniment` → **89/89 exit 0**（record-step 13 含 30 秒自动停链路与复核态取消、recorder 64 含试听本段/用这一段/重录/上传失败保留、accompaniment 12）。

**需求③ 全站美化零守卫回退（t22）**

- 命令：`vitest run design-discipline + interaction-states + motion-contract + tokens + sea-page` → **Test Files 5 passed (5) · Tests 189 passed | 1 skipped (190)，exit 0**（design-discipline 11、interaction-states 112、motion-contract 17、tokens 16、sea-page 34）。
- 十一页逐页盘点结论（t22 output）：仅 sea 真修（zones/分页 focus ring + active 位移），drift-log 按裁决整批回退零残留，其余 9 页零改动盘点；红线 grep（hex/ms/cubic-bezier/h-screen/emoji=0）与 motion 纪律在案；截图 `%TEMP%\t22-shots\`（one-screen --shot 采集 16 张覆盖十页）。

**需求④ 听全部单击即播 + 失败可见（t15，评审 t23 pass）**

- 命令：`test -- segment-player use-segment-player` → **Tests 51 passed (51)，exit 0**（10:56）。
- 关键断言出处（`use-segment-player.test.ts` / `segment-player.test.tsx`）：「同段重按：autoPlayToken +1 而 src 不变（元素不重建）→ 仍要起播（令牌不许被吞）」（根因①）；「play() 被拒绝（音频 404/被拦）→ 暴露 playFailure 并复位假『在播』，不许静默」（根因②）；「AbortError（元素重建竞态的内部中断）不算播放失败：playFailure 保持 null」（根因③）；组件层 danger 提示「播放没有开始…再点一次播放」role=status + aria-live + 成功自动清除（t23 逐条核验）。

### 五、TDD 红→绿时间线（逐项）

| 任务 | 先红（原始输出摘要） | 后绿（原始输出摘要） | 独立复核 |
| --- | --- | --- | --- |
| t15 听全部 | `use-segment-player 3 failed \| 21 passed`（TS2339 playFailure 不存在 + 令牌被吞 + DOMException 误判；test mtime 01:05/01:06 → impl 01:18） | `segment-player + use-segment-player 51/51 exit 0`（10:21，本批 10:56 复跑一致） | t23 pass |
| t20 两态统一 | `bottle-page 2 failed \| 49 passed`（并发 19173db 使 t14 两条旧断言失效 → captain 改写为新机制断言） | `bottle-page 64/64 exit 0`（10:27，本批隔离两轮一致） | t25 pass |
| t16 录制一键同启 | 真机探针先行核验（sameStart=true）；jsdom 补足断言**首轮即绿**（行为已由并发 75b8674 建立、无可红点，前任 attempt 断流未留红跑日志——如实标注，属合同「若已有则补足断言」分支） | `record-step 13/13、recorder 64/64、accompaniment 12/12 exit 0` | t24 pass（探针×2 复跑 + 时序铁证） |
| t21 录制弹窗一屏 | 三轮红：10:17 `3 failed/95` → 10:28 `5 failed/94` → 10:38 `1 failed/32`（每轮先见红，基线另有真机 14 FAIL） | 98/98 → 99/99 → 33/33 → 真机终验 ALL PASS（39 断言） | t26 复验（ALL PASS 日志 + 16 截图实存 + record 组 89/89） |
| t22 全站美化 | sea 新用例 `09:55:23 1 failed \| 33 passed`（焦点/按压断言） | `09:56:21 sea 34/34 exit 0`；守卫组（dd/is/mc/tokens）本批复跑 189/190 绿 | 本批复验（含 drift-log 回退后 6/6 绿） |
| t10 门禁工具 | 红 = 两播放场景 30s 超时 + Toast 相交 FAIL 实拍 | 四档 exit 0（t7 汇总在案）；t20 又适配 destination-completed 等价等待（红 30s 超时 → 两档实跑走完） | t19/t25 评审在案 |

评审任务 t23/t24/t25 均 verdict=pass；t16 的红证据缺项（前任断流 + 行为先行）已按同一口径如实标注，不构成 fail。

### 六、结论

1. `pnpm -r typecheck` 全绿（exit 0，三包零输出）。
2. `pnpm -r test` exit 1，但失败全部落在与本批无关的既有豁免集（api badges 1 + web 6 套件 20，与 t7 判定逐条一致、零增减）+ 1 条 t7 已立案的 bottle-page 负载 flake（隔离 64/64 绿）——满足豁免条款。
3. 范围：本批六任务写入 ∪ ⊆ 各自声明 inScope，越界 0；并发提交（19173db/05b94a9/1cc4dde/5ec5ac1/75b8674/d15962b 等）零回滚，工作树 22 条逐分归属。
4. 四条需求逐条有可复现证据：两态同值门禁实拍（764/830）+ 文案零命中负断言测试名、录制弹窗四档真机 ALL PASS（16 截图）、美化守卫 189/190 绿、听全部 51/51 + 三个根因测试名。
5. TDD 红→绿链完整（第五节逐项表；t16 形态按合同分支如实标注），独立评审 t23/t24/t25 全 pass。
6. 遗留归属项不变（同 t7）：api badges 1 红 + web 6 套件 20 红 → 并发会话 W19–W22 契约退役未同步测试；bottle-page 负载 flake → 建议后续加固定 seed/隔离重试。

## 2026-10-04 金路径 13 环真机走查（t31 · landing-revert-bottle-ux）

> 任务 t31（kind=verification，attempt 4da3ac96-fc05-40e4-89ac-296d5caf7378）。执行时点 2026-10-04 21:10–21:23。**结论：发现 1 个阻断级缺陷（site/ 静态站去向门失效），已按合同停下报 captain；本任务判 failed。** 产品代码零写入（本任务仅写本节与 %TEMP% 探针）。

### 一、四条 verify 命令原始结果

```text
node tools/walkthrough.mjs → exit 1（第 0–3 步 PASS 后，第 3/4 步 2 项 FAIL + 走查中断，见第二节）
node apps/web/tools/golden-path-live-check.mjs → exit 0
  ✅ 黄金路径真实链路检查通过（31 步，4 个账号，hermetic 真库 + 真 HTTP + 真音频字节）
node apps/web/tools/one-screen-check.mjs --viewport=1440x900 → exit 0「✅ 全部页面达标」
  附跑 1024x720 / 1280x800 / 1920x1080 三档同样全 OK exit 0（四档全绿）
pnpm --filter @music-drift/web typecheck → tsc --noEmit 无输出，exit 0（21:16）
```

### 二、阻断级缺陷：site/ 静态站去向门永不开（walkthrough 第 4 步中断）

**复现步骤（可照跑）**

1. 起 dev API 8788（当时已在跑）；`node tools/walkthrough.mjs`（自起站点服务器 5188，服务 `site/` 静态页）。
2. 第 0–3 步全 PASS：注册（handle=w3walk…，`GET /api/auth/me` 本人）、建 DRAFT 瓶、**真 MediaRecorder 录 20328ms → 自动上传成功（服务端段=1，页内公告「第 1 段已经录好了（本段时长 0:20）」）**、试听 Range 206 且 currentTime 前进、点赞页面=1 服务端 likeCount=1。
3. **FAIL① 留言面板**：期望「本瓶只有我自己的段 ⇒ 无收件人：无 select + submit 禁用 + 说明『没有可以留言的段』」，实测 `select=true submit.disabled=false`（出现了幻影收件人）。
4. **FAIL② 三选一去向**：期望录完后 `.destCol` 可见，实测 `去向列可见=false`（但三行 `继续投河 | 回传(禁用) | 入海` 已按服务端可选性正确渲染在 hidden 列里）。
5. **中断**：`locator.click Timeout 20000ms` —— 第 399 行点 `.destRow`（列 hidden 点不到），走查止步于 13 环的第 4 环。
6. 根因探针（`%TEMP%\t31-dto-probe.mjs`，已跑 exit 0）：`GET /api/bottles/:id` 的 `segments[0]` keys = `[id,index,isMine,note,ownerCode,likeCount,dislikeCount,deletedAt,audioMime,durationMs]` —— **无 `ownerId`**；bottle 无 `holderId`（有 `isHolder`）。而 `site/app/page-bottle.js` 仍处处依赖 `segment.ownerId`：L239 去向门 `segments.some(s => s.ownerId === me.id)` 恒 false ⇒ 门永不开；L1460 收件人 `filter(s => s.ownerId !== mine.id)` 恒 true ⇒ 幻影收件人；另有 L509/L853/L1309/L1630 及 `page-drift-log.js` L308（匿名代号映射）同病。
7. **影响面收敛**：缺陷仅在 `site/` 静态面（`deploy-plan-html.md` 指定的部署候选）；React 产品面不受影响 —— `test -- bottle-page` 21:22 复跑 **64/64 exit 0**（isMine 语义），one-screen 四档全绿，golden API 31/31 全绿。
8. **修复归属**：`site/app/*.js` 按 W0 charter 仅 captain 可改、且属 t31 out-of-scope ⇒ 已报 captain 立修复任务（ownerId→isMine/isHolder 适配），不自行扩 scope。

**判定**：合同「阻断缺陷=0 才算通过」未满足（site/ 面上核心流程不可用），本任务 failed；数据重置（t32）/部署不应带病推进，等 captain 裁决（若裁定 site/ 非部署面，可豁免 walkthrough 重跑 t31）。

### 三、13 环证据汇总（操作 + 断言/响应 + 日志摘录）

| # 环 | 证据（来源 · 原始输出摘要） |
| --- | --- |
| 1 注册/登录 | walkthrough 步1 PASS「注册即登录（GET /api/auth/me 回的是本人）handle=w3walk20261004131115」；golden [04][05] 四账号注册、会话互不干扰 |
| 2 选歌投瓶 | walkthrough 步2 PASS「选歌并发起：建 DRAFT 瓶并跳到接唱页 —《Immersed》预设第 1 段=20000ms 瓶=c7f58dac…」；golden [06] 缺口 [1,2,3,4] |
| 3 录段 | walkthrough 真 MediaRecorder「墙钟 20328ms（按钮「录第 1 段」→ 自动停）· 服务端段=1」；golden [07] 可解码 WebM/Opus index=1 |
| 4 复核上传 | walkthrough 同步 PASS「自动上传 + 服务端记到我的这一段…页内公告=第 1 段已经录好了（本段时长 0:20）」 |
| 5 去向投河 | golden [09] status=IN_RIVER；**site/ UI 面 FAIL（第二节阻断缺陷）** |
| 6 河道捞起 | golden [10][11] B 打捞 1 次、bottle=1ebfe27f…、isHolder=true |
| 7 接力录段 | golden [13] B 接唱第 2 段 index=2 · next=3；[16][17] 第 3/4 段接力至 isComplete=true |
| 8 回传/入海 | golden [18] D 回传 C isHolder=true；[20] C 入海 status=SEA seaZone=COMPLETED |
| 9 公开评论（重点回归） | golden [22]「账号实名发布 → 访客读取 → 他人举报 → 作者删除」真 HTTP 闭环；t27 真机五段（GET 200 {items,nextCursor}、POST 201 isMine、举报 204、admin 队列 PENDING commentEvidence 完整） |
| 10 收藏 | golden [21]「完成作品收藏 — 写入成功，重读收藏列表可见」 |
| 11 私密留言 | golden [19]「未到手与中间人均不可见；送达后双方账号 + 接收通知」；site/ 面留言面板受第二节缺陷影响 |
| 12 举报→admin 审核 | golden [22] 他人举报；t27 admin/admin123 登录 200 → /api/admin/reports 命中 {id:770d6939, PENDING}（dev 库真机） |
| 13 漂流日志 | golden [26] 13 条事件（CREATED/RECORDED/CAST/DRAWN/RETURNED/SEA）+ [30] /api/me/bottles 各角色可见性与斩浪剔除 |

**录音链真机 + t16 同启复验**：localhost 环境真录 20328ms（≥15s，服务端 ±2s 校验通过才可能 201）→ 上传成功 → 服务端段=1（walkthrough 原始日志）；`%TEMP%\t16-probe.mjs` 复跑 21:21 → `sameStart=true`（录前弹层按钮恰 1 颗「开始录制」、独立伴奏键 0、点击同栈伴奏 paused=false、600ms 内「停止录制」在场），teardown 删库 dropped:true。

### 四、范围与分注

- 本任务写入：`docs/review.md`（本节，纯追加）+ `%TEMP%` 探针/截图（t31-dto-probe.mjs 等）；**产品代码零写入**。
- `git status` 21:22 共 28 条，全部他方在途/前序已分注（t28 shell 四件+landing-page.test、t22 sea、t17 song-picker、t16/t21 record、t15 segment、t3/t11 遗留、并发 holdings.integration 修复等），无一条系 t31 所写。
- 非阻断备注：`holdings.integration` 旧夹具 email 列红族已有人在修（工作树 M 出现）；walkthrough 的留言断言与去向断言同根因，修 site/ 时一并覆盖。

## 2026-10-04 全功能跑通·React 部署面 14 项走查（t36 · t31 替代）

> 任务 t36（kind=verification，attempt 4efdafd5-d2e7-4fcc-80a5-520cae1f2b11）。t31 因合同把验收面错定在 site/ 参考站而 failed；captain 裁决验收面修正为 **React 部署面（apps/web，评委将访问的产品）**，site/** 维持只读参考、其 ownerId 缺陷按归属记录不修。执行时点 2026-10-04 21:35–22:09（dev：web 5173 我起 vite + api 8788 既有，API 日志 .tmp-dev.log、vite 日志 .tmp-dev-web.log）。

### 一、终态结论：React 面阻断缺陷 = 0，14/14 环 ALL PASS

**终跑（v5，22:07，exit 0）**：`node %TEMP%\t36-walk.mjs` → `{"result":"ALL PASS","passed":14,"total":14}`，bottleId=b3c5f2ca-7694-4736-a342-de070280d40c，16 张截图落 `%TEMP%\t36-shots\`（ring01–ring14，ring06/09 各两张）。探针配方 = t16 假麦克风（--use-fake-device/--use-fake-ui）+ 多浏览器会话（A/B/D/admin 四 context 独立 cookie）+ 逐环「操作 → DOM 断言 + API 响应断言 → 截图」。

| 环 | 操作 | 关键断言 / 响应（原始输出摘要） | 截图 |
| --- | --- | --- | --- |
| 1 注册/登录 | /login 注册 tab →「注册并进入」 | register 201 → 落站内；GET /api/auth/me status=200 含本人账号=true | ring01 |
| 2 选歌投瓶 | /new 点「选这首，录第 1 段」 | URL → /bottles/…；响应 status=DRAFT 缺口=[1,2,3,4] | ring02 |
| 3 录段 | 弹层单击「开始录制」 | 录前弹层按钮=[开始录制]（仅此一颗）；0.7s 后「停止录制」在场=true；真 MediaRecorder 假麦录满 20s 自动停 → 复核键出现（同启 sameStart 另见 t16 探针） | ring03 |
| 4 复核上传 | 「用这一段」 | POST segments 201；响应 segments=1 index=1 缺口=[2,3,4]；页面播报「已录下第 1 段，等待你选择去向。」=true | ring04 |
| 5 选去向投河 | 「确认投河」弹窗：选项行「继续投河」→ 页脚「确认投递」 | 播报「已投河：等下一位陌生人捞到它。」；响应 status=IN_RIVER | ring05 |
| 6 河道捞起 | B 注册登录 → 河道页 → API drawUntil | 「捞一个漂流瓶」在场；响应 isHolder=true；B 瓶页「录第 2 段」=true | ring06a/b |
| 7 接力录段 | B 真录第 2 段 20s → 「继续投河」→「确认投递」 | POST 201 segments=2 index=2；响应 status=IN_RIVER | ring07a/b |
| 11 私密留言 | B 底栏「私密留言」→ select 作者 →「送出留言」 | 候选=[第 1 段 · 拾贝少年#880]；POST /messages 200（**在入海前执行**：产品规则 SEA 后不可写，故环 11 先于环 8 的入海动作） | ring11 |
| 8 回传/入海 | C/D API 补段 3/4 → D UI 弹窗「入海」→「确认投递」 | 响应 4/4 isComplete=true；播报「已入海」；响应 status=SEA seaZone=COMPLETED（回传 RETURN 链由 golden [18] 覆盖） | ring08 |
| 9 公海浏览+评论 | /sea 浏览 →「听这支作品」（本瓶）→ 底栏「公开评论」Modal → 发布 | POST comments 201 → 列表即时可见；GET items=1 命中=true（React UI 面） | ring09a/b |
| 10 收藏 | 「收藏这支作品」→ 按钮变「取消收藏」 | GET /api/me/collections 200 命中本瓶=true（服务端状态驱动） | ring10 |
| 12 举报 | 评论 Modal「举报这条评论」→ 举报窗开 →「提交举报」 | POST /api/reports 204（两 portal 互斥流程真实走通） | ring12 |
| 13 admin 审核队列 | admin/admin123 登录 → /admin | 待处理视图=true；GET /api/admin/reports 200 共 8 条，命中本走查举报=true state=PENDING evidence含评论=true | ring13 |
| 14 漂流日志 | /bottles/:id/log | 时间轴渲染；GET events 200 条数=12；页面关键词命中 4/4（投河/入海/录/捞） | ring14 |

**公开评论 React UI 回归（t27 界面面，与 API 面互补）**：环 9 发帖 201 + 列表即时可见 + GET 命中（UI 面）；环 12 举报 204；环 13 admin 队列 PENDING 且 evidence 含评论正文 —— 三段证据与 t27 的 API 五段（GET 200/POST 201/举报 204/admin 命中）互为表里。

**录段环证据来源**：本走查环 3/4 为 React dev 真机假麦实录（20s 自动停 + 201 + 页面播报）；伴奏+录音同启（t16 语义）复用 `%TEMP%\t16-probe.mjs` 探针（21:21 复跑 `sameStart=true`：录前恰 1 颗「开始录制」、独立伴奏键 0、点击同栈伴奏 paused=false、600ms 内「停止录制」在场），弹层形态另见 t21 四档截图产物。

### 二、既有证据复跑（全部 exit 0）

```text
node apps/web/tools/golden-path-live-check.mjs → ✅ 31 步全绿（4 账号，hermetic 真库+真 HTTP+真音频），exit 0（22:08）
node apps/web/tools/one-screen-check.mjs --viewport=1440x900 → ✅ 全部页面达标（16 路由），exit 0（22:08）
pnpm --filter @music-drift/web typecheck → tsc --noEmit 无输出，exit 0（22:09）
pnpm --filter @music-drift/web test -- bottle-page public-comments app-shell → Test Files 4 passed (4) · Tests 79 passed (79)，exit 0（22:09）
```

### 三、walkthrough.mjs（site/ 参考站）失败 —— 按参考面归属记录，不作部署阻断

- **根因**：site/app/page-bottle.js 依赖 `segment.ownerId`（L239 去向门、L1460 留言收件人，另 L509/853/1309/1630 + page-drift-log.js L308），而 9/29 匿名化契约已把公共详情换成 `isMine/isHolder`（实测 segment keys=[id,index,isMine,note,ownerCode,…] 无 ownerId）⇒ 门恒 false（录完去向列不出现）、收件人过滤恒真（幻影收件人）。
- **8 步复现**（t31 原样）：① dev API 8788 在跑 → `node tools/walkthrough.mjs`（自起 5188 服务 site/）；② 第 0–3 步 PASS（注册、建瓶、真录 20328ms 上传 201 段=1、试听 206、点赞 1）；③ 第 3 步留言面板 FAIL（期望无收件人禁用，实测 select=true submit.disabled=false）；④ 第 4 步 `.destCol` 录完仍 hidden FAIL（三行渲染正确但不可见）；⑤ 点 `.destRow` 超时 20s 中断，止步第 4 环；⑥ 根因探针 `%TEMP%\t31-dto-probe.mjs`（exit 0）打印 segment keys 无 ownerId；⑦ React 面不受影响（bottle-page 64/64、golden 31/31、one-screen 四档绿）；⑧ 修复 = site/app/*.js ownerId→isMine/isHolder 适配（W0 charter 仅 captain 可改）。
- **归属**：site/** 只读设计参考、**非部署面**（captain 裁决）——部署走 React 单服务；用户验收过的全部修复（t15 播放/t16 同启/t21 弹窗/t2 布局/t17 /new/t22 焦点/t28 顶栏）只存在于 React 面，部署 site 会丢。按 t36 合同：不修 site/、不作为部署阻断；用户后续要演示 site/ 或改 HTML 面则另立任务。

### 四、探针迭代记录（红→绿均在探针侧，React 产品代码零改动）

| 轮次 | 结果 | 假红根因（脚本侧） |
| --- | --- | --- |
| v1 | 3/14 | /api/auth/me 形状断言错（user 嵌套）；投河漏「确认投递」；评论在 Modal 里未开；收藏断言 includes('id') 写错 |
| v2 | 8/14 | 三选一弹窗两步制（选项行 + 页脚「确认投递」）只点了第一步；（逐步转储探针 `%TEMP%\t36-ring5-repro.mjs` 定位：上传 →「确认投河」弹窗自动开 → 选项行 aria-pressed → 确认投递 → 播报） |
| v3 | 13/14 | ring6 用即时 isVisible 抢在渲染前（无等待）→ 改 waitFor |
| v4 | 11/14 | castViaModal 抢跑：录后弹窗未开出瞬间点了被遮 destRow → 改为先等弹窗（8s）再兜底 destRow |
| v5 | **14/14 ALL PASS** | — |

期间对 v2 出现的「录后弹层滞留/页面截图停在 refetch 前」做过源码核对：`onUploaded` 播报 + `openDestinationWhenRecorderIsGone`（portal 退出后开去向弹窗）链路在 repro 中健康（0.5s 内完成），滞留为截图时机竞态，非产品缺陷；终态四档走查与套件复跑全绿佐证。

### 五、范围与分注

- 本任务写入：`docs/review.md`（本节，纯追加）+ `%TEMP%`（t36-walk.mjs、t36-ring5-repro.mjs、t36-shots\ 16+ 张终态截图与历轮 fail 截图）；**产品代码零写入**；vite 以独立日志 `.tmp-dev-web.log` 启动（`.tmp-dev.log` 被 dev API 占用，未动对方日志）。
- 运行时数据：本走查在 dev 库新增 5 轮 ×（4 个 t36 账号 + 各自瓶子/评论/举报/留言）—— 运行时验证数据，归 t32 数据重置清理（与 t27 先例同类）。
- `git status` 分注沿用 t31/t26 口径：其余条目均为他方在途/前序任务（t28 shell、t22 sea、t17 song-picker、t16/t21 record、t15 segment、t3/t11 遗留、并发 holdings 修复等），无一条系 t36 所写。

## 2026-10-05 部署前最终统一验收（t34 · landing-revert-bottle-ux）

> 任务 t34（kind=verification，attempt 2ecbef9d-e70d-4b4a-9b7c-d2e9dff1b0d7）。验收时点 2026-10-05 00:45–00:56。对齐用户验收标准「评委可以直接通过链接访问体验所有功能 + 数据脱敏最重要」。本任务只写本章节（纯追加）。

### 一、五轴证据总表

**轴① 公开评论可用（t27/t29/t36 之上独立复跑，00:53 `COMMENT CHAIN ALL PASS` exit 0）**
- `GET /api/bottles/:id/comments` = **200**，shape=`{items,nextCursor}`，种子评论可见=true；
- 新账号 A `POST` 发帖 = **201**（authorAccount=t34amuu27wzp、isMine=true）→ 列表 GET 命中=true；
- 新账号 B `POST /api/reports`（targetType=COMMENT）= **204**；
- admin `POST /api/auth/login` = 200 → `GET /api/admin/reports` 队列命中本条=true。
- 互补在案：t27 API 五段 + t29 内容寻址评审 + t36 UI 三段（发帖 Modal→列表、举报窗、admin 队列 PENDING）。

**轴② 全功能金路径（t31 证据 + 抽样复跑）**
- 抽样复跑 00:53：`node apps/web/tools/golden-path-live-check.mjs` → ✅ **31 步全绿**（4 账号，hermetic 真库+真 HTTP+真音频字节），exit 0；
- 完整 UI 面证据引用 t36 终跑 **14/14 ALL PASS**（16 环截图 %TEMP%\t36-shots）与 t31/walkthrough 第 0–3 步 PASS 记录（site/ 面归属见 t31/t36 章节）。

**轴③ 数据脱敏零 PII 复验 + 演示数据覆盖 + admin 真机登录（全部本轮新证据）**
- 运行库逐项（`%TEMP%\t34-pii.mjs`，dev 库，凭据不回显）：users=5 全合成代号（admin/demo/driftmate1-3）、handle 像邮箱=0、像手机号=0、**users.email 列=0、email 索引=0（0009 生效）、backup_* schema=0**；内容表逐行正则：public_comments/messages/notifications/reports/anon_codes 的 email/phone 全 **0 命中**；bottle_segments 整行 6 个"手机号"命中经**逐列复核定性为 audio bytea 十六进制渲染的假阳性**（非 bytea 列全部 0，note 列 0）。
- 仓库 grep（git grep，排除 example.com/依赖锁）：**2 处 qq.com 邮箱**——`docs/figma/README.md:14`（用户本人 Figma 授权账号注记）与 `.agents/skills/personal-homepage-skill/README.md:267`（装备的 skill README 示例）；均非产品/运行数据、**不进部署产物**（Dockerfile COPY 仅 `packages`+`apps`+根配置，docs/.agents 不入镜像）、git remote 为空未发布 → 列入遗留④待裁决是否清理。手机号仓内 grep=0。
- **发现与处置**：dev 库演示数据已被 23:26（admin.created_at=2026-10-04T15:26:37Z）的最后一次 reset 清空（bottles=0、comments=0、/api/sea items=0）→ 重跑 `node tools/seed-demo.mjs`（exit 0，幂等声明式）恢复：**三态瓶齐（SEA 完整 1 + IN_RIVER 1 + 公海等待 1）、收藏 1、种子评论 1（合成文案）、SEA 瓶 events=15、真 WebM/Opus 自检通过**，`GET /api/sea` items=1、demo 账号三块面板非空。
- admin 真机（`%TEMP%\t34-ui.mjs`，**UI PROBE ALL PASS** exit 0）：.env `SEED_ADMIN_PASSWORD` 登录 200 → 落 `/admin`、待处理视图可见、未命中「审核台只对管理员开放」闸门（截图 %TEMP%\t34-shots\admin-dashboard.png）。

**轴④ landing 独立导航（t28/t30 之上真机再验，同探针 ALL PASS）**
- `/` 直达 landing（url 停 /，h1=「唱过无痕，声声有应。」）；
- 顶栏链接恰 **[河道, 公海, 我的, 设置]**，header/nav 内「介绍」= **0**（正文唯一一处「介绍」为 landing 散文 `<p>`「本页介绍的每条规则…」，非导航项——已按元素定位记录）；
- CTA：第 8 屏「去开始体验」→ `/login?next=%2Friver`（截图 landing-cta.png）；旁支「唱一段投进去」→ `/new`。
- 套件互证：`test -- app-shell routes landing-page` 118/118 绿（见第二节）。

**轴⑤ 部署路径（二选一 → 选 B：runbook + 可跑产物 + 文案可改实测三件齐全）**
1. **runbook**：`docs/deploy-runbook.md` 实存（t33：§0 方案理由、§0.5 直做盘点+排障、t32 §1–§4、§5 逐步骤含 5.1 用户注册表/5.3 env 表/5.7 评委验收清单 7 项/5.8 回滚、§6 改文案一条龙、§7 本地实测表）；
2. **docker build 产物**：`docker images music-drift-app` → **music-drift-app:latest 1.87GB，18 分钟前**（00:36 终态复跑，本轮 00:47 复核仍在）；配套 `pnpm build` 与 compose 彩排全链 exit 0 记录在 t33 output/runbook §7；
3. **文案可改实测**：runbook §6 在案——改 not-found 文案加 T33COPY → build → dist `index-BN0qQPFi.js` 命中 → 逐字节还原（SHA256 `107723515E89…` 前后一致、git 干净）→ 重建 0 命中。
- 公开 URL 选项 A 不可用（t33 四阻塞点：无 git remote、部署 CLI 全缺、无环境令牌、注册/绑卡须用户亲做）——按合同选 B。

### 二、verify 命令原始输出

```text
pnpm -r typecheck → shared/api/web 三包 tsc --noEmit 全 Done，exit 0（00:45）
pnpm --filter @music-drift/api test -- comments seed → "No test files found, exiting with code 1"（字面空集：仓规 unit 配置 exclude **/*.integration.test.ts，t27/t32 同先例）
  实质替代复跑：pnpm --filter @music-drift/api test:integration -- comments seed → Test Files 3 passed (3) · Tests 12 passed (12)（comments 5/5 + seed 7/7），exit 0
  附：pnpm --filter @music-drift/api test（全单元）→ Test Files 19 passed (19) · Tests 181 passed (181) exit 0（t37 后 api 单元首套全绿）
pnpm --filter @music-drift/web test -- app-shell routes landing-page bottle-page → Test Files 6 passed (6) · Tests 118 passed (118)，exit 0（00:46）
git status --short → 35 条，逐分注见第五节；t34 写入仅 docs/review.md
全量抽样：pnpm --filter @music-drift/web test → Test Files 5 failed | 83 passed (88) · Tests 17 failed | 1298 passed (1315)（00:55，遗留①逐条归属）
```

### 三、遗留项清单（含归属并发会话的豁免红）

1. **web 全量 17 红 = t7 豁免家族**（client 1 / admin 9 / login 3 / river-merge 1 / river 3），根因 a19a4ea 账号契约退役未同步旧夹具（t7 判定口径，与 t16/t21/t28 记录同集、app-shell 已转绿）；**1298 passed / 17 failed**（00:55）。归并发会话修复。
2. **api 侧无遗留**：单元 181/181（t37）、集成 217/217（t35）、comments/seed 12/12 全绿。
3. **字面 verify `test -- comments seed` exit 1** = 空集机制（unit 排除 integration），实质以 integration 12/12 为准（t27/t32 先例双条记录）。
4. **仓内 2 处 qq.com 邮箱**（docs/figma README 用户 Figma 账号注记、装备 skill README 示例）：非运行库/非部署产物/未发布，是否清理待 captain 裁决。
5. **site/ 参考站 ownerId 缺陷**（t31 归属、t36 合同记录）：非部署面不阻断；用户要演示 site/ 时另立任务。
6. **dev 库 23:26 被最后一次 reset 清空演示数据**（admin.created_at 佐证，晚于 t32 的 seed-demo）——本轮已用 seed-demo 恢复并复验；部署时按 runbook §5.5 的迁移+种子 CMD 自动执行。
7. **公网发布平台侧命令未实测**（t33 遗留，runbook 已标「未实测」）；公开链接评委路径待用户完成 runbook §5.1 注册后按 §5.7 清单执行。

### 四、运行时数据分注

本轮新增：dev 库 t34a/t34b 两个走查账号 + 1 条评论 + 1 条举报（评论链复跑）+ seed-demo 恢复的三态演示数据（t32 工具产物）——均为运行时验证/演示数据，不入库代码；后续重置由 `pnpm db:reset` + `node tools/seed-demo.mjs` 再生。

### 五、范围与分注（git status 35 条）

- **t34 写入 = 仅 `docs/review.md`（本章节，纯追加）**；产品代码零写入；探针/截图全在 `%TEMP%`（t34-pii/t34-state/t34-tables/t34-ui/t34-comments/t34-recheck + t34-shots 3 张）。
- 其余 34 条逐分注：t33 五件（Dockerfile、docker-compose.prod.yml、docs/deploy-runbook.md、docs/deploy-plan-html.md、package.json）；t32 四件（.env.example、apps/api/src/db/seed.ts、seed.integration.test.ts、tools/seed-demo.mjs）；t35 = holdings.integration.test.ts；t37 = mounted.test.ts；t28 五件（shell 四件 + landing-page.test）；t21 六件（record-step/recorder-panel/modal/components.test）；t15 四件（segment-player/use-segment-player 双源双测）；t11 双 D；t3 两件；t2/t10/t14 遗留（bottle-page.test、bottle-page.css、one-screen-check）；t17 两件；t22 两件；docs/review.md = t7/t26/t31/t36/t34 各章节累积。零回滚。
