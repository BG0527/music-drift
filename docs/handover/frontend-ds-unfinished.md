# 未完成清单 · frontend-ds（停机 2026-09-23 09:00 前）

> 触发：用户排程「9:00 前收尾停机，12:00 回话再继续」。
> 我的在飞任务：**t13（伴奏曲库接入，attempt 2）**，状态 `in_progress`，**无代码在飞**（等用户耳测）。
> 与之配套的 captain 全局快照见同目录 `2026-09-23-0841-stop-snapshot.md`。

## 1. 等外部输入（我不能推进，也不许自己拍板）

| #   | 事项                                                                                                                                                                  | 归属          | 恢复条件                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | **分段表耳测确认** —— `docs/library-segments-confirmation.md` 里三首各 4 段的切点（3 个问题：切点是否落在自然乐句起点 / 段长 20.6–23.9s 是否合适 / 三轨响度是否一致） | **用户**      | 用户回话；captain 转达后我按该文件 §3 处理：确认→标定稿；否决某边界→**只改那一个边界并记修订**，不动算法参数去迎合 |
| 2   | **署名「上线」** —— `LibraryAttribution` 组件已在仓库并有 5 条测试，但「设置/关于」页的挂载 + §46.3 改弹窗由 **frontend-flow（t12）** 做                              | frontend-flow | 对方挂载完成并回一条证据                                                                                           |

两条都不需要我在场即可推进；**恢复后我不需要动代码**（除非耳测否决某个切点）。

## 2. 我这几轮的交付（都已验证，恢复时可直接复跑）

| 任务        | 交付                                                                                                                                         | 复跑命令                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| t2          | `DESIGN.md` 海洋化重写（22→30 色 token，核心纪律逐字保留）                                                                                   | `bash /tmp/atwork/verify.sh`（若临时文件已清，改用 `docs/` 里的对照表；核心断言：`grep -c` 命中数与 md5） |
| t3          | `docs/figma/**`（已裁决差异清单 + 缺口清单 + 调用台账；7 帧未采已记缺口，4 帧移交 t18）                                                      | 无自动化；见 `docs/figma/README.md` §7/§8                                                                 |
| t10         | `apps/web/src/design-system/**`（theme/fonts/motion + tokens + 10 类组件 + Showcase）、DESIGN.md 的 8 个 tint/border token 与 Use Case amend | `pnpm --filter @music-drift/web test` 、`pnpm -r typecheck`、`pnpm --filter @music-drift/web build`       |
| t13（部分） | 预注册速度/拍号/分段规则 + 合成对照自测 + 三首元数据 + 入库 CLI 幂等 + 署名组件 + `SegmentPlayer.onProgress` 透出                            | 见 §3 的四条命令                                                                                          |

**最后一次实测的绿基线（我的范围）**：`vitest run src/features/audio` **14 文件 / 165 用例 exit 0**；`pnpm -r typecheck` **0 error**；`eslint` 我改过的文件 exit 0；`prettier --check` clean。
（全仓基线以 captain 快照 §1 为准：shared 231 / api 168 / web ~377。）

## 3. t13 的复跑与验收命令（恢复后照抄即可）

```bash
# ① 规则自测（含变异）：必须看到 S-3 使 S-2 断言失败
python tools/tempo-selftest.py            # 期望 exit 0

# ② 元数据校验（不需要数据库）
pnpm --filter @music-drift/api exec tsx src/audio/library-cli.ts --check

# ③ 真实入库（需要 docker Postgres 5433 已起）
pnpm db:up && pnpm db:migrate
env DATABASE_URL='postgres://music_drift:music_drift_dev@localhost:5433/music_drift' \
  pnpm --filter @music-drift/api exec tsx src/audio/library-cli.ts
# 期望：入库完成：3 首 / 12 段 · licensed_source=incompetech-cc-by-4.0（幂等，重跑行数不变）

# ④ 重新分析三首（会重写 library.json；规则见 docs/library-analysis.md）
python tools/library-analysis.py
```

产物与账本：`docs/library-analysis.md`（方法 / **预注册规则 R-1…R-6 + R-4b** / mtime 时序证据 / §7 验收证据 / §8 诚实边界）、
`docs/library-segments-confirmation.md`（**提案，未定稿**）、`tools/library-analysis.py`、`tools/tempo-selftest.py`。

## 4. 恢复后的下一步（按优先级）

1. **收用户耳测结论**（§1-1）→ 若某切点被否决：改该边界 + 在 `docs/library-analysis.md` 的修订记录里写明，重跑 ② ③，**不改参数去迎合**。
2. **确认署名弹窗化后是否需要我的组件改 props** → 见 §5，**结论：当前不需要**；若 frontend-flow 要求弹窗内不重复标题，我可加 `title?: string | null`（1 行 + 1 测试），需 captain 派单。
3. §46.3「一屏装下 + 声明式内容改弹窗」若涉及我域内组件（`design-system/**` 已交付、`features/audio/**` 的伴奏/署名），**等 captain 派单**再动，不自行扩面。

## 5. 关于「署名组件放入弹窗」的答复（captain 问的）

**不需要改 props。** 依据（读代码而非记忆）：

- `library-attribution.tsx` 的结构是 `<Card className={cn('flex flex-col gap-3 rounded-xl', className)}>` + 若干文本块，
  **没有任何固定宽度/整页宽度假设**，宽度由容器决定 → 放进 `Modal`（`max-w-[47.5rem]`、`p-8`）自然铺满；
- 许可 URL **不作为可见文本**渲染（只在 `href` 上），不存在长字符串撑破弹窗的横向溢出风险；
- 两个外链已带 `min-h-11`（≥44px 触控）与 `target="_blank" rel="license noreferrer"`；
- 标题层级是 `h3`，放在有 `h2` 标题的 dialog 里是**正确的嵌套**，不是重复。
- 唯一可选改动：若 frontend-flow 希望弹窗内不显示组件自带的小标题，需要一个可关闭标题的 prop（默认保持现状）。**当前 YAGNI，我不擅自加。**

## 6. 边界、纪律与未闭风险（不得对外表述为「零缺陷」）

- **未提交改动**：本次停机时，我域内未提交的文件是
  `apps/api/src/audio/library-cli.ts`、`apps/web/src/features/audio/segment-player.tsx`、`apps/web/src/features/audio/segment-player.test.tsx`、`docs/audio.md`（§5.2）。
  ⚠️ `apps/web/src/design-system/nav.tsx` 显示为已修改，但**不是我改的**（新增 `footer?: ReactNode` 侧栏底部槽位）——按纪律我没碰它，归属请向 t12/frontend-flow 核实。
  （`apps/web/src/features/audio/upload.test.ts`、`apps/web/tools/golden-path-live-check.mjs` 同样**非我改动**。）
- **未闭风险 1（真机）**：会话内无浏览器 —— 伴奏播放、混音、`onProgress` 透出都只到**纯函数 + jsdom 假 Audio 元素**层；
  真机（含移动端 375）听感与交互验收仍归用户/t14。
- **未闭风险 2（BPM 口径）**：`docs/library-analysis.md` 已写明——八度层级由**预注册约定**（打拍带 [60,120)）决定，
  **不是数据独立判定**；三首 argmax 与官方 Tempo 差一个八度；`On the Shore` 同八度内仍有 **+2.94%** 真实偏差（未调参迎合）。
  读该表时**不要**把"偏差接近 0"读成独立验证。
- **已裁决**：不扩展 `packages/shared/src/audio/library.ts` 的 zod schema（不加 `tempoDecision`），
  复审触发条件 = **出现真正消费该字段的 UI**（记录在 `docs/library-analysis.md` §8.4）。
- **未采的 Figma 帧**：`docs/figma/**` 里 3 帧因 429 未采、4 帧移交 t18；`docs/architecture.md §46` 记的配额耗尽状态未变。
- **后续视觉工作的纪律**（captain §46.5）：开工前必须逐个 load `frontend-design` / `afrexai-ui-design-system` / `css-animation-creator`，
  且报告要**引用具体用到的条款**，不接受「已调用」式的空口声明。我恢复后按此执行。
