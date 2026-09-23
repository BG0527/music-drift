/**
 * 收藏 / 取消收藏（CONTEXT §8）。
 *
 * 三条规矩：
 * 1. **只对"已完成并在公海"的作品开放**（服务端 `COLLECTION_REQUIRES_FINISHED_WORK`）——
 *    未完成作品在公海未完成区，不可收藏，所以调用方不该在那种页面上摆这个按钮；
 * 2. 状态来自**服务端**：`GET /api/me/collections` 里有这个 id 就是已收藏，前端不自己记；
 * 3. 未登录（收藏列表 401）⇒ **不摆按钮**：收藏属于某个账号，摆一个必然 401 的按钮是假控件。
 */
import { useCollect, useUncollect } from '../api/mutations';
import { useMyCollections } from '../api/queries';
import { Button, Icon } from '../../design-system';

export interface CollectButtonProps {
  bottleId: string;
  className?: string;
}

export function CollectButton({ bottleId, className }: CollectButtonProps) {
  const collections = useMyCollections();
  const collect = useCollect(bottleId);
  const uncollect = useUncollect(bottleId);

  // 未登录 / 加载中 / 请求失败：都不摆按钮（不制造假控件，也不闪一个随后消失的按钮）
  if (collections.data === undefined) return null;

  const collected = collections.data.some((item) => item.bottleId === bottleId);
  const busy = collect.isPending || uncollect.isPending;

  return (
    <Button
      variant="ghost"
      className={className}
      loading={busy}
      aria-pressed={collected}
      icon={<Icon name={collected ? 'CheckCircle2' : 'Anchor'} size={16} />}
      onClick={() => {
        if (collected) {
          void uncollect.mutateAsync().catch(() => undefined);
          return;
        }
        void collect.mutateAsync().catch(() => undefined);
      }}
    >
      {collected ? '取消收藏' : '收藏这支作品'}
    </Button>
  );
}
