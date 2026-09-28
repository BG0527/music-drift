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
