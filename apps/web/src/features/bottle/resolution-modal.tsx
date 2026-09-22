/**
 * 去向三选一（CONTEXT §3.3）——模态实现。
 *
 * 三条纪律：
 * 1. **可选值来自服务端** `availableResolutions`（顺序即展示顺序）：发起者投河时没有"回传"、
 *    末段录满之后不能"继续投河"，这些判断都在内核里，前端不许自己猜；
 * 2. **未选去向时"确认投递"禁用**（不让用户点一下才知道）；
 * 3. 提交失败（409 / 422）**留在模态里就地解释**，不关掉模态、不丢用户的选择。
 */
import { useState } from 'react';
import type { Resolution } from '@music-drift/shared';
import { Button, Icon, Modal, cn } from '../../design-system';
import { ConflictNotice } from './conflict-notice';
import { resolutionCopy } from './relay-status';

export interface ResolutionModalProps {
  open: boolean;
  available: readonly Resolution[];
  onCancel: () => void;
  onConfirm: (resolution: Resolution) => void;
  /**
   * 当前处在流程的哪一步：决定标题/副标题的口径。
   * - `FIRST_CAST`：发起者录完第 1 段的**投河确认**（"交给下一位"的语义）；
   * - `RELAY`：接唱完成后的去向三选一。
   */
  stage?: 'FIRST_CAST' | 'RELAY';
  /** 头部一行状态（例如「接力第 2 棒 · 第 3 段已录好」）。 */
  stageLabel?: string;
  /** 冲突提示里的「看一眼漂流日志」需要知道是哪个瓶子。 */
  bottleId?: string | undefined;
  busy?: boolean;
  error?: unknown;
}

const CARD_ICON: Record<Resolution, 'Waves' | 'RotateCcw' | 'Ship'> = {
  RIVER: 'Waves',
  RETURN: 'RotateCcw',
  SEA: 'Ship',
};

export function ResolutionModal({
  open,
  available,
  onCancel,
  onConfirm,
  stageLabel,
  stage = 'RELAY',
  bottleId,
  busy = false,
  error,
}: ResolutionModalProps) {
  const [selected, setSelected] = useState<Resolution | null>(null);
  const options = [...available];

  return (
    <Modal
      open={open}
      title={stage === 'FIRST_CAST' ? '确认投河' : '选择声音去向'}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            取消并返回
          </Button>
          <Button
            variant="primary"
            disabled={selected === null}
            loading={busy}
            onClick={() => {
              if (selected !== null) onConfirm(selected);
            }}
          >
            确认投递
          </Button>
        </>
      }
    >
      <p className="text-[0.9375rem] leading-[1.6] text-slate-current">
        {stage === 'FIRST_CAST'
          ? '第 1 段已经录好了。投河之后就交出去了：只有下一位捞到的人能听到它，你可以在漂流日志里看它漂到哪了。'
          : '接力乐章已就绪，你的声音将驶向何方？'}
        {stageLabel === undefined ? null : `（${stageLabel}）`}
      </p>

      {error === undefined ? null : <ConflictNotice error={error} bottleId={bottleId} />}

      {options.length === 0 ? (
        <p role="status" className="text-[0.875rem] leading-[1.6] text-slate-current">
          现在还不能选择去向：先录一段，或者等当前这一步完成。
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {options.map((resolution) => {
            const copy = resolutionCopy(resolution);
            const isSelected = selected === resolution;
            return (
              <button
                key={resolution}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  setSelected(resolution);
                }}
                className={cn(
                  'flex min-h-11 flex-col items-start gap-3 rounded-base border p-4 text-left',
                  'focus-visible:ring-2 focus-visible:ring-peacock focus-visible:ring-offset-2 focus-visible:ring-offset-foam',
                  isSelected
                    ? 'border-peacock bg-info-tint'
                    : 'border-driftline bg-wave-white hover:bg-info-tint',
                )}
              >
                <span
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-full',
                    isSelected ? 'bg-peacock text-wave-white' : 'bg-tide-pool text-peacock',
                  )}
                >
                  <Icon name={CARD_ICON[resolution]} size={20} />
                </span>
                <span className="text-[1rem] font-semibold text-abyss">{copy.title}</span>
                <span className="text-[0.875rem] leading-[1.6] text-slate-current">
                  {copy.detail}
                </span>
                <span className="text-[0.8125rem] font-medium text-peacock">
                  {isSelected ? '已选择' : '选择这一项'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
