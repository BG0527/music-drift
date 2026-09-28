/**
 * 私密留言（CONTEXT §5 / §5.2；用户第 4 条 + t42 后的新口径）。
 *
 * 规则（t42 起，服务端为准）：
 * 1. **收件人由发送者按段号指定**：`POST /api/bottles/:id/messages { content, targetSegmentIndex }`，
 *    服务端按 1-based 段号解析作者。用户第 4 条：「可以指定之前段的某一个人发起」⇒
 *    候选 = **我自己那一段之前的有效段**（服务端给的段列表与代号，前端不自造可见性规则）；
 * 2. **只有目标看得到内容**（内核 `visibleMessagesFor`）。所以这里只渲染
 *    `GET /api/bottles/:id/messages` 返回的东西 —— **前端不筛、不猜**（筛一遍就是第二份真相）；
 * 3. **送达时刻**：目标**这一轮持有瓶子**即 `DELIVERED`；
 *    三种失败（目标段被斩 / 瓶子损坏·父链断裂 / 整首完成入海仍没到）⇒ `UNDELIVERED`，**通知发送者**；
 * 4. **写入口只给"能写的人"**：`canWrite` 由页面按服务端可见事实传入；`false` 时**不渲染表单**
 *    （不摆点了才 4xx 的假控件）。没有"之前段"可选时同样不渲染表单，并说明为什么。
 */
import { useState } from 'react';
import type { PrivateMessage } from '@music-drift/shared';
import { useAttachMessage } from '../api/mutations';
import { useBottle, useBottleMessages } from '../api/queries';
import { AsyncBoundary } from '../../pages/shell/async-boundary';
import { ConflictNotice } from './conflict-notice';
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
  PENDING: '等它漂到目标手里',
  DELIVERED: '已送达目标',
  UNDELIVERED: '没能送达',
};

const STATUS_STYLE: Record<PrivateMessage['status'], string> = {
  PENDING: 'bg-water-void text-muted',
  DELIVERED: 'bg-info-tint text-info',
  UNDELIVERED: 'bg-warning-tint text-warning',
};

/** 未送达的三种原因（CONTEXT §5.2 / t42）：说清"为什么没到"，而不是只给一个状态码。 */
const UNDELIVERED_REASONS =
  '没能送达的原因有三种：目标那一棒被斩浪删除了；瓶子损坏或回传链断裂，漂不到他那里；' +
  '整首接唱完成并入海，但那一棒始终没接上。';

interface TargetOption {
  index: number;
  ownerCode: string;
}

export function PrivateMessages({ open, bottleId, canWrite, onClose }: PrivateMessagesProps) {
  const messages = useBottleMessages(bottleId, open);
  const bottle = useBottle(open ? bottleId : undefined);
  const attach = useAttachMessage(bottleId);
  const [draft, setDraft] = useState('');
  const [targetIndex, setTargetIndex] = useState('');

  const liveSegments = (bottle.data?.segments ?? []).filter((segment) => segment.deletedAt === null);
  const mySegment = liveSegments.find((segment) => segment.isMine);
  /**
   * 候选 = **我自己那一段之前**的有效段（用户第 4 条："指定之前段的某一个人"）。
   * 用服务端给的 `index` / `ownerCode`；本组件不做任何可见性判断。
   */
  const candidates: TargetOption[] = (
    mySegment === undefined
      ? []
      : liveSegments.filter((segment) => segment.index < mySegment.index)
  ).map((segment) => ({ index: segment.index, ownerCode: segment.ownerCode }));

  const effectiveTarget =
    targetIndex === '' ? (candidates.at(-1)?.index ?? null) : Number(targetIndex);

  const submit = (): void => {
    const content = draft.trim();
    if (content.length === 0 || effectiveTarget === null) return;
    void attach
      .mutateAsync({ content, targetSegmentIndex: effectiveTarget })
      .then(() => {
        setDraft('');
      })
      .catch(() => undefined);
  };

  return (
    <Modal open={open} title="私密留言" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-[0.9375rem] leading-[1.6] text-muted">
          留言只有收件人看得到：你指定之前某一棒的作者，内容会跟着这支瓶子漂到他手里；中间接过棒的人看不到它。
        </p>

        {canWrite ? (
          <AsyncBoundary
            query={bottle}
            skeleton={<div aria-busy="true" className="h-[96px] rounded-base bg-water-void" />}
          >
            {() =>
              candidates.length === 0 ? (
                <p className="rounded-base border border-line/15 bg-ink px-4 py-[10px] text-[0.9375rem] leading-[1.6] text-muted">
                  没有可选的收件人：留言只能发给「之前各段」的作者，而你接的是第 1 段 —— 你前面还没有人唱过。
                </p>
              ) : (
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                  }}
                >
                  <label className="flex flex-col gap-[6px]">
                    <span className="text-[0.875rem] text-muted">送给哪一段的作者</span>
                    <select
                      aria-label="送给哪一段的作者"
                      value={targetIndex === '' ? String(effectiveTarget ?? '') : targetIndex}
                      onChange={(event) => {
                        setTargetIndex(event.target.value);
                      }}
                      className="h-[44px] w-full rounded-base border border-line/15 bg-water-void px-4 text-[0.9375rem] text-paper"
                    >
                      {candidates.map((candidate) => (
                        <option key={candidate.index} value={String(candidate.index)}>
                          第 {candidate.index} 段 · {candidate.ownerCode}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-[6px]">
                    <span className="text-[0.875rem] text-muted">写一句给这一段的作者</span>
                    <textarea
                      aria-label="写一句给这一段的作者"
                      value={draft}
                      rows={3}
                      maxLength={500}
                      onChange={(event) => {
                        setDraft(event.target.value);
                      }}
                      className="w-full resize-none rounded-base border border-line/15 bg-water-void px-4 py-[10px] text-[0.9375rem] text-paper"
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
                    <span className="text-[0.8125rem] text-muted">
                      瓶子还在漂流时都能写；它漂到收件人手里那一刻才算送达。
                    </span>
                  </div>
                </form>
              )
            }
          </AsyncBoundary>
        ) : null}

        {/*
          失败走**既有机制**（`features/api/errors` → `ConflictNotice`）：中文标题 + 服务端那句具体说明 + 出口动作。
          422 `MESSAGE_TARGET_NOT_AVAILABLE`（目标段无效 / 是你自己写的）与 400 `INVALID_BODY` 都在这条路上。
        */}
        {attach.isError ? <ConflictNotice error={attach.error} /> : null}

        <AsyncBoundary
          query={messages}
          skeleton={<div aria-busy="true" className="h-[64px] rounded-base bg-water-void" />}
          emptyWhen={(items) => items.length === 0}
          empty={
            <p className="rounded-base border border-line/15 bg-ink px-4 py-[10px] text-[0.9375rem] text-muted">
              {canWrite
                ? '还没有留言。你写的会在这支瓶子漂到收件人手里之后显示给他。'
                : '看不到任何留言：只有收件人和发送者能读到这些内容。'}
            </p>
          }
        >
          {(items) => (
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-[6px] rounded-base border border-line/15 bg-ink px-4 py-[10px]"
                >
                  <p className="text-[0.9375rem] leading-[1.6] text-paper">{item.content}</p>
                  <p className="flex flex-wrap items-center gap-x-[12px] text-[0.8125rem]">
                    <span className="text-muted">
                      {item.sender.displayName} → {item.recipient.displayName}
                    </span>
                    <span className={cn('rounded-base px-3 py-1', STATUS_STYLE[item.status])}>
                      {STATUS_LABEL[item.status]}
                    </span>
                  </p>
                  {item.status === 'UNDELIVERED' ? (
                    <p className="text-[0.8125rem] leading-[1.6] text-warning">
                      {UNDELIVERED_REASONS}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </div>
    </Modal>
  );
}
