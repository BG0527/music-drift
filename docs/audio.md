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
