/**
 * 接力时间轴（DESIGN.md §Components「接力时间轴」）：竖向河道线 + 节点圆点。
 *
 * **缺口是显式节点，不是"少一行"**：段号 1..totalSegments 每个位置都有一个节点，
 * 没有有效段的位置渲染成"缺第 N 段"（虚线 + 中性色）。这样斩浪之后的作品不会被误看成完整，
 * 也解释了"成品里这段时间为什么是静音"（与混音侧同语义）。
 */
import { formatClock } from '../audio';
import { Icon, cn } from '../../design-system';
import { gapNotice } from './relay-status';

export interface TimelineSegmentLike {
  id: string;
  index: number;
  ownerCode: string;
  note: string | null;
  durationMs: number | null;
  deletedAt: string | null;
}

export interface RelayTimelineProps {
  segments: readonly TimelineSegmentLike[];
  /** 歌的分段数（来自数据，不写死 4）。 */
  totalSegments: number;
  missingSegmentIndexes: readonly number[];
  className?: string;
}

export function RelayTimeline({
  segments,
  totalSegments,
  missingSegmentIndexes,
  className,
}: RelayTimelineProps) {
  const live = segments.filter((segment) => segment.deletedAt === null);
  const byIndex = new Map(live.map((segment) => [segment.index, segment]));
  const positions = Array.from({ length: totalSegments }, (_unused, offset) => offset + 1);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <h2 className="text-[1.0625rem] font-semibold text-abyss">
        接力唱段链
        <span className="ml-2 text-[0.875rem] font-normal text-slate-current">
          {gapNotice(missingSegmentIndexes) ?? '每个段位都有人唱过'}
        </span>
      </h2>

      <ol className="flex flex-col" data-testid="relay-timeline">
        {positions.map((index, position) => {
          const segment = byIndex.get(index);
          const isLast = position === positions.length - 1;
          return (
            <li
              key={index}
              data-state={segment === undefined ? 'gap' : 'filled'}
              className="relative flex gap-4 pb-4"
            >
              {/* 河道线 + 节点（装饰，不承载语义） */}
              <span aria-hidden="true" className="relative flex w-4 shrink-0 justify-center">
                <span
                  className={cn(
                    'w-0.5 flex-1',
                    segment === undefined ? 'bg-mist' : 'bg-peacock',
                    isLast ? 'opacity-0' : '',
                  )}
                />
                <span
                  className={cn(
                    'absolute top-1 h-3 w-3 rounded-full',
                    segment === undefined ? 'border border-mist bg-wave-white' : 'bg-peacock',
                  )}
                />
              </span>

              <div
                className={cn(
                  'flex min-w-0 flex-1 flex-col gap-1 rounded-base border px-4 py-3',
                  segment === undefined
                    ? 'border-dashed border-mist bg-transparent text-slate-current'
                    : 'border-mist bg-foam',
                )}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Icon name={segment === undefined ? 'CircleDashed' : 'Music'} size={16} />
                  <span className="text-[0.9375rem] font-semibold text-abyss">
                    {segment === undefined ? `缺第 ${String(index)} 段` : `第 ${String(index)} 段`}
                  </span>
                  {segment === undefined ? (
                    <span className="text-[0.875rem] text-slate-current">
                      这个段位空着，成品里留成静音，不会被别人的段顶替
                    </span>
                  ) : (
                    <>
                      <span className="text-[0.875rem] text-slate-current">
                        {segment.ownerCode}
                      </span>
                      <span
                        className="text-[0.875rem] text-slate-current"
                        style={{ fontFamily: 'var(--font-latin)' }}
                      >
                        {segment.durationMs === null ? '--:--' : formatClock(segment.durationMs)}
                      </span>
                    </>
                  )}
                </div>
                {segment?.note === null || segment?.note === undefined ? null : (
                  <p className="text-[0.875rem] leading-[1.6] text-slate-current">{segment.note}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
