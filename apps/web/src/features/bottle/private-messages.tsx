/**
 * 私密留言（CONTEXT §5 / §5.2）：**接唱者 → 发起者**的点对点留言，别人不知道它存在。
 *
 * 三条纪律（都在测试里钉住）：
 * 1. **可见性归服务端**：这里只渲染 `GET /api/bottles/:id/messages` 返回的东西。
 *    内核 `visibleMessagesFor` 已经分好类（发起者只看已送达 / 发送者看自己的 / 中间传递者啥也看不到），
 *    组件不重算、不猜 —— 前端筛一遍就是第二份真相；
 * 2. **写入口只给"能写的人"**（内核 `canAttachPrivateMessage`：必须是接唱者、发起者不能给自己留言、
 *    已入海 / 已损坏 / 回传链断裂之后写不了）。`canWrite === false` 时**不渲染表单**，
 *    而不是渲染了再等 4xx；
 * 3. **未送达要说清后果**（§5.2）：标明"没能送达"，并说明为什么（链断了 / 作品已入海）。
 */
import { useState } from 'react';
import type { PrivateMessage } from '@music-drift/shared';
import { useAttachMessage } from '../api/mutations';
import { useBottleMessages } from '../api/queries';
import { AsyncBoundary } from '../../pages/shell/async-boundary';
import { Button, Icon, Modal, cn } from '../../design-system';

export interface PrivateMessagesProps {
  open: boolean;
  bottleId: string;
  /**
   * 我能不能写（由页面按可见事实判断：我在这个瓶子里唱过一段、且它还在漂流）。
   * `false` 时只读。
   */
  canWrite: boolean;
  onClose: () => void;
}

const STATUS_LABEL: Record<PrivateMessage['status'], string> = {
  PENDING: '等它漂到发起者手里',
  DELIVERED: '已送达',
  UNDELIVERED: '没能送达',
};

const STATUS_STYLE: Record<PrivateMessage['status'], string> = {
  PENDING: 'bg-tide-pool text-slate-current',
  DELIVERED: 'bg-info-tint text-peacock',
  UNDELIVERED: 'bg-warning-tint text-warning',
};

export function PrivateMessages({ open, bottleId, canWrite, onClose }: PrivateMessagesProps) {
  const messages = useBottleMessages(bottleId, open);
  const attach = useAttachMessage(bottleId);
  const [draft, setDraft] = useState('');

  const submit = (): void => {
    const content = draft.trim();
    if (content.length === 0) return;
    void attach
      .mutateAsync({ content })
      .then(() => {
        setDraft('');
      })
      .catch(() => undefined);
  };

  return (
    <Modal open={open} title="私密留言" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-[0.9375rem] leading-[1.6] text-slate-current">
          留言只有你和发起者能看到：你写下的每一句都会跟着这支瓶子漂到他手里；中间接过棒的人看不到它。
        </p>

        {canWrite ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label className="flex flex-col gap-[6px]">
              <span className="text-[0.875rem] text-slate-current">写一句给发起者</span>
              <textarea
                aria-label="写一句给发起者"
                value={draft}
                rows={3}
                maxLength={500}
                onChange={(event) => {
                  setDraft(event.target.value);
                }}
                className="w-full resize-none rounded-base border border-mist bg-wave-white px-4 py-[10px] text-[0.9375rem] text-abyss"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                variant="primary"
                loading={attach.isPending}
                disabled={draft.trim().length === 0}
                icon={<Icon name="Send" size={16} />}
              >
                送出留言
              </Button>
              <span className="text-[0.8125rem] text-slate-current">
                作品入海之前都能写；入海之后留言就送不到了。
              </span>
            </div>
            {attach.isError ? (
              <p role="alert" className="text-[0.875rem] leading-[1.6] text-warning">
                这条留言没能送出去，请稍后再试（服务端仍会校验：只有接唱者能写、且瓶子还在漂流）。
              </p>
            ) : null}
          </form>
        ) : null}

        <AsyncBoundary
          query={messages}
          skeleton={<div aria-busy="true" className="h-[64px] rounded-base bg-tide-pool" />}
          emptyWhen={(items) => items.length === 0}
          empty={
            <p className="rounded-base border border-mist bg-foam px-4 py-[10px] text-[0.9375rem] text-slate-current">
              {canWrite
                ? '还没有留言。你写的会在瓶子漂到发起者手里之后显示给他。'
                : '看不到任何留言：中间接棒的人和不在链上的人都读不到这些内容。'}
            </p>
          }
        >
          {(items) => (
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-[6px] rounded-base border border-mist bg-foam px-4 py-[10px]"
                >
                  <p className="text-[0.9375rem] leading-[1.6] text-abyss">{item.content}</p>
                  <p className="flex flex-wrap items-center gap-x-[12px] text-[0.8125rem]">
                    <span className="text-slate-current">
                      给第 {String(item.targetSegmentIndex)} 段的作者
                    </span>
                    <span
                      className={cn('rounded-pill px-3 py-1', STATUS_STYLE[item.status])}
                    >
                      {STATUS_LABEL[item.status]}
                    </span>
                    {item.status === 'UNDELIVERED' ? (
                      <span className="text-[0.8125rem] leading-[1.6] text-warning">
                        没能送达发起者手里（回传链断了，或者作品已经入海）。
                      </span>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </div>
    </Modal>
  );
}
