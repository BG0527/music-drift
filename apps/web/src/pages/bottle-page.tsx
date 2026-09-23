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
import { PrivateMessages } from '../features/bottle/private-messages';
import { VotableSegment } from '../features/bottle/votable-segment';
import type { MyVote } from '../features/bottle/vote-controls';
import { ResolutionModal } from '../features/bottle/resolution-modal';
import {
  gapNotice,
  progressLabel,
  relayHeadline,
  BOTTLE_STATUS_LABEL,
} from '../features/bottle/relay-status';
import { useSession } from '../features/session/session-context';
import {
  type AudioElementLike,
  type RecorderEnvironment,
  type UploadTransport,
} from '../features/audio';
import { Button, Card, EmptyState, Icon, Modal, Toast } from '../design-system';
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
  /**
   * 我投过什么（会话内记忆）。
   * 契约里段上没有 `myVote` 字段（见 `docs/handover` 的"投票状态缺口"），
   * 所以这里只记**本次会话投过的票**：投票成功后写入，用来显示已赞/已踩并拦住重复票
   * （内核会 LIKE_ALREADY_CAST / DISLIKE_ALREADY_CAST）。不冒充服务端真相。
   */
  const [myVotes, setMyVotes] = useState<Record<string, MyVote>>({});
  /**
   * 正在试听的那一段。**界面上同时只有一个播放器**（§46.3 一屏装下）：
   * 4 段各来一个播放卡就是 800px+，所以改成"时间轴选段 + 一个播放器"。
   * 默认选「补位上下文指定的那一段」（ADR-015 §16.5：补位者听缺口前一段），其次选最后一段。
   */
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  /** 录制面板（附录：录完才能选去向）。它占的多，所以收进弹窗，页面本体保持一屏。 */
  const [recorderOpen, setRecorderOpen] = useState(false);
  /** 私密留言（§5）：声明式内容 + 表单 → 弹窗（同样为了页面一屏）。 */
  const [messagesOpen, setMessagesOpen] = useState(false);
  /** 投票失败（409 冲突 / 网络层）→ 交给 ConflictNotice 给出出口，不静默。 */
  const [voteError, setVoteError] = useState<unknown>(null);
  /** 服务端说"没听满"（422 门槛类）→ 弹提醒（不是禁用按钮）。 */
  const [listenShortReason, setListenShortReason] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    type: 'BOTTLE' | 'SEGMENT';
    id: string;
  } | null>(null);
  const me = session.user?.id ?? null;

  const liveSegments = bottle.segments.filter((segment) => segment.deletedAt === null);
  /**
   * 默认要放哪一段：**补位上下文指的那一段**（ADR-015 §16.5：补位者听缺口前一段），
   * 没有就放最后一段。用户在时间轴上点过之后，`selectedSegmentId` 覆盖这个默认值 ——
   * 这是"派生默认"而不是 effect 同步 state（避免级联渲染）。
   */
  const preferredSegmentId =
    bottle.replacementContext?.listenSegmentId ?? liveSegments[liveSegments.length - 1]?.id ?? null;
  const selectedSegment =
    liveSegments.find((segment) => segment.id === selectedSegmentId) ??
    liveSegments.find((segment) => segment.id === preferredSegmentId) ??
    null;
  const nextIndex = bottle.missingSegmentIndexes[0];
  /**
   * 我能不能对这支瓶子动手。
   *
   * ⚠️ **不能只看 `isHolder`**（用户 2026-09-23 实测的 P0）：`DRAFT` 瓶子的 `holder` 是 `null`
   * （内核 `BOTTLE_CREATED` 不改 holder），所以发起者自己也是 `isHolder === false` ——
   * 于是"发起 → 点进去 → 说不在你手上"成了死胡同，而"发起"本来就是"我来录第 1 段"。
   * 内核 `canRecordSegment` 对 `DRAFT` 的要求只是"你是发起者"，不是"你持有"。
   *
   * 判据只用**服务端给的观看者维度事实**（契约：`availableResolutions` 空数组 = 这个观看者不能选；
   * `isHolder` 也是按观看者算的），前端不再自己加一层"是否登录"的猜测 —— 那是第二份真相。
   */
  const isMyDraft = bottle.status === 'DRAFT' && bottle.availableResolutions.length > 0;
  const canActOnBottle = bottle.isHolder || isMyDraft;
  /**
   * 我唱过这一段没有。内核 `CANNOT_RECORD_TWICE_IN_BOTTLE`：同一个人在同一支瓶子里只能录一次，
   * 所以"已经唱过"之后正确的下一步是**选去向**，而不是再录一段。
   */
  const mySegmentRecorded =
    me !== null && bottle.segments.some((segment) => segment.ownerId === me);
  const canRecord =
    canActOnBottle && !mySegmentRecorded && nextIndex !== undefined && !bottle.isComplete;
  /** 有可选去向 ⇒ 现在就摆出「选择去向」（录完第一棒、或已录满，都要能走到下一步）。 */
  const canChooseResolution = bottle.availableResolutions.length > 0;
  const canPutBack = bottle.isHolder && bottle.status === 'HELD' && !mySegmentRecorded;

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
        {/* 元信息不用 `·` 串联（frontend-design 把 "A · B · C" 点名为生成页特征）：拆成并列短语 */}
        <p className="flex flex-wrap items-center gap-x-[16px] gap-y-[4px] text-[0.9375rem] leading-[1.6] text-slate-current">
          <span>{progressLabel(bottle)}</span>
          <span>{relayHeadline(bottle)}</span>
          <span>发起者 {bottle.initiatorCode}</span>
        </p>
        {gapNotice(bottle.missingSegmentIndexes) === null ? null : (
          <p className="text-[0.9375rem] leading-[1.6] text-warning">
            缺口是歌里固定的段位，不会被别人的段顶替；成品里这段时间会留成静音。
          </p>
        )}
      </header>

      {announcement === null ? null : <Toast tone="success" message={announcement} />}
      {listenShortReason === null ? null : (
        <Modal
          open
          title="还需要再听一会儿"
          onClose={() => {
            setListenShortReason(null);
          }}
          footer={
            <Button
              onClick={() => {
                setListenShortReason(null);
              }}
            >
              继续听
            </Button>
          }
        >
          <p className="text-[0.9375rem] leading-[1.6] text-slate-current">{listenShortReason}</p>
        </Modal>
      )}
      {voteError === null ? null : (
        <ConflictNotice error={voteError} bottleId={bottle.id} onRetry={() => { setVoteError(null); }} />
      )}

      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <div className="flex flex-col gap-3">
          <RelayTimeline
            segments={liveSegments}
            totalSegments={bottle.totalSegments}
            missingSegmentIndexes={bottle.missingSegmentIndexes}
            selectedSegmentId={selectedSegment?.id ?? null}
            onSelectSegment={setSelectedSegmentId}
            onReportSegment={(segmentId) => {
              setReportTarget({ type: 'SEGMENT', id: segmentId });
            }}
          />

          {bottle.hiddenLaterSegmentCount === 0 ? null : (
            <p
              role="status"
              className="rounded-base border border-info-border bg-info-tint px-[12px] py-[8px] text-[0.875rem] leading-[1.5] text-peacock"
            >
              还有 {bottle.hiddenLaterSegmentCount}{' '}
              段现在看不到（CONTEXT §9.1：漂流中只能听到自己这一棒之前的部分），入海后全部解锁。
            </p>
          )}
        </div>

        <div className="order-first flex flex-col gap-4 xl:order-none" data-anchor="bottle-play">
          <h2 id="playback-heading" className="text-[1.0625rem] font-semibold text-abyss">
            试听与投票
            <span className="ml-2 text-[0.875rem] font-normal text-slate-current">
              {selectedSegment === null
                ? '还没有人唱过'
                : `第 ${String(selectedSegment.index)} 段（在左边点"听"换段）`}
            </span>
          </h2>
          {selectedSegment === null ? (
            <EmptyState
              icon="AudioWaveform"
              title="还没有人唱过"
              description="这支瓶子刚从河里捞起来，第 1 段还空着 —— 由你开第一句。"
            />
          ) : (
            <VotableSegment
              // key 用段 id：换段就是换一个上报器实例（旧的覆盖进度不会串到新段上）
              key={selectedSegment.id}
              segment={{
                id: selectedSegment.id,
                index: selectedSegment.index,
                ownerCode: selectedSegment.ownerCode,
                durationMs: selectedSegment.durationMs,
                likeCount: selectedSegment.likeCount,
                dislikeCount: selectedSegment.dislikeCount,
              }}
              src={segmentAudioUrl(selectedSegment.id)}
              bottleId={bottle.id}
              isOwnSegment={me !== null && selectedSegment.ownerId === me}
              myVote={myVotes[selectedSegment.id] ?? null}
              onVoted={(segmentId, value) => {
                setMyVotes((previous) => ({ ...previous, [segmentId]: value }));
                setAnnouncement(value === 'LIKE' ? '已记录你的赞。' : '已记录你的点踩。');
              }}
              onListenShort={(message) => {
                setListenShortReason(message ?? '还没有听满这一段，继续听一会儿再点踩吧。');
              }}
              onFailed={setVoteError}
              {...(seams?.segmentElementFactory === undefined
                ? {}
                : { createElement: seams.segmentElementFactory })}
            />
          )}

      <section
        className="flex flex-col gap-4"
        aria-labelledby="action-heading"
        data-anchor="bottle-action"
      >
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
          <div className="flex flex-wrap items-center gap-4" data-anchor="bottle-record">
            <Button
              variant="primary"
              icon={<Icon name="Mic" size={18} />}
              onClick={() => {
                setRecorderOpen(true);
              }}
            >
              录第 {String(nextIndex)} 段
            </Button>
            <span className="text-[0.875rem] text-slate-current">
              录 15–30 秒，录完再选去向 —— 不点开就不会占用你的麦克风。
            </span>
          </div>
        ) : null}

        {canRecord && nextIndex !== undefined ? (
          <Modal
            open={recorderOpen}
            title={`录第 ${String(nextIndex)} 段`}
            onClose={() => {
              setRecorderOpen(false);
            }}
          >
            <RecordStep
              bottleId={bottle.id}
              segmentIndex={nextIndex}
              totalSegments={bottle.totalSegments}
              recorderEnvironment={seams?.recorderEnvironment}
              uploadTransport={seams?.uploadTransport}
              onUploaded={async (response: RecordSegmentResponse) => {
                setAnnouncement(`已录下第 ${String(response.index)} 段，等待你选择去向。`);
                setRecorderOpen(false);
                // 先让服务端重新算一遍缺口与可选去向，再打开三选一（不拿旧数据猜）
                await invalidateBottle(bottle.id);
                setModalOpen(true);
              }}
            />
          </Modal>
        ) : null}

        {canChooseResolution && !canRecord ? (
          <Card className="flex flex-wrap items-center gap-4 py-[12px]">
            <p className="text-[0.9375rem] leading-[1.6] text-slate-current">
              {bottle.isComplete
                ? '这个作品已经录满了，请先选择去向。'
                : '第 1 段已经录好了，接下来决定它去哪。'}
            </p>
            <Button
              variant="primary"
              onClick={() => {
                setModalOpen(true);
              }}
              icon={<Icon name="Send" size={18} />}
            >
              选择去向
            </Button>
          </Card>
        ) : null}

        {!canActOnBottle ? (
          <p className="flex flex-wrap items-center gap-x-[12px] gap-y-[4px] rounded-base border border-mist bg-foam px-4 py-[12px] text-[0.9375rem] leading-[1.6] text-slate-current">
            <Icon name="Waves" size={18} />
            <span>这个瓶子现在不在你手上（同一条河道同一时刻只有一个人拿着它）。</span>
            <Link to="/river" className={TEXT_LINK_STRONG}>
              去河道捞一个
            </Link>
          </p>
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
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[8px] text-[0.875rem] leading-[1.6] text-slate-current">
        <Link to={`/bottles/${bottle.id}/log`} className={TEXT_LINK}>
          看这只瓶子的漂流日志
        </Link>
        <span>捞取 / 录音 / 投河 / 回传 / 入海 全部记在服务端。</span>
        <Button
          variant="ghost"
          className="h-[36px] min-h-[36px] px-[12px] text-[0.875rem]"
          icon={<Icon name="ScrollText" size={16} />}
          onClick={() => {
            setMessagesOpen(true);
          }}
        >
          私密留言
        </Button>
        <Button
          variant="ghost"
          className="h-[36px] min-h-[36px] px-[12px] text-[0.875rem]"
          icon={<Icon name="Flag" size={16} />}
          onClick={() => {
            setReportTarget({ type: 'BOTTLE', id: bottle.id });
          }}
        >
          举报（进人工队列，不是自动删除）
        </Button>
      </div>

      <PrivateMessages
        open={messagesOpen}
        bottleId={bottle.id}
        // 内核 `canAttachPrivateMessage`：只有**接唱者**能写，发起者不能给自己留言；
        // 已入海 / 已损坏 / 回传链断裂之后就送不到了。这里按可见事实给入口，不摆会 4xx 的假控件。
        canWrite={
          mySegmentRecorded && bottle.status !== 'SEA' && bottle.status !== 'DAMAGED' && !bottle.returnChainBroken
        }
        onClose={() => {
          setMessagesOpen(false);
        }}
      />

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
