/**
 * 漂流日志（CONTEXT §9「追踪揭示」的 Demo 形态）—— record-v1 的装置是
 * **半沉螺旋刻痕**（实施计划 §5.1；参数照 `docs/ui-review/design-explore/p-driftlog-record.html`）。
 *
 * 装置说的事：
 * - **一笔 = 一条日志 = 一道刻痕**：`seq` 由服务端给，客户端不重排、不重新编号；
 * - 刻痕从圆心向外长（半径 52 → 176，弧间隔固定），**内圈最早、往外走就是往后走**；
 * - 刻痕的**长度＝这一笔的重量、色＝归处**（发起 / 接唱 / 投河 / 捞取 / 回传 / 完成 / 入海），
 *   图例只列这份日志里真的发生过的操作（凭空多一个就是编造业务事实）；
 * - **盘面是干的**：只有最新那一笔还湿着（弧下压着一道冷光水痕），它的末端滴下的水在盘边
 *   积成一小汪，**瓶子就停在那汪水里**。
 *
 * 两条原有纪律不变：
 * - **时间线以服务端为准**：按 `seq` 升序渲染，客户端不本地推算（`docs/api.md` §2.4）；
 * - **只给时间线**，不给内容可见性判断（私密留言的可见性在服务端，属 t12）。
 */
import { useBottle, useBottleEvents } from '../features/api/queries';
import { actorSourceOf, eventTimeline, type DriftLogEntry } from '../features/bottle/drift-events';
import { ConflictNotice } from '../features/bottle/conflict-notice';
import { BottleMark, Icon, Skeleton, WakeLine, cn } from '../design-system';
import { Link } from './shell/router';

/* ── 刻痕语法（长度＝权重、色＝归处；照设计稿的语法表）──────────────────────── */
interface CutSpec {
  /** 切口的长度（设计稿单位：44×30 的语法表里 11–30）。 */
  length: number;
  tone: string;
  /** 「完成」是**双刻线**（作品收口的那一笔）。 */
  double?: boolean;
}

const CUTS: Record<string, CutSpec> = {
  发起: { length: 26, tone: 'text-glass/95' },
  接唱: { length: 18, tone: 'text-paper/85' },
  投河: { length: 14, tone: 'text-glass/62' },
  捞取: { length: 11, tone: 'text-muted/62' },
  回传: { length: 21, tone: 'text-warm/90' },
  完成: { length: 20, tone: 'text-paper', double: true },
  入海: { length: 30, tone: 'text-coral' },
};

const DEFAULT_CUT: CutSpec = { length: 14, tone: 'text-muted' };

/** `发起：选定了这首歌` → `发起`（时间线、图例、刻痕共用同一个名字来源）。 */
function opName(label: string): string {
  return label.split('：')[0] ?? label;
}

function cutOf(label: string): CutSpec {
  return CUTS[opName(label)] ?? DEFAULT_CUT;
}

/** 刻痕线宽：最重的一笔（发起 / 入海）2.4，完成是两道 1.6 的双刻线，其余 1.8。 */
function cutWidth(cut: CutSpec): number {
  if (cut.double === true) return 1.6;
  return cut.length >= 26 ? 2.4 : 1.8;
}

/* ── 螺旋刻痕的几何（纯函数）─────────────────────────────────────────────
   半径从 52 长到 176，角度沿**逆时针**推进（最后一笔因此落在左下方）；
   每一笔占它那一步的 82%，于是刻痕之间留下固定的空隙。 */
const SCRATCH_CENTER = 200;
const SCRATCH_START_RADIUS = 52;
const SCRATCH_END_RADIUS = 176;
const SCRATCH_MAX_STEP = 150;
const SCRATCH_FILL = 0.82;

function polar(angleDeg: number, radius: number): { x: number; y: number } {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    x: SCRATCH_CENTER + radius * Math.cos(radians),
    y: SCRATCH_CENTER + radius * Math.sin(radians),
  };
}

interface Scratch {
  seq: number;
  d: string;
  /** 双刻线（完成）的第二道弧；没有就是 `null`。 */
  twinD: string | null;
  /** 编号挂在这一笔的中点上（与设计稿一致）。 */
  label: { x: number; y: number };
  /** 末端：水痕与那汪水都从它开始。 */
  end: { x: number; y: number };
  cut: CutSpec;
  wide: number;
  wet: boolean;
}

function arcPath(angleDeg: number, radius: number, spanDeg: number): string {
  const from = polar(angleDeg, radius);
  const to = polar(angleDeg - spanDeg, radius);
  return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(
    2,
  )} 0 ${spanDeg > 180 ? '1' : '0'} 0 ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
}

/** 把时间线折成螺旋：第 i 笔的角度与半径由 i / 笔数 决定（`seq` 只做标识与编号）。 */
function scratchesOf(timeline: readonly DriftLogEntry[]): Scratch[] {
  const total = timeline.length;
  const step = Math.min(SCRATCH_MAX_STEP, 520 / Math.max(1, total));
  return timeline.map((entry, index) => {
    const angle = -90 - index * step;
    const radius =
      total === 1
        ? SCRATCH_END_RADIUS
        : SCRATCH_START_RADIUS +
          ((SCRATCH_END_RADIUS - SCRATCH_START_RADIUS) * index) / (total - 1);
    const span = step * SCRATCH_FILL;
    const cut = cutOf(entry.label);
    return {
      seq: entry.seq,
      d: arcPath(angle, radius, span),
      twinD: cut.double === true ? arcPath(angle, radius + 4.5, span) : null,
      label: polar(angle - span / 2, radius + 12),
      end: polar(angle - span, radius),
      cut,
      wide: cutWidth(cut),
      wet: index === total - 1,
    };
  });
}

export function DriftLogPage({ id }: { id: string }) {
  const events = useBottleEvents(id);
  const bottle = useBottle(id);

  if (events.isPending || bottle.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton height="2.25rem" width="14rem" />
        <Skeleton height="6rem" width="100%" />
      </div>
    );
  }

  if (events.isError || bottle.isError) {
    return <ConflictNotice error={events.isError ? events.error : bottle.error} />;
  }

  const timeline = eventTimeline(events.data, actorSourceOf(bottle.data));
  const scratches = scratchesOf(timeline);
  const wet = scratches.at(-1) ?? null;
  /** 图例只列**这份日志里真的发生过**的操作。 */
  const operations = [...new Set(timeline.map((entry) => opName(entry.label)))];
  const spillX = wet?.end.x ?? SCRATCH_CENTER;
  const spillY = (wet?.end.y ?? SCRATCH_CENTER) + 4;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="面包屑" className="flex flex-wrap items-center gap-3 text-[0.875rem]">
        <Link
          to={`/bottles/${id}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-base border border-line/20 px-[12px] text-[0.8125rem] text-muted"
        >
          <Icon name="ArrowLeft" size={16} />
          回漂流瓶
        </Link>
        <span className="text-muted">漂流日志</span>
      </nav>

      <header className="relative flex flex-col gap-2 pb-[12px]">
        <p
          className="text-[0.6875rem] tracking-[0.24em] text-paper/50"
          style={{ fontFamily: 'var(--font-latin)' }}
        >
          SIDE A · 刻痕
        </p>
        <h1 className="text-[clamp(2rem,3.9vw,3.5rem)] font-bold leading-none tracking-[0.02em] text-paper">
          漂流日志
        </h1>
        <p className="max-w-[730px] text-[0.9375rem] leading-[1.85] text-muted">
          这里只记核心操作：发起、接唱、捞取、投河、回传、入海。操作者只显示匿名代号。
        </p>

        {/* 曲名 + 刻痕数（都来自服务端事实：曲名来自详情，刻痕数 = 这份日志的笔数） */}
        <div className="mt-[8px] flex flex-wrap items-baseline gap-x-[12px] md:absolute md:right-0 md:top-0 md:flex-col md:items-end md:gap-x-0 md:text-right">
          <span
            className="text-[0.6875rem] tracking-[0.24em] text-paper/50"
            style={{ fontFamily: 'var(--font-latin)' }}
          >
            曲名
          </span>
          <span className="text-[1.1875rem] font-bold text-paper">{bottle.data.songTitle}</span>
          <span
            className="text-[1.875rem] leading-none text-glass md:mt-[10px]"
            style={{ fontFamily: 'var(--font-latin)' }}
          >
            {timeline.length}
          </span>
          <span
            className="text-[0.6875rem] tracking-[0.24em] text-paper/50"
            style={{ fontFamily: 'var(--font-latin)' }}
          >
            道刻痕
          </span>
        </div>

        {/* 航迹：这条日志本身就是一段"经过"的水痕（本页头**只留这一条线**，避免与潮线读成双线） */}
        <WakeLine className="bottom-[-7px] left-[6%] right-[30%]" />
      </header>

      {/* 桌面：刻痕盘在左、时间线在右；窄屏：刻痕盘在上、时间线在下（不横向溢出） */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* 装置：半沉螺旋刻痕（一笔一条日志，只有最新一笔是湿的） */}
        <section
          data-testid="log-scratch"
          data-marks={String(timeline.length)}
          aria-label="刻痕盘：每一道刻痕是一条核心操作"
          className="relative isolate w-full overflow-hidden rounded-lg border border-line/15 bg-ink px-[16px] py-[16px] lg:w-[24rem] lg:shrink-0"
        >
          {/* 刻痕语法表：切口越长＝这一笔越重；色只标归处 */}
          <ul
            data-testid="log-legend"
            className="relative z-10 flex flex-wrap items-start gap-x-[19px] gap-y-[10px]"
          >
            {operations.map((operation) => {
              const cut = CUTS[operation] ?? DEFAULT_CUT;
              return (
                <li key={operation} className="flex flex-col items-center gap-[7px]">
                  <svg
                    aria-hidden="true"
                    width={44}
                    height={30}
                    viewBox="0 0 44 30"
                    fill="none"
                    className={cn('block shrink-0', cut.tone)}
                  >
                    <path d="M6 8v14" stroke="var(--color-line)" strokeOpacity="0.24" />
                    {cut.double === true ? (
                      <>
                        <path
                          d="M6 13.5h20"
                          stroke="currentColor"
                          strokeWidth={1.6}
                          strokeLinecap="round"
                        />
                        <path
                          d="M6 16.5h20"
                          stroke="currentColor"
                          strokeWidth={1.6}
                          strokeLinecap="round"
                        />
                      </>
                    ) : (
                      <path
                        d={`M6 15h${String(cut.length)}`}
                        stroke="currentColor"
                        strokeWidth={cutWidth(cut)}
                        strokeLinecap="round"
                      />
                    )}
                  </svg>
                  <span className="text-[0.75rem] tracking-[0.03em] text-muted">{operation}</span>
                </li>
              );
            })}
          </ul>

          <svg
            aria-hidden="true"
            viewBox="0 0 400 400"
            className="mx-auto mt-[16px] block h-auto w-full max-w-[360px]"
          >
            {/* 盘心：这一圈刻痕从这里长出去 */}
            <circle
              cx={SCRATCH_CENTER}
              cy={SCRATCH_CENTER}
              r="2.6"
              fill="var(--color-glass)"
              fillOpacity="0.5"
            />

            {scratches.map((scratch) => (
              <g key={scratch.seq}>
                {scratch.wet ? (
                  /* 最新一笔是**湿的**：弧下压着一道冷光水痕（末端最湿，往上就干了） */
                  <path
                    d={scratch.d}
                    fill="none"
                    stroke="var(--color-water-mid)"
                    strokeOpacity="0.3"
                    strokeWidth="9"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                <path
                  data-mark="true"
                  data-seq={String(scratch.seq)}
                  data-wet={scratch.wet ? 'true' : 'false'}
                  d={scratch.d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={scratch.wide}
                  strokeLinecap="round"
                  className={scratch.cut.tone}
                  vectorEffect="non-scaling-stroke"
                />
                {scratch.twinD === null ? null : (
                  <path
                    d={scratch.twinD}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={scratch.wide}
                    strokeLinecap="round"
                    className={scratch.cut.tone}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {/* 刻痕编号：与时间线的序号同源（服务端 seq） */}
                <text
                  x={scratch.label.x}
                  y={scratch.label.y}
                  dy="0.34em"
                  textAnchor="middle"
                  className="fill-current text-paper/50"
                  fontSize="10"
                  style={{ fontFamily: 'var(--font-latin)' }}
                >
                  #{String(scratch.seq).padStart(2, '0')}
                </text>
              </g>
            ))}

            {/* 盘边那一小汪水：最新那道刻痕的末端泡在里面；瓶子停在水里 —— 这条水路已经走到头了 */}
            <g transform={`translate(${spillX.toFixed(2)} ${spillY.toFixed(2)})`}>
              <path
                d="M -46 0 C -50 -11 -28 -17 -6 -15 C 18 -13 44 -10 47 0 C 50 11 22 18 -4 17 C -28 16 -42 10 -46 0 Z"
                fill="var(--color-water-body)"
                fillOpacity="0.55"
                stroke="var(--color-water-mid)"
                strokeOpacity="0.26"
              />
              <path
                d="M -38 -5 C -22 -13 4 -15 28 -11"
                fill="none"
                stroke="var(--color-water-deep)"
                strokeOpacity="0.42"
                strokeWidth="1.4"
                vectorEffect="non-scaling-stroke"
              />
              {/* 溅开的那一滴 */}
              <ellipse
                cx="58"
                cy="8"
                rx="6"
                ry="3"
                fill="var(--color-glass)"
                fillOpacity="0.28"
              />
              {/* 半沉的瓶：躺在水洼里，瓶口朝上、歪着 */}
              <g transform="rotate(-26) scale(0.8)">
                <BottleMark size={44} tone="sea-glass" />
              </g>
            </g>
          </svg>
        </section>

        {/* 时间线：一条**有格线的卷**（不是一摞卡片）；最新一笔在左侧留一道珊瑚刻痕边 */}
        <ol
          data-testid="drift-log"
          className="w-full border-t border-line/13 pl-[12px] lg:min-w-0 lg:flex-1"
        >
          {timeline.map((entry, index) => {
            const latest = index === timeline.length - 1;
            return (
              <li
                key={entry.seq}
                data-latest={latest ? 'true' : 'false'}
                className={cn(
                  'relative flex flex-wrap items-baseline gap-x-[12px] gap-y-[2px] border-b py-[10px]',
                  'md:grid md:grid-cols-[52px_1fr_126px_150px] md:items-baseline md:gap-0 md:py-[11px]',
                  latest ? 'border-line/13' : 'border-line/7',
                )}
              >
                {latest ? (
                  <span
                    aria-hidden="true"
                    className="absolute left-[-14px] inset-y-[10px] w-[2px] bg-coral"
                  />
                ) : null}
                <span
                  className="text-[0.6875rem] tracking-[0.08em] text-paper/50"
                  style={{ fontFamily: 'var(--font-latin)' }}
                >
                  #{String(entry.seq).padStart(2, '0')}
                </span>
                <span className="text-[1.0625rem] leading-[1.4] text-paper md:pr-[18px]">
                  {entry.label}
                </span>
                <span className="flex items-center gap-2 text-[0.875rem] text-muted">
                  <Icon name={entry.isSystem ? 'Settings' : 'UserRound'} size={16} />
                  {entry.actor}
                </span>
                <span
                  className="ml-auto text-[0.75rem] text-paper/50 md:ml-0 md:text-right"
                  style={{ fontFamily: 'var(--font-latin)' }}
                >
                  {entry.at}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
