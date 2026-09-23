/**
 * 上传入库前的校验单测（服务端**不信任客户端**）。
 *
 * 这一层是 t9 的 `POST /api/bottles/:id/segments` 落地时唯一的音频守门人：
 * 声明 MIME、体积、真实容器、声明时长四道关，全部走 `packages/shared/src/audio`
 * 的同一套规则与文案（前端提前拦过一遍，这里是第二遍）。
 */
import { describe, expect, it } from 'vitest';
import { MAX_AUDIO_BYTES, SEGMENT_PRESET_TOLERANCE_MS } from '@music-drift/shared/audio';
import { validateSegmentAudioUpload } from './ingest';

const WEBM_HEAD = [0x1a, 0x45, 0xdf, 0xa3];
const MP4_HEAD = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70];

function payload(head: number[], size = 120 * 1024): Uint8Array {
  const buffer = new Uint8Array(size);
  buffer.set(head, 0);
  return buffer;
}

const WEBM = payload(WEBM_HEAD);
const DURATION_OK = 20_000;
/** 夹具默认预设（= 该段曲库预设时长）：t31 起时长判定必须对着它做。 */
const PRESET_MS = DURATION_OK;

describe('validateSegmentAudioUpload：通过', () => {
  it('webm/opus + 20 秒 → 通过，并给出归一化后的 MIME（落库用规范值，不带 codecs 参数）', () => {
    const result = validateSegmentAudioUpload(
      {
        mime: 'audio/webm;codecs=opus',
        bytes: WEBM,
        durationMs: DURATION_OK,
      },
      { presetDurationMs: PRESET_MS },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mime).toBe('audio/webm');
    expect(result.value.container).toBe('webm');
    expect(result.value.durationMs).toBe(DURATION_OK);
    expect(result.value.byteSize).toBe(WEBM.byteLength);
    expect(result.value.durationVerified).toBe(true);
  });

  it('Safari 的 mp4/AAC 路径同样通过（D-10：Chromium + WebKit 双必须）', () => {
    const result = validateSegmentAudioUpload(
      {
        mime: 'audio/mp4',
        bytes: payload(MP4_HEAD, 300 * 1024),
        durationMs: 25_000,
      },
      { presetDurationMs: 25_000 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.container).toBe('mp4');
  });
});

describe('validateSegmentAudioUpload：拒绝（422 规则违反）', () => {
  /** 默认按夹具预设（`PRESET_MS`）判定；需要自定义预设时显式传第二参。 */
  const codesOf = (
    input: Parameters<typeof validateSegmentAudioUpload>[0],
    options: Parameters<typeof validateSegmentAudioUpload>[1] = { presetDurationMs: PRESET_MS },
  ): string[] => {
    const result = validateSegmentAudioUpload(input, options);
    return result.ok ? [] : result.violations.map((violation) => violation.code);
  };

  /**
   * t31：旧规则（固定 15–30s 区间）已被用户需求取代 —— 「每段时长由曲库预设决定」。
   * 因此这里按**新规则**重写，四种边界全覆盖（下界−1 / 下界 / 上界 / 上界+1）。
   * 预设取 `Immersed` 第 3 段的真实曲库值（22501ms），容差来自共享常量，不写死数字。
   */
  it('时长必须匹配该段**曲库预设** ±容差：预设−容差−1 拒 / 预设−容差 过 / 预设+容差 过 / 预设+容差+1 拒', () => {
    const presetDurationMs = 22_501;
    const options = { presetDurationMs };
    const base = { mime: 'audio/webm', bytes: WEBM };
    const tolerance = SEGMENT_PRESET_TOLERANCE_MS;

    expect(codesOf({ ...base, durationMs: presetDurationMs - tolerance - 1 }, options)).toEqual([
      'AUDIO_DURATION_OUT_OF_RANGE',
    ]);
    expect(codesOf({ ...base, durationMs: presetDurationMs - tolerance }, options)).toEqual([]);
    expect(codesOf({ ...base, durationMs: presetDurationMs + tolerance }, options)).toEqual([]);
    expect(codesOf({ ...base, durationMs: presetDurationMs + tolerance + 1 }, options)).toEqual([
      'AUDIO_DURATION_OUT_OF_RANGE',
    ]);
  });

  it('预设本身不可用（NaN / 0 / 负数）→ AUDIO_SEGMENT_PRESET_MISSING（无预设即拒绝，不回退）', () => {
    const base = { mime: 'audio/webm', bytes: WEBM };
    for (const presetDurationMs of [Number.NaN, 0, -1]) {
      expect(
        codesOf({ ...base, durationMs: DURATION_OK }, { presetDurationMs }),
        String(presetDurationMs),
      ).toEqual(['AUDIO_SEGMENT_PRESET_MISSING']);
    }
  });

  it('缺失时长仍拒：由「必须匹配预设」这一条接手（`requireDuration` 开关已删）', () => {
    const base = { mime: 'audio/webm', bytes: WEBM };

    // 旧 `requireDuration: false` 能放行"未核实时长"的记录 —— 该放行口与预设权威不兼容，已删除。
    // 现在不报时长 ⇒ NaN ⇒ 同一条规则判拒（文案："没有收到可用的录音时长…"）。
    expect(codesOf({ ...base, durationMs: null })).toEqual(['AUDIO_DURATION_OUT_OF_RANGE']);
  });

  it('空音频 → AUDIO_MISSING', () => {
    expect(
      codesOf({ mime: 'audio/webm', bytes: new Uint8Array(0), durationMs: DURATION_OK }),
    ).toEqual(['AUDIO_MISSING']);
  });

  it('体积超限 → AUDIO_TOO_LARGE', () => {
    expect(
      codesOf({
        mime: 'audio/webm',
        bytes: payload(WEBM_HEAD, MAX_AUDIO_BYTES + 1),
        durationMs: DURATION_OK,
      }),
    ).toEqual(['AUDIO_TOO_LARGE']);
  });

  it('非白名单 MIME（例如整首歌的 audio/mpeg）→ AUDIO_FORMAT_UNSUPPORTED', () => {
    expect(codesOf({ mime: 'audio/mpeg', bytes: WEBM, durationMs: DURATION_OK })).toEqual([
      'AUDIO_FORMAT_UNSUPPORTED',
    ]);
    expect(codesOf({ mime: null, bytes: WEBM, durationMs: DURATION_OK })).toEqual([
      'AUDIO_FORMAT_UNSUPPORTED',
    ]);
  });

  it('声明与内容不符（声称 webm、实际 mp4）→ AUDIO_CONTAINER_MISMATCH', () => {
    expect(
      codesOf({ mime: 'audio/webm', bytes: payload(MP4_HEAD), durationMs: DURATION_OK }),
    ).toEqual(['AUDIO_CONTAINER_MISMATCH']);
  });

  it('内容无法识别（既不是 webm 也不是 mp4…）→ AUDIO_CONTAINER_MISMATCH', () => {
    expect(
      codesOf({
        mime: 'audio/webm',
        bytes: payload([0xff, 0xfb, 0x90, 0x00]),
        durationMs: DURATION_OK,
      }),
    ).toEqual(['AUDIO_CONTAINER_MISMATCH']);
  });

  it('一次报全：空 + 格式不对 + 时长不对 → 三条一起给', () => {
    expect(codesOf({ mime: 'video/mp4', bytes: new Uint8Array(0), durationMs: 9_000 })).toEqual([
      'AUDIO_MISSING',
      'AUDIO_FORMAT_UNSUPPORTED',
      'AUDIO_DURATION_OUT_OF_RANGE',
    ]);
  });

  it('拒绝时的文案是中文、点明**该段预设多长/你录了多长**并给出修正动作（码给程序、文案给人）', () => {
    const result = validateSegmentAudioUpload(
      { mime: 'audio/webm', bytes: WEBM, durationMs: 15_000 },
      { presetDurationMs: 22_501 },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations[0]?.code).toBe('AUDIO_DURATION_OUT_OF_RANGE');
    expect(result.violations[0]?.message).toContain('22.5'); // 该段固定时长
    expect(result.violations[0]?.message).toContain('15.0'); // 你录的
    expect(result.violations[0]?.message).toContain('重新录制');
  });
});
