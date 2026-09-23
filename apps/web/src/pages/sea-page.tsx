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
import { Button, Card, EmptyState, Icon, Skeleton, Tabs } from '../design-system';
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
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-[1.75rem] font-bold text-abyss">公海大厅</h1>
        <p className="max-w-[46rem] text-[1rem] leading-[1.6] text-slate-current">
          聆听那些经历漂流与合唱、完全绽放的终极乐章。作品一旦入海就不再漂流 —— 这里只能听，不能接。
        </p>
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
  // **真分页**：游标由服务端给，前端只做"追加"。「加载更多」只在
  // `nextCursor !== null` 时出现 —— 没有下一页就不摆一个点了没反应的按钮（禁止假分页）。
  const sea = useSeaPages(zone, SEA_PAGE_SIZE);
  const items = (sea.data?.pages ?? []).flatMap((page) => page.items);

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
                // guidance（motion-web §1「新内容入场」）：原来只有首批 4 张有入场，
                // 「加载更多」追加的第 5 张起是凭空出现。现在每一项都有，
                // 交错取模 4 保持「等距且小」的延迟（§4：不要不等距随机延迟，也不要无限增长的长尾）。
                className={`enter-rise stagger-${String((index % 4) + 1)}`}
              >
                <SeaBottleCard bottle={bottle} />
              </li>
            ))}
          </ul>
          {sea.hasNextPage ? (
            <div className="flex flex-wrap items-center gap-4">
              <Button
                variant="ghost"
                loading={sea.isFetchingNextPage}
                onClick={() => {
                  void sea.fetchNextPage();
                }}
              >
                加载更多作品
              </Button>
              <p className="text-[0.875rem] text-slate-current">
                已经看了 {list.length} 支，公海里还有更多。
              </p>
            </div>
          ) : (
            <p className="text-[0.875rem] text-slate-current">
              一共 {list.length} 支，这就是全部了。
            </p>
          )}
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
