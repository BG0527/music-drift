/**
 * 公海大厅（record-v1 设计稿 `p-sea-hall` 落地）：
 * 静海水线 + 涟漪内圈 4 段断弧（断=缺口，一圈 = 4 个段位）+ 六支跨骑水线、到岸的瓶。
 *
 * 契约语义（ADR-015 §16.4，保持不变）：
 * - **默认只看已完成区**（完整作品）；未完成作品必须显式切到「等待接力」分区；
 * - 未完成作品**标注缺口**，不伪装成完整作品（瓶子沉到水线以下、状态转暖）；
 * - 列表栅格 2/3 列（`md:grid-cols-2 lg:grid-cols-3`）—— 这是作品画廊，
 *   不是 `DESIGN.md` 禁止的"3 等宽 feature 列"。
 *
 * 纪律：颜色只取 theme.css 的 `--color-*` token（SVG 里用 `var()`，与 `wave.tsx` 同法）；
 * 装置全是装饰 ⇒ `aria-hidden`；数据只来自 `useSeaPages`（不造假数据、不请求 total）。
 */
import { useState } from 'react';
import type { BottleSummary } from '@music-drift/shared';
import { useSeaPages } from '../features/api/queries';
import { progressLabel, BOTTLE_STATUS_LABEL } from '../features/bottle/relay-status';
import {
  BottleMark,
  EmptyState,
  Icon,
  Skeleton,
  Tabs,
  TideLine,
  WaterSheen,
  WaterTexture,
  cn,
} from '../design-system';
import { AsyncBoundary } from './shell/async-boundary';
import { Link } from './shell/router';
import { buildPath } from './shell/routes';
import { TEXT_LINK } from './shell/link-styles';
import { formatOccurredAt } from '../features/bottle/drift-events';

type Zone = 'COMPLETED' | 'INCOMPLETE';

/**
 * 首屏一页多少支（§46.3）：6 支 = 2 行 × 3 列，加上标题/分区列仍在一屏内；
 * 更多的靠服务端游标（`cursor` 进 / `nextCursor` 出）逐页拿。
 */
const SEA_PAGE_SIZE = 6;

/**
 * 空态 / 次级动作链接：基于 `TEXT_LINK`（自带 nowrap + min-h-11，design-discipline 守卫的两种机制之一），
 * 叠设计稿 .listen / .empty a 的语态（glass 文字、13px、下划线偏移 4）。
 * 常量名里带 `TEXT_LINK` 是守卫的静态判据（它扫 className 字面量）。
 */
const SEA_TEXT_LINK = cn(
  TEXT_LINK,
  'self-start text-[0.8125rem] font-normal text-glass underline-offset-4',
);

export function SeaPage() {
  const [zone, setZone] = useState<Zone>('COMPLETED');

  return (
    <div className="relative isolate flex flex-col gap-6">
      {/* 整页母题（t44/t46 守卫 + 用户点名「漂流瓶」）：全部绝对定位 ⇒ 零布局高度，不进文档流 */}
      <WaterSheen tone="light" className="bottom-auto h-[220px]" />
      <WaterTexture tone="light" drift />
      <header className="relative flex flex-col gap-3 pb-[12px]">
        {/* 页头瓶子：漂在海面右侧（大屏/小屏两档，绝对定位零布局） */}
        <BottleMark
          size={64}
          className="absolute right-0 -bottom-[10px] hidden text-coral md:block"
        />
        <BottleMark size={40} className="absolute right-0 -bottom-[6px] text-coral md:hidden" />
        <p className="text-[0.6875rem] tracking-[0.24em] text-paper/50">CATALOGUE OF THE OPEN SEA</p>
        {/* 海图分隔线：一条极淡细线 + 左端 88px coral 段（设计稿 .rule）；装饰 ⇒ aria-hidden */}
        <div className="relative h-px w-full bg-line/10" aria-hidden="true">
          <span className="absolute left-0 top-0 h-px w-[88px] bg-coral" />
        </div>
        <h1 className="text-[clamp(2.5rem,6vw,3.75rem)] font-bold leading-none text-paper">
          公海大厅
        </h1>
        <p className="max-w-[32.75rem] text-[0.9375rem] leading-[1.9] text-muted">
          聆听那些经历漂流与合唱、完全绽放的终极乐章。作品一旦入海就不再漂流 —— 这里只能听，不能接。
        </p>
        {/* 潮线 = 海面边界（本页只留这一条线，航迹是日志页的语义） */}
        <TideLine />
      </header>

      <Tabs
        items={[
          {
            key: 'COMPLETED',
            label: '完整作品',
            content: <SeaZoneList zone="COMPLETED" />,
          },
          {
            key: 'INCOMPLETE',
            label: '等待接力',
            content: <SeaZoneList zone="INCOMPLETE" />,
          },
        ]}
        value={zone}
        onChange={(key) => {
          setZone(key === 'INCOMPLETE' ? 'INCOMPLETE' : 'COMPLETED');
        }}
      />
    </div>
  );
}

function SeaZoneList({ zone }: { zone: Zone }) {
  /**
   * **页码式分页**（用户第十三轮 ②），但**不新增第二套分页语义**：
   *
   * - 后端只有 cursor/keyset ⇒ 前端把「页码」当作**游标链上的索引**：
   *   第 N 页 = 从第 1 页开始依次 `fetchNextPage()` 推进游标到第 N 页；
   *   回看前面的页 = 直接用 `useInfiniteQuery` 已经缓存的那一页（不再发请求）；
   * - 页码数 = **已取页数 + (hasNextPage ? 1 : 0)** —— 不请求 `total`、不造 offset，
   *   所以"第 3 页"只在游标真的走得到时才出现（`nextCursor === null` 时不会凭空多一页）；
   * - 每一页仍然只显示**这一页**的作品（不是「加载更多」那种追加）。
   */
  const sea = useSeaPages(zone, SEA_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [fetchingToPage, setFetchingToPage] = useState<number | null>(null);
  const fetchedPages = sea.data?.pages.length ?? 0;
  const pageCount = fetchedPages + (sea.hasNextPage ? 1 : 0);

  /**
   * 去第 N 页。
   *
   * 已取到的页 ⇒ 直接用缓存（不发请求）。
   * 没取到的页 ⇒ 在**点击事件里**逐页推进游标（不用 effect：effect 里同步 setState 会级联渲染，
   * 仓库 lint 也会拦）。每一轮都看 `fetchNextPage()` 的返回结果，页数没涨就停（不会空转）。
   */
  const goToPage = (target: number): void => {
    if (target === page) return;
    if (target <= fetchedPages) {
      setPage(target);
      return;
    }
    setFetchingToPage(target);
    void (async () => {
      let have = fetchedPages;
      while (have < target) {
        const result = await sea.fetchNextPage();
        const nextCount = result.data?.pages.length ?? have;
        if (nextCount <= have) break; // 没有下一页了：停下来（界面按实际页数收敛）
        have = nextCount;
      }
      setPage(Math.min(target, Math.max(have, 1)));
      setFetchingToPage(null);
    })();
  };

  const current = sea.data?.pages[page - 1];
  const items = current?.items ?? [];

  return (
    <AsyncBoundary
      query={{
        isPending: sea.isPending,
        isError: sea.isError,
        error: sea.error,
        data: sea.isPending ? undefined : items,
        refetch: sea.refetch,
      }}
      skeleton={
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          <Skeleton height="14rem" width="100%" />
          <Skeleton height="14rem" width="100%" />
          <Skeleton height="14rem" width="100%" />
        </div>
      }
      emptyWhen={(list) => list.length === 0}
      empty={
        zone === 'COMPLETED' ? (
          <EmptyState
            icon="Ship"
            title="还没有完整的作品"
            description="完整作品要等每个段位都有人唱过之后，由持有者送进公海。"
            action={
              <Link to="/river" className={SEA_TEXT_LINK}>
                去河道捞一个
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon="CircleDashed"
            title="没有等待接力的作品"
            description="这里的作品都还差几个段位，等着有人补上——补完才会进完整作品区。"
            action={
              <Link to="/river" className={SEA_TEXT_LINK}>
                去河道捞一个
              </Link>
            }
          />
        )
      }
    >
      {(list) => (
        <div className="flex flex-col gap-5" data-anchor="sea-list">
          <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {list.map((bottle, index) => (
              <li
                key={bottle.id}
                // guidance（motion-web §1「新内容入场」）：交错取模 4，保持「等距且小」的延迟
                className={`enter-rise stagger-${String((index % 4) + 1)}`}
              >
                <SeaBottleEntry bottle={bottle} />
              </li>
            ))}
          </ul>

          <nav aria-label="分页" className="flex flex-wrap items-center gap-[8px]">
            {Array.from({ length: pageCount }, (_unused, offset) => offset + 1).map((number) => {
              const active = number === page;
              return (
                <button
                  key={number}
                  type="button"
                  aria-label={`第 ${String(number)} 页`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => {
                    goToPage(number);
                  }}
                  className={cn(
                    'flex h-[44px] min-h-[44px] min-w-[44px] items-center justify-center rounded-pill px-[12px] text-[0.875rem] transition-transform duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)]',
                    fetchingToPage === number ? 'opacity-60' : '',
                    active
                      ? 'bg-coral font-semibold text-ink'
                      : 'border border-line/25 text-muted hover:text-paper',
                  )}
                >
                  {number}
                </button>
              );
            })}
            <p className="ml-[8px] text-[0.875rem] text-muted">
              {sea.hasNextPage
                ? `第 ${String(page)} 页 · 后面还有更多`
                : `共 ${String(fetchedPages)} 页`}
            </p>
          </nav>
        </div>
      )}
    </AsyncBoundary>
  );
}

/** 一支到岸的瓶：装置（水线/涟漪/瓶）+ 文字条目（曲名 → 进度 → 状态 → 时间 → 听）。 */
function SeaBottleEntry({ bottle }: { bottle: BottleSummary }) {
  const gap =
    bottle.missingSegmentIndexes.length === 0
      ? null
      : `缺第 ${bottle.missingSegmentIndexes.join('、')} 段`;
  const waiting = bottle.seaZone === 'INCOMPLETE';

  return (
    <div className="flex h-full flex-col gap-2">
      {/* 等待接力 = 还没浮上来：瓶子沉到水线以下（设计稿 .col.wait，+26px） */}
      <CalmBottleDevice uid={bottle.id} sink={waiting} />

      <div className="flex items-start justify-between gap-2">
        <p className="text-[1.0625rem] font-semibold leading-[1.35] text-paper">
          {bottle.songTitle}
        </p>
        <span className="shrink-0 rounded-base border border-line/25 bg-water-void px-[10px] py-[4px] text-[0.75rem] text-paper">
          {waiting ? '等待接力' : BOTTLE_STATUS_LABEL[bottle.status]}
        </span>
      </div>

      <p className="text-[0.8125rem] leading-[1.6] text-muted">{progressLabel(bottle)}</p>

      {gap === null ? (
        <p className="flex items-center gap-2 text-[0.8125rem] text-glass">
          <Icon name="CheckCircle2" size={16} />
          全部段位都有人唱过
        </p>
      ) : (
        <p className="flex items-center gap-2 text-[0.8125rem] text-warm">
          <Icon name="CircleDashed" size={16} />
          {gap}（成品里这段时间是静音）
        </p>
      )}

      <p className="text-[0.71875rem] leading-[1.6] text-muted/75">
        最近更新 {formatOccurredAt(bottle.updatedAt)}
      </p>

      <Link to={buildPath('bottle', { id: bottle.id })} className={cn(SEA_TEXT_LINK, 'mt-auto')}>
        听这支作品
      </Link>
    </div>
  );
}

/**
 * 「到岸的瓶」装置（设计稿 p-sea-hall 的 surface / rings / fleet 三族 SVG 参数）：
 *
 * - **静海水线**：一条缓波（y≈120），宽软光带（stroke 26 @ .09）+ 1px 实线
 *   （water-deep/water-mid 渐变）+ 几点碎光；
 * - **涟漪**：外圈散点（dasharray 26 24 26 24）+ **内圈 4 段断弧**
 *   （`pathLength=100`、`stroke-dasharray="18 7"` ⇒ 100/(18+7)=4 段弧、4 个断口 = 4 个段位）；
 * - **瓶**：玻璃轮廓（clip 多边形折线）+ 木塞 + 五根音符条 + 水下的一截被压暗，
 *   96/124 在水上、28 在水下 ⇒ 跨骑水线；`sink` 时整瓶下沉 26px（等待接力）。
 *
 * 全是装饰 ⇒ 整个 SVG `aria-hidden`；每支瓶一套 `--color-*` token 渐变（`var()` 不内联 hex）。
 */
function CalmBottleDevice({ uid, sink }: { uid: string; sink: boolean }) {
  const id = (part: string) => `sea-${uid}-${part}`;
  const waterline = 'M0 119.5 L52 121.6 L104 123 L156 122.2 L208 120.3 L260 118.4';

  return (
    <svg
      viewBox="0 0 260 180"
      className="block h-auto w-full"
      fill="none"
      aria-hidden="true"
      data-part="device"
    >
      <defs>
        <linearGradient id={id('wl')} x1="0" y1="0" x2="260" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--color-water-deep)" stopOpacity=".16" />
          <stop offset=".2" stopColor="var(--color-water-mid)" stopOpacity=".58" />
          <stop offset=".44" stopColor="var(--color-water-deep)" stopOpacity=".74" />
          <stop offset=".7" stopColor="var(--color-water-mid)" stopOpacity=".34" />
          <stop offset="1" stopColor="var(--color-water-deep)" stopOpacity=".11" />
        </linearGradient>
        <linearGradient id={id('rip')} x1="0" y1="88" x2="0" y2="148" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--color-glass)" stopOpacity=".3" />
          <stop offset=".52" stopColor="var(--color-glass)" stopOpacity=".62" />
          <stop offset="1" stopColor="var(--color-glass)" stopOpacity=".9" />
        </linearGradient>
        <linearGradient id={id('glass')} x1="0" y1="0" x2="60" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset=".026" stopColor="var(--color-water-mid)" stopOpacity=".46" />
          <stop offset=".17" stopColor="var(--color-water-bed)" stopOpacity=".5" />
          <stop offset=".62" stopColor="var(--color-water-void)" stopOpacity=".82" />
          <stop offset=".96" stopColor="var(--color-glass)" stopOpacity=".3" />
          <stop offset="1" stopColor="var(--color-water-mid)" stopOpacity=".34" />
        </linearGradient>
        <linearGradient id={id('sub')} x1="0" y1="96" x2="0" y2="124" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--color-water-void)" stopOpacity=".3" />
          <stop offset="1" stopColor="var(--color-water-void)" stopOpacity=".62" />
        </linearGradient>
        <linearGradient id={id('cork')} x1="0" y1="0" x2="0" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--color-warm)" stopOpacity=".44" />
          <stop offset="1" stopColor="var(--color-warm)" stopOpacity=".24" />
        </linearGradient>
        <linearGradient id={id('sound')} x1="0" y1="148" x2="0" y2="176" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--color-paper)" stopOpacity=".17" />
          <stop offset="1" stopColor="var(--color-paper)" stopOpacity=".05" />
        </linearGradient>
      </defs>

      {/* 静海水线：宽软光带 + 1px 实线 + 水面碎光 */}
      <path data-part="waterline" d={waterline} stroke={`url(#${id('wl')})`} strokeWidth="26" opacity=".09" />
      <path d={waterline} stroke={`url(#${id('wl')})`} strokeWidth="1.1" />
      <g stroke="var(--color-water-deep)" strokeWidth="1.4">
        <path d="M46 120.9 L84 122.5" opacity=".42" />
        <path d="M150 122.5 L186 121.5" opacity=".32" />
        <path d="M214 119.8 L246 118.9" opacity=".3" />
      </g>

      {/* 涟漪：外圈散点（不是刻度）+ 内圈 4 段断弧（断 = 缺口 = 段位） */}
      <ellipse
        data-part="ripple-outer"
        cx="130"
        cy="120"
        rx="106"
        ry="42"
        pathLength="100"
        stroke="var(--color-glass)"
        strokeOpacity=".22"
        strokeWidth="1"
        strokeDasharray="26 24 26 24"
        strokeDashoffset="-12"
      />
      <ellipse
        data-part="ripple-inner"
        cx="130"
        cy="118"
        rx="76"
        ry="30"
        pathLength="100"
        stroke={`url(#${id('rip')})`}
        strokeWidth="1.5"
        strokeDasharray="18 7"
      />

      {/* 测深线：从涟漪环下缘垂到条目 */}
      <path d="M130 148 V176" stroke={`url(#${id('sound')})`} strokeWidth="1" />
      <path d="M127.5 176 H133" stroke="var(--color-paper)" strokeOpacity=".22" strokeWidth="1" />

      {/* 瓶：木塞 + 玻璃 + 音符条 + 水下的一截（压暗并在水线上留一道印子） */}
      <g data-part="bottle" transform={`translate(100 ${sink ? 50 : 24})`}>
        <rect data-part="cork" x="16" y="0" width="28" height="18" rx="2" fill={`url(#${id('cork')})`} />
        <path
          d="M8.4 124 L8.4 61.46 L20.4 37.86 L20.4 14.26 L39.6 14.26 L39.6 37.86 L51.6 61.46 L51.6 124 Z"
          fill={`url(#${id('glass')})`}
        />
        <g fill="var(--color-water-mid)" fillOpacity=".38">
          <rect x="16.2" y="77" width="3.12" height="5" />
          <rect x="22.32" y="70" width="3.12" height="12" />
          <rect x="28.44" y="65" width="3.12" height="17" />
          <rect x="34.56" y="72" width="3.12" height="10" />
          <rect x="40.68" y="76" width="3.12" height="6" />
        </g>
        <path d="M8.4 96 H51.6 V124 H8.4 Z" fill={`url(#${id('sub')})`} />
        <path d="M8.4 96 H51.6" stroke="var(--color-water-mid)" strokeOpacity=".32" strokeWidth="1" />
      </g>
    </svg>
  );
}
