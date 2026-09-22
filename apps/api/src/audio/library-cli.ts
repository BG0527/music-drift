/**
 * 曲库入库 CLI（t13）。
 *
 * ```bash
 * # 只校验 library.json（不需要数据库）——CI / 评审可跑
 * pnpm --filter @music-drift/api exec tsx src/audio/library-cli.ts --check
 *
 * # 真正入库（需要 DATABASE_URL + 已跑迁移）
 * pnpm db:up && pnpm --filter @music-drift/api exec tsx src/audio/library-cli.ts
 *
 * # 用户已听感确认（允许"起音不显著"的边界入库）
 * pnpm --filter @music-drift/api exec tsx src/audio/library-cli.ts --allow-unreviewed
 * ```
 *
 * 为什么单独做 CLI 而不是塞进 `db/seed.ts`：曲库元数据来自分析产物 `library.json`，
 * 与"占位种子"是两件事；seed 只负责占位数据，真曲目由本脚本按同一套 id 方案覆盖写。
 */
import { readFileSync } from 'node:fs';

const out = (line: string): void => {
  process.stdout.write(`${line}
`);
};
const fail = (line: string): void => {
  process.stderr.write(`${line}
`);
};
import {
  LIBRARY_METADATA_URL,
  LibraryMetadataSchema,
  describeLibraryTrack,
  maxSafeEqualLoudnessLufs,
  segmentsNeedingManualReview,
  validateSegmentTable,
} from '@music-drift/shared/audio';
import { createDb } from '../db/client.js';
import { ingestLibrary } from './library-ingest.js';

/** 仓库根（本文件位于 apps/api/src/audio/）。 */
const REPO_ROOT = new URL('../../../../', import.meta.url);
const METADATA_PATH = new URL(`apps/web/public${LIBRARY_METADATA_URL}`, REPO_ROOT);

/** 速度判定证据（脚本产物字段；不在 shared 的 zod 契约里，故从原始 JSON 读取）。 */
interface TempoDecisionEvidence {
  preConventionBpm: number;
  preConventionSn: number;
  bpm: number;
  conventionApplied: boolean;
  conventionSnRatio: number;
  interleavedRatio: number;
  coarserRatio: number;
  ambiguous: boolean;
}

function loadMetadata(): {
  parsed: ReturnType<typeof LibraryMetadataSchema.parse>;
  evidenceByFile: Map<string, TempoDecisionEvidence>;
} {
  const raw: unknown = JSON.parse(readFileSync(METADATA_PATH, 'utf8'));
  const parsed = LibraryMetadataSchema.parse(raw);
  const evidenceByFile = new Map<string, TempoDecisionEvidence>();
  const tracks = (raw as { tracks?: unknown }).tracks;
  if (Array.isArray(tracks)) {
    for (const entry of tracks) {
      const candidate = entry as { file?: unknown; tempoDecision?: unknown };
      if (typeof candidate.file === 'string' && candidate.tempoDecision !== null && typeof candidate.tempoDecision === 'object') {
        evidenceByFile.set(candidate.file, candidate.tempoDecision as TempoDecisionEvidence);
      }
    }
  }
  return { parsed, evidenceByFile };
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const checkOnly = argv.includes('--check');
  const allowUnreviewed = argv.includes('--allow-unreviewed');

  const { parsed: metadata, evidenceByFile } = loadMetadata();
  out(`读取 ${METADATA_PATH.pathname.replace(/^\//, '')}（${String(metadata.tracks.length)} 首）`);

  // 校验 + 证据摘要（无论是否 --check 都打印：评审要看的就是这些数字）
  for (const track of metadata.tracks) {
    const violations = validateSegmentTable(track.segments);
    const review = segmentsNeedingManualReview(track);
    const decision = evidenceByFile.get(track.file);
    out(
      `  · ${describeLibraryTrack(track)}  官方 ${String(track.officialBpm)} BPM / 实测 ${String(track.measuredBpm)}` +
        `（偏差 ${track.bpmDeviationPercent >= 0 ? '+' : ''}${track.bpmDeviationPercent.toFixed(2)}%）` +
        ` · 拍号置信 ${track.meterConfidence} · 响度 ${track.loudnessLufs.toFixed(2)} LUFS → 增益 ${track.normalization.gainDb >= 0 ? '+' : ''}${track.normalization.gainDb.toFixed(2)} dB`,
    );
    // 偏差若由八度约定决定，必须显式说明，避免被读成"独立验证通过"
    if (decision !== undefined) {
      out(
        `      BPM 依据：argmax ${decision.preConventionBpm.toFixed(2)}（Sn ${decision.preConventionSn.toFixed(4)}）` +
          ` → 选定 ${decision.bpm.toFixed(2)} · 八度约定${decision.conventionApplied ? '已触发' : '未触发'}` +
          `（Sn 代价比 ${decision.conventionSnRatio.toFixed(3)}）· r_finer ${decision.interleavedRatio.toFixed(3)}` +
          ` / r_coarser ${decision.coarserRatio.toFixed(3)} · 僵持 ${decision.ambiguous ? '是' : '否'}`,
      );
    }
    out(
      `      段长 ${track.segments.map((segment) => (segment.durationMs / 1000).toFixed(1)).join(' / ')} s` +
        ` · 伴奏 ${track.accompanimentRef}` +
        (review.length === 0
          ? ' · 起音证据齐全'
          : ` · ⚠ 待人工复核：第 ${review.join('、')} 段边界`),
    );
    if (violations.length > 0) {
      fail(`      ✗ 分段表不合法：${violations.map((v) => v.code).join(', ')}`);
      return 1;
    }
  }

  const target = maxSafeEqualLoudnessLufs(metadata.tracks);
  out(`等响目标（不削波）= ${target.toFixed(2)} LUFS`);

  if (checkOnly) {
    out('--check：仅校验，未写库。');
    return 0;
  }

  const databaseUrl = process.env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl === '') {
    fail('DATABASE_URL 未设置：先 `pnpm db:up` 并把 .env 里的 DATABASE_URL 指向本地库。');
    return 1;
  }

  const db = await createDb(databaseUrl);
  try {
    const report = await ingestLibrary(db, metadata, { allowUnreviewed });
    out(
      `入库完成：${String(report.songs)} 首 / ${String(report.segments)} 段 · licensed_source=${report.licensedSource}`,
    );
    if (report.needsManualReview.length > 0) {
      out(
        `⚠ 本条入库包含"起音不显著"的边界（已用 --allow-unreviewed 放行）：` +
          report.needsManualReview
            .map((entry) => `${entry.title} 第 ${entry.indexes.join('、')} 段`)
            .join('；'),
      );
    }
    return 0;
  } finally {
    await db.close();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
