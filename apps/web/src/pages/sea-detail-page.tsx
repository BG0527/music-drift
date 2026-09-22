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
import { ApiError } from '../features/api/client';
import { MixExportPanel, SegmentPlayer } from '../features/audio';
import { EmptyState, Icon, Skeleton, Toast } from '../design-system';
import { AsyncBoundary } from './shell/async-boundary';
import { Link } from './shell/router';
import { TEXT_LINK, TEXT_LINK_STRONG } from './shell/link-styles';

export function SeaDetailPage({ id }: { id: string }) {
  const sea = useSeaBottle(id);
  const bottle = useBottle(id);
  const [note, setNote] = useState<string | null>(null);

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
    <div className="flex flex-col gap-6">
      {note === null ? null : <Toast tone="info" message={note} />}

      <nav aria-label="面包屑" className="flex flex-wrap items-center gap-3 text-[0.875rem]">
        <Link to="/sea" className="inline-flex min-h-11 items-center gap-2 text-peacock underline">
          <Icon name="ArrowLeft" size={16} />
          回公海大厅
        </Link>
        <span className="rounded-pill bg-tide-pool px-3 py-1 font-medium text-abyss">
          {summary.seaZone === 'INCOMPLETE' ? '等待接力' : '完整作品'}
        </span>
      </nav>

      <header className="flex flex-col gap-3 rounded-2xl bg-deep-current p-6 text-wave-white">
        <h1 className="text-[2rem] font-bold leading-tight">{summary.songTitle}</h1>
        <p className="text-[0.9375rem] leading-[1.6] text-on-dark-muted">
          {progressLabel(summary)}
          {gapNotice(summary.missingSegmentIndexes) === null
            ? ' · 全部段位都有人唱过'
            : ` · ${String(gapNotice(summary.missingSegmentIndexes))}`}
          {` · 入海时间 ${formatOccurredAt(summary.updatedAt)}`}
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
              <RelayTimeline
                segments={live}
                totalSegments={detail.totalSegments}
                missingSegmentIndexes={detail.missingSegmentIndexes}
              />

              <section className="flex flex-col gap-4" aria-labelledby="sea-playback-heading">
                <h2 id="sea-playback-heading" className="text-[1.0625rem] font-semibold text-abyss">
                  分段试听
                </h2>
                <div className="flex flex-col gap-4">
                  {live.map((segment) => (
                    <SegmentPlayer
                      key={segment.id}
                      src={segmentAudioUrl(segment.id)}
                      segmentIndex={segment.index}
                      durationMs={segment.durationMs}
                      ownerCode={segment.ownerCode}
                      onCastDislike={() => {
                        // 投票属次级特性（t12）：明确说明，而不是给一个点了没反应的按钮
                        setNote('点踩与点赞属于下一片切片：公海这一版只提供试听与成品导出。');
                      }}
                    />
                  ))}
                </div>
              </section>

              <MixExportPanel plan={plan} />

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
