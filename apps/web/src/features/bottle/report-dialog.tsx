/**
 * 举报对话框（`CONTEXT.md` §8：瓶子 / 唱段 / 留言三类对象共用一套入口）。
 *
 * 产品口径：
 * - **理由必填**（人工审核要看理由），未填时提交禁用 —— 不让用户点了才知道；
 * - 提交成功**明确告知进入人工审核队列**（不承诺处理时长）；
 * - 未登录 / 网络失败 → 就地说明（走 `ConflictNotice`），不静默失败。
 */
import { useState } from 'react';
import { useCreateReport } from '../api/mutations';
import { Button, Input, Modal } from '../../design-system';
import { ConflictNotice } from './conflict-notice';

export interface ReportDialogProps {
  open: boolean;
  targetType: 'BOTTLE' | 'SEGMENT' | 'MESSAGE';
  targetId: string;
  onClose: () => void;
}

const TARGET_LABEL: Record<ReportDialogProps['targetType'], string> = {
  BOTTLE: '这支漂流瓶',
  SEGMENT: '这一段唱',
  MESSAGE: '这条留言',
};

export function ReportDialog({ open, targetType, targetId, onClose }: ReportDialogProps) {
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const report = useCreateReport();
  const ready = reason.trim().length > 0;

  return (
    <Modal
      open={open}
      title={`举报${TARGET_LABEL[targetType]}`}
      onClose={() => {
        setReason('');
        setSubmitted(false);
        report.reset();
        onClose();
      }}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              setReason('');
              setSubmitted(false);
              report.reset();
              onClose();
            }}
          >
            取消
          </Button>
          <Button
            variant="primary"
            disabled={!ready}
            loading={report.isPending}
            onClick={() => {
              void report
                .mutateAsync({ targetType, targetId, reason: reason.trim() })
                .then(() => {
                  setSubmitted(true);
                })
                .catch(() => undefined);
            }}
          >
            提交举报
          </Button>
        </>
      }
    >
      <p className="text-[0.9375rem] leading-[1.6] text-muted">
        举报会进入人工审核队列，由管理员判断，不是自动删除。
        请写清问题，理由越具体越好（例如"这段和曲目无关"）。
      </p>

      <Input
        label="举报理由"
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
        }}
        hint="最多 500 字；这条理由会原样给管理员看。"
      />

      {submitted ? (
        <p role="status" className="text-[0.9375rem] font-medium text-success">
          已提交，进入人工审核队列。处理结果不会公开，但被处置的内容会从公海消失。
        </p>
      ) : null}

      {report.isError && !submitted ? <ConflictNotice error={report.error} /> : null}
    </Modal>
  );
}
