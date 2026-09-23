/**
 * 公海大厅（Figma `public-sea` 采纳 IA：标题 / 分区筛选 / 作品画廊网格）。
 *
 * 契约语义（ADR-015 §16.4）：
 * - **默认只看已完成区**（完整作品）；未完成作品必须显式切到「等待接力」分区；
 * - 未完成作品**标注缺口**，不伪装成完整作品；
 * - 画廊网格用 2/3 列（`sm:grid-cols-2 xl:grid-cols-3`）—— 这是作品画廊，
 *   不是 `DESIGN.md` 禁止的"3 等宽 feature 列"（参考 `docs/figma/CONFLICTS.md` 采纳清单 #5 的同类裁定）。
 */
import { useState } from 'react';
import type { BottleSummary } from '@music-drift/shared';
import { useSeaPages } from '../features/api/queries';
import { progressLabel, BOTTLE_STATUS_LABEL } from '../features/bottle/relay-status';
import {
  BottleMark,
  WaveDivider,
  Card,
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
import { TEXT_LINK, TEXT_LINK_STRONG } from './shell/link-styles';
import { formatOccurredAt } from '../features/bottle/drift-events';

type Zone = 'COMPLETED' | 'INCOMPLETE';

/**
 * 首屏一页多少支（§46.3）：6 支 = 2 行 × 3 列，加上标题/分区列仍在一屏内；
 * 更多的靠服务端游标（`cursor` 进 / `nextCursor` 出）逐页拿。
 */
const SEA_PAGE_SIZE = 6;

export function SeaPage() {
  const [zone, setZone] = useState<Zone>('COMPLETED');

  return (
    /* 公海大厅 = 本产品的"海面"。整页加一层极淡的水位线肌理（浅底强度上限 0.04）
       + 页头右侧一枚"漂在海面上的瓶子"（BottleMark）+ 页头下沿的潮线与航迹虚线。
       全部绝对定位 ⇒ 零布局高度，不进文档流（一屏是硬门）。 */
    <div className="relative isolate flex flex-col gap-6">
      {/* 可见的"海面"：顶部一条水面带（渐隐光 + 水位线），高度固定 220px 且绝对定位 ⇒ 不进文档流 */}
      <WaterSheen tone="light" className="bottom-auto h-[220px]" />
      <WaterTexture tone="light" />
      <header className="relative flex flex-col gap-2 pb-[12px]">
        <h1 className="text-[1.75rem] font-bold text-abyss">公海大厅</h1>
        <p className="max-w-[46rem] text-[1rem] leading-[1.6] text-slate-current">
          聆听那些经历漂流与合唱、完全绽放的终极乐章。作品一旦入海就不再漂流 —— 这里只能听，不能接。
        </p>
        {/* 漂流瓶母题：瓶子"漂"在页头右侧的水面上（绝对定位，零布局高度） */}
        <BottleMark
          size={64}
          className="absolute right-0 -bottom-[10px] hidden text-peacock md:block"
        />
        <BottleMark
          size={40}
          className="absolute right-0 -bottom-[6px] text-peacock md:hidden"
        />
        {/* 本页头只留潮线（海面边界）；航迹留给"日志"这类路径语义的页面，避免两线叠成"双线" */}
        <TideLine />
      </header>

      {/* 浪线：让"海"一眼看出来（这是 24px 的流内元素，/sea 首屏有余量，见 t44 实测） */}
      <WaveDivider className="-my-[10px] text-lagoon/60" />

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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          <Skeleton height="9rem" width="100%" />
          <Skeleton height="9rem" width="100%" />
          <Skeleton height="9rem" width="100%" />
        </div>
      }
      emptyWhen={(list) => list.length === 0}
      empty={
        zone === 'COMPLETED' ? (
          <div className="relative isolate">
            {/* 空状态：一只漂在公海上的瓶子（用户点名"漂流瓶"母题；绝对定位，不压正文） */}
            <BottleMark
              size={72}
              className="absolute left-1/2 top-0 -translate-x-1/2 text-peacock/70"
            />
            <EmptyState
              icon="Ship"
              title="还没有完整的作品"
              description="完整作品要等每个段位都有人唱过之后，由持有者送进公海。可以去河道捞一个，自己把它补完。"
              action={
                <Link to="/river" className={TEXT_LINK_STRONG}>
                  去河道捞一个
                </Link>
              }
            />
          </div>
        ) : (
          <EmptyState
            icon="CircleDashed"
            title="没有等待接力的作品"
            description="这里的作品都还差几个段位，等着有人补上——补完才会进完整作品区。"
            action={
              <Link to="/river" className={TEXT_LINK_STRONG}>
                去河道捞一个
              </Link>
            }
          />
        )
      }
    >
      {(list) => (
        <div className="flex flex-col gap-4" data-anchor="sea-list">
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((bottle, index) => (
              <li
                key={bottle.id}
                // guidance（motion-web §1「新内容入场」）：交错取模 4，保持「等距且小」的延迟
                className={`enter-rise stagger-${String((index % 4) + 1)}`}
              >
                <SeaBottleCard bottle={bottle} />
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
                      ? 'bg-peacock font-semibold text-wave-white'
                      : 'border border-driftline text-peacock hover:scale-[var(--motion-hover-scale)]',
                  )}
                >
                  {number}
                </button>
              );
            })}
            <p className="ml-[8px] text-[0.875rem] text-slate-current">
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

function SeaBottleCard({ bottle }: { bottle: BottleSummary }) {
  const gap =
    bottle.missingSegmentIndexes.length === 0
      ? null
      : `缺第 ${bottle.missingSegmentIndexes.join('、')} 段`;

  return (
    // 原语：这张卡片曾是 `hover-lift`。但整块**不可点**（可点的是卡内的「听这支作品」链接），
    // 抬起动效会让人以为整卡可点 —— 撤销（t37 审计 M9 的补充：审计当时把这张误判为"可点卡片"，
    // 复核源码后确认同样属"动效承诺了不存在的交互"）。
    <Card className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[1.0625rem] font-semibold text-abyss">{bottle.songTitle}</p>
        <span className="rounded-pill bg-tide-pool px-3 py-1 text-[0.8125rem] text-abyss">
          {bottle.seaZone === 'INCOMPLETE' ? '等待接力' : BOTTLE_STATUS_LABEL[bottle.status]}
        </span>
      </div>

      <p className="text-[0.875rem] leading-[1.6] text-slate-current">{progressLabel(bottle)}</p>

      {gap === null ? (
        <p className="flex items-center gap-2 text-[0.875rem] text-success">
          <Icon name="CheckCircle2" size={16} />
          全部段位都有人唱过
        </p>
      ) : (
        <p className="flex items-center gap-2 text-[0.875rem] text-warning">
          <Icon name="CircleDashed" size={16} />
          {gap}（成品里这段时间是静音）
        </p>
      )}

      <p className="mt-auto flex flex-wrap items-center gap-3 text-[0.875rem]">
        <Link to={`/sea/${bottle.id}`} className={TEXT_LINK}>
          听这支作品
        </Link>
        <span className="text-slate-current">最近更新 {formatOccurredAt(bottle.updatedAt)}</span>
      </p>
    </Card>
  );
}
