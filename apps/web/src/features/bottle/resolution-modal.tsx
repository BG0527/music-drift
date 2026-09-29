/**
 * 去向三选一（CONTEXT §3.3）——模态实现。
 *
 * 三条纪律：
 * 1. **可选值来自服务端** `availableResolutions`（顺序即展示顺序）：发起者投河时没有"回传"、
 *    末段录满之后不能"继续投河"，这些判断都在内核里，前端不许自己猜；
 * 2. **未选去向时"确认投递"禁用**（不让用户点一下才知道）；
 * 3. 提交失败（409 / 422）**留在模态里就地解释**，不关掉模态、不丢用户的选择。
 *
 * record-v1 形态：**一行一个去向**（图标盘 + 名称 + "会发生什么"），选中态用 coral 边框 +
 * coral 淡底 + 实心 coral 盘 —— 颜色之外还有 `aria-pressed` 与「已选择」文字，
 * 不靠颜色单独表达状态。圆角一律 2px（`rounded-base`）。
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
          <Button variant="ghost" className="whitespace-nowrap" onClick={onCancel}>
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
      <p className="text-[0.9375rem] leading-[1.6] text-muted">
        {stage === 'FIRST_CAST'
          ? '第 1 段已经录好了。投河之后就交出去了：只有下一位捞到的人能听到它，你可以在漂流日志里看它漂到哪了。'
          : '接力乐章已就绪，你的声音将驶向何方？'}
        {stageLabel === undefined ? null : `（${stageLabel}）`}
      </p>

      {error === undefined ? null : <ConflictNotice error={error} bottleId={bottleId} />}

      {options.length === 0 ? (
        <p role="status" className="text-[0.875rem] leading-[1.6] text-muted">
          现在还不能选择去向：先录一段，或者等当前这一步完成。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {options.map((resolution) => {
            const copy = resolutionCopy(resolution);
            const isSelected = selected === resolution;
            return (
              <li key={resolution}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelected(resolution);
                  }}
                  className={cn(
                    'flex w-full min-h-11 flex-col gap-[6px] rounded-base border px-4 py-[12px] text-left',
                    'transition-colors duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)]',
                    isSelected
                      ? 'border-coral bg-coral/10'
                      : 'border-line/15 bg-ink hover:border-line/30',
                  )}
                >
                  <span className="flex items-center gap-[12px]">
                    <span
                      className={cn(
                        'flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full border',
                        isSelected ? 'border-coral bg-coral text-ink' : 'border-line/25 text-coral',
                      )}
                    >
                      <Icon name={CARD_ICON[resolution]} size={18} />
                    </span>
                    <span className="text-[1rem] font-semibold text-paper">{copy.title}</span>
                    <span
                      className={cn(
                        'ml-auto shrink-0 text-[0.8125rem] font-medium',
                        // 12% coral 淡底**不算填充** ⇒ 其上的文字用 coral 的提亮档 danger（DESIGN.md §Colors）
                        isSelected ? 'text-danger' : 'text-coral',
                      )}
                    >
                      {isSelected ? '已选择' : '选择这一项'}
                    </span>
                  </span>
                  <span className="text-[0.875rem] leading-[1.6] text-muted">{copy.detail}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
