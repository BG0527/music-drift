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
