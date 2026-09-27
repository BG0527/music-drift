/**
 * 徽章弹窗（CONTEXT §10 / ADR-014 裁决 #1：**派生不落库**）。
 *
 * "派生不落库"在界面上的三个具体含义：
 * 1. 数据**只来自** `GET /api/me/badges`（服务端按事件现算）—— 组件不缓存徽章、不写 localStorage/
 *    sessionStorage，也不在客户端记"我拿过什么"；作品被撤下，服务端不再派生，界面自然就少一枚；
 * 2. 每枚徽章都必须能回答"**哪支作品给的**"（链回该作品的漂流日志）；
 * 3. 属于次要内容（§46.2）⇒ 弹窗内展示，不占首屏。
 */
import type { BadgeAward } from '@music-drift/shared';
import { useMyBadges } from '../api/queries';
import { AsyncBoundary } from '../../pages/shell/async-boundary';
import { Link } from '../../pages/shell/router';
import { TEXT_LINK } from '../../pages/shell/link-styles';
import { Icon, Modal, Skeleton } from '../../design-system';

export interface BadgesPanelProps {
  open: boolean;
  onClose: () => void;
}

/** 徽章文案：只做**翻译**（英文枚举 → 中文），语义与判定都在服务端/内核。 */
const BADGE_LABEL: Record<BadgeAward['kind'], { name: string; how: string }> = {
  RETURN_COMPLETED: {
    name: '回传完成',
    how: '你把作品送回了发起者手里（回传链走完，且作品完整）。',
  },
  DRIFT_PARTICIPANT: {
    name: '漂流参与者',
    how: '你接唱过这支作品，它后来入了海。',
  },
};

export function BadgesPanel({ open, onClose }: BadgesPanelProps) {
  const badges = useMyBadges(open);

  return (
    <Modal open={open} title="我的徽章" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.9375rem] leading-[1.6] text-muted">
          徽章是派生的（不落库）：服务端按你参与过的事件当场算出来，作品被撤下就跟着消失。
        </p>

        <AsyncBoundary
          query={badges}
          skeleton={<Skeleton height="3rem" width="100%" />}
          emptyWhen={(items) => items.length === 0}
          empty={
            <p className="rounded-base border border-line/15 bg-ink px-4 py-[10px] text-[0.9375rem] leading-[1.6] text-muted">
              还没有徽章。接唱一支作品并让它入海，或者把一支完整作品回传到发起者手里，就会出现。
            </p>
          }
        >
          {(items) => (
            <ul className="flex flex-col gap-2">
              {items.map((badge) => (
                <li
                  key={`${badge.kind}:${badge.bottleId}`}
                  className="flex flex-wrap items-center gap-x-[12px] gap-y-[4px] rounded-base border border-line/15 bg-ink px-4 py-[10px]"
                >
                  <span className="flex items-center gap-2">
                    <Icon name="CheckCircle2" size={18} />
                    <span className="text-[1rem] font-semibold text-paper">
                      {BADGE_LABEL[badge.kind].name}
                    </span>
                  </span>
                  <span className="text-[0.875rem] leading-[1.6] text-muted">
                    {BADGE_LABEL[badge.kind].how}
                  </span>
                  <Link to={`/bottles/${badge.bottleId}/log`} className={`ml-auto ${TEXT_LINK}`}>
                    <span className="whitespace-nowrap">看这支作品</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </div>
    </Modal>
  );
}
