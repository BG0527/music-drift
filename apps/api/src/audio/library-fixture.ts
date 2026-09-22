/**
 * 测试夹具：把"部分曲目描述"补成合法的 `LibraryMetadata`（**非产品代码**）。
 *
 * 为什么需要它：`LibraryMetadata` 字段多（含分析证据与响度归一），
 * 单测只关心 2–3 个字段时不该手抄 20 行；补齐逻辑集中在这里，字段演进只改一处。
 */
import type { LibraryMetadata, LibrarySegment, LibraryTrack } from '@music-drift/shared/audio';

export interface TrackFixture {
  title: string;
  songId: string;
  ordinal: number;
  accompanimentRef: string;
  segments: LibrarySegment[];
  durationS?: number;
  officialBpm?: number;
  measuredBpm?: number;
  meter?: number;
  loudnessLufs?: number;
  samplePeakDbfs?: number;
  gainDb?: number;
}

export function embedLibraryFixture(tracks: TrackFixture[]): LibraryMetadata {
  const full: LibraryTrack[] = tracks.map((track) => {
    const totalMs = track.segments.reduce((sum, segment) => sum + segment.durationMs, 0);
    const loudnessLufs = track.loudnessLufs ?? -24;
    const samplePeakDbfs = track.samplePeakDbfs ?? -3;
    const gainDb = track.gainDb ?? Math.min(-16 - loudnessLufs, -1 - samplePeakDbfs);
    return {
      file: `${track.title}.mp3`,
      title: track.title,
      songId: track.songId,
      ordinal: track.ordinal,
      accompanimentRef: track.accompanimentRef,
      durationS: track.durationS ?? totalMs / 1000,
      officialBpm: track.officialBpm ?? 80,
      measuredBpm: track.measuredBpm ?? 80,
      bpmDeviationPercent: 0,
      meter: track.meter ?? 4,
      meterConfidence: 'HIGH',
      loudnessLufs,
      samplePeakDbfs,
      segments: track.segments,
      // 默认夹具 = "已复核"（全部内部边界起音显著）。
      // 要测"未复核闸门"的用例请自行覆盖 segmentEvidence（见 library-ingest.test.ts）。
      segmentEvidence: {
        windowS: 1.5,
        significanceGate: 0.02,
        segmentLengthsS: track.segments.map((segment) => segment.durationMs / 1000),
        totalS: totalMs / 1000,
        boundaries: [
          {
            targetS: 0,
            snappedS: 0,
            onsetStrength: null,
            percentile: null,
            significant: true,
            note: '曲目起点',
          },
          ...track.segments.slice(1).map((segment) => ({
            targetS: segment.startMs / 1000,
            snappedS: segment.startMs / 1000,
            onsetStrength: 1.5,
            windowMedian: 0,
            windowP90: 0.2,
            percentile: 99,
            significant: true,
            note: '夹具：已复核',
          })),
          {
            targetS: totalMs / 1000,
            snappedS: totalMs / 1000,
            onsetStrength: null,
            percentile: null,
            significant: true,
            note: '曲目终点',
          },
        ],
      },
      normalization: {
        targetLufs: loudnessLufs + gainDb,
        nominalTargetLufs: -16,
        maxSafeTargetLufs: loudnessLufs + gainDb,
        policy: '标称目标会使峰值越界 → 取等响上限',
        gainDb,
        gainLimitedByPeak: true,
        resultingPeakDbfs: samplePeakDbfs + gainDb,
        resultingLufs: loudnessLufs + gainDb,
      },
    };
  });

  return {
    generatedBy: 'test-fixture',
    targetLufs: -16,
    tracks: full,
  };
}
