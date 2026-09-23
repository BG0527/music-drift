/**
 * 指定接唱（CONTEXT §6.2 / `docs/api.md` §2.5）。
 *
 * 语义：公海**未完成**作品谁都可以点「我来接这一段」——服务端把持有权抢过来交给点击者，
 * 之后就去瓶详情录下一棒（所以成功后**直接导航**到 `/bottles/:id`，不让用户自己再找一遍）。
 *
 * 规则不在这里发明：已完成 → `422 BOTTLE_ALREADY_COMPLETE`；本瓶唱过 → `422 ALREADY_SANG_IN_BOTTLE`。
 * 所以这个按钮**只由调用方在未完成作品上摆出来**（`seaZone === 'INCOMPLETE'`），
 * 摆在不该摆的地方就是给用户一个必然失败的按钮。
 */
import { useNavigate } from '../../pages/shell/router-context';
import { useTakeTargetedSegment } from '../api/mutations';
import { Button, Icon } from '../../design-system';

export interface TargetedSegmentButtonProps {
  bottleId: string;
  className?: string;
}

export function TargetedSegmentButton({ bottleId, className }: TargetedSegmentButtonProps) {
  const navigate = useNavigate();
  const take = useTakeTargetedSegment();

  return (
    <Button
      variant="primary"
      className={className}
      loading={take.isPending}
      icon={<Icon name="Mic" size={16} />}
      onClick={() => {
        void take
          .mutateAsync(bottleId)
          .then((summary) => {
            navigate(`/bottles/${summary.id}`);
          })
          .catch(() => undefined);
      }}
    >
      我来接这一段
    </Button>
  );
}
