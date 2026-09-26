/**
 * 共享层 · 录音会话（**不做 UI、不碰 DOM 结构**：只提供数据与状态，页面负责显示）
 *
 * 为什么要有这一层：录音规则在 `packages/shared/src/audio/recording.ts` 里是**纯函数**，
 * 但浏览器 import 不了 TS ⇒ W1-a / W1-b 各自在页面里抄了一份常量与逻辑
 * （MIME 协商顺序、`getUserMedia` 失败文案、预设时长倒数）。这里把那份抄写收成**唯一一份**。
 *
 * **来源（契约改了要同步这里，反过来也一样 —— 见 `docs/deploy-plan-html.md` §10.5）**：
 *   - MIME 候选顺序、15/30 秒区间 ← `packages/shared/src/audio/constants.ts`
 *     （`RECORDER_MIME_PREFERENCES` / `SEGMENT_MIN_MS` / `SEGMENT_MAX_MS`）；
 *   - 可用性判定顺序、麦克风失败分类与引导文案 ← `packages/shared/src/audio/recording.ts`
 *     （`checkRecordingSupport` / `describeMicrophoneError`）；
 *   - 时长口径 ← 同文件 `checkRecordingDuration`：`MediaRecorder` 不报时长
 *     ⇒ 一律用**开始/停止的时间戳差值**。
 *
 * 浏览器没有 TS 加载器，这份是**手抄的**（不是生成的）：改了上面那份就回来改这里，
 * 别让两边漂移。本文件的对外面只有下面 `export` 的那几个。
 */

/**
 * 容器候选（**顺序即优先级**）：与 `constants.ts` 的 `RECORDER_MIME_PREFERENCES` 同序同值。
 * Chrome/Edge/Firefox 走 webm+opus；Safari 只支持 mp4/AAC，所以 mp4 必须在列表里。
 */
const RECORDER_MIME_PREFERENCES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

/** 每段时长区间（秒的千分之一）：与 `constants.ts` 的 `SEGMENT_MIN_MS` / `SEGMENT_MAX_MS` 同值。 */
export const SEGMENT_MIN_MS = 15_000;
export const SEGMENT_MAX_MS = 30_000;

/** 本机主机名（安全上下文豁免名单）：与 `recording.ts` 的 `LOCAL_HOSTNAMES` 一致。 */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function isLocalHostname(hostname) {
  const host = hostname.trim().toLowerCase();
  return LOCAL_HOSTNAMES.has(host) || host.endsWith('.localhost');
}

/**
 * 录音可用性判定：返回 `null` = 可用，否则是**可直接显示的中文引导**。
 *
 * **顺序很重要**（同 `recording.ts`）：环境问题（http 非 localhost）优先于能力问题 ——
 * 在 http 页面上 `navigator.mediaDevices` 会被浏览器藏起来，若先报"浏览器不支持"，
 * 用户会去换浏览器，而问题其实在访问地址上（AGENTS.md §9）。
 */
export function checkRecordingSupport() {
  const secure = window.isSecureContext === true || isLocalHostname(location.hostname);
  if (!secure) {
    /** 端口从 `location` 取，不写死 5182/5173：部署后这条提示才说真话（守卫禁"写死开发主机"）。 */
    const port = location.port === '' ? '' : `:${location.port}`;
    return (
      '录音只在 https:// 或 localhost 下可用，浏览器不会在 http 页面里开放麦克风。' +
      `请改用 https:// 地址打开，或在本机用 http://localhost${port} 打开本页（局域网 IP、http 域名都不行）。`
    );
  }
  if (navigator.mediaDevices?.getUserMedia === undefined) {
    return (
      '这个浏览器没有提供麦克风接口（navigator.mediaDevices.getUserMedia）。' +
      '请改用较新版本的 Chrome、Edge 或 Safari 再试。'
    );
  }
  if (window.MediaRecorder === undefined) {
    return '这个浏览器不支持 MediaRecorder，无法录制音频。请改用较新版本的 Chrome、Edge 或 Safari 再试。';
  }
  return null;
}

/**
 * 容器协商：按 `RECORDER_MIME_PREFERENCES` 顺序取第一个被浏览器支持的容器。
 * 返回 `null` = 一个都不支持 ⇒ 调用方必须显示"不支持"，**不得静默失败**。
 * `isTypeSupported` 抛异常按"不支持"处理（探测本身不能把页面炸掉）。
 */
export function pickRecorderMime() {
  for (const candidate of RECORDER_MIME_PREFERENCES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {
      // 探测失败按不支持处理，继续试下一个候选
    }
  }
  return null;
}

/**
 * `getUserMedia` / `MediaRecorder` 抛出的异常 → **可直接显示的中文文案**。
 * 分类与 `recording.ts` 的 `describeMicrophoneError` 一致（两页原先各自映射过的名字在这里取并集，
 * 不允许出现"原先有文案、现在掉进 UNKNOWN"的分支）。
 */
export function describeMicrophoneError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return '麦克风权限被拒绝，录不了音：点地址栏左侧的锁形图标 → 网站设置 → 麦克风改为「允许」，然后重试。';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return '没有检测到可用的麦克风：接上或启用麦克风后刷新本页重试。';
    case 'NotReadableError':
    case 'TrackStartError':
      return '麦克风被其他程序占用了：先关掉正在使用麦克风的程序（会议软件、语音通话、录音工具）再重试。';
    default:
      return `麦克风启动失败：${error?.message ?? '未知原因'}，请检查系统权限与设备后重试。`;
  }
}

/** 松开麦克风（释放失败不影响状态机）。 */
function releaseStream(stream) {
  try {
    for (const track of stream?.getTracks() ?? []) track.stop();
  } catch {
    // 释放失败不影响状态机
  }
}

/**
 * 「这一段该录多久」的**纯算术**：预设时长由调用方从 API 传入（曲库是唯一权威来源），
 * 本函数**不写死任何秒数**。
 *
 * @param {number|null|undefined} presetMs 该段曲库预设时长；缺失/非法 ⇒ 倒数不可用。
 * @param {number} elapsedMs 已录时长（用 `session.elapsedMs()`）。
 * @returns {{ presetMs: number|null, elapsedMs: number, remainingMs: number|null,
 *             remainingSeconds: number|null, reached: boolean }}
 *   `remainingSeconds` 为 `null` = 没有权威预设（页面据此不显示倒数、也不自动停）；
 *   `reached` = 已经录满预设时长（页面据此决定要不要自动停）。
 */
export function countdown(presetMs, elapsedMs) {
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  if (!Number.isFinite(presetMs) || presetMs <= 0) {
    return { presetMs: null, elapsedMs: elapsed, remainingMs: null, remainingSeconds: null, reached: false };
  }
  const remainingMs = Math.max(0, presetMs - elapsed);
  return {
    presetMs,
    elapsedMs: elapsed,
    remainingMs,
    /** 向上取整：倒数期间显示的秒数不许比真实剩余时间还少。 */
    remainingSeconds: Math.ceil(remainingMs / 1000),
    reached: elapsed >= presetMs,
  };
}

/**
 * 协商容器 → 取麦克风 → 起录。**不含任何 DOM**。
 *
 * 失败一律返回 `{ ok: false, message }`，`message` 就是可直接显示的中文文案
 * （环境不支持 / 容器不支持 / 麦克风被拒），调用方不必再判 `error.name`。
 *
 * @param {{ onStop?: (result: { blob: Blob, durationMs: number, mime: string }) => void }} [options]
 *   `onStop` 在**正常停止**后**恰好触发一次**（含浏览器自己停）；`cancel()` 不触发。
 * @returns {Promise<{ ok: true, session: object } | { ok: false, message: string }>}
 */
export async function startRecordingSession({ onStop = null } = {}) {
  const unsupported = checkRecordingSupport();
  if (unsupported !== null) return { ok: false, message: unsupported };

  const mime = pickRecorderMime();
  if (mime === null) {
    return { ok: false, message: '这个浏览器不支持任何可用的录音容器（webm / mp4 / ogg），录不了音。' };
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    return { ok: false, message: describeMicrophoneError(error) };
  }

  let recorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime });
  } catch (error) {
    releaseStream(stream);
    return { ok: false, message: `这个浏览器不能录音：${error?.message ?? 'MediaRecorder 不可用'}` };
  }

  const chunks = [];
  const startedAt = performance.now();
  let cancelled = false;

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data !== null && event.data.size > 0) chunks.push(event.data);
  });
  recorder.addEventListener('stop', () => {
    const durationMs = Math.round(performance.now() - startedAt);
    releaseStream(stream);
    if (cancelled) return;
    const type = recorder.mimeType === '' ? mime : recorder.mimeType;
    onStop?.({ blob: new Blob(chunks, { type }), durationMs, mime: type });
  });

  /** 1 秒一片：中途停下的录制也有数据，又不会把内存吃满（`MediaRecorder` 会自己收尾）。 */
  recorder.start(1000);

  return {
    ok: true,
    session: {
      /** 已录时长＝**时间戳差值**（`MediaRecorder` 自己不报时长）。 */
      elapsedMs: () => Math.round(performance.now() - startedAt),
      isRecording: () => recorder.state === 'recording',
      /** 正常停止：`onStop` 会拿到这一次的 `blob` 与 `durationMs`。重复调用无副作用。 */
      stop: () => {
        if (recorder.state === 'recording') recorder.stop();
      },
      /** 放弃这次录制：松开麦克风，**不**触发 `onStop`。 */
      cancel: () => {
        cancelled = true;
        if (recorder.state === 'inactive') releaseStream(stream);
        else recorder.stop();
      },
    },
  };
}
