/**
 * 接力唱段链 = **横躺的玻璃瓶剖面**（record-v1 的 `/bottles/:id` 装置）。
 *
 * 装置说的事（实施计划 §5.1「必须存活的装置」）：
 * - **瓶内水位 = 已录段数**：这一段有人唱过 ⇒ 这一格里有水；
 * - **干格 = 缺口**：歌里固定的段位，成品里留成静音，不会被别人的段顶替（不把后面的段前移）；
 * - **漂着的瓶塞 = 有人持有**：持有状态由页面把服务端的 `status` 交进来，组件不自己猜。
 *
 * 两条结构纪律：
 * 1. **一个段位 = 一个 `<li>`**（段号 1..totalSegments 全都在），所以"缺口"是**显式的一格**，
 *    不是"少一行"——斩浪之后的作品不会被误看成完整；
 * 2. **它同时是"选段器"**：界面上只放一个播放器，放哪一段由这里决定
 *    （`selectedSegmentId` / `onSelectSegment`）。不给这两个 prop 时它就只是展示，
 *    **不会渲染出点了没用的"听一段"**（不制造假控件）。
 *
 * 响应式（375 也要读得出来）：水与干格是**每一格自己的**，所以
 * 桌面（4 格并排）读成"横躺的瓶里水位到第 N 段"，窄屏（4 格竖排）读成
 * "同一只瓶子立起来，水只到第 N 格"——两种朝向都保留"水 / 干格"两个可读信号。
 */
import type { BottleStatus } from '@music-drift/shared';
import { formatClock } from '../audio';
import { Icon, cn } from '../../design-system';
import { BOTTLE_STATUS_LABEL, gapNotice } from './relay-status';

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
  /**
   * 瓶子状态（服务端 `BottleDetail.status`）。
   * **只用来决定瓶塞在不在瓶口**：`HELD` ⇒ 有人持有 ⇒ 画瓶塞 + 「瓶塞 · 有人持有」。
   * 别的状态一律不画瓶塞（宁可不画，也不编一个"瓶子状态"出来）。
   */
  status?: BottleStatus | undefined;
  className?: string;
}

/* ── 装置的三个数值（都写死在类名里，Tailwind 才扫得到；改它们要连着看剖面截图）──
   ① 水带高度 = 格子下缘的 55%：水线落在"代号"那一行下面（与设计稿剖面一致）；
   ② 水位读数 = 最高的已录段位（"水只到第 N 段"）；缺口格**没有水带**（干格 ⇒ 缺口可读）；
   ③ 瓶口在右侧 15%（段位格 `md:mr-[15%]`），瓶塞就画在那段空白里。 */

export function RelayTimeline({
  segments,
  totalSegments,
  missingSegmentIndexes,
  onReportSegment,
  selectedSegmentId = null,
  onSelectSegment,
  status,
  className,
}: RelayTimelineProps) {
  const live = segments.filter((segment) => segment.deletedAt === null);
  const byIndex = new Map(live.map((segment) => [segment.index, segment]));
  const positions = Array.from({ length: totalSegments }, (_unused, offset) => offset + 1);
  /** 水位读数：最高的**已录**段位（水"只到"那里；中间的缺口仍然读得出来是干格）。 */
  const highestFilled = live.reduce((highest, segment) => Math.max(highest, segment.index), 0);
  const waterText =
    live.length === 0 ? '还没有人唱过' : `水只到第 ${String(highestFilled)} 段`;
  /** 段位格数由数据决定 ⇒ 横向铺开用 flex（每个格子等分），不写死列数。 */

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <h2 className="text-[1.0625rem] font-semibold text-paper">
        接力唱段链
        <span className="ml-2 text-[0.875rem] font-normal text-muted">
          {gapNotice(missingSegmentIndexes) ?? '每个段位都有人唱过'}
        </span>
      </h2>

      <div className="relative flex flex-col" data-testid="bottle-body">
        <p
          data-testid="bottle-water-level"
          className="mb-[6px] text-[0.6875rem] leading-[1.5] tracking-[0.24em] text-muted"
          style={{ fontFamily: 'var(--font-latin)' }}
        >
          瓶身剖面 · {waterText}
        </p>

        <div className="relative isolate">
          {/* 桌面：**横躺的玻璃瓶**（瓶口在右、瓶底在左）。纯装饰，不参与布局高度。 */}
          <svg
            aria-hidden="true"
            viewBox="0 0 1000 300"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 hidden h-full w-full md:block"
          >
            <path
              d="M 150 10 H 820 V 112 H 978 V 188 H 820 V 290 H 150 A 140 140 0 0 1 150 10 Z"
              fill="var(--color-water-deep)"
              fillOpacity="0.02"
              stroke="var(--color-line)"
              strokeOpacity="0.38"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
            {/* 河道水面：只在瓶口那一段画（瓶身里的水线由每个段位格自己的水带给出，y 对齐水带高度 55%） */}
            <line
              x1="820"
              y1="135"
              x2="1000"
              y2="135"
              stroke="var(--color-line)"
              strokeOpacity="0.25"
              strokeDasharray="5 5"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
            {/* 水面引线（把「河道水面」这四个字接到水线上） */}
            <line
              x1="930"
              y1="58"
              x2="930"
              y2="135"
              stroke="var(--color-muted)"
              strokeOpacity="0.34"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* 窄屏：**同一只瓶子立起来**（瓶口在上）。4 格竖排，水带一样在每格下方。 */}
          <svg
            aria-hidden="true"
            viewBox="0 0 300 1000"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full md:hidden"
          >
            <path
              d="M 118 8 H 182 V 92 H 262 V 906 Q 262 944 226 944 H 74 Q 38 944 38 906 V 92 H 118 Z"
              fill="var(--color-water-deep)"
              fillOpacity="0.02"
              stroke="var(--color-line)"
              strokeOpacity="0.38"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <ol
            className="relative flex flex-col gap-[10px] px-[10px] py-[12px] md:mr-[15%] md:flex-row md:gap-0 md:px-[16px]"
            data-testid="relay-timeline"
          >
            {positions.map((index) => {
              const segment = byIndex.get(index);
              const isSelected = segment !== undefined && segment.id === selectedSegmentId;
              return (
                <li
                  key={index}
                  data-state={segment === undefined ? 'gap' : 'filled'}
                  data-filled={segment === undefined ? 'false' : 'true'}
                  className={cn(
                    'relative flex min-w-0 flex-col gap-[6px] px-[12px] py-[10px]',
                    'md:flex-1 md:basis-0 md:border-r md:border-line/12 md:last:border-r-0',
                  )}
                >
                  {segment === undefined ? (
                    /* 干格 = 缺口：虚线框里没有水 */
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-[6px] inset-y-[6px] rounded-md border border-dashed border-line/20"
                    />
                  ) : (
                    /* 瓶里的水：这一段有人唱过（水位 = 已录段数） */
                    <>
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-water-body/60"
                      />
                      <span
                        aria-hidden="true"
                        className={cn(
                          'pointer-events-none absolute inset-x-0 bottom-[55%] border-t',
                          isSelected ? 'border-coral' : 'border-line/25',
                        )}
                      />
                    </>
                  )}

                  <div className="relative z-10 flex flex-col gap-[6px]">
                    {/* 段位刻度：大号虚字（只有位置，不抢正文）+ 「第 N 段」标签 */}
                    <span
                      aria-hidden="true"
                      className="text-[1.75rem] leading-none text-paper/20"
                      style={{ fontFamily: 'var(--font-latin)' }}
                    >
                      {index}
                    </span>
                    <span
                      className={cn(
                        'text-[0.6875rem] tracking-[0.24em]',
                        segment === undefined
                          ? 'text-warm'
                          : isSelected
                            ? 'text-coral'
                            : 'text-muted',
                      )}
                      style={{ fontFamily: 'var(--font-latin)' }}
                    >
                      {segment === undefined
                        ? `缺第 ${String(index)} 段`
                        : `第 ${String(index)} 段`}
                    </span>

                    {segment === undefined ? (
                      <>
                        <span className="text-[0.6875rem] tracking-[0.24em] text-warm">缺口</span>
                        <span className="text-[0.8125rem] leading-[1.5] text-muted">
                          空着，成品里留成静音，不会被顶替
                        </span>
                      </>
                    ) : (
                      <>
                        {/* 这一段的声音：一条声槽（时长以服务端为准） */}
                        <span className="flex h-[26px] w-fit max-w-full items-center gap-[6px] rounded-md border border-water-mid/50 bg-water-mid/10 px-[10px] text-[0.75rem] text-water-light">
                          <Icon name="AudioWaveform" size={16} className="shrink-0" />
                          <span
                            className="whitespace-nowrap"
                            style={{ fontFamily: 'var(--font-latin)' }}
                          >
                            {segment.durationMs === null ? '--:--' : formatClock(segment.durationMs)}
                          </span>
                        </span>
                        <span className="text-[0.875rem] text-muted">{segment.ownerCode}</span>
                        {segment.note === null ? null : (
                          <span className="min-w-0 truncate text-[0.8125rem] text-muted">
                            {segment.note}
                          </span>
                        )}
                        {/*
                          每段的票数：**有段就显示**（含 0），值直接来自服务端聚合的
                          `SegmentSchema.likeCount/dislikeCount`，行内不相加、不推算。
                          缺口格没有段，所以那一格不会出现票数。
                        */}
                        {segment.likeCount === undefined &&
                        segment.dislikeCount === undefined ? null : (
                          <span className="flex items-center gap-[12px] text-[0.8125rem] text-muted">
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

                    <div className="flex flex-wrap items-center gap-[8px]">
                      {segment !== undefined && onSelectSegment !== undefined ? (
                        <button
                          type="button"
                          aria-label={`听第 ${String(index)} 段`}
                          {...(isSelected ? { 'aria-current': 'true' as const } : {})}
                          className={cn(
                            'inline-flex min-h-11 items-center gap-[6px] rounded-base border px-[12px] text-[0.8125rem]',
                            'transition-transform duration-200 ease-out hover:scale-[var(--motion-hover-scale)]',
                            isSelected
                              ? 'border-coral text-coral'
                              : 'border-line/25 text-muted hover:text-paper',
                          )}
                          onClick={() => {
                            onSelectSegment(segment.id);
                          }}
                        >
                          <Icon name={isSelected ? 'Pause' : 'Play'} size={16} />
                          <span className="whitespace-nowrap">
                            {isSelected ? '正在听' : '听'}
                          </span>
                        </button>
                      ) : null}
                      {segment !== undefined && onReportSegment !== undefined ? (
                        <button
                          type="button"
                          aria-label={`举报第 ${String(index)} 段`}
                          title="举报这一段（进人工队列）"
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-base border border-line/20 text-muted transition-colors duration-200 ease-out hover:text-paper"
                          onClick={() => {
                            onReportSegment(segment.id, segment.index);
                          }}
                        >
                          <Icon name="Flag" size={16} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* 河道水面：一句话把水线交代清楚（装饰性导引，真正的水位读数在上面那行） */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-[16%] hidden text-[0.6875rem] tracking-[0.18em] text-muted/80 md:block"
          style={{ fontFamily: 'var(--font-latin)' }}
        >
          河道水面
        </span>

        {/* 瓶塞在瓶口 = 有人持有（状态来自服务端；不在任何人手上时这一行不出现） */}
        {status === 'HELD' ? (
          <>
            <svg
              aria-hidden="true"
              viewBox="0 0 40 60"
              preserveAspectRatio="none"
              className="pointer-events-none absolute right-0 top-[30%] hidden h-[40%] w-[9%] md:block"
            >
              <rect x="0" y="8" width="34" height="44" rx="10" fill="var(--color-warm)" fillOpacity="0.85" />
            </svg>
            <svg
              aria-hidden="true"
              viewBox="0 0 76 26"
              preserveAspectRatio="none"
              className="pointer-events-none absolute left-[39%] top-[-4px] h-[26px] w-[22%] md:hidden"
            >
              <rect x="0" y="0" width="76" height="26" rx="12" fill="var(--color-warm)" fillOpacity="0.85" />
            </svg>
            <span
              data-testid="bottle-cork"
              className="mt-[6px] text-[0.6875rem] leading-[1.5] tracking-[0.24em] text-warm md:absolute md:right-0 md:top-[74%] md:mt-0"
              style={{ fontFamily: 'var(--font-latin)' }}
            >
              瓶塞 · {BOTTLE_STATUS_LABEL[status]}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
