/**
 * 沟槽时间轴 + 唱针（用户第 3 轮裁决，deploy-plan §17：把公海详情页顶部那条
 * 「类似进度条的东西」复刻进瓶子详情；公海详情页删除）。
 *
 * 与瓶身剖面（`features/bottle/relay-timeline`）的语义分工 —— 两者并存、不重复：
 * - **剖面**回答"哪些段录了、缺哪段"（水位 / 干格 / 瓶塞）；
 * - **本组件**回答"现在放到哪儿、这一段多长"：唱针 = 播放头（DESIGN.md「唱针 = 播放头」），
 *   跟随**真实播放进度**（`useSegmentPlayer` 的 timeupdate → 段内位置），
 *   段边界与段号来自服务端数据（`segments[].index` / `totalSegments` / `missingSegmentIndexes`）。
 *
 * 取值口径（impl-plan §5.5：精确值从设计稿 HTML 抄、颜色只用 token）：
 * - 沟槽带 92px、槽高 13px、槽列等分、右侧 20% 让位给唱臂（设计稿 `right:288px` 的响应式近似）；
 * - 槽壁：已录 `line/.38`、看不到的段 `line/.15`；槽芯条纹 = glass 78%/16%（3.4px 周期），
 *   隐藏段用 muted 17%/3% —— 颜色全部 token 化（`var(--color-*)` / `color-mix`），不写 hex；
 * - 缺口槽：两端虚线壁（`warm/.7`）+ 两个刀口（`warm/.8`）+ 暖色底洗（`warm/.05`），
 *   中间让出、槽内文案「这一段还没有人唱」；刻度行给「静音」（成品里缺口是静音）；
 * - 唱针簇：外壳 36×16（water-body→water-bed）、下三角唱针（paper/.72）、
 *   珊瑚针尖点 + 光晕、两圈落水涟漪（glass/.28、/.13）；唱臂 2px（paper/.26→.5）斜向右上轴承。
 *
 * 结构纪律：槽列与刻度都是 `<ol>`（DESIGN.md：时间轴用有序列表）；
 * 正在放的那一段用 `aria-current` 标出（不只靠唱针位置）；装饰（槽芯条纹 / 唱臂 / 唱针簇）全部 `aria-hidden`。
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { cn } from '../../design-system';
import { GroovePlaybackStore, GrooveStoreContext, useGroovePlayback } from './groove-playback';
import { formatClock } from './format';

/**
 * 播放进度 Provider（数据源在 `groove-playback.ts`：store 订阅只重渲染时间轴，
 * 不让 ~4Hz 的进度推进把整页重渲染一遍）。没包 Provider 的页面里，
 * 播放器的上报是 no-op —— 其它页面的 SegmentPlayer 用法不受影响。
 */
export function GroovePlaybackProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new GroovePlaybackStore());
  return <GrooveStoreContext.Provider value={store}>{children}</GrooveStoreContext.Provider>;
}

/* ── 时间轴本体 ─────────────────────────────────────────────────────────── */

export interface GrooveTimelineSegmentLike {
  /** 歌里的固定段落位置（1-based，服务端给的 `segment.index`）。 */
  index: number;
  durationMs: number | null;
}

export interface GrooveTimelineProps {
  /** 当前可见的段（服务端 DTO 子集）。 */
  segments: readonly GrooveTimelineSegmentLike[];
  /** 歌的分段数（来自数据，不写死 4）。 */
  totalSegments: number;
  missingSegmentIndexes: readonly number[];
  className?: string;
}

type SlotState = 'recorded' | 'gap' | 'hidden';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function GrooveTimeline({
  segments,
  totalSegments,
  missingSegmentIndexes,
  className,
}: GrooveTimelineProps) {
  const headingId = useId();
  const playback = useGroovePlayback();
  const slots = useMemo(() => {
    const byIndex = new Map(segments.map((segment) => [segment.index, segment]));
    const missing = new Set(missingSegmentIndexes);
    return Array.from({ length: Math.max(0, totalSegments) }, (_unused, offset) => {
      const index = offset + 1;
      const segment = byIndex.get(index);
      const state: SlotState =
        segment !== undefined ? 'recorded' : missing.has(index) ? 'gap' : 'hidden';
      return { index, state, durationMs: segment?.durationMs ?? null };
    });
  }, [missingSegmentIndexes, segments, totalSegments]);

  const count = slots.length;
  const playingIndex =
    playback.segmentIndex !== null &&
    playback.segmentIndex >= 1 &&
    playback.segmentIndex <= count
      ? playback.segmentIndex
      : null;
  const ratio = clamp01(playback.positionRatio);
  // 唱针位置（%）：前面整槽 + 槽内比例；槽列与唱针共用同一个坐标框
  const playheadPercent =
    playingIndex === null || count === 0
      ? null
      : Math.round((((playingIndex - 1) + ratio) / count) * 10000) / 100;
  // 唱臂终点（轴承在坐标框右侧之外，svg 开 overflow-visible 接过去）
  const armEndX = Math.min(playheadPercent ?? 0, 118);

  return (
    <section
      aria-labelledby={headingId}
      data-anchor="groove-timeline"
      className={cn('flex flex-col', className)}
    >
      <div className="flex flex-wrap items-baseline gap-x-[14px] gap-y-1">
        <h2 id={headingId} className="text-[1.0625rem] font-semibold leading-none text-paper">
          播放沟槽
        </h2>
        <span className="hidden text-[0.8125rem] leading-[1.6] text-muted lg:inline">
          唱针跟着播放走；一格 = 一个段位，缺口留成静音。
        </span>
      </div>

      {/* 沟槽带（设计稿 .band：92px，上下两条细线靠右淡出；桌面收到 64px —— 一屏门禁优先，窄屏仍是 92px）
          `.groove-rail` 是宿主页（bottle-page）压高度的挂点：1280×800 一屏收敛时桌面再收到 52px */}
      <div className="groove-rail relative mt-1 h-[92px] lg:h-[64px]">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-line/[0.13] to-transparent"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-line/[0.13] to-transparent"
        />

        {/*
          坐标框：槽列 / 刻度 / 唱针共用（桌面右侧 20% 让给唱臂与轴承，复刻设计稿
          `right:288px` 的构图；窄屏铺满，保证 375 不横向溢出）。
        */}
        <div className="absolute inset-y-0 left-0 right-0 lg:left-[5%] lg:right-[20%]">
          {/* 段位分隔刻线（设计稿 .sep：槽界 + 沟槽两端，1px、38px 高） */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-0">
            {slots.map((_slot, offset) => (
              <span
                key={offset}
                className="absolute top-1/2 h-[38px] w-px -translate-y-1/2 bg-line/[0.09]"
                style={{ left: `${count === 0 ? 0 : (offset / count) * 100}%` }}
              />
            ))}
            <span
              className="absolute top-1/2 h-[38px] w-px -translate-y-1/2 bg-line/[0.09]"
              style={{ left: '100%' }}
            />
          </span>

          <ol
            data-testid="groove-slots"
            className="absolute inset-x-0 top-1/2 flex h-[13px] -translate-y-1/2"
          >
            {slots.map((slot) => (
              <li
                key={slot.index}
                data-state={slot.state}
                className={cn(
                  'relative min-w-0 flex-1',
                  slot.state === 'recorded' && 'border-y border-line/[0.38]',
                  slot.state === 'hidden' && 'border-y border-line/[0.15]',
                )}
              >
                  {slot.state === 'recorded' ? (
                    /* 槽芯条纹：glass 近全亮（DESIGN：点亮的沟槽 = 已录段位，承担信息） */
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0"
                      style={{
                        backgroundImage:
                          'repeating-linear-gradient(90deg, color-mix(in srgb, var(--color-glass) 78%, transparent) 0 1px, color-mix(in srgb, var(--color-glass) 16%, transparent) 1px 3.4px)',
                      }}
                    />
                  ) : null}
                  {slot.state === 'hidden' ? (
                    /* 漂流中被裁掉、现在看不到的段位：暗条纹（不是缺口，不画虚线） */
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0"
                      style={{
                        backgroundImage:
                          'repeating-linear-gradient(90deg, color-mix(in srgb, var(--color-muted) 17%, transparent) 0 1px, color-mix(in srgb, var(--color-muted) 3%, transparent) 1px 3.4px)',
                      }}
                    />
                  ) : null}
                  {slot.state === 'gap' ? (
                    /* 缺口：槽壁被切断 —— 两端虚线头 + 两个刀口 + 暖色底洗，中间让出 */
                    <>
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-warm/[0.05]"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 left-0 w-[29%] border-y border-dashed border-warm/[0.7]"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 right-0 w-[29%] border-y border-dashed border-warm/[0.7]"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-warm/[0.8]"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 right-0 w-[2px] bg-warm/[0.8]"
                      />
                      {/* 槽内文案（窄屏放不下，由刻度行的「静音」承担同一信息） */}
                      <span className="pointer-events-none absolute inset-0 hidden items-center justify-center whitespace-nowrap text-[0.8125rem] text-warm lg:flex">
                        这一段还没有人唱
                      </span>
                    </>
                  ) : null}
              </li>
            ))}
          </ol>

          {/* 唱臂（装饰）：从唱针斜向右上的轴承；桌面构图，窄屏隐藏 */}
          {playheadPercent === null ? null : (
            <svg
              data-testid="groove-arm"
              aria-hidden="true"
              viewBox="0 0 100 92"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 hidden h-full w-full overflow-visible lg:block"
            >
              <defs>
                <linearGradient
                  id={`${headingId}-arm`}
                  gradientUnits="userSpaceOnUse"
                  x1={armEndX}
                  y1="40"
                  x2="122"
                  y2="26"
                >
                  <stop offset="0" stopColor="var(--color-paper)" stopOpacity="0.26" />
                  <stop offset="1" stopColor="var(--color-paper)" stopOpacity="0.5" />
                </linearGradient>
              </defs>
              <line
                x1={armEndX}
                y1="40"
                x2="122"
                y2="26"
                stroke={`url(#${headingId}-arm)`}
                strokeWidth="2"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}

          {/* 唱针（播放头）：位置 = (前面整槽 + 段内比例) / 槽总数 */}
          {playheadPercent === null ? null : (
            <div
              data-testid="groove-playhead"
              aria-hidden="true"
              className="absolute inset-y-0"
              style={{ left: `${playheadPercent}%` }}
            >
              {/* 落水涟漪（设计稿 .rip1/.rip2） */}
              <span
                className="pointer-events-none absolute left-0 h-[12px] w-[48px] -translate-x-1/2 rounded-full border border-glass/[0.28]"
                style={{ top: 'calc(50% + 22px)' }}
              />
              <span
                className="pointer-events-none absolute left-0 h-[16px] w-[76px] -translate-x-1/2 rounded-full border border-glass/[0.13]"
                style={{ top: 'calc(50% + 26px)' }}
              />
              {/* 唱头外壳（设计稿 .shell：36×16、水体→河床、冷光描边） */}
              <span
                className="pointer-events-none absolute left-0 h-[16px] w-[36px] -translate-x-1/2 rounded-base border border-water-deep/[0.34] bg-linear-to-b from-water-body to-water-bed"
                style={{ top: 'calc(50% - 13px)' }}
              />
              {/* 唱针（设计稿 .stylus：向下的等腰三角，扎进沟槽） */}
              <span
                className="pointer-events-none absolute left-0 h-0 w-0 -translate-x-1/2 border-x-[4.5px] border-x-transparent border-t-[14px] border-t-paper/[0.72]"
                style={{ top: 'calc(50% + 3px)' }}
              />
              {/* 针尖：珊瑚光晕 + 圆点（设计稿 .tip） */}
              <span
                className="pointer-events-none absolute left-0 h-[20px] w-[20px] -translate-x-1/2 rounded-full"
                style={{
                  top: 'calc(50% + 7px)',
                  backgroundImage:
                    'radial-gradient(circle, color-mix(in srgb, var(--color-coral) 40%, transparent), transparent 68%)',
                }}
              />
              <span
                className="pointer-events-none absolute left-0 h-[6px] w-[6px] -translate-x-1/2 rounded-full bg-coral"
                style={{ top: 'calc(50% + 14px)' }}
              />
            </div>
          )}
        </div>

        {/* 轴承（设计稿 .pivot：44px 双环 + 珊瑚轴心；桌面构图） */}
        {playheadPercent === null ? null : (
          <span
            aria-hidden="true"
            className="absolute right-[16px] top-[4px] hidden h-[44px] w-[44px] rounded-full border border-water-deep/[0.34] lg:block"
          >
            <span className="absolute left-1/2 top-1/2 h-[20px] w-[20px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-water-deep/[0.22]" />
            <span className="absolute left-1/2 top-1/2 h-[8px] w-[8px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-glass/[0.6]" />
          </span>
        )}
      </div>

      {/* 刻度行：段号与时长来自真实数据（缺口 = 静音；时长缺失不编造）
          一屏门禁（§46.3）：桌面折叠（lg:hidden，整页高度让位）；窄屏保留段号与静音标注 */}
      <ol
        data-testid="groove-marks"
        className="mt-1 grid lg:hidden lg:ml-[5%] lg:mr-[20%]"
        style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      >
        {slots.map((slot) => {
          const isPlaying = playingIndex === slot.index;
          return (
            <li
              key={slot.index}
              data-state={slot.state}
              {...(isPlaying ? { 'aria-current': 'step' as const } : {})}
              className="min-w-0 px-[6px]"
            >
              <span className="flex flex-wrap items-baseline gap-x-[10px] gap-y-[2px]">
                <span className="font-latin text-[0.6875rem] tracking-[0.24em] text-paper/50">
                  第 {slot.index} 段
                </span>
                <span
                  className={cn(
                    'font-latin text-[0.8125rem]',
                    slot.state === 'gap' ? 'text-warm' : 'text-muted',
                  )}
                >
                  {slot.state === 'gap'
                    ? '静音'
                    : slot.durationMs === null
                      ? '--:--'
                      : formatClock(slot.durationMs)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
