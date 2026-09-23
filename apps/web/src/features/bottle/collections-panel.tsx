/**
 * 「我的收藏」弹窗（CONTEXT §8 / `docs/api.md` §2.6）。
 *
 * 设计取舍：
 * 1. **收藏列表只有 id**：服务端 `GET /api/me/collections` 回的是"关系"（`bottleId` + `createdAt`），
 *    曲名要逐条去 `/api/sea/:id` 取。前端**不自己编标题**，也不自己推断"这作品还在不在公海"——
 *    取不到就是取不到（`/api/sea/:id` 对不在公海的作品回 404，`useSeaBottle` 直接失败）；
 * 2. 收藏是**声明式/次要内容**（§46.2）⇒ 只在弹窗里出现，不摊在首屏（否则一屏判据必崩）；
 * 3. 空态给出"在哪里收藏"的出口（去公海大厅），不是一句"暂无数据"。
 */
import { useMyCollections, useSeaBottle } from '../api/queries';
import { progressLabel } from './relay-status';
import { AsyncBoundary } from '../../pages/shell/async-boundary';
import { Link } from '../../pages/shell/router';
import { TEXT_LINK, TEXT_LINK_STRONG } from '../../pages/shell/link-styles';
import { Modal, Skeleton } from '../../design-system';

export interface CollectionsPanelProps {
  open: boolean;
  onClose: () => void;
}

/** 弹窗内最多铺 12 行（**界面预算**，不是数据上限）：服务端最多回 100 条，超出部分明说。 */
const MAX_ROWS = 12;

export function CollectionsPanel({ open, onClose }: CollectionsPanelProps) {
  const collections = useMyCollections(open);
  const visible = (collections.data ?? []).slice(0, MAX_ROWS);

  return (
    <Modal open={open} title="我的收藏" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.9375rem] leading-[1.6] text-slate-current">
          收藏只对已完成并进入公海的作品开放：听到想再听的，把它收起来。
        </p>

        <AsyncBoundary
          query={collections}
          skeleton={<Skeleton height="4rem" width="100%" />}
          emptyWhen={(items) => items.length === 0}
          empty={
            <div className="flex flex-col gap-2">
              <p className="text-[0.9375rem] leading-[1.6] text-slate-current">
                还没有收藏。去公海大厅听一支完整作品，再把它收起来。
              </p>
              <Link to="/sea" className={TEXT_LINK_STRONG}>
                去公海大厅
              </Link>
            </div>
          }
        >
          {(items) => (
            <div className="flex flex-col gap-2">
              <ul className="flex flex-col gap-2">
                {visible.map((item) => (
                  <CollectedRow key={item.bottleId} bottleId={item.bottleId} />
                ))}
              </ul>
              {items.length > visible.length ? (
                <p className="text-[0.8125rem] text-slate-current">
                  收藏共 {items.length} 支，这里先显示最近 {visible.length} 支。
                </p>
              ) : null}
            </div>
          )}
        </AsyncBoundary>
      </div>
    </Modal>
  );
}

function CollectedRow({ bottleId }: { bottleId: string }) {
  const sea = useSeaBottle(bottleId);

  return (
    <li className="flex flex-wrap items-center gap-x-[12px] gap-y-[4px] rounded-base border border-mist bg-foam px-4 py-[8px]">
      {sea.isPending ? (
        <Skeleton height="1.25rem" width="10rem" />
      ) : sea.data === undefined ? (
        // 404 = 这支作品已经不在公海了（被撤下 / 链接失效）。如实说，不显示一个假曲名。
        <span className="text-[0.9375rem] text-slate-current">这支作品已经不在公海了</span>
      ) : (
        <>
          <span className="text-[1rem] font-semibold text-abyss">{sea.data.songTitle}</span>
          <span className="text-[0.875rem] text-slate-current">{progressLabel(sea.data)}</span>
        </>
      )}
      <Link to={`/sea/${bottleId}`} className={`ml-auto ${TEXT_LINK}`}>
        <span className="whitespace-nowrap">听这支作品</span>
      </Link>
    </li>
  );
}
