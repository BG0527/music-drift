/**
 * 段落时间轴（接力路径的可视化）—— record-v1 的**段链**形态。
 *
 * 语义必须与 ADR-015 对齐：
 * - 段号 = 歌里的**固定位置** 1..totalSegments，**永不压缩**；
 * - 斩浪留下的位置是**缺口**（`gap`），要有独立文案，不能伪装成"已完成"、也不能让后面的段前移；
 * - 只显示结构性信息（第几段 / 时长 / 状态 / 已听比例），**不显示歌词正文**（版权约束）。
 *
 * 形态（DESIGN.md §Components「段链（4 段）」）：**横向沟槽**，已唱段点亮，缺口是空槽 ——
 * 空槽画**虚线**（没有声音的地方），已录画实心冷光，当前段用唯一的强调色 coral 标出。
 * 于是"哪里缺人、缺的是第几段"既能读文字，也能一眼看出形状（不是只靠颜色）。
 *
 * 结构：`<ol>` + `<li aria-current>`（DESIGN.md：时间轴用有序列表、状态变化用 `aria-live` 播报）。
 * 窄屏（<640px）折成**单列**（一次只让人读一件事），桌面读成一排沟槽。
 */
import { cn } from '../../design-system';
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
  // 缺口是歌里**固定**的位置被斩浪留下：说清"这一格还没有人唱、位置不会被别人顶替"
  gap: '缺口（这一段还没有人唱，位置保留）',
  pending: '等待接唱',
  recording: '录制中',
};

/** 段位槽的形态：实心 = 有声音，虚线 = 空槽（缺口/等待）。 */
const SLOT: Record<TimelineSegmentState, string> = {
  done: 'bg-glass',
  gap: 'border border-dashed border-coral bg-transparent',
  pending: 'border border-dashed border-line/25 bg-transparent',
  recording: 'bg-coral',
};

export function SegmentTimeline({ segments, currentIndex, className }: SegmentTimelineProps) {
  const done = segments.filter((segment) => segment.state === 'done').length;
  const progress = segments.length === 0 ? 0 : done / segments.length;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/*
        沟槽导引（装饰，零信息重复）：一条横向沟槽 + 被点亮的比例。
        只动 transform（DESIGN.md：禁止动画 width/height），不做常驻动画（母题层零动效）。
      */}
      <div aria-hidden="true" className="h-px w-full overflow-hidden bg-line/10">
        <span
          className="block h-px origin-left bg-glass"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>

      <ol className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
        {segments.map((segment) => {
          const state: TimelineSegmentState = segment.state ?? 'pending';
          const isCurrent = currentIndex === segment.index;
          return (
            <li
              key={segment.index}
              {...(isCurrent ? { 'aria-current': 'step' as const } : {})}
              className={cn(
                'flex min-w-0 flex-1 flex-col gap-1 rounded-base border px-3 py-2 text-[0.9375rem] sm:min-w-[8rem]',
                isCurrent ? 'border-coral/60 bg-info-tint' : 'border-line/20 bg-ink/40',
              )}
            >
              <span
                aria-hidden="true"
                className={cn('block h-1.5 w-full rounded-sm', SLOT[state])}
              />
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold text-paper">第 {segment.index} 段</span>
                {/* DESIGN.md：段位时长用 Quattrocento 数字（引用字体 token，不内联字体名） */}
                <span className="font-latin text-[0.875rem] text-muted">
                  {typeof segment.durationMs === 'number' && segment.durationMs > 0
                    ? formatClock(segment.durationMs)
                    : '--:--'}
                </span>
              </span>
              <span className="text-[0.875rem] text-muted">{STATE_LABEL[state]}</span>
              {typeof segment.listenedRatio === 'number' ? (
                <span className="text-[0.875rem] text-muted">
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
