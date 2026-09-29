/**
 * 漂流日志（CONTEXT §9「追踪揭示」）—— record-v1 逐块照抄
 * `docs/ui-review/design-explore/p-driftlog-record.html`（稿名：刻痕 record-v1）。
 *
 * 稿 DOM 顺序（不省块、不发明、不重组）：
 *   背景三层（`.platter`/`.glint`/`.waterlight`）→ `main`（稿 padding 64/76/0）
 *   → `header`（crumb / `.cat` / h1 / `.sub` 逐字）→ `.hright`（曲名·曲·N·道刻痕）
 *   → `.key` 刻痕语法表（七种切口，svg 逐值）
 *   → `.body`（左 480×540 半沉螺旋刻痕盘 + 右 `.roll` 时间线卷）。
 * 唯一允许的翻译 = 固定 px → 流体（vw/max 流体边距、稿定高画布 562 → 流内定位）。
 *
 * 装置说的事（一笔 = 一条日志 = 一道刻痕）：
 * - `seq` 由服务端给，客户端不重排、不重新编号；刻痕内圈最早，往外走就是往后走；
 * - 切口越长＝这一笔越重、色只标归处；**图例只列这份日志里真的发生过的操作**；
 * - 盘面是干的：只有最新一笔是湿的（弧下压一道冷光水痕），末端的水在盘边积成一小汪，
 *   瓶子就停在那汪水里；时间线末行（若走到头）只留一道珊瑚色刻痕边。
 *
 * 两条原有纪律不变：
 * - 时间线以服务端为准：按 `seq` 升序渲染，客户端不本地推算（`docs/api.md` §2.4）；
 * - 只给时间线，不给内容可见性判断（私密留言可见性在服务端，属 t12）。
 */
import { useBottle, useBottleEvents } from '../features/api/queries';
import { actorSourceOf, eventTimeline, type DriftLogEntry } from '../features/bottle/drift-events';
import { ConflictNotice } from '../features/bottle/conflict-notice';
import { BottleMark, Skeleton, WakeLine, cn } from '../design-system';
import { Link } from './shell/router';
import './drift-log-page.css';

/* ── 刻痕语法（长度＝权重、色＝归处；照稿 .key 语法表逐值）───────────────────── */
interface CutSpec {
  /** 切口的长度（稿的语法表 44×30 里 11–30）。 */
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

/* ── 螺旋刻痕的几何（稿值 → 参数化：日志条数不定，公式在稿的 11 笔上逐值还原）───
   稿：11 笔短弧、半径 52 → 282（步 23）、相邻弧间隔固定 10°、总扫角 468°（一圈多）、
   起笔 -75°、最新那一笔拖长到 84°（湿痕/水汪都锚在它的末端 (69.0, 493.3)）。 */
const LATHE_CENTER_X = 197;
const LATHE_CENTER_Y = 242;
const SCRATCH_START_RADIUS = 52;
const SCRATCH_END_RADIUS = 282;
const SCRATCH_START_ANGLE = -75;
const SCRATCH_MAX_STEP = 56;
const SCRATCH_TOTAL_SWEEP = 468;
const SCRATCH_GAP = 10;
const SCRATCH_WET_SPAN = 84;
/** 稿最新一笔弧的末端：盘边那汪水按它对位（11 笔时位移为 0）。 */
const DRAFT_WET_END = { x: 69.0, y: 493.3 };

function polar(angleDeg: number, radius: number): { x: number; y: number } {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    x: LATHE_CENTER_X + radius * Math.cos(radians),
    y: LATHE_CENTER_Y + radius * Math.sin(radians),
  };
}

interface Scratch {
  seq: number;
  d: string;
  /** 双刻线（完成）的第二道弧；没有就是 `null`。 */
  twinD: string | null;
  /** 编号挂在这一笔的中点内侧（稿：半径 −13；最新一笔在末端外侧 +15）。 */
  label: { x: number; y: number };
  /** 末端：水痕与那汪水都从它开始。 */
  end: { x: number; y: number };
  cut: CutSpec;
  wide: number;
  wet: boolean;
}

function arcPath(startDeg: number, radius: number, spanDeg: number): string {
  const from = polar(startDeg, radius);
  const to = polar(startDeg + spanDeg, radius);
  return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} A ${radius} ${radius} 0 ${
    spanDeg > 180 ? 1 : 0
  } 1 ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}

/** 把时间线折成螺旋：第 i 笔的角度与半径由 i / 笔数 决定（`seq` 只做标识与编号）。 */
function scratchesOf(timeline: readonly DriftLogEntry[]): Scratch[] {
  const total = timeline.length;
  const step =
    total > 1 ? Math.min(SCRATCH_MAX_STEP, SCRATCH_TOTAL_SWEEP / (total - 1)) : SCRATCH_MAX_STEP;
  return timeline.map((entry, index) => {
    const angle = SCRATCH_START_ANGLE + index * step;
    const radius =
      total === 1
        ? SCRATCH_END_RADIUS
        : SCRATCH_START_RADIUS +
          ((SCRATCH_END_RADIUS - SCRATCH_START_RADIUS) * index) / (total - 1);
    const isLast = index === total - 1;
    const span = isLast ? SCRATCH_WET_SPAN : Math.max(step - SCRATCH_GAP, 4);
    const cut = cutOf(entry.label);
    return {
      seq: entry.seq,
      d: arcPath(angle, radius, span),
      twinD: cut.double === true ? arcPath(angle, radius + 4.5, span) : null,
      label: polar(angle + span / 2, isLast ? radius + 15 : radius - 13),
      end: polar(angle + span, radius),
      cut,
      wide: cutWidth(cut),
      wet: isLast,
    };
  });
}

/** 稿的背景三层（`.clip`：盘面细纹 / 斜向高光 / 水面光带）——值逐字照稿。 */
const PLATTER_BG =
  'repeating-radial-gradient(circle at 1420px 960px, rgba(216,243,246,.055) 0 1.2px, transparent 1.2px 6.5px), radial-gradient(circle at 1420px 960px, rgba(127,209,217,.05) 0 30%, transparent 68%)';
const GLINT_BG =
  'linear-gradient(101deg, transparent 28%, rgba(228,247,252,.045) 45%, rgba(228,247,252,.065) 50%, rgba(228,247,252,.028) 55%, transparent 72%)';
const WATERLIGHT_BG =
  'linear-gradient(186deg, rgba(203,238,246,.10) 0%, rgba(203,238,246,.042) 32%, transparent 70%)';

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
  /** 那汪水跟着最新一笔的末端走（11 笔时与稿逐值重合）。 */
  const spillDx = wet === null ? 0 : wet.end.x - DRAFT_WET_END.x;
  const spillDy = wet === null ? 0 : wet.end.y - DRAFT_WET_END.y;

  return (
    <main className="drift-page relative z-[2] px-[max(1.5rem,5.278vw)] pt-[max(2.5rem,4.444vw)] pb-0 text-paper md:h-[100dvh] md:overflow-hidden">
      {/* W18.5 · B4：加载/条数播报。此前本页零 aria-live ——
          长日志（可达数百条）加载完成、切段查看都只有视觉变化，读屏什么都听不到。 */}
      <p role="status" aria-live="polite" className="sr-only">
        {events.data === undefined
          ? '正在读这支瓶子的漂流日志'
          : `漂流日志共 ${String(events.data.length)} 条记录`}
      </p>
      {/* 背景三层（稿 .clip：世界是这台机器，正文浮在它上面） */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="platter absolute inset-0" style={{ background: PLATTER_BG }} />
        <div className="glint absolute inset-0" style={{ mixBlendMode: 'screen', background: GLINT_BG }} />
        <div
          className="waterlight absolute"
          style={{
            left: '-8%',
            top: '-4%',
            width: '118%',
            height: '290px',
            mixBlendMode: 'screen',
            background: WATERLIGHT_BG,
          }}
        />
      </div>

      {/* ── 页头（稿 header：crumb / cat / h1 / sub 逐字逐值）────────────────── */}
      <header className="enter-rise relative">
        <Link
          to={`/bottles/${id}`}
          className="inline-flex min-h-11 items-center gap-[7px] rounded-[2px] border border-[rgba(243,249,250,0.16)] px-[12px] text-[12.5px] text-muted transition-[transform,color,border-color] duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)] hover:border-[rgba(216,243,246,0.4)] hover:text-glass focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink active:translate-y-px"
        >
          <svg width="8" height="12" viewBox="0 0 8 12" aria-hidden="true">
            <path
              d="M6.4 1.2 1.8 6l4.6 4.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          回漂流瓶
        </Link>
        <div
          className="mt-[16px] text-[11px] tracking-[0.24em] text-paper/50"
          style={{ fontFamily: 'var(--font-latin)' }}
        >
          SIDE A · 刻痕
        </div>
        <h1 className="mt-[14px] text-[clamp(2rem,3.9vw,3.5rem)] font-bold leading-none tracking-[0.02em] text-paper">
          漂流日志
        </h1>
        <p className="mt-[14px] max-w-[730px] text-[15px] leading-[1.85] text-muted">
          这里只记核心操作：发起、接唱、捞取、投河、回传、入海。操作者只显示匿名代号。
        </p>

        {/* 航迹：这条日志本身就是一段"经过"的水痕（页头只留这一条线，避免与潮线读成双线） */}
        <WakeLine className="bottom-[-7px] left-[6%] right-[30%]" />
      </header>

      {/* ── 右上统计（稿 .hright：曲名 / 曲 / N / 道刻痕；值来自服务端事实）────── */}
      <div className="mt-[8px] flex flex-wrap items-baseline gap-x-[12px] md:absolute md:right-[max(1.5rem,5.278vw)] md:top-[max(2.5rem,4.444vw)] md:flex-col md:items-end md:gap-x-0 md:text-right">
        <span
          className="text-[11px] tracking-[0.24em] text-paper/50"
          style={{ fontFamily: 'var(--font-latin)' }}
        >
          曲名
        </span>
        <span className="mt-[8px] text-[19px] font-bold text-paper">{bottle.data.songTitle}</span>
        <span
          className="mt-[10px] text-[30px] leading-none text-glass"
          style={{ fontFamily: 'var(--font-latin)' }}
        >
          {timeline.length}
        </span>
        <span
          className="mt-[2px] text-[11px] tracking-[0.24em] text-paper/50"
          style={{ fontFamily: 'var(--font-latin)' }}
        >
          道刻痕
        </span>
      </div>

      {/* ── 刻痕语法表（稿 .key：切口越长＝越重；色只标归处；只列发生过的操作）─── */}
      <div
        data-testid="log-legend"
        className="mt-[22px] flex flex-wrap items-start gap-[19px] lg:flex-nowrap"
      >
        {operations.map((operation) => {
          const cut = CUTS[operation] ?? DEFAULT_CUT;
          return (
            <figure key={operation} className="flex flex-col gap-[7px]">
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
              <figcaption className="text-[12px] tracking-[0.03em] text-muted">{operation}</figcaption>
            </figure>
          );
        })}
      </div>

      {/* ── 主体（稿 .body：左刻痕盘 / 右时间线；稿定高 562 → 流内定位）──────── */}
      <div className="drift-body relative mt-[24px] flex flex-col gap-6 lg:block">
        {/* 半沉螺旋刻痕（一笔一条日志，只有最新一笔是湿的；稿 480×540 逐值） */}
        <svg
          data-testid="log-scratch"
          data-marks={String(timeline.length)}
          aria-hidden="true"
          width={480}
          height={540}
          viewBox="0 0 480 540"
          fill="none"
          className="mx-auto block h-auto w-full max-w-[480px] lg:absolute lg:left-0 lg:top-0 lg:mx-0 lg:w-[37.27%]"
        >
          <defs>
            {/* 湿痕的冷光：末端最湿，往上就干了 */}
            <linearGradient id="wet" x1="0" y1="0" x2="1" y2="0">
              {/* record-v1：稿字面色映 token（#cbeef6→water-mid），禁内联 hex */}
              <stop offset="0" stopColor="var(--color-water-mid)" stopOpacity=".34" />
              <stop offset=".45" stopColor="var(--color-water-mid)" stopOpacity=".13" />
              <stop offset="1" stopColor="var(--color-water-mid)" stopOpacity="0" />
            </linearGradient>
            {/* 盘边那一小汪水（稿 #7fd1d9 → glass token） */}
            <radialGradient id="spill" cx=".32" cy=".22" r=".92">
              <stop offset="0" stopColor="var(--color-glass)" stopOpacity=".46" />
              <stop offset=".55" stopColor="var(--color-glass)" stopOpacity=".22" />
              <stop offset="1" stopColor="var(--color-glass)" stopOpacity=".11" />
            </radialGradient>
          </defs>

          <g transform="translate(8 4)">
            {/* 湿痕只压在最新那条弧下面 */}
            {wet === null ? null : (
              <path
                d={wet.d}
                stroke="url(#wet)"
                strokeWidth="9"
                strokeLinecap="round"
                fill="none"
              />
            )}

            <g fill="none" strokeLinecap="round">
              {scratches.map((scratch) => (
                <g key={scratch.seq}>
                  <path
                    data-mark="true"
                    data-seq={String(scratch.seq)}
                    data-wet={scratch.wet ? 'true' : 'false'}
                    d={scratch.d}
                    stroke="currentColor"
                    strokeWidth={scratch.wide}
                    className={scratch.cut.tone}
                  />
                  {scratch.twinD === null ? null : (
                    <path
                      d={scratch.twinD}
                      stroke="currentColor"
                      strokeWidth={scratch.wide}
                      className={scratch.cut.tone}
                    />
                  )}
                  {/* 刻痕编号：与时间线的序号同源（服务端 seq） */}
                  <text
                    x={scratch.label.x.toFixed(1)}
                    y={scratch.label.y.toFixed(1)}
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
            </g>

            {/* 盘心 */}
            <circle cx="197" cy="242" r="2.6" fill="rgba(127,209,217,.5)" />

            {wet === null ? null : (
              <g transform={`translate(${spillDx.toFixed(2)} ${spillDy.toFixed(2)})`}>
                {/* 盘边那一小汪水：最新那道刻痕的末端泡在里面（稿逐值） */}
                <path
                  d="M62 484 C58 473 80 467 102 469 C126 471 152 474 155 484 C158 495 130 502 104 501 C80 500 66 494 62 484 Z"
                  fill="url(#spill)"
                  stroke="rgba(203,238,246,.26)"
                />
                <path
                  d="M70 479 C86 471 112 469 136 473"
                  fill="none"
                  stroke="rgba(228,247,252,.42)"
                  strokeWidth="1.4"
                />
                <path
                  d="M80 492 C98 498 128 499 148 494"
                  fill="none"
                  stroke="rgba(203,238,246,.20)"
                />
                {/* 溅开的那一滴 */}
                <ellipse cx="166" cy="492" rx="6" ry="3" fill="rgba(127,209,217,.28)" />
                {/* 半沉的瓶：停在那汪水里 —— 这条水路已经走到头了 */}
                <g transform="translate(101 487) rotate(-26) scale(.8)">
                  <g transform="translate(-24 -28)">
                    <BottleMark size={48} tone="sea-glass" />
                  </g>
                </g>
              </g>
            )}
          </g>
        </svg>

        {/* 时间线：一条**有格线的卷**（不是一摞卡片）；最新一笔在左侧留一道珊瑚刻痕边 */}
        <ol
          data-testid="drift-log"
          tabIndex={0}
          aria-label="漂流事件记录"
          className="w-full list-none border-t border-line/13 lg:ml-[43.8%] lg:mt-[4px] lg:w-auto"
        >
          {timeline.map((entry, index) => {
            const latest = index === timeline.length - 1;
            return (
              <li
                key={entry.seq}
                data-latest={latest ? 'true' : 'false'}
                className={cn(
                  'relative flex flex-wrap items-baseline gap-x-[12px] gap-y-[2px] border-b py-[11px]',
                  'md:grid md:grid-cols-[52px_1fr_126px_150px] md:items-baseline md:gap-0',
                  latest ? 'border-line/13' : 'border-line/7',
                  `enter-rise stagger-${Math.min(index + 1, 4)}`,
                )}
              >
                {latest ? (
                  <span
                    aria-hidden="true"
                    className="absolute left-[-14px] inset-y-[10px] w-[2px] bg-coral"
                  />
                ) : null}
                <span
                  className="text-[11px] tracking-[0.08em] text-paper/50"
                  style={{ fontFamily: 'var(--font-latin)' }}
                >
                  #{String(entry.seq).padStart(2, '0')}
                </span>
                <span className="text-[17px] leading-[1.4] text-paper md:pr-[18px]">
                  {entry.label}
                </span>
                <span className="text-[14px] text-muted">{entry.actor}</span>
                <span
                  className="ml-auto text-[12px] text-paper/50 md:ml-0 md:text-right"
                  style={{ fontFamily: 'var(--font-latin)' }}
                >
                  {entry.at}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </main>
  );
}
