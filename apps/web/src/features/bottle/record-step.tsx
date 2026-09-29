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
import { useLibraryMetadata, useSongs } from '../api/queries';
import { AsyncBoundary } from '../../pages/shell/async-boundary';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RecordSegmentResponse } from '@music-drift/shared';
import {
  RecorderPanel,
  AccompanimentPlayer,
  createBrowserRecorderEnvironment,
  uploadSegmentAudio,
  type AccompanimentPlayHandle,
  type RecorderEnvironment,
  type SegmentRecording,
  type UploadPhase,
  type UploadTransport,
} from '../audio';
import { Button, Icon, Skeleton, cn } from '../../design-system';
import type { RecorderUploadView } from '../audio';

export interface RecordStepProps {
  bottleId: string;
  /** 本次录的是歌里的第几段。**必须来自服务端**（`missingSegmentIndexes[0]` / `nextRecordIndex`）。 */
  segmentIndex: number;
  totalSegments: number;
  /**
   * 这首曲子的 id。
   *
   * **为什么必须有**：本段的录制时长 = 曲库该段的固定时长（`SongSchema.segments[].durationMs`），
   * 这是"听够/录够"的唯一分母来源；拿不到它录音层会 **fail-closed 禁用录制**。
   * 所以由本组件自己去曲库取（页面只把 `songId` 交进来）——避免每个调用点各写一遍取值逻辑而漏掉。
   */
  songId: string;
  /** 上传成功回调（拿到服务端确认的段号与最新详情）。 */
  onUploaded: (response: RecordSegmentResponse) => void;
  /** 放弃未上传的本地录音并关闭录音窗口。 */
  onCancel?: () => void;
  /** 告知外层上传是否正在进行，以便锁住承载录音流程的弹窗。 */
  onUploadingChange?: (uploading: boolean) => void;
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
  songId,
  segmentIndex,
  totalSegments,
  onUploaded,
  onCancel,
  onUploadingChange,
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
  const songs = useSongs();
  const library = useLibraryMetadata();
  const [phase, setPhase] = useState<UploadPhase>('validating');
  const [ratio, setRatio] = useState<number | null>(null);
  /**
   * 录制态 + 一次"开录"计数（用户裁决：伴奏与录音同时进行，不再是两个分开的功能）。
   * 开录那一刻令 `accompanimentSignal` 触发自动起播；停录时它带回 false 让伴奏停下。
   * `token` 每次开录 +1，所以"录了又重录一次"会重新从头起播。
   */
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordStartToken, setRecordStartToken] = useState(0);
  /**
   * 伴奏的同步起播命令柄（用户手势任务里用）。
   * 「开始录制」的点击处理函数**同步**调 `play()` —— 浏览器自动播放策略只放行
   * 手势任务内的 `play()`，等权限/效果再播会被静默拒绝。
   */
  const accompanimentHandleRef = useRef<AccompanimentPlayHandle | null>(null);
  const [failure, setFailure] = useState<{ message: string; retryable: boolean } | null>(null);
  const [pending, setPending] = useState<SegmentRecording | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const uploading = phase === 'uploading' || phase === 'retrying';
  const startedRef = useRef(false);

  useEffect(() => {
    onUploadingChange?.(uploading);
  }, [onUploadingChange, uploading]);

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

  const discardPendingRecording = useCallback((): void => {
    revokeLocalUrl();
    setLocalUrl(null);
    setPending(null);
    setFailure(null);
    setPhase('validating');
  }, [revokeLocalUrl]);

  const uploadView: RecorderUploadView = {
    phase,
    ratio,
    message: null,
    retryable: failure?.retryable ?? false,
  };
  const accompanimentTrack = library.data?.tracks.find((track) => track.songId === songId);
  /**
   * 传给伴奏播放器的同步信号：`play = recordingActive`，`token` 只在**开录**时 +1。
   * 停录（`play` 由 true→false）让伴奏停下；重录一次 = 新的 token ⇒ 从头再起播。
   */
  const accompanimentSignal = useMemo(
    () => ({ play: recordingActive, token: recordStartToken }),
    [recordingActive, recordStartToken],
  );

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {library.isError ? (
        <p role="status" className="text-[0.875rem] text-muted">
          本段伴奏与歌词暂时无法读取，不影响继续录音。
        </p>
      ) : library.data !== undefined && accompanimentTrack === undefined ? (
        <p role="status" className="text-[0.875rem] text-muted">
          静态曲库中找不到这首歌的伴奏与歌词，不会使用其他曲目代替。
        </p>
      ) : accompanimentTrack === undefined ? null : (
        <AccompanimentPlayer
          track={accompanimentTrack}
          segmentIndex={segmentIndex}
          autoPlaySignal={accompanimentSignal}
          playHandleRef={accompanimentHandleRef}
          // 用户裁决：录制界面只留一个「开始录制」—— 伴奏不另给一套按钮，
          // 它跟着开录自动播（见上），这里只作"正在放"的伴随显示。
          autoOnly
        />
      )}

      {/*
        曲库是**异步**的，所以这里自己带加载/失败态（`AsyncBoundary`）：
        在拿到"这一段多长"之前不渲染录音控件 —— 否则会先给一个能点、随后被禁用的假按钮，
        甚至让用户录一段注定被服务端拒的音。
      */}
      <AsyncBoundary
        query={songs}
        skeleton={
          // W18.5 · A7：统一用 DS <Skeleton>（shimmer），不再用永不变化的死灰块
          <div aria-busy="true">
            <Skeleton width="100%" height="140px" className="rounded-base" />
          </div>
        }
      >
        {(items) => {
          /**
           * 本段固定时长：`=== undefined`（曲库里没这首 / 没这一段）⇒ 传 `null`，
           * 录音层据此禁用录制并说明理由（不退回"随便录 15–30 秒"）。
           */
          const preset =
            items
              .find((item) => item.id === songId)
              ?.segments.find((segment) => segment.index === segmentIndex)?.durationMs ?? null;
          return (
            <RecorderPanel
              segmentIndex={segmentIndex}
              totalSegments={totalSegments}
              presetDurationMs={preset}
              environment={environment}
              {...(phase === 'validating' ? {} : { upload: uploadView })}
              onRecordButtonClick={() => {
                // 用户手势任务里**同步**起播伴奏（自动播放策略只放行这里），从而
                // "点开始录制 ⇒ 伴奏响起 + 开始录音"真正同时发生。
                accompanimentHandleRef.current?.play();
              }}
              onRecordingStateChange={(isRecording) => {
                // 开录 ⇒ 让本段伴奏同时起播（token +1 让它从头来）；停录 ⇒ 伴奏停下。
                setRecordingActive(isRecording);
                if (isRecording) setRecordStartToken((token) => token + 1);
              }}
              disabled={disabled || uploading}
              onRetryRecording={discardPendingRecording}
              {...(onCancel === undefined
                ? {}
                : {
                    onCancel: () => {
                      discardPendingRecording();
                      onCancel();
                    },
                  })}
              onRecorded={(recording) => {
                if (startedRef.current) return;
                startedRef.current = true;
                void upload(recording).finally(() => {
                  startedRef.current = false;
                });
              }}
            />
          );
        }}
      </AsyncBoundary>

      {failure === null ? null : (
        <div className="flex flex-col gap-3 rounded-base border border-warning-border bg-warning-tint px-4 py-4 text-warning">
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
              <span className="flex flex-col gap-2 text-[0.875rem] text-muted">
                <span className="font-medium text-paper">本地回放确认（还没传上去的那一段）</span>
                <audio controls src={localUrl} aria-label="本地回放确认" className="max-w-full" />
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
