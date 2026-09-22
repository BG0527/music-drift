/**
 * 段落时间轴（接力路径的可视化）。
 *
 * 语义必须与 ADR-015 对齐：
 * - 段号 = 歌里的**固定位置** 1..totalSegments，**永不压缩**；
 * - 斩浪留下的位置是**缺口**（`gap`），要有独立文案，不能伪装成"已完成"、也不能让后面的段前移；
 * - 只显示结构性信息（第几段 / 时长 / 状态 / 已听比例），**不显示歌词正文**（版权约束）。
 *
 * 结构：`<ol>` + `<li aria-current>`（DESIGN.md：时间轴用有序列表、用 aria-live 播报状态变化）。
 */
import { RiverLine, cn } from '../../design-system';
import { formatClock } from './format';

export type TimelineSegmentState = 'done' | 'gap' | 'pending' | 'recording';

export interface TimelineSegment {
  /** 歌里的固定段落位置（1-based）。 */
  index: number;
  durationMs?: number | null;
  state?: TimelineSegmentState;
  /** 该段已被当前用户听过的比例（0..1）；用于"听满 80% 才能点踩"的可见进度。 */
  listenedRatio?: number | null;
}

export interface SegmentTimelineProps {
  segments: TimelineSegment[];
  /** 当前所在段号（高亮 + `aria-current="step"`）。 */
  currentIndex?: number;
  className?: string;
}

const STATE_LABEL: Record<TimelineSegmentState, string> = {
  done: '已录',
  gap: '缺口（位置保留，等待补位）',
  pending: '等待接唱',
  recording: '录制中',
};

const STATE_COLOR: Record<TimelineSegmentState, string> = {
  done: 'bg-peacock',
  gap: 'bg-coral',
  pending: 'bg-mist',
  recording: 'bg-lagoon',
};

export function SegmentTimeline({ segments, currentIndex, className }: SegmentTimelineProps) {
  const done = segments.filter((segment) => segment.state === 'done').length;

  return (
    <div className={cn('relative flex gap-4', className)}>
      {/* 河道导引线：装饰，不参与读屏 */}
      <RiverLine
        progress={segments.length === 0 ? 0 : done / segments.length}
        className="h-auto shrink-0"
      />
      <ol className="flex w-full flex-col gap-3">
        {segments.map((segment) => {
          const state: TimelineSegmentState = segment.state ?? 'pending';
          const isCurrent = currentIndex === segment.index;
          return (
            <li
              key={segment.index}
              {...(isCurrent ? { 'aria-current': 'step' as const } : {})}
              className={cn(
                'flex flex-wrap items-center gap-3 rounded-base border px-4 py-3 text-[0.9375rem]',
                isCurrent ? 'border-peacock bg-info-tint' : 'border-mist bg-foam',
              )}
            >
              <span aria-hidden="true" className={cn('h-3 w-3 rounded-full', STATE_COLOR[state])} />
              <span className="font-semibold text-abyss">第 {segment.index} 段</span>
              {/* DESIGN.md：段位时长用 Quattrocento 数字（引用既有字体 token） */}
              <span
                className="text-[0.875rem] text-slate-current"
                style={{ fontFamily: 'var(--font-latin)' }}
              >
                {typeof segment.durationMs === 'number' && segment.durationMs > 0
                  ? formatClock(segment.durationMs)
                  : '--:--'}
              </span>
              <span className="text-[0.875rem] text-slate-current">{STATE_LABEL[state]}</span>
              {typeof segment.listenedRatio === 'number' ? (
                <span className="text-[0.875rem] text-slate-current">
                  已听 {Math.round(segment.listenedRatio * 100)}%
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
