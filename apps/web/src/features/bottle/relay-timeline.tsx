/**
 * 瓶身剖面（`site/bottle.html` 的四格标注，t17 深度复刻返工）。
 *
 * 参考构图（patches/bottle.css 头注：场景与标注整块按 --u 缩放）——
 * 装置不是"每格一张卡片"，而是**挂在瓶身剖面刻度上的一列列标注**：
 *   段号 `.segNum`（320·u）→ 段名 `.segLab`（356·u）→ 段位卡 `.cap`（458·u：代号 / 时长·赞踩 / 听）
 * 缺口列只有段号+段名（暖色 `gap`），缺口簇 `.gapBox` 长在**服务端给的那一格**里
 * （`missingSegmentIndexes[0]`，402·u）—— 不可录的观看者也看得到它（参考常驻：说明为什么录不了）。
 *
 * 水位与纸卷在场景 SVG 里（`BottleScene`）：**只画到从第 1 段起连续录满的前沿** ——
 * 中间有缺口时后面的水不凭空盖过去（参考 `waterFrontIndex()` 同款）。
 *
 * 两条结构纪律（沿用）：
 * 1. **一个段位 = 一个 `<li>`**（段号 1..totalSegments 全在）⇒ 缺口是显式的一格，不是"少一行"；
 * 2. **它同时是选段器**：给 `onSelectSegment` 才渲染「听」（不制造假控件），选中态 `aria-current` 表达。
 *
 * 响应式：≥1024 按参考坐标绝对落位（坐标在 `pages/bottle-page.css`）；<1024 退回流式竖排（同一套 DOM）。
 */
import type { CSSProperties, ReactNode } from 'react';
import type { BottleStatus } from '@music-drift/shared';
import { formatClock } from '../audio';
import { Icon, cn } from '../../design-system';
import { BottleScene } from './bottle-scene';

export interface TimelineSegmentLike {
  id: string;
  index: number;
  ownerCode: string;
  note: string | null;
  durationMs: number | null;
  deletedAt: string | null;
  /** 赞/踩（服务端聚合；缺口没有段，自然没有计数）。 */
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
  /** 瓶子状态（服务端）：只决定瓶塞在不在（HELD ⇒ 画瓶塞 + 图注）。 */
  status?: BottleStatus | undefined;
  /**
   * 缺口簇的说明（页面按服务端事实给参考文案：
   * 可录 = "接唱只能唱这一段…"、不可录 = "这一段只有发起者（尚未投河时）或当前持有者能录…"）。
   */
  gapNote?: string | null | undefined;
  /** 缺口簇 CTA（可录时 = 页面的「录第 N 段」按钮；不可录 = 不给，参考只留说明）。 */
  gapAction?: ReactNode | null | undefined;
  className?: string;
}

/** 设计画布宽（`svg.scene` viewBox = 1440×900）：设计 x → 百分比。 */
const DESIGN_WIDTH = 1440;
const PROFILE_LEFT = 76;
const PROFILE_RIGHT = 1000;

function cellSlot(index: number, total: number): { left: number; width: number } {
  const width = (PROFILE_RIGHT - PROFILE_LEFT) / total;
  return { left: PROFILE_LEFT + (index - 1) * width, width };
}

/** 设计 x → 百分比（与参考 `pct()` 同一入口）。 */
function pct(designX: number): string {
  return `${((designX / DESIGN_WIDTH) * 100).toFixed(4)}%`;
}

export function RelayTimeline({
  segments,
  totalSegments,
  missingSegmentIndexes,
  onReportSegment,
  selectedSegmentId = null,
  onSelectSegment,
  status,
  gapNote = null,
  gapAction = null,
  className,
}: RelayTimelineProps) {
  const live = segments.filter((segment) => segment.deletedAt === null);
  const byIndex = new Map(live.map((segment) => [segment.index, segment]));
  const count = Math.max(1, totalSegments);
  const positions = Array.from({ length: totalSegments }, (_unused, offset) => offset + 1);
  /** 水位＝从第 1 段起连续录满的段数（参考 `waterFrontIndex()`：缺口之后的水面不凭空盖过去）。 */
  let waterFront = 0;
  while (waterFront < totalSegments && byIndex.has(waterFront + 1)) waterFront += 1;
  const waterText = live.length === 0 ? '水还没进来' : `水只到第 ${waterFront} 段`;
  const selected = live.find((segment) => segment.id === selectedSegmentId) ?? null;
  /** 缺口簇长在服务端给的那一格（下一次会录的段号）；没有缺口就没有缺口簇。 */
  const gapIndex = missingSegmentIndexes[0];
  const gapSlot = gapIndex === undefined ? null : cellSlot(gapIndex, count);
  const canRecord = gapAction !== null && gapAction !== undefined;

  return (
    <div
      data-testid="bottle-body"
      className={cn('bp-profile', className)}
      data-water-front={waterFront}
    >
      {/* 图注（稿 .heroLab）：水位读数只认"连续录满" */}
      <p data-testid="bottle-water-level" className="heroLab meta">
        瓶身剖面 · {waterText}
      </p>

      {/* 场景：玻璃瓶 / 水 / 纸卷 / 格位（纯装饰，零高度） */}
      <BottleScene totalSegments={count} waterFront={waterFront} showCork={status === 'HELD'} />

      {/* 四格标注（一个段位 = 一个 li；缺口是显式的一格） */}
      <ol data-testid="relay-timeline" className="bp-cells">
        {positions.map((index) => {
          const segment = byIndex.get(index);
          const dry = segment === undefined;
          const isSelected = segment !== undefined && segment.id === selectedSegmentId;
          const slot = cellSlot(index, count);
          return (
            <li
              key={index}
              data-state={dry ? 'gap' : 'filled'}
              data-filled={dry ? 'false' : 'true'}
              className={cn('bp-cell', dry && 'is-gap', isSelected && 'is-sel segment-pick')}
              style={
                {
                  '--cell-left': pct(slot.left),
                  '--cell-w': pct(slot.width),
                } as CSSProperties
              }
            >
              <span className={cn('segNum mono', dry && 'gap')} aria-hidden="true">
                {index}
              </span>
              <span className={cn('segLab meta', dry && 'gap', isSelected && 'sel')}>
                第 {index} 段
                {dry ? <span className="sr-only">（缺口）</span> : null}
              </span>

              {segment === undefined ? null : (
                <div className="cap">
                  <p className="code meta">{segment.ownerCode}</p>
                  <p className="line mono">
                    <span>{segment.durationMs === null ? '--:--' : formatClock(segment.durationMs)}</span>
                    <span>赞 {segment.likeCount ?? 0}</span>
                    <span>踩 {segment.dislikeCount ?? 0}</span>
                  </p>
                  <p className="capAct">
                    {onSelectSegment === undefined ? null : (
                      <button
                        type="button"
                        className="listen whitespace-nowrap"
                        aria-label={`听第 ${String(index)} 段`}
                        {...(isSelected ? { 'aria-current': 'true' as const } : {})}
                        onClick={() => {
                          onSelectSegment(segment.id);
                        }}
                      >
                        听
                      </button>
                    )}
                    {onReportSegment === undefined ? null : (
                      <button
                        type="button"
                        className="capReport"
                        aria-label={`举报第 ${String(index)} 段`}
                        title="举报这一段（进人工队列）"
                        onClick={() => {
                          onReportSegment(segment.id, segment.index);
                        }}
                      >
                        <Icon name="Flag" size={16} />
                      </button>
                    )}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* 缺口簇（稿 .gapBox）：缺口槽 + 「缺口」+ 标题 + CTA + 说明 —— 常驻在服务端给的那一格 */}
      {gapIndex === undefined || gapSlot === null ? null : (
        <div
          data-anchor="bottle-record"
          className="gapBox order-[-9999] lg:order-none"
          style={
            {
              '--gap-col': String(gapIndex),
              '--gap-left': pct(gapSlot.left + 10),
              '--gap-width': pct(gapSlot.width - 20),
            } as CSSProperties
          }
        >
          <span className="gapSlot" aria-hidden="true" />
          <p className="gapKind meta">缺口</p>
          <p className="gapHead">
            {canRecord ? `第 ${String(gapIndex)} 段由你开第一句` : `第 ${String(gapIndex)} 段还空着`}
          </p>
          {gapAction}
          {gapNote === null || gapNote === undefined ? null : <p className="gapNote">{gapNote}</p>}
        </div>
      )}

      {/* 正在试听的那一段：珊瑚刻度挂在该列的水位带上（稿 .selMark） */}
      {selected === null ? null : (
        <span
          className="selMark"
          aria-hidden="true"
          style={
            {
              '--sel-col': String(selected.index),
              '--sel-left': pct(cellSlot(selected.index, count).left + (cellSlot(selected.index, count).width - 60) / 2),
            } as CSSProperties
          }
        />
      )}

      {/* 图注：水面引线接到「河道水面」，瓶塞只在有人持有时挂图注 */}
      <span className="callout meta" aria-hidden="true">
        河道水面
      </span>
      {status === 'HELD' ? (
        <span data-testid="bottle-cork" className="corkLab meta">
          瓶塞 · 有人持有
        </span>
      ) : null}
    </div>
  );
}
