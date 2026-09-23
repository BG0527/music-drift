/**
 * 接力时间轴（DESIGN.md §Components「接力时间轴」）：竖向河道线 + 节点圆点。
 *
 * **缺口是显式节点，不是"少一行"**：段号 1..totalSegments 每个位置都有一个节点，
 * 没有有效段的位置渲染成"缺第 N 段"（虚线 + 中性色）。这样斩浪之后的作品不会被误看成完整，
 * 也解释了"成品里这段时间为什么是静音"（与混音侧同语义）。
 *
 * ## 一屏装下（§46.3）逼出来的两条
 *
 * 1. **一行一条**：段号 / 代号 / 时长在同一行，操作（听、举报）放在行尾用 32px 图标按钮。
 *    原来每段占三行（信息行 + 附言 + 单起一行的 44px 举报按钮），4 段就要 480px；
 * 2. **它同时是"选段器"**：界面上只放一个播放器，放哪一段由这里决定
 *    （`selectedSegmentId` / `onSelectSegment`）。不给这两个 prop 时它就只是展示，
 *    **不会渲染出点了没用的"听一段"**。
 */
import { formatClock } from '../audio';
import { Button, Icon, cn } from '../../design-system';
import { gapNotice } from './relay-status';

export interface TimelineSegmentLike {
  id: string;
  index: number;
  ownerCode: string;
  note: string | null;
  durationMs: number | null;
  deletedAt: string | null;
  /**
   * 该段的赞/踩数（`SegmentSchema.likeCount/dislikeCount`，**服务端已聚合**）。
   * 可选是因为历史调用点不必都传；但只要有段，页面就会把服务端给的值传进来 ——
   * 这里**不做任何推算**（缺口行没有段，自然就没有计数）。
   */
  likeCount?: number | undefined;
  dislikeCount?: number | undefined;
}

export interface RelayTimelineProps {
  segments: readonly TimelineSegmentLike[];
  /** 歌的分段数（来自数据，不写死 4）。 */
  totalSegments: number;
  missingSegmentIndexes: readonly number[];
  /** 段级举报入口（CONTEXT §8：瓶子 / 唱段 / 留言三类对象都要有入口）。 */
  onReportSegment?: ((segmentId: string, index: number) => void) | undefined;
  /** 当前正在放的那一段（`null` = 还没选）。 */
  selectedSegmentId?: string | null | undefined;
  /** 选段试听：给了它才渲染「听第 N 段」。 */
  onSelectSegment?: ((segmentId: string) => void) | undefined;
  className?: string;
}

export function RelayTimeline({
  segments,
  totalSegments,
  missingSegmentIndexes,
  onReportSegment,
  selectedSegmentId = null,
  onSelectSegment,
  className,
}: RelayTimelineProps) {
  const live = segments.filter((segment) => segment.deletedAt === null);
  const byIndex = new Map(live.map((segment) => [segment.index, segment]));
  const positions = Array.from({ length: totalSegments }, (_unused, offset) => offset + 1);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
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
          const isSelected = segment !== undefined && segment.id === selectedSegmentId;
          return (
            <li
              key={index}
              data-state={segment === undefined ? 'gap' : 'filled'}
              className="relative flex gap-3 py-[6px]"
            >
              {/* 河道线 + 节点（装饰，不承载语义） */}
              <span aria-hidden="true" className="relative flex w-4 shrink-0 justify-center">
                <span
                  className={cn(
                    'w-[2px] flex-1',
                    segment === undefined ? 'bg-mist' : 'bg-peacock',
                    isLast ? 'opacity-0' : '',
                  )}
                />
                <span
                  className={cn(
                    'absolute top-4 h-3 w-3 rounded-full',
                    segment === undefined ? 'border border-mist bg-wave-white' : 'bg-peacock',
                  )}
                />
              </span>

              <div
                className={cn(
                  'flex min-w-0 flex-1 flex-wrap items-center gap-x-[12px] gap-y-[4px] rounded-base border px-4 py-[8px]',
                  segment === undefined
                    ? 'border-dashed border-mist bg-transparent text-slate-current'
                    : 'border-mist bg-foam',
                  // 选中态：边框 + 字重（不只靠颜色表达）
                  isSelected ? 'border-peacock bg-info-tint' : '',
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon name={segment === undefined ? 'CircleDashed' : 'Music'} size={16} />
                  <span
                    className={cn(
                      'text-[0.9375rem] text-abyss',
                      isSelected ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    {segment === undefined ? `缺第 ${String(index)} 段` : `第 ${String(index)} 段`}
                  </span>
                </span>

                {segment === undefined ? (
                  <span className="text-[0.875rem] text-slate-current">
                    空着，成品里留成静音，不会被顶替
                  </span>
                ) : (
                  <>
                    <span className="text-[0.875rem] text-slate-current">{segment.ownerCode}</span>
                    <span
                      className="text-[0.875rem] text-slate-current"
                      style={{ fontFamily: 'var(--font-latin)' }}
                    >
                      {segment.durationMs === null ? '--:--' : formatClock(segment.durationMs)}
                    </span>
                    {segment.note === null ? null : (
                      <span className="min-w-0 flex-1 truncate text-[0.875rem] text-slate-current">
                        {segment.note}
                      </span>
                    )}
                    {/*
                      每段的票数：**有段就显示**（含 0），值直接来自服务端聚合的
                      `SegmentSchema.likeCount/dislikeCount`，行内不相加、不推算。
                      缺口行没有段，所以那一行不会出现票数。
                    */}
                    {segment.likeCount === undefined &&
                    segment.dislikeCount === undefined ? null : (
                      <span className="flex items-center gap-[12px] text-[0.8125rem] text-slate-current">
                        <span className="flex items-center gap-1">
                          <Icon name="ThumbsUp" size={16} />
                          <span>赞 {segment.likeCount ?? 0}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Icon name="ThumbsDown" size={16} />
                          <span>踩 {segment.dislikeCount ?? 0}</span>
                        </span>
                      </span>
                    )}
                  </>
                )}

                <span className="ml-auto flex items-center gap-[6px]">
                  {segment !== undefined && onSelectSegment !== undefined ? (
                    <Button
                      variant="ghost"
                      aria-label={`听第 ${String(index)} 段`}
                      aria-current={isSelected ? 'true' : undefined}
                      className={cn(
                        'h-[32px] min-h-[32px] gap-[6px] rounded-pill px-[12px] text-[0.8125rem]',
                        isSelected ? 'border-peacock text-peacock' : '',
                      )}
                      icon={<Icon name={isSelected ? 'Pause' : 'Play'} size={16} />}
                      onClick={() => {
                        onSelectSegment(segment.id);
                      }}
                    >
                      <span className="whitespace-nowrap">{isSelected ? '正在听' : '听'}</span>
                    </Button>
                  ) : null}
                  {segment !== undefined && onReportSegment !== undefined ? (
                    <Button
                      variant="ghost"
                      aria-label={`举报第 ${String(index)} 段`}
                      title="举报这一段（进人工队列）"
                      className="h-[32px] min-h-[32px] rounded-pill px-[10px]"
                      icon={<Icon name="Flag" size={16} />}
                      onClick={() => {
                        onReportSegment(segment.id, segment.index);
                      }}
                    >
                      <span className="sr-only">举报第 {String(index)} 段</span>
                    </Button>
                  ) : null}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
