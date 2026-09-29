/**
 * 公海「等待接力」瓶子的录入口（CONTEXT §6.2 / `docs/api.md` §2.5）。
 *
 * ## 用户裁决：与河道捞起来的瓶子**同形同义**
 * 此前这里摆的是「我来接这一段」，而从河道捞起来的瓶子摆的是「录第 N 段」——
 * 两处形态与措辞都不同，读起来像两种动作。裁决统一成后者：
 * 公海未完成作品也摆「录第 N 段」（N 取服务端给的 `missingSegmentIndexes[0]`，
 * 与河道缺口同源、不由前端推算），点下去先抢占持有权、**紧接着开录**，
 * 也就是"从公海捞起来 = 河道捞起来"同一条路径。
 *
 * 规则不在这里发明：已完成 → `422 BOTTLE_ALREADY_COMPLETE`；本瓶唱过 →
 * `422 ALREADY_SANG_IN_BOTTLE`。所以这个按钮**只由调用方在未完成作品上摆出来**。
 *
 * 失败**必须可见**：被拒时给出服务端的中文原因与出口动作（`ConflictNotice`）——
 * 静默 `catch` 等于"点了没反应"，那是用户看不到错的失败。
 */
import { useState } from 'react';
import type { BottleSummary } from '@music-drift/shared';
import { useNavigate } from '../../pages/shell/router-context';
import { useTakeTargetedSegment } from '../api/mutations';
import { ConflictNotice } from './conflict-notice';
import { Icon } from '../../design-system';

export interface TargetedSegmentButtonProps {
  bottleId: string;
  /**
   * 要录的段号（1-based，来自服务端 `missingSegmentIndexes[0]`）。
   * 传了就摆「录第 N 段」并用共用 CTA 外观；不传则退回旧的「我来接这一段」措辞
   * （仅供还没接上段号上下文的调用点，瓶详情页一律传）。
   */
  segmentIndex?: number | undefined;
  /**
   * 抢占成功后的出口。**默认**导航到瓶详情（自己找录入口）；
   * 瓶详情页传入 `onClaimed`，让"抢占 → 开录"连成一步（与河道一致）。
   */
  onClaimed?: ((summary: BottleSummary) => void) | undefined;
  className?: string;
}

export function TargetedSegmentButton({
  bottleId,
  segmentIndex,
  onClaimed,
  className,
}: TargetedSegmentButtonProps) {
  const navigate = useNavigate();
  const take = useTakeTargetedSegment();
  const [error, setError] = useState<unknown>(null);
  const label =
    segmentIndex === undefined ? '我来接这一段' : `录第 ${String(segmentIndex)} 段`;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        className={`bp-record-cta${className === undefined ? '' : ` ${className}`}`}
        disabled={take.isPending}
        aria-busy={take.isPending ? true : undefined}
        onClick={() => {
          setError(null);
          void take
            .mutateAsync(bottleId)
            .then((summary) => {
              if (onClaimed !== undefined) {
                onClaimed(summary);
                return;
              }
              navigate(`/bottles/${summary.id}`);
            })
            .catch((thrown: unknown) => {
              setError(thrown);
            });
        }}
      >
        <Icon name="Mic" size={16} />
        {take.isPending ? '正在接手…' : label}
      </button>

      {error === null ? null : (
        <ConflictNotice
          error={error}
          onRetry={() => {
            setError(null);
          }}
        />
      )}
    </div>
  );
}
