/**
 * 漂流瓶页 —— 逐块照抄设计稿 `docs/ui-review/design-explore/p-bottle-record.html`：
 * 块顺序 / 装置 / 文案逐字 / 值逐值，不省块不发明不重组；唯一翻译 = 固定 px → 流体
 * （稿是 1440×900 绝对定位画布：本页改成正常流，边距 76/30/16px → vw + rem 下限）。
 *
 * 稿的块序：顶栏（回河道 + 状态 pill）→ 标题区（h1/曲名/meta/note/发起者徽记）→
 * 瓶身剖面装置（heroLab/四格/水位/瓶塞 = `features/bottle/relay-timeline`，只读）→
 * 第 4 格录制入口（gapBox）→ 试听与投票 | 选择去向（614/644 两列）→ 底栏（留言/举报）。
 *
 * 两个保留例外（用户点名）：
 * ① 沟槽时间轴 + 唱针（`features/audio/groove-timeline`）放在稿上部对应位：
 *    标题区之后、瓶身剖面之前；
 * ② 录制上传 / 三选一去向 / 放回 / 留言 / 赞踩行为全保留 —— 去向行（稿上的三条水路）
 *    就是三选一入口，点行打开确认弹窗（服务端 `availableResolutions` 过滤，顺序即展示顺序）。
 *
 * 三条不变量（ADR-015，页面不许自己推断）：段号 = `missingSegmentIndexes[0]`；
 * 完成度看缺口；备选去向由服务端给（发起者没有「回传」）。
 */
import { useRef, useState } from 'react';
import type { BottleDetail, RecordSegmentResponse, Resolution } from '@music-drift/shared';
import {
  useChooseResolution,
  useInvalidateBottle,
  usePutBack,
} from '../features/api/mutations';
import { useBottle, segmentAudioUrl } from '../features/api/queries';
import { ConflictNotice } from '../features/bottle/conflict-notice';
import { RecordStep } from '../features/bottle/record-step';
import { ReportDialog } from '../features/bottle/report-dialog';
import { RelayTimeline } from '../features/bottle/relay-timeline';
import { PrivateMessages } from '../features/bottle/private-messages';
import { CollectButton } from '../features/bottle/collect-button';
import { TargetedSegmentButton } from '../features/bottle/targeted-segment-button';
import { PublicComments } from '../features/bottle/public-comments';
import { VotableSegment } from '../features/bottle/votable-segment';
import type { MyVote } from '../features/bottle/vote-controls';
import { ResolutionModal } from '../features/bottle/resolution-modal';
import {
  gapNotice,
  progressLabel,
  relayHeadline,
  resolutionCopy,
  BOTTLE_STATUS_LABEL,
} from '../features/bottle/relay-status';
import { useSession } from '../features/session/session-context';
import { GroovePlaybackProvider, GrooveTimeline } from '../features/audio/groove-timeline';
import {
  type AudioElementLike,
  SequentialSegmentPlayer,
  type RecorderEnvironment,
  type UploadTransport,
} from '../features/audio';
import { Icon, Modal, Toast } from '../design-system';
import { AsyncBoundary } from './shell/async-boundary';
import { Link } from './shell/router';
import { useNavigate } from './shell/router-context';
import { buildPath } from './shell/routes';
import { TEXT_LINK } from './shell/link-styles';
import './bottle-page.css';

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

/** 三选一去向的行头图标（与 ResolutionModal 的选盘同一组 Lucide 名）。 */
const DEST_GLYPH: Record<Resolution, 'Waves' | 'RotateCcw' | 'Ship'> = {
  RIVER: 'Waves',
  RETURN: 'RotateCcw',
  SEA: 'Ship',
};

/**
 * G2（flow-audit P0）投后下一步文字链：record-v1 文字链语态 —— coral + 下划线细线，
 * 结构照本页顶栏「回河道」crumb（`min-h-11` ≥44px 热区 + `whitespace-nowrap` 防竖排）。
 * 不用 `TEXT_LINK`（peacock 底色）：这里按审计语汇要 coral，且不可靠覆盖已导入的 utility 颜色。
 */
const NEXT_TEXT_LINK =
  'inline-flex min-h-11 items-center gap-[7px] whitespace-nowrap text-[0.875rem] text-coral underline underline-offset-[4px]';

/**
 * t17 深度复刻返工（用户打回「还是很丑」）：版式不再自己发明 ——
 * 三层构图与坐标系整体照抄 `site/bottle.html` + `site/patches/bottle.css`，落在 `pages/bottle-page.css`：
 *   场景层 `.bp-scene` / 标注层（RelayTimeline：segNum·segLab·cap·gapBox·selMark·callout·corkLab）/
 *   仪器层（标题区 / `.listenCol` / `.destCol` / `.bottomRule`+`.bottom`），上部 `.bp-timeline` 时间轴。
 * 窄屏（<1024）仍走流式 + order 让位（下面各块的 order-* 类），DOM 块序不动。
 */

export function BottlePage({ id, seams }: BottlePageProps) {
  const bottle = useBottle(id);
  return (
    <GroovePlaybackProvider>
      {/* 页面自带 <main>（外壳不渲染）：稿的 76/30/16px 画布边距 → 流体（vw，rem 下限） */}
      <main className="bottle-page flex min-w-0 flex-col px-[max(1.5rem,5.278vw)] pt-[max(1.5rem,2.083vw)] pb-[max(1rem,1.111vw)] text-paper md:h-[100dvh] md:overflow-hidden">
        {/* 场景层（稿 .clip：platter / air / glint / deep / current）——纯装饰、零高度 */}
        <div className="bp-scene" aria-hidden="true">
          <span className="platter" />
          <span className="air" />
          <span className="glint" />
          <span className="deep" />
          <span className="current" />
        </div>
        <AsyncBoundary query={bottle}>
          {(data) => <BottleView bottle={data} {...(seams === undefined ? {} : { seams })} />}
        </AsyncBoundary>
      </main>
    </GroovePlaybackProvider>
  );
}

function BottleView({ bottle, seams }: { bottle: BottleDetail; seams?: BottlePageProps['seams'] }) {
  const session = useSession();
  const navigate = useNavigate();
  const resolution = useChooseResolution(bottle.id);
  const putBack = usePutBack(bottle.id);
  const invalidateBottle = useInvalidateBottle();
  /**
   * 我投过什么（会话内记忆）。契约里段上没有 `myVote`（见 docs/handover 的"投票状态缺口"），
   * 所以只记本次会话投过的票：成功后写入，拦住重复票（内核会 LIKE/DISLIKE_ALREADY_CAST）。
   */
  const [myVotes, setMyVotes] = useState<Record<string, MyVote>>({});
  /** 正在试听的那一段（界面上同时只有一个播放器）。默认 = 补位上下文指的段（ADR-015 §16.5），否则最后一段。 */
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  /** 录制面板（录完才能选去向）：收进弹窗，页面本体只留稿上的 CTA。 */
  const [recorderPhase, setRecorderPhase] = useState<
    'closed' | 'open' | 'exiting-to-destination'
  >('closed');
  const [recorderSegmentIndex, setRecorderSegmentIndex] = useState<number | null>(null);
  const [recorderUploading, setRecorderUploading] = useState(false);
  const recorderPortalExitedRef = useRef(false);
  const destinationReadyRef = useRef(false);
  /** 私密留言（§5）：声明式内容 + 表单 → 弹窗。 */
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const pendingCommentReport = useRef<string | null>(null);
  /** 投票失败（409 冲突 / 网络层）→ 交给 ConflictNotice 给出口，不静默。 */
  const [voteError, setVoteError] = useState<unknown>(null);
  /** 服务端说"没听满"（422 门槛类）→ 弹提醒（不是禁用按钮）。 */
  const [listenShortReason, setListenShortReason] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  /** G2（flow-audit P0）：三选一确认成功后的去向 —— 播报之外在正文留「语义下一步键」，不让流程死在 aria-live 里。 */
  const [resolutionNext, setResolutionNext] = useState<Resolution | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    type: 'BOTTLE' | 'SEGMENT' | 'COMMENT';
    id: string;
  } | null>(null);
  const liveSegments = bottle.segments.filter((segment) => segment.deletedAt === null);
  /** 默认选段：补位上下文指的那一段，其次最后一段；用户点「听」后由 state 覆盖（派生默认，不用 effect）。 */
  const preferredSegmentId =
    bottle.replacementContext?.listenSegmentId ?? liveSegments[liveSegments.length - 1]?.id ?? null;
  const selectedSegment =
    liveSegments.find((segment) => segment.id === selectedSegmentId) ??
    liveSegments.find((segment) => segment.id === preferredSegmentId) ??
    null;
  const nextIndex = bottle.missingSegmentIndexes[0];
  /**
   * 我能不能动手：不能只看 `isHolder` —— DRAFT 瓶子的 holder 是 null（内核 BOTTLE_CREATED
   * 不改 holder），发起者也是 isHolder false，所以判据用服务端给的观看者维度事实
   * （DRAFT + availableResolutions 非空 = 发起者本人），前端不加"是否登录"的猜测。
   */
  const isMyDraft = bottle.status === 'DRAFT' && bottle.availableResolutions.length > 0;
  const canActOnBottle = bottle.isHolder || isMyDraft;
  /** 同一人在同一支瓶子里只能录一次（内核 CANNOT_RECORD_TWICE_IN_BOTTLE）。 */
  const mySegmentRecorded = bottle.segments.some((segment) => segment.isMine);
  const canRecord =
    canActOnBottle && !mySegmentRecorded && nextIndex !== undefined && !bottle.isComplete;
  const canChooseResolution = bottle.availableResolutions.length > 0;
  /** 稿上 destCol 的三条水路 = 三选一入口；录完（或已录满）才摆出来 —— 与旧"选择去向"按钮同一门。 */
  const showDestinationRows = canChooseResolution && !canRecord;
  /**
   * 左上「回河道」是唯一放回入口：持有且未处置时先走服务端 put-back，
   * 非持有者不能改变瓶子状态，只返回河道。
   */
  const canPutBack = bottle.isHolder && bottle.status === 'HELD';
  const destinationRows = bottle.availableResolutions.map((choice) => ({
    choice,
    copy: resolutionCopy(choice),
  }));
  const fullPreview = (
    <section className="bf-full-preview" aria-label="全部接唱试听">
      <h3 className="sr-only">听全部已有录音</h3>
      <SequentialSegmentPlayer segments={liveSegments.map((segment) => ({
        index: segment.index, src: segmentAudioUrl(segment.id),
      }))} />
    </section>
  );

  const openDestinationWhenRecorderIsGone = (): void => {
    if (!recorderPortalExitedRef.current || !destinationReadyRef.current) return;
    recorderPortalExitedRef.current = false;
    destinationReadyRef.current = false;
    setRecorderPhase('closed');
    setRecorderSegmentIndex(null);
    setModalOpen(true);
  };

  return (
    <>
      {/* ── 顶栏（稿 .crumb）：回河道 + 状态 pill ─────────────────────────── */}
      <nav aria-label="面包屑" className="bp-crumb flex flex-wrap items-center gap-[16px]">
        <button
          type="button"
          disabled={putBack.isPending}
          onClick={() => {
            if (!canPutBack) {
              navigate('/river');
              return;
            }
            void putBack
              .mutateAsync()
              .then(() => {
                navigate('/river');
              })
              .catch(() => undefined);
          }}
          className="inline-flex min-h-11 items-center gap-[7px] whitespace-nowrap text-[0.875rem] text-glass underline underline-offset-[4px]"
        >
          <Icon name="ArrowLeft" size={16} />
          回河道
        </button>
        <span className="rounded-base border border-coral/55 px-[10px] pt-[3px] pb-[4px] text-[0.8125rem] tracking-[0.08em] text-coral">
          {BOTTLE_STATUS_LABEL[bottle.status]}
        </span>
      </nav>

      {/* ── 标题区（稿 h1/.work/.metaRow/.note + 右上 .maker 徽记）：整列按参考坐标落位 ── */}
      <header className="bp-head enter-rise stagger-1 relative flex flex-col">
        <h1 className="text-[clamp(2rem,3.9vw,3.5rem)] font-bold leading-none text-paper">
          漂流瓶详情
        </h1>
        <p className="bf-title mt-[4px] text-[1.1875rem] font-bold leading-[1.1] text-paper">{bottle.songTitle}</p>
        <p className="bf-meta mt-[2px] flex flex-wrap gap-x-[20px] text-[0.875rem] leading-[1.1] text-muted">
          <span>{progressLabel(bottle)}</span>
          <span>{relayHeadline(bottle)}</span>
        </p>
        {gapNotice(bottle.missingSegmentIndexes) === null ? null : (
          <p className="bf-note mt-[2px] flex max-w-[50rem] items-start gap-[11px] text-[0.9375rem] leading-[1.6] text-warm">
            {/* 缺口标记：一颗 5×5 的珊瑚方点（不是一个句首的圆角标签） */}
            <span aria-hidden="true" className="mt-[8px] h-[5px] w-[5px] shrink-0 bg-coral" />
            <span>缺口是歌里固定的段位，不会被别人的段顶替。成品里这段时间会留成静音。</span>
          </p>
        )}

        {/* 发起者徽记（稿 .maker）：桌面贴标题带右上，窄屏顺流跟在 note 后面 */}
        <div className="maker mt-[8px] flex items-center gap-[16px] md:absolute md:right-0 md:top-0 md:mt-0">
          <span
            role="img"
            aria-label="发起者徽记"
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border border-coral/[0.62]"
          >
            <span className="flex h-[40px] w-[40px] items-center justify-center rounded-full border border-paper/15">
              <span className="h-[9px] w-[9px] rounded-full bg-coral" />
            </span>
          </span>
          <span className="flex flex-col">
            <span className="font-latin text-[0.6875rem] tracking-[0.24em] text-paper/50">
              发起者
            </span>
            <span className="mt-[6px] font-latin text-[0.9375rem] text-paper">
              {bottle.initiatorCode}
            </span>
          </span>
        </div>
      </header>

      {/* 层外提示（触发才出现，非稿块）：成功播报 + 投后下一步键（G2）/ 没听满提醒 / 投票冲突 */}
      {announcement === null ? null : (
        <div role="status" className="bp-status-item flex flex-col">
          <Toast tone="success" message={announcement} onDismiss={() => setAnnouncement(null)} />
          {/* G2：三选一成功后留在正文的语义下一步（播报保留，键不只活在 aria-live 里） */}
          {resolutionNext === null ? null : (
            <div className="flex flex-wrap items-center gap-x-[20px]">
              {resolutionNext === 'SEA' ? (
                <Link to={buildPath('sea')} className={NEXT_TEXT_LINK}>
                  → 去公海听这一版
                </Link>
              ) : null}
              <Link to={buildPath('river')} className={NEXT_TEXT_LINK}>
                → 回河道继续
              </Link>
            </div>
          )}
        </div>
      )}
      {listenShortReason === null ? null : (
        <Modal
          open
          title="还需要再听一会儿"
          onClose={() => {
            setListenShortReason(null);
          }}
          footer={
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-base bg-coral px-[18px] text-[0.9375rem] text-ink"
              onClick={() => {
                setListenShortReason(null);
              }}
            >
              继续听
            </button>
          }
        >
          <p className="text-[0.9375rem] leading-[1.6] text-muted">{listenShortReason}</p>
        </Modal>
      )}
      {voteError === null ? null : (
        <ConflictNotice
          error={voteError}
          bottleId={bottle.id}
          onRetry={() => { setVoteError(null); }}
          className="bp-status-item"
        />
      )}

      {/*
        例外① 沟槽时间轴 + 唱针（用户裁决：公海详情页删除，进度条复刻进本页）。
        落位 = 稿上部对应位：标题区之后、瓶身剖面装置之前。
        与瓶身剖面语义不同、并存不重复：剖面答"哪些段录了、缺哪段"，
        沟槽答"现在放到哪儿、这一段多长"（唱针跟随真实播放进度）。
      */}
      <GrooveTimeline
        className="bp-timeline bf-groove mt-[4px] order-4 lg:order-none"
        segments={liveSegments}
        totalSegments={bottle.totalSegments}
        missingSegmentIndexes={bottle.missingSegmentIndexes}
      />

      {/* ── 瓶身装置（标注层）：site/bottle.html 的四格剖面 —— 段号/段名/段位卡挂在刻度上，
          缺口簇长在服务端给的那一格（可录给 CTA、不可录给参考的说明），落位全在 bottle-page.css。
          order 类挂在装置根上：窄屏 <1024 让位到两栏之后，lg 归位稿序（DOM 块序不动）。 ── */}
      <RelayTimeline
        className="bf-relay order-3 lg:order-none"
        segments={liveSegments}
        totalSegments={bottle.totalSegments}
        missingSegmentIndexes={bottle.missingSegmentIndexes}
        status={bottle.status}
        selectedSegmentId={selectedSegment?.id ?? null}
        onSelectSegment={setSelectedSegmentId}
        onReportSegment={(segmentId) => {
          setReportTarget({ type: 'SEGMENT', id: segmentId });
        }}
        gapNote={
          nextIndex === undefined
            ? null
            : canRecord
              ? '这一段按该段的固定时长录，录完再选去向。不点开就不会占用你的麦克风。'
              : '这一段只有发起者（尚未投河时）或当前持有者能录：你看得到缺口，但录不了它。'
        }
        gapAction={
          !canRecord || nextIndex === undefined ? null : (
            <button
              type="button"
              className="cta whitespace-nowrap"
              onClick={() => {
                setRecorderSegmentIndex(nextIndex);
                setRecorderPhase('open');
              }}
            >
              <Icon name="Mic" size={16} />
              录第 {String(nextIndex)} 段
            </button>
          )
        }
      />

      {/*
        稿两列：.listenCol（614） | .destCol（644），间距 30。
        `data-anchor="bottle-action"` = 去向/动作区容器（门禁量下沿；任何态都在，不随内容条件化）。
        order：<1024 播放/动作两栏最先让位（时间轴与页脚后移，lg 归位稿序）。
      */}
      <div
        data-anchor="bottle-action"
        className="bp-cols mt-[8px] grid gap-x-[30px] gap-y-[16px] order-1 lg:order-none lg:grid-cols-[614fr_644fr] lg:items-start"
      >
        <section
          className="listenCol enter-rise stagger-2 flex flex-col"
          aria-labelledby="playback-heading"
          data-anchor="bottle-play"
        >
          <h2
            id="playback-heading"
            className="flex flex-wrap items-baseline gap-x-[16px] text-[1.0625rem] font-bold leading-none text-paper"
          >
            试听与投票
            <span className="text-[0.84375rem] font-normal text-muted">
              {selectedSegment === null
                ? '现在没有你能试听的段'
                : // 稿逐字含两个全角空格（U+3000）：模板串不被 no-irregular-whitespace 豁免 ⇒ 用 U+3000 转义保字节
                  `第 ${String(selectedSegment.index)} 段\u3000${selectedSegment.ownerCode}\u3000在瓶身上点「听」换段`}
            </span>
          </h2>

          {selectedSegment === null ? (
            /*
             * 参考 renderListenColumn：没有可试听的段时 **transport 仍在位**（0:00 / 0:00），
             * 但播放键**禁用** —— 几何与参考对齐，同时不制造点了没用的控件。
             */
            <div className="bf-player transport" data-testid="transport-empty" aria-disabled="true">
              <button
                type="button"
                className="play"
                disabled
                aria-label="播放（现在没有你能试听的段）"
              >
                <svg viewBox="0 0 34 34" fill="none" aria-hidden="true">
                  <circle cx="17" cy="17" r="16" stroke="var(--color-water-mid)" strokeOpacity=".45" />
                  <circle cx="17" cy="17" r="11.5" stroke="var(--color-water-mid)" strokeOpacity=".2" />
                  <path d="M14 11.8l9.4 5.2-9.4 5.2z" fill="var(--color-muted)" />
                </svg>
              </button>
              <div className="bar" aria-hidden="true">
                <svg viewBox="0 0 400 20" fill="none" aria-hidden="true">
                  <path
                    d="M0 11 q14 -7 28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0"
                    stroke="var(--color-water-mid)"
                    strokeOpacity=".18"
                  />
                </svg>
              </div>
              <span className="timecode">0:00 / 0:00</span>
            </div>
          ) : (
            <VotableSegment
              // key 用段 id：换段就是换一个上报器实例（旧的覆盖进度不会串到新段上）
              key={selectedSegment.id}
              className="bf-player"
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
              isOwnSegment={selectedSegment.isMine}
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

          {showDestinationRows ? fullPreview : null}
          <p className="bf-hint votesNote mt-[4px] text-[0.8125rem] text-muted">
            {selectedSegment === null
              ? '还没有可试听的段，也就没有可投票的段。'
              : '还没有听满这一段，继续听一会儿再点踩吧。'}
            {/* 段附言（CONTEXT §12.2）按参考挂在 votesNote 上（page-bottle.js noteSuffix 同位） */}
            {selectedSegment?.note === null || selectedSegment?.note === undefined || selectedSegment.note === '' ? null : (
              <span>　｜ 本段附言：{selectedSegment.note}</span>
            )}
          </p>

        </section>

        {showDestinationRows ? <section className="destCol enter-rise stagger-3 flex flex-col">
          <h2 className="text-[1.0625rem] font-bold leading-none text-paper">选择去向</h2>
          <p className="sub mt-[4px] text-[0.8125rem] text-muted">
            接下来决定它去哪。发起者的第一棒没有「回传」，可选去向由服务端给。
          </p>

          {/* 三条水路（稿 .destRow）：行即入口 → 打开三选一确认弹窗；服务端给哪条画哪条 */}
          {showDestinationRows
            ? destinationRows.map(({ choice, copy }) => (
                <button
                  key={choice}
                  type="button"
                  className="destRow mt-[6px] flex min-h-[46px] w-full items-start gap-[16px] rounded-base text-left transition-colors duration-200 ease-out hover:text-paper"
                  onClick={() => {
                    setModalOpen(true);
                  }}
                >
                  <span aria-hidden="true" className="glyph mt-[6px] w-[30px] shrink-0 text-glass/80">
                    <Icon name={DEST_GLYPH[choice]} size={32} />
                  </span>
                  <span className="min-w-0">
                    <span className="t block text-[1rem] font-bold">{copy.title}</span>
                    <span className="d mt-[3px] block text-[0.8125rem] leading-[1.4] text-muted">
                      {copy.detail}
                    </span>
                  </span>
                </button>
              ))
            : null}
        </section> : <section className="destCol enter-rise stagger-3 flex flex-col">
          <h2 className="text-[1.0625rem] font-bold leading-none text-paper">沿着歌声听下去</h2>
          {fullPreview}
          {bottle.status === 'SEA' && session.status === 'authed' ? (
            <div className="bp-sea-actions mt-3 flex flex-wrap gap-3">
              {bottle.isComplete ? <CollectButton bottleId={bottle.id} /> :
                !mySegmentRecorded ? <TargetedSegmentButton bottleId={bottle.id} /> : null}
            </div>
          ) : null}
        </section>}
      </div>

      {/* 守卫出口（稿无此块，保留服务端事实与登录出口）：未登录 / 不在你手上 */}
      {putBack.isError ? (
        <ConflictNotice
          error={putBack.error}
          bottleId={bottle.id}
          className="bp-status-item order-2 lg:order-none"
        />
      ) : null}
      {resolution.isError && !modalOpen ? (
        <ConflictNotice
          error={resolution.error}
          bottleId={bottle.id}
          className="bp-status-item order-2 lg:order-none"
        />
      ) : null}

      {/* ── 底栏（稿 .bottomRule + .bottom）：漂流日志 / 服务端记账 / 留言 / 举报 ── */}
      <div
        aria-hidden="true"
        className="bottomRule bf-rule mt-[2px] h-px w-full bg-line/10 order-5 lg:order-none"
      />
      <div className="bottom bf-bottom mt-[2px] flex flex-wrap items-center gap-[22px] text-[0.8125rem] text-muted order-5 lg:order-none">
        <Link to={`/bottles/${bottle.id}/log`} className={`${TEXT_LINK} text-glass`}>
          看这只瓶子的漂流日志
        </Link>
        <span>捞取 / 录音 / 投河 / 回传 / 入海 全部记在服务端。</span>
        <span className="flex flex-wrap items-center gap-[26px] md:ml-auto">
          {bottle.status === 'SEA' ? <button type="button" className={TEXT_LINK}
            onClick={() => setCommentsOpen(true)}><Icon name="ScrollText" size={16} />公开评论</button> : null}
          {bottle.status === 'SEA' ? null : (
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-[7px] whitespace-nowrap text-muted underline underline-offset-[4px] transition-colors duration-200 ease-out hover:text-paper"
              onClick={() => {
                setMessagesOpen(true);
              }}
            >
              <Icon name="ScrollText" size={16} />
              私密留言
            </button>
          )}
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-[7px] whitespace-nowrap text-muted underline underline-offset-[4px] transition-colors duration-200 ease-out hover:text-paper"
            onClick={() => {
              setReportTarget({ type: 'BOTTLE', id: bottle.id });
            }}
          >
            <Icon name="Flag" size={16} />
            举报（进人工队列，不是自动删除）
          </button>
        </span>
      </div>

      {/* 对话层（稿是静态帧，这里保留行为）：录制 / 三选一确认 / 私密留言 / 举报 */}
      {recorderSegmentIndex === null ? null : (
        <Modal
          open={recorderPhase === 'open'}
          title={`录第 ${String(recorderSegmentIndex)} 段`}
          dismissible={!recorderUploading}
          onClose={() => {
            setRecorderPhase('closed');
          }}
          onExited={() => {
            if (recorderPhase === 'exiting-to-destination') {
              recorderPortalExitedRef.current = true;
              openDestinationWhenRecorderIsGone();
              return;
            }
            setRecorderSegmentIndex(null);
          }}
        >
          <RecordStep
            bottleId={bottle.id}
            songId={bottle.songId}
            segmentIndex={recorderSegmentIndex}
            totalSegments={bottle.totalSegments}
            recorderEnvironment={seams?.recorderEnvironment}
            uploadTransport={seams?.uploadTransport}
            onUploadingChange={setRecorderUploading}
            onCancel={() => {
              setRecorderPhase('closed');
            }}
            onUploaded={async (response: RecordSegmentResponse) => {
              setAnnouncement(`已录下第 ${String(response.index)} 段，等待你选择去向。`);
              setRecorderUploading(false);
              recorderPortalExitedRef.current = false;
              destinationReadyRef.current = false;
              setRecorderPhase('exiting-to-destination');
              // 先让服务端重新算一遍缺口与可选去向，再打开三选一（不拿旧数据猜）
              await invalidateBottle(bottle.id);
              destinationReadyRef.current = true;
              openDestinationWhenRecorderIsGone();
            }}
          />
        </Modal>
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
              // G2：成功去向记下来 → 播报容器内渲染语义下一步键（SEA 去公海听；其余回河道）
              setResolutionNext(choice);
            })
            .catch(() => undefined);
        }}
      />

      <Modal open={commentsOpen} title="公海评论" onClose={() => setCommentsOpen(false)}
        onExited={() => {
          if (pendingCommentReport.current === null) return;
          setReportTarget({ type: 'COMMENT', id: pendingCommentReport.current });
          pendingCommentReport.current = null;
        }}>
        <PublicComments bottleId={bottle.id} canComment={session.status === 'authed'}
          onReport={(commentId) => { pendingCommentReport.current = commentId; setCommentsOpen(false); }} />
      </Modal>

      <PrivateMessages
        open={messagesOpen && bottle.status !== 'SEA'}
        bottleId={bottle.id}
        // 内核 canAttachPrivateMessage：只有接唱者能写；入海/损坏/回传链断裂后送不到 —— 按可见事实给入口。
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
    </>
  );
}
