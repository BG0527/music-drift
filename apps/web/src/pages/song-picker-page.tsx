/**
 * 选歌 → 发起（CONTEXT §3.1）。
 *
 * 版权红线（captain 裁决）：**不使用官方专辑封面**（用内联 SVG），**不复制歌词正文**，
 * 只给结构性信息（这首歌分几段、每段多长、第几段先由你唱）。
 *
 * ## 本页的 record-v1 装置：**五格翻页箱 · 一格一只浅盆，盆里搁着一张母版**
 *
 * 设计稿：`docs/ui-review/design-explore/p-songpicker-record.html`（图 `…-record.png`）。
 * 一格 = 一道槽（左右两道向下渐隐的细线 + 一道亮顶边），槽里搁着一只浅盆，
 * **盆里躺着一张母版（唱片）**，母版上的沟槽 = 这首歌的段位，盆里的水位 = 已切好的段位：
 *
 * | 状态 | 画面 | 它编码的事 |
 * | --- | --- | --- |
 * | 已切分 4 / 4 段 | 水漫过盘面（整张母版在水下），四道沟槽清清楚楚 | 曲库把这首切好了，可以发起 |
 * | 已切分 2 / 4 段 | 水位到一半，被你切过的沟槽实线、没切的**虚线** | 切了几段（水位）+ 缺的是哪几格 |
 * | 未切分 0 / 4 段 | **见底**：一滴水没有，盘身是钝的（沟槽全是虚线），一条虚线弧标出水位本该到的地方 | 没有预设段位 → **暂不可发起** |
 *
 * 几何全部取自设计稿的 SVG（盆口 118 : 88.5 = 4:3；母版 = 盆口的 74.3%、坐在盆底靠前；
 * 满水水位 = 盆口下方 11.8% ⇒ 水体高 88.2%；沟槽半径梯 = 母版半径的 88.3% → 32.4%，
 * **第 1 段在最外圈**（唱片的播放顺序），珊瑚弧就落在第 1 段那道沟上）。
 *
 * 为什么不是"进度条"：进度条只能说一个比例；这里的浅盆同时说清**切好了几段**（水位高度）
 * 与**段位格子本身在不在**（每道沟槽是实线还是虚线），并且把"音乐（母版）落在水（盆）里"
 * 合成一张画面 —— 设计语言 §7.3 要求的正是"融合而不是并排"。
 *
 * 无障碍：盆是 `aria-hidden` 的纯几何图形，水位由 `figcaption` 的**可见文字**说出
 * （"已切分 4 / 4 段" / "未切分 0 / 4 段"）—— 任何信息都不只存在于颜色或形状里。
 *
 * 响应式（375 现在生效）：单列 → `sm:2` → `lg:3` → `xl:5`（1440 上一排五格，读成水位对照）；
 * 盆宽上限 260px，所以水位读数在 375 与 1440 上是同一个比例，装置不会因为折行而失效。
 */
import { useId, useState } from 'react';
import { useCreateBottle } from '../features/api/mutations';
import { useSongs } from '../features/api/queries';
import { ConflictNotice } from '../features/bottle/conflict-notice';
import { useSession } from '../features/session/session-context';
import { Button, Icon, Skeleton, cn } from '../design-system';
import { AsyncBoundary } from './shell/async-boundary';
import { Link } from './shell/router';
import { useNavigate } from './shell/router-context';

/** 稿 §5.1：格顶沿五格错落 0/6/2/8/4px。 */
const EDGE_TILT = [0, 6, 2, 8, 4] as const;
/** 稿 §5.2：盆体 y 错落 −5/+6/−8/+9/0（相对均值 645.4）。 */
const BASIN_TILT = [-5, 6, -8, 9, 0] as const;

/* ── 浅盆的几何（数值全部来自设计稿 SVG，不是随手调的）──────────────────────── */

/** 盆口椭圆：设计稿外沿 118 : 88.5 ≈ 4:3。 */
const BOWL_ASPECT = 'aspect-[4/3]';
/** 盆的整体（盆口 + 露在下方的盆壁）：236 : 206。 */
const BOWL_BOX = 'aspect-[236/206]';
/** 盆口内的内壁（设计稿 113/118）。 */
const MOUTH_INSET = 2.1;
/** 母版直径占盆口内径的比例（84/113）。 */
const DISC_SCALE = 74.3;
const DISC_LEFT = (100 - DISC_SCALE) / 2;
/** 母版纵向中心（盆口中心下方 29/169.6 = 17.1%）。 */
const DISC_TOP = 50 + 17.1 - DISC_SCALE / 2;
/** 满水时水体高度（盆口内高的 88.2%）：水面落在盆口下方 11.8% 处。 */
const FULL_WATER_PCT = 88.2;
/** 沟槽半径梯（占母版半径）：设计稿逐档 74.2 / 63 / 48.8 / 27.2 ÷ 84 = 88.3% / 75% / 58.1% / 32.4%（非线性，不许等差插值）。 */
const GROOVE_LADDER = [0.883, 0.75, 0.581, 0.324] as const;
/** 第 1 段那道珊瑚弧：设计与沟槽 1 同心，跨度 ±16.7（占该圈宽 22.5%）。 */
const SEG1_WIDTH_PCT = 22.5;

/** 一格浅盆：`cut` = 这首歌已切好的段位数，`total` = 段位总数；`tilt` = 稿的盆体 y 错落。 */
function WaterBasin({
  cut,
  total,
  tilt = 0,
}: {
  cut: number;
  total: number;
  tilt?: number;
}) {
  const ratio = total <= 0 ? 0 : Math.min(1, Math.max(0, cut / total));
  const slots = Array.from({ length: Math.max(0, total) }, (_unused, offset) => offset + 1);
  /** 段位 s 的沟槽半径（占母版半径）：沿设计稿四档逐档取值，非 4 段时只在相邻档间线性过渡。 */
  const grooveScale = (slot: number): number => {
    if (slots.length <= 1) return GROOVE_LADDER[0];
    const position = ((slot - 1) / (slots.length - 1)) * (GROOVE_LADDER.length - 1);
    const index = Math.min(GROOVE_LADDER.length - 2, Math.floor(position));
    const fraction = position - index;
    const from = GROOVE_LADDER[index];
    const to = GROOVE_LADDER[index + 1];
    // index 恒在 [0, 档数-2]，下面的分支只为过 tsc 的索引收窄，合法调用不触发
    if (from === undefined || to === undefined) return GROOVE_LADDER[0];
    return from + (to - from) * fraction;
  };
  /**
   * 母版那张"盘"的框：沟槽与珊瑚弧都按它取百分比。
   * ⚠️ 用**内联 style** 而不是 `left-[12.85%]` 这种任意值类名 —— 任意值类名必须**逐字**出现在源码里
   * 才能被 Tailwind 扫到；这里的位置是算出来的（拼字符串的类名一个都不会生成，等于没有样式）。
   */
  const discFrameStyle = {
    left: `${DISC_LEFT.toFixed(2)}%`,
    top: `${DISC_TOP.toFixed(2)}%`,
    width: `${String(DISC_SCALE)}%`,
    height: `${String(DISC_SCALE)}%`,
  } as const;
  const DISC_FRAME = 'absolute rounded-full';

  /** 一道沟槽：切过的实线、没切的虚线（干盘就是"一道沟都没有"）。 */
  const groove = (slot: number, tone: 'dim' | 'crisp') => {
    const scale = grooveScale(slot);
    const inset = ((1 - scale) / 2) * 100;
    const wet = slot <= cut;
    return (
      <span
        key={`${tone}-slot-${String(slot)}`}
        {...(tone === 'dim' ? { 'data-testid': 'basin-ring' } : {})}
        style={{
          left: `${inset.toFixed(2)}%`,
          top: `${inset.toFixed(2)}%`,
          width: `${(scale * 100).toFixed(2)}%`,
          height: `${(scale * 100).toFixed(2)}%`,
        }}
        className={cn(
          'absolute rounded-full',
          wet
            ? tone === 'crisp'
              ? 'border border-line/30'
              : 'border border-line/[0.13]'
            : 'border border-dashed border-line/20',
        )}
      />
    );
  };

  return (
    <figure
      className="mt-auto flex flex-col items-center gap-2"
      style={{ transform: `translateY(${String(tilt)}px)` }}
    >
      <div
        aria-hidden="true"
        data-testid="basin-graphic"
        className={cn('relative mx-auto w-full max-w-[260px]', BOWL_BOX)}
      >
        {/* 盆壁：盆口椭圆整体下移 14.1% 的那一份，露出来的下缘就是盆壁 */}
        <div
          className={cn(
            'absolute inset-x-0 top-[14.1%] rounded-full border border-line/10 bg-linear-to-b from-water-void/70 to-water-void/85',
            BOWL_ASPECT,
          )}
        />

        {/* 盆口：盆沿 + 盆里的一切 */}
        <div
          className={cn('absolute inset-x-0 top-0 rounded-full border border-line/25', BOWL_ASPECT)}
        >
          <div
            className={cn(
              'absolute overflow-hidden rounded-full',
              'bg-linear-to-b from-water-void/75 via-ink/50 to-water-bed/40',
            )}
            style={{ inset: `${String(MOUTH_INSET)}%` }}
          >
            {/* 盆底：整只盆口下移 17.1% 的那一份（下缘被盆口裁掉） */}
            <div className="absolute inset-0 top-[17.1%] rounded-full border border-line/10 bg-linear-to-b from-water-bed/45 to-water-void/75" />

            {/* 干盆：盆底那点微光，免得"见底"读成一个黑洞 */}
            {cut === 0 ? (
              <div className="absolute inset-0 top-[17.1%] rounded-full bg-water-mid/10" />
            ) : null}

            {/* 母版：躺在这只盆里（它才是"段位"的载体） */}
            <div
              style={discFrameStyle}
              className={cn(
                DISC_FRAME,
                'border border-water-light/[0.38] bg-linear-to-b from-water-bed/60 to-water-void/85',
              )}
            >
              {slots.map((slot) => groove(slot, 'dim'))}
              {/* 标签盘中心的孔 */}
              <span className="absolute left-1/2 top-1/2 h-[9%] w-[9%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-water-light/25 bg-water-void" />
            </div>

            {/* 水：上边界是一道弧（两端止于盆壁），水位 = 这首已切好的段位 */}
            {cut > 0 ? (
              <div
                data-testid="basin-water"
                data-level={ratio}
                style={{ height: `${(ratio * FULL_WATER_PCT).toFixed(1)}%` }}
                className="absolute inset-x-0 bottom-0 rounded-t-full bg-linear-to-b from-water-light/25 via-glass/15 to-water-surface/40"
              />
            ) : null}

            {/*
              还没到位的水位线：一条**虚线弧**，标出水位本该到的地方
              （4 段全切好时它就与水面重合，因此那时不再画）。
            */}
            {cut < total ? (
              <div
                data-testid="basin-expected-waterline"
                style={{ height: `${String(FULL_WATER_PCT)}%` }}
                className="absolute inset-x-0 bottom-0 rounded-t-full border-t border-dashed border-line/25"
              />
            ) : null}

            {/* 水面之上：被切过的沟槽再画一道清晰的，并把第 1 段的珊瑚弧压在水面上 */}
            <div style={discFrameStyle} className={DISC_FRAME}>
              {slots.filter((slot) => slot <= cut).map((slot) => groove(slot, 'crisp'))}
              {cut > 0 ? (
                <span
                  data-testid="basin-seg1"
                  className="absolute left-1/2 h-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-coral"
                  style={{
                    top: `${(((1 - grooveScale(1)) / 2) * 100).toFixed(2)}%`,
                    width: `${((grooveScale(1) * SEG1_WIDTH_PCT) / 100).toFixed(2)}%`,
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <figcaption data-testid="basin-level" className="text-[0.75rem] text-muted">
        {cut === 0
          ? `未切分 0 / ${String(total)} 段`
          : `已切分 ${String(cut)} / ${String(total)} 段`}
      </figcaption>
    </figure>
  );
}

/** 一格翻页箱的槽口：左右两道向下渐隐的细线 + 一道亮顶边（稿 `.slot` / `.edge`，顶边带错落）。 */
function BayFrame({ edgeTop }: { edgeTop: number }) {
  return (
    <>
      <span
        aria-hidden="true"
        style={{ top: edgeTop }}
        className="pointer-events-none absolute inset-x-0 h-px bg-linear-to-r from-paper/[0.34] to-paper/[0.05]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 bottom-[24%] left-0 w-px bg-linear-to-b from-paper/[0.11] to-transparent"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-0 bottom-[24%] w-px bg-linear-to-b from-paper/[0.11] to-transparent"
      />
    </>
  );
}

export function SongPickerPage() {
  const songs = useSongs();
  const create = useCreateBottle();
  const navigate = useNavigate();
  const session = useSession();
  const filterId = useId();
  /**
   * 曲库过滤（§46.3：曲库变长时页面仍要一屏装下）。
   * 这是**本地过滤**，不是分页：`/api/songs` 目前没有游标契约，所以绝不假装有下一页。
   * 曲目真的多到一屏放不下时，正确做法是给 `/api/songs` 加游标（已上报 captain），
   * 不是在前端造一个"下一页"。
   */
  const [keyword, setKeyword] = useState('');

  /** 页头两组计数：曲库里"切好了"与"还没切分"各几首（来自数据，不是写死）。 */
  const catalog = songs.data ?? [];
  const cutCount = catalog.filter((song) => song.segments.length > 0).length;
  const rawCount = catalog.length - cutCount;

  return (
    /**
     * 【用户可见缺陷】这里原本是 `md:overflow-hidden`，配 `md:h-[100dvh]`：
     * 一屏放不下时内容被**静默裁掉**且滚不动。实测（1440 宽 900 高以外的窗口都会中招）：
     *   1366×768 → 卡片下沿被裁 58px
     *   1250×900 → 网格掉到 3 列、4 首歌折成 2 行，被裁 397px（"投出第一棒"按钮看不见）
     *   1024×768 → 被裁 529px
     * 网格本来就设计成随宽度换列（sm:2 / lg:3 / xl:5），列数一变高度就会超一屏，
     * 所以真正要修的是"超了也不许消失"：改 `overflow-y-auto` 后本框仍是 100dvh
     * （背景三层 `absolute inset-0` 依旧只铺满视口），放得下就是完整一屏，
     * 放不下就滚动可达 —— 任何窗口尺寸都不会再丢内容。
     * 1440×900 实测回到 0 溢出（单屏门禁不受影响）。
     */
    <div className="relative isolate flex flex-col gap-6 px-[5.28%] pt-[max(1rem,var(--top-nav-reserve-min))] md:h-[100dvh] md:gap-3 md:overflow-x-hidden md:overflow-y-auto md:pb-3">
      {/* W18.5 · B4：发起结果播报。此前本页零 aria-live ——
          「正在发瓶 / 已投河」只有按钮 shimmer 与跳转，读屏用户听不到任何结果。 */}
      <p role="status" aria-live="polite" className="sr-only">
        {create.isPending
          ? '正在把这支漂流瓶投进河里'
          : create.isSuccess
            ? '已投河，正在漂流'
            : songs.isLoading
              ? '正在读曲库'
              : `曲库共 ${String(rawCount)} 首可选`}
      </p>
      {/* 稿 §8 背景三层：platter →（盆体在内容层）→ deep → glint；装饰零布局、token 驱动（本页守卫禁 rgba/hex） */}
      <span
        aria-hidden="true"
        data-device="sp-platter"
        className="pointer-events-none absolute inset-0 bg-[repeating-radial-gradient(circle_at_98.6%_106.7%,color-mix(in_srgb,var(--color-line)_5.5%,transparent)_0_1.2px,transparent_1.2px_6.5px)]"
      />
      <span
        aria-hidden="true"
        data-device="sp-deep"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[200px] opacity-[0.52] bg-[linear-gradient(180deg,transparent_0%,var(--color-water-void)_70%)]"
      />
      <span
        aria-hidden="true"
        data-device="sp-glint"
        className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-screen bg-[linear-gradient(101deg,transparent_28%,var(--color-water-light)_50%,transparent_72%)]"
      />

      {/* 动线 G1（flow-audit）：任何状态都有语义出口（稿本身没有此键，属审计授权的动线补丁） */}
      <Link
        to="/river"
        className="inline-flex min-h-11 w-fit items-center gap-2 whitespace-nowrap text-[0.875rem] text-coral underline underline-offset-4"
      >
        <Icon name="ArrowLeft" size={16} />
        回河道
      </Link>

      <header className="enter-rise relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col">
          {/* 元信息用契约的 `.meta` 口径：11px + .24em + paper/50 */}
          <p className="font-latin text-[11px] tracking-[0.24em] text-paper/50">SIDE A · 未刻</p>
          {/* 稿 §1：h1 上距 22px、56px/700/lh1 */}
          <h1 className="mt-[22px] text-[2rem] leading-[1.15] font-bold text-paper md:text-[3.5rem] md:leading-none">
            选一首歌，投出第一棒
          </h1>
          {/* 稿 §1：sub mt16 / max820 / 15.5px / 1.75，单段逐字 */}
          <p className="mt-4 max-w-[820px] text-[0.96875rem] leading-[1.75] text-muted">
            这里每首歌都被切成固定段位（同一位置永远属于同一段，斩浪也不会把后面的段前移）。你录第 1 段，之后交给河道里的陌生人。
          </p>
        </div>

        {catalog.length === 0 ? null : (
          <dl className="flex shrink-0 items-end gap-[38px]">
            <div className="flex flex-col-reverse items-end gap-[8px]">
              <dt className="font-latin text-[11px] tracking-[0.24em] text-paper/50">已切分</dt>
              <dd
                data-testid="stat-cut"
                className="font-latin text-[1.625rem] leading-none text-glass"
              >
                {cutCount}
              </dd>
            </div>
            <div className="flex flex-col-reverse items-end gap-[8px]">
              <dt className="font-latin text-[11px] tracking-[0.24em] text-paper/50">未切分</dt>
              <dd
                data-testid="stat-raw"
                className="font-latin text-[1.625rem] leading-none text-glass"
              >
                {rawCount}
              </dd>
            </div>
          </dl>
        )}
      </header>

      <AsyncBoundary
        query={songs}
        skeleton={
          <div className="flex flex-col gap-4" aria-busy="true">
            <Skeleton height="7rem" width="100%" />
            <Skeleton height="7rem" width="100%" />
          </div>
        }
        emptyWhen={(items) => items.length === 0}
        empty={
          // 稿 §4 状态区（空态行）：dashed 框 + cat 标签「空 态」，逐字照稿
          <div
            data-device="sp-states"
            className="enter-fade rounded-base border border-dashed border-paper/[0.16] px-[14px] py-[9px]"
          >
            <p className="flex gap-[14px] text-[0.78125rem] leading-[1.6] text-muted">
              <span className="shrink-0 font-latin text-[11px] tracking-[0.24em] text-paper/50">
                空 态
              </span>
              <span>
                曲库还没准备好——这一版还没有可选的歌。曲库接入后，这里会出现可以分成 4 段的曲目。
              </span>
            </p>
          </div>
        }
      >
        {(items) => {
          const needle = keyword.trim().toLowerCase();
          const matched =
            needle.length === 0
              ? items
              : items.filter((song) => song.title.toLowerCase().includes(needle));
          return (
            <div className="flex flex-col gap-4">
              {/*
                过滤条 = `/new` 的锚点（`one-screen-check.mjs` 的 375 判据要求它落在首屏内）。
                锚点从"整个列表容器"挪到这条**紧凑**的过滤条上：375 下曲目一多，
                列表下沿必然出首屏，而锚点的语义是"这一页最关键的一块（曲库入口）在首屏"。
              */}
              <div
                data-anchor="new-catalog"
                className="relative flex flex-col gap-3 rounded-base border border-line/20 bg-paper/[0.035] p-3 sm:flex-row sm:items-center sm:gap-4"
              >
                <label
                  htmlFor={filterId}
                  className="absolute -top-4 left-[18px] h-[17px] rounded-t-base border border-hairline border-b-0 bg-paper/[0.07] px-3 font-latin text-[11px] leading-4 tracking-[0.24em] text-paper/50"
                >
                  找 歌
                </label>
                <input
                  id={filterId}
                  type="search"
                  value={keyword}
                  placeholder="按曲名过滤"
                  aria-label="按曲名过滤曲库"
                  onChange={(event) => {
                    setKeyword(event.target.value);
                  }}
                  className="min-h-11 w-full min-w-0 flex-1 border-b border-paper/24 bg-transparent px-3 text-[0.9375rem] text-paper placeholder:text-muted focus:outline-none focus:border-glass focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
                />
                <span className="shrink-0 font-latin text-[0.75rem] text-muted">
                  {matched.length === items.length
                    ? `曲库共 ${String(items.length)} 首`
                    : `匹配 ${String(matched.length)} / ${String(items.length)} 首`}
                </span>
              </div>

              {matched.length === 0 ? (
                /* 稿 §4 状态区（无匹配行）：dashed 框 + cat 标签，正文带真 query */
                <div
                  data-device="sp-states"
                  className="enter-fade rounded-base border border-dashed border-paper/[0.16] px-[14px] py-[9px]"
                >
                  <p className="flex gap-[14px] text-[0.78125rem] leading-[1.6] text-muted">
                    <span className="shrink-0 font-latin text-[11px] tracking-[0.24em] text-paper/50">
                      无匹配
                    </span>
                    <span>曲库里没有名字含「{keyword}」的歌，换个词试试。</span>
                  </p>
                </div>
              ) : (
                /* 五格翻页箱：桌面五格对齐成"水位对照"，窄屏折单列（盆宽上限 260 ⇒ 比例不变） */
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {matched.map((song, songIndex) => {
                    const firstSegment = song.segments[0];
                    const seconds =
                      firstSegment === undefined
                        ? null
                        : Math.round(firstSegment.durationMs / 1000);
                    /**
                     * 【用户可见缺陷】`segments` 为空 = 这首歌没有切分/预设
                     * （服务端侧有 fail-closed 兜底：无预设拒绝录制）。
                     * 如果这里不挡，用户会一路到草稿里卡死：建了空草稿 → 录制被拒 → 无路可走。
                     * 处置方式是**禁用 + 在行内写明理由**（不静默隐藏：用户要知道它存在、以及为什么不能选）。
                     * 在浅盆上，它就是**干盆**（见底 + 沟槽全虚线 + 水位本该到的那条虚线弧）。
                     */
                    const startable = song.segments.length > 0;
                    return (
                      <li key={song.id} className={`flex enter-rise stagger-${Math.min(songIndex + 1, 4)}`}>
                        <article className="relative flex w-full min-w-0 flex-col gap-3 pt-3 pb-1">
                          <BayFrame edgeTop={EDGE_TILT[songIndex % EDGE_TILT.length] ?? 0} />

                          <h2
                            className="truncate text-[1.0625rem] font-bold text-paper"
                            title={song.title}
                          >
                            {song.title}
                          </h2>

                          <p className="flex flex-wrap items-baseline">
                            <span className="font-latin text-[0.71875rem] text-muted">
                              {song.totalSegments} 段
                            </span>
                            {seconds === null ? null : (
                              <>
                                <span
                                  aria-hidden="true"
                                  className="mx-[9px] inline-block h-[10px] w-px bg-paper/[0.18] align-[-1px]"
                                />
                                <span className="font-latin text-[0.71875rem] text-muted">
                                  每段约 {String(seconds)} 秒
                                </span>
                              </>
                            )}
                          </p>
                          <p className="font-latin text-[0.71875rem] break-all text-muted">
                            来源 {song.licensedSource}
                          </p>

                          <Button
                            variant="ghost"
                            /* W18.5 · B6：热区不再靠 `before:-inset-y-1.5` 外扩。
                               伪元素撑出来的可点范围不参与布局，父级一旦有 transform
                               参照系就会变，用户会点到"看起来不是这里"的地方；
                               而且键盘用户根本拿不到这多出来的 6px。
                               现在是真实盒高 min-h-11（44px），视觉密度靠内部排版保持。 */
                            className="min-h-11 justify-center border border-paper/25 bg-paper/[0.03] px-3 text-[0.78125rem] leading-tight text-paper hover:border-glass hover:text-glass disabled:border-dashed disabled:border-paper/[0.14] disabled:text-muted"
                            loading={create.isPending}
                            disabled={!startable}
                            icon={<Icon name="Mic" size={16} />}
                            onClick={() => {
                              // 「我参与过的漂流瓶」由服务端 `GET /api/me/bottles` 提供（t19），
                              // 页面不再写任何本机书签 —— 少一处"第二真相"。
                              void create
                                .mutateAsync({ songId: song.id })
                                .then((bottle) => {
                                  navigate(`/bottles/${bottle.id}`);
                                })
                                .catch(() => undefined);
                            }}
                          >
                            {startable ? '选这首，录第 1 段' : '暂不可发起'}
                          </Button>

                          {/* 稿 §7 .note：干盆理由在按钮下方、无图标、warm 色（原在上方带图标，按稿回改） */}
                          {startable ? null : (
                            <p className="text-[0.78125rem] leading-[1.5] text-warm">
                              这首还没有切分，暂不能发起
                            </p>
                          )}

                          <WaterBasin
                            cut={song.segments.length}
                            total={song.totalSegments}
                            tilt={BASIN_TILT[songIndex % BASIN_TILT.length] ?? 0}
                          />
                        </article>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        }}
      </AsyncBoundary>

      {create.isError ? <ConflictNotice error={create.error} retryLabel="再试一次" /> : null}

      {/* 页脚（稿 §9）：12.5px 右对齐、无任何线；未登录底注带「先登录」出口（动线 G8）
          「先登录」是**行内**链接，而 design-discipline 契约要求页面级链接可点目标
          ≥44px（`min-h-11`）。但 44px 的行内盒子会把 12.5px 段落的行盒从 20px 撑到 44px，
          整条底注涨成 64px —— 900 高的窗口里底注底部（正是用户反馈"底部提示看不见"的
          那块）被推出首屏。
          处置：**不降契约**（可点目标仍 44px），改用 `-my-[12px]` 把它在版面上的
          贡献抵消回 20px 行盒：负外边距不缩小元素本身，只收回它对行高/块高的贡献，
          于是"44px 好点"与"底注不撑高"两件事同时成立。 */}
      <p className="text-[0.78125rem] leading-[1.6] text-muted md:mt-auto md:self-end md:text-right">
        {session.status === 'authed' ? (
          '发起之后你会拿到这支瓶子的匿名代号；别人看到的是代号，不是你的账号。'
        ) : (
          <>
            发起需要登录：
            <Link
              to={'/login?next=' + encodeURIComponent('/new')}
              className="inline-flex min-h-11 -my-[12px] items-center whitespace-nowrap text-glass underline underline-offset-4"
            >
              先登录
            </Link>
            ：账号只用来认领你自己的漂流瓶，别人看到的是每个瓶子单独的匿名代号。
          </>
        )}
      </p>
    </div>
  );
}
