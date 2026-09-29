/**
 * `MixExportPanel`：阶段一成品导出的界面（导出 → 试听 → 下载 → 对齐报告）。
 *
 * ## 状态清单（DESIGN.md 要求自建，Figma 没有状态帧不等于可以不做）
 *
 * | 状态 | 语义 | 说明 |
 * | --- | --- | --- |
 * | 完整 | info | 「4 段完整（纯人声）」 |
 * | 有缺口 | **warning** | 文字说明「缺第 N 段 · 这段时间是静音，不会被别人的段顶替」+ 下载文件名带标注 |
 * | 无有效段 | 中性空态 | 「还没有人接唱」，导出按钮禁用（不让用户点了才知道） |
 * | 导出中 | info + 进度 | 「正在解码第 2/4 段」；按钮 loading（禁 spinner，宽度不跳变） |
 * | 失败 | **danger** | 具体到"哪一段 / 哪一步"（取音频 vs 解码），并保留重试 |
 * | 成功 | success | `<audio controls>` 试听 + `<a download>` 下载 + 对齐报告（实测数字 + 达标判定） |
 *
 * 阶段一口径：**纯人声、无伴奏**（用户 2026-09-23 裁决）。界面必须明说这一点，
 * 免得评审以为"少了伴奏"是实现遗漏。
 */
import {
  describeMissingSegments,
  mixSummaryLabel,
  type AlignmentReport,
  type MixPlan,
} from '@music-drift/shared/audio';
import type { SongLyricLine } from '@music-drift/shared';
import { useState } from 'react';
import { Button, Icon, cn } from '../../design-system';
import { KaraokeLyrics } from './karaoke-lyrics';
import { useMixExport, type MixExportEnvironment, type MixExportPhase } from './use-mix-export';
import { formatSeconds } from './format';

export interface MixExportPanelProps {
  plan: MixPlan;
  /** 覆盖任意端口（测试用）。 */
  environment?: Partial<MixExportEnvironment>;
  fileName?: string;
  title?: string;
  /** 全曲绝对时间轴；由成品 audio.currentTime 驱动，不启动额外计时器。 */
  lyrics?: readonly SongLyricLine[];
  className?: string;
}

const PHASE_LABEL: Record<MixExportPhase, string> = {
  idle: '',
  preparing: '正在准备…',
  decoding: '正在解码分段音频…',
  mixing: '正在把人声拼成完整作品…',
  encoding: '正在生成可下载文件…',
  done: '成品已就绪',
  failed: '导出失败',
};

export function MixExportPanel({
  plan,
  environment,
  fileName,
  title,
  lyrics,
  className,
}: MixExportPanelProps) {
  const view = useMixExport({
    plan,
    ...(environment === undefined ? {} : { environment }),
    ...(fileName === undefined ? {} : { fileName }),
  });
  const missing = describeMissingSegments(plan.missingSegmentIndexes);
  const accompanied = plan.hasAccompaniment && plan.accompanimentUrl != null;
  const panelTitle = title ?? (accompanied ? '完整试听' : '成品（阶段一 · 纯人声）');
  const busy =
    view.phase === 'preparing' ||
    view.phase === 'decoding' ||
    view.phase === 'mixing' ||
    view.phase === 'encoding';
  const [lyricClock, setLyricClock] = useState<{ objectUrl: string | null; currentTime: number }>({
    objectUrl: null,
    currentTime: 0,
  });
  const lyricCurrentTime =
    lyricClock.objectUrl === view.objectUrl ? lyricClock.currentTime : 0;

  return (
    <div
      className={cn(
        // record-v1：成品试听是**沉浸式区块**（L4 deep，DESIGN.md §Elevation & Depth）→ 水体底色，
        // 不是通用卡片：这一段画面就是"沉进水里听成品"
        'flex flex-col gap-4 rounded-xl border border-water-surface/50 bg-water-body p-4 text-paper',
        className,
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-[1.125rem] font-semibold text-paper">{panelTitle}</h3>
        <p className="text-[0.875rem] text-muted">{mixSummaryLabel(plan)}</p>
      </header>

      <p className="text-[0.875rem] leading-[1.6] text-muted">
        {accompanied
          ? '原伴奏贯穿四段，可见的人声按固定时间槽叠加；缺口仍保留伴奏。'
          : '阶段一只拼接人声、不加伴奏（曲库到位后再按固定时间轴叠加）；成品为 WAV，可直接试听与下载。'}
      </p>

      {!view.canExport ? (
        <p role="status" className="text-[0.875rem] leading-[1.6] text-muted">
          还没有人接唱，暂时没有可导出的成品。等第 1 段录好之后就能生成。
        </p>
      ) : null}

      {missing === null ? null : (
        <p
          role="status"
          className="flex items-start gap-2 rounded-base border border-warning-border bg-warning-tint px-4 py-3 text-[0.875rem] leading-[1.6] text-warning"
        >
          <Icon name="AlertTriangle" size={16} />
          <span>
            {accompanied
              ? `第 ${plan.missingSegmentIndexes.join('、')} 段未录 · 缺口仍保留伴奏。`
              : `${missing ?? ''} · 这段时间在成品里留成静音，不会被别人的段顶替（段号是歌里的固定位置，永不压缩）。`}
          </span>
        </p>
      )}

      {view.warnings.length > 0 ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-base border border-warning-border bg-warning-tint px-4 py-3 text-[0.875rem] leading-[1.6] text-warning"
        >
          <Icon name="Info" size={16} />
          <span>{view.warnings.join(' ')}</span>
        </p>
      ) : null}

      {busy ? (
        <p role="status" aria-live="polite" className="text-[0.875rem] text-muted">
          {PHASE_LABEL[view.phase]}
          {view.progress.total > 0
            ? ` （${String(view.progress.done)}/${String(view.progress.total)} 段）`
            : ''}
        </p>
      ) : null}

      {view.error === null ? null : (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-base border border-danger-border bg-danger-tint px-4 py-3 text-[0.875rem] leading-[1.6] text-danger"
        >
          <Icon name="AlertCircle" size={18} />
          <span>{view.error}</span>
        </p>
      )}

      {view.objectUrl === null ? null : (
        <div className="flex flex-col gap-3">
          {lyrics === undefined || lyrics.length === 0 ? null : (
            <KaraokeLyrics currentTime={lyricCurrentTime} lines={lyrics} />
          )}
          <audio
            controls
            preload="metadata"
            src={view.objectUrl}
            aria-label="成品试听"
            className="w-full rounded-base"
            onTimeUpdate={(event) => {
              setLyricClock({
                objectUrl: view.objectUrl,
                currentTime: event.currentTarget.currentTime,
              });
            }}
          />
          <a
            href={view.objectUrl}
            download={view.fileName}
            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-base border-[1.5px] border-line/30 px-6 text-[0.9375rem] font-semibold text-coral transition-transform duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)] hover:scale-[var(--motion-hover-scale)] focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          >
            <Icon name="UploadCloud" size={18} />
            下载成品（WAV · {view.fileName}）
          </a>
        </div>
      )}

      {view.alignment === null ? null : <AlignmentBlock alignment={view.alignment} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!view.canExport}
          loading={busy}
          onClick={() => {
            void view.start();
          }}
          icon={<Icon name="AudioWaveform" size={18} />}
        >
          {view.objectUrl === null ? '导出成品' : '重新导出'}
        </Button>
        {view.objectUrl === null ? null : (
          <Button
            variant="ghost"
            onClick={() => {
              setLyricClock({ objectUrl: null, currentTime: 0 });
              view.reset();
            }}
          >
            清空成品
          </Button>
        )}
      </div>
    </div>
  );
}

/** 对齐报告：**实测数字** + 阈值判定（D-05 客观验收：≤120ms）。 */
function AlignmentBlock({ alignment }: { alignment: AlignmentReport }) {
  return (
    <div
      data-testid="alignment-report"
      className={cn(
        'flex flex-col gap-1 rounded-base border px-4 py-3 text-[0.875rem] leading-[1.6]',
        alignment.withinTolerance
          ? 'border-success-border bg-success-tint text-success'
          : 'border-warning-border bg-warning-tint text-warning',
      )}
    >
      <span className="flex items-center gap-2 font-semibold">
        <Icon name={alignment.withinTolerance ? 'CheckCircle2' : 'AlertTriangle'} size={16} />
        段落起拍对齐：{alignment.withinTolerance ? '达标' : '未达标'}
      </span>
      <span>
        最大误差 {formatSeconds(alignment.maxAbsErrorMs)}ms · 平均{' '}
        {formatSeconds(alignment.meanAbsErrorMs)}ms · 阈值 {String(alignment.toleranceMs)}ms ·
        可测段 {String(alignment.measurements.length)} 段
      </span>
      {alignment.violations.length === 0 ? null : (
        <span>
          有问题的段：
          {alignment.violations
            .map((violation) =>
              Number.isFinite(violation.errorMs)
                ? `第 ${String(violation.index)} 段 ${violation.errorMs > 0 ? '+' : ''}${formatSeconds(violation.errorMs)}ms`
                : `第 ${String(violation.index)} 段 起拍未找到（音频可能整段是静音）`,
            )
            .join('，')}
        </span>
      )}
    </div>
  );
}
