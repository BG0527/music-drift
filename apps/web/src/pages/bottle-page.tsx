/**
 * 漂流瓶页 —— 黄金路径的核心：**听 → 录 → 选去向**。
 *
 * 三条不变量（ADR-015，页面不许自己推断）：
 * 1. **段号由服务端决定**：录第几段 = `missingSegmentIndexes[0]`（斩浪留下的缺口优先补）；
 * 2. **完成度看缺口**：`isComplete` / `missingSegmentIndexes`，不看段数；
 * 3. **备选去向由服务端给**：`availableResolutions`，顺序即展示顺序（发起者没有"回传"）。
 *
 * 角色分支（同一支瓶子对不同的人看到不同界面）：
 * - 持有者且有缺口 → 录制区；
 * - 持有者且已完整 → 只能选去向；
 * - 非持有者 → 只读试听 + 「去河道捞一个」（不提供指定接唱，那属下一片切片）。
 */
import { useState } from 'react';
import type { BottleDetail, RecordSegmentResponse, Resolution } from '@music-drift/shared';
import {
  useCastVote,
  useChooseResolution,
  useInvalidateBottle,
  usePutBack,
} from '../features/api/mutations';
import { useBottle, segmentAudioUrl } from '../features/api/queries';
import { ApiError } from '../features/api/client';
import { ConflictNotice } from '../features/bottle/conflict-notice';
import { RecordStep } from '../features/bottle/record-step';
import { ReportDialog } from '../features/bottle/report-dialog';
import { RelayTimeline } from '../features/bottle/relay-timeline';
import { ResolutionModal } from '../features/bottle/resolution-modal';
import {
  gapNotice,
  progressLabel,
  relayHeadline,
  BOTTLE_STATUS_LABEL,
} from '../features/bottle/relay-status';
import { useSession } from '../features/session/session-context';
import {
  SegmentPlayer,
  type AudioElementLike,
  type RecorderEnvironment,
  type UploadTransport,
} from '../features/audio';
import { Button, Card, EmptyState, Icon, Toast } from '../design-system';
import { AsyncBoundary } from './shell/async-boundary';
import { Link } from './shell/router';
import { useNavigate } from './shell/router-context';
import { TEXT_LINK, TEXT_LINK_STRONG } from './shell/link-styles';

export interface BottlePageProps {
  id: string;
  /** 测试注入：录音环境与上传传输层（生产用浏览器真实能力）。 */
  seams?: {
    recorderEnvironment?: Partial<RecorderEnvironment> | undefined;
    uploadTransport?: UploadTransport | undefined;
    /** 试听用的音频元素工厂（测试注入：驱动 listening 进度，从而验证点踩上送的是真实比例）。 */
    segmentElementFactory?: ((src: string) => AudioElementLike) | undefined;
  };
}

export function BottlePage({ id, seams }: BottlePageProps) {
  const bottle = useBottle(id);
  return (
    <AsyncBoundary query={bottle}>
      {(data) => <BottleView bottle={data} {...(seams === undefined ? {} : { seams })} />}
    </AsyncBoundary>
  );
}

function BottleView({ bottle, seams }: { bottle: BottleDetail; seams?: BottlePageProps['seams'] }) {
  const session = useSession();
  const navigate = useNavigate();
  const resolution = useChooseResolution(bottle.id);
  const putBack = usePutBack(bottle.id);
  const invalidateBottle = useInvalidateBottle();
  const castVote = useCastVote();
  /**
   * 每段"听了多少"。**只在快照属于同一段时才记录**（`segmentIndex` 守卫）：
   * 否则切段后会沿用上一段的比例，给新段错误地解锁点踩。
   */
  const [listenedRatio, setListenedRatio] = useState<Record<string, number>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [pendingNote, setPendingNote] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    type: 'BOTTLE' | 'SEGMENT';
    id: string;
  } | null>(null);
  const me = session.user?.id ?? null;

  const liveSegments = bottle.segments.filter((segment) => segment.deletedAt === null);
  const nextIndex = bottle.missingSegmentIndexes[0];
  const mySegmentRecorded =
    me !== null && bottle.segments.some((segment) => segment.ownerId === me);
  // 未登录时不要把"录制/放回"摆出来：服务端会 401，页面应当先请用户登录（不制造假按钮）
  const authed = session.status === 'authed';
  const canRecord = authed && bottle.isHolder && nextIndex !== undefined && !bottle.isComplete;
  const canPutBack = authed && bottle.isHolder && bottle.status === 'HELD' && !mySegmentRecorded;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="面包屑" className="flex flex-wrap items-center gap-3 text-[0.875rem]">
        <Link
          to="/river"
          className="inline-flex min-h-11 items-center gap-2 text-peacock underline"
        >
          <Icon name="ArrowLeft" size={16} />
          回河道
        </Link>
        <span className="text-slate-current">漂流瓶详情</span>
        <span className="rounded-pill bg-tide-pool px-3 py-1 font-medium text-abyss">
          {BOTTLE_STATUS_LABEL[bottle.status]}
        </span>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-[1.75rem] font-bold text-abyss">{bottle.songTitle}</h1>
        <p className="text-[0.9375rem] leading-[1.6] text-slate-current">
          {progressLabel(bottle)} · {relayHeadline(bottle)} · 发起者 {bottle.initiatorCode}
        </p>
        {gapNotice(bottle.missingSegmentIndexes) === null ? null : (
          <p className="text-[0.9375rem] leading-[1.6] text-warning">
            缺口是歌里固定的段位，不会被别人的段顶替；成品里这段时间会留成静音。
          </p>
        )}
      </header>

      {announcement === null ? null : <Toast tone="success" message={announcement} />}
      {pendingNote === null ? null : <Toast tone="info" message={pendingNote} />}
      {castVote.isError ? <ConflictNotice error={castVote.error} bottleId={bottle.id} /> : null}

      <RelayTimeline
        segments={liveSegments}
        totalSegments={bottle.totalSegments}
        missingSegmentIndexes={bottle.missingSegmentIndexes}
        onReportSegment={(segmentId) => {
          setReportTarget({ type: 'SEGMENT', id: segmentId });
        }}
      />

      {bottle.hiddenLaterSegmentCount === 0 ? null : (
        <p
          role="status"
          className="rounded-base border border-info-border bg-info-tint px-4 py-3 text-[0.875rem] leading-[1.6] text-peacock"
        >
          还有 {bottle.hiddenLaterSegmentCount}{' '}
          段是你现在看不到的：漂流中只能听到自己那一棒之前的部分 （CONTEXT
          §9.1）。作品入海之后，整条接力链会全部解锁。
        </p>
      )}

      <section className="flex flex-col gap-4" aria-labelledby="playback-heading">
        <h2 id="playback-heading" className="text-[1.0625rem] font-semibold text-abyss">
          先听一遍已有的段
        </h2>
        {liveSegments.length === 0 ? (
          <EmptyState
            icon="AudioWaveform"
            title="还没有人唱过"
            description="这支瓶子刚从河里捞起来，第 1 段还空着 —— 由你开第一句。"
          />
        ) : (
          <div className="flex flex-col gap-4">
            {liveSegments.map((segment) => (
              <SegmentPlayer
                key={segment.id}
                src={segmentAudioUrl(segment.id)}
                segmentIndex={segment.index}
                durationMs={segment.durationMs}
                ownerCode={segment.ownerCode}
                {...(seams?.segmentElementFactory === undefined
                  ? {}
                  : { createElement: seams.segmentElementFactory })}
                isOwnSegment={me !== null && segment.ownerId === me}
                onProgress={(snapshot) => {
                  if (snapshot.segmentIndex !== segment.index) return; // 跨段快照丢弃
                  setListenedRatio((previous) => ({
                    ...previous,
                    [segment.id]: snapshot.ratio,
                  }));
                }}
                onCastDislike={(index) => {
                  // 比例原样上送（服务端仍会二次校验 80%）；不在这里自己算、也不写死阈值
                  const ratio = listenedRatio[segment.id] ?? 0;
                  setPendingNote(null);
                  castVote.mutate(
                    {
                      segmentId: segment.id,
                      value: 'DISLIKE',
                      listenedRatio: ratio,
                    },
                    {
                      onSuccess: (result) => {
                        setAnnouncement(
                          result.segmentCut
                            ? '已记录你的点踩。这一段因为踩数达到阈值被斩浪删除，会留下空缺段位。'
                            : '已记录你的点踩。',
                        );
                      },
                    },
                  );
                  void index;
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="action-heading">
        <h2 id="action-heading" className="text-[1.0625rem] font-semibold text-abyss">
          你的这一步
        </h2>

        {session.status === 'guest' ? (
          <ConflictNotice
            error={
              new ApiError({
                status: 401,
                code: null,
                message: '请先登录再继续：登录之后就能接这一棒。',
              })
            }
            className="max-w-[46rem]"
          />
        ) : null}

        {canRecord && nextIndex !== undefined ? (
          <RecordStep
            bottleId={bottle.id}
            segmentIndex={nextIndex}
            totalSegments={bottle.totalSegments}
            recorderEnvironment={seams?.recorderEnvironment}
            uploadTransport={seams?.uploadTransport}
            onUploaded={async (response: RecordSegmentResponse) => {
              setAnnouncement(`已录下第 ${String(response.index)} 段，等待你选择去向。`);
              // 先让服务端重新算一遍缺口与可选去向，再打开三选一（不拿旧数据猜）
              await invalidateBottle(bottle.id);
              setModalOpen(true);
            }}
          />
        ) : null}

        {bottle.isComplete ? (
          <Card className="flex flex-wrap items-center gap-4">
            <p className="text-[0.9375rem] leading-[1.6] text-slate-current">
              这个作品已经录满了，请先选择去向。
            </p>
            {bottle.isHolder ? (
              <Button
                variant="primary"
                onClick={() => {
                  setModalOpen(true);
                }}
                icon={<Icon name="Send" size={18} />}
              >
                选择去向
              </Button>
            ) : null}
          </Card>
        ) : null}

        {!bottle.isHolder ? (
          <EmptyState
            icon="Waves"
            title="这个瓶子现在不在你手上"
            description="同一条河道上，同一时刻只有一个人拿着它。想看完整的接力过程，可以先看一眼漂流日志。"
            action={
              <Link to="/river" className={TEXT_LINK_STRONG}>
                去河道捞一个
              </Link>
            }
          />
        ) : null}

        {canPutBack ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              loading={putBack.isPending}
              onClick={() => {
                void putBack
                  .mutateAsync()
                  .then((response) => {
                    setAnnouncement(
                      `已放回河道，接下来 ${String(response.cooldownDraws)} 次打捞里不会再碰到它。`,
                    );
                    navigate('/river');
                  })
                  .catch(() => undefined);
              }}
              icon={<Icon name="RotateCcw" size={18} />}
            >
              放回海中，继续漂流
            </Button>
            <span className="text-[0.875rem] text-slate-current">
              还没想好要不要唱？放回去不会记录任何东西。
            </span>
          </div>
        ) : null}

        {putBack.isError ? <ConflictNotice error={putBack.error} bottleId={bottle.id} /> : null}
        {resolution.isError && !modalOpen ? (
          <ConflictNotice error={resolution.error} bottleId={bottle.id} />
        ) : null}
      </section>

      <div className="flex flex-col gap-1 text-[0.875rem] leading-[1.6] text-slate-current">
        <Link to={`/bottles/${bottle.id}/log`} className={TEXT_LINK}>
          看这支瓶子的漂流日志
        </Link>
        <p>谁在什么时候捞走、录音、投河、回传或入海，全都记在服务端。</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant="ghost"
          icon={<Icon name="Flag" size={18} />}
          onClick={() => {
            setReportTarget({ type: 'BOTTLE', id: bottle.id });
          }}
        >
          举报这支漂流瓶
        </Button>
        <span className="text-[0.875rem] text-slate-current">
          举报进入人工审核队列（CONTEXT §8），不是自动删除。
        </span>
      </div>

      {reportTarget === null ? null : (
        <ReportDialog
          open
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          onClose={() => {
            setReportTarget(null);
          }}
        />
      )}

      <ResolutionModal
        open={modalOpen}
        bottleId={bottle.id}
        stage={bottle.status === 'DRAFT' ? 'FIRST_CAST' : 'RELAY'}
        available={bottle.availableResolutions}
        busy={resolution.isPending}
        {...(resolution.isError ? { error: resolution.error } : {})}
        stageLabel={`接力第 ${String(liveSegments.length)} 棒`}
        onCancel={() => {
          setModalOpen(false);
          resolution.reset();
        }}
        onConfirm={(choice: Resolution) => {
          void resolution
            .mutateAsync(choice)
            .then(() => {
              setModalOpen(false);
              setAnnouncement(
                choice === 'SEA'
                  ? '已入海：这件作品现在所有人都能听到。'
                  : choice === 'RETURN'
                    ? '已回传：接下来由上游的传递者决定。'
                    : '已投河：等下一位陌生人捞到它。',
              );
            })
            .catch(() => undefined);
        }}
      />
    </div>
  );
}
