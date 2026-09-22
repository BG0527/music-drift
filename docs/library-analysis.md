# 曲库分析工具：方法与**预注册**规则（t13）

> 本文件是 `tools/library-analysis.py` 的方法说明，同时是**预注册凭据**：
> 下文 §3 的判定规则在**首次重跑分析之前**写下；规则先于结果存在，避免"事后按结果挑标准"。
> 预注册时序证据见 §5（文件 mtime 早于 `library.json` 的 mtime）。
>
> 背景：本任务接手时发现前任实现的 BPM 选择存在**循环验证**——
> `tools/library-analysis.py:356-357` 用 `min(candidates[:12], key=|bpm − official_bpm|)`
> 从候选里挑"离官方值最近"的那个，再用官方值算偏差。偏差因此**在结构上必然 ≈ 0**
> （−0.00% / −0.01% / +2.94%），不构成独立证据。官方值当时是**输入**，现在改为**输出**。

## 1. 为什么用这套方法（而不是自相关）

Incompetech 详情页只公布 `Length` 与 `Tempo(BPM)`，**不公布拍号**；captain 早期的
ffmpeg+numpy 自相关检测已明确不予采信（BPM 偏差 4.7% / 13.1% / 16.8%，且把 `On the Shore`
判成 3/4，而官方描述里唯一的圆舞曲是 `Rains Will Fall`）。本工具改为：

| 测量 | 方法 |
| --- | --- |
| 起音包络 | 多频带 spectral flux（半波整流 + 归一化），全频 + 低频 40–250Hz 两路 |
| 速度候选 | 包络 DFT 显著度（tempogram），叠加 2/3/4 次谐波加权，扫描 40–200 BPM / 0.05 步长 |
| 速度精调 | 梳状对齐：在候选 ±3%（0.01 步长）× 全相位（P/24）上最大化**网格点包络均值** |
| 拍号 | 以**低频**包络的节拍网格重音轮廓为基础，对 2/3/4/6 算"重音对比度 × 下拍稳定性" |
| 分段 | 与拍号无关：边界吸附到 ±1.5s 窗口内的最强起音（越界则收紧窗口重算） |
| 响度 | ITU-R BS.1770-4（K 加权 + 门限积分 LUFS）+ 样本峰值 |

## 2. 关键纪律：期望值必须是**输出**

- 官方 BPM/描述**只在事后**用于盲比对；不参与任何选择、搜索、阈值或参数调整。
- 如果音频结果与官方值不匹配，**这是一个发现**，写进报告；**不因此调整算法参数**——
  把"符合期望"当成"算法正确"是同一种自欺的第二种形态（ADR 记载为第 2 次同源问题）。
- 每首曲目**无论边际大小**都必须报出边际（top-N 得分、比值、与判定带边界的距离）。

## 3. 预注册判定规则（R-1 … R-6）

**R-1 候选集**：取 tempogram top-12 候选，并入各自的 ×2 与 ÷2 别名（去重、夹到 [40,200] BPM）。

**R-2 精调**：对每个候选，在其 ±3% 与全相位上做梳状对齐，取 `(bpm*, phase*, Sn)`；
`Sn = 网格点包络均值`（**除以网格点数**，故不会因网格更密而系统性偏高）。

**R-3 初选**：`f1 = argmax Sn`。

**R-4 八度消歧（核心）**：对选定层级 `L`（周期 `P`）**两个方向都测**，不可只测一个方向。

- **向上**：`r_finer = mean(env @ L 网格 + P/2 交错点) / mean(env @ L 网格点)`
  —— 交错位置是否与 L 的拍点同样重。
- **向下**：`r_coarser = mean(env @ "L 网格中不属于 L/2 网格的点") / mean(env @ L/2 网格点)`
  —— L 相对更粗层级的**多出来的**那些点是否成立。

判定顺序（先向下、再向上，最多各走一级，全程夹在 [40,200]）：

1. `r_coarser ≤ 0.55` → L 只是更粗层级的**细分**（多出来的点很弱）⇒ **降一级** `L ← L/2`。
2. 否则 `r_finer ≥ 0.75` → 更细层级同样是真拍 ⇒ **升一级** `L ← L·2`。
3. 否则 → **保持 L**。
4. 任一方向的 r 落在 `(0.55, 0.75)` 的开区间 ⇒ 标 `ambiguous: true`（僵持），
   同时报出 L 与备选层级的 `Sn`，让读者看到结论有多决定性。**不做单值断言。**

> **修订记录（预注册期间，早于任何真实测量）**：初版 R-4 只测"向上"方向
> （`r = mean(交错)/mean(粗)`）。在写合成对照 S-2 时发现该规则**无法发现"选定层级其实是细分"**
> 的情形：若 argmax 选中了细分层级，向上测只会去看更细的一级，于是永远发现不了它上面还有真节拍。
> 故改为双向判定。此修订发生在**首次重跑真实曲目之前**（见 §5 时序证据），符合预注册纪律。

**R-4b 八度约定（消歧失败时的兜底，必须预注册）**：当 R-4 判定为僵持、
或同级 `Sn` 出现并列（边际 < 1%）时，**按统一约定**在 `{L/2, L, 2L}` 中取落在
**人类打拍习惯带 [60, 120) BPM** 的那一级；若带内有多个或都没有，则取 `Sn` 更高者并标 `ambiguous`。

> 为什么需要这条：包络经过 `log1p` 压缩后，强弱拍的能量差会被大幅抹平，
> 于是"100 与 200 谁是真节拍"在包络上可能**真的无法判定**（合成对照 S-2 实测 r_finer ≈ 0.70，落在僵持带）。
> 与其让并列名次决定答案（那是另一种"事后挑标准"），不如**预注册一个与期望值无关的统一约定**，
> 并把"约定被触发"这件事**显式写进输出**（`conventionApplied: true`）。
> 该约定只看 BPM 落点，**不看官方值**——Immersed 的 64、Rains 的 85 落在带内是**结果**，不是理由。

**R-5 边际必报**：每首恒报
① 判定所用层级的 `Sn` 与次优层级的 `Sn` 及其相对差；
② `r` 值与它到 0.55 / 0.75 两条边界的距离；
③ 该曲目是否触发 IMPASSE。

**R-6 官方值仅作事后比对**：先算音频结果 → 再读官方值 → 输出偏差；偏差写入 JSON 与报告。

## 4. 已知答案的对照（防止"新选择器同样无法自证"）

`tools/tempo-selftest.py`（开发期自测，无需音频素材）：

| 用例 | 合成信号 | 期望 |
| --- | --- | --- |
| S-1 正对照 | 已知 BPM = 100 的等强 click | 恢复 100 ±1，且 `r` 判为细分（≤0.55） |
| S-2 **含强 2× 成分的负对照** | 主拍 100 BPM（等强）+ 正中间**较弱** click（幅度 0.35，制造 200 BPM 成分） | 恢复 **100**（不得偏好 2×），并报出 `r≈0.35` |
| S-3 **变异测试** | 把 R-4 的偏好方向反转（"偏好细分层级"）后重跑 S-2 | **必须失败**（得到 200）—— 证明该断言有牙齿 |

S-3 的意义：如果反转偏好后断言仍然通过，说明这条断言并没有真正约束选择器。

## 5. 预注册时序证据（实测 mtime）

| 时间（本机 +08:00） | 事件 | 证据 |
| --- | --- | --- |
| 02:57:20 | **预注册文档写出**（R-1…R-6 初版） | `docs/library-analysis.md` |
| 02:57:20 | 合成对照自测写出（S-1/S-2/S-3） | `tools/tempo-selftest.py` |
| 02:57–03:15 | **两处规则修订**（R-4 改双向判定；新增 R-4b 打拍带约定）——均由合成对照发现，**期间未跑任何真实曲目** | `tools/library-analysis.py` mtime = 03:15:05 |
| 03:15 之后 | 首次真实曲目运行：因控制台 GBK 编码打印 `⚠` 崩溃（**未写出 JSON**） | 修复后重跑 |
| 03:22:36 | **首次成功的真实测量**，写出 `library.json` | `apps/web/public/library/library.json` mtime = 03:22:36 |

结论：**规则与其两次修订都早于真实测量**，不可能由结果倒推；两次修订的动因是**合成对照失败**
（而非"结果不符合期望"），符合预注册纪律。

对照：前任版本用官方值挑候选（`library-analysis.py:356-357`），其偏差 −0.00% / −0.01% / +2.94%
在结构上必然 ≈ 0 —— 新旧版本的口径差异见 §2/§3。

## 6. 复跑与产物

```bash
# 1) 规则自测（合成信号 + 变异）
python tools/tempo-selftest.py

# 2) 只校验元数据（CI / 评审可跑，不需要数据库）
pnpm --filter @music-drift/api exec tsx src/audio/library-cli.ts --check

# 3) 重新分析并写 library.json（含证据表）
python tools/library-analysis.py
```

| 产物 | 位置 |
| --- | --- |
| 分析证据 + 元数据 | `apps/web/public/library/library.json` |
| 入库 CLI | `apps/api/src/audio/library-cli.ts`（`--check` / `--allow-unreviewed`） |
| 分段听感确认表（交用户拍板，**未定稿**） | `docs/library-segments-confirmation.md` |
| 本文件（预注册） | `docs/library-analysis.md` |

## 7. 验收证据（t13，本机实测）

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 规则自测（含变异） | `python tools/tempo-selftest.py` | exit 0：S-1 100.02 / S-2 100.03（含 2× 成分仍恢复 100）/ S-3 反转约定带 → 得 200 → **断言失败即"有牙齿"** |
| 元数据校验 | `tsx src/audio/library-cli.ts --check` | exit 0：3 首、每首 4 段、起音证据齐全、等响目标 −24.73 LUFS |
| 真实入库 | `tsx src/audio/library-cli.ts`（DATABASE_URL 指向本地 5433） | exit 0：`入库完成：3 首 / 12 段 · licensed_source=incompetech-cc-by-4.0` |
| 入库幂等 | 同命令再跑一次 | 行数不变（songs/segments 未增加），按 songId 覆盖写 |
| DB 抽查 | `select title, total_segments, licensed_source from songs` | `Immersed` / `Rains Will Fall` / `On the Shore`，各 `total_segments=4`，`licensed_source=incompetech-cc-by-4.0` |
| 段落抽查 | `select s.title, g.index, g.start_ms, g.duration_ms, g.accompaniment_ref from song_segments g join songs s on s.id=g.song_id` | 每首 `index` = 1,2,3,4（**不压缩**）；start_ms/duration_ms 与 `library.json` 一致；`accompaniment_ref` = `/library/*.mp3` |
| 单元/集成 | `pnpm -r typecheck` / `shared test` / `api test` / `vitest run src/features/audio` | typecheck 0 error；shared **231**、api **149**、features/audio **159** 全绿 |

## 8. 尚未完成（诚实边界）

1. **分段边界未经用户听感确认** → 见 `docs/library-segments-confirmation.md`（提案状态，未定稿）。
2. **署名「已上线」未达成**：署名组件（`features/audio/library-attribution.tsx`，4 条测试）已交付，
   但**「设置 / 关于」页的挂载归 `frontend-flow`**（t11/t12），挂载说明已发给对方。
3. **无浏览器实测**：会话内没有浏览器 —— 伴奏播放与成品混音只到**组件/纯函数 + jsdom 假 Audio 元素**层；
   真机（含移动端）听感验证归 t14 与用户。
4. ~~`tempoDecision` 未进 shared 的 zod 契约~~ → **已裁决（captain，2026-09-23）：不扩展 schema。**

   | 项 | 内容 |
   | --- | --- |
   | 裁决 | **不**在 `packages/shared/src/audio/library.ts` 增加 `tempoDecision` |
   | 依据 | 准入规则「新增字段的理由必须是**有消费者要据此做不同的事**，而不是"这个数据有意思"」。当前**没有任何 UI 读它**：选歌/分段/伴奏播放/署名只需 曲目·段号·起止秒·伴奏引用。一旦进契约即为对外承诺（改它要升版本 + 通知前后端 + 维护 schema），为无消费者的数据付这个代价是纯负担 |
   | 审计价值如何满足 | 证据留在**本文件**（预注册规则 + mtime 时序 + 边际）+ `library.json` 产物 + `library-cli --check` 输出 —— **来源凭据在仓库里**，可审计 |
   | 字段现状 | 只存在于 `library.json`（脚本产物）；`LibraryMetadataSchema` 会 **strip 未声明键**，故 Web 端 parse 后拿不到它。CLI 打印"BPM 依据"时**直接读原始 JSON**（`apps/api/src/audio/library-cli.ts` 的 `evidenceByFile`），不依赖契约 |
   | 复审触发条件 | 若将来**某处 UI 要展示"这首曲子的节拍判定依据"**（例如给评审看分析透明度）→ 那是出现了消费者，届时再扩展 schema |
