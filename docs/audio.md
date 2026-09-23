# docs/audio.md — 音频链路设计说明（t7：录制 / 上传 / 播放）

> 本文是**音频链路的唯一设计说明**。产品规则以 `CONTEXT.md` 为准，架构决策以 `docs/architecture.md` 为准
> （D-02 音频存库、ADR-009 浏览器端音频、ADR-015 段号与缺口），视觉以 `DESIGN.md` 为准。本文不重复它们，只写"怎么实现、怎么接线、哪里还没做"。
>
> 归属：`packages/shared/src/audio/**`、`apps/api/src/audio/**`、`apps/web/src/features/audio/**`（t7 / audio-engineer）。
> `apps/web/src/pages/**` 与其它 `features/*` 属 t11/t12：**页面可以 import 本模块，但不要修改它**。

---

## 1. 一条录音从麦克风到"被别人听到"

```text
浏览器                                                                  服务端
────────                                                                ────────
getUserMedia({audio:true})
  └─ MediaRecorder（容器按 RECORDER_MIME_PREFERENCES 协商）
        ├─ AnalyserNode → 波形（纯装饰，进度另有文字）
        └─ 计时（文字可读：录制中 00:12 / 30；30 秒自动停）
                 │
                 │ onstop → Blob + 时长 + 归一化 MIME
                 ▼
  客户端先校验（shared/audio 的同一套规则）
  时长 15–30s ／ 容器白名单 ／ 体积 ≤4MB
                 │
                 │ POST /api/bottles/:id/segments（multipart：audio + durationMs + note）
                 │ ← **请求体里没有 index**：段号由服务端 nextRecordIndex 决定（ADR-015 §16.8）
                 ▼
  进度（XHR upload.onprogress）＋ 失败重试（网络/408/429/5xx；422/409 不重试）
                 │
                 ▼  服务端（t9 落地路由；音频侧守门人已在 apps/api/src/audio）
        validateSegmentAudioUpload()：缺失 / 格式 / 体积 / 容器一致性 / 时长 → 422 + 稳定错误码
        insertBottleSegment()（t5 封装）：audio 以 bytea 存入 bottle_segments.audio
                 │
                 ▼
        GET /api/segments/:segmentId/audio   ← **带 HTTP Range 的流式播放端点**
        200 / 206（Content-Range）/ 416（Content-Range: bytes */size）/ 404
                 │
                 ▼
  <audio> 播放；timeupdate / seeking / ended → ListenTracker
  覆盖率 < 80% → 点踩按钮禁用 + 中文原因（还差多少百分比）
                 │
                 ▼
  POST /api/segments/:id/votes { value:'DISLIKE', listenedRatio }（服务端二次校验 ≥0.8）
```

---

## 2. ⚠️ 录音必须在 `https://` 或 `localhost` 下运行（浏览器策略，不是 bug）

`getUserMedia` 只在**安全上下文**可用：`https://` 或 `http://localhost` / `127.0.0.1` / `[::1]`。

- 用**局域网 IP**（`http://192.168.x.x:5173`）或 **http 域名**打开页面时，浏览器**根本不提供**麦克风接口
  （`navigator.mediaDevices` 被隐藏），这与代码无关；
- 也**不能**用 `http://127.0.0.1:5173` 之外的地址绕过（vite 绑定 `localhost`，Windows 上解析为 `[::1]`）；
- 部署到公网时必须走 HTTPS（见 `docs/architecture.md` D-06 / t16）。

代码层面已经做了**降级引导**（不允许静默失败）：

| 情况                              | 判定                                                                 | 界面表现                                                                                                              |
| --------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| http 非 localhost                 | `checkRecordingSupport(...).reason === 'INSECURE_CONTEXT'`           | danger 提示：「录音只在 https:// 或 localhost 下可用…请改用 https:// 地址，或在本机用 http://localhost:5173 打开」    |
| 缺 `getUserMedia`                 | `NO_GET_USER_MEDIA`                                                  | danger 提示：建议换较新版本 Chrome / Edge / Safari                                                                    |
| 缺 `MediaRecorder` / 容器都不支持 | `NO_MEDIA_RECORDER` / `pickRecorderMime() === null`                  | danger 提示：说明缺什么，建议换浏览器                                                                                 |
| 权限被拒 / 无设备 / 设备被占用    | `describeMicrophoneError()` → `DENIED` / `NO_DEVICE` / `DEVICE_BUSY` | danger 提示：分平台修复指引（Chrome 地址栏锁形图标 → 麦克风；Safari「设置 → 网站 → 麦克风」），并说明"已录内容不会丢" |

自测方法：`pnpm -r dev` 后用 `http://localhost:5173`（不要用 IP）。手机真机联调需要 HTTPS 隧道（t16）。

---

## 3. 录音容器与时长

| 约束                 | 值                                                                              | 位置                                            |
| -------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| 每段时长             | 15–30 秒（`SEGMENT_MIN_MS` / `SEGMENT_MAX_MS`）                                 | `shared/src/audio/constants.ts`（CONTEXT §3.1） |
| 单段体积上限         | 4 MB（`MAX_AUDIO_BYTES`）                                                       | 同上                                            |
| 容器偏好（按序协商） | `audio/webm;codecs=opus` → `audio/webm` → `audio/mp4` → `audio/ogg;codecs=opus` | 同上                                            |
| 服务端接受的白名单   | `audio/webm` / `audio/mp4` / `audio/ogg` / `audio/wav`                          | 同上                                            |

- **Chrome / Edge / Firefox** 走 webm+opus；**Safari 只支持 mp4/AAC**（D-10 裁决：Chromium + WebKit 双必须），
  因此 mp4 必须在偏好表里 —— 这是"Chrome 与 Safari 均可录"的实现基础。
- **30 秒自动停**：与其让用户录完 35 秒再被服务端拒，不如到点自动收尾；28 秒起给 warning 提示。
- **服务端不解析容器时长**：Chrome 的 MediaRecorder 产出的 webm 常常不写 `Duration` 元素，
  按容器推算时长会得到"大部分文件核实不了"的假保险。因此服务端校验的是
  ① 声明 MIME ② 真实容器（**魔数嗅探**，防"声明 webm 实际 mp4"）③ 体积 ④ 客户端上报的时长。
  客户端上报的时长**可能撒谎** —— 这是**已知残留风险**，已在 §7 记录，需要更强的防作弊时应走服务端解码（需新依赖，须先按 AGENTS §7 登记）。

---

## 4. 播放：HTTP Range 语义（`GET /api/segments/:segmentId/audio`）

| 请求                                        | 响应                                                         |
| ------------------------------------------- | ------------------------------------------------------------ |
| 无 `Range`                                  | `200` + 全量字节 + `Accept-Ranges: bytes` + `Content-Length` |
| `Range: bytes=0-99`                         | `206` + `Content-Range: bytes 0-99/<size>` + 精确切片        |
| `Range: bytes=500-`                         | `206` + `Content-Range: bytes 500-<size-1>/<size>`           |
| `Range: bytes=-200`（后缀）                 | `206` + 末尾 200 字节（**Safari 探测 moov 就靠这个**）       |
| `Range: bytes=<size>-`                      | `416` + `Content-Range: bytes */<size>`（不读数据）          |
| 语法非法（`bytes=abc`、`bytes=10-5`、多段） | **忽略 Range**，`200` 全量（RFC 7233 "MAY ignore"）          |
| 段不存在 / 段上没有音频 / id 非 UUID        | `404`（统一文案，不回显内部信息）                            |
| `HEAD`                                      | 与 `GET` 同头、无响应体                                      |

其它响应头：`Content-Type` 用库里存的 MIME；`Cache-Control: private, no-store`（别人的声音不进共享缓存）。

实现要点：切片在 **SQL 里**完成（`substring(audio from $2 for $3)`），不把整段音频读进 Node 内存再切；
`bottle_segments.audio` 是 bytea（D-02），写入路径统一走 t5 的 `db/segments.ts#insertBottleSegment`。

权限口径：**本 Demo 该端点匿名可读**（`segmentId` 是 UUIDv4，不可枚举；"随机捞到就能听"是产品语义）。
账号级/持有者级收紧归 t9/t12，扩展点是 `registerSegmentAudioRoutes(app, { repository })` 之前加 preHandler。

---

## 5. 「听满 80% 才能点踩」怎么测（这是本任务最容易做错的地方）

要求是"**听满该段 80%**"（CONTEXT §7.3）。这里的口径是**覆盖率**，不是"累计播放时长"：

| 度量        | 含义                                                       | 用途                                         |
| ----------- | ---------------------------------------------------------- | -------------------------------------------- |
| `coveredMs` | 真的播放过的音频区间的**并集**长度（同一区间重播只算一次） | **判定**（`ratio = coveredMs / durationMs`） |
| `playedMs`  | 累计播放时长（含重播）                                     | 仅展示/诊断                                  |

`ratio` 同样用于服务端二次校验（`CastVoteRequest.listenedRatio`），UI 与内核共用同一门槛常量
（`DEFAULT_POLICY.dislikeListenRatioThreshold = 0.8`，**全仓只有一份**）。

反作弊规则（每条都有测试）：

1. **跳转不计**：相邻两次 `timeupdate` 的位置差 > `DEFAULT_MAX_STEP_MS`（1500ms；浏览器约 250ms 一次）
   → 视为拖动进度条，不产生任何覆盖率；
2. **重播不叠加**：覆盖率是区间并集，循环重播一小段永远听不满（不是把时长叠出来）；
3. **兜底后置（fail-closed）**：时长不可信（0 / NaN / 服务端没给）→ `ratio` 恒为 0，点踩按钮不可用；
4. **尾差只在连续播放时补**：`ended` 只补"最后一个 tick → 片尾"那一段（且不超过容差）；
   拖到 99% 再等 `ended` 拿不到白送的尾差；
5. 边界测试：**79.9% 拒 / 80% 过**（`shared/src/audio/listening.test.ts`、`recording.test.ts` 与
   `apps/web/src/features/audio/use-segment-player.test.ts` 各有一组）。

区间覆盖的副作用（有意为之，已记录）：听到 8 秒（0–8s）与听到另外 8 秒（12–20s）**都算 80%** ——
要求是"听满 80%"，不要求一口气听完。

---

## 5.1 阶段一混音与成品导出（t8）

把各段人声拼成可试听、可下载的成品，**纯人声无伴奏**（用户裁决），实现说明与**对齐误差实测报告**见
**`docs/mix-report.md`**。接线一句话：

```tsx
import { MixExportPanel } from '../features/audio';
import { planMonoSequentialMix } from '@music-drift/shared/audio';

const plan = planMonoSequentialMix({
  segments: bottle.segments.map((s) => ({
    index: s.index,
    durationMs: s.durationMs ?? 0,
    audioUrl: `/api/segments/${s.id}/audio`,
    ownerCode: s.ownerCode,
  })),
  totalSegments: bottle.totalSegments, // 来自数据，不硬编码 4
  nominalDurationByIndex, // 可选：来自 /api/songs 的 songSegments.durationMs
});

<MixExportPanel plan={plan} />;
```

要点：缺口保留为**静音占位**并显式标注（段号永不压缩）；对齐误差阈值 120ms（D-05）；
阶段二叠加伴奏时只换 `MixPlanner`，调用方不改。

## 5.2 透给页面的"当前段已听状态"（`SegmentPlayer.onProgress`）

`t12` 的**点踩门槛（听满 80%）**需要页面拿到**真实已听比例**，因此 `SegmentPlayer` 新增一个**只做转发**的回调：

```tsx
import { SegmentPlayer, type SegmentListenSnapshot } from '../features/audio/segment-player';

<SegmentPlayer
  src={segment.audioUrl}
  segmentIndex={segment.index} // 服务端给的段号
  durationMs={segment.durationMs}
  onProgress={(s: SegmentListenSnapshot) => {
    /* s.ratio 就是当前段已听比例 */
  }}
/>;
```

| 字段              | 语义                                                                         | 消费者该怎么用                                                     |
| ----------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `segmentIndex`    | 这份进度属于哪一段（与服务端一致）                                           | 只在"进度回调与当前渲染的段"是同一段时才用于判定                   |
| `ratio`           | **当前段已听比例** = `coveredMs / durationMs`，0..1；时长不可信时为 0        | 门禁用它；如需随投票上送，直接作为 `CastVoteRequest.listenedRatio` |
| `coveredMs`       | 已覆盖区间**并集**毫秒数（判定"听满"的唯一依据）                             | 展示/诊断                                                          |
| `playedMs`        | 累计播放毫秒数（含重播）                                                     | 仅展示；**不要**拿它算比例                                         |
| `dislikeUnlocked` | 是否已达点踩门槛（门槛 = 内核 `DEFAULT_POLICY.dislikeListenRatioThreshold`） | 直接用于禁用/启用点踩；**不要在页面写死 `0.8`**                    |

**三条纪律（避免出现第二份规则）**：

1. **不要自己重算覆盖率**：区间并集/拖动不计/循环不叠加/fail-closed 全部在
   `packages/shared/src/audio/listening.ts` 的 `ListenTracker` 里实现，本回调**只透传**其 `progress()` 结果。
2. **阈值只有一个来源**：门槛由内核 `DEFAULT_POLICY.dislikeListenRatioThreshold` 决定；
   UI 侧不要比较 `ratio >= 0.8` 这样的字面量，直接用 `dislikeUnlocked`（或 `canDislike(ratio)`）。
3. **服务端仍会二次校验**：客户端 `ratio` 只是体验层门禁；投票时是否受理以 API 为准
   （`CastVoteRequest.listenedRatio` + 服务端规则），页面不要因本地判定通过就跳过错误处理。

实现与证据：`apps/web/src/features/audio/segment-player.tsx`（`SegmentListenSnapshot` + 转发）、
`use-segment-player.ts`（唯一覆盖率来源，`ListenTracker`）。
测试（`segment-player.test.tsx`，5 条，先红后绿）：
透出值 = 覆盖率 / **拖动不虚高**（跳 9s 后 ratio 仍 ≈0.525 而非 0.975）/ **循环不叠加**（ratio 封顶 1，`playedMs` 才增长）/
门槛由内核判定（17s/20s → `dislikeUnlocked`）/ 时长不可信时 fail-closed（ratio 0）。

---

## 6. 接线指南（给 t11 / frontend-flow）

```tsx
import {
  RecorderPanel,
  SegmentPlayer,
  SegmentTimeline,
  uploadSegmentAudio,
  createBrowserRecorderEnvironment,
} from '../features/audio'; // 或用约定的别名 '@/features/audio'

// ① 录第 N 段。**N 必须来自服务端**：RecordSegmentResponse.nextRecordIndex（补位时 = 最小缺口段号）
<RecorderPanel
  segmentIndex={nextRecordIndex} // ← 禁止用 live.length + 1 推算
  totalSegments={song.totalSegments} // ← 来自数据，禁止硬编码 4
  onRecorded={async (recording) => {
    const result = await uploadSegmentAudio(
      { bottleId, audio: recording.blob, durationMs: recording.durationMs, note },
      { onProgress: (p) => setUpload(p) },
    );
    if (!result.ok) {
      // 409 → 「这一段已经被别人接走」+ 两个出口动作；422 → 展示 result.violations 的 message
      // 失败时录音仍在内存里，提供「重试上传」与「本地回放确认」（DESIGN.md Error States #4）
    }
    // 成功：段号以 result.segment.index 为准
  }}
/>;

// ② 试听某一段（src 指向 Range 端点）
<SegmentPlayer
  src={`/api/segments/${segment.id}/audio`}
  segmentIndex={segment.index} // ← 服务端给的固定段号
  durationMs={segment.durationMs}
  ownerCode={segment.ownerCode}
  isOwnSegment={segment.ownerId === me}
  onCastDislike={() => castVote({ segmentId: segment.id, value: 'DISLIKE', listenedRatio })}
/>;

// ③ 段落时间轴：缺口（斩浪留下的位置）必须有独立状态，不得压掉
<SegmentTimeline
  currentIndex={nextRecordIndex}
  segments={segments.map((s) => ({
    index: s.index,
    durationMs: s.durationMs,
    state: s.deletedAt ? 'gap' : 'done',
  }))}
/>;
```

要点：

- 页面**不要自己算段号**、不要在传参里加 `index`（契约与上传客户端都不带它，有测试钉住）；
- 页面**不要直接 import lucide**：图标走 `design-system` 的 `Icon`（t7 已登记 `Mic/MicOff/Play/Pause/Square/RotateCcw/ThumbsDown/UploadCloud` 等）；
- 页面负责把 `availableResolutions`（去向三选一）与上传结果串起来；音频模块只管录制/上传/播放；
- 阶段一（当前）= **纯人声、无伴奏**（用户 2026-09-23 裁决）。伴奏在 t13/阶段二，与本模块无关。

---

## 7. 已知缺口与残留风险（如实记录）

0. **⚠️ 契约层的一处取舍，请 captain 追认**：音频错误码（`AUDIO_RULE_CODES`，5 个）被**并入**了
   `contracts/common.ts` 的 `RuleCodeSchema`。`docs/architecture.md` §26.4 对 **auth** 码的裁决是 **(A) 独立词表**
   （理由：auth 错误与游戏规则不同类，合并会让所有领域码消费方白背 6 个码）—— 这条理由**不适用于音频码**：
   auth 码只出现在 `/api/auth/*`（单一类别），而音频码出现在**同一个漂流瓶上传端点**上，
   该端点同时会返回领域码（`NOT_HOLDER` / `HOLDING_ALREADY_TAKEN`）。
   若音频码另立词表，客户端必须"按失败类型猜用哪套 envelope"；并入后**一个端点只有一个错误形状**。
   → 我按"一个端点一种错误形状"实现，并在 `docs/api.md` §2.7 写明理由。**若 captain 裁定改回独立词表**，
   代价是：把 5 个码移出 `RuleCodeSchema` + 让上传端点返回联合 envelope（客户端解析逻辑分叉）。
1. **服务端无法核实音频真实时长**：只校验客户端上报值 + 容器魔数 + 体积。
   真正堵住"伪报时长"需要服务端解码（如 `music-metadata`/ffmpeg，属新依赖，须先按 AGENTS §7 登记）。
   影响面：段长可能被注水到 30 秒以上而不被拒；不影响 80% 门槛与斩杀阈值的语义（它们只认比例）。
2. **⚠️ 跨任务缺口（高，已实测）：t7 的 multipart 上传客户端与 t9 当前的段创建端点协议不一致**。
   - t7 交付：multipart 上传客户端（`apps/web/src/features/audio/upload.ts`）+ 音频侧守门人
     `validateSegmentAudioUpload`（`AUDIO_*` 五个码）+ Range 播放端点。
   - t9 当前实现（`apps/api/src/routes/bottles.ts:171`，观察于 2026-09-23 01:38）：
     `POST /api/bottles/:id/segments` 只解析 **JSON** `request.body`，没有任何 multipart 解析器
     （全仓无 `@fastify/multipart`）；落库时写的是 `{ durationMs, audioMime: null, audio: null }`。
   - **实测（临时探针，跑完已删除）**：用真实 Fastify 实例 + 真实 Postgres + 真实会话 cookie，
     以 multipart（`audio` 文件 + `durationMs`）POST 该端点：
     ```text
     [PROBE] status= 400  body= {"error":{"message":"请求内容不合法，请检查后重试。","violations":[]}}
     [PROBE] db row= []        # 没有插入任何行
     ```
     → 结论：**不是静默丢数据，而是硬 400**（我原先按代码推测"会 201 且丢掉音频"，实测推翻了该推测，以此为准）。
     即使改用 JSON 请求体，该路由也会落一条 `audio = null` 的段，而 Range 端点对"有段无音频"返回 `404`
     （该行为有集成测试覆盖）。
   - 需要 t9 二选一（并各自同步 `docs/api.md`）：
     ① **multipart**（与文档现状一致）：登记 `@fastify/multipart`（AGENTS §7 流程）+ 调用
     `validateSegmentAudioUpload()` 校验 + 把 `audio/audioMime/durationMs` 一起落库（`insertBottleSegment` 已支持）；
     ② **改用原始二进制**（`Content-Type: audio/webm`，`durationMs`/`note` 走 query 或头）：零新依赖，
     但要改契约与文档，`upload.ts` 的 `buildSegmentUploadForm` 也随之换掉（改动量很小）。
   - t7 侧两条路都能低成本对接（守门人 / bytea 读写 / 错误码都已就绪），但**换协议属契约变更，不由 t7 单方面拍**。

3. **播放端点匿名可读**（理由见 §4）；账号级/持有者级权限待 t9/t12 收紧。
4. **`RecordSegmentRequest.durationMs` 在契约里是可选字段**，而服务端校验需要它。
   t7 用 `validateSegmentAudioUpload(..., { requireDuration: true })` 默认要求它（缺失即 422），
   **未擅自改契约**；是否把该字段改成必填，请 captain 裁决（改了要同步 `docs/api.md` 与 `CONTRACT_VERSION`）。
5. **测试覆盖到"能力边界"为止**：单元/集成层已覆盖容器协商、权限分支、30 秒自动停、字节级 Range 切片；
   **浏览器实测（Chrome + Safari 真机）**属 t14（qa-e2e）与用户验收范围，本任务未做真机验证。
6. **未提交 git**：按纪律不自行 commit（由 captain 决定提交时机）。

---

## 8. 测试与命令

```bash
# 纯逻辑（前端/后端共用规则 + 80% 判定）
pnpm --filter @music-drift/shared test

# 音频链路单测（Range 解析 / 容器嗅探 / 上传校验 / 播放路由）
pnpm --filter @music-drift/api test

# 音频链路集成测试（真实 Postgres：bytea 写入 → HTTP Range 字节级比对）
pnpm db:up
pnpm --filter @music-drift/api test:integration

# 前端音频能力层（录音 hook / 播放 hook / 上传客户端 / 4 个组件）
pnpm --filter @music-drift/web test
```

当前状态（t7 交付时）：

| 套件                     | 结果                                                          |
| ------------------------ | ------------------------------------------------------------- |
| `shared` 音频纯逻辑      | 2 文件 / 43 用例                                              |
| `api` 音频单测           | 3 文件 / 35 用例                                              |
| `api` 音频集成（真实库） | 1 文件 / 9 用例（300 KB bytea，含跨 8 KB 页边界的字节级比对） |
| `web` 音频能力层         | 9 文件 / 92 用例                                              |

---

## 9. F2（客户端上报实测时长校正门槛分母）——**已作废，代码已删除**（t30，2026-09-24）

### 9.1 为什么作废

用户第十一轮第 4 条裁决：

> "一首歌被切割成四段，它的时长应该是固定的，而用户需要接的就是这段时长。"

分母的**权威来源只有一处**：曲库切分（如 `Immersed` = 23870 / 20619 / 22501 / 23010ms）。
服务端 `presetDurationMsFor(db, {songId, index})` 把它读出来，录制上传时按
`checkRecordingDurationAgainstPreset(durationMs, presetDurationMs, ±SEGMENT_PRESET_TOLERANCE_MS)`
校验（t29）。**客户端不再参与任何时长判定**，于是 F2 整条链路失去消费者。

### 9.2 删了什么（**删除，不是留着**；README 级清单，供 review 核对）

| 删除项                                                                                                                | 原因                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `listen-reporter.ts` 的 `checkMeasuredDuration` + `MEASURED_DURATION_BOUNDS`                                          | 分母不再由客户端主张 —— 保留它就是**第二套分母规则**，迟早有人再接线进来                                        |
| `MeasuredDurationContext` / `MeasuredDurationReport` / `MeasuredDurationDirection` / `state.durationReport`           | 一次性上报状态机整体消失（含 `direction` 白名单与 `RAISED` 枚举守卫）                                           |
| 传输层 `reportMeasuredDuration` + `use-segment-listen.ts` 里的 `POST /api/segments/:id/duration`                      | 端点调用点消失 ⇒ 每播一段少一次必然 404 的请求（真实浏览器实测：`404 Route not found`）                         |
| `use-segment-player.ts` 的 `readMeasuredDurationMs` / `measuredDurationMs` / `loadedmetadata` / `durationchange` 监听 | 读 `element.duration` **没有独立价值**：既不参与覆盖率判定（分母是服务端的 `durationMs`），也不再有任何上报出口 |
| `SegmentPlayer` 快照里的 `measuredDurationMs` / `declaredDurationMs`                                                  | 随上游一起删，避免留下"看起来还能用"的字段                                                                      |
| 上述能力的 26 条单测                                                                                                  | 测试跟着能力走（删能力不删测试 = 留下一堆假绿）                                                                 |

**保留了什么、为什么**：

- `state.serverDurationMs` / `serverRatio` 与 `/listen` 响应解析：它们服务的是**本地门槛即时反馈**，与 F2 无关；
- `ListenProgressSnapshot`（只剩 `coveredMs`）：覆盖率上报是 t20/t21 的防自欺通道，继续存在；
- 服务端 `presetDurationMsFor` + `checkRecordingDurationAgainstPreset`（t29）：这才是现在的分母权威。

### 9.3 诚实边界（**本文件最有价值的那部分，保留**）

"时长来自客户端"这件事的威胁模型没有变，只是结论变了 —— **不再用客户端时长**：

> `measuredDurationMs` 与 `coveredMs` 一样来自客户端 ⇒ 它只修诚实路径，**不是安全边界**。
> 谎报更小的 duration 会让**被点踩的那个段**的门槛变低（所有人都更容易踩它）；
> 谎报更大对段作者有利（更难被斩）。防护：要求先有 `listen_progress`、只允许下调立即生效、
> 上调需多用户一致、落库审计、跨用户取中位数。（architect 2026-09-23，原文见本文件 git 历史）

现在这些**都不需要了**：分母是曲库值，客户端无法主张任何时长。t30 之前那条
"每播一段打一次 `/duration` 并必然 404"的请求也随之消失。

### 9.4 真实联调待办（**未伪造通过**）

- t29（后端固定段时长）已把权威值落到服务端校验；本轮**前端不再有需要联调的时长通道**。
- `RecorderPanel` 的 `presetDurationMs` 需要页面传入（见 §10.3），**接线在 `features/bottle/**` 与 `pages/**`（frontend-flow 域）**，
  我没有越界修改；未接线时录制面板退回"15–30 秒"区间文案（**不假装知道固定时长**）。

---

## 10. t30：播放状态机 / 录制后试听 / 固定段时长 UI（用户第十一轮 #1 #3 #4 前端）

### 10.1 #1 播放完成后再点 = 重播；未播完再点 = 暂停（`segment-player.tsx` + `use-segment-player.ts`）

用户原话：

> "播放完成之后，再次点击播放，应该重新播放一遍，同时UI也有提示。如果没有完成，再次点击就是暂停，需要有体现。"

**状态机**（显式四态，不再用 `isPlaying` 布尔值猜）：`idle`（没播过）→ `playing` → `paused`（中途暂停）→ `ended`（播到结尾）。
判定优先级：`ended` 事件设 `atEndRef` ⇒ `ended`；否则看元素 `paused` / 是否播过 ⇒ `playing` / `paused` / `idle`。

| 状态    | 按钮文案     | 图标      | 状态文字（`aria-live="polite"`）         |
| ------- | ------------ | --------- | ---------------------------------------- |
| idle    | 播放         | Play      | 还没播放                                 |
| playing | 暂停         | Pause     | 正在播放                                 |
| paused  | 继续播放     | Play      | 已暂停（再点继续播放）                   |
| ended   | **重新播放** | RotateCcw | 本段已播完，点击「重新播放」从头再听一遍 |

- `toggle()`：`playing` → 暂停；`ended` → `currentTime = 0` + `tracker.markSeek()`（"回到 0"不算听）+ 播放；其余 → 播放/继续；
- 反馈是**三条彼此独立的通道**（`motion-web` §7「动效不得是唯一反馈」）：
  ① 结构/文字：状态文案本身改变；② 按钮：文案与图标同时换（播放 → 暂停 → 继续播放 → 重新播放）；
  ③ 无障碍：`aria-live="polite"` 播报。只改颜色或只换图标都不算"有体现"；
- 状态文字节点**保持稳定**：`enter-fade` 只负责区块**入场**（DESIGN.md 的入场动效契约，只动 `opacity`、时长/缓动取自 DS token）。
  **刻意不**用"改 `key` 逼动画重播"—— `motion-web` §5 明令禁止"靠改 `key` 造成子树重建"（会丢焦点/输入/滚动位置），
  而且这里不需要：状态变化的可见性由上面三条通道保证；
- 同上，「播完停在结尾、不假装还在播」由真实音频实测（`currentTime = 19.8 / duration = 19.8`）。

### 10.2 #3 录制完成后可试听自己刚录的那一段（`recorder-panel.tsx` + `use-recorder.ts`）

用户原话：

> "当录制接唱完成之后，我希望有一个试听按钮，让用户可以听到自己现在录下的声音。"

- **不依赖上传**：试听用的是**本地** Blob（`URL.createObjectURL` → 游离的 `new Audio()`），上传失败也照样能听；
- 按钮文案与状态文字与 §10.1 **同一套语义**（试听本段 / 暂停试听 / 继续试听 / 重听本段），
  避免"同一个用户在试听和听别人时看到两套行为"；
- **绝不给"点了没反应"的按钮**：`createPreviewElement` 与 `createObjectURL` **两个都拿到**才暴露 `previewUrl`；
  拿不到（宿主不支持 / 策略禁用）就安静地不提供试听，其余动作（用这一段 / 重录）不受影响；
- 生命周期：重录 / 卸载 / 换录都会 `pause()` + `revokeObjectURL()`（不留 blob 泄漏、不留"上一段还在响"）；
- 守卫：`recorder-environment.test.ts` 用变异证明（临时移除 `createPreviewElement` → 用例转红）守住"生产实现必须提供两个端口"。

### 10.3 #4 录制端固定段时长 UI（`presetDurationMs`）

用户第 4 条裁决的 UI 落点（取代"15–30 秒"动态区间）：

| 场景               | 表现                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| 有本段时长         | 「本段 20.6 秒（与这段伴奏等长，允许 ±2.0 秒）」+ 计时分母显示 `20.6`；**不出现**"15–30 秒"    |
| 录制中             | 「录制中 00:05 / 20.6」+「还差 15.6 秒录满本段（允许 ±2.0 秒）」                               |
| 录满（到本段时长） | **自动停止**（`autoStopMs = presetDurationMs`），状态「已录 00:20 / 20.6」，「用这一段」可用   |
| 提前停且超出 ±2 秒 | warning 文案 = 共享函数的原文（含"本段固定时长 / 相差 X 秒 / 允许 ±2.0 秒"），「用这一段」禁用 |
| **拿不到**本段时长 | 退回「15–30 秒」区间文案（回退口径），**不假装知道固定时长**                                   |

判定与上传客户端、服务端读**同一个函数与同一个容差**（`checkRecordingDurationAgainstPreset` + `SEGMENT_PRESET_TOLERANCE_MS`），
不会出现"前端说行、后端说不行"。

**接线状态（2026-09-24 19:1x 复核：已接线）**：`presetDurationMs` 由页面传入，正确来源是
`GET /api/songs` 的 `SongSegmentSchema.durationMs`（与 t29 的服务端权威值同源），**无需新契约字段**。
frontend-flow 已在 `apps/web/src/features/bottle/record-step.tsx:178` 传入 `presetDurationMs={preset}`，
并有针对该接线的测试（`record-step.test.tsx` 的「录制步骤：本段固定时长（presetDurationMs）的接线」）。
**我未越界修改该文件**（它在 frontend-flow 域），此处只记录事实。

**未接线时的行为（fail-closed，供复核）**：录制面板禁用「开始录制」+ 说明原因（不会再"回退 30 秒也能录"）。

### 10.4 顺带修掉的一个真实缺陷：`/listen` 请求体是浮点（真实浏览器 400）

**发现方式**：用真实 Chromium 跑"录 20 秒 → 上传 → 投河 → 播放"整条链路时，`POST /api/segments/:id/listen`
**21 次全部 400**，响应体 `{error:{message:"请求内容不合法，请检查后重试。", violations:[]}}`（连 violations 都是空的，光看响应体查不出原因）。

**根因**：`coveredMs` 来自 `currentTime * 1000`（浮点），而契约 `SubmitListenProgressRequestSchema`
是 `z.number().int().nonnegative()` ⇒ 服务端按"非法请求"拒掉。后果不是"少报一点"，而是
**覆盖率永远推不上去 ⇒ 点踩门槛（0.8）永远不满足**（用户点踩只会一直看到"还没听满"）。

**为什么单测没抓住**：`listen-reporter.test.ts` 的假传输层 `Math.floor` 掉了浮点 —— 契约校验只在真服务端发生。
现在那条新用例**直接拿真实契约 schema 校验实际发出去的请求体**（`SubmitListenProgressRequestSchema.safeParse`），
修法是 `observe()` 里唯一一处归一化点向下取整（宁少报不多报，覆盖率不能靠四舍五入凑门槛）。
修复后真实浏览器复测：**21 次 /listen 全部 200**。

### 10.5 动效契约与"能证明什么"（`motion-web` §2/§3/§5/§7/§8）

| 自检项（§10 落地前自检）                        | 本实现的答案                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 目的（feedback/guidance/continuity/decoration） | `enter-fade` = **continuity**（区块入场）；**没有** decoration 类常驻/循环动效              |
| 参数来自哪个契约 token                          | DS `.enter-fade` → `motion.css` 的 `--entry-duration` / `--entry-easing`（只动 `opacity`）  |
| 是否只动 transform/opacity                      | 是（组件里没有任何内联动效类；`motion-usage.test.ts` 静态扫描把这条钉住）                   |
| 退场是什么                                      | 状态文字不做出场（它就是常驻的一行）；按钮的按下/悬停反馈由 DS Button 自带的 200ms 过渡承担 |
| `reduced-motion` 下变成什么                     | `motion.css` 的全局降级把动画变成瞬时（动效消失，**文字与 aria-live 仍在**，信息不丢）      |
| 还有别的反馈通道吗                              | 有：状态文案 + 按钮文案/图标 + `aria-live`（§7 的"动效不得是唯一反馈"）                     |

**可断言契约**：`apps/web/src/features/audio/motion-usage.test.ts`（静态扫描）断言
① 状态文字只引用 DS 的 `enter-fade`；② 组件里没有内联动效数值（`duration-[…]` / `cubic-bezier` / `animate-[…]` / `transition-[…]`），
也不动画布局属性；③ 没有"改 `key` 逼动画重播"的写法（**变异验证**：临时加回 `key={player.playbackState}` → 该用例转红，还原后转绿）。

**哪一层验证不了（如实标注，不含糊）**：jsdom 没有布局与合成器 ⇒ **屏幕上的流畅度/视觉观感本仓库目前无法自动验证**；
真实浏览器探针证明的是**状态机与真实音频行为**（播完→重播、未播完→暂停、试听真的出声），**不是**动效的视觉平滑度。
若要证明后者，需要真机录屏或性能采样 —— 目前**没有**，需要时请 captain 派单。

### 10.6 真实浏览器证据的**可重建配方**（captain 2026-09-24 裁决：不入库，但配方必须能重建）

本文 §10.1–§10.4 的"真实浏览器"结论来自一个仓库外的**一次性探针**（真 Chromium + 假麦克风 + 一次性库 + 自起 API/vite）。
按 captain 裁决它**不作为依赖入库**（AGENTS.md §7：E2E 工具属待裁决项），但**配方 + 完整脚本**已落进仓库：

👉 **[`docs/handover/browser-probe-recipe.md`](./handover/browser-probe-recipe.md)** —— 含
① 哪一层能证明什么（jsdom / 静态扫描 / 真浏览器各自的能力边界）；
② 五个成功要点（假麦克风参数、一次性库、`MDB_API_TARGET` 必须设在 `process.env`、cookie、**挂钩 `new Audio()` 抓游离元素**）；
③ 已知干扰的判读（HMR 会让元素脱离 ⇒ 判"本轮不算数"，**不是产品缺陷**）；
④ **断言清单**（§10.1/§10.2/§10.3 上述每一条结论对应哪条断言与期望数值）；
⑤ 完整可执行脚本（与运行副本逐字节一致）。

## 11. 真实麦克风盲区：「录完试听没有声音」（t40，用户第十三轮第 ⑤ 条）

### 11.1 现象与盲区（为什么以前没发现）

用户实测："录完之后点「试听」，也没有声音。"

**盲区**：本会话此前所有"录音通过"的证据都来自 Playwright 的**假麦克风**
（`--use-fake-device-for-media-stream`，输入是**合成音**）。它证明的是"链路能产生**可解码**音频"，
**不能**证明"用户的声音被录进去了" —— 这一条正好落在盲区里。

### 11.2 可控复现（把"感觉"变成数字）

用 `--use-file-for-fake-audio-capture=<wav>` 把输入换成**我完全控制的音频文件**，对同一套 UI 流程各跑一遍
（仪器：仓库外 `D:/music-rec-probe/mic-probe.mjs`；用 `python` 生成两个 WAV 即可重建，见 §11.7）：

| 输入（等价场景）                                  | 解码峰值        | 应用自己的波形最大柱高   | 试听播放                         | 应用当时给出的提示 |
| ------------------------------------------------- | --------------- | ------------------------ | -------------------------------- | ------------------ |
| `tone.wav` 440Hz @ -12 dBFS（等价"真人在说话"）   | **-4.8 dBFS**   | 26–58%（随采样时机）     | `paused=false, currentTime 0.86` | 无                 |
| `silence.wav` 数字静音（等价"选错设备/系统静音"） | **-673.8 dBFS** | **4%**（= 面板最小柱高） | `paused=false, currentTime 0.96` | **无**             |

**结论（量化，不是推断）**：录制链路、objectURL、试听播放**都没坏**（两种情况都真的在"播放"）；
坏的是——**录到的是静音时，应用一句话都不说**。用户于是只能怀疑"是不是功能根本没做"。

### 11.3 修复：录完当场量一次，把结论摆在界面上

| 位置                          | 做了什么                                                                                                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clip-level.ts`（新，纯函数） | `measureSamples` / `measureClipLevel` / `toDbfs` / `judgeClipLevel` / `formatPeakDbfs`；阈值 `SILENT_PEAK_DBFS = -60`                                                                                                         |
| `recorder-environment.ts`     | 新增端口 `measureClip?(blob)`：浏览器实现用 `AudioContext.decodeAudioData` 解码录音并量峰值（**独立于**录制与试听链路，量的是"文件里到底有什么"）                                                                             |
| `use-recorder.ts`             | 录完在后台量一次（`clipLevel: ok / silent / unavailable`）；**会话号守卫**：解码结果晚到时若用户已重录则丢弃                                                                                                                  |
| `recorder-panel.tsx`          | `silent` ⇒ warning（含实测峰值 + 去查什么的指引）+ **禁用「用这一段」**（`aria-describedby` 指向该说明）；`ok` ⇒ 显示实测峰值（让用户看到结论依据）；`unavailable` ⇒ 如实说"测不出"，**不拦**（我们测不出来不等于用户没录到） |

**阈值取 -60 dBFS 的理由**（写在 `clip-level.ts` 文件头，同一处维护）：数字静音实测 ≈ -674 dBFS，
真实语音（Chrome 默认开 AGC）通常 > -30 dBFS。取 -60 是为了**只抓"完全没有信号"**：
宁可放过小声但真实的录音（说话轻/离麦远），也不要误判逼用户白重录 —— 误判比不提示更糟。

### 11.4 修复后的实测（同一仪器、同一输入，before/after）

| 输入     | 修复前     | 修复后                                                                                                                        |
| -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 数字静音 | 无任何提示 | `这一段几乎没有录到声音（峰值 -673.8 dBFS，低于 -60 dBFS）。先看录制时的波形有没…`；「用这一段」**禁用**                      |
| 440Hz    | 无提示     | `本段录到了声音（峰值 -5.3 dBFS）。`；**不拦**（该次「用这一段」不可用是因为**时长门槛**：探针只录 3 秒 vs 本段 20 秒 ±2 秒） |

**回归**：t30 的整条链路仪器（`probe.mjs`：真录满 20 秒 → 真上传 → 真投递 → 播放 → 试听）在新门槛下仍是
**`[result] ALL PASS`** ⇒ 新门槛**没有拦住正常录音**。

### 11.5 用户可自己执行的判断步骤（真机上按这个顺序）

1. **录制时盯着波形**：说话时柱子不动 ⇒ 浏览器压根没拿到声音（不是播放的问题）；动了但录完提示"几乎没有录到声音" ⇒ 输入电平太低或设备选错；
2. **看应用给的读数**：录完面板会直接写「本段录到了声音（峰值 -X dBFS）」或「几乎没有录到声音」——
   这一步已经替你把"有没有录到"量出来了；
3. **查浏览器权限与设备**：地址栏左侧的锁/摄像头图标 → 麦克风权限；`chrome://settings/content/microphone` 看默认设备是不是你要用的那只；
4. **查操作系统输入**：Windows「设置 → 系统 → 声音 → 输入」对着麦克风说话看电平条是否跳动（不动就是系统层面没收到）；
5. **确认没被静音**：耳机/笔记本的物理静音键、麦克风静音开关、其它会议软件（Teams/Zoom）是否独占设备；
6. **确认"听"的那一头也对**（录到了声音但仍听不到时查这条）：试听走的是**系统默认输出设备**——
   蓝牙耳机/HDMI 显示器/虚拟声卡切走之后，声音会跑到你没在听的那台设备上；顺手确认系统音量与浏览器标签页音量不为 0。

### 11.6 边界（我验证到哪一层，如实写）

- **已量化验证**：受控输入（正弦 / 数字静音）下的**编码内容**、**解码峰值**、**应用自己的波形**、**试听播放行为**、**修复后的 UI 结论**；
- **未验证**：**用户本人的真实麦克风**（我无法访问用户设备）。因此「用户现在能听到自己的声音」需要**用户本人回一句话确认**；
  如果用户的真实麦克风仍然是"录到静音"，那份 `mic-probe.mjs` 报告（§11.7）会把事实定到设备/权限层面，而不是产品层面；
- 本节的读数来自 **Chromium**；Safari/WebKit 的 mp4/AAC 路径未在受控输入下量过（同一仪器换浏览器即可，未做）。

### 11.7 复现配方（可重建）

```bash
# 1) 生成两个受控输入（无需 ffmpeg：直接写 WAV 头 + PCM）
python -c "
import struct, math
def wav(path, seconds, freq=None, dbfs=-12.0, rate=48000):
    n=int(rate*seconds); amp=0 if freq is None else int(32767*(10**(dbfs/20)))
    data=b''.join(struct.pack('<h', 0 if freq is None else int(amp*math.sin(2*math.pi*freq*i/rate))) for i in range(n))
    open(path,'wb').write(b'RIFF'+struct.pack('<I',36+len(data))+b'WAVEfmt '+struct.pack('<IHHIIHH',16,1,1,rate,rate*2,2,16)+b'data'+struct.pack('<I',len(data))+data)
wav('silence.wav', 12); wav('tone.wav', 12, freq=440, dbfs=-12.0)"

# 2) 跑仪器（一次性库 + 自起 API/vite + 真 Chromium + 上面那个 WAV 当麦克风）
node D:/music-rec-probe/mic-probe.mjs tone.wav
node D:/music-rec-probe/mic-probe.mjs silence.wav
```

输出是一份 JSON 报告 + 一行结论文本：`应用录到的内容峰值 / 应用自己的波形最大柱高 / 试听播放 / 应用给出的结论 / 时长门槛 / 「用这一段」可用`。
（仪器本身**不入库**，理由同 §10.6：Playwright 属 AGENTS.md §7 的待裁决项。）
