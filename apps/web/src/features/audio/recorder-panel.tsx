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
import { useId } from 'react';
import type { RecorderEnvironment } from './recorder-environment';
import { useRecorder, type SegmentRecording } from './use-recorder';
import { formatClock } from './format';
import { Button, Icon, cn } from '../../design-system';
import type { UploadPhase } from './upload';

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
  /** 波形柱子数（默认 48）。 */
  bars?: number;
  /** 点"用这一段"时把成品交给上层（上层负责上传与去向选择）。 */
  onRecorded?: (recording: SegmentRecording) => void;
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
  bars = 48,
  onRecorded,
  upload,
  disabled = false,
  className,
}: RecorderPanelProps) {
  const headingId = useId();
  const recorder = useRecorder({
    ...(environment === undefined ? {} : { environment }),
    bars,
  });
  const { status, support, error, elapsedMs, levels, nearLimit, recording, durationViolations } =
    recorder;

  const statusText = ((): string => {
    switch (status) {
      case 'unsupported':
        return error === null ? '这个环境暂时无法录音。' : error.title;
      case 'requesting':
        return '正在请求麦克风权限…';
      case 'recording':
        return `录制中 ${formatClock(elapsedMs)} / 30`;
      case 'recorded':
        return `已录 ${formatClock(recording?.durationMs ?? 0)} / 30`;
      default:
        return '尚未开始（15–30 秒）';
    }
  })();

  const canRecord = support.ok && !disabled;
  const tooShort = durationViolations[0]?.message ?? null;
  const canUseRecording = recording !== null && durationViolations.length === 0 && !disabled;

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
        'flex flex-col gap-4 rounded-base bg-deep-current p-5 text-wave-white',
        className,
      )}
    >
      <header className="flex flex-col gap-1">
        <h2 id={headingId} className="text-[1.25rem] font-semibold">
          第 {segmentIndex} 段 · 共 {totalSegments} 段
        </h2>
        <p className="text-[0.875rem] leading-[1.6] text-on-dark-muted">
          录一段 15–30 秒的接唱，投出去之后由陌生人接下一段。到 30 秒会自动停止。
        </p>
      </header>

      <p aria-live="polite" className="text-[0.9375rem] font-semibold">
        {statusText}
      </p>

      {/* 波形是装饰性反馈：进度另有文字表达（DESIGN.md 无障碍媒体条款） */}
      <div
        data-testid="waveform"
        aria-hidden="true"
        className="flex h-16 items-end gap-1 rounded-md bg-trench px-3 py-2"
      >
        {levels.map((level, index) => (
          <span
            key={`bar-${String(index)}`}
            className="w-1 flex-1 rounded-pill bg-lagoon"
            style={{ height: `${Math.max(4, Math.round(level * 100))}%` }}
          />
        ))}
      </div>

      {!support.ok && support.guidance !== null ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-base border border-danger-border bg-danger-tint px-4 py-3 text-[0.875rem] leading-[1.6] text-coral-deep"
        >
          <Icon name="MicOff" size={18} />
          <span>{support.guidance}</span>
        </div>
      ) : null}

      {error !== null ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-base border border-danger-border bg-danger-tint px-4 py-3 text-[0.875rem] leading-[1.6] text-coral-deep"
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
          <span>接近 30 秒上限，到点会自动停止。</span>
        </p>
      ) : null}

      {poiStatus(tooShort, status)}

      <div className="flex flex-wrap items-center gap-3">
        {status === 'recording' ? (
          <Button variant="primary" onClick={recorder.stop} icon={<Icon name="Square" size={18} />}>
            停止录制
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={!canRecord}
            onClick={() => {
              void recorder.start();
            }}
            icon={<Icon name="Mic" size={18} />}
          >
            开始录制
          </Button>
        )}

        {status === 'recorded' ? (
          <>
            <Button
              variant="primary"
              disabled={!canUseRecording}
              onClick={() => {
                if (recording !== null) onRecorded?.(recording);
              }}
              icon={<Icon name="CheckCircle2" size={18} />}
            >
              用这一段
            </Button>
            <Button
              variant="ghost"
              onClick={recorder.reset}
              icon={<Icon name="RotateCcw" size={18} />}
            >
              重录
            </Button>
          </>
        ) : null}
      </div>

      {upload === undefined ? null : (
        <div
          role="status"
          className={cn(
            'flex flex-wrap items-center gap-3 rounded-base border px-4 py-3 text-[0.875rem]',
            uploadTone === 'success'
              ? 'border-success-border bg-success-tint text-success'
              : uploadTone === 'warning'
                ? 'border-warning-border bg-warning-tint text-warning'
                : 'border-info-border bg-info-tint text-peacock',
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
  if (message === null || status !== 'recorded') return null;
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-base border border-warning-border bg-warning-tint px-4 py-3 text-[0.875rem] leading-[1.6] text-warning"
    >
      <Icon name="AlertTriangle" size={16} />
      <span>{message}</span>
    </p>
  );
}
