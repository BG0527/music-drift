/**
 * 录制面板：录音页的**全部状态**（DESIGN.md 明确要求自建状态，不得以"Figma 没有状态帧"为由跳过）。
 *
 * 状态清单与对应语义：
 *
 * | 状态 | 语义 | 依据 |
 * | --- | --- | --- |
 * | 环境不满足（http 非 localhost / 缺接口 / 容器都不支持） | danger + 可照做的引导 | AGENTS.md §9、DESIGN.md Error States #5 |
 * | 麦克风权限被拒 / 无设备 / 设备被占用 | danger + 分平台修复指引 | DESIGN.md Error States #5（禁用系统 alert） |
 * | 录制中 | 计时文字 + 波形 + warning（接近上限） | DESIGN.md 组件「录制 / 波形区」 |
 * | 时长不合格（<15s / >30s） | warning + 说明区间 + 只能重录 | CONTEXT §3.1 |
 * | 上传失败 | **warning 而不是 danger**（数据没丢）+ 重试上传 | DESIGN.md Error States #4 |
 *
 * 段号（`segmentIndex`）**由服务端给**（`nextRecordIndex`），组件只显示，不推算（ADR-015 §16.8）。
 */
import { useEffect, useId, useRef } from 'react';
import type { RecorderEnvironment } from './recorder-environment';
import { useRecorder, type PreviewState, type SegmentRecording } from './use-recorder';
import { formatClock, formatSeconds } from './format';
import { Button, Icon, cn } from '../../design-system';
import type { UploadPhase } from './upload';

/**
 * 试听（用户实测需求 ③）的**按钮文案 + 状态文案**表。
 *
 * 为什么必须两张文案都写死在一张表里：用户的原话是"录制接唱完成之后要有一个试听按钮"，
 * 而这里最容易做错的是**播完再点**——如果按钮仍叫"试听本段"，用户点下去只会看到没反应。
 * 与 `segment-player.tsx` 的 `PLAYBACK_UI` 保持**同一套语义**（idle/playing/paused/ended），
 * 这样同一个用户在试听和听别人那一段时，看到的行为与文案是一致的。
 * 状态一律有**文字**表达，不靠颜色或图标变化（DESIGN.md 无障碍条款）。
 */
const PREVIEW_UI: Record<
  PreviewState,
  { label: string; icon: 'Play' | 'Pause' | 'RotateCcw'; state: string }
> = {
  idle: {
    label: '试听本段',
    icon: 'Play',
    state: '还没试听。点「试听本段」听听自己刚录的这一段，不满意可以重录。',
  },
  playing: { label: '暂停试听', icon: 'Pause', state: '正在试听你刚录的这一段。' },
  paused: { label: '继续试听', icon: 'Play', state: '试听已暂停（点「继续试听」接着听）。' },
  ended: {
    label: '重听本段',
    icon: 'RotateCcw',
    state: '刚录的这一段已经听完，点「重听本段」从头再听一遍。',
  },
};

export interface RecorderUploadView {
  phase: UploadPhase;
  /** 0..1；总量未知时为 null。 */
  ratio: number | null;
  message: string | null;
  retryable: boolean;
  onRetry?: () => void;
}

export interface RecorderPanelProps {
  /** 本次录的是歌里的第几段。**必须来自服务端**（`nextRecordIndex`）。 */
  segmentIndex: number;
  /** 歌的总段数（来自数据，不硬编码 4）。 */
  totalSegments: number;
  environment?: RecorderEnvironment;
  /**
   * 本段的**固定时长**（ms）——曲库权威值（`song.segments[index].durationMs`，t29 口径）。
   *
   * 用户第 4 条裁决："一首歌被切割成四段，它的时长应该是固定的，而用户需要接的就是这段时长。"
   * 给了它就取代"15–30 秒"动态区间：显示本段时长、**录满自动停**、提前停明确说还差多少。
   * 拿不到（历史数据、页面还没接线）时为 null/未给 → 退回区间文案，**不假装知道**。
   */
  presetDurationMs?: number | null;
  /**
   * 允许的偏差（ms）；默认取共享常量的 ±2 秒（与上传/服务端同一值）。
   *
   * ⚠️ **`presetDurationMs` 缺失不是"退回 15–30 秒区间"，而是"不能录"**：
   * t31 起服务端对无预设的段 fail-closed 拒收（`AUDIO_SEGMENT_PRESET_MISSING`），
   * 前端再给一条"也能录"的路，只会让用户白录一整段然后吃 422。
   */
  presetToleranceMs?: number;
  /** 波形柱子数（默认 48）。 */
  bars?: number;
  /** 点"用这一段"时把成品交给上层（上层负责上传与去向选择）。 */
  onRecorded?: (recording: SegmentRecording) => void;
  /**
   * 录制**开始 / 停止**时通知上层（`isRecording`）。
   *
   * 用户裁决："我希望能播放伴奏的同时进行录制，而不是单独分开功能。"
   * 上层（RecordStep）据此在开录那一刻自动起播本段伴奏、停录时停伴奏 ——
   * 伴奏与录音成为同一个流程，而不是两个要分别点的按钮。
   * 只在**跨越**录制态时触发（进入 true / 离开 false），不随每帧进度重复上报。
   */
  onRecordingStateChange?: (isRecording: boolean) => void;
  /**
   * 点「开始录制」时**同步**触发（在用户手势的那个任务里，早于 `recorder.start()` 的 await）。
   *
   * 存在的唯一理由是浏览器自动播放策略：`play()` 必须在用户手势任务里同步调用才被放行；
   * 放进 effect 或等 `getUserMedia` 权限回来再播，都可能被判"无手势"静默拒绝
   * （"点了没声，再点一次"）。上层（RecordStep）在这里同步起播伴奏。
   */
  onRecordButtonClick?: (() => void) | undefined;
  /** 丢弃本地录音后通知上层关闭录音窗口。 */
  onCancel?: () => void;
  /** 重录前通知上层清理上一次上传失败的本地状态。 */
  onRetryRecording?: () => void;
  /** 上传状态（由上层用 `uploadSegmentAudio` 驱动）。 */
  upload?: RecorderUploadView;
  /** 整体禁用（例如瓶子已被别人接走）。 */
  disabled?: boolean;
  className?: string;
}

export function RecorderPanel({
  segmentIndex,
  totalSegments,
  environment,
  presetDurationMs = null,
  presetToleranceMs,
  bars = 48,
  onRecorded,
  onRecordingStateChange,
  onRecordButtonClick,
  onCancel,
  onRetryRecording,
  upload,
  disabled = false,
  className,
}: RecorderPanelProps) {
  const headingId = useId();
  const presetNoticeId = useId();
  const clipNoticeId = useId();
  const recorder = useRecorder({
    ...(environment === undefined ? {} : { environment }),
    presetDurationMs,
    ...(presetToleranceMs === undefined ? {} : { presetToleranceMs }),
    bars,
  });
  const { status, support, error, elapsedMs, levels, nearLimit, recording, durationViolations } =
    recorder;

  /**
   * 录制态的**边沿**通知（只在进入/离开 `recording` 时触发一次）。
   * 上层据此同步伴奏（开录即起播、停录即停），把"录音 + 伴奏"合成一个流程。
   * 用 ref 记住上次是否在录，避免每帧进度变化都重复回调。
   */
  const onRecordingStateChangeRef = useRef(onRecordingStateChange);
  useEffect(() => {
    onRecordingStateChangeRef.current = onRecordingStateChange;
  }, [onRecordingStateChange]);
  // 「开始录制」点击的同步回调（起播伴奏）：同样走 ref，身份变化不重渲染。
  const onRecordButtonClickRef = useRef(onRecordButtonClick);
  useEffect(() => {
    onRecordButtonClickRef.current = onRecordButtonClick;
  }, [onRecordButtonClick]);
  const wasRecordingRef = useRef(false);
  useEffect(() => {
    const isRecording = status === 'recording';
    if (isRecording === wasRecordingRef.current) return;
    wasRecordingRef.current = isRecording;
    onRecordingStateChangeRef.current?.(isRecording);
  }, [status]);

  /** 本段固定时长的展示口径（拿不到就是 null，一切文案退回区间口径）。 */
  const preset = recorder.presetDurationMs;
  const tolerance = recorder.presetToleranceMs;
  /** 录制中还差多少（只在"有本段时长 + 正在录"时有意义）。 */
  const remainingMs = preset === null ? null : Math.max(0, preset - elapsedMs);

  /** 计时文案的分母：有本段固定时长就用它（"20.6"），否则退回 30 秒上限。 */
  const targetLabel = preset === null ? '30' : formatSeconds(preset);

  /**
   * 已录进度（0..1）：分母**只认本段固定时长**；拿不到就返回 null —— 宁可没有进度条，
   * 也不拿一个假分母画一条假进度（这一段的时长本来就是服务端权威值）。
   * 录完（`reviewing_local`）用实际录到的时长，所以"差太多"时进度条诚实地停在那一格。
   */
  const progressRatio =
    preset === null
      ? null
      : Math.min(
          1,
          (status === 'reviewing_local' ? (recording?.durationMs ?? elapsedMs) : elapsedMs) /
            preset,
        );

  const statusText = ((): string => {
    switch (status) {
      case 'unsupported':
        return error === null ? '这个环境暂时无法录音。' : error.title;
      case 'requesting':
        return '正在请求麦克风权限…';
      case 'recording':
        return `录制中 ${formatClock(elapsedMs)} / ${targetLabel}`;
      case 'reviewing_local':
        return `已录 ${formatClock(recording?.durationMs ?? 0)} / ${targetLabel}`;
      default:
        return preset === null
          ? // 没有本段时长时不许录：文案要说清"为什么现在不能录"，而不是给一个假的区间
            '暂时不能录（这一段还没登记固定时长）'
          : `尚未开始（本段 ${formatSeconds(preset)} 秒）`;
    }
  })();

  /** 本段时长缺失 = 不允许录制（与 hook 的 fail-closed 同一判定：按钮与说明同时体现）。 */
  const presetMissing = recorder.presetMissing;
  const canRecord = support.ok && !disabled && !presetMissing;
  /**
   * 录完实测的"有没有声音"（t40）。**只有 `silent` 才拦**：
   * `unavailable`（量不了）不拦 —— 不能因为"我们测不出来"就阻止用户提交；
   * `ok` 也不拦，但把实测峰值显示出来，让用户看到结论的依据。
   */
  const clip = recorder.clipLevel;
  const clipSilent = clip?.status === 'silent';
  const tooShort = durationViolations[0]?.message ?? null;
  const canUseRecording =
    recording !== null && durationViolations.length === 0 && !disabled && !clipSilent;
  /**
   * 有没有"可试听的成品"：录完 + 拿得到本地地址。
   * 拿不到地址（宿主不支持 objectURL）时**安静地不给这个按钮**，其余动作照常可用 ——
   * 试听是附加能力，不能因为它不可用挡住"用这一段"。
   */
  const canPreview = status === 'reviewing_local' && recorder.previewUrl !== null;
  const previewUi = PREVIEW_UI[recorder.previewState];

  const uploadTone =
    upload?.phase === 'done' ? 'success' : upload?.phase === 'failed' ? 'warning' : 'info';
  const uploadText = ((): string => {
    if (upload === undefined) return '';
    if (upload.phase === 'uploading' || upload.phase === 'retrying') {
      return `${upload.phase === 'retrying' ? '重试上传中' : '上传中'} ${Math.round((upload.ratio ?? 0) * 100)}%`;
    }
    return upload.message ?? '';
  })();

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        // record-v1（DESIGN.md §Components）：录制 / 波形区 = `water-void` 底 + 1px 细线（不用阴影造层次）
        'flex flex-col gap-4 rounded-base border border-line/20 bg-water-void p-6 text-paper',
        className,
      )}
    >
      <header className="flex flex-col gap-1">
        <h2 id={headingId} className="text-[1.25rem] font-semibold text-paper">
          第 {segmentIndex} 段 · 共 {totalSegments} 段
        </h2>
        {/* 本段固定时长（用户第 4 条）：优先说"这段有多长"，而不是给一个浮动区间 */}
        {preset === null ? (
          <p className="text-[0.875rem] leading-[1.6] text-muted">
            这一段的固定时长还没登记，所以现在不能录 —— 换一首歌，或者稍后再来。
          </p>
        ) : (
          <p data-testid="preset-duration" className="text-[0.875rem] leading-[1.6] text-muted">
            本段 {formatSeconds(preset)} 秒（与这段伴奏等长，允许 ±{formatSeconds(tolerance)} 秒）。
            录满会自动停止，投出去之后由陌生人接下一段。
          </p>
        )}
      </header>

      <p aria-live="polite" className="text-[0.9375rem] font-semibold text-paper">
        {statusText}
      </p>

      {/* 波形是装饰性反馈：进度另有文字表达（DESIGN.md 无障碍媒体条款） */}
      <div
        data-testid="waveform"
        aria-hidden="true"
        className="flex h-16 items-end gap-1 rounded-md border border-line/10 bg-water-bed px-3 py-2"
      >
        {levels.map((level, index) => (
          <span
            key={`bar-${String(index)}`}
            className="w-1 flex-1 rounded-sm bg-glass"
            style={{ height: `${Math.max(4, Math.round(level * 100))}%` }}
          />
        ))}
      </div>

      {/*
        已录进度（record-v1 的沟槽语法：底槽 `rgba(line,.1)`、已录段 `water-deep`）。
        它**不是**第二个进度来源：百分比与秒数仍由上面那行状态文字给出（`aria-live`），
        这里只是把同一份进度画进水里 —— 只动 transform（DESIGN.md：禁止动画 width/height）。
        拿不到本段固定时长时不给进度条（`--:--` 的分母是假的，画出来就是骗人）。
      */}
      {progressRatio === null ? null : (
        <div
          data-testid="record-progress"
          role="progressbar"
          aria-label="本段录制进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressRatio * 100)}
          className="h-2 w-full overflow-hidden rounded-sm bg-line/10"
        >
          <div
            className="h-2 origin-left rounded-sm bg-water-deep transition-transform duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)]"
            style={{ transform: `scaleX(${progressRatio})` }}
          />
        </div>
      )}

      {!support.ok && support.guidance !== null ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-base border border-danger-border bg-danger-tint px-4 py-3 text-[0.875rem] leading-[1.6] text-danger"
        >
          <Icon name="MicOff" size={18} />
          <span>{support.guidance}</span>
        </div>
      ) : null}

      {error !== null ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-base border border-danger-border bg-danger-tint px-4 py-3 text-[0.875rem] leading-[1.6] text-danger"
        >
          <Icon name="AlertCircle" size={18} />
          <span>
            <strong className="block font-semibold">{error.title}</strong>
            {error.guidance}
          </span>
        </div>
      ) : null}

      {nearLimit ? (
        <p role="status" className="flex items-center gap-2 text-[0.875rem] text-warning">
          <Icon name="Clock" size={16} />
          <span>
            {preset === null
              ? '接近 30 秒上限，到点会自动停止。'
              : `快到本段时长了（${formatSeconds(preset)} 秒），到点会自动停止。`}
          </span>
        </p>
      ) : null}

      {/* 录制中：把"还差多少"写在明面上（用户第 4 条要求"提前停也要知道差多少"） */}
      {status === 'recording' && remainingMs !== null ? (
        <p
          data-testid="remaining"
          aria-live="polite"
          className="text-[0.875rem] leading-[1.6] text-muted"
        >
          {remainingMs === 0
            ? '已录满，正在收尾…'
            : `还差 ${formatSeconds(remainingMs)} 秒录满本段（允许 ±${formatSeconds(tolerance)} 秒）。`}
        </p>
      ) : null}

      {poiStatus(tooShort, status)}

      {/* t40：录完当场把"有没有声音"告诉用户（用户实测的问题正是"录到静音却毫无提示"） */}
      {status === 'reviewing_local' && clip !== null ? (
        clip.status === 'silent' ? (
          <p
            id={clipNoticeId}
            data-testid="clip-silent"
            role="status"
            className="flex items-start gap-2 rounded-base border border-warning-border bg-warning-tint px-4 py-3 text-[0.875rem] leading-[1.6] text-warning"
          >
            <Icon name="MicOff" size={16} />
            <span>
              <strong className="block font-semibold">{clip.message}</strong>
              {clip.guidance}
            </span>
          </p>
        ) : clip.status === 'ok' ? (
          <p
            data-testid="clip-ok"
            role="status"
            className="flex items-center gap-2 text-[0.875rem] leading-[1.6] text-muted"
          >
            <Icon name="AudioWaveform" size={16} />
            <span>{clip.message}</span>
          </p>
        ) : (
          <p
            data-testid="clip-unavailable"
            role="status"
            className="flex items-center gap-2 text-[0.875rem] leading-[1.6] text-muted"
          >
            <Icon name="Info" size={16} />
            <span>{clip.message}</span>
          </p>
        )
      ) : null}

      {/* 本段时长缺失：把"为什么不能录"写在按钮旁边，并用 aria-describedby 挂到按钮上
          （不用 role="status"，避免与"时长不合格 / 上传进度"那两处状态区互相干扰） */}
      {presetMissing ? (
        <p
          id={presetNoticeId}
          data-testid="preset-missing"
          className="flex items-start gap-2 rounded-base border border-warning-border bg-warning-tint px-4 py-3 text-[0.875rem] leading-[1.6] text-warning"
        >
          <Icon name="AlertTriangle" size={16} />
          <span>{recorder.blockedReason}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {status === 'recording' ? (
          <Button variant="primary" onClick={recorder.stop} icon={<Icon name="Square" size={18} />}>
            停止录制
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={!canRecord}
            {...(presetMissing ? { 'aria-describedby': presetNoticeId } : {})}
            onClick={() => {
              // 同步起播伴奏（用户手势任务内，见 onRecordButtonClick 注释），再开录
              onRecordButtonClickRef.current?.();
              void recorder.start();
            }}
            icon={<Icon name="Mic" size={18} />}
          >
            开始录制
          </Button>
        )}

        {status === 'reviewing_local' ? (
          <>
            <Button
              variant="primary"
              disabled={!canUseRecording}
              {...(clipSilent ? { 'aria-describedby': clipNoticeId } : {})}
              onClick={() => {
                if (recording !== null) onRecorded?.(recording);
              }}
              icon={<Icon name="CheckCircle2" size={18} />}
            >
              用这一段
            </Button>
            {canPreview ? (
              <Button
                variant="ghost"
                disabled={disabled}
                onClick={recorder.togglePreview}
                icon={<Icon name={previewUi.icon} size={18} />}
              >
                {previewUi.label}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                recorder.reset();
                onRetryRecording?.();
              }}
              icon={<Icon name="RotateCcw" size={18} />}
            >
              重录
            </Button>
            {onCancel === undefined ? null : (
              <Button
                variant="ghost"
                disabled={disabled}
                onClick={() => {
                  recorder.reset();
                  onCancel();
                }}
              >
                取消录制
              </Button>
            )}
          </>
        ) : null}
      </div>

      {/*
        试听状态文字：进度/结果都落到文字上，`aria-live` 让读屏用户也能听到状态变化；
        刻意不用 role="status"，避免与"时长不合格 / 上传进度"那两处状态区混淆。

        节点保持**稳定**（不改 `key` 逼动画重播 —— `motion-web` §5 禁止"靠改 key 造成子树重建"）：
        状态变化的反馈是三条独立通道 —— 文案变化 + 按钮文案/图标 + `aria-live`；
        `enter-fade` 只做"区块初次出现的入场"，且只动 opacity（时长/缓动取自 DS token）。
      */}
      {canPreview ? (
        <p
          data-testid="preview-state"
          aria-live="polite"
          className="enter-fade text-[0.875rem] leading-[1.6] text-muted"
        >
          {previewUi.state}
        </p>
      ) : null}

      {upload === undefined ? null : (
        <div
          role="status"
          className={cn(
            'flex flex-wrap items-center gap-3 rounded-base border px-4 py-3 text-[0.875rem]',
            uploadTone === 'success'
              ? 'border-success-border bg-success-tint text-success'
              : uploadTone === 'warning'
                ? 'border-warning-border bg-warning-tint text-warning'
                : 'border-info-border bg-info-tint text-info',
          )}
        >
          <Icon name={uploadTone === 'warning' ? 'AlertTriangle' : 'UploadCloud'} size={18} />
          <span>{uploadText}</span>
          {upload.phase === 'failed' && upload.retryable && upload.onRetry !== undefined ? (
            <Button variant="ghost" onClick={upload.onRetry}>
              重试上传
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** 时长不合格的提示（warning：录音还在，只是不达标 → 只给"重录"这条路）。 */
function poiStatus(message: string | null, status: string) {
  if (message === null || status !== 'reviewing_local') return null;
  return (
    <p
      role="status"
      data-testid="duration-violation"
      className="flex items-start gap-2 rounded-base border border-warning-border bg-warning-tint px-4 py-3 text-[0.875rem] leading-[1.6] text-warning"
    >
      <Icon name="AlertTriangle" size={16} />
      <span>{message}</span>
    </p>
  );
}
