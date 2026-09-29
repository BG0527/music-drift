/**
 * 一段的「听 → 投」组合件：`SegmentPlayer` + 赞/踩读数的**唯一接线点**。
 *
 * 为什么必须有这个文件（不是包装癖）：
 * `useSegmentListen` 是**每段一个实例**的 hook，而页面用 `map` 渲染多段 ——
 * hook 不能在循环里调用。把「播放器 + 覆盖率上报 + 投票」收进一个每段一个的组件，
 * 接线点就只剩这一处：**结构上不可能出现"某一段忘了接上报"**。
 *
 * 三条纪律：
 * 1. **票体只有 `{ value }`**：听了多少由 `useSegmentListen` 上报、服务端判定（t20 起
 *    `listenedRatio` 被忽略）；这里不自己算覆盖率、也不写死 0.8；
 * 2. **踩只有一个控件**：可用性判定（听满）归 `SegmentPlayer` 自带的按钮；
 *    本组件只把服务端判定（422）翻译成"提醒"出口，不画第二个踩；
 * 3. **失败不静默**：门槛不足 → `onListenShort`（页面弹提醒）；其它失败 → `onFailed`
 *    （页面按 `describeApiError` 渲染冲突/错误态，含 409 接力冲突）。
 */
import { ApiError } from '../api/client';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useCastVote } from '../api/mutations';
import { useSegmentListen, type AudioElementLike, type ListenReportTransport } from '../audio';
import { SegmentPlayer, type SegmentPlayerHandle } from '../audio';
import { VoteControls, type MyVote } from './vote-controls';

/** 本组件只需要段上这些字段（`SegmentSchema` 的子集，避免把整份 DTO 传进来）。 */
export interface VotableSegmentItem {
  id: string;
  index: number;
  ownerCode: string;
  durationMs: number | null;
  likeCount: number;
  dislikeCount: number;
}

export interface VotableSegmentProps {
  segment: VotableSegmentItem;
  /** 音频地址（服务端 Range 端点）。 */
  src: string;
  bottleId: string;
  isOwnSegment: boolean;
  /** 我投过的票。注意：契约里段上没有 `myVote`，所以这一态目前由页面按会话记忆传入。 */
  myVote: MyVote;
  /** 投票成功 → 页面记住"我投过什么"（并播报）；段号/计数以服务端返回为准。 */
  onVoted: (segmentId: string, value: 'LIKE' | 'DISLIKE') => void;
  /** 服务端说没听满（门槛类 422）→ 页面弹提醒。 */
  onListenShort?: ((message: string | null) => void) | undefined;
  /** 其它失败（409 冲突 / 网络层）→ 页面按错误类型渲染出口。 */
  onFailed?: ((error: unknown) => void) | undefined;
  /** 测试注入：覆盖率上报传输层。 */
  transport?: ListenReportTransport | undefined;
  /** 测试注入：音频元素工厂。 */
  createElement?: ((src: string) => AudioElementLike) | undefined;
  className?: string;
  /**
   * 本段播完时通知页面（「听全部」串段用；只报状态、不改播放）。
   */
  onEnded?: (() => void) | undefined;
  /** 播放状态变化回调（`isPlaying`）；页面用它把「听全部」图标绑到真实状态。 */
  onPlayingChange?: ((isPlaying: boolean) => void) | undefined;
  /**
   * 交出播放器的命令柄 —— 页面把「播放键」搬去与赞/踩同一行、并让它变成
   * 「听全部」时，要命令的是**同一个**播放器（否则两个播放器声音打架）。
   */
  playerHandleRef?: React.MutableRefObject<SegmentPlayerHandle | null> | undefined;
  /** 自动起播令牌（页面点「听全部」/ 点某段「听」时递增；见 SegmentPlayer）。 */
  autoPlayToken?: number | undefined;
  /** `transport` 外观下是否渲染内置圆盘播放键，默认 `true`（页面接管时传 false）。 */
  showPlayButton?: boolean | undefined;
  /** 排在「踩」右侧、与赞/踩同一行的「听全部」按钮（由页面渲染，驱动 playerHandleRef）。 */
  listenAllControl?: ReactNode;
  /**
   * 把 transport（进度条）**投递**到这个 DOM 节点渲染（用户裁决：进度条挪到右列、
   * 与赞/踩/听全部水平对齐）。
   *
   * 为什么用 portal 而不是把播放器拆成两半：进度条与赞/踩**共用同一个播放器**
   * （一个 audio 元素）。拆成两个组件会出现两个播放器、声音打架。portal 只搬 DOM
   * 位置、不动状态归属，所以仍是"一个播放器、两处显示"。
   * 不传 = 照旧原地渲染（其它调用点不受影响）。
   */
  transportPortalTarget?: HTMLElement | null | undefined;
}

/**
 * "没听满"的判定谓词。
 *
 * 与 `listen-reporter.ts` 的 `code.includes('THRESHOLD')` **同一个谓词**（服务端码
 * `LISTEN_THRESHOLD_NOT_REACHED`）：这里只是把上报器已经判定的结果转发到页面的提醒出口，
 * 不是第二套判定。换成别的码（例如 `SEGMENT_ALREADY_CUT`）就走通用失败出口。
 */
function isThresholdCode(code: string | null): boolean {
  return code !== null && code.includes('THRESHOLD');
}

export function VotableSegment({
  segment,
  src,
  isOwnSegment,
  myVote,
  onVoted,
  onListenShort,
  onFailed,
  transport,
  createElement,
  className,
  onEnded,
  onPlayingChange,
  playerHandleRef,
  autoPlayToken,
  showPlayButton,
  listenAllControl,
  transportPortalTarget,
}: VotableSegmentProps) {
  const like = useCastVote();
  const listen = useSegmentListen({
    segmentId: segment.id,
    ...(transport === undefined ? {} : { transport }),
    onVoteOutcome: (outcome) => {
      if (outcome.ok) {
        onVoted(segment.id, 'DISLIKE');
        return;
      }
      if (isThresholdCode(outcome.code)) {
        onListenShort?.(outcome.message);
        return;
      }
      // 传输层失败没有 code（硬规则）：这里照样收敛成 ApiError，交给页面统一渲染出口
      onFailed?.(
        new ApiError({
          status: outcome.status === 0 ? null : outcome.status,
          code: outcome.code,
          message: outcome.message ?? '点踩失败，请稍后再试。',
        }),
      );
    },
  });

  return (
    <div className={className ?? 'flex flex-col'}>
      {transportPortalTarget == null ? (
        <SegmentPlayer
          src={src}
          segmentIndex={segment.index}
          durationMs={segment.durationMs}
          ownerCode={segment.ownerCode}
          isOwnSegment={isOwnSegment}
          // 收起播放器自带的踩：踩由下面这一对控件唯一承担（否则同一段出现两个踩）
          showDislike={false}
          // t17 深度复刻：瓶身详情页用参考的 transport 构图（唱片键 + 水道 + 时长）
          layout="transport"
          onProgress={listen.observe}
          {...(onEnded === undefined ? {} : { onEnded })}
          {...(onPlayingChange === undefined ? {} : { onPlayingChange })}
          {...(playerHandleRef === undefined ? {} : { playerHandleRef })}
          {...(autoPlayToken === undefined ? {} : { autoPlayToken })}
          {...(showPlayButton === undefined ? {} : { showPlayButton })}
          {...(createElement === undefined ? {} : { createElement })}
        />
      ) : (
        // 进度条被页面投递到右列（DOM 位置变了，播放器仍是这一个 —— 见 props 注释）
        createPortal(
          <SegmentPlayer
            src={src}
            segmentIndex={segment.index}
            durationMs={segment.durationMs}
            ownerCode={segment.ownerCode}
            isOwnSegment={isOwnSegment}
            showDislike={false}
            layout="transport"
            onProgress={listen.observe}
            {...(onEnded === undefined ? {} : { onEnded })}
            {...(onPlayingChange === undefined ? {} : { onPlayingChange })}
            {...(playerHandleRef === undefined ? {} : { playerHandleRef })}
            {...(autoPlayToken === undefined ? {} : { autoPlayToken })}
            {...(showPlayButton === undefined ? {} : { showPlayButton })}
            {...(createElement === undefined ? {} : { createElement })}
          />,
          transportPortalTarget,
        )
      )}
      {/* 参考 .votes：赞/踩一对小按钮一行（t12 用户裁决的交互原样保留） */}
      <div className="votes">
        <VoteControls
          segmentIndex={segment.index}
          likeCount={segment.likeCount}
          dislikeCount={segment.dislikeCount}
          myVote={myVote}
          listenShort={!listen.locallyUnlocked}
          busy={like.isPending}
          onLike={() => {
            if (myVote === 'LIKE') return; // 内核会 LIKE_ALREADY_CAST：不做不可能成功的往返
            like.mutate(
              { segmentId: segment.id, value: 'LIKE' },
              {
                onSuccess: () => {
                  onVoted(segment.id, 'LIKE');
                },
                onError: (error) => {
                  onFailed?.(error);
                },
              },
            );
          }}
          // 唯一的踩路径：先 flush 覆盖率再投 /votes（服务端按持久化覆盖率判 80%）
          onDislike={listen.castDislike}
          {...(listenAllControl === undefined ? {} : { trailing: listenAllControl })}
        />
      </div>
    </div>
  );
}
