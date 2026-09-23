/**
 * 公海作品页 —— **只能听**（`docs/api.md` §2.5：完成品不可再接唱）。
 *
 * 信息顺序（参考 Figma `bottle-detail` 的"先听再决定"）：沉浸式播放区 → 段位链 → 成品试听。
 * 阶段一口径必须写在界面上：**纯人声、无伴奏**（用户 2026-09-23 裁决），
 * 免得评审以为"少了伴奏"是实现遗漏。
 */
import { useState } from 'react';
import { planMonoSequentialMix } from '@music-drift/shared/audio';
import { useBottle, useSeaBottle, segmentAudioUrl } from '../features/api/queries';
import { gapNotice, progressLabel } from '../features/bottle/relay-status';
import { RelayTimeline } from '../features/bottle/relay-timeline';
import { formatOccurredAt } from '../features/bottle/drift-events';
import { ConflictNotice } from '../features/bottle/conflict-notice';
import { ReportDialog } from '../features/bottle/report-dialog';
import { ApiError } from '../features/api/client';
import { CollectButton } from '../features/bottle/collect-button';
import { TargetedSegmentButton } from '../features/bottle/targeted-segment-button';
import { VotableSegment } from '../features/bottle/votable-segment';
import type { MyVote } from '../features/bottle/vote-controls';
import { MixExportPanel } from '../features/audio';
import {
  Button,
  EmptyState,
  Icon,
  Modal,
  Skeleton,
  TideLine,
  Toast,
  WaterSheen,
  WaterTexture,
} from '../design-system';
import { AsyncBoundary } from './shell/async-boundary';
import { Link } from './shell/router';
import { TEXT_LINK, TEXT_LINK_STRONG } from './shell/link-styles';

export function SeaDetailPage({ id }: { id: string }) {
  const sea = useSeaBottle(id);
  const bottle = useBottle(id);
  const [note, setNote] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  /**
   * 我投过什么（会话内记忆）。契约里段上没有 `myVote`（见 `docs/handover` 的"投票状态缺口"），
   * 所以只记本次会话投过的票：用来显示已赞/已踩、拦住重复票（内核会 *_ALREADY_CAST）。
   */
  const [myVotes, setMyVotes] = useState<Record<string, MyVote>>({});
  const [voteError, setVoteError] = useState<unknown>(null);
  /** 同时只放一个播放器（§46.3），放哪一段由时间轴决定。 */
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  /** 混音导出计划是**说明性内容**（§46.2）→ 入口 + 弹窗，不占首屏。 */
  const [mixOpen, setMixOpen] = useState(false);
  const [listenShortReason, setListenShortReason] = useState<string | null>(null);

  if (sea.isPending || bottle.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton height="2.25rem" width="16rem" />
        <Skeleton height="8rem" width="100%" />
      </div>
    );
  }

  // 不在公海 → 服务端按 404 回（避免探测，见 docs/api.md §2.5）；这里渲染成交付型空态
  if (sea.isError && sea.error instanceof ApiError && sea.error.status === 404) {
    return (
      <EmptyState
        icon="Ship"
        title="这件作品不在公海"
        description="公海只收已经送进来的作品；它可能还在河道里漂流，或者链接写错了。"
        action={
          <Link to="/sea" className={TEXT_LINK_STRONG}>
            回公海大厅
          </Link>
        }
      />
    );
  }
  if (sea.isError) return <ConflictNotice error={sea.error} />;

  const summary = sea.data;

  return (
    <div className="relative isolate flex flex-col gap-6">
      {/* 内容区母题（t46 扩面要求"详情页内容区"）：整面水位线缓缓流动（绝对定位、零布局高度） */}
      <WaterTexture tone="light" drift />
      {note === null ? null : (
        <Toast tone={voteError === null ? 'info' : 'warning'} message={note} />
      )}
      {voteError === null ? null : (
        <ConflictNotice
          error={voteError}
          onRetry={() => {
            setVoteError(null);
          }}
        />
      )}
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

      <nav aria-label="面包屑" className="flex flex-wrap items-center gap-3 text-[0.875rem]">
        <Link to="/sea" className="inline-flex min-h-11 items-center gap-2 text-peacock underline">
          <Icon name="ArrowLeft" size={16} />
          回公海大厅
        </Link>
        <span className="rounded-pill bg-tide-pool px-3 py-1 font-medium text-abyss">
          {summary.seaZone === 'INCOMPLETE' ? '等待接力' : '完整作品'}
        </span>
      </nav>

      <header className="relative isolate flex flex-col gap-3 overflow-hidden rounded-2xl bg-deep-current p-6 text-wave-white">
        {/* 水域母题层：零布局高度（绝对定位 + z-underlay），落在深底之上、正文之下 */}
        <WaterSheen />
        <WaterTexture drift />
        <TideLine className="inset-x-6 bottom-0" />
        <h1 className="text-[2rem] font-bold leading-tight">{summary.songTitle}</h1>
        <p className="flex flex-wrap items-center gap-x-[16px] gap-y-[4px] text-[0.9375rem] leading-[1.6] text-on-dark-muted">
          <span>{progressLabel(summary)}</span>
          <span>
            {gapNotice(summary.missingSegmentIndexes) === null
              ? '全部段位都有人唱过'
              : gapNotice(summary.missingSegmentIndexes)}
          </span>
          <span>入海时间 {formatOccurredAt(summary.updatedAt)}</span>
        </p>
        {summary.seaZone === 'INCOMPLETE' ? (
          <p className="text-[0.9375rem] leading-[1.6] text-on-dark-muted">
            这支作品还有缺口。缺口是歌里固定的段位，成品里留成静音，不会被别人的段顶替。
          </p>
        ) : null}
      </header>

      <AsyncBoundary query={bottle}>
        {(detail) => {
          const live = detail.segments.filter((segment) => segment.deletedAt === null);
          const plan = planMonoSequentialMix({
            segments: live
              .filter((segment) => segment.durationMs !== null)
              .map((segment) => ({
                index: segment.index,
                durationMs: segment.durationMs ?? 0,
                audioUrl: segmentAudioUrl(segment.id),
                ownerCode: segment.ownerCode,
              })),
            totalSegments: detail.totalSegments,
          });

          return (
            <div className="flex flex-col gap-6">
              {(() => {
                const selected =
                  live.find((segment) => segment.id === selectedSegmentId) ?? live[0] ?? null;
                return (
                  <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
                    <div className="flex flex-col gap-3">
                      <RelayTimeline
                        segments={live}
                        totalSegments={detail.totalSegments}
                        missingSegmentIndexes={detail.missingSegmentIndexes}
                        selectedSegmentId={selected?.id ?? null}
                        onSelectSegment={setSelectedSegmentId}
                      />
                      <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[8px]">
                        <Button
                          variant="ghost"
                          className="h-[44px] min-h-[44px] px-[12px] text-[0.875rem]"
                          icon={<Icon name="ScrollText" size={16} />}
                          onClick={() => {
                            setMixOpen(true);
                          }}
                        >
                          混音导出计划
                        </Button>
                        <span className="text-[0.875rem] leading-[1.6] text-slate-current">
                          四段按序拼成纯人声版本，缺口留成静音。
                        </span>
                      </div>
                    </div>

                    <div
                      className="order-first flex flex-col gap-3 xl:order-none"
                      data-anchor="sea-play"
                    >
                      <h2
                        id="sea-playback-heading"
                        className="text-[1.0625rem] font-semibold text-abyss"
                      >
                        试听与投票
                        <span className="ml-2 text-[0.875rem] font-normal text-slate-current">
                          {selected === null
                            ? '这一段还没有人唱'
                            : `第 ${String(selected.index)} 段（在左边点"听"换段）`}
                        </span>
                      </h2>
                      {selected === null ? (
                        <EmptyState
                          icon="AudioWaveform"
                          title="这一段还没有人唱"
                          description="缺口在成品里是静音，不会被别人的段顶替。"
                        />
                      ) : (
                        <VotableSegment
                          key={selected.id}
                          segment={{
                            id: selected.id,
                            index: selected.index,
                            ownerCode: selected.ownerCode,
                            durationMs: selected.durationMs,
                            likeCount: selected.likeCount,
                            dislikeCount: selected.dislikeCount,
                          }}
                          src={segmentAudioUrl(selected.id)}
                          bottleId={detail.id}
                          isOwnSegment={false}
                          myVote={myVotes[selected.id] ?? null}
                          onVoted={(segmentId, value) => {
                            setMyVotes((previous) => ({ ...previous, [segmentId]: value }));
                            setNote(value === 'LIKE' ? '已记录你的赞。' : '已记录你的点踩。');
                          }}
                          onListenShort={(message) => {
                            setListenShortReason(
                              message ?? '还没有听满这一段，继续听一会儿再点踩吧。',
                            );
                          }}
                          onFailed={setVoteError}
                        />
                      )}
                    </div>
                  </div>
                );
              })()}

              <Modal
                open={mixOpen}
                title="混音导出计划"
                onClose={() => {
                  setMixOpen(false);
                }}
              >
                <MixExportPanel plan={plan} />
              </Modal>

              <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[8px]">
                {/*
                  收藏与指定接唱**互斥**，判据全部来自服务端给的 `seaZone`：
                  完成品只能听（收藏它）；未完成作品可以「我来接这一段」（CONTEXT §6.2）。
                  摆错位置就是给用户一个必然 422 的按钮，所以这里不写"两个都摆"。
                */}
                {summary.seaZone === 'COMPLETED' ? <CollectButton bottleId={detail.id} className="h-[44px] min-h-[44px] px-[12px] text-[0.875rem]" /> : null}
                {summary.seaZone === 'INCOMPLETE' ? (
                  <TargetedSegmentButton bottleId={detail.id} className="h-[44px] min-h-[44px] px-[12px] text-[0.875rem]" />
                ) : null}
                <Button
                  variant="ghost"
                  className="h-[44px] min-h-[44px] px-[12px] text-[0.875rem]"
                  icon={<Icon name="Flag" size={16} />}
                  onClick={() => {
                    setReporting(true);
                  }}
                >
                  举报（进人工队列）
                </Button>
                {reporting ? (
                  <ReportDialog
                    open
                    targetType="BOTTLE"
                    targetId={detail.id}
                    onClose={() => {
                      setReporting(false);
                    }}
                  />
                ) : null}
              </div>

              <div className="flex flex-col gap-1 text-[0.875rem] leading-[1.6] text-slate-current">
                <Link to={`/bottles/${detail.id}/log`} className={TEXT_LINK}>
                  看这支作品的漂流日志
                </Link>
                <p>它从谁的手里开始，经过了哪些人，最后是谁送它入海。</p>
              </div>
            </div>
          );
        }}
      </AsyncBoundary>
    </div>
  );
}
