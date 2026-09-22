/**
 * 录制步骤：把**已经交付的音频能力层**接上漂流瓶这一侧。
 *
 * 分工（不重造轮子）：
 * - 录音状态机 / 权限分支 / 30 秒自动停 / 时长校验 → `features/audio` 的 `RecorderPanel` + `useRecorder`（t7 已 TDD 完成）；
 * - 上传（原始二进制、进度、指数退避重试、只重试值得重试的失败）→ `features/audio` 的 `uploadSegmentAudio`（t7/ADR-018）；
 * - 本组件只做三件事：① 段号**原样取服务端给的值**；② 上传失败时**保留录音**并给「重试上传」与本地回放；
 *   ③ 成功后把服务端的 `RecordSegmentResponse`（含它决定的段号）交给上层。
 *
 * 失败语义用 **warning 而不是 danger**（DESIGN.md §Error States 第 4 条）：数据没丢，只是没传上去。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RecordSegmentResponse } from '@music-drift/shared';
import {
  RecorderPanel,
  createBrowserRecorderEnvironment,
  uploadSegmentAudio,
  type RecorderEnvironment,
  type SegmentRecording,
  type UploadPhase,
  type UploadTransport,
} from '../audio';
import { Button, Card, Icon, cn } from '../../design-system';
import type { RecorderUploadView } from '../audio';

export interface RecordStepProps {
  bottleId: string;
  /** 本次录的是歌里的第几段。**必须来自服务端**（`missingSegmentIndexes[0]` / `nextRecordIndex`）。 */
  segmentIndex: number;
  totalSegments: number;
  /** 上传成功回调（拿到服务端确认的段号与最新详情）。 */
  onUploaded: (response: RecordSegmentResponse) => void;
  /** 附言（CONTEXT §12.2，可选）。 */
  note?: string;
  /** 录音环境覆盖（测试注入；生产自动探测浏览器能力）。 */
  recorderEnvironment?: Partial<RecorderEnvironment> | undefined;
  /** 上传传输层覆盖（测试注入；生产走 XHR）。 */
  uploadTransport?: UploadTransport | undefined;
  disabled?: boolean;
  className?: string;
}

export function RecordStep({
  bottleId,
  segmentIndex,
  totalSegments,
  onUploaded,
  note,
  recorderEnvironment,
  uploadTransport,
  disabled = false,
  className,
}: RecordStepProps) {
  const environment = useMemo(
    () => ({ ...createBrowserRecorderEnvironment(), ...recorderEnvironment }),
    [recorderEnvironment],
  );
  const [phase, setPhase] = useState<UploadPhase>('validating');
  const [ratio, setRatio] = useState<number | null>(null);
  const [failure, setFailure] = useState<{ message: string; retryable: boolean } | null>(null);
  const [pending, setPending] = useState<SegmentRecording | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const uploading = phase === 'uploading' || phase === 'retrying';
  const startedRef = useRef(false);

  /**
   * 本地回放用的 objectURL。
   *
   * 三条约束：
   * 1. **不在 render 期创建**（副作用），也不在 effect 里 setState（会级联渲染）——
   *    在上传开始这个事件回调里创建，配套 ref 保存以便释放；
   * 2. 换一段录音、组件卸载都要 `revokeObjectURL`，否则 20 秒音频会一直占着内存；
   * 3. `URL.createObjectURL` 在少数环境里存在但不可用（jsdom / 受限 WKWebView），
   *    这里必须容错 —— 回放是"锦上添花"，绝不能因为它把整页打崩。
   */
  const localUrlRef = useRef<string | null>(null);

  const revokeLocalUrl = useCallback((): void => {
    const url = localUrlRef.current;
    if (url === null) return;
    try {
      URL.revokeObjectURL(url);
    } catch {
      // 释放失败不影响任何功能
    }
    localUrlRef.current = null;
  }, []);

  useEffect(() => revokeLocalUrl, [revokeLocalUrl]);

  const prepareLocalUrl = useCallback(
    (blob: Blob): void => {
      revokeLocalUrl();
      let url: string | null = null;
      if (typeof URL.createObjectURL === 'function') {
        try {
          url = URL.createObjectURL(blob);
        } catch {
          url = null;
        }
      }
      localUrlRef.current = url;
      setLocalUrl(url);
    },
    [revokeLocalUrl],
  );

  async function upload(recording: SegmentRecording): Promise<void> {
    setPending(recording);
    prepareLocalUrl(recording.blob);
    setFailure(null);
    setPhase('uploading');
    setRatio(0);
    const result = await uploadSegmentAudio(
      { bottleId, audio: recording.blob, durationMs: recording.durationMs, note: note ?? null },
      {
        ...(uploadTransport === undefined ? {} : { transport: uploadTransport }),
        onProgress: (progress) => {
          setPhase(progress.phase);
          setRatio(progress.ratio);
        },
      },
    );
    if (result.ok) {
      setPhase('done');
      setRatio(1);
      onUploaded(result.segment);
      return;
    }
    setPhase('failed');
    setRatio(null);
    setFailure({ message: result.message, retryable: result.retryable });
  }

  const uploadView: RecorderUploadView = {
    phase,
    ratio,
    message: null,
    retryable: failure?.retryable ?? false,
  };

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <RecorderPanel
        segmentIndex={segmentIndex}
        totalSegments={totalSegments}
        environment={environment}
        {...(phase === 'validating' ? {} : { upload: uploadView })}
        disabled={disabled || uploading}
        onRecorded={(recording) => {
          if (startedRef.current) return;
          startedRef.current = true;
          void upload(recording).finally(() => {
            startedRef.current = false;
          });
        }}
      />

      {failure === null ? null : (
        <Card
          elevation="raised"
          className="flex flex-col gap-3 border-warning-border bg-warning-tint text-warning"
        >
          <p role="status" className="flex items-start gap-2 text-[0.875rem] leading-[1.6]">
            <Icon name="AlertTriangle" size={16} />
            <span>{failure.message}</span>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {failure.retryable && pending !== null ? (
              <Button
                variant="ghost"
                onClick={() => {
                  void upload(pending);
                }}
                icon={<Icon name="UploadCloud" size={16} />}
              >
                重试上传
              </Button>
            ) : null}
            {localUrl === null ? null : (
              <span className="flex flex-col gap-2 text-[0.875rem] text-slate-current">
                <span className="font-medium text-abyss">本地回放确认（还没传上去的那一段）</span>
                <audio controls src={localUrl} aria-label="本地回放确认" className="max-w-full" />
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
